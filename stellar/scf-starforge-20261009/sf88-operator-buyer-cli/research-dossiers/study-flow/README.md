# Study Flow reporting

Study Flow turns the original retained Research dossier and its eligibility decisions into an editable, source-bound reporting diagram. It lives in the existing Research application: open a dossier and choose **Study flow**. The original authenticated server, application controls, source files, portable format and transaction history own the operation.

The complete operator supports a new review or an update, using databases/registers alone or all identification methods. Each saved edition retains its reporting definition, the exact original source revision and its hash, individual record decisions, report and study identities, count derivations, exclusion reasons and the author’s explanation. The SVG and HTML are generated directly from that saved report.

## Working workflow

1. Select the original question, eligibility review, work sets and retained source editions. Assign each edition’s identification method explicitly. Assign the original protocol stages to screening and full-text assessment.
2. Preview the whole selected source. Review record dispositions, duplicate targets, retrieval outcomes and the original report-to-study links.
3. Supply any externally established counts with their original reference, exact locator and reason. Blank values remain unknown. Native member IDs remain inspectable when a reported value replaces a derived count.
4. Save a named edition. Inspect the arithmetic and source notes, then record a named review or later withdraw that reviewed status.
5. Export the complete diagram/report and the original portable dossier. A later edit appends another edition; an update can retain the complete earlier report/study membership.

[OPERATING.md](OPERATING.md) covers the full browser, CLI, client, handoff and recovery sequence.

## What is counted

| Unit | Original identity | Reporting behavior |
| --- | --- | --- |
| Record | Original retained occurrence, selected by edition and original occurrence key | Duplicate and pre-screen removal decisions retain the removed occurrence and its reason. |
| Report | Original canonical report key, or an explicit reasoned operator mapping | Several records may identify one report. A source anchor resolves differing original outcomes without overwriting them. |
| Study | An explicit study group from the original eligibility review | A DOI, provider identifier or report key alone does not create a study. |
| Previous inclusion | Saved previous edition plus its retained identities and report-to-study edges | Removing a study does not silently leave its reports attached to nothing. Unresolved links remain visible until a corresponding removal or attributed membership correction is recorded. |

The report keeps full native record membership for every derived count, the source of each override and the exact earlier edition selected for an update. Counts obtained from an external reviewed source can remain usable when only part of their identities is available; identity coverage is reported separately.

## Complete source and outputs

The domain modules are [contracts.mjs](contracts.mjs) and [model.mjs](model.mjs). The latter reads the original eligibility model and does not perform a search or change an eligibility decision. [store.mjs](store.mjs) adapts the original dossier transaction; [routes.mjs](routes.mjs) is registered inside its existing HTTP listener. [client.mjs](client.mjs), [client.d.mts](client.d.mts) and [cli.mjs](cli.mjs) use the original Research connection and download writer.

[render.mjs](render.mjs) produces:

- A complete scalable SVG for the selected new/update and source-method template.
- A printable HTML report with the diagram, all counts, record/report/study tables, source references, exclusions and issues.
- The complete JSON report.
- Complete CSV sections for counts, records, reports, studies, exclusion reasons and issues.

The existing portable dossier export carries the original retained source bytes and all saved Study Flow requests, source bases, editions and review events. Import validates each retained event and replays its transition against the prior dossier revision. The reporting feature introduces no separate database, credentials, listener or job scheduler.

## CLI and client

Run `research-client study-flow-help` through the installed command or use the existing `research-dossiers remote` dispatch. The commands include source selection, definition preparation, preview, attributed CSV import, exact request preparation/commit, saved-edition inspection and full export.

The existing `ResearchWorkspaceClient` exposes `studyFlows()` and direct `studyFlow`, `studyFlowSources`, `studyFlowReport`, `previewStudyFlow`, `importStudyFlowCounts`, `reviewStudyFlow` and `exportStudyFlow` methods. They accept the original workspace connection, revision selection and cancellation signal. The typed interface lives beside the implementation.

## Reporting completeness

A saved review records a person’s review of the selected report. Reporting completeness is a separate computed result: all active counts must be established, accounting must reconcile, the declared search scope must be complete and source issues must be resolved. A partial source selection remains partial after review. This feature does not certify a review’s entire methodology.

Native full-text availability and a failed retrieval attempt are different observations. The operator must explicitly attribute a sought/not-retrieved outcome when the original source only says that full text was unavailable. Similarly, an agreement awaiting original resolution remains unresolved in this reporting view.

## Reporting references

The [PRISMA 2020 flow-diagram page](https://www.prisma-statement.org/prisma-2020-flow-diagram) supplies the four reporting variants and distinguishes identified records, assessed reports and included studies. This module implements its own SVG/HTML rendering and retains source-level details with the diagram. The [published PRISMA2020 implementation paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC8958186/) documents the associated node terminology and `data,n` CSV convention; the original paper is by Haddaway, Page, Pritchard and McGuinness, *Campbell Systematic Reviews* 18, e1230 (2022), DOI 10.1002/cl2.1230.

The published PRISMA templates and that paper are licensed under CC BY 4.0. This code remains under the repository’s MIT license; its own retained references are included in exported reports.
