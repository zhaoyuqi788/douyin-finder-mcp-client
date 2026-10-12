import {mkdir, lstat, readFile, chmod, writeFile, rename, unlink} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';

// Keep the path used by the portable 0.4.5 client, outside the installation tree.
export const defaultTokenFile = join(homedir(), '.douyin-finder-qoder-client', 'tokens.json');
const maxBytes = 65536;
export function normalizeTokens(value) {
  if (typeof value?.token_type !== 'string' || value.token_type.toLowerCase() !== 'bearer' ||
      typeof value.access_token !== 'string' || !value.access_token || value.access_token.length > 32768 ||
      !Number.isFinite(value.expires_in) || value.expires_in <= 0 || value.expires_in > 900 ||
      (value.refresh_token !== undefined && (typeof value.refresh_token !== 'string' || !value.refresh_token || value.refresh_token.length > 16384)) ||
      (value.scope !== undefined && (typeof value.scope !== 'string' || value.scope.length > 4096))) throw new Error('invalid_tokens');
  return {access_token: value.access_token, token_type: 'Bearer', expires_in: value.expires_in,
    ...(value.refresh_token ? {refresh_token: value.refresh_token} : {}), ...(value.scope ? {scope: value.scope} : {})};
}

export function createTokenCache({file = defaultTokenFile, binding, onWarning = () => {}}) {
  const warn = () => onWarning('token_cache_unavailable');
  const directory = async () => {
    await mkdir(dirname(file), {recursive: true, mode: 0o700});
    const info = await lstat(dirname(file));
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('invalid_cache_directory');
    await chmod(dirname(file), 0o700);
  };
  return {
    async load() {
      if (file === null) return undefined;
      try {
        const info = await lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) throw new Error('invalid_token_cache');
        await directory();
        await chmod(file, 0o600);
        const text = await readFile(file, 'utf8');
        if (Buffer.byteLength(text) > maxBytes) throw new Error('invalid_token_cache');
        const value = JSON.parse(text);
        if (value.version !== undefined) {
          if (value.version !== 1 || !binding || Object.keys(binding).some(key => value.binding?.[key] !== binding[key])) throw new Error('wrong_token_cache_binding');
          return normalizeTokens(value.tokens);
        }
        // The older portable package wrote a plain OAuth token object here.
        return normalizeTokens(value);
      } catch (error) {
        if (error.code !== 'ENOENT') warn();
        return undefined;
      }
    },
    async save(value) {
      const tokens = normalizeTokens(value);
      if (file === null) return tokens;
      const temp = `${file}.tmp-${randomUUID()}`;
      try {
        await directory();
        const text = JSON.stringify({version: 1, binding, tokens});
        if (Buffer.byteLength(text) > maxBytes) throw new Error('invalid_token_cache');
        // A complete refresh-token rotation replaces the old file atomically.
        await writeFile(temp, text, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
        await rename(temp, file);
        await chmod(file, 0o600);
      } catch {warn();}
      finally {await unlink(temp).catch(() => {});}
      return tokens;
    },
    async clear() {
      if (file === null) return;
      try {await unlink(file);} catch (error) {if (error.code !== 'ENOENT') warn();}
    }
  };
}
