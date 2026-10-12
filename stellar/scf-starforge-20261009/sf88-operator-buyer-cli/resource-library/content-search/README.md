# Resource research desk

Search the complete UTF-8 contents of retained resource files, collect exact passages,
keep useful queries, review the original resource notes, and export all findings.
The desktop and phone interface uses the same resource library and verified downloads
as the original buyer workflow.

## Open an existing library

Use Node 22.16 or newer with built-in SQLite and FTS5. No additional package installation
is needed for this extension. From the original `resource-library` directory:

```sh
node content-search/cli.mjs serve --state /absolute/private/resource-library
```

Open the private URL printed by the command. **Refresh files** runs the original
library scan and then builds the complete content index. **Update content index**
indexes an existing scan without changing its source. Keep the terminal running;
Ctrl+C cancels owned work and closes the server. Treat the printed URL as private.

The source-owned distribution contribution adds the same command as:

```sh
starforge buyer-research serve --state /absolute/private/resource-library
```

For a new library, first initialize the original library, preserving its accepted
inbox or snapshot format and file roots. The original library guide contains those
source-specific commands. This extension does not introduce another inbox format.

## Research workflow

Enter one to 24 whole words. **All words** means every word appears somewhere in the
same file; the words may be on different lines or different indexed passages.
**Any word** finds files containing at least one word. Matching is case-insensitive
and uses Unicode NFC normalization; accents are retained. Quotation marks are
punctuation, not phrase syntax. The complete query is limited to 2,048 UTF-8 bytes.

Open **Review passages** to page through every matching passage. **Read complete
passage** shows the retained text with previous/next navigation. Excerpts include
original one-based line positions and zero-based UTF-8 byte ranges, with the byte
end exclusive. CRLF, CR, and LF line endings retain their source bytes. Text is
not normalized for display or export. Long passages have explicit excerpt flags.

Resource notes, tags, stars, history and original-file downloads remain the original
library operations. A saved query can be run, edited, or deleted from another
window or a restarted server. Concurrent edits use revision checks and stable
operation IDs, including lost-response retries. Deleted IDs retain revision
tombstones rather than admitting stale edits after deletion.

**Export all findings** produces an HTML report, CSV, or JSON. It walks all result
pages and all matching passages, not only the current browser page. Reports contain
the selected source binding, search terms, eligible-file coverage, exact positions,
and a captured revision of each resource annotation. HTML is escaped and standalone;
CSV neutralizes spreadsheet formulas in textual cells. These are research findings,
not copies of every complete source file; use the original download for exact files.

## Command line

```sh
node content-search/cli.mjs index --state /absolute/private/resource-library
node content-search/cli.mjs search --state /absolute/private/resource-library --q "annual revenue" --all
node content-search/cli.mjs export --state /absolute/private/resource-library --q "annual revenue" --format html --out ./findings.html
node content-search/cli.mjs save --state /absolute/private/resource-library --name "Annual revenue" --q "annual revenue" --operationId annual-revenue-first
node content-search/cli.mjs saved --state /absolute/private/resource-library
```

`--all` streams complete newline-delimited results; normal queries return explicit
pagination. `--build` reopens a retained completed index. Reports use create-only
publication: an existing output path is never replaced. Use `help` for all commands.

## Embedding and typed client

```js
import {openLibrary} from '../library.mjs';
import {serveContentSearch} from './server.mjs';
import {ResearchClient} from './client.mjs';

const library = await openLibrary({state: '/absolute/private/resource-library'});
const host = await serveContentSearch(library);
const client = new ResearchClient(host);
try {
  for await (const result of client.allResults({q: 'annual revenue'})) {
    console.log(result.resource.name, result.excerpt.lineStart);
  }
} finally {
  await host.close();
  await library.close();
}
```

`openContentSearch(library)` also exposes the engine directly. For an already-owned
server, compose `contentSearchExtension(search)` with its existing `additionalAssets`
and authenticated route handlers. Close the extension before the server, then close
the search engine and original library. The `/research` page links back to the original
library; its route is also present in the original server's page inventory.

The supplied declarations cover the engine, HTTP client, exports, server and extension.
The client all-page iterators pin the first completed build for the whole operation.

## Storage and recovery

The additional `content-search.sqlite` lives inside the original private library
state. It contains derived full text, source identities, saved searches and operation
receipts; protect it like the original retained files. Original source files and buyer
stores are not rewritten. Files are obtained only through `library.download`, which
returns the original digest-verified retained file descriptor.

Indexing reads fixed-size chunks, writes short transactions, stores each search term only once per passage, and retains a completed
file's index for reuse. Cancellation or process interruption keeps the previous
completed build available for queries. The next index call reuses completed files
and restarts the interrupted file. A native process-identity lease prevents concurrent
writers and detects a dead local process. A completed source build becomes current
in one transaction. Existing pages and exports keep their explicitly selected build. A file that was unavailable in an older completed build keeps that historical coverage; a later successful retry does not rewrite the older results.

Refresh the original library before indexing changed sources. Previously completed
builds remain readable after refresh, even when a resource has left the current
library; original editing and downloading require the corresponding current resource.
The coverage report identifies binary/non-UTF-8 and unavailable resources. This is a
text index, not PDF extraction, OCR, or a parser for compressed binary office formats.
Original file-size and root restrictions continue to apply.

Old builds and text are retained intentionally for reproducible research. Plan private
disk capacity accordingly; the original verified-download spool temporarily needs
space for one source file. Removing this derived database while all research processes
are closed clears its saved searches and retained findings as well as its index.

## Native customer journey

```sh
node content-search/journey.mjs /absolute/private/research-results
```

The journey creates actual original-format resource records and files, then uses the
original library for complete-text indexing, multilingual/byte-range queries,
all-page exports, saved-query recovery, source refresh and cancellation, original
annotations, authenticated HTTP requests, and verified downloads. It leaves a usable
private library and reports, and prints their paths. Its data are authored examples.
