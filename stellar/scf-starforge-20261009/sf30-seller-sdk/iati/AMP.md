# AMP programme commissioning

This application continues the original IATI finance workspace into an installed Aid Management Program workspace. It retains original publisher XML, native IATI financial editions, complete AMP field and possible-value responses, full native projects, reviewed mappings and decisions, actual native receiving, and subsequent publisher editions.

Open **AMP commissioning** in the existing IATI browser. The same saved work is available through the original Python CLI, IatiWorkspaceClient and Merchant source tools.

## Work through a country programme

1. Receive the complete original IATI activity XML through Publisher sources. Save the programme portfolio and its revision in Portfolio review. The original XML/SF30 engine produces the actual activity, transaction and budget editions.
2. Capture the selected installed AMP programme. Use the installed REST base, workspace ID, version and existing login, and the complete project IDs selected in its original export or programme view. The operation receives the actual user, layout, field tree, all destination possible values and every full selected project.
3. Create a commissioning plan from the saved portfolio revision and native capture. Map each publisher/activity to its existing native project or a complete new project draft. Select installed currency IDs and the actual financial category for outgoing commitment, disbursement and expenditure.
4. Review the full programme scope. Financial review provides exact original amounts, dates, financial families, source identifiers and complete records. Open the native funding register to select existing funding/transaction IDs. Use explicit donor and funding configuration for new records. A common decision can be applied to the complete previewed programme or financial group.
5. Save the named financial review and prepare the complete native project requests. The original source capture, full preimages, original project versions, complete new request bodies and every financial change remain retained.
6. Run the prepared native operation with the existing AMP login. The worker retains its run before the first native request, checks the original account/workspace/version and configuration, rereads the current project before update, and receives the actual resulting project after each request.
7. Download the complete application handover. Receive it into a second existing IATI workspace, open AMP commissioning and continue the same original records and native history.
8. For the following publisher edition, retain its actual XML, save its portfolio and capture the current AMP projects. **Following publisher edition** carries actual confirmed native IDs into unchanged records. Changed or newly identified rows retain their complete comparison and explicit decisions.

## Native meaning

The financial source is the original IATI native CSV edition produced by iati_source.py and the SF30 dataset handler. Source amounts retain decimal text. The AMP encoder uses Python Decimal through native JSON emission. A numeric change made by the installed destination is visible in the receiving comparison.

Each amount group retains reporting organisation, hierarchy, currency, valuation date, financial family and budget period. IATI types 2,3 and4 correspond to outgoing commitment, disbursement and expenditure. Each type selects the actual installed adjustment category. Budget rows retain their planning periods in the complete report and receive an explicit scope decision.

The row identity combines publisher, collection, IATI activity and the original native row_id. Duplicate source identities require a corrected portfolio selection. Changed source content invalidates an earlier row decision. Full before-and-after correspondence is available when the publisher changes a record identifier.

Existing native funding and transaction IDs select the original correction target. New funding configuration is shared only when the complete explicit funding JSON is identical. Every complete native project retains its original unrelated fields and nested financial records. Destination findings cover configured country, programme, organisation, funding, transaction and required-field semantics.

## Existing native API

The reviewed upstream contract is devgateway/amp@e067f9115fbe0ad0ef19bf5d9cc6fff061b8378e. Full original support files and their licences are retained with the application. The installed capture supplies the actual version, workspace-specific metadata and possible values.

| Operation | Original native route |
| --- | --- |
| Login | POST /rest/security/user/ |
| Current native user | GET /rest/security/user/ |
| Installed workspace/version | GET /rest/security/layout |
| Current configured fields | GET /rest/activity/fields |
| Possible values | POST /rest/activity/field/values |
| Complete selected project | GET /rest/activity/projects/{internal_id} |
| Complete new project | POST /rest/activity |
| Complete existing-project update | POST /rest/activity/{internal_id} |

The original login accepts username, SHA-1 password hash and workspaceId, then uses the native session cookie. The browser hashes the entered password for that existing protocol. Native credentials and cookies remain in the process; retained request records omit them. HTTPS is required for remote credential submission.

The selected source project list is explicit. The pinned upstream ProjectList implementation excludes its final row in one list route; the application therefore reads each original selected project directly and checks its returned internal_id.

