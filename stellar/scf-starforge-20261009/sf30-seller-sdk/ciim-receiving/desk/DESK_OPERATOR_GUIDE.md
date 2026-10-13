# CIIM receiving desk: operator guide

The receiving desk turns completed metadata transformations into an editable receiving operation. An operator can inspect every original record, review the native profiles, compare successive editions, record named decisions, deliver a complete handback, and reopen the same history in another desk.

The desk uses the original OAI and Proteus results already supplied with the input. Source XML, native conversion, mapped record, profile, source selection, and runtime identities remain attached to the original edition. Receiving decisions are additional records in the desk. They do not rewrite the source metadata.

This guide covers the browser, command line, typed interface, managed Applications entry, and portable receiving workflow. Use **Download operator guide** in the desk footer to save this complete guide from the installed application. The implementation is in [model.mjs](model.mjs), [portable.mjs](portable.mjs), [server.mjs](server.mjs), [browser.mjs](browser.mjs), [client.mjs](client.mjs), and [cli.mjs](cli.mjs). The original transformation and mapping guide is [../README.md](../README.md).

## What the receiving team delivers

A completed handback has three useful parts:

1. A readable `review.html` with the receiving institution, environment, processing profile, named authorities, original-profile reviews, every selected record decision and reason, comparison history, and complete source coverage.
2. The reviewed output and reconciliation for each selected edition. Accepted records retain their original values and order. Excluded records remain in the reconciliation, original source, and decision history.
3. A complete portable desk snapshot with original input archives and saved operations. The next operator can restore it, reopen the same records and reviews, make a correction, and create a later handback.

A complete workspace export is available while work is in progress. A reviewed handback is created after the selected editions, profiles, records, and comparisons have current named decisions.

| Responsibility | Work in the desk | Retained result |
| --- | --- | --- |
| Receiving operator | Select the original package, inspect the full edition, locate source records, prepare reviews and handbacks. | Original import, record selection, operator identity, and saved operation history. |
| Metadata reviewer | Review native profiles, repeated metadata, source issues, identifiers, withdrawals, and restoration. | Edition, profile, record, and comparison decisions with reasons and references. |
| Named institutional authority | Supply the recorded authority for the receiving decision and any exclusions. | Stable authority ID, name, reference, and the context in which the decision was made. |
| Receiving environment owner | Identify the institution's selected environment and processing-profile version. | Explicit context, separate from original source identity and record state. |
| Following operator | Restore the complete workspace or handback, inspect its history, and carry corrections into a new handback. | Preserved workspace and record identities plus a new receiving operation. |

The authority list and named operator are recorded local operating information. The local desk does not authenticate an institution or contact its production system.

## Start the same desk

Use the repository's maintained Node installation with `node:sqlite` support; the released application targets Node 24. Use the existing Python executable for the archive helper and the maintained Linux file-lease helper. The desk itself opens completed native results and does not start a Java transformation.

Set the CLI path to the checked-out or installed source:

~~~sh
CIIM_CLI=/absolute/checkout/stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs
CIIM_WORKSPACE=/absolute/work/ciim-receiving
~~~

Create a new desk once, at a path that does not already exist:

~~~sh
node "$CIIM_CLI" init --workspace "$CIIM_WORKSPACE" --python /usr/bin/python3
~~~

Open an existing desk without initializing it again:

~~~sh
node "$CIIM_CLI" serve --workspace "$CIIM_WORKSPACE" --python /usr/bin/python3 --port 0
~~~

The command prints one compact `CIIM_DESK_READY` startup object. Open its complete `url` in the browser. That URL contains the local session token in its fragment. The browser stores the session for the current tab and removes the token from the displayed address.

The listener binds to `127.0.0.1`. A normal `--port 0` restart reuses the desk's retained local port, so the same browser origin can recover a pending original request. If that retained port is already occupied, the startup error identifies it; close the listener that owns it and reopen the desk. An explicit `--port` is an intentional listener selection.

Only one native owner opens a desk directory at a time. While the browser server owns it, use its HTTP interface. Stop the server before opening the same desk with a separate direct CLI process. Multiple browser tabs use the one server and original revision checks.

### Open through Applications

The installed application is **CIIM metadata receiving**.

