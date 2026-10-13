# Operate and receive a Study Flow

## Open the original application

Open the existing Research dossier through its maintained Applications entry and choose **Study flow**. It uses that listener’s authenticated URL, workspace identity, original dossier directory and lifecycle. The tab also accepts the existing URL’s `dossier` and `view=study-flow` fragment parameters; the original host handles the session token.

The header distinguishes the current dossier revision, the working draft’s source revision and a saved edition. A preview reports the applied definition. Edited fields that have not yet been applied remain a separate retained editor draft. Provide a reporting author ID, name and reason for the next operation. These belong to the reporting event and preserve the authors of original eligibility decisions.

## Select original sources and stage meaning

Choose the actual question, eligibility review and work sets. For each work set, designate the native protocol stages that represent screening and full-text assessment. Only a stage whose original protocol explicitly requires full text can be assigned to the latter role.

Select retained source editions. The work-set helper selects their original editions without assigning an identification method. Assign each edition to database, register, website, organisation, citation searching or another method. A provider’s name alone does not establish its role in a particular search.

The selected editions, work sets, protocols, original queue decisions, explicit study groups and prior reporting edition become one frozen source basis when saved. A preview reads that source without adding a dossier revision.

Choose **Refresh from the current original dossier** when new searches or eligibility decisions belong in the next edition. **Keep the selected saved source basis** permits reporting corrections against the retained source. Editing a historical edition selects its exact basis and preserves the newer editions. Reopening or refreshing the pane retains the explicitly selected saved edition; saving an edit appends a new edition after the current one.

## Review records, retrieval and study links

### Records

The Records view contains every selected occurrence, including removed records. Search and page through the full report. Selection across pages retains explicit occurrence IDs; the bulk action applies one attributed disposition only to those IDs.

A duplicate must name a different retained candidate. Automated and other pre-screen removals require an original source basis and reason. Outside-scope decisions keep occurrences visible while removing them from this diagram’s candidates. Clearing a reporting rule restores the original assignment.

For an occurrence in several selected work sets, choose the specific work set whose outcome is reported. Explain explicit report-key mappings. The individual editor exposes original source and stage decisions and downloads the complete source edition. Apply edited decisions before preview/save; interrupted or unapplied fields remain retained.

### Retrieval and assessment

Reports group retained candidate occurrences by their original canonical key or explicit reporting mapping. If occurrences for the same report have different routes or outcomes, choose a source anchor and explain it; the conflicting observations stay inspectable.

| Outcome | Meaning |
| --- | --- |
| Not sought | No report-retrieval attempt is reported for this candidate. |
| Sought | An attempt is reported, but its outcome is incomplete. |
| Retrieved | The report was retrieved, with its recorded source basis. |
| Sought and not retrieved | An actual unsuccessful retrieval attempt is reported. |

Original full-text availability can establish retrieval when its source says so. A reviewer’s unavailable-text observation alone does not establish an attempt. Supply the actual retrieval basis for that outcome.

Exclusion labels follow the original protocol of each selected report's work set. When different protocol revisions reuse a reason ID, each report keeps the label from its own protocol. New saved flow editions use reporting version 2. Existing saved editions keep their original recorded rendering and hashes; opening an earlier edition preserves it. To produce a corrected report from those retained sources, save a new edition using the retained basis. The original project, prior editions, review history and complete portable receiving remain available.

Screening and assessment counts consume original resolved eligibility statuses. A provisional agreement stays pending until resolution in that workflow. Open original Eligibility to change eligibility; Study Flow records reporting decisions around those outcomes.

### Studies

The Study table uses explicit original study groups, their evidence and report keys. One report can describe several linked studies; one study can have several reports. Distinct included reports and studies are counted separately. A report without an explicit study link remains an unresolved coverage issue. Return to original Eligibility to establish the actual link.

## Counts and exclusions

Each active metric exposes the reported value, original derived value, known member count, unit and source. Complete derivations retain exact member IDs.

To replace a count, record a nonnegative integer, original reference, exact locator and reason. Native edition and occurrence IDs can be part of its attribution. A blank value means unknown; a known zero remains distinct. **Use the native derived count** removes the override and recalculates from the same source. Overrides retain native members.

Import a complete original UTF-8 **Study Flow metric CSV** with `data` and `n` columns. Use the application's Counts CSV or those same numeric metric IDs; the metric editor and exported count table expose every accepted ID. Each `n` cell is a nonnegative integer or blank, and full-text reason counts use their own structured editor and separate Reasons CSV. The importer retains the whole body, including a BOM, and calculates its byte length and SHA-256. Quoted headers, embedded commas, line breaks and doubled quotes are supported. Duplicate metrics, malformed quoting, invalid integers and unknown nonempty metric IDs are rejected. Empty rows and the published `NA` marker do not become counts.

Enter the source reference and reason before choosing a file. This import remains read-only until save retains both the attributed rows and original file. Each locator binds its original record number, hash and fields. The input limit is 1 MiB, with no silent row truncation.

Full-text exclusion reasons are grouped for databases/registers and other methods. Reported reason counts have the same attribution fields. Use the exact native label and route to replace one. Reasons must reconcile with excluded reports. Human/automation screening disclosures remain separate from automated removals before screening.

## Review updates

Choose an Update template and the exact previous saved edition. **Create a new update from this review** starts a new linked flow while preserving the earlier flow and history.

Prior count values retain their actual identity coverage. A partial native ID list does not replace an externally attributed prior total. Map repeated current reports or studies to prior identities with a reason.

Record omitted study IDs and report keys separately. Original report-to-study membership carries forward. A retained report without a surviving study, or a retained study without its original reports, remains explicit. Remove the omitted identity or record a source-attributed corrected membership using surviving identities; original edges and correction evidence remain available.

