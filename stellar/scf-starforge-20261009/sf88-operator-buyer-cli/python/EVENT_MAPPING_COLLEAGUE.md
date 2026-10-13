# Event mapping colleague review

This chapter completes the original accepted-to-current Event mapping workflow when another engineer reviews the same source pair. The producer issues a complete assignment, the colleague edits its independent working copy, and the producer receives the complete return against the issued baseline and their current work. Every original NDJSON/manifest pair, comparison, unfinished field, reason and retained receiving decision remains in the portable files.

Use the existing Analysis programme and original native operation. The commands in this chapter operate private files only. The original mapping receiving CLI owns the eventual native Review and its saved action; the colleague tools preserve its complete source.

## Working files and source binding

Run the installed module from the sf88 directory:

~~~sh
node event-feed/mapping-review-cli.mjs inspect --in complete-colleague.json
~~~

A base working document has schema `stellar-forge.event-mapping-working-copy.v1`. The colleague wrapper has schema `stellar-forge.event-mapping-colleague-working.v1` and retains that whole document under `working`, with a flat `review_receiving` graph. Its original source pair is stored once. Assignments and returns each carry that exact source pair and the complete flat history selected when they were issued.

Every input is read as a regular UTF-8 file. The installed `analysis-source.mjs` must have the SHA-256 recorded by the original native comparison's `receiver.core_sha256`. An incompatible installation refuses the operation before output publication. Keep the complete original HTML/source alongside historical JSON. The model preserves source context, parser identity, programme/input identity, exact original file strings, full comparison history and local assignment/receipt authority.

Complete JSON working files and envelopes are limited to 192 MiB. Metadata and patch files have a 1 MiB input limit; the model also enforces its actual field, note, source and graph limits. The saved HTML includes the whole current JSON and original installed runtime source, and can be larger than its JSON. Capacity failures preserve every input and refuse a truncated output.

## Issue a complete assignment

First wrap the selected original mapping working JSON. This adds colleague receiving state without changing its base document.

~~~sh
node event-feed/mapping-review-cli.mjs wrap \
  --in capture/mapping-working.json --out producer-start.json
~~~

Prepare a UTF-8 JSON metadata file with exactly `issuer`, `recipient`, `note` and `at`. Names and the scope must be explicit; `at` is the original selected UTC timestamp, including `Z`. Keep this file unchanged when retrying the same assignment. For example, an authored demonstration file might contain:

~~~json
{"issuer":"Producing engineer","recipient":"Reviewing engineer","note":"Review the proposed field mapping and every required reason against both complete retained source windows.","at":"2026-10-13T20:00:00.000Z"}
~~~

Issue the complete files:

~~~sh
node event-feed/mapping-review-cli.mjs assign \
  --in producer-start.json --meta assignment-meta.json \
  --out producer-issued.json --envelope assignment.json

node event-feed/mapping-review-cli.mjs open \
  --assignment assignment.json --out reviewer-start.json

node event-feed/mapping-review-cli.mjs html \
  --in reviewer-start.json --out reviewer-start.html

node event-feed/mapping-review-cli.mjs html \
  --in producer-issued.json --out producer-issued.html
~~~

The assign result prints the exact `assignment_id` and each output's path, byte count and SHA-256. Both destinations must differ from every input and each other. The CLI checks existing destination bytes before writing either file, publishes the producer's complete issuing state first, and then publishes the assignment envelope. It never replaces a different existing file. Publication uses a complete fsynced temporary and an immutable final link in the same directory. A concurrent conflicting second destination can leave the first complete file published; replay the exact original command after resolving that destination choice, or reconstruct its envelope from the retained producer file.

The two-file publication is a resumable sequence. If execution ends between the two outputs, retry with the same original input, metadata and destination names. Identical existing files are accepted. Do not generate a new timestamp, overwrite an unrelated edition or manufacture another assignment to recover the first one.

## Operate both independent working copies

Open the complete producer and reviewer HTML files in the producing operator's actual browser context. They retain distinct issuer/reviewer checkpoint identities even when the active assignment ID is the same. The selected embedded file always opens first; a browser checkpoint is restored only through an explicit choice.

Use the existing field editor to review both original windows, inspect real field values and update whole proposed fields. The value display identifies the loaded pointer and offset; changing its requested pointer hides the previous result until it is read again. Recompute the comparison when fields change, then deliberately record required reasons against that comparison. The source files and prior comparisons remain available as complete downloads.

The colleague panel shows issued assignments, returned work and local versus carried receiving history. It retains unfinished attribution, notes and conflict choices. Only assignments issued by the current producer copy authorize receiving. A colleague's carried receipts and assignments remain downloadable source without conferring local authority.

