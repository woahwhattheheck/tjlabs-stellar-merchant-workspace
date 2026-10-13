# VOLTTRON BACnet registry desk

This is a complete operator course inside the maintained Haystack turnover workspace. It uses the original workspace, native CSV/TSV intake, immutable history, operation journal, HTTP/MCP actions, ranged downloads and editable workspace package. Open `/volttron.html` on the existing server. The source-grid, typed-projection, Zinc and Brick modelling workflows remain available.

The desk prepares and receives a specifically selected BACnet registry and its unchanged device configuration. It does not connect to a building, change a controller, issue writes to a BACnet object, install VOLTTRON, or claim that an engineering check is an actual target run. A commissioning target, authorization and original receiving evidence must be supplied by the original operator.

## Complete source and target selection

Retain each whole registry CSV or TSV through the existing **Sources** form or `point-import`. The original semantic importer is the only CSV parser. Its physical rows, duplicate headings, source column positions, row-end lines and whole original bytes survive every review. Select the format/delimiter from the original file contract. Do not paste a shortened list or normalize duplicate headings before import.

Retain each whole original device JSON through **Import device configuration**. It is a separate immutable input: the application records ambiguous duplicate JSON keys and unsafe configuration numbers for review. It does not rewrite the device configuration to make a registry pass. Supply the author's name and original source reference in the note.

In **Device profile**, select the retained registry, retained device configuration and an exact device scope, then prepare a binding. A profile may contain several original device bindings. Current programme bounds count all physical rows across bindings: at most 1,000 rows and 20 configurations. Excluded and unresolved rows count too.

Complete the building reference, purpose, target product/version/build/driver release, interface, documentation URL, target environment, receiving method and original target-selection reference. Use **engineering** for an illustrative or offline source exercise; **commissioning** explicitly selects the intended real target and does not by itself prove a target run.

For every device, preserve the configuration-selected registry basename and an approval/reference for the mapping. The configuration's registry reference must select that basename. Downloaded files have collision-safe names containing the device's position; the manifest retains the original target registry reference so the operator can install them under the selected target name.

### Positional mapping

Each target column records its exact output heading and one original **column occurrence**, identified by zero-based position, or an explicit constant with a reason. Every original heading occurrence must either be projected or have a documented omission. Duplicate source headings are therefore visible and can be resolved deliberately. Unique target headings are required.

The structured table permits changing a target heading, selecting a different occurrence, introducing a constant and removing a target column. Removing the final projection of an occurrence reveals an omission-reason field. The complete profile JSON is also editable; use its explicit **Use complete JSON in draft** action before saving. Pending complete JSON is retained separately and holds the structured profile controls until explicitly used or discarded. Malformed nested content never replaces the valid structured draft. Profile saves bind the exact opened head and reviewed workspace revision.

The mandatory target headings are:

| Heading | Retained meaning |
| --- | --- |
| Volttron Point Name | Exact per-device point identity |
| Units | Original declared unit text, including a supplied blank |
| BACnet Object Type | Selected supported native object type |
| Property | Exact target property name |
| Writable | Native boolean spelling reviewed explicitly |
| Index | Original BACnet object instance |

Optional native headings are **Write Priority**, **COV Flag** and **Array Index**. Additional source columns remain retained. If projected to the target CSV, they are recorded in the output even where the selected BACnet driver ignores them.

## Native semantics that need an explicit review

The model follows the selected VOLTTRON 9.0.4 BACnet driver contract, not a guessed generic CSV format. The target profile states the actual selected version/build; receiving evidence must match it.

- The driver lowercases Writable and COV Flag without trimming. Space-padded values are not silently converted to true. The desk reports those source values for review.
- Blank or absent Write Priority preserves native omission; the proxy omits request priority, for which the documented default is 16. An explicit priority must satisfy the unchanged device minimum, including for a read-only row.
- Array Index is an optional native field. Original whitespace and spelling remain in the source; an approved target change records before/after values rather than normalizing the input invisibly.
- Point name uniqueness is scoped to the selected device. The same name on different devices is valid; repeated names within one device can overwrite native maps.
- Different point names mapping to the same object type/instance/property/array-index tuple can collapse a native read-multiple result and need review.
- Cross-device COV context behavior and other source-backed advisories remain explicit. A clean registry projection is not evidence of safe physical operation.

The official driver and configuration references remain part of the original ACE source/provenance package and each saved profile. Driver code is not executed by this desk. The complete original source must remain available when extending the supported profile to another target version.

## Every-row review and immutable editions

Save the complete profile before opening **Row review**. The preview always names its exact profile version. Browse or search all physical rows; paging does not reduce the saved or exported cohort.

