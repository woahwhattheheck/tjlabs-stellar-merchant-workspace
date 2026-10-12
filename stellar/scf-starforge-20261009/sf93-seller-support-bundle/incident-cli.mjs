#!/usr/bin/env node
// MIT. Original SF93 continuous incident operation and portable support handoff.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {initializeIncidentStore,readPrivateFile,openIncidentStore} from './incident-store.mjs';
import {resolveDestination} from './notifications.mjs';
import {exportIncidentSnapshot,inspectIncidentSnapshot,receiveIncidentSnapshot,
  inspectIncidentRecovery,reconcileIncidentRecovery,listIncidentSnapshotPins,abandonIncidentSnapshot} from './incident-recovery.mjs';
import {inspectSlackDestination} from './notifications-slack.mjs';
import {runIncidentWatch} from './watch.mjs';
import {reviewObjectSource} from './object-source.mjs';
import {acknowledgeIncident,configureIncidents,incidentStatus,remindIncident,
  operateNotification,pruneIncidents,exportIncident} from './incident-operator.mjs';

const usage=`SF93 merchant incident operations (Node 22+, Linux flock)

review-object --session ORIGINAL_DIRECTORY [--max-bytes N] [--max-chunks N] [--timeout-ms N]
              [--financial-after-seconds N] [--output-after-seconds N]
init      --state NEW_DIRECTORY --config PRIVATE_CONFIG
run       --state DIRECTORY
status    --state DIRECTORY [--details]
destination --state DIRECTORY
ack       --state DIRECTORY --incident ID --revision N --by OPERATOR [--note-file PRIVATE_FILE]
notify    --state DIRECTORY --incident ID --revision N
retry     --state DIRECTORY --event ID --attempts N --by OPERATOR
cancel    --state DIRECTORY --event ID --attempts N --by OPERATOR
configure --state DIRECTORY --config PRIVATE_CONFIG --config-revision N
prune     --state DIRECTORY
export    --state DIRECTORY --incident ID --revision N --workspace PRIVATE_SF74_FILE --route ID --out NEW_DIRECTORY
snapshot  --state DIRECTORY --out SNAPSHOT_DIRECTORY --operation ID --revision N
inspect-snapshot --snapshot DIRECTORY --manifest-sha SHA256
receive-snapshot --snapshot DIRECTORY --state NEW_DIRECTORY --operation ID --manifest-sha SHA256
snapshot-pins --state DIRECTORY
abandon-snapshot --state DIRECTORY --out SNAPSHOT_DIRECTORY --operation ID --pin-sha SHA256 --by OPERATOR --note-file PRIVATE_FILE
recovery --state DIRECTORY
reconcile-recovery --state DIRECTORY --input PRIVATE_REVIEW_JSON

review-object reads the original saved buyer and returns its exact registration for operator review.
It performs no purchase, assembly, finalization or notification. See OBJECT_MONITORING.md.
run owns only the watcher. SIGINT/SIGTERM finishes its current state write and releases its kernel lease.
Notifications use the configured webhook URL/signing key or Slack token environment reference.
destination reads the current Slack actor/workspace; its command sends no notification.
status contains private merchant operational metadata; --details also includes acknowledgment notes.
snapshot freezes a complete revision while its live source keeps capture references pinned.
Repeat the identical snapshot operation to resume. Abandon explicitly releases its capture pin.
Use --pin-sha none only for an interrupted selection that never published a capture pin.
receive-snapshot creates a separate private store; unfinished notification deliveries are held.
Inspect recovery, confirm the original writer is stopped, then reconcile its exact saved queue.
Individual restored deliveries still require the original explicit retry action.
Snapshot directory publication uses the original SF88 Linux/Python 3 no-replace helper.
See INCIDENT_RECOVERY.md and INCIDENT_OPERATIONS.md for complete receiving and case import.
`;
const shapes={'review-object':['session','max-bytes','max-chunks','timeout-ms','financial-after-seconds','output-after-seconds'],init:['config'],run:[],status:[],destination:[],ack:['incident','revision','by','note-file'],
  notify:['incident','revision'],retry:['event','attempts','by'],cancel:['event','attempts','by'],
  configure:['config','config-revision'],prune:[],export:['incident','revision','workspace','route','out'],
  snapshot:['out','operation','revision'],'inspect-snapshot':['snapshot','manifest-sha'],
  'receive-snapshot':['snapshot','operation','manifest-sha'],'snapshot-pins':[],
  'abandon-snapshot':['out','operation','pin-sha','by','note-file'],recovery:[],'reconcile-recovery':['input']};
