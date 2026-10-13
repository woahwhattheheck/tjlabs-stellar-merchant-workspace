// MIT. TokenJunkieLabs. Continue an existing merchant customer case and its original journals.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,link,unlink,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {privateSupportDirectory,writePrivate} from '../../stellar-forge/mcp-merchant-operator/config.mjs';
import {connectAccountingReceivablesClient} from '../../stellar-forge/mcp-merchant-operator/accounting-receivables-client.mjs';
import {accountingMaintenanceArguments,connectAccountingMaintenanceClient} from '../../stellar-forge/mcp-merchant-operator/accounting-maintenance-client.mjs';
import {prepareAccountingReceivablesOperation,runAccountingReceivablesOperation,
  downloadAccountingReceivablesFile} from '../../stellar-forge/mcp-merchant-operator/accounting-receivables-cli.mjs';
import {prepareAccountingMaintenanceOperation,runAccountingMaintenanceOperation}
  from '../../stellar-forge/mcp-merchant-operator/accounting-maintenance-cli.mjs';
import {customerCaseHtml} from './durable-customer-case-html.mjs';

const CASE='stellar-forge.durable-customer-case.v1', EDITION='stellar-forge.durable-customer-case-edition.v1';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/, SHA=/^[a-f0-9]{64}$/;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x), now=()=>new Date().toISOString();
const json=x=>JSON.stringify(x,null,2)+'\n', sha=x=>createHash('sha256').update(x).digest('hex');
function need(ok,message,code='ARGUMENTS'){if(!ok)throw Object.assign(new Error(message),{code:'DURABLE_CUSTOMER_CASE_'+code});}
function exact(x,keys){need(plain(x)&&Object.keys(x).every(k=>keys.includes(k)),'Use only the declared case fields.');}
function id(x,label){need(typeof x==='string'&&UUID.test(x),'Use the original '+label+' UUID.');return x;}
function date(x){need(typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
  new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x,'Use a real calendar date.');return x;}
function pathPart(x){need(typeof x==='string'&&/^[A-Za-z0-9._-]+$/.test(x)&&x!=='.'&&x!=='..','Use one original file path component.');return x;}
function relative(x){need(typeof x==='string'&&x.length<1000&&x.split('/').every(v=>pathPart(v)),'Use a relative original file path.');return x;}
function issue(error){return{code:error?.code??'ERROR',message:String(error?.message??error),...(error?.details?{details:error.details}:{})};}
async function exists(path){try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function directory(path){path=resolve(path);await privateSupportDirectory(path);const s=await lstat(path);
  need(s.isDirectory()&&!s.isSymbolicLink()&&!(s.mode&0o077)&&(!process.getuid||s.uid===process.getuid())&&
    await realpath(path)===path,'Use an owner-controlled private directory without symlink ancestors.','PRIVATE_DIRECTORY');return path;}
async function sync(path){const f=await open(path,constants.O_RDONLY|(constants.O_DIRECTORY??0));try{await f.sync();}finally{await f.close();}}
async function bytes(path,maximum=128_000_000){const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  try{const s=await f.stat();need(s.isFile()&&s.nlink===1&&!(s.mode&0o077)&&(!process.getuid||s.uid===process.getuid())&&s.size<=maximum,
    'Use a complete owner-controlled private regular file.','PRIVATE_FILE');const b=await f.readFile();need(b.length<=maximum,'The file exceeds its complete read limit.','PRIVATE_FILE');return b;}finally{await f.close();}}
async function read(path,maximum){return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await bytes(path,maximum)));}
async function retain(path,value){const body=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:json(value));
  await directory(dirname(path));if(await exists(path)){need((await bytes(path)).equals(body),'A retained file already exists with different contents.','RETAINED_FILE_CHANGED');return;}
  const temp=join(dirname(path),'.case-'+randomUUID()+'.partial'),f=await open(temp,'wx',0o600);
  try{await f.writeFile(body);await f.sync();await f.close();await link(temp,path);await unlink(temp);await sync(dirname(path));}
  catch(e){await f.close().catch(()=>{});await unlink(temp).catch(()=>{});throw e;}}
