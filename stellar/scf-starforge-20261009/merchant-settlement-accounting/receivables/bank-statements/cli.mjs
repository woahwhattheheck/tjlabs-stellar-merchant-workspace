#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {constants} from 'node:fs';
import {open,mkdir,lstat} from 'node:fs/promises';
import {resolve,isAbsolute,dirname,join,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openAccountingWorkspace} from '../../workspace/store.mjs';
import {accountingWorkspaceBinding} from '../../workspace/binding.mjs';
import {ReceivablesWorkspace} from '../store.mjs';
import {BankStatementsWorkspace,BANK_REQUEST_BYTES} from './store.mjs';
import {need,json,sha} from '../core.mjs';
import {BANK_SOURCE_BYTES,BANK_ROW_LIMIT} from './domain.mjs';
import {readBankStatementSource} from './source.mjs';

const HELP='Merchant bank statements and cash reconciliation\n\n'+
  'starforge bank-statements accountant help\n'+
  'starforge bank-statements serve --directory /private/accounting [--port 8448]\n'+
  'starforge bank-statements state --directory /private/accounting\n'+
  'starforge bank-statements transactions --directory /private/accounting --account UUID [--status UNMATCHED] [--offset 0] [--limit 100]\n'+
  'starforge bank-statements detail --directory /private/accounting --id TRANSACTION_UUID\n'+
  'starforge bank-statements prepare-source --file /private/statement.xml --format CAMT053 --out /private/source.json [--account-namespace BANK] [--message-version camt.053.001.08] [--detail-policy PRESERVE_ONLY]\n'+
  'starforge bank-statements prepare-source --file /private/statement.csv --format CSV --csv-mapping /private/mapping.json --out /private/source.json\n'+
  'starforge bank-statements source-preview --directory /private/accounting --input /private/source.json\n'+
  'starforge bank-statements assembly-preview --directory /private/accounting --input /private/pages.json\n'+
  'starforge bank-statements close-preview --directory /private/accounting --input /private/close.json\n'+
  'starforge bank-statements apply --directory /private/accounting --action ACTION --input /private/request.json [--id UUID]\n'+
  'starforge bank-statements operation --directory /private/accounting --request ORIGINAL_REQUEST_ID\n'+
  'starforge bank-statements import --directory /private/accounting --id IMPORT_UUID\n'+
  'starforge bank-statements close --directory /private/accounting --id CLOSE_UUID\n'+
  'starforge bank-statements file --directory /private/accounting --kind import --id IMPORT_UUID --name original --out /private/original.ofx\n'+
  'starforge bank-statements file --directory /private/accounting --kind close --id CLOSE_UUID --name account.tar --out /private/bank-close.tar\n'+
  'starforge bank-statements export --directory /private/accounting --id CLOSE_UUID --out /private/new-handover\n\n'+
  'Actions: account, receive-source, match, receive-receipt, undo, resolve, close, reopen.\n'+
  'Every mutation retains revision, actor and one stable requestId; workspaceId optionally binds it to the original directory.\n'+
  'Source JSON is {source:{format:OFX|QFX|CSV|CAMT053,file:{name,dataBase64},csv?:explicit mapping,camt?:selected interpretation}}.\n'+
  'Dates and amounts remain explicit source calendar dates and exact decimal strings. Review source and close hashes before apply.\n'+
  'Downloads and output directories are create-only. The complete close export includes originals, editable JSON, postings, HTML and customer accounts.\n';
const COMMANDS=new Set(['help','--help','prepare-source','serve','state','transactions','detail','source-preview','assembly-preview','close-preview','apply','operation','import','close','file','export']);
const FLAGS=new Set(['directory','outbox','proof-dir','terms','recovered-dir','port','account','status','search','offset','limit',
  'id','input','action','request','kind','name','out','expected-workspace-id','expected-sources-sha256',
  'file','format','text-encoding','account-namespace','csv-mapping','message-version','detail-policy']);
