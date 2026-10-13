# Renew the complete customer weather report

Use the prior frozen report as the starting point for the next customer briefing. Select its next retained source and operating window, review every decision together, and create all decision revisions and the next report in one operation.

The renewal uses the same Open-Meteo request, original source, analysis, decision and report engines. Both operator and independent review workspaces support it. Source acquisition remains in the existing operator workflow; a review workspace receives already retained source packages.

## Customer operation in the browser

1. Acquire the next sources through **Sites & requests**, or receive the complete next source package in **Frozen reports**. The exact provider bytes, requested location, model, returned grid, time zone and original retrieval remain available.
2. In **Frozen reports**, choose **Prepare next edition** on the customer’s prior report. The application loads that report’s exact frozen decisions and each decision’s latest local working revision.
3. Select a retained source for every decision. Choices use the same requested coordinates, family, cell selection and elevation as the current working decision, and must request its variable. A different model is visible in the review.
4. Enter the intended UTC start and end for each decision. **Apply UTC window shift** moves all windows by an explicit number of elapsed hours. It does not reinterpret a calendar day across daylight saving time.
5. Review the operating disposition and notes for each new edition. The source variable, unit, aggregation, threshold and coverage requirement come from the current working rule. A new edition initially uses the disposition **review**; the operator chooses the actual disposition for the updated conditions.
6. Choose **Review complete next edition**. Inspect the prior and new threshold outcomes, member coverage, aggregate values, operating windows, rules, model and grid. Missing data keeps its original insufficient-coverage outcome.
7. Choose **Create reviewed edition**. The application saves every decision revision and the new frozen report in one transaction. Download the complete customer package, ZIP or HTML report.

A local decision revision made after the prior report is preserved and becomes the rule source for renewal. The review shows when it differs from the prior frozen decision. If the working revision changes after review, reload the prior report’s renewal and review the current choices.

The original frozen report remains available. A received decision retains the exact threshold unit and current browser source-selection protection from the existing receiving application.

## Meaning of the comparison

Each aggregate is the median of the eligible member aggregates for the displayed variable, unit, aggregation and time window. Deterministic forecasts have one model column. Ensemble fractions describe eligible returned members; they are not calibrated event probabilities.

Different UTC windows compare different operating periods. The renewal does not label a difference as forecast error or forecast skill. Requested location and returned model grid remain distinct. Provider retrieval time is not model initialization time.

A new source can have the same bytes as an earlier source. The preview distinguishes changed source bytes, changed outcomes and changed operating windows. It records the selected captures and does not infer a fresh forecast solely from a new local identifier.

## CLI operation

Use the installed command or the original component entry point:

~~~sh
npx --no-install starforge weather-operations renewal-choices \
  --settings /private/weather/settings.json \
  --report REPORT_ID \
  --output /private/customer/next-edition-selection.json
~~~

The command returns the prior report, current rules and compatible retained source choices, and saves a complete editable selection file. Replace the IDs with the actual values returned by the workspace.

The selection has this shape; every report decision must appear exactly once:

~~~json
{
  "reportId": "REPORT_ID",
  "expectedReportSha256": "PRIOR_REPORT_SHA256",
  "title": "Customer operating briefing",
  "owner": "Responsible operator",
  "notes": "Notes for this customer edition.",
  "entries": [
    {
      "decisionId": "RETAINED_DECISION_ID",
      "expectedRevision": 2,
      "captureId": "SELECTED_RETAINED_CAPTURE_ID",
      "startUtc": "ACTUAL_WINDOW_START_UTC",
      "endUtc": "ACTUAL_WINDOW_END_UTC",
      "disposition": "monitor",
      "notes": "The operator's reviewed action for this edition."
    }
  ]
}
~~~

`expectedRevision` is the actual current working revision returned by `renewal-choices`. The example’s identifiers and dates are placeholders. Edit the file generated from the actual customer workspace.

~~~sh
npx --no-install starforge weather-operations renewal-review \
  --settings /private/weather/settings.json \
  --input /private/customer/next-edition-selection.json \
  --output /private/customer/next-edition-review.json

npx --no-install starforge weather-operations renewal-commit \
  --settings /private/weather/settings.json \
  --input /private/customer/next-edition-selection.json \
  --expected-sha ACTUAL_REVIEW_SHA256
