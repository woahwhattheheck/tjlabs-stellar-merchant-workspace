# Python review browser and customer delivery

Receive and review portable comparisons in the original application, directly from
Python or the command line. The original library, comparison worker, decision writer,
return reconciler, HTTP routes and streamed downloads remain the implementations.

## Customer commands

An extracted customer package supplies `review.py`, the complete selected source,
`verify.py`, and its file manifest. No checkout-path editing or dependency download
is needed to use that entry. Choose an absolute private workspace outside the package:

```sh
python review.py --state "$HOME/customer-review" receive \
  --input "/absolute/delivered-review.json" --operation-id "delivery-1" \
  --serve --open-browser
python review.py --state "$HOME/customer-review" serve --open-browser
```

The first command creates an independent original receiving workspace when needed.
The second reopens the same state. An existing source-backed library keeps its source
configuration; receiving does not replace it with an empty snapshot. An incoming
comparison is selected in the original browser. If native receiving produces a
pending divergent return, the same command opens that particular return instead.

Use `--stage-return` to explicitly stage a return against a comparison already in
the receiving library. Neither the browser host nor Python implements a second
reconciliation policy. Existing import semantics decide whether compatible history
appends or a divergent history needs a reviewed plan. Retry a lost receiving reply
with the same file and `--operation-id`.

Without a customer archive, the installed `stellar-forge-review` command and
`python -m stellar_forge_buyer.review_cli` accept `--checkout ABS --state ABS`
before the same commands. The checkout contains `stellar/`. The selected runtime
requires Node 22.16 or later; Python requires 3.11 or later on POSIX.

## Complete reviewer journals

The customer receiver recognizes a complete journal envelope and delegates it to the
original returned-journal engine. Bare comparison handovers keep the incoming-review
workflow. Use --return-format incoming or --return-format returned to choose explicitly.

Receive a complete journal into a new workspace, or stage it against the same comparison
already in this workspace:

```sh
python review.py --state "$HOME/customer-review" receive \
  --input "/absolute/complete-journal.json" --operation-id "journal-receive-1" \
  --serve --open-browser
python review.py --state "$HOME/customer-review" receive \
  --input "/absolute/returned-journal.json" --operation-id "journal-stage-1" \
  --stage-return --return-format returned --label "Reviewer return" \
  --serve --open-browser

```

The staged plan opens at /review-returns with its exact plan ID and comparison ID.
A new receiving result opens that comparison at /comparisons. Receiving without
--serve saves the same location for the next serve command. The private workspace
remembers only page/identifier metadata; the original native engine retains decisions,
operation receipts and every source journal.

```sh
python review.py --state "$HOME/customer-review" serve --open-browser
python review.py --state "$HOME/customer-review" serve --plan-id PLAN_ID --open-browser
python review.py --state "$HOME/customer-review" serve --return-id INCOMING_RETURN_ID --open-browser
python review.py --state "$HOME/customer-review" serve --comparison-id COMPARISON_ID --open-browser

python review.py --state "$HOME/customer-review" review-returns list --comparison-id COMPARISON_ID
python review.py --state "$HOME/customer-review" review-returns show PLAN_ID
python review.py --state "$HOME/customer-review" review-returns targets PLAN_ID --all
python review.py --state "$HOME/customer-review" review-returns history SOURCE_JOURNAL_ID --all
python review.py --state "$HOME/customer-review" review-returns apply PLAN_ID \
  --input "/absolute/saved-resolution.json"
python review.py --state "$HOME/customer-review" review-returns export COMPARISON_ID \
  --format json --out "/absolute/complete-reviewed-journal.json"

```

The saved resolution file carries the original operationId, expectedBaseId, actor
and resolutions. Reuse that exact file after a lost response. Resolutions use the
original KEEP_LOCAL, TAKE_RETURNED or CUSTOM choices. An explicit review-returns
restage PLAN_ID --operation-id ID prepares a new plan against the current local
journal; it preserves the earlier plan and receipt.

Full-journal export supports JSON, CSV and HTML. JSON contains the whole comparison,
every retained source journal, reconciliation plan and receipt. Its file transfer uses
the existing resumable byte cursor and checksum. Reopening a saved plan keeps its
original ID even after it is applied. Selecting another case in the native comparison
screen takes precedence over an older remembered CLI receipt.

| Command or screen | Identifier |
| --- | --- |
| compare, /comparisons | comparison ID |
| return, /comparison-returns | incoming return ID |
| review-returns show/targets/apply/restage, /review-returns | full-journal plan ID |
| review-returns history | source-journal ID |
| review-returns export | comparison ID, with complete lineage |

The original return namespace and compare export continue to use the incoming-review
contract. Use review-returns export for the complete journal delivery.

## Foreground ownership

