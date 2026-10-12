// MIT. Apply ordered source-bound collection deliveries to an independently retained customer workspace.
import {mkdtemp,rm,readFile,open} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {validateDefinition,validateEdition,checkRow,openIndex,loadRows,applyChanges,exportIndex,
  TRANSFER_SCHEMA,CLIENT_SCHEMA,rowBytes} from './engine.mjs';
import {editionDirectory} from './core.mjs';
import {need,plain,shape,HASH,LIMITS,integer,text,sha,same,bytes,identity,read,readJSON,maybeJSON,
  privateDirectory,pathAt,measureChecked,immutable,copy,atomic,inventory,leased,lines,chunks} from './files.mjs';

export async function verifySubscriptionTransfer(source,expectedSha256){
  need(HASH.test(expectedSha256),'TRANSFER_IDENTITY','Select the exact original transfer manifest SHA.',400);
  const root=await privateDirectory(source),raw=await read(await pathAt(root,'transfer.json'),16777216);
  need(sha(raw)===expectedSha256,'TRANSFER_CHANGED','The selected transfer manifest changed.');const manifest=JSON.parse(raw);
  shape(manifest,['schema','mode','definitionSha256','fromRevision','fromEditionSha256','toRevision','toEditionSha256','editions','files','meaning'],'transfer manifest');
  need(manifest.schema===TRANSFER_SCHEMA&&['baseline','changes'].includes(manifest.mode)&&HASH.test(manifest.definitionSha256)&&
    HASH.test(manifest.toEditionSha256)&&Array.isArray(manifest.files)&&manifest.files.length<=LIMITS.files&&Array.isArray(manifest.editions),
    'TRANSFER','Choose a complete original subscription delivery.');
  integer(manifest.fromRevision,0,LIMITS.editions,'starting revision');integer(manifest.toRevision,1,LIMITS.editions,'ending revision');
  need(manifest.toRevision>manifest.fromRevision&&(manifest.mode==='baseline'?manifest.fromRevision===0&&manifest.fromEditionSha256===null:
    manifest.fromRevision>0&&HASH.test(manifest.fromEditionSha256)&&manifest.toRevision-manifest.fromRevision<=LIMITS.transferEditions),
    'TRANSFER_RANGE','The complete delivery edition range changed.');
  const expectedNames=new Set(['definition.json']),n=manifest.mode==='baseline'?1:manifest.toRevision-manifest.fromRevision;
  need(manifest.editions.length===n,'TRANSFER_EDITIONS','The delivery omits or repeats an edition.');
  for(let i=0;i<n;i++){const edition=manifest.editions[i],revision=manifest.mode==='baseline'?manifest.toRevision:manifest.fromRevision+i+1;
    need(plain(edition)&&edition.revision===revision&&HASH.test(edition.sha256),'TRANSFER_EDITIONS','The delivery edition order changed.');
    expectedNames.add(editionDirectory(revision)+'/edition.json');expectedNames.add(editionDirectory(revision)+'/'+(manifest.mode==='baseline'?'rows.jsonl':'changes.jsonl'));}
  need(manifest.editions.at(-1).sha256===manifest.toEditionSha256,'TRANSFER_IDENTITY','The final edition differs from the selected source.');
  const seen=new Set();let total=raw.length;
  for(const file of manifest.files){shape(file,['path','bytes','sha256'],'transfer file');
    need(expectedNames.has(file.path)&&!seen.has(file.path)&&HASH.test(file.sha256)&&Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=LIMITS.fileBytes,
      'TRANSFER_FILE','A delivery file is missing, duplicated or undeclared.');
    total+=file.bytes;need(total<=LIMITS.totalBytes,'TRANSFER_LIMIT','The complete delivery exceeds its byte limit.');
    seen.add(file.path);await measureChecked(await pathAt(root,file.path),{bytes:file.bytes,sha256:file.sha256});}
  need(seen.size===expectedNames.size,'TRANSFER_MISSING','The delivery omits a declared file.');
  const definitionRaw=await read(await pathAt(root,'definition.json'),1048576);need(sha(definitionRaw)===manifest.definitionSha256,'DEFINITION_CHANGED','The delivered definition changed.');
  const definition=validateDefinition(JSON.parse(definitionRaw)),editions=[];let previous=manifest.fromEditionSha256;
  for(const record of manifest.editions){
    const name=editionDirectory(record.revision)+'/edition.json',editionRaw=await read(await pathAt(root,name),1048576);
    need(sha(editionRaw)===record.sha256,'EDITION_CHANGED','An original delivered edition changed.');
    const edition=validateEdition(JSON.parse(editionRaw),definition);need(Buffer.compare(editionRaw,bytes(edition))===0,'EDITION_ENCODING','Retain the exact original canonical edition manifest.');
    need(edition.revision===record.revision&&edition.definitionSha256===manifest.definitionSha256&&
      (manifest.mode==='baseline'||edition.previousSha256===previous),'EDITION_CHAIN','The original edition chain does not continue its selected baseline.');
    const payload=manifest.files.find(f=>f.path===editionDirectory(record.revision)+'/'+(manifest.mode==='baseline'?'rows.jsonl':'changes.jsonl'));
    need(same({bytes:payload.bytes,sha256:payload.sha256},edition.files[manifest.mode==='baseline'?'rows.jsonl':'changes.jsonl']),'EDITION_FILE','The original delivered row identity changed.');
    editions.push({edition,sha256:record.sha256});previous=record.sha256;
  }
  return {root,raw,manifest,definition,definitionRaw,editions,sha256:expectedSha256,bytes:raw.length,totalBytes:total};
}
async function customerState(root){
  const state=await maybeJSON(root,'customer.json');if(!state)return null;
  need(state.schema===CLIENT_SCHEMA&&HASH.test(state.definitionSha256)&&HASH.test(state.editionSha256)&&
    Number.isSafeInteger(state.revision)&&state.revision>0&&state.revision<=LIMITS.editions&&
    plain(state.snapshot)&&Array.isArray(state.transfers)&&state.transfers.length<=LIMITS.editions&&
    state.snapshot.path==='snapshots/'+state.editionSha256+'/rows.jsonl','CUSTOMER','Choose the retained original customer workspace.');
  const definitionRaw=await read(await pathAt(root,'definition.json'),1048576);
  need(sha(definitionRaw)===state.definitionSha256,'DEFINITION_CHANGED','The customer definition changed.');
  const definition=validateDefinition(JSON.parse(definitionRaw));return {state,definition,definitionRaw};
}
async function receiveUnlocked(root,input,{restoring=false}={}){
  const {transferDirectory,expectedSha256}=input;need(typeof transferDirectory==='string','TRANSFER','Choose the original transfer directory.',400);
  const restoreIntent=await maybeJSON(root,'restore-intent.json');need(restoring||!restoreIntent||restoreIntent.state==='COMMITTED','RESTORE_PENDING','Continue the selected customer backup receiving first.');
  let current=await customerState(root);const existing=current?.state.transfers.find(t=>t.sha256===expectedSha256);
  const selected=await verifySubscriptionTransfer(transferDirectory,expectedSha256);
  const pending=await maybeJSON(root,'intent.json');
  if(existing){need(existing.bytes===selected.bytes,'TRANSFER_CHANGED','The saved delivery manifest changed.');
    // A reusable old delivery must never displace a newer selected delivery.
    if(!pending||pending.sha256===expectedSha256)await atomic(root,'intent.json',{sha256:expectedSha256,state:'COMMITTED',result:existing.result});
    return {...existing.result,reused:true};}
  need(!pending||pending.state==='COMMITTED'||pending.sha256===expectedSha256,'PENDING','Continue the exact previously selected customer delivery before another one.');
  const m=selected.manifest;
  if(current)need(m.mode==='changes'&&m.definitionSha256===current.state.definitionSha256&&
    m.fromRevision===current.state.revision&&m.fromEditionSha256===current.state.editionSha256,
    'CUSTOMER_BASE','The delivery must start at this exact saved customer edition.');
  else need(m.mode==='baseline','CUSTOMER_BASE','Receive an explicit complete baseline into a new customer workspace.');
  if(!pending||pending.sha256!==expectedSha256)await atomic(root,'intent.json',{schema:'stellar-forge.odata-subscription-customer-intent.v1',sha256:expectedSha256,
    bytes:selected.bytes,state:'SELECTED',fromRevision:m.fromRevision,toRevision:m.toRevision});
  const prefix='transfers/'+expectedSha256;
  for(const file of m.files)await copy(root,prefix+'/'+file.path,await pathAt(selected.root,file.path),{bytes:file.bytes,sha256:file.sha256});
  await immutable(root,prefix+'/transfer.json',selected.raw);await immutable(root,'definition.json',selected.definitionRaw);
  // Work only from the completely retained delivery after selection.
  const retained=await verifySubscriptionTransfer(join(root,prefix),expectedSha256);
  const working=await mkdtemp(join(root,'.subscription-customer-')),db=openIndex(join(working,'index.sqlite'));let final=null;
  try{
    if(current){const count=await loadRows(db,'customer_rows',await pathAt(root,current.state.snapshot.path),current.state.snapshot,selected.definition);
      need(count===current.state.rows,'CUSTOMER_ROWS','The complete saved customer row count changed.');}
    else{
      const first=retained.editions[0],path=await pathAt(root,prefix+'/'+editionDirectory(first.edition.revision)+'/rows.jsonl');
      const count=await loadRows(db,'customer_rows',path,first.edition.files['rows.jsonl'],selected.definition);
      need(count===first.edition.rows,'BASELINE_ROWS','The complete baseline row count differs.');
    }
    for(const value of retained.editions){
      const edition=value.edition;
      if(m.mode==='changes'){
        const before=db.prepare('SELECT COUNT(*) AS n FROM customer_rows').get().n;need(before===edition.counts.before,'CHANGE_BASE','The previous full row count differs.');
        await applyChanges(db,await pathAt(root,prefix+'/'+editionDirectory(edition.revision)+'/changes.jsonl'),edition.files['changes.jsonl'],selected.definition,edition.counts);
      }
      const path=join(working,'rows-'+edition.revision+'.jsonl'),actual=await exportIndex(db,path,selected.definition);
      need(actual.rows===edition.rows&&same({bytes:actual.bytes,sha256:actual.sha256},edition.files['rows.jsonl']),'CUSTOMER_RESULT','Applying the original changes did not reproduce the full published collection.');
      const snapshot='snapshots/'+value.sha256+'/rows.jsonl';await copy(root,snapshot,path,edition.files['rows.jsonl']);
      await immutable(root,'snapshots/'+value.sha256+'/edition.json',bytes(edition));
      final={...value,snapshot:{path:snapshot,...edition.files['rows.jsonl']}};
    }
    const result={schema:'stellar-forge.odata-subscription-customer-receipt.v1',transferSha256:expectedSha256,definitionSha256:m.definitionSha256,
      fromRevision:m.fromRevision,toRevision:m.toRevision,editionSha256:final.sha256,rows:final.edition.rows,
      snapshot:final.snapshot,scopeChanges:retained.editions.filter(e=>e.edition.scopeChanged).map(e=>e.edition.revision)};
    const state={schema:CLIENT_SCHEMA,definitionSha256:m.definitionSha256,revision:m.toRevision,editionSha256:final.sha256,
      rows:final.edition.rows,snapshot:final.snapshot,transfers:[...(current?.state.transfers??[]),{sha256:expectedSha256,bytes:selected.bytes,result}]};
    need(state.transfers.length<=LIMITS.editions,'HISTORY_LIMIT','Receive a newly reviewed complete baseline in a new customer workspace.');
    await atomic(root,'customer.json',state);await atomic(root,'intent.json',{sha256:expectedSha256,state:'COMMITTED',result});
    return {...result,reused:false};
  }finally{db.close();await rm(working,{recursive:true,force:true});}
}
export async function receiveSubscription(input){return leased(input.directory,root=>receiveUnlocked(root,input));}
export async function inspectSubscriptionCustomer(directory){
  return leased(directory,async root=>{const current=await customerState(root);need(current,'CUSTOMER_MISSING','Receive a complete original baseline first.');
    const intent=await maybeJSON(root,'intent.json');return {...current.state,definition:current.definition,pending:intent?.state==='SELECTED'?intent:null};});
}
export async function subscriptionCustomerRows(directory,{offset=0,limit=100}={}){
  integer(offset,0,LIMITS.rows,'row offset');integer(limit,1,500,'row page size');
  return leased(directory,async root=>{const current=await customerState(root);need(current,'CUSTOMER_MISSING','Receive a complete original baseline first.');
    const items=[];let total=0;
    for await(const row of lines(await pathAt(root,current.state.snapshot.path),current.state.snapshot)){checkRow(row,current.definition);if(total>=offset&&items.length<limit)items.push(row);total++;}
    need(total===current.state.rows,'CUSTOMER_ROWS','The complete saved row count changed.');
    return {revision:current.state.revision,editionSha256:current.state.editionSha256,offset,total,items,nextOffset:offset+items.length<total?offset+items.length:null};});
}
async function selectedCustomerFiles(root,current){
  const names=new Set(['definition.json','customer.json']);for(const entry of current.state.transfers){
    const prefix='transfers/'+entry.sha256,transfer=await verifySubscriptionTransfer(join(root,prefix),entry.sha256);
    names.add(prefix+'/transfer.json');for(const file of transfer.manifest.files)names.add(prefix+'/'+file.path);
    for(const e of transfer.editions){names.add('snapshots/'+e.sha256+'/rows.jsonl');names.add('snapshots/'+e.sha256+'/edition.json');}
  }return inventory(root,[...names]);
}
export async function subscriptionCustomerBackup(directory,{output,expectedRevision,expectedEditionSha256}={}){
  return leased(directory,async root=>{const current=await customerState(root);need(current,'CUSTOMER_MISSING','Receive a baseline first.');
    if(expectedRevision!==undefined)need(current.state.revision===expectedRevision,'REVISION','The selected customer edition advanced before export.');
    if(expectedEditionSha256!==undefined)need(current.state.editionSha256===expectedEditionSha256,'EDITION_CHANGED','The selected customer edition differs before export.');
    const intent=await maybeJSON(root,'intent.json');need(!intent||intent.state==='COMMITTED','PENDING','Complete the selected customer receiving before backup.');
    const destination=await privateDirectory(output,{create:true});need(destination!==root&&!destination.startsWith(root+'/'),'OUTPUT','Place the complete backup outside the original customer directory.');
    const files=await selectedCustomerFiles(root,current);for(const file of files)await copy(destination,file.path,await pathAt(root,file.path),{bytes:file.bytes,sha256:file.sha256});
    const manifest={schema:'stellar-forge.odata-subscription-customer-backup.v1',definitionSha256:current.state.definitionSha256,
      revision:current.state.revision,editionSha256:current.state.editionSha256,files};
    const raw=bytes(manifest);await immutable(destination,'backup.json',raw);return {directory:destination,...identity(raw),revision:manifest.revision,files:files.length};});
}
export async function restoreSubscriptionCustomer({directory,source,expectedSha256}={}){
  need(HASH.test(expectedSha256),'BACKUP_IDENTITY','Select the original complete customer backup SHA.',400);
  const input=await privateDirectory(source),raw=await read(await pathAt(input,'backup.json'),16777216);
  need(sha(raw)===expectedSha256,'BACKUP_CHANGED','The selected customer backup changed.');const backup=JSON.parse(raw);
  need(backup.schema==='stellar-forge.odata-subscription-customer-backup.v1'&&Array.isArray(backup.files)&&backup.files.length<=LIMITS.files,'BACKUP','Choose a complete original customer backup.');
  return leased(directory,async root=>{
    const intent=await maybeJSON(root,'restore-intent.json'),current=await customerState(root);
    need(!intent||intent.sha256===expectedSha256,'RESTORE_SELECTED','Continue the same original customer backup receiving.');
    if(intent?.state==='COMMITTED'){need(current&&current.state.definitionSha256===backup.definitionSha256,'RESTORE_CHANGED','The original restored customer changed.');return {sha256:expectedSha256,revision:current.state.revision,editionSha256:current.state.editionSha256,reused:true};}
    need(!current||intent,'RESTORE_EXISTS','Restore into an empty customer workspace.');
    const names=new Set();let total=0;
    for(const file of backup.files){shape(file,['path','bytes','sha256'],'backup file');need(!names.has(file.path)&&/^(definition\.json|customer\.json|snapshots\/[a-f0-9]{64}\/(?:rows\.jsonl|edition\.json)|transfers\/[a-f0-9]{64}\/(?:transfer\.json|definition\.json|editions\/[0-9]{6}\/(?:edition\.json|rows\.jsonl|changes\.jsonl)))$/.test(file.path),'BACKUP_FILE','The backup repeats or adds an undeclared file.');
      names.add(file.path);total+=file.bytes;need(total<=LIMITS.totalBytes,'BACKUP_LIMIT','The backup exceeds its complete byte limit.');await measureChecked(await pathAt(input,file.path),{bytes:file.bytes,sha256:file.sha256});}
    need(names.has('definition.json')&&names.has('customer.json'),'BACKUP_MISSING','The complete customer backup omits its state.');
    const original=await customerState(input);need(original&&original.state.revision===backup.revision&&original.state.editionSha256===backup.editionSha256&&original.state.definitionSha256===backup.definitionSha256,'BACKUP_STATE','The backed-up customer differs from its selected manifest.');
    if(!intent)await atomic(root,'restore-intent.json',{sha256:expectedSha256,state:'SELECTED'});
    for(const transfer of original.state.transfers)await receiveUnlocked(root,{transferDirectory:join(input,'transfers',transfer.sha256),expectedSha256:transfer.sha256},{restoring:true});
    const reopened=await customerState(root);need(same(reopened.state,original.state),'BACKUP_REPLAY','The complete backup did not reproduce the original customer history.');
    const actual=await selectedCustomerFiles(root,reopened);need(same(actual,backup.files),'BACKUP_CLOSURE','The complete original backup has extra, missing or different retained bytes.');
    await atomic(root,'restore-intent.json',{sha256:expectedSha256,state:'COMMITTED'});return {sha256:expectedSha256,revision:reopened.state.revision,editionSha256:reopened.state.editionSha256,reused:false};
  });
}
const csvCell=value=>{const s=String(value);return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
export function subscriptionAnalysisMapping(definition,{source,sourceRevision}={}){
  validateDefinition(definition);text(source,'registered Analysis source',64);need(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(source),'ANALYSIS_SOURCE','Choose the actual registered source alias.');integer(sourceRevision,1,Number.MAX_SAFE_INTEGER,'registered source revision');
  const pointer=s=>'/'+s.replaceAll('~','~0').replaceAll('/','~1');
  return {source,source_revision:sourceRevision,mapping:{collection:'',sse_data:'text',columns:definition.mapping.flatMap(f=>[
    {name:f.name,pointer:pointer(f.name),type:'text',missing:'error'},{name:f.name+'_state',pointer:pointer(f.name+'_state'),type:'text',missing:'error'}])}};
}
export async function exportSubscriptionCustomer(directory,{output,title,expectedRevision,expectedEditionSha256}={}){
  return leased(directory,async root=>{
    const current=await customerState(root);need(current,'CUSTOMER_MISSING','Receive a complete baseline first.');title??=current.definition.title;text(title,'customer export title');
    if(expectedRevision!==undefined)need(current.state.revision===expectedRevision,'REVISION','The selected customer edition advanced before export.');
    if(expectedEditionSha256!==undefined)need(current.state.editionSha256===expectedEditionSha256,'EDITION_CHANGED','The selected customer edition differs before export.');
    const destination=await privateDirectory(output,{create:true});need(destination!==root&&!destination.startsWith(root+'/'),'OUTPUT','Export outside the original customer directory.');
    const proof=await selectedCustomerFiles(root,current);need(proof.reduce((n,f)=>n+f.bytes,0)<=128*1024*1024,'ANALYSIS_PROOF_LIMIT','Receive a newly selected complete baseline in a new customer workspace for this Analysis export.');
    const working=await mkdtemp(join(root,'.subscription-export-'));
    const {outputWriter}=await import('./engine.mjs');const writer=await outputWriter(join(working,'dataset.csv'));
    let rowCount=0,projected=0;
    try{
      const headers=current.definition.mapping.flatMap(f=>[f.name,f.name+'_state']);need(new Set(headers).size===headers.length&&headers.length<=64,'ANALYSIS_COLUMNS','The original column names are incompatible with the complete Analysis mapping.');
      await writer.write(Buffer.from(headers.map(csvCell).join(',')+'\r\n'));
      for await(const row of lines(await pathAt(root,current.state.snapshot.path),current.state.snapshot)){
        checkRow(row,current.definition);const values=Object.fromEntries(current.definition.mapping.flatMap(f=>[
          [f.name,row.values[f.path]===null?'':typeof row.values[f.path]==='string'?row.values[f.path]:JSON.stringify(row.values[f.path])],
          [f.name+'_state',row.values[f.path]===null?'null':'value']]));
        const projectedRow=Buffer.byteLength(JSON.stringify(values)+'\n');need(projectedRow<=2097152,'ANALYSIS_ROW_LIMIT','One projected Analysis row exceeds2MiB.');projected+=projectedRow;
        need(projected<=128*1024*1024,'ANALYSIS_OUTPUT_LIMIT','The complete projected Analysis result exceeds128MiB.');
        await writer.write(Buffer.from(headers.map(name=>csvCell(values[name])).join(',')+'\r\n'));rowCount++;
      }
      need(rowCount===current.state.rows,'CUSTOMER_ROWS','The complete exported row count changed.');const dataset=await writer.finish();
      const document={path:'files/'+dataset.sha256+'.csv',...dataset,contentType:'text/csv; charset=utf-8'};
      await copy(destination,document.path,join(working,'dataset.csv'),dataset);await copy(destination,'dataset.csv',join(working,'dataset.csv'),dataset);
      const originals=[],record=async(raw,role,type='application/json')=>{
        const file={path:'files/'+sha(raw)+(type==='application/json'?'.json':'.bin'),...identity(raw),contentType:type,role};
        need(originals.length<32&&file.bytes<=32*1024*1024,'ANALYSIS_PACKET_LIMIT','The complete analytical source has too many or oversized original packets.');
        await immutable(destination,file.path,raw);originals.push(file);
      };
      const ownRaw=await readFile(fileURLToPath(import.meta.url));await record(ownRaw,'customer-transform','text/javascript; charset=utf-8');
      const proofManifest={schema:'stellar-forge.odata-subscription-proof.v1',definitionSha256:current.state.definitionSha256,
        revision:current.state.revision,editionSha256:current.state.editionSha256,files:proof};
      await record(bytes(proofManifest),'customer-proof-manifest');
      let sequence=1,parts=[],size=0;
      function begin(){const head=Buffer.from(JSON.stringify({schema:'stellar-forge.odata-subscription-proof-packet.v1',sequence,editionSha256:current.state.editionSha256})+'\n');parts=[head];size=head.length;}
      async function finish(){if(parts.length===1)return;await record(gzipSync(Buffer.concat(parts),{level:6}),'customer-proof-'+String(sequence).padStart(4,'0'),'application/gzip');sequence++;}
      begin();
      for(const file of proof){let offset=0;
        for await(const chunk of chunks(await pathAt(root,file.path),{bytes:file.bytes,sha256:file.sha256})){
          const raw=Buffer.from(JSON.stringify({file,offset,bodyBase64:chunk.toString('base64')})+'\n');
          if(size+raw.length>24*1024*1024){await finish();begin();}parts.push(raw);size+=raw.length;offset+=chunk.length;
        }
        if(file.bytes===0){const raw=Buffer.from(JSON.stringify({file,offset:0,bodyBase64:''})+'\n');if(size+raw.length>24*1024*1024){await finish();begin();}parts.push(raw);size+=raw.length;}
      }
      await finish();need(document.bytes+originals.reduce((n,f)=>n+f.bytes,0)<=256*1024*1024,'ANALYSIS_SOURCE_LIMIT','The complete analytical source exceeds256MiB.');
      const currentEdition=await readJSON(root,'snapshots/'+current.state.editionSha256+'/edition.json');
      const source={schema:'stellar-forge.analysis-source-document.v1',title,format:'csv',document,originals,complete:true,
        provenance:{kind:'operator-file',publisher:current.definition.serviceRoot,capturedAt:currentEdition.source.acquisition.lastReceivedAt,
          scope:current.definition.entitySet+'; subscription edition '+current.state.revision+'; '+current.state.rows+' rows',
          description:'Exact customer state after complete ordered collection subscription deliveries. Original packet files retain the starting baseline, every applied transfer and intermediate snapshot. Removal records selected collection membership. Full supplier request/response originals remain separately available from each publisher edition.',
          transform:{name:'OData collection subscription customer receiving',sourceUrl:'https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace',sha256:sha(ownRaw)}}};
      const raw=bytes(source);need(raw.length<=1048576,'ANALYSIS_MANIFEST_LIMIT','The complete Analysis source manifest exceeds1MiB.');
      await immutable(destination,'source.json',raw);await immutable(destination,'customer.json',bytes(current.state));
      return {directory:destination,rows:current.state.rows,revision:current.state.revision,editionSha256:current.state.editionSha256,
        source:{path:'source.json',...identity(raw)},dataset,originals:originals.length,columns:headers};
    }finally{await writer.close();await rm(working,{recursive:true,force:true});}
  });
}

/** Restore the complete custom proof retained by the original Analysis source document. */
export async function restoreSubscriptionAnalytical({directory,sourceManifest,expectedSha256}={}){
  need(HASH.test(expectedSha256)&&typeof sourceManifest==='string','ANALYSIS_SOURCE','Select the exact original analytical source manifest.',400);
  const sourcePath=resolve(sourceManifest),sourceRoot=await privateDirectory(resolve(sourcePath,'..')),sourceRaw=await read(sourcePath,1048576);
  need(sha(sourceRaw)===expectedSha256,'ANALYSIS_CHANGED','The selected analytical source manifest changed.');
  const source=JSON.parse(sourceRaw);need(source.schema==='stellar-forge.analysis-source-document.v1'&&source.format==='csv'&&source.complete===true&&
    Array.isArray(source.originals)&&source.originals.length>=3&&source.originals.length<=32,'ANALYSIS_SOURCE','Choose a complete subscription customer source document.');
  const root=await privateDirectory(directory,{create:true}),prior=await maybeJSON(root,'analysis-restored.json');
  if(prior){need(prior.sha256===expectedSha256,'ANALYSIS_EXISTS','This customer already received a different analytical source.');return {...prior,reused:true};}
  const all=[source.document,...source.originals],roles=new Set();let total=0;
  for(const file of all){need(plain(file)&&HASH.test(file.sha256)&&file.path==='files/'+file.sha256+(file===source.document?'.csv':file.contentType==='application/json'?'.json':'.bin')&&
    Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=(file===source.document?256:32)*1024*1024,'ANALYSIS_FILE','An analytical source file identity changed.');
    total+=file.bytes;need(total<=256*1024*1024,'ANALYSIS_SOURCE_LIMIT','The complete analytical source exceeds its supported limit.');
    await measureChecked(await pathAt(sourceRoot,file.path),{bytes:file.bytes,sha256:file.sha256});
    if(file!==source.document){need(typeof file.role==='string'&&!roles.has(file.role),'ANALYSIS_ROLE','Original analytical roles must be distinct.');roles.add(file.role);}}
  const manifestFile=source.originals.find(f=>f.role==='customer-proof-manifest'),transform=source.originals.find(f=>f.role==='customer-transform');
  need(manifestFile&&transform&&transform.sha256===source.provenance?.transform?.sha256,'ANALYSIS_PROOF','Select the original complete subscription proof and transform identity.');
  const proof=JSON.parse(await read(await pathAt(sourceRoot,manifestFile.path),16777216)),packets=source.originals.filter(f=>/^customer-proof-[0-9]{4}$/.test(f.role));
  need(proof.schema==='stellar-forge.odata-subscription-proof.v1'&&HASH.test(proof.definitionSha256)&&HASH.test(proof.editionSha256)&&
    Array.isArray(proof.files)&&proof.files.length<=LIMITS.files&&packets.length===source.originals.length-2,'ANALYSIS_PROOF','The original proof inventory changed.');
  const expected=new Map();let proofBytes=0;
  for(const file of proof.files){need(plain(file)&&!expected.has(file.path)&&HASH.test(file.sha256)&&Number.isSafeInteger(file.bytes)&&file.bytes>=0,'ANALYSIS_PROOF','A proof file is missing or duplicated.');
    // The original receiving verifier applies the exact allowed customer file grammar below.
    expected.set(file.path,file);proofBytes+=file.bytes;need(proofBytes<=128*1024*1024,'ANALYSIS_PROOF_LIMIT','The complete customer proof exceeds128MiB.');}
  const working=await mkdtemp(join(root,'.analysis-receiving-')),completed=new Set();let current=null,writer=null;
  try{
    const {createHash}=await import('node:crypto');
    async function finish(){
      if(!current)return;need(current.offset===current.file.bytes&&current.hash.digest('hex')===current.file.sha256,'PROOF_BYTES','An original proof file changed.');
      await writer.sync();await writer.close();writer=null;completed.add(current.file.path);current=null;
    }
    for(let i=0;i<packets.length;i++){
      const packet=packets[i];need(packet.role==='customer-proof-'+String(i+1).padStart(4,'0')&&packet.contentType==='application/gzip','PROOF_SEQUENCE','The complete proof packet sequence changed.');
      const raw=gunzipSync(await read(await pathAt(sourceRoot,packet.path),32*1024*1024),{maxOutputLength:24*1024*1024});
      const rows=new TextDecoder('utf-8',{fatal:true}).decode(raw).split('\n');need(rows.pop()==='','PROOF_FRAMING','The proof packet is incomplete.');
      const header=JSON.parse(rows.shift());need(header.schema==='stellar-forge.odata-subscription-proof-packet.v1'&&header.sequence===i+1&&header.editionSha256===proof.editionSha256,'PROOF_HEADER','The proof packet belongs to another edition.');
      for(const line of rows){need(line&&Buffer.byteLength(line)<=1048576,'PROOF_FRAME','An original proof chunk is oversized or empty.');const frame=JSON.parse(line),file=expected.get(frame.file?.path);
        need(file&&same(file,frame.file)&&Number.isSafeInteger(frame.offset)&&typeof frame.bodyBase64==='string'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(frame.bodyBase64),'PROOF_FRAME','The original proof chunk changed.');
        if(current?.file.path!==file.path){await finish();need(!completed.has(file.path)&&frame.offset===0,'PROOF_ORDER','A proof file was restarted or its first chunk is absent.');
          const path=await pathAt(working,file.path,{create:true});writer=await open(path,'wx',0o600);current={file,offset:0,hash:createHash('sha256')};}
        const body=Buffer.from(frame.bodyBase64,'base64');need(frame.offset===current.offset&&body.length<=65536&&body.length<=file.bytes-current.offset,'PROOF_OFFSET','An original proof chunk was omitted or repeated.');
        current.hash.update(body);current.offset+=body.length;await writer.writeFile(body);
      }
    }
    await finish();need(completed.size===expected.size,'PROOF_MISSING','The complete proof omits original customer files.');
    const backup={schema:'stellar-forge.odata-subscription-customer-backup.v1',definitionSha256:proof.definitionSha256,
      revision:proof.revision,editionSha256:proof.editionSha256,files:proof.files};
    const backupRaw=bytes(backup);await immutable(working,'backup.json',backupRaw);
    const verifiedDirectory=join(working,'verified-customer');await restoreSubscriptionCustomer({directory:verifiedDirectory,source:working,expectedSha256:sha(backupRaw)});
    const state=await customerState(verifiedDirectory);need(state.state.revision===proof.revision&&state.state.editionSha256===proof.editionSha256,'ANALYSIS_REPLAY','The analytical proof did not reproduce its original customer edition.');
    const datasetHash=createHash('sha256'),headers=state.definition.mapping.flatMap(f=>[f.name,f.name+'_state']);let datasetBytes=0,rows=0;
    function add(raw){datasetHash.update(raw);datasetBytes+=raw.length;}
    add(Buffer.from(headers.map(csvCell).join(',')+'\r\n'));
    for await(const row of lines(await pathAt(verifiedDirectory,state.state.snapshot.path),state.state.snapshot)){
      checkRow(row,state.definition);const values=Object.fromEntries(state.definition.mapping.flatMap(f=>[[f.name,row.values[f.path]===null?'':typeof row.values[f.path]==='string'?row.values[f.path]:JSON.stringify(row.values[f.path])],[f.name+'_state',row.values[f.path]===null?'null':'value']]));
      add(Buffer.from(headers.map(n=>csvCell(values[n])).join(',')+'\r\n'));rows++;}
    need(rows===state.state.rows&&datasetBytes===source.document.bytes&&datasetHash.digest('hex')===source.document.sha256,'ANALYSIS_DATASET','The complete analytical CSV differs from its original replayed customer rows.');
    const received=await restoreSubscriptionCustomer({directory:root,source:working,expectedSha256:sha(backupRaw)});
    const result={schema:'stellar-forge.odata-subscription-analysis-restored.v1',sha256:expectedSha256,revision:proof.revision,editionSha256:proof.editionSha256,rows};
    await atomic(root,'analysis-restored.json',result);return {...result,reused:received.reused};
  }finally{await writer?.close();await rm(working,{recursive:true,force:true});}
}
