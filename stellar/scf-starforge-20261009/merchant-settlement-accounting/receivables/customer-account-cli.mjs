#!/usr/bin/env node
// MIT. Complete customer-account operation under the existing accounting workspace lease.
import {constants} from 'node:fs';
import {open,lstat,link,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openAccountingWorkspace} from '../workspace/store.mjs';
import {ReceivablesWorkspace} from './store.mjs';
import {json,sha} from './core.mjs';

const HELP='Customer account and response operations\n\n'+
  'customer-account COMMAND --directory EXISTING_ACCOUNT [--input REQUEST.json] [--id UUID] [--name FILE] [--out NEW_FILE] [--actor OPERATOR]\n\n'+
  'Commands: list, publication-preview, publish, response-preview, receive, response,\n'+
  'decision-preview, decide, account-file, response-file, operation.\n'+
  'Durable workflow: prepare-publication, prepare-receive, prepare-decision (--actor and --out),\n'+
  'then execute or recover --input SAVED_OPERATION.json.\n\n'+
  'Prepare complete JSON requests from the matching preview. Retain workspaceId, revision,\n'+
  'reviewSha256, actor and original requestId for publish, receive and decide. Repeat the\n'+
  'same request after an interrupted reply; operation --id REQUEST_ID reads its original journal.\n'+
  'File commands require --out and retain complete original bytes. Output files are create-only.\n';
