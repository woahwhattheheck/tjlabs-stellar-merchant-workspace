# Native command contract

The native inspect command returns the current revision and sha256. Every original command is a complete JSON object with id, kind, value, actor, at (real ISO timestamp with timezone), expected_revision and expected_hash. Retain it unchanged for retries. IDs use letters, numbers, dot, underscore, colon and hyphen, starting with a letter or number, up to 180 characters. Source and report export paths are hash-derived and indexed.

## Original

add_original value: {id,name,media_type,data,description,origin}. data is canonical base64. Native import-original supplies name and data from an actual file and takes the other fields from the command specification. The original bytes are immutable; a correction uses a new original ID.

## Reference

save_case value: {id,title,scope,authored,reference_owner,expected_case_hash?,steps}. Each step has {id,title,scenario,input_refs,expected}. References are {original_id,locator}. expected has bindings [{document,shipment}], fields [{shipment,field,value:{type,text},owner}], and gates [{shipment,gate,status,missing:[fieldName]}]. Types are string, number, boolean and null. For null use empty text. For numbers preserve the exact JSON literal. Owners are proposed, human_edited, locked or unknown; gate status is ready, blocked or unknown. Existing case edits require expected_case_hash from core.caseBasis(case).

review_case value: {id,expected_case_hash,status,reviewer,note,source_refs}. Status is approved or changes_requested.

## Output mapping

save_contract value: {id,title,edition,notes,expected_contract_hash?,bindings,fields,gates}. Each section has list (JSON Pointer to array) and columns (relative JSON Pointers). Binding columns: document,shipment. Field columns: shipment,field,value,owner. Gate columns: shipment,gate,status,missing. The fields and gates sections may also contain values [{observed,canonical}] for explicit state aliases. The prior mapping hash for edits is core.hash(mapping).

## Run and capture

create_run value: {id,case_id,method,product_edition,scope}. The selected reference must be approved. The run freezes it.

add_capture value: {id,run_id,step_id,original_id,contract_id,observed_at,transport_note}. The original must contain exact UTF-8 JSON. This selects the new capture for its checkpoint; prior captures remain.

select_capture value: {run_id,capture_id}. Selection is limited to the same run and expires the current review.

review_run value: {id,expected_run_hash,status,reviewer,note,source_refs,dispositions?}. Status is accepted or changes_requested. expected_run_hash comes from core.runBasis(workspace,run). Every checkpoint must have a selected capture. When supplied, dispositions contains one row for each current finding: {finding_id,status,owner,note}. Status is needs_change, accepted_exception or investigate. The browser supplies these rows.

## Effort

record_effort value: {id,run_id,phase,performer,started_at,ended_at,active_seconds,comparable,note,source_refs}. Phases are intake, review, correction or handover. Seconds must be a nonnegative integer within the interval; a performer's records cannot overlap. Comparisons require the same frozen case, all records explicitly comparable, and matching phase sets.

## Receiving APIs

runtime/shipment-runtime.cjs exports {core,codec,zipper}. core exports blank, apply, validate, hash, caseBasis, runBasis, reportRun, effortReport, exportFiles, observations, parseJsonExact, pointer, value, csv. validate replays all original commands by default. apply is immutable and returns current state for an exact historical request retry. Keep full imported sessions in the browser; native CLI deliberately requires the workspace-only carrier.
