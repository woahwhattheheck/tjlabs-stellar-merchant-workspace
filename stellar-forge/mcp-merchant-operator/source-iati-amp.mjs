// MIT. Thin full-workflow AMP dispatch through the original source carrier.
import {IATI_AMP_TOOL_PREFIX,IATI_AMP_REQUEST,IATI_AMP_FILE_KINDS} from './catalog/source-iati-amp.mjs';
export const IATI_AMP_ROUTE='/api/iati/amp/';
const error=message=>Object.assign(new Error(message),{code:'INVALID_PARAMS'});
const sha=v=>{if(typeof v!=='string'||!/^[0-9a-f]{64}$/.test(v))throw error('Select the complete original AMP identity.');return v;};
const integer=(v,min=1,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw error('Select an original native revision or page.');return v;};
const selected=(input,required=false)=>({id:sha(input.id),...((required||input.revision!==undefined)?{revision:integer(input.revision)}:{})});
const originalRequest=v=>{if(typeof v!=='string'||!IATI_AMP_REQUEST.test(v))throw error('Retain the original AMP requestId.');return v;};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export async function executeIatiAmp(name,input,original){
 const action=name.slice(IATI_AMP_TOOL_PREFIX.length),result=native=>({workspace:original.workspace,native});
 const json=(route,body)=>original.json(IATI_AMP_ROUTE+route,body);
 switch(action){
  case'status':return result(await json('status'));
  case'capture':case'run':return result(await json(action+'?'+new URLSearchParams({id:sha(input.id)})));
  case'plan':return result(await json('plan?'+new URLSearchParams(selected(input))));
  case'history':return result(original.page((await json('history?'+new URLSearchParams({id:sha(input.id)}))).history,input));
  case'rows':{
   const args={...selected(input,true),offset:integer(input.offset??0,0,1000000),limit:integer(input.limit??50,1,250)};
   if(input.state!==undefined){if(!['included','excluded','review'].includes(input.state))throw error('Select an original financial decision state.');args.state=input.state;}
   const native=await json('rows?'+new URLSearchParams(args));
   if(native.id!==args.id||native.revision!==args.revision||native.offset!==args.offset||native.limit!==args.limit||!Array.isArray(native.rows))
    throw Object.assign(new Error('The original AMP row selection returned another revision.'),{code:'SOURCE_RESPONSE_INVALID'});
   return result(native);
  }
  case'events':return result(await json('events?'+new URLSearchParams({id:sha(input.id),after:integer(input.after??0,0),limit:integer(input.limit??100,1,250)})));
  case'request':return result(await json('request?'+new URLSearchParams({requestId:originalRequest(input.requestId)})));
  case'capture_import':case'save':case'decision_preview':case'decisions':case'advance':case'review':case'prepare':
  case'native_capture':case'native_start':case'native_continue':case'native_reconcile':{
   if(!plain(input.definition))throw error('Supply the complete original AMP action object.');
   if(!['decision_preview','native_continue'].includes(action))originalRequest(input.definition.requestId);
   const routes={capture_import:'capture',save:'plan',decision_preview:'decision/preview',decisions:'decision/apply',native_capture:'native/capture',native_start:'native/start',native_continue:'native/continue',native_reconcile:'native/reconcile'};
   return result(await json(routes[action]??action,input.definition));
  }
  case'export':{
   const args=selected(input,true);return original.retain(IATI_AMP_ROUTE+'export?'+new URLSearchParams(args),'amp',
    {amp:args.id,revision:args.revision},{name:'AMP_Commissioning.zip',contentType:'application/zip',verifyNativeDescriptor:true});
  }
  case'file':{
   const args=selected(input,true);if(!IATI_AMP_FILE_KINDS.includes(input.kind))throw error('Select the complete original AMP file.');
   const report=input.kind==='report';return original.retain(IATI_AMP_ROUTE+'file?'+new URLSearchParams({...args,kind:input.kind}),'amp-file',
    {amp:args.id,revision:args.revision,fileKind:input.kind},{name:'AMP_'+input.kind+(report?'.html':'.json'),contentType:report?'text/html':'application/json',verifyNativeDescriptor:true});
  }
  case'asset':return original.retain(IATI_AMP_ROUTE+'asset?'+new URLSearchParams({sha256:sha(input.sha256)}),'amp-file',
   {asset:input.sha256},{name:'AMP_Original_'+input.sha256+'.json',contentType:'application/json',verifyNativeDescriptor:true});
  case'receive':return result(await original.receive(input,IATI_AMP_ROUTE+'receive',['amp']));
  default:throw Object.assign(new Error('Unknown original AMP commissioning action.'),{code:'TOOL_NOT_FOUND'});
 }
}
