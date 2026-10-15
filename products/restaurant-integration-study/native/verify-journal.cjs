#!/usr/bin/env node
'use strict';
// Actual Linux filesystem/kernel-lock course; provider responses are explicitly authored.
// No provider API request, credential or billable transport is used by this course.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const Store=require('./compass-journal.cjs'),CLI=require('./compass-call.cjs'),Engine=require('../compass-client.cjs');
const quiet=()=>{},key='cmp_test_AUTHORED_COURSE_ONLY_00000000';
const rootModule=path.resolve(__dirname,'compass-call.cjs'),storeModule=path.resolve(__dirname,'compass-journal.cjs');
async function run(){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'compass-native-')),journal=path.join(directory,'journal'),checks=[];
 const check=(name,value)=>{assert.ok(value,name);checks.push({name,passed:true});};
 const save=async(name,value)=>{const filename=path.join(directory,name);await fs.writeFile(filename,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});return filename;};
 const operation=(id,extra={})=>({schema:'compass.request/v1',id,account_alias:'authored-course',prepared_at:new Date().toISOString(),endpoint:'metadata',...extra});
 const meta=operation('metadata-a'),metaPath=await save('metadata-input.json','\ufeff'+JSON.stringify(meta,null,2)+'\r\n'),metaOut=path.join(directory,'metadata-receipt.json');
 let requests=0;
 const first=await CLI.main(['run','--journal',journal,'--request',metaPath,'--out',metaOut],{print:quiet,fetch:async()=>{requests++;return new Response(JSON.stringify({datasetVersion:'AUTHORED',totalRestaurants:3,extra:{preserved:true}}),{headers:{etag:'"authored"'}});}});
 check('Original BOM/CRLF request and full extra response fields are retained',requests===1&&Engine.bodyValue(first.packet.attempts[0].response).extra.preserved);
 const repeated=await CLI.main(['run','--journal',journal,'--request',metaPath],{print:quiet,fetch:async()=>{throw Error('Unexpected repeated dispatch');}});
 check('Exact restart returns the complete original outcome without another call',repeated.packet.events.at(-1).sha256===first.packet.events.at(-1).sha256&&requests===1);
 const changed=await save('changed-input.json',{...meta,notes:'different input'});
 await assert.rejects(CLI.main(['run','--journal',journal,'--request',changed],{print:quiet}),e=>e.code==='JOURNAL_COLLISION');
 check('Changed input under the same operation ID remains unselected and cannot dispatch',true);
 const opened=await Store.openJournal(journal);
 async function child(code,args=[]){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,['-e',code,...args],{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C'}});let stdout='',stderr='';p.stdout.on('data',x=>stdout+=x);p.stderr.on('data',x=>stderr+=x);const timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('Child course deadline'));},10000);p.on('error',reject);p.on('close',(status,signal)=>{clearTimeout(timer);resolve({status,signal,stdout,stderr});});});}
 const locked=await opened.withOperation(meta.id,()=>child("const S=require(process.argv[1]);S.openJournal(process.argv[2]).then(j=>j.withOperation('metadata-a',async()=>{})).then(()=>process.exit(0)).catch(e=>{process.stdout.write(e.code);process.exit(e.code==='JOURNAL_BUSY'?73:1)});",[storeModule,journal]));
 check('A real second Node process cannot acquire the held kernel operation lock',locked.status===73&&locked.stdout==='JOURNAL_BUSY');
 const crash=operation('crash-dispatched'),crashPath=await save('crash-input.json',crash);
 await new Promise((resolve,reject)=>{
  const code="const C=require(process.argv[1]);C.main(['run','--journal',process.argv[2],'--request',process.argv[3]],{print:()=>{},fetch:async()=>{process.stdout.write('DISPATCH_RECORDED\\n');await new Promise(()=>{});}}).catch(e=>{process.stderr.write(e.message);process.exit(1)});setInterval(()=>{},1000);";
  const p=spawn(process.execPath,['-e',code,rootModule,journal,crashPath],{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C'}});let buffer='',reached=false,stderr='';
  const timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('Crash-course dispatch deadline'));},10000);
  p.stdout.on('data',x=>{buffer+=x;if(buffer.includes('DISPATCH_RECORDED')&&!reached){reached=true;p.kill('SIGKILL');}});p.stderr.on('data',x=>stderr+=x);p.on('error',reject);p.on('close',()=>{clearTimeout(timer);reached?resolve():reject(Error('Crash child did not dispatch: '+stderr));});
 });
 let replayed=0;const recovered=await CLI.main(['run','--journal',journal,'--request',crashPath],{print:quiet,fetch:async()=>{replayed++;throw Error('Unwanted replay');}});
 check('Killed process releases its lock and dispatched uncertainty is returned without replay',replayed===0&&recovered.packet.state==='ambiguous_dispatch'&&recovered.packet.attempts.length===1);
 const enrich=operation('enrich-a',{endpoint:'enrich',mode:'fast',place_id:'LOCAL-A',profile_id:'PREVIOUS-PROFILE',case_id:'CASE-A',body_text:JSON.stringify({name:'Authored Cafe',address:'1 Authored Way, Test City, CA'})}),enrichPath=await save('enrich-input.json',enrich);
 await CLI.main(['run','--journal',journal,'--request',enrichPath],{print:quiet,apiKey:key,fetch:async(_url,options)=>{assert.equal(options.headers['X-Compass-API-Key'],key);return new Response(JSON.stringify({matched:true,compass_id:'AUTHORED-PLACE-A',sources:[{id:'SOURCE-A',url:'https://example.invalid/authored'}]}));}});
 const profilePath=await save('profile.json',{diet:'strict_vegan'}),decisionPath=path.join(directory,'decision-input.json');
 const selected=await CLI.main(['prepare-decision','--journal',journal,'--upstream','enrich-a','--compass-id','AUTHORED-PLACE-A','--profile',profilePath,'--profile-id','PROFILE-NEW','--id','decide-a','--selected-by','Authored Reviewer','--mode','fast','--out',decisionPath],{print:quiet});
 check('Selection binds exact upstream identity and the newly supplied profile ID',selected.operation.identity_binding.operation_id==='enrich-a'&&selected.operation.profile_id==='PROFILE-NEW'&&JSON.parse(selected.operation.body_text).user_profile.diet==='strict_vegan');
 const decision=await CLI.main(['run','--journal',journal,'--request',decisionPath],{print:quiet,apiKey:key,fetch:async()=>new Response(JSON.stringify({compass_id:'AUTHORED-PLACE-A',decision:'unknown',reasons:['Authored insufficient evidence'],verification_required:true,extension_field:{retained:1}}))});
 check('The complete selected decision preserves unknown and unrecognised response fields',decision.packet.attempts[0].response.outcome.verdict==='unknown'&&Engine.bodyValue(decision.packet.attempts[0].response).extension_field.retained===1);
 const partial=Buffer.from([0,255,17,42,10]);await fs.writeFile(path.join(journal,'operations',meta.id,'.pending-course.bin'),partial,{flag:'wx',mode:0o600});
 const completePath=path.join(directory,'complete-export.json'),exp=await CLI.main(['export','--journal',journal,'--out',completePath],{print:quiet});
 const originals=exp.complete.operations.flatMap(x=>x.artifacts),found=originals.find(x=>x.path==='.pending-course.bin');check('Export retains partial/unselected bytes beside all committed operations',exp.complete.operations.length===4&&Buffer.from(found.base64,'base64').equals(partial)&&originals.some(x=>x.selection==='unselected_or_partial'));
 for(const a of originals){const raw=Buffer.from(a.base64,'base64');assert.equal(raw.length,a.bytes);assert.equal(Store.sha(raw),a.sha256);assert.equal(raw.includes(Buffer.from(key)),false);}
 check('Every complete exported artifact decodes to its exact byte count and hash',true);
 const exportText=await fs.readFile(completePath,'utf8');check('The actual native journal/export excludes the runtime credential',!exportText.includes(key)&&!Buffer.from(exportText).toString('base64').includes(key));
 let late=0;await assert.rejects(CLI.main(['run','--journal',journal,'--request',metaPath,'--out',metaOut],{print:quiet,fetch:async()=>{late++;throw Error('Unexpected network');}}),e=>e.code==='OUTPUT_EXISTS');check('An existing output is rejected before any network operation',late===0);
 const selectedExport=await opened.exportAll(['decide-a']);check('One-operation export includes its retained upstream dependency',selectedExport.operations.map(x=>x.id).sort().join(',')==='decide-a,enrich-a');
 await fs.appendFile(path.join(journal,'operations','metadata-a','000000000000.json'),' ');
 const corrupt=await opened.snapshot('metadata-a');check('Changed selected event bytes remain exported with a diagnosis',corrupt.diagnostic?.code==='JOURNAL_ENCODING'&&corrupt.artifacts.some(x=>x.path==='000000000000.json'));
 const result={schema:'compass.native-course/v1',executed_at:new Date().toISOString(),runtime:{node:process.version,platform:process.platform},transport:'Authored response objects; no provider network requests',filesystem:'Actual Node fs, actual child processes and Linux kernel flock',directory,checks};
 await fs.writeFile(path.join(directory,'Native_Course_Report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});return result;
}
if(require.main===module)run().then(r=>process.stdout.write(JSON.stringify(r,null,2)+'\n')).catch(e=>{process.stderr.write(JSON.stringify(CLI.safeError(e))+'\n');process.exitCode=1;});
module.exports={run};