function parse(args) {
  if(!args.length||args.length===1&&['--help','help'].includes(args[0]))return null;
  const [command,...flags]=args;if(!Object.hasOwn(shapes,command))throw new TypeError(usage);
  const values={};
  for(let i=0;i<flags.length;i++) {
    const flag=flags[i];
    if(command==='status'&&flag==='--details'&&!Object.hasOwn(values,'details')){values.details=true;continue;}
    const key=flag.slice(2);
    if(!flag.startsWith('--')||!(['review-object','inspect-snapshot'].includes(command)?shapes[command]:['state',...shapes[command]]).includes(key)||Object.hasOwn(values,key)||
        !flags[i+1]||flags[i+1].startsWith('--'))throw new TypeError(usage);
    values[key]=flags[++i];
  }
  const required=command==='review-object'?['session']:command==='inspect-snapshot'?shapes[command]:
    ['state',...shapes[command].filter(key=>key!=='note-file'||command==='abandon-snapshot')];
  if(required.some(key=>!values[key]))throw new TypeError(usage);
  for(const key of ['revision','attempts','config-revision'])if(values[key]!==undefined) {
    if(!/^(0|[1-9]\d*)$/.test(values[key]))throw new TypeError('Expected an exact integer for --'+key);
    values[key]=Number(values[key]);
    if(!Number.isSafeInteger(values[key])||values[key]<(key==='attempts'?0:1))throw new TypeError('Invalid --'+key);
  }
  for(const key of ['max-bytes','max-chunks','timeout-ms','financial-after-seconds','output-after-seconds'])if(values[key]!==undefined) {
    if(!/^(0|[1-9]\d*)$/.test(values[key]))throw new TypeError('Expected an exact integer for --'+key);
    values[key]=Number(values[key]);
    if(!Number.isSafeInteger(values[key]))throw new TypeError('Invalid --'+key);
  }
  return {command,values};
}
const privateText=async(path,max)=>new TextDecoder('utf-8',{fatal:true}).decode(await readPrivateFile(resolve(path),max));
export async function main(args=process.argv.slice(2)) {
  const parsed=parse(args);if(!parsed){process.stdout.write(usage);return;}
  const {command,values:v}=parsed;
  if(command==='review-object') {
    const controller=new AbortController(),stop=()=>controller.abort();
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
    try {
      const names={'max-bytes':'maxBytes','max-chunks':'maxChunks','timeout-ms':'timeoutMs',
        'financial-after-seconds':'financialAfterSeconds','output-after-seconds':'outputAfterSeconds'};
      const input={directory:resolve(v.session),...Object.fromEntries(Object.entries(names)
        .filter(([flag])=>v[flag]!==undefined).map(([flag,key])=>[key,v[flag]]))};
      const result=await reviewObjectSource(input,{signal:controller.signal});
      process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
    } finally {process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  }
  if(['snapshot','inspect-snapshot','receive-snapshot','snapshot-pins','abandon-snapshot','recovery','reconcile-recovery'].includes(command)) {
    const controller=new AbortController(),stop=()=>controller.abort();
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
    try {
      const signal=controller.signal,directory=v.state?resolve(v.state):undefined;
      let result;
      if(command==='snapshot')result=await exportIncidentSnapshot({directory,outputDirectory:resolve(v.out),
        operationId:v.operation,expectedRevision:v.revision,signal});
      else if(command==='inspect-snapshot')result=await inspectIncidentSnapshot({directory:resolve(v.snapshot),
        expectedManifestSha256:v['manifest-sha'],signal});
      else if(command==='receive-snapshot')result=await receiveIncidentSnapshot({directory,snapshotDirectory:resolve(v.snapshot),
        operationId:v.operation,expectedManifestSha256:v['manifest-sha'],signal});
      else if(command==='snapshot-pins')result=await listIncidentSnapshotPins({directory,signal});
      else if(command==='abandon-snapshot')result=await abandonIncidentSnapshot({directory,outputDirectory:resolve(v.out),
        operationId:v.operation,expectedPinSha256:v['pin-sha']==='none'?null:v['pin-sha'],by:v.by,notes:await privateText(v['note-file'],2000),signal});
      else if(command==='recovery')result=await inspectIncidentRecovery({directory,signal});
      else {
        const input=JSON.parse(await privateText(v.input,65_536));
        if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>
          !['operationId','expectedRecoveryId','expectedManifestSha256','expectedQueueSha256','expectedConfigHash','originalWriterStopped','by','notes'].includes(key)))
          throw new TypeError('Use the exact inspected recovery selection and operator acknowledgment.');
        result=await reconcileIncidentRecovery({...input,directory,signal});
      }
      process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
    } finally {process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  }
  const directory=resolve(v.state);let result;
  const incident={directory,id:v.incident,expectedRevision:v.revision};
  if(command==='init'||command==='configure') {
    const config=JSON.parse(await privateText(v.config,65_536));
    result=command==='init'?await initializeIncidentStore({directory,config}):
      await configureIncidents({directory,config,expectedConfigRevision:v['config-revision']});
  } else if(command==='run') {
    const controller=new AbortController(),stop=()=>controller.abort();
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
    try {result=await runIncidentWatch({directory,signal:controller.signal,
      onReady:state=>process.stdout.write(JSON.stringify({event:'WATCH_READY',...state})+'\n')});}
    finally {process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  } else if(command==='status')result=await incidentStatus({directory,details:Boolean(v.details)});
  else if(command==='destination') {
    const state=await(await openIncidentStore(directory)).read();
    const selected=resolveDestination(state.config,process.env);
    if(selected.reason)result={accepted:false,reason:selected.reason};
    else if(selected.transport!=='slack')result={accepted:true,reason:'WEBHOOK_CONFIGURATION_RESOLVED',
      destinationId:selected.binding.id};
    else result=await inspectSlackDestination(selected,state.config.notification);
    if(!result.accepted)process.exitCode=1;
  }
  else if(command==='ack')result=await acknowledgeIncident({...incident,by:v.by,
    notes:v['note-file']?await privateText(v['note-file'],2000):''});
  else if(command==='notify')result=await remindIncident(incident);
  else if(command==='retry'||command==='cancel')result=await operateNotification({directory,id:v.event,
    expectedAttempts:v.attempts,action:command,by:v.by});
  else if(command==='prune')result=await pruneIncidents({directory});
  else if(command==='export')result=await exportIncident({...incident,workspaceFile:v.workspace,routeId:v.route,out:v.out});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
}

