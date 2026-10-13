# Receive the complete SCF application into the existing submission workspace

Operation: SCF-SUBMISSION-SOURCE-PACKAGE-A8CE-20261012

This package brings the selected 131-source application, budget, development companion and source index into the existing SCF submission draft. It continues the same saved editor record, form map, answer edits, planning sources, review notes, prepared editions and working history.

The complete [source-package.json](source-package.json) contains all four original file bodies. It can be opened from the original **Source editions** screen or received by the existing `starforge grant-export` command. The selected producer is Merchant commit `b412f1ea76bd3f243c2ef78eeb4360730b65ef80`; all 125 source IDs from the preceding edition are retained alongside the six subsequent source additions.

## Continue the saved submission

Open **Prepare submission** in the installed reviewer and choose the existing saved browser draft. For the current original reviewer case, preserve draft `scf-technical-buyer-draft-7108-20261012` in `SCF-GRANT-CURRENT-REVIEW-81CF-20261012`. The same process also applies to another operator's existing working draft.

1. Select **Source editions**, then **Open source package**, and choose the complete file in this directory.
2. Read the selected edition's original URL, file list and full answer comparison. The screen shows the working answer, its retained baseline and the incoming answer together.
3. Choose **Receive source and keep edited answers**. Untouched answers receive the selected text. Edited answers retain their full text and original source baseline. When the application is unchanged and only its companion bundle differs, use **Use these four reviewer files**.
4. Save the original browser draft. Its normal revision and conflict behavior continues. Reopen it through **Saved drafts** and continue its original issuer fields, requirements review, operating plans and handover.
5. In the existing handover view, prepare the selected answers or current issuer fields. Export the complete working draft for the receiving operator, and retain the newly prepared edition inside that record.

A package opened without a working draft uses the editor's existing new-draft path. A package opened with a working draft first becomes the comparison source; the receive control applies it to that draft. The source files are carried with the package, so their comparison and receiving use those complete retained bytes.

Repeating an already-selected source bundle leaves the receiving state unchanged. A changed source saves the preceding complete working version. A different bundle for the same application preserves the former bundle selection in history. Individual edited answers can still use the original explicit source-selection controls.

### Use the original command line exporter

After updating the installed product to this source-package implementation:

~~~sh
starforge grant-export \
  --draft /private/scf/saved-submission.json \
  --receive-source-package /private/scf/source-package.json \
  --select answers \
  --format plain \
  --out /private/scf/prepared-131-source
~~~

Use the operator's actual saved draft and selected package paths. The output directory is the original exporter's new-directory destination. For an equipped source checkout, replace `starforge grant-export` with `node stellar-forge/developer-site/grant-export.mjs`.

The complete output includes `draft.json`, `application.md`, `form-map.json`, `source-package.json`, `prepared.txt`, `prepared.json`, `review.html`, individual selected-value text files, and the original output manifest. The saved draft export reopens through the original complete-draft import. Its same draft identity and retained source, form, plan and review history travel with it.

For a populated issuer map, use `--select fields` to export those exact saved values. Receiving the source updates canonical answers; existing issuer-field text continues to use its explicit refresh and editing controls.

## Materials for the full application

The [complete application](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b412f1ea76bd3f243c2ef78eeb4360730b65ef80/stellar-forge/developer-site/dist/grant-data/application.md) carries all nine maintained answers. The issuer's [submission criteria](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/submission-criteria) require a self-contained submission with technical architecture, meaningful Stellar integration, credible delivery and costed, measurable tranches. Keep the relevant complete answer text inside the actual form fields.

| Maintained answer | Ready material | Markdown whitespace words |
| --- | --- | ---: |
| project | Product, funded outcome, request, independent merchant and buyer objectives | 160 |
| need | Buyer problem, market comparison and source-backed customer work | 802 |
| stellar | Native payment use case, protocol responsibilities and ecosystem differentiation | 316 |
| architecture | Authorization, selected operation, native transfer, fulfilled output, recovery and operator receiving | 467 |
| product | Current working foundation, selection and installation, saved plans, original Runtime handoff and repeat customer work | 1040 |
| delivery | Three tranches, six prospective packages, implementation scope and completion measures | 1061 |
| outcomes | Independent operators, recurring use, testnet and mainnet measurement, maintainable receiving | 657 |
| capacity | Shared resource allocation, cost and payment model, operating calendar and support handover | 834 |
| applicant | Bryce's role, submitted classifications, relevant implementation and AI-use disclosure | 170 |

These counts describe the retained Markdown using whitespace separation. The original editor and exporter calculate counts again for the actual selected plain-text or Markdown output. Its form map stores an issuer's observed character convention and limits beside each field.

The selected [development and finance companion](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b412f1ea76bd3f243c2ef78eeb4360730b65ef80/stellar-forge/developer-site/dist/grant-data/product-and-finance.md) contains the full technical and customer chapters behind the application. Its product-selection chapter explains the commissioned operating sequence: select the required capabilities; review exact source and dependency manifests; build and install through the original Runtime operation; preserve the saved product plan; hand the installed operation to its receiving engineer; use the resulting service through the original request and fulfillment workflow. The grant's prospective integration and recovery packages adapt that foundation to the selected independent merchants.

The [Open Track guidance](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/open-track) calls for differentiation, a Stellar-specific implementation, measurable network growth, unified development documentation, relevant team experience, AI-use disclosure and a team presentation. The nine answers and complete companion carry those subjects together.

### Budget and delivery

The [budget.csv](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b412f1ea76bd3f243c2ef78eeb4360730b65ef80/stellar-forge/developer-site/dist/grant-data/budget.csv) retains the same six prospective packages, planning rate, hours and costs:

| Package | Tranche | Work window from actual award acceptance | Hours | USD |
| --- | ---: | --- | ---: | ---: |
| Merchant-resource integration | 1 | Days 1–30 | 80 | 7,600 |
| Authority and handover | 1 | Days 1–30 | 40 | 3,800 |
| Provider and ledger deployment | 2 | Days 31–90 | 70 | 6,650 |
| Deployed threat response | 2 | Days 31–90 | 50 | 4,750 |
| Mainnet merchant rollout | 3 | Days 91–150 | 90 | 8,550 |
| Production recovery and handover | 3 | Days 91–150 | 70 | 6,650 |
| Total | | 150 days | 400 | 38,000 |

The request uses a USD95 planning rate. Tranche delivery costs are USD11,400, USD11,400 and USD15,200. The proposed four payments are USD3,800 at award acceptance, followed by USD7,600, USD11,400 and USD15,200 after approved deliverables. The original financial model keeps actual receipts, forecast assumptions and cost timing separately.

The issuer's [budget and deliverable guidance](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines) requires future development tied to three tranches and four payments, with completion forms due within 90 days of the preceding payment. The selected source keeps those original payment-triggered deadlines. Tranche 2 includes the threat model and monitoring plan; the funded final tranche is mainnet delivery with useful independent merchant and buyer operation.

### Team presentation and editable source

Use the already-published original presentation materials:

- [Stellar Forge SCF46 presentation MP4](https://github.com/woahwhattheheck/public-commons-sprint-2026/releases/download/scf-presentation-20261011/stellar-forge-scf46-presentation.mp4): 6,324,445 bytes.
- [Editable presentation companion ZIP](https://github.com/woahwhattheheck/public-commons-sprint-2026/releases/download/scf-presentation-20261011/Stellar-Forge-SCF-Presentation-Editable-Companion-20261011.zip): 6,305,128 bytes.

The presentation and application identify the team, working product and funded deployment outcome. The existing presentation owner keeps the recording, editable clips, script, captions and original product references together. Use the actual invited form's attachment or URL control for these materials.

## Issuer correspondence and field receiving

The original SCF Interest Form acknowledgment arrived on October 11, 2026 at 14:59:29 UTC in Bryce's business Gmail. A direct read of that conversation and a complete focused search for later SCF/issuer messages on October 13 returned the acknowledgment as the only matching issuer message. The source application's `INTEREST_SUBMITTED_AWAITING_INVITATION` state remains the observed correspondence state.

The [SCF46 calendar](https://communityfund.stellar.org/awards/recxrSMYwAl8vcglg) lists the full Build deadline as November 8, 2026, panel review on November 11–18, and community voting on November 23–December 3. The calendar describes the interest-to-invitation entry process.

Continue the original submission owner's issuer-form receiving. Record the form name, actual URL and observation date in **Issuer form fields**, under **Issuer form and source**. For each displayed field, retain its exact label and prompt, select the relevant complete answers, and enter only the limits and counting convention stated by that form. Refresh the selected field from its source answers, then edit it in the same saved draft. The existing form-map export carries that mapping to the next operator.

Prepare the final edition using the actual mapped fields. The export's readable review page carries the exact values to paste, their lengths and any recorded-limit issue. Keep the submitted edition and resulting issuer correspondence in the original handover so later revisions and tranche work continue from the same application.

## Complete selected source identity

The package was assembled on 2026-10-13T00:10:11.258Z from the selected original producer commit. It contains the full application, source index, budget and development companion, including all 131 declared source records.

| File | Complete bytes | SHA-256 |
| --- | ---: | --- |
| [application.md](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b412f1ea76bd3f243c2ef78eeb4360730b65ef80/stellar-forge/developer-site/dist/grant-data/application.md) | 47,093 | `b9ab401d0d16f9a3697634bf0a1d127882f64c9c889836b218b1de79f53df8e6` |
| [source-index.json](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b412f1ea76bd3f243c2ef78eeb4360730b65ef80/stellar-forge/developer-site/dist/grant-data/source-index.json) | 140,275 | `9b6b95597f7a74f50fccae3f97d6fabe30590f3be4344e98bfd1e55d546dbd52` |
| [budget.csv](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b412f1ea76bd3f243c2ef78eeb4360730b65ef80/stellar-forge/developer-site/dist/grant-data/budget.csv) | 597 | `4ce056f1c388f9910e088ad763a4cdf55ed8ebf06e32dee1734b3e2f355c6c00` |
| [product-and-finance.md](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b412f1ea76bd3f243c2ef78eeb4360730b65ef80/stellar-forge/developer-site/dist/grant-data/product-and-finance.md) | 406,084 | `1ea16c912ad5c2b0cf540bae8c2003a6da66d9b8e9ff5a1b72c7142e80db8f92` |

Package: 842,747 UTF-8 bytes; SHA-256 `c3a406353cf61fe438e88b3fc7fce8a67cf01ea38640ca7e924cbad8005c8246`.

The package is a source receiving envelope using `stellar-forge.grant-reviewer-source-package.v1`. The retained bundle is `8f06c02a51dc83a3f36bbdacc688c8cc3294269110fb39b3f526cfa9f41cedc7`. The existing handover model verifies the original source-index identities and complete file bodies before receiving them into the saved editor.

## Original receiving owners and product continuation

25FD continues the cumulative application publication. 22B705/1B40 receive the selected source through the original submission/handover controls; 81CF/018A continue the existing saved review and Page; 8910/DD7A maintain the original owner-private Site. Their current saved working editions receive this package through the same editor rather than replacing their records.

The original B41A product run remains `SCF-SOURCE-WORKSPACE-7737-20261012`. Its frozen Water phase and the following current product-plan, Runtime handoff and briefing phase retain their original execution state. The installed editor source-package journey is received by the equipped current application owner alongside that existing product continuation.
