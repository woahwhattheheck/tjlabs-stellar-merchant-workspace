# Delaware public rebate reference — complete receiving and Analysis course

This operation turns the **one already retained DNREC public file** into a complete editable Analysis workspace, full query deliveries, three historical reports, and a workbook. It uses the maintained source-document, query, report, workbook and whole-workspace receiving APIs. It does not call a new provider acquisition, register an applicant, contact CSE, publish a catalogue, or modify an existing customer workspace.

**Source publication is prepared; native execution and visual delivery are not yet claimed.** A successful programme reports `DATA_COMPLETE` and separately leaves `visualInspection` pending. These states must remain distinct.

Operation: `CSE-DELAWARE-PUBLIC-REFERENCE-814B-20261013`. It supports the original `CSE-DELAWARE-REPORTING-WORKSHARE-814B-20261013` case, whose current source page is [the existing CSE record](https://app.notion.com/p/3f8dd7723100812282d2c465edef4195). Keep this original operation, current receiver ownership and exact source selection when continuing.

## Source and meaning

The official [DNREC public dataset](https://data.delaware.gov/Energy-and-Environment/State-Rebates-for-Alternative-Fuel-Vehicles/8z8z-di7f) contains 7,758 published rows in this retained capture. Its original request was:

```text
https://data.delaware.gov/resource/8z8z-di7f.csv?$limit=10000&$order=%3Aid
```

The CSV is exactly 927,011 bytes. Its SHA-256 is deliberately not filled in here: the complete file has been retained by the original document service, but native materialization has not yet produced a byte-verified receipt. Use those exact retained bytes. Do not issue the URL again and substitute a fresh population.

The original fields, in order, are:

```text
award_number,rebate_amount,city,state,county,zip,date_of_purchase,vehicle_type,make,model,year
```

Every original value is imported as text. ZIP and model year are not converted to numbers. CSV empty strings remain empty; the CSV representation cannot reconstruct an upstream distinction between null, missing and an empty value. The companion source metadata retains the original field types and descriptions.

The metadata records an April 21, 2026 update and declares quarterly coverage beginning in 2015. This is not a live October feed. The exact original HTTP retrieval timestamp was not returned. The source descriptor's `capturedAt` is the actual receiving event recorded in the materialization receipt; its provenance explicitly identifies this custody meaning. Neither the provider's row-update time nor a page creation time may substitute for retrieval.

`date_of_purchase` means **purchase or lease**. Its derived date, month and year are calendar selections without an assigned timezone. They are not approval dates, payment dates, model years or an agreed programme reporting year. The receiver first returns the real CSV date spellings; the operator reviews them and supplies their actual Python format. The JSON API sample's ISO date spelling is not evidence of the CSV spelling.

Rebate cents are derived with Decimal and an exact integer check. The programme performs no rounding or binary floating-point money arithmetic. The original amount text remains beside the integer cents. Early dates, repeated values and every original record remain visible.

| Scope | Rows | Exact published cents |
|---|---:|---:|
| Whole original capture | 7,758 | 1,715,465,000 |
| November 2025 purchase/lease selection | 64 | 12,050,000 |
| December 2025 purchase/lease selection | 65 | 11,950,000 |
| Calendar 2025 selection | 762 | 138,200,000 |
| All members of repeated award groups | 1,028 | 232,200,000 |
| Five source dates before 2015 | 5 | 800,000 |

There are 7,244 distinct award values and 514 repeated groups, each with two rows. These counts do not establish erroneous duplication, distinct people or unique vehicles. The programme neither halves totals nor discards rows. The entire source has 132 observed month groups and 28 vehicle/county groups; calendar 2025 has 11 observed month groups. Missing February 2025 is not proof of no programme activity.

The source lacks applicant age, dealer, approval/payment dates, survey responses and a fund ledger. Its totals cannot establish programme balances, applicant outcomes or CSE performance. The contract's monthly written operational progress, agreed programme-year annual report, survey analysis and private export reconciliation remain commissioned work on the approved existing platform.

## Complete maintained source

`source-packet.json` is the unchanged 79-file runtime cohort selected from public Merchant commit `4655211dc5feab86553a1425e71950ad8eb4d0ca`. The packet's Git blob is `58d67bf48531ab38906a9e06f736c040fd16c4b7`; its complete UTF-8 length is 1,899,340 bytes. It contains 76 maintained Python modules and three Event browser assets, preserving repository-relative paths beneath:

```text
stellar/scf-starforge-20261009/sf88-operator-buyer-cli/
```

The receiver verifies the whole packet's Git blob and every member's byte length and Git blob before admitting it. It also verifies the complete programme against its independently pinned reviewed Git blob. The packet is a complete dependency closure for the selected Analysis constructor and browser assets, not a replacement engine. It includes:

- `response_documents.py` 1b59149c2b89bad94cd22dd18ec021e91d4bcbb1 and `response_tables.py` e7912247f3e3560d18671865a9d28e4d46bcc281;
- `analysis_workspace.py` e9c1e9dffb92866b3aea43271915c93f66d30e17;
- `query_export.py` 15584d16ab5a6941624bf16c8167ea79648a5f72;
- `analysis_reports.py` c9e3fa2477e83ba0f7fff42a43e663041041eb65;
- `analysis_workbooks.py` b1ae65392dd860e4180349d7b8d3b507a288557c, including the reviewed presentation repair;
- `workspace_archive.py` f292d7fffffe20f2c04a4c32dd10c2fc16f20e29 and `workspace_archive_receive.py` ed84daf62b03db0b21827780dfbba7cb67fc4b04.

The original Analysis/Workbook owners, including 26B1 and 1FB3, retain those engines. This operation adds the source-specific recipe and receiver only. The existing Python source-selection/install components remain authoritative.

Linux with Python 3.11 or later and existing `openpyxl` is sufficient for the document/report/workbook course. The selected document route does not dispatch the unrelated Node, Event or World Bank acquisition engines. No package installation or cloud execution is hidden in the receiver. Use an existing equipped owner. The source and private temporary-build directories need adequate writable space.

## Receive the original five source files

Use the connected document service's current authorized download for the original attachments. Receive complete regular files, compute their actual byte lengths and SHA-256 values, and retain those results. No signed URL or credential belongs in this public source, the source-document descriptor or a shell argument.

| Role | Original file-upload identity | Retained bytes |
|---|---|---:|
| csv | 3f8dd772-3100-810b-9580-00b2b0725ed6 | 927,011 |
| metadata | 3f8dd772-3100-81ef-914b-00b2b0779699 | 19,720 |
| count | 3f8dd772-3100-8185-87a0-00b2e7a80378 | Original full count response |
| header | 3f8dd772-3100-8122-b486-00b29f1a652b | 117 |
| acceptance | 3f8dd772-3100-8108-a2a9-00b2dfbffefb | 107,441 |

The acceptance file carries the complete retained provider aggregate responses, URLs and source meanings. It is retained inside each source-document family, not substituted for the original CSV.

Create the actual local selection conforming to `retained-file-selection.schema.json`. Every entry requires a canonical local path, actual byte count, actual SHA-256 and stable `notion:file-upload:<original-id>` origin. Do not insert a placeholder digest. The receiver verifies the full input before keeping an exact private copy.

The receiver creates the original materialization receipt once, after those bytes are admitted. It records actual UTC time, all file hashes and stable origins, with `originalHttpCapturedAt: null`. Repeating preparation verifies and reuses this receipt; it does not invent a newer source edition or replace the timestamp.

## Run the original preparation and course

Keep `run-reference.py`, `delaware_public_reference.py`, `source-packet.json` and this guide together. The programme source URL must name the immutable published commit and exact complete programme used by the receiver. Select one original private work directory. Do not run competing receivers against it.

First receive the source and inspect actual CSV date spelling:

```bash
python run-reference.py \
  --source-packet /absolute/source/source-packet.json \
  --programme /absolute/source/delaware_public_reference.py \
  --programme-source-url "$CSE_PROGRAMME_IMMUTABLE_RAW_URL" \
  --sources /absolute/private/retained-files.json \
  --work-directory /absolute/private/cse-delaware-public-reference \
  --prepare-only
```

That preparation does not open an Analysis workspace. It returns actual row count, first and last distinct date examples, and the received CSV/receipt identities. Review the actual format before choosing `CSE_ACTUAL_CSV_DATE_FORMAT`. It must not introduce a timezone. The programme validates the complete population and exact historical period targets after parsing every row; a wrong or changed source format stops before import.

Then continue the same directory:

```bash
python run-reference.py \
  --source-packet /absolute/source/source-packet.json \
  --programme /absolute/source/delaware_public_reference.py \
  --programme-source-url "$CSE_PROGRAMME_IMMUTABLE_RAW_URL" \
  --sources /absolute/private/retained-files.json \
  --work-directory /absolute/private/cse-delaware-public-reference \
  --date-format "$CSE_ACTUAL_CSV_DATE_FORMAT"
```

The receiver stages source and outputs through private temporary files and atomic no-replace publication. Existing files are reused only when their complete bytes match. It uses the original controller lock, places workbook temporary files under its private directory, and reaps the original child process group. Credentials and provider URLs are not required during the networkless course.

The programme uses three actual retained source documents: `dnrec_public`, `dnrec_derived`, and `dnrec_dictionary`. The raw source has all eleven text fields. The derived source retains all eleven plus eight explicit fields: source row, exact cents, amount state, purchase/lease date, month, year, date state and award occurrences. The dictionary records row grain, original types/descriptions, observed lengths, undeclared allowed lengths, source absence and key/relationship limits.

Each source is fully previewed and imported by the maintained response engine, then selected through the original version/view API. Saved SQL, full exports, report definitions and workbook definitions retain those exact selected versions.

## Complete delivery

The private `course/delivery` directory contains:

- all nineteen full query deliveries, each with JSONL, CSV, SQLite and original manifest;
- complete original rows, all exact-cent/calendar rows, all repeated award members, full month inventory, full category/county groups and all exceptions;
- complete November and December row exports containing all eleven original fields and all eight derived fields;
- three editable six-section reports: November 2025, December 2025 and calendar 2025, each exported as HTML, JSON and full section CSV ZIP;
- a twelve-data-sheet workbook, plus the maintained engine's generated introductory/source sheets; the source definitions and full workbook handoff ZIP are preserved;
- an independently received workbook directory with complete verified source bindings;
- a whole Analysis workspace ZIP and a separately restored original workspace;
- saved query JSON, immutable report/workbook definitions, complete dictionary JSON/CSV, methodology and actual completion record.

CSV spreadsheet-safe escaping is the maintained export convention; exact typed cell values remain authoritative in JSONL and SQLite. The original downloaded CSV is retained unchanged inside source-document custody. Exact cents are deliberately labelled as cents, never silently formatted as another unit.

The course compares every raw and derived cell after full native export, validates the original month/annual totals, verifies every complete workbook handoff member, and cold-reopens the whole workspace. It rechecks original workspace identity, selected versions, saved SQL, complete query exports, published report/definition identities and workbook source/definition identity. It executes the full source projections again against the received database and compares every row. Before import, it also compares all 132 monthly groups, 28 vehicle/county groups, 514 repeated-award groups, all annual groups and all five original date-exception identities against the complete retained provider acceptance. API null/omitted group keys are compared to the corresponding CSV empty representation without changing stored cells.

## Continue safely after interruption

Use the same operation directory, exact input, source packet and programme. Normal repeated requests retain their original IDs and results. Interrupted response imports and whole-workspace exports use the maintained resume semantics. Failed report/query/workbook jobs remain in history.

If an actual terminal child has failed and its underlying runtime problem is resolved, the operator can explicitly add `--retry-terminal`. The programme retains the failed ID/status/error, saves one derived retry ID before dispatch, and uses the same selected source, query and definition. It never edits a job row or hides the failed attempt. A still-running job must be reconciled through its current control; do not launch another receiver.

Existing modified query heads cause a specific conflict. Completed definitions and earlier results are preserved. Same-operation source or output differences also fail explicitly; they are not overwritten. The completed course reopens the retained output inventory and returns its original result. A crash between completion and final completion-file publication can finish that exact publication on the next invocation.

The data course closes its workspace before cold receiving. Its normal and exceptional close paths retain original failures and cleanup failures. The outer receiver retains process ownership through child termination. Keep the original Liip readable-workbook/proposal operation and the two CKAN programmes separate; no controller here authorizes parallel dispatch of those existing operations.

## Producing peer must actually view the customer experience

The producing peer must run, open and literally LOOK at the exact outgoing reports, workbook and reopened operator workspace. Source review, schema validation, hashes, successful job rows and another agent's opinion do not substitute for viewing.

Open every workbook sheet at useful zoom and inspect long award identifiers, original locations, date/amount text, repeated rows, wrapped descriptions and totals. Open each actual HTML report at desktop and narrow widths; inspect all sections and every printed/exported page if a PDF rendition is provided. Use the actual operator controls and download actions. Open the downloaded full outputs and the cold-received workspace. Retain actual desktop/narrow images and useful page/sheet views with the source/result identities, then view those returned images yourself.

The normal original Analysis UI is available from the received source:

```bash
PYTHONPATH="/absolute/private/cse-delaware-public-reference/source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python" \
python -m stellar_forge_buyer.analysis_workspace \
  --database /absolute/private/cse-delaware-public-reference/course/analysis-received \
  serve --port 0 --open
```

Use the actual loopback URL and bearer fragment returned by that original server. Keep credentials private. Do not open the workspace concurrently with its producing job. Inspect the unchanged outgoing editions before making edits. If actual viewing finds a defect, preserve the original files, fix the maintained source or an explicit successor definition, rebuild through the same engine, and inspect the new result.

Record visual receiving as a separate factual result after these actions. Never change the programme's data completion into a claim of finished visual review, CSE deployment, or qualifying production history. The RFP's existing-production criteria and CSE's U.S. operating/security/IP requirements remain client commissioning inputs. This historical public reference does not establish three customers or six months of production use.

The standing producing-peer instructions are [October 13 original guidance](https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999) and [its concrete receiving continuation](https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949). Preserve current source/host owners. No GitHub Actions workflow, hosted runner, permission enablement or paid compute dispatch is part of this operation.

## Complete standing owner instruction carried into this receiving guide

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

