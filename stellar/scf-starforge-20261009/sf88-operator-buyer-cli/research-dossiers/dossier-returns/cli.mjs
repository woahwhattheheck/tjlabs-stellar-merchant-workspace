#!/usr/bin/env node
// MIT. Review and receive complete returned dossiers through the original listener.
import {parseArgs} from 'node:util';
import {basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
import {readResearchHostFile} from '../workspace-files.mjs';
import {writePortableFile} from '../portable.mjs';
import {need,parseJson,safeCode} from '../../node/store.mjs';

const JSON_INPUT_LIMIT=16*1024*1024;
const inputCommands=['returns-preview','returns-preview-choices','returns-review','returns-save-draft'];
const fields={
  'returns-source':['source-file','sha256','filename','content-type'],
  'returns-preview':['input','input-sha256'],
  'returns-list':['offset','limit'],
  'returns-inspect':['review','offset','limit'],
  'returns-request':['request'],
  'returns-value':['review','item','side','out','sha256'],
  'returns-preview-choices':['input','input-sha256'],
  'returns-review':['input','input-sha256'],
  'returns-save-draft':['input','input-sha256'],
  'returns-draft':['review'],
  'returns-export':['review','return','format','out','sha256'],
};
export const DOSSIER_RETURN_COMMANDS=Object.freeze(['returns-help',...Object.keys(fields)]);
export const DOSSIER_RETURN_USAGE=[
  'Review a returned Research dossier in the original workspace',
  '',
  'research-dossier-returns COMMAND --connection-file PRIVATE_CONNECTION',
  '  --directory ORIGINAL_STORE --id DOSSIER [OPTIONS]',
  'The same commands are available through research-client.',
  '',
  '  returns-source --source-file RETURNED.json.gz --sha256 ORIGINAL_SHA',
  '    [--filename ORIGINAL_NAME --content-type ORIGINAL_CONTENT_TYPE]',
  '  returns-preview --input SOURCE_AND_CURRENT_REVISION.json',
  '  returns-list [--offset 0 --limit 25]',
  '  returns-inspect --review REVIEW_ID [--offset 0 --limit 25]',
  '  returns-request --request ORIGINAL_REQUEST_ID',
  '  returns-value --review REVIEW_ID --item ITEM_ID --side base|current|returned --out FILE.json',
  '  returns-preview-choices --input COMPLETE_CHOICES.json',
  '  returns-review --input COMPLETE_REVIEWED_REQUEST.json',
  '  returns-save-draft --input FULL_VERSIONED_DRAFT.json',
  '  returns-draft --review REVIEW_ID',
  '  returns-export --review REVIEW_ID [--return RETURN_ID]',
  '    --format json|md|html|source --out FILE',
  '',
  'All working commands accept --result-file FILE for the complete native JSON result.',
  'JSON input commands accept --input-sha256 SHA to pin the full original request bytes.',
  'Downloads accept --sha256 SHA. --timeout-ms N selects the original client timeout.',
  'Output files are create-only. Existing identical result bytes are reused; a different',
  'saved result is preserved. Select a new result filename for a later read or retry.',
  '',
  'Keep the returned source, review ID, all branch hashes, comparison SHA and full draft.',
  'Read every review page and each needed full value. Preserve the supplied allowedChoices,',
  'treatment, choiceLabels and effect: retaining a typed proposal does not activate its',
  'native event history. Complete the original typed workflow when that proposal is adopted.',
  'Preview complete choices, then save the unchanged reviewed request with one requestId.',
  'After a lost reply, read returns-request and compare the full saved receipt before retry.',
  'A changed current revision requires a new explicit comparison and review; no command',
  'silently rebases choices or creates a replacement request.',
  '',
  'A review-only export is the immutable comparison. --return binds an actual saved return.',
  'The source export is the exact original upload. Full values use streamed JSON exports.',
  ''
].join('\n');

const chosen=value=>Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined));
const sha=value=>createHash('sha256').update(value).digest('hex');
async function writeOutput(output,text){
  if(typeof output?.once!=='function'){
    await output.write(text);return;
  }
  await new Promise((resolvePromise,reject)=>{
    let settled=false;
    const finish=error=>{
      if(settled)return;settled=true;
      // A Writable calls its failed write callback before emitting error.
      // Leave the one-shot listener attached to consume that same failure.
      if(!error)output.removeListener('error',onError);
      if(error)reject(error);else resolvePromise();
    };
    const onError=error=>finish(error);
    output.once('error',onError);
    try{output.write(text,error=>finish(error));}catch(error){output.removeListener('error',onError);finish(error);}
  });
}
async function publishResult(file,text){
  const body=Buffer.from(text),expectedSha256=sha(body);
  try{
    const receipt=await writePortableFile(file,{
      filename:basename(file),contentType:'application/json; charset=utf-8',body:[body]
    });
    need(receipt.bytes===body.length&&receipt.sha256===expectedSha256,'RETURN_CLI_RESULT_CHANGED');
    return {...receipt,reused:false};
  }catch(error){
    // The original writer may have published before a directory sync failed.
    // Reuse only the complete exact result at the selected output path.
    let retained;
    try{retained=await readResearchHostFile(file,body.length,{privateFile:true,sha256:expectedSha256});}
    catch(readError){
      if(readError.code!=='ENOENT')error.resultReadError=safeCode(readError.code,'RETURN_CLI_RESULT_READ_FAILED');
    }
    if(retained?.equals(body))
      return {file,filename:basename(file),contentType:'application/json; charset=utf-8',
        bytes:body.length,sha256:expectedSha256,reused:true};
    throw error;
  }
}
function completionIdentity(command,id,result,input){
  return chosen({
    returnOperation:command,dossierId:id,
    requestId:input?.requestId??result?.return?.requestId,
    reviewId:input?.reviewId??result?.reviewId??result?.return?.reviewId,
    sourceId:input?.sourceId??result?.source?.id??result?.return?.sourceId,
    comparisonSha256:input?.comparisonSha256??result?.comparisonSha256??result?.return?.comparisonSha256,
    returnId:result?.return?.id,revision:result?.return?.revision,
    revisionSha256:result?.return?.revisionSha256,draftVersion:result?.draftVersion,
    downloadedFile:result?.file,
  });
}
export function dossierReturnCliError(error){
  return {
    error:safeCode(error.code,'RETURN_COMMAND_FAILED'),
    ...(Number.isInteger(error.status)?{status:error.status}:{}),
    ...(error.details===undefined?{}:{details:error.details}),
    ...chosen({
      returnOperation:error.returnOperation,dossierId:error.dossierId,requestId:error.requestId,
      reviewId:error.reviewId,sourceId:error.sourceId,comparisonSha256:error.comparisonSha256,
      returnId:error.returnId,revision:error.revision,revisionSha256:error.revisionSha256,
      draftVersion:error.draftVersion,resultFile:error.resultFile,resultReadError:error.resultReadError,
      downloadedFile:error.downloadedFile,recovery:error.recovery,closeError:error.closeError
    }),
    ...(error.outcomeUnknown?{outcomeUnknown:true}:{}),
    ...(error.nativeResultAvailable?{nativeResultAvailable:true}:{}),
    ...(error.destinationPublished?{destinationPublished:true,file:error.file}:{}),
    ...(error.sourceCleanupFailed?{sourceCleanupFailed:true}:{}),
  };
}
export async function main(argv=process.argv.slice(2),{output=process.stdout}={}){
  const [command,...args]=argv;
  if(!command||['help','--help','-h','returns-help'].includes(command)){
    await writeOutput(output,DOSSIER_RETURN_USAGE);return;
  }
  need(Object.hasOwn(fields,command),'RETURN_COMMAND_UNKNOWN');
  const options=['connection-file','directory','id','timeout-ms','result-file',...fields[command]];
  const {values,tokens}=parseArgs({
    args,options:Object.fromEntries(options.map(name=>[name,{type:'string'}])),strict:true,tokens:true
  });
  const seen=new Set();
  for(const token of tokens)if(token.kind==='option'){
    need(!seen.has(token.name),'ARGUMENT_REPEATED');seen.add(token.name);
  }
  const required=name=>{
    need(typeof values[name]==='string'&&values[name].length>0,'RETURN_ARGUMENT_REQUIRED');
    return values[name];
  };
  const number=name=>{
    if(values[name]===undefined)return undefined;
    need(/^(0|[1-9][0-9]{0,8})$/.test(values[name]),'RETURN_INTEGER_ARGUMENT_INVALID');
    return Number(values[name]);
  };
  const digest=(name,{required:must=false}={})=>{
    const value=must?required(name):values[name];
    need(value===undefined||/^[a-f0-9]{64}$/.test(value),'RETURN_SHA256_ARGUMENT_INVALID');
    return value;
  };
  const id=required('id'),connectionFile=resolve(required('connection-file'));
  const directory=resolve(required('directory'));
  const inputFile=values.input===undefined?undefined:resolve(required('input'));
  const sourceFile=values['source-file']===undefined?undefined:resolve(required('source-file'));
  const outFile=values.out===undefined?undefined:resolve(required('out'));
  const resultFile=values['result-file']===undefined?undefined:resolve(required('result-file'));
  const inputs=new Set([connectionFile,inputFile,sourceFile].filter(Boolean));
  need(!outFile||!inputs.has(outFile),'RETURN_OUTPUT_OVERLAPS_INPUT');
  need(!resultFile||!inputs.has(resultFile)&&resultFile!==outFile,'RETURN_OUTPUT_OVERLAPS_INPUT');
  let input;
  if(inputCommands.includes(command)){
    need(inputFile,'RETURN_ARGUMENT_REQUIRED');
    input=parseJson(await readResearchHostFile(inputFile,JSON_INPUT_LIMIT,{sha256:digest('input-sha256')}));
  }
  if(command==='returns-source'){
    need(sourceFile,'RETURN_ARGUMENT_REQUIRED');digest('sha256',{required:true});
  }
  if(command==='returns-value'){
    required('review');required('item');
    need(['base','current','returned'].includes(required('side'))&&outFile,'RETURN_VALUE_ARGUMENT_INVALID');
    digest('sha256');
  }
  if(command==='returns-export'){
    required('review');need(outFile,'RETURN_ARGUMENT_REQUIRED');
    need(['json','md','html','source'].includes(required('format')),'RETURN_FORMAT_INVALID');
    digest('sha256');
  }
  if(['returns-inspect','returns-draft'].includes(command))required('review');
  if(command==='returns-request')required('request');
  const page=chosen({offset:number('offset'),limit:number('limit')});
  if(page.limit!==undefined)need(page.limit>=1&&page.limit<=100,'RETURN_PAGE_LIMIT_INVALID');
  const client=new ResearchWorkspaceClient({connectionFile,directory},
    values['timeout-ms']===undefined?{}:{timeoutMs:number('timeout-ms')});
  let result,nativeCompleted=false,resultFileReceipt,operationError;
  try{
    await client.status();const returns=client.dossierReturns(id);
    if(command==='returns-source')result=await returns.receiveSource({
      file:sourceFile,expectedSha256:values.sha256,
      ...chosen({filename:values.filename,contentType:values['content-type']})
    });
    else if(command==='returns-preview')result=await returns.preview(input);
    else if(command==='returns-list')result=await returns.list(page);
    else if(command==='returns-inspect')result=await returns.list({reviewId:values.review,...page});
    else if(command==='returns-request')result=await returns.list({requestId:values.request});
    else if(command==='returns-value')result=await returns.downloadValue({
      reviewId:values.review,itemId:values.item,side:values.side,file:outFile,
      ...chosen({expectedSha256:values.sha256})
    });
    else if(command==='returns-preview-choices')result=await returns.previewChoices(input);
    else if(command==='returns-review')result=await returns.review(input);
    else if(command==='returns-save-draft')result=await returns.saveDraft(input);
    else if(command==='returns-draft')result=await returns.draft({reviewId:values.review});
    else if(command==='returns-export')result=await returns.export({
      reviewId:values.review,file:outFile,format:values.format,
      ...chosen({returnId:values.return,expectedSha256:values.sha256})
    });
    nativeCompleted=true;
    const text=JSON.stringify(result,null,2)+'\n';
    if(resultFile)resultFileReceipt=await publishResult(resultFile,text);
    await writeOutput(output,text);return result;
  }catch(error){
    operationError=error;
    Object.assign(error,chosen({reviewId:values.review,requestId:values.request}),completionIdentity(command,id,result,input));
    if(resultFile)error.resultFile=resultFile;
    if(nativeCompleted){
      error.nativeResultAvailable=true;
      error.recovery=resultFileReceipt?
        'The complete original native result is saved in resultFile. Read that exact file; do not repeat a write to repair stdout.':
        command==='returns-review'?
          'The native review returned before output failed. Read returns-request with this exact requestId and compare the full original input before any retry.':
        command==='returns-save-draft'?
          'The native draft returned before output failed. Read returns-draft and compare its full saved version and content before another versioned write.':
        command==='returns-source'?
          'The original source was retained before output failed. Keep its sourceId and hash; the same exact source bytes recover its original retention.':
          'The original operation returned before output failed. Retain these original IDs and any completed download; read the same saved review or select a new result filename.';
    }
    throw error;
  }finally{
    try{await client.close();}
    catch(closeError){
      if(operationError)operationError.closeError=safeCode(closeError.code,'RETURN_CLIENT_CLOSE_FAILED');
      else{
        Object.assign(closeError,completionIdentity(command,id,result,input));
        if(nativeCompleted){
          closeError.nativeResultAvailable=true;
          closeError.recovery='The original operation returned before attachment close failed. Retain its result and recover the same saved request or file; do not repeat a write to repair cleanup.';
        }
        if(resultFileReceipt)closeError.resultFile=resultFileReceipt.file;
        throw closeError;
      }
    }
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{
    process.stderr.write(JSON.stringify(dossierReturnCliError(error))+'\n');process.exitCode=1;
  });
}
