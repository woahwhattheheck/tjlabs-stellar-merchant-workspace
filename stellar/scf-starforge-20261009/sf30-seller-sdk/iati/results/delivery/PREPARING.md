# Prepare and receive the complete IATI application

This carrier preserves the complete source at commit
`71d0118d3cc86f72689dbd9ed4c70c86113a3241`: original XML/IATI workspace,
DQA, publishing, organisation budgets and documents, saved publisher refresh,
and Results monitoring. It includes the native CLI, industrial browser, client,
Merchant/MCP provider, Applications binding, original schema and codelist
dependencies, licences, and the existing receiving programmes.

The source package also retains the exact SNV SP2194 activity-export ZIP and
its separate complete third-party notice. The selected operation uses those
retained original bytes; no publisher acquisition is required.

| Item | Exact identity |
| --- | --- |
| Text source | 136 files; 2,508,700 UTF-8 bytes |
| Original SNV source ZIP | 1 file; 17,001 bytes |
| Complete installed closure | 137 files; 2,525,701 bytes |
| Compressed envelope | 561,108 bytes |
| Envelope SHA256 | `f4359d6d9fe1574dbe02054e5bf531e28a78461dd050384aa989bbe436fe6eac` |
| Decoded envelope | 2,651,007 bytes |
| Decoded SHA256 | `b9a6e6ab6959e3a8cbdf575d01fb5cf548bca1d868a4e4c109fcbc3706c08a65` |
| Original application commit | `71d0118d3cc86f72689dbd9ed4c70c86113a3241` |
| Packet commit | `fbc01112d2c1e9579c2153411c66d49a75c9bb9f` |
| Native/Applications source binding | The same 101 runtime files |

## Prepare the exact source

Use Python 3.11 or later and an existing compatible Node executable. The
preparer uses the standard library, checks every retained source identity,
parses every Python file, and asks the selected Node executable to parse every
JavaScript file. It installs no replacement runtime. The original publishing
and organisation validators use their declared lxml dependency when selected.

```sh
python3 -B prepare_source.py \
  --root /absolute/private/iati-source-71d0118d \
  --packet-file /absolute/complete-source-71d0118d.json.gz \
  --node /absolute/installed/node
```

Omit `--packet-file` only to retrieve the exact public packet from the pinned
commit. The destination must be an owned private absolute directory. Source
preparation creates each exact member once; it can reuse matching bytes and
rejects a changed existing member. It does not create an IATI workspace.

The application keeps its original repository paths under the returned
`source` directory. The native console and Applications lifecycle use the
same 101-file manifest, including all organisation and refresh dependencies.
Do not install a Results-only subset.

The source-preparation receipt records syntax and source custody separately
from the original native receiving outcome. A completed source receipt does
not mean that the case, browser or customer handover has run.

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
python3 -B /absolute/private/iati-source-71d0118d/source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/results/examples/snv-sp2194/prepare_snv.py \
  --source-zip /absolute/private/iati-source-71d0118d/source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/results/examples/snv-sp2194/SNV_SP2194_DPortal_Source_20261012.zip \
  --root /absolute/private/iati-results-snv-sp2194-6966-20261012 \
  --operator "Actual receiving operator" \
  --run \
  --node /absolute/installed/node \
  --playwright /absolute/installed/playwright \
  --chromium /absolute/installed/chromium \
  --merchant-root /absolute/private/iati-source-71d0118d/source/stellar-forge/mcp-merchant-operator
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
  --root /absolute/private/iati-source-71d0118d \
  --packet-file /absolute/complete-source-71d0118d.json.gz \
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
