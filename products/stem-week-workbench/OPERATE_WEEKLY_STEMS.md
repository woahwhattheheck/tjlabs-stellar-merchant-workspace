# Weekly flower supply, recipes and committed demand

This is a complete source-preserving weekly planning engine. It takes four grower-supplied CSV tables and keeps the original text, filename, byte length and SHA-256 for every edition. Its calculations use integer stems and exact chosen variety identities. A source correction creates a new edition; a recorded decision never silently changes the quantities.

The current production workspace begins empty. The supplied worked example is explicitly authored instructional data, separate from any researched farm's actual records. Start with the farm's own chosen week, actual source files and recipe decisions.

## Start with a real week and an explicit operating scope

Choose a real Monday date in the farm's local calendar, such as 2026-10-19. A week is a calendar label, not a UTC timestamp; the engine does not shift a farm's week across timezones. Every supply and commitment row carries its own week. The selected week must exist in the retained source.

Keep one exact variety ID for each genuinely interchangeable cut-stem variety. Crop, variety and role are descriptive fields; similar names, colors or roles do not authorize substitution. Two differently cased IDs remain distinct. Plant starts, tubers, dormant material and uncut propagation cuttings are separate inventory units and belong outside these stem tables. A variety ID is a declared cut-stem identity, not a unit converter.

For a mixed bucket sold as 60–80 stems, the grower must choose the exact recipe for the specific commitment. A total stem range does not promise any particular variety or premium flower. Palette preferences, grower-choice terms and premium quotas must be represented by the grower's chosen recipe and source notes. Change the recipe in a new edition when that decision changes.

A six- or twelve-bouquet prepaid membership with no fixed pickup dates is not six or twelve confirmed weekly commitments. Keep the original entitlement and policy in the commissioning notes. A tentative row can represent an explicitly chosen, dated scenario. Promote a specific dated allocation to confirmed only after the farm establishes that obligation. This model does not invent a redemption schedule.

## Four original CSV tables

All tables require headers even when there are no data rows. UTF-8 BOM, CRLF and quoted cells are retained in the source original. The parser accepts ordinary quoted CSV, doubled quotes and embedded newlines. Unknown or duplicate headers, wrong row lengths, malformed quotes and invalid cross-references are rejected before adoption.

### Varieties

Required columns:

variety_id,crop,variety,role

The ID is exact, unique and supplied by the grower. Crop and variety are required text. Role may be empty and is descriptive. Do not merge varieties merely because their display names look alike.

### Supply

Columns:

supply_id,variety_id,week_start,basis,stems,source_ref,origin

The first six columns are required. The origin column is optional for compatibility; when absent, the origin is explicitly recorded as unspecified. When supplied it must be one of:

- own-grown
- local-buy-in
- other-buy-in
- unspecified

Each row is a distinct, non-overlapping supply contribution. Repeated snapshots of the same harvest or received bunch must not be given new IDs and added as separate stock. Combine or correct the underlying source explicitly, retain its prior edition, and document the rule.

Basis is projected or actual. A projected purchase is not a received purchase. Count actual buy-in only after the relevant receipt/count is known, with its source reference. The selected plan uses one basis and never adds projected and actual figures.

Stems is a canonical nonnegative integer string. Zero is a real observed zero; a missing count is represented by absence of that basis row. Blank stems, decimal stems, negative stems, scientific notation and leading-zero variants are rejected. Every row requires a meaningful source_ref.

Completeness is checked for each variety and every origin present in that week. If a local-buy-in projection exists but no local-buy-in actual count exists, the actual plan remains incomplete even if own-grown actual stems are present. The table shows the known actual subtotal, missing origins and an unknown final delta. It does not declare the promise covered from a partial count. Record an actual zero when the grower has established that none was received.

### Recipes

Required columns:

recipe_id,variety_id,stems_per_piece

Each recipe contains one or more unique exact-variety lines. stems_per_piece is a positive integer. The recipe and variety pair is unique. Use a new recipe ID when two materially different recipes must coexist in an edition. An edited recipe in a new edition preserves the earlier complete recipe and original sources.

Wedding arrangements, CSA bouquets, market preparations and wholesale pieces use this same explicit representation. A confirmed CSA line consumes the declared varieties; it does not draw from an undifferentiated surplus pool.