export function parseBankArguments(argv) {
  const [command='help',...rest]=argv,flags={};need(COMMANDS.has(command),'UNKNOWN_BANK_COMMAND','Choose a documented bank-statement command.');
  for(let i=0;i<rest.length;i+=2) {
    need(/^--[a-z-]+$/.test(rest[i])&&FLAGS.has(rest[i].slice(2))&&typeof rest[i+1]==='string'&&!rest[i+1].startsWith('--'),
      'INVALID_BANK_ARGUMENT','Supply each documented option and its value.');
    const key=rest[i].slice(2);need(!Object.hasOwn(flags,key),'DUPLICATE_BANK_ARGUMENT','Supply each option once.');flags[key]=rest[i+1];
  }
  return {command,flags};
}
function absolute(value,label) {
  need(typeof value==='string'&&isAbsolute(value)&&value===resolve(value)&&value!=='/','BANK_ABSOLUTE_PATH_REQUIRED','Use an absolute normalized '+label+' path.');return value;
}
async function inputFile(path) {
  const handle=await open(absolute(path,'request'),constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  try {const stat=await handle.stat();need(stat.isFile()&&stat.size>0&&stat.size<=BANK_REQUEST_BYTES,'INVALID_BANK_INPUT','Choose a complete request within the 24 MB limit.');
    const bytes=await handle.readFile();need(bytes.length===stat.size,'BANK_INPUT_CHANGED','The request changed during reading.',409);
    let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{need(false,'INVALID_BANK_JSON','Choose a complete UTF-8 JSON request.');}
    need(value&&typeof value==='object'&&!Array.isArray(value),'INVALID_BANK_JSON','Use one JSON request object.');return value;
  }finally{await handle.close();}
}
async function outputFile(path,bytes) {
  absolute(path,'output');const handle=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
  try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  return {path,bytes:bytes.length,sha256:sha(bytes)};
}
async function prepareSource(flags) {
  const allowed=new Set(['file','format','out','text-encoding','account-namespace','csv-mapping','message-version','detail-policy']);
  for(const flag of Object.keys(flags))need(allowed.has(flag),'INVALID_PREPARE_SOURCE_OPTION','Use only original-file preparation options.',400,{flag});
  const format=String(flags.format||'').toUpperCase();
  need(['OFX','QFX','CSV','CAMT053'].includes(format),'INVALID_BANK_SOURCE_FORMAT','Select OFX, QFX, CSV or CAMT053 explicitly.');
  need(format==='CSV'||!flags['csv-mapping'],'UNEXPECTED_BANK_CSV_MAPPING','CSV mapping applies only to the CSV source format.');
  need(format==='CAMT053'||!(flags['message-version']||flags['detail-policy']),'UNEXPECTED_BANK_CAMT_OPTIONS','CAMT interpretation options apply only to CAMT053.');
  const inputPath=absolute(flags.file,'original source'),outputPath=absolute(flags.out,'prepared source');
  const handle=await open(inputPath,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  let bytes;
  try {
    const before=await handle.stat();
    need(before.isFile()&&before.size>0&&before.size<=BANK_SOURCE_BYTES,'INVALID_BANK_ORIGINAL','Choose one complete original statement within the 16 MB limit.');
    bytes=await handle.readFile();
    const after=await handle.stat();
    need(bytes.length===before.size&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,
      'BANK_ORIGINAL_CHANGED','The original source changed during reading. Prepare its complete saved file.',409);
  }finally{await handle.close();}
  const source={format,file:{name:basename(inputPath),dataBase64:bytes.toString('base64')}};
  if(flags['text-encoding'])source.textEncoding=flags['text-encoding'];
  if(flags['account-namespace'])source.accountNamespace=flags['account-namespace'];
  if(format==='CSV') {
    need(flags['csv-mapping'],'BANK_CSV_MAPPING_REQUIRED','Select the complete explicit CSV mapping JSON with --csv-mapping.');
    source.csv=await inputFile(flags['csv-mapping']);
  }
  if(format==='CAMT053'&&(flags['message-version']||flags['detail-policy'])) {
    source.camt={};
    if(flags['message-version'])source.camt.messageVersion=flags['message-version'];
    if(flags['detail-policy'])source.camt.detailPolicy=flags['detail-policy'];
  }
  const report=readBankStatementSource(source);
  const recordCount=report.statements.reduce((sum,statement)=>sum+statement.rows.length+statement.pendingRows.length+
    (statement.excludedRows?.filter(row=>row.row?.camt||row.camt).length??0),0);
  need(recordCount<=BANK_ROW_LIMIT,'BANK_SOURCE_ROW_LIMIT','Choose at most 50,000 original statement rows.',413);
  const request=Buffer.from(json({source}),'utf8');
  need(request.length<=BANK_REQUEST_BYTES,'BANK_PREPARED_SOURCE_TOO_LARGE','The complete prepared request exceeds the workspace 24 MB request limit.',413);
  return {schema:'stellar-forge.bank-prepared-source.v1',...await outputFile(outputPath,request),
    sourceFile:report.file,format:report.format,statementCount:report.statements.length,recordCount,
    statements:report.statements.map(statement=>({id:statement.id,account:statement.account,period:statement.period,
      summary:statement.summary,issues:statement.issues})),issues:report.issues};
}
export async function runBankStatementsCli(argv=process.argv.slice(2)) {
  if(argv[0]==='accountant'){const {runAccountantReceivingCli}=await import('./accountant-receiving/cli.mjs');return runAccountantReceivingCli(argv.slice(1));}
  const {command,flags}=parseBankArguments(argv);
  if(command==='help'||command==='--help'){process.stdout.write(HELP);return;}
  if(command==='prepare-source'){const result=await prepareSource(flags);process.stdout.write(json(result));return result;}
  const options={directory:absolute(flags.directory,'accounting workspace')};
  for(const [flag,key]of [['outbox','outboxDir'],['proof-dir','proofDir'],['terms','termsFile'],['recovered-dir','recoveredDir']])
    if(flags[flag])options[key]=absolute(flags[flag],flag);
  if(flags['expected-workspace-id'])options.expectedWorkspaceId=flags['expected-workspace-id'];
  if(flags['expected-sources-sha256'])options.expectedSourcesSha256=flags['expected-sources-sha256'];
  if(command==='serve') {
    const port=Number(flags.port??8448);need(Number.isInteger(port)&&port>=0&&port<=65535,'INVALID_BANK_PORT','Choose a valid local port.');
    const {createReceivablesServer}=await import('../server.mjs'),running=await createReceivablesServer({...options,port});
    const binding=accountingWorkspaceBinding(running.workspace.directory,running.workspace.state),url=new URL('/bank-statements/',running.url).href;
    process.stdout.write(JSON.stringify({schema:'stellar-forge.merchant-bank-statements-startup.v1',
      directory:running.workspace.directory,workspaceId:binding.workspaceId,sourcesSha256:binding.sourcesSha256,url})+'\n');
    let closing=false;const stop=()=>{if(closing)return;closing=true;running.close().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);return {...running,bankStatementsUrl:url};
  }
  const workspace=await openAccountingWorkspace(options);
  try {
    const bank=await new BankStatementsWorkspace(new ReceivablesWorkspace(workspace)).init();let result;
    if(command==='state')result=await bank.state();
    else if(command==='transactions')result=await bank.transactions({accountId:flags.account,status:flags.status,search:flags.search,offset:flags.offset,limit:flags.limit});
    else if(command==='detail')result=await bank.detail(flags.id);
    else if(command==='source-preview')result=await bank.previewSource(await inputFile(flags.input));
    else if(command==='assembly-preview')result=await bank.previewAssembly(await inputFile(flags.input));
    else if(command==='close-preview')result=await bank.previewClose(await inputFile(flags.input));
    else if(command==='operation')result=await bank.getOperation(flags.request);
    else if(command==='import')result=await bank.importDetail(flags.id);
    else if(command==='close')result=await bank.closeDetail(flags.id);
    else if(command==='apply') {
      const value=await inputFile(flags.input);
      const method={account:'saveAccount','receive-source':'receiveSource',match:'match','receive-receipt':'receiveReceipt',undo:'undo',
        resolve:'resolve',close:'retainClose',reopen:'reopenClose'}[flags.action];
      need(method,'UNKNOWN_BANK_ACTION','Choose a documented bank mutation.');
      result=['match','receiveReceipt','undo','resolve','reopenClose'].includes(method)?await bank[method](flags.id,value):await bank[method](value);
    } else if(command==='file') {
      need(['import','close'].includes(flags.kind),'INVALID_BANK_FILE_KIND','Choose import or close.');
      const file=flags.kind==='import'?await bank.importFile(flags.id,flags.name):await bank.closeFile(flags.id,flags.name);
      result={...await outputFile(flags.out,file.bytes),name:file.name,type:file.type};
    } else if(command==='export') {
      const output=absolute(flags.out,'handover'),parent=await lstat(dirname(output));
      need(parent.isDirectory()&&!parent.isSymbolicLink(),'INVALID_BANK_OUTPUT_PARENT','Choose an existing output parent.');
      const detail=await bank.closeDetail(flags.id);await mkdir(output,{mode:0o700});const files=[];
      for(const name of [...Object.keys(detail.close.files),'account.tar']) {
        const file=await bank.closeFile(flags.id,name);
        files.push({name,type:file.type,...await outputFile(join(output,name),file.bytes)});
      }
      result={directory:output,closeId:flags.id,files};
    }
    process.stdout.write(json(result));return result;
  }finally{await workspace.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  runBankStatementsCli().catch(error=>{process.stderr.write(json({error:{code:error.code??'BANK_WORKSPACE_FAILED',message:error.message}}));process.exitCode=1;});
