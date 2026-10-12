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
`library.browser_status()` omit it. `browser.pages` describes the actual available
native screens. `page_url('returns', return_id=...)` targets a specific saved return;
only known native page names and a valid native return ID are accepted.

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
