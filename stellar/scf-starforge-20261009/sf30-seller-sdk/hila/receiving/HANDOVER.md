# Complete private HILA customer handover

The handover packager combines the actual original runtime distribution archive, the complete native engineering receiving package, the operated source and independent recipient review packets, all full reports, both three-member merchant datasets, original questionnaire/mapping/methodology files and operating guides.

Its input selects completed original records. It reads and verifies all their full file identities and checks that the installed operator continued the same core source review, used the same committed READY runtime and completed both Application Stops.

## Run

```sh
python3 -B stellar/scf-starforge-20261009/sf30-seller-sdk/hila/receiving/handover.py --input /absolute/selected-handover.json
```

```json
{
  "schema": "stellar-forge.hila-customer-handover.v1",
  "operationId": "HILA-ROUND-REVIEW-7108-20261012-installed",
  "sourceCommit": "<actual full Git commit>",
  "output": "/absolute/private/handover/HILA_Complete_Installed_Operator_Package.zip",
  "coreResult": {"path": "/absolute/core/result.json", "bytes": 0, "sha256": "<actual SHA-256>"},
  "operatorResult": {"path": "/absolute/operator/result.json", "bytes": 0, "sha256": "<actual SHA-256>"},
  "runtimeResult": {"path": "/absolute/runtime/runtime-ready.json", "bytes": 0, "sha256": "<actual SHA-256>"},
  "guides": [
    {"name": "HILA_README.md", "path": "/absolute/installed/source/hila/README.md", "bytes": 0, "sha256": "<actual SHA-256>"},
    {"name": "METHODOLOGY.md", "path": "/absolute/installed/source/hila/METHODOLOGY.md", "bytes": 0, "sha256": "<actual SHA-256>"},
    {"name": "OPERATOR.md", "path": "/absolute/installed/source/hila/receiving/OPERATOR.md", "bytes": 0, "sha256": "<actual SHA-256>"},
    {"name": "HANDOVER.md", "path": "/absolute/installed/source/hila/receiving/HANDOVER.md", "bytes": 0, "sha256": "<actual SHA-256>"}
  ]
}
```

Replace the example descriptors with the complete actual returned files. The whole `complete.mjs` controller constructs this input from the original receiving and installation results, including ten full operating guides. It does not require hand-editing a case identity.

The original runtime archive is taken directly from `runtimeResult.distribution.archive` and must match its recorded SHA-256. The packager leaves that archive untouched and embeds its exact bytes. It does not create a replacement runtime format.

## Package contents

| Location | Complete retained material |
| --- | --- |
| `runtime/` | Untouched original source-selection distribution archive |
| `engineering/` | Complete original native engineering receiving ZIP |
| `reviews/` | Original core history, operated source history, independent recipient history and full revision register |
| `reports/source/` | Full private report ZIP, aggregate-only ZIP, JSON and offline HTML from the operated source |
| `reports/received/` | Full private report ZIP, aggregate-only ZIP, JSON and offline HTML from the final independent recipient |
| `merchant-datasets/round-1/` and `round-2/` | Every original data.csv, dataset.json and hila-lineage.json |
| `originals/` | Complete original XForm, all translated questionnaire definitions, acquisition, mappings and synthetic input/methodology originals |
| `guides/` | Complete public product, methodology, installation, operator, browser, handover and continuation guides |
| `summary.json` | Source/review/runtime identities, counts and actual completed checks |
| `SOURCE_AND_USE.md` | Original questionnaire permission status and synthetic-input interpretation |
| `manifest.json` | Complete per-file byte count and SHA-256 |

The private operation records contain local paths, connection information and browser/process state. The packager selects useful customer files explicitly and constructs its summary from the safe native identities. It does not copy those private operation records or screenshots into the customer ZIP.

## Verification and continuation

The packager holds a permanent per-destination OS lease over selection, staging, publication and full readback. It rejects path traversal, symbolic links, duplicate/case-colliding member names, unintended original/output overlap and changed source bytes. The maximum complete source selection and archive size is 4 GiB.

Archive construction streams full original files through the compressor and verifies each source again while reading. The ZIP uses fixed timestamps and regular-file modes. The staged archive is read in full: exact member set, complete byte counts, SHA-256 and ZIP CRC checks must all agree. Publication uses a same-filesystem link that cannot replace an existing destination; only its own verified staging name is removed after successful publication.

If a complete destination already exists, the same selected input must reproduce its entire manifest and every full member. It is reused after verification. If final receipt publication was interrupted, the original complete ZIP is verified and the receipt is completed without another archive. Interrupted private stages stay available. A different completed destination is preserved and rejected.

The returned receipt has `state:"COMPLETE"`, the original operation/source commit, selected-file manifest hash, output path, byte count, SHA-256, source and recipient review identities and completion time. The complete controller retains that receipt and the actual customer ZIP identity.

## Source interpretation and use

The original questionnaire contains four languages, 46 agreement items and five dimensions. The two engineering response editions and their numerical scoring/disclosure configuration are synthetic fixtures. Their results demonstrate the source-bound implementation and independent receiving. They are not respondent observations or official HILA scores.

No questionnaire redistribution licence was supplied with the retrieved public XForm. The full acquisition and source-use notice preserve that status. Keep the complete package within its authorized private context and obtain any required permission before distributing questionnaire content.

Customer use selects two supplied approved anonymized editions and a complete approved methodology/disclosure configuration. The product retains explicit yes/partial/no/no_response values, distinct missingness and relevance states, multi-select memberships and unique totals. Public exports use the selected approved aggregate disclosure rules; the full private history and coded source data remain separate.
