# Maritime workbench: operator and receiving guide

This guide operates the complete Econdb source edition in the folder containing `maritime-cli.mjs` and `maritime-workbench.html`. Its repository location is `stellar/scf_2026/sf49_data_commissioning/econdb/`.

The workbench reviews retained original observations. It does not buy data, grant a license, select a customer or create a payment. The native CLI receives an existing file or acquires an authorized original response. The existing merchant/buyer and Installation applications retain commercial authority, spending, delivery and recovery.

## 1. Select the actual operating task

Name the analyst organization, first operator, second receiving operator, report audience and decision supported. Record the actual ports/LOCODEs, source measure, required history and date selection in the maintained commissioning case. Name the source-rights and host owners. Leave unanswered choices open.

Treat these as distinct choices:

| Choice | Meaning |
| --- | --- |
| Capacity by operator, flow `throughput` | Calling-vessel TEU capacity, with monthly labels |
| Capacity by operator, flow `import`, `export`, `transshipment` or `cargo` | That explicitly selected source-defined container-volume flow, with monthly labels |
| Container traffic | Original Imports, Exports and Transshipment observations on their original `Date`; frequency is not inferred |
| `top: "0"` or `top: "all"` | The documented request for all operators; actual returned coverage still needs review |
| A positive top selection | Leading operators with grouped Others, not a complete individual-operator inventory |
| Exact `operator` selection | The source's operator name; omit top because the provider ignores it |

A common TEU label does not make capacity and cargo interchangeable. Do not add these measures together or derive daily/monthly traffic observations from an undeclared frequency.

Date selections are local, half-open intervals: **From is included; Until is excluded**. The port endpoints do not declare server-side date filters. The original complete response remains retained even when the review selects a smaller window.

One response with two dates is one edition. Two operators from the same customer are one organization. A local reopen, changed report selection or source download is not another acquisition or purchase.

## 2. Open the exact delivered source

The agreed native target is the existing Node 22 host, including built-in fetch. Record the actual runtime version on the receiving host. Do not install a second runtime or open a second operating case merely to follow this guide.

Open the delivered `maritime-workbench.html` in the actual recipient's browser. It has no external network dependency and performs no API capture. Initially no source edition is selected. Source files remain local; the workbench does not autosave them.

Check the exact source edition against its delivered manifest before operation. Source verification establishes which code/files were received; it does not establish that the UI or attachments have been opened or used.

Maintain the original accepted operation and its existing runtime/receiver ownership. If that runtime is unavailable, retain the full source and this guide with the existing equipped receiver. Record the actual boundary reached; a queued request or pre-process failure has no native/browser result.

## 3. Complete the documentation-example course

The bundled examples are transcribed from Econdb's published OpenAPI examples. Their descriptors retain that basis, the original OpenAPI hash and the exact JSON transcription hash. They have **no identified port** and **no authenticated current capture**.

### Capacity and a period comparison

1. Open the exact workbench. Confirm its initial empty state is legible and derived exports are unavailable.
2. Select **Capacity example**. Review its source role, absent port identity, monthly frequency and original hash.
3. Use From `2022-02-01`, Until `2022-04-01`. The retained illustration has 12 cells: six source series over February and March.
4. Enable **Compare equal, complete monthly periods within this response**. Before is `2022-02-01` to `2022-03-01`; After is `2022-03-01` to `2022-04-01`. Select **Apply selection and compare**.
5. Inspect the actual values and changes. For example, Mediterranean Shipping goes from 84,622 to 156,663, a difference of 72,041. Ocean Network Express goes from 13,918 to 235, a difference of -13,683. Others remains an explicit source series. These are documentation values, not a current port finding.
6. Change the selected window to `2022-01-01` through `2022-04-01` and apply. January must appear as a missing monthly label. Restore the original window and apply again.
7. Select a window outside the illustration and apply. Use the explicit empty-result behavior; do not describe it as zero activity.
8. Restore the February/March result and save the complete downloads described in section 7.

