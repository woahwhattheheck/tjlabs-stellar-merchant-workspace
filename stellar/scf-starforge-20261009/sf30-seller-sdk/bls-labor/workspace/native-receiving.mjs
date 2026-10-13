// MIT. Continue the original BLS publisher and customer operation in one workspace.
import {lstat} from 'node:fs/promises';
import {join, resolve, relative} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {openBlsPublisher} from '../publisher/model.mjs';
import {blsPlanTemplate} from '../publisher/plan.mjs';
import {readBlsSource, BLS_COLUMNS} from '../source.mjs';
import {prepareBlsRelease} from '../release.mjs';
import {openDatasetVersions} from '../../dataset-refresh/versions.mjs';
import {stageDatasetRelease, inspectDatasetRelease, startDatasetRelease} from '../../../sf82-seller-pilot/release-dataset.mjs';
import {absolute, privateDirectory, acquireWorkspace, readJson,
  createFile, atomicJson, bytes, identity, fault, stamp, object}
  from '../../postgres/publisher/files.mjs';

export const NATIVE_REQUEST_SCHEMA='stellar-forge.bls-native-receiving-request.v1';
export const NATIVE_RESULT_SCHEMA='stellar-forge.bls-native-receiving.v1';
const STATE_SCHEMA='stellar-forge.bls-native-receiving-state.v1';
const PROJECTIONS=['laus','qcew','source_files'];
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const need=(condition,code,message)=>{if(!condition)throw fault(code,message,422);};
const keys=(value,allowed)=>object(value)&&Object.keys(value).every(key=>allowed.includes(key));
const clone=value=>JSON.parse(JSON.stringify(value));
const contract=value=>{const {snapshot,rowCount,...description}=value;return identity(description);};
async function exists(path){try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
const fileName=(root,path)=>relative(root,path).split('\\').join('/');
const readable=(value,label,maximum)=>need(typeof value==='string'&&value.trim()&&value.length<=maximum,
  'BLS_NATIVE_REVIEW_REQUIRED','Enter '+label+'.');

export function validateNativeRequest(request){
  need(keys(request,['id','input','schema'])&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(request.id??''),
    'BLS_NATIVE_REQUEST_INVALID','Use the original workspace operation ID and complete input.');
  need(request.schema===undefined||request.schema===NATIVE_REQUEST_SCHEMA,
    'BLS_NATIVE_REQUEST_INVALID','Open the original native receiving request.');
  const input=request.input;
  need(keys(input,['source_sha256','projections','reviewer','note','existing','receive','releases']),
    'BLS_NATIVE_INPUT_INVALID','Use the supported publication and receiving fields.');
  need(HASH.test(input.source_sha256??''),'BLS_NATIVE_SOURCE_REQUIRED','Retain the selected complete source SHA-256.');
  need(Array.isArray(input.projections)&&input.projections.length>0&&
    new Set(input.projections).size===input.projections.length&&input.projections.every(value=>PROJECTIONS.includes(value)),
    'BLS_NATIVE_PROJECTIONS_REQUIRED','Select the complete original BLS projections.');
  readable(input.reviewer,'the actual reviewer name',128);readable(input.note,'the source review note',2000);
  need(input.existing===undefined||keys(input.existing,PROJECTIONS),'BLS_NATIVE_EXISTING_INVALID','Select original publisher IDs by projection.');
  for(const [projection,selected]of Object.entries(input.existing||{})){
    need(input.projections.includes(projection)&&keys(selected,['plan_id','run_id']),
      'BLS_NATIVE_EXISTING_INVALID','Select original IDs for an included projection.');
    need(selected.plan_id===undefined||Number.isSafeInteger(selected.plan_id)&&selected.plan_id>0,
      'BLS_NATIVE_EXISTING_INVALID','Use the original saved plan number.');
    need(selected.run_id===undefined||UUID.test(selected.run_id),'BLS_NATIVE_EXISTING_INVALID','Use the original extraction UUID.');
  }
  need(input.receive===undefined||['sources','vitality'].includes(input.receive),'BLS_NATIVE_RECEIVE_INVALID','Choose source or Vitality receiving.');
  need(!input.receive||input.projections.includes('source_files'),'BLS_NATIVE_SOURCE_FILES_REQUIRED','Include complete source_files for customer receiving.');
  need(input.releases===undefined||Array.isArray(input.releases)&&new Set(input.releases).size===input.releases.length&&
    input.releases.every(value=>input.projections.includes(value)),'BLS_NATIVE_RELEASE_INVALID','Select releases from the included projections.');
  return request;
}
function validateConnection(connection){
  need(keys(connection,['schema','publishers','customer']),'BLS_NATIVE_CONNECTION_INVALID','Use the declared native BLS host connection.');
  need(connection.schema===undefined||connection.schema==='stellar-forge.bls-native-connection.v1',
    'BLS_NATIVE_CONNECTION_INVALID','Use the declared native BLS host connection.');
  need(connection.publishers===undefined||keys(connection.publishers,PROJECTIONS),'BLS_NATIVE_CONNECTION_INVALID','Declare publisher settings by projection.');
  for(const selected of Object.values(connection.publishers||{})){
    need(keys(selected,['seller_file','release_directory','runtime']),'BLS_NATIVE_CONNECTION_INVALID','Choose the original seller or staged dataset release.');
    if(selected.seller_file)absolute(selected.seller_file,'seller file');
    if(selected.release_directory)absolute(selected.release_directory,'staged release directory');
  }
  if(connection.customer!==undefined){
    const c=connection.customer;
    need(keys(c,['checkout','session','python','node','delivery','sources','timeout','continue_acquisition','vitality']),
      'BLS_NATIVE_CONNECTION_INVALID','Use the original customer session and receiving configuration.');
    for(const key of ['checkout','session','python','delivery','sources'])absolute(c[key],'customer '+key);
    if(c.node)absolute(c.node,'customer Node executable');
    need(c.timeout===undefined||Number.isFinite(c.timeout)&&c.timeout>0,'BLS_NATIVE_CONNECTION_INVALID','Use the original customer timeout.');
    need(c.continue_acquisition===undefined||typeof c.continue_acquisition==='boolean','BLS_NATIVE_CONNECTION_INVALID','Choose whether to continue the existing acquisition.');
    if(c.vitality!==undefined){
      need(keys(c.vitality,['source','workspace','operator','catalog','only']),'BLS_NATIVE_CONNECTION_INVALID','Select the original Vitality application and catalogue.');
      absolute(c.vitality.source,'Vitality source');absolute(c.vitality.workspace,'Vitality workspace');
      readable(c.vitality.operator,'the actual Vitality operator',128);
      if(c.vitality.catalog)absolute(c.vitality.catalog,'Vitality catalogue');
      if(c.vitality.only!==undefined)need(Array.isArray(c.vitality.only)&&c.vitality.only.length&&
        new Set(c.vitality.only).size===c.vitality.only.length&&c.vitality.only.every(value=>typeof value==='string'&&value),
        'BLS_NATIVE_CONNECTION_INVALID','Choose the original catalogue entries.');
    }
  }
  return connection;
}
function history(publisher,kind){
  let offset=0;const result=[];
  do{
    const page=publisher.status({limit:100,[kind+'Offset']:offset});
    result.push(...page[kind]);offset=page.pages[kind].next;
  }while(offset!==null);
  return result;
}
function samePlan(plan,source,projection){
  return plan.data.sourceHash===source.hash&&plan.data.captureHash===source.captureHash&&plan.data.query===projection&&
    identity(plan.data.dataset.columns)===identity(Object.fromEntries(Object.entries(BLS_COLUMNS[projection]).map(([name,spec])=>[name,{type:spec.type,nullable:spec.nullable??false}])));
}
function savedRun(publisher,id){try{return publisher.run(id);}catch(error){if(error.code==='RUN_NOT_FOUND')return null;throw error;}}
async function exactJSON(path,value){
  if(await exists(path)){const saved=await readJson(path,8*1024*1024);need(identity(saved)===identity(value),
    'BLS_NATIVE_REQUEST_CHANGED','Resume this operation with its original complete input.');}
  else await createFile(path,bytes(value));
}
async function completeCustomer({connectionFile,connection,mode,captureId,directory,state,save,signal}){
  need(connection.customer,'BLS_NATIVE_CUSTOMER_REQUIRED','Declare the original customer session in the native connection.');
  need(mode!=='vitality'||connection.customer.vitality,'BLS_NATIVE_VITALITY_REQUIRED','Declare the original Vitality receiving workspace.');
  const attempt=(state.customer?.attempt||0)+1;
  state.customer={...(state.customer||{}),attempt,state:'running'};await save();
  const prefix='customer-'+String(attempt).padStart(4,'0');
  const result=await new Promise((done,reject)=>{
    const output=[],errors=[];let outputBytes=0,errorBytes=0,failure=null;
    const child=spawn(connection.customer.python,[fileURLToPath(new URL('./native-customer.py',import.meta.url)),
      '--connection',connectionFile,'--capture-id',captureId,'--mode',mode],
      {stdio:['ignore','pipe','pipe'],shell:false});
    const abort=()=>{failure=fault('BLS_NATIVE_CANCELLED','The original receiving operation was interrupted.');child.kill('SIGTERM');};
    signal?.addEventListener('abort',abort,{once:true});
    const take=(list,isError)=>chunk=>{
      if(isError)errorBytes+=chunk.length;else outputBytes+=chunk.length;
      if((isError?errorBytes:outputBytes)>8*1024*1024){failure=fault('BLS_NATIVE_RETURN_TOO_LARGE','Retain the original native return within 8 MiB.');child.kill('SIGTERM');return;}
      list.push(chunk);
    };
    child.stdout.on('data',take(output,false));child.stderr.on('data',take(errors,true));
    child.once('error',error=>{signal?.removeEventListener('abort',abort);reject(error);});
    child.once('close',(code,closedSignal)=>{signal?.removeEventListener('abort',abort);
      done({code,signal:closedSignal,output:Buffer.concat(output),errors:Buffer.concat(errors),failure});});
    if(signal?.aborted)abort();
  });
  await createFile(join(directory,prefix+'.stdout'),result.output);
  await createFile(join(directory,prefix+'.stderr'),result.errors);
  state.customer={attempt,state:result.code===0&&!result.failure?'complete':'failed',
    stdout:prefix+'.stdout',stderr:prefix+'.stderr',exit_code:result.code,signal:result.signal};await save();
  if(result.failure)throw result.failure;
  if(result.code!==0)throw fault('BLS_NATIVE_CUSTOMER_FAILED','The original customer receiver failed; its complete stdout and stderr are retained.',422);
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result.output));}
  catch{throw fault('BLS_NATIVE_CUSTOMER_RETURN_INVALID','The original receiver did not return complete JSON.');}
  need(value.schema==='stellar-forge.bls-native-customer.v1'&&value.received?.capture_id===captureId,
    'BLS_NATIVE_CUSTOMER_CAPTURE_CHANGED','The customer received a different original BLS capture.');
  state.customer.result=value;await save();return value;
}

