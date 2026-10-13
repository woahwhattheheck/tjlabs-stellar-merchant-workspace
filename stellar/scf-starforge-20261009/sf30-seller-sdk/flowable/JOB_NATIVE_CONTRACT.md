# Flowable job native contract

`job-native.mjs` implements the pinned Flowable 8.0.0 job-controller contract through the original `native.mjs` connection, transport and durable response sinks. The operator workflow is documented in `products/flowable-merchant/JOBS.md`.

## Native actions

| Collection | Original actions | Engine behavior |
| --- | --- | --- |
| Executable jobs | Execute; delete | Execution calls the native management service. Deletion removes the job. |
| Timer jobs | Move; reschedule; delete | Move makes the timer executable. Reschedule passes the exact supplied date string to the native time-date rescheduler. |
| Suspended jobs | Delete | This job controller exposes deletion. Process/case suspension and activation remain their own native operations. |
| Dead-letter jobs | Move using native job type; move to history; delete | The engine uses its own job type and configured retry count. The normal move may route to executable, history or external-worker work. |
| History jobs | Execute; delete | These actions operate the native history job, including its retained advanced handler configuration. |

The pinned single-job controller returns HTTP 204 with an empty body when it acknowledges these actions. The adapter does not add a client retry-count field: the controller selects the configured executor retry count itself. A forced history move is subject to the engine's actual history-job type check.

The pinned job REST response omits the private engine job type. The UI therefore labels the normal dead-letter move **Move using native job type**. It does not guess the destination from the exception message or the visible job fields.

## Original exceptions and complete capture

The adapter follows native pagination until each reported total is reached. It rejects repeated IDs, changing totals, incomplete pages and invalid page shapes. It retains every HTTP exchange through the original workspace sink, including unsuccessful reads.

After listing each queue, it fetches every single-job response. This matters for history jobs because the single-job controller fills in advanced handler configuration that is absent from the ordinary list response.

For executable, timer, suspended and dead-letter jobs, it fetches the complete native exception-stacktrace endpoint. HTTP 404 can mean that the job has no stacktrace or that it disappeared while the engine advanced. The exact response remains in the journal; the UI describes the observed absence. History jobs have no stacktrace endpoint in this pinned BPMN controller. Their original detail, exception message and handler configuration remain available.

The captured exceptions carry their collection and job ID, complete bytes, content type and SHA-256. Workspace storage retains both the raw text file and its resource description. The job inspector can read and download the original text.

A queue capture is a sequence of engine observations. It is explicitly non-atomic. If a listed job disappears before its detail can be read, that capture is interrupted and its original pages remain available. Continuing an interrupted capture uses the existing capture request and journal.

## Understand the saved result

| Result | Meaning |
| --- | --- |
| CONFIRMED: execute | The exact native execution request has its original complete HTTP 204 response. The review separately retains current queue observations. |
| CONFIRMED: reschedule | The exact native reschedule request has its original complete HTTP 204 response. The requested date text and observed timer date are both retained. |
| CONFIRMED: delete | The exact native deletion has HTTP 204 and the job is absent from the selected queue at readback. |
| CONFIRMED: move | The exact native move has HTTP 204, the source queue is empty for that ID, and the same ID is observed in the supported destination. |
| ACCEPTED | The engine acknowledged the request, but the current observation does not establish the expected destination or disappearance. |
| REJECTED | The original engine returned a retained request rejection, including its error body. |
| UNKNOWN | The original successful response is missing or incomplete, or an execution error leaves the outcome unresolved. Current reads and original partial responses remain available for reconciliation. |

Flowable copies the job ID when moving between the queues inspected here. The adapter reads the selected ID in all five queues after dispatch. A fast executor can consume a moved job before this readback. The pinned job manager can also return from a move without inserting a destination, while the controller still returns 204. For those cases, the review preserves the acknowledgement and current observations as ACCEPTED.

The normal dead-letter move can route external-worker jobs to the native external-worker queue. That destination is outside the five collections of this job-controller view. The review names that possible native route and retains the acknowledgement; it does not label the job executed merely because it vanished.

An UNKNOWN mutation is reconciled through the original journal and fresh readback. Reconciliation reads; it does not submit the mutation again. If a transport error occurs after dispatch, the original request remains the operation being resolved.

## Adapter interface

The module exports:

- FLOWABLE_JOB_COLLECTIONS: jobs, timerJobs, suspendedJobs, deadLetterJobs, historyJobs.
- FLOWABLE_JOB_ACTIONS: an immutable map from those collections to their native action names.
- planFlowableJobRequest(connection, selection).
- createFlowableJobTransport(connection, options).
- executeFlowableJobRequest(transport, plan, sinks).
- captureFlowableJobPortfolio(transport, sinks).
- readFlowableJobRequestState(transport, plan, sinks).
- flowableJobStateIdentity(state).
- reconcileFlowableJobRequest(plan, before, after, originalResponse).

