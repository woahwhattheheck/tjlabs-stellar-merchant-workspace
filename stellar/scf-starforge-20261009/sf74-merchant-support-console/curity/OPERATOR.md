# Curity audit review in the original Support desk

This extension retains complete Curity JSON or NDJSON source, exact mapping and named review, then attaches a bounded evidence selection to an existing SF74 case. The original merchant workspace, native incident API, case writer and complete-case receiver remain authoritative.

## Open the selected complete application

Use the complete original merchant source closure with the provider extension joined into sf74-merchant-support-console/server.mjs. Open it with the existing Node and Python dependencies used by SF74; no new identity provider is installed.

Create an operator-owned mode-0600 configuration file in a private directory:

```json
{
  "casesDir": "/absolute/private/original-cases",
  "directory": "/absolute/private/curity-companion",
  "sourceDir": "/absolute/private/original-source-delivery",
  "applicationFiles": [
    {
      "name": "repo-relative/path/to/each-actual-source-file",
      "path": "/absolute/selected/source/file",
      "bytes": 123,
      "sha256": "ACTUAL_SHA256_OF_THAT_COMPLETE_FILE"
    }
  ],
  "port": 0
}
```

The example inventory is a shape, not a usable source receipt. Supply every file from the selected readable application closure with actual byte counts and hashes. Package export verifies every file. Keep the companion directory outside the cases directory and its original source-delivery directory. Existing handoffSources and incidentSources configuration paths can be selected explicitly; credentials remain under the original host configuration.

Run:

```sh
node stellar/scf-starforge-20261009/sf74-merchant-support-console/curity/http.mjs --config /absolute/private/curity-config.json
```

Open the returned local /curity/ URL. The original server keeps its loopback and exact Host checks. Private reads reject foreign origins and every mutation requires the original same-origin browser. The provider handler finishes its active requests before the original underlying case/source/incident services close.

For embedding in the maintained native programme, import startCurityConsole from http.mjs. It returns the original server/url/close result and providerExtension.controller. The controller factory is openCurityOperator({directory,store,casesDirectory,sourceDelivery,incidentDesk,applicationFiles,python,environment}).

## 1. Retain the original source

Choose 1–20 actual original files, at most one GiB in total (including empty originals), and explicitly choose JSON document or NDJSON framing for each. Original filenames, file order and SHA-256 remain attached to the immutable edition. Identical files supplied twice retain distinct source-N occurrence identities.

Choose PUBLISHER_EXAMPLE for published examples. This label remains visible in the review, case evidence and portable package. Choose SUPPLIER_EXPORT only for an actual supplied installation export. Enter the actual installation, source edition, resource, configuration SHA-256 and exact RFC3339 window. Profile/listener coverage is explicit; absence is not inferred coverage.

Map exact field paths or select the strict Curity message layout. Type, ID, audit instant and message remain lossless: large numeric identifiers and nanosecond instants are not rounded; missing and empty fields remain distinct. Outer timestamps have an independently selected unit and never silently replace the audit instant.

An optional observer descriptor must refer to actual retained configuration/window-bound evidence. Audit events are not joined to individual requests or OAuth minute counters. Original OAuth credentials, counters and issuer behavior stay in the original observer.

The initial build is an unconfirmed inspection edition. The browser saves the request identity before dispatch; failed acknowledgments can be retried with the same body. An interrupted upload accepts only the original matching prefix. After reopening, reselect the same full files and framing to finish the retained intake. Different bytes are preserved as a conflict, never substituted.

## 2. Inspect and confirm a review

Read paged events and findings. Each event shows its typed fields, exact audit instant, source file and original record ordinal. “Read original” returns the exact original record bytes and verifies their SHA-256. Complete original downloads are available for records beyond the bounded preview size.

Select exact source occurrences. Include/exclude decisions and an explicit reason for an accepted collision remain attached to the original sourceId and recordOrdinal. A later colliding variant can change a previously seen event's final disposition; the confirmed immutable review, not a stale page row, controls case attachment.

Enter the named operator and review reason, then freeze a new confirmed edition. The original inspection remains. It uses the same complete original files and source edition. Source mappings are not changed silently. INCOMPLETE_SOURCE remains visibly incomplete even when classified evidence is explicitly reviewed. Only accepted, repeated or explicitly accepted collision occurrences can enter the confirmed case selection.

At most 1,000 references are attached to a case operation. The complete audit remains pageable and is included in the handover.

## 3. Apply evidence to the existing case

Read the existing native case and its current revision. Choose evidence from a confirmed review, add a case note and select only the metadata changes intended. The metadata status choices come from the native case API.

“Prepare case comparison” freezes the source/review identity, exact input, native beforeimage and proposed field changes. Review that saved plan before applying. The writer rechecks the original case revision. If staff changed it, prepare a new reviewed operation from the current case.

A lost save acknowledgment is reconciled through the original native revision history. Repeating an applied operation returns its original receipt and a fresh comparison; it does not create another case or overwrite later work.

The comparison shows the accepted value, current value and whether each selected field is still unchanged. “Restore this operation's unchanged fields” requires a fresh current revision. It restores only those selected fields while preserving current workspace/support bytes and unrelated metadata. A staff-changed selected field is skipped and reported; other still-matching fields are restored. Fields already at their before-value are reported separately as already restored. Original evidence, beforeimages, receipts and native history remain retained.

An optional incident acknowledgment is a separate explicit action against the original source ID, incident ID, configuration and revision. It does not send notifications, change OAuth configuration or reverse a real acknowledgment during case rollback. Received packages cannot inherit authority to acknowledge the sender's incident.

## 4. Export and receive the complete package

Build a package for an applied operation. It contains:

