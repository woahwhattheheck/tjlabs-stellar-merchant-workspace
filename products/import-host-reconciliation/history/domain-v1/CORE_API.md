# Filio import-to-host workspace — frozen API v1

Factory: `createImportHostCore({codec,parsers})` (synchronous). codec supplies utf8Encode, utf8Decode, sha256Bytes, toBase64, fromBase64. parsers is `createSourceParsers()` from the exact maintained extraction. Both will be supplied as complete static factories.

Workspace: {schema:"tjlabs.import-host-workspace.v1",id,label,createdAt,revision,sources,imports,mappings,batches,reconciliations,comparisons,reviews,operations}. Every collection entry is {id,body,sha256}. Sources retain exact UTF-8 text, bytes/hash/name/role. Original CSV/TSV and JSON intake; other originals may be retained opaque but are not interpreted.

create({id,label,createdAt}) -> workspace.
apply(w,{id,type,actor,at,input,expectedRevision?}) -> {workspace,result:{collection,id},replayed}.
Same exact operation ID replay returns unchanged; conflicting reuse rejects. Imported workspaces replay full operations. exportWorkspace(w) -> {schema:"tjlabs.import-host-export.v1",sha256,workspace}; importWorkspace accepts that OBJECT or its JSON string.
validateWorkspace(w) -> true. No network/provider writes.

Mutations:
* source.add {sourceId,name,text,role:"original"|"import"|"host_receipt"|"readback"|"notes"}.
* import.capture {importId,label,sourceId,kind:"callback"|"webhook",scope:{application,tenant,environment,templateId},externalImportId,note}. Callback source is exact JSON array of row objects. External ID is an explicit host-owned correlation, not inferred from row digest. Webhook source matches published {import_id,template_id,row_count,imported_at,rows}; external/template/row count must agree. Unknown original fields retained.
* mapping.save {mappingId,label,importId,keyPointers:[JSONpointer,...],fields:[{id,label,sourcePointer,targetPointer,mode:"typed"|"decimal"|"text"}],note}. keyPointers define an explicit source business-key tuple, never automatic matches. Typed mode distinguishes number/string/null/bool/object/array and exact original numeric tokens; decimal mode explicitly permits mathematically equal finite decimal/exponent tokens or strings; text mode requires text.
* batch.prepare {batchId,label,mappingId,parentId:null|batchId,actions:[{row:1,action:"create"|"update"|"skip",targetId:null|string,reason}],reviewer,note,previewSha256}. Every original row gets exactly one explicit action. Updates require target ID; creates do not invent one; skips need a reason. Missing/duplicate source keys and mapping gaps are actionable blocking findings. Preparation is not execution or authorization.
* reconciliation.save {reconciliationId,label,batchId,receiptSourceId,readbackSourceId,reviewer,note,previewSha256}. Complete source-backed host-result and readback formats below. No invented success from import callback.
* comparison.save {comparisonId,label,leftId,rightId,pairs:[{leftRow:1,rightRow:1,note}],reviewer,note,previewSha256}. Explicit one-to-one correspondence; unmatched populations retained. Source changes and target reselection visible, no silently inferred repaired record.
* review.save {reviewId,subjectType:"reconciliation"|"comparison",subjectId,rowId,status:"open"|"accept"|"investigate"|"defer",owner,note,reviewer,parentId:null|latestReviewId}. Appends complete named history; observation is not overwritten.

Read API:
* inspectSource(w,sourceId,{format:"json"|"csv"|"tsv",arrayPointer?}) -> {source,format,columns,rows:[{row:1,values,originalText,sourceRef}],findings}. JSON `values` are full typed nodes, not rounded JS data; CSV cells are strings. Retain whole source.
* inspectImport(w,importId) -> {record,scope,kind,externalImportId,rows:[{row:1,values:<typed-object-node>,originalText,sourceRef}],metadata,findings}. Field UI should render via scalarText(node) or node.value; originalText is complete row JSON reconstructed without number rounding.
* previewMapping(w,input) -> {sha256,body:{...mapping input},import:record,rows:[{row,key,keyComplete,fields:[{id,label,sourcePointer,targetPointer,mode,value:<typednode>|null,present}],findings}],findings}.
* previewBatch(w,input WITHOUT previewSha256) -> {sha256,body:{...input,rows:[{row,action,targetId,reason,key,fields,sourceRef}],scope,importId,importSha256,mappingSha256,findings},ready:boolean}. Save requires ready and exact hash.
* previewReconciliation(w,input WITHOUT previewSha256) -> {sha256,body:{...input,batchSha256,scope,rows:[{rowId:"row:1",row,action,targetId,status,providerOutcome,fields:[{id,label,status,expected,actual,detail}],sourceRef,receiptRef,readbackRef,findings}],counts,coverage,findings}}. Statuses matched/divergent/rejected/uncertain/unobserved/skipped. No current-live-state claim from a retained readback.
* suggestPairs(w,leftId,rightId) -> {pairs:[{leftRow,rightRow,note}],ambiguous,unmatchedLeft,unmatchedRight}; only exact unique explicit source-key tuples.
* previewComparison(w,input WITHOUT previewSha256) -> {sha256,body:{...input,rows:[{rowId:"pair:1",leftRow,rightRow,left,right,change,sourceChanged,targetChanged,note}],unmatchedLeft,unmatchedRight,counts,findings}}.
* report(w,{reconciliationId?,comparisonId?}) -> {schema,workspace,selected:<full body>|null,rows:[{...selectedRow,latestReview,reviewHistory}],sources,operations,limitations}. No selected ID gives overview of retained records/counts.
* csv(report) -> complete RFC4180 string over selected rows, exact node displays and decisions.
* handover(w,selection) -> {working:<complete export envelope>,report,originalFiles:[{path,content,bytes,sha256,name}],records:<all full collections>}. UI owns ZIP/source manifest; originals use immutable hash paths, names remain metadata.
* scalarText(node) -> exact human text; exactJSON(node) -> original-value JSON with exact numeric tokens.

Typed nodes: {type:"null",value:null}, {type:"boolean",value:boolean}, {type:"string",value:string}, {type:"number",value:originalLexeme}, {type:"array",items:[]}, {type:"object",entries:[{key,value}]}.

Host receipt source contract (authored adapter contract, NOT a claimed Filio API):
{schema:"tjlabs.import-host-result.v1",batchId,batchSha256,scope:{application,tenant,environment,templateId},attemptId,observedAt,providerReference,rows:[{row:1,status:"accepted"|"rejected"|"uncertain"|"not_attempted",targetId:null|string,error:null|string}]}
One result per original row maximum; missing rows stay unobserved. Accepted requires actual target ID. Receipt records are user-retained actual evidence; examples explicitly authored. No guessed webhook verification or retries.

Readback source:
{schema:"tjlabs.import-host-readback.v1",scope,observedAt,coverage:{kind:"selected_records",requestedIds:[actualIDs]},records:[{id:string,values:<complete host object>}]}.
Duplicate target IDs make observation ambiguous; missing requested IDs remain unobserved. Whole-target completeness never inferred. If readback precedes receipt, result is unobserved with explicit stale-observation finding. Exact host scope must match.

Original official-source uncertainty: homepage `publishableKey` differs docs `apiKey`; selected released SDK must settle it. Signature header/algorithm/raw-body rules/retries/order/idempotency are not specified publicly. The offline product does not make credential or live POST calls.
