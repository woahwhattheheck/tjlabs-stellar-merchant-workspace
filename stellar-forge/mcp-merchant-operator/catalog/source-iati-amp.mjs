// MIT. Complete AMP commissioning on the original IATI source console.
export const IATI_AMP_TOOL_PREFIX='merchant_source_iati_amp_';
export const IATI_AMP_REQUEST=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
export const IATI_AMP_FILE_KINDS=Object.freeze(['analysis','sourceRows','comparison','prepared','report']);
export function iatiAmpTools(tool,{selection,digest,page,read}){
 const saved={...selection,id:digest,revision:{type:'integer',minimum:1}};
 const definition={type:'object',description:'Complete original AMP request. Native project and monetary JSON is retained as exact strings; requestId, selected revision, mappings and native credentials are validated by the existing workspace.'};
 const action=(name,description,annotations={idempotent:true})=>tool(IATI_AMP_TOOL_PREFIX+name,description,{...selection,definition},['workspace','definition'],annotations);
 return[
  tool(IATI_AMP_TOOL_PREFIX+'status','Read the existing IATI AMP captures, plans and original receiving operations.',selection,['workspace'],read),
  tool(IATI_AMP_TOOL_PREFIX+'capture','Read the complete original installed field metadata, possible values, selected projects, account/workspace and acquisition.',{...selection,id:digest},['workspace','id'],read),
  tool(IATI_AMP_TOOL_PREFIX+'plan','Read one whole saved AMP commissioning plan at its original revision.',saved,['workspace','id'],read),
  tool(IATI_AMP_TOOL_PREFIX+'history','Page the complete original AMP plan revisions. Continue its returned snapshot.',{...selection,id:digest,...page},['workspace','id'],read),
  tool(IATI_AMP_TOOL_PREFIX+'rows','Page the immutable original financial row decisions, native proposals and reported amount groups.',{...saved,offset:page.offset,limit:{type:'integer',minimum:1,maximum:250},state:{type:'string',enum:['included','excluded','review']}},['workspace','id','revision'],read),
  tool(IATI_AMP_TOOL_PREFIX+'run','Read the original native run, full project steps and actual retained receiving results.',{...selection,id:digest},['workspace','id'],read),
  tool(IATI_AMP_TOOL_PREFIX+'events','Read the next complete original native event page. Continue nextAfter until null.',{...selection,id:digest,after:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:250}},['workspace','id'],read),
  tool(IATI_AMP_TOOL_PREFIX+'request','Reconcile one unchanged original requestId and its saved native result before continuing after an interrupted response.',{...selection,requestId:{type:'string',pattern:IATI_AMP_REQUEST.source}},['workspace','requestId'],read),
  action('capture_import','Retain a complete actual native AMP capture, its exact original JSON and declared programme coverage. Definition contains requestId, actor and capture.'),
  action('save','Save the complete source portfolio, captured programme, mappings, full project drafts and financial decisions. Definition contains requestId, actor, definition and optional original id/expectedRevision.'),
  action('decision_preview','Read every original row selected by a whole programme/financial scope, with its immutable selection hash.',read),
  action('decisions','Apply an explicit common decision to the complete previously previewed original scope. Native row amounts and dates remain separate; rows needing mapping retain their findings.'),
  action('advance','Create the following publisher-edition plan from an original saved plan and a fresh capture of the same AMP workspace. Confirmed native transaction IDs follow unchanged records.'),
  action('review','Record the named review against the complete current analysis hash and expected plan revision.'),
  action('prepare','Prepare every full native project request from the reviewed original programme and complete financial decisions.'),
  action('native_capture','Use the existing installed AMP login to read actual session/workspace, full metadata/possible values and every explicitly selected native project. Credentials remain in this invocation.'),
  action('native_start','Start the saved original full project receiving operation. This writes the prepared changes to the installed AMP workspace and retains every original native response.'),
  action('native_continue','Continue the existing native run; completed projects retain their result and interrupted writes require their original receiving.'),
  action('native_reconcile','Read the actual project ID returned by AMP and reconcile the full original request, financial records and fields.'),
  tool(IATI_AMP_TOOL_PREFIX+'export','Retain the complete AMP application/source/portfolio/native-history ZIP. Read through merchant_source_file_read and receive into the next existing IATI workspace.',saved,['workspace','id','revision'],{}),
  tool(IATI_AMP_TOOL_PREFIX+'file','Retain the complete original report, financial analysis, source rows, following-edition comparison or full native requests.',{...saved,kind:{type:'string',enum:IATI_AMP_FILE_KINDS}},['workspace','id','revision','kind'],{}),
  tool(IATI_AMP_TOOL_PREFIX+'asset','Retain one complete original native response or receiving result by its exact SHA256.',{...selection,sha256:digest},['workspace','sha256'],{}),
  tool(IATI_AMP_TOOL_PREFIX+'receive','Receive the complete AMP handover through the existing IATI engine. Choose a configured packet handle or original AMP exportId.',{...selection,file:{type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'},exportId:digest,fromWorkspace:{type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'}},['workspace'],{idempotent:true})
 ];
}
