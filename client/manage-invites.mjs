import {connectRemote} from './https-oauth.mjs';

let session;
async function close(){await session?.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
try{
 process.stderr.write('正在打开邀请码管理登录。请使用现有管理员账号；若 MCP 正在登录，请先关闭它以释放回调端口。\n');
 session=await connectRemote({mode:'admin'});
 process.stderr.write('邀请码管理已打开。页面可设置数量、积分和有效期，并下载 TXT。点击“结束管理”关闭。\n');
 await session.closed;await session.close();
}catch(e){process.stderr.write(e.code==='EADDRINUSE'?'登录端口被占用。请先关闭正在登录的 MCP，再重试。\n':`管理暂未打开：${['admin_required','authorization_denied','login_timeout','email_verification_required'].includes(e.message)?e.message:'请检查网络、管理员登录及服务状态'}。\n`);process.exitCode=1;}
