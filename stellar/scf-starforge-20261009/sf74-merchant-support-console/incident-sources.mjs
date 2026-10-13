// MIT. Merchant incident operations composed with the original SF93 store and watcher.
import {realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {openIncidentStore,readPrivateFile,statusView} from '../sf93-seller-support-bundle/incident-store.mjs';
import {configureIncidents,acknowledgeIncident,remindIncident,operateNotification} from '../sf93-seller-support-bundle/incident-operator.mjs';
import {runIncidentWatch} from '../sf93-seller-support-bundle/watch.mjs';
import {resolveDestination} from '../sf93-seller-support-bundle/notifications.mjs';
import {inspectSlackDestination} from '../sf93-seller-support-bundle/notifications-slack.mjs';
import {activeIncident,idPattern,kinds,compileConfig} from '../sf93-seller-support-bundle/incident-config.mjs';
import {reviewObjectSource} from '../sf93-seller-support-bundle/object-source.mjs';
import {reviewCkanSource} from '../sf93-seller-support-bundle/ckan-source.mjs';
import {reviewOAuthSource} from '../sf93-seller-support-bundle/oauth-source.mjs';
import {reviewX402Source} from '../sf93-seller-support-bundle/x402-source.mjs';
import {normalizeX402Source,x402SourceKey} from '../sf93-seller-support-bundle/x402-observation.mjs';
import {normalizeOAuthSource,oauthConditions} from '../sf93-seller-support-bundle/oauth-observation.mjs';
import {parseWorkspace,MAX_WORKSPACE_BYTES} from './workspace-file.mjs';
import {inspectRuntimeFiles,exportRuntimeHandoff,RUNTIME_SCHEMA} from './runtime-support.mjs';
import {caseMetadata} from './case-store.mjs';
import {readServiceIncidentSnapshot} from './service-source.mjs';
import {openIncidentRecoveryConsole,inspectIncidentRecoveryRoot} from './incident-recovery-console.mjs';
import {recoveryView} from '../sf93-seller-support-bundle/incident-recovery-model.mjs';

export const INCIDENT_SOURCES_SCHEMA='stellar-forge.support-incident-sources.v1';
const MAX_CONFIG_BYTES=65_536;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SOURCE_ID=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const STATUSES=['OPEN','ACKNOWLEDGED','RECOVERED','RETIRED'];
const decoder=new TextDecoder('utf-8',{fatal:true});
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const fail=(code,detail,status=400)=>Object.assign(new Error(detail),{code,status});
function fields(value,allowed,label) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))
    throw fail('INCIDENT_INPUT_INVALID','Invalid '+label);
  return value;
}
function text(value,maximum,label,{empty=false}={}) {
  if(typeof value!=='string'||!empty&&!value.trim()||Buffer.byteLength(value)>maximum||
      Buffer.from(value).toString('utf8')!==value||/[\u0000-\u001f\u007f]/.test(value))
    throw fail('INCIDENT_INPUT_INVALID','Invalid '+label);
  return value;
}
function integer(value,minimum,maximum,label) {
  if(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value))value=Number(value);
  if(!Number.isSafeInteger(value)||value<minimum||value>maximum)
    throw fail('INCIDENT_INPUT_INVALID','Invalid '+label);
  return value;
}
function identifier(value,label) {
  if(typeof value!=='string'||!UUID.test(value))throw fail('INCIDENT_INPUT_INVALID','Invalid '+label);
  return value;
}
function expectedRevision(value) {return integer(value,1,Number.MAX_SAFE_INTEGER,'incident revision');}
function currentIncident(state,id,revision) {
  const incident=state.incidents.find(row=>row.id===id);
  if(!incident)throw fail('INCIDENT_NOT_FOUND','Incident was not found in this source.',404);
  if(revision!==undefined&&incident.revision!==revision)
    throw fail('INCIDENT_REVISION_CONFLICT','Incident changed. Refresh it before continuing.',409);
  return incident;
}
function latestNotificationId(state,incidentId) {
  for(let index=state.notifications.length-1;index>=0;index--)
    if(state.notifications[index].incidentId===incidentId)return state.notifications[index].id;
  return null;
}
function checkConfiguration(state,expected) {
  if(state.configRevision!==expected)
    throw fail('INCIDENT_CONFIGURATION_CONFLICT','Watcher configuration changed. Refresh it before continuing.',409);
}
const publicSource=source=>({id:source.id,label:source.label,...(source.recoveryDirectory?
  {recovery:{enabled:true,workspaceId:source.recoveryAccess?.workspaceId??null,
    restored:Boolean(source.recoveryBaseId),baseSourceId:source.recoveryBaseId??source.id}}:{}),...(source.objectSessions?.size?
  {objectSessions:[...source.objectSessions.values()].map(({id,label})=>({id,label}))}:{}),...(source.ckanWorkspaces?.size?
  {ckanWorkspaces:[...source.ckanWorkspaces.values()].map(({id,label})=>({id,label}))}:{}),...(source.oauthResources?.size?
  {oauthResources:[...source.oauthResources.values()].map(({id,label,oauth})=>({id,label,resource:oauth.resource,
    configurationSha256:oauth.configurationSha256}))}:{}),...(source.x402Merchants?.size?
  {x402Merchants:[...source.x402Merchants.values()].map(({id,label,x402})=>({id,label,storeId:x402.storeId,
    tenantId:x402.tenantId,resourceVersionId:x402.resourceVersionId,configurationSha256:x402.configurationSha256,
    ...(x402.polling===undefined?{}:{polling:x402.polling}),...(x402.inputsSha256===undefined?{}:{inputsSha256:x402.inputsSha256})}))}:{})});
const encodedFiles=files=>Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,bytes.toString('base64')]));
const oauthSourceKey=source=>JSON.stringify([source.endpoint,source.tokenEnv,source.resource,source.configurationSha256]);