Native updates retain the original activity_group version and the full request body. Default approval/editor query behaviour remains explicit in the native client. Actual field errors, responses, warnings and native IDs accompany the saved run.

## Interrupted operations and subsequent changes

Every authored change has a caller requestId and immutable full input. Read the original request result before continuing after an interrupted reply. Reusing identical input returns the saved result; another input needs another request.

Native receiving persists each step before submission. A step with a complete returned project continues from read-only receiving. A step with an uncertain write is reconciled against the actual returned project ID. Completed steps retain their original result. An earlier prepared plan cannot be submitted through a second independent run.

The browser stores an unsubmitted mapping draft and the current operation reference in session storage. **Receive original operation** consults the existing workspace. Native continuation uses a freshly entered login with the original saved operation.

Following-edition carry uses confirmed funding and transaction identities, not an amount-only heuristic. Removed source rows remain in the complete comparison and prior history. The analyst can review the actual native correction in the next saved plan.

## CLI on the same original workspace

Use the existing Python 3.11+ environment and original Node dataset runtime:

    python3 cli.py --workspace /absolute/iati-workspace init
    python3 cli.py --workspace /absolute/iati-workspace serve

The original source and portfolio commands remain available. AMP operations use complete JSON input files:

    python3 cli.py --workspace /absolute/iati-workspace amp-capture-import --file original-capture-request.json
    python3 cli.py --workspace /absolute/iati-workspace amp-save --file complete-plan-request.json
    python3 cli.py --workspace /absolute/iati-workspace amp-rows --id ORIGINAL_PLAN_SHA --revision 1
    python3 cli.py --workspace /absolute/iati-workspace amp-decision-preview --file full-scope-preview.json
    python3 cli.py --workspace /absolute/iati-workspace amp-decision-apply --file full-scope-decision.json
    python3 cli.py --workspace /absolute/iati-workspace amp-review --file complete-review-request.json
    python3 cli.py --workspace /absolute/iati-workspace amp-prepare --file complete-prepare-request.json
    python3 cli.py --workspace /absolute/iati-workspace amp-native-start --file prepared-run-request.json --credentials-file /private/existing-amp-login.json
    python3 cli.py --workspace /absolute/iati-workspace amp-events --run ORIGINAL_RUN_SHA
    python3 cli.py --workspace /absolute/iati-workspace amp-native-reconcile --file original-receiving-request.json --credentials-file /private/existing-amp-login.json
    python3 cli.py --workspace /absolute/iati-workspace amp-native-continue --run ORIGINAL_RUN_SHA --credentials-file /private/existing-amp-login.json
    python3 cli.py --workspace /absolute/iati-workspace amp-advance --file following-edition-request.json
    python3 cli.py --workspace /absolute/iati-workspace amp-export --id ORIGINAL_PLAN_SHA --out /absolute/AMP_Commissioning.zip
    python3 cli.py --workspace /absolute/reopened-workspace amp-receive --file /absolute/AMP_Commissioning.zip

The credentials file contains username and passwordSha1. The existing AMP_NATIVE_USERNAME and AMP_NATIVE_PASSWORD_SHA1 environment values are also accepted. amp-native-start and amp-native-continue execute the same worker in the CLI foreground. The HTTP operator keeps the native worker in the original server process and exposes retained progress.

## Complete request shapes

A native capture input contains requestId, actor, connection, projectIds, coverageNote and name. connection contains baseUrl, workspaceId, installedVersion, optional expectedUserId and label. The HTTP/client operation also takes credentials for that invocation.

A capture-import request contains requestId, actor and capture. capture contains the exact fieldsJson, valuesJson, projectsJson, sessionJson and layoutJson strings; connection; coverage {kind,projectIds,note}; acquisition; optional name and full original response descriptors.

A saved plan request contains requestId, actor and definition. Existing plans add id and expectedRevision. definition contains:

- name, notes, portfolio {id,revision}, captureId.
- activityLinks [{publisherRef,activityId,note,projectId or draftId}].
- currencyLinks [{code,nativeId,note}].
- measureLinks [{sourceType,family,adjustmentId,meaning:"actual",note}].
- decisions keyed by original source-row key. Each decision contains action, sourceRowSha256 and note; optional fundingId, donorId, transactionId, fundingJson, transactionJson and dateChoice.
- projectDrafts maps a draft name to its complete native JSON string.
- Optional previousPlan {id,revision} and explicit correspondence [{before,after,note}].

