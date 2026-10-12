# Prepare and receive the complete IATI results application

The adjacent source packet preserves the complete application at commit
6b1bc913e7d2efd028a9fe77b0e84ea797a59734. It includes the original IATI/XML
workspace, DQA and publishing application, all published schema dependencies
and licenses, the Results model and interface, original JavaScript client, and
the existing Merchant source-workspace provider and retained-file reader.

| Item | Exact identity |
| --- | --- |
| Source files | 55 files; 1,091,495 UTF-8 bytes |
| Source gzip | 263,996 bytes |
| Gzip SHA256 | 7e82e0a97d0261462e86e0541c0b7f0fc1fd37d2731a5d6be831331dd0b8ae92 |
| Decoded JSON | 1,143,415 bytes |
| Decoded SHA256 | 1a300f93a44be43b70130daa47df4f5984d65811d85884a4ac2f45010bba4904 |
| Original application commit | 6b1bc913e7d2efd028a9fe77b0e84ea797a59734 |
| Packet commit | 8b006148d9cc9943ef6d7cafb4b9b7f40bbde571 |

## Install the original source

Use Python 3.11 or later and an existing Node executable with built-in fetch
and AbortSignal.any. Source preparation uses only the Python standard library.
It performs no dependency installation. The original publishing validator uses
its declared lxml dependency when that optional workflow is selected.

```sh
python3 -B prepare_source.py \
  --root /absolute/private/iati-results-receiving \
  --packet-file /absolute/complete-source-6b1bc913.json.gz \
  --node /absolute/installed/node
```

Omit --packet-file only to fetch the exact packet from the pinned public commit.
The preparer verifies the compressed envelope, decoded identity, complete file
closure, and every member before installing it. Existing identical members are
retained; different existing bytes are rejected. It parses all Python sources
and asks the original Node executable to parse each JavaScript module. The
source-preparation.json receipt records that outcome separately from a native
receiving result.

The destination must be an owned private absolute directory. The complete
application is installed beneath source/ using its original repository paths.
Do not substitute a partial Results-only module directory for this closure.

## Run the original selection and same-case browser continuation

Prepare the complete explicit receiving selection documented in RESULTS.md.
It identifies the retained XML representation by SHA256/size, names exact
source-bound indicator/value records, and retains the reviewer's interpretation.
Source preparation does not invent that selection or download publisher data.

```sh
python3 -B prepare_source.py \
  --root /absolute/private/iati-results-receiving \
  --packet-file /absolute/complete-source-6b1bc913.json.gz \
  --receiving-config /absolute/private/receiving-selection.json \
  --node /absolute/installed/node \
  --playwright /absolute/installed/playwright/entry.mjs \
  --chromium /absolute/installed/chromium \
  --reviewer "Your named local reviewer" \
  --review-note "Your explicit basis for these original source records"
```

The same foreground process prepares the source, runs the original native
receiving programme, and then opens its existing receiver through the original
authenticated console. The console, browser, client and Merchant consumer are
co-located. No second project is seeded by the browser continuation.

Leave the four browser/review options absent for native receiving alone.
Select an actual installed Playwright module entry and compatible Chromium
executable when using the browser; the preparer creates no replacement runtime.

Keep the same receiving selection and root after an interrupted reply.
The original programme reconciles its original operation keys, immutable
editions and receiving receipts. Do not select a new root just to replay a
committed review. An expired execution context may require restoring the
complete exported project on a new host; a missing transient directory by
itself does not establish that an original command never ran.

The source package is reusable engineering source. The actual receiving
result, final editable project, report ZIP and browser output are separate
deliverables and are complete only when their original programmes report and
verify them. Private console URLs, runtime selections and tokens stay outside
the customer project exports.
