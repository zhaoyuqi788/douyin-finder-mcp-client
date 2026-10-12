# Douyin Finder HTTPS 连接器 0.4.9

从仓库根目录的 [INSTALL.txt](../INSTALL.txt) 安装，并使用 [install.mjs](../install.mjs) 注册到目标软件。

需要 Node.js 22 或更新版本。此目录只包含客户端；数据与模型运行在服务主机。手动安装依赖：`npm ci --ignore-scripts`。MCP 配置使用 Node 的绝对路径作为 command，此目录的 qoder-https.mjs 绝对路径作为 args。

远程地址：https://d34vctdvg0hn6s.cloudfront.net/mcp 。已有账号直接登录；新用户在 Auth0 注册并自行设置密码、验证邮箱，再在本机页面兑换邀请码。详细流程见根目录 README.md。

管理员在本目录执行 `node manage-invites.mjs`，可批量生成并下载邀请码。普通用户不能管理。回调使用 http://127.0.0.1:53682/callback，避免同时启动多个登录连接器。密码不进入配置；OAuth 访问和刷新令牌默认保存在 ~/.douyin-finder-qoder-client/tokens.json，正常退出和升级不会清除。本机页面不包含令牌。首次登录后，重启复用缓存并自动刷新；刷新授权过期或被撤销时需要重新登录。缓存详情和切换账号见根目录 README.md。
