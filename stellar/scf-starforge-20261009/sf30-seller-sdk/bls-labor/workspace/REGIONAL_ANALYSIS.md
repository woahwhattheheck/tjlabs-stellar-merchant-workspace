# Regional analysis in the BLS labor workspace

The existing labor workspace now saves complete regional analyses from its retained LAUS and QCEW source editions. A customer report contains the chosen county membership, original observations, exact calculation inputs, regional and county charts, annual differences, editable commentary and a saved revision relationship. The same project continues its original dataset publication and receiving work.

## Open and save an analysis

Open the original BLS regional labor workspace from Applications or its current private connection URL. Choose **Regional analysis**.

1. Select the retained source edition. **Use this edition’s complete selection** fills its county membership, years, adjustment and QCEW codes.
2. Name the analysis and region. Choose every county that belongs to the requested region. Each county is identified by its original five-digit FIPS code.
3. Select resident labor, workplace observations or both. LAUS uses one original seasonal adjustment and monthly observations, annual averages or both. QCEW uses one ownership, industry and size selection, with the chosen quarters.
4. Enter the customer commentary. Choose up to eight county series for charts, or leave that field empty for regional charts alone. The complete tables retain every selected county.
5. Save the complete analysis. Its original operation ID remains saved through an interrupted response. Resume that same operation to receive its result.

The form keeps its current working draft in browser storage under the original workspace identity. A completed save turns the form into the next revision of that saved analysis. **Start another analysis** begins a separate customer series.

Saved analyses offer **Open analysis**, **Revise this analysis**, and the complete analysis ZIP. Opening reads the complete saved series once for its charts and uses successive pages for the full value table. Stopping chart reading leaves the saved report and its downloads available.

## Meaning of the calculations

### Resident labor

LAUS counts people by place of residence. For a chosen period and adjustment, regional employed residents, unemployed residents and civilian labor force are the sums of the original distinct county values. The derived regional unemployment rate is:

    100 × sum(unemployed residents) / sum(civilian labor force)

The original county rates remain their published values. A regional rate uses the original numerator and denominator components. It retains each member, source observation ID, expected source count and unavailable reason.

Monthly periods and annual averages remain separate. The original coverage-month count and excluded-month list stay attached to each result. In the retained NEK source, the 2025 annual-average G footnote denotes eleven months and excludes October; that annual period is not compared with a twelve-month annual period.

Original definition: https://www.bls.gov/lau/laufaq.htm

### Workplace employment and wages

QCEW describes employment and wages by place of employment. Regional totals add distinct counties within one ownership, industry and size selection. This avoids summing a published total alongside its constituent industry or ownership groups.

The regional additive measures are establishment counts, each of the three monthly employment counts, total quarterly wages, taxable quarterly wages and quarterly contributions. Monthly employment observations keep their actual calendar month. County observations retain all selected original metrics, including published location quotients and over-the-year changes.

Average monthly covered employment for a quarter is the sum of its three monthly employment counts divided by three. Derived regional weekly wage is:

    sum(total quarterly wages)
    / (mean of the three regional monthly employment totals)
    / 13

Equivalently, the saved exact calculation uses three times total quarterly wages divided by thirteen times the sum of all three monthly county employment counts. Original county weekly wages remain their published values. A regional calculation from the available published inputs can differ from an official aggregate produced from unrounded underlying data.

Original aggregation method: https://www.bls.gov/opub/hom/cew/calculation.htm

Original wage method: https://www.bls.gov/cew/news-release-technical-note.htm

### Missing values, precision and annual changes

A missing, unavailable or suppressed county member leaves the requested regional statistic unavailable. The record preserves every present original observation and the absent or unavailable member. A zero-valued source token with a suppressed status retains that status.

Calculations use exact fractions formed from the original decimal source tokens. Every result keeps its numerator and denominator. Displayed decimals round to twelve places using half-up rounding; chart geometry uses those displayed values, while tables and exports retain the exact fraction.

Annual differences require the same calendar period one year earlier, county membership, statistical meaning, unit, seasonal adjustment and source coverage. Rate differences use percentage points. An absent prior period or unequal annual coverage remains explicit. Original QCEW change and location-quotient metrics remain their published observations. Changes computed from released QCEW levels can differ from news-release changes that use administratively adjusted prior data.

LAUS resident people and QCEW workplace jobs remain separate populations and charts throughout the report.

## Complete customer files

Every saved regional analysis contains:

| File | Complete content |
| --- | --- |
| report.html | Printable report, commentary, regional/county SVG charts, all analysis rows, original observations and revision differences |
| report.csv | Every statistic, exact fraction, source edition and hashes, statistical definition, annual difference, source members and missing-value status |
| report.json | Full report metadata, every statistic and original observation, and complete changed/added/removed revision rows |
| rows.jsonl | All saved regional and county statistics in one stream |
| original-observations.jsonl | The complete selected LAUS and QCEW source population, with original values and source records |
| regional-definition.json | The saved editable analysis input and its original workspace/source identity |
| regional-changes.json | Full comparison with the preceding saved analysis, including original before/after statistic rows |
| analysis.zip | All seven files above plus START_HERE.txt |

