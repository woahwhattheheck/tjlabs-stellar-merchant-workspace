# Customer handover, reviewed returns and complete editable receiving

Continue a published customer Research handover through explicitly reviewed collaborator returns, then deliver the complete accepted dossier, original customer reports, full source and an independently reopened editable workspace.

This course operates the original customer-updates and dossier-returns APIs. Its baseline is the actual directory produced by createCustomerHandover, customer-updates-handover, or the delivery/correctionDelivery result of runResearchCustomerDelivery. The original handover remains at its published delivery revision. Each return records an accepted later native revision. Both travel together in the final archive.

Use the separately installed research-customer-programme --returns route when the baseline is a genuine complete customer-programme ZIP with its original PROGRAMME.json, scientific input selection and source manifest. Each route retains the schema and history of its actual producer.

## What the customer receives

The final ZIP contains the complete published customer handover and its original reports, original work review, portable dossier and any selected Europe PMC source workspace. It also contains every returned file, immutable comparison, all present base/current/returned values, original reviewed request, accepted receipt and historical dossier reports. The accepted final dossier is supplied as its original gzip portable, HTML, Markdown, metadata and complete revision history.

Every selected engine member, source licence and complete receiving implementation is included. Open START_HERE.html for the monochrome handover. Run OPEN.mjs to receive both the original customer delivery and the accepted extension into an editable Research application. Complete reports and source files remain directly accessible as ordinary files.

The final state COMPLETE is written only after the archive has been verified and reopened with the included original engine in a separate receiving directory. Source publication and parser checks alone are recorded as source readiness.

## Runtime and existing connection

Use the selected complete Research release on the original Node 24+ and Linux/Python 3.11+ receiving host. The Python archive reader uses only the standard library, ordinary files, no-follow opens, hard-link publication and flock. The original Research engine's runtime prerequisites still apply to its selected source/workspace families. A baseline containing an original Europe PMC workspace is restored through that native workspace API and its selected source actor.

Keep the existing Research listener and its private connection file. The course's init, prepare, apply and complete commands attach to that listener. They close their own client after the command, while the listener remains with its original owner.

Installed entrypoints:

~~~sh
starforge registrations --command research-customer-handover-returns
starforge research-customer-handover-returns help
starforge research-client customer-handover-returns help
~~~

The same complete source can run directly:

~~~sh
node /absolute/source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/handover-returns-cli.mjs help
~~~

All paths in a frozen selection are canonical absolute paths. A private operation directory holds the original selection, source receipts, native requests and complete output. Continue that directory after interruption.

## 1. Select the actual published handover

Choose the actual delivery or correction delivery that is in scope for this customer. With an already completed runResearchCustomerDelivery, use its delivery.directory or correctionDelivery.directory and the matching manifestSha256. With an existing published delivery, create the original handover through the native command:

~~~sh
starforge research-client customer-updates-handover \
  --connection-file /private/research-connection.json \
  --directory /absolute/original-research-workspace \
  --id ACTUAL_DOSSIER_ID \
  --delivery ACTUAL_PUBLISHED_DELIVERY_ID \
  --revision ACTUAL_DELIVERY_REVISION \
  --out /absolute/customer/original-handover
~~~

If that delivery selects a Europe PMC source workspace, also supply the original --source-workspace file described by customer-updates-help. It contains the existing library, actor and stable request ID. The complete original query/acquisition workspace then travels beside the dossier.

Inspect all original handover files:

~~~sh
starforge research-client customer-updates-inspect \
  --source-directory /absolute/customer/original-handover \
  --manifest-sha256 ACTUAL_HANDOVER_MANIFEST_SHA256
~~~

The inspector checks all frozen report/work/portable/source bytes and the native delivery revision. Select the actual receiving/review workspace. It may be the existing original workspace or a new workspace already running under the original application. Init receives the selected original handover into that workspace using the maintained receiveCustomerHandover operation.

For a new empty workspace, expected_revision and expected_revision_sha256 in the course selection are the handover's actual portable revision and headSha256. For an existing workspace with later authored edits, obtain its current metadata and full revision history; select the actual current revision/SHA, whose history must contain the published handover prefix.