A selection contains exactly collection, jobId and action. Only the reschedule action additionally contains dueDate. Unknown fields and unsupported queue/action pairs are rejected. IDs are encoded as individual native path components. The complete saved plan is reconstructed and compared before dispatch; method, path, original request bytes, connection and readback identity must still match.

A portfolio contains collections[name] with complete items, pages, total and complete fields; resources; exceptionObservations; and original exchanges. History single-job details retain advancedJobHandlerConfiguration when the controller supplies it. Its overall atomicSnapshot value is false.

A selected state contains collection, jobId, action and an array for each of the five queues, plus complete original resources, exceptionObservations and exchanges. Native job IDs are read in every supported queue. A missing ID is retained as the original HTTP 404 response.

Each exception resource carries kind=job-exception-stacktrace, collection, jobId, filename, contentType, bytes, sha256 and its full original contentBase64 or immutable definitionRef. The existing onDefinition sink stores the original text and complete resource description. The existing onExchange sink retains the full original HTTP exchange. With both sinks supplied, retainBodies defaults to false so capture metadata references those original blobs.

Selected-state identity binds the original connection, selected queue/ID/action, complete selected job object, stacktrace availability and the bytes/hash of a found exception. It excludes observation timestamps, exchange UUIDs, headers, unrelated queue observations and volatile bodies of 404 error responses. The full 404 bodies still remain in the original response journal.

Native transport failures preserve their original partial exchange and outcomeUnknown flag through executeFlowableRequest. Sink failures likewise retain the original received exchange on the error. The workspace owns durable dispatch state and the exact original request ID; this adapter does not create another dispatch scheduler.

## Source and operating verification

The adapter is pinned to Flowable 8.0.0 commit 0779d68e5a3385b74d8acb8bc37901ff54513249, matching native.mjs. Its contract was read from original controllers and the actual job manager:

- [JobResource.java — actions, HTTP statuses and configured retry counts](https://github.com/flowable/flowable-engine/blob/0779d68e5a3385b74d8acb8bc37901ff54513249/modules/flowable-rest/src/main/java/org/flowable/rest/service/api/management/JobResource.java)
- [JobExceptionStacktraceResource.java — original stacktrace routes and 404 behavior](https://github.com/flowable/flowable-engine/blob/0779d68e5a3385b74d8acb8bc37901ff54513249/modules/flowable-rest/src/main/java/org/flowable/rest/service/api/management/JobExceptionStacktraceResource.java)
- [JobCollectionResource.java — complete executable-job pagination](https://github.com/flowable/flowable-engine/blob/0779d68e5a3385b74d8acb8bc37901ff54513249/modules/flowable-rest/src/main/java/org/flowable/rest/service/api/management/JobCollectionResource.java)
- [HistoryJobCollectionResource.java — original history-job inventory](https://github.com/flowable/flowable-engine/blob/0779d68e5a3385b74d8acb8bc37901ff54513249/modules/flowable-rest/src/main/java/org/flowable/rest/service/api/management/HistoryJobCollectionResource.java)
- [TimerJobActionRequest.java — exact native dueDate string](https://github.com/flowable/flowable-engine/blob/0779d68e5a3385b74d8acb8bc37901ff54513249/modules/flowable-rest/src/main/java/org/flowable/rest/service/api/management/TimerJobActionRequest.java)
- [DefaultJobManager.java — actual queue transitions, copied job IDs and external-worker routing](https://github.com/flowable/flowable-engine/blob/0779d68e5a3385b74d8acb8bc37901ff54513249/modules/flowable-job-service/src/main/java/org/flowable/job/service/impl/asyncexecutor/DefaultJobManager.java)

The source review covered the native adapter, editor, storage joins, review, action routing, static serving, source distribution, CLI and typed client. A focused V8 contract execution exercised all eleven supported action/queue pairs, complete paginated capture, original exception sinks, history detail, changed preimages, exact-plan rejection and retained uncertain mutations through the unchanged original response wrapper. That run used explicit HTTP fixtures and a fixed declared connection.

The native producer course runs the actual pinned engine with retained settings and isolated demonstration processes, then uses the application at desktop and narrow sizes, opens its downloaded working files, exports the workspace and receives it independently. Its report records the actual commands, original request/response files, engine settings, views and resulting artifacts. Use the producer report from the same delivered edition when assessing the completed native operating course.
