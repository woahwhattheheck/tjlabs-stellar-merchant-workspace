// MIT. Complete recorded usage source and ordinary customer quote revision on the original case store.
import {parseArgs} from 'node:util';
import {resolve,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readPrivateFile} from '../../sf93-seller-support-bundle/incident-store.mjs';
import {writeBytes,privateDirectory} from '../../sf88-operator-buyer-cli/node/store.mjs';
import {openCaseStore} from '../case-store.mjs';
import {openCaseCommercial,commercialWorkspaceId} from '../case-commercial.mjs';
import {MAX_MATERIAL_BYTES} from '../commissioning.mjs';
import {sha256,jsonBytes} from '../commercial-pricing.mjs';
const names=['cases-dir','case','revision','request-id','actor','source','source-sha','quote','quote-sha','tariff-source',
  'review-sha','source-id','monthly-requests','target-tariff-source','kind','out','draft-out'];
const required=(v,k)=>{if(typeof v[k]!=='string'||!v[k])throw new Error('Supply --'+k);return v[k];};
function absolute(value){if(!isAbsolute(value)||resolve(value)!==value)throw new Error('Use an absolute normalized private file path.');return value;}
async function save(path,bytes){
  path=absolute(path);await privateDirectory(dirname(path));
  try{await writeBytes(path,bytes,{exclusive:true});}
  catch(error){if(error.code!=='EEXIST')throw error;const original=await readPrivateFile(path,Math.max(1,bytes.length));
    if(!Buffer.from(original).equals(bytes))throw new Error('The selected output contains different original bytes.');}
  return {path,bytes:bytes.length,sha256:sha256(bytes)};
}
export async function commercialPerformanceCli(argv=process.argv.slice(2)){
  const {values:v,positionals}=parseArgs({args:argv,allowPositionals:true,strict:true,
    options:{...Object.fromEntries(names.map(name=>[name,{type:'string'}])),help:{type:'boolean'}}});
  if(v.help){
    if(positionals.length||Object.keys(v).length!==1)throw new Error('Use --help on its own.');
    return {command:'merchant-commercial performance',actions:['list','preview','receive','revision','file'],
      case:'--cases-dir DIR --case UUID --revision SHA256',
      preview:'--source FULL_NATIVE_SOURCE.json --quote UUID --quote-sha SHA256 [--tariff-source SHA256] [--source-sha SHA256] [--out REVIEW.json]',
      receive:'Same full source and selected quote, plus --request-id UUID --actor NAME --review-sha SHA256. Keep all original inputs when retrying.',
      revision:'--source-id SHA256 --quote UUID --quote-sha SHA256 --monthly-requests INTEGER [--target-tariff-source SHA256] --draft-out DRAFT.json [--out REVIEW.json]',
      file:'--source-id SHA256 --kind SOURCE|ATTACHMENT|REPORT --out FILE',
      next:'Review and publish the prepared draft using the original merchant-commercial preview and publish commands.',
      guide:'sf74-merchant-support-console/commercial/PERFORMANCE.md'};
  }
  if(positionals.length!==1)throw new Error('Choose one original customer performance action.');
  const action=positionals[0],common=['cases-dir','case','revision'];
  const sourceOptions=['source','source-sha','quote','quote-sha','tariff-source'];
  const allowed={
    list:common,preview:[...common,...sourceOptions,'out'],
    receive:[...common,...sourceOptions,'request-id','actor','review-sha'],
    revision:[...common,'source-id','quote','quote-sha','monthly-requests','target-tariff-source','draft-out','out'],
    file:[...common,'source-id','kind','out']
  }[action];
  if(!allowed||Object.keys(v).some(key=>!allowed.includes(key)))throw new Error('Unexpected customer performance action or option.');
  const directory=absolute(required(v,'cases-dir')),id=required(v,'case');
  const model=openCaseCommercial({store:await openCaseStore(directory),workspaceId:commercialWorkspaceId(directory)});
  const revision=required(v,'revision'),selected={id,expectedRevision:revision};
  if(action==='list'){
    const result=await model.read({id,revision});return {scope:result.scope,revision:result.revision,performanceSources:result.performanceSources};
  }
  if(action==='preview'||action==='receive'){
    const bytes=await readPrivateFile(absolute(required(v,'source')),MAX_MATERIAL_BYTES);
    const sourceSha256=sha256(bytes);
    if(v['source-sha']!==undefined&&v['source-sha']!==sourceSha256)throw new Error('The complete native source differs from --source-sha.');
    const sourceText=new TextDecoder('utf-8',{fatal:true}).decode(bytes),args={...selected,sourceText,sourceSha256,
      quoteId:required(v,'quote'),quoteSha256:required(v,'quote-sha'),...(v['tariff-source']?{tariffSourceId:v['tariff-source']}:{})};
    if(action==='receive')return model.receivePerformance({...args,requestId:required(v,'request-id'),actor:required(v,'actor'),reviewSha256:required(v,'review-sha')});
    const result=await model.previewPerformance(args);return v.out?{...result,file:await save(v.out,jsonBytes(result))}:result;
  }
  if(action==='revision'){
    const result=await model.preparePerformanceRevision({...selected,sourceId:required(v,'source-id'),
      quoteId:required(v,'quote'),quoteSha256:required(v,'quote-sha'),proposedMonthlyRequests:required(v,'monthly-requests'),
      ...(v['target-tariff-source']?{targetTariffSourceId:v['target-tariff-source']}:{})});
    const draftFile=await save(required(v,'draft-out'),jsonBytes(result.draft));
    return {...result,draftFile,...(v.out?{file:await save(v.out,jsonBytes(result))}:{})};
  }
  const result=await model.downloadPerformance({id,revision,sourceId:required(v,'source-id'),kind:required(v,'kind')});
  return {scope:result.scope,case:result.case,sourceId:result.sourceId,descriptor:result.descriptor,file:await save(required(v,'out'),result.body)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.stdout.write(jsonBytes(await commercialPerformanceCli()));}
  catch(error){process.stderr.write(JSON.stringify({error:error.code||'COMMERCIAL_PERFORMANCE_FAILED',detail:error.message})+'\n');process.exitCode=1;}
}
