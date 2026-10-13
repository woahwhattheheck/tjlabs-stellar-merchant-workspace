# Prepare and receive the complete IATI application

This carrier preserves the complete source selection
`3bbeeb3cef95dd159343ec298b5595ffa4e970dd1606469ed03f5152f475d873`: original XML/IATI workspace,
DQA, publishing, organisation budgets and documents, saved publisher refresh,
Results monitoring, programme review and commissioning, financial reconciliation, and native AMP commissioning.
It composes Results author commit `7f010cbc26344f840c8b864ea59edbabec5d02d5`,
financial author commit `ae8a650025f6e9ec53275751aa36d7770d58b25f`,
the complete reviewed client/MCP/operator corrections and maintained receiving programme.
The combined selection is bound by its full inventory; an invented combined source
commit is not substituted for that identity.

The source includes the native CLI, industrial browser, client, Merchant/MCP
provider, Applications binding, original schema/codelist dependencies, licences
and existing receiving programmes. It retains the exact original SNV SP2194
activity-export ZIP with its third-party notice, and the complete original FCDO
organisation XML, activity gzip and both successful publisher acquisition receipts.
No new publisher acquisition is needed for these already selected operations.

| Item | Exact identity |
| --- | --- |
| Text source | 201 files; 3,846,277 UTF-8 bytes |
| Original binary publisher inputs | 2 files; 664,228 bytes |
| Original packet closure | 203 files; 4,510,505 bytes |
| Installed closure with receiving corrections | 203 files; 4,512,424 bytes |
| Compressed envelope | 1,539,216 bytes |
| Envelope SHA256 | `2ee3332f9e254d40076fad1a0f5bd8dc8c5c3f3286383d64296c830183f1b952` |
| Decoded envelope | 4,952,476 bytes |
| Decoded SHA256 | `600a4ad86a698d68e0ee3f582dfef1fd0ae008e12a37f2f91d393c4c698ed3be` |
| Source selection | `3bbeeb3cef95dd159343ec298b5595ffa4e970dd1606469ed03f5152f475d873` |
| Packet commit | `9bfca6df8ebbd8e6c4583557df1978accd015a23` |
| Selected receiving commit | `63bea8d5b701c98f2f8f2498bc4c3cfebfbffa6a` |
| Complete installed source selection | `d2bcb160fdb3e1646b3542b0222807d1e2976c63ee8a8caee8a90290466ed5cd` |
| Native/Applications source binding | The same 167 runtime files |

## Prepare the exact source

Use Python 3.11 or later and an existing compatible Node executable. The
preparer uses the standard library, checks every retained source identity,
parses every Python file, and asks the selected Node executable to parse every
JavaScript file. It installs no replacement runtime. The original publishing
and organisation validators use their declared lxml dependency when selected.

```sh
python3 -B prepare_source.py \
  --root /absolute/private/iati-source-3bbeeb3c \
  --packet-file /absolute/complete-source.json.gz \
  --node /absolute/installed/node
```

Omit `--packet-file` only to retrieve the exact public packet from the pinned
commit. The destination must be an owned private absolute directory. Source
preparation creates each exact member once; it can reuse matching bytes and
rejects a changed existing member. It does not create an IATI workspace.

The application keeps its original repository paths under the returned
`source` directory. The native console and Applications lifecycle use the
same 167-file manifest, including all organisation and refresh dependencies.
Do not install a Results-only subset.

The source-preparation receipt records syntax and source custody separately
from the original native receiving outcome. A completed source receipt does
not mean that the case, browser or customer handover has run.

## Select the current receiving files

The original complete packet stays byte-for-byte intact. Preparation selects three
subsequent original repository files from commit
`63bea8d5b701c98f2f8f2498bc4c3cfebfbffa6a`: the two Python receiving entrypoints
and their browser continuation. They correct direct Python imports and loading
the installed Playwright module, follow the current “Following edition” tab, and
retain a browser failure’s actual page errors and screenshot. No financial,
Programme, publishing, refresh, organisation or AMP source is replaced.

| Original repository file under `iati/` | Selected bytes | Selected SHA256 |
| --- | ---: | --- |
| `results/receiving.py` | 24069 | `df718f79bf34b3c1ca50abb0beb2d422ef46c31f1ffc5054666de79fec836530` |
| `results/receiving_console.py` | 7448 | `4023d2780c3885870e95dc4621b917a25138f1a362f2506b6a62929074e77750` |
| `results/browser_receiving.mjs` | 17016 | `a6e5f5e6589df4c31809812f643435351d506cb455dfebed9ff879416fb05de0` |

