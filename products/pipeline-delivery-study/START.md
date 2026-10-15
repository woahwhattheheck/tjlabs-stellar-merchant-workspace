# Pipeline delivery desk and native receiver

Open **pipeline-desk.html** for the complete authored example. Open **blank-desk.html** to start a separate project. Both run offline without an account or external script. The example is explicitly authored; it is not an Annoroid API run or a measurement of dataset quality.

This product keeps an original pipeline request, uncertain-create state, native observations, episode pages, result manifests and exact delivery files together with local review notes. It never changes the supplier's quality decisions. The browser cannot call the service; only the explicit native commands can do so.

## Complete files

- src/delivery-core.mjs: original-byte validation, coverage, file identity, comparison, local review and reports.
- native/receiver.mjs: explicit request creation/reconciliation, incremental capture, streamed files, verification, continuation and full handover.
- src/storage.mjs: IndexedDB atomic saved heads and independent prior/proposed recovery records.
- src/desk.mjs and src/shell.html: the complete browser operator and industrial gray/black layout.
- build.mjs: create-only offline HTML builder using the complete source bodies.
- vendor/archive-codec.mjs: exact UTF-8/base64/SHA256 primitives.
- source/openapi.json: exact original public API specification, 48,490 bytes, SHA256 400e26983fdfda0fd1930c75b94737821be1763e463719c2895a26873ec8b99c.
- examples/prepare-aloha-coffee-test.json: unexecuted real public source selection, pinned to v2.0 commit 1c52c4c794b6f93d931489263cf15e4331600bfc, episodes 0–4.
- source/public-aloha-source.json and source/ALOHA_SELECTION.md: full retained provider metadata, original URLs, revision reasoning and attribution.
- examples/authored-working.json and examples/authored-report.html: complete two-edition authored receiver/review example.
- RECEIVING.md and native/browser-receiving.mjs: continuation in the caller's actual browser and commissioned native runtime.

## Start in the browser

Choose a collection. Read coverage, status and findings, then select an episode or file. Its full retained evidence appears on the right. Enter reviewer, status and note; Retain local review binds them to the exact collection, target and evidence hash. Unfinished notes are also saved independently per target/basis. A different item does not inherit the previous item's note.

Choose an earlier collection to compare episode evidence and path/size/SHA256 file identities. A missing observation means “not observed in successor”; it is not treated as a deletion. Changing totals, gaps, duplicate episode IDs/indexes and a changed job across collection are explicit findings. Sequential API reads never claim an atomic server snapshot.

Save current copy persists the full workspace and unfinished forms. Save independent copy creates a separate browser head. The retained-version list includes earlier heads and conflicting proposals. An imported JSON or portable HTML opens as an independent complete copy; it does not silently load an unrelated browser copy. Before switching/importing, the current state must save successfully. If storage is unavailable, Download complete working JSON and Download portable desk remain available without waiting for a successful save.

Every original response and embedded delivery file is individually downloadable. External-native-original buttons download the locator/size/hash; they do not claim to contain the original dataset. The readable report distinguishes embedded verification and native external references. CSV protects text beginning with formula characters by prefixing an apostrophe, including leading whitespace/control. Actual source bytes and numeric values remain unchanged.

## Native requirements and account boundary

Use Node 20 or later on the chosen operator machine. No packages, server, GitHub Actions, account creation or remote configuration are needed. Set ANNOROID_API_KEY only in the local process environment. Never put a key in JSON, command history, source files, screenshots or exports.

The initial commissioning contract is one pipeline_job, one explicit Hugging Face dataset revision, and at most 10 selected test episodes. Test keys start ann_test_; test work uses automatic checks and is deleted by the supplier after 7 days. It does not provide human processing or annotation labels. Live ann_live_ and legacy ak_ keys incur actual service work and require a separately authorized explicit --execute-live action. The prepared delivery has not executed either mode.

The current developer overview and OpenAPI differ on supported source families. This receiver deliberately implements only the agreed Hugging Face pipeline input. It does not create annotations, connections, webhooks, uploads, model training or robot-control actions.

## Prepare, create and reconcile

Run from the package directory. The first command writes local originals only:

    node native/receiver.mjs init /absolute/new-operation examples/prepare-aloha-coffee-test.json test

Record the returned command_id. After the authorized commissioning inputs/key are in place, the explicit test create is:

    node native/receiver.mjs create /absolute/new-operation COMMAND_ID --execute-test

The exact command and a unique admission marker are durable before POST. The API has no documented idempotency key. If the request or reply is uncertain, the same command will not POST again. Keep the original directory. Inspect commands/COMMAND_ID/attempt.json and the returned body/error. A read-only list is available:

    node native/receiver.mjs list /absolute/new-operation

