#!/usr/bin/env node
// MIT. Operate the existing live receiving desk through its private HTTP connection.
import {constants} from 'node:fs';
import {open,realpath} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openConnectedCiimDesk,inspectConnectedPending,describeConnectedDeskOperations,executeConnectedDeskOperation} from './connected-client.mjs';
import {LIMITS,fault} from './portable.mjs';

export const HELP=String.raw`CIIM connected receiving commands

Use the private desk-connection.json emitted by the original live desk server.
The server remains the sole database writer while these commands perform reads,
named review actions and complete original file transfers.

  ciim-desk connected operations
  ciim-desk connected connection --connection ABS
  ciim-desk connected status --connection ABS
  ciim-desk connected describe --connection ABS
  ciim-desk connected list --connection ABS --view records --edition ID
      [--comparison ID --offset N --limit N --status active --query TEXT]
  ciim-desk connected record --connection ABS --edition ID --record ID
  ciim-desk connected import --connection ABS --file ORIGINAL.zip
      [--filename ORIGINAL_NAME --sha256 SHA256 --bytes COUNT]
  ciim-desk connected act --connection ABS --request ORIGINAL_REQUEST.json
  ciim-desk connected call --connection ABS --file DECLARED_OPERATION.json
  ciim-desk connected pending --connection ABS
  ciim-desk connected recover --connection ABS
  ciim-desk connected export --connection ABS --kind workspace --out ABS
  ciim-desk connected export --connection ABS --kind handback --handback ID --out ABS
  ciim-desk connected attachment --connection ABS --edition ID
      --kind xml|native|mapped|profile|manifest|operation|source [--id ORIGINAL_ID] --out ABS
  ciim-desk connected guide --connection ABS --out ABS [--sha256 SHA256]

Common options:
  --requests ABS                    Existing private request-journal directory.
                                    Defaults to the desk's connected-client directory.
  --expected-workspace-id ID         Pin the original logical workspace identity.
  --expected-marker-sha256 SHA256    Pin the original desk marker.
  --timeout-ms N                    Original HTTP timeout, 1000..900000; default600000.

act reads the complete original JSON request:
  {"operationId":"ORIGINAL_ID","expectedRevision":0,"actor":"Recorded reviewer",
   "type":"context.save","data":{"note":"Original receiving context decision"}}

Use the current revision from status, the actual original review data and an
explicit operation ID. The complete request is saved privately before sending.
If its response is lost, pending shows that exact request and recover resends
the same body and ID. It never creates a replacement operation.

call accepts {"name":"desk.state","arguments":{}} or any original action and its
complete request under arguments. operations emits every declared type, original
review requirement and connected output destination.

import retains and inspects complete original bytes; it does not accept editions.
Use intake.import or workspace.restore through act for the named intake decision.
Workspace restoration retains original identity/history and uses a fresh desk.
The original pending restore survives its logical workspace-ID change.

Exports and attachments stream into private files. Existing output is reused only
when its complete byte count and SHA256 match. Source archives, XML, native pages,
profile specifications and every retained review remain available in full.
Closing this command leaves the original live server running.
`;

