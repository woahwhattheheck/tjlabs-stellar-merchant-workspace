# Rialto capture progress and complete source receiving

The capture-progress workflow makes an unfinished catalogue useful to its operator. It opens the original capture directory, reconstructs the retained page sequence, records which exact attempt supplies each accepted page, and carries every original file into a downloadable private receiving packet. It works before catalogue.json exists.

This workflow is part of the existing Rialto customer application. It does not make HTTP requests. The original capture command remains the owner of acquisition, the original plan remains the request identity, and the original customer workflow still handles catalogue review, selected requests and native buyer preparation.

## Open an existing acquisition

Use the maintained complete installation and the original private capture directory:

~~~sh
node stellar/scf-starforge-20261009/partners/rialto/customer.mjs capture-progress \
  --directory /absolute/private/original-catalogue \
  --out /absolute/private/capture-progress-01.html
~~~

The report must be outside the source directory and have a new filename. Omitting --out prints the full progress JSON without writing a report. Inspection takes the existing receiving lock, reads a coherent complete inventory and makes no network calls.

Open the HTML locally. It contains the coverage summary, facilitator and federation read outcomes, every retained attempt, a searchable attempt table, all original file hashes, and two downloads:

- **Complete original source** is the existing complete-private-receiving JSON format. Every ordinary original file is retained, including full HTTP bodies, headers, timestamps, prior failures and any already saved catalogue. The report is private; carry it with the same care as the original directory.
- **Progress JSON** is the readable reconstruction and source inventory. This summary alone is not a substitute for the complete original source.

The HTML is self-contained and uses no external scripts, fonts or requests. Its source download can be opened by the existing receive command. Print produces a readable static record.

## Understand coverage before making a decision

| State | Meaning | Operator action |
| --- | --- | --- |
| Catalogue capture has not started | The plan exists but the first original catalogue page has no retained attempt. Capability reads may already exist. | Resume the original capture in its original directory. |
| First catalogue page failed | An attempt exists at offset zero, but no complete valid original page has been accepted. | Read the retained HTTP or transport outcome, then resume the same operation when the source is reachable. |
| Catalogue partially received | One or more original sequential pages are retained, but the provider's reported terminal page has not been reached. | Continue from the displayed next offset and original URL through the original capture command. |
| All pages retained; save catalogue | A complete original page sequence exists, but the completed catalogue was not saved. This can follow an interruption before final publication. | Resume capture with the same plan and directory; it reuses the retained valid pages and saves the catalogue. |
| Catalogue complete | The saved catalogue exactly agrees with its retained original pages, plan and capability-source references. | Continue the existing report, comparison, review and selection workflow. |
| Original source needs attention | A retained member, capture identity, attempt sequence or saved catalogue is inconsistent. | Preserve all original files and reconcile the reported source problem before resuming. |

A successful terminal original page with zero rows is a genuine empty catalogue. Failed requests, missing pages, HTML error bodies and malformed JSON are not empty catalogues. Before a page is accepted, the report displays the row count as **Unknown**. After partial success it shows only the rows actually retained, together with **Incomplete** coverage.

The analysis calls the existing page and catalogue contracts. It uses the same requested network, scheme, limit, optional type/payTo filters, offset progression and terminal-page rule. At each offset it chooses the first retained successful valid page, matching captureGet's reuse behavior. Earlier failed and invalid-response attempts remain visible. The provider's changing totals and repeated resource identities remain in the original catalogue findings.

A facilitator or federation HTTP200 is a received response, not a declaration that a particular payment route is ready. Read its original body before making capability decisions. A complete catalogue is also separate from the original customer request, challenge and buyer authorization.

## Reopen the whole source on another machine

Download **Complete original source** as original-capture.json. On the receiving machine, choose a new absolute directory and a new report filename:

~~~sh
node stellar/scf-starforge-20261009/partners/rialto/customer.mjs capture-progress-open \
  --file /absolute/private/original-capture.json \
  --directory /absolute/private/received-catalogue \
  --out /absolute/private/received-progress.html
~~~

The existing receive implementation checks every path, canonical base64 body, byte count and SHA-256 before materializing a private new directory. The progress workflow then reconstructs the same original source and produces the receiving machine's report. It never overwrites an existing receiving directory or report.

If the process is interrupted after receiving the directory but before finishing the report, preserve that directory and run capture-progress on it. Do not receive over it or create another source identity just to recover the report.

The original independent commands are also available:

~~~sh
node stellar/scf-starforge-20261009/partners/rialto/customer.mjs pack \
  --directory /absolute/private/original-catalogue \
  --out /absolute/private/original-capture.json

node stellar/scf-starforge-20261009/partners/rialto/customer.mjs receive \
  --file /absolute/private/original-capture.json \
  --directory /absolute/private/received-catalogue
~~~

Progress inspection never changes an original capture or saved catalogue. A report is an immutable snapshot and remains a valid historical source even after a working directory receives further attempts. Create a new report filename for later progress.

## Resume the same original acquisition

After reviewing the retained outcome, use the original plan in the same working directory:

~~~sh
node stellar/scf-starforge-20261009/partners/rialto/customer.mjs capture \
  --plan /absolute/private/received-catalogue/plan.json \
  --directory /absolute/private/received-catalogue
~~~

The original command reuses successful valid retained pages and can append a fresh GET attempt for a failed or invalid response. A native source capture retains method, complete URL, request headers, start and retrieval timestamps, response status and headers, full response bytes, their SHA-256, and exact UTF-8 text when valid. Transport errors remain original error records.

The progress view does not add a retry loop, switch hosts, alter filters or start another capture. Coordinate one active executor for the original operation. If the original writer is active, the existing lock reports that fact.

Once catalogue.json exists and matches its source, keep that edition. A new later catalogue belongs in a separate new directory and can be compared through the existing catalogue comparison application. Preserve the current --catalogue-review selection and Installation preparation path when the catalogue becomes usable.

## When another downloader reports failure

An external source downloader can return an HTTP error without providing response bytes or headers. Retain that provider receipt separately with its exact requested URL, GET method, date and provider error. Such a receipt is a useful acquisition observation; it is not a native capture file and cannot be used to create a catalogue page, fill response fields or declare a zero-row result.

The maintained progress application requires original plan.json and complete retained native capture records. When a native host becomes available, give it the same source plan and original operation, and retain its actual output. Do not fabricate capture files from a short downloader error.

## Programmatic use

capture-progress.mjs exposes four operating functions:

- captureProgress(files, {createdAt, directory}) reconstructs an inventory whose members use path, bytes, sha256 and base64. It verifies the complete original bytes, then returns coverage, attempts, capability outcomes, source findings and selection readiness.
- captureProgressHtml(progress, packetBytes, {sourceName}) renders the private self-contained report and embeds the exact original receiving packet.
- inspectCaptureProgress(directory, {out}) reads the original directory under its existing lock and optionally writes a new report outside it.
- receiveCaptureProgress(file, directory, {out}) uses the original full-source receiver, then opens the received acquisition.

The module is included by the existing Rialto component-directory selection; no separate product or replacement native buyer is required. The main customer CLI dynamically loads it only for the two new commands. Existing capture, review, request, installation and buyer commands retain their original behavior.
