#!/usr/bin/env node
// MIT. Complete research catalogue actions in the original FRED project.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFredProject, exportFredProject, receiveFredProject } from '../project.mjs';
import { runResearchAction, researchView, researchEntry, researchCsv, researchSourceDownload } from './project.mjs';
import { need, key } from './model.mjs';
import { operationId } from '../model.mjs';
import { readPrivateJson } from '../../routescan/quota.mjs';
const PACKAGE_MAX=256*1024*1024;
const commerceHelp = [
'research commerce --project DIR [--section publications|receivings --offset N --limit N --revision N]',
'research publication --project DIR --publication ID',
'research publication-file --project DIR --publication ID --member FILE --out NEW_FILE',
'research publish --project DIR --request ORIGINAL_PUBLICATION.json',
'research commerce-resume --project DIR --id ORIGINAL_ID --revision ORIGINAL_REVISION',
'research receive-edition --project DIR --request ORIGINAL_RECEIVING.json --file research-package.json.gz',
'research merchant --project DIR --publication ID [--port N --facilitator URL --allow-local-facilitator]',
'research prepare --project DIR --publication ID --intent ID [--member FILE --accept-index N]',
'research buy|recover --project DIR --publication ID --intent ID [--buyer-config EXISTING.json]',
'research purchase-file --project DIR --publication ID --intent ID --out NEW_FILE [--buyer-config EXISTING.json]',
'research purchase-receive --project DIR --publication ID --intent ID [--receiving-directory EMPTY_DIR --buyer-config EXISTING.json]',
'research purchase-received --project DIR --publication ID --intent ID',
'research purchase-received-file --project DIR --publication ID --intent ID --member FILE --out NEW_FILE',
'Publication request: {id,expectedRevision,productId,editionId,note,origin,path,payment}.',
'Receiving request: {id,expectedRevision,receivingDirectory}; retain that same request with the original package.',
'Purchases keep their original intent, terms, configured Buyer and receiving destination. Merchant runs until SIGINT/SIGTERM.'
].join('\n');
async function originalBytes(file,max){const selected=resolve(file),meta=await stat(selected);
need(meta.isFile()&&meta.size>0&&meta.size<=max,'Choose the complete original file within its retained capacity.');
const bytes=await readFile(selected);need(bytes.length===meta.size,'The selected original file changed while opening.');return bytes;}
async function saveMember(args,file){need(args.out,'Choose a new complete output path.');
await writeFile(resolve(args.out),file.bytes,{flag:'wx',mode:0o600});
return {path:resolve(args.out),bytes:file.bytes.length,contentType:file.contentType,sha256:file.sha256};}
async function commerceCommand(command,args,directory){
 const c=await import('./commerce.mjs');
 if(command==='commerce')return c.researchCommerceView(directory,{section:args.section??'publications',offset:Number(args.offset??0),limit:Number(args.limit??100),expectedRevision:args.revision===undefined?null:Number(args.revision)});
 if(command==='publish'||command==='receive-edition'){
  need(args.request,'Choose the complete original request JSON.');
  const request=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await originalBytes(args.request,131072)));
  need(request&&typeof request==='object'&&!Array.isArray(request),'Choose a complete original request.');
  if(command==='publish')return c.publishResearchEdition({...request,directory});
  need(args.file,'Choose the complete original Research package.');
  return c.receiveResearchEdition({...request,directory,bytes:await originalBytes(args.file,PACKAGE_MAX)});
 }
 if(command==='commerce-resume'){need(args.id&&args.revision!==undefined,'Choose the original pending ID and revision.');
  return c.resumeResearchCommerceAction({directory,id:args.id,expectedRevision:Number(args.revision)});}
 need(args.publication,'Choose the original Research publication.');
 const merchant=await c.getResearchPublication(directory,args.publication);
 if(command==='publication'){const p=await import('./purchase.mjs');return {projectId:merchant.projectId,revision:merchant.revision,record:merchant.record,
  edition:merchant.edition,plan:merchant.plan,requests:await p.listResearchPurchases(merchant.directory,{merchant})};}
 if(command==='publication-file')return saveMember(args,await c.downloadResearchPublication({directory,publicationId:args.publication,file:args.member??'research-package.json.gz'}));
 if(command==='merchant'){
  const {readFredWorkspaceLaunch}=await import('../launch.mjs'),m=await import('./merchant.mjs');
  const launch=await readFredWorkspaceLaunch({directory,buyerConfig:args['buyer-config'],facilitator:args.facilitator,
    allowLocalFacilitator:args['allow-local-facilitator']===true,merchantPort:Number(args.port??0)});
  const server=await m.startResearchMerchant({directory:merchant.directory,port:launch.binding.merchantPort,
    facilitator:launch.binding.facilitator??undefined,allowLocalFacilitator:args['allow-local-facilitator']===true});
  process.stdout.write(JSON.stringify({state:'LISTENING',publicationId:args.publication,url:server.url,resource:server.resource,mode:server.mode})+'\n');
  await new Promise(resolve=>{let closing=false;const close=()=>{if(closing)return;closing=true;server.close().then(resolve,error=>{process.stderr.write(String(error)+'\n');process.exitCode=1;resolve();});};process.once('SIGINT',close);process.once('SIGTERM',close);});
  return {state:'STOPPED',publicationId:args.publication};
 }
 operationId(args.intent);
 const p=await import('./purchase.mjs'),common={directory:merchant.directory,intentId:args.intent};
 if(command==='prepare')return p.prepareResearchPurchase({...common,file:args.member??null,acceptIndex:Number(args['accept-index']??0)});
 if(command==='purchase-received'){const value=await p.readResearchPurchaseReceiving(common);
  return {receipt:value.receipt,directory:value.directory??value.receipt.directory,edition:value.edition,
    files:value.files.map(({bodyBase64,...file})=>file)};}
 if(command==='purchase-received-file')return saveMember(args,await p.exportResearchPurchaseReceiving({...common,file:args.member??'research-package.json.gz',editionId:args.edition??null}));
 const {readFredWorkspaceLaunch}=await import('../launch.mjs'),{Buyer}=await import('../../../sf88-operator-buyer-cli/node/index.mjs');
 const launch=await readFredWorkspaceLaunch({directory,buyerConfig:args['buyer-config']});
 need(launch.buyerSettings,'Use this host’s existing configured Buyer.');
 const buyer=await new Buyer(launch.buyerSettings).ready();
 if(command==='recover'){const {result,...view}=await p.recoverResearchPurchase({...common,buyer});return view;}
 if(command==='purchase-file')return saveMember(args,await p.exportResearchPurchase({...common,buyer}));
 if(command==='purchase-receive')return p.receiveResearchPurchase({...common,buyer,receivingDirectory:args['receiving-directory']??null});
 need(command==='buy','Choose an original Research commerce command.');
 const purchase=await readPrivateJson(join(merchant.directory,'customer-requests',args.intent,'prepared.json'),131072);
 const {result,...view}=await p.executeResearchPurchase({directory:merchant.directory,buyer,purchase});return view;
}
const commerceCommands=new Set(['commerce','publication','publication-file','publish','commerce-resume','receive-edition','merchant','prepare','buy','recover','purchase-file','purchase-receive','purchase-received','purchase-received-file']);
const help='research catalog --project DIR [--query TEXT --topic TOPIC --geography REGION --due --offset N]\nresearch entry --project DIR --entry ID\nresearch action --project DIR --request COMPLETE_ACTION.json\nresearch upload --project DIR --request UPLOAD_ACTION.json --file ORIGINAL_FILE\nresearch csv --project DIR --out NEW.csv\nresearch source --project DIR --source ID --out NEW_FILE\nresearch export --project DIR --out COMPLETE_PROJECT.json\nresearch receive --project EMPTY_DIR --file COMPLETE_PROJECT.json\nActions retain original request ID, expectedRevision and source definition. Full project exports include every original source, definition, review and research-product edition.';
export async function main(argv=process.argv.slice(2)){const command=argv.shift(),args={};for(let i=0;i<argv.length;i++){const k=argv[i];need(k.startsWith('--'),'Use named command options.');if(k==='--due'||k==='--allow-local-facilitator'){args[k.slice(2)]=true;continue;}need(argv[i+1]!==undefined&&!argv[i+1].startsWith('--'),'Supply the complete option value.');args[k.slice(2)]=argv[++i];}
if(!command||command==='help'||command==='--help'){process.stdout.write(help+'\n\n'+commerceHelp+'\n');return;}need(args.project,'Select the original economic project.');const directory=resolve(args.project);let result;
if(commerceCommands.has(command))result=await commerceCommand(command,args,directory);
else if(command==='catalog')result=await researchView(directory,{query:args.query??'',topic:args.topic??'',geography:args.geography??'',due:args.due===true,offset:Number(args.offset??0),limit:Number(args.limit??100)});
else if(command==='entry')result=await researchEntry(directory,key(args.entry));
else if(command==='action'||command==='upload'){need(args.request,'Choose the complete original action JSON.');const request=JSON.parse(await readFile(resolve(args.request),'utf8'));if(command==='upload'){need(args.file&&request.action==='research-source-upload','Choose an original upload action and file.');request.bodyBase64=(await readFile(resolve(args.file))).toString('base64');}result=await runResearchAction({directory,request});}
else if(command==='csv'){need(args.out,'Choose a new CSV path.');const content=await researchCsv(directory);await writeFile(resolve(args.out),content,{flag:'wx',mode:0o600});result={path:resolve(args.out),bytes:Buffer.byteLength(content)};}
else if(command==='source'){need(args.out&&args.source,'Select a retained source and a new output path.');const source=await researchSourceDownload(directory,args.source);await writeFile(resolve(args.out),source.bytes,{flag:'wx',mode:0o600});result={path:resolve(args.out),bytes:source.bytes.length,contentType:source.contentType};}
else if(command==='export'){need(args.out,'Choose a new complete project path.');const bundle=await exportFredProject({directory});await writeFile(resolve(args.out),JSON.stringify(bundle,null,2)+'\n',{flag:'wx',mode:0o600});result={path:resolve(args.out),projectId:bundle.state.id,revision:bundle.state.revision,bundleSha256:bundle.bundleSha256};}
else if(command==='receive'){need(args.file,'Select the complete original project bundle.');result=await receiveFredProject({directory,bundle:JSON.parse(await readFile(resolve(args.file),'utf8'))});}
else throw new Error(help+'\n\n'+commerceHelp);process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{process.stderr.write(JSON.stringify({code:error.code??'RESEARCH_FAILED',message:error.message})+'\n');process.exitCode=1;});
