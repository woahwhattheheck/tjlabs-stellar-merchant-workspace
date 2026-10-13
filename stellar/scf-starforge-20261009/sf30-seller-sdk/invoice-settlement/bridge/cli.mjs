#!/usr/bin/env node
// MIT. Whole original Bridge intake/review/export operation; no hidden request IDs.
import {promises as fs,constants as C} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {openBridgeOperator,loadInvoiceSettlementConfiguration} from './operator.mjs';
import {readInvoicePrivateJSON} from '../operator.mjs';
import {files} from '../common.mjs';
function need(ok,message){if(!ok)throw new Error(message);}
function parse(argv) {
  const command=argv.shift();need(['invoke','methods','download'].includes(command),'Use invoke|methods|download followed by the original workspace/source options.');
  const options={};
  while(argv.length){const key=argv.shift();need(/^--[a-z-]+$/.test(key)&&argv.length&&!argv[0].startsWith('--')&&!Object.hasOwn(options,key),'Use each named option once with its value.');options[key]=argv.shift();}
  const allowed=['--workspace','--bridge','--selection','--connections','--profile','--expected-workspace-id','--input','--output','--source-id','--part'];
  for(const key of Object.keys(options))need(allowed.includes(key),'Unknown option '+key);
  need(options['--workspace']&&path.isAbsolute(options['--workspace']),'Select an absolute original workspace.');
  need(Boolean(options['--bridge'])!==Boolean(options['--selection']),'Select --bridge private configuration or --selection retained public identity.');
  for(const key of ['--workspace','--bridge','--selection','--connections','--profile','--input','--output'])
    if(options[key])need(path.isAbsolute(options[key])&&path.normalize(options[key])===options[key],'Use normalized absolute paths for '+key);
  return {command,options};
}
async function writeResult(filename,raw) {
  const directory=path.dirname(filename),name=path.basename(filename);
  const stat=await fs.lstat(directory);need(stat.isDirectory()&&!stat.isSymbolicLink()&&await fs.realpath(directory)===directory,'Use an existing nonsymlink output parent.');
  return files.writeNew(directory,name,raw);
}
export async function runBridgeCLI(argv) {
  const {command,options:o}=parse([...argv]);
  const original=await loadInvoiceSettlementConfiguration({workspaceDirectory:o['--workspace'],connectionsFile:o['--connections'],profileFile:o['--profile']});
  const sourcePath=o['--bridge']??o['--selection'],source=await readInvoicePrivateJSON(sourcePath);
  const realSource=await fs.realpath(sourcePath),realWorkspace=await fs.realpath(o['--workspace']).catch(e=>{if(e.code==='ENOENT')return o['--workspace'];throw e;});
  if(o['--bridge'])need(realSource!==realWorkspace&&!realSource.startsWith(realWorkspace+path.sep),'Keep API credentials outside the exported workspace.');
  let operator,first,result;const lifetime=new AbortController();
  const stop=signal=>{first??=new Error('Original Bridge command interrupted by '+signal);lifetime.abort(first);};
  const int=()=>stop('SIGINT'),term=()=>stop('SIGTERM'),streamError=e=>{first??=e;lifetime.abort(e);};
  process.on('SIGINT',int);process.on('SIGTERM',term);process.stdout.on('error',streamError);process.stderr.on('error',streamError);
  try {
    operator=await openBridgeOperator({workspaceDirectory:o['--workspace'],...original,
      expectedWorkspaceId:o['--expected-workspace-id'],signal:lifetime.signal,
      ...(o['--bridge']?{bridgeConfiguration:source}:{retainedSelection:source})});
    if(first)throw first;
    if(command==='methods')result={methods:operator.methods()};
    else if(command==='invoke') {
      need(o['--input'],'Supply --input with the retained exact {method,args} request.');
      const input=await readInvoicePrivateJSON(o['--input']);result=await operator.invoke(input);
    }else {
      need(o['--source-id']&&o['--output'],'Supply original --source-id and create-only --output.');
      let offset=0,descriptor=null;const parts=[];
      while(true){
        if(first)throw first;
        const row=await operator.invoke({method:'source.file',args:{sourceId:o['--source-id'],part:o['--part']??'body',offset,length:1024*1024}});
        const raw=Buffer.from(row.base64,'base64');
        need(raw.toString('base64')===row.base64&&row.offset===offset&&row.bytes===raw.length,'Original source range changed.');
        if(descriptor)need(JSON.stringify(descriptor)===JSON.stringify(row.file),'Original source descriptor changed.');else descriptor=row.file;
        need(descriptor.bytes<=64*1024*1024&&offset+raw.length<=descriptor.bytes,'Original complete source exceeds the download bound.');
        parts.push(raw);offset+=raw.length;
        if(row.eof){need(offset===descriptor.bytes,'Original source ended early.');break;}need(raw.length>0,'Original source range stalled.');
      }
      const body=Buffer.concat(parts,offset);need(createHash('sha256').update(body).digest('hex')===descriptor.sha256,'Original source hash changed.');
      await writeResult(o['--output'],body);result={sourceId:o['--source-id'],part:o['--part']??'body',path:o['--output'],bytes:body.length,sha256:descriptor.sha256};
    }
    if(o['--output']&&command!=='download')await writeResult(o['--output'],Buffer.from(JSON.stringify(result,null,2)+'\n'));
  }catch(error){first??=error;if(error.bridgeOperator)operator=error.bridgeOperator;}
  finally{
    if(operator){
      // Keep the same failed-close owner, including a failed startup owner.
      while(true){try{await operator.close();break;}catch(error){first??=error;await new Promise(resolve=>setTimeout(resolve,100));}}
    }
    try{
      const value=first?{error:{name:first.name,code:first.code??'BRIDGE_COMMAND_FAILED',message:first.message},...(result===undefined?{}:{acceptedResult:result})}:result;
      await new Promise((resolve,reject)=>process.stdout.write(JSON.stringify(value)+'\n',e=>e?reject(e):resolve()));
      await new Promise(resolve=>setImmediate(resolve));
    }catch(error){first??=error;}
    process.off('SIGINT',int);process.off('SIGTERM',term);process.stdout.off('error',streamError);process.stderr.off('error',streamError);
  }
  if(first)throw first;return result;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)
  runBridgeCLI(process.argv.slice(2)).catch(()=>{process.exitCode=1;});
