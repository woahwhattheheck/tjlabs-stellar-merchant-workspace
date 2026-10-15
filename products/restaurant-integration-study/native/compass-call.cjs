#!/usr/bin/env node
'use strict';
// MIT. Actual API execution stays in the owner's Linux environment.
const path=require('node:path'),fs=require('node:fs/promises');
const Store=require('./compass-journal.cjs'),Engine=require('../compass-client.cjs'),Contract=require('../compass-contract.cjs'),Text=require('../text.cjs');
const HELP=[
'Compass native runner — Linux Node20+ and util-linux flock',
'',
'run --journal DIR --request ORIGINAL.json [--out RECEIPT.json]',
'inspect --journal DIR --id OPERATION [--out RECEIPT.json]',
'export --journal DIR --out COMPLETE.json [--id OPERATION]',
'prepare-decision --journal DIR --upstream OPERATION --compass-id ID --profile PROFILE.json --profile-id ID --id NEW_OPERATION --selected-by NAME --mode fast|rich --out REQUEST.json [--selected-at ISO]',
'',
'COMPASS_API_KEY is read only from the environment. Metadata needs no key.',
'Every output path must be new. Existing exact operations return their retained result.',
'Export includes complete original files and incomplete/unselected artifacts.',
'An ambiguous dispatched request is retained and is never silently replayed.'
].join('\n');
const ALLOWED={
run:['journal','request','out'],inspect:['journal','id','out'],export:['journal','out','id'],
'prepare-decision':['journal','upstream','compass-id','profile','profile-id','id','selected-by','selected-at','mode','out']
};
function parse(argv){
 if(argv.length===0||argv.length===1&&['help','--help','-h'].includes(argv[0]))return{command:'help',args:{}};
 const [command,...rest]=argv;if(!Object.hasOwn(ALLOWED,command))throw Store.fail('CLI_COMMAND','Choose run, inspect, export or prepare-decision.');
 const args={};for(let i=0;i<rest.length;i+=2){const flag=rest[i],value=rest[i+1];if(!flag?.startsWith('--')||!ALLOWED[command].includes(flag.slice(2))||value===undefined||value.startsWith('--')||Object.hasOwn(args,flag.slice(2)))throw Store.fail('CLI_ARGUMENT','Use each declared option once, with a value.');args[flag.slice(2)]=value;}
 const required={run:['journal','request'],inspect:['journal','id'],export:['journal','out'],'prepare-decision':['journal','upstream','compass-id','profile','profile-id','id','selected-by','mode','out']}[command];
 for(const key of required)if(!args[key]?.trim())throw Store.fail('CLI_ARGUMENT','Missing --'+key+'.');
 if(args.id)Store.operationId(args.id);if(args.upstream)Store.operationId(args.upstream);
 return{command,args};
}
async function outputAvailable(filename){if(!filename)return;try{await fs.lstat(path.resolve(filename));throw Store.fail('OUTPUT_EXISTS','Output already exists; choose a new path.');}catch(e){if(e.code!=='ENOENT')throw e;}const p=await fs.stat(path.dirname(path.resolve(filename)));if(!p.isDirectory())throw Store.fail('OUTPUT_DIRECTORY','Output parent must be a directory.');}
async function originalJSON(filename){const r=await Store.exactRead(path.resolve(filename));let value;try{value=Text.parse(Text.decode(r.bytes));}catch{throw Store.fail('INPUT_JSON','Input must be complete UTF-8 JSON.');}return{...r,value};}
const json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
function runExitCode(state){return ['received','revalidated'].includes(state)?0:state==='http_error'?2:state==='ambiguous_dispatch'?3:state==='prepared'?4:state==='incomplete_response'?5:6;}
function summary(packet){return{schema:'compass.native-summary/v1',operation_id:packet.operation.id,endpoint:packet.operation.endpoint,state:packet.state,operation_sha256:packet.operation_sha256,events:packet.events.length,attempts:packet.attempts.map(a=>({attempt:a.attempt,state:a.state,status:a.response?.status??a.response_headers?.status??null,outcome:a.response?.outcome||null,response_sha256:a.response?.sha256||null})),journal_sha256:packet.events.at(-1)?.sha256||null};}
async function main(argv=process.argv.slice(2),services={}){
 const {command,args}=parse(argv),print=services.print||((v)=>process.stdout.write(typeof v==='string'?v+'\n':JSON.stringify(v,null,2)+'\n'));
 if(command==='help'){print(HELP);return{help:true};}
 const major=Number(process.versions.node.split('.')[0]);if(major<20)throw Store.fail('NATIVE_RUNTIME','Use Node20 or later.');
 await outputAvailable(args.out);
 const journal=await Store.openJournal(args.journal,{create:command==='run'});
 if(command==='run'){
  const input=await originalJSON(args.request),prepared=Contract.validateOperation(input.value);
  const result=await journal.withOperation(input.value.id,async()=>{
   await journal.bindOperation(input.value.id,input.value);await journal.retainInput(input.value.id,input.bytes,'request');
   const prior=await journal.load(input.value.id);
   if(prior.length){const retained=Engine.receipt(prior);if(retained.operation_sha256!==prepared.operation_sha256)throw Store.fail('OPERATION_CHANGED','This operation ID already belongs to different input.');return retained;}
   return Engine.run(input.value,{io:{load:journal.load,append:journal.append},fetch:services.fetch||globalThis.fetch,apiKey:services.apiKey??process.env.COMPASS_API_KEY??'',...(services.engine||{})});
  },{create:true});
  const output=args.out?await Store.writeOutput(args.out,json(result)):null;const s={...summary(result),exit_code:runExitCode(result.state),output};print(s);return{packet:result,summary:s};
 }
 if(command==='inspect'){
  const snap=await journal.snapshot(args.id),result=snap.journal||{schema:'compass.native-inspection/v1',operation_id:args.id,state:snap.diagnostic?'journal_invalid':'prepared_without_dispatch',diagnostic:snap.diagnostic,artifacts:snap.artifacts.map(x=>({path:x.path,bytes:x.bytes,sha256:x.sha256,selection:x.selection}))};
  const output=args.out?await Store.writeOutput(args.out,json(result)):null;
  const s=snap.journal?summary(snap.journal):result;print({...s,output,retained_artifacts:snap.artifacts.length});return{packet:result,snapshot:snap,output};
 }
 if(command==='export'){
  const complete=await journal.exportAll(args.id?[args.id]:null),output=await Store.writeOutput(args.out,json(complete));print({schema:complete.schema,operations:complete.operations.length,artifact_bytes:complete.artifact_bytes,output});return{complete,output};
 }
 const profile=await originalJSON(args.profile);Contract.profile(profile.value,true);
 if(!['fast','rich'].includes(args.mode))throw Store.fail('MODE','Choose fast or rich.');
 let upstream,operation;
 await journal.withOperation(args.upstream,async()=>{
  const events=await journal.load(args.upstream);upstream=Engine.receipt(events);
  operation=Engine.prepareDecision({upstream,compass_id:args['compass-id'],user_profile:profile.value,id:args.id,selected_by:args['selected-by'],selected_at:args['selected-at']||new Date().toISOString(),mode:args.mode});
 });
 operation.profile_id=args['profile-id'];Contract.validateOperation(operation);
 await journal.withOperation(operation.id,async()=>{
  await journal.bindOperation(operation.id,operation);await journal.retainInput(operation.id,profile.bytes,'profile');await journal.retainInput(operation.id,json(upstream),'upstream');await journal.retainInput(operation.id,json(operation),'request');
 },{create:true});
 const output=await Store.writeOutput(args.out,json(operation));print({schema:operation.schema,operation_id:operation.id,endpoint:operation.endpoint,selected_compass_id:operation.identity_binding.compass_id,profile_id:operation.profile_id,upstream_operation:operation.identity_binding.operation_id,output});return{operation,output};
}
function safeError(e){let message=String(e?.message||'Native operation failed');const key=process.env.COMPASS_API_KEY;if(key)message=message.split(key).join('[credential removed]');message=message.replace(/cmp_(?:test|live|int)_[A-Za-z0-9_-]{8,}/g,'[credential removed]');return{schema:'compass.native-error/v1',code:e?.code||'NATIVE_ERROR',message};}
if(require.main===module)main().then(r=>{if(r.summary)process.exitCode=r.summary.exit_code;}).catch(e=>{process.stderr.write(JSON.stringify(safeError(e))+'\n');process.exitCode=e?.code==='JOURNAL_BUSY'?73:1;});
module.exports={HELP,parse,runExitCode,summary,safeError,main,originalJSON,outputAvailable};