~~~sh
starforge research-client status \
  --connection-file /private/research-connection.json \
  --directory /absolute/original-research-workspace

starforge research-client metadata \
  --connection-file /private/research-connection.json \
  --directory /absolute/original-research-workspace \
  --id ACTUAL_DOSSIER_ID

starforge research-client section \
  --connection-file /private/research-connection.json \
  --directory /absolute/original-research-workspace \
  --id ACTUAL_DOSSIER_ID --section revisions \
  --revision ACTUAL_CURRENT_REVISION --offset 0 --limit 100
~~~

Follow the original nextOffset through all history pages. The course independently repeats the complete native history read and verifies the selected head.

## 2. Freeze the customer selection and scope

The exact input schema is sf88.research-customer-handover-returns.v1. The following template labels values to obtain from the actual producer and current listener. Replace those labels before selecting its SHA256.

~~~json
{
  "schema": "sf88.research-customer-handover-returns.v1",
  "operation_id": "customer-evidence-return-2026",
  "customer_label": "Selected customer",
  "baseline": {
    "directory": "/absolute/customer/original-handover",
    "manifest_sha256": "ACTUAL_ORIGINAL_HANDOVER_SHA256"
  },
  "workspace_id": "ACTUAL_RESEARCH_WORKSPACE_ID",
  "dossier_id": "ACTUAL_DOSSIER_ID",
  "expected_revision": 1,
  "expected_revision_sha256": "ACTUAL_SELECTED_REVISION_SHA256",
  "source_actor": "Original source receiving operator",
  "maximum_total_items": 100,
  "maximum_total_returns": 2,
  "rounds": [
    {"key": "round-1", "maximum_items": 100, "maximum_source_bytes": 100663296},
    {"key": "round-2", "maximum_items": 100, "maximum_source_bytes": 100663296}
  ],
  "engine": {
    "root": "/absolute/installed-research/source",
    "manifestFile": "/absolute/installed-research/manifest.json",
    "manifestSha256": "ACTUAL_COMPLETE_SOURCE_MANIFEST_SHA256"
  },
  "output": {
    "filename_stem": "Customer_Reviewed_Research_Handover",
    "maximum_archive_bytes": 268435456
  }
}
~~~

| Field | Native meaning |
| --- | --- |
| operation_id | One stable local course identity; keep it with its original directory. |
| baseline | Complete original customer handover directory and exact handover.json SHA256. |
| workspace_id | Actual original Research listener identity. |
| dossier_id | Actual native dossier ID carried by the handover. |
| expected_revision / expected_revision_sha256 | Exact current native head selected for the first return. |
| source_actor | Original Europe PMC restore actor when the baseline includes that source workspace; otherwise optional. |
| rounds | Ordered future return slots with distinct keys, selected item and wire-byte ceilings. Actual returned files can arrive sequentially. |
| maximum_total_items | Cumulative complete native comparison item count across inherited accepted returns and every newly accepted round. |
| maximum_total_returns | Cumulative native accepted-return count, including inherited returns and all selected new slots. |
| engine | Complete original source manifest and selected source root, with the same source as the executing course. |
| output | Exact final filename stem and complete ZIP size ceiling. |

Init queries every existing accepted native return in the selected history, obtains each full original receipt, validates its historical revision/SHA, and freezes that complete inherited set. Existing customer update/correction events keep their original separate semantics. The return budget counts native return decisions, including CURRENT decisions; it is not a count of only changed fields.

If the selected history already has one accepted native return and the commission allows two in total, select one new round and maximum_total_returns of two. A new private directory does not reset inherited counts. The actual remaining item allowance is the selected total minus every inherited decision. No arbitrary prior-count field is accepted.

Choose scope limits from the actual agreed or proposed work. The course records and enforces the selected bounds; it does not infer agreement, payment or commissioning from a sent proposal or source-ready product.

The engine selection accepts the original installed distribution manifest or a complete sf88-research-ris-engine-source-v1 receiving manifest. Every selected byte, SHA256, path and mode is verified, and a separately selected source tree must match the executing source. The complete customer-programme and handover-return implementation are included with their current exact bodies. Use a source manifest produced from this installed release; a manifest naming an older body for a changed implementation is rejected.

Freeze and initialize:

