// MIT. Durable initialization custody for the original standalone handoff operator.
import { constants } from 'node:fs';
import { open, lstat, realpath, readdir, mkdir, link, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { acquireDeliveryLease, assertDeliveryLease, deliveryLeaseDescriptor } from '../../sf98-merchant-delivery/delivery-lock.mjs';

const SCHEMA = 'stellar-forge.recovery-host-setup.v1';
const LIMIT = 2 * 1024 * 1024;
const digest = raw => createHash('sha256').update(raw).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const fail = (code, message) => Object.assign(new Error(message), { code });
const need = (ok, code, message) => { if (!ok) throw fail(code, message || code); };
const pending = /^\.setup-part-[0-9a-f-]{36}$/;
const rootStage = /^\.setup-root-[0-9a-f-]{36}$/;
const nativeRootHelper=fileURLToPath(new URL('./host-handoff-setup-root.py',import.meta.url));
const controlNames = new Set(['.sf98-delivery.lock', 'intent.json', 'root.json', 'completion.json']);
const own = info => typeof process.getuid === 'function' && info.uid === process.getuid();
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

export function hostSetupControlDirectory(directory) {
  return join(dirname(directory), '.merchant-host-setup-' + digest(Buffer.from(directory)).slice(0,32));
}
export async function syncHostSetupDirectory(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function info(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function directory(path) {
  const value = await lstat(path);
  need(value.isDirectory() && !value.isSymbolicLink() && own(value) &&
    !(value.mode & 0o077) && await realpath(path) === path,
  'HOST_SETUP_PRIVATE_DIRECTORY', 'Preserve the original canonical private operator/setup directory: ' + path);
  return value;
}
async function optional(path, maximum = LIMIT, allowPublicationLinks = true) {
  let handle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  try {
    const before = await handle.stat({ bigint: true });
    if(before.nlink>1n && allowPublicationLinks) {
      const aliases=[];
      for(const name of await readdir(dirname(path)))if(pending.test(name)) {
        const item=await lstat(join(dirname(path),name),{bigint:true});
        if(item.dev===before.dev&&item.ino===before.ino)aliases.push(item);
      }
      need(before.nlink===BigInt(aliases.length+1)&&aliases.every(item=>item.isFile()&&item.uid===before.uid&&item.mode===before.mode),
        'HOST_SETUP_FOREIGN_LINK','Preserve a setup file linked outside its owned publication names.');
    }
    need(before.isFile() && (before.nlink === 1n || allowPublicationLinks) && before.uid === BigInt(process.getuid()) &&
      (before.mode & 0o077n) === 0n && before.size > 0n && before.size <= BigInt(maximum),
    'HOST_SETUP_PRIVATE_FILE', 'Preserve the unexpected original setup file: ' + path);
    const raw = Buffer.alloc(Number(before.size)+1); let offset = 0;
    while (offset < raw.length) {
      const result = await handle.read(raw, offset, raw.length-offset, offset);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    const after = await handle.stat({bigint:true}), named = await lstat(path,{bigint:true});
    need(offset === Number(before.size) && ['dev','ino','size','mtimeNs','ctimeNs','uid','mode','nlink']
      .every(key => before[key] === after[key] && after[key] === named[key]),
    'HOST_SETUP_FILE_CHANGED', 'The retained setup file changed while being read: ' + path);
    return raw.subarray(0,offset);
  } finally { await handle.close(); }
}
function parse(raw, path) {
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)); }
  catch { throw fail('HOST_SETUP_JSON', 'Preserve the invalid original setup JSON: '+path); }
}
async function immutable(path, raw, lease, controls) {
  await assertDeliveryLease(lease,controls);
  const prior=await optional(path);
  if(prior) {
    need(prior.equals(raw),'HOST_SETUP_RETAINED_CONFLICT','Preserve different retained setup bytes: '+path);
    return;
  }
  const temporary=join(dirname(path),'.setup-part-'+randomUUID());
  let handle;
  try {
    handle=await open(temporary,'wx',0o600); await handle.writeFile(raw); await handle.sync();
    await handle.close(); handle=null;
    await assertDeliveryLease(lease,controls);
    try { await link(temporary,path); }
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      const current=await optional(path);
      need(current?.equals(raw),'HOST_SETUP_RETAINED_CONFLICT','Preserve different retained setup bytes: '+path);
    }
    await syncHostSetupDirectory(dirname(path));
  } finally {
    await handle?.close();
    await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }
}
function boundIntent(raw, controls, directoryPath) {
  const value=parse(raw,join(controls,'intent.json'));
  need(value && value.schema===SCHEMA && value.directory===directoryPath &&
    value.controlDirectory===controls && typeof value.createdAt==='string' &&
    typeof value.connection==='string' && typeof value.connectionBase64==='string' &&
    typeof value.configurationBase64==='string' && typeof value.name==='string' &&
    Object.keys(value).sort().join(',') ===
      ['schema','directory','controlDirectory','createdAt','connection','connectionBase64',
       'connectionSha256','configurationBase64','configurationSha256','name'].sort().join(','),
  'HOST_SETUP_INTENT_INVALID','Preserve the original setup intent and its complete source binding.');
  for(const prefix of ['connection','configuration']) {
    const data=Buffer.from(value[prefix+'Base64'],'base64');
    need(data.length<=LIMIT && data.toString('base64')===value[prefix+'Base64'] &&
      digest(data)===value[prefix+'Sha256'],
    'HOST_SETUP_INTENT_INVALID','The retained complete '+prefix+' bytes no longer match their identity.');
  }
  return value;
}
async function controlInventory(controls) {
  await directory(controls);
  for(const name of await readdir(controls))
    need(controlNames.has(name)||pending.test(name)||rootStage.test(name),'HOST_SETUP_UNKNOWN_CONTROL',
      'Preserve the unrelated retained setup entry: '+join(controls,name));
}
async function rootBinding(directoryPath, controls, intent = null) {
  const raw=await optional(join(controls,'root.json'));
  if(!raw)return null;
  const value=parse(raw,join(controls,'root.json'));
  need(value?.schema===SCHEMA && value.directory===directoryPath &&
    typeof value.stage==='string' && dirname(value.stage)===controls &&
    rootStage.test(value.stage.slice(controls.length+1)) &&
    /^[0-9]+$/.test(value.device??'') && /^[0-9]+$/.test(value.inode??'') &&
    /^[a-f0-9]{64}$/.test(value.intentSha256??'') &&
    (!intent||value.intentSha256===digest(encode(intent))) &&
    Object.keys(value).sort().join(',')===['schema','directory','stage','device','inode','intentSha256'].sort().join(','),
    'HOST_SETUP_ROOT_BINDING_CHANGED','Preserve the original staged directory binding.');
  const current=await directory(await info(directoryPath)?directoryPath:value.stage);
  need(value.device===String(current.dev)&&value.inode===String(current.ino),
    'HOST_SETUP_ROOT_CHANGED','The original operator directory was replaced; preserve both editions.');
  return value;
}
async function publishRoot(value, controls, lease) {
  await assertDeliveryLease(lease,controls);
  const descriptor=await deliveryLeaseDescriptor(lease,controls);
  const request=Buffer.from(JSON.stringify({controls,root:value}));
  await new Promise((resolvePromise,reject)=>{
    let child,cause=null,length=0;const output=[];
    try {
      child=spawn('/usr/bin/python3',[nativeRootHelper,String(process.pid)],{
        shell:false,stdio:['pipe','pipe','pipe',descriptor],
        env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}
      });
    } catch(error){reject(error);return;}
    const timer=setTimeout(()=>{cause??=fail('HOST_SETUP_ROOT_PUBLICATION_TIMEOUT','The original root publication remains recoverable.');child.kill('SIGKILL');},30000);
    child.once('error',error=>{cause??=error;});
    child.stdin.on('error',error=>{cause??=error;child.kill('SIGKILL');});
    child.stdout.on('data',data=>{
      length+=data.length;
      if(length>65536){cause??=fail('HOST_SETUP_ROOT_PUBLICATION_RESPONSE');child.kill('SIGKILL');}
      else output.push(data);
    });
    child.stderr.on('data',()=>{});
    child.once('close',(code,signal)=>{
      clearTimeout(timer);
      if(cause){reject(cause);return;}
      let result;try{result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(output)));}
      catch{reject(fail('HOST_SETUP_ROOT_PUBLICATION_RESPONSE'));return;}
      if(code!==0||signal||result?.ok!==true){reject(fail(result?.code||'HOST_SETUP_ROOT_PUBLICATION_FAILED'));return;}
      resolvePromise();
    });
    child.stdin.end(request);
  });
  await assertDeliveryLease(lease,controls);
}
async function rootInventory(directoryPath) {
  await directory(directoryPath);
  for(const name of await readdir(directoryPath))
    need(['releases','customer-exports','merchant-mcp.json'].includes(name)||pending.test(name),
      'HOST_SETUP_UNKNOWN_OPERATOR_FILE','Preserve the existing operator entry: '+join(directoryPath,name));
}
async function completion(raw, intent, controls, directoryPath) {
  if(!raw)return null;
  const value=parse(raw,join(controls,'completion.json'));
  need(value?.schema===SCHEMA && value.directory===directoryPath &&
    value.intentSha256===digest(encode(intent)) && value.configurationSha256===intent.configurationSha256 &&
    value.result?.configuration===join(directoryPath,'merchant-mcp.json') &&
    value.result?.state==='INITIALIZED',
  'HOST_SETUP_COMPLETION_CHANGED','Preserve the complete original setup result.');
  return value;
}

