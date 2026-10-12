# Customer reading workspace

Search complete received files, retain useful passages in an ordered reading list,
and hand over a project that another reader can open and edit offline.

The desk has four pages: **Search & read**, **Reading lists**, **Source files**,
and **Export & receive**. It keeps the complete original bytes and locates every
passage by source file, byte range, and line range. A reader can follow a result
into earlier or later text, add a note, revise a list, and download the original.

## Open an existing reading project

Use Python 3.11 or later on Linux/POSIX with SQLite FTS5. Offline reading has no
third-party Python dependencies and does not need Node, a provider account, or a
running sender. Install the supplied `stellar-forge-buyer` wheel, or install the
maintained Python package from this directory.

```sh
python -m pip install --no-deps /path/to/stellar_forge_buyer-0.5.0-py3-none-any.whl
python -m stellar_forge_buyer.reading_cli receive reading-project.zip ./received-project
python -m stellar_forge_buyer.reading_cli serve ./received-project
```

The receiving directory must be new. The parent directory must exist. Open the
private local URL printed by `serve`; keep its launch token private. The URL's
fragment is exchanged for an HTTP-only session cookie and removed from the
address bar. Normal downloads do not contain a token in their URL. Press Ctrl-C
to stop, then run the same `serve` command to reopen the saved project.

The installed merchant command forwards to this same Python implementation:

```sh
starforge reading receive reading-project.zip ./received-project
starforge reading serve ./received-project
```

`STARFORGE_READING_PYTHON` selects an existing Python executable for this Node
command wrapper. The wrapper supplies the selected package's Python source path;
it does not create a new environment or install dependencies. The direct Python
commands remain available independently of the merchant CLI.

## Receive the original resource library

The existing SF88 library is the source of record. Its completed scan determines
which original resources are available. This reading workspace adds complete-file
passage search; it does not change the library's configurable preview index.
Initial receiving and publishing a resource collection require the existing
Python `ResourceLibrary` bridge and its Node 22.16+ source checkout.

```sh
python -m stellar_forge_buyer.reading_cli sync ./reading-project \
  --checkout /absolute/path/to/source-checkout \
  --library-state /absolute/path/to/original-resource-library \
  --operation receive-september-records \
  --label "September service handover"
```

`sync` uses the latest completed original library scan; it does not silently
rescan a changing provider or source directory. Use the library's existing scan
command before receiving a later source edition. Keep the same operation
identifier and label to resume an interrupted receiving operation. Choose a new
operation identifier to adopt a later completed scan as another source snapshot.
A completed operation returns its saved result on retry.

All file transfers call the original `ResourceLibrary.download_resource` method.
Its descriptor, resumable file cursor, original content digest, and create-only
publication remain in control. Identical content is stored once. An interrupted
sync leaves the last complete snapshot searchable; previously indexed originals
are reused when it resumes. A workspace is bound to one original source library.
Use a separate workspace for a different library.

A connected browser uses that same saved library:

```sh
python -m stellar_forge_buyer.reading_cli serve ./reading-project \
  --checkout /absolute/path/to/source-checkout \
  --library-state /absolute/path/to/original-resource-library
```

**Receive latest library scan** appears on Source files when connected. It adopts
a completed scan through the same original transfer path. Offline projects keep
all retained files and editing functions; they do not need that connection.

## Search, read, and save

Choose a source snapshot and enter words or a quoted phrase. Search treats words
as literal terms combined within one passage. For example, `calibration supplier`
requires both terms in the passage; `"calibration memorandum"` requires that
phrase. Raw SQL, FTS operators, and wildcards are not accepted. Queries can contain
up to 512 characters and 32 terms. Searches are case-insensitive and use SQLite's
Unicode word tokenizer with diacritic folding.

