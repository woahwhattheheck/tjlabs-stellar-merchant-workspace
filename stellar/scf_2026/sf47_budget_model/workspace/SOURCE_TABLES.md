# Plan from source tables

Open **Source tables** in the original Grant Operations planning application. The tab turns complete work-package, milestone, contributor and assignment tables into a reviewed native planning revision. It uses the existing plan, calculator, saved versions and export.

A complete workflow is:

1. Select the intended saved plan.
2. Create source tables from that saved plan, receive CSV/TSV files, or receive an already-reviewed Source Tables document.
3. Map the source columns and exact member identities. Review every included row and any exclusions.
4. Calculate the complete native preview. Read the proposed changes, prices, work windows, contributor capacity and conditional payment schedule.
5. Apply the reviewed changes to the working plan and save a named revision.
6. Download the complete native planning ZIP. Receive it in **Planning edition** inside **Prepare submission**, then prepare and apply its budget and roadmap text.

## Start with the complete existing plan

**Create source tables from saved plan** exports the existing package and milestone fields into complete editable CSV source editions. Nonempty contributor and assignment tables are included too. Their fields, exact decimal values and native identities remain present. Empty capacity tables can be added later when actual contributor inputs are available.

The saved plan is the comparison baseline. Its complete scenario metadata, source identity, current revision and planning settings stay in the source project. The original native plan retains its source, deployment details and saved history.

**Rebase on saved plan** deliberately chooses the currently saved native revision as the next comparison baseline. It preserves all source editions, mappings, row choices and prior source-import reviews. Save other changes in the native draft before rebasing and preparing another table import.

## Receive source material

Choose **Work packages**, **Milestones**, **Contributors** or **Assignments**.

**Open CSV or TSV** receives a complete UTF-8 file. Select the delimiter and whether the first record contains headers. The source parser handles quoted delimiters, doubled quotes and line breaks inside a quoted cell. It retains the original source text and the original record and line numbers.

**Open reviewed Source Tables project** receives one selected complete document from an existing Source Tables project. Every edition, reviewed mapping and original source byte stays with that document.

**Receive next source edition** adds a successor to the same table. Previous editions and reviews remain available. Selecting another source edition leaves its existing mapping editable; review that selected combination before calculating the plan.

**Download original source** reproduces the selected source text. The complete portable source project retains the original filename, byte length, acquisition time and source hash for every edition.

## Read source editions and reviews

The source selector shows the received date and time, including the local time zone, and a readable file size. Source rows use **Empty** for an empty value and **Not provided** for a field omitted by the mapping. **Download original source** retains the complete source text, and source details contain its recorded timestamp and exact byte count.

Plan changes show labeled before-and-after fields. Contributor names, capacity sources, assignments and payment inputs are readable in the preview. Saved source-import reviews include their dates, notes and complete changes; their source and calculation details remain available within each review.

## Source parsing and column types

Expand **Source parsing and column types** to set the delimiter, header and empty-record choices. Applying new parsing choices rebuilds the source-column mapping; then review the planning-field bindings.

Each source column has an explicit output name, inclusion choice, type, empty-cell handling, whitespace choice, record-key selection and optional unit. Integer text and decimal text preserve values such as long identifiers and decimal scale. Native USD amounts, rates and hours enter the planner as decimal text.

A record key makes a comparison between editions useful: select a stable package ID, tranche number, contributor ID, or the package/contributor pair. The complete reviewed output stays attached to its exact source and mapping.

**Review current table mapping** freezes that source/transform combination. Receiving a changed source or changing its mapping requires a new table review before the native preview.

## Planning field mapping

Every planning field explicitly chooses one source:

| Choice | Result |
| --- | --- |
| A reviewed source column | Read the value from that exact output field. |
| Explicit constant | Apply the entered value to each included source row. |
| Matching existing value | Retain that field from the native row with the mapped identity. |

Row identities come from source columns or explicit constants. Existing-value matching becomes available after the row identity is resolved. A new native row needs its complete required fields.

A **member map** is a complete JSON object mapping source values to exact native identifiers or categories. For example:

~~~json
{
  "T1-resource": "T1-merchant-resource-integration",
  "T1-handover": "T1-merchant-authority-handover"
}
~~~

When a member map is present, every used source value needs an entry. An empty member-map field uses the reviewed source value directly. This prevents an abbreviated spreadsheet label from accidentally creating a second native work package.

### Work packages

| Field | Meaning |
| --- | --- |
| id | Original or newly selected native package identity. |
| tranche | The package's tranche, 1, 2 or 3. |
| start_day / end_day | Relative work window supplied to the original calculator. |
| estimated_hours | Exact planned hours. |
| assumed_hourly_rate_usd | Exact hourly-rate input when using hours pricing. |
| amount_usd | Complete fixed-price input, or the source amount retained alongside hours pricing. |
| category | A category supported by the selected native model. |
| remaining_work | The complete development scope. |
| measurable_proof | The complete completion assessment. |
| pricing_mode | Explicitly select hours or fixed. |

