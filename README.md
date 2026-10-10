# Douyin Finder MCP 客户端

把以下内容复制给你正在使用的软件中的 coding agent，例如 Qoder / Qoder CN：

> 请读取 https://github.com/zhaoyuqi788/douyin-finder-mcp-client 中的 INSTALL.txt，实际安装 Douyin Finder V2，并在我现在使用的软件中注册、启用 douyin_finder_v2 MCP。保留已有配置，完成浏览器登录后的只读工具验收，不要只给我教程。

安装指令的纯文本地址：

https://raw.githubusercontent.com/zhaoyuqi788/douyin-finder-mcp-client/main/INSTALL.txt

仓库包含安装说明、安装脚本和 0.4.3 连接器；可以直接克隆，或下载 GitHub 的 Code → Download ZIP。无需从飞书取包。发布包见 [Releases](https://github.com/zhaoyuqi788/douyin-finder-mcp-client/releases)。

## 安装和注册

需要 Node.js 22 或更新版本及 npm。先在目标软件的 MCP 设置中确认它实际使用的配置文件位置，然后执行：

```text
git clone https://github.com/zhaoyuqi788/douyin-finder-mcp-client.git
cd douyin-finder-mcp-client
node install.mjs --config "目标软件实际使用的 MCP JSON 文件的绝对路径"
```

安装脚本安装锁定的客户端依赖、备份原配置，只合并 `mcpServers.douyin_finder_v2`，并填入本机 Node 和客户端脚本的绝对路径。它不会打开登录窗口；回到软件启用 MCP 后，用户在浏览器完成登录，再由 agent 验收工具。

其他用法：

```text
node install.mjs --app qoder-cn
node install.mjs --app qoder
node install.mjs --config "实际配置文件的绝对路径" --dry-run
node install.mjs --output "准备导入的配置 JSON 的绝对路径"
```

`--app` 仅使用已存在的 `~/.qoder-cn/settings.json` 或 `~/.qoder/settings.json`；找不到时会停止，要求提供真正的配置位置。Qoder IDE 的配置以 MCP / 我的服务 / 添加打开的 JSON 为准，[官方配置说明](https://docs.qoder.com/zh/user-guide/chat/model-context-protocol)。新版独立 Qoder 的用户级配置在 `~/.qoder/settings.json`，[官方连接器说明](https://docs.qoder.com/zh/qoder/connectors)。不要将一个版本的目录直接套用到所有 IDE 版本。

`--output` 安装依赖并生成导入模板，仍需 agent 合并到目标软件。严格 JSON 解析失败时会保留原文件，交由 agent 按该软件格式处理。备份在原配置旁，名称为 `.bak-日期-随机编号`。先预览可使用 `--dry-run`，不安装依赖或写入文件。

## 登录与验收

服务 HTTPS 地址：`https://d34vctdvg0hn6s.cloudfront.net/mcp`。

连接器通过本地 STDIO 交给软件，远程通信走 HTTPS。登录使用管理员已开通、已验证邮箱的 MCP 账号；安装客户端不会开通账号。密码由用户在浏览器输入。OAuth 回调需要本机 `127.0.0.1:53682` 空闲；令牌仅在进程内存中。

启用后确认加载 9 个工具：`search_kols`、`get_kol`、`read_evidence`、`visual_top5`、`create_extraction`、`extraction_status`、`extraction_result`、`cancel_extraction`、`get_credits`。调用 `get_credits`，再调用 `search_kols`，参数 `{"limit":1}`。安装验收只读，不自动提交扣积分的提人任务。首次登录超时可在登录完成后关闭再启用 MCP。

客户端依赖安装和配置注册成功，不代表远程登录与工具验收已完成。另一台电脑的网络和登录仍需实际验证。

## 使用范围

V1 提供历史 KOL 数据；V2 用服务主机上的模型异步选人。数据、模型和后台任务在主机运行，客户端无需模型密钥或数据库。主机必须在线。

选人时先查积分，提交 `create_extraction`，同一次需求复用 `idempotency_key`，用 `extraction_status` 查进度，`extraction_result` 取名单。有效名单写入扣 1 个内部积分，同一幂等键的重试和重复取结果不重复扣分。保留 `backend_id`、原始数值及日期；缺失信息为未知。`limit` 最大 20，并同时限定候选和结果数量。

连接器的 OAuth audience 保留原授权标识，它不是访问地址；实际网络目标为 AWS 与 Auth0。

## 验证安装脚本

```text
npm test
```

测试覆盖配置合并、原文备份、无修改预览、无效配置保护和重复注册。安装脚本支持 macOS、Windows、Linux；远程 MCP 能否使用，以目标软件的实际登录和工具调用为准。
