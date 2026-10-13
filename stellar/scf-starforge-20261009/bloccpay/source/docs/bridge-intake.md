# Bridge treasury evidence and incident intake

This is an additive operating surface for the existing Bloccpay company workspace. It uses that workspace's original connections, capture commands, full source imports, signed webhook verifier, SQLite requests, immutable files, export and receiving. It does not create a second provider client, listener, ledger or financial writer.

The provider interpretation module is the exact reviewed Invoice SDK Bridge provider source. The company owns cryptographic acceptance of original webhook bytes. A Bridge payment_processed observation is recorded as provider delivery evidence. It is never an instruction to credit a customer, execute a payout, waive screening or change an accounting balance.

## Open the existing company installation

Start the maintained company server with its existing private configuration:

    node cli.mjs serve --directory /private/original-workspace \
      --configuration /private/original-configuration.json

Use the same operator token and origin. Open /bridge, or choose **Bridge intake & incidents** from the original navigation. The server mounts this page and the Bridge API within the existing authenticated process. No Bridge credentials enter the browser. The original /webhooks/provider/<connectionAlias>/<subscriptionId> listener remains the sole signed-delivery ingress.

The page retains the entered token only in the original sessionStorage key used by the company operator. Keep it out of delivery source and shared screenshots. Review JSON, full original response downloads and the complete workspace archive can contain private business information; preserve their existing private destination.

The page has its own browser request view because the original generic app replays its own journal as native commands. This view retains the exact original request before sending it to the same company writer. It is not a second business database.

## Capture or import complete source

Use the existing connection alias and provider environment. The read-only capture controls call the original capture.start and capture.run commands. An individual GET is a one-page capture; list/history calls retain their actual continuation. Pause uses the original capture.pause command. The full params/query input is shown before admission. Existing native validation rejects an action, parameter, environment or connection not in its original contract.

For example, a selected customer's virtual-account history uses:

    {
      "params": {
        "customerID": "actual-original-customer",
        "virtualAccountID": "actual-original-virtual-account"
      },
      "query": {"limit": 100}
    }

The selected native action is bridge.virtual-account.history. Use actual identifiers from retained source. The original provider catalogue remains authoritative for each action's parameters and cursor. A short list is not invented evidence of an entire historical capture; capture status, retained pages and native next selection remain in the review.

An existing complete provider response can be imported through the desk's original-file form or through the existing CLI:

    node cli.mjs import-source --directory /private/original-workspace \
      --configuration /private/original-configuration.json \
      --source /private/original-response.json \
      --request-id actual-original-stable-request-id \
      --connection original-bridge-alias \
      --action bridge.transfers.list \
      --input /private/original-request-input.json --status 200 --complete true

The browser also retains the original File and its full SHA-256 before upload. It sends the unchanged full file to the existing source-import route with the selected action, input, observed status and observation timestamp. The native original source parser keeps exact numeric spellings and complete response bytes. A review does not repair truncated source or manufacture a provider field.

Invalid signatures remain original rejected webhook rows and private raw bodies. The Bridge desk does not accept a JSON body as proof of a valid signature. Signed ingress continues to use the existing endpoint public key and developer selection.

## Prepare an evidence review

Select the original connection, sandbox/production environment, exact source scope, Bridge developer, selected customer IDs and selected customer/virtual-account pairs. Source scope is displayed in each original source identity. An existing received workspace can review historical source even when provider credentials are absent.

Choose exact resource versions, full response sources, webhook attempts and captures. A selected version or capture includes its original source dependencies automatically. All versions and full source records remain present in the frozen document; pagination only changes what the browser displays.

Enter the actual reviewer and a meaningful note, then select **Preview frozen review**. The complete preview includes:

- The original workspace UUID, revision and journal head.
- The explicit normalized account and source selection and its canonical hash.
- Full original source/version/webhook/capture records and immutable body descriptors.
- Transfer or virtual-account activity interpretation from the unchanged provider module.
- Provisional and final transaction hashes separately, with source/destination currency and fee bases preserved.
- Signature, scope, incomplete capture, source/projection, customer/virtual-account and original conflict findings.
- Full actor, note and prepared timestamp.
- ledgerAction:"NONE" and creditAuthorization:false.

Each incident has a stable SHA-256 identifier derived from its complete finding. Unsupported or incomplete native resources remain in the full evidence with an explicit finding. Review does not silently drop them or change original source.

