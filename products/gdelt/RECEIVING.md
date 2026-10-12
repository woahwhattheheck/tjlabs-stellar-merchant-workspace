# Receive and reopen the GDELT product and customer work

This guide joins the installed runtime with the customer's complete original source and delivery records. It uses the existing Starforge runtime transfer, SF88/SF100 Dataset and GDELT receiving operations.

## Retain the identities needed for a handover

| Item | Required original identity |
| --- | --- |
| Product package | Full source commit, `gdelt-events` selection, package/archive SHA256 and source manifest |
| READY runtime | Original directory, selected profile, dependency lock and readiness receipt |
| Project | Original project UUID, complete exported bundle and its returned bytes/SHA256 |
| Source captures | Original capture IDs, source family, manifest/ZIP/decoded table identities |
| Review/publication | Original review ID, policy and publication/source-set snapshots |
| Customer acquisition | Existing buyer configuration/store, Dataset ID, page intents and spending/accounting journals |
| Delivered files | Original delivery report, complete outputs and every manifest byte/hash |
| Offline source receiving | Original capture-manifest SHA, source-set SHA, receiving binding and full restored files |

A project export retains captures, reviews, source operations and merchant plans. The customer's private payer/runtime and paid intent journals remain in their existing buyer store. Move those through their original customer/runtime receiving workflow when that customer operation itself changes host. Never replace an existing buyer store with the project JSON.

## Transfer the existing READY runtime offline

Run the maintained transfer against the actual READY runtime and its populated npm cache:

```sh
starforge runtime-transfer review --runtime /absolute/gdelt-runtime

starforge runtime-transfer export \
  --runtime /absolute/gdelt-runtime \
  --directory /absolute/gdelt-runtime-transfer \
  --cache /absolute/original-npm-cache \
  --expect-lock ORIGINAL_DEPENDENCY_LOCK_SHA256

starforge runtime-transfer inspect \
  --directory /absolute/gdelt-runtime-transfer --verify
```

The default export uses the selected cache offline. If an intentional dependency fetch is needed, the existing `--online` option explicitly permits missing public tarballs. Keep the original export directory after interruption; its saved source/profile/lock binds the continuation.

Copy the returned `manifest.json` and every declared part file. On the recipient:

```sh
starforge runtime-transfer receive \
  --directory /absolute/gdelt-runtime-receiving \
  --manifest /absolute/transferred/manifest.json \
  --sha256 ORIGINAL_TRANSFER_MANIFEST_SHA256 \
  --parts /absolute/transferred

starforge runtime-transfer inspect \
  --directory /absolute/gdelt-runtime-receiving --verify

starforge runtime-transfer install \
  --directory /absolute/gdelt-runtime-receiving \
  --runtime /absolute/received-gdelt-runtime \
  --python /absolute/selected-python

starforge runtime-install inspect \
  --dir /absolute/received-gdelt-runtime --load --source

starforge runtime-install run \
  --dir /absolute/received-gdelt-runtime -- gdelt --help
```

The original installer owns native preparation and READY status. Transfer receiving does not bundle a system Python, browser or arbitrary native build toolchain; select the actual existing host executables when those workflows need them. The GDELT source decoder/receiver uses Python 3.11 or later. Use the same selected interpreter in Applications and CLI operations.

If only some parts arrived, use the original `receive-part` and `complete` operations with the same receiving directory. An existing runtime's installation recovery uses the original `runtime-transfer recover` or `runtime-install recover` flow; preserve its actual source/profile/lock and journals.

## Acquire and deliver the original complete source files

For a publication's source-file product, prepare one Dataset with a reviewed page and total atomic spending limit. Select enough pages for the complete source inventory returned by the original preview. Keep all source-file fields and their original order.

```sh
starforge gdelt dataset-prepare --project /absolute/article-desk \
  --publication ORIGINAL_PUBLICATION_SHA --id source-files-customer-1 \
  --kind sources --query "limit=4" \
  --max-pages EXPLICIT_COMPLETE_PAGE_LIMIT \
  --max-total-atomic EXPLICIT_ATOMIC_LIMIT

starforge gdelt dataset-create --project /absolute/article-desk \
  --publication ORIGINAL_PUBLICATION_SHA --id source-files-customer-1 \
  --buyer-config /absolute/private/original-buyer.json

starforge gdelt dataset-run --project /absolute/article-desk \
  --publication ORIGINAL_PUBLICATION_SHA --id source-files-customer-1 \
  --buyer-config /absolute/private/original-buyer.json

starforge gdelt dataset-inspect --project /absolute/article-desk \
  --publication ORIGINAL_PUBLICATION_SHA --id source-files-customer-1 \
  --buyer-config /absolute/private/original-buyer.json

starforge gdelt dataset-deliver --project /absolute/article-desk \
  --publication ORIGINAL_PUBLICATION_SHA --id source-files-customer-1 \
  --buyer-config /absolute/private/original-buyer.json
```

Replace both limit placeholders with explicit values reviewed for that original acquisition. `dataset-run` can acquire remaining pages and incur the approved payment. After an uncertain response, inspect and use `dataset-recover` with the same original ID. Do not create a new Dataset to recover a lost reply.

The original Dataset engine owns page intents, complete rows, accounting and finalization. `dataset-accounting` inspects retained accounting; `dataset-finalize` continues its existing finalization. `dataset-deliver` reads retained customer data and creates the complete native outputs.

