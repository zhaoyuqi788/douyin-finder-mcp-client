import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, readdir, rm, symlink, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installMcp} from '../install.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'douyin-mcp-installer-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  return {dir, configPath: join(dir, 'settings.json')};
}

test('preserves other services/settings and backs up original bytes', async t => {
  const {configPath} = await fixture(t);
  const original = '{\n "theme":"light", "mcpServers":{"other":{"command":"other-tool","env":{"EXAMPLE":"preserve-me"}}}\n}\n';
  await writeFile(configPath, original);
  const result = await installMcp({configPath, skipDependencies: true});
  assert.equal(await readFile(result.backupPath, 'utf8'), original);
  const config = JSON.parse(await readFile(configPath));
  assert.equal(config.theme, 'light');
  assert.deepEqual(config.mcpServers.other, JSON.parse(original).mcpServers.other);
  assert.equal(config.mcpServers.douyin_finder_v2.command, process.execPath);
  assert.equal(config.mcpServers.douyin_finder_v2.args[0], result.clientPath);
  assert.equal(result.status, 'registered_login_and_verification_pending');
});

test('preview does not install dependencies or create files', async t => {
  const {dir, configPath} = await fixture(t);
  const result = await installMcp({configPath, dryRun: true});
  assert.equal(result.status, 'preview');
  assert.deepEqual(await readdir(dir), []);
});

test('invalid JSON and invalid mcpServers retain original bytes', async t => {
  const {configPath} = await fixture(t);
  for (const contents of ['{ /* JSONC */ "other": true }', '{"mcpServers":[]}', '[]']) {
    await writeFile(configPath, contents);
    await assert.rejects(installMcp({configPath, skipDependencies: true}));
    assert.equal(await readFile(configPath, 'utf8'), contents);
  }
});

test('new configuration and repeat registration remain valid without duplicated services', async t => {
  const {configPath} = await fixture(t);
  const first = await installMcp({configPath, skipDependencies: true});
  assert.equal(first.backupPath, null);
  const original = await readFile(configPath, 'utf8');
  const second = await installMcp({configPath, skipDependencies: true});
  assert.equal(await readFile(second.backupPath, 'utf8'), original);
  assert.deepEqual(Object.keys(JSON.parse(await readFile(configPath)).mcpServers), ['douyin_finder_v2']);
});

test('output creates an import template and cannot overwrite an existing file', async t => {
  const {configPath: outputPath} = await fixture(t);
  const result = await installMcp({outputPath, skipDependencies: true});
  assert.equal(result.status, 'template_created_registration_pending');
  const contents = await readFile(outputPath, 'utf8');
  await assert.rejects(installMcp({outputPath, skipDependencies: true}), /已存在/);
  assert.equal(await readFile(outputPath, 'utf8'), contents);
});

test('rejects ambiguous and relative destination paths', async () => {
  await assert.rejects(installMcp({configPath: 'settings.json', skipDependencies: true}), /绝对路径/);
  await assert.rejects(installMcp({skipDependencies: true}), /二选一/);
});

test('a config symlink stays intact and its real destination is backed up', {skip: process.platform === 'win32'}, async t => {
  const {dir, configPath} = await fixture(t);
  const target = join(dir, 'actual.json');
  await writeFile(target, '{"other":1}');
  await symlink(target, configPath);
  const result = await installMcp({configPath, skipDependencies: true});
  assert.equal(await realpath(configPath), await realpath(target));
  assert.equal(result.configPath, await realpath(target));
  assert.equal(JSON.parse(await readFile(target)).other, 1);
});
