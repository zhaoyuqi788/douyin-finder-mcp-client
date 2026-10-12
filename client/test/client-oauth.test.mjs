import test from 'node:test';
import assert from 'node:assert/strict';
import {callbackCode, callback, issuer, endpoint, tokenAudience, pinnedFetch, resumableClient} from '../https-oauth.mjs';
import {StreamableHTTPError} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {McpError, ErrorCode} from '@modelcontextprotocol/sdk/types.js';
function valid() {const u = new URL(callback); u.searchParams.set('state', 'test-state'); u.searchParams.set('iss', issuer); u.searchParams.set('code', 'synthetic-code'); return u;}
test('OAuth callback requires exact issuer, state, host and a single code', () => {
  assert.equal(callbackCode(valid(), 'test-state'), 'synthetic-code');
  for (const mutate of [u => u.searchParams.delete('iss'), u => u.searchParams.set('iss', 'https://evil.example/'),
    u => u.searchParams.set('state', 'wrong'), u => u.searchParams.append('code', 'second'),
    u => u.searchParams.append('state', 'second'), u => u.host = 'evil.example', u => u.pathname = '/other']) {
    const u = valid(); mutate(u); assert.throws(() => callbackCode(u, 'test-state'));
  }
});
test('OAuth callback reports authorization denial without exposing code or description', () => {
  const u = valid(); u.searchParams.delete('code'); u.searchParams.set('error', 'access_denied');
  u.searchParams.set('error_description', 'private diagnostic');
  assert.throws(() => callbackCode(u, 'test-state'), {message: 'authorization_denied'});
});
test('HTTPS client rejects unapproved destinations before any network request', async () => {
  assert.match(new URL(endpoint).hostname,/\.cloudfront\.net$/);
  for (const url of [tokenAudience,'https://evil.example/token', 'http://douyin-mcp.qizhaoyu.com/mcp', 'https://user:password@douyin-mcp.qizhaoyu.com/mcp'])
    await assert.rejects(pinnedFetch(url), {message: 'untrusted_endpoint'});
});
test('expired MCP session reconnects once with the same extraction idempotency key',async()=>{
  const request={name:'create_extraction',arguments:{idempotency_key:'same-job-001',request:{brief:'synthetic'}}};
  let reconnects=0,forwarded;
  const remote=resumableClient({callTool:async()=>{throw new StreamableHTTPError(404,'session_expired');}},async()=>{reconnects++;return {callTool:async r=>{forwarded=r;return {job_id:'same-job'};},close:async()=>{}};});
  assert.deepEqual(await remote.callTool(request),{job_id:'same-job'});assert.equal(forwarded,request);assert.equal(reconnects,1);await remote.close();
});
test('simultaneous session failures share one reconnect and authentication denials are never replayed',async()=>{
  let reconnects=0;
  const remote=resumableClient({listTools:async()=>{throw new StreamableHTTPError(404,'session_expired');}},async()=>{reconnects++;await new Promise(r=>setImmediate(r));return {listTools:async()=>({tools:[]}),close:async()=>{}};});
  await Promise.all([remote.listTools(),remote.listTools()]);assert.equal(reconnects,1);await remote.close();
  for(const [code,request] of [[403,{name:'get_credits'}],[404,{name:'create_extraction',arguments:{}}]]){
    const denied=resumableClient({callTool:async()=>{throw new StreamableHTTPError(code,'denied');},close:async()=>{}},async()=>{throw new Error('must_not_reconnect');});
    await assert.rejects(denied.callTool(request),e=>e.code===code);await denied.close();
  }
});
test('safe calls recover once from gateway, network and closed-connection failures',async()=>{
  for(const failure of [new StreamableHTTPError(502,'gateway'),new StreamableHTTPError(503,'gateway'),
    new StreamableHTTPError(409,'Error POSTing to endpoint: {"error":"session_busy"}'),
    new TypeError('fetch failed',{cause:{code:'ECONNRESET'}}),new Error('Not connected'),
    new McpError(ErrorCode.ConnectionClosed,'Connection closed'),new McpError(ErrorCode.InternalError,'upstream failed')]){
    let reconnects=0;
    const remote=resumableClient({callTool:async()=>{throw failure;}},async()=>{reconnects++;return {callTool:async()=>({ok:true}),close:async()=>{}};});
    assert.deepEqual(await remote.callTool({name:'get_credits',arguments:{}}),{ok:true});assert.equal(reconnects,1);await remote.close();
  }
});
test('concurrent local requests are serialized to avoid session_busy and do not multiply reconnects',async()=>{
  let active=0,peak=0,calls=0,reconnects=0;
  const remote=resumableClient({callTool:async()=>{throw new StreamableHTTPError(404,'expired');}},async()=>{
    reconnects++;return {callTool:async()=>{peak=Math.max(peak,++active);await new Promise(r=>setImmediate(r));active--;return {order:++calls};},close:async()=>{}};
  });
  assert.deepEqual(await Promise.all(Array.from({length:5},()=>remote.callTool({name:'get_credits'}))),Array.from({length:5},(_,i)=>({order:i+1})));
  assert.equal(peak,1);assert.equal(reconnects,1);await remote.close();
});
test('business errors, throttling, invalid calls and caller cancellation do not reconnect',async()=>{
  for(const failure of [new StreamableHTTPError(401,'login_required'),new StreamableHTTPError(403,'denied'),
    new StreamableHTTPError(429,'quota'),new StreamableHTTPError(400,'invalid'),new StreamableHTTPError(409,'idempotency_conflict'),
    new McpError(ErrorCode.InvalidParams,'invalid arguments'),new TypeError('invalid input'),new DOMException('cancelled','AbortError')]){
    const remote=resumableClient({callTool:async()=>{throw failure;},close:async()=>{}},async()=>{throw Error('must_not_reconnect');});
    await assert.rejects(remote.callTool({name:'get_credits'}),e=>e===failure);await remote.close();
  }
  let calls=0;
  const business={isError:true,structuredContent:{status:'failed',error_code:'model_or_data_failed'}};
  const remote=resumableClient({callTool:async()=>{calls++;return business;},close:async()=>{}},async()=>{throw Error('must_not_reconnect');});
  assert.equal(await remote.callTool({name:'extraction_status'}),business);assert.equal(calls,1);await remote.close();
});
test('retry limit, failed reconnect recovery and cancellation of queued calls are bounded',async()=>{
  let reconnects=0;
  const broken={callTool:async()=>{throw new StreamableHTTPError(502,'gateway');},close:async()=>{}};
  const remote=resumableClient(broken,async()=>{if(++reconnects===1)throw Error('reconnect_failed');return broken;});
  await assert.rejects(remote.callTool({name:'get_credits'}),/reconnect_failed/);
  await assert.rejects(remote.callTool({name:'get_credits'}),e=>e.code===502);assert.equal(reconnects,2);await remote.close();
  let release,calls=0;
  const queued=resumableClient({callTool:async()=>{calls++;await new Promise(r=>{release=r;});return {};},close:async()=>{}},async()=>{throw Error('must_not_reconnect');});
  const first=queued.callTool({name:'get_credits'});await new Promise(r=>setImmediate(r));
  const controller=new AbortController();const second=queued.callTool({name:'get_credits'},undefined,{signal:controller.signal});
  controller.abort();release();await first;await assert.rejects(second);assert.equal(calls,1);await queued.close();
});