**Save this exact preview** retains one original file.retain request and immutable private JSON in the existing company workspace. Admission recomputes the full preview against the actual current revision and journal head. A concurrent update yields a revision conflict. The desk preserves that request and its exact body; a reviewer must explicitly refresh, inspect and prepare a new preview if the basis changed.

Reconciliation never changes a request ID or silently rebases an old review. If the native request already completed, its exact original result is adopted. A RUNNING original request is continued with the same full arguments. A native FAILED row remains failed. Known accepted results remain in the page until their exact browser record has committed.

## Record an incident decision

Open a completed frozen review and choose one or more of its actual incident IDs. The decision form supports ACKNOWLEDGE, ESCALATE, RESOLVED_EXTERNALLY and REOPEN. Provide the actual actor and reason.

RESOLVED_EXTERNALLY requires at least one immutable original evidence file. Retain the actual evidence using the existing company's source-file uploader or cli.mjs file-retain, then select its original file ID. The decision verifies all selected full evidence bytes. It records the external action described by the reviewer; it does not assert that this application executed that action.

A decision can supersede an earlier completed decision only for the same original review and identical incident selection. The previous complete document hash is retained, and an already superseded decision cannot be selected again. Every edition remains in original request history.

Review and decision JSON can be reopened and downloaded from **Frozen native records** without replaying a native write. Exact downloaded bytes are checked against the native SHA-256 before offering a file. Download object URLs remain owned until the desk closes.

## Direct service and CLI

The borrowed workspace API is:

    const intake = createBridgeIntake({workspace});
    await intake.summary();
    await intake.previewReview({
      expectedRevision, selection, actor, note, preparedAt
    });
    await intake.previewDecision({
      expectedRevision, reviewRequestId, incidentIds, action,
      actor, note, evidenceFileIds, supersedes, preparedAt
    });
    await intake.save({
      requestId, expectedRevision, document, expectedPreviewSha256, signal
    });
    await intake.read(originalRequestId);
    await intake.originalBody({table:"sources",id:originalSourceId});
    await intake.inspect({requestIds:null});
    await intake.close();

intake.close stops admission and drains admitted work. It does not close the borrowed workspace. The original server closes the intake after its in-flight HTTP work and before its original workspace. A standalone CLI retains and closes the intake and actual workspace in that order, keeps the first failure, and waits for failed closure of the same acquired owner.

bridge-cli.mjs help documents all flags. Every CLI JSON input is strict, duplicate-free, bounded complete JSON. The input directory and files must be absolute. The CLI emits one complete JSON result after owners close. Output files are create-only: exact identical bytes can reopen, different bytes reject.

A complete review input is:

    {
      "expectedRevision": 42,
      "preparedAt": "2026-10-13T07:00:00.000Z",
      "actor": "actual-reviewer",
      "note": "Review actual retained treasury delivery and exceptions",
      "selection": {
        "connectionAlias": "original-bridge",
        "environment": "sandbox",
        "sourceScope": "actual-original-source-scope",
        "developerId": "actual-original-developer",
        "customerIds": ["actual-original-customer"],
        "virtualAccounts": [],
        "versionIds": ["actual-retained-version-id"],
        "sourceIds": [],
        "webhookIds": [],
        "captureIds": []
      }
    }

Replace every example value with the actual original workspace source. This is an input shape, not an assertion that an account, event or trade exists.

    node bridge-cli.mjs preview --directory /private/original-workspace \
      --input /private/review-input.json --output /private/exact-preview.json

Retain a complete save request containing its original stable requestId, expectedRevision, exact returned document and expectedPreviewSha256. The preview hash is SHA-256 of recursively key-sorted canonical JSON with no added newline. The document file hash is SHA-256 of JSON.stringify(document,null,2) followed by LF, matching the existing company's jsonBytes function.

    node bridge-cli.mjs save --directory /private/original-workspace \
      --input /private/exact-save-request.json
    node bridge-cli.mjs read --directory /private/original-workspace \
      --request-id actual-original-stable-request-id \
      --output /private/original-review-record.json

The saved file ID is private- plus its full document file hash. Original native arguments retain the file ID, schema, kind, full document hash, selection hash and optional original review request ID. No mutable current label substitutes for those identities.

## Export and independent receiving

Use the unchanged original company's export command and complete package receiver. Bridge reviews are ordinary original request rows and immutable file objects. They travel with native sources, resource versions, rejected webhook bodies, capture pages, review decisions and original request history.

The current original company CLI retains these command forms:

    node cli.mjs package-inspect --source /private/complete-package \
      --manifest-sha256 ACTUAL_COMPLETE_MANIFEST_SHA
    node cli.mjs package-receive --source /private/complete-package \
      --destination /private/new-received-package \
      --request-id actual-original-receiving-request-id

