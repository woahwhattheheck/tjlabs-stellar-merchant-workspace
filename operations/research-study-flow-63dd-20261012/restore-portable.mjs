// MIT. Reopen the exact already-completed dossier; never replay its producer.
import {readFile,mkdir,open,link,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const sha=body=>createHash('sha256').update(body).digest('hex');
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
const root=resolve(args['source-root']),out=resolve(args.out);
const baseline=JSON.parse(await readFile(join(out,'result.json'),'utf8'));
need(baseline.operationId==='STUDY-FLOW-ORIGINAL-RIS-63DD-20261012'&&baseline.native.revision===15,'Original completed result required');
const bytes=await readFile(join(out,'exports','workspace.research.json'));
need(bytes.length===781840&&sha(bytes)==='8a449993322b94f1b8124a1419096a316543e6d868d586f1825d29a113b9b7b5','Original portable identity changed');
const portable=JSON.parse(bytes);
need(portable.id===baseline.dossierId&&portable.versions.length===15,'Original portable history changed');
const {openDossierStore}=await import(pathToFileURL(join(root,'stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/dossier.mjs')).href);
const store=await openDossierStore(join(out,'dossiers'));
const before=await store.list();
need(before.every(value=>value.id===baseline.dossierId),'Receiving directory contains an unrelated dossier');
if(before.length)need(before[0].revision<=15,'Receiving history has advanced; preserve the newer original store');
await store.reopen(portable);
const metadata=await store.getMetadata(baseline.dossierId),history=await store.listRevisions(baseline.dossierId);
need(metadata.revision===15&&history.length===15,'Original history was not retained');
need(history.every((value,index)=>value.sha256===portable.versions[index].sha256),'Original version chain differs');
const full=await store.studyFlowReport(baseline.dossierId,{flowId:baseline.native.updateFlowId});
need(full.report.reportSha256===baseline.native.reportSha256,'Original report differs');
const svg=await store.exportStudyFlow(baseline.dossierId,{flowId:baseline.native.updateFlowId,format:'svg'});
need(sha(svg.body)==='d650e852deb9f4fb375115fb011d145dbab9a089a9a91c59cc462a7ec6d6652b','Original SVG differs');
const result={schema:'commons.study-flow-receiving-reopen/v1',operationId:baseline.operationId,dossierId:baseline.dossierId,
 directory:join(out,'dossiers'),revision:15,revisions:history.length,portableSha256:sha(bytes),
 reportSha256:full.report.reportSha256,svgSha256:sha(svg.body),producerReplayed:false};
await mkdir(join(out,'receiving-restoration'),{recursive:true});
const path=join(out,'receiving-restoration','result.json'),body=Buffer.from(JSON.stringify(result,null,2)+'\n');
try{const existing=await readFile(path);need(existing.equals(body),'Existing receiving restoration differs');}
catch(error){if(error.code!=='ENOENT')throw error;
 const temporary=path+'.'+randomUUID()+'.writing',file=await open(temporary,'wx',0o600);
 try{try{await file.writeFile(body);await file.sync();}finally{await file.close();}
  try{await link(temporary,path);}catch(e){if(e.code!=='EEXIST')throw e;need((await readFile(path)).equals(body),'Concurrent restoration receipt differs');}
 }finally{await unlink(temporary);}}
console.log(JSON.stringify({phase:'original-portable-reopened',...result}));
