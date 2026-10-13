// MIT. Private atomic incident state; original Linux kernel lease owns writes.
import {constants} from 'node:fs';
import {open,mkdir,lstat,readdir,rename,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {acquireStateLease} from '../merchant-fleet-gateway/state-lease.mjs';
import {compileConfig,configHash,hash,activeIncident,kinds} from './incident-config.mjs';
import {freshMerchant,pruneRecords} from './incident-model.mjs';
import {checkPayload} from './notifications.mjs';
import {slackTimestamp,validSlackReceipt,validSlackRequest} from './notifications-slack.mjs';
import {OBJECT_FILES,readObjectObservationFiles} from './object-observation.mjs';
import {CKAN_FILES,CKAN_FILE_LIMIT,readCkanObservationFiles} from './ckan-observation.mjs';
import {OAUTH_FILES,readOAuthObservationFiles} from './oauth-observation.mjs';
import {X402_FILES,X402_FILE_LIMIT,readX402ObservationFiles} from './x402-observation.mjs';
import {validateRecoveryState,recoveryView} from './incident-recovery-model.mjs';
import {createSnapshotPins} from './incident-snapshot-pins.mjs';

export const STATE_SCHEMA='stellar-forge.seller-incidents.v1';
const CAPTURE_SCHEMA='stellar-forge.seller-incident-capture.v1';
const MAX_STATE=16_777_216,MAX_CAPTURE=36*1024*1024,LEGACY_CAPTURE_LIMIT=12_000_000;
const PACKET_FILES=['bundle.json','operator-brief.md','metrics.prom','manifest.json'];
const UUID=/^[a-f0-9-]{36}$/;
const CAPTURE=/^capture-([a-f0-9]{64})\.json$/;
const decoder=new TextDecoder('utf-8',{fatal:true});
const fail=code=>{throw new Error('SF93_'+code);};
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const privateStat=stat=>stat.isFile()&&!(stat.mode&0o077)&&stat.uid===process.getuid();

async function privateDirectory(path,create=false) {
  if(create)await mkdir(path,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  const stat=await lstat(path);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)||stat.uid!==process.getuid())fail('PRIVATE_DIRECTORY_REQUIRED');
}
export async function readPrivateFile(path,limit) {
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const stat=await file.stat();
    if(!privateStat(stat)||stat.size>limit)fail('PRIVATE_BOUNDED_FILE_REQUIRED');
    const chunks=[];let size=0;
    for(;;) {
      const buffer=Buffer.alloc(Math.min(65_536,limit+1-size));
      const {bytesRead}=await file.read(buffer,0,buffer.length,null);
      if(!bytesRead)break;
      size+=bytesRead;if(size>limit)fail('FILE_SIZE_LIMIT');chunks.push(buffer.subarray(0,bytesRead));
    }
    return Buffer.concat(chunks);
  } finally {await file.close();}
}
async function writePrivate(path,bytes) {
  const file=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try {await file.writeFile(bytes);await file.sync();}finally{await file.close();}
}
async function syncDirectory(path) {const file=await open(path,constants.O_RDONLY|constants.O_DIRECTORY);try{await file.sync();}finally{await file.close();}}
function decode(bytes) {try{return JSON.parse(decoder.decode(bytes));}catch{fail('PRIVATE_JSON_INVALID');}}
function validateState(state) {
  if(state?.schema!==STATE_SCHEMA||!Number.isSafeInteger(state.revision)||state.revision<1||
      !Number.isSafeInteger(state.configRevision)||state.configRevision<1||
      !state.merchants||typeof state.merchants!=='object'||Array.isArray(state.merchants)||
      !Array.isArray(state.incidents)||state.incidents.length>10_000||
      !Array.isArray(state.notifications)||state.notifications.length>4096)fail('STATE_INVALID');
  const config=compileConfig(state.config);
  if(configHash(config)!==state.configHash)fail('CONFIGURATION_DIGEST_MISMATCH');
  const incidents=new Set();
  if (state.slackCooldowns != null && (typeof state.slackCooldowns !== 'object' || Array.isArray(state.slackCooldowns) ||
      Object.keys(state.slackCooldowns).length > 128 || Object.entries(state.slackCooldowns).some(([key,value]) =>
        !/^[a-f0-9]{64}$/.test(key) || typeof value !== 'string' || !Number.isFinite(Date.parse(value)))))
    fail('SLACK_COOLDOWN_INVALID');
  for(const item of state.incidents) {
    if(!UUID.test(item.id??'')||incidents.has(item.id)||!kinds.includes(item.kind)||
        !['OPEN','ACKNOWLEDGED','RECOVERED','RETIRED'].includes(item.status)||
        !Number.isSafeInteger(item.revision)||item.revision<1)fail('INCIDENT_STATE_INVALID');
    const thread = item.notificationThread;
    if (thread != null && (!/^[a-f0-9]{64}$/.test(thread.notificationConfigHash ?? '') ||
        !/^[a-f0-9]{64}$/.test(thread.endpointHash ?? '') || !validSlackReceipt(thread.receipt)))
      fail('SLACK_THREAD_STATE_INVALID');
    incidents.add(item.id);
  }
  const events=new Set();
  for(const event of state.notifications) {
    if(!UUID.test(event.id??'')||events.has(event.id)||!incidents.has(event.incidentId)||
        !['PENDING','RETRY','IN_FLIGHT','PAUSED','DELIVERED','EXHAUSTED','CANCELLED'].includes(event.status)||
        !/^[a-f0-9]{64}$/.test(event.notificationConfigHash??'')||
        !Number.isSafeInteger(event.attempts)||event.attempts<0||event.attempts>100_000||
        !Number.isSafeInteger(event.attemptLimit)||event.attemptLimit<1||event.attemptLimit>100_000)fail('NOTIFICATION_STATE_INVALID');
    checkPayload(event);events.add(event.id);
    if (Object.hasOwn(event,'slackThreadTs') && (event.binding?.transport !== 'slack' ||
        event.slackThreadTs !== null && !slackTimestamp.test(event.slackThreadTs))) fail('SLACK_EVENT_THREAD_INVALID');
    if (event.providerReceipt != null && !validSlackReceipt(event.providerReceipt,event)) fail('SLACK_RECEIPT_INVALID');
    if ((Object.hasOwn(event,'slackRequestBody') || Object.hasOwn(event,'slackRequestHash') ||
        event.binding?.transport === 'slack' && event.attempts > 0) && !validSlackRequest(event))
      fail('SLACK_REQUEST_INVALID');
    if (event.binding?.transport === 'slack' && event.status === 'DELIVERED' && !event.providerReceipt)
      fail('SLACK_RECEIPT_REQUIRED');
  }
  for(const merchant of config.merchants) {
    const row=state.merchants[merchant.id];
    if(!row||typeof row.binding!=='string'||!row.conditions||typeof row.conditions!=='object')fail('MERCHANT_STATE_INVALID');
  }
  validateRecoveryState(state);
  return state;
}
function references(state) {
  const refs=new Set();
  const add=ref=>{if(ref){if(!/^[a-f0-9]{64}$/.test(ref.id??''))fail('CAPTURE_REFERENCE_INVALID');refs.add(ref.id);}};
  for(const row of Object.values(state.merchants))add(row.lastCapture);
  for(const item of state.incidents){add(item.beforeCapture);add(item.afterCapture);}
  return refs;
}
function parseCapture(bytes,id) {
  if(hash(bytes)!==id)fail('CAPTURE_DIGEST_MISMATCH');
  const value=decode(bytes);
  const ckan=value?.kind==='CKAN_WORKBENCH',oauth=value?.kind==='OAUTH_RESOURCE',x402=value?.kind==='X402_MERCHANT';
  const names=x402?X402_FILES:oauth?OAUTH_FILES:ckan?CKAN_FILES:value?.kind==='OBJECT_SESSION'?OBJECT_FILES:PACKET_FILES;
  if(bytes.length>(ckan||x402?MAX_CAPTURE:LEGACY_CAPTURE_LIMIT))fail('CAPTURE_SIZE_LIMIT');
  if(value?.schema!==CAPTURE_SCHEMA||(value.kind!==undefined&&!['OBJECT_SESSION','CKAN_WORKBENCH','OAUTH_RESOURCE','X402_MERCHANT'].includes(value.kind))||!value.files||
      Object.keys(value.files).length!==names.length||names.some(name=>typeof value.files[name]!=='string'))fail('CAPTURE_INVALID');
  const files={};
  for(const name of names) {
    const data=Buffer.from(value.files[name],'base64');
    if(data.length>(x402?X402_FILE_LIMIT:ckan?CKAN_FILE_LIMIT:2_000_000)||!data.length||data.toString('base64')!==value.files[name])fail('CAPTURE_INVALID');
    files[name]=data;
  }
  if(value.kind==='OBJECT_SESSION')readObjectObservationFiles(files);
  if(ckan)readCkanObservationFiles(files);
  if(oauth)readOAuthObservationFiles(files);
  if(x402)readX402ObservationFiles(files);
  return files;
}
export async function openIncidentStore(directory) {
  const root=resolve(directory);
  if(root==='/'||root===process.cwd())fail('PRIVATE_STATE_DIRECTORY_REQUIRED');
  await privateDirectory(root);
  for(const name of ['transactions','worker','captures'])await privateDirectory(join(root,name));
  const statePath=join(root,'state.json'),captureDirectory=join(root,'captures');
  async function read() {return validateState(decode(await readPrivateFile(statePath,MAX_STATE)));}
  async function filesOnDisk() {
    const files=[];
    for(const name of await readdir(captureDirectory))if(CAPTURE.test(name)) {
      const stat=await lstat(join(captureDirectory,name));
      if(!privateStat(stat)||stat.isSymbolicLink())fail('PRIVATE_CAPTURE_REQUIRED');
      files.push({name,id:CAPTURE.exec(name)[1],bytes:stat.size});
    }
    return files;
  }
  async function collectStaging() {
    // Every writer holds this transaction lease. A reserved staging file left
    // here therefore belongs to an interrupted earlier write, never a live one.
    for(const [folder,pattern,limit] of [
      [root,/^state-[a-f0-9-]{36}\.tmp$/,MAX_STATE],
      [captureDirectory,/^stage-capture-[a-f0-9-]{36}\.tmp$/,MAX_CAPTURE]]) {
      let changed=false;
      for(const name of await readdir(folder))if(pattern.test(name)) {
        const path=join(folder,name),stat=await lstat(path);
        if(!privateStat(stat)||stat.isSymbolicLink()||stat.size>limit)fail('PRIVATE_STAGING_FILE_REQUIRED');
        await unlink(path);changed=true;
      }
      if(changed)await syncDirectory(folder);
    }
  }
  async function collect(state,pinReferences=new Set()) {
    const keep=references(state);for(const id of pinReferences)keep.add(id);
    let removed=0,bytes=0,count=0;
    for(const file of await filesOnDisk()) {
      if(!keep.has(file.id)) {
        // This private directory's reserved capture namespace is owned by the
        // store. Unreferenced interrupted old writes are also collectable;
        // referenced objects retain strict digest checking in readCapture.
        await unlink(join(captureDirectory,file.name));removed++;continue;
      }
      bytes+=file.bytes;count++;
    }
    if(removed)await syncDirectory(captureDirectory);
    return {bytes,count,removed};
  }
  async function transaction(update,{readonly=false}={}) {
    let lease;
    for(let attempt=0;attempt<60;attempt++) {
      try {lease=await acquireStateLease(join(root,'transactions'));break;}
      catch(error){if(error.message!=='FLEET_STATE_ALREADY_OWNED')throw error;if(attempt===59)fail('STATE_BUSY');await sleep(50);}
    }
    try {
      lease.assertHeld();const state=await read();
      const snapshotPins=createSnapshotPins({directory:root,assertHeld:()=>lease.assertHeld(),
        validateState,captureReferences:references,stateBytesLimit:MAX_STATE});
      if(!readonly)await collectStaging();
      let census=readonly?null:await collect(state,await snapshotPins.references());
      const io={
        snapshotPins,
        async readStateBytes() {
          const bytes=await readPrivateFile(statePath,MAX_STATE);
          if(JSON.stringify(validateState(decode(bytes)))!==JSON.stringify(state))fail('SNAPSHOT_STATE_CHANGED');
          lease.assertHeld();return bytes;
        },
        async readCaptureBytes(ref) {
          if(!ref||!/^[a-f0-9]{64}$/.test(ref.id??''))fail('CAPTURE_REFERENCE_INVALID');
          const bytes=await readPrivateFile(join(captureDirectory,'capture-'+ref.id+'.json'),MAX_CAPTURE);
          parseCapture(bytes,ref.id);lease.assertHeld();return bytes;
        },
        async capture(packet) {
          if(readonly)fail('READ_ONLY_TRANSACTION');
          const object=packet.kind==='OBJECT_SESSION',ckan=packet.kind==='CKAN_WORKBENCH',oauth=packet.kind==='OAUTH_RESOURCE',x402=packet.kind==='X402_MERCHANT';
          const names=x402?X402_FILES:oauth?OAUTH_FILES:ckan?CKAN_FILES:object?OBJECT_FILES:PACKET_FILES;
          const files=Object.fromEntries(names.map(name=>[name,packet.files[name].toString('base64')]));
          const bytes=Buffer.from(JSON.stringify({schema:CAPTURE_SCHEMA,...(x402?{kind:'X402_MERCHANT'}:oauth?{kind:'OAUTH_RESOURCE'}:ckan?{kind:'CKAN_WORKBENCH'}:object?{kind:'OBJECT_SESSION'}:{}),files})+'\n'),id=hash(bytes);
          // Check the actual serialized wrapper, including all base64 expansion.
          if(bytes.length>(ckan||x402?MAX_CAPTURE:LEGACY_CAPTURE_LIMIT))fail('CAPTURE_SIZE_LIMIT');
          if(object||ckan||oauth||x402)parseCapture(bytes,id);
          const path=join(captureDirectory,'capture-'+id+'.json');
          let exists=false;
          try {const existing=await readPrivateFile(path,MAX_CAPTURE);parseCapture(existing,id);exists=true;}
          catch(error){if(error.code!=='ENOENT')throw error;}
          if(!exists) {
            if(census.bytes+bytes.length>state.config.retention.captureBytes)return null;
            const temporary=join(captureDirectory,'stage-capture-'+randomUUID()+'.tmp');
            try {
              await writePrivate(temporary,bytes);lease.assertHeld();await rename(temporary,path);await syncDirectory(captureDirectory);
            } catch(error) {await unlink(temporary).catch(()=>{});throw error;}
            census.bytes+=bytes.length;census.count++;
          }
          return {id,bytes:bytes.length,generatedAt:packet.report.generatedAt,sessionId:packet.report.observation.sessionId,
            ...(x402?{kind:'X402_MERCHANT'}:oauth?{kind:'OAUTH_RESOURCE'}:ckan?{kind:'CKAN_WORKBENCH'}:object?{kind:'OBJECT_SESSION'}:{})};
        },
        async readCapture(ref) {
          if(!ref||!/^[a-f0-9]{64}$/.test(ref.id??''))fail('CAPTURE_REFERENCE_INVALID');
          return parseCapture(await readPrivateFile(join(captureDirectory,'capture-'+ref.id+'.json'),MAX_CAPTURE),ref.id);
        },
      };
      const result=await update(state,io);
      if(!readonly) {
        pruneRecords(state,Date.now());state.revision++;state.updatedAt=new Date().toISOString();
        // Commit references before collecting their predecessors. A crash may
        // leave an orphan, never a committed reference to a deleted capture.
        const pinReferences=await snapshotPins.references(),keep=references(state);
        for(const id of pinReferences)keep.add(id);
        const retained=(await filesOnDisk()).filter(file=>keep.has(file.id));
        state.captureStorage={bytes:retained.reduce((sum,file)=>sum+file.bytes,0),count:retained.length,
          limit:state.config.retention.captureBytes};
        validateState(state);
        const bytes=Buffer.from(JSON.stringify(state)+'\n');if(bytes.length>MAX_STATE)fail('STATE_SIZE_LIMIT');
        const temporary=join(root,'state-'+randomUUID()+'.tmp');
        try {await writePrivate(temporary,bytes);lease.assertHeld();await rename(temporary,statePath);await syncDirectory(root);}
        catch(error){await unlink(temporary).catch(()=>{});throw error;}
        await collect(state,pinReferences);
      }
      return result;
    } finally {await lease.close();}
  }
  return {root,read,transaction,async acquireWorker(){return acquireStateLease(join(root,'worker'));}};
}
export async function initializeIncidentStore({directory,config}) {
  const root=resolve(directory),normalized=compileConfig(config);
  if(root==='/'||root===process.cwd())fail('PRIVATE_STATE_DIRECTORY_REQUIRED');
  await mkdir(root,{mode:0o700}); // create-only; parent must already exist
  for(const name of ['transactions','worker','captures'])await mkdir(join(root,name),{mode:0o700});
  const now=new Date().toISOString();
  const state={schema:STATE_SCHEMA,createdAt:now,updatedAt:now,revision:1,configRevision:1,
    config:normalized,configHash:configHash(normalized),merchants:Object.fromEntries(normalized.merchants.map(m=>[m.id,freshMerchant(normalized,m)])),
    incidents:[],notifications:[],notificationCapacityEvents:0,worker:null,
    captureStorage:{bytes:0,count:0,limit:normalized.retention.captureBytes}};
  await writePrivate(join(root,'state.json'),Buffer.from(JSON.stringify(state)+'\n'));await syncDirectory(root);
  return {directory:root,revision:1,configRevision:1,merchants:normalized.merchants.map(m=>m.id)};
}
export function statusView(state,{details=false}={}) {
  return {schema:STATE_SCHEMA,directoryRevision:state.revision,configRevision:state.configRevision,
    configHash:state.configHash,worker:state.worker,recovery:recoveryView(state),
    notificationDestination:state.config.notification ? {
      transport:state.config.notification.transport ?? 'webhook',id:state.config.notification.id,
      ...(state.config.notification.transport === 'slack' ? {
        teamId:state.config.notification.teamId,channelId:state.config.notification.channelId} : {})} : null,
    merchants:state.config.merchants.map(m=>({id:m.id,label:m.label,...state.merchants[m.id]})),
    incidents:state.incidents.map(item=>details?item:{id:item.id,merchantId:item.merchantId,kind:item.kind,status:item.status,
      revision:item.revision,openedAt:item.openedAt,closedAt:item.closedAt,lastObservedAt:item.lastObservedAt,
      acknowledgedBy:item.acknowledgment?.by ?? null,beforeCapture:Boolean(item.beforeCapture),afterCapture:Boolean(item.afterCapture),
      notificationState:item.notificationState,notificationIssue:item.notificationIssue ?? null}),
    notifications:state.notifications.map(({body,binding,slackRequestBody,...event})=>({...event,destinationId:binding?.id ?? null})),
    active:state.incidents.filter(activeIncident).length,captureStorage:state.captureStorage,
    notificationCapacityEvents:state.notificationCapacityEvents};
}


export {validateState as validateIncidentState,references as incidentCaptureReferences,parseCapture as validateIncidentCapture};
export const INCIDENT_STORE_LIMITS=Object.freeze({stateBytes:MAX_STATE,captureBytes:MAX_CAPTURE});