1. Initialize or restore the desk with the original CLI.
2. In Applications, choose **CIIM metadata receiving**.
3. Select **Original CIIM receiving desk** and **Existing Python executable**. Use the actual private desk directory and existing executable.
4. Review the selection and launch it. Applications binds the selected `desk.json` bytes, workspace ID, source, and executable.
5. Use **Open CIIM receiving desk** after the original startup is observed.
6. Stop and reopen through the same Applications entry to continue the selected desk.

A portable restore changes a fresh destination's logical workspace identity to the identity in the package. Complete that restore before reviewing the destination in Applications. A running managed selection rejects an identity-changing restore with `MANAGED_WORKSPACE_BINDING`; initialize and restore the fresh destination, then select that restored desk.

The source-owned registration is [../../../distribution/contributions/ciim-desk.json](../../../distribution/contributions/ciim-desk.json). It includes the CLI, typed model/client exports, browser assets, Applications provider, and the actual `archive.py` support file.

## Receive an original native package

Open **Intake** and select the original ZIP. Enter its expected SHA-256 when the delivery supplied one. Choose **Inspect original package**.

Inspection retains the exact input ZIP and checks its full member inventory and completed native editions. It links each result to its original source/capture hashes. The original absolute path recorded by the earlier machine is historical information; the receiving package supplies the actual retained source members.

Inspection returns an immutable candidate ID and edition choices. It does not accept or review those editions yet.

For a native package:

1. Read the filename, byte count, SHA-256, member count, and complete original edition choices.
2. Check the repository, metadata prefix, native edition identity, and active/deleted counts.
3. Enter a receiving label.
4. Select the editions for this intake.
5. Choose **Receive selected native editions**.

The receiving result records the original candidate, selected edition IDs, operator, operation ID, and revision. Selecting a previously imported original edition retains its identity and avoids creating a second record population.

A complete native input may contain more editions than the selected receiving scope. The original archive remains complete. Handbacks list both the selected reviewed editions and the original archive's full edition coverage.

### The supplied three-edition case

The completed source case is:

- Filename: `CIIM-Proteus-native-receiving-case.zip`
- Bytes: `15587672`
- SHA-256: `26f5cc490aef1e2b292a55e04ba2372d3ca4e2703f8b32bc2d5b52a89c81a91c`

Its original completed results contain:

| Original edition | Active records | Deleted records | Total observations | Receiving use |
| --- | ---: | ---: | ---: | --- |
| Zenodo DataCite | 231 | 0 | 231 | Original DataCite identity, repeated metadata, mixed content, profile and source-page review. |
| OpenAlex withdrawal | 168 | 1 | 169 | Original Dublin Core records and one explicit retained withdrawal. |
| OpenAlex restored | 169 | 0 | 169 | The same source population after explicit restoration. |

The two OpenAlex editions preserve their original labels, including `openalex-withdrawal` and `openalex-restored`. Selectors also show active/deleted counts and a native edition ID prefix. Use those fields to select the intended edition.

These are 569 observations across three editions, not 569 distinct source entities. The record for original OpenAlex work `W116719298` is retained across withdrawal and restoration. Compare the two OpenAlex editions in that order to inspect the restoration. DataCite belongs to a different original repository and metadata prefix and is reviewed separately.

The original case's complete native transform, source pages, profiles, and runtime remain the receiving input. The interactive desk builds its following review history from those accepted files.

## Enter the receiving context

Open **Receiving context** before making the named receiving decisions.

Supply:

- A clear desk label.
- Institution name and a reference to the actual intake or project.
- Receiving environment name and its reference.
- Processing-profile name, reference, and version.
- Named authorities, each with a stable ID, name, and reference.
- A note describing the current receiving scope.

The **Operator name** at the top of the desk records the person or operator responsible for the action. The **Named authority** on a review records the selected institutional decision authority.

The context is versioned with the desk. Institution, environment, profile, or authority changes make earlier current reviews stale. The original decisions remain in History and any already-created handback. Review the selected editions and profiles under the new context before creating a later handback.

Changing only a descriptive desk label or note does not change the original source identity. Source identifiers, status, dates, and metadata stay in their original native records.

## Inspect complete records and original sources

Open **Records**, choose an original edition, and use the query and status filters. The table is paginated for interaction; the edition and review scope retain the complete population.