### Commitments

Required columns:

commitment_id,week_start,channel,recipe_id,quantity,buffer_bps,status,priority,source_ref

Allowed channels: wedding, csa, market, wholesale, other.

Allowed statuses: confirmed, tentative, cancelled.

Quantity is a positive integer count of pieces or shares. The recipe establishes stems per piece. buffer_bps is an integer from 0 to 10000. For example, 1250 means 12.5% extra. The buffer is applied and rounded upward independently for each commitment/variety line:

required stems = ceil(stems per piece × piece quantity × (10000 + buffer_bps) / 10000)

This intentionally keeps each variety's buffered demand explicit. It can differ from buffering a total bouquet count once and redistributing it. The engine uses exact integer intermediate arithmetic and rejects totals beyond safe integer output range.

Priority is a nonnegative integer. Lower numbers appear first; equal priorities use exact commitment-ID ordering. It supplies a deterministic harvest/pull sequence, not an optimization or a statement about contractual importance. The grower chooses it.

Confirmed rows alone enter firm demand and harvest allocation. Tentative rows remain visible with separate demand. Cancelled rows remain in the source and commitment view but contribute no firm or tentative demand. Each row retains its actual source_ref and dated policy basis. Conflicting generic and product-specific fulfillment rules remain explicit in the edition notes and original source references.

## Read a weekly plan

The plan returns one row per relevant exact variety, with projected and actual counts, source-labeled origin totals, the selected known subtotal, completeness, firm and tentative demand, delta, shortage and surplus. Missing numeric results use null and display as Missing; an observed zero remains the number zero.

The summary labels totals as known where another variety is incomplete. A five-stem dahlia surplus does not cover a six-stem rose shortage. Both figures remain visible.

Projected-versus-actual difference is produced only when both bases exist for every known origin of that variety. Missing measurements are not assigned zero or a fabricated error percentage.

The harvest/pull list walks confirmed commitments in explicit priority order and allocates the available selected-basis count once. It includes base stems, buffer stems, required stems, proposed allocated stems and short stems. A projected-basis allocation is a planning allocation. An actual-basis allocation uses recorded counts; neither is a record that a worker has harvested, packed or delivered the order. Incomplete supply leaves allocation and shortfall unknown.

The CSA/share list preserves each dated commitment, status, quantity, exact recipe lines and allocation. It does not generate customer names, membership entitlements or unbooked pickup dates.

## Decisions, correction history and source editions

A decision targets one exact variety or commitment within an edition, week and basis. Allowed actions are buy-in, reduce, substitute, accept-shortfall and hold. Record the grower/reviewer, reason, optional integer quantity and useful evidence/reference.

A decision is a planning or receiving note. A buy-in note does not add a receipt. A reduction note does not lower a commitment. A substitution note does not rewrite a recipe. To change the calculation, receive the corrected full source tables as a new named edition.

Reuse the same decision ID to correct a note for the same source selection and target. The latest revision appears in current decisions, and every earlier revision remains in decisionHistory and the decisions CSV. A correction ID cannot migrate to a new edition, basis, week or target. Use a new decision ID after reviewing the new source context.

Each edition retains all four complete source originals once. Reopen recalculates source byte identities, table validity, edition identity, decision binding and the whole workspace hash before returning a candidate. The UI must adopt only a successfully returned candidate and preserve unfinished forms independently. A hash detects accidental content changes; it is not a signed grower approval or access-control system.

## Complete authored example and hand calculation

The included example uses the week of 19 October 2026. All figures and source references are authored demonstration records.

Rose actual supply is 30 own-grown plus 4 local buy-in, giving 34; its projection is 40 plus 4, giving 44. Zinnia has a literal actual zero and a projection of 25. Basil has a projection of 12 and no actual count. Dahlia has 5 projected and 5 actual.

The wedding is two pieces, each requiring 8 roses and 3 zinnias, with a 12.5% buffer. Its exact lines are ceil(16×1.125)=18 roses and ceil(6×1.125)=7 zinnias. Three scheduled CSA shares require 12 roses, 6 zinnias and 3 basil stems. One confirmed market preparation requires 10 roses. A tentative premium wholesale quote requires 8 dahlias but contributes no firm demand. A cancelled wedding remains visible without demand.

