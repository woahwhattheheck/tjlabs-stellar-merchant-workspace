#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openA2AWorkspace } from './workspace.mjs';
import { startA2AWorkspaceServer } from './server.mjs';
import { materializeA2APublication, startA2AMerchant } from './merchant.mjs';
import { inspectResultPacket } from './portable.mjs';
import { readA2AConnections, reviewA2AInputs, requireA2ASelection } from './managed-launch.mjs';
import { LIMITS, canonical, fail, publicError, readVerifiedFile, atomicFile, sha } from './foundation.mjs';

import { commissioningTemplate } from './commissioning.mjs';

export const HELP=String.raw`A2A merchant task workspace — original SDK 1.3.0 / protocol 1.0

node cli.mjs workspace --workspace PRIVATE --connections HOST_JSON [--port 0]
node cli.mjs list      --workspace PRIVATE [--connections HOST_JSON]
node cli.mjs show      --workspace PRIVATE --id PROJECT [--revision N]
node cli.mjs request   --workspace PRIVATE --request-id ORIGINAL
node cli.mjs action    --workspace PRIVATE --connections HOST_JSON --input ACTION_JSON
node cli.mjs export    --workspace PRIVATE --id PROJECT --out NEW_FILE [--revision N | --handoff ID]
node cli.mjs receive   --workspace PRIVATE --input PACKET --request-id ORIGINAL
node cli.mjs result    --workspace PRIVATE --id PROJECT --edition ID --out NEW_FILE
node cli.mjs inspect-result --input ORIGINAL_PAID_FILE [--out NEW_REPORT]
node cli.mjs source    --workspace PRIVATE --id PROJECT --sha256 SHA --out NEW_FILE [--revision N]
node cli.mjs publication --workspace PRIVATE --id PROJECT --publication ID [--out NEW_DIRECTORY]
node cli.mjs merchant  --workspace PRIVATE --id PROJECT --publication ID [--port 0] [--facilitator HTTPS_URL]
node cli.mjs release-stage --workspace PRIVATE --id PROJECT --publication ID --releases STORE --release ID [--runtime JSON]
node cli.mjs release-list|release-status --releases STORE
node cli.mjs release-activate --releases STORE --release ID --generation N --note TEXT
node cli.mjs release-rollback --releases STORE --generation N --note TEXT
node cli.mjs release-run --releases STORE --generation N
node cli.mjs connections --connections HOST_JSON
node cli.mjs commission-template --out NEW_JSON
node cli.mjs commissioning --workspace PRIVATE --id PROJECT [--revision N] [--out NEW_JSON]
node cli.mjs commission-source --workspace PRIVATE --id PROJECT --revision N --request-id ORIGINAL --input FILE --role ROLE --note TEXT [--media-type TYPE]

An ACTION_JSON is {action:"...",payload:{requestId:"...",id:"...",expectedRevision:N,...}}.
Create omits id/expectedRevision. Every remote message keeps one original attempt.
Unknown sends are observed/adopted; replaying a local request never repeats its send.
Source, packet and result writes require a new file or the exact already saved bytes.
Use --private only with source --out for explicitly selected local private source custody.
Payment verification and settlement stay in the original SF30/SF82 native seller.
`;
const VALUES=new Set(['--workspace','--connections','--port','--id','--revision','--request-id','--input','--out','--handoff','--edition','--sha256','--publication','--facilitator','--releases','--release','--runtime','--generation','--note','--operator','--expected-workspace-identity','--expected-connections-sha256','--role','--media-type']);
const FLAGS=new Set(['--allow-local-facilitator','--private','--help']);
function parse(argv){const result={verb:argv[0]??'help',values:{},flags:new Set()};for(let i=1;i<argv.length;i++){const key=argv[i];if(result.flags.has(key)||Object.hasOwn(result.values,key))fail('DUPLICATE_OPTION',key);if(FLAGS.has(key)){result.flags.add(key);continue;}if(!VALUES.has(key)||i+1===argv.length||argv[i+1].startsWith('--'))fail('CLI_OPTION','Unknown or incomplete option '+key);result.values[key]=argv[++i];}return result;}
function required(v,name){if(!v[name])fail('CLI_REQUIRED','Required option '+name);return v[name];}
function number(v,name,fallback=null){if(v[name]===undefined)return fallback;if(!/^\d+$/.test(v[name])||!Number.isSafeInteger(Number(v[name])))fail('CLI_NUMBER',name);return Number(v[name]);}
function readJSON(path,max=2*LIMITS.requestBytes){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readVerifiedFile(resolve(path),max)));}catch(error){if(error.code)throw error;fail('JSON_REQUIRED','Select a complete UTF-8 JSON file.');}}
function report(value,out){return out(canonical(value)+'\n');}
function written(result,path,out){atomicFile(resolve(path),result.bytes);return report({filename:resolve(path),mediaType:result.mediaType,sha256:result.sha256,bytes:result.bytes.length},out);}
function signals(owner,signal){let closed=false;const close=()=>{if(closed)return;closed=true;void owner.close().catch(()=>{process.exitCode=1;}).finally(()=>{process.removeListener('SIGINT',close);process.removeListener('SIGTERM',close);signal?.removeEventListener('abort',close);});};process.once('SIGINT',close);process.once('SIGTERM',close);signal?.addEventListener('abort',close,{once:true});if(signal?.aborted)close();return owner;}
export async function runA2ACli(argv=process.argv.slice(2),options={}){
  const out=options.stdout??(s=>process.stdout.write(s)),{verb,values:v,flags}=parse(argv);
  if(['help','--help'].includes(verb)||flags.has('--help')){out(HELP);return{help:true};}
  if(verb==='commission-template'){const result=commissioningTemplate();written(result,required(v,'--out'),out);return result;}
  if(verb==='connections'){const c=readA2AConnections(required(v,'--connections'));const review=reviewA2AInputs({directory:v['--workspace']??process.cwd(),connectionFile:c.filename,optional:true});report({schema:'stellar-forge.a2a-connections-inspection.v1',sha256:c.sha256,connections:review.connections},out);return review;}
  if(verb==='inspect-result'){const bytes=readVerifiedFile(required(v,'--input')),result=inspectResultPacket(bytes),body=Buffer.from(canonical(result));if(v['--out'])written({bytes:body,mediaType:'application/json',sha256:sha(body)},v['--out'],out);else report(result,out);return result;}
  if(verb.startsWith('release-')&&verb!=='release-stage'){
    const release=await import('../../sf82-seller-pilot/releases.mjs'),root=resolve(required(v,'--releases'));let result;
    if(verb==='release-list')result=await release.listReleases(root);
    else if(verb==='release-status')result=await release.releaseStatus(root);
    else if(verb==='release-activate')result=await release.activateRelease(root,required(v,'--release'),{expectedGeneration:Number(required(v,'--generation')),reason:required(v,'--note')});
    else if(verb==='release-rollback')result=await release.rollbackRelease(root,{expectedGeneration:Number(required(v,'--generation')),reason:required(v,'--note')});
    else if(verb==='release-run'){result=await release.runActiveRelease(root,{expectedGeneration:Number(required(v,'--generation')),handleSignals:true});report({url:result.url,mode:result.mode,release:result.release,observation:result.observation},out);return result;}
    else fail('CLI_VERB',verb);
    report(result,out);return result;
  }
  const directory=resolve(required(v,'--workspace')),connection=readA2AConnections(v['--connections'],{expectedSha256:v['--expected-connections-sha256']??null});
  const review=reviewA2AInputs({directory,connectionFile:connection.filename,optional:true});
  requireA2ASelection(review,{expectedWorkspaceIdentity:v['--expected-workspace-identity']??null,expectedConnectionsSha256:v['--expected-connections-sha256']??null});
  const workspace=await openA2AWorkspace({directory,connections:connection.connections,operator:v['--operator']??'Agent service operator'});
  let retained=false;
  try{
    if(['workspace','serve'].includes(verb)){
      const service=await startA2AWorkspaceServer({workspace,closeWorkspace:true,port:number(v,'--port',0),connectionFileSha256:connection.sha256,...(v['--facilitator']?{facilitator:v['--facilitator'],allowLocalFacilitator:flags.has('--allow-local-facilitator')}:{})});
      retained=true;signals(service,options.signal);report(service.startup,out);return service;
    }
    let result;
    if(verb==='list')result=workspace.list();
    else if(verb==='commissioning'){result=workspace.commissioningReport(required(v,'--id'),{revision:number(v,'--revision')});if(v['--out']){const bytes=Buffer.from(canonical(result)+'\n');written({bytes,mediaType:'application/json',sha256:sha(bytes)},v['--out'],out);return result;}}
    else if(verb==='commission-source'){const input=resolve(required(v,'--input')),bytes=readVerifiedFile(input,LIMITS.artifactBytes);result=await workspace.dispatch('commission_retain_source',{id:required(v,'--id'),expectedRevision:number(v,'--revision'),requestId:required(v,'--request-id'),contentBase64:bytes.toString('base64'),filename:input.split(/[\\/]/).at(-1),mediaType:v['--media-type']??'application/octet-stream',role:required(v,'--role'),note:required(v,'--note')});}
    else if(verb==='show')result=workspace.get(required(v,'--id'),{revision:number(v,'--revision')});
    else if(verb==='request')result=workspace.request(required(v,'--request-id'));
    else if(verb==='action'){const input=readJSON(required(v,'--input'));result=await workspace.dispatch(input.action,input.payload);}
    else if(verb==='receive')result=workspace.receivePacket(readVerifiedFile(required(v,'--input')),{requestId:required(v,'--request-id')});
    else if(verb==='export'){if(v['--handoff']&&v['--revision'])fail('ONE_EXPORT_SELECTION');result=workspace.exportPacket(required(v,'--id'),{revision:number(v,'--revision'),handoffId:v['--handoff']??null});written(result,required(v,'--out'),out);return result;}
    else if(verb==='result'){result=workspace.exportResult(required(v,'--id'),required(v,'--edition'));written(result,required(v,'--out'),out);return result;}
    else if(verb==='source'){result=workspace.readSource(required(v,'--id'),required(v,'--sha256'),{revision:number(v,'--revision'),includePrivate:flags.has('--private')});written(result,required(v,'--out'),out);return result;}
    else if(verb==='publication')result=materializeA2APublication(workspace,{id:required(v,'--id'),publicationId:required(v,'--publication'),directory:v['--out']?resolve(v['--out']):null});
    else if(verb==='merchant'){
      const merchant=await startA2AMerchant(workspace,{id:required(v,'--id'),publicationId:required(v,'--publication'),port:number(v,'--port',0),facilitator:v['--facilitator'],allowLocalFacilitator:flags.has('--allow-local-facilitator')});
      let closing;const owner={...merchant,close:()=>closing??=(async()=>{await merchant.close();await workspace.close();})()};retained=true;signals(owner,options.signal);report({url:merchant.url,mode:merchant.mode,publication:merchant.publication},out);return owner;
    }
    else if(verb==='release-stage'){
      const {stageA2APublication}=await import('./sf82.mjs');result=await stageA2APublication(workspace,{id:required(v,'--id'),publicationId:required(v,'--publication'),releases:resolve(required(v,'--releases')),releaseId:required(v,'--release'),runtime:v['--runtime']?readJSON(v['--runtime']):{port:0}});
    }else fail('CLI_VERB','Unknown command '+verb);
    report(result,out);return result;
  }finally{if(!retained)await workspace.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runA2ACli().catch(error=>{process.stderr.write(canonical({error:publicError(error)})+'\n');process.exitCode=1;});