/** Read recorded initialization without creating directories, locks or replacement state. */
export async function inspectHostSetup(directoryPath) {
  const controls=hostSetupControlDirectory(directoryPath), root=await info(directoryPath), control=await info(controls);
  if(root)await directory(directoryPath);
  if(!control)return {schema:SCHEMA,directory:directoryPath,controlDirectory:controls,
    status:root?'UNMANAGED_EXISTING_DIRECTORY':'NOT_STARTED',recordedOnly:true};
  await controlInventory(controls);
  const raw=await optional(join(controls,'intent.json'));
  if(!raw)return {schema:SCHEMA,directory:directoryPath,controlDirectory:controls,
    status:root?'UNBOUND_EXISTING_DIRECTORY':'BEFORE_INTENT',recordedOnly:true};
  const intent=boundIntent(raw,controls,directoryPath);
  const rootRecord=await rootBinding(directoryPath,controls,intent);
  const config=root?await optional(join(directoryPath,'merchant-mcp.json')):null;
  const finished=await completion(await optional(join(controls,'completion.json')),intent,controls,directoryPath);
  return {schema:SCHEMA,directory:directoryPath,controlDirectory:controls,
    status:finished?'COMPLETE':'INCOMPLETE',recordedOnly:true,
    intent:{path:join(controls,'intent.json'),bytes:raw.length,sha256:digest(raw),value:intent},
    rootPresent:Boolean(root),rootRecorded:Boolean(rootRecord),rootStage:rootRecord?.stage??null,
    configuration:config?{bytes:config.length,sha256:digest(config),matchesIntent:digest(config)===intent.configurationSha256}:null,
    result:finished?.result??null};
}

