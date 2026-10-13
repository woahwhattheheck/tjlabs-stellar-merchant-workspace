# Start a customer handover and its reviewed returns

The first-use intake selects a real published customer delivery from the connected Research workspace. It retains that delivery's complete original handover, reads the actual current dossier history, and prepares an explicit return scope for the existing handover desk. The browser obtains native dossier, delivery, manifest and revision identities from the original APIs.

The scope draft remains editable until preparation freezes its reviewed selection. After preparation, the original handover, native history and selected operation stay bound together. The desk then receives actual returned files, displays every differing value, saves explicit decisions, recovers the same request after an uncertain response, and builds the complete editable handover.

This course extends the original customer-updates handover producer and the customer handover returns programme. See [HANDOVER_RETURNS.md](HANDOVER_RETURNS.md) for the native return and cold-receiving contract, and [HANDOVER_DESK.md](HANDOVER_DESK.md) for full item review, source upload and accepted package downloads.

## Start the intake

Use the installed command with an existing authenticated Research connection, a persistent private operation directory, and the complete selected original Research source:

```sh
research-customer-handover-intake \
  --connection-file "$CONNECTION_FILE" \
  --directory "$INTAKE_DIRECTORY" \
  --engine-root "$ENGINE_ROOT" \
  --engine-manifest "$ENGINE_MANIFEST" \
  --engine-manifest-sha256 "$ENGINE_MANIFEST_SHA256"
```

The variables identify actual existing paths and the measured SHA-256 of the full engine manifest. The engine selection uses the same original source-manifest contract as the customer handover programme. Keep the complete source tree, original paths, modes, license, source dependencies and declared host runtimes available. Select the maintained source edition that contains the intake, handover desk and receiving modules.

The equivalent existing workspace command is:

```sh
research-client customer-handover-intake \
  --connection-file "$CONNECTION_FILE" \
  --directory "$INTAKE_DIRECTORY" \
  --engine-root "$ENGINE_ROOT" \
  --engine-manifest "$ENGINE_MANIFEST" \
  --engine-manifest-sha256 "$ENGINE_MANIFEST_SHA256"
```

From a source checkout, use the actual Node executable:

```sh
"$NODE" "$RESEARCH_SOURCE/customer-updates/handover-intake-cli.mjs" \
  --connection-file "$CONNECTION_FILE" \
  --directory "$INTAKE_DIRECTORY" \
  --engine-root "$ENGINE_ROOT" \
  --engine-manifest "$ENGINE_MANIFEST" \
  --engine-manifest-sha256 "$ENGINE_MANIFEST_SHA256"
```

`RESEARCH_SOURCE` is the original `stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers` directory. Optional flags are `--workspace` for the original client's local workspace-directory override, `--port` (default 0, an available loopback port), `--python` (default `python3`) and `--node` (default the running Node executable). The selected Python and Node are passed to the original complete receiving course.

The command prints a private loopback URL. Open that complete URL in the local browser. Its fragment supplies the session token; the page removes the fragment and retains the token in origin-scoped session storage. All API actions use that token and the original host/origin boundary. The server accepts selected original identities and server-owned download IDs; the browser cannot name arbitrary server files.

Closing the command waits for its active original operation, any launched handover desk and the clients it owns. If a client cannot confirm closure, the command keeps its operation lock and allows the close signal to be repeated. Keep the persistent intake directory for reentry.

## Select the original published delivery

1. Read the connected workspace identity and selected original source summary at the top of the page.
2. Click **Load dossiers**. The browser lists the original native inventory in pages of 100, holding the same immutable inventory snapshot for further pages.
3. Choose the actual dossier. The published-delivery list is pinned to a native dossier revision and its envelope hash. **More deliveries** continues at that same revision.
4. Choose the published delivery. Its full original record is displayed, including its historical delivery revision. The listing revision and historical delivery revision have different purposes: the former pins the inventory; the original producer exports the selected delivery at the latter.
5. If this handover includes an original source workspace, open **Include an original source workspace** and supply its already-selected library and actor. The library is `original` or the original `received-<SHA256>` identifier. Both fields are needed together. The producer retains its own stable source-export request identity.
6. Click **Retain this original handover**. The original `createCustomerHandover` and `inspectCustomerHandover` methods produce and verify the complete baseline. Completion is shown in the saved job state.
7. Choose that retained handover in **Retained original handover**. Inspect its dossier, delivery, historical revision, manifest SHA-256 and optional source-workspace identity.