const common=['connection','requests','expected-workspace-id','expected-marker-sha256','timeout-ms'];
const commands=new Map([
  ['operations',[]],['connection',[]],['status',[]],['describe',[]],['pending',[]],['recover',[]],
  ['list',['view','edition','comparison','offset','limit','status','query']],
  ['record',['edition','record']],['import',['file','filename','sha256','bytes']],
  ['act',['request']],['call',['file']],['export',['kind','handback','out']],
  ['attachment',['edition','kind','id','out']],['guide',['out','sha256']],
]);
function parse(args){
  if(!Array.isArray(args)||args.some(value=>typeof value!=='string'))
    throw fault('CONNECTED_CLI_ARGUMENTS','Use string command arguments.');
  if(!args.length||args[0]==='help'||args.includes('--help'))return {command:'help',options:{}};
  const command=args[0];
  if(!commands.has(command))throw fault('CONNECTED_CLI_COMMAND','Choose a connected receiving command. See --help.');
  const allowed=new Set(command==='operations'?[]:[...common,...commands.get(command)]),options={};
  for(let i=1;i<args.length;i++){
    const flag=args[i];
    if(!flag.startsWith('--')||!allowed.has(flag.slice(2))||Object.hasOwn(options,flag.slice(2)))
      throw fault('CONNECTED_CLI_ARGUMENTS','Use each declared option once: '+flag);
    const value=args[++i];
    if(value===undefined||value.startsWith('--'))throw fault('CONNECTED_CLI_ARGUMENTS','Supply a value for '+flag+'.');
    options[flag.slice(2)]=value;
  }
  return {command,options};
}
function required(options,key){
  if(typeof options[key]!=='string'||options[key].length===0)
    throw fault('CONNECTED_CLI_REQUIRED','Supply --'+key+'.');
  return options[key];
}
function integer(value,name,{minimum=0,maximum=Number.MAX_SAFE_INTEGER}={}){
  if(!/^(?:0|[1-9]\d*)$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<minimum||Number(value)>maximum)
    throw fault('CONNECTED_CLI_NUMBER','Supply an exact supported integer for --'+name+'.');
  return Number(value);
}
function absolute(path,name){
  if(typeof path!=='string'||resolve(path)!==path||path==='/')
    throw fault('CONNECTED_CLI_PATH','Supply the absolute original '+name+' path.');
  return path;
}
async function originalJson(path){
  absolute(path,'JSON input');
  if(await realpath(path)!==path)throw fault('CONNECTED_CLI_SOURCE_LINK','Select the original regular JSON file.');
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await handle.stat({bigint:true}),maximum=16*1024*1024;
    if(!before.isFile()||before.size>BigInt(maximum))
      throw fault('CONNECTED_CLI_SOURCE_LIMIT','The original JSON input exceeds16MiB.',413);
    const body=await handle.readFile(),after=await handle.stat({bigint:true});
    if(body.length>maximum||BigInt(body.length)!==before.size||before.size!==after.size||
      before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs)
      throw fault('CONNECTED_CLI_SOURCE_CHANGED','The original JSON input changed during reading.',409);
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}
    catch{throw fault('CONNECTED_CLI_JSON','The original input must contain complete UTF-8 JSON.');}
  }finally{await handle.close();}
}
export async function main(args=process.argv.slice(2),{stdout=process.stdout,stderr=process.stderr}={}){
  const {command,options}=parse(args),emit=value=>stdout.write(JSON.stringify(value)+'\n');
  if(command==='help'){stdout.write(HELP);return;}
  if(command==='operations'){const value=describeConnectedDeskOperations();emit(value);return value;}
  const connectionOptions={
    connectionFile:absolute(required(options,'connection'),'connection'),
    ...(options.requests?{journalDirectory:absolute(options.requests,'request journal')}:{}),
    ...(options['timeout-ms']?{timeoutMs:integer(options['timeout-ms'],'timeout-ms',{minimum:1000,maximum:900000})}:{}),
    ...(options['expected-workspace-id']?{expectedWorkspaceId:options['expected-workspace-id']}:{}),
    ...(options['expected-marker-sha256']?{expectedMarkerSha256:options['expected-marker-sha256']}:{}),
  };
  if(command==='pending'){const result=await inspectConnectedPending(connectionOptions);emit(result);return result;}
  const client=await openConnectedCiimDesk(connectionOptions);
  try{
    let result;
    if(command==='connection')result=await client.connection();
    else if(command==='status')result=await client.state();
    else if(command==='describe')result=await client.describe();
    else if(command==='recover')result=await client.recover();
    else if(command==='list'){
      const query={view:required(options,'view')};
      if(options.edition)query.editionId=options.edition;
      if(options.comparison)query.comparisonId=options.comparison;
      if(options.offset!==undefined)query.offset=integer(options.offset,'offset');
      if(options.limit!==undefined)query.limit=integer(options.limit,'limit',{minimum:1,maximum:LIMITS.pageSize});
      if(options.status!==undefined)query.status=options.status;
      if(options.query!==undefined)query.query=options.query;
      result=await client.view(query);
    }else if(command==='record')
      result=await client.record({editionId:required(options,'edition'),recordId:required(options,'record')});
    else if(command==='import'){
      const archiveFile=absolute(required(options,'file'),'archive');
      result=await client.prepareImport({archiveFile,filename:options.filename??basename(archiveFile),
        ...(options.sha256?{sha256:options.sha256}:{}),
        ...(options.bytes?{bytes:integer(options.bytes,'bytes',{minimum:1,maximum:LIMITS.archiveBytes})}:{})});
    }else if(command==='act')result=await client.act(await originalJson(required(options,'request')));
    else if(command==='call')result=await executeConnectedDeskOperation(client,await originalJson(required(options,'file')));
    else if(command==='export'){
      const kind=required(options,'kind'),out=absolute(required(options,'out'),'output');
      if(kind==='workspace'){
        if(options.handback)throw fault('CONNECTED_CLI_ARGUMENTS','Select a handback only for a handback export.');
        result=await client.exportWorkspace({out});
      }else if(kind==='handback')result=await client.exportHandback({out,handbackId:required(options,'handback')});
      else throw fault('CONNECTED_CLI_EXPORT','Choose workspace or handback.');
    }else if(command==='attachment')result=await client.attachment({
      editionId:required(options,'edition'),kind:required(options,'kind'),out:absolute(required(options,'out'),'output'),
      ...(options.id?{id:options.id}:{}),
    });
    else if(command==='guide')result=await client.guide({out:absolute(required(options,'out'),'guide output'),
      ...(options.sha256?{sha256:options.sha256}:{})});
    emit(result);return result;
  }finally{await client.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({error:{code:error.code??'CONNECTED_CLI_ERROR',message:error.message,
      status:error.status??500,details:error.details??{}}})+'\n');
    process.exitCode=1;
  });
}