/** The caller serializes its analyst operation and closes only the selected
 * publisher children. This function never opens the analyst SQLite database. */
export async function continueBlsNativeReceiving({directory,request,connectionFile,signal,onProgress}={}){
  absolute(directory);validateNativeRequest(request);await privateDirectory(directory);
  const input=request.input,operationDirectory=join(directory,'native-publications',request.id);
  await privateDirectory(operationDirectory,true);
  const releaseOperation=await acquireWorkspace(operationDirectory),sessions=new Map();
  let state,connection={},source;
  const save=async()=>{state.updated_at=stamp();await atomicJson(operationDirectory,'state.json',state);
    onProgress?.({operation_id:request.id,phase:state.phase,projections:clone(state.projections)});};
  const stopped=()=>{if(signal?.aborted)throw fault('BLS_NATIVE_CANCELLED','Continue the original saved operation after interruption.');};
  const closeSessions=async()=>{
    const errors=[];
    for(const [projection,session]of [...sessions.entries()].reverse()){
      try{await session.close();sessions.delete(projection);}
      catch(error){errors.push({projection,code:error.code||'DATASET_CLOSE_FAILED',message:error.message});}
    }
    if(errors.length)throw Object.assign(fault('BLS_NATIVE_CLOSE_FAILED','The original dataset service did not finish closing.'),{details:errors});
  };
  try{
    await exactJSON(join(operationDirectory,'request.json'),request);
    const statePath=join(operationDirectory,'state.json');
    if(await exists(statePath)){
      state=await readJson(statePath,8*1024*1024);
      need(state.schema===STATE_SCHEMA&&state.request_sha256===identity(request),
        'BLS_NATIVE_STATE_CHANGED','The retained native operation differs from its original request.');
      if(state.state==='complete'){
        const completed=await readJson(join(operationDirectory,'result.json'),8*1024*1024);
        need(identity(completed)===state.result_sha256,'BLS_NATIVE_RESULT_CHANGED','The retained complete native result changed.');
        return completed;
      }
    }else state={schema:STATE_SCHEMA,operation_id:request.id,request_sha256:identity(request),
      created_at:stamp(),state:'running',phase:'source',projections:{}};
    source=await readBlsSource(join(directory,'source.json'));
    need(source.hash===input.source_sha256,'BLS_NATIVE_SOURCE_CHANGED','Select the original source edition retained in this operation.');
    if(connectionFile){absolute(connectionFile,'native connection file');connection=validateConnection(await readJson(connectionFile,262144));}
    const connectionHash=identity(connection);
    if(state.connection_sha256!==connectionHash){
      (state.connection_history??=[]).push({sha256:connectionHash,recorded_at:stamp()});
      state.connection_sha256=connectionHash;
    }
    state.source_sha256=source.hash;state.capture_id=source.captureHash;
    state.state='running';delete state.error;await save();

    async function stage(publisher,runId,projection,label){
      const selected=connection.publishers?.[projection];
      need(selected?.seller_file,'BLS_NATIVE_SELLER_REQUIRED','Declare the original '+projection+' seller file in the native connection.');
      const parent=join(operationDirectory,'releases');await privateDirectory(parent,true);
      const localLabel=label+'-'+identity({targetDirectory:publisher.settings.targetDirectory}).slice(0,16);
      const packagePath=join(parent,localLabel+'-package'),releasePath=join(parent,localLabel+'-staged');
      await prepareBlsRelease({publisher,runId,sellerFile:selected.seller_file,outputDirectory:packagePath});
      const staged=await exists(releasePath)?await inspectDatasetRelease(releasePath):await stageDatasetRelease(releasePath,packagePath);
      need(staged.dataset.datasetDirectory===publisher.settings.targetDirectory,
        'BLS_NATIVE_TARGET_CHANGED','The staged release belongs to a different original dataset store.');
      return {package_path:fileName(directory,packagePath),release_path:fileName(directory,releasePath),
        snapshot:staged.dataset.baselineSnapshot,files:staged.files};
    }
    async function ensureRuntime(publisher,projection,preferredRun){
      let target=await publisher.target();if(target.connected||target.initializable)return target;
      if(!sessions.has(projection)){
        const selected=connection.publishers?.[projection];let releasePath=selected?.release_directory;
        if(releasePath){
          const original=await inspectDatasetRelease(releasePath);
          need(original.dataset.datasetDirectory===publisher.settings.targetDirectory,
            'BLS_NATIVE_TARGET_CHANGED','The configured release belongs to a different original dataset store.');
        }else{
          let versions,current,targetContract;
          try{
            versions=await openDatasetVersions({directory:publisher.settings.targetDirectory});
            current=versions.status().current;targetContract=contract(versions.describe());
          }finally{await versions?.close();}
          const candidates=history(publisher,'runs').filter(run=>run.state==='PUBLISHED');
          candidates.sort((left,right)=>Number(right.id===preferredRun)-Number(left.id===preferredRun)||
            Number(right.data.publication?.snapshot===current)-Number(left.data.publication?.snapshot===current));
          let original;
          for(const candidate of candidates){
            const retained=await publisher.candidate(candidate.id);
            if(contract(retained.dataset.describe())===targetContract){original=candidate;break;}
          }
          need(original,'BLS_NATIVE_ORIGINAL_RELEASE_REQUIRED','Declare the existing staged release for this original dataset.');
          const retained=await stage(publisher,original.id,projection,projection+'-runtime-'+identity({current,publication:original.data.publication}).slice(0,16));
          releasePath=join(directory,retained.release_path);
        }
        const session=await startDatasetRelease(releasePath,{runtime:selected?.runtime||{port:0}});
        sessions.set(projection,session);
      }
      target=await publisher.target();
      need(target.connected,'BLS_NATIVE_TARGET_UNAVAILABLE','The original dataset service did not open its native control connection.');
      return target;
    }

    for(const projection of input.projections){
      stopped();state.phase=projection;
      const row=state.projections[projection]??={projection,attempts:[]};
      const publisherDirectory=join(directory,'publishers',projection),targetDirectory=join(directory,'datasets',projection);
      const create=!await exists(publisherDirectory);
      const publisher=await openBlsPublisher({directory:publisherDirectory,create,
        sourceFile:join(directory,'source.json'),targetDirectory,relativePaths:true});
      try{
        const specified=input.existing?.[projection]||{};
        let plan=row.plan_id?publisher.plan(row.plan_id):specified.plan_id?publisher.plan(specified.plan_id):null;
        let run=row.run_id?savedRun(publisher,row.run_id):specified.run_id?publisher.run(specified.run_id):null;
        if(run&&!plan)plan=publisher.plan(run.plan);
        if(plan)need(samePlan(plan,source,projection)&&(!run||run.plan===plan.id),
          'BLS_NATIVE_ORIGINAL_PLAN_CHANGED','Select the complete original plan for this BLS source and projection.');
        if(!plan){
          const plans=history(publisher,'plans').filter(value=>samePlan(value,source,projection)),ids=new Set(plans.map(value=>value.id));
          const runs=history(publisher,'runs').filter(value=>ids.has(value.plan));
          run=runs.find(value=>value.state==='PUBLISHED')||runs.find(value=>['REVIEWED','READY','PUBLICATION_UNKNOWN','INTERRUPTED','FAILED','CANCELLED'].includes(value.state))||null;
          plan=run?publisher.plan(run.plan):plans[0]||null;
        }
        if(!plan){
          row.plan_request_id??=randomUUID();
          row.plan_input??=await blsPlanTemplate(join(directory,'source.json'),projection,
            projection==='laus'?'Resident labor statistics':projection==='qcew'?'Workplace employment and wages':'Complete original BLS sources');
          await save();plan=await publisher.savePlan(row.plan_input,{requestId:row.plan_request_id});
        }
        row.plan_id=plan.id;row.plan_digest=plan.data.digest;
        if(run)row.run_id=run.id;
        if(!row.run_id){row.run_id=randomUUID();row.attempts.push({id:row.run_id,created_at:stamp()});}
        await save();
        run=savedRun(publisher,row.run_id);
        if(run&&['INTERRUPTED','FAILED','CANCELLED'].includes(run.state)){
          try{run=await publisher.recover(run.id);}
          catch(error){
            if(error.code!=='ENOENT')throw error;
            row.attempts.push({id:randomUUID(),created_at:stamp(),previous_id:run.id,previous_state:run.state});
            row.run_id=row.attempts.at(-1).id;run=null;await save();
          }
        }
        if(!run){
          stopped();const extraction=publisher.startExtraction(plan.id,{id:row.run_id});
          const abort=()=>{try{publisher.cancel(extraction.id);}catch{}};
          signal?.addEventListener('abort',abort,{once:true});
          try{run=await extraction.completion;}finally{signal?.removeEventListener('abort',abort);}
        }
        row.native_state=run.state;await save();
        need(!['EXTRACTING','INTERRUPTED','FAILED','CANCELLED'].includes(run.state),
          'BLS_NATIVE_EXTRACTION_INCOMPLETE','The original '+projection+' extraction returned '+run.state+'; its run and source are retained.');
        let candidate=await publisher.candidate(run.id);
        need(candidate.manifest.extraction.captureHash===source.captureHash&&candidate.manifest.extraction.projection===projection,
          'BLS_NATIVE_CANDIDATE_CHANGED','The candidate belongs to another original BLS source or projection.');
        if(run.state==='PUBLICATION_UNKNOWN'){
          const observed=await publisher.target();
          if(!observed.initializable){
            if(!observed.connected&&run.data.review?.target.mode!=='initialize')await ensureRuntime(publisher,projection,run.id);
            run=await publisher.recover(run.id);
          }
        }
        let activePublication=false;
        if(run.state==='PUBLISHED'){
          const observed=await publisher.target();let versions,observedVersions=observed.versions;
          if(!observed.connected){
            try{versions=await openDatasetVersions({directory:publisher.settings.targetDirectory});observedVersions=versions.status();}
            finally{await versions?.close();}
          }
          activePublication=observedVersions.current===candidate.manifest.dataset.snapshot&&
            observedVersions.versions.some(value=>value.snapshot===candidate.manifest.dataset.snapshot&&value.csvHash===candidate.manifest.csvHash);
        }
        if(!activePublication){
          const target=await ensureRuntime(publisher,projection,run.id),savedReview=run.data.review;
          const currentReview=['REVIEWED','PUBLICATION_UNKNOWN'].includes(run.state)&&savedReview&&
            savedReview.candidateDigest===candidate.manifest.candidateDigest&&
            savedReview.target.directory===publisher.settings.targetDirectory&&
            (target.initializable?savedReview.target.mode==='initialize':
              savedReview.target.mode==='refresh'&&savedReview.target.expectedSnapshot===target.versions.current&&
              savedReview.target.expectedRevision===target.versions.revision);
          if(!currentReview){
            const review={reviewer:input.reviewer.trim(),note:input.note.trim(),
              ...(target.initializable?{initialize:true}:{expectedSnapshot:target.versions.current,expectedRevision:target.versions.revision})};
            const {requestId:oldRequestId,...oldReview}=row.review_input||{};
            if(!oldRequestId||identity(oldReview)!==identity(review)||run.data.error||['REVIEWED','PUBLICATION_UNKNOWN'].includes(run.state)){
              if(row.review_input)(row.previous_reviews??=[]).push(clone(row.review_input));
              row.review_input={requestId:randomUUID(),...review};
            }
            await save();run=await publisher.review(run.id,row.review_input);
          }
          row.review_id=run.data.review?.id;await save();stopped();
          run=await publisher.publish(run.id,row.review_id);
        }
        need(run.state==='PUBLISHED','BLS_NATIVE_PUBLICATION_INCOMPLETE',
          'The original '+projection+' publisher returned '+run.state+(run.data.error?': '+run.data.error:'.'));
        candidate=await publisher.candidate(run.id);
        Object.assign(row,{native_state:run.state,candidate_digest:candidate.manifest.candidateDigest,
          snapshot:candidate.manifest.dataset.snapshot,row_count:candidate.manifest.extraction.rowCount,
          publication:clone(run.data.publication),publisher_path:fileName(directory,publisherDirectory),
          target_path:fileName(directory,publisher.settings.targetDirectory)});
        if(input.releases?.includes(projection))row.release=await stage(publisher,run.id,projection,projection+'-published-'+identity(run.data.publication).slice(0,16));
        if(input.receive&&projection==='source_files')await ensureRuntime(publisher,projection,run.id);
        row.complete=true;await save();
      }finally{await publisher.close();}
    }
    let customer=state.customer?.result;
    if(input.receive&&!customer){
      stopped();state.phase='customer';await save();
      need(connectionFile,'BLS_NATIVE_CUSTOMER_REQUIRED','Select the original native host connection for customer receiving.');
      customer=await completeCustomer({connectionFile,connection,mode:input.receive,captureId:source.captureHash,
        directory:operationDirectory,state,save,signal});
    }
    state.phase='closing';await save();await closeSessions();
    const result={schema:NATIVE_RESULT_SCHEMA,operation_id:request.id,source_sha256:source.hash,
      capture_id:source.captureHash,complete:true,completed_at:stamp(),
      runtime:{node:process.version,platform:process.platform},
      projections:input.projections.map(projection=>clone(state.projections[projection])),
      ...(customer?{customer}:{}),operation_path:fileName(directory,operationDirectory)};
    await atomicJson(operationDirectory,'result.json',result);
    state.state='complete';state.phase='complete';state.result_sha256=identity(result);await save();
    return result;
  }catch(error){
    if(state){state.state='failed';state.error={code:error.code||'BLS_NATIVE_OPERATION_FAILED',message:String(error.message)};
      await save().catch(()=>{});}
    throw error;
  }finally{
    try{await closeSessions();}finally{await releaseOperation();}
  }
}
export async function main(argv=process.argv.slice(2)){
  const options={};
  for(let index=0;index<argv.length;index+=2){
    const key=argv[index],value=argv[index+1];
    need(['--workspace','--request','--connection'].includes(key)&&!own(options,key)&&value,
      'BLS_NATIVE_USAGE','Use --workspace DIRECTORY --request ORIGINAL.json [--connection HOST.json].');
    options[key]=value;
  }
  need(options['--workspace']&&options['--request'],'BLS_NATIVE_USAGE','Select the original workspace and complete request.');
  const controller=new AbortController(),stop=()=>controller.abort();
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
    const result=await continueBlsNativeReceiving({directory:resolve(options['--workspace']),
      request:await readJson(resolve(options['--request']),8*1024*1024),
      connectionFile:options['--connection']?resolve(options['--connection']):undefined,signal:controller.signal});
    process.stdout.write(JSON.stringify(result)+'\n');return result;
  }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{process.stderr.write(JSON.stringify({error:error.code||'BLS_NATIVE_OPERATION_FAILED',message:error.message})+'\n');process.exitCode=1;});