Save the full working JSON or editable HTML after editing. A download request keeps the changed-work reminder active because the browser cannot confirm that the operator kept the downloaded file. Open the saved artifact independently and inspect its retained changes. Preserve every displaced window edition through its explicit full download while that window remains open; the UI states the exact scope of its current saved file.

For file-based field work, export the base document, use the original working CLI, then replace the base inside the whole colleague file:

~~~sh
node event-feed/mapping-review-cli.mjs base \
  --in reviewer-start.json --out reviewer-base.json

node event-feed/mapping-working-cli.mjs update \
  --in reviewer-base.json --draft complete-draft.json --out reviewer-updated.json

node event-feed/mapping-working-cli.mjs compare \
  --in reviewer-updated.json --out reviewer-compared.json

node event-feed/mapping-review-cli.mjs replace \
  --in reviewer-start.json --working reviewer-compared.json --out reviewer-current.json
~~~

The replacement must retain the exact original source pair/context. It preserves the complete colleague graph from `--in`. A full `complete-draft.json` retains fields, reviewer, note and decisions; the original working model checks them and preserves previous comparison/draft editions.

## Return the colleague's complete work

Prepare `return-meta.json` with exactly `reviewer`, `note` and the original UTC `at`. Use the actual assignment ID printed by assign or inspect:

~~~sh
node event-feed/mapping-review-cli.mjs return \
  --in reviewer-current.json --assignment-id ASSIGNMENT_ID \
  --meta return-meta.json --out reviewer-returned.json --envelope returned.json
~~~

The complete reviewer state is published before its immutable return envelope. Both destinations are preflighted. The return result prints its stable `return_id`. Replay with the same selected file and metadata, or reconstruct that exact envelope from its saved whole reviewer file. The complete source and losing/earlier copies stay available in the graph.

## Stage, inspect and explicitly receive

Keep the producer's latest complete file, including concurrent edits. Stage the return before saving the preview used for the decision:

~~~sh
node event-feed/mapping-review-cli.mjs stage \
  --in producer-current.json --return returned.json --out producer-staged.json

node event-feed/mapping-review-cli.mjs preview \
  --in producer-staged.json --return returned.json --out preview.json
~~~

The preview contains complete baseline/current/returned values, the original assignment and return IDs, source digest, whole-current digest, copy IDs and required explicit resolutions. Its three units are:

| Unit | Complete compared content |
| --- | --- |
| mapping | Ordered fields, full computed comparison and every reason tied to that comparison |
| reviewer | The original working draft's reviewer text |
| note | The original working draft's note text |

Mapping is atomic. Field renames, reorderings and reason changes never trigger guessed per-field matching. Each unit is classified as unchanged, local, incoming, same or conflict. Inspect the whole values, not just the class names. Every conflict requires `keep-current` or `use-returned`. Nonconflicting incoming work defaults to returned; unchanged/local/same defaults to current unless an allowed explicit choice is recorded.

An explicit `choices.json` can contain any eligible units:

~~~json
{"mapping":"use-returned","note":"keep-current"}
~~~

To retain unfinished choices in a new whole working edition:

~~~sh
node event-feed/mapping-review-cli.mjs resolve \
  --in producer-staged.json --return-id RETURN_ID \
  --choices choices.json --out producer-with-choices.json

node event-feed/mapping-review-cli.mjs preview \
  --in producer-with-choices.json --return returned.json --out preview-with-choices.json
~~~

A JSON null choice clears an earlier retained resolution, including a stale one. Other choices must still correspond to a current eligible incoming/same/conflict unit. Saving choices changes the whole working digest; obtain and inspect the preview of that exact edition before apply.

Prepare `receiving-meta.json` with exactly `actor`, `note` and the explicit original UTC `at`. Apply with the exact saved preview:

~~~sh
node event-feed/mapping-review-cli.mjs apply \
  --in producer-with-choices.json --return returned.json \
  --preview preview-with-choices.json --meta receiving-meta.json \
  --out producer-received.json
~~~

Alternatively, pass `--choices choices.json` to apply against a preview of the unchanged staged input. The CLI never refreshes and silently adopts a new preview: an unapplied input must match its complete saved preview and current digest. It also checks the exact assignment, return, source and baseline/returned-copy identities. A later edit requires a new inspected preview. Applying an already locally received identical return is idempotent and keeps the complete current file; the original receipt remains unchanged.

The saved receipt retains the whole before/after copies, returned work, effective choices and attribution. Reopening recomputes the result from those choices, so a rehashed receipt cannot substitute an unrelated resulting draft. Original producer history, pending form text and all carried source records remain.

## Recover exact original artifacts

Recovery reads the existing graph and reconstructs the original selected envelope:

