# Complete merchant commercial history

Open **Complete commercial history** in the merchant pricing workspace to use
every committed pricing review and prepared price decision. The recent lists
remain convenient shortcuts. The complete history reads the same original
private manifests and source identities used by saves, comparisons, downloads
and release staging.

## Find and work with an earlier review

1. Choose **Pricing reviews**, enter a label or original source identity, and
   select **Apply filters**. Search includes the review and revision IDs,
   saved label, seller and capture hashes, original session, source range,
   routes and saved source selection. Text is a literal, case-insensitive
   match; it is not a regular expression.
2. Optionally select saved dates, in UTC, and session or retained-history
   observations. Saved dates describe when the commercial review was committed.
   The original observation range remains visible on each record.
3. Use **Next records** and **Previous records**. Choose 25, 50 or 100 records
   per page. The caption reports matching records and total original records
   in the selected history.
4. Open the exact saved report or download its original terms, report, capture
   or manifest. Native settlement companion files remain available where the
   review retained them.
5. Choose **Use as first comparison** and **Use as second comparison** on any
   two results. Those choices remain available while paging, filtering or
   refreshing current working assumptions. The existing comparison opens the
   original reports and explains changed configuration, terms and coverage.
6. **Use assumptions** loads the selected values into the current merchant
   form, preserving the original review. **Prepare price change** opens its
   complete original payment choices, including a review outside the recent
   list. Existing source-change checks and review-before-save behavior apply.

Comparison choices are held in the open page. Reopening the page starts with
the current workspace and its original recent choices. Unsaved commercial and
price-change drafts keep the workspace's existing confirmation and save rules.

## Prepared price decisions and accounting handover

Choose **Prepared price decisions** to inspect every committed configuration
change. Search its label, original review ID or source identity, or filter by
one exact **Source review ID**. Each result offers the same original
configuration, merchant terms, exact changes and retained source package as
the recent list. **Find original pricing review** opens that review's history
record for comparison, source download or another commercial decision.

A decision's configuration and review are immutable. Its **Release staged**
indicator is the current retained release receipt, read when the page loads;
it is not frozen at the selected history head. **Stage retained release** uses
the original source package, reviewed hash and existing release engine.

To reconcile the commercial decision in the accounting workspace, download
the saved pricing review's **Report JSON**. Open **Pricing decisions**, select
that exact file, and choose **Review and retain pricing**. Inspect its payment
alternatives, full quote context and unknown costs, compare retained terms,
then choose **Use these accounting terms** and **Reconcile with these terms**.
The accounting run retains the exact original pricing report and its terms
alongside the merchant's captured native sources. The complete
[accounting review guide](../merchant-settlement-accounting/workspace/PRICING.md)
covers reference labels, original downloads and source-inclusive export.

## Fixed history while work continues

The first history request selects an original committed head. Pagination and
filters keep that head. A new save does not move page boundaries, add records
to an already selected empty history, or change either comparison choice.
**Include latest saves** selects the current head and starts at the first
page with the displayed filters. Changing between reviews and decisions also
starts at that chain's current head.

The displayed selection includes the history kind and original manifest
revision. Native requests additionally bind that selection to the private
workspace's normalized directory identity. After a workspace move or restore
to a different directory, open its current history to obtain its own
selection. An unavailable original head or mismatched cursor returns an
explicit error; pages never silently restart against a different chain.

History selection does not change the current commercial or repricing save
revision. Original create-only successor publication still controls current
saves. Applying earlier assumptions creates a new review through the existing
current-source checks.

## Native read-only command

The existing workspace CLI can inspect retained history without seller
configuration, a live operations listener or an HTTP server:

```sh
node stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/workspace/cli.mjs \
  --commercial-history reviews \
  --state /private/merchant/pricing-workspace \
  --output /private/merchant/history-page-01.json
```

Use `decisions` for prepared price decisions. Omit `--output` to write the
JSON page to standard output. An output file is created privately and must not
already exist. The command does not modify the saved workspace.

For a filtered first page, save a request JSON file:

```json
{
  "query": {
    "text": "October",
    "from": "2026-10-01",
    "to": "2026-10-31",
    "observationKind": "DURABLE_HISTORY"
  },
  "limit": 50
}
```

Pass it through `--history-query /private/merchant/history-request.json`.
For later pages, retain the response's exact `selection`, `query` and
`limit`, and put its `nextCursor` in the request's `cursor` field.
A null `nextCursor` means the last page. Omit selection and cursor to read
the current head. An explicit selection with `revision: null` keeps an
originally empty history empty.

## Native interface

`readCommercialHistory({directory,input})` is exported by
`workspace/model.mjs`. An open workspace exposes
`model.commercialHistory(input)`. The authenticated loopback endpoint is
`POST /api/commercial-history`, using the existing
`x-sf97-workspace` session token.

| Request field | Meaning |
| --- | --- |
| `kind` | `reviews` (default) or `decisions` |
| `selection` | Returned `{scope,kind,revision}`; omit for the current original head |
| `query.text` | Literal search, up to 300 characters |
| `query.from`, `query.to` | Inclusive saved UTC dates |
| `query.observationKind` | Reviews: `SESSION` or `DURABLE_HISTORY` |
| `query.sourceVersion` | Decisions: exact original pricing review ID |
| `limit` | 1–100; default 25 |
| `cursor` | Exact returned next cursor with unchanged selection, query and limit |

The response schema is
`stellar-forge.merchant-commercial-history.v1`. It returns `selection`,
`latestRevision`, `newRecords`, `totalRecords`, `matchedRecords`,
normalized `query`, `limit`, one-based displayed `range`, `nextCursor`
and original summary `rows`. The existing per-version download endpoints
continue to verify and return original file bytes. This index is navigation
metadata; use the workspace's existing complete backup for source-inclusive
transfer and restoration.