This compares periods within one source response. It does not satisfy the two-real-edition receiving course.

### Container traffic and unknown values

Select **Container-traffic example**. The source date is `2022-02-21`; use Until `2022-02-22` to include that observation. Imports is 34,850, Exports 26,635, and Transshipment is null. The report must retain the null instead of zero and must not present inferred missing monthly labels.

A monthly-period comparison is unsupported for this undeclared-frequency source. If selected, inspect the clear error and correct the choice; do not alter the source to make the comparison run.

### Native receiving of these same examples

Run from this product directory, using the original operation's agreed working directory. The relative `work/` names below are example destinations within that operation; do not overwrite an existing completed result.

~~~bash
node maritime-cli.mjs receive --source examples/capacity.response.json --descriptor examples/capacity.descriptor.json --out work/editions
node maritime-cli.mjs receive --source examples/traffic.response.json --descriptor examples/traffic.descriptor.json --out work/editions
node maritime-cli.mjs list --root work/editions
node maritime-cli.mjs analyze --edition work/editions/issuer-doc-capacity-by-operator --from 2022-02-01 --until 2022-04-01 --before-from 2022-02-01 --before-until 2022-03-01 --after-from 2022-03-01 --after-until 2022-04-01 --out work/reviews/documented-capacity
node maritime-cli.mjs analyze --edition work/editions/issuer-doc-container-traffic --from 2022-02-21 --until 2022-02-22 --out work/reviews/documented-traffic
~~~

Open both generated `report.html` files, inspect the actual full observations, and open the CSV/JSON originals. A zero exit code does not replace looking at the delivered files.

A repeated receive with the same original ID, bytes and descriptor reuses that edition. A changed source must have a new edition ID. A completed analysis destination is immutable: reopen it, or choose a new explicit review destination for a new review. Do not delete a completed result to make a repeated command succeed.

## 4. Receive or acquire a real authorized response

### Receive existing original files

Use the original JSON bytes together with the exact retained descriptor. The descriptor records:

- unique edition ID; endpoint kind; actual LOCODE;
- actual flow/operator/top selection where declared;
- source role `operator_supplied_response` or `authenticated_response`;
- actual UTC capture time and exact original UTF-8 SHA-256;
- original request URL and source/rights evidence in `basis`.

The request URL must match the descriptor's actual request parameters. Do not repair a mismatched descriptor by inventing a port, time, role or entitlement. Preserve the original evidence and resolve the mismatch with its source owner.

~~~bash
node maritime-cli.mjs receive --source actual-response.json --descriptor actual-descriptor.json --out work/editions
~~~

Choose both files in **Original response JSON** and **Retained descriptor JSON**, then **Open source edition**. Confirm the on-screen source is the file pair actually selected, particularly after changing files or opening an example during a slow read.

### Acquire through existing authorized access

The host owner supplies the already authorized `ECONDB_TOKEN` through existing private custody to the native process. Do not paste it into the request file, report, browser, proposed commercial record or shared log. Capture uses the issuer's documented token header and refuses redirects. It does not create an account, purchase a subscription or negotiate source rights.

The capture request file is an array of `{id, request}` jobs. Use one unique original edition ID for each original acquisition. A request has `kind`, the exact selected `locode`, and only supported parameters. A port-catalogue request is exactly `{"kind":"ports"}`.

For a real all-operator monthly capacity selection, the request object is `{"kind":"capacity-by-operator","locode":ACTUAL_SELECTED_LOCODE,"flow":"throughput","top":"0"}`, replacing the explanatory LOCODE marker with the source's actual string. For container traffic, omit flow/operator/top. Never add date_from/date_to.

~~~bash
node maritime-cli.mjs capture --requests actual-approved-requests.json --out work/editions
~~~

