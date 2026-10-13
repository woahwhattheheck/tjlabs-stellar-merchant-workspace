#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Complete original Event mapping capture, offline working source and native review receiving.
import {pathToFileURL} from 'node:url';
import {
 prepareNativeAnalysisEventMappingWorking,
 downloadNativeAnalysisEventMappingWorking,
 reopenNativeAnalysisEventMappingWorking,
 prepareNativeAnalysisEventMappingReview,
 reviewNativeAnalysisEventMappingWorking,
 receiveNativeAnalysisEventMappingReview,
 reopenNativeAnalysisEventMappingReview
} from '../../../../stellar-forge/mcp-paid-agent/native-analysis-events-mapping.mjs';

const COMMON=['--workspace','--workspace-id','--programme','--input','--dir'];
const NETWORK=['--url','--token-env','--timeout-ms'];
const CAPTURE=['--comparison','--draft'];
const REVIEW=['--capture-dir','--working','--action','--operation'];
const COMMANDS={
 'capture-prepare':{flags:[...COMMON,...CAPTURE],run:prepareNativeAnalysisEventMappingWorking},
 capture:{flags:[...COMMON,...CAPTURE,...NETWORK],run:downloadNativeAnalysisEventMappingWorking,network:true},
 'capture-reopen':{flags:COMMON,run:reopenNativeAnalysisEventMappingWorking},
 'review-prepare':{flags:[...COMMON,...REVIEW],run:prepareNativeAnalysisEventMappingReview,review:true},
 review:{flags:[...COMMON,...REVIEW,'--resume',...NETWORK],run:reviewNativeAnalysisEventMappingWorking,network:true,review:true},
 'review-receive':{flags:[...COMMON,'--action','--operation',...NETWORK],run:receiveNativeAnalysisEventMappingReview,network:true,review:true},
 'review-reopen':{flags:[...COMMON,'--action','--operation','--record-sha256'],run:reopenNativeAnalysisEventMappingReview,review:true}
};
const NAMES={
 '--workspace':'analysisWorkspace','--workspace-id':'expectedWorkspaceId','--programme':'programme',
 '--input':'inputId','--dir':'directory','--url':'url','--token-env':'tokenEnv',
 '--comparison':'comparisonPath','--draft':'draftPath','--capture-dir':'captureDirectory',
 '--working':'workingPath','--action':'actionId','--operation':'operationId',
 '--record-sha256':'recordSha256'
};
export const EVENT_MAPPING_RECEIVING_HELP=`Original Event mapping source and review receiving.

Every command selects the original named Analysis workspace and actual native IDs:
  --workspace ALIAS --workspace-id ID --programme NAME --input ID --dir PRIVATE_DIRECTORY

Commands:
  capture-prepare [--comparison COMPLETE_COMPARISON_JSON] [--draft COMPLETE_DRAFT_JSON]
  capture [--comparison COMPLETE_COMPARISON_JSON] [--draft COMPLETE_DRAFT_JSON]
          --url ORIGINAL_MCP_URL [--token-env ENVIRONMENT_VARIABLE] [--timeout-ms POSITIVE_INTEGER]
  capture-reopen

  review-prepare --action ID --operation ID
                 [--capture-dir ORIGINAL_CAPTURE_DIRECTORY] [--working COMPLETE_WORKING_JSON]
  review --action ID --operation ID
         [--capture-dir ORIGINAL_CAPTURE_DIRECTORY] [--working COMPLETE_WORKING_JSON]
         --url ORIGINAL_MCP_URL [--token-env ENVIRONMENT_VARIABLE] [--timeout-ms POSITIVE_INTEGER]
         [--resume true|false]
  review-receive --action ID --operation ID
                 --url ORIGINAL_MCP_URL [--token-env ENVIRONMENT_VARIABLE] [--timeout-ms POSITIVE_INTEGER]
  review-reopen --action ID --operation ID [--record-sha256 SHA256]

First capture preparation needs the complete comparison file. Its optional full draft is retained with it.
First review preparation needs its complete capture directory and selected whole working file.
After preparation, resume the SAME directory/IDs; original external files may be omitted.
Preserve prior comparison, capture and review directories. A later source/review is a separately selected edition.
Use review-receive to observe an uncertain native response and review-reopen to verify retained complete receiving offline.
Use --resume true only for the selected original action after inspecting its actual saved state.
The supplied endpoint is the original configured MCP service; ALIAS selects its registered Analysis workspace.
Credentials stay in the selected environment variable. Never put tokens in command arguments or retained source files.
SIGINT/SIGTERM stop subsequent receiving actions through the original helper. Preserve the partial directory.
A requested download or prepared review is not native acceptance; inspect the exact returned state and retained files.
`;
function failure(code){const error=new Error(code);error.code=code;return error;}
function need(condition,code){if(!condition)throw failure(code);}
export function parseEventMappingReceivingArguments(argv){
 need(Array.isArray(argv)&&argv.every(x=>typeof x==='string'),'MCP_ANALYSIS_EVENT_MAPPING_ARGUMENTS_INVALID');
 const [command,...rest]=argv,selected=Object.hasOwn(COMMANDS,command)?COMMANDS[command]:null;
 need(selected&&rest.length%2===0,'MCP_ANALYSIS_EVENT_MAPPING_ARGUMENTS_INVALID');
 const flags={},options={};
 for(let i=0;i<rest.length;i+=2){
  const name=rest[i],value=rest[i+1];
  need(selected.flags.includes(name)&&!Object.hasOwn(flags,name)&&value.length>0&&!value.includes('\0')&&!value.startsWith('--'),
   'MCP_ANALYSIS_EVENT_MAPPING_ARGUMENTS_INVALID');
  flags[name]=value;
  if(name==='--resume'){
   need(value==='true'||value==='false','MCP_ANALYSIS_EVENT_MAPPING_RESUME_INVALID');options.resume=value==='true';
  }else if(name==='--timeout-ms'){
   need(/^[1-9][0-9]*$/.test(value)&&Number.isSafeInteger(Number(value)),'MCP_ANALYSIS_EVENT_MAPPING_TIMEOUT_INVALID');
   options.timeoutMs=Number(value);
  }else options[NAMES[name]]=value;
 }
 need(COMMON.every(name=>Object.hasOwn(flags,name)),'MCP_ANALYSIS_EVENT_MAPPING_SELECTION_REQUIRED');
 if(selected.review)need(options.actionId&&options.operationId,'MCP_ANALYSIS_EVENT_MAPPING_REVIEW_IDENTITY_REQUIRED');
 if(options.recordSha256!==undefined)need(/^[a-f0-9]{64}$/.test(options.recordSha256),'MCP_ANALYSIS_EVENT_MAPPING_RECORD_HASH_INVALID');
 return {command,options,network:!!selected.network};
}
/** Embedded callers may pass their original client/environment/signal without another connection owner. */
export async function runEventMappingReceiving(argv,{client,environment,signal}={}){
 const selected=parseEventMappingReceivingArguments(argv),options={...selected.options};
 need(!client||selected.network,'MCP_ANALYSIS_EVENT_MAPPING_OFFLINE_CLIENT_INVALID');
 if(client!==undefined){
  need(options.url===undefined,'MCP_ANALYSIS_EVENT_MAPPING_CLIENT_URL_CONFLICT');options.client=client;
 }
 if(environment!==undefined)options.environment=environment;
 if(signal!==undefined)options.signal=signal;
 signal?.throwIfAborted();
 return COMMANDS[selected.command].run(options);
}
function errorCode(error,aborted){
 if(aborted)return 'MCP_ANALYSIS_EVENT_MAPPING_INTERRUPTED';
 if(['ENOSPC','EDQUOT'].includes(error?.code))return 'MCP_ANALYSIS_EVENT_MAPPING_STORAGE_FULL';
 if(/^[A-Z0-9_]{1,200}$/.test(error?.code??''))return error.code;
 if(/^[A-Z0-9_]{1,200}$/.test(error?.message??''))return error.message;
 return 'MCP_ANALYSIS_EVENT_MAPPING_RECEIVING_FAILED';
}
export async function main(argv=process.argv.slice(2),{signal,environment,client}={}){
 if(argv.length===1&&argv[0]==='--help'){process.stdout.write(EVENT_MAPPING_RECEIVING_HELP);return 0;}
 const controller=new AbortController();
 const stop=()=>controller.abort(),parentStop=()=>controller.abort(signal.reason);
 if(signal?.aborted)parentStop();else signal?.addEventListener('abort',parentStop,{once:true});
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  const result=await runEventMappingReceiving(argv,{signal:controller.signal,environment,client});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');return 0;
 }catch(error){
  process.stderr.write(errorCode(error,controller.signal.aborted)+'\n');return 1;
 }finally{
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  signal?.removeEventListener('abort',parentStop);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main();