Export a selected original output only after the delivery exists:

```sh
starforge gdelt dataset-file --project /absolute/article-desk \
  --publication ORIGINAL_PUBLICATION_SHA --id source-files-customer-1 \
  --file manifest.json --out /absolute/customer-files/manifest.json
```

The same command supports `dataset.csv`, `dataset.jsonl`, `review.html` and available `semantics.json`. It verifies the original complete delivery before reading the file. An existing export destination must contain the same exact bytes; select a new path for a different artifact.

The complete source dataset uses 49,152-byte raw chunks with source/member/chunk SHA256 and lengths. Receiving verifies every chunk, the manifest and complete original members. A truncated or differently projected source table cannot become a complete source handover.

## Reopen the delivered review through the same customer operation

The original project knows the Dataset's saved delivery report and receiving target:

```sh
starforge gdelt dataset-receive --project /absolute/article-desk \
  --publication ORIGINAL_PUBLICATION_SHA --id source-files-customer-1 \
  --buyer-config /absolute/private/original-buyer.json

starforge gdelt customer-reopen --project /absolute/article-desk \
  --publication ORIGINAL_PUBLICATION_SHA --id source-files-customer-1
```

These operations reuse the existing acquired source snapshot. Offline source inspection verifies the original `sources-manifest.json`, exact source-set/review/schema files, all original capture IDs and their ZIP/decoded tables before reconstructing the original review. The receiving binding preserves its capture-manifest SHA, source-set identity, review and capture list.

For an independently transported complete delivery, use the original delivery report together with all of its required output files:

```sh
starforge gdelt source-receive --project /absolute/customer-sources \
  --source /absolute/private/original-delivery-report.json \
  --capture-manifest ORIGINAL_CAPTURE_MANIFEST_SHA256 \
  --source-set ORIGINAL_SOURCE_SET_SHA256 \
  --python /absolute/selected-python

starforge gdelt sources-open --project /absolute/customer-article-desk \
  --source /absolute/customer-sources \
  --title "Received article desk" --python /absolute/selected-python

starforge gdelt serve --project /absolute/customer-article-desk \
  --python /absolute/selected-python
```

The original delivery report must remain usable by the maintained SF88/SF100 receiving contract. Preserve or receive its complete output paths through that original workflow rather than editing provenance fields to manufacture a local match.

Events/Mentions and GKG are homogeneous source families inside each selected source set. A GKG receiving validates its original codebook/source-family binding and reconstructs the same selected article view. It does not convert an Event review into an article review or infer entity identities from display labels.

## Export and receive the whole project

Export the complete original project:

```sh
starforge gdelt export --project /absolute/article-desk \
  --out /absolute/private/complete-gdelt-project.json
```

Retain the returned path, bytes and SHA256. Copy that whole file to the recipient and receive it in a selected new directory:

```sh
starforge gdelt receive --project /absolute/received-gdelt-project \
  --source /absolute/private/complete-gdelt-project.json \
  --python /absolute/selected-python

starforge gdelt show --project /absolute/received-gdelt-project

starforge gdelt serve --project /absolute/received-gdelt-project \
  --python /absolute/selected-python
```

The receiving operation verifies the original immutable source closure before exposing the normal project index. If it was interrupted, repeat the same receiving command with the same bundle and destination. A normal application startup preserves an unfinished receiving directory for that continuation.

A completed replay checks the original history and opens each original capture, review and publication. Later legitimate source operations, reviews and customer work can remain in the received project. A retry does not restore the older project index over those changes.

Transport the original buyer/runtime separately when its paid customer operation also needs to move. A public merchant plan in the project is not the payer's complete private history.

## Reopen through Applications or native agents

Register the recipient's READY runtime in the existing Runtime workspace, select **GDELT article and event desk**, and bind its received project and selected Python. The application verifies the running process against that original project launch.

For agents, retain the host-selected connection file, project ID and expected binding SHA. Reinitialize or reopen the original `gdelt-workspaces` provider through its saved setup. After a host restart, retained-file handles are new; select the same original file and expected SHA to resume from a known byte offset. Original project, review, purchase and Dataset identities remain unchanged.

## Source upgrades preserve customer records

Build an upgraded source commit in a new package output. Use the original runtime installer's `upgrade`, `compare` and recovery operation to create its selected new runtime directory. Preserve the original package, profile and lock so the old runtime remains identifiable. Rebind the existing application to the same customer project after reviewing the new runtime; do not initialize a replacement project or buyer store.

The adopted source inventory in [SOURCE_ADOPTION.json](SOURCE_ADOPTION.json) records the original public product edition. Subsequent changes should update the existing product through its normal source and review process. The broad standalone repository may advance independently; a receipt always names the exact built commit and selected recipe.

## Record the actual receiving outcome

The receiving owner returns the exact source commit/recipe, packaged archive identity, installed READY receipt, selected Python, application/provider registrations, original customer operation, and the complete received artifacts. Include original project/capture/review/Dataset identities and the actual offline reopen result. Preserve observed failures and unfinished native stages with their original records.

Source integration and installed customer completion are distinct states. The shipped original native example uses the explicit local protocol fixture and its existing Events/Mentions operation. It does not establish real funded settlement, a new GKG acquisition or a second completed customer case merely because its source is included.
