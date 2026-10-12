#!/usr/bin/env node
// MIT. Installed county-report production uses the original saved FRED project.
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, mkdir, lstat } from 'node:fs/promises';
import { writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { need } from './model.mjs';
import { operationId } from '../model.mjs';
import { defaultSanFranciscoProfile } from './profile.mjs';
import { importQcewSource, saveQcewProfile, produceQcewEdition, viewQcewProject, getQcewEdition, downloadQcewMember,
  publishQcewEdition, selectQcewPublication } from './project.mjs';
import { readQcewMerchant, startQcewMerchant } from './merchant.mjs';
import { prepareQcewPurchase, executeQcewPurchase, recoverQcewPurchase, exportQcewPurchase,
  receiveQcewPurchase, listQcewPurchases } from './purchase.mjs';
import { receiveQcewReportDelivery, readQcewReportReceiving, exportQcewReportReceiving } from './delivery.mjs';
import { QCEW_REPORT_PACKAGE, QCEW_PUBLICATION_MAX_BYTES } from './publication-model.mjs';
import { qcewMemberBytes } from './files.mjs';
import { readQcewOriginalMember, MAX_QCEW_CAPTURE_BYTES, sha256 } from './source.mjs';
import { initializeFredProject, importFredCapture, exportFredProject, receiveFredProject } from '../project.mjs';
import { sealFredPublicTable } from '../source.mjs';
import { FRED_DDP_PROJECT_BUNDLE_MAX_BYTES } from '../ddp/project-validation.mjs';
export const QCEW_USAGE=[
  'County wage reports — original BLS QCEW sources in the saved FRED project','',
  'starforge fred qcew init --project ABS --title TEXT --price-source ORIGINAL_PUBLIC_TABLE_JSON',
  'starforge fred qcew cpi --project ABS --id ID --expected-revision N --source ORIGINAL_PUBLIC_TABLE_JSON',
  'starforge fred qcew profile-template --out PROFILE_JSON',
  'starforge fred qcew show --project ABS',
  'starforge fred qcew import --project ABS --id ID --expected-revision N --input-directory ORIGINAL_INTAKE',
  'starforge fred qcew import --project ABS --id ID --expected-revision N --source COMPLETE_CAPTURE_JSON',
  'starforge fred qcew profile --project ABS --id ID --expected-revision N --source PROFILE_JSON',
  'starforge fred qcew produce --project ABS --id ID --expected-revision N --capture SHA --cpi SHA --profile SHA --period YYYY-QN [--previous EDITION_SHA] [--chromium ABS]',
  'starforge fred qcew edition --project ABS [--edition SHA] [--verify-sources]',
  'starforge fred qcew download --project ABS --edition SHA --file MEMBER --out FILE',
  'starforge fred qcew original --project ABS --capture SHA --file RETAINED_CSV_GZ_NAME --out ORIGINAL_CSV',
  'starforge fred qcew export --project ABS --out COMPLETE_FRED_PROJECT_JSON',
  'starforge fred qcew receive --project ABS_EMPTY --source COMPLETE_FRED_PROJECT_JSON','',
  'starforge fred qcew publish --project ABS --id ID --expected-revision N --edition SHA --origin HTTPS --payment JSON [--path /county-reports]',
  'starforge fred qcew publication --project ABS --publication SHA',
  'starforge fred qcew merchant --project ABS --publication SHA [--port N] [--facilitator URL] [--allow-local-facilitator]',
  'starforge fred qcew prepare --project ABS --publication SHA --intent ID [--file MEMBER] [--accept N] [--out JSON]',
  'starforge fred qcew buy --project ABS --publication SHA --intent ID --buyer-config JSON',
  'starforge fred qcew recover --project ABS --publication SHA --intent ID --buyer-config JSON',
  'starforge fred qcew delivery --project ABS --publication SHA --intent ID --buyer-config JSON --out FILE',
  'starforge fred qcew receive-purchase --project ABS --publication SHA --intent ID --buyer-config JSON [--receiving-directory ABS]',
  'starforge fred qcew receive-report --directory ABS --source ORIGINAL_REPORT_PACKAGE_GZ',
  'starforge fred qcew received-report --directory ABS',
  'starforge fred qcew received-file --directory ABS [--edition SHA] [--file MEMBER] --out FILE','',
  'Serve the same county/merchant/customer browser with: starforge fred serve --project ABS --buyer-config JSON --facilitator URL',
  'The default paid resource is the complete report-package.json.gz, including all original predecessor reports.',
  'Receiving a saved purchase continues its original selected directory. Downloaded packages also open independently.','',
  'Acquire originals with: python3 fred/qcew/source_fetch.py --directory ABS --years 1990:2026',
  'Import the original CPI public table with qcew cpi, or a previously sealed capture with the existing fred import command.',
  'A saved profile is reused for each reporting quarter; original source editions and report files stay immutable.',
  'Use the same operation ID/revision to resume. Exports are create-only. PDF uses the configured local Chromium executable.'
].join('\n');
const options={
  init:['project','title','price-source'],cpi:['project','id','expected-revision','source'],
  'profile-template':['out'],show:['project'],
  import:['project','id','expected-revision','input-directory','source'],
  profile:['project','id','expected-revision','source'],
  produce:['project','id','expected-revision','capture','cpi','profile','period','previous','chromium'],
  edition:['project','edition','verify-sources'],
  download:['project','edition','file','out'],
  original:['project','capture','file','out'],
  export:['project','out'],receive:['project','source'],
  publish:['project','id','expected-revision','edition','origin','path','payment'],
  publication:['project','publication'],
  merchant:['project','publication','port','facilitator','allow-local-facilitator'],
  prepare:['project','publication','intent','file','accept','out'],
  buy:['project','publication','intent','buyer-config'],recover:['project','publication','intent','buyer-config'],
  delivery:['project','publication','intent','buyer-config','out'],
  'receive-purchase':['project','publication','intent','buyer-config','receiving-directory'],
  'receive-report':['directory','source'],'received-report':['directory'],
  'received-file':['directory','edition','file','out']
};
function parse(command,args) {
  need(options[command],'Choose a supported county report command.');
  const flags={};
  for(let i=0;i<args.length;i++) {
    const token=args[i];need(/^--[a-z-]+$/.test(token),'Use named county report command options.');
    const key=token.slice(2);need(options[command].includes(key)&&flags[key]===undefined,'An option is unknown or repeated: '+token);
    if(['verify-sources','allow-local-facilitator'].includes(key)) flags[key]=true;
    else {need(typeof args[i+1]==='string'&&!args[i+1].startsWith('--'),'Supply a value for '+token);flags[key]=args[++i];}
  }
  if(['receive-report','received-report','received-file'].includes(command)) need(flags.directory,'--directory selects the original customer report directory.');
  else if(command!=='profile-template')need(flags.project,'--project selects the existing FRED project.');
  return flags;
}
async function jsonFile(path,maximum=MAX_QCEW_CAPTURE_BYTES) {
  need(typeof path==='string'&&path,'Choose the complete input JSON file.');
  path=resolve(path);const stat=await lstat(path);
  need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=maximum,'The original input JSON is unavailable or exceeds capacity.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readFile(path)));
}
async function output(path,bytes) {
  need(typeof path==='string'&&path,'--out is required for a complete export.');
  path=resolve(path);await mkdir(dirname(path),{recursive:true,mode:0o700});
  await writeBytes(path,bytes,{exclusive:true});
  return {file:path,bytes:bytes.length,sha256:sha256(bytes)};
}
async function originalBytes(path,maximum) {
  need(typeof path==='string'&&path,'Select the complete original input file.');
  path=resolve(path);const stat=await lstat(path);
  need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=maximum,'The complete original input is unavailable or exceeds capacity.');
  return readFile(path);
}
function integer(value,label,fallback,maximum=Number.MAX_SAFE_INTEGER) {
  if(value===undefined)return fallback;
  need(/^[0-9]+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)<=maximum,'Choose a valid '+label+'.');
  return Number(value);
}
async function foreground(session) {
  console.log(JSON.stringify({state:'LISTENING',url:session.url,mode:session.mode,
    publicationId:session.publicationId,editionId:session.editionId,resource:session.resource}));
  await new Promise((done,reject)=>{
    let stopping=false;
    const close=async()=>{
      if(stopping)return;stopping=true;
      process.removeListener('SIGINT',close);process.removeListener('SIGTERM',close);
      try{await session.close();done();}catch(error){reject(error);}
    };
    process.once('SIGINT',close);process.once('SIGTERM',close);
  });
  return {state:'CLOSED'};
}
function when(value) {
  const match=/^([0-9]{4})-Q([1-4])$/.exec(value??'');
  need(match,'Use a reporting period such as 2025-Q4.');
  return {year:Number(match[1]),quarter:Number(match[2])};
}
export async function runQcewCli(args=process.argv.slice(2)) {
  if(!args.length||['help','-h','--help'].includes(args[0])||args.includes('--help')) {console.log(QCEW_USAGE);return;}
  const [command,...rest]=args,flags=parse(command,rest),directory=flags.project?resolve(flags.project):null;
  const common=()=>{
    need(typeof flags.id==='string'&&/^[0-9]+$/.test(flags['expected-revision']??''),'Use the retained operation ID and original project revision.');
    return {directory,id:flags.id,expectedRevision:Number(flags['expected-revision'])};
  };
  const selected=()=>selectQcewPublication(directory,flags.publication);
  const buyer=async()=>{
    need(flags['buyer-config'],'--buyer-config selects the original configured Buyer.');
    const {Buyer}=await import('../../../sf88-operator-buyer-cli/node/index.mjs');
    return new Buyer(await jsonFile(flags['buyer-config'],65536)).ready();
  };
  const summary=value=>{const{result,...rest}=value;return rest;};
  let result;
  switch(command) {
    case 'init':{
      const capture=sealFredPublicTable(await jsonFile(flags['price-source'],8*1024*1024));
      need(flags.title,'--title names the original FRED project.');
      result=await initializeFredProject({directory,title:flags.title,selection:capture.selection});break;
    }
    case 'cpi':result=await importFredCapture({...common(),capture:sealFredPublicTable(await jsonFile(flags.source,8*1024*1024))});break;
    case 'profile-template':result=await output(flags.out,Buffer.from(JSON.stringify(defaultSanFranciscoProfile().definition,null,2)+'\n'));break;
    case 'show':result=await viewQcewProject({directory});break;
    case 'import':
      need(Boolean(flags.source)!==Boolean(flags['input-directory']),'Choose the complete original intake directory or sealed capture JSON.');
      result=await importQcewSource({...common(),...(flags.source?{capture:await jsonFile(flags.source)}:{inputDirectory:resolve(flags['input-directory'])})});break;
    case 'profile':result=await saveQcewProfile({...common(),profile:await jsonFile(flags.source,64*1024)});break;
    case 'produce':result=await produceQcewEdition({...common(),captureSha256:flags.capture,cpiCaptureSha256:flags.cpi,profileId:flags.profile,
      period:when(flags.period),previousEditionId:flags.previous??null,browserPath:flags.chromium?resolve(flags.chromium):null});break;
    case 'edition':{
      const edition=await getQcewEdition(directory,flags.edition,{validateSources:Boolean(flags['verify-sources'])});
      result={edition:edition.entry,directory:edition.directory,availability:edition.report.availability,files:edition.manifest.files};break;
    }
    case 'download':{
      const file=await downloadQcewMember({directory,editionId:flags.edition,name:flags.file});
      result={...(await output(flags.out,file.bytes)),contentType:file.contentType};break;
    }
    case 'original':{
      const file=await readQcewOriginalMember(directory,flags.capture,flags.file);
      result=await output(flags.out,file.bytes);break;
    }
    case 'export':result=await output(flags.out,Buffer.from(JSON.stringify(await exportFredProject({directory}),null,2)+'\n'));break;
    case 'receive':result=await receiveFredProject({directory,bundle:await jsonFile(flags.source,FRED_DDP_PROJECT_BUNDLE_MAX_BYTES)});break;
    case 'publish':result=await publishQcewEdition({...common(),editionId:flags.edition,origin:flags.origin,
      path:flags.path??'/county-reports',payment:await jsonFile(flags.payment,65536)});break;
    case 'publication':{
      const root=await selected(),{edition,plan,offers}=await readQcewMerchant(root);
      result={edition,plan,offers,requests:await listQcewPurchases(root)};break;
    }
    case 'merchant':result=await foreground(await startQcewMerchant({directory:await selected(),
      port:integer(flags.port,'local port',0,65535),facilitator:flags.facilitator,
      allowLocalFacilitator:flags['allow-local-facilitator']===true}));break;
    case 'prepare':{
      const purchase=await prepareQcewPurchase({directory:await selected(),intentId:flags.intent,
        file:flags.file??null,acceptIndex:integer(flags.accept,'payment alternative',0)});
      result=flags.out?await output(flags.out,Buffer.from(JSON.stringify(purchase,null,2)+'\n')):purchase;break;
    }
    case 'buy':{
      operationId(flags.intent);
      const root=await selected();
      const purchase=await jsonFile(resolve(root,'customer-requests',flags.intent,'prepared.json'),131072);
      need(purchase.intentId===flags.intent,'Choose the original prepared customer intent.');
      result=summary(await executeQcewPurchase({directory:root,buyer:await buyer(),purchase}));break;
    }
    case 'recover':result=summary(await recoverQcewPurchase({directory:await selected(),buyer:await buyer(),intentId:flags.intent}));break;
    case 'delivery':{
      const delivered=await exportQcewPurchase({directory:await selected(),buyer:await buyer(),intentId:flags.intent});
      result={...(await output(flags.out,delivered.bytes)),contentType:delivered.contentType,filename:delivered.filename};break;
    }
    case 'receive-purchase':result=await receiveQcewPurchase({directory:await selected(),buyer:await buyer(),intentId:flags.intent,
      receivingDirectory:flags['receiving-directory']?resolve(flags['receiving-directory']):null});break;
    case 'receive-report':result=await receiveQcewReportDelivery({directory:resolve(flags.directory),
      bytes:await originalBytes(flags.source,QCEW_PUBLICATION_MAX_BYTES)});break;
    case 'received-report':{
      const received=await readQcewReportReceiving(resolve(flags.directory));
      result={receipt:received.receipt,directory:received.directory,
        editions:received.editions.map(item=>({manifest:item.manifest,title:item.report.profile.definition.title,period:item.report.period}))};break;
    }
    case 'received-file':{
      const root=resolve(flags.directory),name=flags.file??QCEW_REPORT_PACKAGE;
      if(name===QCEW_REPORT_PACKAGE) {
        const received=await exportQcewReportReceiving(root);
        result={...(await output(flags.out,received.bytes)),contentType:received.contentType};break;
      }
      const received=await readQcewReportReceiving(root),edition=flags.edition?
        received.editions.find(item=>item.manifest.editionId===flags.edition):received.edition;
      need(edition,'Choose an original edition in this received report.');
      const file=edition.files.find(item=>item.name===name);need(file,'Choose a complete original report member.');
      result={...(await output(flags.out,qcewMemberBytes(file))),contentType:file.contentType};break;
    }
  }
  console.log(JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  runQcewCli().catch(error=>{console.error(JSON.stringify({code:error.code??'QCEW_COMMAND_FAILED',message:error.message}));process.exitCode=1;});
