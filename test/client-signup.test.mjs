import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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
  session=await connectRemote({tokenFile:null,onAuthorization:async value=>{const u=new URL(value);states.push(u.searchParams.get('state'));assert.equal(u.searchParams.get('code_challenge_method'),'S256');const cb=new URL(callback);cb.searchParams.set('state',u.searchParams.get('state'));cb.searchParams.set('iss',issuer);cb.searchParams.set('code','synthetic-code-'+states.length);const result=await local(cb.pathname+cb.search);assert.equal(result.status,303);landing=result.location;},onPhase:p=>{phases.push(p);if(p==='waiting_email_verification')tasks.push(act('verified'));if(p==='waiting_invitation')tasks.push(act('redeem'));}});
  await Promise.all(tasks);assert.equal(states.length,2);assert.notEqual(states[0],states[1]);assert.equal(exchanges,2);assert.equal(redemptions,1);assert.equal(phases.at(-1),'connected');assert.deepEqual(await session.client.listTools(),{tools:[]});
 }finally{await session?.close();globalThis.fetch=original;}
});

// Run each stage in a separate process, just as an IDE restarts its connector.
async function persistedLoginProbe(){
 const assert=(await import('node:assert/strict')).default;
 const {request:httpRequest}=await import('node:http');
 const {connectRemote,callback,issuer,endpoint}=await import(process.env.DOUYIN_PROBE_MODULE);
 const scenario=process.env.DOUYIN_PROBE_SCENARIO;
 const counts={logins:0,refreshes:0,portals:0,redemptions:0};let landing,session;
 const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
 const metadata={issuer,authorization_endpoint:issuer+'authorize',token_endpoint:issuer+'oauth/token',jwks_uri:issuer+'.well-known/jwks.json',authorization_response_iss_parameter_supported:true,code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token']};
 const local=(path,body,csrf)=>new Promise((resolve,reject)=>{
  const r=httpRequest(new URL(path,callback),{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json',origin:new URL(callback).origin,'x-portal-csrf':csrf}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,text,location:res.headers.location}));});r.on('error',reject);r.end(body===undefined?undefined:JSON.stringify(body));
 });
 globalThis.fetch=async(input,init={})=>{
  const url=String(input instanceof Request?input.url:input),path=new URL(url).pathname;
  if(url.startsWith(issuer)&&path.startsWith('/.well-known/'))return json(metadata);
  if(path.startsWith('/.well-known/oauth-protected-resource'))return json({resource:endpoint,authorization_servers:[issuer]});
  if(url===issuer+'oauth/token'){
   const form=new URLSearchParams(init.body);
   if(form.get('grant_type')==='refresh_token'){
    counts.refreshes++;
    if(scenario==='revoked'){assert.equal(form.get('refresh_token'),'synthetic-refresh-2');return json({error:'invalid_grant'},400);}
    assert.equal(form.get('refresh_token'),'synthetic-refresh-1');
    return json({access_token:'synthetic-access-2',refresh_token:'synthetic-refresh-2',token_type:'Bearer',expires_in:900});
   }
   const suffix=scenario==='revoked'?'3':'1';
   return json({access_token:'synthetic-access-'+suffix,refresh_token:'synthetic-refresh-'+suffix,token_type:'Bearer',expires_in:900});
  }
  const access=new Headers(init.headers).get('authorization');
  if(path==='/onboarding/status'){
   if(scenario==='temporary_failure')return json({error:'gateway_unavailable'},503);
   if((scenario==='expired'&&access==='Bearer synthetic-access-1')||(scenario==='revoked'&&access==='Bearer synthetic-access-2'))return json({error:'invalid_token'},401);
   return json({status:scenario==='cached_pending'?'invitation_required':'active',is_admin:scenario==='admin'});
  }
  if(path==='/onboarding/redeem'){counts.redemptions++;return json({status:'active',created:true});}
  if(url===endpoint){
   assert(access?.startsWith('Bearer synthetic-access-'));
   if(init.method==='GET')return new Response(null,{status:405});if(init.method==='DELETE')return new Response(null,{status:200});
   const body=JSON.parse(init.body);
   if(body.method==='initialize')return json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:body.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'synthetic',version:'1'}}},200,{'mcp-session-id':'synthetic-session'});
   if(body.id!==undefined)return json({jsonrpc:'2.0',id:body.id,result:{tools:[]}});return new Response(null,{status:202});
  }
  throw Error('unexpected_mock_url');
 };
 try{
  session=await connectRemote({tokenFile:process.env.DOUYIN_PROBE_CACHE,mode:['admin','not_admin'].includes(scenario)?'admin':'mcp',
   onAuthorization:async value=>{
    counts.logins++;const u=new URL(value),cb=new URL(callback);
    cb.searchParams.set('state',u.searchParams.get('state'));cb.searchParams.set('iss',issuer);cb.searchParams.set('code','synthetic-code');
    const r=await local(cb.pathname+cb.search);assert.equal(r.status,303);landing=r.location;
   },onPortal:async value=>{
    counts.portals++;const u=new URL(value),page=await local(u.pathname+u.search);assert.equal(page.status,200);assert(!page.text.includes('synthetic-access'));
    if(scenario==='cached_pending'){
     const csrf=page.text.match(/const csrf="([A-Za-z0-9_-]+)"/)[1];
     assert.equal((await local('/portal/redeem',{invitation_code:'DI-'+'x'.repeat(43)},csrf)).status,200);
    }
   }});
  if(scenario==='admin')assert(session.closed instanceof Promise);
  else assert.deepEqual(await session.client.listTools(),{tools:[]});
  assert(!['temporary_failure','not_admin'].includes(scenario));
 }catch(error){
  if(scenario==='temporary_failure')assert.equal(error.message,'gateway_unavailable');
  else if(scenario==='not_admin')assert.equal(error.message,'admin_required');
  else throw error;
 }finally{await session?.close();}
 process.stdout.write(JSON.stringify(counts));
}
test('separate connector processes reuse disk tokens, silently refresh, recover revoked grants and preserve the cache on ordinary close or failure',async()=>{
 const root=await mkdtemp(join(tmpdir(),'douyin-login-')),file=join(root,'cache','tokens.json');
 const probe=scenario=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','--eval',`(${persistedLoginProbe.toString()})()`],{
   env:{...process.env,DOUYIN_PROBE_MODULE:new URL('../client/https-oauth.mjs',import.meta.url).href,DOUYIN_PROBE_CACHE:file,DOUYIN_PROBE_SCENARIO:scenario},stdio:['ignore','pipe','pipe']});
  let out='',errors='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>errors+=c);child.on('error',reject);
  child.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(Error(errors||`probe_exit_${code}`)));
 });
 try{
  const counts=(logins=0,refreshes=0,portals=0,redemptions=0)=>({logins,refreshes,portals,redemptions});
  assert.deepEqual(await probe('login'),counts(1));
  assert.equal(JSON.parse(await readFile(file,'utf8')).tokens.refresh_token,'synthetic-refresh-1');
  assert.deepEqual(await probe('cached'),counts());
  assert.deepEqual(await probe('expired'),counts(0,1));
  assert.equal(JSON.parse(await readFile(file,'utf8')).tokens.refresh_token,'synthetic-refresh-2');
  assert.deepEqual(await probe('revoked'),counts(1,1));
  assert.equal(JSON.parse(await readFile(file,'utf8')).tokens.refresh_token,'synthetic-refresh-3');
  const saved=await readFile(file,'utf8');
  assert.deepEqual(await probe('temporary_failure'),counts());assert.equal(await readFile(file,'utf8'),saved);
  assert.deepEqual(await probe('admin'),counts(0,0,1));assert.equal(await readFile(file,'utf8'),saved);
  assert.deepEqual(await probe('not_admin'),counts());assert.equal(await readFile(file,'utf8'),saved);
  assert.deepEqual(await probe('cached_pending'),counts(0,0,1,1));
 }finally{await rm(root,{recursive:true,force:true});}
});