Existing capture IDs resume their retained original; they do not refresh it. A legitimate later capture uses a new ID and actual capture time, preserving the baseline. A failed HTTP request is not a received source. Do not switch accounts or retry around a provider refusal.

The native receiver retains an HTTP-success response even when its content requires source review. Inspect `receiving-state.json`; `source_review_required` preserves received bytes but does not mean the file is analyzable. The list command reports per-edition errors instead of silently discarding those originals.

The port directory is a distinct catalogue output, with original `response.json`, descriptor, selection and manifest. Review its usable LOCODEs and original records before choosing ports. It is not a maritime time series and is not opened as one in the workbench.

## 5. Review coverage before interpreting changes

Review the endpoint, flow, population, operator/top selection, original request URL, capture time and source role. Examples must explicitly show that observed request/port details are absent. A source title alone does not identify import versus export.

Then inspect the selected window:

- observed and expected monthly labels where that expectation is defined;
- missing monthly labels, repeated dates and ambiguous monthly date labels;
- known, null, absent and unsupported cells;
- undeclared series and grouped Others;
- original row/series identity and exact numeric values.

A complete request for all operators does not prove the response contains a complete individually named population. Keep structural exceptions visible and resolve their interpretation with the source owner.

Monthly totals compare equal numbers of complete, nonoverlapping chronological months in the same source series. Incomplete inputs suppress the relevant totals/change; zero baseline makes percentage change undefined. No cross-measure total is constructed.

The on-screen original observations are paginated at 100 cells. For a legitimately larger received source, use Next/Previous and check the first/last visible cells against the complete download. Do not fabricate customer data to fill pages or call a small example a capacity run.

Current implementation limits are 128 MiB per received response, 2 MiB per descriptor, 500,000 source cells for in-memory analysis, and 256 MiB for a browser workspace. Original bytes above analysis capacity remain a source-receiving concern; this limit does not silently authorize partitioning or prove a particular host's throughput. Agree a source-preserving course before a larger production selection.

## 6. Compare two real editions

Use the later genuine capture as current. Expand **Compare against a previously retained source edition**, choose the earlier original response and descriptor, then **Open previous edition**. Enable the revision comparison and apply the reviewed local window.

The two editions must have the same exact request and source-role basis. The later capture must actually be later. Repeated date keys need resolution before comparison. A documentation example is intentionally refused as an observed source revision.

Review both changed cells and metadata/coverage changes. Added dates or series differ from revisions to a known cell; removal differs from zero. Unchanged data remains unchanged even if the response was captured later. A new title, operator metadata or selected coverage must not disappear merely because the numeric values are equal.

The native equivalent adds `--previous` to the analysis command, pointing at the retained earlier edition directory. The current output then includes both original response/descriptor pairs, the selected result and `edition-comparison.json`. Keep both source identities with every report handed to another operator.

If the second real edition is not available, state that this course remains pending. Do not edit or retimestamp the documentation sample to manufacture an observed revision.

## 7. Open and use every outgoing attachment

The producing operator must open, see, play or use **every exact outgoing attachment as the recipient would**. A checklist, source review, HTTP success, completed conversion, saved draft, captured-but-unseen screenshot or peer approval does not replace this actual use.

Before delivery:

| Output | Recipient use to perform |
| --- | --- |
| Original response and descriptor | Open the exact files; confirm the selected request, source role and immutable original identity |
| Observation CSV | Open the complete file in the intended spreadsheet/text reader; check headers, full row count, selected boundaries, exact values and unknown states; avoid silently accepting spreadsheet numeric coercion |
| Review JSON | Open and use its complete period/comparison/revision content, including original source references and exceptions |
| Complete HTML report | Open the actual downloaded report, view its coverage, request metadata, changes and complete observations; inspect desktop and relevant narrow/mobile presentation |
| Saved workspace JSON | Reopen the exact saved file in the delivered workbench and compare source IDs/hashes, applied selection, toggles, results and unknown states |
| Native analysis directory | Open the actual report and underlying files, including previous originals when comparing editions; retain `manifest.json` and analysis-source identity |
| Commercial proposal/working record | Open each exact outgoing document in its actual recipient format and inspect every rendered page; editable source is not a rendered PDF |
| Delivery archive | Extract the exact outgoing archive and open/use each included recipient file, preserving its expected contents and original identities |