~~~sh
sha256sum /absolute/customer/selection.json

starforge research-customer-handover-returns init \
  --connection-file /private/research-connection.json \
  --workspace /absolute/original-research-workspace \
  --run-directory /absolute/private/customer-return-course \
  --selection /absolute/customer/selection.json \
  --selection-sha256 ACTUAL_SELECTION_SHA256 \
  --out /absolute/private/customer-return-prepared.json
~~~

Init retains the original selection and complete original handover before native receiving. It then records INITIAL.json, including the actual head, inherited receipts and original receiving result. ENGINE_SELECTION.json freezes the complete selected source. The ready result reports the real inherited count and remaining selected rounds.

## 3. Prepare one actual returned dossier

Select the complete collaborator portable as received. Obtain its exact byte count and SHA256. Keep the actual filename and content type; gzip wire bytes remain gzip and a plain JSON portable remains plain JSON.

~~~sh
wc -c /absolute/customer/returned-round-1.research.json.gz
sha256sum /absolute/customer/returned-round-1.research.json.gz

starforge research-customer-handover-returns prepare \
  --connection-file /private/research-connection.json \
  --run-directory /absolute/private/customer-return-course \
  --round round-1 \
  --source-file /absolute/customer/returned-round-1.research.json.gz \
  --source-bytes ACTUAL_BYTES \
  --source-sha256 ACTUAL_SHA256 \
  --source-filename returned-round-1.research.json.gz \
  --source-content-type application/gzip
~~~

The source is retained before native receiveSource. A source receipt and complete immutable comparison identify the original common base, current branch and returned branch. The source file must contain the same native dossier with an actual shared ancestor. The existing engine validates the full returned graph and retained blobs.

All comparison pages are read. Every present side is downloaded in full, including values omitted from small page projections. Public output is under public/returns/round-1:

- COMPARISON.json contains the complete immutable item inventory.
- comparison.json, comparison.md and comparison.html contain the complete native review.
- comparison.source.bin preserves the exact original returned wire.
- values/ contains complete base/current/returned JSON for each present item.
- original-return.bin is the independently retained selected input.

Read each item's treatment, allowedChoices, choiceLabels and effect. Authored values support the native allowed current, returned and EDIT choices. Choosing an absent returned authored side is an explicit deletion subject to the native dependency validators. Typed histories and unknown extensions are retained as reviewed proposals with their complete branch source; the current active typed histories remain authoritative. Use the owning citation, extraction, eligibility, appraisal or other original workflow to adopt a retained proposal.

The course accepts an authorized person or agent as the reviewer. It supplies no inferred decision defaults.

Current authored edits between accepted rounds are allowed when the history extends the accepted prefix. A native return applied outside the frozen course is detected before preparing another round, so its decisions cannot silently bypass the selected budget. An already prepared comparison keeps its original current-head identity.

Repeat prepare with only the connection, run directory and round to recover the exact retained source and immutable comparison. A different supplied source file descriptor is rejected.

## 4. Apply the exact reviewed request

Author a JSON file with exactly the original native request fields:

~~~json
{
  "requestId": "customer-round-1-reviewed-original-request",
  "reviewId": "ACTUAL_DRV_ID",
  "expectedRevision": 1,
  "comparisonSha256": "ACTUAL_COMPARISON_SHA256",
  "reviewedBy": "Authorized reviewer",
  "reviewNote": "Source-bound review explanation",
  "decisions": [
    {"itemId": "ACTUAL_DRI_ID", "choice": "CURRENT"}
  ]
}
~~~

Use the actual comparison's revision and SHA, and one explicit allowed decision for every item. Preserve the original item IDs, decision order and full EDIT value. reviewNote is optional; its absence remains absent in the submitted wire and matches the native receipt's empty-note normalization. The example's CURRENT choice illustrates one native decision; it is not a review recommendation.

~~~sh
sha256sum /absolute/customer/round-1-reviewed.json

starforge research-customer-handover-returns apply \
  --connection-file /private/research-connection.json \
  --run-directory /absolute/private/customer-return-course \
  --round round-1 \
  --review-file /absolute/customer/round-1-reviewed.json \
  --review-sha256 ACTUAL_REVIEWED_REQUEST_SHA256
~~~

