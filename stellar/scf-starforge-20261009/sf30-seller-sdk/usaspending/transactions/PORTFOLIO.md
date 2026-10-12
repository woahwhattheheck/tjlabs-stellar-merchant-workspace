# Federal award workshare portfolio

Operate a set of retained awards through the original `AwardWorkspace` and
`AwardTransactions` APIs. The workbench adds capture selection, agency and
recipient rollups, private workshare editing, portable deliveries, and resumable
receiving. It does not create a second award database or contact prospects.

## Open the workbench

From `stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending`:

```sh
node transactions/portfolio-cli.mjs serve --workspace /path/to/private/workspace
```

Open the printed loopback URL in a browser. The fragment is a local session key;
keep that URL private. The interface is grayscale, searchable, keyboard usable,
and paginated at 50 awards per page. A history selector exposes alternative
captures. Review edits use the original revision-checked writer and retain the
award edition and source fingerprint. A concurrent edit returns the original
conflict instead of overwriting another operator's assessment.

## Select and export

```sh
node transactions/portfolio-cli.mjs export \
  --workspace /path/to/private/workspace \
  --out /path/to/new-delivery \
  --capture TC-FIRST --capture TC-SECOND --reviews
```

Omit `--capture` to select the newest complete capture for each award. An award
with no complete capture uses its newest partial capture. Every unselected
capture is recorded under `selection.alternatives`. Selecting two captures of
the same award fails instead of double-counting its obligations. A partial or
conflicted history remains visible and makes the complete-history total unknown.
Known captured amounts remain separately available. Decimal strings are summed
with integer arithmetic, including values above JavaScript's safe-integer range.
These are federal funding observations, not a forecast of the operator's revenue.

The delivery contains `portfolio.json`, `view.json`, spreadsheet-safe `awards.csv`,
`workshares.md`, each complete original capture under `captures/`, and a file
manifest. Each capture retains the original request/response bytes and original
export digest. The portfolio validates its summary against the normalized rows
when reopened. Export builds a private partial directory and publishes the
completed directory; the target must not already exist. A partial directory is
an interrupted build and can be removed after its contents are inspected.

Private assessments are excluded by default. `--reviews` or the browser's explicit
checkbox includes them. The workbench itself is a private operating surface and
shows existing reviews to its authenticated local operator.

## Receive and resume

First receive the original award edition in the destination's existing workspace.
Then use the original transaction receiver through the portfolio command:

```sh
node transactions/portfolio-cli.mjs receive \
  --workspace /path/to/receiving-workspace \
  --packet /path/to/delivery/portfolio.json \
  --journal /path/to/receiving-journal.json --reviews
```

The parent directory for the journal must exist. Reissue exactly the same command
after an interruption. The saved plan binds the portfolio digest, workspace ID,
review choice, and edition mapping. Each original capture is replayed through
`AwardTransactions.receive`, which owns source validation, award matching,
idempotent receiving and private-assessment conflict handling. Checkpoints are
written after each accepted capture. Replaying checkpoints also repairs a target
workspace restored from an earlier backup. A failed capture is recorded with its
original error; prior accepted captures stay available.

When original editions have different IDs in the destination, `--edition-map`
accepts a JSON file mapping original edition IDs to receiving edition IDs. The
original receiver still requires the award row digest to match. Changing the
source, destination or review plan requires a different journal file. Use one
receiving process per journal; separate workers should use separate journals.

## Inspect without opening a workspace

```sh
node transactions/portfolio-cli.mjs inspect --packet delivery/portfolio.json
```

This works on Node 22 without package installation. Operating an original SQLite
workspace requires the product's Node 22.13+ runtime. No dependencies, provider
calls, scheduled jobs or GitHub Actions workflows are added.

## Acceptance

```sh
node transactions/portfolio-acceptance.mjs
```

The component journey uses a deterministic fixture implementing the public
transaction-store interface. It covers 10,000 awards, exact decimals, duplicate
award selection, archive contents, digest/summary binding, interrupted receiving,
replay, workspace-plan binding, loopback HTTP, stale review revisions and private
export opt-in. It is distinct from the full original USAspending source → merchant
→ Applications receiving journey. The CLI and server load the original
`../workspace.mjs` for actual workspaces.