For every selected file, the preparer first verifies the original packet member’s
size and digest, then verifies the selected file’s exact size, SHA256 and Git blob
identity. It reads all selected files before writing the installed source. A
different local postimage is rejected; it is never silently replaced by a download.

A preparer running inside the original repository path uses that checkout’s
three files. For an offline or explicitly retained source selection, supply a
directory containing their complete repository-relative paths:

```sh
python3 -B prepare_source.py \
  --root /absolute/private/iati-source-current-receiving \
  --packet-file /absolute/complete-source.json.gz \
  --receiving-source-root /absolute/retained/current-receiving-source \
  --node /absolute/installed/node
```

A standalone preparer without that option reads only these three files from the
pinned public commit. It does not select an ambient branch or download another
complete source archive. If a checkout has already advanced to different
receiving bytes, use the explicitly pinned source directory.

Use a new source-preparation destination after a code correction. The existing
case’s receiving root remains the same. Source writes are create-only; an earlier
installed file with different bytes is rejected without being overwritten.

The source receipt keeps `sourceSelectionSha256` as the original packet identity
and records `receivingSourceCommit`, all three before/after file identities and
`installedSourceSelectionSha256` separately. The installed selection is SHA256 of
the path-sorted array of `{bytes,path,sha256}` records for all 203 files, encoded
as compact sorted-key UTF-8 JSON followed by exactly one newline. Thus a receiver
can reproduce the actual installed source identity without mistaking the packet
for the final executable selection.

## Run the selected FCDO financial operation

The exact current `iati/reconciliation_receiving.py` and its complete
`RECONCILIATION_RECEIVING.md` are included. Use the original receiving
operation `fcdo-financial-reconciliation-cb2a-20261012` and its existing private
output directory. Keep the original actor, Node, Playwright and Chromium
selections. The programme accepts the supplied full activity gzip directly.

Use the materialized IATI directory's `examples/fcdo-organisation-2026/organisation.xml`
for `--organisation-source` and its adjacent `publisher-receipt.json` for
`--organisation-acquisition`. Use
`examples/fcdo-wadi-2026/FCDO-set-20.xml.gz` for `--activity-source` and
its adjacent `publisher-receipt.json` for `--activity-receipt`. Supply the
materialized `stellar-forge/mcp-merchant-operator` directory as
`--mcp-directory`.

The whole programme retains the original financial case and five request-bound
revisions, complete financial and nested organisation/activity packets, HTTP/client/MCP
file reads and original operator browser continuation. Its source-edition continuation
reopens the same case after an installed-source correction. Use its complete guide
for the actual command and keep one operator on that same output directory.

For connectors that cannot return the complete binary inline, the packet commit
also retains `artifacts/iati-cumulative-financial-20261012/complete-source.base64.part01`
through `part05`. Their complete ASCII sizes and SHA256 values are listed in
that directory's README. Join their unchanged data in order, base64-decode once,
verify the full gzip above, and pass that exact retained file with `--packet-file`.

## Continue an existing AMP commissioning operation

The current merged AMP application is included in full, with its original upstream source, destination definitions and country-programme selection. Read `iati/AMP.md`, `iati/amp/DESTINATION.md` and `iati/receiving/AMP.md` for the original installed-programme contract. Its browser, CLI, typed client and Merchant tools use the same source workspace and native packet dispatcher. Reuse the original selected AMP operation and account configuration.

## Run the retained SNV operation

The complete source includes
`iati/results/examples/snv-sp2194/prepare_snv.py`, the exact original source
ZIP, and `RECEIVING.md`. Use that preparer to select the retained activity,
result, indicator, period and undimensioned actual through the original
Results engine. It retains the source JSON/XML/exporter provenance and writes
one immutable receiving selection.

The original operation is
`iati-results-snv-sp2194-6966-20261012`. Keep that identity and its receiving
root on retry. Coordinate its one execution with the existing receiving owner.

```sh
python3 -B /absolute/private/iati-source-3bbeeb3c/source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/results/examples/snv-sp2194/prepare_snv.py \
  --source-zip /absolute/private/iati-source-3bbeeb3c/source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/results/examples/snv-sp2194/SNV_SP2194_DPortal_Source_20261012.zip \
  --root /absolute/private/iati-results-snv-sp2194-6966-20261012 \
  --operator "Actual receiving operator" \
  --run \
  --node /absolute/installed/node \
  --playwright /absolute/installed/playwright \
  --chromium /absolute/installed/chromium \
  --merchant-root /absolute/private/iati-source-3bbeeb3c/source/stellar-forge/mcp-merchant-operator
```

