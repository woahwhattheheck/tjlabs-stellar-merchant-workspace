# PrivacyBench native workspace API

## Factories and original source

Load src/native-research.js, src/native-privacybench.js and src/privacybench-workspace.js as trusted static scripts. They define createNativeResearch({codec}), createNativePrivacyBench({codec,nativeResearch}) and createPrivacyBenchWorkspace({codec,nativePrivacyBench,nativeResearch}). The codec supplies utf8Encode, utf8Decode, sha256Bytes, toBase64 and fromBase64.

The portable PrivacyBench factory extracts complete existing pure projection and materialization functions from the retained 21,352-byte installed adapter. It does not reproduce or execute Tonic's evaluator. The original Research factory and full contracts/preparation/review sources are retained unchanged. The original authored native fixture reproduces all 34 rows and the exact 113,290-byte native Research run, SHA256 b9154345d459a7905bdbd7623fc522c4fc9b9d6b5b73551fbb744a9b2baf42b2.

## Workspace and operation custody

create({id,label,createdAt}) is synchronous. All mutation, validation, import/export, preparation, reports, handover and return operations are async. latestReview, csv, digest and selectionTemplate are synchronous.

The workspace schema is tjlabs.privacybench-workspace.v1 and has id,label,createdAt,revision,sources,selections,editions,comparisons,reviews,adoptions,operations. Every collection contains {id,body}. Saved selection/edition/comparison bodies are {input:<exact selected input without previewSha256>,previewSha256}. Source body is {name,role,mediaType,contentBase64,bytes,sha256}. Review body is the full review input. Operation records retain the exact original request, result and revision. IDs are opaque; use hashed portable archive names.

apply(workspace,{id,type,actor,at,input}) returns {workspace,result:{collection,id},replayed}. actor accepts a nonempty string or {id,name}; at is an exact ISO UTC timestamp. The unchanged same-ID request replays without mutation; changed reuse rejects. Never invent observed run metadata from operation time. All operations are append-only and validation replays every original request. Keep the exact pre-operation workspace until apply and UI delivery-size admission both succeed.

exportWorkspace returns {schema:"tjlabs.privacybench-working.v1",sha256,workspace}. importWorkspace accepts that object or its JSON text, checks the checksum, and replays its full operation history. The source bound is 32 MiB per original and the complete serialized workspace bound is 64 MiB; portable UI additionally admits its complete generated deliveries before committing.

## Source and selected metadata

source.add input: {name,role,mediaType,contentBase64}, with role results|summary|viewer|configuration|notes|support|prior_review. Exact text may be supplied as text instead of contentBase64, never both. Full UTF-8 roundtrip is checked. Binary support files remain binary. Result JSON must pass the original strict duplicate-key parser; no metric values are inferred.

selectionTemplate() returns a complete deep copy of the ORIGINAL authored selection fixture, including schema, results and originals. It is explicitly a software fixture and is never a default claim about an operator's own result. Use its exact eight criteria as native definitions; enter the operator's genuine dataset/cohort, protocol, candidate, engine, timestamps and run metadata. Imported complete selection JSON can populate a new draft. Build source result/original descriptors from the selected immutable sources, not from copied file paths.

selection.save input:
{label,resultId,originalBindings:[{sourceId,id,path,role,mediaType}],dataset:{id,revision},cohortRef,protocol,candidate,run,reviewer,reviewedAt,parentId,previewSha256}.
parentId is null or an existing selection ID. protocol, candidate and run are the complete maintained Research contract objects. All eight exact PrivacyBench criteria are required. run.kind is IMPORTED_MEASUREMENT or TRAINING_FIXTURE. Additional selected originals are checked and retained by original bytes, source ID, caller-selected artifact ID/path/role/media type.

previewSelection(workspace,input without previewSha256) returns {sha256,body,table,review,run,plan,nativeSelection,files}. table is {csv,rows,review}; table.rows are the exact original native metric records. review is the actual maintained Research preparation review. run is the actual maintained Research envelope. files are {path,name,bytes,sha256,contentBase64}. The body is normalized input without previewSha256. sha256 binds the input, original selected file identities, exact native table and generated Research run.

## Editions

edition.save: {label,selectionId,parentId,previewSha256}. parentId is null or an existing edition ID.
previewEdition(workspace,input without previewSha256) returns the same prepared fields plus selection:<saved record>; body is {label,selectionId,parentId}; sha256 binds that body and the complete selected preparation.
inspectEdition(workspace,editionId) adds edition:<saved record> and verifies all saved derivation identities. Access metric rows through result.table.rows, exact selection through result.selection.body.input, Research result through result.run.

Every row preserves:
dataset_id,dataset_revision,dimension,group,label,measure,criterion_id,value,unit,definition,denominator_name,denominator_value,original_gold,original_detected,judge_skipped,overlap_threshold,cohort_ref,source_pointer,source_run_name,undefined_reason.

value is the original JSON number token as a string. Unavailable native rates use value:"" and their original explanation. Zero is not missing. No pooled metrics, denominators, averages, recall or synthesis rates are recomputed. Full original JSON remains retained. Individual unjudged spans remain in the detected denominator; a globally skipped judge makes relevant native rates unavailable.

## Comparisons

comparison.save input:
{label,leftId,rightId,basis:{dataset,cohort,protocol,judge,rationale},reviewer,note,previewSha256}.
Each basis choice is same|changed|unknown. Distinct saved editions are required. rationale and note must be nonblank.
previewComparison returns {sha256,body,rows,unmatchedLeft,unmatchedRight,caveats,observed,left,right}. left/right summary is {id,label,sha256}.
Each paired row is {id,key,dimension,group,label,measure,left,right,change,delta,deltaReason,comparable,reason}. left/right are the exact original native rows. key is the full [dimension,group,label,measure] tuple, not a display label. Missing groups remain in unmatchedLeft/unmatchedRight.

