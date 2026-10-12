import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport, StreamableHTTPError} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {UnauthorizedError} from '@modelcontextprotocol/sdk/client/auth.js';
import {McpError, ErrorCode} from '@modelcontextprotocol/sdk/types.js';
import {createAccountPortal} from './account-portal.mjs';

export const endpoint = 'https://d34vctdvg0hn6s.cloudfront.net/mcp';
// Existing Auth0 API identifier, never a fetch destination. Keeping it preserves
// existing account bindings and refresh-token grants.
export const tokenAudience = 'https://douyin-mcp.qizhaoyu.com/mcp';
export const issuer = 'https://dev-0e58ghlgnx8c41gi.us.auth0.com/';
export const clientId = 'ot3UbN6eon6kHwC6e4CKGxxGm10oiEM6';
export const callback = 'http://127.0.0.1:53682/callback';
const scope = 'openid profile email offline_access kol:read extract:create';

export function resumableClient(initial, reconnect) {
  let current=initial, queue=Promise.resolve(), closed=false;
  const reads=new Set(['search_kols','get_kol','read_evidence','visual_top5','get_credits','extraction_status','extraction_result','cancel_extraction']);
  const transient=e=>{
    if(e instanceof StreamableHTTPError||e?.constructor?.name==='StreamableHTTPError')
      return [404,408,-1].includes(e.code)||(e.code>=500&&e.code<=599)||
        (e.code===409&&/"error"\s*:\s*"session_busy"/.test(e.message));
    if(e instanceof McpError||e?.constructor?.name==='McpError')
      return [ErrorCode.ConnectionClosed,ErrorCode.RequestTimeout,ErrorCode.InternalError].includes(e.code);
    return e?.message==='Not connected'||e?.name==='TimeoutError'||
      (e instanceof TypeError&&/^(fetch failed|Failed to fetch|Load failed)$/.test(e.message))||
      ['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','EAI_AGAIN','ENOTFOUND','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(e?.cause?.code??e?.code);
  };
  const invoke=async(method,args)=>{
    if(closed)throw new Error('client_closed');
    const signal=args[method==='callTool'?2:1]?.signal;
    signal?.throwIfAborted();
    try{return await current[method](...args);}catch(e){
      const request=args[0];
      const safe=method==='listTools'||reads.has(request?.name)||
        (request?.name==='create_extraction'&&/^[a-zA-Z0-9_-]{8,128}$/.test(request.arguments?.idempotency_key??''));
      if(!transient(e)||!safe||closed||signal?.aborted)throw e;
      current=await reconnect();
      if(closed){await current.close().catch(()=>{});throw new Error('client_closed');}
      signal?.throwIfAborted();
      // Exactly one replay, with the original request and idempotency key.
      return current[method](...args);
    }
  };
  // One POST at a time avoids gateway session_busy responses and concurrent
  // refresh-token rotation. A rejected request must not poison later calls.
  const enqueue=(method,args)=>{const result=queue.then(()=>invoke(method,args));queue=result.catch(()=>{});return result;};
  return {getInstructions:()=>current.getInstructions(),listTools:(...args)=>enqueue('listTools',args),
    callTool:(...args)=>enqueue('callTool',args),close:async()=>{closed=true;await current.close().catch(()=>{});await queue;}};
}

export function callbackCode(url, state) {
  const u = new URL(url, callback);
  if (u.origin !== new URL(callback).origin || u.pathname !== '/callback' || u.hash) throw new Error('invalid_callback');
  for (const k of ['state', 'iss', 'code', 'error']) if (u.searchParams.getAll(k).length > 1) throw new Error('invalid_callback');
  if (u.searchParams.get('state') !== state || u.searchParams.get('iss') !== issuer) throw new Error('invalid_callback');
  if (u.searchParams.has('error')) throw new Error('authorization_denied');
  const code = u.searchParams.get('code');
  if (!code || code.length > 2048) throw new Error('invalid_callback');
  return code;
}

export async function pinnedFetch(input, init) {
  const u = new URL(input instanceof Request ? input.url : input);
  const resourceOrigin = new URL(endpoint).origin;
  if (u.protocol !== 'https:' || u.username || u.password ||
      ![resourceOrigin, new URL(issuer).origin].includes(u.origin)) throw new Error('untrusted_endpoint');
  const signal = AbortSignal.any([AbortSignal.timeout(30000), ...(init?.signal ? [init.signal] : [])]);
  return fetch(input, {...init, signal, redirect: 'error'});
}

function openLogin(url) {
  const args = process.platform === 'darwin' ? ['open', [url]] :
    process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
  const child = spawn(args[0], args[1], {stdio: 'ignore', shell: false});
  child.on('error', () => process.stderr.write('Could not open browser. Restart the client and sign in.\n'));
  child.unref();
}

export async function connectRemote({onAuthorization = openLogin, onPhase = () => {},mode='mcp'} = {}) {
  if(!['mcp','admin'].includes(mode))throw new Error('invalid_mode');
  const metadataResponse = await pinnedFetch(new URL('.well-known/openid-configuration', issuer));
  if (!metadataResponse.ok) throw new Error('metadata_unavailable');
  const metadataText = await metadataResponse.text();
  if (Buffer.byteLength(metadataText) > 65536) throw new Error('metadata_invalid');
  const m = JSON.parse(metadataText);
  if (m.issuer !== issuer || m.authorization_response_iss_parameter_supported !== true ||
      !m.code_challenge_methods_supported?.includes('S256') || !m.token_endpoint_auth_methods_supported?.includes('none')) throw new Error('metadata_invalid');
  for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    const u = new URL(m[key]);
    if (u.origin !== new URL(issuer).origin || u.protocol !== 'https:' || u.username || u.password || u.hash) throw new Error('metadata_invalid');
  }
  let state = randomBytes(32).toString('base64url');
  let tokens, verifier, resolveCode, rejectCode, used = false,recheckingEmail=false;
  const accountRequest=async(path,body)=>{
    if(!tokens?.access_token)throw new Error('login_required');
    const r=await pinnedFetch(new URL(path,endpoint),{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+tokens.access_token,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const text=await r.text();if(Buffer.byteLength(text)>65536)throw new Error('response_too_large');
    let value;try{value=JSON.parse(text);}catch{throw new Error('gateway_unavailable');}
    if(!r.ok){const e=new Error(value.error??'account_request_failed');e.status=r.status;throw e;}return value;
  };
  const portal=createAccountPortal({mode,request:accountRequest});
  let codePromise;
  const resetCode=()=>{codePromise=new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject;});codePromise.catch(()=>{});};resetCode();
  // A denied callback may arrive before connect() returns UnauthorizedError.
  codePromise.catch(() => {});
  const provider = {
    redirectUrl: callback,
    clientMetadata: {client_name: 'Douyin Finder Qoder HTTPS', redirect_uris: [callback],
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope},
    state: () => state,
    clientInformation: () => ({client_id: clientId}),
    tokens: () => tokens,
    saveTokens: value => {if (value.token_type?.toLowerCase() !== 'bearer' || !value.access_token ||
      !Number.isFinite(value.expires_in) || value.expires_in <= 0 || value.expires_in > 900) throw new Error('invalid_tokens');
      tokens = {access_token: value.access_token, token_type: value.token_type, expires_in: value.expires_in,
        ...(value.refresh_token ? {refresh_token: value.refresh_token} : {}), ...(value.scope ? {scope: value.scope} : {})};},
    saveCodeVerifier: value => {verifier = value;},
    codeVerifier: () => {if (!verifier) throw new Error('missing_verifier'); return verifier;},
    validateResourceURL: async (serverUrl, resource) => {if (String(serverUrl) !== endpoint || resource !== endpoint) throw new Error('wrong_resource'); return new URL(endpoint);},
    invalidateCredentials: kind => {if (kind === 'all' || kind === 'tokens') tokens = undefined; if (kind === 'all' || kind === 'verifier') verifier = undefined;},
    redirectToAuthorization: async url => {
      if (url.origin !== new URL(issuer).origin || url.pathname !== '/authorize' ||
          url.searchParams.get('client_id') !== clientId || url.searchParams.get('redirect_uri') !== callback ||
          url.searchParams.get('state') !== state || url.searchParams.get('code_challenge_method') !== 'S256') throw new Error('untrusted_authorization');
      // Transport resource and Auth0 API audience are separately pinned constants.
      url.searchParams.set('audience', tokenAudience);
      url.searchParams.set('scope', scope);
      if(recheckingEmail)url.searchParams.set('prompt','login');
      onPhase('waiting_owner_login');
      await onAuthorization(url.toString());
    }
  };
  const server = createServer(async(req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.headers.host !== '127.0.0.1:53682' || (req.url?.length ?? 0) > 4096) {res.writeHead(400); res.end('Invalid callback.'); return;}
    if(await portal.handle(req,res))return;
    if (req.method !== 'GET') {res.writeHead(400); res.end('Invalid callback.'); return;}
    if (used) {res.writeHead(409); res.end('Callback already used.'); return;}
    try {
      const code = callbackCode(req.url, state); used = true;
      res.writeHead(303, {Location: portal.pagePath}); res.end(); resolveCode(code);
    } catch (e) {
      res.writeHead(400); res.end('Invalid or denied authorization.');
      if (e.message === 'authorization_denied') rejectCode(new Error('authorization_denied'));
    }
  });
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(53682, '127.0.0.1', resolve);});
  const loginTimer = setTimeout(() => rejectCode(new Error('login_timeout')), 10 * 60000);
  let client,retained=false,portalTimer,serverClosed=false;
  const closePortal=async()=>{clearTimeout(portalTimer);if(serverClosed)return;serverClosed=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  const transport = () => new StreamableHTTPClientTransport(new URL(endpoint), {authProvider: provider, fetch: pinnedFetch});
  try {
    client = new Client({name: 'douyin-qoder-https', version: '0.4.6'});
    let wire = transport();
    try {await client.connect(wire);} catch (e) {
      if (!(e instanceof UnauthorizedError)) throw e;
      let account;
      for(let attempt=0;attempt<5;attempt++){
        const code = await codePromise;
        onPhase('token_exchange'); await wire.finishAuth(code); verifier = undefined;
        account=await accountRequest('/onboarding/status');
        if(account.status!=='email_verification_required')break;
        portal.setPhase('email_verification_required');onPhase('waiting_email_verification');
        await Promise.race([portal.verified,new Promise((_,reject)=>setTimeout(()=>reject(new Error('verification_timeout')),10*60000).unref())]);
        tokens=undefined;verifier=undefined;used=false;recheckingEmail=true;state=randomBytes(32).toString('base64url');resetCode();
        await client.close().catch(()=>{});client=new Client({name:'douyin-qoder-https',version:'0.4.6'});wire=transport();
        try{await client.connect(wire);}catch(next){if(!(next instanceof UnauthorizedError))throw next;}
      }
      if(account?.status==='email_verification_required')throw new Error('email_verification_required');
      if(account.status==='invitation_required'){
        if(mode==='admin')throw new Error('admin_required');
        portal.setPhase('invitation_required');onPhase('waiting_invitation');
        await Promise.race([portal.activated,new Promise((_,reject)=>setTimeout(()=>reject(new Error('invitation_timeout')),10*60000).unref())]);
      }
      if(mode==='admin'){
        if(!account.is_admin)throw new Error('admin_required');
        portal.setPhase('admin_ready');onPhase('admin_ready');retained=true;
        portalTimer=setTimeout(()=>portal.fail('invalid_token'),Math.max(1,tokens.expires_in-10)*1000);
        return{closed:portal.closed,close:async()=>{tokens=undefined;verifier=undefined;await client?.close().catch(()=>{});await closePortal();}};
      }
      client = new Client({name: 'douyin-qoder-https', version: '0.4.6'});
      wire = transport(); await client.connect(wire);
    }
    onPhase('connected');portal.setPhase('ready');retained=true;
    // Keep the success page reachable briefly; it never contains a bearer token.
    portalTimer=setTimeout(()=>closePortal().catch(()=>{}),5000);portalTimer.unref();
    const resumed=resumableClient(client,async()=>{
      onPhase('reconnecting_session');await client.close().catch(()=>{});
      client=new Client({name:'douyin-qoder-https',version:'0.4.6'});
      wire=transport();try{await client.connect(wire);}catch(e){await client.close().catch(()=>{});throw e;}
      onPhase('connected');return client;
    });
    return {client:resumed, close: async () => {tokens = undefined; verifier = undefined; await resumed.close();await closePortal();}};
  } catch (e) {tokens = undefined; verifier = undefined; await client?.close().catch(() => {}); throw e;}
  finally {clearTimeout(loginTimer);if(!retained)await closePortal();}
}
