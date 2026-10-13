# Native Flowable task forms

Operation: FLOWABLE-NATIVE-TASK-FORMS-B43A-20261013.

This module completes a saved, reviewed native BPMN task form through the existing Flowable workspace. It preserves the original raw task actions. It creates no engine, scheduler, authentication route, queue or alternate form service.

## Native authority and scope

The selected engine is Flowable 8.0.0 at commit 0779d68e5a3385b74d8acb8bc37901ff54513249 in https://github.com/flowable/flowable-engine.

The exact controller is modules/flowable-rest/src/main/java/org/flowable/rest/service/api/form/FormDataResource.java, blob f4cd357c809049047ed83a3fcf1d03d3da5019d6. GET /form/form-data?taskId=ID invokes original FormService.getTaskFormData. POST /form/form-data receives {taskId,properties:[{id,value}]} and invokes submitTaskFormData. The task response is HTTP 204 with an empty body.

FormServiceImpl (4e92d6afbab31170d1ced251c0f0d18ccc4523e8) calls SubmitTaskFormCmd with completeTask=true. The original command records submitted properties, runs the selected native handler, and completes the task if that handler exists. It does not expose a save-without-completion operation through this REST controller. A native 204 alone is an accepted submission; this integration additionally reads actual task history before labelling completion confirmed.

The interface operates BPMN form properties. A formKey is retained as data, never executed as an external URL or assumed to describe a modern Flowable FormEngine model. An empty form-property list is an exact empty response; it is not a missing schema filled with guessed fields. Custom handlers and custom form types remain engine-owned.

## Complete native capture

captureFlowableTaskForm(transport,{taskId,...callbacks}) and readFlowableTaskFormState(transport,planOrTaskSelection,callbacks) return:

- schema: stellar-forge.flowable-task-form-native-state.v1
- connectionId, connectionSha256, taskId and observedAt.
- task: the exact selected runtime task object, or null.
- form: the complete original native form JSON, or null if unavailable.
- formStatus, formObservation and availability.
- nativeState: the original native.mjs selected-task readback, including task/process/history/variables, complete original deployed definitions/resources and exchanges.
- resources and exchanges through the unchanged original immutable sinks.
- atomicSnapshot:false and sourceCompleteness:NATIVE_READABLE_PROPERTIES_ONLY.

The original complete-task reader is reused only as a readback selector. Its transport is guarded to permit GET only. The internal read selector is never dispatched as a complete-task action. The form GET is separately retained with complete bytes and response identity. A form error remains the actual native response, with no substituted field schema. A task can change between individual reads; preparation and dispatch must re-read and compare the exact selected identity.

flowableTaskFormStateIdentity(state) returns {connectionId,connectionSha256,taskId,task,form}. It removes only observation times and exchange metadata; it retains the complete task and form content. The original workspace binds the immutable capture ID and revision. The native POST does not include those local identifiers.

describeFlowableTaskForm(state) returns the source identity hash and full property descriptors. Each descriptor retains native metadata and an explicit control mode. Read-only values stay visible. A native-text mode is declared for unsupported or custom property types, with no claim of local typed validation.

## Field semantics

Every submitted value is an original JSON string or null. JavaScript numbers, booleans and Date objects are rejected by the planner rather than silently converted. Input order and exact selected property strings are retained in the submitted JSON.

| Native type | Guided representation | Wire and native behavior |
| --- | --- | --- |
| string, or no declared type | Text plus explicit omit/null choice | Exact string or null. Empty string remains empty. |
| long | Decimal text input | Optional sign and exact signed 64-bit range; no JS Number conversion or rounding. Empty string/null uses the native null conversion. |
| boolean | Explicit true, false, empty or null | Strings "true", "false", "" or null. Do not use a checkbox that collapses omitted/null into false. |
| enum | Exact native option IDs with original names/order | The ID is submitted, never its label. Null is distinct. Empty text is valid only when it is an actual option ID. |
| date | Exact text plus original datePattern | The original Java FastDateFormat parser, server locale and timezone own conversion. No ISO rewriting, local timezone or HTML-date assumption. Empty text/null uses native null conversion. |
| unsupported/custom | Clearly labelled native text | Exact string/null only. Preserve original type and metadata, and explicitly state that validation/conversion is performed by the installed native handler. |

The guided long control deliberately accepts decimal ASCII signed-long text. Native Java may accept additional numeric spellings; those are not presented as validated guided inputs. The separate raw native actions remain available without modification. Dates and custom types can return a native validation error even after local preparation. That error is retained with the original operation.

The original BooleanFormType uses Boolean.valueOf for arbitrary nonempty text. The guided control restricts inputs to explicit true/false instead of silently turning an unexpected word into false.

DefaultFormHandler initializes GET properties only for handlers marked readable. Hidden/unreadable property metadata is not exposed by this endpoint. Do not infer hidden IDs, defaults or names from other variables.

FormPropertyHandler rejects writing a readonly property. The planner rejects such a write before any dispatch. It also rejects duplicate property IDs and IDs that were not part of the captured response. The native controller would otherwise put duplicate IDs into a Map and could silently keep one; this interface retains one explicit selected row per ID.

Required has precise native semantics: the handler checks key presence, unless an unexposed defaultExpression exists. It does not uniformly reject null or empty strings. Omission may invoke a default expression; a displayed current value does not establish a default. Therefore the planner retains a warning for a required omitted property, but does not invent a definitive default or block the native request. The engine remains authoritative.