Filters include source state, retained issues, and current receiving decisions. **Apply filters** changes the visible rows. It does not delete records, replace the original edition, or reduce a whole-edition review to the current page.

Open an original record to inspect:

- Original identifier, observation ID, ordinal, datestamp, and active/deleted state.
- Complete mapped native record, including repeated arrays and original mixed content.
- Retained source issues and provenance.
- Original profile hashes.
- The exact original source request and page descriptor.
- Current effective review, authority, note, and record hash.

Download the **original XML**, **native conversion**, and **mapped page** from that record. The same original request ID selects all three related files. Profile, manifest, operation, and source downloads are available from the profile/source view.

| Attachment | Meaning |
| --- | --- |
| XML | Exact retained source OAI response page, checked against its original source hash. |
| Native conversion | Original decompressed Proteus XML-to-JSON result for that request. |
| Mapped page | Complete original mapped JSONL records belonging to that request. |
| Profile | Exact generated native specification, identified by its SHA-256. |
| Manifest | Completed native edition, source/runtime/profile binding and full result inventory. |
| Operation | Original transformation continuation state. |
| Source | Original OAI source descriptor linked to its captured edition. |

Original whitespace, ordered arrays, repeated values, null, and absent properties have distinct meanings in these records. Use the original JSON and XML to resolve a field question. A receiving exclusion does not modify any of those values.

## Record named review decisions

Every review has a decision, named authority, note, and optional decision reference. The desk records the operator, time, original subject, context digest, and revision.

### Whole edition

Use **Review the complete edition** on Records. An accepted whole-edition review supplies the initial named acceptance for the full original population, including records on other pages.

A later explicit record decision overrides that earlier population review. A later whole-edition acceptance can establish a new effective review over earlier individual decisions; the earlier explicit decisions remain in History. Before accepting the whole edition again, read the current exclusions and corrections and decide whether the new population-wide review should cover them.

### Individual records or an explicit selection

Use the record dialog or select the original record IDs in the table. The saved review targets those retained IDs. A full-population record review through the typed API uses the original `populationDigest`.

| Decision | Result |
| --- | --- |
| `accept` | The original record is included in the reviewed output once the selected edition and profiles are ready. |
| `exclude` | The record remains in the original input and complete reconciliation with its named reason, and is omitted from the reviewed accepted-record output. |
| `needs_changes` | The record remains an unresolved receiving correction for a new handback. |
| `reopen` | The earlier current decision is reopened for a new review. Historical handbacks retain their original decisions. |

An explicit deleted source record is still a record to review. Accepting it retains the original withdrawal in the reviewed metadata. Excluding an active record is a receiving decision and does not turn it into a source withdrawal.

### Native profiles

Open **Profiles**, choose the original edition, and inspect each retained specification. Record a named decision for every profile used by the selected edition.

Profile acceptance is separate from whole-edition acceptance. The profile review binds the actual SHA-256 of the original specification. This prevents a description of a mapping from being substituted for the delivered native profile.

### Source issues and corrections

Use an issue's original observation and page to determine the correction. Record the actual decision and reference. If a source or transformation must change, produce and receive a new completed edition through the maintained source/transformation application. Preserve the earlier input and compare the resulting editions in the desk.

The receiving desk's `needs_changes` and `reopen` decisions record this work. After the correction arrives, review the new original edition and create a later handback. The receiving history remains available to the next operator.

## Compare successive editions

Open **Edition changes**.

1. Choose **Earlier edition** and **Later edition** using the original labels, state counts, and native IDs.
2. Enter a comparison label.
3. Choose **Save complete edition comparison**.
4. Open the retained comparison and inspect its complete counts.
5. Filter or paginate the visible rows as useful.
6. Review original before/after records and changed property paths.
7. Record a named review for the complete comparison.

Comparisons require different editions of the same original repository and metadata prefix. They pair records by the exact original identifier. Titles and display labels do not define identity.

| Comparison classification | Meaning |
| --- | --- |
| `added` | The identifier occurs only in the later edition. |
| `not_present` | The identifier occurs only in the earlier edition. Absence alone is not a source deletion. |
| `withdrawn` | The earlier active record has an explicit deleted header in the later edition. |
| `restored` | The earlier explicit deleted record is active in the later edition. |
| `changed` | The paired original records have a retained property difference. |
| `unchanged` | The paired comparison projections are equal. |

