// MIT. Accountant handoffs consume the original retained accounting workspace.
import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open,link,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createHandoff,importReturn,inspectHandoff,renderCsv,renderHtml,validateHandoff,validateRevision} from '../accountant/engine.mjs';
import {renderAdjustmentCsv,renderAdjustmentHtml} from '../adjustments.mjs';
import {freezeAccountantAdjustments} from '../accountant/adjustments.mjs';
import {inspectBuyerSource,isBuyerHandoff} from '../accountant/buyer-source.mjs';
import {createBuyerReturnPacket} from '../accountant/buyer-return.mjs';
import {inspectRozoAccountantSource} from '../accountant/rozo-source.mjs';
import {accountingSourceMode,readBuyerStartup,buyerStartupView} from './buyer-startup.mjs';

export const ACCOUNTANT_CSV_BYTES=64*1024*1024;
export const ACCOUNTANT_REQUEST_BYTES=Math.ceil(ACCOUNTANT_CSV_BYTES*4/3)+500_000;
const FILE_LIMIT=256*1024*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const check=(ok,code,message,status=400)=>{if(!ok)throw Object.assign(new Error(message),{code,status});};
const copy=value=>structuredClone(value);
const id=value=>{check(typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value),'INVALID_ACCOUNTANT_ID','Choose an existing accountant handoff or return.');return value;};
const label=(value,name,max=160)=>{check(typeof value==='string'&&value.trim().length>0&&value.trim().length<=max,'INVALID_FIELD','Check '+name+'.');return value.trim();};
const page=query=>{const offset=Number(query.offset??0),limit=Number(query.limit??50);check(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0&&limit<=200,'INVALID_PAGE','Choose a nonnegative offset and up to 200 records.');return {offset,limit};};
const records=workspace=>workspace.state.accountantHandoffs??[];
const bytesFromBase64=value=>{
  check(typeof value==='string'&&value.length<=Math.ceil(ACCOUNTANT_CSV_BYTES*4/3)+4&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),'INVALID_RETURN_FILE','Choose a CSV file up to 64 MiB.');
  const bytes=Buffer.from(value,'base64');
  check(bytes.length>0&&bytes.length<=ACCOUNTANT_CSV_BYTES&&bytes.toString('base64')===value,'INVALID_RETURN_FILE','Choose a nonempty CSV file up to 64 MiB.');return bytes;
};
async function readExact(path,expected,{max=FILE_LIMIT}={}){
  const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
    const info=await file.stat();check(info.isFile()&&info.size<=max,'ACCOUNTANT_FILE_CHANGED','A retained handoff file is not a regular file within its supported size.',409);
    const bytes=await file.readFile();check((expected.bytes===undefined||bytes.length===expected.bytes)&&hash(bytes)===expected.sha256,'ACCOUNTANT_FILE_CHANGED','The retained handoff file changed.',409);return bytes;
  }finally{await file.close();}
}
async function privateDirectory(path,{create=false}={}){
  if(create)try{await mkdir(path,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  const info=await lstat(path);check(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&
    info.uid===(process.geteuid?.()??process.getuid?.()??info.uid),'PRIVATE_DIRECTORY_REQUIRED','Use the original private accountant workspace directory.');
}
async function syncDirectory(path){const file=await open(path,'r');try{await file.sync();}finally{await file.close();}}
async function retainedJson(directory,name,{max=FILE_LIMIT}={}){
  let file;try{file=await open(join(directory,name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
  try{
    const before=await file.stat();check(before.isFile()&&before.size>0&&before.size<=max&&!(before.mode&0o077)&&
      before.uid===(process.geteuid?.()??process.getuid?.()??before.uid),
      'ACCOUNTANT_PACKET_CHANGED','Keep the original private packet and reopen its retained request.',409);
    const bytes=await file.readFile(),after=await file.stat();
    check(bytes.length===before.size&&before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&
      before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,'ACCOUNTANT_PACKET_CHANGED','The retained packet changed while being read.',409);
    try{return JSON.parse(bytes.toString('utf8'));}catch{check(false,'ACCOUNTANT_PACKET_INCOMPLETE','An earlier packet contains incomplete JSON. Preserve it for original recovery; it cannot be overwritten.',409);}
  }finally{await file.close();}
}
const canonicalTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
async function packetTime(directory,{kind,id:packetId,requestSha256,createdAt,legacyName}){
  const intent=await retainedJson(directory,'packet-intent.json',{max:1_000_000});
  if(intent){
    check(intent.schema==='stellar-forge.accountant-packet-intent.v1'&&intent.kind===kind&&intent.id===packetId&&
      intent.requestSha256===requestSha256&&canonicalTime(intent.createdAt),
      'ACCOUNTANT_PACKET_REQUEST_CONFLICT','This retained packet belongs to a different original request.',409);
    if(createdAt!==undefined)check(createdAt===intent.createdAt,'ACCOUNTANT_PACKET_REQUEST_CONFLICT','Keep the timestamp of the original packet request.',409);
    return intent.createdAt;
  }
  // Completed older records return before here. An interrupted older packet may
  // supply its first immutable timestamp, but every byte must still match below.
  const legacy=await retainedJson(directory,legacyName);
  if(legacy){check(legacy.id===packetId&&canonicalTime(legacy.createdAt),'ACCOUNTANT_PACKET_CHANGED','The original packet identity changed.',409);
    if(createdAt!==undefined)check(createdAt===legacy.createdAt,'ACCOUNTANT_PACKET_REQUEST_CONFLICT','Keep the original packet timestamp.',409);
    return legacy.createdAt;}
  return createdAt??new Date().toISOString();
}
// Publish only a fully synced file. An uncertain commit never removes original
// packet members; the same request verifies and reuses them after Store reopen.
async function writeFile(directory,name,bytes){
  bytes=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  check(bytes.length<=FILE_LIMIT,'ACCOUNTANT_PACKET_LIMIT','A retained accountant packet member exceeds 256 MiB.');
  const descriptor={name,bytes:bytes.length,sha256:hash(bytes)},temporary=join(directory,'.'+name+'.'+randomUUID()+'.pending');
  const file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{
    try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
    try{await link(temporary,join(directory,name));}
    catch(error){if(error.code!=='EEXIST')throw error;await readExact(join(directory,name),descriptor);}
  }finally{await rm(temporary,{force:true});}
  await syncDirectory(directory);return descriptor;
}
async function writePacket(directory,files,archiveNames,{kind,id:packetId,requestSha256,createdAt}){
  const intent={schema:'stellar-forge.accountant-packet-intent.v1',kind,id:packetId,requestSha256,createdAt,
    files:Object.entries(files).map(([name,value])=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);return {name,bytes:bytes.length,sha256:hash(bytes)};})};
  const intentBytes=json(intent),intentFile={name:'packet-intent.json',bytes:intentBytes.length,sha256:hash(intentBytes)};
  const expected=[intentFile,...intent.files],names=[...archiveNames,'packet-intent.json'];
  const packetManifest={schema:'stellar-forge.accountant-packet.v1',files:expected.filter(file=>names.includes(file.name))};
  const manifestBytes=json(packetManifest),manifestFile={name:'packet-manifest.json',bytes:manifestBytes.length,sha256:hash(manifestBytes)};
  // A legacy orphan has no stored request hash. Check every already-present
  // canonical member BEFORE allowing this request to publish its first intent.
  for(const descriptor of [...expected,manifestFile]){
    try{await readExact(join(directory,descriptor.name),descriptor);}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const retained=[await writeFile(directory,'packet-intent.json',intentBytes)];
  for(const [name,bytes] of Object.entries(files))retained.push(await writeFile(directory,name,bytes));
  retained.push(await writeFile(directory,'packet-manifest.json',manifestBytes));
  const temporary=join(directory,'.accountant-handoff.'+randomUUID()+'.pending'),archive=await open(temporary,'wx',0o600);
  try{
    try{
      await new Promise((resolve,reject)=>{
        // Fixed archive metadata lets the same complete packet compare exactly
        // after interruption. The original tar delivery format is retained.
        const child=spawn('tar',['--format=ustar','--mtime=@0','--owner=0','--group=0','--numeric-owner','--mode=0600',
          '-cf','-','-C',directory,'--',...names,'packet-manifest.json'],{stdio:['ignore',archive.fd,'pipe']});
        let message='';child.stderr.on('data',chunk=>{if(message.length<2000)message+=chunk;});child.once('error',reject);
        child.once('close',code=>code===0?resolve():reject(new Error('The accountant archive could not be completed: '+message)));
      });
      await archive.sync();
    }finally{await archive.close();}
    const file=await open(temporary,constants.O_RDONLY|constants.O_NOFOLLOW);let descriptor;
    try{const info=await file.stat();check(info.isFile()&&info.size<=FILE_LIMIT,'ACCOUNTANT_PACKET_LIMIT','The complete accountant archive exceeds 256 MiB.');
      const bytes=await file.readFile();descriptor={name:'accountant-handoff.tar',bytes:bytes.length,sha256:hash(bytes)};}
    finally{await file.close();}
    try{await link(temporary,join(directory,descriptor.name));}
    catch(error){if(error.code!=='EEXIST')throw error;await readExact(join(directory,descriptor.name),descriptor);}
    retained.push(descriptor);await syncDirectory(directory);return retained;
  }finally{await rm(temporary,{force:true});}
}

export class AccountantWorkspace{
  constructor(workspace){this.workspace=workspace;}
  row(handoffId){id(handoffId);const row=records(this.workspace).find(item=>item.id===handoffId);check(row,'ACCOUNTANT_HANDOFF_NOT_FOUND','Choose a retained accountant handoff.',404);return row;}
  directory(handoffId){return join(this.workspace.directory,'accountant',id(handoffId));}
  revisionRow(row,revisionId){
    if(revisionId===null||revisionId==='initial')return null;
    const wanted=revisionId??row.revisions.at(-1)?.id;
    if(!wanted)return null;
    id(wanted);const revision=row.revisions.find(item=>item.id===wanted);check(revision,'ACCOUNTANT_RETURN_NOT_FOUND','Choose a retained accountant return.',404);return revision;
  }
  async readHandoff(handoffId){
    const record=this.row(handoffId),file=record.files.find(item=>item.name==='handoff.json');
    const handoff=JSON.parse((await readExact(join(this.directory(handoffId),'handoff.json'),file)).toString('utf8'));
    validateHandoff(handoff,{allowBuyer:true,allowRozo:true});check(handoff.id===record.id,'ACCOUNTANT_HANDOFF_CHANGED','The retained handoff identity changed.',409);return handoff;
  }
  async readRevision(record,handoff,revisionId){
    const revision=this.revisionRow(record,revisionId);if(!revision)return null;
    const file=revision.files.find(item=>item.name==='return.json');
    const value=JSON.parse((await readExact(join(this.directory(record.id),'returns',revision.id,'return.json'),file)).toString('utf8'));
    validateRevision(handoff,value);return value;
  }
  view(){return {revision:this.workspace.state.revision,handoffs:copy(records(this.workspace)),closes:copy(this.workspace.periods?.view().closes??[])};}
  buyerSource(value){
    check(value&&typeof value==='object'&&!Array.isArray(value),'BUYER_SOURCE_REQUIRED','Choose the original issued buyer source file.');
    const raw=bytesFromBase64(value.contentBase64);
    check(typeof value.sha256==='string'&&hash(raw)===value.sha256,'BUYER_SOURCE_CHANGED','The selected buyer source bytes differ from the reviewed file.',409);
    const inspected=inspectBuyerSource(raw);
    return {buyerSourceBytes:raw,source:inspected.source,inspected};
  }
  async prepareBuyer(value){
    check(value&&typeof value==='object'&&!Array.isArray(value)&&(value.buyerSource!==undefined||value.buyerStartup!==undefined),'BUYER_SOURCE_REQUIRED','Choose the retained startup source or an original issued buyer file.');
    const selected=await this.source({buyerSource:value.buyerSource,buyerStartup:value.buyerStartup}),v=selected.inspected;
    return {source:v.source,period:v.document.issued.period,totals:v.document.issued.totals,creditTotals:v.document.issued.credit_totals??[],netTotals:v.document.issued.net_totals??v.document.issued.totals,options:[],rowCount:v.rows.length,
      workspaceRevision:this.workspace.state.revision,sourceKind:'buyer-expense-period',buyerSourceSha256:v.sha256,rows:v.rows.slice(0,25),retainedRows:v.rows.length};
  }
  async startup(){
    if(accountingSourceMode(this.workspace.state)!=='buyer')return {available:false,sourceMode:'merchant'};
    const source=await readBuyerStartup(this.workspace.directory,this.workspace.state);
    return {available:true,sourceMode:'buyer',source:buyerStartupView(this.workspace.directory,this.workspace.state),workspaceRevision:this.workspace.state.revision};
  }
  async startupFile(){
    const source=await readBuyerStartup(this.workspace.directory,this.workspace.state);
    return {bytes:source.bytes,name:'original-issued-buyer-source.json',type:'application/json; charset=utf-8'};
  }
  rozoSource(value){
    check(value&&typeof value==='object'&&!Array.isArray(value),'ROZO_SOURCE_REQUIRED','Choose the original issued ROZO close source.');
    const raw=bytesFromBase64(value.contentBase64);
    check(typeof value.sha256==='string'&&hash(raw)===value.sha256,'ROZO_SOURCE_CHANGED','The original ROZO close source differs from its reviewed SHA-256.',409);
    const inspected=inspectRozoAccountantSource(raw);
    return {rozoSourceBytes:raw,source:inspected.source,inspected};
  }
  async prepareRozo(value){
    const selected=this.rozoSource(value.rozoSource),v=selected.inspected;
    return {source:v.source,period:v.document.close.period,totals:v.document.close.totals,
      options:[],rowCount:v.rows.length,workspaceRevision:this.workspace.state.revision,
      sourceKind:'rozo-settlement-period',rozoSourceSha256:v.sha256,rows:v.rows.slice(0,25),retainedRows:v.rows.length};
  }
  async source({runId,closeId=null,buyerSource,buyerStartup,rozoSource}){
    if(rozoSource!==undefined){
      check(!runId&&!closeId&&buyerSource===undefined&&buyerStartup===undefined,'ACCOUNTANT_SOURCE_AMBIGUOUS','Choose one original ROZO, buyer or merchant source.');
      return this.rozoSource(rozoSource);
    }
    if(buyerStartup!==undefined){
      check(buyerSource===undefined&&!runId&&!closeId&&buyerStartup&&typeof buyerStartup==='object'&&!Array.isArray(buyerStartup)&&
        Object.keys(buyerStartup).length===1&&buyerStartup.sha256===this.workspace.state.buyerStartup?.sha256,
        'ACCOUNTANT_SOURCE_AMBIGUOUS','Select the exact retained buyer startup source.');
      const selected=await readBuyerStartup(this.workspace.directory,this.workspace.state);
      return {buyerSourceBytes:selected.bytes,source:selected.inspected.source,inspected:selected.inspected};
    }
    if(buyerSource!==undefined){check(!runId&&!closeId,'ACCOUNTANT_SOURCE_AMBIGUOUS','Choose one original buyer source or merchant source.');return this.buyerSource(buyerSource);}
    const workspace=this.workspace;workspace.merchantSources();let periodCloseBytes=null,reviewNotesBytes=null,periodClose=null,adjustmentsBytes=null,adjustmentFiles=null;
    if(closeId){
      check(workspace.periods,'ACCOUNTING_PERIODS_UNAVAILABLE','Open this workspace with the maintained recorded-activity periods module.');
      const close=workspace.periods.closeRow(closeId);
      check(!runId||runId===close.runId,'ACCOUNTING_CLOSE_RUN_MISMATCH','Choose the reconciliation retained by this period close.');runId=close.runId;
      periodCloseBytes=(await workspace.periods.file(closeId,'period-close.json')).bytes;
      reviewNotesBytes=(await workspace.periods.file(closeId,'review-notes.json')).bytes;
      periodClose={id:close.id,revision:close.revision,sha256:hash(periodCloseBytes)};
      if(JSON.parse(periodCloseBytes).adjustmentsSha256){
        adjustmentFiles={};
        for(const name of ['adjustments.json','adjustments.csv','adjustments.html'])
          adjustmentFiles[name]=(await workspace.periods.file(closeId,name)).bytes;
        adjustmentsBytes=adjustmentFiles['adjustments.json'];
      }
    }
    const run=copy(workspace.runRow(runId));
    const reportBytes=await workspace.reportFile(runId,'report.json'),manifestBytes=await workspace.reportFile(runId,'manifest.json');
    const inputManifestBytes=await readExact(join(workspace.runPath(runId),'input-manifest.json'),{sha256:run.inputManifestSha256},{max:16_000_000});
    if(!closeId&&workspace.adjustments){
      const snapshot=await workspace.adjustments.snapshot(runId);adjustmentsBytes=json(snapshot);
      adjustmentFiles={'adjustments.json':adjustmentsBytes,'adjustments.csv':renderAdjustmentCsv(snapshot),'adjustments.html':renderAdjustmentHtml(snapshot)};
    }
    return {run,reportBytes,manifestBytes,inputManifestBytes,periodCloseBytes,reviewNotesBytes,adjustmentsBytes,adjustmentFiles,
      source:{runId,reportSha256:run.reportSha256,manifestSha256:run.manifestSha256,inputManifestSha256:run.inputManifestSha256,
        ...(periodClose?{periodClose}:{}),...(adjustmentsBytes?{adjustmentsSha256:hash(adjustmentsBytes)}:{})}};
  }
  async prepare({runId,closeId}){
    const source=await this.source({runId,closeId});
    const report=JSON.parse(source.reportBytes.toString('utf8'));
    const adjustments=freezeAccountantAdjustments({adjustmentsBytes:source.adjustmentsBytes,report,source:source.source,
      periodCloseDocument:source.periodCloseBytes?JSON.parse(source.periodCloseBytes):undefined});
    return {run:source.run,source:source.source,period:report.period??null,totals:report.totals,options:report.options,rowCount:report.ledger.length,
      workspaceRevision:source.source.periodClose?this.workspace.state.revision:(adjustments?.source.workspaceRevision??this.workspace.state.revision),
      ...(adjustments?{adjustments:{source:adjustments.source,summary:adjustments.summary}}:{})};
  }
  async create(value){
    value=copy(value);
    const workspace=this.workspace;
    return workspace.serial(async()=>{
      const startup=value.buyerStartup!==undefined;
      const handoffId=id(value.id??(startup?workspace.state.buyerStartup?.handoffId:randomUUID())),name=label(value.name,'handoff name'),actor=label(value.actor,'operator',1000);
      if(startup)check(handoffId===workspace.state.buyerStartup?.handoffId,'BUYER_STARTUP_HANDOFF_ID','Use the retained startup handoff ID to recover this same source review.',409);
      const request={runId:value.runId??null,closeId:value.closeId??null,name,actor,labels:value.labels??[],...(value.rozoSource!==undefined?{rozoSource:copy(value.rozoSource)}:{}),...(value.buyerSource!==undefined?{buyerSource:copy(value.buyerSource)}:{}),...(value.buyerStartup!==undefined?{buyerStartup:copy(value.buyerStartup)}:{})},requestSha256=hash(json(request));
      const prior=records(workspace).find(item=>item.id===handoffId);
      if(prior){check(prior.requestSha256===requestSha256,'HANDOFF_REQUEST_CONFLICT','This request ID already belongs to another handoff.',409);return {record:copy(prior),duplicate:true,state:workspace.view()};}
      workspace.expected(value.revision);check(records(workspace).length<2000,'ACCOUNTANT_HANDOFF_LIMIT','This workspace already retains 2,000 accountant handoffs.');
      const selected=await this.source(request);
      const root=join(workspace.directory,'accountant');
      try{await privateDirectory(root,{create:true});}catch(error){if(error.code!=='EEXIST')throw error;await privateDirectory(root);}
      const directory=this.directory(handoffId);await privateDirectory(directory,{create:true});
      const createdAt=await packetTime(directory,{kind:'handoff',id:handoffId,requestSha256,legacyName:'handoff.json'});
      const handoff=createHandoff({...selected,name,actor,labels:request.labels,createdAt,id:handoffId});
      await privateDirectory(join(directory,'returns'),{create:true});
      {
        const files={'handoff.json':json(handoff),'accountant.csv':renderCsv(handoff),'review.html':renderHtml(handoff)};
        if(selected.rozoSourceBytes)files['original-rozo-source.json']=selected.rozoSourceBytes;
        else if(selected.buyerSourceBytes)files['original-buyer-source.json']=selected.buyerSourceBytes;
        else Object.assign(files,{'original-report.json':selected.reportBytes,'original-manifest.json':selected.manifestBytes,'input-manifest.json':selected.inputManifestBytes});
        const archiveNames=Object.keys(files);
        if(selected.periodCloseBytes){files['period-close.json']=selected.periodCloseBytes;files['review-notes.json']=selected.reviewNotesBytes;archiveNames.push('period-close.json','review-notes.json');}
        if(selected.adjustmentFiles)for(const [filename,bytes] of Object.entries(selected.adjustmentFiles)){files[filename]=bytes;archiveNames.push(filename);}
        const savedFiles=await writePacket(directory,files,archiveNames,{kind:'handoff',id:handoffId,requestSha256,createdAt});
        const record={id:handoffId,name,actor,createdAt,requestSha256,source:handoff.source,rowCount:handoff.rows.length,summary:handoff.summary,files:savedFiles,revisions:[]};
        workspace.state.accountantHandoffs??=[];workspace.state.accountantHandoffs.unshift(record);
        await syncDirectory(root);await workspace.commit('accountant_handoff_created',actor,{handoffId,runId:handoff.source.runId,closeId:handoff.source.periodClose?.id??null,reportSha256:handoff.source.reportSha256});
        return {record:copy(record),duplicate:false,state:workspace.view()};
      }
    });
  }
  async detail(handoffId,{revisionId}={}){
    const record=this.row(handoffId),handoff=await this.readHandoff(handoffId),revision=await this.readRevision(record,handoff,revisionId);
    const inspected=inspectHandoff(handoff,revision);
    return {record:copy(record),handoff:inspected.handoff,source:inspected.source,summary:inspected.summary,selectedRevision:revision?{id:revision.id,actor:revision.actor,name:revision.name,createdAt:revision.createdAt,summary:revision.summary,integrity:revision.integrity}:null,issues:inspected.issues??[],labels:copy(handoff.labels)};
  }
  async rows(handoffId,query={}){
    const {offset,limit}=page(query),record=this.row(handoffId),handoff=await this.readHandoff(handoffId),revision=await this.readRevision(record,handoff,query.revisionId);
    let items=inspectHandoff(handoff,revision).rows;
    if(query.status)items=items.filter(row=>row.externalStatus===query.status);
    if(query.search){const search=String(query.search).toLowerCase().slice(0,500);items=items.filter(row=>JSON.stringify(row).toLowerCase().includes(search));}
    return {items:items.slice(offset,offset+limit),total:items.length,offset,limit,revisionId:revision?.id??null};
  }
  async preview(handoffId,value){
    const record=this.row(handoffId),handoff=await this.readHandoff(handoffId),parent=await this.readRevision(record,handoff);
    check((value.expectedParentId??null)===(parent?.id??null),'STALE_ACCOUNTANT_RETURN','A newer accountant return is saved. Reload it and preview this file against the current revision.',409);
    const csvBytes=bytesFromBase64(value.csvBase64),actor=label(value.actor,'operator',1000),name=label(value.name,'return name');
    const proposed=importReturn({handoff,csvBytes,actor,name,parentRevision:parent,createdAt:value.createdAt??new Date().toISOString(),id:id(value.id??randomUUID())});
    return {revision:proposed,workspaceRevision:this.workspace.state.revision,expectedParentId:parent?.id??null};
  }
  async apply(handoffId,value){
    value=copy(value);
    const workspace=this.workspace;
    return workspace.serial(async()=>{
      const record=this.row(handoffId),returnId=id(value.id),csvBytes=bytesFromBase64(value.csvBase64),name=label(value.name,'return name'),actor=label(value.actor,'operator',1000);
      const request={id:returnId,name,actor,importSha256:hash(csvBytes),parentRevisionId:value.expectedParentId??null,previewSha256:value.previewSha256},requestSha256=hash(json(request));
      const prior=record.revisions.find(item=>item.id===returnId);
      if(prior){check(prior.requestSha256===requestSha256,'ACCOUNTANT_RETURN_REQUEST_CONFLICT','This request ID already belongs to a different accountant return.',409);return {record:copy(record),savedReturn:copy(prior),duplicate:true,state:workspace.view()};}
      workspace.expected(value.revision);check(record.revisions.length<2000,'ACCOUNTANT_RETURN_LIMIT','This handoff already retains 2,000 accountant returns.');
      const directory=join(this.directory(handoffId),'returns',returnId);await privateDirectory(directory,{create:true});
      const createdAt=await packetTime(directory,{kind:'return',id:returnId,requestSha256,createdAt:value.createdAt,legacyName:'return.json'});
      const preview=await this.preview(handoffId,{...value,createdAt}),result=preview.revision;
      check(typeof value.previewSha256==='string'&&value.previewSha256===result.integrity.sha256,'ACCOUNTANT_PREVIEW_CHANGED','Preview the current returned file before saving its matched changes.',409);
      const handoff=await this.readHandoff(handoffId);
      {
        const files={'return.json':json(result),'returned.csv':csvBytes,'accountant.csv':renderCsv(handoff,result),'review.html':renderHtml(handoff,result),'handoff.json':json(handoff)};
        for(const filename of ['original-rozo-source.json','original-buyer-source.json','original-report.json','original-manifest.json','input-manifest.json','period-close.json','review-notes.json','adjustments.json','adjustments.csv','adjustments.html']){
          const original=record.files.find(file=>file.name===filename);if(original)files[filename]=await readExact(join(this.directory(handoffId),filename),original);
        }
        if(isBuyerHandoff(handoff)){
          const revisions=[];for(const saved of record.revisions)revisions.push(await this.readRevision(record,handoff,saved.id));revisions.push(result);
          files['buyer-return.json']=json(createBuyerReturnPacket({handoff,revisions,buyerSourceBytes:files['original-buyer-source.json']}));
        }
        const savedFiles=await writePacket(directory,files,Object.keys(files),{kind:'return',id:returnId,requestSha256,createdAt:result.createdAt});
        const saved={id:returnId,name,actor,createdAt:result.createdAt,requestSha256,parentRevisionId:result.parentRevisionId,importSha256:result.importSha256,summary:result.summary,integrity:result.integrity,files:savedFiles};
        record.revisions.push(saved);await syncDirectory(join(this.directory(handoffId),'returns'));
        await workspace.commit('accountant_return_imported',actor,{handoffId,returnId,parentRevisionId:result.parentRevisionId,importSha256:result.importSha256,summary:result.summary});
        return {record:copy(record),savedReturn:copy(saved),duplicate:false,state:workspace.view()};
      }
    });
  }
  async file(handoffId,name,{revisionId}={}){
    const record=this.row(handoffId);await this.readHandoff(handoffId);
    const revision=this.revisionRow(record,revisionId),files=revision?.files??record.files;
    const file=files.find(item=>item.name===name);check(file,'ACCOUNTANT_FILE_NOT_FOUND','Choose a retained accountant handoff file.',404);
    const directory=revision?join(this.directory(handoffId),'returns',revision.id):this.directory(handoffId);
    return {bytes:await readExact(join(directory,file.name),file),name:(record.source.kind==='rozo-settlement-period'?'rozo-accountant-':record.source.kind==='buyer-expense-period'?'buyer-accountant-':'merchant-accountant-')+(revision?.id??handoffId)+'-'+file.name,type:({csv:'text/csv; charset=utf-8',json:'application/json; charset=utf-8',html:'text/html; charset=utf-8',tar:'application/x-tar'})[file.name.split('.').at(-1)]??'application/octet-stream'};
  }
}

export async function handleAccountantRequest(accountant,{method,path,query={},value}){
  const parts=path.split('/').filter(Boolean);if(parts[0]!=='api'||parts[1]!=='accountant')return null;
  if(parts.length===2&&method==='GET')return {value:accountant.view()};
  if(path==='/api/accountant/startup'&&method==='GET')return {value:await accountant.startup()};
  if(path==='/api/accountant/startup/source'&&method==='GET')return {file:await accountant.startupFile()};
  if(path==='/api/accountant/source'&&method==='GET')return {value:await accountant.prepare(query)};
  if(path==='/api/accountant/rozo-source/preview'&&method==='POST')return {value:await accountant.prepareRozo(value)};
  if(path==='/api/accountant/buyer-source/preview'&&method==='POST')return {value:await accountant.prepareBuyer(value)};
  if(path==='/api/accountant/handoffs'&&method==='POST')return {value:await accountant.create(value)};
  if(parts[2]==='handoffs'&&parts[3]){
    const handoffId=parts[3];
    if(parts.length===4&&method==='GET')return {value:await accountant.detail(handoffId,query)};
    if(parts.length===5&&parts[4]==='rows'&&method==='GET')return {value:await accountant.rows(handoffId,query)};
    if(parts.length===5&&parts[4]==='preview'&&method==='POST')return {value:await accountant.preview(handoffId,value)};
    if(parts.length===5&&parts[4]==='returns'&&method==='POST')return {value:await accountant.apply(handoffId,value)};
    if(parts.length===6&&parts[4]==='download'&&method==='GET')return {file:await accountant.file(handoffId,parts[5],query)};
  }
  check(false,'NOT_FOUND','This accountant handoff operation was not found.',404);
}