/**
 * Complete one exact initialization through original release/configuration APIs.
 * Input normalization and source/target custody run before this function.
 */
export async function completeHostSetup({
  directory:root,connection,name,connectionBytes,configurationBytes,operation,
  prepareRelease,validateRelease,validateComplete,result,
}) {
  need(['initialize','resume'].includes(operation),'HOST_SETUP_OPERATION');
  need(process.platform==='linux','HOST_SETUP_REQUIRES_LINUX','Original setup continuation requires Linux and the existing util-linux flock lease.');
  const controls=hostSetupControlDirectory(root);
  await realpath(dirname(root)).then(value=>need(value===dirname(root),'HOST_SETUP_CANONICAL_PARENT'));
  const priorControl=await info(controls), priorRoot=await info(root);
  if(operation==='initialize')need(!priorRoot,'HOST_SETUP_ALREADY_EXISTS',
    'Inspect the original setup, then explicitly resume its exact retained inputs; do not replace this directory.');
  if(operation==='resume')need(priorControl,'HOST_SETUP_NOT_STARTED','No retained original setup exists to resume.');
  if(!priorControl)await mkdir(controls,{mode:0o700});
  await controlInventory(controls);
  await syncHostSetupDirectory(controls);await syncHostSetupDirectory(dirname(controls));
  const lease=await acquireDeliveryLease(controls,{purpose:'drain'});
  try {
    const intentPath=join(controls,'intent.json'), raw=await optional(intentPath);
    let intent;
    if(raw) {
      intent=boundIntent(raw,controls,root);
      need(operation==='resume','HOST_SETUP_ALREADY_EXISTS','The exact original setup is retained; inspect then resume it.');
      need(intent.connection===connection&&intent.name===name&&
        intent.connectionSha256===digest(connectionBytes)&&
        intent.configurationSha256===digest(configurationBytes),
      'HOST_SETUP_INPUT_CHANGED','Use the original connection bytes, name and intended configuration; changed inputs remain untouched.');
    } else {
      need(!await info(root),'HOST_SETUP_UNBOUND_DIRECTORY','Preserve the existing operator directory without an original setup intent.');
      need(operation==='initialize','HOST_SETUP_INTENT_MISSING',
        'Initialization stopped before retaining its intent and created no operator state. Inspect, then initialize with the intended inputs.');
      intent={schema:SCHEMA,directory:root,controlDirectory:controls,createdAt:new Date().toISOString(),
        connection,name,connectionBase64:connectionBytes.toString('base64'),connectionSha256:digest(connectionBytes),
        configurationBase64:configurationBytes.toString('base64'),configurationSha256:digest(configurationBytes)};
      await immutable(intentPath,encode(intent),lease,controls);
    }
    const finished=await completion(await optional(join(controls,'completion.json')),intent,controls,root);
    if(finished) {
      need(await rootBinding(root,controls,intent),'HOST_SETUP_ROOT_BINDING_MISSING');
      const actual=await optional(join(root,'merchant-mcp.json'));
      need(actual?.equals(configurationBytes),'HOST_SETUP_CONFIGURATION_CHANGED','Preserve the changed original operator configuration.');
      await validateRelease();await validateComplete();
      return {...finished.result,reused:true,setup:{controlDirectory:controls,intentSha256:digest(encode(intent)),status:'COMPLETE'}};
    }
    await assertDeliveryLease(lease,controls);
    let rootRecord=await rootBinding(root,controls,intent);
    if(!rootRecord) {
      need(!await info(root),'HOST_SETUP_UNBOUND_DIRECTORY','Preserve the unrelated unbound destination directory.');
      // An interrupted pre-binding stage remains intact. Only the stage named
      // by complete root.json may ever become the original operator root.
      const stage=join(controls,'.setup-root-'+randomUUID());
      await mkdir(stage,{mode:0o700});
      const selected=await directory(stage);
      await syncHostSetupDirectory(stage);await syncHostSetupDirectory(controls);
      rootRecord={schema:SCHEMA,directory:root,stage,device:String(selected.dev),inode:String(selected.ino),
        intentSha256:digest(encode(intent))};
      await immutable(join(controls,'root.json'),encode(rootRecord),lease,controls);
    }
    if(!await info(root))await publishRoot(rootRecord,controls,lease);
    await rootBinding(root,controls,intent);await rootInventory(root);
    await syncHostSetupDirectory(root);await syncHostSetupDirectory(dirname(root));
    const configuration=join(root,'merchant-mcp.json'), previousConfiguration=await optional(configuration);
    need(!previousConfiguration||previousConfiguration.equals(configurationBytes),
      'HOST_SETUP_CONFIGURATION_CHANGED','Preserve the different original operator configuration.');
    const releaseStore=join(root,'releases');
    const hasRelease=Boolean(await info(releaseStore));
    if(hasRelease)await directory(releaseStore);
    await assertDeliveryLease(lease,controls);await prepareRelease(hasRelease);
    await rootBinding(root,controls,intent);
    const exportsDirectory=join(root,'customer-exports');
    if(!await info(exportsDirectory))await mkdir(exportsDirectory,{mode:0o700});
    await directory(exportsDirectory);
    need((await readdir(exportsDirectory)).length===0,'HOST_SETUP_EXPORTS_NOT_EMPTY',
      'Preserve customer exports; an incomplete initialization cannot own populated application state.');
    await immutable(configuration,configurationBytes,lease,controls);
    await rootInventory(root);await rootBinding(root,controls,intent);await validateComplete();
    await syncHostSetupDirectory(exportsDirectory);await syncHostSetupDirectory(root);
    await syncHostSetupDirectory(dirname(root));await assertDeliveryLease(lease,controls);
    const originalResult=await result();
    const saved={schema:SCHEMA,directory:root,intentSha256:digest(encode(intent)),
      configurationSha256:intent.configurationSha256,result:originalResult,completedAt:new Date().toISOString()};
    await immutable(join(controls,'completion.json'),encode(saved),lease,controls);
    return {...originalResult,reused:false,setup:{controlDirectory:controls,intentSha256:digest(encode(intent)),status:'COMPLETE'}};
  } finally { await lease.release(); }
}

export async function readHostSetupConnection(filename) {
  const raw=await optional(filename,1024*1024,false);
  need(raw,'HOST_SETUP_CONNECTION_MISSING','Retain the complete original private connection file.');
  return raw;
}