Changed-property rows retain a path and a separate presence/value pair for each side. This preserves a removed field, explicit null, an empty value, and a changed repeated-array element as different observations.

A comparison review always covers the complete retained comparison population. Filters affect the view only. Include both original editions when adding that comparison to a handback.

For the supplied OpenAlex case, choose the withdrawal edition before the restored edition and inspect the original `W116719298` record. The earlier original deleted state and the later active metadata provide the restoration evidence.

## Create and deliver a reviewed handback

Open **Handbacks**. Select the editions and any retained comparisons for this delivery. Give it a meaningful label, choose the named authority, and enter the delivery note.

The desk checks the selected scope:

- Institution, receiving environment, and processing profile are present.
- Every selected edition has a current accepted named review.
- Every native profile used by those editions has a current accepted review.
- Every original selected record has an effective accepted or excluded decision.
- Every selected comparison has a current accepted review and both of its editions are included.

The page shows the concrete remaining items. Complete those decisions and choose **Create immutable handback**.

A created handback freezes its original context, authorities, review revision, complete record reconciliation, selected comparisons, original source coverage, and the exact retained state needed to reopen it. Later changes to the desk produce later handbacks.

Download the saved handback ZIP and open its `review.html`. The report includes all selected original-record decisions, profile-review tables, named reasons, hashes, and links to the original per-edition reports. The archive includes the complete original input ZIPs, so the reported source coverage remains available.

Keep the downloaded ZIP together with its returned byte length and SHA-256. The recipient restores that complete package to continue the operation. The original transformation report remains useful for detailed metadata inspection; the receiving report adds the named delivery decisions.

## Reopen a workspace or handback

There are two reopening operations:

- **Open the same local desk**: start `serve` on its existing directory. Current state, original requests, decisions, and handbacks are already there.
- **Receive a portable package**: initialize a fresh destination, inspect the workspace or handback ZIP, and restore it there.

A portable restore preserves the original logical workspace ID, editions, record IDs, profile identities, comparisons, handbacks, and operation history. It adds the original receiving restore operation at the next revision.

### Browser restore

1. Initialize a fresh destination at a new path.
2. Start that destination directly with `serve`.
3. In Intake, select the complete workspace or handback ZIP and inspect it.
4. Confirm the original package kind, workspace ID, revision, source coverage, and editions.
5. Enter the restore note and choose **Restore complete desk**.
6. Continue in the restored workspace shown by the refreshed page.

The destination must still be at revision zero. Saving context or making another write before restore makes it a used desk; choose a fresh destination for the portable receiving operation.

Both workspace ZIPs and reviewed handback ZIPs restore a complete desk. The handback opens the saved history at that handback's original frozen revision, followed by the restore operation.

### Command-line restore

~~~sh
CIIM_RESTORED=/absolute/work/ciim-received
node "$CIIM_CLI" init --workspace "$CIIM_RESTORED" --python /usr/bin/python3
node "$CIIM_CLI" import --workspace "$CIIM_RESTORED" --file /absolute/delivery/handback.zip
~~~

Use the actual `candidateId` returned by inspection:

~~~sh
node "$CIIM_CLI" restore --workspace "$CIIM_RESTORED" \
  --candidate ACTUAL_CANDIDATE_ID \
  --note "Received the complete reviewed metadata handback." \
  --operation ORIGINAL_RESTORE_OPERATION_ID --revision 0 --actor "Receiving operator"
~~~

Keep that exact original operation ID and body if the response is interrupted. Repeating the same request returns the saved receipt before checking the current revision.

Open the restored desk, inspect its original records and History, and export the same historical handback again. A later correction is a new named operation in this same restored history.

## Recover an interrupted save

The browser retains a complete write request before sending it: original operation ID, expected revision, actor, type, and data. A second tab cannot replace another retained original request before it is resolved.

If a response is interrupted:

1. Keep the same browser profile and desk origin.
2. Reopen the desk's current local URL and select **Recover original request** when the pending panel appears.
3. The browser sends the same complete original request.
4. The server returns the saved result if it had committed. If it had not committed, the same original request can complete once.
5. Read the saved state and History before making a different decision.

A portable restore changes the destination's logical workspace ID. The pending restore request remains associated with its original destination directory and retained source-package identity, so the browser can reconcile it after that identity transition.

