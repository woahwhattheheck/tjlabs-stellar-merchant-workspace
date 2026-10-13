# Python Study Flow operating guide

Use the installed **stellar-forge-buyer** package and the existing **stellar-forge-research** command to operate the original Research dossier. This interface forwards to ResearchWorkspaceClient.studyFlow*. The original Study Flow model owns source selection, report/study membership, counts, equations, review history and export rendering.

## Installation and connection

The maintained Python package includes **ResearchStudyFlow**, available directly or through **workspace.study_flow(dossier_id)**. No additional Python dependency is required. The existing Research console must already be running, and the checkout supplied to Python must include its original Node runtime and updated python/research-bridge.mjs. A Python wheel alone does not contain the complete Node application.

Use the original private Research connection file, with schema stellar-forge.research-workspace-connection.v1, mode RESEARCH_DOSSIER_WORKSPACE, original authenticated URL, workspaceId and instanceId. Keep that file out of shared exports. The **directory** argument is Python's private client request journal; it is not the server's dossier-store directory.

~~~python
from stellar_forge_buyer import ResearchWorkspace, ResearchStudyFlow

with ResearchWorkspace(
    checkout="/opt/merchant/source",
    connection_file="/private/research-connection.json",
    directory="/private/research-python-client",
    node="/opt/node/bin/node",
) as workspace:
    flow = workspace.study_flow("d_original_dossier")
    overview = flow.read()
    revision = overview["dossier"]["revision"]
    saved = overview["flows"]
~~~

Use the actual retained dossier, flow and edition IDs. The Python client creates no replacement evidence identities and acquires no sources.

## Read and page one source revision

**read** returns the original dossier identity, section, items, offset, total and nextOffset. Sections are overview, flows, editions, records, reports, studies, counts, issues and operations. The overview also contains original flow/edition summaries. **sources** pages original occurrences and exposes original question/review/work-set selectors.

~~~python
with ResearchWorkspace(
    checkout=checkout, connection_file=connection, directory=client_directory
) as workspace:
    flow = workspace.study_flow(dossier_id)
    overview = flow.read()
    revision = overview["dossier"]["revision"]
    occurrences = list(flow.iter_sources(
        revision=revision, question_id=question_id, limit=100))
    records = list(flow.iter_records(
        revision=revision, flow_id=flow_id, edition_id=edition_id,
        section="records", limit=100))
    result = flow.report(
        revision=revision, flow_id=flow_id, edition_id=edition_id)
    report, svg = result["report"], result["svg"]
~~~

For large datasets, consume the iterators incrementally. The first returned revision is pinned automatically when an iterator starts without one; later pages validate dossier identity, revision, section, total and cursor continuity. Manual reads with a nonzero offset require an explicit revision. The native maximum is 100 rows per page.

Unknown values remain Python None. Bibliographic records, reports and explicitly grouped studies remain separate. **mathematicallyConsistent** does not imply **reportingComplete**. The original report supplies unknown counts, warnings, provenance and previous-report membership. Preserve those distinctions when preparing a customer report.

## Import counts and preview a complete definition

The count importer consumes the original UTF-8 CSV. It reads bytes directly, decodes strict UTF-8 and preserves a BOM, CRLF, quotes and blank cells. It avoids universal-newline conversion and utf-8-sig. The original parser validates metrics and integer counts, retains the complete source body and computes its original byte hash.

~~~python
parsed = flow.import_counts_file(
    "/inputs/review-counts.csv",
    expected_revision=revision,
    reason="Reconcile the retained review log with its exported counts.",
    reference="Original review export retained with this dossier.",
)
preview = flow.preview(
    complete_definition,
    expected_revision=revision,
    flow_id=flow_id,
    source_mode="retained",
    basis_edition_id=edition_id,
)
~~~

Both are native read-only POSTs; they save no revision. Preview checks the current dossier head and refuses a stale expected revision. **source_mode="current"** selects current sources when saved. **"retained"** reuses an existing flow edition's source basis, preserving its exact selector constraints. Historical source selection does not relax optimistic concurrency.

Use the complete definition returned by the native report or authored in the existing operator. Review imported counts and their evidence references before incorporating them into that definition. The Python interface does not automatically merge counts or invent a review rationale.

## Save, review and withdraw through one original request

**review(request)** accepts the exact native envelope. Preserve the request ID, actor, expected revision, selected flow and all data when recovering an interrupted call.

~~~python
request = {
    "requestId": "flow_revision_20261013_001",
    "expectedRevision": revision,
    "actor": {"id": "actual-reviewer", "name": "Actual reviewer"},
    "action": "save",
    "flowId": flow_id,
    "data": {
        "definition": complete_definition,
        "sourceMode": "retained",
        "basisEditionId": edition_id,
        "supersedes": current_edition_id,
        "reason": "Explain the actual change and retained source selection.",
    },
}
saved = flow.review(request)
new_edition_id = saved["operation"]["result"]["edition"]["id"]
new_revision = saved["dossier"]["revision"]
~~~

For a new flow, omit flowId, use sourceMode current, and set supersedes to null. For an existing flow, supersedes must be its actual current edition, even when the retained source basis is older.

A review or withdrawal uses the same envelope with action "review" or "withdraw", the existing flowId, and data containing editionId and reason. The original engine validates the current edition and its equations before review. Withdrawal preserves the edition and history.