Omission is absence from properties. Null is {id,value:null}. Empty is {id,value:""}. Preserve all three independently in working copies, imports, review and response history.

## Stable adapter ABI

- planFlowableTaskFormRequest(connection,{taskId,properties},capturedState)
- validateFlowableTaskFormPlan(connection,plan)
- createFlowableTaskFormTransport(connection,originalTransportOptions)
- executeFlowableTaskFormRequest(transport,plan,callbacks)
- readFlowableTaskFormState(transport,planOrTaskSelection,callbacks)
- captureFlowableTaskForm(transport,{taskId,...callbacks})
- flowableTaskFormStateIdentity(state)
- describeFlowableTaskForm(state)
- reconcileFlowableTaskFormRequest(plan,before,after,response)

A task selection for read is exactly {taskId}. A saved plan uses action submitTaskForm and schema stellar-forge.flowable-task-form-native-request.v1. It binds original connection, engine version/commit, exact selected task, full captured identity and SHA, complete formSnapshot and SHA, selected properties, warnings, POST route and exact UTF-8 JSON bytes/Base64/SHA. The standard requestSha256 uses the unchanged native request identity algorithm. Complete plan validation reconstructs the same plan and checks every field.

Callbacks follow existing native.mjs: signal, retainBodies, onExchange and onDefinition. Full original exchanges and deployment resources use the existing immutable workspace sinks. The adapter does not create a competing source store.

## Original workspace writer contract

The agreed workspace record kinds are taskFormCapture and taskFormOperation.

- captureTaskForm({requestId,connectionId,taskId,label?,note?})
- readTaskForm({id,revision?})
- prepareTaskFormOperation({requestId,connectionId,captureId,captureRevision,selection:{taskId,properties:[{id,value}]},label?,note?})
- dispatchTaskFormOperation({requestId,id,expectedRevision,planSha256})
- The existing reconcileOperation uses kind taskFormOperation.

Preparation reads the selected exact saved capture revision. Its connection and task must match the submitted selection. It captures the current original form, compares flowableTaskFormStateIdentity against the saved capture, then plans the exact request with that capturedState as the third argument. A changed task/form requires a fresh explicit capture and review; it must not silently retarget the user's fields.

Dispatch retains its original mutation request and durable DISPATCHED state, re-reads current identity for the existing preflight, and only then invokes the exact reviewed POST. Durable provider response retention must precede reporting completion. A lost result resumes the same local operation and performs read-only reconciliation. It never issues another form POST based on task absence, a missing response or matching variables.

## Reconciliation and actual outcomes

A matching complete HTTP 204 empty response establishes native acknowledgment. The exact selected task absent from runtime, present in original history with endTime, allowed completion reason and same original process ID establishes CONFIRMED with that response. Native acknowledgment without complete task-history correspondence is ACCEPTED; history settings and custom handler behavior remain explicit.

A complete recognized native client rejection is REJECTED and retains its error. A missing, interrupted or ambiguous response is UNKNOWN even when the task disappears or variables resemble the submitted values. This protects against another user having completed the same task. Every state retains before/after native material and original request/response. replayAllowed is always false at this adapter boundary.

The source GET observations are not a global atomic snapshot. Native listeners can alter variables and advance processes when submission completes. No numerical variable match is claimed as proof that a form string became a particular value; original lossless variable evidence is retained for inspection.

## Installed workflow and complete receiving

Use the existing operator to capture an actual selected task, inspect all property definitions and source details, author the explicit value modes, prepare, review the exact body/warnings, and submit once through the original journal. Read the native task/history result, source exchange and full request. Preserve raw task-action controls alongside this feature.

The whole installed delivery must include adapter, original writer integration, operator page/controller, typed client, CLI/MCP, managed asset inventory and source distribution. Exports and receiving use the existing complete Flowable workspace envelope and store, with all capture and operation revisions, exact requests, responses and original sources. A cold receiver must open the saved form and submitted operation without a live engine and reproduce its complete original bytes.

The actual operating course must use the pinned original engine and retained original NDJSON/runtime input on the original receiving owner. An isolated genuine demonstration process can define supported form properties, readonly/hidden fields and explicit enum/date options, with its complete BPMN source and hash retained. It must not manufacture a customer task or automatically submit a production task. Existing physical process ownership and jobs remain unchanged.

At minimum, operate string/long values beyond JS safe-integer precision, explicit booleans, enum IDs differing from labels, original date pattern, readonly view, null/empty/omit distinctions, native rejection retention, unchanged pending request recovery, saved field-definition changes, all full downloads and cold reopening. A typed preparation is source-level validation; do not label the actual native/browser run complete until its real output exists.

The operator follows the complete current AGENTS rendered-product instruction supplied with the original receiving course: open, look at and use actual desktop/narrow pages, all generated/downloaded files and states, preserve screenshots and literal output; natural voice applies if a recipient-facing video is produced. Source checks never substitute for that actual run.

## Source and ownership

Scout owns this adapter and pinned-source contract. B43A root owns the original model/actions/review integration. Flowable delivery owns complete operator/SDK/CLI/MCP/installed joins. D76C retains original programme, installation/commercial and source integration custody. Canonical Sales thread 1791821323.519669; TAKE 1791923840.502459. No second runtime or receiving request is created.

Preserve TJLabs and all upstream notices. Original Flowable Java files retain Apache 2.0 notices. Product implementation follows its original MIT source. No customer-specific or reusable sales material belongs in the public source.
