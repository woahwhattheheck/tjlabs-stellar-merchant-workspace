// MIT. Typed pure FRED procedures within the original configured economic provider.
import { createFredOperatingPlan, inspectFredOperatingSource,
  recordFredOperatingResult } from '../../stellar/scf-starforge-20261009/distribution/discovery/fred-operating-plan.mjs';
import { inspectOperatingPlan, compareOperatingPlan, receiveOperatingPlan,
  operatingPlanRevision, renderOperatingPlanMarkdown, renderOperatingPlanHTML }
  from '../../stellar/scf-starforge-20261009/distribution/discovery/operating-plan.mjs';

const PREFIX='merchant_fred_operating_';
const ACTIONS=new Set(['inspect','create','record','compare','receive','render']);
export const FRED_OPERATING_MAX_BYTES=32*1024*1024;
const LIMIT=FRED_OPERATING_MAX_BYTES;
export function handlesFredOperating(name) {
  return typeof name==='string' && name.startsWith(PREFIX) && ACTIONS.has(name.slice(PREFIX.length));
}
function fail(code,message){const e=new TypeError(message);e.code=code;throw e;}
function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function keys(value,allowed,required){
  if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key)))
    fail('FRED_OPERATING_INPUT','Supply the exact required FRED operating request fields.');
}
function bounded(value){
  const text=JSON.stringify(value);
  if(text===undefined||new TextEncoder().encode(text).length>LIMIT)
    fail('FRED_OPERATING_SIZE','The complete FRED operating value exceeds 32 MiB.');
  return value;
}
function originalTime(value){
  if(typeof value!=='string'||!value)fail('FRED_OPERATING_TIME','Retain the original explicit savedAt for this operation.');
}
function selection(args) {
  if(args.revision!==undefined&&(!Number.isSafeInteger(args.revision)||args.revision<1))
    fail('FRED_OPERATING_REVISION','Use a positive saved revision.');
  return {revision:args.revision};
}
/** No network, files, project mutation or native action is performed by this handler. */
export function callFredOperating(name,args) {
  if(!handlesFredOperating(name))fail('TOOL_NOT_FOUND','Unknown FRED operating procedure action.');
  bounded(args);
  let result;
  switch(name.slice(PREFIX.length)){
    case 'inspect':
      keys(args,['source'],['source']);
      result=inspectFredOperatingSource(args.source);break;
    case 'create':
      keys(args,['input'],['input']);originalTime(args.input?.savedAt);
      result=createFredOperatingPlan(args.input);break;
    case 'record':
      keys(args,['plan','input'],['plan','input']);originalTime(args.input?.savedAt);
      result=recordFredOperatingResult(inspectOperatingPlan(args.plan),args.input);break;
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
      else fail('FRED_OPERATING_FORMAT','Use json, markdown or html.');
      break;
    }
  }
  return bounded(result);
}

/** A local typed client over the same pure model used by the installed MCP provider. */
export class FredOperatingClient {
  inspectSource(source){return callFredOperating(PREFIX+'inspect',{source});}
  createPlan(input){return callFredOperating(PREFIX+'create',{input});}
  recordResult(plan,input){return callFredOperating(PREFIX+'record',{plan,input});}
  comparePlan(plan,catalog,{revision}={}){return callFredOperating(PREFIX+'compare',{plan,catalog,...(revision===undefined?{}:{revision})});}
  receivePlan(incoming,existing=null){return callFredOperating(PREFIX+'receive',{incoming,existing});}
  renderPlan(plan,{format='json',revision}={}){return callFredOperating(PREFIX+'render',{plan,format,...(revision===undefined?{}:{revision})});}
}
