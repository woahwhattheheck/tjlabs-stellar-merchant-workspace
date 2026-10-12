# Research handover and complete reader return

Prepare an editable reading package from the existing research desk. The package keeps the original research question, its actual saved revision, the selected build, exact selected byte ranges, current source annotations and the complete original source files. The receiving operation opens the original resource collection and creates the existing Python reading project.

The researcher and reader use their existing applications. The research desk searches whole files with its own AND/OR rules. The reading workspace keeps its own passage and phrase search. A captured research selection stays tied to the first engine and its exact original ranges throughout editing, reporting and return.

## Prepare in the research desk

Open the existing private library:

    node resource-library/content-search/cli.mjs serve --state /absolute/private/library

Run a research question. Under **Prepare an editable reading handover**, name the handover and enter the reader introduction. Choose complete matching passages, the exact displayed excerpts, or explicitly selected passages. Individual matching passages have checkboxes for the complete passage and the displayed excerpt.

Select a saved-search revision when that saved question is the one being used. The preview checks the original record and retains the complete selected revision. A later edit of that search does not change a prepared handover.

**Review complete selection** traverses every matching file and every selected passage in the pinned build. The preview shows the full counts and a short sample. Preparation never silently limits a selection to the current browser page. A selection can contain up to 10,000 passages; refine a larger question or make explicit choices.

Enter a collection identifier and its current revision, then choose **Prepare complete ZIP**. A new collection starts at revision zero. The existing collection writer checks each original resource SHA and annotation revision before saving. The package includes the exact resulting collection revision and its unchanged native TAR archive.

Python 3.11 or newer is needed to write the complete ZIP. The sender uses the existing source Python package without another installation. Set STARFORGE_READING_PYTHON when the desired executable has another name. Node 22.16 or newer is needed for the original native library and research engine.

Preparation runs under the current server. Navigating away from the browser does not replace its saved request. The **Prepared handovers** list keeps the original operation and complete download. Reopen the same library and resume an interrupted operation from that list. If a changed annotation or collection revision requires a new selection, **Review a new preparation** reopens that choice after the original operation has a known outcome.

## Receive into the existing reading workspace

With this complete source checkout and the Python source on PYTHONPATH:

    export PYTHONPATH=/absolute/source-checkout/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python
    python -m stellar_forge_buyer.reading_exchange_cli inspect reading-handover.zip
    python -m stellar_forge_buyer.reading_exchange_cli receive reading-handover.zip ./received --checkout /absolute/source-checkout
    python -m stellar_forge_buyer.reading_cli serve ./received/project

The first receiving operation needs Node for the maintained collection archive reader. It verifies the complete archive, uses the original received-collection source, receives every source file through ResourceLibrary, and creates one native reading-list revision. The project then works offline with Python and SQLite FTS5. The separate package command is also available as the installed distribution's **reading-exchange** command.

If the initial receipt is interrupted, use the same archive and destination with **--resume**. The source archive identity is fixed before extraction. A different archive cannot resume that destination. Original collection receiving and project synchronization retain their own operation receipts.

The receiving folder contains:

| Item | Purpose |
| --- | --- |
| handover.json | Complete original research capture and source/archive identities |
| sources.tar | Unchanged native collection archive |
| collection/ | Original received resource-collection source |
| library-state/ | The original native library's local state |
| project/ | The independently editable Python reading workspace |
| receipt.json | Complete local resource mapping and original receiving result |

Received collection resources have new local IDs. The receiver maps each one using the actual collection manifest, original resource ID and full original SHA. It preserves the collection ancestry and original annotations. Names and paths are display values; they do not substitute for identity.

## Read and edit

In the reading workspace, open **Export & receive** to see the original research question and its saved revision. **Open editable reading list** opens the existing list editor. Reorder the passages, change their notes and introduction, remove passages, or add new native reading passages from the source files.

Imported selections keep their exact UTF-8 byte ranges. Reading one verifies that range against the retained full original and the captured passage SHA. The stored native search ordinal is a source reference; it is not reinterpreted as a Python segment number.

A list can contain both original Python passages and imported ranges. Earlier revisions remain available through the original history writer. Report downloads pin the chosen revision. Selecting an imported range disables earlier/later segment navigation for that range; the complete original file remains available.

The existing CLI can read one selected list item:

    python -m stellar_forge_buyer.reading_cli read-selection ./received/project --list LIST_ID --revision 2 --position 1

A new Python search uses the reading workspace's own literal AND/phrase rules and diacritic folding. The original Node question remains recorded with its whole-file AND/OR, Unicode NFC case folding and accent-sensitive matching. Running a different local search creates another result; it does not revise the captured selection.

## Export a complete reader return

Choose **Complete reader return** below a saved reading list. The ZIP contains:

- The complete original editable reading project, including all retained originals, snapshots, saved searches, list revisions and handover records.
- HTML, CSV and JSON reports for the exact selected list revision.
- The byte count and SHA-256 of every included file.

The reports include all selected passages and notes. JSON and CSV retain original query/build references and exact range identities. HTML describes the original question and source reference alongside readable passages. Native Python passage line numbers count LF; imported research ranges retain the original CRLF/CR/LF convention.

The reader can create the same complete return from the CLI:

    python -m stellar_forge_buyer.reading_exchange_cli return ./received/project --list LIST_ID --revision 2 --out reading-return.zip

The author receives it with Python alone:

    python -m stellar_forge_buyer.reading_exchange_cli receive-return reading-return.zip ./returned
    python -m stellar_forge_buyer.reading_cli serve ./returned/project

Receiving rebuilds the native Python index from original files and verifies every retained list revision. It also re-renders the three selected reports from the restored project and checks them against the actual returned files. The author can continue editing that complete project and produce a later return.

## Publish the returned selection to an original source library

Connect the returned reading workspace to the existing source library at launch:

    python -m stellar_forge_buyer.reading_cli serve ./returned/project --checkout /absolute/source-checkout --library-state /absolute/private/original-library

In **Export & receive**, choose **Match captured original source identities** as the publication target. Pick the saved list and its target collection. This explicit action follows captured resource identities through the actual collection ancestry and compares the full SHA against the current original source. It uses the maintained collection writer and its current annotation revisions.

If an original source is missing, changed, or maps to more than one current resource, the publication names that source-matching problem. Restore or select the correct source library before publishing. The complete reader return remains editable and available.

Passage notes belong to the reading project. Publishing the list keeps its selected original resources and introduction in the native collection. Resource review annotations continue through the library's existing annotation editor.

CLI equivalent:

    python -m stellar_forge_buyer.reading_exchange_cli publish-return ./returned/project --list LIST_ID --revision 2 --checkout /absolute/source-checkout --library-state /absolute/private/original-library --collection reviewed-reading --expected-revision 0 --operation review-return-1

Retain the same operation ID and input when recovering an uncertain publication. The original target member/annotation selection is saved before the writer is called.

## Native Python application interface

ResourceLibrary now exposes the original research actions through its existing process and verified-file transfer:

    with ResourceLibrary(checkout=checkout, state=library_state) as library:
        build = library.research_index()
        saved = library.save_research_query(
            name="Reading question", query="resource collection",
            operation_id="question-1", mode="all")
        selection = library.capture_reading(
            name="Source reading", saved_query_id=saved["id"],
            saved_query_revision=saved["revision"], build=build["id"],
            selection_mode="excerpt")
        prepared = library.prepare_reading(
            selection["captureSha256"], collection_id="source-reading",
            expected_revision=0, operation_id="reading-delivery-1")
        file = library.download_reading_handover(
            prepared["operationId"], output_zip)

**capture_reading** is a separate reviewable step. **prepare_reading** refers to that retained capture. **download_reading_handover** uses the original chunked transfer, including complete byte checks, resumable interruption and create-only destination publication.

Use **reading_handover_status**, **reading_handover_operation**, **research_saved**, **research_search** and **iter_research_results** to reopen the original records. Full Node exports and original Python search/list methods remain available.

## Embedding the existing research server

The original contentSearchExtension includes the reading extension. It uses the same listener, authenticated routing and download tickets as the resource library. The ReadingExchangeClient wraps the maintained ResearchClient:

    const reader = new ReadingExchangeClient(new ResearchClient(host));
    const selection = await reader.capture({
      name: 'Reading handover',
      query: {q: 'resource collection', mode: 'all', build: retainedBuild},
      selectionMode: 'excerpt'
    });
    const operation = await reader.prepare({
      captureSha256: selection.captureSha256,
      collectionId: 'source-reading',
      expectedRevision: 0,
      operationId: 'reading-delivery-1'
    });

Poll **operation(id)** until COMPLETE or INTERRUPTED, then obtain the complete original download ticket. Direct embedding can use **openReadingExchange(search)** against the existing search engine; close the exchange before closing that engine.

## Source contracts and storage

The ZIP envelope uses the Python standard library with Zip64. Its two members are handover.json and sources.tar. The original collection archive format and reader remain unchanged. The reading project's portable metadata adds the **source-ranges-v1** capability and preserves immutable handover records in the existing revision store. Its original byte/index receiver handles both native and imported list selections.

Capture rows and preparation receipts are additive tables in the existing private content-search database. Prepared complete archives live under that library's private reading-handovers directory. Existing search/build rows, source stores and financial operations are untouched. Protect the retained source archives like the original resource library.

Canonical source owners: READ12 reading workspace in merchant PR 426; SEARCH12 research desk in merchant PR 437; original Python collection lifecycle in merchant PR 433. The exchange composes these existing applications and their full original writers.