The native programme retains the original source, draft, named source review,
exact request replay, coverage change, historical comparison, stale-revision
conflict, complete editable project/report exports, independent receiving
review, second-generation export and cold reopen. Its browser continues that
same receiver through the original authenticated console and Merchant client;
it does not seed another project.

The source contains four results, twelve indicators, ten baselines, six
periods, twelve actual rows and no targets. The selected baseline-change row
compares the original undimensioned actual `2348.00` with its year-only
baseline `0`, producing `2348.00`. Its target and attainment ratio remain
absent. The separate Female/Male values remain distinct original contexts.
The source title and description discrepancy remains visible. The source is
explicitly a D-Portal activity-export representation, not the whole publisher
file's byte identity. See the retained example notice and source provenance.

For native receiving alone, omit the four Node/browser/merchant options from
the SNV command. Keep all four when requesting the full console continuation.
The complete source preparation still requires Node for syntax checks.

### Continue a completed native case

When the original `result.json` already records completed receiving, prepare the
corrected source as above and invoke its existing console programme directly.
Do not call a second source acquisition or create another project.

```sh
python3 -B /absolute/private/iati-source-current-receiving/source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/results/receiving_console.py \
  --root /absolute/private/iati-results-snv-sp2194-6966-20261012 \
  --node /absolute/installed/node \
  --playwright /absolute/installed/playwright \
  --chromium /absolute/installed/chromium \
  --merchant-root /absolute/private/iati-source-current-receiving/source/stellar-forge/mcp-merchant-operator \
  --reviewer "Actual source reviewer" \
  --review-note "Recorded interpretation of the exact retained source records"
```

This continues the original receiver, saved browser request and review history.
The browser/server lifecycle stays in that same process context. An incomplete
browser attempt retains `browser-failure.json` and, when the page remains
available, `browser-failure.png`; these describe the actual failure and do not
mark the original case complete. Keep the saved case and completed exports when
selecting a later source correction.

## Other explicitly selected source cases

The original generic `results/receiving.py` programme remains available for a
different complete source selection documented in `RESULTS.md`. The source
preparer can invoke it with `--receiving-config` and then continue its same
case when all browser/reviewer options are supplied:

```sh
python3 -B prepare_source.py \
  --root /absolute/private/iati-source-3bbeeb3c \
  --packet-file /absolute/complete-source.json.gz \
  --node /absolute/installed/node \
  --receiving-config /absolute/private/receiving-selection.json \
  --playwright /absolute/installed/playwright \
  --chromium /absolute/installed/chromium \
  --reviewer "Actual source reviewer" \
  --review-note "Recorded interpretation of these exact original records"
```

Use the original source programme appropriate to the selected case. The
included organisation/FCDO receiving sources remain intact; preparing this
packet does not execute those programmes.

## Recover and hand over

Keep source materialisation, native receiving and its browser/server in the
same actual host/context. A local path observed in another execution context
does not prove that the same process can read it. The original case reconciles
its retained operation keys and result files; an interrupted transport reply
must be reconciled before another execution.

When a completed original case is available, preserve its result/progress
records, complete editable project ZIP, report ZIP, source preparation and
browser outcome. Keep private connection files, runtime tokens, browser
profiles and authentication selections outside those customer exports. The
original programme's verified export and reopen outcome establishes completed
receiving; source compilation alone does not.

The entire source and original source package remain immutable in this
carrier. A later source edition uses a new source-preparation destination;
a continuation of the existing case keeps its original receiving root and
explicitly records the chosen executable source.

## Following cumulative source corrections

This edition preserves the original Results, organisation, refresh and financial engines while adding the already merged AMP commissioning hooks and their complete native destination source. Both explicit source declarations contain the same 167 names. The native packet dispatcher, Merchant exports, HTTP routes, typed client and browser retain all five workflows.

The selected financial receiving programme reads ordinary installed source through its original `digest_file` and includes the actual subprocess return code in a failed continuation receipt. The selected private HTTP client uses the maintained Node HTTP carrier with a byte-counted Readable queue, preserving the original Request/Response APIs, body lengths, cancellation and timeouts. The historical financial comparison types and Merchant preflight remain the current original author's complete corrections.

The Results transfer is the original owner's legacy-compatible complete postimage `bb11009027ad4eca01fca30998a1718775951fb8` from commit `ad07e749861424e732440d0af11f985b657a5f2c`. It reconstructs the original exporter report basis from validated projections when reopening the retained ZIP. The original `report.py` stays unchanged; old report bytes are preserved.

Source preparation, a native operation result and a durable customer handover are separate receipts. This source capsule contains original application code and public publisher inputs, without an executed private customer workspace or an assertion that every native receiving phase has completed.
