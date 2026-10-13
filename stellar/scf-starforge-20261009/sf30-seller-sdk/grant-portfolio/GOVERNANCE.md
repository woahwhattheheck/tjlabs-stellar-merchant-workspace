# Programme governance and evaluation

This operating workflow adds steering committees, meetings, decisions, evaluations, findings, management responses and follow-through to the existing Grant Portfolio. It uses the same saved portfolio, source editions, documents, financial ledger, programme records, request journal and portable archive.

## Open the original programme

Start the maintained console through the existing application or Python CLI, open its private connection link, then select a saved portfolio and revision. Programme delivery holds the original portfolio/project hierarchy, partners, grants, plans, indicators, risks, issues and documents. Governance and evaluation adds seven linked review registers over those records.

Select the current portfolio revision to edit. Historical selections are complete read-only editions. Source, record, history and publication downloads retain the selected revision and SHA-256 identities. A current programme refresh does not rewrite a previously recorded review.

No committee, evaluator, decision, policy, quorum or financial authority is inferred. Use the actual programme's agreed governance terms and supplied source records. A recorded row records supplied review evidence and attribution; it does not execute an external approval, close a native issue, change a milestone or post a corporate transaction.

## The seven registers

| Register | What the operator supplies | Original relationship |
| --- | --- | --- |
| Committees | Terms, named members and their roles/organisations, accountable owner, review cadence and next review date | Programme/project and optional grant |
| Meetings | Annual, ordinary, closure or special meeting, actual date, chair, attendees, agenda, minutes and next review date | Selected committee |
| Decisions | Topic, decision, rationale, responsible person, outcome and due date or explanation | Selected meeting; original issues and milestones |
| Evaluations | Midterm, terminal, thematic or other evaluation; terms or report; commissioners, evaluators, questions, methodology, limitations and supplied summary | Programme/project and optional grant |
| Findings | Exact selected evaluation question, finding, recommendation, priority, owner and due date | Selected evaluation |
| Management responses | Respondent, accepted/partially accepted/rejected/deferred outcome, written response and action plan | Selected finding; original issues and milestones |
| Follow-through | Actual reviewer/date, open/in-progress/complete/not-required/deferred outcome, progress and verification | Exactly one selected decision or management response |

Every row also has title, accountable owner, notes, selected original source references, evidence documents, status and recording date. Optional evaluation period dates must be supplied together or both left absent. An absent evaluation interval uses its actual recording cutoff when freezing the original position; it does not create an invented reporting period.

## Draft, record and following edition

Choose a register and New, or open a retained draft. The editor exposes fields from the actual backend schema. Record selectors search the complete saved register; source selectors page through the original entities. Committee members use complete name, role, organisation and notes rows. Lists and long narrative fields are retained in full.

A draft can be revised under its exact record revision. Its complete editor fields are retained in the browser for that workspace/portfolio. Closing or pressing Escape requires an explicit choice when fields are dirty. Reopen working draft restores those fields. If the portfolio has advanced, Review working draft against current revision shows the original values and actual current record; only an explicit reviewed replacement selects the new revision.

Recording requires actual source/document evidence or explanatory contemporaneous notes. It also validates the record's substantive content: committee terms/members; meeting minutes/attendees; decision rationale; evaluator/questions/method; report date/summary; finding/recommendation; response/action ownership; and completion verification. Parent records must already be recorded, including when an unordered same-save batch supplies several dependent records.

Recorded editions are immutable. Create following edition allocates a new record ID, retains the original through supersedesId, and starts a new draft. A following edition keeps the original collection, scope and parent relationship. Only one recorded successor may supersede a given original. Supersession and dependency cycles are rejected.

Archive applies only to working drafts and retains actor/reason/history. It is not a deletion of recorded evidence. Archived drafts remain available with Include archived drafts.

## What a recorded review freezes

The publication binds the exact portfolio and programme revisions, original request/context and record fields. It reuses the programme's scoped position calculation and its original decimal/source meanings. It retains the complete contributing programme records, exact entity references and source binding state, selected document object identities, and the original dependent governance editions.

Evidence documents remain the actual original bytes. The archive closure includes historical document objects from prior programme and governance publications, even after later editing. Dependencies carry the original record and publication SHA; their complete historical publications remain in the retained model. A publication never substitutes the latest current issue or milestone for the edition that was actually reviewed.

Open a record to inspect its complete record, change history, request identities, frozen position, evidence and dependencies. Download selected record is a review exchange; Download complete review/history includes the whole returned reader bodies. Use Complete portable handoff for all source files, revisions and document bytes.

The follow-through queue presents supplied outcomes, accountable owners and dates. It distinguishes management responses and subsequent review entries from the status of the linked original programme issue/milestone. A verification row does not automatically mutate those programme records.

## Import actual committee and evaluator files