const ORIGINAL_PROBLEMS={
  SF93_INCIDENT_NOT_FOUND:[404,'Incident was not found in this source.'],
  SF93_NOTIFICATION_NOT_FOUND:[404,'Notification was not found in this source.'],
  SF93_INCIDENT_REVISION_CONFLICT:[409,'Incident changed. Refresh it before continuing.'],
  SF93_CONFIGURATION_REVISION_CONFLICT:[409,'Watcher configuration changed. Refresh it before continuing.'],
  SF93_CONFIGURATION_DIGEST_CONFLICT:[409,'Watcher configuration changed. Refresh it before starting.'],
  SF93_NOTIFICATION_ATTEMPT_CONFLICT:[409,'Notification attempts changed. Refresh its current state.'],
  SF93_NOTIFICATION_SELECTION_CONFLICT:[409,'A newer notification exists. Refresh the incident before notifying again.'],
  SF93_NOTIFICATION_ATTEMPT_IN_FLIGHT:[409,'The original watcher is delivering this notification.'],
  SF93_NOTIFICATION_ALREADY_FINISHED:[409,'This notification is already finished.'],
  SF93_NOTIFICATION_ALREADY_SCHEDULED:[409,'This notification is already scheduled by the original queue.'],
  SF93_INCIDENT_NOT_OPEN:[409,'Only an open incident can be acknowledged.'],
  SF93_INCIDENT_HAS_NO_ORIGINAL_CAPTURE:[409,'This incident has no retained original capture to attach.'],
  SF93_NOTIFICATION_QUEUE_CAPACITY:[409,'The original notification queue is full. Resolve its existing events before retrying.'],
  SF93_NOTIFICATION_LIFETIME_ATTEMPT_LIMIT:[409,'This notification reached its original lifetime attempt limit.'],
  SF93_STATE_BUSY:[409,'Another original incident operation currently owns the state transaction.'],
  FLEET_STATE_ALREADY_OWNED:[409,'Another watcher owns this source\'s original worker lease.'],
};
/** Stable API problems omit filesystem paths, credential values and raw transport errors. */
export function incidentProblem(error) {
  if(typeof error?.code==='string'&&error.code.startsWith('INCIDENT_')&&
      Number.isInteger(error.status)&&error.status>=400&&error.status<=599)
    return {status:error.status,error:error.code,detail:error.message};
  if(typeof error?.code==='string'&&/^(?:X402_|SF93_X402_|MERCHANT_OBSERVATION_)/.test(error.code))
    return {status:error.code==='X402_ACCESS_DENIED'?403:/RETRY_AFTER|RATE_LIMIT|COOLDOWN/.test(error.code)?429:
      /INVALID|REQUIRED/.test(error.code)?422:503,error:error.code,
      detail:'The original merchant observation could not be accepted. Preserve the source result and review the registered owner, identity and credential reference.'};
  if(typeof error?.code==='string'&&/^OAUTH_[A-Z0-9_]+$/.test(error.code)) {
    const code=error.code;
    if(code==='OAUTH_OBSERVATION_ACCESS_DENIED')return {status:403,error:code,
      detail:'The original OAuth host denied this operator’s observation read. Review its existing authority and configured operator.'};
    if(['OAUTH_SOURCE_RATE_LIMITED','OAUTH_SOURCE_RETRY_AFTER'].includes(code))return {status:429,error:code,
      detail:'The original observation source is cooling down. Respect its retained Retry-After before another read.'};
    if(code==='OAUTH_OPERATOR_CREDENTIAL_REQUIRED')return {status:503,error:code,
      detail:'The configured original OAuth operator credential is unavailable.'};
    const invalid=/^OAUTH_(?:SOURCE_(?:REVIEW|ENDPOINT|EXACT_LOOPBACK_ENDPOINT|TOKEN_ENV|TIMEOUTMS|WINDOWMINUTES|UNAVAILABLEMINIMUM|UNAVAILABLEPERCENT|HOSTERRORMINIMUM|HOSTERRORPERCENT|RESOURCE|CONFIGURATION_SHA256)|REGISTRATION)_.*(?:INVALID|REQUIRED)$/.test(code)||code==='OAUTH_SOURCE_REVIEW_INVALID';
    return {status:invalid?422:503,error:code,detail:invalid?
      'The original OAuth source rejected the selected observation settings.':
      'The original OAuth observation is unavailable or invalid. Retain this source result and review it with the host operator.'};
  }
  const message=String(error?.message??'');
  const code=/^(SF93_[A-Z0-9_]+|FLEET_[A-Z0-9_]+)/.exec(message)?.[1];
  if(code&&ORIGINAL_PROBLEMS[code]) {
    const [status,detail]=ORIGINAL_PROBLEMS[code];return {status,error:code,detail};
  }
  if(code==='SF93_CONFIG_INVALID')
    return {status:422,error:code,detail:'Invalid watcher configuration: '+message.slice(message.indexOf(':')+1).trim().slice(0,160)};
  if(code) {
    const invalid=code.includes('INVALID')||code.includes('REQUIRED');
    return {status:invalid?422:409,error:code,
      detail:invalid?'The original incident operation rejected an invalid input or private state.':
        'The original incident operation could not proceed: '+code+'.'};
  }
  if(['ENOENT','EACCES','EPERM','ELOOP','ENOTDIR','EIO','ENOSPC','EROFS'].includes(error?.code))
    return {status:503,error:'INCIDENT_STORE_UNAVAILABLE',
      detail:'The configured original incident store is unavailable ('+error.code+').'};
  if(error instanceof TypeError||error instanceof SyntaxError)
    return {status:422,error:'INCIDENT_INPUT_INVALID',detail:message.slice(0,300)||'Invalid incident input.'};
  if(typeof error?.code==='string'&&Number.isInteger(error.status)&&error.status>=400&&error.status<=499)
    return {status:error.status,error:error.code,detail:message.slice(0,300)};
  return {status:500,error:'INCIDENT_OPERATION_FAILED',detail:'The original incident operation failed.'};
}

