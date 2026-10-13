# Complete PDF extraction and native receiving

The Bank PDF desk receives a complete original PDF, keeps every extracted page and
text item, and lets the operator map and review the source before preparing a Bank
statement. Its working copy retains the original PDF, extraction, account and page
decisions, row and balance interpretations, correction history and saved Bank
imports together.

The local commands in this directory prepare that same working copy, render all
original pages, and export an accepted account interpretation for the maintained
Bank source preview. They use the original PDF.js parser and renderer. Monetary
values still pass through the maintained CSV interpretation and Bank writer.

## Installed source and dependencies

Use the complete merchant Bank installation containing this directory. The
selected PDF feature installs **pdfjs-dist 6.4.299** and **@napi-rs/canvas 1.0.10**
through its normal package manifests. Node.js must be **22.13 or newer**.

The native command resolves the original installed PDF.js package and its
`legacy/build/pdf.mjs`. It checks the actual installed versions and loads CMaps,
standard fonts, ICC and WASM resources from that package directory. An installation
with a separately retained package can select it using `--pdfjs-root /absolute/path/to/pdfjs-dist`.
The browser uses the same local package and matching worker.

Primary implementation references:

- [PDF.js 6.4.299 source release](https://github.com/mozilla/pdf.js/tree/v6.4.299).
- [Original native rendering example](https://github.com/mozilla/pdf.js/blob/v6.4.299/examples/node/pdf2png/pdf2png.mjs).
- [Original page viewport and UserUnit transform](https://github.com/mozilla/pdf.js/blob/v6.4.299/src/display/page_viewport.js).
- [Original text-layer geometry](https://github.com/mozilla/pdf.js/blob/v6.4.299/src/display/text_layer.js).
- [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).

`extractor.mjs` supplies the shared browser/native extraction. `cli.mjs` provides
the local original-file, rendering, export and inspect commands. The maintained
`model.mjs` owns editable interpretation and complete working-copy receiving.
The PDF.js third-party license remains with its installed package.

## Prepare one complete original

Run from this installed source directory, with an existing private output parent:

~~~sh
node cli.mjs extract \
  --input /private/originals/statement.pdf \
  --out /private/receiving/statement-review
~~~

The command reads and binds the complete original bytes, extracts every page,
creates the editable working copy, renders every page through PDF.js's original
native CanvasFactory, and writes the complete report. The output directory must
be new. It contains:

| Member | Complete retained content |
| --- | --- |
| `original/<original-name>` | Exact original PDF bytes |
| `working-copy.json` | Complete editable working copy with original PDF and extraction |
| `extraction.json` | All original pages, text items, marked content, styles and geometry |
| `interpretation-history.json` | Every interpretation revision and saved Bank import |
| `pages/page-0001.png`, etc. | Actual rendering of every original page |
| `review.html` | Original links, page images, all text items, source mappings, balances and history |
| `MANIFEST.json` | Completed output inventory, byte identities, actual runtime versions and opening entry point |

Open `review.html` and the original PDF. Load `working-copy.json` into the Bank
PDF desk at `/bank-statements/pdf/` on the existing Bank application. Map the
printed account, dates, amount columns and opening/closing balances; record
explicit decisions for all pages and candidate rows. The report retains empty
pages and observations alongside text-bearing pages.

The default rendering scale is 1.5. An explicit `--scale 1` or another value from
0.1 through 4 changes render resolution. A page exceeding 25 million render
pixels asks for a smaller explicit scale. Every page remains included.

For an encrypted PDF, put the existing password in an environment variable and
select its name:

~~~sh
node cli.mjs extract \
  --input /private/originals/statement.pdf \
  --out /private/receiving/statement-review \
  --password-env BANK_PDF_PASSWORD
~~~

The password stays out of the working copy, extraction, manifests and command
output. Use the same variable when rendering an exported encrypted working copy.

An explicit `--text-only` prepares the complete original and extracted working
files without page PNGs. The generated report records that choice and links to
the retained original for visual inspection. Normal receiving uses the default
all-page render.

## Export the reviewed working copy

After completing the mapping in the original PDF desk, save the entire working
copy. Inspect it using:

~~~sh
node cli.mjs inspect --working-copy /private/reviewed-statement.json
~~~

This reads the complete working copy and reports its original identity, every
account's reconciliation, page decisions, interpretation revision count and saved
Bank imports. It does not require PDF.js or a renderer.

Export the full editable source, original PDF and all-page report:

~~~sh
node cli.mjs export \
  --working-copy /private/reviewed-statement.json \
  --out /private/receiving/reviewed-statement
~~~

To prepare one explicitly selected account for the existing Bank preview:

~~~sh
node cli.mjs export \
  --working-copy /private/reviewed-statement.json \
  --account SELECTED_ACCOUNT_ID \
  --out /private/receiving/bank-account
~~~

The additional account directory retains all of these members:

- `source-input.json`: the exact original Bank preview envelope,
  `{"source": {"format": "PDF_REVIEW", ...}}`, including the original PDF and
  complete retained working interpretation.
- `reviewed-rows.csv`: all selected cash rows and the explicit opening/closing
  balances, with original page and text-item references.
- `mapping.json`: complete selected account mapping, region, row, balance and page
  review decisions.
- `row-map.json`: every generated CSV record's original PDF location.
- `reconciliation.json`: exact movements, selected original balances and any
  retained difference.

Pass the complete generated preview envelope to the original installed command:

~~~sh
starforge bank-statements source-preview \
  --directory /private/accounting \
  --input /private/receiving/bank-account/accounts/account-001/source-input.json
~~~

Review the original Bank preview and select the matching source-bound account.
The existing Bank application or its documented `apply --action receive-source`
command retains the reviewed original source, stable request, revision and actor.
Subsequent corrections use the original same-PDF/account statement identity and
explicit supersedes flow. Existing receipt matching, posting, closing, accountant
exports and cold reopening remain in that same accounting workspace.

A printed statement whose selected original balances and selected movements do
not reconcile requires `--acknowledge-balance-difference` during account export.
The exact difference stays in the report and Bank preview. This choice does not
change an amount or fabricate a balancing transaction. The Bank's existing close
preview independently evaluates its actual postings and selected balances.

## Geometry and source interpretation

Extraction uses `getTextContent` with marked content included and normalization
disabled. Text items keep the original PDF.js array indices, including empty
items. Each item retains its original text, transform, dimensions, font, writing
direction, end-of-line marker, displayed transform and rotated quadrilateral.
Every page retains its original view box, rotation, UserUnit, displayed dimensions,
viewport transform, styles and language.

Displayed selection rectangles follow the page rotation and UserUnit. They use
text advance and font metrics rather than an image of each glyph. If the source
font lacks ascent/descent metrics, the extraction identifies the fallback ascent
on that page. The original PDF rendering and raw transforms remain available
for inspection. Geometry is retained before clipping to a selected page region.

A caller-owned browser document remains open after extraction. The shared
extractor compares `document.getData()` with the complete original bytes before
extracting. A self-owned PDF.js loading task closes in `finally`. Callers pass a
copy to PDF.js loading so worker transfer cannot detach their retained originals.

The extractor performs no OCR. A page with no extracted text remains a complete
page with an explicit observation; the operator can visually map it or classify
its role in the complete statement. Selection and financial interpretation remain
explicit.

## Receiving limits and recovery

The selected original PDF limit is **16,000,000 bytes**, with **500 pages** and
**500,000 text items**. A full standalone working-copy transfer is at most
**192 MiB**. The extractor and model reject an oversized complete result before
issuing a partial working copy.

The original Bank request limit remains **24,000,000 bytes**. An account export
measures its exact wrapped preview JSON before publication. A larger standalone
working copy can still be exported completely without `--account`; all originals
and interpretations remain available. The Bank UI also measures the exact final
mutation, including its operation fields, before submitting it.

The output directory is create-only. Original and editable working files are
written before page rendering. The final complete manifest is issued after every
requested member succeeds. If rendering or output fails, the command identifies
the existing partial directory and exits unsuccessfully. Preserve those files
and the original input; use a new output directory for a corrected execution.

For cold receiving, copy the complete output directory, open the report and
original, and load its whole `working-copy.json` into the same PDF desk on the
receiving installation. Inspect the retained account decisions and history,
download the original again, then prepare the same account input. The complete
working copy retains all other accounts and pages throughout that course.

## Official multi-page source course

The public [Carson Bank sample statement](https://www.carsonbank.com/wp-content/uploads/2021/01/Sample-Statement.pdf)
contains six pages, wrapped descriptions, check listings in multiple columns,
separate account sections, statement summaries, running balances and a
reconciliation form. It is an issued sample whose printed figures do not all
agree. Keep its printed values and separate account sections exactly as selected;
retain differences for explicit review.

The original source acquisition and native receiving operation are coordinated
in the Bank project thread. Run the complete native command on those original
bytes, inspect all six rendered pages and the actual PDF desk at both wide and
narrow widths, retain the resulting editable working copy and account preview,
and return the complete original artifacts to that same project operation.
