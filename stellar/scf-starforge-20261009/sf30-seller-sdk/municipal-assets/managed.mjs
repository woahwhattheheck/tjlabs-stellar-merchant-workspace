// MIT. Complete source and native process boundary for municipal asset operations.
import { constants } from 'node:fs';
import { open, lstat, realpath } from 'node:fs/promises';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

export const SOURCE = 'stellar/scf-starforge-20261009/sf30-seller-sdk/municipal-assets';
export const ROOT = dirname(fileURLToPath(import.meta.url));
export const STARTUP = 'stellar-forge.municipal-asset-startup.v1';
export const HASH = /^[a-f0-9]{64}$/;
export function need(value, message) { if (!value) throw new Error(message); }
export const sha = body => createHash('sha256').update(body).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
const same = (left,right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
export function absolute(value) {
  need(typeof value === 'string' && isAbsolute(value) && resolve(value) === value && !value.includes('\0'),
    'Select an absolute original path.');
  return value;
}
export async function regular(path, { maximum = 4 * 1024 * 1024, privateOnly = false } = {}) {
  absolute(path);
  need(await realpath(dirname(path)) === dirname(path), 'Preserve the original regular parent: ' + path);
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat();
    need(before.isFile() && before.nlink === 1 && before.size <= maximum,
      'Select a complete regular file: ' + path);
    if (privateOnly && process.platform !== 'win32')
      need((before.mode & 0o077) === 0, 'Keep the selected credential file private.');
    const bytes = await handle.readFile(), after = await handle.stat();
    need(bytes.length === before.size && after.dev === before.dev && after.ino === before.ino &&
      after.size === before.size && after.mtimeMs === before.mtimeMs,
      'The selected file changed during reading: ' + path);
    return bytes;
  } finally { await handle.close(); }
}
export async function inspectSource(root = ROOT, expected = null) {
  absolute(root);
  const manifestPath = join(root, 'SOURCE_ADOPTION.json');
  const body = await regular(manifestPath), digest = sha(body);
  need(expected === null || digest === expected, 'The reviewed municipal source changed.');
  let value;
  try { value = JSON.parse(body.toString('utf8')); } catch { throw new Error('Open the complete source manifest.'); }
  need(value.schema === 'stellar-forge.municipal-asset-source.v1' && Array.isArray(value.files),
    'Select the complete municipal source edition.');
  const names = new Set(), files = [];
  for (const row of value.files) {
    need(typeof row.path === 'string' && !row.path.startsWith('/') && !row.path.includes('\\') &&
      row.path.split('/').every(part => part && part !== '.' && part !== '..') &&
      !names.has(row.path) && Number.isSafeInteger(row.bytes) && row.bytes >= 0 && HASH.test(row.sha256),
      'The selected source manifest has an invalid member.');
    names.add(row.path);
    const path = join(root, row.path), content = await regular(path);
    need(content.length === row.bytes && sha(content) === row.sha256, 'Municipal source changed: ' + row.path);
    files.push({ ...row, absolutePath: path });
  }
  need(['native/managed.py', 'native/workspace/engine.py', 'native/workspace/server.py',
    'native/workspace/maximo_target.py', 'native/acceptance/verify.py', 'cli.mjs', 'managed.mjs',
    'application-provider.mjs'].every(name => names.has(name)), 'Select the full original application.');
  return { root, sha256: digest, manifestPath, files };
}
export async function inspectWorkspace(python, directory, { root = ROOT, sourceSha256 = null } = {}) {
  absolute(python); absolute(directory);
  const source = await inspectSource(root, sourceSha256);
  const child = spawn(python, ['-I', '-B', join(root, 'native/managed.py'), 'inspect', directory], {
    cwd: root, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    shell: false, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chunks = []; let bytes = 0, errors = '', overflow = false;
  child.stdout.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > 2 * 1024 * 1024) { overflow = true; child.kill('SIGTERM'); }
    else chunks.push(chunk);
  });
  child.stderr.on('data', chunk => { if (errors.length < 4096) errors += chunk.toString('utf8'); });
  const timer = setTimeout(() => child.kill('SIGTERM'), 30000);
  let result;
  try {
    result = await new Promise((accept, reject) => {
      child.once('error', reject); child.once('close', (code, signal) => accept({ code, signal }));
    });
  } finally { clearTimeout(timer); }
  need(result.code === 0 && !overflow, 'Open or adopt the original municipal workspace. ' + errors.slice(0,1600));
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('The original workspace returned an unreadable inspection.'); }
  need(value.schema === 'stellar-forge.municipal-asset-inspection.v1' &&
    value.binding?.schema === 'stellar-forge.municipal-asset-identity.v1' &&
    value.binding.directory === directory && value.binding.database?.path === join(directory, 'workspace.sqlite3') &&
    /^[a-f0-9]{32}$/.test(value.binding.workspace?.id ?? '') &&
    value.passwordFile === join(directory, 'operator-password.txt') &&
    HASH.test(value.bindingSha256 ?? '') && value.sourceSha256 === source.sha256 &&
    Array.isArray(value.projects), 'The selected original workspace identity differs.');
  return { ...value, source };
}
export function selected(request) {
  need(request.command === 'municipal-assets' && Array.isArray(request.args),
    'Select the original municipal asset command.');
  const args = [...request.args];
  need(args.shift() === '--python', 'Retain the selected Python executable.');
  const python = absolute(args.shift());
  need(args.shift() === 'managed', 'Open the managed original application.');
  const options = {}, allowed = ['--workspace', '--binding-sha256', '--source-sha256', '--port'];
  need(args.length === allowed.length * 2, 'Keep the complete reviewed launch arguments.');
  for (let i = 0; i < args.length; i += 2) {
    need(allowed.includes(args[i]) && !Object.hasOwn(options,args[i]) && typeof args[i+1] === 'string',
      'Keep one value for each reviewed launch argument.');
    options[args[i]] = args[i+1];
  }
  need(HASH.test(options['--binding-sha256']) && HASH.test(options['--source-sha256']) &&
    /^(0|[1-9]\d*)$/.test(options['--port']) && Number(options['--port']) <= 65535,
    'The reviewed launch binding differs.');
  return { python, directory: absolute(options['--workspace']), bindingSha256: options['--binding-sha256'],
    sourceSha256: options['--source-sha256'], port: Number(options['--port']) };
}
async function jsonResponse(response, maximum = 65536) {
  need(response.status === 200 && /^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? ''),
    'The original listener did not return its authenticated state.');
  const chunks = []; let count = 0;
  for await (const chunk of response.body) {
    count += chunk.length; need(count <= maximum, 'The live identity response is oversized.'); chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function observeStartup(request, text) {
  if (typeof text !== 'string') return null;
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  if (value.schema !== STARTUP || value.status !== 'MUNICIPAL_ASSET_READY') return null;
  const selection = selected(request);
  const root = join(absolute(request.releaseDirectory), 'source', SOURCE);
  need(value.sourceRoot === root && value.bindingSha256 === selection.bindingSha256 &&
    value.sourceSha256 === selection.sourceSha256 && value.requestedPort === selection.port &&
    typeof value.instanceId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.instanceId) &&
    Number.isSafeInteger(value.pid) && value.pid > 0, 'The native launch differs from the reviewed selection.');
  const inspected = await inspectWorkspace(selection.python, selection.directory,
    { root, sourceSha256: selection.sourceSha256 });
  need(inspected.bindingSha256 === selection.bindingSha256 &&
    same(value.binding,inspected.binding) &&
    value.passwordFile === inspected.passwordFile, 'The original saved database identity changed.');
  let url;
  try { url = new URL(value.url); } catch { throw new Error('The native application URL is invalid.'); }
  need(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.pathname === '/' &&
    !url.username && !url.password && !url.search && !url.hash &&
    Number(url.port) === value.port && value.port >= 1 && value.port <= 65535 &&
    (!selection.port || value.port === selection.port), 'Open the original private listener.');
  const password = (await regular(inspected.passwordFile, { maximum: 4096, privateOnly: true })).toString('utf8').trim();
  const headers = { Origin: url.origin, 'Content-Type': 'application/json' };
  let cookie = null, csrf = null;
  try {
    const response = await fetch(new URL('/api/login',url), {
      method:'POST', headers, body:JSON.stringify({ actor:'Managed application startup',password }),
      redirect:'error', signal:AbortSignal.timeout(5000),
    });
    const session = await jsonResponse(response);
    cookie = response.headers.get('set-cookie')?.split(';',1)[0];
    need(typeof cookie === 'string' && cookie.startsWith('mcpherson_workspace=') &&
      typeof session.csrf === 'string', 'The original application did not authenticate its listener.');
    csrf = session.csrf;
    const live = await jsonResponse(await fetch(new URL('/api/managed-instance',url), {
      headers:{ Origin:url.origin, Cookie:cookie }, redirect:'error', signal:AbortSignal.timeout(5000),
    }));
    need(same(live,value), 'The live listener is a different native instance.');
  } finally {
    if (cookie && csrf) await fetch(new URL('/api/logout',url), {
      method:'POST', headers:{ ...headers, Cookie:cookie, 'X-Workspace-CSRF':csrf },
      body:'{}', redirect:'error', signal:AbortSignal.timeout(5000),
    }).then(async response => { await response.arrayBuffer(); }).catch(() => {});
  }
  return { url:url.href, original:{ ...value } };
}
export async function runNative(python, args, { root = ROOT, stdin = 'inherit' } = {}) {
  absolute(python);
  await inspectSource(root);
  const child = spawn(python, ['-I','-B',join(root,'native/managed.py'),...args], {
    cwd:root, env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}, shell:false,
    stdio:[stdin,'inherit','inherit'],
  });
  const interrupt = () => child.kill('SIGINT'), terminate = () => child.kill('SIGTERM');
  process.on('SIGINT',interrupt); process.on('SIGTERM',terminate);
  try {
    return await new Promise((accept,reject) => {
      child.once('error',reject); child.once('close',(code,signal) => accept({code,signal}));
    });
  } finally { process.off('SIGINT',interrupt); process.off('SIGTERM',terminate); }
}

/** Return only original endpoint/identity and credential custody, never the secret. */
export async function readConnection(request, startup) {
  need(startup && startup.schema===STARTUP,'Select the original retained managed instance.');
  const observed=await observeStartup(request,JSON.stringify(startup));
  need(observed && observed.original.instanceId===startup.instanceId,'The original listener changed.');
  return {
    schema:'stellar-forge.municipal-asset-connection.v1',
    url:observed.url,
    passwordFile:startup.passwordFile,
    binding:startup.binding,
    bindingSha256:startup.bindingSha256,
    sourceSha256:startup.sourceSha256,
    instanceId:startup.instanceId,
    pid:startup.pid,
  };
}