Import original CSV/JSON opens the shared source desk. Select the complete original file, exact register, scope, actor, CSV headings or JSON array pointer, stable original row key and explicit field mappings. Each original key is assigned a new ID, an actual saved draft to update, or a recorded predecessor for a following edition.

The complete plan retains original bytes/SHA, every source row, chosen record identity, all prior fields and the original portfolio revision. It also creates one evidence document through the unchanged programme document contract. The original document and all governance changes use one portfolio.save transaction.

Prepare and inspect the whole plan before submitting. Pending or completed plans retain their original identity and fields. Resume resolves the original request and historical portfolio rather than generating a replacement. Full working-file download includes the original file encoding, mappings, stable IDs and plan. CSV/JSON register export contains complete selected records; spreadsheet-safe CSV is a presentation option, while JSON preserves structured original values.

See GOVERNANCE_EXCHANGE.md for complete mapping, browser working-file, Node, plan recovery and export contracts. The original source parsers are reused: awards CSV and the maintained exact JSON parser.

## Original save and replay

There is one business writer: portfolio.save. The optional governance field composes with original programme changes, source selection, awards and review fields. A save includes the original portfolio ID/revision, governance revision, recorder and collection changes. It may create evidence documents in the same programme change set.

Each collection change selects collection, original ID, expected record revision and complete fields. Draft updates are explicit; recorded changes require a new ID plus predecessor. Archived draft requests retain their original ID/revision and reason.

The existing workspace request journal admits/replays the original operation before portfolio CAS. A retry must retain the entire original action and operation ID. The browser saves this complete request before dispatch. Continue original saved request reads or resumes that identity. A failed original outcome remains inspectable and exportable before the operator chooses a separately reviewed successor. Uncertainty is not a successful save and never creates an automatic replacement identity.

The governance definition is included in the same SQLite portfolio transaction. Portable receiving rebuilds every historical original request and compares the exact portfolio and derived tables. Portfolios created before governance retain their absent field and original snapshots.

## Exact readers and typed clients

The original client gains governanceSchema(), governanceRecord(), governanceHistory(), governanceReview() and governancePosition(). The latter four require an exact portfolioId and revision. Record/history/review also require collection and id; position selects nodeId and optional grantId. Responses retain portfolio snapshot and governance revision.

HTTP routes are /api/governance/schema, /record, /history, /review and /position. They use the console's original host/origin/bearer boundary. Table readers include governance_committees, governance_meetings, governance_decisions, governance_evaluations, governance_findings, governance_responses, governance_followups and governance_follow_through.

The Python CLI has a governance subcommand for those exact readers. Writes still use the existing action command or typed client action(). Node helpers in governance-client.mjs and their complete types provide revision-bound batch and save helpers. They borrow the existing authenticated client; they do not own another server or database.

## Donor statements in the same programme

The joined donor-reporting designer is part of Programme delivery's existing reports. It selects exact original date fields, currency, measure and dimensions; reconciles complete original rows; preserves indicators, narratives and evidence; and freezes submitted/corrected report editions. Governance can cite those complete report editions as evidence.

See DONOR_REPORTING.md for the complete designer, period limitations, explicit financial basis, original-row exports, typed read/export helper and native readable export. An original report without the later optional donor selection retains its original absent field during historical replay. Separate currencies or measures are not silently combined.

## Customer handover and receiving

The existing complete portfolio ZIP is the authoritative editable exchange: original source packets, evidence bytes, full programme/governance history and retained requests. Receive it into the actual original customer workspace, inspect the selected revision, make the actual reviewed customer edit and export the resulting whole archive. Replaying the original older receive must preserve later customer revisions.

examples/governance/governance-receiving.mjs performs this complete original-case journey through three existing owned consoles. It requires the actual archive, its length/SHA, exact portfolio selection, full reviewed producer actions and actual recipient action. It refuses to claim the whole seven-register journey if any register lacks a recorded edition. It captures all complete readers, original documents, both archives and independent return history.

No customer governance input was available when this source edition was composed. The source-ready programme is not evidence of an actual customer save, meeting, evaluation, approval or native receiving. The existing original case/native owner supplies and selects its actual input before execution. See examples/governance/GOVERNANCE_RECEIVING.md.

## Limits and operating decisions

The model retains up to 50,000 governance records and a bounded complete definition. The existing action/body, source packet and document limits still apply; the source importer separately bounds its complete intake and plan. Large archives use the maintained streaming uploader/downloader.

Configure cadence, terms, responsible people, review questions, due dates, evidence and clearance rules from the original programme. The model validates explicit record structure and custody; it does not invent an evaluation score, statutory obligation, tax rule, quorum or decision authority. Customer roles and production authorization remain in the existing staff/native deployment.

The source manifest declares every required module, parser, UI, guide and receiving leaf. Full application export uses that selected source closure. This contribution adds no external credentials, customer email, native job, paid CI dispatch or second source acquisition.
