import {randomBytes} from 'node:crypto';

export function portalHtml(nonce,mode){
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Douyin Finder · ${mode==='admin'?'邀请码管理':'账号开通'}</title>
 <style nonce="${nonce}">body{font:16px system-ui;background:#f3f6fa;color:#172a43;max-width:780px;margin:50px auto;padding:24px}main{background:white;border-radius:18px;padding:32px}h1{font-size:26px}label{display:block;margin:16px 0}input{padding:10px;border:1px solid #cad3e0;border-radius:7px;font-size:16px}#code{width:90%}button{padding:10px 18px;border:0;border-radius:7px;background:#1765bc;color:white;cursor:pointer;margin:8px 6px 8px 0}button:disabled{opacity:.5}textarea{width:95%;height:220px;font:14px monospace}small{color:#60748e}table{width:100%;font-size:13px;text-align:left}td{padding:7px}#error{color:#a11c28}</style>
 <main><h1>${mode==='admin'?'批量生成邀请码':'Douyin Finder 账号开通'}</h1><p id="status">正在确认登录…</p><p id="error" role="alert"></p>
 <section id="verify" hidden><p>请打开注册邮箱，点击 Auth0 发来的验证链接。验证完成后点击下面的按钮，再次登录以确认邮箱。</p><button id="verified">我已验证邮箱，继续登录</button></section>
 <section id="redeem" hidden><p>邮箱验证完成后，粘贴管理员给你的单次邀请码。兑换成功即可回到软件使用 MCP。</p><form id="redeemForm"><label>邀请码<input id="code" required autocomplete="off" maxlength="46" placeholder="DI-…"></label><button>开通账号</button></form></section>
 <section id="admin" hidden><p>默认每码开通一个账号。新用户自行注册、设置密码并验证邮箱；现有账号不需要邀请码。</p><form id="generate"><label>数量（1–100）<input id="count" type="number" min="1" max="100" value="10" required></label><label>每人初始积分（1–100000）<input id="credits" type="number" min="1" max="100000" value="20" required></label><label>有效天数（1–30）<input id="days" type="number" min="1" max="30" value="7" required></label><button>生成邀请码</button></form><div id="export" hidden><p>完整邀请码只显示本次，请下载保存后分别发给用户。</p><textarea id="codes" readonly></textarea><button id="download">下载 TXT</button></div><p>最近 200 个邀请码</p><table><tbody id="history"></tbody></table><button id="close">结束管理</button></section></main>
 <script nonce="${nonce}">
 const csrf=${JSON.stringify(nonce)},mode=${JSON.stringify(mode)},el=id=>document.getElementById(id);
 const messages={invitation_unavailable:'邀请码无效、已使用、已撤销或已过期。请联系管理员。',admin_required:'请使用现有管理员账号登录。',email_verification_required:'请先点击邮箱验证邮件，再关闭并重新启用 MCP 登录。',onboarding_rate_limit:'请求过多，请一分钟后再试。',batch_already_generated:'这一批已经生成。请使用刚才显示的下载内容。',invalid_token:'登录已过期，请结束管理后重新打开。'};
 async function api(path,body){const r=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'x-portal-csrf':csrf,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await r.json();if(!r.ok)throw Error(messages[value.error]||value.error||'请求失败，请重试。');return value;}
 function error(e){el('error').textContent=e.message;}
 async function history(){const data=await api('/portal/invites');el('history').replaceChildren();for(const i of data.invitations){const tr=document.createElement('tr');for(const text of [i.id.slice(0,8),{available:'未兑换',redeemed:'已兑换',revoked:'已撤销',expired:'已过期'}[i.status],i.credits+' 积分',new Date(i.expires_at).toLocaleString()]){const td=document.createElement('td');td.textContent=text;tr.append(td);}if(i.status==='available'){const td=document.createElement('td'),b=document.createElement('button');b.textContent='撤销';b.onclick=async()=>{try{b.disabled=true;await api('/portal/revoke',{id:i.id});await history();}catch(e){error(e);b.disabled=false;}};td.append(b);tr.append(td);}el('history').append(tr);}}
 el('redeemForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;el('error').textContent='';try{await api('/portal/redeem',{invitation_code:el('code').value.trim()});el('redeem').hidden=true;el('status').textContent='账号已开通，正在连接 MCP…';}catch(e){error(e);b.disabled=false;}};
 el('generate').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;el('error').textContent='';try{const data=await api('/portal/invites',{batch_id:crypto.randomUUID(),count:Number(el('count').value),credits:Number(el('credits').value),expires_days:Number(el('days').value)});el('codes').value='Douyin Finder 单次邀请码\\n生成时间：'+new Date().toLocaleString()+'\\n每个码仅发给一个用户；请勿上传公开仓库或公共文档。\\n\\n'+data.invitations.map(i=>i.code+'  | '+i.credits+' 积分 | 到期 '+new Date(i.expires_at).toLocaleString()).join('\\n');el('export').hidden=false;await history();}catch(e){error(e);}finally{b.disabled=false;}};
 el('download').onclick=()=>{const u=URL.createObjectURL(new Blob([el('codes').value],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download='Douyin-Finder-邀请码-'+new Date().toISOString().slice(0,10)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
 el('close').onclick=async()=>{try{await api('/portal/close',{});el('admin').hidden=true;el('status').textContent='管理已结束，可以关闭本页。';}catch(e){error(e);}};
 el('verified').onclick=async()=>{try{el('verified').disabled=true;await api('/portal/verified',{});el('verify').hidden=true;el('status').textContent='正在重新确认邮箱…';}catch(e){error(e);el('verified').disabled=false;}};
 async function poll(){try{const s=await api('/portal/status');if(s.phase==='failed'){error(Error(messages[s.error]||s.error));el('status').textContent='暂未开通';return;}if(s.phase==='email_verification_required'){el('status').textContent='请先验证注册邮箱';el('verify').hidden=false;el('verified').disabled=false;}if(s.phase==='invitation_required'){el('status').textContent='邮箱已验证，请兑换邀请码';el('redeem').hidden=false;}if(s.phase==='ready'){el('status').textContent='登录完成。可回到 Qoder 或当前软件。';el('redeem').hidden=true;return;}if(s.phase==='admin_ready'){el('status').textContent='管理员登录成功';el('admin').hidden=false;await history();return;}setTimeout(poll,1000);}catch(e){error(e);}}poll();
 </script></html>`;
}

export function createAccountPortal({mode='mcp',request,host='127.0.0.1:53682'}={}){
 const nonce=randomBytes(32).toString('base64url'),ticket=randomBytes(32).toString('base64url'),origin='http://'+host,pagePath='/complete?ticket='+ticket;
 let phase='working',error,resolveActivated,resolveClosed,resolveVerified,verified;
 const activated=new Promise(r=>resolveActivated=r),closed=new Promise(r=>resolveClosed=r);
 const resetVerification=()=>{verified=new Promise(r=>resolveVerified=r);};resetVerification();
 const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
 return{activated,closed,pagePath,get verified(){return verified;},setPhase:(value)=>{phase=value;if(value==='email_verification_required')resetVerification();},fail:code=>{phase='failed';error=code;},async handle(req,res){
  const complete=req.url==='/complete'||req.url?.startsWith('/complete?');
  if(!complete&&!req.url?.startsWith('/portal/'))return false;
  res.setHeader('cache-control','no-store');res.setHeader('referrer-policy','no-referrer');res.setHeader('x-content-type-options','nosniff');
  res.setHeader('content-security-policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
  if(req.headers.host!==host||(req.headers.origin&&req.headers.origin!==origin)) {json(res,403,{error:'invalid_portal_origin'});return true;}
  // The page ticket is independent of CSRF. A local process knowing the fixed
  // callback port cannot fetch the form nonce and reuse the owner's bearer proxy.
  if(complete&&req.method==='GET'){if(req.url!==pagePath){json(res,403,{error:'invalid_portal_ticket'});return true;}res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(portalHtml(nonce,mode));return true;}
  if(req.headers['x-portal-csrf']!==nonce){json(res,403,{error:'invalid_portal_csrf'});return true;}
  try{
   if(req.url==='/portal/status'&&req.method==='GET'){json(res,200,{phase,...(error?{error}:{})});return true;}
   if(req.url==='/portal/close'&&req.method==='POST'&&mode==='admin'){json(res,200,{closed:true});resolveClosed();return true;}
   if(req.url==='/portal/verified'&&req.method==='POST'&&phase==='email_verification_required'){phase='working';json(res,200,{retrying:true});resolveVerified();return true;}
   const redeem=req.url==='/portal/redeem'&&req.method==='POST'&&phase==='invitation_required';
   const admin=mode==='admin'&&phase==='admin_ready'&&((req.url==='/portal/invites'&&['GET','POST'].includes(req.method))||(req.url==='/portal/revoke'&&req.method==='POST'));
   if(!redeem&&!admin){json(res,403,{error:'portal_not_ready'});return true;}
   let body;if(req.method==='POST'){if(!String(req.headers['content-type']).startsWith('application/json')){json(res,415,{error:'json_required'});return true;}let text='';for await(const c of req){text+=c;if(Buffer.byteLength(text)>8192){json(res,413,{error:'request_too_large'});return true;}}try{body=JSON.parse(text);}catch{json(res,400,{error:'invalid_json'});return true;}}
   const path=redeem?'/onboarding/redeem':req.url==='/portal/revoke'?'/admin/invites/revoke':'/admin/invites';
   const value=await request(path,body);json(res,200,value);
   if(redeem){phase='working';resolveActivated();}
  }catch(e){json(res,Number.isInteger(e.status)?e.status:502,{error:e.message??'request_failed'});}
  return true;
 }};
}