The handover contains the original portable dossier, work and delivery reports, its manifest and the optional original source workspace. Download the complete retained members from **Complete retained files**. Their displayed byte counts and SHA-256 values identify the actual files; every browser download verifies both before saving.

Choosing a different dossier while a delivery listing is loading is disabled. Dossier and delivery response ownership is retained so an earlier response cannot silently replace the current choice. Retaining another complete baseline does not change the saved return scope: the scope explicitly selects one baseline ID.

## Enter the reviewed return scope

The scope records the selected operation and limits. Enter the actual values for this customer:

| Field | Meaning |
| --- | --- |
| Operation name | Stable name for this original return operation. |
| Customer or delivery label | The label displayed in the return desk and complete programme. |
| Source actor | Required by the original receiving course when the baseline carries a source workspace; otherwise optional. |
| Maximum differing items, cumulative | Maximum reviewed item count across prior accepted native receipts and all new rounds. |
| Maximum accepted returns, cumulative | Maximum accepted return count, including prior native receipts and the newly selected rounds. |
| Round name | Unique name for each new return round, in intended processing order. |
| Round maximum items | Maximum differing items in that particular comparison. |
| Round maximum source bytes | Maximum complete original return-file size for that round. |
| Handover filename stem | Stable filename stem for the final complete ZIP. |
| Maximum complete archive bytes | Maximum size of the complete source-bearing handover archive. |

Operation names, round names and filename stems start with a letter or digit and contain only letters, digits, dots, underscores or hyphens, up to 120 characters. There are at most 32 newly selected rounds. Item limits are whole numbers from 0 through 100,000; cumulative return count is a positive whole number through 100,000. Source and archive limits are explicit positive byte counts no greater than 268,435,456 bytes. One MiB is 1,048,576 bytes.

No round, item, source or archive allowance is selected automatically. The preview counts original inherited receipts before preparation. For a continuation after one accepted return, its receipt contributes to the cumulative maximum; the new round does not reset that count.

Click **Save scope draft**. The complete partial draft is saved with a compare-and-set SHA-256. Incomplete fields can be retained while the scope is being assembled. A saved partial draft may omit its rounds or output fields entirely; the browser displays those fields empty and only adds values when edited.

If another window has saved a different draft, the current local fields remain visible. **Export these scope fields** preserves those exact fields as JSON. **Load saved scope** explicitly replaces them with the retained version. The browser does not overwrite a newer draft on refresh or silently merge conflicting scope values.

## Inspect the complete preview and prepare

Once the current draft is saved, click **Inspect the complete selection**. The native preview contains:

- The complete original selection using the native snake_case field names.
- The selected baseline and original manifest identity.
- The actual native workspace and dossier.
- The current revision and its envelope SHA-256.
- The complete original revision-history pins.
- Every inherited accepted native return receipt, its decisions and the resulting cumulative counts.
- The selected complete original engine identity.
- All round, item, source and archive limits.

Open **Complete selection and native history** to inspect the full JSON. The short facts above it are only a summary; the complete value remains retained and downloadable.

Review the exact preview, select its acknowledgment and click **Prepare this reviewed selection**. An authorized operator or agent may review and perform this step. Preparation checks the native head, baseline, prior receipts, draft and source identity again before freezing the original selection.

A changed preview SHA-256 clears the acknowledgment. Unsaved fields or a scope conflict disable preparation. Preparation after a frozen selection is a recovery action on that original selection; it cannot replace its baseline or limits.

### Changed head or interrupted preparation

If the native state changes before the freeze, preparation fails with `INTAKE_PREVIEW_STALE`. The draft stays editable. Inspect a new preview and review its actual head, inherited receipts, limits and new SHA-256.

Once `PREPARE_SELECTION.json` exists, the scope is locked. A missing response can leave the job `OUTCOME_UNCONFIRMED` even though native preparation has begun or completed. Refresh saved state, inspect the original retained files and use **Resume the exact preparation** when initialization is incomplete.

A concurrent external edit between the final preview check and creation of the original programme's initial state can produce `HANDOVER_RETURN_INITIAL_REVISION_CHANGED`. Preserve the frozen intake, original course and actual workspace history, and reconcile that original operation. The intake does not automatically rebase the selection, replace its request or discard the failed attempt.

On reopening the command, interrupted jobs are shown from retained start/result records. A preparation is frozen only by its actual retained selection binding. Closing a browser tab does not cancel the active native job.

## Open the existing handover desk

