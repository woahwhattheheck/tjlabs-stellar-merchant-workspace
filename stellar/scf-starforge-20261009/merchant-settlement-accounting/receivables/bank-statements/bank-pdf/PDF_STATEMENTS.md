# PDF statements: original pages to reviewed Bank intake

Open **PDF statements** from Bank reconciliation at `/bank-statements/pdf/`. This desk keeps the complete original PDF, every original PDF.js text item and its page coordinates, the editable account/table interpretation, every review decision and actual Bank import bindings. The financial writer is the maintained Bank reconciliation application.

## Install and open

Use the dedicated `merchant-bank-pdf` source selection. It includes the complete Bank product and this PDF desk. Build from the exact committed application source:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --selection merchant-bank-pdf --out /private/bank-pdf-release
```

Prepare the returned archive with the original runtime installer and its actual archive SHA-256. Select the existing native, schema, OpenAPI and operator features plus `--feature bank-pdf`; add `--feature mcp` when using the authenticated accounting host. The PDF feature declares exactly `pdfjs-dist@6.4.299` and `@napi-rs/canvas@1.0.10`. Its package engine requires Node 22.13 or later. Use the same maintained `prepare`, `install`, `inspect --load --source` and runtime-transfer commands described in the Bank installation guide.

Start the original Bank service with the initialized private accounting workspace and its original terms/outbox options. Open Bank reconciliation and choose **PDF statements**. The existing Applications Bank provider starts this same service; the PDF desk is a linked operating page of that application. Browser PDF.js, worker, character maps, standard fonts and other original runtime assets come from the installed local package. No CDN is required.

## Open and retain the whole document

Choose the actual issuer PDF. The desk extracts every page through the pinned PDF.js version and retains original text item order, transforms, font information and displayed geometry. It also renders the original page itself. Use the page selector and zoom controls to inspect all pages. Encrypted originals request the document password for that opening only; the password is never saved in the working copy, extraction or history.

A new working copy is saved in the browser's existing local IndexedDB storage. **Download working copy** retains the complete original PDF bytes, extraction, accounts, regions, rows, balances, page reviews, history and Bank bindings in one editable JSON file. **Open working copy** verifies the retained PDF and extraction identities before reopening it. **Original PDF** downloads the exact original binary.

A storage failure leaves the full current working copy available for download. Saves compare the loaded copy's custody token inside the IndexedDB transaction. If another tab saved a newer edition, the current edition can be preserved with **Save conflict as separate review**, retaining its original lineage and unresolved Bank request without overwriting the other tab. Save the downloaded copy before closing the browser. A new browser or machine can open that full file directly.

PDFs with no usable text still open as original rendered pages. The desk does not perform OCR. Use an explicit source rectangle and manual row entry, keep the printed value in the raw/source fields, and complete the manual page review. Original text and geometry remain unchanged.

## Identify the actual account and period

Create an account interpretation with the bank/institution identifier, printed account identifier, optional branch, account name, currency, decimal precision and actual statement period. Supported Bank precision is zero through six decimal places.

Use separate account interpretations for different accounts printed in the same PDF. A loan schedule or credit facility belongs to its own source context; it must not be added to the checking account's movements merely because it appears in the same document.

Account identity is explicit and later binds to the original Bank account. A changed financial account identity is a different account interpretation. Corrected dates, amounts, descriptions or references on the same PDF account enter the existing same-file interpretation correction workflow.

## Map each table against the rendered page

Select the original page and draw the table rectangle on the rendered PDF. Set its horizontal date, debit/credit or signed-amount, description, reference and optional running-balance columns. Column bounds use the displayed page's scale-one coordinates. The original text item transforms and bounding boxes are retained separately.

Choose the actual date order. A printed date without a year needs an explicit statement year; a two-digit year needs an explicit century. No year is inferred from the current date.

Choose decimal and grouping separators. If the original amounts contain a currency label, enter its exact **Amount prefix** or **Amount suffix**, for example `$`. The raw printed amounts remain in the row. The interpretation strips only that explicit affix and validates exact decimal text. Signed-amount direction, debit/credit columns and parenthesized negative values remain explicit.

Line tolerance groups text on the same printed row. Optional description continuation attaches description-only lines to the preceding candidate while retaining every original item reference. Repeated columns, check lists and different page layouts can have separate regions.

Changing a saved table interpretation returns its existing generated rows to review and preserves their prior decisions in history. Regenerate candidates or explicitly review each retained row; rows no longer covered by the new table must be excluded with a reason.

**Generate candidates** creates editable review rows. It does not receive cash. Review each candidate's date, amount, description, reference and original page selection. Use **Include** for a real movement, **Exclude** with a reason for an original non-cash or repeated display row, or leave it awaiting review. The full row table supports search and pagination.

A repeated displayed check list is commonly a summary of movements already present in the transaction table. Keep its original page classification and exclusion explanation; do not receive it twice. Exact same source item references within cash rows are reported for review.

## Select balances and complete page coverage

Retain the original opening and closing balance values, dates, source rectangles and item references. Select one opening and one closing balance per account. Additional balances may remain as running or other original information.

Review every page, including disclosures, loan pages, check summaries and reconciliation instructions. The page decisions are:

- **Cash mapped:** cash rows on that page have been mapped and reviewed.
- **Other account:** the page belongs to another explicit account or source context.
- **Information:** the page is an informational, repeated summary or disclosure page.
- **Still awaiting manual review:** unfinished; this prevents Bank intake.
- **Manual mapping complete:** manual reading/mapping is finished and its explanation is retained.

All included movements are added using exact decimal arithmetic. The account review displays opening balance, signed movements, calculated closing balance, printed closing balance and difference. An inconsistent original can be received only after explicit acknowledgement of that difference. The original Bank close continues to require valid postings and reconciled balances.

## Original Carson example

The bank's public six-page sample is linked from its disclosure page:

- https://www.carsonbank.com/disclosure/
- https://www.carsonbank.com/wp-content/uploads/2021/01/Sample-Statement.pdf

The printed TRUE CHECKING account 6547 summary gives opening 3,005.93, deposits 18,041.50, withdrawals 14,365.21 and closing 6,682.22. The transaction table presents a different running-balance series beginning 445.28 and ending 942.82. Preserve those distinct original observations and the resulting review difference. Do not insert a balancing movement.

The READY RESERVE account 3216 on the later page has its own principal/interest information. The check list, daily balances and reconciliation pages are also retained and reviewed. The source course operates the original PDF supplied by the bank; a later issuer revision must retain its own exact source identity.

## Preview and receive the original PDF

Select **Preview in Bank** after completing rows, balances and pages. This calls the original `source-preview` endpoint with `format: PDF_REVIEW`. The Bank report preserves the actual PDF as the financial original and the complete working interpretation as `pdfReview`. The generated CSV, its exact mapping, original PDF page/item locations and every original decision remain in the parser report.

Choose an existing Bank account with the same original account identity and currency, or create that bound account using the maintained account writer. After account creation, review the source again against the current accounting revision.

If the same PDF/account was previously received with a different interpretation, select its prior import under **Prior interpretation to correct**. Receiving retains a new report and creates the original Bank correction-review rows. Old financial matches and closes remain in force until their ordinary undo/reopen/correction operations are performed.

Preview identity includes the complete PDF selection and interpretation. A changed description, reference, geometry selection, CSV or review history requires a fresh preview even when totals remain unchanged.

Each mutation retains its original workspace identity, revision, actor, request ID and full body before sending. If a response is interrupted, **Recover original outcome** reads the same operation. **Retry the same request** preserves its original ID and body. Another workspace cannot adopt an unresolved request. Confirmed outcomes are linked into the same working copy.

## Continue reconciliation and reopen source

Open Bank reconciliation for receipt/refund matching, fee and other ledger postings, duplicate decisions, corrections and complete account close/export. This PDF desk adds no financial posting engine.

Use **Open retained bank PDF** to select a prior PDF import in the current accounting workspace. The desk downloads the original PDF plus its complete parser report, reconstructs the original working copy, verifies both retained source identities and reopens all page/table decisions. Continue with a new reviewed correction, preserving the old import.

Bank original-file download returns the exact PDF binary. The parsed report contains the complete generated CSV and all page bindings. The existing account TAR includes those original files and the maintained customer/receipt/close history.

## CLI and full receiving

`starforge bank-pdf extract` reads the actual original PDF and writes the complete working copy, extraction, page renders, original binary and manifest. `inspect` reads a complete working copy. `export` writes the whole editable source package and, for a selected reviewed account, the complete `{source: ...}` request for the original Bank `source-preview` command. See **EXTRACTION.md** for exact flags, local rendering, password handling and complete file identities.

The CLI and browser use the same model and PDF.js extraction. Renderer output is for visual review; the Bank source remains the original PDF binary and explicit review.

## Limits and supported paths

One original PDF is limited to 16,000,000 bytes, 500 pages and 500,000 original text items. A working copy supports 50,000 review rows and a complete 192 MiB compact JSON transfer. Every edit and import checks the whole transferable representation.

The Bank HTTP/CLI request limit remains 24,000,000 bytes. The browser and native export preflight the exact complete request, including the original PDF and full interpretation. A larger valid working copy can still be saved, downloaded, inspected and rendered in the standalone desk. For Bank receiving, use an issuer-provided smaller original statement edition that fits the existing limit; do not silently drop extraction, history or source bytes.

PDF page mappings use this dedicated working-copy format. Generic recurring-source profiles, statement collections and configured-source preparation APIs explicitly reject `PDF_REVIEW` and point here. Those formats cannot silently discard PDF interpretation data. The existing Bank financial API and original CLI receive the full reviewed PDF request directly.

## Commission the actual outgoing application

Open the installed page and inspect the actual original document at desktop and 390 px width. Operate original open, page navigation, mapping, edits, include/exclude, balance/page review, download, Bank preview, retained-source reopen and correction. Download the full working copy and reopen it in a clean browser context. Inspect the downloaded source files and page renders, and retain the actual operating result with the application's original case.
