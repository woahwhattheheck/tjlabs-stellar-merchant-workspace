# Invoice register and complete operational exports

Open **Applications → Merchant invoices**, or **Received merchant review** for an
existing received project. The invoice register uses the same merchant store,
operator credential and original invoice detail workflow.

## Find and review invoices

Enter a reference, description or invoice ID and choose **Apply filters**.
Search treats punctuation literally; SQL wildcard characters do not expand the
selection. Case-insensitive matching follows SQLite's built-in case comparison.

The state filter uses the original recorded invoice state. Creation dates are
inclusive UTC calendar dates. A payment-option filter matches an asset ID and
network on the same frozen offered rail, including historical configurations.
It selects invoices offering that option; every original offered rail remains
visible in the invoice and export.

The register shows 50 invoices per page, newest first, with the exact matching
count. The overview cards continue to describe the complete merchant workspace.
Select any invoice for its original payment request, receipt marker, activity,
reconciliation and completed file. Filtering does not close the selected detail.

**Previous** and **Next** retain the exact source history revision. If the merchant
changes while paging, the service asks you to **Refresh** before continuing. It
does not silently skip records by combining offsets from different revisions.
Refresh keeps the applied filters and returns to the first page. The first page
updates automatically; later pages retain their selection until you navigate or
refresh. Original payment/delivery detail and project handover continue updating.

Editing a filter does not alter an already displayed selection until **Apply
filters** is selected. The export always uses those applied filters.

## Export the full selected register

Choose **Download CSV** or **Download JSON**. Each export contains every matching
invoice across all pages, read together under the original owner's synchronous
SQLite read transaction. The application writes that complete selection to a
private temporary file, then streams the file to the browser. It does not build
an array of every selected invoice in memory.

The export must match the revision displayed in the register. If new original
activity has arrived, refresh and review the selection before exporting again.
No partial export is offered when selection validation or file preparation fails.

The JSON document contains:

- Original store ID, complete history sequence, capture timestamp and live/review
  mode.
- The exact applied filters, matching invoice count and whole-workspace state
  counts.
- Every matching invoice's original identity, creation/update timestamps,
  tenant/resource version, charge/payment IDs and complete offered rails.
- Recorded receipt-verification marker and digest, separately from fulfillment
  state, retained-return descriptor and saved-result descriptor.
- The original result filename, MIME type, byte count and SHA-256, and any
  recorded safe error code.

The CSV contains one row per offered payment option, repeating its invoice
identity and outcome columns. Its row count can therefore exceed its invoice
count. The same store/history/capture identity is present on every row.
Empty selections produce a header-only CSV or an empty JSON invoice array.

### Exact amount and outcome meaning

Amounts are positive canonical integer atomic strings, with explicit asset ID,
asset contract/mint, network, decimals, recipient and version bindings. They are
alternative offered prices. They are not added together or presented as
settled revenue.

Import atomic-amount, identifier and digest columns into a spreadsheet as **Text**
to retain every digit. JSON preserves exact strings without spreadsheet type
inference. CSV cells containing spreadsheet-active text receive a leading
apostrophe; quoted ordinary text and canonical amount strings retain their
original characters.

**RECORDED_VERIFIED** means the original merchant stored successful receipt
verification. **recordedComplete** means its fulfillment is COMPLETE and its
retained-return and saved-result descriptors agree, including payment identity.
A completed fulfillment can precede the final order projection; that interval
is reported separately. These exports describe retained records. The existing
**Download result** action checks actual original file bytes before delivery.

The export omits payment signatures, bearer credentials, webhook/provider
payloads, configuration secrets, local result paths and original customer file
contents. Complete private project transfer remains in **Project handover**.

### Download lifetime

An authenticated export returns one random, single-use download link valid for
two minutes. The server keeps at most eight prepared downloads concurrently.
It removes each private spool after completion/interruption, expiry or graceful
server closure. Download links contain no operator credential and should remain
private. A failed browser download can be prepared again from the current
reviewed register.

## HTTP and native module interface

All register API routes use the existing Bearer operator authentication and
origin policy. Query parameters are optional unless noted:

| Route | Selection and result |
| --- | --- |
| GET /api/register | q, state, from, to, assetId, network; limit 1–200 (default 50), cursor and optional revision. Returns source, selection, counts, railOptions, orders and page; also the existing public config and live/review mode. |
| GET /api/register/export | The same filters, required revision and format csv or json. Exports the full selection, without a cursor. Returns the exact file identity, invoice/offer counts and one-use download URL. |
| GET /downloads/invoices/:id | Consume that unexpired single-use download and stream its full checked file. |

Unknown or duplicate parameters are rejected. Date strings use YYYY-MM-DD.
The cursor is tied to the exact normalized filters and original store/history
revision; it is not a substitute for operator authentication.

The contribution exports **./merchant/x402api/invoice-register**. Native callers
can use normalizeInvoiceSelection, readInvoiceRegister and
createInvoiceRegisterExport with the existing workspace instance.
Read functions acquire only a synchronous read transaction on that instance;
they do not start a second MerchantStore, reconcile payment, run fulfillment
or append business history. A native export caller must invoke its returned
cleanup function after consuming the temporary file.

The unchanged /api/state interface remains available to existing native
receivers. The operator browser uses /api/register for bounded invoice paging.
Received-project review serves the same GET routes through its read-only
MerchantStore facade.

## Source and portability

The complete installed component includes invoice-register.mjs and this guide.
Both the maintained directory handover and original receiving programme select
them explicitly. Current complete project exports pin the register source with
the rest of their portable-capable source edition. Earlier projects retain their
original source and receive without requiring a file that did not yet exist.

The register adds no schema migration, provider dependency, background service,
package installation, Actions workflow or paid operation.
