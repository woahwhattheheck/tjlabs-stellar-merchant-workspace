# Prepare and receive the complete IATI application

This carrier preserves the complete source selection
`46bd2a8204c99f239901811fa77361057f787e97e0afae6747c524ecac33882f`: original XML/IATI workspace,
DQA, publishing, organisation budgets and documents, saved publisher refresh,
Results monitoring, programme review and commissioning, and financial reconciliation.
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
| Text source | 154 files; 3,017,781 UTF-8 bytes |
| Original binary publisher inputs | 2 files; 664,228 bytes |
| Complete installed closure | 156 files; 3,682,009 bytes |
| Compressed envelope | 1,352,755 bytes |
| Envelope SHA256 | `fa485c4fcf9fc7fae7ed7d95df5c4eb2d6ca650f0ee7906a81c1fd7cc3e6bdb1` |
| Decoded envelope | 4,074,063 bytes |
| Decoded SHA256 | `9f31e8011efc34e04b230aed7362ba1b99f4bb4a25231fffc61214ec9959b160` |
| Source selection | `46bd2a8204c99f239901811fa77361057f787e97e0afae6747c524ecac33882f` |
| Packet commit | `fd1287f7169d96607dc4d372722749fdd347a904` |
| Native/Applications source binding | The same 122 runtime files |

## Prepare the exact source

Use Python 3.11 or later and an existing compatible Node executable. The
preparer uses the standard library, checks every retained source identity,
parses every Python file, and asks the selected Node executable to parse every
JavaScript file. It installs no replacement runtime. The original publishing
and organisation validators use their declared lxml dependency when selected.

```sh
python3 -B prepare_source.py \
  --root /absolute/private/iati-source-9d9c9e01 \
  --packet-file /absolute/complete-source.json.gz \
  --node /absolute/installed/node
```

Omit `--packet-file` only to retrieve the exact public packet from the pinned
commit. The destination must be an owned private absolute directory. Source
preparation creates each exact member once; it can reuse matching bytes and
rejects a changed existing member. It does not create an IATI workspace.

The application keeps its original repository paths under the returned
`source` directory. The native console and Applications lifecycle use the
same 122-file manifest, including all organisation and refresh dependencies.
Do not install a Results-only subset.

The source-preparation receipt records syntax and source custody separately
from the original native receiving outcome. A completed source receipt does
not mean that the case, browser or customer handover has run.

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

For connectors that cannot return the 1.3 MB binary inline, the packet commit
also retains `artifacts/iati-cumulative-financial-20261012/complete-source.base64.part01`
through `part04`. Their complete ASCII sizes and SHA256 values are listed in
that directory's README. Join their unchanged data in order, base64-decode once,
verify the full gzip above, and pass that exact retained file with `--packet-file`.

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
python3 -B /absolute/private/iati-source-9d9c9e01/source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/results/examples/snv-sp2194/prepare_snv.py \
  --source-zip /absolute/private/iati-source-9d9c9e01/source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/results/examples/snv-sp2194/SNV_SP2194_DPortal_Source_20261012.zip \
  --root /absolute/private/iati-results-snv-sp2194-6966-20261012 \
  --operator "Actual receiving operator" \
  --run \
  --node /absolute/installed/node \
  --playwright /absolute/installed/playwright \
  --chromium /absolute/installed/chromium \
  --merchant-root /absolute/private/iati-source-9d9c9e01/source/stellar-forge/mcp-merchant-operator
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

## Other explicitly selected source cases

The original generic `results/receiving.py` programme remains available for a
different complete source selection documented in `RESULTS.md`. The source
preparer can invoke it with `--receiving-config` and then continue its same
case when all browser/reviewer options are supplied:

```sh
python3 -B prepare_source.py \
  --root /absolute/private/iati-source-9d9c9e01 \
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

## Corrections from the original financial receiving

The selected `reconciliation_receiving.py` reads the ordinary installed source through its original `digest_file`; private workspace files retain their original privacy checks. The selected `client.mjs` carries private HTTP/1.0 response streams with Node’s native HTTP transport while preserving the existing Request/Response body APIs, request lengths, cancellation and timeouts. This addresses the observed Node 24.19 bundled Undici socket-EOF assertion during a complete streamed download. The precise historical comparison declarations and generic MCP comparison preflight are the current original financial author’s complete postimages.

These source corrections are part of the existing receiving operation. The packet does not contain an executed customer workspace, private console URL, account credential or a claim that every receiving phase has completed. The Results renderer and transfer remain their currently selected original sources; the original SNV receiving owner retains its separate legacy-packet continuation.
