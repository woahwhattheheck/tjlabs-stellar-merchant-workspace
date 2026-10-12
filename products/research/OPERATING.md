# Research questions, source review and complete delivery

Use one Research workspace for a question, its received source editions, the analyst's decisions and the final report. The browser, command line and merchant tools all operate that same saved dossier. Original source responses remain available beside the analysis, including after a source connection closes.

This product supports a complete working sequence:

1. Open the existing dossier and select its research question.
2. Review the received sources, their coverage and the saved evidence selections.
3. Bring original files and their authored findings into that question with one reviewed source bundle, or receive a retained cohort through its configured source.
4. Review a completed original Document or prepare and continue its managed processing Pipeline.
5. Prepare or resume the original Crossref request for DOI metadata and update review.
6. Receive the reviewed edition and preserve the question's earlier notes, selections and findings.
7. Review registered citation updates, save the complete evidence and finding decisions, and select the intended report revision.
8. Write the source-linked analysis, then deliver the complete report, original files and portable dossier.
9. Reopen the exported dossier on the receiving workspace with its original history.

## Open the original workspace

Use the existing Linux and Node 22.16+ runtime described in the [product README](../../README.md). The Research client uses Node's built-in modules. Its optional source connections use their existing host configuration.

The maintained distribution can install this complete product with `--selection research-workspace`. Follow [installation, original source configuration and customer receiving](RECEIVING.md) for the selected release, dependency profile, Applications entry and restart sequence. The selected package includes these operating files and the full Documents/Pipelines client contract.

From a source checkout, prefix commands with:

~~~sh
node stellar/scf-starforge-20261009/distribution/cli.mjs
~~~

The installed command is `starforge`. Inspect this product's registered client with:

~~~sh
starforge registrations --command research-client
starforge research-client help
~~~

Start the browser against a private, persistent directory:

~~~sh
starforge research-workspace \
  --dir /srv/starforge/research \
  --connection-file /srv/starforge/private/research-connection.json
~~~

Open the printed local URL. An existing managed Applications operation can supply its own private `application-url.json`; the client accepts that original startup record. Keep the connection file private because its URL contains the listener's bearer credential.

To enable Crossref acquisition, supply the existing private source state when starting the workspace:

~~~sh
starforge research-workspace \
  --dir /srv/starforge/research \
  --connection-file /srv/starforge/private/research-connection.json \
  --crossref-state /srv/starforge/crossref-source
~~~

The source retains its captures, request plans, transport settings and rate-limit state. Optional `--crossref-config`, `--openalex-workspace`, `--document-source` and `--pipeline-source` arguments attach the host's configured sources. Their complete operating contracts are in the [Research workspace guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/README.md).

## Read the saved question and evidence

Use the same directory and startup record in the client:

~~~sh
starforge research-client list \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research --limit 25

starforge research-client section \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research \
  --id DOSSIER_ID --section questions --limit 25

starforge research-client section \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research \
  --id DOSSIER_ID --section sources --limit 25
~~~

Use the identifiers returned by the original workspace. A page returns its selected dossier revision or inventory snapshot; carry that value into the next page. Metadata and section reads let an analyst inspect large dossiers without repeatedly returning every original response.

The workspace groups matching source identities while retaining their original edition occurrences and content variants. Review the actual source and its operating assumptions before changing a finding. A publication date, deposit date and source-capture date describe different events and remain separate in retained source metadata.

Structured edits use `--input REQUEST.json`. Read the current notes, compose the full intended value, and include the reviewed `expectedRevision`. For example, the question update object has `notes`, optional `text` or `status`, and `expectedRevision`. A conflicting revision prompts another read of that original dossier.

## Receive original files with their findings

A source bundle keeps an original collection of files, its source definitions, the analyst's evidence selections and the linked findings together. Receiving saves that complete collection under the chosen question in one dossier revision.

In the browser, choose **Import source bundle** and select the original question. Open an existing bundle, or choose a source manifest and the folder containing its named files. Review the source titles, terms, selections and complete finding text in the preview. **Download bundle** preserves that prepared input; **Import into question** receives the reviewed bytes.

The [source-bundle guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/SOURCE_BUNDLES.md) includes the complete manifest format. Each source names its original files; each finding links to those source keys. The file list is explicit, so a larger working folder can hold other material without adding it to the selected bundle.

Build a bundle from the original manifest and source folder with the installed command:

