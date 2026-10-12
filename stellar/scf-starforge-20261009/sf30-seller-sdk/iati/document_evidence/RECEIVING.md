# Complete document-evidence receiving

This programme operates the installed IATI workspace from the complete original publisher XML through explicit document observations, named review, historical replay, a portable handover, independent receiving, connected clients and the browser. It uses the existing organisation planner, document-evidence model, authenticated console and Merchant source-workspace provider. It does not maintain a second application database.

## Original input

Create a private JSON configuration with these exact keys:

- `operationId`: one stable original operation identifier, at most 110 characters.
- `directory`: the absolute private directory for this same receiving case.
- `sourceFile`, `sourceSha256`: the complete original organisation XML file and its SHA256.
- `sourceUrl`, `sourceRetrievedAt`: the retained publisher acquisition provenance.
- `organisationName`: the name of the saved parent and evidence selection.
- `assessment`: the original organisation assessment, including explicit asOf, fiscalYearStart, forwardYears and methodology.
- `documentUrls`: one to 20 distinct literal URLs that are actually present in that source. Preserve whitespace exactly; the fetcher records an invalid published URL as a refusal instead of silently repairing it.
- `reviews`: an object keyed by each selected literal URL. Each value has the named operator's decision and note, plus correctedUrl only when explicitly proposed.
- `limits`: the original maxBytes, timeoutSeconds, connectTimeoutSeconds and maxRedirects.
- `actor`: the named receiving operator.

The adjacent `examples/fcdo-original.json` is an explicit source-backed example. Replace only its installation and private case paths before the first run. It selects two real FCDO annual-report links, including one with the publisher's trailing space. Its decisions defer relevance review of the first document and propose a URL correction for the second. HTTP success alone never becomes a usable decision.

## Run the whole original case

Use the installed Python and Node runtimes and the existing Playwright/Chromium installation:

```sh
python3 /SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/document_evidence/receiving.py \
  --config /PRIVATE/document-receiving-input.json \
  --connected \
  --node /RUNTIME/node \
  --mcp-directory /SOURCE/stellar-forge/mcp-merchant-operator \
  --playwright-module /RUNTIME/playwright/index.mjs \
  --chromium /RUNTIME/chromium
```

The complete source must be installed first. Both maintained IATI source declarations must include the same new files before exporting an organisation or evidence packet. The programme and the existing application modules operate on the same exact installed edition.

The Python owner holds one case lock, saves the complete original input and every request, and uses the original workspace leases. It then:

1. Receives the original publisher XML and saves a parent organisation plan.
2. Enumerates the full original document register and freezes the explicit selected rows.
3. Acquires each selected URL once with its original request ID. A complete response, a failed prefix, a policy refusal and an interrupted request remain different outcomes.
4. Records the caller-authored review and retains the original organisation URL-correction request without applying it.
5. Creates a following note edition and compares the saved evidence without another fetch.
6. Replays the original save, observations and review after that later edition.
7. Exports the complete evidence packet twice to the same selected output and verifies exact reuse.
8. Receives the complete packet into an independent original workspace, creates a receiving note, re-receives the older packet and checks that the later recipient revision survives.
9. Closes and reopens the receiving workspace.

With `--connected`, the same Python owner opens two original loopback consoles and invokes `receiving.mjs`. The Node continuation checks the real SDK and Merchant APIs, exact snapshot pagination and row detail, all original request replays, complete HTML/CSV/JSON/body downloads and full packet receiving. It releases a retained ZIP prefix, reopens the same export, reads the remaining original bytes and verifies the full SHA256. It then closes/reopens the Merchant owner and reads the same retained export again.

If both browser options are supplied, `browser.mjs` opens the actual saved selection and visits all six document-evidence views, then the acquisition and handoff views at a mobile viewport. It retains complete screenshots and browser errors. This browser phase reads the saved case; it does not submit another observation, review or import.

Omit `--connected` only when intentionally completing the native Python portion alone. The direct Node entrypoint consumes the private connected-input.json produced by the Python owner while those same consoles remain live; it is not a replacement application launcher.

## Continue an interruption

Re-run the same complete command and unchanged input against the same case directory. An already complete native result is reopened only after verifying the whole original packet, both workspace identities and current plan revisions, every original observation, and the retained comparison. Its original exported source edition is preserved when a later connected-source correction is installed. Existing requests and output bytes are reopened before any new operation is considered. The model recovers an inactive acquiring request as interrupted evidence; it does not refetch it. An active acquisition remains ACQUIRING and the programme leaves that original request pending.

The case lock prevents simultaneous programmes. Each immutable request is loaded before a new request is constructed, so replay retains its original expected revision. A changed input, source or output is rejected rather than silently becoming a second edition of the receiving operation. To perform a genuinely new observation or scope, create the explicit new native request through the operator workflow.

Complete browser results are reused only after every original image has been rehashed. Console links are private ephemeral files, opened only under the current case/workspace owner and removed when that owner closes. They must not be included in a customer handover.

## Retained results

The original case contains:

- `original-input.json` and `requests/`: exact selection, observation, review, comparison and note inputs.
- `sender/` and `receiver/`: the two original workspaces.
- `document-evidence.zip`: the full portable source, parent organisation history, evidence revisions, observations, reports and declared response bytes.
- `results/native-receiving.json`: complete native identities, counts, actual observation outcomes, packet SHA and receiving revision.
- `results/original-url-correction-draft.json`: the explicit unsubmitted correction.
- `connected/complete.json`, `connected/files/`, `connected/observations/`: actual connected receiving and complete verified downloads.
- `connected/browser/` and `connected/browser-result.json`: optional actual desktop/mobile evidence.

Interrupted process receipts use immutable content-hashed filenames. A process exit without the COMPLETE result is not reported as a completed journey. Retain the whole original result and its actual limitations, including a failed network observation when that is what the public request returned.

For everyday operator instructions see `../DOCUMENT_EVIDENCE.md`. The detailed model, HTTP, request and portable contracts are in `GUIDE.md`.