**Previously included reports found and included again** is an accounting aid for the current-search population, not an additional rendered diagram box. Partial earlier identity lists remain partial; attributed totals do not manufacture missing identities.

## Save, review and interruption recovery

Preview the applied definition and inspect accounting differences and source notes. Each save requires a named author and reason. It uses the original request envelope: `requestId`, `expectedRevision`, `actor`, `action`, `data`, plus `flowId` for an existing flow.

Before POST, the browser commits that exact body to workspace-scoped IndexedDB. The response is retained before parent refresh. A transport interruption keeps the request as outcome unknown; an explicit HTTP rejection remains rejected. **Recover original request** repeats the same body and identifier. If it committed, the store returns the original operation. A different payload with that ID is rejected.

When the dossier advances, the draft and request remain pinned to their original revision. Inspect current source before explicitly rebasing. A changed request requires a new identifier and leaves earlier history intact.

The full local draft includes definition edits, uncommitted record/count/retrieval fields, author, reason and imported original file. Navigating to another saved edition or creating an update preserves a historical local draft first. Storage is scoped to the immutable workspace ID and dossier ID. Recovery lists those complete drafts and exports their JSON.

Saved editions are read-only until **Edit this saved edition**. Review and withdrawal append named events. Partial reports remain visibly partial after review; mathematically inconsistent counts cannot be marked reviewed.

## Original CLI and client

Use the already running application and actual returned identifiers in the commands below. Keep its private connection file outside delivery files.

```sh
research-client study-flow-sources --connection-file /private/application-url.json --directory /original/dossier-store --id DOSSIER --question QUESTION --review REVIEW
research-client study-flow-definition --connection-file /private/application-url.json --directory /original/dossier-store --id DOSSIER --question QUESTION --review REVIEW --workset WORKSET --name "Review study flow" --template new-all-sources --out /work/definition.json
```

The generated definition uses actual source IDs. Assign identification routes, stage roles, coverage and reporting decisions in the existing pane or complete JSON. Applying full JSON invokes the native preview validator before replacing the draft.

```sh
research-client study-flow-preview --connection-file /private/application-url.json --directory /original/dossier-store --id DOSSIER --revision CURRENT_REVISION --definition /work/definition.json --out /work/preview.json
research-client study-flow-prepare --connection-file /private/application-url.json --directory /original/dossier-store --id DOSSIER --revision CURRENT_REVISION --definition /work/definition.json --actor-id AUTHOR_ID --actor-name "Reporting author" --reason "Reviewed the selected source and reporting decisions" --out /work/save-request.json
research-client study-flow-commit --connection-file /private/application-url.json --directory /original/dossier-store --id DOSSIER --input /work/save-request.json
```

Prepare creates a local file without a dossier mutation. Commit returns the actual flow, edition and operation IDs. Repeat the unchanged request file after a lost reply.

For correction, add the returned `--flow`, choose `--source-mode retained --basis-edition EDITION_ID` or current source, and prepare a fresh request at the actual revision. Review/withdraw preparation accepts `--action review` or `--action withdraw`, `--flow`, `--edition`, author and reason.

The original ResearchWorkspaceClient exposes `studyFlows()` and the same direct operations. Read calls accept a revision; later page offsets require that revision. Source/history responses include total and nextOffset. Cancellation closes only this client’s request lifetime; the original owner retains the listener.

## Complete export and receiving

Saved editions export complete SVG, HTML and JSON. CSV sections are counts, records, reports, studies, reasons and issues. They contain the complete section, not just the current browser page.

```sh
research-client study-flow-export --connection-file /private/application-url.json --directory /original/dossier-store --id DOSSIER --flow FLOW_ID --edition EDITION_ID --revision CURRENT_REVISION --format svg --file /delivery/study-flow.svg
research-client study-flow-export --connection-file /private/application-url.json --directory /original/dossier-store --id DOSSIER --flow FLOW_ID --edition EDITION_ID --revision CURRENT_REVISION --format html --file /delivery/study-flow.html
research-client study-flow-export --connection-file /private/application-url.json --directory /original/dossier-store --id DOSSIER --flow FLOW_ID --edition EDITION_ID --revision CURRENT_REVISION --format csv --section reports --file /delivery/reports.csv
research-client export --connection-file /private/application-url.json --directory /original/dossier-store --id DOSSIER --revision CURRENT_REVISION --format json.gz --out /delivery/research-dossier.json.gz
```

The original writer streams complete bytes, hashes and fsyncs them, then publishes create-only. Existing destinations are preserved. The portable contains every selected revision, retained source, original eligibility and Study Flow history.

Use the receiving application’s existing portable import, or:

```sh
research-client reopen --connection-file /private/receiving-application-url.json --directory /receiving/dossier-store --source-file /delivery/research-dossier.json.gz --sha256 ACTUAL_PORTABLE_SHA256
```

The receiver must contain the full current Study Flow source and host joins. Import validates the original portable format, source hashes and each reporting transition. Reports are reconstructed from retained bases without a new search. Open the returned dossier and same flow/edition, then export through that original interface.

Deliver the source version, selected flow/edition/revision, complete portable, SVG/HTML/JSON, relevant complete CSVs and actual file hashes. Keep connection tokens out of the handoff.

## Installed closure

The existing Research contribution includes all Study Flow domain, renderer, route/client/CLI, browser and guide files. The original installed command dispatches reporting commands and the public Research index exposes the client/model. There is no additional package dependency or Applications provider; the maintained Research setup, saved store and lifecycle remain authoritative.
