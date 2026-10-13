# Original Zurich workbook presentation continuation

This command opens the complete customer workspace produced by the original Liip programme and builds a readable successor through the maintained Analysis Workbooks engine. It preserves the original report, both immutable workbook definitions, all 8,210 original observations and the original delivered workbook.

The original editable workbook was opened through Adobe's spreadsheet and PDF renditions. Its first data sheet showed clipped identifiers and crowded values. The successor uses bounded widths based on actual typed rows, wrapped cells, repeated print headings and a Readme opening sheet. Daily requests and resource comparison precede the complete source observations. Values and original projections remain unchanged.

## Inputs and installed runtime

Use the existing Linux host with Python 3.11 or newer and openpyxl. No dependency installation or hosted Actions run is part of this command.

The input is the complete original customer workspace:

- File: Zurich_Customer_Workspace.zip.
- Bytes: 5,166,994.
- SHA-256: 8023daaa5f2d8f9fb40a55bf222dadcff20da9d3ed4aa944fa7677b259e4243f.
- Original workspace: 6118448bd4ef45acb85835c06790e37b.
- Original workbook: 0320865c3c7452a5b88e7bb5a4a02155.
- Original operation: LIIP-CKAN-WORKSHARE-814B-20261013.

The receiver verifies the existing 365-file source packet, selects its complete 47-file Python component and composes the exact engine and successor programme from commit eceae7e36e212940c56cf22da386a5badc9d0dce. The resulting 48 source files are retained privately with their exact Git identities. The source packet and both overrides can be supplied locally when the receiving host has no public HTTP access.

## Run the whole original continuation

```sh
python run-native.py \
  --archive /srv/liip/customer-delivery/Zurich_Customer_Workspace.zip \
  --work-directory /srv/liip/workbook-readable-continuation \
  --python /usr/local/bin/python3
```

The work directory's parent must already exist. Keep the same work directory when continuing. An exclusive native lock admits one controller; the existing Analysis workspace remains the owner of its jobs and revisions.

For an already transferred source cohort, add:

```sh
  --source-packet /srv/liip/source-packet.json \
  --successor-source /srv/liip/selected-repository
```

The second path contains the two exact repository-relative engine and example paths recorded in run-native.py. No missing module is replaced by a stub.

The controller creates a private temporary directory, invokes the entire maintained workbook programme in its own process group and waits for its actual completion. An interrupted controller terminates and reaps that child before returning. Interrupted source/file receiving stages complete bytes before admission and reuses matching final files. A differing retained file remains intact and the command reports the mismatch.

A terminal failed workbook build can be continued explicitly with --retry-workbook. This selects a saved child build attempt while retaining the failed parent and original pinned definition. A running or completed accepted build continues through its own identity.

## Complete customer result

The delivery directory contains:

| File | Use |
| --- | --- |
| Zurich_Portal_Use_Workbook.xlsx | Editable workbook opening on Readme, followed by Daily requests, Resource comparison, Source observations and Sources |
| Zurich_Workbook_Complete_Handoff.zip | Complete native workbook delivery and its original manifest |
| Zurich_Customer_Workspace.zip | Complete customer workspace with the original and successor workbook histories |
| workbook-presentation-programme.json | Original identities, complete row comparison, received archive and cold reopening outcome |

The programme compares all cells in the original three data sheets against the successor, checks the complete 8,210 observation rows, receives the complete workbook handoff, exports the complete customer workspace and cold-reopens both workbook revisions and the untouched report. It does not edit completed original output in place.

The final state is COMPLETE only after this entire native course. Its renderedInspection value remains awaiting-producing-peer-view until the producing peer actually opens and looks at the new output. This command is an engineering continuation; existing company correspondence and the original sender remain with their current owner.

## View the outgoing edition

Open the exact new XLSX as a recipient would. View all five tabs at ordinary zoom, their first and populated later rows, long identifiers/names, wrapped headers and values, filters, frozen panes and print headings. Check the opening Readme and source context. Open the received handoff and the workbook in the cold-received workspace as well.

If converting to PDF, view the actual converted pages and inspect their page breaks and legibility. Rendering, file hashes, source review and successful native checks do not replace looking at the actual output. Preserve the existing delivered links until the successor is usable and its visible defects are repaired. Save the complete new artifacts and retain their exact identities with the original internal C271/Liip handover.

Current owner guidance requires plain industrial presentation, readable tables and hierarchy, useful populated/empty/error states and actual recipient use of every outgoing attachment. View the images you capture. This adds no approval queue or broad test suite. Existing source, company and native execution ownership stays in force.