The source edition and full original source manifest are retained in the report. Every CSV statistic carries its edition, capture and source-declaration hashes. Source names from each original projection remain available even when their labels differ; county FIPS determines membership.

## Reopen and revise

Choose **Revise this analysis** in the original workspace, or select its complete regional-definition.json under **Reopen an exported analysis definition**. The application opens the exact saved definition and its original source. Edit the commentary, region, county membership, years, source edition or projection selection, then save a new analysis.

The previous report remains complete and unchanged. The next report records its parent and full added, removed and changed statistic rows. Comparisons retain whether a changed row still has the same statistical meaning and membership.

To continue on another host, receive the **complete editable workspace ZIP** first. It carries all raw source files, source editions, observation indexes, notes, regional reports and native publication history. Open the received workspace and import the same definition there. The original workspace identity and source selection are preserved.

The analysis ZIP is the complete customer report. The workspace ZIP also contains the raw source captures and full editable application history.

## Original Northeast Kingdom receiving programme

The existing receive-original command continues its original source intake and seven county/change briefings. It adds a full regional analysis using all 408 LAUS and 96 QCEW observations, opens its exported definition, saves the customer-commentary revision, exports the whole project and reopens it under received-regional-workspace.

The original case and earlier handover remain retained. The new report operations are nek-original-regional-analysis and nek-original-regional-analysis-r2; their original requests are reused on restart. The complete original-receiving.json includes both regional analyses, all seven earlier reports, customer files, the new handover and the source-bound definition opened from the received project.

Use the same existing native file and case:

~~~sh
python3 stellar/scf-starforge-20261009/sf30-seller-sdk/bls-labor/workspace/cli.py \
  --workspace /dev/shm/bls-4bf5/analyst-workspace receive-original \
  --archive /dev/shm/NEK_Vitality_Official_Sources_20261011.zip \
  --sha256 3473bd56195b486c41a5042f5d9be4cfbf82bcf0d257528fe724b18caea9a28e \
  --out /dev/shm/bls-4bf5/analyst-customer \
  --name "Northeast Kingdom labor analysis"
~~~

Keep the original workspace, source archive and output paths selected by that operation. If the host relocated them, use its actual retained paths together in the same saved case.

## CLI and saved API

The regional command uses the existing workspace and original operation history:

~~~sh
starforge bls-labor-workspace --python /absolute/python \
  --workspace /private/bls-region status

starforge bls-labor-workspace --python /absolute/python \
  --workspace /private/bls-region regional \
  --input /private/customer/region-input.json \
  --id original-regional-operation \
  --expected-revision ACTUAL_CURRENT_REVISION
~~~

A full input for the retained NEK edition is:

~~~json
{
  "edition_id": "nek-original",
  "title": "Northeast Kingdom regional labor analysis",
  "region_name": "Northeast Kingdom",
  "narrative": "Complete regional and county series from the retained original BLS source.",
  "counties": ["50005", "50009", "50019"],
  "years": [2024, 2025, 2026],
  "chart_counties": ["50005", "50009", "50019"],
  "laus": {"seasonal": "U", "period_kinds": ["month", "annual_average"]},
  "qcew": {"ownership_code": "0", "industry_code": "10", "size_code": "0", "quarters": [1]},
  "previous_report_id": null
}
~~~

The CLI also accepts a complete exported regional-definition.json. It opens that saved report as the parent before saving the next revision. To open it without saving:

~~~sh
starforge bls-labor-workspace --python /absolute/python \
  --workspace /private/bls-region regional-definition \
  --input /private/customer/regional-definition.json
~~~

The original operating API uses POST /api/operation with kind regional and the complete input above, alongside id and expected_revision. A repeated operation retains its exact original input. GET /api/report reads the saved metadata and successive rows; GET /api/file downloads the chosen complete file.

GET /api/regional-definition?id=REPORT returns the saved full definition. POST /api/regional-definition/receive opens it for editing using the original workspace and source identity. It performs no mutation. The typed workspace client exposes regionalDefinition and receiveRegionalDefinition; save, resume, wait and download keep their existing interfaces.

JSON requests retain the original 8 MiB envelope and 7 MiB saved-input limits. A regional definition selects up to 200 counties, 80 distinct years and eight chart counties, within the original source engine’s one-million-observation limit. Every chosen county remains in the full results.

## Recurring customer service

A recurring regional service reopens the customer’s saved analysis, receives the next official source edition, selects it in the existing definition, updates the customer commentary and delivers the new report plus its full revision comparison. The customer keeps previous editions and can continue the same working project independently. Original dataset publication and source-file receiving remain available from the same application.