The index reads the entire NUL-free UTF-8 source, including CSV, JSONL, JSON,
Markdown, and text. It does not turn structured source records into an inferred
schema, round numbers, strip markup, or replace invalid text. Files with invalid
UTF-8 or NUL bytes remain complete **download-only** originals. Empty valid text
is a complete indexed file with no passages. PDF and DOCX are not decoded as documents or processed for embedded text; their
original downloads remain available. A file consisting entirely of NUL-free
UTF-8 can be indexed as raw source text regardless of its filename.

Passages contain up to 32,768 source bytes and overlap by approximately 4,096
bytes, with boundaries adjusted to whole UTF-8 characters. This keeps ordinary
phrases searchable across the main segment boundary. Query terms must occur
within the same passage. Very long unbroken tokens are subject to SQLite's
underlying tokenizer limits. Overlapping segments can both match: counts refer
to matching passages, not distinct occurrences. Every original byte is retained,
and the Source files page shows indexing coverage rather than silently presenting
a preview as the full file.

Results use stable source-ID and passage ordering. A saved search pins its source
snapshot, query, and optional resource selection. Receiving another snapshot does
not retarget that search. A reader can select another snapshot and save a new
revision explicitly. Search pagination and report export keep the same snapshot.

```sh
python -m stellar_forge_buyer.reading_cli search ./reading-project \
  '"calibration memorandum"' --limit 30
python -m stellar_forge_buyer.reading_cli save-search ./reading-project \
  '"calibration memorandum"' --id calibration-records \
  --name "Calibration records" --expected-revision 0 \
  --operation save-calibration-search
python -m stellar_forge_buyer.reading_cli run-search ./reading-project calibration-records
```

Select a search result to read its exact original text. The reader scrolls toward
the first search term and provides earlier/later passage navigation. **Download
original** returns the complete verified file. CSV identifiers and other numeric
text remain exactly as delivered.

## Reading lists and revisions

Create and save a named list, then add passages from Search & read. Each passage
can have its own note. On Reading lists, edit the introduction and passage notes,
change the order, remove an item, and save. Save commits the changes; unsaved form
edits should be saved before switching to another list or closing the browser.
A selected passage retains its original resource ID, content SHA-256, exact byte
range, LF-based line range, and passage SHA-256.

A save uses the revision the editor opened. Another editor's saved changes cause
a revision conflict rather than being overwritten. Refresh and reopen the list
to review the current saved revision. **Show revision history** provides a full
HTML report for each earlier saved revision. Reusing the same operation identifier
with the same body returns the existing revision; changing the request under that
identifier reports an operation conflict.

CLI reading-list input is a JSON array. Use `resource_id`, `ordinal`, and `sha`
from an actual search result; add the reader's `note` to each selected item.

```sh
python -m stellar_forge_buyer.reading_cli save-list ./reading-project \
  --id service-handover --name "Service handover" \
  --items selected-passages.json --note "Read the field review before the supplier response." \
  --expected-revision 0 --operation save-service-handover
python -m stellar_forge_buyer.reading_cli history ./reading-project list service-handover
```

The browser retains a submitted action while waiting for its response. An
interrupted or uncertain response offers **Retry the same action**, preserving
its operation identifier and payload. Native revision and receipt checks also
protect CLI and HTTP callers. Browser recovery storage is scoped to the browser
origin; retain the original command's operation identifier when recovering from
another host, browser profile, or port. All committed project state remains on
disk independently of browser storage.

## Return a selection to the original collection writer

A connected reader can publish a saved reading-list revision as an original SF88
resource collection. This uses the original collection operation, resource
identity, annotation revision, and collection revision. It does not create another
annotation, collection, comparison, payment, or decision engine.

```sh
python -m stellar_forge_buyer.reading_cli publish-collection ./reading-project \
  --checkout /absolute/path/to/source-checkout \
  --library-state /absolute/path/to/original-resource-library \
  --list-id service-handover --list-revision 1 \
  --collection-id service-handover --expected-revision 0 \
  --operation publish-service-handover
```