~~~sh
starforge research-dossiers bundle-create \
  --manifest /srv/starforge/inputs/source-manifest.json \
  --source-directory /srv/starforge/inputs/original-files \
  --out /srv/starforge/inputs/reviewed-sources.json
~~~

Preview it against the existing running workspace, then receive it with the revision and bundle hash returned by that preview:

~~~sh
starforge research-client bundle-preview \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research \
  --id DOSSIER_ID --question QUESTION_ID \
  --file /srv/starforge/inputs/reviewed-sources.json

starforge research-client import-bundle \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research \
  --id DOSSIER_ID --question QUESTION_ID \
  --file /srv/starforge/inputs/reviewed-sources.json \
  --revision PREVIEW_REVISION --sha256 REVIEWED_BUNDLE_SHA256
~~~

If another analyst changes the dossier before a fresh import, preview the same bundle against the current revision. If the receive reply is lost, repeat the same file and question: the original receiver recognizes that complete bundle already saved under the question and preserves later work. Changed file bytes identify another reviewed source edition.

For merchant operation, add a source handle to the existing workspace configuration's `sources` object:

~~~json
{
  "reviewed_sources": {
    "kind": "source-bundle",
    "file": "/srv/starforge/inputs/reviewed-sources.json",
    "sha256": "REVIEWED_BUNDLE_SHA256"
  }
}
~~~

Use `merchant_research_source_bundle_preview` with the workspace, dossier, question and that source alias. Use `merchant_research_source_bundle_receive` with the same selection, preview revision and bundle hash. The attachment reads the complete host file and calls the original authenticated Research application.

After receiving, source details expose each original file. Text can be read in full, and downloads preserve the original bytes. The complete bundle remains inside the retained edition and travels with the portable dossier, including binary files and original manifest bytes. The builder and receiver verify file lengths and SHA-256 values; the current limits are 64 MiB for the complete bundle JSON and 48 MiB for decoded source files.

The installed SDK exports `createSourceBundleFromDirectory`, `createSourceBundle` and `inspectSourceBundle` through the Research dossier module and its `source-bundles` export. The existing `ResearchWorkspaceClient` supplies byte and host-file preview/receive methods, so a service can use the same reviewed input and revision controls.

## Inspect and download an original source

Source pages and revision comparisons keep titles, descriptive fields, selections and typed previews small enough to read through the installed client and merchant tools. Search still matches the complete original records. A retained file is read from its selected edition when the analyst opens or downloads it.

In the browser, choose the source and its retained variant. **Read text** opens the complete original text; **Download** keeps the original bytes. The selected citation also offers its original result record. The saved edition and member digest identify a file even when later editions use the same DOI or filename.

Use the same authenticated installed listener to inspect a retained occurrence:

~~~sh
starforge research-client source \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research \
  --id DOSSIER_ID --edition RETAINED_EDITION_ID \
  --key ORIGINAL_OCCURRENCE_KEY --revision SAVED_REVISION
~~~

Choose the actual source-bundle citation when a DOI group also contains OpenAlex or other provider editions. The inspection returns each original file's relative name, byte length, media type and SHA-256. Download the selected member with that returned name and digest:

~~~sh
starforge research-client export-source-file \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research \
  --id DOSSIER_ID --edition RETAINED_EDITION_ID \
  --key ORIGINAL_OCCURRENCE_KEY --revision SAVED_REVISION \
  --name "papers/original-study.pdf" --sha256 ORIGINAL_FILE_SHA256 \
  --out /srv/starforge/delivery/original-study.pdf
~~~

The client retains the complete stream and publishes a new output path exclusively. The server checks that the original edition belongs to the requested saved revision, that the member belongs to that occurrence, and that its bytes match the selected digest. Binary files and a UTF-8 byte-order mark keep their original bytes.

The same attachment exposes **merchant_research_source** and **merchant_research_export** kinds **source-file**, **source-content** and **source-record**. Its existing export receipts and resumable file reader carry the selected file through detach or restart. Complete content and parsed-record exports declare their own serialization and digest; the retained-edition export keeps the original response bytes and formatting.

