# Property continuity workspace

A local staff application for a qualified or appointed implementation partner: original source editions, explicitly reviewed mappings, independently acquired target returns, complete reconciliation, two rehearsals, cutover and receiving.

Read **OPERATING.md** for installation and commands, **public/guide.html** for staff operations, and **CONTINUITY_DOMAIN.md** for the exact data and decision contract. The application uses Python 3.11 or later and its standard library.

The public IDA request to participate is retained in sources/IDA_PMS_RTP_Extracted_Text.json as complete extracted text with original page and line references. This file is an extraction, not the original PDF binary. The live qualification stage closed on 25 September 2026. Platform field contracts, permissions, customer exports, original load observations and independently acquired target returns are selected inputs.

The application records local review and receiving. It does not connect to production tenants or execute financial postings, signatures, migration loads, or spatial edits.

## Launch

From the complete source directory:

```sh
python3 -m bluewave.cli create --workspace /absolute/workspace --id ORIGINAL-UUID --title "Property continuity"
python3 -m bluewave.cli serve --workspace /absolute/workspace --source-root /absolute/source
```

Replace ORIGINAL-UUID with one fixed canonical UUID before the first command. Reuse that same identifier and workspace on continuation. Open the returned private loopback link; keep its token private.

The source-selection.json file binds the complete shipped application. Export and receive preserve all original source bytes, command inputs, first results, saved revisions, publications and application source.

## Working bounds

Each file is limited to 64 MiB; a workspace retains up to 256 MiB of distinct original source/evidence bytes. Each dataset is an explicit complete cohort of at most 25,000 rows; a reconciliation accepts at most 100,000 source plus target rows. A larger customer estate requires agreed cohort boundaries and complete relationship coverage. Capacity failures are explicit and no rows are silently discarded.

## Software exercise and customer receiving

Read **TRAINING.md** to generate and operate the clearly labelled authored training case through this same application. Its records and platform returns are training fixtures; they do not establish a customer migration or tenant acceptance. **RECEIVING_PROGRAMME.md** describes the complete original-input programme for both the labelled exercise and a separately authorized customer commissioning course.

## Current validation

The application sources are assembled from the reviewed store, original-history receiver and domain contracts. Actual customer source intake and end-to-end commissioned runs require the supplied original input files and their actual independent target/load evidence. See the delivery record for the exact source review and execution status.