The collection contains each selected original resource once and uses the list
introduction as its collection note. Passage-specific notes stay with the reading
project and reports. The introduction must fit the original collection's 32 KiB
limit. Resource annotation revisions are frozen before dispatch. If the native
writer commits but its response is lost, repeat the same operation: the exact
prepared request is retained and sent again, rather than adopting newer annotation
revisions or creating another collection revision.

## Export and independently receive

A reading report contains every selected passage, source location, and note.
HTML is a self-contained reader document; JSON retains the full typed selection;
CSV supports downstream review. Formula-like text is prefixed with an apostrophe
in the CSV report to prevent spreadsheet execution. Original files and JSON text
remain unchanged. Byte ranges use an inclusive start and exclusive end; line
numbers count line-feed separators, including the final empty line after a
trailing line feed.

```sh
python -m stellar_forge_buyer.reading_cli report ./reading-project \
  --list-id service-handover --format html --out service-handover.html
python -m stellar_forge_buyer.reading_cli report ./reading-project \
  --query calibration --format json --out complete-search.json
python -m stellar_forge_buyer.reading_cli export ./reading-project reading-project.zip
```

Report export follows all pages, not just those displayed in the browser. A list
report pins the selected saved revision before it starts. Export destinations are
create-only: choose another file name rather than overwriting an existing output.

The editable ZIP contains `project.json` and complete `originals/<sha256>` files.
It preserves all retained source snapshots, saved-search and reading-list
revisions, receiving plans, original collection requests, and completed receipts.
The receiver validates original sizes and SHA-256 values, rejects undeclared or
duplicate archive members, reconstructs the index from the original bytes, checks
saved passage references, and opens an independently editable project. It never
runs SQL or code from the archive. The default expanded-original allowance is
20 GiB and the metadata manifest limit is 64 MiB; the receiving command exposes
`--max-total-bytes` for an explicitly chosen source capacity.

The archive is private customer work product. It contains original source data,
reader notes, and original collection receipts, which can include the collection's
historical source-path metadata. Browser session credentials and incomplete
transfer buffers are not included. An interrupted native receiving plan can be
continued only with its same original library; all completely retained sources
remain usable offline.

## Python and HTTP integration

`ReadingWorkspace(directory)` owns only reading snapshots and the derived index.
Its public methods include `sync`, `status`, `resources`, `search`, `passage`,
`source_file`, `save_search`, `run_search`, `save_list`, `head`, `history`, and
`publish_collection`. Use it as a context manager. `reading_delivery` exports
`export_project`, `receive_project`, and `export_report`. Reading-operation errors
carry a stable `ReadingError.code` and a human-readable detail where appropriate.

The local server provides JSON under `/api/`: `status`, `resources`, `search`,
`passage`, `record`, `history`, `search/save`, `list/save`, `sync`, and `collection`.
Query pages accept `snapshot`, `offset`, and `limit` (1–200). Mutations accept the
same named fields as the Python methods and must retain their operation ID on
retry. JSON requests are limited to 16 MiB. Original and report downloads stream
from `/download/source`, `/download/report`, and `/download/project`. Native
clients can use the launch token in the `Authorization: Bearer` header. Origin
and Host checks keep the desk bound to its loopback listener.

A native producer can use the same bridge-backed `sync` command to produce a
portable reading project from an original library. The durable interoperability
key is the original resource ID plus the complete original SHA-256. Passage
ordinals are local index coordinates; producers with another segmentation scheme
must compare exact source byte ranges rather than treating ordinals as global
identifiers.

## Operate the complete example

The maintained example creates authored office records in the original inbox
snapshot shape, then runs real receiving, search, list editing, original collection
publication, source export, sender deletion, independent receiving, and another
saved list revision. It includes a binary original and search terms several
megabytes beyond the library's preview prefix.

```sh
python examples/reading_customer.py \
  --checkout /absolute/path/to/source-checkout \
  --out /absolute/path/to/new-customer-example --rows 60000
```

The example writes complete customer reports and editable ZIP projects under
`delivered/`. `customer-result.json` records the actual operation result. Keep its
output directory new so the example does not replace an existing customer's work.
