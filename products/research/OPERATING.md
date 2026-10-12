# Research questions, source review and complete delivery

Use one Research workspace for a question, its received source editions, the analyst's decisions and the final report. The browser, command line and merchant tools all operate that same saved dossier. Original source responses remain available beside the analysis, including after a source connection closes.

This product supports a complete working sequence:

1. Open the existing dossier and select its research question.
2. Review the received sources, their coverage and the saved evidence selections.
3. Bring original files and their authored findings into that question with one reviewed source bundle, or receive a retained cohort through its configured source.
4. Prepare or resume the original Crossref request for DOI metadata and update review.
5. Receive the reviewed edition and preserve the question's earlier notes, selections and findings.
6. Write the source-linked analysis, then deliver the complete report and portable dossier.
7. Reopen the exported dossier on the receiving workspace with its original history.

## Open the original workspace

Use the existing Linux and Node 22.16+ runtime described in the [product README](../../README.md). The Research client uses Node's built-in modules. Its optional source connections use their existing host configuration.

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

The Research tool family lists the declared aliases, attaches to the original listener, reads paged dossiers and findings, operates the saved Crossref lifecycle, receives reviewed sources and retains complete files. Tools use the returned attachment ID and original dossier, question and operation IDs. Host-declared source handles select exact private files and hashes.

The client rereads the original connection file after a managed restart. Its authenticated workspace and instance checks bind each request to the selected original application. Detaching drains the attachment's requests and temporary file readers; Applications continues to own the listener and saved acquisition.

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

- [Original source bundles, file manifests and atomic receiving](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/SOURCE_BUNDLES.md)
- [ClinicalTrials cohort receiving and complete merchant exports](../../stellar-forge/mcp-merchant-operator/RESEARCH_CLINICALTRIALS.md)
- [Complete Research client, SDK and merchant contract](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/RESEARCH_CLIENT.md)
- [Research workspace and configured sources](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/README.md)
- [Crossref review, acquisition and recovery](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/CROSSREF.md)
- [Original saved-case operating journey](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/examples/README.md)

Keep operating directories, source credentials and private startup records outside the source checkout. Retain the complete original case and delivery together through the customer's receiving handover.