The course saves REQUEST.original.json before any review submission. It checks the exact native previewChoices result, writes DISPATCH.json, and invokes the unchanged original review. The accepted receipt must match the source, three branch identities, comparison SHA, request ID, reviewer, note and every ordered decision. The accepted revision is read back against the original history.

After acceptance, accepted native JSON/Markdown/HTML/source exports and complete accepted-dossier gzip/Markdown/HTML files are retained. These are pinned to that round's accepted historical revision. The collaborator can edit that actual accepted portable to produce the next selected round.

For a lost response, run apply again with the same original file and SHA, or omit both review flags to use the retained request. The course queries the native request ID before attempting review. A saved receipt is recovered before checking today's head, so later unrelated edits do not turn recovery into a second mutation.

A different request on the same round, including a different explicitly supplied file after completion, is rejected. The exact original request remains the recovery authority.

If the current head changed after comparison and no receipt exists, native preview/review rejects the stale choice selection. Preserve that comparison and pending request, then use the original reviewer workflow to select a new comparison explicitly. This course never rebases or rewrites the frozen reviewed request.

## 5. Continue the next selected round

Once round-1 is accepted, give its actual accepted-dossier.json.gz to the collaborator. When their round-2 file arrives, prepare round-2 with that file's actual bytes, SHA, name and content type. Read its new complete comparison and apply its explicit reviewed request using the same commands.

The second round's native comparison can contain new authored differences and typed proposals; it retains the original source and common ancestor. All inherited and newly accepted receipt counts remain cumulative. A per-round item ceiling and the whole-course item/round ceilings are checked independently.

A completed old round remains recoverable after later rounds. Its APPLIED view reports its fixed cumulative count at that round; today's later count does not rewrite the original view or receipt.

## 6. Build and independently receive the complete handover

~~~sh
starforge research-customer-handover-returns complete \
  --connection-file /private/research-connection.json \
  --run-directory /absolute/private/customer-return-course \
  --python /absolute/python3 \
  --node /absolute/node \
  --out /absolute/private/customer-return-complete.json
~~~

Complete requires every selected round to have its original accepted receipt. It finishes interrupted exports, retains all inherited accepted return reports/source, and selects the last accepted historical revision even if today's dossier has additional edits. It exports the original native portable and reports at that exact revision.

The package contains:

| Path | Complete content |
| --- | --- |
| baseline/ | Original unchanged handover.json, four frozen reports, work review, native portable and optional original Europe PMC workspace. |
| returns/ROUND/ | Full selected source, immutable comparison, full values, exact request, receipt and historical exports for that round. |
| inherited/RETURN_ID/ | Native accepted reports, original source and complete receipt for each inherited return. |
| dossier/ | Accepted final portable, HTML, Markdown, metadata and full native revision history. |
| engine/ | Every selected original source member, full current receiving implementation and licences. |
| ENGINE_ORIGINAL_MANIFEST.json | Exact original selected source manifest, preserved as source lineage. |
| ENGINE_SELECTION.json | Complete effective source selection, including current implementation bodies. |
| SELECTION.original.json / INITIAL.json | Original selected scope and actual baseline/current/inherited authority. |
| COURSE.json | Exact native baseline, accepted extension, cumulative receipts and measured scope. |
| PACKAGE_MANIFEST.json | Ordered path/mode/byte/SHA inventory for every package member. |
| OPEN.mjs / HANDOVER_RETURNS.md / START_HERE.html | Complete executable receiving, operating instructions and readable customer handover. |

The Python writer streams every source member, verifies the complete candidate, publishes without replacing an existing archive, and rereads the final archive. Reuse checks the exact ordered manifest, source modes, uncompressed bytes and SHA of every member. The size ceiling applies to the complete final ZIP; the receiver also bounds each file and the total decoded content.

A separate receiving directory extracts the archive with exact file identity and ordinary-file checks. It opens the included source, receives the original customer handover through receiveCustomerHandover, then reopens the accepted later portable through the original dossier API. Exact metadata, full history, request receipts and cumulative counts are verified before COMPLETE.

The Python receiver passes its actual flock descriptor into the Node opener and keeps the original native lifetime selected. Complete native process stdout/stderr are retained in exclusive attempt files. A parse, output or transport problem leaves that actual attempt and original operation available for recovery.