change is increased|decreased|equal|unavailable. delta is an exact decimal subtraction string, or null when unavailable/expansion exceeds the display bound. It is not a recomputed rate. The original tokens are always retained. comparable requires every declared basis to be same AND retained dataset/cohort/protocol/native config to agree. Native config comparison preserves numeric lexical identities and all unknown settings. It excludes only run_name and the known input location keys predictions, ground_truth and characters. Full original paths remain retained provenance. n_rows and scoring/judge settings remain comparison constraints. Equal or different paths never establish dataset equivalence; the dataset revision/cohort declarations and selected original bytes remain explicit. No row is labelled improved/regressed. Display caveats visibly and retain explicit comparison basis.

## Named review and reviewer returns

review.save input:
{subject:"edition"|"comparison",subjectId,target,status:"open"|"accept"|"investigate"|"defer",owner,note,reviewer,parentId}.
target is "all", an exact edition row source_pointer, or a paired comparison row ID. parentId must be null for the first review of this target or exactly the latest review ID. Explicit acceptance is a named reviewer state, never an evaluator/privacy conclusion.
latestReview(workspace,{subject,subjectId,target}) returns the latest full record or null.

exportReviewReturn(workspace,{subject,subjectId}) returns a checksum-bound tjlabs.privacybench-review-return.v1 object containing workspaceId, exact subject identity/digest, complete selected review record history and sha256. Export its whole JSON for review return.

Import the EXACT returned JSON as source.add role prior_review. previewAdoption(workspace,{returnSourceId,reviewer,note}) returns {sha256,body,additions,alreadyPresent,subject,subjectId}. It checks return checksum, workspace and immutable subject, every selected target, all review IDs and exact per-target parent chains. review.adopt takes the same input plus previewSha256. It atomically retains original review records, adds an adoption record, and preserves the full returned original bytes. Already-present exact records are recognized. A conflicting local latest review or reused ID rejects before mutation; retain the returned source for explicit resolution.

## Reports and Research

report(workspace,{subject,id}) returns {schema,workspaceId,workspaceSha256,subject,record,data,reviews,history}. data is the full prepared edition or comparison. reviews contains latest named review per target, history contains every selected review revision. csv(report) includes exact values, denominator/null contexts and latest review; comparison CSV retains unmatched-left/right rows explicitly.

prepareResearch(workspace,{editionId}) returns {workspaceSha256,editionId,files,run,review,plan}. files contain complete UTF-8 {path,content,bytes,sha256}; the complete selected binary/text originals are losslessly included in original/complete-original-files.json. The package includes the exact native Research run/review, selected plan, current whole working history, named review report and a manifest. Named workspace review does not silently become a Research judgment or acceptance. Use the original installed Research original-output import for run.json.

Preparation is bound to the entire workspace digest. UI must reject a stale prepared download after any domain operation or working-copy switch, and bind the selected edition. Preserve the previous prepared result on failure, but never silently download it as current.

handover(workspace) returns {workspace:<export envelope>,originals:[{id,name,role,mediaType,contentBase64,bytes,sha256}],editions:[full reports],comparisons:[full reports],reviews,adoptions}. The operator assembler adds current full application source and editable draft/page, safe hashed filenames and a manifest. Complete original names belong in metadata/indexes, not untrusted ZIP path segments.

## Authored execution and limits

examples/complete-authored-workspace.json is the complete nine-operation baseline: two original software-only result inputs, two selections, two editions, one comparison and two named review revisions. examples/reviewer-return.json is a later independent authored return; examples/returned-adopted-workspace.json preserves actual return intake/adoption.

receiving/source-exercise.json records production execution with explicit maintained V8 byte adapters. It verifies original34-row/native-run identity, exact reopen, same-ID replay, observed comparison changes, full Research preparation, one exact reviewer addition, two existing reviews, and rejection of changed source/checksum, stale preview, conflicting operation ID and divergent return parent. It does not claim an actual browser/native host or Tonic model/evaluator run.

## Native source receiving

Run `node commissioning/receive-privacybench-domain.mjs /absolute/owned-output` from the materialized complete application. It uses actual Node and the same complete production factories, preserves every original request, prepares both full Research editions, adopts the actual authored return and independently reopens the result. Exact existing output bytes are accepted on resume; conflicting files are preserved and rejected. No browser/evaluator/provider execution is implied by this domain course. The operator's separate complete browser course covers real controls and editable reopening.

The read-only native CLI is `node native/privacybench-workspace.mjs inspect INPUT`, `receive INPUT OUTPUT`, `apply INPUT OUTPUT REQUEST`, `research INPUT OUTPUT_DIRECTORY EDITION_ID`, or `report|review-return INPUT OUTPUT edition/ID|comparison/ID`. Input accepts the core working envelope or the complete editable wrapper.

Preparation cache entries bind workspace identity, all complete selected metadata and every selected original body. Returns are cloned; externally changed bytes or metadata produce a new key and full native validation. Cache is bounded to 32 entries /64 MiB, with individual entries at most8 MiB. Cached derivations do not cache current named review or complete workspace history. Native file location strings are retained as provenance; different prediction directories are not scoring changes. Different original gold populations disable row comparability, while a candidate's different detected count remains a valid observed outcome.
