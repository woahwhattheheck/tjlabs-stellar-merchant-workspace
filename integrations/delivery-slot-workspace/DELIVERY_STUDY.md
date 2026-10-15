# Delivery Slot Study — complete operating guide

## Start with one real delivery slot

This workbench compares a supplier-declared order history, the explicit cutoff rule, actual production counts and buyer picking snapshots. Keep the existing ordering, invoicing and payment system authoritative. The eight CSVs are the workbench's declared comparison format. Adapt an authorized source export to this explicit contract and retain the original mapping.

Choose one named slot, its actual fulfilment time, the explicit order cutoff including UTC offset, and the supplier's rule for an amendment received exactly at that cutoff. Enter before or at_or_before. If a product closes earlier, record its specific cutoff in slot_products. A copied slot has its own ID and dates. Do not copy last week's timestamps unchanged or infer Sunday, regional, cake or holiday rules from another account.

The source owner should provide complete originals. A working edit creates another named source edition; previous originals and decisions remain. All eight tables are explicit even when a table has only its header. Do not substitute a missing file with an unexplained empty table.

## Files and startup

- delivery-slot-core.js and delivery-slot-core.mjs contain the same production factory.
- vendor/archive-codec.js/.mjs retain exact UTF-8 and calculate SHA-256.
- delivery-slot-native.mjs performs a create-only native receive, review or report.
- examples/sources contains the complete authored eight-file bakery example.
- examples/worked-workspace.json retains the original and corrected editions plus review history.
- examples/worked-report.html has ordinary readable tables, complete source and workspace downloads.
- receiving/source-course.mjs is the complete authored operating course.
- receiving/native-course.mjs is the same browser-to-native-to-browser continuation course.
- The integrated browser desk adds unfinished forms, original-byte receipts, selected views and independently recoverable saved copies. Its whole export is the continuation file.

Run the example from the restored directory with a current Node runtime supporting ES modules and BigInt:

```sh
node delivery-slot-native.mjs --workspace examples/worked-workspace.json --out output-study
node receiving/run-source-course.mjs
node receiving/run-native-course.mjs new-native-receiving
```

Output directories must be new. The native runner refuses to overwrite an existing package. A rejected command writes the unchanged accepted workspace, the exact attempted command and all originals it could read, with exit code1. A complete report run exits0 even when its report contains operational attention. Read attempt.json and the actual comparison, rather than treating process completion as a balanced delivery.

## Eight input families

| Table | Role and identity |
|---|---|
| slots | Unique slot_id; name, cutoff_at, cutoff_boundary, fulfilment_at and policy reference. |
| products | Unique product_id; explicit base_unit and quantity_kind whole or decimal. |
| unit_packs | Unique product_id+unit; positive base_quantity conversion and quantity_step. Every product includes its base unit with factor1. |
| buyers | Unique buyer_id and current display name. |
| slot_products | Unique slot_id+product_id; optional product cutoff override, declared capacity and reference. Blank capacity quantity and unit together mean unknown. |
| order_revisions | Unique revision_id and positive revision number within slot+order+line. Each row fully replaces the line, including a cancellation. |
| production | One current snapshot per slot+product, unique observation_id, actual count/time, and partial or complete coverage. |
| picking | One current snapshot per slot+order+line, unique observation_id, count/time and picked or dispatched state. |

INTAKE_CONTRACT.json contains every literal header and API shape. Source rows retain physical start/end line numbers, including quoted multiline values. Unknown extra columns remain in the original CSV, although the declared comparison uses the required columns.

Buyer and product cannot change inside one line's history. Cancel that line and create a distinct line when changing product. Different numeric revision numbers may share the same timestamp; their explicit revision order then decides. Repeated numbers or timestamp inversion require correction by the source owner. Never silently choose between conflicting exports.

Confirmed quantities must be positive. A cancellation is a full row with quantity0 and an explicit declared unit. A post-cutoff cancellation remains late until deliberately accepted. Its earlier eligible quantity remains the cutoff baseline.

## Exact quantities and snapshots

Quantities, factors and steps use nonnegative plain decimals with at most18 integer digits and9 decimal places; exponent notation is not accepted. The engine uses BigInt fixed scales internally. It never rounds a declared conversion through binary floating point.

An order quantity must be a multiple of its declared quantity_step. A whole product must convert to an integer number of its base units. Two dozen croissants at factor12 means24 pieces. Three declared packs at0.75kg each means2.25kg. A loaf, tray, kilogram and different product SKU do not enter a single cross-product total.

Capacity0 is a declared zero, while blank capacity is unknown. Production snapshots are independent counts, not movements to add. Corrected counts belong to a new source edition. Partial production remains explicitly partial even when its current numerical difference is zero.

Pick coverage counts positive reviewed-demand lines. A cancelled or late-only zero-demand line does not require an invented zero pick. Any actual pick observed on that zero-demand line is still included and compared, so picking a cancelled order remains visible. Product pickDifference is unknown while a required positive-demand line lacks its snapshot; observed quantities and required/observed line counts remain visible. A picked row is not silently relabeled dispatched.

