import {readFile, writeFile, mkdir, rename, unlink, stat, realpath, access} from 'node:fs/promises';
import {resolve, dirname, join, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {parseArgs} from 'node:util';

const root = dirname(fileURLToPath(import.meta.url));
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);

async function readConfig(path) {
  try {
    const text = await readFile(path, 'utf8');
    const mode = (await stat(path)).mode & 0o777;
    let parsed;
    try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch { throw new Error('配置不是严格 JSON；原文件未修改。请按目标软件的 JSON/JSONC 格式合并。'); }
    if (!object(parsed) || (parsed.mcpServers !== undefined && !object(parsed.mcpServers))) {
      throw new Error('配置或 mcpServers 不是对象；原文件未修改。');
    }
    return {text, parsed, mode};
  } catch (error) {
    if (error.code === 'ENOENT') return {text: null, parsed: {}, mode: 0o600};
    throw error;
  }
}

async function installDependencies(clientDir) {
  await new Promise((accept, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
      {cwd: clientDir, stdio: 'inherit', shell: process.platform === 'win32'});
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? accept() : reject(new Error(`依赖安装失败 (${code ?? signal})；MCP 配置未修改。`)));
  });
}

export async function installMcp({configPath, outputPath, repositoryRoot = root, skipDependencies = false, dryRun = false}) {
  if ((!!configPath + !!outputPath) !== 1) throw new Error('请提供 --config 或 --output，二选一。');
  const requested = configPath ?? outputPath;
  if (!isAbsolute(requested)) throw new Error('配置路径必须是目标软件真实使用的绝对路径。');
  const clientDir = join(repositoryRoot, 'client');
  const script = await realpath(join(clientDir, 'qoder-https.mjs'));
  let destination = requested;
  try {destination = await realpath(requested);} catch (error) {if (error.code !== 'ENOENT') throw error;}
  const before = await readConfig(destination);
  // Generated templates must never overwrite a user's existing configuration.
  if (outputPath && before.text !== null) throw new Error('--output 目标已存在，请选一个新文件；原文件未修改。');
  const config = {
    ...before.parsed,
    mcpServers: {
      ...before.parsed.mcpServers,
      douyin_finder_v2: {command: process.execPath, args: [script]}
    }
  };
  const result = {status: dryRun ? 'preview' : outputPath ? 'template_created_registration_pending' : 'registered_login_and_verification_pending',
    configPath: destination, backupPath: null, clientPath: script, mcpServer: 'douyin_finder_v2'};
  if (dryRun) return {...result, entry: config.mcpServers.douyin_finder_v2};
  if (!skipDependencies) await installDependencies(clientDir);
  const latest = await readConfig(destination);
  if (latest.text !== before.text) throw new Error('依赖安装期间配置发生改变，请重新运行；没有覆盖新配置。');
  await mkdir(dirname(destination), {recursive: true});
  const suffix = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  if (before.text !== null) {
    result.backupPath = `${destination}.bak-${suffix}`;
    await writeFile(result.backupPath, before.text, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
  }
  const temp = `${destination}.tmp-${suffix}`;
  try {
    await writeFile(temp, JSON.stringify(config, null, 2) + '\n', {encoding: 'utf8', mode: before.mode, flag: 'wx'});
    await rename(temp, destination);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
  return result;
}

async function main() {
  const {values} = parseArgs({options: {
    config: {type: 'string'}, output: {type: 'string'}, app: {type: 'string'},
    'dry-run': {type: 'boolean'}, help: {type: 'boolean'}
  }});
  if (values.help) {
    console.log('Node.js >=22。用法：\n  node install.mjs --config "目标软件的 MCP JSON 绝对路径"\n  node install.mjs --app qoder-cn|qoder\n  node install.mjs --output "新模板 JSON 的绝对路径"\n  加 --dry-run 可只预览，不安装依赖或写入文件。\n配置注册后还需在目标软件启用、浏览器登录及真实工具验收。');
    return;
  }
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('需要 Node.js 22 或更新版本。');
  if (values.app && (values.config || values.output)) throw new Error('--app 不能与 --config / --output 同用。');
  let configPath = values.config;
  if (values.app) {
    const folders = {qoder: '.qoder', 'qoder-cn': '.qoder-cn'};
    if (!folders[values.app]) throw new Error('--app 仅接受 qoder 或 qoder-cn；其他软件请用 --config。');
    configPath = join(homedir(), folders[values.app], 'settings.json');
    try {await access(configPath);} catch {throw new Error('未找到已有配置。请在目标软件 MCP 设置中确认实际文件，再用 --config 提供绝对路径。');}
  }
  console.log(JSON.stringify(await installMcp({configPath, outputPath: values.output, dryRun: values['dry-run']}), null, 2));
  console.log('下一步：在目标软件启用 douyin_finder_v2，由用户在浏览器登录，新用户自行注册、验证邮箱并兑换邀请码；确认 9 个工具并调用 get_credits 和 search_kols({limit:1})。此时尚未完成远程验收。');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
