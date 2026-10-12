// MIT. Streamed, manifest-bound transfer of the complete closed MySQL product.
import { constants } from 'node:fs';
import { open, mkdir, readdir, lstat, rename, unlink, chmod, utimes, rm } from 'node:fs/promises';
import { join, dirname, resolve, relative, posix } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { paths, readMysqlProduct, privateDirectory, absolute, readJson, readPrivate, once,
  bytes, digest, createFile, atomicJson, syncDirectory, need, fault, stamp, exists,
  UUID, SHA, acquireDatasetLease } from './setup.mjs';

export const ARCHIVE_SCHEMA = 'stellar-forge.mysql-product-archive.v1';
const MANIFEST = 'MYSQL_WORKSPACE.json', BLOCK = 512;
const MAX_FILES = 20000, MAX_MANIFEST = 16 * 1024 * 1024;
const MAX_TOTAL = 32 * 1024 * 1024 * 1024, MAX_FILE = 8 * 1024 * 1024 * 1024 - 1;
const safePath = value => typeof value === 'string' && value.length > 0 && value.length <= 240 &&
  !value.startsWith('/') && !value.includes('\\') && !/[\x00-\x1f\x7f]/.test(value) &&
  value.split('/').every(part => part && part !== '.' && part !== '..') && posix.normalize(value) === value;
const excluded = path => path === 'connection.json' || path === 'writer.lease' ||
  path === 'receiving' || path.startsWith('receiving/') ||
  path === 'operator/customer-exports' || path.startsWith('operator/customer-exports/') ||
  path.startsWith('workspace/locks/') ||
  /(^|\/)(writer\.lease|publisher\.lock)$/.test(path) ||
  /(^|\/)\.pending-/.test(path);