When retaining an imported file with a save, use the original data.importFile shape: filename, contentType and unchanged UTF-8 body. The importer response wrapper is not that file shape.

The existing client writes its full request journal before the native mutation and binds it to the server workspace and original inputs:

~~~python
record = flow.saved_request("flow_revision_20261013_001")
recovered = flow.recover("flow_revision_20261013_001")
# Or submit the unchanged original request:
same_result = flow.review(request, resume=True)
~~~

A changed body with the same request ID is rejected. A stale revision is not automatically rebased. Read actual current history before authoring a new request for an intended new edit. A timeout may follow a committed mutation; recover the saved original request before generating another ID. Native error codes, outcomeUnknown and recovery metadata remain available through ResearchError.

## Complete reports, CSVs and portable history

~~~python
delivery = flow.export(
    "/deliveries/review-flow.svg",
    revision=revision, flow_id=flow_id, edition_id=edition_id, format="svg",
)
with delivery.open() as original:
    original_svg_bytes = original.read()

counts = flow.export(
    "/deliveries/review-counts.csv", revision=revision,
    edition_id=edition_id, format="csv", section="counts",
)
portable = flow.export_portable(
    "/deliveries/workspace.research.json", revision=revision, format="json",
)
~~~

JSON, SVG and HTML are complete original exports. CSV supports counts, records, reports, studies, reasons and issues; section applies only to CSV. The original downloader publishes the file and verifies all bytes. FileDelivery retains actual bytes, SHA-256 and content type. Supply expected_sha256 when comparing an already retained original. An existing matching destination can be reopened without downloading again.

The portable archive includes original revisions, sources and Study Flow events. Attach a separate Python client to the intended existing receiving console and call its original **reopen_dossier** with the actual portable hash and stable request ID. The original engine performs identity/history checks. This module adds no portable format or initializer. Inspect the returned dossier and selected revision through the same Study Flow API.

Read, preview, review and export methods accept an optional threading.Event as cancel_event. Cancellation and client closure use the original owned Node-process lifecycle. An interrupted mutation still uses the request recovery above.

## Existing terminal entry point

All connection and client-state flags precede the subcommand:

~~~bash
stellar-forge-research --checkout /opt/merchant/source \
  --connection /private/research-connection.json \
  --directory /private/research-python-client \
  flow-view --dossier d_original --section flows

stellar-forge-research --checkout /opt/merchant/source \
  --connection /private/research-connection.json \
  --directory /private/research-python-client \
  flow-sources --dossier d_original --revision 15 --offset 0 --limit 100

stellar-forge-research --checkout /opt/merchant/source \
  --connection /private/research-connection.json \
  --directory /private/research-python-client \
  flow-import-counts --dossier d_original --expected-revision 15 \
  --reason "Retained review export" /inputs/counts.csv

stellar-forge-research --checkout /opt/merchant/source \
  --connection /private/research-connection.json \
  --directory /private/research-python-client \
  flow-review --dossier d_original --request /private/exact-review.json

stellar-forge-research --checkout /opt/merchant/source \
  --connection /private/research-connection.json \
  --directory /private/research-python-client \
  flow-recover --dossier d_original --request-id actual_saved_request_id

stellar-forge-research --checkout /opt/merchant/source \
  --connection /private/research-connection.json \
  --directory /private/research-python-client \
  flow-export --dossier d_original --revision 15 --edition-id fe_original \
  --format csv --section reports /deliveries/reports.csv
~~~

Other commands are flow-report, flow-preview, flow-saved-request and flow-portable; --help gives all selectors. The installed executable and **python -m stellar_forge_buyer.research_cli** share the same parser, journal and error handling.

## Original receiving continuation

**python/examples/research_study_flow_receiving.py** attaches to the one already running original console. It consumes the existing result.json, original counts file and selected dossier from the completed Study Flow operation. It creates no dossier, acquires no evidence, starts no browser and launches no producer.

It reads the complete original source and selected flow pages, previews the retained definition, parses unchanged counts, replays only an already-recorded review request, downloads the twelve original reports and original portable with expected hashes, then reconnects to the same console and recovers that saved request. Its resumable output binds the actual workspace, original result bytes and selected revision.

Coordinate this consumer with the original receiver before invocation. The program's presence is not evidence of completed Python receiving. The selected browser/MCP programme remains authoritative; add this consumer to that same equipped operation when adopted.

## Source contracts

- Original model: research-dossiers/study-flow/{contracts,model,store,client,render}.mjs.
- Original transport and journal: python/research-bridge.mjs and stellar_forge_buyer/research_workspace.py.
- Python interface and terminal commands: stellar_forge_buyer/research_study_flow.py and research_study_flow_cli.py.
- Original package entry: pyproject.toml, stellar-forge-research; no dependency or entry-point changes.

Run the selected installed consumer with the original receiving owner’s live connection:

~~~bash
python3 /opt/merchant/source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/examples/research_study_flow_receiving.py \
  --checkout /opt/merchant/source --connection /private/research-connection.json \
  --directory /private/study-flow-python-client \
  --operation-directory /receiving/original-study-flow \
  --out /receiving/original-study-flow/python-receiving
~~~

The operation directory is the completed handoff’s original result.json and inputs after the original portable restore. The console must already serve that same restored dossier. The consumer locks its own output directory, preserves completed phase results, and rechecks retained output hashes on resume. It requires Python 3.11+ on the existing POSIX receiving host and the original installed package; it installs nothing.