Firm demand is therefore 40 roses, 13 zinnias and 3 basil stems: 56 total. Known actual supply is 34+0+5=39. Known shortages are 6 roses plus 13 zinnias, totaling 19. Basil remains unknown, and 5 dahlias remain a distinct surplus. These quantities must not be netted into a misleading overall coverage figure.

Rose pull allocation is 18 to the wedding, 12 to the CSA and 4 to the market preparation, with 6 still short. Zinnia allocations are zero. Basil allocation is unknown.

The grower first records a six-rose buy-in action, then corrects that same decision to hold while checking a later cut. Both notes remain; the rose shortage stays six.

A new corrected source edition records 40 own-grown roses plus the original 4 local stems, 15 actual zinnias and 3 actual basil stems. Actual supply becomes 67 against the same 56 firm stems. The corrected result is zero shortages and 11 surplus stems: 4 roses, 2 zinnias and 5 dahlias. The previous decisions stay attached to the original edition. The prior source, including its BOM and CRLF, remains exact.

## Native operation

Requires Node.js 18 or later. The package has no runtime dependency installation. It includes classic browser source, an ES module and the complete upstream MIT source/license.

From the materialized package:

node run-course.mjs NEW_COURSE_DIRECTORY

This runs the maintained complete authored source course and creates its result in a new directory. The same course was executed against the production source in this delivery; native Node execution remains available through this runner.

Create a new working package from original CSV files:

node cli.mjs receive --manifest examples/native-manifest.json --out NEW_WEEK_DIRECTORY

A manifest declares workspace id/label, edition id/label/notes, all four source file paths, and selected week/basis. Paths are relative to the manifest file. CSV bytes are decoded strictly as UTF-8 while preserving BOM. Files are read once and frozen into the source edition.

To add a corrected edition:

node cli.mjs receive --workspace PRIOR_DIRECTORY/workspace.json --manifest CORRECTION_MANIFEST.json --out NEW_CORRECTION_DIRECTORY

To record or correct a decision:

node cli.mjs decide --workspace PRIOR_DIRECTORY/workspace.json --decision DECISION.json --out NEW_DECISION_DIRECTORY

To export another retained selection:

node cli.mjs report --workspace PRIOR_DIRECTORY/workspace.json --selection SELECTION.json --out NEW_REPORT_DIRECTORY

Every output directory must be new. The CLI never overwrites an earlier package. It writes complete workspace.json first, then plan.json, report.html, four CSVs and the exact original CSVs for every edition. COMPLETE.json is written last. An interrupted output directory can retain useful earlier files; absence of COMPLETE.json means packaging did not finish. Use another new directory after correcting an error. Diagnostics return a nonzero exit code.

The ordinary report contains the complete plan, decisions, source originals and whole retained workspace. Keep it private when actual farm business records are added. The source bank materializer independently checks every file hash and refuses unsafe paths or an existing output directory.

## Public math and this complementary engine

The unchanged MIT upstream flower-farm-math source is preserved under vendor/flower-farm-math. Its reconcile function aggregates names case-insensitively and offers a flexible scalar CSA-surplus calculation.

This engine passes only validated, complete selected-basis variety counts and firm explicit recipe demand to that original function. Exact IDs are encoded as UTF-8 hex so case differences cannot be merged by the vendor's lowercase keys. The vendor comparison is retained separately with included/excluded variety IDs and its exact result. Missing-count varieties stay excluded from that comparison and remain visible in the primary plan.

Explicit CSA recipes are already included in named firm demand. The flexible vendor CSA surplus pool is not used to imply variety, palette or premium-quota fulfillment. No upstream defaults are substituted for a grower's chosen recipe or inventory.


## Browser workspace receiving

The CLI --workspace option accepts a complete tjlabs.stem-week-desk.v1 JSON as well as pure core workspace JSON. Its authoritative .workspace reopens before any output; the whole original wrapper, including session drafts and an original JSON BOM, is retained unchanged as browser-input-workspace.json. COMPLETE.json records its byte count and SHA-256. The new workspace.json contains the continued core result, while browser-input-workspace.json keeps the prior editor and unfinished writing available for independent reopening.
