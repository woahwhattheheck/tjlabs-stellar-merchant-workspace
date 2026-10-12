// SPDX-License-Identifier: MIT
// Analytical workbooks share the original DuckDB customer action and identity.
const id={type:'string',pattern:'^[a-f0-9]{64}$'},requestId={type:'string',pattern:'^[a-f0-9]{32}$'};
const revision={type:'integer',minimum:1},expected={type:'integer',minimum:0};
const title={type:'string',minLength:1,maxLength:200},text={type:'string'};
const name={type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,79}$'};
const value={type:['string','number','boolean','object','array'],description:'An exact original typed value. Use decimal/integer text for values that JavaScript cannot represent exactly. NULL uses the explicit null rule.'};
const columns={type:'array',uniqueItems:true,items:text};
const page={offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:500}};
const dimension={type:'object',additionalProperties:false,required:['column','name'],properties:{
 column:text,name:title,transform:{enum:['identity','day','week','month','quarter','year']}}};
const measure={type:'object',additionalProperties:false,required:['name','aggregate'],properties:{
 name:title,aggregate:{enum:['count_rows','count','count_distinct','sum','avg','min','max']},column:text,
 nulls:{enum:['exclude','zero']},note:{type:'string',maxLength:4000}}};
const filter={type:'object',additionalProperties:false,required:['column','operator'],properties:{
 column:text,operator:{enum:['eq','ne','lt','lte','gt','gte','in','not_in','between','is_null','not_null']},
 value,values:{type:'array',minItems:1,maxItems:1000,items:value},nulls:{enum:['exclude','include']}}};
export const analyticsDefinition=Object.freeze({type:'object',additionalProperties:false,
 required:['name','title','edition_id','dimensions','measures'],properties:{
 name,title,edition_id:id,description:{type:'string',maxLength:16000},
 dimensions:{type:'array',maxItems:12,items:dimension},measures:{type:'array',minItems:1,maxItems:32,items:measure},
 filters:{type:'array',maxItems:64,items:filter},
 pivot:{type:'object',additionalProperties:false,required:['column','values'],properties:{column:text,
  values:{type:'array',maxItems:64,items:{type:'object',additionalProperties:false,required:['value','label'],properties:{value,label:title}}},
  include_null:{type:'boolean'},include_other:{type:'boolean'},null_label:title,other_label:title}},
 order:{type:'array',maxItems:1024,items:{type:'object',additionalProperties:false,required:['column'],properties:{
  column:text,direction:{enum:['asc','desc']},nulls:{enum:['first','last']}}}}}
});
export const analyticsWorkbook=Object.freeze({type:'object',additionalProperties:false,required:['name','title','pages'],
 properties:{name,title,description:{type:'string',maxLength:32000},author:{type:'string',maxLength:200},pages:{type:'array',minItems:1,maxItems:100,items:{
  type:'object',additionalProperties:false,required:['title','kind'],properties:{title,kind:{enum:['text','table','bar','line']},
   text:{type:'string',maxLength:64000},source_kind:{enum:['result','comparison']},source_id:id,columns,
   x:text,y:{type:'array',minItems:1,maxItems:8,uniqueItems:true,items:text},chart_limit:{type:'integer',minimum:1,maximum:2000}}}}}});
const spec=(required,properties,description)=>({required,properties,description});
export const nativeDuckDBAnalyticsOperations=Object.freeze({
 'analytics-status':spec([],{},'Read analytical workbook counts in the original DuckDB warehouse.'),
 'analytics-source':spec(['edition_id'],{edition_id:id,column:text,...page},'Read original field meanings/types/null counts, or page exact distinct values for one source column.'),
 'analytics-review':spec(['definition'],{definition:analyticsDefinition},'Review exact native dimension/measure/filter/pivot rules and hash the complete original source binding. Preview is explicitly limited to100 rows; the saved execution retains every result row.'),
 'analytics-analyses':spec([],{...page},'Page saved definition summaries; reopen an exact revision with analytics-analysis.'),
 'analytics-analysis':spec(['id'],{id,revision},'Read the current or exact historical saved definition and original source review.'),
 'analytics-save-analysis':spec(['request_id','definition','expected_revision','review_sha256'],
  {request_id:requestId,definition:analyticsDefinition,expected_revision:expected,review_sha256:id},
  'Save the exact reviewed definition with revision CAS and the original stable request ID.'),
 'analytics-execute':spec(['request_id','analysis_id','revision'],{request_id:requestId,analysis_id:id,revision},
  'Materialize the complete native aggregate result and totals from this immutable source/definition revision. Exact repeated execution reuses the retained result.'),
 'analytics-results':spec([],{...page},'Page immutable native result summaries.'),
 'analytics-result':spec(['id'],{id},'Read one exact native result, dimensions, measures, source meanings, complete fingerprint and retained original query.'),
 'analytics-result-rows':spec(['id'],{id,...page},'Page every complete result group in its retained native order. Offsets affect display only.'),
 'analytics-compare':spec(['request_id','before_id','after_id','keys'],{request_id:requestId,before_id:id,after_id:id,keys:columns,title},
  'Compare all compatible native result groups using a complete unique key; retain added/removed/changed/unchanged rows and exact decimal changes. NULL and missing sides remain distinct.'),
 'analytics-comparisons':spec([],{...page},'Page immutable exact result-comparison summaries.'),
 'analytics-comparison':spec(['id'],{id},'Read complete comparison definitions, source meanings, status totals, column roles and retained native query.'),
 'analytics-comparison-rows':spec(['id'],{id,...page},'Page exact prior/following values and decimal-change strings for every comparison group.'),
 'analytics-workbooks':spec([],{...page},'Page saved analytical workbook summaries.'),
 'analytics-workbook':spec(['id'],{id,revision},'Read current or exact historical workbook pages, source-result choices and editorial notes.'),
 'analytics-save-workbook':spec(['request_id','definition','expected_revision'],{request_id:requestId,definition:analyticsWorkbook,expected_revision:expected},
  'Save a complete ordered workbook revision with full table, bar/line chart and editorial pages. Original result editions remain pinned.'),
 'analytics-publish':spec(['request_id','workbook_id','revision'],{request_id:requestId,workbook_id:id,revision},
  'Publish an immutable report capturing this exact workbook revision and every original result/source binding.'),
 'analytics-reports':spec([],{...page},'Page published report edition summaries.'),
 'analytics-report':spec(['id'],{id},'Read the exact captured report and its complete original workbook/source definitions. Large complete bodies remain in the full exported report.json.'),
 'analytics-operations':spec([],{...page},'Page original analytical operation summaries. Reads never resume a request.'),
 'analytics-request':spec(['request_id'],{request_id:requestId},'Read one exact original analytical request and actual retained outcome.'),
 'analytics-resume':spec(['request_id'],{request_id:requestId},'Explicitly continue the SAME original analytical request body and identity.'),
 'analytics-export':spec(['request_id','report_id'],{request_id:requestId,report_id:id},
  'Export complete HTML, CSV/Parquet and exact dictionaries/source files, editable application and original sparse warehouse ZIP. Use the original operator operation/resume for this export journal.'),
 'analytics-export-manifest':spec(['export_id'],{export_id:id},
  'Read the small exact full-package manifest and ZIP file descriptors; use the original file action to receive their complete bytes without executing a query again.')
});
