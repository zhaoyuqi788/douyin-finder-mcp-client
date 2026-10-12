# Douyin Finder MCP 客户端

部署状态（2026-10-12）：邀请码永久有效，每个新账号 200 积分，使用 0.4.8 客户端。现有账号直接登录，新用户自行注册、验证邮箱并兑换管理员发放的邀请码。

把以下内容复制给你正在使用的软件中的 coding agent，例如 Qoder / Qoder CN：

> 请读取 https://github.com/zhaoyuqi788/douyin-finder-mcp-client 中的 INSTALL.txt，实际安装 Douyin Finder V2，并在我现在使用的软件中注册、启用 douyin_finder_v2 MCP。保留已有配置，完成浏览器登录后的只读工具验收，不要只给我教程。

管理员一次性给新用户的完整文字见 [FORWARD.txt](FORWARD.txt)：填写只发给该用户的单次邀请码，连同安装、注册、邮箱验证、兑换及 Issue 反馈说明一起私下发送。用户自己注册和设置密码，邀请码永久有效，开通获得 200 积分。

安装指令的纯文本地址：

https://raw.githubusercontent.com/zhaoyuqi788/douyin-finder-mcp-client/main/INSTALL.txt

仓库包含安装说明、安装脚本和 0.4.8 连接器；可以直接克隆，或下载 GitHub 的 Code → Download ZIP。无需从飞书取包。发布包见 [Releases](https://github.com/zhaoyuqi788/douyin-finder-mcp-client/releases)。

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

连接器通过本地 STDIO 交给软件，远程通信走 HTTPS。已有账号直接登录，余额和历史任务保持原样。新用户从管理员获得邀请码，在登录页面点击注册，自行设置密码并验证邮箱，然后在本机开通页面兑换邀请码。有效邀请码开通独立账号，200 个内部积分（具体以邀请码为准）；安装包本身不授予访问权限。密码由用户在 Auth0 网页输入。OAuth 回调需要本机 `127.0.0.1:53682` 空闲；令牌仅在进程内存中。

启用后确认加载 9 个工具：`search_kols`、`get_kol`、`read_evidence`、`visual_top5`、`create_extraction`、`extraction_status`、`extraction_result`、`cancel_extraction`、`get_credits`。调用 `get_credits`，再调用 `search_kols`，参数 `{"limit":1}`。安装验收只读，不自动提交扣积分的提人任务。首次登录超时可在登录完成后关闭再启用 MCP。

客户端依赖安装和配置注册成功，不代表远程登录与工具验收已完成。另一台电脑的网络和登录仍需实际验证。

## 更新与连接恢复（0.4.8）

已有安装在固定目录更新仓库，再运行 `node install.mjs --config "实际配置文件绝对路径"`。下载包安装的用户先把新版解压到固定目录，再运行安装脚本。需要更新整个 `client` 目录，保留邀请码注册与管理页面。之后在 Extensions → Connectors（或该版本 MCP 设置）关闭再启用服务，并新开一个任务验收；正在运行的旧连接器不会自动加载新代码。

服务端会话按闲置 15 分钟过期，持续调用会延长会话；未知或过期会话返回 HTTP 404。访问令牌仍最多 15 分钟，客户端通过现有刷新授权续期。

客户端串行发送同一连接器的工具调用，避免并发请求触发 `session_busy`。会话丢失、网络中断、HTTP 5xx、连接关闭或协议内部错误时，安全读取和带合法幂等键的提人会自动重建连接、重试一次，保持原请求和 `idempotency_key`。权限拒绝、限额、参数错误和用户取消不重试；工具返回的任务失败也不会自动重新提交。重试仍失败时会报告错误，后续调用可以再次尝试恢复。

本仓库和发布包只含客户端，不包含 Mac 服务端、模型、数据库或隧道。服务主机及网络仍需正常运行。

## 邀请码自助注册

1. 向管理员领取一个邀请码，再请当前软件的 coding agent 按 INSTALL.txt 安装和启用 MCP。
2. 新用户在自动打开的 Auth0 登录页点击“注册”，输入自己的邮箱并自行设置密码；已有账号直接登录。
3. 打开注册邮箱，点击验证链接。回到开通页面点击“我已验证邮箱，继续登录”，重新确认登录。
4. 在本机开通页面粘贴邀请码，点击“开通账号”。看到“登录完成。可回到 Qoder 或当前软件。”后返回软件。
5. Agent 确认 9 个工具，并调用 get_credits 和 search_kols({limit:1}) 验收。

每个邀请码仅开通一个账号，永久有效；已撤销或已被其他人兑换的码无法使用。同一账号重试同一码不会重复发积分。新账号只有本人任务与余额，不具备邀请码管理权限。未验证邮箱或未兑换有效邀请码的账号不能读取 KOL 或提交提人任务。

## 管理员批量生成入口

在已安装的仓库根目录运行：

```text
node client/manage-invites.mjs
```

macOS 可双击仓库中的 `管理邀请码.command`，Windows 可双击 `管理邀请码.cmd`。需要先完成客户端依赖安装。页面只允许服务现有管理员账号使用，可以设置数量（1–100），默认 10 个；每个码永久有效，兑换后为新账号发放 200 积分。生成后点击“下载 TXT”，分别发给用户。完整邀请码只显示生成当次，服务端只保存哈希；遗失未兑换的码时可以撤销后重新生成。已兑换的码不能撤销账号权限，需管理员另行禁用账号。

邀请码和下载 TXT 请私下保管，不上传公开 GitHub 或公共飞书页面。管理页面中的“结束管理”会关闭本次连接。管理登录与 MCP 登录共用本机回调端口；若提示占用，请先关闭正在登录的 MCP，管理完成后再启用。

## 使用范围

2026-10-12 服务端已提高额度：每账号每小时 2,000 行候选、每分钟 120 次目录请求及 600 次网络请求、滚动 24 小时 100 个新任务、最多 50 个待处理任务；全服务同时运行 2 个模型任务。单次候选和结果最多 100 位。任务执行最长 20 分钟，需求最多 8,000 字符，query 最多 300 字符。已安装客户端在软件中关闭再启用 MCP，即可刷新工具参数上限。完整数值见 [service-limits.json](service-limits.json)。

V1 提供历史 KOL 数据；V2 用服务主机上的模型异步选人。数据、模型和后台任务在主机运行，客户端无需模型密钥或数据库。主机必须在线。

选人时先查积分，提交 `create_extraction`，同一次需求复用 `idempotency_key`，用 `extraction_status` 查进度，`extraction_result` 取名单。有效名单写入扣 1 个内部积分，同一幂等键的重试和重复取结果不重复扣分。保留 `backend_id`、原始数值及日期；缺失信息为未知。`limit` 最大 100，并同时限定候选和结果数量。

连接器的 OAuth audience 保留原授权标识，它不是访问地址；实际网络目标为 AWS 与 Auth0。

## 遇到问题直接提交 Issue

用户可把排查交给当前软件的 coding agent。完成必要排查后，由 agent 使用用户自己的 GitHub 登录在 [Issues](https://github.com/zhaoyuqi788/douyin-finder-mcp-client/issues) 提交，返回真实链接；相同问题已存在时补充原 Issue。请附环境和客户端版本、发生时间、复现步骤、预期与实际行为、错误码及脱敏日志。这里也接受注册、登录和服务端问题，无需先判断责任组件。

密码、邀请码、验证码、OAuth 令牌、Cookie、完整配置和私人业务信息不得公开。GitHub 未登录时先完成登录；无法提交时保存报告并使用 [问题创建入口](https://github.com/zhaoyuqi788/douyin-finder-mcp-client/issues/new?template=bug_report.yml)，明确说明尚未提交。安装指令和连接器的使用提示都会提醒 agent 执行这一步。

## 验证安装脚本

```text
npm test
```

测试覆盖配置合并、原文备份、无修改预览、无效配置保护和重复注册。安装脚本支持 macOS、Windows、Linux；远程 MCP 能否使用，以目标软件的实际登录和工具调用为准。
