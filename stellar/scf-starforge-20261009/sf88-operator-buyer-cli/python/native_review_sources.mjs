// MIT — Portable receiving inputs from complete original B41A exports and saved native state.
import fs from 'node:fs';
import {join,resolve,relative,isAbsolute,dirname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

export const PRODUCT='stellar/scf-starforge-20261009/sf88-operator-buyer-cli';
export const PROGRAMME='SCF-REVIEW-RETURNS-COMPOSITION-B41A-20261012';
export const OPERATION='SCF-COMPLETE-CUSTOMER-BROWSER-90ED-20261013';
const ORIGINAL_PLAN='ca50821f11d425ebf9aafeae93ec51f37470dce48ea0c6a6c9950e0ef3a0cdb7';
const ORIGINAL_INCOMING='9db287d956084b8d2e33ad8f443dc5d62093f342729c2e72c5ffe0bdb3d43e4b';
export function need(ok,message){if(!ok)throw new Error(message);}
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export function regular(path){
  const stat=fs.lstatSync(path);need(stat.isFile()&&!stat.isSymbolicLink(),'Read a complete regular file: '+path);
  return fs.readFileSync(path);
}
export function privateDirectory(path){
  need(isAbsolute(path),'Use an absolute private working directory.');
  fs.mkdirSync(path,{recursive:true,mode:0o700});
  const stat=fs.lstatSync(path);
  need(stat.isDirectory()&&!stat.isSymbolicLink()&&!(stat.mode&0o077),'Use a private working directory: '+path);
  return fs.realpathSync(path);
}
export function identity(path){const bytes=regular(path);return {path,bytes:bytes.length,sha256:sha(bytes)};}
function syncDirectory(path){const fd=fs.openSync(path,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
export function atomic(path,bytes,{original=false}={}){
  fs.mkdirSync(dirname(path),{recursive:true,mode:0o700});
  if(fs.existsSync(path)){
    const old=regular(path);if(old.equals(bytes))return;
    need(!original,'The retained original edition changed: '+path);
  }
  const temporary=path+'.'+randomUUID()+'.candidate';
  const fd=fs.openSync(temporary,'wx',0o600);
  try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{
    if(original){
      try{fs.linkSync(temporary,path);}
      catch(error){if(error.code!=='EEXIST'||!regular(path).equals(bytes))throw error;}
    }else fs.renameSync(temporary,path);
    syncDirectory(dirname(path));
  }finally{try{fs.unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
}
export function filesBelow(root){
  const found=[];
  function walk(directory){
    for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
      const path=join(directory,entry.name);
      need(!entry.isSymbolicLink(),'Retain regular original archive members: '+path);
      if(entry.isDirectory())walk(path);
      else if(entry.isFile())found.push(path);
      else need(false,'Unsupported original archive member: '+path);
    }
  }
  walk(root);return found;
}
async function reportBytes(report){
  const chunks=[];for await(const chunk of report.chunks)chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
function assertWithin(root,path){
  const rel=relative(root,path);
  need(rel&&!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel),'Keep receiving outputs inside the original operation.');
}
export async function composeOriginalInputs({source,accepted,retained,work}){
  const nativeRoot=join(source,PRODUCT,'resource-library');
  const format=await import(pathToFileURL(join(nativeRoot,'review-return-format.mjs')).href);
  const handovers=await import(pathToFileURL(join(nativeRoot,'comparison-report.mjs')).href);
  const output=privateDirectory(join(work,'inputs'));
  const indexPath=join(output,'source-index.json');
  if(fs.existsSync(indexPath)){
    const index=JSON.parse(regular(indexPath));
    need(index.schema==='commons.scf-original-browser-inputs.v1'&&index.operation_id===OPERATION&&
      index.accepted===accepted&&index.retained===retained,'Reopen the same original receiving inputs.');
    for(const file of index.files){
      assertWithin(output,file.path);const actual=identity(file.path);
      need(actual.bytes===file.bytes&&actual.sha256===file.sha256,'The saved receiving input changed: '+file.path);
    }
    for(const original of index.original_sources){
      const actual=identity(original.path);
      need(actual.bytes===original.bytes&&actual.sha256===original.sha256,'The original source edition changed: '+original.path);
    }
    return {index,format,handovers};
  }
  const all=[...filesBelow(accepted),...filesBelow(retained)];
  const complete=[];
  for(const path of all.filter(path=>path.endsWith('.json'))){
    const bytes=regular(path);let value;try{value=JSON.parse(bytes);}catch{continue;}
    if(value?.schema!=='stellar-forge.sf88.review-return.v1'||!value.handover||!value.lineage)continue;
    const checked=format.verifyReturn(value);
    const plans=checked.graph.plans.filter(plan=>{
      const base=checked.graph.sources.find(row=>row.id===plan.baseId);
      const returned=checked.graph.sources.find(row=>row.id===plan.sourceId);
      return format.targetPlan(base,returned).some(row=>row.classification==='CONFLICT');
    });
    if(plans.length)complete.push({path,bytes,value,checked,plans,
      preferred:plans.some(plan=>plan.id===ORIGINAL_PLAN),
      accepted:path.startsWith(accepted+sep)});
  }
  complete.sort((a,b)=>Number(b.preferred)-Number(a.preferred)||Number(b.accepted)-Number(a.accepted)||
    b.checked.graph.sources.length-a.checked.graph.sources.length||
    b.checked.graph.receipts.length-a.checked.graph.receipts.length||a.path.localeCompare(b.path,'en'));
  need(complete.length,'The original accepted outputs must include a complete journal with its saved divergent branches.');
  const chosen=complete[0],checked=chosen.checked;
  const plans=[...chosen.plans].sort((a,b)=>Number(b.id===ORIGINAL_PLAN)-Number(a.id===ORIGINAL_PLAN)||a.id.localeCompare(b.id,'en'));
  const plan=plans[0],base=checked.graph.sources.find(row=>row.id===plan.baseId);
  const returned=checked.graph.sources.find(row=>row.id===plan.sourceId);
  const originalReceipt=checked.graph.receipts.find(row=>row.planId===plan.id)??null;
  async function projection(frontier){
    const bytes=await reportBytes(format.returnReport({comparison:checked.packet.comparison,
      decisions:frontier.decisions,rows:function*(){yield* checked.packet.changes;},lineage:checked.graph},'json'));
    const proof=format.verifyReturn(JSON.parse(bytes));
    need(proof.current.id===frontier.id,'The native writer changed the original source journal.');
    return bytes;
  }
  const paths={complete:join(output,'original-complete-review.json'),base:join(output,'original-local-journal.json'),
    returned:join(output,'original-returned-journal.json'),incomingLocal:join(output,'original-incoming-local.json'),
    incoming:join(output,'original-incoming-handover.json'),incomingState:join(output,'original-incoming-state.json')};
  atomic(paths.complete,chosen.bytes,{original:true});
  atomic(paths.base,await projection(base),{original:true});
  atomic(paths.returned,await projection(returned),{original:true});
  // Read the saved native return only. Its configuration and database are never relocated or edited.
  // The private copy also carries any archived WAL, preserving the archive's coherent saved snapshot.
  const incomingCandidates=[];
  for(const database of all.filter(path=>path.endsWith('/library.sqlite'))){
    const copyRoot=fs.mkdtempSync(join(work,'.original-snapshot-'));let db;
    try{
      const originals=[];
      for(const suffix of ['','-wal','-shm']){
        const path=database+suffix;if(!fs.existsSync(path))continue;
        const original=identity(path);originals.push(original);
        fs.writeFileSync(join(copyRoot,'library.sqlite'+suffix),regular(path),{flag:'wx',mode:0o600});
      }
      db=new DatabaseSync(join(copyRoot,'library.sqlite'),{readOnly:true});
      const exists=name=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
      if(!exists('comparison_review_returns')||!exists('comparisons')||!exists('comparison_changes'))continue;
      for(const record of db.prepare('SELECT * FROM comparison_review_returns ORDER BY received_at DESC,id').all()){
        const comparison=db.prepare('SELECT * FROM comparisons WHERE id=?').get(record.comparison);
        if(comparison?.state!=='COMPLETE')continue;
        const header=JSON.parse(record.incoming_comparison);
        need(header.id===record.comparison&&header.resultSha256===comparison.result_hash,'The archived incoming comparison binding differs.');
        const changes=db.prepare('SELECT content FROM comparison_changes WHERE comparison=? AND generation=? ORDER BY ordinal')
          .all(record.comparison,comparison.generation).map(row=>JSON.parse(row.content));
        const local=db.prepare('SELECT content FROM comparison_decisions WHERE comparison=? ORDER BY target,revision')
          .all(record.comparison).map(row=>JSON.parse(row.content));
        const incoming=JSON.parse(record.incoming_decisions);
        const packetBytes=await reportBytes(handovers.exportHandover({comparison:header,decisions:incoming,
          rows:function*(){yield* changes;}},'json'));
        const packet=handovers.verifyHandover(JSON.parse(packetBytes));
        need(packet.handoverSha256===record.handover_hash,'The original incoming handover cannot be reproduced.');
        const expectedId=sha(Buffer.from(JSON.stringify({schema:'stellar-forge.sf88.review-return.v1',
          comparisonId:header.id,handoverSha256:packet.handoverSha256})));
        need(expectedId===record.id,'The original incoming return identity changed.');
        const localBytes=await reportBytes(handovers.exportHandover({comparison:header,decisions:local,
          rows:function*(){yield* changes;}},'json'));
        handovers.verifyHandover(JSON.parse(localBytes));
        const choices=exists('comparison_review_return_choices')?
          db.prepare('SELECT content FROM comparison_review_return_choices WHERE return_id=? ORDER BY target,revision')
            .all(record.id).map(row=>JSON.parse(row.content)):[];
        const requests=exists('comparison_requests')?
          db.prepare('SELECT operation,digest,result FROM comparison_requests ORDER BY operation').all():[];
        incomingCandidates.push({record,originals,packetBytes,localBytes,choices,requests,localCount:local.length});
      }
    }finally{if(db)db.close();fs.rmSync(copyRoot,{recursive:true,force:true});}
  }
  incomingCandidates.sort((a,b)=>Number(b.record.id===ORIGINAL_INCOMING)-Number(a.record.id===ORIGINAL_INCOMING)||
    b.record.received_at.localeCompare(a.record.received_at,'en')||b.localCount-a.localCount||a.record.id.localeCompare(b.record.id,'en'));
  need(incomingCandidates.length,'Retain the original incoming-review SQLite snapshot from the accepted outputs archive.');
  const incoming=incomingCandidates[0];
  atomic(paths.incomingLocal,incoming.localBytes,{original:true});
  atomic(paths.incoming,incoming.packetBytes,{original:true});
  atomic(paths.incomingState,json({schema:'commons.scf-original-incoming-state.v1',
    record:incoming.record,choices:incoming.choices,requests:incoming.requests,original_sources:incoming.originals}),{original:true});
  const index={schema:'commons.scf-original-browser-inputs.v1',operation_id:OPERATION,parent_operation_id:PROGRAMME,
    accepted,retained,comparison_id:checked.packet.comparison.id,original_plan_id:plan.id,
    base_journal_id:base.id,returned_journal_id:returned.id,original_resolution:originalReceipt,
    incoming_return_id:incoming.record.id,incoming_comparison_id:incoming.record.comparison,
    formats:['json','html',...(all.some(path=>path.toLowerCase().endsWith('.csv'))?['csv']:[])],
    paths,original_sources:[{path:chosen.path,bytes:chosen.bytes.length,sha256:sha(chosen.bytes)},...incoming.originals],
    files:Object.values(paths).map(identity)};
  atomic(indexPath,json(index),{original:true});
  return {index,format,handovers};
}