For a normal server restart, use the same desk and retained listener port. Open the new startup URL for the current session. The pending request stays in IndexedDB at that original origin. A browser Back/Forward cache restoration reloads the saved route and reads the original state without replaying a mutation automatically.

If a server returns a definite validation or revision rejection, the pending panel retains that rejection and permits an explicit dismissal. Refresh and make the corrected decision under a new operation ID. An interrupted or unknown result is recovered with its original request.

For CLI or agent callers, save the complete request before sending and use `act --request` to replay it:

~~~json
{
  "operationId": "original-record-review-operation",
  "expectedRevision": 8,
  "actor": "Receiving operator",
  "type": "records.review",
  "data": {
    "editionId": "ACTUAL_EDITION_ID",
    "recordIds": ["ACTUAL_RECORD_ID"],
    "decision": "accept",
    "authorityId": "ACTUAL_AUTHORITY_ID",
    "note": "Reviewed the original record and its source page.",
    "reference": "ACTUAL_REVIEW_REFERENCE"
  }
}
~~~

The example illustrates the request shape. Replace its IDs, revision, operator, and reference with the actual receiving values before saving it.

~~~sh
node "$CIIM_CLI" act --workspace "$CIIM_WORKSPACE" --request /absolute/requests/original-review.json
~~~

A changed payload under the same operation ID is an operation conflict. Preserve the original request and use a new operation ID for a different decision.

## Command-line workflow

The CLI operates the same model as the browser. Every command returns JSON with the original IDs, revision, hashes, or saved receipt.

| Command | Use |
| --- | --- |
| `describe` | Read supported actions, views, decisions, original-identity rules, and limits. |
| `operations` | Read the complete typed, machine-readable operation schema. |
| `status --workspace ABS` | Read current context, editions, readiness, comparisons, handbacks, and revision. |
| `list --view records --edition ID` | Read a page of original records with complete population counts. |
| `record --edition ID --record ID` | Read a complete mapped record and its source/provenance. |
| `import --file ORIGINAL.zip` | Retain and inspect a complete original native/workspace/handback package. |
| `accept --candidate ID --label TEXT` | Receive selected original native editions. |
| `context --file CONTEXT.json` | Record the actual institutional receiving context. |
| `review edition/profile/records/comparison` | Record the corresponding named decision. |
| `compare --before ID --after ID --label TEXT` | Retain a complete comparison of original compatible editions. |
| `handback --edition ID --label TEXT ...` | Freeze a reviewed delivery scope. |
| `export --kind workspace` | Export the complete current desk. |
| `export --kind handback --handback ID` | Export a particular immutable historical handback. |
| `attachment --edition ID --kind xml --id REQUEST_ID --out ABS` | Save exact original attachment bytes. |
| `restore --candidate ID ...` | Receive a complete portable desk into a fresh destination. |

Commands that open the desk also take `--workspace ABS` and optionally `--python PYTHON`. Write commands take:

~~~text
--operation ORIGINAL_ID --revision EXACT_CURRENT_REVISION --actor NAME
~~~

Review commands also take:

~~~text
--decision accept|needs_changes|reopen --authority ID --note TEXT
~~~

Record reviews additionally support `exclude`. Use `--note-file ABS` instead of `--note` for a retained UTF-8 note. Repeated `--edition`, `--record`, or `--comparison` flags select exact IDs; the CLI rejects duplicate choices. Use the actual current revision from the last saved result or a fresh status read.

### Inspect the full population

~~~sh
node "$CIIM_CLI" list --workspace "$CIIM_WORKSPACE" \
  --view records --edition ACTUAL_EDITION_ID --offset 0 --limit 250
~~~

Continue with the returned `total` and successive offsets until the entire selected view is read. The full edition `populationDigest` remains available alongside the view. A record query or filter does not replace it.

### Receive the supplied original case

~~~sh
node "$CIIM_CLI" import --workspace "$CIIM_WORKSPACE" \
  --file /absolute/delivery/CIIM-Proteus-native-receiving-case.zip \
  --sha256 26f5cc490aef1e2b292a55e04ba2372d3ca4e2703f8b32bc2d5b52a89c81a91c \
  --bytes 15587672
~~~

Use the returned candidate ID and the chosen original edition IDs with `accept`. Read the next revision from that result before saving the receiving context or reviews.

