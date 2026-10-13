// SPDX-License-Identifier: MIT
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, open, rename, lstat, readdir, realpath, unlink, link } from 'node:fs/promises';
import { resolve, join, dirname, sep, isAbsolute } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

export const SCHEMA = 'tjl.economic-client-workspace.v1';
export function canonical(value) {
  if (value === null || typeof value !== 'object') {
    const result = JSON.stringify(value);
    if (result === undefined) throw new TypeError('Use JSON values');
    return result;
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
export const sha = value => createHash('sha256').update(value).digest('hex');
export const identity = value => sha(canonical(value));
export const clone = value => JSON.parse(JSON.stringify(value));
export const now = () => new Date().toISOString();
export function text(value, name, maximum = 10000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0'))
    throw new TypeError('Supply ' + name + ' as nonempty text');
  return value;
}
export function key(value, name = 'identity') {
  text(value, name, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new TypeError('Use a simple ' + name);
  return value;
}
export function relative(value) {
  text(value, 'relative source path', 4096);
  if (value.includes('\\') || isAbsolute(value) || value.split('/').some(p => !p || p === '.' || p === '..'))
    throw new TypeError('Use an ordinary relative source path');
  return value;
}
export async function ordinary(path, directory = false) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()))
    throw new Error('Use an ordinary ' + (directory ? 'directory' : 'file') + ': ' + path);
  return info;
}
export async function readJson(path, fallback) {
  try { await ordinary(path); return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && arguments.length > 1) return fallback; throw error; }
}
export async function syncDirectory(directory) {
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
export async function writeAtomic(path, body) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = path + '.' + randomUUID() + '.tmp';
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(body); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temporary, path); await syncDirectory(dirname(path)); }
  finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
export async function writeJson(path, value) { await writeAtomic(path, JSON.stringify(value, null, 2) + '\n'); }
export async function blob(directory, body) {
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const digest = sha(content), path = join(directory, 'objects', digest);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary=path+'.'+randomUUID()+'.tmp';
  const handle=await open(temporary,'wx',0o600);
  try { await handle.writeFile(content);await handle.sync(); } finally { await handle.close(); }
  try {
    try { await link(temporary,path);await syncDirectory(dirname(path)); }
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      await ordinary(path);
      const actual=await readFile(path);
      if(actual.length!==content.length||sha(actual)!==digest)throw new Error('Retained source object differs');
    }
  } finally { await unlink(temporary); }
  return { sha256: digest, bytes: content.length, path: 'objects/' + digest };
}
export async function readBlob(directory, value) {
  if (!value || !/^[a-f0-9]{64}$/.test(value.sha256) || value.path !== 'objects/' + value.sha256)
    throw new Error('Unknown saved source object');
  const path = join(directory, value.path); await ordinary(path);
  const body = await readFile(path);
  if (body.length !== value.bytes || sha(body) !== value.sha256) throw new Error('Saved original bytes differ: ' + value.path);
  return body;
}
function processIdentity(pid) {
  if (process.platform !== 'linux') return null;
  try {
    const value=readFileSync('/proc/'+pid+'/stat','utf8');
    return value.slice(value.lastIndexOf(')')+2).split(' ')[19];
  } catch(error){if(error.code==='ENOENT')return null;throw error;}
}
export async function workspaceLease(directory) {
  await mkdir(directory,{recursive:true,mode:0o700});await ordinary(directory,true);
  const path=join(directory,'workspace-lease.sqlite');
  try { await ordinary(path); } catch(error){if(error.code!=='ENOENT')throw error;}
  const db=new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)');
  const current={pid:process.pid,start:processIdentity(process.pid),token:randomUUID(),acquired_at:now()};
  try {
    db.exec('BEGIN IMMEDIATE');
    const row=db.prepare('SELECT body FROM owner WHERE id=1').get();
    if(row){
      const owner=JSON.parse(row.body);
      let alive=true;
      try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;else throw error;}
      if(alive&&owner.start&&process.platform==='linux')alive=processIdentity(owner.pid)===owner.start;
      if(alive)throw new Error('This workspace is open in process '+owner.pid+'; use its original operator connection');
    }
    db.prepare('INSERT INTO owner(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(JSON.stringify(current));
    db.exec('COMMIT');
  } catch(error){try{db.exec('ROLLBACK');}catch{}db.close();throw error;}
  return async()=>{
    db.exec('BEGIN IMMEDIATE');
    try{
      const row=db.prepare('SELECT body FROM owner WHERE id=1').get();
      if(!row||JSON.parse(row.body).token!==current.token)throw new Error('Workspace operation ownership changed');
      db.prepare('DELETE FROM owner WHERE id=1').run();db.exec('COMMIT');
    }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}
  };
}
export async function sourceFile(root, name, maximum = 512 * 1024 * 1024) {
  relative(name);
  const file = join(root, name), actualRoot = await realpath(root), actual = await realpath(file);
  if (!actual.startsWith(actualRoot + sep)) throw new Error('Source file is outside its selected directory');
  const info = await ordinary(file);
  if (info.size > maximum) throw new Error('Source file exceeds the selected byte limit');
  return readFile(file);
}
export function encodePacket(value) {
  const body = Buffer.from(JSON.stringify(value));
  if (body.length > 512 * 1024 * 1024) throw new Error('Complete customer project exceeds 512 MiB');
  return gzipSync(body);
}
export function decodePacket(body) {
  const decoded = gunzipSync(body, { maxOutputLength: 512 * 1024 * 1024 });
  const value = JSON.parse(decoded.toString('utf8'));
  if (value.schema !== 'tjl.economic-client-project.v1') throw new Error('Use a complete economic client project');
  return value;
}