The native calculator determines the final amount. In hours mode, it multiplies hours by rate and applies its original Decimal rounding. In fixed mode, it uses the entered complete amount. The resulting package total must match the explicit requested award under the native model.

The current original model recognizes core-development, frontend-ux, verification and release. Its eligibility choices belong to that selected source model. Review current issuer guidance and the actual application track alongside the proposed work.

### Milestones

A milestone table maps tranche, submission day, modeled review/payment delay, the complete deliverable and completion assessment. The original planner validates the three ordered tranches, relative dates and complete payment model.

### Contributors and assignments

Contributors map native ID, name, weekly capacity and its source note. Assignments map package ID, contributor ID and exact hours. The original planner validates references and assignment totals, then shows unassigned hours, capacity requirements and days above each entered contributor capacity.

Keep actual capacity sources in the contributor note. Empty capacity remains empty until it is entered.

## Include, exclude, merge and replace

All source data rows are shown with their original record and line. An excluded row requires a reason before calculating the native preview. Its source bytes and decision remain in the project. Pagination changes only the visible portion of the table.

Each role chooses one collection mode:

| Mode | Effect |
| --- | --- |
| Merge by identity | Replace matching rows with the included source values, add new identities, and retain other existing native rows. |
| Replace collection | Use the complete included source rows as that native collection. Omitted native rows appear as removals in the preview. |

The source file's row order remains available. Milestone output follows its explicit tranche identities.

If a replacement removes a package or contributor referenced by existing assignments or payment settings, choose how to handle those dependencies. **Preserve existing dependent records** requires resolving the affected source inputs. **Remove dependent records whose package or contributor is removed** deliberately removes the affected assignments, pricing and payment entries; the full changes are shown in the preview.

Unselected table roles retain their existing values. Capital, calendar settings, payment timing and delivery notes continue in the same native plan.

## Read the native preview

**Calculate native preview** sends the complete proposed scenario patch and planning settings to the original native estimate operation. It checks the exact saved baseline revision before calculating.

The preview includes:

- Every resulting work package, with full scope, price, hours/rate, work window and completion assessment.
- All three milestones and their complete deliverables.
- The original four conditional payment amounts, release conditions and modeled receipt days.
- Modeled peak cash requirement and the original capital/payment inputs.
- Complete contributor capacity, assignments and review/payment-lag comparisons.
- Every changed, added or removed native row or setting, with full before and after values.
- Every included or excluded original source record and its selected source edition.

Enter the source-import review note, review this complete result and apply it to the working plan. A later source or mapping edit clears that preview. The existing **Save revision** control saves the original native revision.

A source project can also be saved while its mapping is in progress. Saving that working material preserves the plan's current financial inputs. Applying the reviewed preview is the explicit step that changes those native inputs.

## Save and receive the whole plan

The complete portable project is **planning-source-tables.json**. It includes the native comparison baseline, every original table edition, typed mapping, target/member mapping, row decisions and saved import reviews.

The native planning revision retains that complete JSON text inside its source-table field. Retaining the original text preserves Source Tables review identities through native JSON serialization, SQLite, saved revisions and full ZIP exports.

The headless save command can finish after an interruption between the original native commit and ZIP publication. Repeat the same preview, note, request ID and output directory. It recovers the original saved revision and exports that revision with its complete earlier history. Later saved work stays in the active authoring workspace. A completed original ZIP is reopened and verified before the same delivery is returned.

The original planning ZIP keeps its eleven existing entries, including workspace.json and planning.json. Source-table material is part of that native planning state. **Planning edition** in **Prepare submission** receives the complete ZIP through the same existing importer and retains the original source bytes and native revisions.

To continue authoring after receiving a native planning ZIP, import that ZIP into the original Grant Operations workspace, select the imported plan and open **Source tables**. Rebase on the received plan's current saved identity before preparing further source imports.

The original server and receiving paths retain their existing input/export allowances. Full histories include the source material in each saved revision that uses it; retain complete exports at useful save points and keep them within the selected native receiver's complete-file allowance.

## Use the original six-package budget sheet

The examples directory contains the exact current reader budget CSV and its complete mapping:

- examples/source-tables/current-reader-budget.csv
- examples/source-tables/current-reader-budget.binding.json

The CSV is copied verbatim from stellar-forge/developer-site/dist/grant-data/budget.csv, original Git blob c62afa352e881c2cf81fe937649fe63fea3ceab5. It contains six source rows totaling 400 planned hours at the retained $95/hour assumption. The original current candidate totals $38,000.

The mapping joins these reader labels to the existing native identities:

| Reader package_id | Existing native package ID |
| --- | --- |
| T1-resource | T1-merchant-resource-integration |
| T1-handover | T1-merchant-authority-handover |
| T2-provider | T2-provider-and-ledger-deployment |
| T2-threat | T2-deployed-threat-response |
| T3-mainnet | T3-mainnet-merchant-rollout |
| T3-recovery | T3-production-recovery-and-handover |