async function inputFile(path){
  const fd=await open(resolve(path),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{const stat=await fd.stat();if(!stat.isFile()||stat.size>8_000_000)throw Error('Use one complete JSON request up to8 MB.');
    const value=JSON.parse(await fd.readFile('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Use one JSON request object.');return value;}
  finally{await fd.close();}
}
async function outputFile(path,bytes){
  const target=resolve(path),directory=dirname(target),parent=await lstat(directory);
  if(!parent.isDirectory()||parent.isSymbolicLink())throw Error('Use an existing private output directory.');
  async function existing(){
    let fd;try{fd=await open(target,constants.O_RDONLY|(constants.O_NOFOLLOW??0));}
    catch(error){if(error.code==='ENOENT')return false;throw error;}
    try{const stat=await fd.stat();if(!stat.isFile()||stat.size!==bytes.length)throw Error('The selected output path already contains a different file.');
      const original=await fd.readFile();if(!original.equals(bytes))throw Error('The selected output path already contains different bytes.');await fd.sync();return true;}
    finally{await fd.close();}
  }
  let replayed=await existing();
  if(!replayed){
    const temporary=join(directory,'.customer-account-output-'+randomUUID()+'.tmp');
    const fd=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
    try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}
    try{await link(temporary,target);}catch(error){if(error.code!=='EEXIST'||!await existing())throw error;replayed=true;}
    await unlink(temporary);
  }
  const handle=await open(directory,constants.O_RDONLY|(constants.O_DIRECTORY??0)|(constants.O_NOFOLLOW??0));
  try{await handle.sync();}finally{await handle.close();}
  return{path:target,bytes:bytes.length,replayed};
}
export async function runCustomerAccountCli(argv=process.argv.slice(2)){
  if(!argv.length||['help','--help','-h'].includes(argv[0])){process.stdout.write(HELP);return;}
  const [command,...rest]=argv,options={};
  for(let i=0;i<rest.length;i+=2){const key=rest[i],value=rest[i+1];
    if(!['--directory','--input','--id','--name','--out','--actor'].includes(key)||!value||Object.hasOwn(options,key))throw Error(HELP);options[key]=value;}
  if(!options['--directory'])throw Error('Choose the original existing --directory.');
  const args=options['--input']?await inputFile(options['--input']):{};
  const workspace=await openAccountingWorkspace({directory:resolve(options['--directory'])});
  try{
    const receivables=await new ReceivablesWorkspace(workspace).init(),desk=receivables.customerAccountResponseWorkspace;
    let result;
    if(command.startsWith('prepare-')){
      const target={'prepare-publication':'publish','prepare-receive':'receive','prepare-decision':'decide'}[command];
      if(!target||!options['--actor']||!options['--out'])throw Error('Preparation needs its selected command, --actor and a new --out file.');
      const input={...args};for(const key of ['workspaceId','revision','actor','requestId','reviewSha256'])delete input[key];
      if(target==='publish')input.publicationId??=randomUUID();
      const preview=target==='publish'?await desk.previewPublication(input):target==='receive'?await desk.previewReceive(input):await desk.previewDecision(options['--id'],input);
      const request={...input,workspaceId:preview.workspaceId,revision:preview.revision,reviewSha256:preview.reviewSha256,
        actor:options['--actor'],requestId:randomUUID()};
      result={schema:'stellar-forge.merchant-customer-account-operation.v1',command:target,
        ...(target==='decide'?{id:options['--id']}:{}),request,requestSha256:sha(json(request)),review:preview};
    }else if(command==='execute'||command==='recover'){
      if(args.schema!=='stellar-forge.merchant-customer-account-operation.v1'||!['publish','receive','decide'].includes(args.command)||
        !args.request||sha(json(args.request))!==args.requestSha256||args.review?.reviewSha256!==args.request.reviewSha256||
        args.review?.workspaceId!==args.request.workspaceId||args.review?.revision!==args.request.revision)
        throw Error('Use the complete original prepared operation with its unchanged request and review.');
      if(args.command==='decide'&&args.review.responseId!==args.id)throw Error('The prepared response identifier changed.');
      if(command==='execute')result=args.command==='publish'?await desk.publish(args.request):args.command==='receive'?await desk.receive(args.request):await desk.decide(args.id,args.request);
      else{
        desk.guard(args.request);result=await desk.operation(args.request.requestId);
        if(result.operation){
          const action={publish:'customer_account_published',receive:'customer_account_response_received',decide:'customer_account_response_reviewed'}[args.command];
          const intent={...args.request,...(args.command==='decide'?{customerResponseId:args.id}:{})};delete intent.revision;
          if(result.operation.action!==action||result.operation.intentSha256!==sha(json({action,value:intent})))
            throw Error('The original request identifier belongs to a different saved operation.');
        }
      }
    }else if(command==='list')result=await desk.list(args);
    else if(command==='publication-preview')result=await desk.previewPublication(args);
    else if(command==='publish')result=await desk.publish(args);
    else if(command==='response-preview')result=await desk.previewReceive(args);
    else if(command==='receive')result=await desk.receive(args);
    else if(command==='response')result=await desk.detail(options['--id']);
    else if(command==='decision-preview')result=await desk.previewDecision(options['--id'],args);
    else if(command==='decide')result=await desk.decide(options['--id'],args);
    else if(command==='operation')result=await desk.operation(options['--id']);
    else if(command==='account-file'||command==='response-file'){
      if(!options['--out']||!options['--name'])throw Error('Choose --name and a new --out file.');
      const file=command==='account-file'?await desk.publicationFile(options['--id'],options['--name']):await desk.responseFile(options['--id'],options['--name']);
      result={...await outputFile(options['--out'],file.bytes),name:file.name,type:file.type};
      process.stdout.write(JSON.stringify(result)+'\n');return result;
    }else throw Error(HELP);
    const bytes=Buffer.from(JSON.stringify(result,null,2)+'\n');
    if(options['--out']){const saved=await outputFile(options['--out'],bytes);process.stdout.write(JSON.stringify(saved)+'\n');}
    else process.stdout.write(bytes);
    return result;
  }finally{await workspace.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runCustomerAccountCli().catch(error=>{process.stderr.write(JSON.stringify({error:{code:error.code||'CUSTOMER_ACCOUNT_FAILED',message:error.message,
    ...(error.details?{details:error.details}:{})}})+'\n');process.exitCode=1;});
}