## Cutoff and explicit exceptions

The original baseline chooses the highest eligible revision for each stable line. Every superseded and late revision remains in the report. The reviewed requirement initially equals the cutoff requirement.

An operator may choose accept_late for one exact retained late revision. That decision changes only the separately labeled reviewed requirement. Its original cutoff quantity and source revision remain visible. A retain_cutoff decision restores the reviewed basis to the baseline. Investigate and accept_expected annotate the selected line, product or pick without changing quantities or resetting an earlier explicit late selection.

Each decision records reviewer, reason, evidence, source edition/hash and previousReviewId. The latter must name the latest review on the same exact edition, subject type and subject ID, or null for the first. This preserves corrections and rejects stale review drafts. A new source edition does not inherit a prior exception silently.

Line subject IDs are analysis.lines[].key; product IDs are analysis.products[].key. A pick subject uses the associated line key when a pick snapshot exists. All line subjects remain reviewable even without an attention row. A retained decision documents an operator's instruction, not a message sent to a buyer or a physical production action.

## Authored worked example and hand calculation

The example uses fulfilment on Saturday 24 October 2026 and a cut-off on Thursday 22 October at 08:00 +01:00 with the before boundary. All names, quantities and observations are authored for this demonstration.

Buyer A replaces 10 loaves with 12 before cut-off, then asks for 20 at 08:05. Buyer B orders 2 dozen croissants. Buyer C requests 6 loaves and cancels before cut-off. The original white-loaf baseline is therefore 12 + 0 = 12. Croissants are 2 × 12 = 24. Declared capacities of 15 loaves and 20 croissants give no loaf excess and an excess of 4 croissants. Independent production counts of 12 loaves and 22 croissants, with matching picks, give a two-croissant shortage.

The course explicitly selects Buyer A's late request for 20 loaves. The baseline remains 12; the reviewed requirement of 20 exceeds capacity 15 by 5. A later investigation note preserves that selection. An explicit correction returns to cut-off. The corrected second source edition retains the earlier complete originals and three earlier decisions, but adopts no old decision automatically.

The separate decimal course proves 3 × 0.75 kg = 2.25 kg exactly. Boundary variations show that an amendment at 08:00 is late under before and eligible under at_or_before. Missing capacity, declared zero, duplicate count rejection and malformed native bytes are exercised in the same operating course.

## Native continuation

The native command file contains action receive or review and a complete input object. For receive, sourceFiles may map all eight table names to {path,name}; relative paths are resolved beside the command file. The runner reads each original once and reuses those exact bytes for normalization, receipts and package outputs.

```sh
node delivery-slot-native.mjs --workspace complete-desk.json --command receive-command.json --out new-intake
```

The browser wrapper schema is tjlabs.delivery-slot-desk.v1. An incoming wrapper's entire session is preserved in the current workspace.json while its accepted core is updated. core-workspace.json is also supplied; original-input-workspace.json keeps the exact prior bytes. nativeContinuation retains the attempted original command, complete source receipts, outcome and earlier continuation. Existing unfinished review drafts keep their original source binding. They are not rewritten to refer to the newest edition.

Return current workspace.json to the desk. The selected old edition and its unfinished reviews remain selected; explicitly choose the newly appended edition to inspect its comparison. Inspect the retained native continuation, the new edition and any older unfinished fields. A failed receive leaves the accepted editions and browser fields intact while retaining malformed original bytes for repair. Clearing retained continuation is an explicit operator action after preserving the full current copy.

## Ordinary exports and practical review

Derived lines, revisions, products and attention CSVs use the same analysis as the visible report. Formula-like source labels are neutralized in these derived spreadsheet cells; canonical signed numeric differences remain numeric. The eight original source downloads are byte-exact UTF-8 and are never modified by that spreadsheet protection.

The report preserves the baseline and reviewed demand, full revisions, effective cutoff and boundary, capacities, observation IDs, partial/complete status, references and decision history. Complete-source and workspace downloads are embedded in the standalone report.

Before using a production or pick figure, check its product/base unit, snapshot coverage, observation date and source reference. A review can explain a discrepancy, but it does not erase the delta. Refresh corrected actual counts into a new edition and retain the older report for the handoff.

## Verification and continuation evidence

The package's actual-source record names the production functions and authored originals executed. The native receiving record explicitly distinguishes adapter execution from an equipped native/browser run. Continue the existing equipped browser chapter with the caller-owned page; use the current full desk and exact exported originals. Keep desktop/narrow screenshots and actual report/download/reopen returns with that original receiver.

No supplier, bakery or customer is contacted by this engine. It does not change live orders, payment terms, invoices, inventory, production equipment or dispatch records. Those actions remain in their actual operating systems and are reflected here through supplied source editions.