It maps the sheet's hours, rate, amount and relative days explicitly. Complete scope, completion assessment and development category remain the matching original native values. It selects hours pricing explicitly. The full original CSV, including its title and basis columns, remains retained even though those columns do not replace the native scope text.

Use this mapping with the corresponding original current plan. Other plans and source editions need their own selected IDs and fields.

## Complete receiving walkthrough

The maintained example opens the original current candidate, receives the exact reader CSV, retains complete milestones, and adds an explicitly selected capacity/assignment input. It saves that complete 400-hour, $38,000 plan through the original writer. It then receives a second table edition, saves a separately reviewed 401-hour, $38,095 operator alternative, replays the identical save request, receives the native ZIP into a second original workspace, and reopens all source materials for the next edit.

~~~sh
node stellar/scf_2026/sf47_budget_model/workspace/examples/source-tables/receive-current-budget.mjs NEW_PRIVATE_DIRECTORY
~~~

The destination must be new. The example's named delivery capacity is an operator planning input; select the actual accountable person and availability before using it for operational commitments. Both original table editions, all complete native previews and saved planning packages remain in the resulting directory. The original current candidate and reader CSV stay unchanged.

## Headless operation

The installed command is **starforge grant-source-tables**. From a complete source checkout, the same entry is:

~~~sh
node stellar/scf_2026/sf47_budget_model/workspace/source-tables-cli.mjs --help
~~~

Use Node 22.16 or later and the original Python planner. Headless commands open the original workspace through its existing exclusive lock; close its browser listener before using that same workspace from the CLI.

Create a source project from the saved native plan:

~~~sh
starforge grant-source-tables snapshot \
  --workspace /private/grant-planning \
  --plan ORIGINAL_PLAN_ID \
  --output /private/receiving/source-project.json
~~~

Receive a successor source file, configure the exact member/field mapping, and review its complete typed output:

~~~sh
starforge grant-source-tables receive \
  --project /private/receiving/source-project.json \
  --role packages \
  --file /private/receiving/revised-costs.csv \
  --output /private/receiving/received-project.json

starforge grant-source-tables configure \
  --project /private/receiving/received-project.json \
  --role packages \
  --binding /private/receiving/package-binding.json \
  --output /private/receiving/mapped-project.json

starforge grant-source-tables review \
  --project /private/receiving/mapped-project.json \
  --role packages \
  --output /private/receiving/reviewed-project.json
~~~

A first source table requires an explicit --delimiter comma, tab, semicolon or pipe; use --no-header when appropriate. A successor keeps the existing parsing and column mapping until it is deliberately changed. A complete --table-mapping JSON file can be supplied to configure.

Calculate the actual native preview and read it before saving:

~~~sh
starforge grant-source-tables preview \
  --project /private/receiving/reviewed-project.json \
  --workspace /private/grant-planning \
  --plan ORIGINAL_PLAN_ID \
  --output /private/receiving/native-preview.json

starforge grant-source-tables save \
  --preview /private/receiving/native-preview.json \
  --workspace /private/grant-planning \
  --note "Reviewed complete source edition and native calculation" \
  --request-id ORIGINAL_SOURCE_IMPORT_REQUEST_ID \
  --output-directory /private/receiving/complete-plan
~~~

The save output contains the exact full native plan JSON, the complete native planning ZIP, the portable editable source project and its operating guide. The CLI opens the ZIP with the same complete receiver used by the submission editor before returning it as the selected result.

Use --python with the desired executable on commands that invoke the original planner. Use rebase with the project, workspace, plan and a new output filename to choose a current saved comparison baseline.

Each output is a complete new file. An exact repeat of save uses the same preview, note, request ID and output directory. The original native writer reconciles that request before comparing the current revision. A completed export can be reopened and returned if its earlier process stopped before returning the result.

## Source integration

The original app.mjs mounts the Source tables tab against its existing current-plan/draft state, API client, status area, busy lifecycle and savebar. server.py serves its assets through the same private listener. model.py accepts the exact portable authoring text as an optional planning.sourceTables field, using source_tables.py to retain its complete source material.

The core imports the maintained Source Tables implementation from stellar-forge/developer-site/dist/source-table-workspace.mjs. The CLI uses the original Python planner and the maintained grant-plan-source.mjs ZIP receiver. The grant-operations selection includes these exact source dependencies and its new command contribution. The selected existing application and native calculator remain the operating entry points. The original Node and Python managed-launch source lists include the same new runtime files and their complete existing table/receiver dependencies.

## Current issuer guidance

Reviewed October 12, 2026:

- [SCF Build budget and deliverable guidance](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines)
- [SCF Build submission criteria](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/submission-criteria)

The issuer guidance ties three delivery tranches to measurable development outcomes, with four conditional grant payments. It requires a self-contained application and a priced, feasible development plan. The original planner and application carry the selected financial assumptions, proposed scope and current source material.