decision/preview contains id, revision and selection. The selection accepts publisherRefs, activityIds, currencies, transactionTypes, collections, original row keys, undecidedOnly and explicit all. Its response identifies every original selected row and selectedSha256. decision/apply adds requestId, expectedRevision, actor and one complete decision without sourceRowSha256; the engine binds each original row's actual hash.

The complete saved financial review contains requestId, id, expectedRevision, analysisSha256, actor, decision ("approve" or "changes") and note. Native preparation contains requestId, id, expectedRevision and actor. Native start additionally selects preparedSha256. Native reconciliation contains requestId, runId, stepKey, nativeId, actor and note.

advance contains requestId, actor, original id/revision, following portfolio {id,revision}, new captureId, name, notes and optional correspondence. It creates a distinct following-edition plan linked to the full original history.

## Typed client and Merchant tools

client.mjs adds ampStatus, ampCapture, ampPlan, ampHistory, ampRows, ampRuns, ampRun, ampEvents, ampRequest, ampCaptureImport, ampSave, ampDecisionPreview, ampDecisions, ampAdvance, ampReview, ampPrepare, ampNativeCapture, ampNativeStart, ampNativeContinue, ampNativeReconcile, ampExport, ampFile, ampAsset and ampReceive. amp_client.d.mts carries complete typed request and result definitions. All methods borrow the existing private console connection.

Merchant's existing source workspace provider exposes the same work under merchant_source_iati_amp_*. Its complete file tools retain and verify the native SHA256 and declared byte count. Original file handles, byte-read continuation and receiving retain their existing owner.

Applications keeps the original IATI application ID and lifecycle. Its source-binding lists include the full AMP code, UI, upstream contract and operating guide. The original installed Python, Node process and private console remain the actual execution route.

## Complete handover

AMP_Commissioning.zip contains the installed IATI/XML application source and native dataset handler, available original Merchant/Applications integration source, upstream AMP references/licences, complete original portfolio packages through every selected edition, immutable AMP capture and plan history, source analysis and reports, full native request/response bodies and original event sequence.

The importer verifies every member and declared source identity, reconstructs the original IATI portfolios using their existing importer, recomputes the complete financial analysis and prepared project bodies, and restores the original AMP state. Source files are supplied for operator inspection/installation. The original data receiving command remains in the installed application.

Complete JSON records are supported up to 64MiB; full portable packages up to 4GiB. Native capture selects up to 10,000 original projects. The customer scope determines the selected programme and workshare.


## Complete programme receiving

The source-owned `receiving/amp.py` operates the entire original programme and its following editions. It retains actual XML, native captures and reviewed input mappings, performs the existing portfolio, AMP review and native APIs, and independently receives and reopens each complete archive. See `receiving/AMP.md` for its manifest, source descriptors, same-case continuation and original native-result recovery. The managed Applications source binding includes the complete AMP runtime and upstream contract assets.

## Repeated preparation and original native recovery

Preparing an unchanged complete request reuses its existing prepared revision. If a later saved review produces the same full native project bodies and original preimages for the same installed workspace, native start links that prepared revision to the original receiving operation. This preserves the actual sends and responses while allowing the operator to continue with the current source-row labels and decisions. The complete portable history includes every linked preparation.

An interrupted request retains its original local request ID for recovery. A completed local validation rejection leaves the form editable. If a native POST has returned a project ID, reconciliation reads that exact returned ID. Following-edition preparation carries the actual received project, funding and transaction identities from that same operation.

## Original Haiti programme

`examples/amp-haiti/PROGRAMME.md` and `selection.json` contain a complete original-source commissioning case from FCDO-set-20: the explicit parent and subordinate Haiti activities, four financial transactions and five budget periods. The full publisher XML stays unchanged in the existing source store. The brief retains separate commitment/disbursement families, each original transaction reference, actual period coverage and the GBP 4 difference between the listed budget amounts and commitments. Use its source selections with `receiving/amp.py` and the selected installed AMP configuration.