If media is produced for the customer, use available appropriate generative media and natural high-quality voice, then play the actual final file and watch/listen to it. No media result is implied by this software guide.

Use the relevant populated, empty, loading and error paths. Operate date controls, examples/imports, comparisons, pagination, downloads and reopening. Editing controls without applying must not make exported/reopened results silently differ from the displayed applied result. During a slow source read, changing the chosen file or example must not be overwritten by an older completion.

Look at actual screens/screenshots at a comfortable desktop/screenshare width and relevant phone width. Fix actual unreadability, clipping, horizontal overflow, missing styles or broken controls directly. Preserve source facts, exact arithmetic, useful workflows and historical results. Verify the specific repair; do not substitute a new broad review programme or restart completed business work.

## 8. Independent receiving and continued operation

Give the named second operator the complete delivered source, guide, immutable originals, exact descriptors, applied workspace, full reports/exports, configuration references and agreed source-rights record. Credentials remain in authorized custody, not in the archive.

The second operator:

1. Opens the exact delivered workbench/report and every relevant received attachment.
2. Reopens the saved workspace and verifies the same applied source/selection/result.
3. Opens the original current and prior source files independently and checks their retained identities.
4. Makes one explicitly authorized reporting-window or comparison choice, applies it, and exports a new review without changing the original edition.
5. Reopens that new workspace and report; preserves the earlier accepted outputs.
6. If native receiving is commissioned, runs the delivered CLI on the agreed runtime with those original files, opens its complete outputs and records the actual source/runtime/destination identity.

For multiple ports, keep every port/request/edition explicit. A collection of per-port results must preserve the same agreed cross-port selection and disclose missing members. This workbench does not silently combine different requests into one total.

A new directory, restored workspace or second analyst is not a second customer or purchase. Record actual receiving observations on the original Installation/workshare case.

## 9. Join the maintained paid-resource course only when selected

Keep source subscription/license, commissioning fee and resource purchase as separate commercial events. The named buyer approves the whole useful resource request, priced unit, payment choice, per-request limit and aggregate task budget in the existing merchant/buyer application.

The source adapter never authorizes payment, creates wallet authority or establishes redistribution rights. Use the original native request, observed payment/delivery IDs and complete fulfillment. Reconcile an uncertain result under that original request before any new attempt. Reopening retained data has no new purchase effect.

If no paid route is selected or used, state that exact result. Do not invent a purchase to close a required criterion. The existing Installation owner preserves the real criterion state and records the reviewed scope decision through the native workflow.

## 10. Record completion accurately

In the original case retain the exact source/attachment edition, actual operator and receiving environment, applied selections, complete output identities, visible findings, focused repairs and independent continuation. Keep source preparation, acquisition, calculation, rendered inspection, delivered output, customer acceptance and payment distinct.

The guide and public documentation examples define a reproducible course. Their presence does not prove a native application run, browser inspection, licensed customer acquisition or accepted delivery. Close only the actual outcomes observed on the received version.

Primary contract: https://api.econdb.com/v1/schema/  
Published API documentation: https://developers.econdb.com/docs/  
API explorer: https://developers.econdb.com/swagger/

## Producing analysis source

The native analysis-source.json records the producing module version, exact SHA-256 and issuer contract SHA-256. Each saved browser workspace records the same identities. Reopen with its accompanying exact offline file; the workbench rejects a workspace made by another engine hash. To analyze older original observations under a changed engine, load the original response and descriptor as a new explicit analysis and keep both outputs. The source generation helper refreshes the embedded module and its engine identity together.