~~~sh
node event-feed/mapping-review-cli.mjs assignment \
  --in producer-issued.json --id ASSIGNMENT_ID --out recovered-assignment.json

node event-feed/mapping-review-cli.mjs return-envelope \
  --in reviewer-returned.json --id RETURN_ID --out recovered-return.json

node event-feed/mapping-review-cli.mjs receipt \
  --in producer-received.json --id RECEIPT_ID --out receiving-source.json
~~~

The receipt-source file contains its selected complete receipt and the whole colleague wrapper, including every source needed to reopen it. It identifies whether the receipt was locally applied or retained from a colleague. The envelope recovery is the original graph selected at issuance, not a newly expanded envelope containing later histories.

`inspect --in FILE [--out INSPECTION_JSON]` prints or saves current source/working digests, active IDs, graph counts, local authority and working readiness. `pending --in FILE --patch PATCH_JSON --out NEXT_JSON` saves complete named form text; null removes a field. It does not change mapping fields, attribution already frozen in assignments/returns, or native state.

## Continue the original native Review

A colleague receiving receipt records the local merge. Continue the original named Analysis workspace and original input through `mapping-receiving-cli.mjs` using the actual capture directory and native IDs:

~~~sh
node event-feed/mapping-receiving-cli.mjs review-prepare \
  --workspace ALIAS --workspace-id WORKSPACE_ID \
  --programme PROGRAMME --input INPUT_ID --dir PRIVATE_REVIEW_DIRECTORY \
  --capture-dir ORIGINAL_CAPTURE_DIRECTORY --working producer-received.json \
  --action ACTION_ID --operation OPERATION_ID

node event-feed/mapping-receiving-cli.mjs review \
  --workspace ALIAS --workspace-id WORKSPACE_ID \
  --programme PROGRAMME --input INPUT_ID --dir PRIVATE_REVIEW_DIRECTORY \
  --action ACTION_ID --operation OPERATION_ID --url ORIGINAL_MCP_URL
~~~

The maintained helper retains the exact whole wrapper bytes as its working source, validates its complete graph and original source binding, and derives only the original base working document's compact native Review. Its complete saved receipt exposes both `workingFile` and `captureFile`. The full wrapper/history remains beside the actual saved native action. The service recomputes the comparison and preserves its original native writer.

New captures retain six exact source modules. A genuine older four-source capture keeps its original plain HTML unchanged. With the matching installed parser, its whole JSON can be wrapped and rendered as a new colleague HTML edition. Its first wrapper review retains the trusted installed colleague model as an additional source; subsequent receiving/reopening is independent of the original capture directory or installed modules. Keep both the old original HTML and the explicit new edition.

Full working/source files remain local within 192 MiB. Native compact requests retain the original 1,046,528-byte ceiling and travel through immutable content-addressed request sources using bounded 64 KiB chunks. The colleague CLI does not widen that native bound. After an uncertain native reply, use the existing `review-receive` on the same action/operation, then `review-reopen` for its complete retained result. Do not issue another native action merely because a reply was lost.

## Producing operator's complete receiving course

The existing source/native/browser owner carries this whole course in the original case. Use the already selected exact application/source edition and original browser lifetime. Preserve current owner scheduling; the earlier 14:00 UTC limit belonged to Upper Savannah and is not a global SCF deadline. The directly recovered owner handoff at Slack timestamp 1791908979.290839 records Bryce's release of the earlier local-browser reservation.

The producing operator opens actual producer and reviewer files at normal and narrow widths, looks at the resulting screens, edits field mappings/reasons and pending notes independently, saves/reopens both complete editions, stages the actual return, inspects conflicts, records explicit choices and opens the received file. Exercise pointer-value refresh, original source downloads, assignment/return recovery, same-byte output replay and source-bound native continuation on the original actual input. Open the final saved action and its complete retained working/capture files, then export and reopen the same original Analysis workspace.

Retain the exact artifacts, original/native IDs, actual outcomes and viewed images together in that original receiving operation. Source-level execution and modeled fixtures document their own inputs; the actual operated files and visible results complete the producer's customer-facing receiving course.


## Keep the whole colleague result in the native workspace

The received complete colleague working copy can now be selected through **Retain whole work and open** in the original Event operator. Native Review reopens the whole graph, recomputes its receiving receipts and binds the exact selected mapping/reasons/reviewer/note before continuing. The workspace keeps the full raw JSON and the editable HTML generated from the same original source.

Both complete files travel inside the original database snapshot. Open the saved action after a whole-workspace restore to download them, or use the installed `event-mapping-receiving saved-source` and `saved-source-reopen` commands. The [full native source guide](EVENT_MAPPING_NATIVE_SOURCE.md) gives the exact original action selection, interrupted receiving and producing-operator course.