`serve` and `receive --serve` remain foreground commands. Ctrl-C or SIGTERM closes
the listener, completes the original library shutdown, and retains the workspace.
No scheduler, daemon, tunnel or second native process is created. Python methods
and browser HTTP requests operate the same library owned by one Node process.

Normal JSON output reports the loopback origin, selected pages, listener session
identity and state path without a private URL. `--open-browser` is an explicit
local desktop action. `--show-url` prints the private URL to the operator's terminal.
`--ready-file ABS` creates a new connection JSON in an already-private directory;
its full URL is private and belongs only to that operator. Clean shutdown removes
only the exact connection file written by that launch. After a forced process kill,
use a fresh connection filename rather than treating a stale file as a live server.

`--port 0` selects an available loopback port. The native original listener continues
to enforce its Host, Origin, same-origin request and private-session requirements.
Its single-use native file-download routes retain their existing behavior.

## Python API

```python
from pathlib import Path
from stellar_forge_buyer.review_library import ResourceLibrary

with ResourceLibrary.receiver(checkout=Path('/opt/customer-review/source'),
                              state=Path('/private/customer-review')) as library:
    review = library.import_review('/private/incoming.json', operation_id='edition-1')
    library.select_comparison(review.id)
    with library.browser(page='comparisons', operation_id='operator-window-1') as browser:
        assert browser.metadata()['pid'] == library.pid
        print(browser.metadata())       # No private capability in logs.
        browser.open_tab()              # Explicit local action.
        # Python and the browser can now inspect/edit the same native workspace.
        input('Press Enter to close this browser session. ')
```

`browser.url` is the private connection capability; `repr(browser)`, `metadata()` and
`library.browser_status()` omit it. browser.pages describes the actual available native screens. Use
page_url('comparisons', comparison_id=...) for the exact case,
page_url('returns', return_id=..., comparison_id=...) for its incoming return, and
page_url('review-returns', plan_id=..., comparison_id=...) for its full-journal plan.
The page selector validates the original identifier type and keeps the private
session fragment separate from the case query.

ResourceLibrary.receive_review() returns ReviewReception.format and the unchanged
native result in .observed. Explicit full-journal methods are receive_journal(),
stage_journal(), journal_return(), journal_returns(), journal_history(),
verify_journal() and export_journal(). A JournalReturn keeps its plan ID separate
from .comparison_id; its apply() accepts the original expected_base_id, actor,
resolutions and operation_id. Comparison.export_journal() exports the complete
lineage through that same native descriptor.

The listener's start/stop actions are serialized. Repeating the same start operation
and options returns the same active session. A different operation cannot silently
replace it. Stop, then explicitly start a new one when needed. A handle from the
previous listener cannot close its successor. Closing a browser leaves the library
usable; closing the library also closes an unclosed browser.

The original Collections extension is composed when its `collection-ui.mjs` entry
exists. An absent extension is not presented as a working page. An entry that exists
but has a missing dependency fails normally instead of silently losing features.
The original comparison and returned-review pages are required for this customer
review distribution. Python native collection operations are unchanged.

## Build an exact customer package

Build from an explicit source manifest with a `files` array containing repository-
relative `path`, `bytes` and `sha256` for each selected source. This prevents ambient
checkout files, local credentials, untracked workspaces and build caches from being
silently included. Every declared source is checked against its selected bytes.

```sh
python build_review_customer.py --checkout /absolute/original-source \
  --source-manifest /absolute/review-source-selection.json \
  --review /absolute/portable-review.json \
  --review /absolute/portable-review.html \
  --wheel /absolute/stellar_forge_buyer-0.5.0-py3-none-any.whl \
  --out /absolute/new-customer-review.zip
```

`--review` may repeat for distinct JSON, CSV and HTML filenames. It copies the exact
selected files. `--example-data` labels included authored examples explicitly. The
wheel is optional; source-mode operation requires no install. The completed archive
is published create-only after every member has been read back against its manifest.
A preexisting output, missing required browser asset, changed source member, duplicate
report filename or symlink source fails without overwriting the existing output.

Source and report bytes are preserved. `PACKAGE.json` also records selected browser
pages. `verify.py` validates every supplied member and rejects unlisted runtime files.
Its hashes detect changes; they do not authenticate a publisher. A receiver can place
the complete package at a new path and open portable JSON in an independent workspace.

## Readable portable reports

The original HTML exporter now leads with filenames, exact values and readable review
statuses. Full original source references, comparison identities, typed values,
source positions and revision references remain accessible in disclosure sections.
Numbers stay exact decimal strings, empty strings remain visibly quoted, and missing
fields remain distinct from null. Responsive wrapping prevents full identifiers from
forcing horizontal phone overflow. JSON handovers and spreadsheet-safe CSV are
unchanged by this presentation update.
