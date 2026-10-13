// Same-operation native receiving; original product APIs remain authoritative.
import {readFile,writeFile,mkdir,readdir,lstat,open,rename} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const WORK=resolve(process.argv[2]),NODE=process.execPath;
const PRODUCT=join(WORK,'checkout/stellar/scf_2026/sf49_data_commissioning/econdb');
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,m)=>{if(!ok)throw Error(m)};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const json=x=>JSON.stringify(x,null,2)+'\n';
const readJSON=async p=>JSON.parse(await readFile(p,'utf8'));
async function exists(p){try{await lstat(p);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}
async function put(p,body){await mkdir(dirname(p),{recursive:true,mode:0o700});const bytes=Buffer.from(body);if(await exists(p)){need((await readFile(p)).equals(bytes),'Existing receiving member differs: '+p);return}const tmp=p+'.writing';const fd=await open(tmp,'w',0o600);try{await fd.writeFile(bytes);await fd.sync()}finally{await fd.close()}await rename(tmp,p);}
async function inventory(root){const rows=[];async function walk(p){const s=await lstat(p);need(!s.isSymbolicLink(),'Symlink in operated outputs: '+p);if(s.isDirectory()){for(const n of (await readdir(p)).sort())await walk(join(p,n));}else{need(s.isFile(),'Non-file in operated outputs');const b=await readFile(p);rows.push({path:p.slice(WORK.length+1),bytes:b.length,sha256:sha(b)})}}await walk(root);return rows}
async function verify(rows){for(const r of rows){need(!r.path.startsWith('/')&&!r.path.split('/').includes('..'),'Unsafe receipt path');const p=join(WORK,r.path),s=await lstat(p);need(s.isFile()&&!s.isSymbolicLink(),'Recorded output is no longer a regular file');const b=await readFile(p);need(b.length===r.bytes&&sha(b)===r.sha256,'Recorded output changed: '+r.path)}}
async function cli(id,module,args){
 const attempt=String(Date.now())+'-'+process.pid;
 const prefix=join(WORK,'logs',id+'-'+attempt);await mkdir(dirname(prefix),{recursive:true,mode:0o700});
 const stdout=await open(prefix+'.stdout','wx',0o600),stderr=await open(prefix+'.stderr','wx',0o600);
 let code;try{
  const lease=Number(process.env.ECONDB_RECEIVING_LEASE_FD);need(Number.isInteger(lease)&&lease>=3,'Original receiving lease descriptor missing');
  const child=spawn(NODE,[module,...args],{cwd:PRODUCT,env:{...process.env,ECONDB_RECEIVING_LEASE_FD:'3'},stdio:['ignore',stdout.fd,stderr.fd,lease]});
  code=await new Promise((done,reject)=>{child.on('error',reject);child.on('exit',(c,s)=>done(s?'signal:'+s:c))});
 }finally{await stdout.sync();await stderr.sync();await stdout.close();await stderr.close()}
 const record={module,args,exit:code,stdout:prefix+'.stdout',stderr:prefix+'.stderr',finished_at:new Date().toISOString()};
 await put(prefix+'.json',json(record));need(code===0,'Original command failed; retained logs: '+prefix);
 return record;
}
const E=await import(pathToFileURL(join(PRODUCT,'maritime-analysis.mjs')));
const N=await import(pathToFileURL(join(PRODUCT,'maritime-native.mjs')));
const P=await import(pathToFileURL(join(PRODUCT,'sf30-publication.mjs')));
const J=await import(pathToFileURL(join(PRODUCT,'maritime-project-native.mjs')));
const V=await import(pathToFileURL(join(WORK,'checkout/stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/versions.mjs')));
const D=await import(pathToFileURL(join(WORK,'checkout/stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-handler.mjs')));
const engineSha=sha(await readFile(join(PRODUCT,'maritime-analysis.mjs')));
const selection={from:'2022-02-01',until:'2022-04-01'},before={from:'2022-02-01',until:'2022-03-01'},after={from:'2022-03-01',until:'2022-04-01'};
if(process.argv[3]==='inspect-copy'){
 const statuses=[];
 for(const [name,id]of [['capacity','issuer-doc-capacity-by-operator'],['traffic','issuer-doc-container-traffic']]){
  const source=await N.openEdition(join(WORK,'editions',id)),release=await P.inspectPublication(join(WORK,'publications',name));
  const store=await V.openDatasetVersions({directory:join(WORK,name+'-store'),collectOnOpen:false});
  try{const status=store.status();need(status.current===release.manifest.dataset.snapshot&&status.revision===1,'Copied store does not retain original snapshot');need(source.descriptor.source_sha256===release.manifest.source.source.source_sha256,'Copied source differs');statuses.push({name,source_sha256:source.descriptor.source_sha256,publication_id:release.manifest.publication_id,status});}finally{await store.close()}
 }
 console.log(json({state:'INDEPENDENT_COMPLETE_SOURCE_REOPENED',node:process.version,statuses}));process.exit(0);
}
const steps=[];
async function step(id,outputs,action){
 const file=join(WORK,'steps',id+'.json');await mkdir(dirname(file),{recursive:true,mode:0o700});
 if(await exists(file)){const old=await readJSON(file);need(old.state==='COMPLETE'&&old.operation==='ECONDB-MARITIME-PERIOD-WORKSHARE-BBBD-20261013','Unknown step record');await verify(old.files);steps.push(old);console.log(json({phase:id,state:'REOPENED',files:old.files.length}));return old}
 await put(join(WORK,'steps',id+'.started.json'),json({operation:'ECONDB-MARITIME-PERIOD-WORKSHARE-BBBD-20261013',id}));
 const result=await action(),files=[];for(const output of outputs)files.push(...await inventory(output));
 const row={operation:'ECONDB-MARITIME-PERIOD-WORKSHARE-BBBD-20261013',id,state:'COMPLETE',finished_at:new Date().toISOString(),result,files};
 await put(file,json(row));steps.push(row);console.log(json({phase:id,state:'COMPLETE',files:files.length}));return row;
}
async function verifyAnalysis(path,editionPath,compare){
 const original=await N.openEdition(editionPath),period=E.selectPeriod(original.edition,selection);
 const comparison=compare?E.comparePeriods(original.edition,before,after):null;
 const expected={'current-response.json':original.raw,'current-descriptor.json':json(original.descriptor),'edition.json':json(original.edition),'selected-period.json':json(period),'observations.csv':E.exportRowsCSV(period),'report.html':E.reportHTML({edition:original.edition,period,comparison,editionComparison:null,engine_sha256:engineSha})};
 if(comparison)expected['period-comparison.json']=json(comparison);
 const manifest=await readJSON(join(path,'manifest.json'));
 need(manifest.schema==='econdb.file-bundle.v1'&&same(manifest.files.map(r=>r.name).sort(),[...Object.keys(expected),'analysis-source.json'].sort()),'Analysis output inventory differs');
 need(same((await readdir(path)).sort(),[...manifest.files.map(r=>r.name),'manifest.json'].sort()),'Analysis contains unexpected members');
 for(const item of manifest.files){const b=await readFile(join(path,item.name));need(b.length===item.bytes&&sha(b)===item.sha256,'Analysis member changed');if(Object.hasOwn(expected,item.name))need(b.equals(Buffer.from(expected[item.name])),'Analysis does not reproduce from retained originals: '+item.name)}
 const binding=await readJSON(join(path,'analysis-source.json'));
 need(same(binding.engine,{version:E.VERSION,sha256:engineSha,contract_sha256:E.CONTRACT_SHA256})&&same(binding.current,{id:original.edition.id,source_sha256:original.descriptor.source_sha256,original_bytes:original.edition.source.original_bytes})&&binding.previous===null&&same(binding.selection,period.selection),'Analysis binding differs');
 return {directory:path,selection:period.selection,rows:period.rows.length,recovered_existing:true};
}
await mkdir(join(WORK,'editions'),{recursive:true,mode:0o700});await mkdir(join(WORK,'publications'),{recursive:true,mode:0o700});
for(const [name,id,compare]of [['capacity','issuer-doc-capacity-by-operator',true],['traffic','issuer-doc-container-traffic',false]]){
 const edition=join(WORK,'editions',id),review=join(WORK,name+'-review'),publication=join(WORK,'publications',name),state=join(WORK,name+'-store');
 const receiveArgs=['receive','--source','examples/'+name+'.response.json','--descriptor','examples/'+name+'.descriptor.json','--out',join(WORK,'editions')];
 await step('01-'+name+'-receive',[edition],async()=>cli('01-'+name+'-receive','maritime-cli.mjs',receiveArgs));
 await step('02-'+name+'-analysis',[review],async()=>{
  if(!await exists(review)){await cli('02-'+name+'-analysis','maritime-cli.mjs',['analyze','--edition',edition,'--from',selection.from,'--until',selection.until,'--out',review,...compare?['--before-from',before.from,'--before-until',before.until,'--after-from',after.from,'--after-until',after.until]:[]]);}
  return verifyAnalysis(review,edition,compare);
 });
 await step('03-'+name+'-receive-again',[edition],()=>cli('03-'+name+'-receive-again','maritime-cli.mjs',receiveArgs));
 const build=['build','--source',join(edition,'response.json'),'--descriptor',join(edition,'descriptor.json'),'--from',selection.from,'--until',selection.until,'--name',name==='capacity'?'Issuer capacity example':'Issuer traffic example','--out',publication];
 await step('04-'+name+'-publication',[publication],()=>cli('04-'+name+'-publication','sf30-publication.mjs',build));
 await step('05-'+name+'-inspect',[],()=>cli('05-'+name+'-inspect','sf30-publication.mjs',['inspect','--publication',publication]));
 await step('06-'+name+'-publication-again',[publication],()=>cli('06-'+name+'-publication-again','sf30-publication.mjs',build));
 await step('07-'+name+'-merchant-store',[state],async()=>{
  const release=await P.inspectPublication(publication);
  if(!await exists(state))await cli('07-'+name+'-merchant-store','sf30-publication.mjs',['merchant-init','--publication',publication,'--state',state]);
  // Original offline reopen only; no collect, refresh, seller, payment or new initialization.
  need(await exists(join(state,'state.json')),'Original initialization is incomplete; preserve its state for owner reconciliation');
  const versions=await V.openDatasetVersions({directory:state,collectOnOpen:false});
  try{const status=versions.status();need(status.current===release.manifest.dataset.snapshot&&status.revision===1,'Original merchant store no longer matches this first retained publication');return {publication_id:release.manifest.publication_id,status,reopened:true}}
  finally{await versions.close()}
 });
 await step('08-'+name+'-typed-pages',[join(WORK,'typed-pages',name)],async()=>{
  const release=await P.inspectPublication(publication),dataset=await D.loadDatasetConfig(release.configPath),pages=[];let cursor=null,rows=0;
  do{const query={limit:'2',...(cursor?{cursor}:{})};const returned=await dataset.handle({query});need(returned.status===200,'Original typed loader refused local page');need(returned.body.dataset.snapshot===release.manifest.dataset.snapshot,'Typed page snapshot differs');pages.push(returned.body);rows+=returned.body.rows.length;cursor=returned.body.page.nextCursor;need(pages.length<=16,'Unexpected page count for original issuer examples');}while(cursor);
  need(rows===release.manifest.source.selected_rows,'Typed selected rows differ');
  for(let i=0;i<pages.length;i++)await put(join(WORK,'typed-pages',name,String(i).padStart(3,'0')+'.json'),json(pages[i]));
  return {rows,pages:pages.length,snapshot:release.manifest.dataset.snapshot,payment:'UNSELECTED; direct original loader receiving does not purchase or settle'};
 });
}
await step('09-edition-list',[],()=>cli('09-edition-list','maritime-cli.mjs',['list','--root',join(WORK,'editions')]));
await put(join(WORK,'project.json'),await readFile(join(PRODUCT,'examples/project.json')));
await step('10-project-build',[join(WORK,'project-delivery')],()=>cli('10-project-build','maritime-project-cli.mjs',['build','--project',join(WORK,'project.json'),'--out',join(WORK,'project-delivery')]));
await step('11-project-inspect',[],()=>cli('11-project-inspect','maritime-project-cli.mjs',['inspect','--project',join(WORK,'project-delivery')]));
await step('12-project-reuse',[join(WORK,'project-delivery')],()=>cli('12-project-reuse','maritime-project-cli.mjs',['build','--project',join(WORK,'project.json'),'--out',join(WORK,'project-delivery')]));
await step('13-project-independent',[join(WORK,'project-independent')],()=>cli('13-project-independent',join(WORK,'project-delivery/source/maritime-project-cli.mjs'),['reopen','--project',join(WORK,'project-delivery'),'--out',join(WORK,'project-independent')]));
await step('14-independent-inspect',[],()=>cli('14-independent-inspect',join(WORK,'project-independent/source/maritime-project-cli.mjs'),['inspect','--project',join(WORK,'project-independent')]));
await step('15-complete-source-independent',[join(WORK,'independent')],async()=>{
 async function copyTree(source,target){const s=await lstat(source);need(!s.isSymbolicLink(),'Source receiving refuses symlinks');if(s.isDirectory()){await mkdir(target,{recursive:true,mode:0o700});for(const name of (await readdir(source)).sort())await copyTree(join(source,name),join(target,name));}else{need(s.isFile(),'Source receiving accepts regular files only');await put(target,await readFile(source));}}
 for(const name of ['checkout','editions','publications','capacity-store','traffic-store','typed-pages'])await copyTree(join(WORK,name),join(WORK,'independent',name));
 return cli('15-complete-source-independent',process.argv[1],[join(WORK,'independent'),'inspect-copy']);
});
const project=await readJSON(join(WORK,'project-delivery/project-analysis.json'));
need(project.summary.entries===2&&project.summary.selected_cells===15&&project.summary.unknown_cells===1&&project.summary.identified_ports.length===0,'Original issuer project counts differ');
await J.verifyProject(join(WORK,'project-delivery'));await J.verifyProject(join(WORK,'project-independent'));
const result={operation:'ECONDB-MARITIME-PERIOD-WORKSHARE-BBBD-20261013',state:'NATIVE_COMPLETE',completed_at:new Date().toISOString(),node:process.version,host:process.env.HOSTNAME??null,steps:steps.map(x=>({id:x.id,state:x.state})),project_summary:project.summary,paid_capture:'UNSELECTED: retained original issuer documentation received; no token or API call invented',buyer_payment:'UNSELECTED: no original approved payment/inbox supplied',browser:'PENDING'};
if(!await exists(join(WORK,'native-result.json')))await put(join(WORK,'native-result.json'),json(result));
else{const original=await readJSON(join(WORK,'native-result.json'));need(original.state==='NATIVE_COMPLETE'&&same(original.project_summary,result.project_summary),'Retained native completion differs');}
console.log(json(result));