async function replace(path,value){const temp=join(dirname(path),'.case-'+randomUUID()+'.next');await writePrivate(temp,value);
  try{await rename(temp,path);await sync(dirname(path));}finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
function normalize(value){
  exact(value,['id','title','originalOperation','url','workspace','tokenEnv','workspaceId','customerId','asOf','cashPlans','requestIds']);
  const url=new URL(value.url);need(!url.username&&!url.password&&!url.search&&!url.hash&&
    (url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname)),'Use the existing merchant HTTPS or loopback HTTP endpoint.');
  need(typeof value.title==='string'&&value.title.trim().length>0&&value.title.length<=300,'Name the retained customer case.');
  need(typeof value.originalOperation==='string'&&value.originalOperation.length>0&&value.originalOperation.length<=300,'Retain the original receiving or business operation.');
  need(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.workspace??'')&&SHA.test(value.workspaceId??''),'Select the original alias and workspace identity.');
  need(/^[A-Z][A-Z0-9_]{3,63}$/.test(value.tokenEnv??'MCP_ACCESS_TOKEN'),'Use a token environment variable name.');
  need(Array.isArray(value.cashPlans??[])&&Array.isArray(value.requestIds??[]),'Use selected original plans and request IDs.');
  const cashPlans=(value.cashPlans??[]).map(row=>{exact(row,['cashPlanId','editionId']);return{
    cashPlanId:id(row.cashPlanId,'cash plan'),editionId:id(row.editionId,'cash-plan edition')};});
  const requestIds=(value.requestIds??[]).map(v=>{need(typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(v),'Use an original retained request ID.');return v;});
  need(new Set(cashPlans.map(x=>x.cashPlanId+'/'+x.editionId)).size===cashPlans.length&&new Set(requestIds).size===requestIds.length,'Select each original source once.');
  return{schema:CASE,id:id(value.id,'case'),title:value.title.trim(),originalOperation:value.originalOperation,
    url:url.href,workspace:value.workspace,tokenEnv:value.tokenEnv??'MCP_ACCESS_TOKEN',workspaceId:value.workspaceId,
    customerId:id(value.customerId,'customer'),asOf:date(value.asOf),cashPlans,requestIds};
}
async function loadCase(path){path=await directory(path);const selected=await read(join(path,'case.json'),1_000_000);
  need(selected.schema===CASE,'Choose an existing durable customer case.');const {schema,...input}=selected;return{path,selected:normalize(input)};}
async function locked(path,work){const context=await loadCase(path),lease=await acquireStateLease(context.path);let problem;
  try{return await work({...context,lease});}catch(e){problem=e;throw e;}finally{try{await lease.close();}catch(e){if(problem)problem.releaseError=issue(e);else throw e;}}}
async function receivables(selected,provided,environment,signal){const client=provided??await connectAccountingReceivablesClient({url:selected.url,workspace:selected.workspace,tokenEnv:selected.tokenEnv,environment,signal,maximumResponseBytes:128*1024*1024});
  try{need(client.workspace===selected.workspace&&(!client.endpoint||client.endpoint===selected.url),'Use the selected original merchant endpoint and alias.','CONNECTION');
    await client.open({requestSignal:signal});return client;
  }catch(error){if(!provided)try{await client.disconnect();}catch(releaseError){error.releaseError=issue(releaseError);}throw error;}}
async function status(client,selected,signal){const value=await client.status({customerId:selected.customerId,asOf:selected.asOf},{requestSignal:signal});
  need(value.workspaceId===selected.workspaceId&&Number.isSafeInteger(value.revision),'The original customer workspace identity changed.','SOURCE');return value;}
function sameRevision(value,initial){need(value.revision===initial.revision&&
  (value.workspaceId===undefined||value.workspaceId===initial.workspaceId),'The account changed during capture. Retain this incomplete edition and capture a new one.','REVISION_CHANGED');return value;}
async function disconnect(client,provided){if(!provided)await client.disconnect();}