~~~

Use the returned `reviewSha256`. The complete selection, original report and source identities, current rules, derived results and comparisons contribute to that review. Commit recomputes it under the state transaction before writing.

Repeating the same commit after a lost response returns the same report with `reopened: true`. It does not create another set of decision revisions. The retained selection must match the original accepted selection. The original state lease and workspace serial operation continue to govern local access.

## Deliver and independently receive the result

Export the report ID returned by the successful commit:

~~~sh
npx --no-install starforge weather-operations report-export \
  --settings /private/weather/settings.json \
  --report NEW_REPORT_ID \
  --format handover \
  --output /private/customer/next-edition.weather.json

npx --no-install starforge weather-operations report-export \
  --settings /private/weather/settings.json \
  --report NEW_REPORT_ID \
  --format zip \
  --output /private/customer/next-edition.zip
~~~

The editable package carries the new selected decisions, original decision revisions, exact source bytes and existing receiving lineage. Its report retains the prior frozen report reference, the exact prior decision, the latest working rule used for renewal and the updated decision reference.

A renewed ZIP contains the current ordinary report, HTML, decisions, source JSON and complete CSV, plus `editable.weather.json`. Every ZIP member is included in the existing byte-and-hash manifest. Opening that ZIP through `from-report-zip` retains its full embedded decision/source history and the original ZIP. Original ZIPs without the embedded member keep the established conversion behavior.

An independent recipient uses the existing receiving commands:

~~~sh
npx --no-install starforge weather-operations review-init \
  --state-root /private/customer-next-review

npx --no-install starforge weather-operations handover-review \
  --settings /private/customer-next-review/settings.json \
  --input /private/customer/next-edition.weather.json

npx --no-install starforge weather-operations handover-receive \
  --settings /private/customer-next-review/settings.json \
  --input /private/customer/next-edition.weather.json \
  --expected-sha ACTUAL_PACKAGE_REVIEW_SHA256
~~~

The recipient gets independent local identities. The retained prior and rule-source decision references map to their corresponding local revisions. The original prior-report origin and SHA remain intact. The recipient can edit decisions, renew a later report, export the complete continuation and reopen the workspace through its saved settings.

The package retains the existing 48 MiB handover limit and source/history limits. ZIP output retains its existing 32 MiB archive and entry limits. For a large complete history, use the editable package directly.

## Workspace and HTTP interfaces

The existing `WeatherWorkspace` provides:

~~~js
const choices = await workspace.renewalChoices(priorReportId);
const reviewed = await workspace.reviewRenewal(selectedInput);
const result = await workspace.commitRenewal(reviewed.selection, {
  expectedReviewSha256: reviewed.reviewSha256
});

const completePackage = await workspace.handover(result.report.id);
~~~

The installed pure renewal contract is exported as `./partners/open-meteo/renewal`, with declarations for selections, choices, previews, results and workspace methods.

| Operation | Authenticated application route |
| --- | --- |
| Load report, current rules and compatible retained sources | `GET /api/reports/{reportId}/renewal` |
| Review the complete selection | `POST /api/renewal/review` with the selection object |
| Create or reopen the reviewed edition | `POST /api/renewal/commit` with `{selection, expectedReviewSha256}` |
| Download complete editable continuation | `GET /api/reports/{reportId}/download?format=handover` |
| Download ZIP with editable history | `GET /api/reports/{reportId}/download?format=zip` |

These routes use the same loopback session, origin checks and original state owner as the rest of the customer application. Renewal makes no provider or payment request. To export a renewed ZIP directly with `frozenReportBytes` or `exportFrozenReport`, pass the matching `handover` returned by the store along with the selected report and current captures, as the CLI and server do.

## Continue the original operated customer case

The existing 7AD4 receiving operation and `examples/browser-receiving.mjs` remain the native customer continuation. At the composed source, reuse its actual weather captures and receiving workspaces. Once the next actual provider/source edition is retained, use its current decision IDs and compatible source IDs with the browser or commands above.

Complete the same customer programme by reviewing the full renewal, creating the edition, reopening the accepted commit, exporting the editable package and ZIP, receiving the complete result independently, and cold reopening the saved settings. The retained original ZIP and its source identities remain part of the original receiving lineage.