For an archived package, use the original archive/unpack commands first. Preserve the exact archive and returned manifest. Do not extract only the Bridge JSON or rebuild an accounting database from reports.

The native receiver preserves original records and changes the receiving workspace identity under its recorded origin, disables mutation dispatch, and pauses original captures/collections according to the existing programme. Historical review documents keep their original producing workspace identity. The Bridge reader intentionally accepts those unchanged historical identities instead of rewriting them to the receiving workspace.

Open the actual returned receiving workspace path and perform the full local inspection:

    node bridge-cli.mjs inspect --directory /private/actual-received-workspace \
      --output /private/bridge-receiving-inspection.json

Inspection verifies every complete retained Bridge request's original method/full arguments/result/file, every reviewed original body descriptor, decision evidence and previous-review/decision reference. It returns the full retained documents and current receiving workspace origin. It makes zero provider requests and no native command. It checks that the workspace revision/head did not change during inspection. An optional input {"requestIds":[...]} selects a complete explicit subset.

To compare producing and received views, compare the complete original Bridge records and file identities; current workspace UUID, receivedFrom and revision are native receiving outputs and are expected to differ. The unchanged provider source pin and all new service/UI/CLI/guide leaves must be in the original source-files.json inventory before exporting the application. Root's combined company manifest is the single source writer for this registration.

## Closure and source status

The browser's read-only window.bloccpayBridge.observe() reports current workspace/revision, active tasks, pending known results and closing/closed status. Its close() stops admission, aborts admitted HTTP work, waits for every owned body/task, persists any known accepted result and draft, revokes owned object URLs and closes its actual IndexedDB handle. A storage failure retains that same tab's owner for retry. The page warns before leaving while admitted work or known nondurable results remain.

Source code and source review are distinct from native operation. This edition is authored against the full original company31 source, preserves the following PR37325 main-app correction by adding a separate page, and reuses the independently reviewed Bridge provider. No actual company host, provider capture, payment, browser journey or receiving result is claimed by this source packet.

## Original host and collection-worker cleanup

The original server now owns each acquired listener, socket, accepted request, collection worker, Bridge intake and workspace until its actual cleanup succeeds. Listening and startup validation are inside this same lifetime. Startup errors remain the primary error; if cleanup also fails, the error carries `close()`, `closeError` and `application:{close,inspect}`. Retry that exact close handle. Opening a replacement host does not close the failed one.

Server close stops admission and aborts the original request signal, closes its actual listener and accepted sockets, then waits for every original body/task and worker loop. A worker cleanup failure keeps the borrowed workspace open. Intake close must finish before workspace close. Successful cleanup stages are retained; a rejected close promise is cleared for retry. `inspect().closed` becomes true only after all these owners close. The standalone server and worker signal handlers retain the same owner and retry cleanup rather than exiting on its first rejected promise.

The collection worker keeps the original native task IDs, collection schedule, run/pass selection, loop and callbacks. Its `done` still reports the original loop failure. Its `close` separately waits for that loop and retries actual guard/workspace cleanup; it never closes a borrowed workspace. `inspect` reports the retained first error and real closure stages. The directory lease first retires its exact token to a token-specific name, then removes only that retired directory and syncs its parent. A retry after removal or sync failure cannot remove a new owner's live lock.

The Bridge browser drains its actual desk before same-origin navigation; a failed storage close keeps the same page available for retry. API admission remains stopped after close begins, including work that was hashing an original input when shutdown started. Editing a decision invalidates its previous preview. Capture review also verifies the original capture's full source scope against the selected environment and alias, before recording any review.


## Received host automatic projection

The host exposes its exact selected `webhookProjection` mode in startup and
`/api/bootstrap`. Set `configuration.webhookProjection.enabled` to an explicit
boolean to select automatic webhook projection. An ordinary producing workspace
defaults to enabled; a workspace with native `receivedFrom` provenance defaults
to disabled. The original receiving programme explicitly selects false as well.

Disabled mode retains and cryptographically verifies incoming original webhook
bytes but does not automatically run projection on accepted deliveries. It also
leaves existing retained deliveries untouched at host startup. The same gate is
checked inside the automatic projection helper, including shutdown. Original
authenticated manual commands remain available and keep their native readback
and dispatch rules. This does not erase provider connections, alter event rows,
change source custody, or claim that a received observation ran a provider GET.