export async function createDurableCustomerCase({directory:target,selection,client:provided,environment=process.env,signal,resume=false}={}){
  need(typeof resume==='boolean','Choose explicit original case-creation recovery.');
  const selected=normalize(selection),client=await receivables(selected,provided,environment,signal);
  try{await status(client,selected,signal);const account=await client.customerExport({customerId:selected.customerId,asOf:selected.asOf},{requestSignal:signal});
    need(account.customer?.id===selected.customerId,'Select an existing original customer.','SOURCE');
    target=resolve(target);await directory(dirname(target));
    try{await mkdir(target,{mode:0o700});}catch(error){if(!resume||error.code!=='EEXIST')throw error;}
    await directory(target);const lease=await acquireStateLease(target);let failed;
    try{
      lease.assertHeld();await retain(join(target,'case.json'),selected);
      for(const child of ['editions','operations','checkpoints'])await directory(join(target,child));
      return{directory:target,case:selected,customer:account.customer};
    }catch(error){failed=error;throw error;}
    finally{try{await lease.close();}catch(error){if(failed)failed.releaseError=issue(error);else throw error;}}
  }finally{await disconnect(client,provided);}
}

/** Retain complete native outputs from one unchanged original accounting revision. */
export async function captureDurableCustomerCase({directory:target,editionId,client:provided,environment=process.env,signal}={}){
  id(editionId,'capture edition');return locked(target,async({path,selected,lease})=>{
    const client=await receivables(selected,provided,environment,signal);
    try{
      const root=await directory(join(path,'editions',editionId));
      const initial=await status(client,selected,signal),identity={schema:EDITION,id:editionId,caseId:selected.id,
        selectionSha256:sha(json(selected)),workspaceId:selected.workspaceId,revision:initial.revision,asOf:selected.asOf};
      await retain(join(root,'identity.json'),identity);
      const finalPath=join(root,'edition.json');if(await exists(finalPath)){
        const saved=await read(finalPath);need(saved.selectionSha256===identity.selectionSha256&&saved.revision===identity.revision,'This edition belongs to its earlier account revision.','REVISION_CHANGED');
        for(const row of [...saved.files,saved.index]){const b=await bytes(join(root,relative(row.path)));need(b.length===row.bytes&&sha(b)===row.sha256,'A retained case file changed.','FILE_CHANGED');}
        return{directory:root,edition:saved,replayed:true};
      }
      const files=[],records={},options={requestSignal:signal};
      async function record(name,value){lease.assertHeld();sameRevision(value,initial);const rel='staff/records/'+name+'.json',originalPath=join(root,rel);
        // Native credit views include their observed calendar date even when the ledger revision is unchanged.
        // An interrupted edition keeps its complete original observation instead of replacing it with today's projection.
        if(await exists(originalPath))value=sameRevision(await read(originalPath),initial);
        records[name]=value;await retain(originalPath,value);const b=Buffer.from(json(value));
        files.push({path:rel,bytes:b.length,sha256:sha(b),type:'application/json',audience:'staff',label:name});return value;}
      async function download(selection,rel,audience,label,expectedSha256){
        signal?.throwIfAborted();relative(rel);await directory(dirname(join(root,rel)));const p=join(root,rel),metaPath=p+'.source.json';
        let result;
        if(await exists(metaPath)){
          result=await read(metaPath);need(json(result.selection)===json(selection)&&
            (!expectedSha256||result.file.sha256===expectedSha256),'The retained native file selection changed.','FILE_CHANGED');
          const b=await bytes(p);need(b.length===result.file.bytes&&sha(b)===result.file.sha256,'A retained native file changed.','FILE_CHANGED');
        }else{
          // A crash after complete-byte publication is reconciled against the original reader.
          if(await exists(p)){
            const current=await client.fileBytes(selection,{expectedSha256,signal});const retained=await bytes(p);
            need(current.bytes.equals(retained),'The interrupted native file differs from its original source.','FILE_CHANGED');
            result={selection:structuredClone(selection),file:current.file,complete:true};
          }else{
            const received=await downloadAccountingReceivablesFile({client,selection,expectedSha256,output:p,signal});
            result={selection:received.selection,file:received.file,complete:true};
          }
          await retain(metaPath,result);
        }
        files.push({path:rel,bytes:result.file.bytes,sha256:result.file.sha256,type:result.file.type,
          selection:structuredClone(selection),audience,label});return p;
      }
      await record('account-status',initial);
      const account=await record('account',await client.customerExport({customerId:selected.customerId,asOf:selected.asOf},options));
      need(account.customer?.id===selected.customerId,'The exported account belongs to another customer.','SOURCE');
      for(const file of account.files){need(file.selection?.customerId===selected.customerId&&file.selection.asOf===selected.asOf,'The account file belongs to another dated customer.','SOURCE');
        await download(file.selection,'customer/current/'+relative(file.name),'customer','Current account: '+file.name,file.sha256);}
      await download(account.packet,'customer/current/account.tar','customer','Complete current account');
      records.accountData=await read(join(root,'customer/current/account.json'));
      const financial=await record('collections',await client.collectionCases({customerId:selected.customerId,asOf:selected.asOf},options));
      for(const row of financial.cases){need(row.customerId===selected.customerId,'A collection belongs to another customer.','SOURCE');
        const detail=await record('collection-'+id(row.id,'collection'),await client.collectionCase({collectionCaseId:row.id,asOf:selected.asOf},options));
        for(const file of ['case.json','case.csv','case.html','manifest.json',...(detail.collectionCase.status==='FUTURE'?[]:['reminder.txt'])])
          await download({kind:'receivables-collection',collectionCaseId:row.id,asOf:selected.asOf,file},
            'staff/collections/'+row.id+'/'+file,'staff',row.title||'Invoice follow-up');
      }
      const accounts=await record('customer-deliveries',await client.customerAccountResponses({customerId:selected.customerId},options));
      for(const publication of accounts.publications){need(publication.customerId===selected.customerId,'A publication belongs to another customer.','SOURCE');
        for(const file of [...publication.files,'account.tar'])await download({kind:'receivables-customer-account',publicationId:id(publication.id,'publication'),file},
          'customer/publications/'+publication.id+'/'+relative(file),'customer','Published account '+publication.asOf);
      }
      for(const response of accounts.responses){need(response.customerId===selected.customerId,'A response belongs to another customer.','SOURCE');
        await record('response-'+id(response.id,'response'),await client.customerResponse({customerResponseId:response.id},options));
        for(const file of ['received-response.json','merchant-review.json','merchant-review.html','response-manifest.json','response.tar'])
          await download({kind:'receivables-customer-response',customerResponseId:response.id,file},
            'staff/responses/'+response.id+'/'+file,'staff','Customer return '+response.responseDate);
      }
      const credit=await record('credit-control',await client.creditControl({customerId:selected.customerId},options));
      for(const policy of credit.policies)await record('credit-policy-'+id(policy.id,'policy'),await client.creditPolicy({creditPolicyId:policy.id},options));
      for(const decision of credit.decisions){
        need(decision.customerId===selected.customerId,'A decision belongs to another customer.','SOURCE');
        await record('credit-decision-'+id(decision.id,'decision'),await client.creditDecision({creditDecisionId:decision.id},options));
        for(const file of ['decision.json','decision.html','manifest.json'])await download({kind:'receivables-credit-decision',creditDecisionId:decision.id,file},
          'staff/credit/'+decision.id+'/'+file,'staff','Customer credit decision');
      }
      for(const plan of selected.cashPlans){
        await record('cash-plan-'+plan.cashPlanId+'-'+plan.editionId,await client.cashPlan(plan,options));
        for(const file of ['plan.json','plan.csv','plan.html','manifest.json'])await download({kind:'receivables-cash-plan',...plan,file},
          'staff/cash/'+plan.cashPlanId+'/'+plan.editionId+'/'+file,'staff','Selected cash-plan edition');
      }
      for(const requestId of selected.requestIds){const operation=await client.lookupOperation({requestId},options);
        need(operation.found,'The selected original request is absent.','REQUEST_ABSENT');await record('request-'+sha(requestId),operation);}
      const last=await status(client,selected,signal);sameRevision(last,initial);
      const edition={...identity,customer:account.customer,createdAt:now(),originalOperation:selected.originalOperation,
        files,records,summary:{invoices:account.counts.invoices,publications:accounts.publications.length,
          responses:accounts.responses.length,openResponses:accounts.responses.filter(x=>x.status==='OPEN').length,
          collectionCases:financial.cases.length,cashPlanEditions:selected.cashPlans.length,creditDecisions:credit.decisions.length}};
      const pendingPath=join(root,'edition-prepared.json'),indexPath=join(root,'index.html');
      if(await exists(pendingPath)){
        const pending=await read(pendingPath);
        need(typeof pending.createdAt==='string'&&Number.isFinite(Date.parse(pending.createdAt)),
          'Keep the original complete capture metadata.','EDITION_CHANGED');
        edition.createdAt=pending.createdAt;
        if(pending.createdAtPrecision!==undefined)edition.createdAtPrecision=pending.createdAtPrecision;
        need(json(pending)===json(edition),'The pending edition differs from its original retained sources.','EDITION_CHANGED');
      }else{
        if(await exists(indexPath)){
          // Older captures published the complete index before retaining edition metadata.
          // Only the original UTC date survives in that rendered header.
          const originalHtml=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await bytes(indexPath));
          const match=/ · Captured ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})<\/p>/.exec(originalHtml);
          const month=match?['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(match[1]):-1;
          need(match&&month>=0,'Keep the complete original captured index.','EDITION_CHANGED');
          edition.createdAt=date(match[3]+'-'+String(month+1).padStart(2,'0')+'-'+match[2].padStart(2,'0'));
          edition.createdAtPrecision='day';
          need(customerCaseHtml(selected,edition)===originalHtml,
            'The original index differs from this complete source revision.','EDITION_CHANGED');
        }
        await retain(pendingPath,edition);
      }
      const html=customerCaseHtml(selected,edition);await retain(indexPath,html);
      edition.index={path:'index.html',bytes:Buffer.byteLength(html),sha256:sha(html)};
      await retain(finalPath,edition);return{directory:root,edition,replayed:false};
    }finally{await disconnect(client,provided);}
  });
}