List returns at most 200 and the API documents no cursor. Absence is not proof of failure. Obtain the actual remote job identity from the retained response or the supplier's account, then explicitly reconcile with a reason:

    node native/receiver.mjs bind /absolute/new-operation COMMAND_ID ACTUAL_JOB_ID "Confirmed against the original request"

Binding checks the returned job ID, test/live flags, pipeline type, repository revision and explicit episode indexes. A failed lookup retains its original response and does not change the binding. Do not start a new command merely to evade an uncertain old attempt.

## Capture original observations and files

    node native/receiver.mjs capture /absolute/new-operation COMMAND_ID --download

The receiver fetches job-before, all episode pages, results and job-after. Every raw body and incremental complete snapshot is retained before moving on. Non-success bodies and truncated response prefixes remain explicit. An unreadable source can produce a real failed job; it is not converted into a successful empty delivery.

Downloads carry no API key to the file host. HTTPS redirects are checked individually and DNS is pinned to a checked public address; unsafe paths are retained as findings rather than extracted. Native output filenames are content-derived safe names, while original declared paths remain metadata.

The default per-file download ceiling is 1 GiB, streamed to disk, not loaded into a browser. Set --max-file-bytes=NUMBER to an explicitly selected operating limit if necessary. HTTP response bodies default to 64 MiB, settable with --max-response-bytes. A selected limit produces an explicit incomplete/error result and retained prefix; it never silently truncates a claimed original. Timeout is 30 seconds per request, adjustable with --timeout-ms. Read-only capture can be performed again as a new retained collection; create is never automatically retried.

At most8 MiB of aggregate acquired delivery files are embedded in the default working JSON. Larger originals stay in the native capture directory with their computed size/hash and locator. --embed-bytes can select a different budget up to 64 MiB; it does not change the native original files. Browser memory requirements therefore follow the selected metadata/embedding budget, not the full dataset size.

Capture prints its directory and working.json. Open that working file in the desk, or append collection.json to an existing reviewed copy. Later captures start from the operation's original workspace; use the desk's Append native collection or the native continuation to retain accumulated review/history.

## Reopen, continue and deliver complete files

    node native/receiver.mjs verify /absolute/new-operation/captures/CAPTURE_ID

This streams every retained artifact and checks its exact size/hash, checks each original HTTP body, and writes a separate verification record. It does not contact the API. External originals are not treated as embedded browser bytes.

To carry an already reviewed working file into a successor collection:

    node native/receiver.mjs continue reviewed-working.json successor/collection.json /absolute/new-continuation

The full incoming wrapper/session is preserved. An interrupted capture snapshot can be recovered with:

    node native/receiver.mjs recover captures/CAPTURE_ID/snapshots/000004.json reviewed-working.json /absolute/new-recovery

Use the same capture's actual retained native originals; external references require their complete source directory. An incomplete collection remains visibly incomplete. Keep snapshots; do not edit them to manufacture completeness.

For the complete transferable delivery, include the whole native directory and the operator's final returned working file:

    node native/receiver.mjs handover /absolute/new-operation reviewed-working.json /absolute/new-handover

This creates a new directory, retains all native command/response/capture history, copies original files without replacement, verifies copied referenced captures, includes the complete installed product source under tool/ after checking its source manifest, and retains the exact returned working JSON plus readable report and manifest. Transfer the whole new-handover directory. A portable HTML/JSON alone is sufficient only for the bytes it actually embeds; it does not contain external dataset files.

Rebuild a standalone desk from any complete working file:

    node build.mjs reviewed-working.json new-portable-desk.html

The output path must not already exist. The builder inserts arbitrary source through callbacks and escapes script-closing sequences.

## Public source example

The published sample ZIP is https://annoroid.com/samples/annoroid-sample-output.zip. The provider retained its 8,071-byte original in the private source page, but this preparation environment did not decode the binary archive. Do not describe its internal byte hashes as verified by this package. The public sample and published audit remain supplier evidence, not our commissioned API result.

The separate real ALOHA selection pins an immutable v2.0 revision because current main metadata is v3.0 while the card still mentions v2.0. It selects five actual 1,100-frame episodes. See source/ALOHA_SELECTION.md and the complete public metadata. Neither metadata nor the authored response example proves a successful service run.

## Completion boundary

Production core/controller code was executed in the preparation runtime with explicit adapters for meaningful preservation cases. No actual Node HTTP/streaming/IndexedDB/browser rendering or commissioned service run is claimed by that execution. RECEIVING.md is the complete actual-product course for the selected equipped operator. Commissioned acceptance requires the actual test-mode run, exact original acquisition, offline reopen, working controls/downloads, and desktop/narrow inspection of the exact outgoing product and attachments.