/** Read the original configured IDs and initialized stores without starting workers. */
async function configuredIncidentSources(configPath) {
  const sources=new Map();
  if(configPath===undefined||configPath===null)return {path:null,sha256:null,sources};
  const path=resolve(text(configPath,4096,'incident sources configuration path'));
  let config,bytes;
  try {bytes=await readPrivateFile(path,MAX_CONFIG_BYTES);config=JSON.parse(decoder.decode(bytes));}
  catch(error) {
    if(error instanceof SyntaxError)throw fail('INCIDENT_SOURCES_CONFIG_INVALID','Incident sources configuration must be UTF-8 JSON.',422);
    throw error;
  }
  fields(config,['schema','sources'],'incident sources configuration');
  if(config.schema!==INCIDENT_SOURCES_SCHEMA||!Array.isArray(config.sources)||config.sources.length>8)
    throw fail('INCIDENT_SOURCES_CONFIG_INVALID','Use the original incident sources schema with at most eight sources.',422);
  const directories=new Set(),recoveryDirectories=new Set();
  for(const entry of config.sources) {
    fields(entry,['id','label','directory','objectSessions','ckanWorkspaces','oauthResources','x402Merchants','recoveryDirectory'],'incident source');
    const id=text(entry.id,64,'source ID');
    if(!SOURCE_ID.test(id)||['profiles','__proto__','constructor','prototype'].includes(id)||sources.has(id))
      throw fail('INCIDENT_SOURCES_CONFIG_INVALID','Source IDs must be distinct lowercase identifiers; profiles is reserved.',422);
    const label=text(entry.label??id,120,'source label');
    const configured=resolve(dirname(path),text(entry.directory,4096,'source directory'));
    const original=await openIncidentStore(configured),directory=await realpath(original.root);
    if(directories.has(directory))
      throw fail('INCIDENT_SOURCES_CONFIG_INVALID','Each original incident store may have only one source ID.',422);
    const store=directory===original.root?original:await openIncidentStore(directory);
    const state=await store.read(),objectSessions=new Map(),ckanWorkspaces=new Map(),oauthResources=new Map(),x402Merchants=new Map();
    if(entry.objectSessions!==undefined&&(!Array.isArray(entry.objectSessions)||entry.objectSessions.length>8))
      throw fail('INCIDENT_SOURCES_CONFIG_INVALID','Configure at most eight named original Object sessions.',422);
    for(const item of entry.objectSessions??[]) {
      fields(item,['id','label','directory'],'allowed Object session');
      const id=text(item.id,64,'Object source ID');
      if(!idPattern.test(id)||['__proto__','constructor','prototype'].includes(id)||objectSessions.has(id))
        throw fail('INCIDENT_SOURCES_CONFIG_INVALID','Object source IDs must be distinct identifiers.',422);
      objectSessions.set(id,{id,label:text(item.label??id,120,'Object source label'),
        directory:resolve(dirname(path),text(item.directory,4096,'Object session directory'))});
    }
    // Existing trusted CLI registrations are also original startup capabilities.
    // Browser configuration never grants access to another filesystem path.
    for(const merchant of state.config.merchants.filter(row=>row.object)) {
      const prior=objectSessions.get(merchant.id);
      if(prior&&prior.directory!==merchant.object.directory)
        throw fail('INCIDENT_SOURCES_CONFIG_INVALID','Object source ID has two different original directories.',422);
      if(!prior)objectSessions.set(merchant.id,{id:merchant.id,label:merchant.label,directory:merchant.object.directory});
    }
    let recovery=null;
    if(entry.recoveryDirectory!==undefined) {
      const selectedRecovery=resolve(dirname(path),text(entry.recoveryDirectory,4096,'recovery directory'));
      recovery=await inspectIncidentRecoveryRoot({directory,recoveryDirectory:selectedRecovery});
      if(recoveryDirectories.has(recovery.directory))
        throw fail('INCIDENT_SOURCES_CONFIG_INVALID','Each base incident source needs a distinct private recovery directory.',422);
      recoveryDirectories.add(recovery.directory);
    }
    if(entry.ckanWorkspaces!==undefined&&(!Array.isArray(entry.ckanWorkspaces)||entry.ckanWorkspaces.length>8))
      throw fail('INCIDENT_SOURCES_CONFIG_INVALID','Configure at most eight named original CKAN workspaces.',422);
    for(const item of entry.ckanWorkspaces??[]) {
      fields(item,['id','label','directory'],'allowed CKAN workspace');
      const id=text(item.id,64,'CKAN source ID');
      if(!idPattern.test(id)||['__proto__','constructor','prototype'].includes(id)||ckanWorkspaces.has(id))
        throw fail('INCIDENT_SOURCES_CONFIG_INVALID','CKAN source IDs must be distinct identifiers.',422);
      ckanWorkspaces.set(id,{id,label:text(item.label??id,120,'CKAN source label'),
        directory:resolve(dirname(path),text(item.directory,4096,'CKAN workspace directory'))});
    }
    for(const merchant of state.config.merchants.filter(row=>row.ckan)) {
      const prior=ckanWorkspaces.get(merchant.id);
      if(prior&&prior.directory!==merchant.ckan.directory)
        throw fail('INCIDENT_SOURCES_CONFIG_INVALID','CKAN source ID has two different original directories.',422);
      if(!prior)ckanWorkspaces.set(merchant.id,{id:merchant.id,label:merchant.label,directory:merchant.ckan.directory});
    }
    if(entry.oauthResources!==undefined&&(!Array.isArray(entry.oauthResources)||entry.oauthResources.length>8))
      throw fail('INCIDENT_SOURCES_CONFIG_INVALID','Configure at most eight named original OAuth resources.',422);
    for(const item of entry.oauthResources??[]) {
      fields(item,['id','label','oauth'],'allowed OAuth resource');
      const id=text(item.id,64,'OAuth source ID');
      if(!idPattern.test(id)||['__proto__','constructor','prototype'].includes(id)||oauthResources.has(id))
        throw fail('INCIDENT_SOURCES_CONFIG_INVALID','OAuth source IDs must be distinct identifiers.',422);
      oauthResources.set(id,{id,label:text(item.label??id,120,'OAuth source label'),oauth:normalizeOAuthSource(item.oauth)});
    }
    for(const merchant of state.config.merchants.filter(row=>row.oauth)) {
      const oauth=normalizeOAuthSource(merchant.oauth),prior=oauthResources.get(merchant.id);
      if(prior&&oauthSourceKey(prior.oauth)!==oauthSourceKey(oauth))
        throw fail('INCIDENT_SOURCES_CONFIG_INVALID','OAuth source ID has two different original authority selections.',422);
      if(!prior)oauthResources.set(merchant.id,{id:merchant.id,label:merchant.label,oauth});
    }
    if(entry.x402Merchants!==undefined&&(!Array.isArray(entry.x402Merchants)||entry.x402Merchants.length>8))
      throw fail('INCIDENT_SOURCES_CONFIG_INVALID','Configure at most eight named original X402 resources.',422);
    for(const item of entry.x402Merchants??[]) {
      fields(item,['id','label','x402'],'allowed X402 resource');
      const id=text(item.id,64,'X402 source ID');
      if(!idPattern.test(id)||['__proto__','constructor','prototype'].includes(id)||x402Merchants.has(id))
        throw fail('INCIDENT_SOURCES_CONFIG_INVALID','X402 source IDs must be distinct identifiers.',422);
      x402Merchants.set(id,{id,label:text(item.label??id,120,'X402 source label'),x402:normalizeX402Source(item.x402)});
    }
    for(const merchant of state.config.merchants.filter(row=>row.x402)) {
      const x402=normalizeX402Source(merchant.x402),prior=x402Merchants.get(merchant.id);
      if(prior&&x402SourceKey(prior.x402)!==x402SourceKey(x402))
        throw fail('INCIDENT_SOURCES_CONFIG_INVALID','X402 source ID has two different original authority selections.',422);
      if(!prior)x402Merchants.set(merchant.id,{id:merchant.id,label:merchant.label,x402});
    }
    directories.add(directory);
    sources.set(id,{id,label,directory,store,...(recovery?{recoveryDirectory:recovery.directory,recoveryIdentity:recovery}:{}),
      configuration:{revision:state.configRevision,sha256:state.configHash},
      routeCache:new Map(),objectSessions,ckanWorkspaces,oauthResources,x402Merchants});
  }
  return {path,sha256:createHash('sha256').update(bytes).digest('hex'),sources};
}

