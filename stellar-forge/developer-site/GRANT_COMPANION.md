# Read the complete product and financing companion

The existing application now opens **Product and financing** at
/grant-companion.html. The reader consumes the same complete
grant-data/product-and-finance.md and grant-data/source-index.json
already selected by the maintained application. It gives the cumulative
customer installations, six-package allocation and financing explanation a
readable chapter interface.

## Read, find and retain the source

Choose a chapter from the index. Previous and Next move through that same
selection. Search looks through the full companion, including tables and code
blocks, and shows the matching chapters with short excerpts. Search terms are
combined: every entered word must occur in a matching chapter. Clear returns
to the complete index. Read all chapters opens the complete text or all current
search matches.

A chapter or subsection link opens its containing chapter. Following a link to
a chapter outside the current search clears that filter, keeping the requested
source visible. The original Markdown headings supply stable anchors; repeated
headings receive distinct anchors in source order.

Print chapter prints the visible selection. Print complete companion includes
every chapter even when a search or selected chapter is active. Long tables
scroll within the page and print with wrapping cells and repeated column
headers. Code blocks retain their original content. The interface uses neutral
colors and adapts to narrow displays.

Download Markdown and Source index save the original complete files, retaining
their source text and line endings. Save offline reader creates one HTML file
with all rendered chapters, the full stylesheet, the same navigation/search
controls, and both original source files for later download. Open that file
directly in a browser. Reading and searching the saved document require no
network request; explicit links to external sources or the original application
open their recorded destinations.

## Continue the original source publication

The original grant-compose command attaches the companion link and a
companion_reader descriptor to its current source index. The descriptor binds
the reader to the same complete companion SHA-256 and byte count. It refreshes
when the canonical manuscript owner composes a later edition.

The original four-file sourcePins contract is preserved:

- /grant.html
- /grant-data/application.md
- /grant-data/product-and-finance.md
- /grant-data/source-index.json

The browser manifest adds the four companion assets. They travel with the
complete developer-site component, its existing server, and the original
grant-reviewer package:

| File | Use |
| --- | --- |
| dist/grant-companion.html | Original reader entry and source-download fallback. |
| dist/grant-companion.css | Responsive chapter, table, navigation and print presentation. |
| dist/grant-companion-core.mjs | Shared complete Markdown renderer, chapter interface and offline export. |
| dist/grant-companion-workspace.mjs | Original source loading, exact edition selection and download actions. |
| grant-companion.mjs | Existing application navigation and source-index integration. |

The browser reads the source index and companion together and compares the
selected byte count and SHA-256. A concurrent publication refreshes that pair
once. If the publisher is still replacing the edition, Reload companion opens
the completed publication; the original download links remain available.

Receive all four assets alongside the current four reader files through the
existing publisher and audience. The current manuscript and submission
drafts stay with their original owners. This reader uses no additional source
manuscript, draft store, dependency installation or application service.

## Retain reading work across complete source editions

The same reader now opens a **Retained reading workspace** above the original
chapter navigation. It keeps the complete companion and source index, the
selected chapter and search, named reading notes, bookmarks, unfinished note
drafts and prior note versions in one portable record.

The browser receives its current published companion through the original
paired source loader. On a later visit it retains that new complete pair as
another edition while preserving the operator's selected earlier edition and
reading work. Choose **Compare complete editions**, inspect the changed
chapters and source records, then choose **Read selected edition**. Selecting
an edition changes the reading context; original source text remains immutable.

### Record a chapter decision

Choose the note's original chapter and name the author. Enter a title, note,
optional bookmark and Open or Resolved state. **Save note revision** records
that decision against the exact source edition and chapter. Editing an existing
note adds a version. Every version remains available in its history and the
complete notes download.

The note editor identifies its bound chapter explicitly. Navigating the reader
does not silently move an unfinished note to another chapter. Choose the
chapter in the note editor to change that binding; its prior working draft
remains retained. Returning to that chapter reopens its unfinished text. Saved
notes provide **Open original chapter** and **Edit this note** controls.

When another edition is selected, a prior note offers **Carry into selected
chapter**. Select the actual destination chapter and name the receiving
operator first. Carry-forward creates a new open note linked to its original
note, then the operator can revise or resolve it. The earlier note, author,
source and versions remain intact. A changed or removed chapter therefore
receives an explicit reading decision.

