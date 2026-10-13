// MIT. Pure Support procedures within the original configured Merchant Support provider.
import { createSupportOperatingPlan, inspectSupportOperatingSource,
  recordSupportOperatingResult } from '../../stellar/scf-starforge-20261009/distribution/discovery/support-operating-plan.mjs';
import { inspectOperatingPlan, compareOperatingPlan, receiveOperatingPlan,
  operatingPlanRevision, renderOperatingPlanMarkdown, renderOperatingPlanHTML }
  from '../../stellar/scf-starforge-20261009/distribution/discovery/operating-plan.mjs';

import {recordSupportOperatingWork,createSupportOperatingReturn,inspectSupportOperatingReturn,
  compareSupportOperatingReturn,reviseSupportOperatingReturn,decideSupportOperatingReturn,
  applySupportOperatingReturn,renderSupportOperatingReturnHTML}
  from '../../stellar/scf-starforge-20261009/distribution/discovery/support-operating-return.mjs';

const PREFIX='merchant_support_operating_';
const ACTIONS=new Set(['inspect','create','record','compare','receive','render','record_work','return_create','return_inspect','return_compare','return_details','return_decide','return_apply','return_render']);
const LIMIT=32*1024*1024;
export function handlesSupportOperating(name) {
  return typeof name==='string' && name.startsWith(PREFIX) && ACTIONS.has(name.slice(PREFIX.length));
}
function fail(code,message){const e=new TypeError(message);e.code=code;throw e;}
function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function keys(value,allowed,required){
  if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key)))
    fail('SUPPORT_OPERATING_INPUT','Supply the exact required Support operating request fields.');
}
function bounded(value,maximum=LIMIT){
  const text=JSON.stringify(value);
  if(text===undefined||new TextEncoder().encode(text).length>maximum)
    fail('SUPPORT_OPERATING_SIZE','The complete Support operating value exceeds its '+Math.floor(maximum/1024/1024)+' MiB limit.');
  return value;
}
function originalTime(value){
  if(typeof value!=='string'||!value)fail('SUPPORT_OPERATING_TIME','Retain the original explicit savedAt for this operation.');
}
function selection(args) {
  if(args.revision!==undefined&&(!Number.isSafeInteger(args.revision)||args.revision<1))
    fail('SUPPORT_OPERATING_REVISION','Use a positive saved revision.');
  return {revision:args.revision};
}
/** No network, files, case mutation or native action is performed by this handler. */
export async function callSupportOperating(name,args) {
  if(!handlesSupportOperating(name))fail('TOOL_NOT_FOUND','Unknown Support operating procedure action.');
  const maximum=name.slice(PREFIX.length).startsWith('return_')?128*1024*1024:LIMIT;
  bounded(args,maximum);
  let result;
  switch(name.slice(PREFIX.length)){
    case 'record_work':
      keys(args,['plan','input'],['plan','input']);originalTime(args.input?.savedAt);
      result=await recordSupportOperatingWork(args.plan,args.input);break;
    case 'return_create':
      keys(args,['current','incoming','input'],['current','incoming','input']);
      result=await createSupportOperatingReturn(args.current,args.incoming,args.input);break;
    case 'return_inspect':
      keys(args,['value'],['value']);result=await inspectSupportOperatingReturn(args.value);break;
    case 'return_compare':
      keys(args,['value'],['value']);result=await compareSupportOperatingReturn(args.value);break;
    case 'return_details':
      keys(args,['value','updates'],['value','updates']);result=await reviseSupportOperatingReturn(args.value,args.updates);break;
    case 'return_decide':
      keys(args,['value','key','decision'],['value','key','decision']);
      result=await decideSupportOperatingReturn(args.value,args.key,args.decision);break;
    case 'return_apply':
      keys(args,['value','current','savedAt'],['value','current','savedAt']);originalTime(args.savedAt);
      result=await applySupportOperatingReturn(args.value,{current:args.current,savedAt:args.savedAt});break;
    case 'return_render':
      keys(args,['value','format'],['value','format']);
      if(args.format==='json')result={format:'json',value:await inspectSupportOperatingReturn(args.value)};
      else if(args.format==='html')result={format:'html',text:await renderSupportOperatingReturnHTML(args.value)};
      else fail('SUPPORT_OPERATING_FORMAT','Use json or html for complete returned work.');
      break;
    case 'inspect':
      keys(args,['source'],['source']);
      result=inspectSupportOperatingSource(args.source);break;
    case 'create':
      keys(args,['input'],['input']);originalTime(args.input?.savedAt);
      result=createSupportOperatingPlan(args.input);break;
    case 'record':
      keys(args,['plan','input'],['plan','input']);originalTime(args.input?.savedAt);
      result=recordSupportOperatingResult(inspectOperatingPlan(args.plan),args.input);break;
    case 'compare':
      keys(args,['plan','catalog','revision'],['plan','catalog']);
      result=compareOperatingPlan(inspectOperatingPlan(args.plan),args.catalog,selection(args));break;
    case 'receive':
      keys(args,['incoming','existing'],['incoming']);
      result=receiveOperatingPlan(args.incoming,args.existing??null);break;
    case 'render':{
      keys(args,['plan','revision','format'],['plan','format']);
      const plan=inspectOperatingPlan(args.plan),options=selection(args);
      if(args.revision!==undefined)operatingPlanRevision(plan,args.revision);
      if(args.format==='json')result={format:'json',plan};
      else if(args.format==='markdown')result={format:'markdown',text:renderOperatingPlanMarkdown(plan,options)};
      else if(args.format==='html')result={format:'html',text:renderOperatingPlanHTML(plan,options)};
      else fail('SUPPORT_OPERATING_FORMAT','Use json, markdown or html.');
      break;
    }
  }
  return bounded(result,maximum);
}