After the saved state reports the original programme initialized, click **Start the handover desk**, then **Open the handover desk**. The intake creates another original Research client using the same fixed connection and workspace, and launches the desk in the exact prepared programme directory. Its private URL is returned only through the authenticated response and is not written into retained customer artifacts.

The desk performs the subsequent complete return operation:

1. Receive each complete original returned dossier file.
2. Prepare the original shared-ancestor/current/returned comparison.
3. Inspect all differing items and their complete original values.
4. Save partial reviewer drafts, then submit one explicit allowed decision for every item.
5. Recover the exact retained request after an uncertain response.
6. Retain the accepted historical revision, full reports, original return wires and source-bound proposals.
7. Build the complete editable archive and independently reopen it through the original receiving programme.

Typed histories retain the original native authority. **Retain returned proposal** stores the source-bound proposal for its corresponding review workflow. Authored fields follow the explicit native choices, including removal when the selected returned side is absent. The desk displays the supplied choice labels and effects.

The intake retains and displays the baseline and preparation files. Return comparisons, reviewed requests, accepted reports and the final complete ZIP belong to the launched desk and original programme. The baseline remains the original historical customer delivery.

## Native integration

The core exports:

```js
openCustomerHandoverIntake({
  client,
  directory,
  engineRoot,
  engineManifest,
  engineManifestSha256
});

readCustomerHandoverIntakePreparation(directory);
```

The opened intake exposes `status`, `listDossiers`, `listDeliveries`, `createBaseline`, `saveDraft`, `preview`, `prepare`, `launchSelection` and `download`. Core methods retain the original source and serialize mutations in the persistent intake. The core does not own the supplied client's lifetime.

The private host exports:

```js
startCustomerHandoverIntakeDesk({
  client,
  clientFactory,
  directory,
  engineRoot,
  engineManifest,
  engineManifestSha256,
  port: 0,
  python: 'python3',
  node: process.execPath
});
```

It returns `{url, port, close, intake}`. Supply `clientFactory` as a function that creates a fresh original Research client against the same actual connection and workspace. The host owns the initial client and every launched desk/client until close succeeds.

After closure, `readCustomerHandoverIntakePreparation(directory)` verifies the exact retained preparation and returns `{directory, selectionFile, selectionSha256, prepared}`. This native path-bearing result is intended for an original local caller. HTTP prepared status exposes the corresponding identities and full server-whitelisted downloads without accepting caller filesystem paths.

## Complete original-input receiving course

The installed `research-customer-handover-intake-receiving` command operates the actual first-use browser and continues through the original handover-desk receiving programme. It requires existing Playwright and Chromium executables and actual selected source and review files.

```sh
research-customer-handover-intake-receiving \
  --input "$ACTUAL_RECEIVING_INPUT" \
  --sha256 "$ACTUAL_RECEIVING_INPUT_SHA256"
```

The source-checkout command is:

```sh
"$NODE" "$RESEARCH_SOURCE/customer-updates/handover-intake-receiving.mjs" \
  --input "$ACTUAL_RECEIVING_INPUT" \
  --sha256 "$ACTUAL_RECEIVING_INPUT_SHA256"
```

The complete input is a UTF-8 JSON object, at most 16 MiB, with schema `sf88.research-customer-handover-intake-receiving.v1`:

| Field | Required actual value |
| --- | --- |
| `connectionFile` | Absolute original Research connection-file path. |
| `workspaceDirectory` | Optional absolute original local workspace override. |
| `directory` | Absolute persistent receiving-course root. Reuse it for continuation. |
| `engine` | `{root, manifestFile, manifestSha256}`, selecting the complete original source. |
| `dossierId` | Actual native dossier ID to choose from the paged inventory. |
| `deliveryId` | Actual published customer-updates delivery ID to choose. |
| `sourceWorkspace` | Optional `{library, actor}` for the original source library, or null. |
| `scope` | The complete explicit camelCase scope below. |
| `rounds` | Actual per-round source/review inputs, or an empty array while those inputs are pending. |
| `playwrightModule` | Absolute path to the existing installed Playwright module. |
| `chromiumExecutable` | Absolute path to the actual existing Chromium executable. |
| `python`, `node` | Optional existing executable selections passed to original receiving. |
| `jobTimeoutMs` | Optional 1,000–86,400,000 ms bound; default 1,800,000 ms. |