### Receive and compare whole source pairs

Expand **Receive another complete source edition**. Choose the complete
product-and-finance.md and its matching source-index.json and retain the
original source URL or context. Receiving checks the source index schema,
exact companion byte count and SHA-256, complete source catalogue identities,
and both full retained files. A repeated identical pair reuses its original
edition; changed index metadata also forms a distinct retained pair.

The comparison shows added, changed, removed and moved chapters. Each change
opens both complete chapter bodies with the original table, link and code
rendering. The source comparison shows each added, removed or changed original
catalogue record in full. Repeated headings remain distinct according to their
original source-order anchors; a changed order among repeated headings is
presented for review.

This is a comparison of the supplied original editions. It never fetches an
updated provider document while reading them. Explicit external source links
still open their recorded destinations.

### Save, transfer and reopen

**Download complete workspace** exports all retained source editions,
every note version, working drafts and reading position in
scf-companion-reading-workspace.json. **Reopen complete workspace** verifies
each original source pair and note/chapter binding before replacing the
current reading work. Invalid source bytes or an edit made while an import
is being read leave the current workspace in place.

The record format is stellar-forge.companion-reading-workspace.v1. Original
source files have a 16 MiB per-file allowance; the complete workspace has a
64 MiB allowance. These are reader limits. Browser storage capacity varies.
A storage failure keeps the current in-memory work available and asks for the
complete download. Keep that download when moving between browsers or hosts.

**Save offline reading workspace** produces one HTML file containing the
complete reader code, stylesheet, source editions, note versions and drafts.
Opening it provides the same source comparison, receiving, note editing,
search, original downloads and full-workspace export. Later local source
pairs can be received into that file. Its explicit links to the hosted
application retain their recorded URL. The original simple
standaloneCompanion export remains available to existing callers.

The offline file includes its initial complete workspace. Later browser saves
are keyed to that workspace identity. Export the progressed HTML or JSON to
give another operator the actual updated work.

### Maintained source and API

The original grant-companion.html, companion source loader, renderer and
browser manifest remain the product entry. Two dependency-free modules join
that existing component:

| File | Complete role |
| --- | --- |
| dist/grant-companion-editions.mjs | Original pair receiving, immutable editions, chapter/source comparison, notes, retained drafts, complete validation and reopening. |
| dist/grant-companion-reading.mjs | Existing reader integration, editable notebook, source intake/comparison, complete JSON and offline HTML receiving. |

createCompanionEditionModel accepts the maintained parseCompanionMarkdown
function and exposes capture, create, receive, compare, select, reading, note,
draft, carry, reopen and notesMarkdown. The browser calls these same operations;
the complete offline source carries the identical implementations.

activateCompanionReader keeps its original three arguments and now optionally
accepts reading state and an onReading callback as its fourth argument. Its
returned destroy operation releases its original event listeners before an
edition is replaced. Existing simple reader and offline callers retain their
original behavior.

The installed grant-reviewer source selection receives these files through the
existing developer-site component and browser manifest. The manuscript,
source-index composition, submitted answers and grant plan stay under their
current native editors; reading notes are retained with this reader's own
complete original source editions.

### Reopening downloaded and browser copies

The offline reader validates its complete embedded workspace and the browser's saved copy against the same workspace identity. Exact equivalent copies open directly. Differing complete workspaces are presented before the reader opens: the operator chooses the downloaded copy or saved browser copy, with source, note and draft counts visible. Revision counts and timestamps do not establish which mutable reading work is newer.

The copy panel keeps every alternative available for complete JSON download and explicit reopening. Before changing copies, current unsaved reading work is retained as a complete snapshot. Subsequent offline HTML downloads carry all retained alternatives. Browser persistence saves the complete alternatives before updating the selected copy; if storage capacity fails, the earlier browser copy remains intact and the open reader offers complete downloads. An invalid or differently identified browser entry is kept as downloadable original data and cannot replace the embedded reading workspace. The main workspace JSON export contains the selected working copy; the copy panel's archive and offline HTML preserve all alternatives.
