# HILA source and methodology contract

## Original questionnaire actually retrieved

The public HILA portal links to https://ee-eu.kobotoolbox.org/x/OUSUPDMY. The original Enketo source router was read to resolve its public XForm download route. A read-only GET of https://ee-eu.kobotoolbox.org/xform/OUSUPDMY returned the full XML on 12 October 2026 at 21:55:22.761968 UTC:

| Identity | Retained value |
| --- | --- |
| Bytes | 482,188 |
| SHA-256 | 123abaf2dbe0d43db02d5ec491578280bb36457652d3e6f2874e6e619ceb04f1 |
| Title | Humanitarian Information Landscape Assessment (HILA) |
| Primary root | aT4wFYSDxrXYv7CTa2tES7 |
| Form version calculation | vGewDcxTY9XFhAQPL8fzCi |
| Languages | English, Spanish, French, Arabic |
| Original bindings | 158 |
| Body controls, including groups/presentation | 148 |
| Literal secondary choice lists | 24 |
| Assessment items | 46 |
| Original calculations | 12 presentation/version helpers |

The full instrument remains an acquired input. The implementation retains all translations, consent statements, source expressions, choices and calculations. This guide records source identity and the field contract without redistributing the complete questionnaire.

## Five dimensions and answer values

| Dimension | Original group | Original assessment items |
| --- | --- | ---: |
| Availability | assessment/section3a_info_avail | 11 |
| Accessibility | assessment/section3b_info_access | 10 |
| Quality | assessment/section3c_info_quality | 10 |
| Use | assessment/section3d_info_use | 10 |
| Awareness | assessment/section3e_info_aware | 5 |

The four literal agreement codes are **yes**, **partial**, **no** and **no_response**. Their order is not a numeric scoring rule. The form calculations do not define composite scores, dimension weights, minimum answered counts or public disclosure thresholds.

## Original branch and privacy boundaries

| Field | Product treatment |
| --- | --- |
| consent_cont/consent_acknowledge | Only exact yes permits analysis; no and missing are counted separately |
| assessment/section3a_info_avail/new_info | Original information gate; no-information responses are not zero-scored |
| respondent_info/country | Original multi-country membership when its branch is relevant |
| respondent_info/countries | Single-country membership when country/sub-national branch is relevant |
| respondent_info/topic | Original sector/topic code |
| respondent_info/org_type | Organisation-type code |
| respondent_info/roles | Potentially overlapping data-specialist/data-user memberships |
| consent_cont/why_no | Excluded from analysis and report contents |
| respondent_info/org_name | Private original source only; excluded from analysis mappings |
| respondent_info/subnationals, respondent_info/opt_details | Free-text private originals; excluded from analysis mappings |
| support/final_aud, support/final_txt | Audio/free text excluded from analysis mappings |

All inherited relevance expressions remain with the questionnaire. The source interpreter supports the actual logical/comparison/selected/count-selected paths used by this form. Unsupported expressions remain an explicit unknown eligibility result. The workflow never interprets a stale hidden response as an eligible answer.

The source consent permits aggregate report/dashboard analysis while retaining confidentiality of individual responses. Its refusal-reason hint excludes those explanations from reports and dashboards. Public release is aggregate only. An actual anonymised microdata publication requires an additional approved disclosure process.

## Official companion source retrieval

Original programme/co-lead sources were retrieved or opened in the same investigation:

- HILA portal: https://hila-survey.org/
- CartONG introduction, 21 July 2026: https://www.cartong.org/en/2026/07/21/introducing-hila-a-new-global-standard-for-humanitarian-information/
- iMMAP introduction: https://immap.org/news-and-stories/introducing-hila-a-new-global-standard-for-humanitarian-information
- iMMAP current extension post: https://www.linkedin.com/posts/immap_hila-humanitariandata-informationmanagement-activity-7501184613961154561-QwsD

The current portal gives a 15 November 2026 dashboard date. The current iMMAP post extends intake to 15 October and says analysis will be available by 15 November. Earlier launch articles' September dates are historical. The engineering delivery interval is tied to approved input/configuration readiness.

The retrieved portal, full XForm and co-lead articles do not supply a usable composite formula, exact item weights, reverse-coding list, minimum answered count or public cell-disclosure thresholds. No official companion scoring document was recovered in this investigation. This is an acquisition result, not a claim that no internal methodology exists. Keep the full source retrieval receipts alongside the acquired form.

A supplied co-lead methodology is a first-class complete input. Preserve its original label, URL, version, named approver, approval time and notes. Store the full exact rules document with every review revision. If the approved method requires different calculation semantics, implement and identify that complete method before using it; do not approximate it silently.

## Supported explicit method

The stable semantics identifier is **hila-explicit-weighted-items-equal-respondents-1**.

For every original dimension item, preserve inclusion/exclusion, exclusion reason, exact decimal weight and all answer-code score selections. **no_response** must remain null. A supplied null score for another valid code is distinct from an absent or invalid answer.

For each eligible respondent:

1. Resolve original consent and inherited branch relevance.
2. Keep the full raw code distribution and coverage states.
3. Select numeric scores only for explicitly included, valid, relevant answers.
4. Require the dimension's supplied minimum answered count.
5. Divide the sum of score × item weight by the sum of answered-item weights.

Within each cell, average scored respondent values equally. This engine does not infer survey design weights. Arithmetic uses Decimal with 60-digit intermediate precision and half-even output to at most 12 decimal places. Results are exact decimal strings.

A draft method still produces complete raw distributions and coverage. Composite fields remain unavailable.

## Complete denominator vocabulary

| State | Meaning |
| --- | --- |
| eligible | Original branch permits the field |
| answered | Valid coded answer |
| explicitNonResponse | Original no_response code |
| explicitMissing | Approved method deliberately gives a valid answer no numeric score |
| missing | Field is mapped but absent/null/blank |
| unmappedField | No source mapping selected |
| invalid | Response is outside original codes or expected selection shape |
| notRelevant | Original inherited branch is false |
| unknownEligibility | Branch cannot be evaluated from available mapped data |
| staleHiddenAnswer | Source value exists in a hidden/unknown branch; contributes no score |

Private reports preserve these states for every coded field and dimension item. Edition totals distinguish source rows, declined/missing consent, consenting respondents, cohort/review exclusions, selected respondents and scored respondents.

Multiple country and role memberships overlap. Membership is deduplicated within each cell. Overall totals remain unique respondents. A changed cell mean is accompanied by changed respondent/scored denominators and the full before/after distributions.

## Publication definition

Public release requires approved scoring with original approval provenance; approved disclosure with named approver, time and basis; explicit positive minimumRespondents/minimumScored; whole-axis complementary suppression; a named overall review with status reviewed; and explicit releaseComparisons for public before/after output.

If a relevant cell fails the selected minimums, the entire dimension/breakdown axis is suppressed across both editions. Public output contains no private item distribution or individual row. It preserves selected methodology and aggregate attribution.

Engineering fixtures used by the receiving procedure, if run, are labelled synthetic-engineering with an explicitly synthetic scoring configuration. Their numbers demonstrate mechanics only. They are not HILA responses, official results or supplied CartONG approvals.