/** Prepare only an operator-selected customer action through the original durable CLI. */
export async function prepareDurableCustomerAction({directory:target,operationId,kind,preview,actor,requestId}={}){
  id(operationId,'operation');return locked(target,async({path,selected})=>{
    need(['customer_account_publish','customer_response_receive','customer_response_review'].includes(kind),'Choose an original customer publication, intake or reviewed response action.');
    need(preview?.workspaceId===selected.workspaceId,'The preview belongs to another original workspace.','SOURCE');
    const customerId=preview.customerId??preview.publication?.customerId??preview.customer?.id;
    need(customerId===selected.customerId,'Use the complete preview for this selected customer.','SOURCE');
    return prepareAccountingReceivablesOperation({directory:join(path,'operations',operationId),url:selected.url,workspace:selected.workspace,
      tokenEnv:selected.tokenEnv,kind,preview,actor,requestId});
  });
}
export async function runDurableCustomerAction({directory:target,operationId,execute=false,client,environment,signal}={}){
  id(operationId,'operation');const {path,selected}=await loadCase(target);
  const saved=await read(join(path,'operations',operationId,'request.json'));
  need(saved.url===selected.url&&saved.workspace===selected.workspace&&saved.preview?.workspaceId===selected.workspaceId&&
    (saved.preview.customerId??saved.preview.publication?.customerId??saved.preview.customer?.id)===selected.customerId,
    'The saved original request belongs to another customer case.','REQUEST_BINDING');
  return runAccountingReceivablesOperation({directory:join(path,'operations',operationId),execute,client,environment,signal});
}