For each original row choose **include**, **exclude** or **unresolved** with a reason. Missing values differ from present empty text. The selected-row panel shows the complete original row, source headings, mapped cell presence, target position, field lineage and changes.

A field change has all of:

- Target column position.
- Exact mapped before cell as `{present:true,value:"…"}` or `{present:false}`.
- Explicit after cell with the same presence contract.
- Transformation rule and original evidence.
- Named approver and approval reference for protected identity/control fields.

Typed field edits are retained separately as you type, including across row/filter navigation and refresh. Keep or explicitly discard each pending field edit before changing the selected source, previewing or saving; the full draft download includes those pending values.

After editing decisions or cells, preview again to recompute the complete findings and output inventory. Saving an edition validates every original row and field preimage through the same model. It freezes all decisions, the complete review identity and target-file manifest. Unresolved editions remain saveable and reportable, but target import files are released only when the complete selected target review is ready.

Opening an edition is read-only. **Prepare successor from edition** retains all decisions and the parent edition, while the original edition stays immutable. If the profile head has changed, select that exact current profile explicitly rather than silently carrying stale mappings. Compare any two retained editions to inspect full added/removed/changed row objects and both complete file manifests.

Reports cover every physical row, including exclusions and unresolved records. CSV report cells that could execute a spreadsheet formula are escaped; original registry target values remain exact and are not replaced with report-safe values.

## Actual receiving and failures

In **Receiving**, open the exact frozen edition, then select a complete receiving evidence JSON. This is a retained output from the original target run, not a form that manufactures observations from the expected registry.

The evidence contains:

```json
{
  "mode": "actual",
  "product": "VOLTTRON",
  "version": "exact selected version",
  "build": "exact selected build",
  "environment": "exact selected environment",
  "operationId": "original target run identity",
  "startedAt": "2026-10-13T00:00:00Z",
  "endedAt": "2026-10-13T00:01:00Z",
  "outcome": "passed",
  "inputManifestSha256": "exact frozen target manifest",
  "outputs": [{"name":"original-output.json","base64":"complete original bytes"}],
  "observations": [{
    "deviceKey":"exact selected device",
    "pointName":"exact original observed point",
    "values":{"Volttron Point Name":"exact literal"},
    "outputName":"original-output.json",
    "locator":"physical original output record"
  }]
}
```

Retain all observed fields and points. The complete model compares presence as well as literal values and reports missing points, extras, duplicates, field mismatches and device coverage. Read the entire result: process outcome and correspondence outcome are separate. A passing process with mismatched rows does not become a complete receiving match. Excluded fields and original configuration are not quietly inferred from observation names.

Keep actual **failed** and **interrupted** runs. A later record can name `supersedesReceivingId` while retaining the earlier run. Every output is preserved with its whole bytes/hash and is available through the original download engine.

## Requests, drafts and lost responses

Every browser mutation is stored in the original IndexedDB operations store before sending. It retains complete arguments, original workspace/instance, operation ID and expected revision. Drafts use the existing draft store and a separate tab-specific registry key.

During file reads and requests the editor holds the selected state. Controls and the body's busy indicator remain disabled throughout that operation. A new workspace revision never silently rebases a draft. **Review current revision** checks the same profile head before explicitly updating the reviewed revision.

If a response is lost, open **Requests**, read its original receipt and only then **Continue same request**. The application reads `operation.read` before any resend. It does not assign a replacement operation ID or change the original source/revision. Download the full editor draft if local persistence fails. A completed old request does not replace a newer draft.

The server enforces workspace identity, revision and immutable operation replay independently of the browser. Local CLI and connected CLI use the same contract.

## Full delivery and contractor return

From **Handover**, prepare JSON/CSV/HTML review reports, exact ready target registry/configuration files, original receiving outputs, or the **complete editable workspace**. Every prepared download retains its original request, manifest, full byte length and hash. The client receives all ranges and verifies the whole file before saving.

The editable package includes source grids, native CSV/TSV assets, semantic models, typed projections/Zinc work, corrective work, registry profiles/versions/editions/receiving/returns and the complete maintained application source.

```sh
node cli.mjs verify --file complete-workspace.json
node cli.mjs receive --file complete-workspace.json --destination received
node received/application/cli.mjs serve --directory received
```

Receive into a distinct owned directory. An interrupted receive continues only the same package identity. Open the received composed application, not a stale parent source checkout.

For contractor work, import the complete returned workspace into **Return a contractor's whole workspace**. Review every local/incoming profile and both saved head identities. Choose **KEEP** or **adopt** explicitly for every profile; a newly incoming profile cannot be kept without a local version. The original return engine retains both complete histories and original source assets. Adopting an incoming profile records its ancestry instead of deleting the local edition.

