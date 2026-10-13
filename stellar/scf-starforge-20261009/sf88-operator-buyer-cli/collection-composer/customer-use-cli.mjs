#!/usr/bin/env node
// MIT. Local operations in the original Collections store; execution stays in buyer-collections.
import { realpath } from 'node:fs/promises';
import { basename,dirname,resolve,isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openCollections } from '../collections/model.mjs';
import { initializationDirectory,initializationBytes,retainInitializationFile } from '../initialization.mjs';
import { openCustomerUseCommissioning } from './customer-use-model.mjs';
import { CUSTOMER_USE_LIMITS,requireCustomerUse as need } from './customer-use-definition.mjs';

export const HELP=[
 'Starforge customer-use commissioning',
 '',
 '  starforge buyer-customer-use import --directory ABS --file ABS_CALENDAR_JSON',
 '  starforge buyer-customer-use sources --directory ABS',
 '  starforge buyer-customer-use source --directory ABS --source-sha256 SHA256',
 '  starforge buyer-customer-use list --directory ABS',
 '  starforge buyer-customer-use show --directory ABS --id ID [--revision SHA256]',
 '  starforge buyer-customer-use save --directory ABS --file ABS_COMMISSION_JSON',
 '    --expected-head none|SHA256 --actor NAME --request-id UUID',
 '  starforge buyer-customer-use prepare --directory ABS --id ID --revision SHA256',
 '    --collection ID --actor NAME --request-id UUID',
 '  starforge buyer-customer-use create --directory ABS --id ID --revision SHA256',
 '    --collection ID --edition-sha256 SHA256 --preview-sha256 SHA256',
 '    --actor NAME --request-id UUID',
 '  starforge buyer-customer-use capture --directory ABS --id ID --revision SHA256',
 '    --bindings COMMA_SEPARATED_BINDING_IDS --actor NAME --request-id UUID',
 '    [--max-verify-bytes BYTES]',
 '  starforge buyer-customer-use download-return --directory ABS --id ID --request-id UUID --out ABS_NEW_FILE',
 '  starforge buyer-customer-use action --directory ABS --id ID --request-id UUID',
 '  starforge buyer-customer-use export --directory ABS --id ID --revision SHA256',
 '    --format json|csv --out ABS_NEW_FILE',
 '  starforge buyer-customer-use verify-receiving --directory ABS',
 '',
 'Keep a request UUID and its exact input when continuing an interrupted action.',
 'Save retains immutable history; prepare/create use the original saved Request plan and period.',
 'Queue, payment approval, signing and execution remain in the existing buyer-collections command.',
 'Use the original encrypted Collections backup to transfer the whole operating workspace.',
].join('\n');
const MODES={
 import:{required:['--directory','--file'],optional:['--source-sha256']},
 sources:{required:['--directory']},source:{required:['--directory','--source-sha256']},
 list:{required:['--directory']},show:{required:['--directory','--id'],optional:['--revision']},
 save:{required:['--directory','--file','--expected-head','--actor','--request-id']},
 prepare:{required:['--directory','--id','--revision','--collection','--actor','--request-id']},
 create:{required:['--directory','--id','--revision','--collection','--edition-sha256','--preview-sha256','--actor','--request-id']},
 capture:{required:['--directory','--id','--revision','--bindings','--actor','--request-id'],optional:['--max-verify-bytes']},
 'download-return':{required:['--directory','--id','--request-id','--out']},
 action:{required:['--directory','--id','--request-id']},
 export:{required:['--directory','--id','--revision','--format','--out']},
 'verify-receiving':{required:['--directory']},
};
export function readCustomerUseArguments(args) {
 need(Array.isArray(args)&&args.every(value=>typeof value==='string'),'CUSTOMER_USE_CLI_ARGUMENT','Supply supported string arguments.');
 if(!args.length||args.length===1&&['help','-h','--help'].includes(args[0]))return {mode:'help',options:{}};
 const [mode,...rest]=args,contract=MODES[mode];
 need(contract&&rest.length%2===0,'CUSTOMER_USE_CLI_ARGUMENT','Choose a supported command and complete option values.');
 const options={},allowed=[...contract.required,...(contract.optional??[])];
 for(let index=0;index<rest.length;index+=2) {
   const key=rest[index],value=rest[index+1];
   need(allowed.includes(key)&&!Object.hasOwn(options,key)&&value.length>0,'CUSTOMER_USE_CLI_ARGUMENT','Retain each supported option once.');
   options[key]=value;
 }
 need(contract.required.every(key=>Object.hasOwn(options,key)),'CUSTOMER_USE_CLI_ARGUMENT','Supply every required original selection.');
 for(const key of ['--directory','--file','--out'])if(options[key]!==undefined)
   need(isAbsolute(options[key])&&resolve(options[key])===options[key]&&!options[key].includes('\0'),
     'CUSTOMER_USE_ABSOLUTE_PATH_REQUIRED','Use complete canonical absolute paths.');
 return {mode,options};
}
export async function runCustomerUseCommand(args) {
 const {mode,options:o}=readCustomerUseArguments(args);
 if(mode==='help')return {help:HELP};
 const collections=await openCollections({directory:o['--directory'],existingOnly:true});
 let model;
 try {
   model=openCustomerUseCommissioning({collections});
   if(mode==='import')return await model.importSource({bytes:await initializationBytes(o['--file'],CUSTOMER_USE_LIMITS.sourceBytes),
     name:basename(o['--file']),...(o['--source-sha256']?{expectedSha256:o['--source-sha256']}:{})});
   if(mode==='sources')return await model.listSources();
   if(mode==='source')return await model.source(o['--source-sha256']);
   if(mode==='list')return await model.list();
   if(mode==='show')return await model.inspect({id:o['--id'],...(o['--revision']?{sha256:o['--revision']}:{})});
   if(mode==='verify-receiving')return await model.verifyReceiving();
   if(mode==='action')return await model.action({id:o['--id'],requestId:o['--request-id']});
   if(mode==='save') {
     let document;
     try{document=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await initializationBytes(o['--file'],CUSTOMER_USE_LIMITS.documentBytes)));}
     catch(error){if(error.code)throw error;need(false,'CUSTOMER_USE_JSON_INVALID','Read the complete original commission definition.');}
     return await model.save({document,expectedHeadSha256:o['--expected-head']==='none'?null:o['--expected-head'],
       actor:o['--actor'],requestId:o['--request-id']});
   }
   if(mode==='export'||mode==='download-return') {
     const file=mode==='export'?await model.export({id:o['--id'],sha256:o['--revision'],format:o['--format']}):
       await model.returnedFile({id:o['--id'],requestId:o['--request-id']});
     await initializationDirectory(dirname(o['--out']));
     await retainInitializationFile(o['--out'],file.bytes,{resume:true});
     return {path:o['--out'],bytes:file.bytes.length,sha256:file.sha256,revisionSha256:file.revisionSha256,type:file.type};
   }
   if(mode==='capture') {
     const maximum=o['--max-verify-bytes'];
     need(maximum===undefined||/^(0|[1-9][0-9]*)$/.test(maximum),'CUSTOMER_USE_CAPTURE_VERIFY_LIMIT','Use a whole byte count.');
     return await model.capture({id:o['--id'],sha256:o['--revision'],bindingIds:o['--bindings'].split(','),
       actor:o['--actor'],requestId:o['--request-id'],...(maximum===undefined?{}:{maxVerifyBytes:Number(maximum)})});
   }
   const input={id:o['--id'],sha256:o['--revision'],collectionId:o['--collection'],actor:o['--actor'],requestId:o['--request-id']};
   if(mode==='prepare')return await model.prepare(input);
   return await model.create({...input,expectedEditionSha256:o['--edition-sha256'],expectedPreviewSha256:o['--preview-sha256']});
 } finally {await model?.close();await collections.close();}
}
export async function main(args=process.argv.slice(2)) {
 const result=await runCustomerUseCommand(args);process.stdout.write((result.help??JSON.stringify(result,null,2))+'\n');return result;
}
if(process.argv[1]&&await realpath(resolve(process.argv[1])).then(path=>pathToFileURL(path).href===import.meta.url,()=>false))
 main().catch(error=>{process.stderr.write(JSON.stringify({error:error.code??'CUSTOMER_USE_FAILED',message:error.message,
   ...(error.details?{details:error.details}:{})})+'\n');process.exitCode=1;});