- The complete unchanged native case package and its history, original source bundles and receiving information.
- Every original audit file, event/finding report, mapping, review and exact manifest.
- The case operation's selection, beforeimages, original application receipt and available rollback/acknowledgment history.
- The complete selected readable application source inventory.

The export freezes its source/case/application selection and creation time before copying. Interrupted copies resume only an exact prefix. A different existing member is preserved. The final manifest is published only after every declared original member exists. Repeating the same export ID reopens that complete package.

“Save complete package folder” uses the browser directory API where available. Existing different files are preserved. The fallback lists every member with its required relative path. A manifest alone is not a complete handover. An operator can also copy the complete retained packages/exports/EXPORT_ID directory through the native filesystem or the existing delivery mechanism.

For a receiving workspace, open an independent original SF74 case store and source delivery, then select the whole exported folder. Uploading the manifest never authorizes arbitrary local paths: only declared original member names are accepted. Every byte count/hash, audit edition, review, native package and application inventory is verified before receiving.

The unchanged native receiver creates its actual recipient case UUID and imported revision. The companion records that original local baseline and source identity. It does not invent a local pre-import case. Subsequent staff edits are preserved when the same package is received again; the first receiving receipt remains the completed boundary. The received source remains pageable and exact. Selective rollback on a received binding compares current native fields with the actual accepted baseline.

Receiving source does not activate or execute imported application files or acquire sender credentials. To run the application, explicitly select its complete readable source and original dependencies as a normal local programme.

## Direct interfaces

- controller.prepareSource(input), uploadSource({inputId,index,stream}), buildSource({inputId}).
- controller.freezeReview({inputId,sourceInputId,review,mapping?}), then buildSource on that new input.
- controller.source.catalog(), manifest(editionId), events/findings({editionId,after,limit}), original({editionId,ref}), reviewedSelection({editionId,reviewId,eventKeys}).
- controller.bridge.prepare(input), apply({operationId}), compare({operationId}), rollback({operationId,rollbackId,expectedRevision,actor}), acknowledge({operationId,by,notes}).
- controller.portable.exportPackage({operationId,exportId}).
- controller.portable.receive({packageDirectory,expectedManifestSha256,requestId,actor,receivingDirectory,...explicit native receiving stores when different}).

The full source/parser contract is in SOURCE.md. The actual complete observer, case, staff-edit and independent receiving programme is in COMMISSIONING.md; its real result distinguishes source verification from executed native outcomes. This guide itself does not claim an executed customer installation.

## Whole case history and recipient return

An export selects and freezes the actual current native case revision, including intervening staff edits. The attachment's accepted revision and original field beforeimages remain separate. The original SF74 package carries the complete native case history. The companion carries every relevant Curity operation's plan and receipts, all referenced immutable audit editions, and retained received history. Historical operation paths include the original case UUID and operation ID, so separate cases never collapse matching operation names.

Receiving restores every referenced audit edition into the recipient's source catalog. It creates one local active binding for the selected operation at the actual imported native baseline. Earlier operations and incident bindings remain historical; they do not register or acknowledge the sender's incident service. Re-export carries that received history plus local operations and the recipient's current case. A later rollback restores only fields still equal to the accepted after-values; each changed staff field is reported under skipped, while restored lists the fields actually restored. The current revision remains the race guard.

## Original OAuth resource intake

The original incident-source startup profile optionally supplies up to eight oauthResources entries: {id,label,endpoint,tokenEnv}. tokenEnv names the existing environment variable; configuration files and exports never contain its token value. In the original incident workspace, select the registered source ID, inspect the real protected observation source, review its actual resource and configuration, add the exact returned oauth selection to the watcher configuration draft, then explicitly apply that draft against its current configuration revision.

The existing runtime intake supports OAuth source kind and its two original files. The original browser controls are incident-oauth-source, incident-oauth-id, incident-oauth-label, incident-oauth-inspect and incident-oauth-add; the runtime controls select runtime-source-kind=oauth and runtime-oauth. Incident detail preserves the original stage/window conditions, and Prepare Case uses the original runtime inspector to produce the complete support document. The four original OAuth stage counters remain aggregate observations and are separate from the individually retained audit events.

The browser computes original-file and saved-member SHA-256 in one-MiB slices. Server intake streams the selected exact bytes; paging does not load the whole audit into the browser. The source core's event identity index still consumes memory proportional to distinct identities and variants, as described in SOURCE.md.

## Complete source comparison in the operator

Select Before edition and Following edition, then Compare complete source editions. The saved browser action retains its comparison ID before calling the server. The original source comparator freezes both complete manifest identities; it compares every classifiable event identity, content variant and occurrence, with original findings and source completeness retained separately. The screen shows counts, mapping/configuration changes, source state and original-file changes. Both comparison.json and the complete changes.jsonl are downloadable. The retained comparison selector reopens that same result after refresh; it does not create another comparison engine or elect a winner among collisions.

The controller exposes compareSource({comparisonId,beforeEditionId,afterEditionId}), comparison({comparisonId}) and comparisonFile({comparisonId,name}). POST /api/curity/source/compare uses the original comparator; GET /api/curity/comparison and /api/curity/comparison-file reopen and download the complete output. Case-field comparison and reviewed-selection comparison remain separate scopes.

Companion capture and native case selection are explicit separate boundaries. An interrupted export can receive a later historical rollback or incident-acknowledgment receipt before its companion closure is frozen. The manifest retains capturedAt, the exact native selected/head identities, and each file's scope and native-revision inclusion. A planned baseline is not labeled an executed outcome; an incident observation is not a native case mutation. The imported passive history preserves this original capture annotation through recipient return.