## CLI course

Use the existing `--directory DIR` or `--url ORIGIN` / `--connection FILE` target options. Use `--token-file` only for a configured server. A command that writes saves its complete request before dispatch; choose `--request-file` or `--request-directory`, and preserve the original operation ID.

```sh
node cli.mjs point-import --directory work --file registry.csv --format csv
node cli.mjs volttron-configuration-import --directory work --file device.json --author "Operator"
node cli.mjs volttron-status --directory work
node cli.mjs volttron-profile-template --directory work --intake-id UUID --configuration-id SHA --device-key device-a --out template.json
node cli.mjs volttron-profile-save --directory work --file profile-arguments.json
node cli.mjs volttron-preview --directory work --file complete-decisions.json
node cli.mjs volttron-edition-save --directory work --file edition-arguments.json
node cli.mjs volttron-edition --directory work --edition-id SHA --out edition.json
node cli.mjs volttron-report --directory work --edition-id SHA --format html --out review.html
node cli.mjs volttron-output --directory work --edition-id SHA --name EXACT_FILE --out target.csv
node cli.mjs volttron-receiving-record --directory work --file original-evidence-arguments.json
node cli.mjs volttron-receiving --directory work --receiving-id SHA --out receiving.json
node cli.mjs volttron-receiving-output --directory work --receiving-id SHA --name EXACT_FILE --out original-output.json
node cli.mjs volttron-compare --directory work --before SHA --after SHA --out comparison.json
node cli.mjs export-workspace --directory work --out complete-workspace.json
node cli.mjs replay --directory work --request-file ORIGINAL.request.json
```

Friendly JSON argument files contain business fields, not a replacement operation ID or expected revision. Use explicit CLI `--operation-id` / `--expected-revision`, or the general `request ACTION --args COMPLETE.json` for an already prepared full request. A saved profile request supplies `content, author, note`, plus `profileId, expectedHeadId` when continuing. Edition input supplies `profileId, profileVersionId, decisions, author, note` and optional original parent. Receiving input supplies `editionId, evidence, author, note`.

## Whole source-native receiving programme

`VOLTTRON_RECEIVING.mjs` drives the existing real store, HTTP client, native intake, full delivery and cold restored composed application. It accepts an explicit original programme; no dataset or successful target evidence is invented.

```sh
node VOLTTRON_RECEIVING.mjs --programme programme.json --directory work --output receiving
```

The programme schema is `commons.haystack.volttron-receiving-programme.v1`. It contains original `operationId,title,registries,configurations,profiles,editions,receivings` and optional `comparisons,returns,browserEditions`.

Registry/configuration rows have a stable `key,name,path,sha256` and optional exact `bytes`. Registries declare `format,delimiter,sourceUrl`; configuration rows declare `author,note`. Paths resolve relative to the original programme.

Profiles retain full `content,author,note,key` and `bindings:[{bindingIndex,registryKey,configurationKey}]`. The driver substitutes only the actual retained intake/configuration identities from earlier original receipts. Editions contain `key,profileKey,decisions,author,note`, optional `parentKey` and selected `expectedCounts`. Receiving rows contain `key,editionKey,evidence:{path,sha256,bytes},author,note`; their observations/outcomes are never filled from the expected review. Returned packages likewise have exact original `package:{path,sha256},decisions,author,note`.

All complete source inputs are checked before the first mutation. The programme/output/source binding is immutable. Each original mutation is retained under a deterministic operation identity, read or replayed through the maintained engine, and compared. The driver exports every edition's full three reports and, when ready, every exact target file; it keeps every actual receiving output and comparison. It exports and independently receives the whole workspace, imports the delivered composed Store class, reopens every historical registry edition and receiving, and opens the same status through the delivered CLI.

When actual browser capacity and the retained runtime are selected, append:

```sh
--playwright /absolute/original/playwright/index.mjs --chromium /absolute/original/chromium
```

The browser course uses the supplied existing Playwright/Chromium, opens all six sections at desktop and mobile widths, visits every physical row page, verifies exact committed JSON/CSV/HTML downloads against the original request and ranged bytes, reloads the same tab, and repeats on the independently received application. It saves actual screenshots and complete file identities. Browser, native intake and retained target-evidence coverage are reported separately. Omitting browser paths does not claim a browser run; absent actual target evidence does not claim a target run.

Run this whole programme through the existing authorized native controller and measured full-run resource request. Preserve its original job ID, inputs, output directory and terminal result across interruption. No new scheduler, provider acquisition or target driver is introduced by these files.
