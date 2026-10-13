// MIT. Saved ROZO reports joined to the original configured Accounting/Buyer owners.
import { assert, fields, id, text, integer, sha, clone, canonical, jsonDigest, digest } from './model.mjs';
import { captureRozoFinanceSource, rozoFinanceSourceBytes } from './finance-source.mjs';
import { previewRozoFinanceAmendment } from './finance-amendment.mjs';
import { validateRozoBuyerSelection, rozoFinanceMovements } from './finance-projection.mjs';

export const ROZO_FINANCE_COMMANDS=Object.freeze([
  'finance.accounting.capture','finance.accounting.mutate','finance.accounting.period',
  'finance.accountant.create','finance.accountant.return','finance.buyer.capture',
  'finance.buyer.mutate','finance.buyer.accountant','finance.buyer.return','finance.delivery'
]);
const INTENT='stellar-forge.rozo-finance-intent.v1',OUTCOME='stellar-forge.rozo-finance-outcome.v1';
const A_REQUEST='stellar-forge.rozo-accounting-request.v1';
const need=(ok,code,message,status=409)=>assert(ok,code,message,status);
const nativeId=(workspaceId,requestId,purpose)=>{
  const h=jsonDigest({workspaceId,requestId,purpose});
  return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);
};
const originalFile=(raw,name,type='application/json')=>({name,type,bytes:raw.length,sha256:digest(raw),base64:raw.toString('base64')});
function reportSelection(value){
  fields(value,['reportId','reportVersion','expectedReportSha256'],'saved report selection');
  id(value.reportId,'report');sha(value.expectedReportSha256,'report SHA-256');
  if(value.reportVersion!==undefined)integer(value.reportVersion,'report version',1);
  return clone(value);
}
function accountingBinding(value){
  fields(value,['alias','workspaceId','sourcesSha256'],'accounting binding');
  text(value.alias,'accounting alias',64);sha(value.workspaceId,'original accounting workspace');sha(value.sourcesSha256,'original accounting sources');
  return clone(value);
}
function buyerBinding(value){
  fields(value,['alias','workspaceId'],'buyer binding');text(value.alias,'buyer alias',64);text(value.workspaceId,'original buyer workspace',160);return clone(value);
}
function buyerRoute(path){
  const ident='[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}';
  need(typeof path==='string'&&new RegExp('^/api/(?:centers|labels|periods|captures/'+ident+'/decision|items/'+ident+'/coding|periods/'+ident+'/(?:disposition|review|close|reopen))$').test(path),
    'ROZO_BUYER_ROUTE','Select an original source-review, coding or period operation.');
  return path;
}
const bFingerprint=(path,body)=>digest(Buffer.from(canonical({method:'POST',path,payload:body.payload,expected_revision:body.expected_revision}).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')),'utf8'));
const plain=value=>JSON.parse(JSON.stringify(value));
const fingerprint=(target,path,body)=>target==='buyer'?bFingerprint(path,body):jsonDigest(body);
export class RozoFinanceService{
  constructor({workspace,accounting=null,buyer=null,accountingId=null,buyerId=null}){
    need(workspace&&typeof workspace.prepare==='function'&&typeof workspace.complete==='function',
      'ROZO_FINANCE_WORKSPACE','Borrow the already-open original ROZO workspace.');
    this.workspace=workspace;this.accounting=accounting;this.buyer=buyer;this.accountingId=accountingId;this.buyerId=buyerId;
    this.active=new Map();
  }
  async withAccounting(binding,fn){
    need(this.accounting&&typeof this.accounting.withRozoFinanceWorkspace==='function'&&this.accountingId,
      'ROZO_ACCOUNTING_CONFIGURATION','Select the original configured Accounting owner and declared alias.');
    if(binding){accountingBinding(binding);need(binding.alias===this.accountingId,'ROZO_ACCOUNTING_ALIAS','This request selects another configured Accounting alias.');}
    return this.accounting.withRozoFinanceWorkspace(this.accountingId,async cap=>{
      need(cap.finance&&cap.accountant,'ROZO_ACCOUNTING_CAPABILITY','Use the original complete ROZO/accountant owner capability.');
      const actual={alias:this.accountingId,workspaceId:cap.workspaceId,sourcesSha256:cap.sourcesSha256};
      if(binding)need(canonical(binding)===canonical(actual),'ROZO_ACCOUNTING_IDENTITY','The existing accounting workspace or original sources changed.');
      return fn(cap,actual);
    });
  }
  async withAccountant(binding,fn){
    need(this.accounting&&typeof this.accounting.withServiceAccountant==='function'&&this.accountingId,
      'ROZO_ACCOUNTANT_CONFIGURATION','Select the original configured accountant owner.');
    if(binding){accountingBinding(binding);need(binding.alias===this.accountingId,'ROZO_ACCOUNTING_ALIAS','This request selects another Accounting alias.');}
    return this.accounting.withServiceAccountant(this.accountingId,async cap=>{
      const actual={alias:this.accountingId,workspaceId:cap.workspaceId,sourcesSha256:cap.sourcesSha256};
      if(binding)need(canonical(binding)===canonical(actual),'ROZO_ACCOUNTING_IDENTITY','The existing accountant workspace or source selection changed.');
      return fn(cap,actual);
    });
  }
  async withBuyer(binding,fn){
    need(this.buyer&&typeof this.buyer.withRozoFinanceWorkspace==='function'&&this.buyerId,
      'ROZO_BUYER_CONFIGURATION','Select the original configured Buyer expense owner and declared alias.');
    if(binding){buyerBinding(binding);need(binding.alias===this.buyerId,'ROZO_BUYER_ALIAS','This request selects another configured Buyer alias.');}
    return this.buyer.withRozoFinanceWorkspace(this.buyerId,async cap=>{
      const actual={alias:this.buyerId,workspaceId:cap.workspaceId};
      if(binding)need(canonical(binding)===canonical(actual),'ROZO_BUYER_IDENTITY','The existing Buyer workspace changed.');
      return fn(cap,actual);
    });
  }
  async state(){
    const result={schema:'stellar-forge.rozo-finance-state.v1',workspace:this.workspace.meta(),
      configured:{accountingId:this.accountingId,buyerId:this.buyerId},accounting:null,buyer:null,
      operations:this.workspace.list('finance-outcome',{all:true}).items,
      pending:this.workspace.db.prepare("SELECT id FROM requests WHERE state!='accepted' AND json_extract(envelope,'$.command') LIKE 'finance.%' ORDER BY created_at,id").all().map(row=>this.workspace.request(row.id,{includeIntent:false}))};
    if(this.accountingId)result.accounting=await this.withAccountant(null,async(cap,binding)=>({
      binding,sourceMode:cap.sourceMode??'merchant',accountant:cap.accountant.view(),
      finance:cap.sourceMode==='buyer'?null:await this.withAccounting(binding,owned=>owned.finance.view())}));
    if(this.buyerId)result.buyer=await this.withBuyer(null,async(cap,binding)=>({binding,state:await cap.read('/api/state'),
      expenses:await cap.read('/api/expenses?offset=0&limit=200')}));
    return result;
  }
  capture(report){
    const selected=reportSelection(report),source=captureRozoFinanceSource(this.workspace,selected),raw=rozoFinanceSourceBytes(source);
    return {source,raw,descriptor:originalFile(raw,'rozo-finance-source-'+selected.reportId+'.json'),report:selected};
  }
  report(value){const captured=this.capture(value);return {report:captured.report,
    source:{name:captured.descriptor.name,bytes:captured.descriptor.bytes,sha256:captured.descriptor.sha256},
    ...rozoFinanceMovements(captured.source)};}
  accountingSource(capture,input){
    fields(input,['name','provenance','dataContext','previewSha256'],'merchant intake');
    return {...clone(input),contentBase64:capture.descriptor.base64,sha256:capture.descriptor.sha256};
  }
  buyerSource(capture,input,actor){
    fields(input,['name','provenance','dataContext','selection','previewSha256'],'buyer purchase intake');
    const selected=validateRozoBuyerSelection(capture.source,input.selection);
    const payload={filename:capture.descriptor.name,name:input.name,provenance:input.provenance,operator:actor,
      data_context:input.dataContext,selection:selected.selection,content_base64:capture.descriptor.base64,
      source_sha256:capture.descriptor.sha256,...(input.previewSha256?{preview_sha256:input.previewSha256}:{})};
    need(Buffer.byteLength(JSON.stringify({request_id:'rozo-finance-'+'f'.repeat(64),expected_revision:Number.MAX_SAFE_INTEGER,
      payload:{...payload,preview_sha256:payload.preview_sha256??'f'.repeat(64)}}))<=96000000,
      'ROZO_BUYER_BODY_LIMIT','The complete original source, explicit selection and request must fit the Buyer native 96,000,000-byte body limit.',413);
    return payload;
  }
  async preview(value){
    fields(value,['kind','binding','report','input','actor'],'finance preview');
    const capture=this.capture(value.report);text(value.actor,'operator',1000);
    if(value.kind==='accounting')return this.withAccounting(value.binding,async(cap,binding)=>({
      kind:'accounting',binding,source:{name:capture.descriptor.name,bytes:capture.descriptor.bytes,sha256:capture.descriptor.sha256,
        sourceId:capture.source.sourceId,sourceSha256:capture.source.sha256},preview:await cap.finance.previewSource(this.accountingSource(capture,value.input))}));
    need(value.kind==='buyer','ROZO_FINANCE_TARGET','Choose merchant accounting or explicitly selected buyer purchases.');
    return this.withBuyer(value.binding,async(cap,binding)=>{
      const state=await cap.read('/api/state'),payload=this.buyerSource(capture,value.input,value.actor);
      const preview=await cap.mutate('/api/rozo-reports/preview',{payload});
      return {kind:'buyer',binding,revision:state.revision,source:{name:capture.descriptor.name,bytes:capture.descriptor.bytes,
        sha256:capture.descriptor.sha256,sourceId:capture.source.sourceId,sourceSha256:capture.source.sha256},preview};
    });
  }
  async amendmentPreview(value){return previewRozoFinanceAmendment(this,value);}
  async periodPreview({binding,...value}){return this.withAccounting(binding,cap=>cap.finance.periodPreview(value));}
  async accountantPreview(value){
    fields(value,['binding','handoffId','csvBase64','name','actor','expectedParentId','id','createdAt'],'accountant preview');
    const {binding,handoffId,...input}=value;
    return this.withAccountant(binding,cap=>cap.accountant.preview(handoffId,input));
  }
  async buyerRead(binding,path){
    need(typeof path==='string'&&path.startsWith('/api/')&&!path.includes('%')&&!path.includes('#'),'ROZO_BUYER_ROUTE','Read an exact original Buyer route.');
    return this.withBuyer(binding,cap=>cap.read(path));
  }
  async read(value){
    fields(value,['target','binding','path','id','query'],'finance read');
    if(value.target==='buyer')return this.buyerRead(value.binding,value.path);
    if(value.target==='accounting')return this.withAccounting(value.binding,cap=>cap.finance.view());
    if(value.target==='accounting-rows')return this.withAccounting(value.binding,cap=>cap.finance.rows(value.query??{}));
    return this.withAccountant(value.binding,cap=>{
      if(value.target==='accountant')return value.id?cap.accountant.detail(value.id,value.query??{}):cap.accountant.view();
      if(value.target==='accountant-rows')return cap.accountant.rows(value.id,value.query??{});
      need(false,'ROZO_FINANCE_READ','Choose an original finance view.',404);
    });
  }
  async file(value){
    fields(value,['target','binding','id','name','revisionId','path'],'finance file');
    if(value.target==='buyer')return this.withBuyer(value.binding,async cap=>{
      const raw=await cap.bytes(value.path);return {bytes:Buffer.from(raw),name:value.name??'original-buyer-file',type:value.path.includes('packet')||value.path.startsWith('/api/complete-project')?'application/zip':'application/json'};
    });
    if(value.target==='accountant')return this.withAccountant(value.binding,cap=>cap.accountant.file(value.id,value.name,{revisionId:value.revisionId??'initial'}));
    return this.withAccounting(value.binding,async cap=>{
      if(value.target==='accounting-capture')return cap.finance.file(value.id);
      if(value.target==='accounting-close')return cap.finance.closeFile(value.id);
      need(false,'ROZO_FINANCE_FILE','Select an original native finance file.',404);
    });
  }
  async prepare(envelope){
    const p=envelope.payload,nativeRequestId='rozo-finance-'+jsonDigest({workspaceId:envelope.workspaceId,requestId:envelope.requestId});
    let target,binding,body,path=null,method,source=null,accounting=null,buyer=null;
    if(envelope.command==='finance.accounting.capture'||envelope.command==='finance.buyer.capture'){
      fields(p,['binding','report','input','nativeRevision'],'report intake');integer(p.nativeRevision,'native revision');
      source=this.capture(p.report);
      if(envelope.command==='finance.accounting.capture'){
        target='accounting';binding=accountingBinding(p.binding);method='mutate';
        body={schema:A_REQUEST,requestId:nativeRequestId,expectedRevision:p.nativeRevision,actor:envelope.actor,
          command:'source.capture',payload:this.accountingSource(source,p.input)};
        await this.withAccounting(binding,()=>null);
      }else{
        target='buyer';binding=buyerBinding(p.binding);method='mutate';path='/api/rozo-reports';
        body={request_id:nativeRequestId,expected_revision:p.nativeRevision,payload:this.buyerSource(source,p.input,envelope.actor)};
        await this.withBuyer(binding,()=>null);
      }
    }else if(envelope.command==='finance.accounting.mutate'){
      fields(p,['binding','nativeRevision','command','payload'],'native accounting mutation');
      binding=accountingBinding(p.binding);integer(p.nativeRevision,'native revision');
      need(['source.review','coding.save','disposition.save','period.review','period.close','period.reopen'].includes(p.command),'ROZO_FINANCE_COMMAND','Choose a supported original native accounting mutation.');
      target='accounting';method='mutate';body={schema:A_REQUEST,requestId:nativeRequestId,expectedRevision:p.nativeRevision,actor:envelope.actor,command:p.command,payload:clone(p.payload)};
      await this.withAccounting(binding,()=>null);
    }else if(envelope.command==='finance.accounting.period'){
      fields(p,['binding','nativeRevision','period'],'original period definition');binding=accountingBinding(p.binding);integer(p.nativeRevision,'native revision');
      fields(p.period,['id','expectedVersion','name','from','until','note','select'],'original period fields');
      target='accounting';method='savePeriod';body={...clone(p.period),revision:p.nativeRevision,requestId:nativeRequestId,actor:envelope.actor};
      await this.withAccounting(binding,()=>null);
    }else if(envelope.command==='finance.buyer.mutate'){
      fields(p,['binding','nativeRevision','path','payload'],'original Buyer mutation');binding=buyerBinding(p.binding);integer(p.nativeRevision,'native revision');
      target='buyer';method='mutate';path=buyerRoute(p.path);body={request_id:nativeRequestId,expected_revision:p.nativeRevision,payload:clone(p.payload)};
      await this.withBuyer(binding,()=>null);
    }else if(envelope.command==='finance.accountant.create'||envelope.command==='finance.buyer.accountant'){
      fields(p,['binding','buyerBinding','nativeRevision','closeId','sourceSha256','name'],'original accountant source');
      binding=accountingBinding(p.binding);integer(p.nativeRevision,'native revision');id(p.closeId,'issued close');sha(p.sourceSha256,'issued source SHA-256');text(p.name,'handoff name',160);
      let raw;
      if(envelope.command==='finance.buyer.accountant'){
        buyer=buyerBinding(p.buyerBinding);raw=await this.withBuyer(buyer,cap=>cap.bytes('/api/closes/'+p.closeId+'/accountant-source'));
        raw=Buffer.from(raw);
      }else{
        raw=await this.withAccounting(binding,async cap=>{
          const file=await cap.finance.closeFile(p.closeId);
          need(file.row.status==='CLOSED','ROZO_CLOSE_REOPENED','Finish the original corrected close before handing it to the accountant.');return file.bytes;
        });
      }
      need(digest(raw)===p.sourceSha256,'ROZO_ACCOUNTANT_SOURCE_CHANGED','The selected original issued period source changed.');
      target='accountant';method='create';body={id:nativeId(envelope.workspaceId,envelope.requestId,'handoff'),
        revision:p.nativeRevision,name:p.name,actor:envelope.actor,labels:[],
        [buyer?'buyerSource':'rozoSource']:{contentBase64:raw.toString('base64'),sha256:digest(raw)}};
      source={descriptor:originalFile(raw,buyer?'original-buyer-source.json':'original-rozo-source.json')};
      await this.withAccountant(binding,()=>null);
    }else if(envelope.command==='finance.accountant.return'){
      fields(p,['binding','nativeRevision','handoffId','return'],'original accountant return');
      binding=accountingBinding(p.binding);integer(p.nativeRevision,'native revision');id(p.handoffId,'handoff');
      fields(p.return,['id','createdAt','csvBase64','name','expectedParentId','previewSha256'],'reviewed accountant return');
      id(p.return.id,'reviewed return');sha(p.return.previewSha256,'return preview SHA-256');
      target='accountant';method='apply';path=p.handoffId;body={...clone(p.return),revision:p.nativeRevision,actor:envelope.actor};
      await this.withAccountant(binding,()=>null);
    }else if(envelope.command==='finance.buyer.return'){
      fields(p,['binding','accountingBinding','nativeRevision','closeId','handoffId','revisionId','fileSha256','input'],'original issued accountant return');
      binding=buyerBinding(p.binding);accounting=accountingBinding(p.accountingBinding);integer(p.nativeRevision,'native revision');
      id(p.closeId,'buyer close');id(p.handoffId,'handoff');id(p.revisionId,'accountant return');sha(p.fileSha256,'original returned packet');
      fields(p.input,['name','reason','supersedes','previewSha256'],'Buyer bookkeeping decision');
      const selected=await this.withAccountant(accounting,cap=>cap.accountant.file(p.handoffId,'buyer-return.json',{revisionId:p.revisionId}));
      const raw=selected.bytes;need(digest(raw)===p.fileSha256,'ROZO_ACCOUNTANT_RETURN_CHANGED','The original returned accountant packet changed.');
      target='buyer';method='mutate';path='/api/closes/'+p.closeId+'/accountant-return';
      body={request_id:nativeRequestId,expected_revision:p.nativeRevision,payload:{
        content_base64:raw.toString('base64'),sha256:digest(raw),name:p.input.name,operator:envelope.actor,
        reason:p.input.reason??'',supersedes:p.input.supersedes??null,preview_sha256:p.input.previewSha256}};
      source={descriptor:originalFile(raw,'buyer-return.json')};
    }else if(envelope.command==='finance.delivery'){
      fields(p,['binding','target','id','revisionId','expectedSha256','nativeRevision'],'original finance delivery');
      binding=p.target==='buyer'?buyerBinding(p.binding):accountingBinding(p.binding);
      target=p.target;method='delivery';body={...clone(p),...(p.target==='accountant'?{revisionId:p.revisionId??'initial'}:{})};need(['buyer','accountant','accounting-close'].includes(target),'ROZO_DELIVERY_TARGET','Select an original Buyer project or issued accountant/period delivery.');
      if(target==='buyer')integer(p.nativeRevision,'native revision');else id(p.id,'original delivery');
    }else need(false,'ROZO_FINANCE_COMMAND','Choose a complete supported finance command.',404);
    const retainedSource=source?.descriptor?{name:source.descriptor.name,type:source.descriptor.type,bytes:source.descriptor.bytes,sha256:source.descriptor.sha256}:null;
    if(source?.descriptor)this.workspace.object(Buffer.from(source.descriptor.base64,'base64'),source.descriptor.type);
    return {schema:INTENT,target,binding,method,path,body,nativeRequestId,
      nativeFingerprint:fingerprint(target,path,body),accounting,buyer,source:retainedSource,
      createdAt:new Date().toISOString(),workspaceId:envelope.workspaceId};
  }
  execute(envelope){
    need(ROZO_FINANCE_COMMANDS.includes(envelope.command),'ROZO_FINANCE_COMMAND','Choose a supported finance command.');
    const prior=this.workspace.replay(envelope);if(prior?.state==='accepted')return Promise.resolve({...prior.result,reused:true});
    if(this.active.has(envelope.requestId))return this.active.get(envelope.requestId);
    const pending=this.perform(envelope).finally(()=>this.active.delete(envelope.requestId));
    this.active.set(envelope.requestId,pending);return pending;
  }
  async perform(envelope){
    const w=this.workspace,previous=w.replay(envelope);
    const request=previous??w.prepare(envelope,await this.prepare(envelope)),intent=request.intent;
    need(intent?.schema===INTENT&&intent.workspaceId===w.meta().workspaceId,'ROZO_FINANCE_INTENT','Retain the original prepared finance operation.');
    const attempt=w.beginAttempt(request.id,'original_finance_owner',{target:intent.target,binding:intent.binding,nativeRequestId:intent.nativeRequestId});
    let native;
    try{
      const retained=w.get('finance-native-result',request.id);
      let originalResult;
      if(retained){
        need(retained.value.intentSha256===jsonDigest(intent),'ROZO_FINANCE_RESULT_CHANGED','The retained native response names another original intent.');
        originalResult=retained.value.originalResult;
        const raw=w.wholeObject(originalResult.sha256);
        need(raw.length===originalResult.bytes&&digest(raw)===originalResult.sha256,'ROZO_FINANCE_RESULT_CHANGED','The original native response bytes differ.');
        native=JSON.parse(raw.toString('utf8'));
      }else{
        native=plain(await this.dispatch(intent));
        const raw=Buffer.from(canonical(native)+'\n');originalResult=w.object(raw,'application/json');
        w.putProgress('finance-native-result',{id:request.id,intentSha256:jsonDigest(intent),originalResult},request.id);
      }
      w.finishAttempt(request.id,attempt,{state:'returned',details:{originalResult}});
      const outcome={id:request.id,schema:OUTCOME,target:intent.target,binding:intent.binding,
        nativeRequestId:intent.nativeRequestId,nativeFingerprint:intent.nativeFingerprint,source:intent.source,
        originalResult,summary:this.summary(intent,native),createdAt:new Date().toISOString()};
      return w.complete(request.id,outcome,{records:[['finance-outcome',outcome]]});
    }catch(error){
      const accepted=w.request(request.id);if(accepted?.state==='accepted')return accepted.result;
      w.finishAttempt(request.id,attempt,{state:'uncertain',details:{code:typeof error.code==='string'?error.code:'FINANCE_RESPONSE_UNKNOWN',
        message:String(error.message??error).slice(0,2000)}});
      error.details={...error.details,requestId:request.id,requestState:'pending',nativeRequestId:intent.nativeRequestId};
      throw error;
    }
  }
  summary(intent,result){
    if(intent.method==='delivery')return clone(result);
    if(intent.target==='accountant')return {handoffId:result.record.id,returnId:result.savedReturn?.id??null,
      revision:result.state?.revision??null,files:clone(result.savedReturn?.files??result.record.files),duplicate:Boolean(result.duplicate)};
    if(intent.target==='buyer')return {revision:result.revision??null,requestId:result.request_id??null,
      id:result.result?.id??null,sourceId:result.result?.source?.id??result.result?.source_id??null,
      captureId:intent.path==='/api/rozo-reports'?result.result?.capture?.id??null:null,
      closeId:intent.path?.endsWith('/close')?result.result?.id??null:null};
    const {state,...small}=result;return plain(small);
  }
  async dispatch(intent){
    if(intent.method==='delivery')return this.delivery(intent);
    if(intent.target==='buyer')return this.withBuyer(intent.binding,async cap=>{
      let accepted=null;
      try{accepted=await cap.read('/api/requests/'+intent.body.request_id);}catch(error){if(!['REQUEST_NOT_COMMITTED','NOT_FOUND'].includes(error.code))throw error;}
      if(accepted){need(accepted.state==='COMMITTED'&&accepted.id===intent.body.request_id&&accepted.fingerprint===intent.nativeFingerprint,
        'ROZO_BUYER_REQUEST_CHANGED','The accepted original Buyer request differs from its retained body.');return accepted.response;}
      return cap.mutate(intent.path,clone(intent.body));
    });
    if(intent.target==='accountant')return this.withAccountant(intent.binding,cap=>intent.method==='create'?
      cap.accountant.create(clone(intent.body)):cap.accountant.apply(intent.path,clone(intent.body)));
    return this.withAccounting(intent.binding,cap=>intent.method==='savePeriod'?
      cap.finance.savePeriod(clone(intent.body)):cap.finance.mutate(clone(intent.body)));
  }
  async delivery(intent){
    const p=intent.body,w=this.workspace;let files=[],nativeRevision=null;
    if(intent.target==='buyer'){
      await this.withBuyer(intent.binding,async cap=>{
        const state=await cap.read('/api/state');need(state.revision===p.nativeRevision,'ROZO_BUYER_EXPORT_CHANGED','Choose the reviewed original Buyer project revision.');
        const raw=Buffer.from(await cap.bytes('/api/complete-project?expected_revision='+p.nativeRevision));
        files.push({name:'buyer-complete-project.zip',...w.object(raw,'application/zip')});nativeRevision=p.nativeRevision;
      });
    }else if(intent.target==='accounting-close'){
      await this.withAccounting(intent.binding,async cap=>{
        const file=await cap.finance.closeFile(p.id);
        if(p.expectedSha256)need(digest(file.bytes)===p.expectedSha256,'ROZO_CLOSE_CHANGED','Select the original issued source SHA-256.');
        files.push({name:file.name,...w.object(file.bytes,'application/json')});nativeRevision=file.row.revision??null;
      });
    }else{
      await this.withAccountant(intent.binding,async cap=>{
        const detail=await cap.accountant.detail(p.id,{revisionId:p.revisionId}),selected=p.revisionId&&p.revisionId!=='initial'?
          detail.record.revisions.find(row=>row.id===p.revisionId):detail.record;
        need(selected,'ROZO_ACCOUNTANT_REVISION','Select an original issued accountant revision.');
        for(const descriptor of selected.files){
          const file=await cap.accountant.file(p.id,descriptor.name,{revisionId:p.revisionId});
          need(file.bytes.length===descriptor.bytes&&digest(file.bytes)===descriptor.sha256,'ROZO_ACCOUNTANT_FILE_CHANGED','The complete original accountant file differs.');
          files.push({name:descriptor.name,...w.object(file.bytes,file.type)});
        }
        nativeRevision=detail.record.id;
      });
    }
    return {target:intent.target,binding:intent.binding,nativeRevision,files};
  }
  async buyerReturnPreview(value){
    fields(value,['binding','accountingBinding','closeId','handoffId','revisionId','name','actor','reason','supersedes'],'Buyer return preview');
    const file=await this.withAccountant(value.accountingBinding,cap=>cap.accountant.file(value.handoffId,'buyer-return.json',{revisionId:value.revisionId}));
    return this.withBuyer(value.binding,async cap=>{
      const payload={content_base64:file.bytes.toString('base64'),sha256:digest(file.bytes),name:value.name,operator:value.actor,
        reason:value.reason??'',supersedes:value.supersedes??null};
      const preview=await cap.mutate('/api/closes/'+id(value.closeId)+'/accountant-preview',{payload});
      return {preview,file:{name:file.name,bytes:file.bytes.length,sha256:digest(file.bytes)},state:await cap.read('/api/state')};
    });
  }
}
