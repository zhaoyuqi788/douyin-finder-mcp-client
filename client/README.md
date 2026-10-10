# Douyin Finder HTTPS 连接器 0.4.3

从仓库根目录的 [INSTALL.txt](../INSTALL.txt) 安装，并使用 [install.mjs](../install.mjs) 注册到目标软件。

需要 Node.js 22 或更新版本。此目录只包含客户端；数据与模型运行在服务主机。

手动安装依赖：`npm ci --ignore-scripts`。MCP 配置使用 Node 的绝对路径作为 `command`，此目录的 `qoder-https.mjs` 绝对路径作为 `args`。

远程地址：`https://d34vctdvg0hn6s.cloudfront.net/mcp`。用户在浏览器用已授权账号登录，本机回调为 `http://127.0.0.1:53682/callback`。密码不进入配置，令牌只保存在连接器进程内存中。
