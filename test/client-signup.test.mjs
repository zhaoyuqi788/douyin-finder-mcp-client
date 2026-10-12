import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {connectRemote,callback,issuer,endpoint} from '../client/https-oauth.mjs';

function local(path,{body,csrf}={}){return new Promise((resolve,reject)=>{const r=httpRequest(new URL(path,callback),{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json',origin:new URL(callback).origin,'x-portal-csrf':csrf}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,text,location:res.headers.location}));});r.on('error',reject);r.end(body===undefined?undefined:JSON.stringify(body));});}
test('client performs signup email reauthentication and invitation activation before MCP, with fresh PKCE state and no tokens in HTML',async()=>{
 const original=globalThis.fetch;let exchanges=0,redemptions=0,session,landing;const states=[],phases=[],tasks=[];
 const metadata={issuer,authorization_endpoint:issuer+'authorize',token_endpoint:issuer+'oauth/token',jwks_uri:issuer+'.well-known/jwks.json',authorization_response_iss_parameter_supported:true,code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token']};
 const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
 globalThis.fetch=async(input,init={})=>{
  const url=String(input instanceof Request?input.url:input),path=new URL(url).pathname;
  if(url.startsWith(issuer)&&path.startsWith('/.well-known/'))return json(metadata);
  if(url===issuer+'oauth/token'){exchanges++;return json({access_token:'synthetic-token-'+exchanges,token_type:'Bearer',expires_in:900,scope:'kol:read extract:create'});}
  if(path==='/.well-known/oauth-protected-resource/mcp'||path==='/.well-known/oauth-protected-resource')return json({resource:endpoint,authorization_servers:[issuer],scopes_supported:['kol:read','extract:create']});
  if(path==='/onboarding/status')return json({status:exchanges===1?'email_verification_required':'invitation_required',is_admin:false});
  if(path==='/onboarding/redeem'){redemptions++;assert.equal(JSON.parse(init.body).invitation_code,'DI-'+'x'.repeat(43));return json({status:'active',created:true});}
  if(url===endpoint){
   if(!new Headers(init.headers).get('authorization'))return json({error:'invalid_token'},401,{'www-authenticate':`Bearer resource_metadata="${new URL(endpoint).origin}/.well-known/oauth-protected-resource/mcp"`});
   if(init.method==='GET')return new Response(null,{status:405});if(init.method==='DELETE')return new Response(null,{status:200});
   const body=JSON.parse(init.body);if(body.method==='initialize'){assert.equal(redemptions,1);return json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:body.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'synthetic',version:'1'}}},200,{'mcp-session-id':'test-session'});}
   if(body.id!==undefined)return json({jsonrpc:'2.0',id:body.id,result:{tools:[]}});return new Response(null,{status:202});
  }
  throw new Error('unexpected_mock_url');
 };
 const act=async(kind)=>{assert.equal((await local('/complete')).status,403);const page=await local(landing);assert(!page.text.includes('synthetic-token'));const csrf=page.text.match(/const csrf="([A-Za-z0-9_-]+)"/)[1];const r=await local(kind==='verified'?'/portal/verified':'/portal/redeem',{csrf,body:kind==='verified'?{}:{invitation_code:'DI-'+'x'.repeat(43)}});assert.equal(r.status,200);};
 try{
  session=await connectRemote({onAuthorization:async value=>{const u=new URL(value);states.push(u.searchParams.get('state'));assert.equal(u.searchParams.get('code_challenge_method'),'S256');const cb=new URL(callback);cb.searchParams.set('state',u.searchParams.get('state'));cb.searchParams.set('iss',issuer);cb.searchParams.set('code','synthetic-code-'+states.length);const result=await local(cb.pathname+cb.search);assert.equal(result.status,303);landing=result.location;},onPhase:p=>{phases.push(p);if(p==='waiting_email_verification')tasks.push(act('verified'));if(p==='waiting_invitation')tasks.push(act('redeem'));}});
  await Promise.all(tasks);assert.equal(states.length,2);assert.notEqual(states[0],states[1]);assert.equal(exchanges,2);assert.equal(redemptions,1);assert.equal(phases.at(-1),'connected');assert.deepEqual(await session.client.listTools(),{tools:[]});
 }finally{await session?.close();globalThis.fetch=original;}
});
