# Material Catalog Source Desk

## Complete catalogue work inside the original Customer Installation

Open **Grant Operations → Installations → Material catalogue source** from the selected original case. Receive the complete commercial Workshare into the Installation editor first. This desk connects that current commercial document to a complete retained material catalogue, its original supplier files, edition history, declared receiving task and customer handover.

The original catalogue reader validates complete v1/v2 bundle bytes, table references, material seals, edition roots and retained history. The original SF49 supplier-catalogues profile prepares the Installation. The existing Operations command retains sources; the existing Installation editor previews and saves the final document.

The integrated source route accepts a complete bundle up to **128 MiB**. It shares the existing **256 MiB total** with typed Airflow and DCAT source attachments. Complete Operations case export remains within its original **320 MiB** bound. Ordinary attachments retain their existing smaller limits. The standalone material catalogue preparation command remains available for other supported complete selections.

## Operator sequence

1. Read the current case and select its original commercial Workshare. Keep the complete current Installation draft, including its attributed source authority, recipient, payment terms and receiving conditions.
2. Attach the exact original material catalogue. Retain the original request ID, source observation timestamp, selected bytes and expected case version. An interrupted response is reconciled against that same request. Source identity includes its original byte length and SHA-256.
3. Inspect the complete original catalogue and every retained table. Read original supplier source bytes in complete pages; reconstructed downloads must match the original length and SHA-256. Compare two saved editions by material identity, original before/after records and their actual changed fields.
4. Name and retain the working selection. The source desk keeps original catalogue/revision/active edition, selected optional supplier plan/review, authored receiving bindings, current commercial document and prepared result together. Export the complete working file before moving between machines.
5. Generate the original template, then complete the task, source authority, exact receiving destination/operator and customer output. The template carries the original Workshare's actual terms and phases. Choose explicit supplier plan/review identities only from this complete source edition.
6. Prepare against the current case. Review both the original material preparation and the native Installation preview. The response contains a preparation digest that binds the complete case version, source, selections, bindings and original preview.
7. Download the complete customer handover. The complete preparation response and ZIP each remain within the original 512 MiB delivery bound. The backend recomputes that exact preparation, runs the unchanged material package composer and independently reopens its full output before returning the ZIP. A changed source, case or selection requires a fresh review.
8. Open the prepared Installation as a **separate unsaved draft** in the original editor. Inspect its complete document and enter the original review note before Save. The desk preserves the prior draft; the existing editor remains responsible for version checks and the final saved Installation.
9. Export the entire Operations case and receive it on an independent workspace. Confirm the original source bytes and exact saved Installation after closing and reopening that workspace.

A retained supplier review describes its original evaluated edition. This desk preserves that result; new supplier evaluation and catalogue mutation use the original supplier operator. Commercial acceptance, receiving decisions and settlement retain their attributed records.

## Original API and CLI

All read-only methods use:
`POST /api/operations/CASE/material-catalog/ACTION`

Every body includes `expectedVersion`, `sourceId` and `expectedSourceSha256`. Actions are:

| Action | Additional input | Complete result |
|---|---|---|
| inspect | — | Catalogue, all edition/source identities, plans/reviews and table counts |
| rows | table, offset, limit | Complete original records, total and nextOffset |
| member | originalSourceId, offset, limit | Original source identity and exact Base64 byte page |
| compare | beforeEditionId, afterEditionId, offset, limit | Original before/after rows, changed fields and complete counts |
| template | document, operationId | Original profile bindings and exact catalogue selection |
| prepare | document, operationId, selection, bindings | Original preparation plus nativePreview and preparationSha256 |
| handover | Same prepare fields plus expectedPreparationSha256 | Complete ZIP and source/preparation digest headers |

`nativePreview` and `preparationSha256` are top-level fields beside `scope`, `source` and `result`. Custody inspection validates the complete original source and returns a compact identity/count receipt. The desk's catalogue/edition inventory uses metadata summaries; the full original mappings, provenance and table identity columns remain in the retained record views and source bundle. If identical bundle bytes are attached more than once, the desk requires the exact source ID selected by the original preparer; its conflict identifies that source for explicit provenance review.

Record pages contain 1–200 complete rows; an original single row is never truncated. Raw source-member pages are bounded to 256 KiB and preserve their original byte offsets.

Typed attachment uses the original command `material-catalog-source.add`, through `POST /api/operations/CASE/material-catalog-source`. It retains the original actor, note, request ID and optimistic case version. Source read/import/export checks the material source descriptor against the original file.

The original Operations CLI exposes:
`material-catalog-add|inspect|rows|member|compare|template|prepare|handover`.

Use the existing `cli.py --workspace PRIVATE_WORKSPACE operations` entry point and its `--help`. For example:

```sh
python3 cli.py --workspace PRIVATE_WORKSPACE operations material-catalog-add \
  --case ORIGINAL_CASE --expected-version CURRENT_VERSION \
  --actor RECEIVING_OPERATOR --request-id ORIGINAL_REQUEST_ID \
  --note 'Original complete catalogue for the agreed customer receiving' \
  --file ORIGINAL_CATALOGUE.jsonl --expected-sha256 ORIGINAL_SHA256 \
  --observed-at ORIGINAL_OBSERVATION_TIMESTAMP --receipt ORIGINAL_SOURCE_RECEIPT.json

python3 cli.py --workspace PRIVATE_WORKSPACE operations material-catalog-template \
  --case ORIGINAL_CASE --expected-version CURRENT_VERSION \
  --source ORIGINAL_SOURCE_ID --sha256 ORIGINAL_SHA256 \
  --document ORIGINAL_WORKSHARE_DOCUMENT.json --operation-id ORIGINAL_OPERATION \
  --output ORIGINAL_TEMPLATE.json

python3 cli.py --workspace PRIVATE_WORKSPACE operations material-catalog-prepare \
  --case ORIGINAL_CASE --expected-version CURRENT_VERSION \
  --source ORIGINAL_SOURCE_ID --sha256 ORIGINAL_SHA256 \
  --document ORIGINAL_WORKSHARE_DOCUMENT.json --operation-id ORIGINAL_OPERATION \
  --selection REVIEWED_SELECTION.json --bindings REVIEWED_BINDINGS.json \
  --output ORIGINAL_PREPARATION.json

python3 cli.py --workspace PRIVATE_WORKSPACE operations material-catalog-handover \
  --case ORIGINAL_CASE --expected-version CURRENT_VERSION \
  --source ORIGINAL_SOURCE_ID --sha256 ORIGINAL_SHA256 \
  --document ORIGINAL_WORKSHARE_DOCUMENT.json --operation-id ORIGINAL_OPERATION \
  --selection REVIEWED_SELECTION.json --bindings REVIEWED_BINDINGS.json \
  --preparation-sha256 REVIEWED_PREPARATION_SHA256 \
  --output Material_Catalog_Complete_Handover.zip
```

The add command writes its immutable `.request.json` before calling the original writer. Reuse the exact inputs and receipt path after interruption. The CLI verifies the saved complete bytes and writes the original command result. It never replaces an existing different output.

## Complete software and customer delivery

Select `material-catalogue-installation` in the maintained distribution builder. The release composes the complete original Material Catalog and merchant sources, recipient reader, commissioning application, Grant Operations workspace, original SF49 profile, CLI, browser assets and this receiving programme. The managed source manifest also includes all seventeen application files required by the material composer.

The customer ZIP contains the original complete bundle, original commercial sources and receiving packet, source selection, authored and derived bindings, every explicitly selected original Installation source (including receiving/payment/check references), original catalogue source files, original profile, complete editable application, Installation input/preview, Workorder, commercial report, offline populated reader, opening guide and full preparation manifest. Additional selected sources retain the original composer's 64 MiB per-file and 128-file limits; the whole handover remains within 512 MiB. The composer independently reopens every file, exact original request, complete application roster and deterministic derived output. Keep the complete ZIP beside the full Operations case and selected software archive.

The original catalogue and commercial records remain private customer inputs. Use the existing internal delivery/case destination and the intended recipient's agreed transfer. Public repository source contains the generic application and guides.

## Whole native receiving

The maintained receiver is `material-catalogue-source-desk-receiving.py`. It accepts the actual existing workspace and one retained input document with:

- schema `stellar-forge.material-catalogue-source-desk-input.v1`;
- original operationId, actor, caseId, planId and expectedVersion;
- one existing sourceId or complete sourceFile, with sourceSha256;
- the original complete commercial Installation document;
- the exact selection and authored bindings;
- distinct beforeEditionId and afterEditionId from this retained catalogue.

It selects the complete pinned public software archive, uses the maintained unpacker, starts only its owned original Operations listener, and invokes the actual browser course. That course uses the original editor/source/preview/save routes. It retains complete working files, source downloads, the customer ZIP, actual screenshots and original saved Installation. The receiver validates and independently reopens the downloaded material ZIP, exports the full Operations case, imports it with one original request on a separate workspace, checks replay, closes it and cold-reopens the exact saved Installation and source bytes. The final package includes the complete selected source archive and manifest.

```sh
python3 material-catalogue-source-desk-receiving.py \
  --workspace ORIGINAL_PRIVATE_WORKSPACE --input ORIGINAL_RECEIVING_INPUT.json \
  --directory ORIGINAL_RECEIVING_DIRECTORY --ref FULL_SELECTED_PUBLIC_COMMIT \
  --node EXISTING_NODE --playwright EXISTING_PLAYWRIGHT_MODULE \
  --chromium EXISTING_CHROMIUM
```

Use `--source-archive` and `--source-sha256` for an already-built exact release, or the original repository's build path with its selected commit. Reuse the same operation, directory, complete input and browser storage origin on recovery. The report records actual completed phases, errors and closed lifetimes. It does not install a new browser or start another supplier/provider operation.

The producing engineer must open and use the delivered product, **look at the actual desktop and narrow screenshots**, and open every outgoing attachment before calling the deliverable customer-ready. The native report leaves that producing-seat visual review explicit. Source parsing, command success, DOM checks and a peer's assurance do not replace it.

## Complete operator and browser guide

[MATERIAL_CATALOGUE_OPERATOR.md](MATERIAL_CATALOGUE_OPERATOR.md) describes every desk control, retained working copies, original command recovery, downloaded attachments, actual browser course and the producing engineer's full visual-use responsibility.