/** Keep the original maintenance requests and encrypted backup after the owning programme exits. */
export async function checkpointDurableCustomerCase({directory:target,editionId,checkpointId,actor,
  externalWritersStopped=false,execute=false,client:provided,environment=process.env,signal}={}){
  id(editionId,'edition');id(checkpointId,'checkpoint');
  need(externalWritersStopped===true,'Stop original source, OAuth and selected-company writers, then explicitly confirm externalWritersStopped:true.');
  return locked(target,async({path,selected})=>{
    const edition=await read(join(path,'editions',editionId,'edition.json'));need(edition.schema===EDITION&&edition.caseId===selected.id&&
      edition.selectionSha256===sha(json(selected)),'Select a complete retained edition of this customer case.','SOURCE');
    const root=await directory(join(path,'checkpoints',checkpointId)),selectionPath=join(root,'selection.json');
    const selection={checkpointId,editionId,caseId:selected.id,workspaceId:selected.workspaceId,revision:edition.revision,actor};
    await retain(selectionPath,selection);
    const client=provided??await connectAccountingMaintenanceClient({url:selected.url,workspace:selected.workspace,tokenEnv:selected.tokenEnv,environment,signal});
    let operationError;try{
    need(client.workspace===selected.workspace&&(!client.endpoint||client.endpoint===selected.url),'Use the original maintenance connection.','CONNECTION');
    const flowPath=join(root,'flow.json');let flow=await exists(flowPath)?await read(flowPath):{
      schema:'stellar-forge.durable-customer-checkpoint.v1',...selection,ids:Object.fromEntries(['pause','review','backup','verify','resume'].map(x=>[x,randomUUID()])),results:{}};
    if(!await exists(flowPath))await retain(flowPath,flow);
    async function prepare(kind,args){
      const op=join(root,kind),preparations=await directory(join(root,'preparations')),
        intentPath=join(preparations,kind+'.json'),stage=join(preparations,kind);
      const input={url:selected.url,workspace:selected.workspace,tokenEnv:selected.tokenEnv,kind,
        arguments:accountingMaintenanceArguments(kind,args)};
      const intent={schema:'stellar-forge.durable-customer-checkpoint-preparation.v1',
        checkpointId,caseId:selected.id,selectionSha256:sha(json(selection)),input};
      await retain(intentPath,intent);
      function requestMatches(request){
        const {sha256,...content}=request;
        need(request.schema==='stellar-forge.accounting-maintenance-request.v1'&&
          sha(JSON.stringify(content))===sha256&&typeof request.createdAt==='string'&&Number.isFinite(Date.parse(request.createdAt))&&
          request.url===input.url&&request.workspace===input.workspace&&request.tokenEnv===input.tokenEnv&&
          request.kind===kind&&json(request.arguments)===json(input.arguments),
          'Keep the exact original checkpoint request and connection.','REQUEST_BINDING');
      }
      function stateMatches(state,request){
        need(state.schema==='stellar-forge.accounting-maintenance-client-state.v1'&&
          state.requestSha256===request.sha256&&state.requestId===request.arguments.requestId,
          'Keep the original checkpoint state and request.','REQUEST_BINDING');
      }
      if(await exists(op)){
        // A legacy preparation may have stopped after mkdir or request.json.
        // The original operation lease excludes its ordinary execute/reconcile caller.
        const operationLease=await acquireStateLease(await directory(op));let failed;
        try{
          const requestPath=join(op,'request.json'),statePath=join(op,'state.json');
          let request=await exists(requestPath)?await read(requestPath,65536):null;
          const state=await exists(statePath)?await read(statePath,4*1024*1024):null;
          need(!state||request,'The original checkpoint state lost its request.','REQUEST_BINDING');
          if(request)requestMatches(request);
          else{
            await prepareStage();
            request=await read(join(stage,'request.json'),65536);requestMatches(request);
            operationLease.assertHeld();await retain(requestPath,await bytes(join(stage,'request.json'),65536));
          }
          if(state)stateMatches(state,request);
          else{
            operationLease.assertHeld();await retain(statePath,{
              schema:'stellar-forge.accounting-maintenance-client-state.v1',requestSha256:request.sha256,
              requestId:request.arguments.requestId,phase:'PREPARED',preparedAt:request.createdAt,updatedAt:now(),observation:null});
          }
          return op;
        }catch(error){failed=error;throw error;}
        finally{try{await operationLease.close();}catch(error){if(failed)failed.releaseError=issue(error);else throw error;}}
      }
      async function staged(){
        if(!await exists(join(stage,'request.json'))||!await exists(join(stage,'state.json')))return false;
        let request,state;
        try{request=await read(join(stage,'request.json'),65536);state=await read(join(stage,'state.json'),4*1024*1024);}
        catch(error){if(error instanceof SyntaxError)return false;throw error;}
        requestMatches(request);stateMatches(state,request);
        need(state.phase==='PREPARED'&&state.observation===null,'Keep the unsubmitted original checkpoint preparation.','REQUEST_BINDING');
        return true;
      }
      async function prepareStage(){
        if(await exists(stage)&&!await staged()){
          await directory(stage);await rename(stage,join(preparations,kind+'.interrupted-'+randomUUID()));await sync(preparations);
        }
        if(!await exists(stage))await prepareAccountingMaintenanceOperation({directory:stage,...input});
        need(await staged(),'Keep the complete original checkpoint preparation.','REQUEST_BINDING');
      }
      await prepareStage();
      await rename(stage,op);await sync(root);await sync(preparations);
      return op;
    }
    async function step(kind,extra={}){
      const args={actor,requestId:flow.ids[kind],...extra},op=await prepare(kind,args);
      const result=await runAccountingMaintenanceOperation({directory:op,execute,client,environment,maxWaitMs:30000,pollMs:500,signal});
      flow.results[kind]=result;await replace(flowPath,flow);
      if(!result.found||result.pending)return{pending:true,...result};
      need(result.job?.status==='COMPLETE','The original '+kind+' job is '+result.job?.status+'. Keep its request and use the retained resume operation when appropriate.','MAINTENANCE_'+result.job?.status);
      return result.job.result;
    }
    // The original resume request is available even when a later review or backup fails.
    await prepare('resume',{actor,requestId:flow.ids.resume});
    if(!flow.results.pause){const current=await client.status();need(current.state?.workspace?.revision===edition.revision||current.workspace?.revision===edition.revision,
      'The active workspace changed since capture. Capture its current customer edition before pausing.','REVISION_CHANGED');}
    const paused=await step('pause');if(paused.pending)return{directory:root,phase:'pause',...paused};
    const reviewed=await step('review');if(reviewed.pending)return{directory:root,phase:'review',...reviewed};
    need(reviewed.revision===edition.revision,'The paused original workspace differs from the captured edition. Keep this checkpoint and resume using its retained request.','REVISION_CHANGED');
    const backup=await step('backup',{expectedReviewId:reviewed.reviewId,externalWritersStopped:true,label:selected.title});
    if(backup.pending)return{directory:root,phase:'backup',...backup};
    const backupId='backup-'+flow.ids.backup;
    const verified=await step('verify',{backupId,expectedSha256:backup.manifestSha256});
    if(verified.pending)return{directory:root,phase:'verify',...verified};
    const resumed=await step('resume');if(resumed.pending)return{directory:root,phase:'resume',...resumed};
    need(resumed.revision===edition.revision,'The reopened original workspace revision changed.','REVISION_CHANGED');
    const result={schema:'stellar-forge.durable-customer-checkpoint-result.v1',...selection,backupId,manifestSha256:backup.manifestSha256,
      backup,verified,resumed,requests:flow.ids,originalOperation:selected.originalOperation};
    await retain(join(root,'checkpoint.json'),result);return{directory:root,complete:true,result};
    }catch(error){operationError=error;throw error;}finally{if(!provided)try{await client.drainFileReads();}catch(error){if(operationError)operationError.releaseError=issue(error);else throw error;}}
  });
}

export async function inspectDurableCustomerCase({directory:target,client:provided,environment=process.env,signal}={}){
  const {path,selected}=await loadCase(target),client=await receivables(selected,provided,environment,signal);
  try{const current=await status(client,selected,signal);return{directory:path,case:selected,current,
    customer:await client.customerExport({customerId:selected.customerId,asOf:selected.asOf},{requestSignal:signal})};}
  finally{await disconnect(client,provided);}
}

export {read as readDurableCaseInput};
