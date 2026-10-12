import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest,createServer} from 'node:http';
import {createAccountPortal,portalHtml} from '../client/account-portal.mjs';
function request(url,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{const r=httpRequest(url,{method,headers},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text,json:()=>JSON.parse(text)}));});r.on('error',reject);r.end(body===undefined?undefined:JSON.stringify(body));});}
test('local account portal keeps tokens off the page and requires exact origin plus CSRF before remote writes',async()=>{
 const calls=[],p=createAccountPortal({mode:'admin',request:async(path,body)=>{calls.push({path,body});return{invitations:[]};}});p.setPhase('admin_ready');
 const server=createServer(async(req,res)=>{if(!await p.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,headers={host:'127.0.0.1:53682'};
 try{
  const page=await request(base+'/complete',{headers});assert.equal(page.status,200);const nonce=page.text.match(/const csrf="([A-Za-z0-9_-]+)"/)[1];new Function(page.text.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1]);assert(!page.text.includes('access_token'));assert.match(page.headers['content-security-policy'],/frame-ancestors 'none'/);
  for(const override of[{host:'evil.invalid'},{origin:'https://evil.invalid'},{'x-portal-csrf':'wrong'}])assert.equal((await request(base+'/portal/invites',{method:'POST',headers:{...headers,origin:'http://127.0.0.1:53682','content-type':'application/json','x-portal-csrf':nonce,...override},body:{count:1}})).status,403);
  assert.equal(calls.length,0);assert.equal((await request(base+'/portal/invites',{method:'POST',headers:{...headers,origin:'http://127.0.0.1:53682','content-type':'application/json','x-portal-csrf':nonce},body:{count:1}})).status,200);assert.equal(calls.length,1);
  assert.match(portalHtml(nonce,'mcp'),/邀请码/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
