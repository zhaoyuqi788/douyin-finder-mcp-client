import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, stat, readdir, rm, mkdir, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTokenCache} from '../token-cache.mjs';

const binding={issuer:'https://synthetic.example/',clientId:'synthetic-client',endpoint:'https://synthetic.example/mcp',audience:'synthetic'};
const tokens={access_token:'synthetic-access',token_type:'Bearer',expires_in:900,refresh_token:'synthetic-refresh',scope:'kol:read'};
test('token cache survives a new cache instance and rotates tokens atomically with private permissions',async()=>{
  const root=await mkdtemp(join(tmpdir(),'douyin-cache-')),file=join(root,'private','tokens.json');
  try{
    const cache=createTokenCache({file,binding});assert.equal(await cache.load(),undefined);
    await cache.save({...tokens,id_token:'not-needed',password:'not-needed'});
    assert.deepEqual(await createTokenCache({file,binding}).load(),tokens);
    const text=await readFile(file,'utf8');assert(!text.includes('not-needed'));
    if(process.platform!=='win32'){
      assert.equal((await stat(file)).mode&0o777,0o600);
      assert.equal((await stat(join(root,'private'))).mode&0o777,0o700);
    }
    const rotated={...tokens,access_token:'synthetic-access-2',refresh_token:'synthetic-refresh-2'};
    await cache.save(rotated);assert.deepEqual(await createTokenCache({file,binding}).load(),rotated);
    assert.deepEqual(await readdir(join(root,'private')),['tokens.json']);
    await cache.clear();assert.equal(await cache.load(),undefined);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('plain tokens from the portable 0.4.5 package remain usable and migrate on the next save',async()=>{
  const root=await mkdtemp(join(tmpdir(),'douyin-legacy-')),file=join(root,'tokens.json');
  try{
    await writeFile(file,JSON.stringify(tokens));
    const cache=createTokenCache({file,binding});assert.deepEqual(await cache.load(),tokens);
    await cache.save(tokens);assert.equal(JSON.parse(await readFile(file,'utf8')).version,1);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('corrupt, oversized or differently bound caches never return credentials or expose them in warnings',async()=>{
  const root=await mkdtemp(join(tmpdir(),'douyin-invalid-')),file=join(root,'tokens.json'),warnings=[];
  try{
    const cache=createTokenCache({file,binding,onWarning:v=>warnings.push(v)});
    for(const text of ['{',JSON.stringify({...tokens,expires_in:901}),'x'.repeat(65537),
      JSON.stringify({version:1,binding:{...binding,clientId:'other'},tokens})]){
      await writeFile(file,text);assert.equal(await cache.load(),undefined);
    }
    assert.deepEqual(warnings,Array(4).fill('token_cache_unavailable'));
    await assert.rejects(cache.save({...tokens,refresh_token:42}),/invalid_tokens/);
    if(process.platform!=='win32'){
      const linked=join(root,'linked.json');await symlink(file,linked);
      assert.equal(await createTokenCache({file:linked,binding}).load(),undefined);
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
test('a disabled or unavailable cache leaves the current login usable and reports a sanitized warning',async()=>{
  const disabled=createTokenCache({file:null,binding});assert.equal(await disabled.load(),undefined);
  assert.deepEqual(await disabled.save(tokens),tokens);await disabled.clear();
  const root=await mkdtemp(join(tmpdir(),'douyin-unwritable-')),file=join(root,'tokens.json'),warnings=[];
  try{
    await mkdir(file); // Portable write failure, also works on Windows CI.
    assert.deepEqual(await createTokenCache({file,binding,onWarning:v=>warnings.push(v)}).save(tokens),tokens);
    assert.deepEqual(warnings,['token_cache_unavailable']);
  }finally{await rm(root,{recursive:true,force:true});}
});