async function privateHandle(path, privateFile = true) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    need(info.isFile() && (!privateFile || !(info.mode & 0o077)), 'MYSQL_ARCHIVE_PRIVATE_FILE_REQUIRED');
    return { handle, info };
  } catch (error) { await handle.close(); throw error; }
}
function unchanged(before, after, count) {
  need(count === before.size && after.size === before.size && after.mtimeMs === before.mtimeMs &&
    after.ctimeMs === before.ctimeMs && after.dev === before.dev && after.ino === before.ino,
    'MYSQL_ARCHIVE_SOURCE_CHANGED', 'A selected private file changed while the complete workspace was being copied.');
}
async function fileHash(path, maximum = MAX_FILE, privateFile = false) {
  const { handle, info } = await privateHandle(path, privateFile);
  try {
    need(info.size <= maximum, 'MYSQL_ARCHIVE_FILE_TOO_LARGE');
    const hash = createHash('sha256'); let count = 0;
    for await (const piece of handle.createReadStream({ autoClose: false })) {
      count += piece.length; need(count <= maximum, 'MYSQL_ARCHIVE_FILE_TOO_LARGE'); hash.update(piece);
    }
    unchanged(info, await handle.stat(), count);
    return { bytes: count, sha256: hash.digest('hex'), mode: info.mode & 0o777, mtimeMs: info.mtimeMs };
  } finally { await handle.close(); }
}
async function inventory(root) {
  const files = [], directories = []; let total = 0;
  async function walk(path = '') {
    for (const name of (await readdir(join(root, path))).sort()) {
      const member = path ? path + '/' + name : name;
      if (excluded(member)) continue;
      need(safePath(member) && member !== MANIFEST, 'MYSQL_ARCHIVE_MEMBER_INVALID');
      const target = join(root, member), info = await lstat(target);
      need(!info.isSymbolicLink(), 'MYSQL_ARCHIVE_LINK_NOT_ALLOWED', 'Keep product files in their owned real directories.');
      if (info.isDirectory()) {
        need(directories.length + files.length < MAX_FILES, 'MYSQL_ARCHIVE_LIMIT');
        directories.push({path:member,mode:info.mode & 0o777,mtimeMs:info.mtimeMs});
        await walk(member);
      }
      else {
        need(info.isFile(), 'MYSQL_ARCHIVE_SPECIAL_FILE_NOT_ALLOWED');
        const record = await fileHash(target); total += record.bytes;
        need(files.length + directories.length < MAX_FILES && total <= MAX_TOTAL, 'MYSQL_ARCHIVE_LIMIT');
        files.push({ path: member, ...record });
      }
    }
  }
  await walk();
  return { files, directories, totalBytes: total };
}
function field(header, offset, length, text) {
  const value = Buffer.from(text);
  need(value.length < length, 'MYSQL_ARCHIVE_HEADER_LIMIT');
  value.copy(header, offset);
}
function numberField(header, offset, length, value) {
  need(Number.isSafeInteger(value) && value >= 0, 'MYSQL_ARCHIVE_HEADER_NUMBER');
  const text = value.toString(8).padStart(length - 1, '0');
  need(text.length === length - 1, 'MYSQL_ARCHIVE_HEADER_NUMBER');
  header.write(text + '\0', offset, length, 'ascii');
}
function header(path, size, mode, mtime) {
  const value = Buffer.alloc(BLOCK), encoded = Buffer.byteLength(path);
  if (encoded <= 99) field(value, 0, 100, path);
  else {
    let point = path.lastIndexOf('/');
    while (point > 0 && (Buffer.byteLength(path.slice(0, point)) > 154 || Buffer.byteLength(path.slice(point + 1)) > 99))
      point = path.lastIndexOf('/', point - 1);
    need(point > 0, 'MYSQL_ARCHIVE_PATH_TOO_LONG');
    field(value, 0, 100, path.slice(point + 1)); field(value, 345, 155, path.slice(0, point));
  }
  numberField(value, 100, 8, mode); numberField(value,108,8,0); numberField(value,116,8,0);
  numberField(value,124,12,size); numberField(value,136,12,Math.max(0,Math.floor(mtime / 1000)));
  value.fill(32,148,156); value[156] = 48; value.write('ustar\0',257,6,'ascii'); value.write('00',263,2,'ascii');
  const checksum = value.reduce((sum, part) => sum + part, 0);
  value.write(checksum.toString(8).padStart(6,'0') + '\0 ',148,8,'ascii');
  return value;
}
const padding = size => (BLOCK - size % BLOCK) % BLOCK;
async function* tar(root, manifest) {
  const declared = bytes(manifest); need(declared.length <= MAX_MANIFEST, 'MYSQL_ARCHIVE_MANIFEST_LIMIT');
  yield header(MANIFEST,declared.length,0o600,Date.parse(manifest.createdAt)); yield declared;
  if (padding(declared.length)) yield Buffer.alloc(padding(declared.length));
  for (const member of manifest.files) {
    yield header(member.path,member.bytes,member.mode,member.mtimeMs);
    const { handle, info } = await privateHandle(join(root,member.path), false);
    try {
      need(info.size === member.bytes && (info.mode & 0o777) === member.mode, 'MYSQL_ARCHIVE_SOURCE_CHANGED');
      const hash = createHash('sha256'); let count = 0;
      for await (const chunk of handle.createReadStream({ autoClose:false })) {
        count += chunk.length; need(count <= member.bytes,'MYSQL_ARCHIVE_SOURCE_CHANGED'); hash.update(chunk); yield chunk;
      }
      unchanged(info,await handle.stat(),count);
      need(hash.digest('hex') === member.sha256,'MYSQL_ARCHIVE_SOURCE_CHANGED');
    } finally { await handle.close(); }
    if (padding(member.bytes)) yield Buffer.alloc(padding(member.bytes));
  }
  yield Buffer.alloc(BLOCK * 2);
}
function manifestValue(value) {
  need(value && value.schema === ARCHIVE_SCHEMA && value.format === 'ustar+gzip' &&
    UUID.test(value.productId) && UUID.test(value.transferId) && SHA.test(value.sourceSha256) &&
    Array.isArray(value.files) && value.files.length >= 1 && Array.isArray(value.directories) &&
    value.files.length + value.directories.length <= MAX_FILES,
    'MYSQL_ARCHIVE_MANIFEST_INVALID');
  const seen = new Set(), directories = new Set(); let total = 0;
  for (const item of value.directories) {
    need(item && safePath(item.path) && item.path !== MANIFEST && !excluded(item.path) &&
      !directories.has(item.path) && Number.isInteger(item.mode) && item.mode >= 0 && !(item.mode & ~0o777) &&
      Number.isFinite(item.mtimeMs) && item.mtimeMs >= 0, 'MYSQL_ARCHIVE_DIRECTORY_INVALID');
    directories.add(item.path);
  }
  for (const file of value.files) {
    need(file && safePath(file.path) && file.path !== MANIFEST && !excluded(file.path) && !seen.has(file.path) &&
      SHA.test(file.sha256) && Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= MAX_FILE &&
      Number.isInteger(file.mode) && file.mode >= 0 && !(file.mode & ~0o777) &&
      Number.isFinite(file.mtimeMs) && file.mtimeMs >= 0, 'MYSQL_ARCHIVE_MANIFEST_INVALID');
    for (let parent = posix.dirname(file.path); parent !== '.'; parent = posix.dirname(parent))
      need(!seen.has(parent),'MYSQL_ARCHIVE_PATH_CONFLICT');
    seen.add(file.path); total += file.bytes; need(total <= MAX_TOTAL,'MYSQL_ARCHIVE_LIMIT');
  }
  for (const path of seen) for (let parent = posix.dirname(path); parent !== '.'; parent = posix.dirname(parent))
    need(!seen.has(parent), 'MYSQL_ARCHIVE_PATH_CONFLICT');
  for (const path of [...seen,...directories]) {
    need(!(seen.has(path) && directories.has(path)), 'MYSQL_ARCHIVE_PATH_CONFLICT');
    for (let parent = posix.dirname(path); parent !== '.'; parent = posix.dirname(parent))
      need(directories.has(parent) && !seen.has(parent), 'MYSQL_ARCHIVE_DIRECTORY_MISSING');
  }
  need(total === value.totalBytes && seen.has('product.json') && seen.has('source/source.json') &&
    seen.has('operator/merchant-mcp.json') && seen.has('mysql-connections.json'), 'MYSQL_ARCHIVE_MANIFEST_INVALID');
  return value;
}
class Reader {
  constructor(stream) { this.stream = stream; this.iterator = stream[Symbol.asyncIterator](); this.buffer = Buffer.alloc(0); this.done = false; }
  async take(length, consume = null) {
    const chunks = consume ? null : []; let left = length;
    while (left) {
      if (!this.buffer.length) {
        const next = await this.iterator.next();
        if (next.done) throw fault('MYSQL_ARCHIVE_TRUNCATED');
        this.buffer = Buffer.from(next.value);
      }
      const count = Math.min(left,this.buffer.length), part = this.buffer.subarray(0,count);
      this.buffer = this.buffer.subarray(count); left -= count;
      if (consume) await consume(part); else chunks.push(part);
    }
    return chunks ? Buffer.concat(chunks,length) : null;
  }
  async end() {
    need(!this.buffer.length,'MYSQL_ARCHIVE_TRAILING_DATA');
    const next = await this.iterator.next(); need(next.done,'MYSQL_ARCHIVE_TRAILING_DATA');
  }
}
function parseHeader(raw) {
  const text = (offset,length) => {
    const data = raw.subarray(offset,offset+length), end = data.indexOf(0);
    return new TextDecoder('utf-8',{fatal:true}).decode(end < 0 ? data : data.subarray(0,end));
  };
  const octal = (offset,length) => {
    const value = text(offset,length).trim();
    need(/^[0-7]+$/.test(value),'MYSQL_ARCHIVE_HEADER_INVALID');
    const parsed = parseInt(value,8); need(Number.isSafeInteger(parsed),'MYSQL_ARCHIVE_HEADER_INVALID'); return parsed;
  };
  const checksum = octal(148,8), clone = Buffer.from(raw); clone.fill(32,148,156);
  need(checksum === clone.reduce((sum,value)=>sum+value,0) && text(257,6) === 'ustar' &&
    [0,48].includes(raw[156]) && !text(157,100),'MYSQL_ARCHIVE_HEADER_INVALID');
  const prefix = text(345,155), path = (prefix ? prefix + '/' : '') + text(0,100);
  need(safePath(path),'MYSQL_ARCHIVE_MEMBER_INVALID');
  return { path,bytes:octal(124,12),mode:octal(100,8) };
}
/** One parser validates the complete archive for inspection and receiving. */
async function readArchive(path, destination = null) {
  const { handle,info } = await privateHandle(absolute(resolve(path)));
  const compressedHash = createHash('sha256'); let compressedBytes = 0;
  const meter = new Transform({ transform(chunk,encoding,callback) {
    compressedBytes += chunk.length; compressedHash.update(chunk); callback(null,chunk);
  } });
  const source = handle.createReadStream({autoClose:false}), gunzip = createGunzip();
  const piping = pipeline(source,meter,gunzip); piping.catch(()=>{});
  const reader = new Reader(gunzip);
  try {
    const first = parseHeader(await reader.take(BLOCK));
    need(first.path === MANIFEST && first.bytes <= MAX_MANIFEST && first.bytes > 0,'MYSQL_ARCHIVE_MANIFEST_REQUIRED');
    const manifest = manifestValue(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await reader.take(first.bytes))));
    if (padding(first.bytes)) need((await reader.take(padding(first.bytes))).every(byte=>byte===0),'MYSQL_ARCHIVE_PADDING_INVALID');
    if (destination) for (const item of [...manifest.directories].sort((a,b)=>a.path.split('/').length-b.path.split('/').length||a.path.localeCompare(b.path)))
      await mkdir(join(destination,item.path),{mode:0o700});
    for (const declared of manifest.files) {
      const current = parseHeader(await reader.take(BLOCK));
      need(current.path === declared.path && current.bytes === declared.bytes && current.mode === declared.mode,
        'MYSQL_ARCHIVE_MEMBER_MISMATCH');
      let file; const hash=createHash('sha256');
      const target = destination ? join(destination,declared.path) : null;
      try {
        if (target) {
          await mkdir(dirname(target),{recursive:true,mode:0o700});
          file=await open(target,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
        }
        await reader.take(declared.bytes,async chunk=>{ hash.update(chunk); if(file) await file.writeFile(chunk); });
        need(hash.digest('hex')===declared.sha256,'MYSQL_ARCHIVE_MEMBER_HASH_CHANGED');
        if(file) { await file.sync(); await file.close(); file=null; await chmod(target,declared.mode); await utimes(target,new Date(declared.mtimeMs),new Date(declared.mtimeMs)); }
      } finally { await file?.close(); }
      if(padding(declared.bytes)) need((await reader.take(padding(declared.bytes))).every(byte=>byte===0),'MYSQL_ARCHIVE_PADDING_INVALID');
    }
    need((await reader.take(BLOCK*2)).every(byte=>byte===0),'MYSQL_ARCHIVE_END_INVALID');
    await reader.end(); await piping; unchanged(info,await handle.stat(),compressedBytes);
    if (destination) for (const item of [...manifest.directories].sort((a,b)=>b.path.split('/').length-a.path.split('/').length)) {
      const target=join(destination,item.path);await chmod(target,item.mode);
      await utimes(target,new Date(item.mtimeMs),new Date(item.mtimeMs));
    }
    return {manifest,bytes:compressedBytes,sha256:compressedHash.digest('hex')};
  } finally {
    source.destroy(); meter.destroy(); gunzip.destroy(); await piping.catch(()=>{}); await handle.close();
  }
}
export async function inspectMysqlArchive(path) {
  const value = await readArchive(path);
  return {schema:ARCHIVE_SCHEMA,path:absolute(resolve(path)),...value};
}
/** The caller closes the native MySQL model/publishers before sharing its held lease. */
export async function createMysqlArchive(directory,{transferId= randomUUID(),lease:borrowedLease=null}={}) {
  need(UUID.test(transferId),'MYSQL_TRANSFER_ID_INVALID');
  const selected=await readMysqlProduct(directory),p=selected.paths;
  const lease=borrowedLease??acquireDatasetLease(p.directory);
  try {
    lease.assertHeld(); await privateDirectory(p.receivingDirectory,true);
    const recordPath=join(p.receivingDirectory,transferId+'.json'),path=join(p.receivingDirectory,transferId+'.tar.gz');
    if(await exists(recordPath)) {
      const recorded=await readJson(recordPath,65536);
      need(recorded.productId===selected.profile.productId && recorded.transferId===transferId,'MYSQL_TRANSFER_ID_CONFLICT');
      const current=await fileHash(path,MAX_TOTAL+MAX_MANIFEST);
      need(current.sha256===recorded.sha256 && current.bytes===recorded.bytes,'MYSQL_TRANSFER_FILE_CHANGED');
      return {...recorded,path,replayed:true};
    }
    let accepted;
    if(await exists(path)) {
      accepted=await readArchive(path);
      need(accepted.manifest.transferId===transferId && accepted.manifest.productId===selected.profile.productId,
        'MYSQL_TRANSFER_ID_CONFLICT');
    } else {
      const captured=await inventory(p.directory);
      const manifest={schema:ARCHIVE_SCHEMA,format:'ustar+gzip',transferId,productId:selected.profile.productId,
        name:selected.profile.name,createdAt:stamp(),sourceSha256:selected.profile.sourceSha256,
        excluded:['ephemeral listener capabilities','process lock files','previous generated receiving archives','merchant customer-export copies'],
        ...captured};
      const temporary=join(p.receivingDirectory,'.archive-'+transferId+'-'+randomUUID());
      const handle=await open(temporary,'wx',0o600),hash=createHash('sha256');let count=0,committed=false;
      const meter=new Transform({transform(chunk,encoding,callback){count+=chunk.length;hash.update(chunk);callback(null,chunk);}});
      try {
        await pipeline(Readable.from(tar(p.directory,manifest)),createGzip({level:6}),meter,
          new Writable({write(chunk,encoding,callback){handle.writeFile(chunk).then(()=>callback(),callback);}}));
        await handle.sync(); await handle.close(); lease.assertHeld();
        need(!await exists(path),'MYSQL_TRANSFER_ID_CONFLICT');
        await rename(temporary,path);committed=true;await syncDirectory(p.receivingDirectory);
        accepted={manifest,bytes:count,sha256:hash.digest('hex')};
      } finally {await handle.close().catch(()=>{});if(!committed)await unlink(temporary).catch(()=>{});}
    }
    const result={schema:'stellar-forge.mysql-product-transfer.v1',transferId,productId:selected.profile.productId,
      createdAt:accepted.manifest.createdAt,filename:transferId+'.tar.gz',bytes:accepted.bytes,sha256:accepted.sha256,
      members:accepted.manifest.files.length,directories:accepted.manifest.directories.length,totalBytes:accepted.manifest.totalBytes,sourceSha256:accepted.manifest.sourceSha256};
    await once(recordPath,result); return {...result,path,replayed:false};
  } finally {if(!borrowedLease)await lease.close();}
}
export async function restoreMysqlArchive({archive,directory,expectedSha256,expectedProductId}={}) {
  directory=absolute(resolve(directory));archive=absolute(resolve(archive));
  need(SHA.test(expectedSha256)&&UUID.test(expectedProductId),'MYSQL_RECEIVING_SELECTION_REQUIRED',
    'Inspect the complete archive, then select its exact SHA-256 and original product ID.');
  await privateDirectory(dirname(directory));
  const locks=join(dirname(directory),'.mysql-product-receiving');
  await privateDirectory(locks,true);const lease=acquireDatasetLease(locks);
  let stage,committed=false;
  try {
    if(await exists(directory)) {
      const receipt=await readJson(join(directory,'MYSQL_RECEIVED.json'),65536);
      need(receipt.archiveSha256===expectedSha256&&receipt.productId===expectedProductId,'MYSQL_RECEIVING_DESTINATION_EXISTS');
      const product=await readMysqlProduct(directory);
      need(product.profile.productId===expectedProductId,'MYSQL_RECEIVING_PRODUCT_CHANGED');
      return {...receipt,directory,replayed:true};
    }
    stage=join(dirname(directory),'.mysql-receive-'+randomUUID());await mkdir(stage,{mode:0o700});
    const result=await readArchive(archive,stage);
    need(result.sha256===expectedSha256&&result.manifest.productId===expectedProductId,'MYSQL_RECEIVING_SELECTION_CHANGED');
    const product=await readMysqlProduct(stage);
    need(product.profile.productId===expectedProductId&&product.profile.sourceSha256===result.manifest.sourceSha256,
      'MYSQL_RECEIVING_PRODUCT_CHANGED');
    // These runtime output directories contain no portable operational state.
    await privateDirectory(join(stage,'receiving'),true);
    await privateDirectory(join(stage,'operator','customer-exports'),true);
    const receipt={schema:'stellar-forge.mysql-product-received.v1',productId:expectedProductId,
      archiveSha256:result.sha256,archiveBytes:result.bytes,transferId:result.manifest.transferId,
      receivedAt:stamp(),members:result.manifest.files.length,directories:result.manifest.directories.length,totalBytes:result.manifest.totalBytes,
      sourceSha256:result.manifest.sourceSha256,mode:'ORIGINAL_NATIVE_WORKSPACE'};
    const receiptPath=join(stage,'MYSQL_RECEIVED.json');
    if(await exists(receiptPath)) {
      const previous=await readPrivate(receiptPath,65536),old=JSON.parse(previous);
      need(old.schema==='stellar-forge.mysql-product-received.v1'&&SHA.test(old.archiveSha256),'MYSQL_RECEIVING_LINEAGE_INVALID');
      await privateDirectory(join(stage,'receiving-lineage'),true);
      await once(join(stage,'receiving-lineage',old.archiveSha256+'.json'),previous);
      await atomicJson(stage,'MYSQL_RECEIVED.json',receipt);
    } else await once(receiptPath,receipt);
    await syncDirectory(stage);lease.assertHeld();
    need(!await exists(directory),'MYSQL_RECEIVING_DESTINATION_EXISTS');
    await rename(stage,directory);committed=true;await syncDirectory(dirname(directory));
    return {...receipt,directory,replayed:false};
  } finally {if(stage&&!committed)await rm(stage,{recursive:true,force:true});await lease.close();}
}
