#!/usr/bin/env node
// MIT. Complete catalog files joined to the original API-pass export format.
import {readFile,open,mkdir,lstat,realpath,link,unlink} from 'node:fs/promises';
import {constants as C} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createCatalogWorkflow,catalogCsv} from './catalog-workflow.mjs';
import {catalogReviewHtml,catalogReportHtml} from './catalog-views.mjs';
import {parseApiPassExport} from '../../stellar-forge/mcp-merchant-operator/api-pass-protocol.mjs';
const sha256=text=>createHash('sha256').update(text).digest('hex');
const engine=createCatalogWorkflow({sha256,byteLength:text=>Buffer.byteLength(text)});
const json=value=>JSON.stringify(value,null,2)+'\n';
const help='catalog-workflow init --input catalog.json --out workspace.json\n'+
'catalog-workflow apply --workspace workspace.json --input operation.json --out next-workspace.json\n'+
'catalog-workflow import-export --workspace workspace.json --input capture.json --manifest api-pass-export.json --response response.bin --call call-detail.json --request-body request.json --out next-workspace.json\n'+
'catalog-workflow report --workspace workspace.json --period PERIOD --directory /private/report\n'+
'catalog-workflow review --workspace workspace.json --out review.html\n'+
'catalog-workflow inspect --workspace workspace.json\n'+
'catalog-workflow unpack --workspace compact-workspace.json --out expanded-workspace.json\n\n'+
'Every mutation writes a complete new workspace file. Existing identical outputs reopen; changed outputs require a new filename. Complete exports and original calls remain with their native API-pass owner.';
function args(argv){const result={command:argv[0]??'help'};for(let i=1;i<argv.length;i+=2){if(!/^--[a-z-]+$/.test(argv[i])||argv[i+1]===undefined)throw new Error('Use complete --name value arguments.');const k=argv[i].slice(2);if(Object.hasOwn(result,k))throw new Error('Argument repeated: '+k);result[k]=argv[i+1];}return result;}
function required(input,key){if(!input[key])throw new Error('Choose --'+key+'.');return input[key];}
async function bytes(path){const absolute=resolve(path),h=await open(absolute,C.O_RDONLY|C.O_NOFOLLOW);try{const before=await h.stat();if(!before.isFile()||before.size>256*1024*1024)throw new Error('Use a complete regular file of at most 256 MiB: '+path);const data=await h.readFile(),after=await h.stat();if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||data.length!==before.size)throw new Error('The selected file changed while reading: '+path);return data;}finally{await h.close();}}
async function text(path){return new TextDecoder('utf-8',{fatal:true}).decode(await bytes(path));}
async function readJson(path){return JSON.parse(await text(path));}
async function privateDirectory(path){path=resolve(path);await mkdir(path,{recursive:true,mode:0o700});const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink()||s.mode&0o077||await realpath(path)!==path)throw new Error('Use a canonical private output directory with mode 0700: '+path);return path;}
async function save(path,value){const absolute=resolve(path),directory=await privateDirectory(dirname(absolute)),data=Buffer.from(typeof value==='string'?value:json(value));try{const prior=await bytes(absolute);if(prior.equals(data))return {path:absolute,bytes:data.length,sha256:sha256(data),reused:true};throw new Error('This output already contains different work. Choose a new output filename: '+absolute);}catch(e){if(e.code!=='ENOENT')throw e;}
const temporary=join(directory,'.catalog-'+randomUUID()+'.partial');const h=await open(temporary,C.O_WRONLY|C.O_CREAT|C.O_EXCL|C.O_NOFOLLOW,0o600);try{await h.writeFile(data);await h.sync();}finally{await h.close();}
try{await link(temporary,absolute);}catch(e){if(e.code!=='EEXIST')throw e;const prior=await bytes(absolute);if(!prior.equals(data))throw new Error('Another writer published a different output: '+absolute);}finally{await unlink(temporary).catch(()=>{});}const d=await open(directory,C.O_RDONLY);try{await d.sync();}finally{await d.close();}return {path:absolute,bytes:data.length,sha256:sha256(data),reused:false};}
export async function runCatalogCommand(argv){const a=args(argv);if(['help','--help'].includes(a.command))return {help};if(a.command==='init'){const input=await readJson(required(a,'input')),result=await engine.create(input);return save(required(a,'out'),await engine.pack(result.workspace));}
const workspace=await readJson(required(a,'workspace'));await engine.open(workspace);
if(a.command==='inspect'){const model=await engine.open(workspace);return {workspaceId:workspace.id,revision:workspace.revision,sha256:sha256(json(workspace)),targets:model.targets.length,periods:model.periods.map(p=>({id:p.id,label:p.label,start:p.start,end:p.end,targets:p.targets.length,captures:p.captures.length,decisions:p.decisions.length}))};}
if(a.command==='unpack')return save(required(a,'out'),await engine.unpack(workspace));
if(a.command==='apply'){const operation=await readJson(required(a,'input'));if(!['saveCatalog','plan','capture','captureGroup','decide'].includes(operation.action))throw new Error('Choose saveCatalog, plan, capture, captureGroup or decide.');const result=await engine[operation.action](workspace,operation.arguments);return save(required(a,'out'),await engine.pack(result.workspace));}
if(a.command==='import-export'){const input=await readJson(required(a,'input')),manifestBytes=await bytes(required(a,'manifest')),manifest=parseApiPassExport(manifestBytes),responseText=await text(required(a,'response')),requestText=await text(required(a,'request-body')),callFile=await readJson(required(a,'call')),call=callFile.call??callFile;if(manifest.selection.kind!=='response')throw new Error('Select the original response export.');const receive=Array.isArray(input.targets)?engine.captureGroup:engine.capture;const result=await receive(workspace,{...input,responseText,providerStatus:call.result?.status,source:{kind:'api-pass',manifest,manifestText:new TextDecoder('utf-8',{fatal:true}).decode(manifestBytes),call,callId:call.id,requestText}});return save(required(a,'out'),await engine.pack(result.workspace));}
if(a.command==='review'){const packed=await engine.pack(workspace);const core=await readFile(new URL('./catalog-workflow.mjs',import.meta.url),'utf8');return save(required(a,'out'),catalogReviewHtml(packed,core));}
if(a.command==='report'){const packed=await engine.pack(workspace),report=await engine.report(packed,required(a,'period')),reportDocument={...report,period:{id:report.period.id,label:report.period.label,start:report.period.start,end:report.period.end,previousPeriodId:report.period.previousPeriodId},sourceWorkspace:'catalog-workspace.json'},directory=await privateDirectory(required(a,'directory'));const outputs=[];for(const [name,body] of [['catalog.csv',catalogCsv(report)],['changes.csv',catalogCsv(report,'changes')],['attention.csv',catalogCsv(report,'attention')],['catalog-report.json',json(reportDocument)],['catalog-report.html',catalogReportHtml(report)],['catalog-workspace.json',json(packed)]])outputs.push(await save(join(directory,name),body));const core=await readFile(new URL('./catalog-workflow.mjs',import.meta.url),'utf8');outputs.push(await save(join(directory,'catalog-review.html'),catalogReviewHtml(packed,core)));return {period:report.period.id,summary:report.summary,outputs};}
throw new Error('Unknown catalog command. Run catalog-workflow help.');}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){runCatalogCommand(process.argv.slice(2)).then(value=>process.stdout.write(value.help??json(value))).catch(error=>{process.stderr.write((error.code?error.code+': ':'')+error.message+'\n');process.exitCode=2;});}
