/* MIT. Installed native Event mapping runtime; no received code is executed. */
import * as parser from './mapping-native-parser.mjs';
import {createEventMappingWorkingAPI,eventMappingHash,eventMappingBytes} from './mapping-working.mjs';
import {createEventMappingReviewAPI} from './mapping-review.mjs';
import {renderEventMappingWorking} from './mapping-working-html.mjs';

const MODEL_SHA256='69d9edd02cf6225257f4e4a8b5624b3fbd46579f740bf8f3b554e68b68407df0';
const REVIEW_SHA256='9cb2e2bcd0fa4e7cc94d915c309e7cbf49ea5a0b7e0a1992f54d13da9f286b60';
const METHODS=['create','reopen','updateDraft','compare','status','nativeReview','catalogue','values','files','serialize'];
const need=(value,message)=>{if(!value)throw Error(message);};
function originalSource(text,expected,label){
 need(typeof text==='string'&&eventMappingBytes(text)>0&&eventMappingBytes(text)<2*1024*1024&&eventMappingHash(text)===expected,
  'The installed '+label+' differs from this native editor. Keep the full original working JSON/HTML and use its matching installed source.');
}
export function createEventMappingNativeRuntime({parserSource,modelSource,reviewModelSource}={}){
 originalSource(parserSource,parser.EVENT_MAPPING_NATIVE_PARSER_SHA256,'Event parser');
 originalSource(modelSource,MODEL_SHA256,'working-copy model');
 const base=createEventMappingWorkingAPI(parser),workingAPI={};
 const bound=value=>{
  const comparison=value?.schema==='stellar-forge.event-mapping-source-pair.v1'?value.comparison:value?.original?.comparison;
  need(comparison?.receiver?.core_sha256===parser.EVENT_MAPPING_NATIVE_PARSER_SHA256,
   'The complete original source requires its matching installed parser. Keep its original files and frozen editable HTML.');
  return base;
 };
 for(const name of METHODS)workingAPI[name]=(value,...args)=>bound(value)[name](value,...args);
 Object.freeze(workingAPI);
 let reviewAPI=null;
 if(reviewModelSource!==undefined){
  originalSource(reviewModelSource,REVIEW_SHA256,'colleague-review model');
  reviewAPI=createEventMappingReviewAPI({workingAPI,eventMappingHash,eventMappingBytes});
 }
 return Object.freeze({workingAPI,reviewAPI,parserHash:parser.EVENT_MAPPING_NATIVE_PARSER_SHA256});
}
export function renderEventMappingNativeHTML(value,assets={}){
 const {workingAPI,reviewAPI}=createEventMappingNativeRuntime(assets);
 return renderEventMappingWorking(value,{...assets,trustedRuntime:{workingAPI,reviewAPI}});
}