The [complete source inspection contract](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/RESEARCH_CLIENT.md#inspect-and-download-large-original-sources) includes SDK, CLI, merchant and HTTP selections. Full portable delivery carries the original files and saved history.

## Review completed Documents

The **Documents** view joins the original document purchase and native Partition response to the selected research question. Open a saved purchase or a received edition, inspect its parameters and warnings, then read the original elements. The complete edition digest binds that review to the original document and response bytes.

The client uses the existing listener and dossier:

~~~sh
starforge research-client documents-list \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research --id DOSSIER_ID

starforge research-client documents-review \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research --id DOSSIER_ID \
  --input /srv/starforge/private/document-selection.json
~~~

The selection file contains exactly one actual `purchaseId` or `editionId`. Use the returned complete edition SHA-256 as `expectedEditionSha256` in the subsequent element, receiving and file requests. Page the original elements with `offset`/`limit`; `page`, `type` and `query` select the needed part of the retained response. Continue the returned `nextOffset` to read more.

Receive the reviewed purchase into its original question with `documents-receive`. Its request names `selection: {purchaseId}`, `questionId`, `label`, `expectedEditionSha256` and the reviewed dossier `expectedRevision`. The original receiving operation reconciles an already-saved binding before adding another edition.

Download the original document, its complete Partition response and the complete research edition with `documents-download`. Its input contains the same selection/digest and `kind: "document"`, `"response"` or `"edition"`; `--out` names a new local destination. Received editions remain reviewable after the former buyer source disconnects.

## Run and retain an original managed Pipeline

The **Pipelines** view uses the host's existing configured profiles and persistent operation directory. Read those profiles and limits, select the original research question, and prepare the exact source files with their reviewed complete hashes:

~~~sh
starforge research-client pipelines-list \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research --id DOSSIER_ID

starforge research-client pipelines-prepare \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research --id DOSSIER_ID \
  --input /srv/starforge/private/pipeline-preparation.json
~~~

The preparation object has `requestId`, `profileId`, `questionId`, `label`, the dossier's `expectedRevision` and an ordered `files` list. Each file has `file` and its complete lowercase `sha256`, with optional `filename` and `contentType`. Relative file paths resolve against the preparation JSON's directory. The original client checks each file, streams from the same open descriptor and verifies the complete bytes before finishing the preparation.

Retain the returned plan ID, plan digest and operation revision. The preparation and all subsequent actions belong to that original operation. Inspect it before an action:

~~~sh
starforge research-client pipelines-operation \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research --id DOSSIER_ID \
  --operation ORIGINAL_OPERATION_ID
~~~

| Work | Command and binding |
| --- | --- |
| Submit the reviewed plan | `pipelines-submit`; the action request ID, operation revision and original plan hash |
| Observe progress | `pipelines-refresh`; a retained observation request ID and current operation revision |
| Cancel processing | `pipelines-cancel`; the current operation revision and an explicit reason |
| Inspect provider jobs | `pipelines-provider-jobs`; optional workflow/status filters |
| Reconcile an interrupted submission | `pipelines-reconcile`; the matched original provider job ID, original plan hash, current operation revision and reason |
| Retain an advertised output | `pipelines-retain`; the returned provider `fileId` and optional `nodeId` |

Lifecycle commands take `--operation` and `--input`. Preserve each action's exact request ID and body through a lost reply. Refresh before selecting a later action. Reconcile the observed provider job into an interrupted submission so another operator can continue that same job.

Retention downloads the complete provider output into the original operation and returns its saved output ID, byte count and digest. Review that output with `pipelines-review`, inspect its original elements, and receive it into the selected question with `pipelines-receive`. Receiving uses `selection: {operationId, outputId}`, its own original `requestId`, the reviewed edition hash and the current dossier revision.

| Revision | Applies to |
| --- | --- |
| Dossier revision, starting at 1 | File preparation, Document receiving and Pipeline-output receiving |
| Operation revision, starting at 0 | Submit, refresh, cancel, reconcile and output retention |

The complete [Documents and Pipelines contract](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/RESEARCH_DOCUMENTS.md) includes SDK requests, CLI input objects, all element filters, source limits and same-request recovery. The existing [Pipeline source guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/UNSTRUCTURED_PIPELINES.md) defines the retained provider operation and host configuration.

## Deliver original processing files

The complete input, provider output and received source edition remain separate selectable files:

| File | Client command |
| --- | --- |
| Original prepared input | `pipelines-input --operation … --file-id … --out …` |
| Complete retained provider output | `pipelines-output --operation … --file-id … --out …` |
| Received pipeline output or complete research edition | `pipelines-download --input … --out …`; kind `output` or `edition` |
| Purchased or received Document, original response or complete edition | `documents-download --input … --out …`; kind `document`, `response` or `edition` |

All commands take the original connection file, directory and dossier ID. Review an operation output with its operation/output IDs, or select an already received edition. Carry its complete edition hash into the download.

The receiver publishes the complete stream to a new output path and returns the actual bytes and SHA-256. A requested digest mismatch retains the completed file and its returned identity for inspection. The ordinary report/portable export then carries the saved research questions, received editions, authored findings and complete history together.

## Work with a retained ClinicalTrials cohort

The same Research attachment operates the original ClinicalTrials receiving workspace. Configure a `clinicaltrials-packet` source handle with the actual retained ZIP and its SHA-256, then import that packet, select its captured cohort and prepare receiving under the original question.

Its tools cover saved inputs, review, start/resume, stop, receipt into the dossier, complete study reads, cohort analysis and comparison. The original source operator owns registry acquisition. Research retains the selected packet, complete nested studies, source coverage and reviewed findings. Analysis keeps distinct studies and source occurrences separate and uses the original cohort's reported values.

The [ClinicalTrials merchant operating guide](../../stellar-forge/mcp-merchant-operator/RESEARCH_CLINICALTRIALS.md) gives the exact tool fields and complete export selections. Whole-study, selected-analysis and source-packet exports use this attachment's existing file retainer and restart recovery. Reopening the portable dossier keeps its retained clinical edition available independently of the earlier receiving operation's working directory.

## Continue the saved Crossref review

The selected question must already contain its DOI-bearing sources. Prepare a request with a stable `requestId`, `questionId`, `label`, `expectedRevision` and `selectedOnly` selection. The [complete client guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/RESEARCH_CLIENT.md) includes the exact input objects for preparation, receiving, question updates and source imports.

~~~sh
starforge research-client crossref-prepare \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research \
  --id DOSSIER_ID --input crossref-plan.json

starforge research-client crossref-review \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research \
  --id DOSSIER_ID --operation ORIGINAL_OPERATION --section dois --limit 50

starforge research-client crossref-start \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research \
  --id DOSSIER_ID --operation ORIGINAL_OPERATION \
  --plan-sha256 REVIEWED_PLAN_SHA256
~~~

Review the same operation's coverage, source differences and warnings. Start/resume and stop keep its original identity. A partial result retains its useful records and transport failures; the projected comparison preserves sources that the refresh did not return.

Receiving requires the reviewed plan SHA-256, reviewed edition SHA-256 and the current dossier revision:

~~~sh
starforge research-client crossref-receive \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research \
  --id DOSSIER_ID --operation ORIGINAL_OPERATION \
  --input crossref-receive.json
~~~

After a lost reply, inspect the original dossier and operation. The receiver can recognize an already committed matching edition and return its original outcome. It preserves authored notes, selected evidence and findings.

Original response receiving, configured provider references and retained OpenAlex editions use the same client's `receive`, `reference` and `receive-openalex` commands. Full raw-source exports retain exact original bytes, including an original UTF-8 byte-order mark.

## Review registered citation updates

Open the saved dossier and choose **Update review**. The list connects each registered source notice to the selected evidence and affected findings across the dossier's research questions. **All notices**, **Pending and follow up**, and **Reviewed** select the current list. The source-coverage section preserves the received edition's actual coverage and missing results.

Open the notice's original assertions before editing. Each assertion keeps its DOI, registered update type, source edition and original result key. **Inspect original record**, **Download original result record** and **Download original edition** open the retained source. Original HTTP captures and retained source documents keep their own source bindings and supplied provenance.

Enter the reviewer, overall decision and reason. Edit each affected evidence occurrence's selection, classification and complete note. Review every affected finding's full title, text and citation occurrences. A finding receives one explicit disposition:

| Disposition | Complete saved change |
| --- | --- |
| Unchanged | Preserve the finding's title, text and citations and record why |
| Revised | Save an actual change to its title, text or citations |
| Affected citations removed | Remove every affected citation from that finding and retain the reason |
| Follow up | Record the additional review needed and any explicit edits made now |

**Save complete review** saves that entire selection in one dossier revision. The current revision and notice fingerprint bind the decision to the reviewed source. The saved history keeps the author, reason, finding dispositions, source bindings and exact before/after changes.

The browser saves complete draft versions in IndexedDB. A refresh restores the selected draft, and **Other retained draft versions** preserves earlier branches. If another analyst edits the dossier, **Compare draft with current revision** displays the original, current and working values. Resolve the fields changed in both versions and choose **Use resolved draft on revision …**. The earlier draft remains available. **Download draft** saves the complete editable content; the page also offers that download when browser storage cannot acknowledge a write.

A submitted save retains its exact request before transmission. After an interrupted reply, **Retry original save** reopens that original result. Keep that request while reconciling its outcome, including if the dossier has since advanced. The complete [citation review operator guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/CITATION-REVIEW-OPERATOR.md) describes draft recovery, concurrent edits and saved review selection.

Use the same workflow through the installed client:

~~~sh
starforge research-client citation-updates \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research --id DOSSIER_ID \
  --status pending --limit 30

starforge research-client citation-updates \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research --id DOSSIER_ID \
  --revision RETURNED_REVISION --notice NOTICE_ID

starforge research-client citation-review \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research --id DOSSIER_ID \
  --input /srv/starforge/private/original-citation-review.json
~~~

Carry the returned revision and next offset through notice pages. The original request object contains the complete evidence changes, finding changes and disposition for every affected finding. Its exact field contract is in [citation review source and receiving](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/CITATION_REVIEW.md).

A saved review gives access to the original, reviewed and current dossier revisions. Choose the intended revision before exporting its report or portable:

~~~sh
starforge research-client export \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research --id DOSSIER_ID \
  --revision SELECTED_REVISION --format html \
  --out /srv/starforge/delivery/selected-citation-review.html
~~~

The same selection supports Markdown, JSON and compressed JSON. The report includes the citation review and its source-linked decisions. The portable contains the selected revision's complete original editions and history, so the receiving workspace reopens the same evidence, findings and saved reviews.

## Attach merchant and agent tools

Create a private host selection pointing at the existing Research listener:

~~~json
{
  "schema": "stellar-forge.research-workspaces.v1",
  "workspaces": {
    "research": {
      "label": "Research desk",
      "consoleUrlFile": "/srv/starforge/private/research-connection.json",
      "directory": "/srv/starforge/research"
    }
  }
}
~~~

Save that object as a private regular file and initialize the merchant:

~~~sh
starforge merchant-mcp init-research-workspaces \
  --dir /srv/starforge/research-merchant \
  --connection /srv/starforge/private/research-workspaces.json

starforge merchant-mcp serve \
  --config /srv/starforge/research-merchant/merchant-mcp.json
~~~

An existing merchant may instead add `researchWorkspaceConnection` to its original configuration. The provider loads when a configured Research tool first needs it.

The Research tool family lists the declared aliases, attaches to the original listener, reads paged dossiers and findings, operates the saved Crossref and managed Pipeline lifecycles, receives reviewed Documents and source editions, and retains complete files. Tools use the returned attachment ID and original dossier, question and operation IDs. Host-declared source handles select exact private files and hashes.

The citation tools expose `merchant_research_citation_updates`, `merchant_research_citation_update` and `merchant_research_citation_review`. They use this same attachment and the reviewed dossier revision. The ordinary `merchant_research_export` accepts the selected revision for complete reports and portable dossiers.

The Documents tools expose list, review, elements and receive. The Pipelines tools expose list, prepare, operation, submit, refresh, cancel, provider jobs, reconcile, retain, review, elements and receive. A Pipeline preparation selects `pipeline-input` handles from this same private configuration. Declare each original file path, reviewed hash and optional filename/media type under `sources`, then pass those source names as `inputSources`.

Use `merchant_research_export` for `document-file`, `document-response`, `document-edition`, `pipeline-input`, `pipeline-output`, `pipeline-received-output` and `pipeline-edition`. The existing export ledger and resumable file reader preserve the original file identity across detach/restart; the [complete contract](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/RESEARCH_DOCUMENTS.md#merchant-agents) gives each selection.

The client rereads the original connection file after a managed restart. Its authenticated workspace and instance checks bind each request to the selected original application. Detaching drains the attachment's requests and temporary file readers; Applications continues to own the listener and saved acquisition.

## Build the analytical workbook from a received document

The same installed source also supplies the Python Research client and its complete document-to-workbook receiver. A reviewed original Document or Pipeline edition becomes one native Analysis source with every original occurrence, full text and provider metadata, source files and retained identity. The original Analysis engine then performs mapping preview/import, immutable version activation, saved query, complete typed exports, workbook delivery and full workspace restoration.

Install the existing buyer Python package with its `workbooks` extra from the same release, as described in the [receiving guide](RECEIVING.md#8-receive-the-complete-python-analysis-and-workbook). The Python runtime requires version 3.11 or newer; its original workbook dependency is `openpyxl==3.1.5`.

For a reviewed exported edition, run the original customer receiver:

~~~sh
python3 /absolute/installed-source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/examples/research_document_workbook.py \
  --checkout /absolute/installed-source \
  --directory /srv/starforge/customer/document-analysis \
  prepare --edition /srv/starforge/delivery/received-edition.json \
  --file-sha256 RETURNED_EDITION_FILE_SHA256 \
  --edition-sha256 REVIEWED_NATIVE_EDITION_SHA256
~~~

Review the original mapping preview, complete source, row count and warnings. Then use its actual preview digest:

~~~sh
python3 /absolute/installed-source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/examples/research_document_workbook.py \
  --checkout /absolute/installed-source \
  --directory /srv/starforge/customer/document-analysis \
  finish --preview-sha256 RETURNED_NATIVE_PREVIEW_SHA256
~~~

The complete receiver keeps eighteen source columns, one row per original occurrence and the full underlying original files. JSONL, CSV and SQLite exports contain the complete selected text and metadata. The workbook indexes every occurrence with an explicitly labeled safe text preview; the full text stays in the typed exports and source archive.

The delivered workspace archive includes the original database, sources, query and workbook. Reopen the same retained customer operation with the receiver's `reopen` command. Its cold reader verifies the original workspace, immutable table rows, saved query, workbook and every registered source file.

The [complete Python Research/Analysis contract](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/RESEARCH_DOCUMENTS.md) covers live Document/Pipeline control, retained request recovery, original-file source reconstruction, all delivered paths and full archive receiving.

## Deliver and reopen complete work

Export both an editable portable and the readable report:

~~~sh
starforge research-client export \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research \
  --id DOSSIER_ID --format json.gz \
  --out /srv/starforge/delivery/research.research.json.gz

starforge research-client export \
  --connection-file /srv/starforge/private/research-connection.json \
  --directory /srv/starforge/research \
  --id DOSSIER_ID --format html \
  --out /srv/starforge/delivery/research.html
~~~

Choose a new output path for each delivery. The client publishes a file after the complete stream is retained and returns its actual byte count, SHA-256 and dossier revision. The portable contains the saved revision history, editions, selections and findings. Source-edition, Crossref-edition and comparison exports are available through their dedicated commands.

On the receiving workspace, use its actual connection file and directory:

~~~sh
starforge research-client reopen \
  --connection-file /srv/starforge/private/receiving-research-connection.json \
  --directory /srv/starforge/receiving-research \
  --source-file /srv/starforge/delivery/research.research.json.gz \
  --sha256 EXPORTED_SHA256
~~~

The original streaming importer validates the selected bytes and retained history before committing the received case. Reopening an exact delivery is distinct from extending its history or receiving an incompatible branch.

Merchant exports use the same complete sources. `merchant_research_exports` lists durable receipts; `merchant_research_file_read` returns resumable chunks for a selected export identity. Carry the returned offset, verify the complete decoded byte count and SHA-256, and release the temporary reader when finished. The retained delivery remains available after detachment.

## Operating source

- [Citation update review, complete browser drafts and selected reports](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/CITATION-REVIEW-OPERATOR.md)
- [Retained original Crossref documents and complete edition creation](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/CROSSREF_DOCUMENTS.md)
- [Python document analysis, complete typed exports, workbook and workspace archive](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/RESEARCH_DOCUMENTS.md)
- [Selected-product installation, Applications and complete receiving](RECEIVING.md)
- [Original Documents and managed Pipelines client, CLI and merchant workflow](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/RESEARCH_DOCUMENTS.md)
- [Original source bundles, file manifests and atomic receiving](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/SOURCE_BUNDLES.md)
- [ClinicalTrials cohort receiving and complete merchant exports](../../stellar-forge/mcp-merchant-operator/RESEARCH_CLINICALTRIALS.md)
- [Complete Research client, SDK and merchant contract](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/RESEARCH_CLIENT.md)
- [Research workspace and configured sources](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/README.md)
- [Crossref review, acquisition and recovery](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/CROSSREF.md)
- [Original saved-case operating journey](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/examples/README.md)

Keep operating directories, source credentials and private startup records outside the source checkout. Retain the complete original case and delivery together through the customer's receiving handover.