## 7. Inspect, receive and continue editing

Obtain the archive's actual SHA256 from COMPLETE.json. Inspect it with the original included package source or the installed release:

~~~sh
python3 /absolute/source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/receive-handover-returns.py inspect \
  --archive /absolute/customer/Customer_Reviewed_Research_Handover.zip \
  --sha256 ACTUAL_ARCHIVE_SHA256
~~~

Receive the complete ZIP on the selected host:

~~~sh
python3 /absolute/source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/receive-handover-returns.py receive \
  --archive /absolute/customer/Customer_Reviewed_Research_Handover.zip \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --directory /absolute/customer-receiving \
  --node /absolute/node --python /absolute/python3
~~~

The result records packageDirectory, complete archive identity and the actual independently received native dossier. Open the extracted package with its own included source:

~~~sh
node /absolute/customer-receiving/package/OPEN.mjs \
  --directory /absolute/customer-receiving/editable

node /absolute/customer-receiving/package/OPEN.mjs \
  --directory /absolute/customer-receiving/editable \
  --verify-only
~~~

The interactive command prints the authenticated local Research URL only to its owning terminal. It remains open until its operator closes it. The public archive and native receiving receipts contain no listener session token or private connection record. Keep the editable receiving directory outside the immutable package directory.

Ordinary later opens verify the selected accepted revision and allow a longer same-prefix editable history. The original native store rejects divergent overlap. Historical verification preserves the package's accepted revision while users continue editing the current dossier.

To receive an already extracted package through an existing selected listener:

~~~sh
starforge research-customer-handover-returns receive \
  --connection-file /private/receiving-connection.json \
  --run-directory /absolute/private/customer-package-receiving \
  --package-directory /absolute/customer-receiving/package \
  --manifest-sha256 ACTUAL_PACKAGE_MANIFEST_SHA256
~~~

## Recovery states

| Observation | Continue the same operation |
| --- | --- |
| Init interrupted during source retention | Repeat init with the same full selection and SHA; original files are reused only after exact checks. |
| Source was received but comparison reply was lost | Repeat prepare with the same round; retain the original wire and native source identity. |
| REVIEW_REQUIRED | Read the full comparison and author the explicit original request. |
| OUTCOME_UNCONFIRMED | Recover the same request ID with apply; DISPATCH takes precedence over an older review-required marker. |
| APPLIED with incomplete local exports | Repeat apply or complete; saved native receipt is checked before full exact exports are recovered. |
| A later local authored edit exists | Old accepted request recovery still verifies its historical revision; a new round freezes its actual current head. |
| Changed explicit request or source | Keep the original frozen operation; the mismatched input is rejected. |
| A package attempt stopped | Repeat complete; exact existing members and archive are verified before reuse. |
| A receiving attempt stopped | Repeat the same archive/SHA/directory; complete members and original native operation are recovered. |
| An output file or terminal reply failed | Read status in the same run directory and inspect retained original attempts/receipts before another action. |

~~~sh
starforge research-customer-handover-returns status \
  --run-directory /absolute/private/customer-return-course
~~~

## API and original implementation boundaries

Import the installed customer-updates/handover-returns module. Its public functions are:

- prepareCustomerHandoverReturns({client, directory, selectionFile, selectionSha256})
- prepareCustomerHandoverReturn({client, directory, key, source})
- applyCustomerHandoverReturn({client, directory, key, reviewFile?, reviewSha256?})
- completeCustomerHandoverReturns({client, directory, python?, node?})
- receiveCustomerHandoverReturns({client, directory, packageDirectory, manifestSha256?, sourceActor?})
- readCustomerHandoverReturns({directory})

source is exactly {file, bytes, sha256, filename, contentType}. The client is the original identity-checked ResearchWorkspaceClient. The original native return helpers perform immutable comparison paging, full value/export download, request validation, accepted receipt validation and original historical dossier export. Their implementation bodies are unchanged and exposed through additive descriptive exports.

All original customer update, return, typed history and source identities remain native. Complete package receiving uses the original customer importer and dossier reopen. The course adds scope enforcement, sequential review custody, full publication and editable receiving around those existing operations.
