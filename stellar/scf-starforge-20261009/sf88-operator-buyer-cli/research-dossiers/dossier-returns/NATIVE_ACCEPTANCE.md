# Native acceptance for complete dossier returns

This programme runs the original dossier store, Crossref intake, document and workbook extraction, return engine, browser client and source exports together. It creates recoverable native revisions and reviewed returns, then reopens the delivered result and continues editing it.

## Runtime and source selection

Use Node 24 with synchronous `registerHooks`, the original Python workbook dependencies, and the original Research source. To include the browser journey, supply both an installed Playwright module and an existing Chromium executable.

The programme requires a complete selected-source manifest. Paths are relative to the repository root four levels above `research-dossiers`. Each selected file has its exact path, Git mode, byte count and SHA256:

```json
{
  "schema": "research-dossier-return-native-final-cohort-v1",
  "baseCommit": "SELECTED_COMMIT",
  "files": [
    {
      "path": "LICENSE",
      "mode": "100644",
      "bytes": 1091,
      "sha256": "2c961cd561150af9a4f94f3f48f0bad7bf271acd0f9cdaa1d354c511b94e84d8"
    }
  ]
}
```

The abbreviated example shows the row format. The actual manifest must contain the complete selected engine, this exact acceptance runner, the original Python workbook source and all selected browser assets. A prepared source delivery supplies that full manifest.

The collector validates every selected original file before execution and retains its complete body under the run's `source/` directory. It observes Node's real resolution and loading through the original loader. An actual repository module outside the selected source is an error; installed runtime modules are recorded with their actual paths and hashes. This avoids treating JavaScript import examples or unused source strings as executed dependencies.

## Run

```bash
node /ABS/research-dossiers/dossier-returns/source-native-acceptance.mjs \
  --feature-root /ABS/research-dossiers \
  --directory /ABS/owned-return-run \
  --source-manifest /ABS/FINAL_SOURCE_MATERIALIZATION.json \
  --crossref-edition /ABS/original-crossref-edition.json \
  --crossref-sha256 ORIGINAL_EDITION_SHA256 \
  --target-doi TARGET_DOI \
  --python /ABS/python3 \
  --operation SAME_OPERATION \
  --playwright-module /ABS/playwright/index.mjs \
  --chromium-executable /ABS/chromium
```

The Crossref input must be a retained native capture or original `crossref-document` edition containing a registered notice and its cited target. Its complete original bytes and requested SHA256 are retained with the run.

The combined programme creates current and returned authored changes, ordinary immutable editions, typed-history proposals and explicit decisions. It exercises paged comparisons, full value exports, stale-head rejection, native draft persistence, actual browser submission, an accepted response lost in transit, recovery of the same pending request after reload, complete report and source exports, a second return, cold reopening and continued editing.

## Continue the same execution

Keep the same operation, directory, source manifest, original Crossref input and runtime arguments. The programme retains the original requests and their accepted native revisions. On continuation, it reconciles an unacknowledged mutation against that exact next revision before advancing.

A source change needs an explicitly updated source selection and a review of the existing execution state. Preserve retained requests, phases and results when resolving a material source failure.

## Outputs

| Output | Purpose |
| --- | --- |
| `SOURCE_SELECTION.json` | Complete original selected-source manifest |
| `SOURCE.json` and `source/` | Exact retained original source identities and complete bodies |
| `native-module-observations/` | Actual Node module resolution, loading and installed runtime identities |
| `inputs/`, `retained/` and `phases/` | Original inputs, saved requests and completed native phases |
| `workspaces/` | Original editable store histories |
| `reviews/`, `values/`, `drafts/`, `portable/` and `delivery/` | Full comparisons, decisions, source/value exports and editable handovers |
| `browser/` | Browser journey observations, complete downloads and local visual QA |
| `browser/private/` | Invocation-private browser profile and listener state |
| `COMPLETE.json` and `ACCEPTANCE.md` | Actual complete outcome and operating report |

The collector verifies selected original source and retained source copies again at completion. A completed run is reusable only while its selected inputs and recorded output identities remain exact.