function sourceConfigurationView(selected) {
  return {schema:INCIDENT_SOURCES_SCHEMA,path:selected.path,sha256:selected.sha256,
    sources:[...selected.sources.values()].map(source=>({id:source.id,label:source.label,directory:source.directory,
      configuration:{...source.configuration},...(source.recoveryIdentity?{recovery:{...source.recoveryIdentity}}:{}),...(source.objectSessions.size?
        {objectSessions:[...source.objectSessions.values()].map(row=>({...row}))}:{}),...(source.ckanWorkspaces.size?
        {ckanWorkspaces:[...source.ckanWorkspaces.values()].map(row=>({...row}))}:{}),...(source.oauthResources.size?
        {oauthResources:[...source.oauthResources.values()].map(row=>({...row,oauth:{...row.oauth}}))}:{}),...(source.x402Merchants.size?
        {x402Merchants:[...source.x402Merchants.values()].map(row=>({...row,x402:{...row.x402}}))}:{})}))};
}
/** Private managed-launch projection. Live incidents, capture bodies and tokens stay in the original store. */
export async function inspectIncidentSourcesConfiguration(configPath) {
  return sourceConfigurationView(await configuredIncidentSources(configPath));
}

/** Bind configured IDs to initialized private stores. Browser input never selects a path. */
export async function openIncidentSources({configPath,environment=process.env}={}) {
  const selected=await configuredIncidentSources(configPath),sources=new Map(selected.sources),workers=new Map();
  const configuration=()=>sourceConfigurationView(selected);
  let closing=false,closePromise=null;
  const readAbort=new AbortController(),reads=new Set();
  for(const source of sources.values())if(source.recoveryDirectory)
    source.recoveryAccess=await openIncidentRecoveryConsole({directory:source.directory,
      recoveryDirectory:source.recoveryDirectory,signal:readAbort.signal});
  function tracked(pending) {reads.add(pending);return pending.finally(()=>reads.delete(pending));}
  function sourceFor(id) {
    if(closing)throw fail('INCIDENT_SOURCES_CLOSED','The incident console is closing.',503);
    if(typeof id!=='string'||!sources.has(id))
      throw fail('INCIDENT_SOURCE_NOT_FOUND','Configured incident source was not found.',404);
    return sources.get(id);
  }
  function workerView(source,state) {
    const entry=workers.get(source.id),recorded=state.worker?structuredClone(state.worker):null;
    const active=entry?.active===true;
    const external=!active&&recorded?.status==='RUNNING'&&recorded.instanceId!==entry?.instanceId;
    return {ownership:active?'console':external?'external':'none',
      status:active?entry.phase:external?'RUNNING':entry?.error?'FAILED':recorded?.status??'STOPPED',
      canStart:!closing&&!active,canStop:active&&entry.phase!=='STOPPING',
      recorded,error:entry?.error??null};
  }
  const snapshot=async source=>({source:publicSource(source),worker:workerView(source,await source.store.read())});
  const profiles=()=>({schema:INCIDENT_SOURCES_SCHEMA,sources:[...sources.values()].map(publicSource)});
  async function list(sourceId,filters={}) {
    const source=sourceFor(sourceId);
    fields(filters,['q','status','merchant','kind','offset','limit'],'incident filters');
    const q=text(filters.q??'',800,'search query',{empty:true});
    if(q.length>200)throw fail('INCIDENT_INPUT_INVALID','Search query exceeds 200 characters.');
    const status=text(filters.status??'',32,'status filter',{empty:true});
    const merchant=text(filters.merchant??'',64,'merchant filter',{empty:true});
    const kind=text(filters.kind??'',64,'condition filter',{empty:true});
    if(status&&!STATUSES.includes(status)||kind&&!kinds.includes(kind)||merchant&&!idPattern.test(merchant))
      throw fail('INCIDENT_INPUT_INVALID','Unknown incident filter.');
    const offset=integer(filters.offset??0,0,Number.MAX_SAFE_INTEGER,'page offset');
    const limit=integer(filters.limit??20,1,100,'page limit');
    const state=await source.store.read(),view=statusView(state),query=q.trim().toLowerCase();
    const originals=new Map(state.incidents.map(row=>[row.id,row]));
    const latest=new Map();
    for(const event of state.notifications)latest.set(event.incidentId,event.id);
    const rows=view.incidents.map(row=>({...row,merchantLabel:originals.get(row.id).merchantLabel,
      latestNotificationId:latest.get(row.id)??null}));
    const selected=rows.filter(row=>(!status||row.status===status)&&(!merchant||row.merchantId===merchant)&&
      (!kind||row.kind===kind)&&(!query||[row.id,row.merchantId,row.merchantLabel,row.kind,row.status,row.acknowledgedBy]
        .filter(Boolean).join(' ').toLowerCase().includes(query)))
      .sort((a,b)=>b.openedAt.localeCompare(a.openedAt)||a.id.localeCompare(b.id));
    const counts=Object.fromEntries(STATUSES.map(name=>[name,0]));
    for(const row of state.incidents)counts[row.status]++;
    const counters={total:state.incidents.length,active:counts.OPEN+counts.ACKNOWLEDGED,
      open:counts.OPEN,acknowledged:counts.ACKNOWLEDGED,recovered:counts.RECOVERED,retired:counts.RETIRED,
      pendingNotifications:0,pausedNotifications:0,exhaustedNotifications:0,
      notificationCapacityEvents:state.notificationCapacityEvents??0};
    for(const event of state.notifications) {
      if(['PENDING','RETRY','IN_FLIGHT'].includes(event.status))counters.pendingNotifications++;
      else if(event.status==='PAUSED')counters.pausedNotifications++;
      else if(event.status==='EXHAUSTED')counters.exhaustedNotifications++;
    }
    const serviceMerchants=new Map();
    for(const incident of [...state.incidents].sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt)||a.openedAt.localeCompare(b.openedAt)))
      serviceMerchants.set(incident.merchantId,{id:incident.merchantId,label:incident.merchantLabel??incident.merchantId,registered:false});
    for(const merchant of state.config.merchants)serviceMerchants.set(merchant.id,{id:merchant.id,label:merchant.label,registered:true});
    return {source:publicSource(source),revision:state.revision,configRevision:state.configRevision,
      configHash:state.configHash,config:structuredClone(state.config),worker:workerView(source,state),recovery:recoveryView(state),counters,
      serviceMerchants:[...serviceMerchants.values()].sort((a,b)=>a.label.localeCompare(b.label)||a.id.localeCompare(b.id)),
      merchants:state.config.merchants.map(({id,label,object,ckan,oauth,x402})=>({id,label,...(x402?{kind:'X402_MERCHANT',observation:state.merchants[id]?.x402Observation??null}:object?{kind:'OBJECT_SESSION',
        observation:state.merchants[id]?.objectObservation??null}:ckan?{kind:'CKAN_WORKBENCH',
        observation:state.merchants[id]?.ckanObservation??null}:oauth?{kind:'OAUTH_RESOURCE',
        observation:state.merchants[id]?.oauthObservation?{...state.merchants[id].oauthObservation,
          conditions:state.merchants[id].oauthObservation.poll?.fresh===true?
            oauthConditions(state.merchants[id].oauthObservation):null}:null}:{})})),filters:{q,status,merchant,kind},
      page:{offset,limit,total:selected.length,hasMore:offset+limit<selected.length},
      incidents:selected.slice(offset,offset+limit)};
  }
  async function view(sourceId,incidentId) {
    const source=sourceFor(sourceId);identifier(incidentId,'incident ID');
    return source.store.transaction(async(state,io)=>{
      const incident=currentIncident(state,incidentId),routes=new Map(),captureProblems={},objectObservations={},ckanObservations={},oauthObservations={},x402Observations={};
      for(const side of ['before','after']) {
        const ref=incident[side+'Capture'];if(!ref)continue;
        try {
          // Immutable capture hashes share the original parser result across
          // detail refreshes. Preparing a case always rereads exact file bytes.
          let available=source.routeCache.get(ref.id);
          if(!available) {
            const files=await io.readCapture(ref);
            const inspected=inspectRuntimeFiles({files:encodedFiles(files)});
            available={routes:inspected.routes.map(route=>({
              id:route.id,method:route.method,...(route.path===undefined?{}:{path:route.path})})),
              object:inspected.kind==='OBJECT_SESSION'?{observedAt:inspected.capturedAt,...inspected.object}:null,
              ckan:inspected.kind==='CKAN_WORKBENCH'?{observedAt:inspected.capturedAt,...inspected.ckan,
                originalJson:JSON.stringify(inspected.ckan,null,2)}:null,
              oauth:inspected.kind==='OAUTH_RESOURCE'?{observedAt:inspected.capturedAt,...inspected.oauth}:null,
              x402:inspected.kind==='X402_MERCHANT'?{observedAt:inspected.capturedAt,...inspected.x402}:null};
            source.routeCache.set(ref.id,available);
            if(source.routeCache.size>64)source.routeCache.delete(source.routeCache.keys().next().value);
          }
          if(available.object)objectObservations[side]=available.object;
          if(available.ckan)ckanObservations[side]=available.ckan;
          if(available.oauth)oauthObservations[side]=available.oauth;
          if(available.x402)x402Observations[side]=available.x402;
          for(const route of available.routes) {
            const key=JSON.stringify(route),row=routes.get(key)??{...route,sides:[]};
            row.sides.push(side);routes.set(key,row);
          }
        } catch(error) {
          const problem=incidentProblem(error);
          captureProblems[side]={error:problem.error,detail:problem.detail};
        }
      }
      const notifications=statusView(state).notifications.filter(event=>event.incidentId===incidentId);
      return {source:publicSource(source),revision:state.revision,configRevision:state.configRevision,
        configHash:state.configHash,worker:workerView(source,state),incident:structuredClone(incident),
        latestNotificationId:latestNotificationId(state,incidentId),notifications,
        routes:[...routes.values()],captureProblems,...(Object.keys(objectObservations).length?{objectObservations}:{}),
        ...(Object.keys(ckanObservations).length?{ckanObservations}:{}),
        ...(Object.keys(oauthObservations).length?{oauthObservations}:{}),
        ...(Object.keys(x402Observations).length?{x402Observations}:{})};
    },{readonly:true});
  }
  async function serviceSnapshot(sourceId,input) {
    const source=sourceFor(sourceId);fields(input,['merchantId'],'service incident snapshot');
    return readServiceIncidentSnapshot({store:source.store,source:publicSource(source),merchantId:input.merchantId});
  }
  async function configure(sourceId,input) {
    const source=sourceFor(sourceId);fields(input,['config','expectedConfigRevision'],'configuration change');
    const config=compileConfig(input.config),allowed=new Set([...source.objectSessions.values()].map(row=>row.directory));
    if(config.merchants.some(merchant=>merchant.object&&!allowed.has(merchant.object.directory)))
      throw fail('INCIDENT_OBJECT_NOT_REGISTERED','Select an original Object session registered in this console’s private startup configuration.',409);
    const allowedCkan=new Set([...source.ckanWorkspaces.values()].map(row=>row.directory));
    if(config.merchants.some(merchant=>merchant.ckan&&!allowedCkan.has(merchant.ckan.directory)))
      throw fail('INCIDENT_CKAN_NOT_REGISTERED','Select an original CKAN workspace registered in this console’s private startup configuration.',409);
    const allowedX402=new Set([...source.x402Merchants.values()].map(row=>x402SourceKey(row.x402)));
    if(config.merchants.some(merchant=>merchant.x402&&!allowedX402.has(x402SourceKey(merchant.x402))))
      throw fail('INCIDENT_X402_NOT_REGISTERED','Select a merchant registered in this console’s private startup configuration.',409);
    const allowedOAuth=new Set([...source.oauthResources.values()].map(row=>oauthSourceKey(row.oauth)));
    if(config.merchants.some(merchant=>merchant.oauth&&!allowedOAuth.has(oauthSourceKey(merchant.oauth))))
      throw fail('INCIDENT_OAUTH_NOT_REGISTERED','Select an original OAuth resource registered in this console’s private startup configuration.',409);
    return configureIncidents({directory:source.directory,config,
      expectedConfigRevision:integer(input.expectedConfigRevision,1,Number.MAX_SAFE_INTEGER,'configuration revision'),environment});
  }
  async function acknowledge(sourceId,incidentId,input) {
    const source=sourceFor(sourceId);identifier(incidentId,'incident ID');
    fields(input,['expectedRevision','by','notes'],'acknowledgment');
    return acknowledgeIncident({directory:source.directory,id:incidentId,expectedRevision:expectedRevision(input.expectedRevision),
      by:input.by,notes:input.notes??'',environment});
  }
  async function notify(sourceId,incidentId,input) {
    const source=sourceFor(sourceId);identifier(incidentId,'incident ID');
    fields(input,['expectedRevision','expectedNotificationId'],'notification request');
    if(!own(input,'expectedNotificationId')||input.expectedNotificationId!==null&&
        (typeof input.expectedNotificationId!=='string'||!UUID.test(input.expectedNotificationId)))
      throw fail('INCIDENT_INPUT_INVALID','Supply the last observed notification ID, or null when none exists.');
    return remindIncident({directory:source.directory,id:incidentId,expectedRevision:expectedRevision(input.expectedRevision),
      expectedNotificationId:input.expectedNotificationId,environment});
  }
  async function notification(sourceId,eventId,input) {
    const source=sourceFor(sourceId);identifier(eventId,'notification ID');
    fields(input,['expectedAttempts','action','by'],'notification operation');
    if(!['retry','cancel'].includes(input.action))throw fail('INCIDENT_INPUT_INVALID','Choose retry or cancel.');
    return operateNotification({directory:source.directory,id:eventId,
      expectedAttempts:integer(input.expectedAttempts,0,100_000,'notification attempt count'),
      action:input.action,by:input.by,environment});
  }
  async function inspectObject(sourceId,input) {
    const source=sourceFor(sourceId);
    fields(input,['objectSourceId','expectedConfigRevision','maxBytes','maxChunks','timeoutMs','financialAfterSeconds','outputAfterSeconds'],'Object source review');
    const expected=integer(input.expectedConfigRevision,1,Number.MAX_SAFE_INTEGER,'configuration revision');
    const selected=source.objectSessions.get(text(input.objectSourceId,64,'Object source ID'));
    if(!selected)throw fail('INCIDENT_OBJECT_NOT_REGISTERED','Choose an original Object session registered for this console.',404);
    checkConfiguration(await source.store.read(),expected);
    if(closing)throw fail('INCIDENT_SOURCES_CLOSED','The incident console is closing.',503);
    const pending=reviewObjectSource({directory:selected.directory,...Object.fromEntries(
      ['maxBytes','maxChunks','timeoutMs','financialAfterSeconds','outputAfterSeconds'].filter(key=>own(input,key)).map(key=>[key,input[key]]))},
      {signal:readAbort.signal});
    reads.add(pending);
    try {
      const review=await pending;
      checkConfiguration(await source.store.read(),expected);
      return {source:publicSource(source),configRevision:expected,objectSourceId:selected.id,label:selected.label,...review};
    } finally {reads.delete(pending);}
  }
  async function inspectCkan(sourceId,input) {
    const source=sourceFor(sourceId);
    const options=['sourceId','refreshId','publicationId','maxBytes','maxFiles','maxStateBytes','timeoutMs',
      'operationAfterSeconds','reviewAfterSeconds','publicationAfterSeconds','requirePublication'];
    fields(input,['ckanSourceId','expectedConfigRevision',...options],'CKAN source review');
    const expected=integer(input.expectedConfigRevision,1,Number.MAX_SAFE_INTEGER,'configuration revision');
    const selected=source.ckanWorkspaces.get(text(input.ckanSourceId,64,'CKAN source ID'));
    if(!selected)throw fail('INCIDENT_CKAN_NOT_REGISTERED','Choose an original CKAN workspace registered for this console.',404);
    checkConfiguration(await source.store.read(),expected);
    if(closing)throw fail('INCIDENT_SOURCES_CLOSED','The incident console is closing.',503);
    const pending=reviewCkanSource({directory:selected.directory,...Object.fromEntries(
      options.filter(key=>own(input,key)).map(key=>[key,input[key]]))},{signal:readAbort.signal});
    reads.add(pending);
    try {
      const review=await pending;
      checkConfiguration(await source.store.read(),expected);
      return {source:publicSource(source),configRevision:expected,ckanSourceId:selected.id,label:selected.label,...review,
        originalJson:JSON.stringify(review.summary,null,2)};
    } finally {reads.delete(pending);}
  }
  async function inspectOAuth(sourceId,input) {
    const source=sourceFor(sourceId);
    const options=['timeoutMs','windowMinutes','unavailableMinimum','unavailablePercent','hostErrorMinimum','hostErrorPercent'];
    fields(input,['oauthSourceId','expectedConfigRevision',...options],'OAuth source review');
    const expected=integer(input.expectedConfigRevision,1,Number.MAX_SAFE_INTEGER,'configuration revision');
    const selected=source.oauthResources.get(text(input.oauthSourceId,64,'OAuth source ID'));
    if(!selected)throw fail('INCIDENT_OAUTH_NOT_REGISTERED','Choose an original OAuth resource registered for this console.',404);
    checkConfiguration(await source.store.read(),expected);
    if(closing)throw fail('INCIDENT_SOURCES_CLOSED','The incident console is closing.',503);
    const settings=normalizeOAuthSource({...selected.oauth,...Object.fromEntries(
      options.filter(key=>own(input,key)).map(key=>[key,input[key]]))});
    const pending=reviewOAuthSource({endpoint:settings.endpoint,tokenEnv:settings.tokenEnv,
      ...Object.fromEntries(options.map(key=>[key,settings[key]]))},{signal:readAbort.signal,environment});
    reads.add(pending);
    try {
      const result=await pending;
      if(closing)throw fail('INCIDENT_SOURCES_CLOSED','The incident console is closing.',503);
      checkConfiguration(await source.store.read(),expected);
      if(oauthSourceKey(result.oauth)!==oauthSourceKey(selected.oauth))
        throw fail('INCIDENT_OAUTH_IDENTITY_CHANGED','The original resource or authority changed. Ask its owner to review the registered source before adopting it.',409);
      const {source:sourceObservation,...review}=result;
      return {source:publicSource(source),configRevision:expected,oauthSourceId:selected.id,label:selected.label,
        ...review,sourceObservation};
    } finally {reads.delete(pending);}
  }
  async function inspectX402(sourceId,input) {
    const source=sourceFor(sourceId);
    const options=['timeoutMs','paymentAfterSeconds','outputAfterSeconds'];
    fields(input,['x402SourceId','expectedConfigRevision','polling',...options],'X402 source review');
    const expected=integer(input.expectedConfigRevision,1,Number.MAX_SAFE_INTEGER,'configuration revision');
    const selected=source.x402Merchants.get(text(input.x402SourceId,64,'X402 source ID'));
    if(!selected)throw fail('INCIDENT_X402_NOT_REGISTERED','Choose an original X402 resource registered for this console.',404);
    checkConfiguration(await source.store.read(),expected);
    if(closing)throw fail('INCIDENT_SOURCES_CLOSED','The incident console is closing.',503);
    const polling=input.polling??selected.x402.polling??'full';
    if(!['full','summary'].includes(polling))
      throw fail('INCIDENT_INPUT_INVALID','Choose full or summary observation polling.');
    if(polling==='full'&&selected.x402.inputsSha256!==undefined)
      throw fail('INCIDENT_X402_INPUT_BINDING_REQUIRED','This registered source pins reviewed inputs and requires summary polling.',409);
    const chosen={...selected.x402,...Object.fromEntries(
      options.filter(key=>own(input,key)).map(key=>[key,input[key]]))};
    if(polling==='summary')chosen.polling='summary';else delete chosen.polling;
    const settings=normalizeX402Source(chosen);
    const pending=reviewX402Source({endpoint:settings.endpoint,tokenEnv:settings.tokenEnv,
      ...Object.fromEntries(options.map(key=>[key,settings[key]])),
      ...(settings.polling===undefined?{}:{polling:settings.polling}),
      ...(settings.inputsSha256===undefined?{}:{inputsSha256:settings.inputsSha256})},
      {signal:readAbort.signal,environment});
    reads.add(pending);
    try {
      const result=await pending;
      if(closing)throw fail('INCIDENT_SOURCES_CLOSED','The incident console is closing.',503);
      checkConfiguration(await source.store.read(),expected);
      if(x402SourceKey(result.x402)!==x402SourceKey(selected.x402))
        throw fail('INCIDENT_X402_IDENTITY_CHANGED','The original resource or authority changed. Ask its owner to review the registered source before adopting it.',409);
      const {source:sourceObservation,...review}=result;
      return {source:publicSource(source),configRevision:expected,x402SourceId:selected.id,label:selected.label,
        ...review,sourceObservation};
    } finally {reads.delete(pending);}
  }
  async function inspectDestination(sourceId,input) {
    const source=sourceFor(sourceId);fields(input,['expectedConfigRevision'],'destination inspection');
    const expected=integer(input.expectedConfigRevision,1,Number.MAX_SAFE_INTEGER,'configuration revision');
    const state=await source.store.read();checkConfiguration(state,expected);
    const selected=resolveDestination(state.config,environment);
    const result=selected.reason?{accepted:false,reason:selected.reason}:
      selected.transport==='slack'?await inspectSlackDestination(selected,state.config.notification):
        {accepted:true,reason:'WEBHOOK_CONFIGURATION_RESOLVED',destinationId:selected.binding.id};
    return {source:publicSource(source),configRevision:state.configRevision,configHash:state.configHash,...result};
  }
  async function start(sourceId,input) {
    const source=sourceFor(sourceId);fields(input,['expectedConfigRevision','expectedConfigHash'],'watcher start');
    const expectedConfigRevision=integer(input.expectedConfigRevision,1,Number.MAX_SAFE_INTEGER,'configuration revision');
    const expectedConfigHash=input.expectedConfigHash;
    if(typeof expectedConfigHash!=='string'||!/^[a-f0-9]{64}$/.test(expectedConfigHash))
      throw fail('INCIDENT_INPUT_INVALID','Supply the observed configuration digest.');
    if(workers.get(sourceId)?.active)
      throw fail('INCIDENT_WORKER_ALREADY_STARTED','This console already owns the source watcher.',409);
    if([...workers.values()].filter(entry=>entry.active).length>=8)
      throw fail('INCIDENT_WORKER_LIMIT','This console already owns eight active watchers. Stop one before starting another.',409);
    const controller=new AbortController();
    let readyResolve,readyReject,readySettled=false;
    const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
    const entry={controller,active:true,phase:'STARTING',instanceId:null,error:null,done:null};
    workers.set(sourceId,entry);
    entry.done=Promise.resolve().then(()=>runIncidentWatch({directory:source.directory,environment,
      signal:controller.signal,expectedConfigRevision,expectedConfigHash,
      onReady(info) {
        entry.instanceId=info.instanceId;entry.phase=controller.signal.aborted?'STOPPING':'RUNNING';
        readySettled=true;readyResolve(info);
      }})).then(result=>{
        entry.active=false;entry.phase='STOPPED';
        if(!readySettled){readySettled=true;readyReject(fail('INCIDENT_WORKER_STOPPED','Watcher stopped before becoming ready.',409));}
        return {result};
      },error=>{
        entry.active=false;entry.phase='FAILED';entry.error=incidentProblem(error).error;
        if(!readySettled){readySettled=true;readyReject(error);}
        return {error};
      });
    await ready;
    return snapshot(source);
  }
  async function stop(sourceId) {
    const source=sourceFor(sourceId),entry=workers.get(sourceId);
    if(!entry)throw fail('INCIDENT_WORKER_NOT_OWNED','This console did not start the source watcher.',409);
    if(entry.active){entry.phase='STOPPING';entry.controller.abort();}
    await entry.done;
    return snapshot(source);
  }
  function close() {
    if(closePromise)return closePromise;
    closing=true;readAbort.abort();
    const owned=[...workers.values()].filter(entry=>entry.active);
    for(const entry of owned){entry.phase='STOPPING';entry.controller.abort();}
    closePromise=Promise.allSettled([...owned.map(entry=>entry.done),...reads]).then(()=>undefined);
    return closePromise;
  }
  async function recoveryOverview(sourceId,input={}) {
    const source=sourceFor(sourceId);
    if(!source.recoveryAccess)return {enabled:false,source:publicSource(source)};
    return tracked(source.recoveryAccess.overview(input));
  }
  async function recoveryOperation(sourceId,action,envelope={}) {
    const source=sourceFor(sourceId);
    if(!source.recoveryAccess)throw fail('INCIDENT_RECOVERY_DISABLED',
      'Configure a private recovery directory for this original incident source.',409);
    fields(envelope,['workspaceId','input'],'recovery selection');
    if(envelope.workspaceId!==source.recoveryAccess.workspaceId)
      throw fail('INCIDENT_RECOVERY_SELECTION_CHANGED','The selected private recovery workspace changed. Refresh and review it before continuing.',409);
    const input=envelope.input;
    if(!input||typeof input!=='object'||Array.isArray(input))
      throw fail('INCIDENT_INPUT_INVALID','Supply the reviewed recovery input.');
    return tracked((async()=>{
      const value=await source.recoveryAccess.run(action,input);
      if(action!=='open')return value;
      if(closing)throw fail('INCIDENT_SOURCES_CLOSED','The incident console is closing.',503);
      const baseId=source.recoveryBaseId??source.id;
      const id='recovered-'+createHash('sha256').update(baseId+'\0'+value.directory).digest('hex').slice(0,24);
      let restored=sources.get(id),reused=Boolean(restored);
      if(restored) {
        if(restored.directory!==value.directory||restored.receivedIdentity?.dev!==value.identity.dev||
          restored.receivedIdentity?.ino!==value.identity.ino)
          throw fail('INCIDENT_RECOVERY_CHANGED','The opened recovery directory changed. Reopen the original console selection.',409);
      } else {
        if([...sources.values()].filter(row=>row.recoveryBaseId).length>=8)
          throw fail('INCIDENT_RECOVERY_PROFILE_LIMIT','Eight received stores are already open. Reopen this console to select another group.',409);
        const state=value.state,objectSessions=new Map(state.config.merchants.filter(row=>row.object).map(row=>
          [row.id,{id:row.id,label:row.label,directory:row.object.directory}]));
        const ckanWorkspaces=new Map(state.config.merchants.filter(row=>row.ckan).map(row=>
          [row.id,{id:row.id,label:row.label,directory:row.ckan.directory}]));
        const oauthResources=new Map(state.config.merchants.filter(row=>row.oauth).map(row=>
          [row.id,{id:row.id,label:row.label,oauth:normalizeOAuthSource(row.oauth)}]));
        const x402Merchants=new Map(state.config.merchants.filter(row=>row.x402).map(row=>
          [row.id,{id:row.id,label:row.label,x402:normalizeX402Source(row.x402)}]));
        restored={id,label:source.label.replace(/ · received .+$/,'')+' · received '+input.receiveName,
          directory:value.directory,store:await openIncidentStore(value.directory),
          configuration:{revision:state.configRevision,sha256:state.configHash},routeCache:new Map(),objectSessions,ckanWorkspaces,oauthResources,x402Merchants,
          recoveryDirectory:source.recoveryDirectory,recoveryBaseId:baseId,receivedIdentity:value.identity,
          recoveryAccess:await openIncidentRecoveryConsole({directory:value.directory,
            recoveryDirectory:source.recoveryDirectory,signal:readAbort.signal,allowContainedSource:true})};
        if(closing)throw fail('INCIDENT_SOURCES_CLOSED','The incident console is closing.',503);
        sources.set(id,restored);
      }
      return {source:publicSource(restored),profiles:profiles(),directory:restored.directory,receipt:value.receipt,
        recovery:recoveryView(value.state),watcherStarted:false,reused};
    })());
  }
  async function prepareCase(sourceId,incidentId,input) {
    const source=sourceFor(sourceId);identifier(incidentId,'incident ID');
    fields(input,['expectedRevision','workspaceText','routeId'],'incident case handoff');
    const revision=expectedRevision(input.expectedRevision);
    if(typeof input.workspaceText!=='string'||Buffer.byteLength(input.workspaceText)>MAX_WORKSPACE_BYTES)
      throw fail('INCIDENT_INPUT_INVALID','Supply the current serialized merchant workspace within its original size limit.');
    const workspaceText=input.workspaceText,workspace=await parseWorkspace(workspaceText);
    const routeId=text(input.routeId,80,'selected merchant route');
    const retained=await source.store.transaction(async(state,io)=>{
      const incident=currentIncident(state,incidentId,revision),files={};
      for(const side of ['before','after']) {
        const ref=incident[side+'Capture'];files[side]=ref?await io.readCapture(ref):null;
      }
      return {incident:structuredClone(incident),files};
    },{readonly:true});
    if(!retained.files.before&&!retained.files.after)
      throw fail('INCIDENT_NO_CAPTURE','This incident has no retained original capture to attach.',409);
    const capture=files=>files?inspectRuntimeFiles({files:encodedFiles(files),inputs:workspace.inputs,routeId}).capture:null;
    const supportText=JSON.stringify({schema:RUNTIME_SCHEMA,
      before:capture(retained.files.before),after:capture(retained.files.after)},null,2)+'\n';
    const incident=retained.incident,ack=incident.acknowledgment;
    const metadata=caseMetadata({merchant:incident.merchantLabel,owner:ack?.by??'',
      status:incident.status==='RECOVERED'?'ready':activeIncident(incident)?'in_progress':'waiting',followUpOn:'',
      nextAction:incident.status==='RECOVERED'?'Review the recovered original source capture in this case.':
        incident.status==='RETIRED'?'Review the retired source registration and current merchant configuration.':
          'Resolve the active '+incident.kind+' incident.',
      notes:'Original SF93 incident '+incident.id+'\nRegistered merchant: '+incident.merchantId+
        '\nCondition: '+incident.kind+'\nIncident state: '+incident.status+'\nOpened: '+incident.openedAt+
        '\nLast failing observation: '+incident.lastObservedAt+'\nClosed: '+(incident.closedAt??'open')+'\n'+
        (incident.retiredReason?'Retirement: '+incident.retiredReason+'; this is a registration change.\n':'')+
        (ack?'Acknowledged: '+ack.at+' by '+ack.by+'\n'+ack.notes+'\n':'No human acknowledgment recorded.\n')});
    const result=await exportRuntimeHandoff({workspaceText,supportText,metadata});
    return {source:publicSource(source),incidentId,revision,
      handoff:result.handoff,html:result.html,report:result.report};
  }
  return {profiles,configuration,list,view,serviceSnapshot,configure,acknowledge,notify,notification,inspectDestination,start,stop,close,prepareCase,inspectObject,inspectCkan,inspectOAuth,inspectX402,recoveryOverview,recoveryOperation};
}