### Save the complete workspace

~~~sh
node "$CIIM_CLI" export --workspace "$CIIM_WORKSPACE" \
  --kind workspace --out /absolute/delivery/ciim-workspace.zip
~~~

An existing destination is accepted only when its bytes and hash match the export. Choose a new output path for a changed delivery.

## Typed and HTTP integration

The typed entry point in [client.mjs](client.mjs) exposes the complete operation description and calls the same model. The package contribution exports the model as `./seller/ciim-desk` and the typed client as `./seller/ciim-desk/client`.

The native model interface is:

~~~js
const desk = await openCiimDesk({
  directory: "/absolute/private/desk",
  create: false,
  python: "/usr/bin/python3"
});

try {
  const state = desk.state();
  const page = await desk.view({
    view: "records",
    editionId: "ACTUAL_EDITION_ID",
    offset: 0,
    limit: 250
  });
  const record = await desk.record({
    editionId: "ACTUAL_EDITION_ID",
    recordId: "ACTUAL_RECORD_ID"
  });
  const receipt = await desk.act(originalSavedRequest);
} finally {
  await desk.close();
}
~~~

Use the existing local HTTP listener when it owns the desk. Every API call carries the current `X-CIIM-Session` header. The browser handles it automatically.

| Route | Operation |
| --- | --- |
| `GET /api/launch` | Current startup and original workspace binding. |
| `GET /api/describe` | Supported model operations and limits. |
| `GET /api/state` | Current retained receiving state and revision. |
| `GET /api/view` | Paged original records, profiles, comparisons, history, or handbacks. |
| `GET /api/record?editionId=...&recordId=...` | Complete original record and source relationship. |
| `POST /api/import` | Inspect raw ZIP bytes. |
| `POST /api/act` | Submit or recover the complete original saved write request. |
| `GET /api/export/workspace` | Complete current portable workspace ZIP. |
| `GET /api/export/handback?handbackId=...` | Complete selected historical handback ZIP. |
| `GET /api/attachment?editionId=...&kind=...&id=...` | Exact original source/result/profile attachment. |

A raw ZIP upload uses `Content-Type: application/zip`, `X-CIIM-Filename` containing the percent-encoded original filename, and optional `X-CIIM-SHA256`. JSON actions use `Content-Type: application/json`.

Downloads include the original byte length, attachment filename, and `X-Content-SHA256`. The server streams the complete native export or attachment. Its private filesystem path is not part of the browser response.

Errors contain `code`, `message`, `status` at the native/CLI layer and `{error:{code,message,details}}` with the HTTP status at the HTTP layer. Resolve the named original source, review, or revision issue and recover the same request when its result is unknown.

## Storage, limits, and complete coverage

The desk stores its original marker, SQLite receiving state, exact input archives, extracted validated input trees, operation history, and historical handback checkpoints in a private directory.

| Limit | Value |
| --- | ---: |
| Original archive bytes | 512 MiB |
| Expanded package bytes | 2 GiB |
| Native member bytes | 256 MiB |
| Native manifest bytes | 16 MiB |
| Portable desk-state bytes | 64 MiB |
| Archive members | 20,000 |
| Original records | 250,000 |
| View page size | 250 |

A result exceeding a complete-package or state limit returns an explicit size error. It is not silently shortened. Select a coherent receiving scope and preserve its complete original source rather than treating a page of rows as the whole source edition.

The private listener preference and live connection file describe the current machine. They are separate from portable logical identity. A restored package acquires the destination's own local listener while keeping the original desk, records, reviews, and history.

## Continue a real correction cycle

A useful receiving cycle finishes with a reopened result:

1. Receive the original source and transformation package.
2. Record the actual institution, environment, profile, and authorities.
3. Inspect source-linked records and all native profiles.
4. Accept the full edition, then record any explicit exclusions or unresolved corrections.
5. Compare the intended original editions and review the complete difference population.
6. Create and download the reviewed handback.
7. Restore that package into the following operator's fresh desk.
8. Reopen the actual record, profile, and comparison history.
9. Record a correction or later edition, then create a new handback.
10. Keep the earlier handback available at its original review revision.

The complete native input and the resulting receiving workspace travel together. This gives the next operator enough substance to continue the customer work from the delivered source, decisions, and editable history.