The `scope` object has `operationId`, `customerLabel`, optional `sourceActor`, `maximumTotalItems`, `maximumTotalReturns`, `rounds` and `output`. Each scope round is `{key, maximumItems, maximumSourceBytes}`. Output is `{filenameStem, maximumArchiveBytes}`. These are the exact same reviewed values used in the browser. The receiving input does not need a manually authored baseline manifest, current revision, current envelope hash or generated native selection file.

The outer `rounds` array uses the original handover desk receiving contract:

```text
{
  key: the selected round name,
  source?: {
    file: absolute complete original return path,
    bytes: its actual byte count,
    sha256: its actual SHA-256,
    filename: its original filename,
    contentType: its declared supported native wire type
  },
  review?: {
    file: absolute actual reviewed-request JSON path,
    sha256: its actual SHA-256
  },
  rejectedReview?: {
    file: absolute separately supplied candidate JSON path,
    sha256: its actual SHA-256,
    expectedCode: RETURN_DECISION_INVALID or RETURN_DECISION_REQUIRED
  }
}
```

The notation describes the required values and types. Original source types are `application/json`, `application/gzip`, `application/x-gzip` or `application/octet-stream`. The reviewed JSON selects the actual immutable review, comparison hash and current revision, a reviewer, optional review note, and exactly one allowed decision per item. A supplied request ID must equal the desk's retained stable ID; leaving that field absent allows the original desk to assign it. Decision order and every supplied EDIT value are preserved.

The optional separately supplied `rejectedReview` is used only with an actual comparison and its own explicit corrected review. It exercises native invalid-choice rejection before freezing, saves the supplied correction, verifies that the old draft cannot replace the corrected generation, and then applies the corrected whole request. The course does not fabricate an invalid scientific value or choose a substantive treatment.

### What this receiving course actually performs

The programme checks the selected workspace, retains the immutable scope/runtime binding, and opens the real intake browser. It chooses the supplied actual dossier and published delivery through the original paged controls, retains the full native baseline, fills the explicit scope, saves it and reloads it.

It reads and retains the complete native preview, checks the baseline, workspace, source engine, head, inherited counts and every selected limit against the supplied scope, and acknowledges that exact preview. For a first preparation, it lets the actual HTTP handler start the native job and deliberately withholds the response from the browser. It then observes the original job, reloads the browser, and verifies the exact frozen preparation. Reentry reuses the original frozen scope and selection.

The programme launches and opens the actual handover desk, verifies its operation/workspace/dossier binding, and downloads all retained intake files through their browser controls with complete byte verification. It records screenshots only in its private attempt directory.

It then closes the intake browser, listener, launched desk and owned clients. Only after closure does it read the native prepared selection and delegate to the original handover-desk receiving programme. The delegation supplies `deskDirectory` as the exact intake-prepared course directory. That additive original receiver option is an absolute native path retained in its immutable binding; when omitted, the original receiver still uses `directory/desk`.

This preserves a single original programme, its comparisons and request recovery. The delegate performs actual source intake, complete comparison/value retention, supplied review, lost-response recovery, accepted reports, full archive download and independent cold receiving.

If no actual original return file is supplied yet, the result is `SOURCE_REQUIRED`. If the comparison is retained but explicit review input is missing, it is `REVIEW_REQUIRED`. Keep the same receiving root, baseline, scope, engine and runtime selection, add the actual missing file or reviewed input, compute the full successor input SHA-256 and reenter the command. Original request lookup and retained selection identity govern continuation; the input change does not create another operation.

A `COMPLETE` result is published only after the original delegate has finished its complete package and independent receiving, and the real browser/host lifetimes have closed. Source parsing or review of this module alone does not establish that native result.

## Retained source and files

The intake root keeps `INTAKE.json`, complete original `baselines/`, chained `drafts/` and `previews/`, the frozen `PREPARE_SELECTION.json`, `SELECTION.original.json`, `PREPARED.json` and original `course/`. Its `intake-private/` directory holds host job records and locks.

The complete receiving wrapper keeps its immutable binding and attempt details under `private/`, verified original intake downloads and full preview/results under `public/`, the persistent intake under `intake/`, and the delegated receiving reports under `returns/`. The delegated operation itself remains the intake's actual prepared `course/` directory. Private browser/session details are excluded from customer download inventories.

The new source comprises `handover-intake.mjs`, `handover-intake-desk.mjs`, `handover-intake-cli.mjs`, `handover-intake-receiving.mjs`, this guide and the three `handover-intake-public/` assets. It uses the unchanged original customer handover producer, engine selection, history and return validation APIs, plus the reviewed original desk receiver with its additive directory option. Keep the original MIT license and full selected source with the editable handover.
