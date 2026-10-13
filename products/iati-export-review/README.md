# Publisher export review and independent receiving

This programme takes two actual IATI publication editions through the existing IATI workspace: original XML intake, native financial catalogs, explicit comparisons, an undecided reviewer form, named decisions, retained history, complete report delivery and independent workspace receiving.

It operates the original organisation, portfolio and financial-reconciliation engines. The complete application remains in `stellar/scf-starforge-20261009/sf30-seller-sdk/iati`. Use its full installed source edition for both sender and receiver.

## Complete workflow

The first stage imports complete organisation and activity XML for each edition, records exact input identities and selected scope, saves the original organisation assessment and activity portfolio, and reads every page of the pinned native catalogs. At least one original XML file must differ between editions. The organisation export may remain unchanged while the activity export changes.

The second stage maps actual catalog row IDs to both complete native previews and a working HTML review form. Every human decision starts blank. The form shows source-defined currency, period, budget status, coverage and value-date treatment before requesting a decision.

The final stage validates both complete previews and both named review instructions before retaining immutable decisions or saving either financial definition. It saves and reviews both editions in their original order, reads back their original request responses, compares historical revisions, exports the full native ZIP, receives it in a second workspace, checks historical request/readback and report equivalence, and reopens that receiving workspace.

Source issues remain visible. An organisation total and selected activities can have different coverage or budget status; the original engine determines whether those rows support arithmetic. Explicit nominal value-date comparison remains a deliberate mapping selection.

## Runtime and source

Use Python 3.11 or later on Linux with the original application dependencies, including lxml, and the complete IATI source directory. Native ZIP receiving requires the matching complete installed edition because nested organisation and activity packages retain their original source.

For browser operation use Node and an installed Playwright module and Chromium executable. The complete companion is `open_review_course.mjs`; [BROWSER_RECEIVING.md](BROWSER_RECEIVING.md) contains its private runtime configuration and actual review/handover modes.

The programme and browser are the complete reviewed bodies, respectively 40,114 and 14,227 UTF-8 bytes. Existing `devresults.export-review-*.v1` schema identifiers are retained for saved-case compatibility; they identify the source format and require no external service connection.

The complete financial engine and organisation workspace were compared with repository main `6627bbee2fa9c2bef1ef0e352b54ec65f3459afb`; both match the reviewed native edition byte for byte. The original workspace preserves its source, portfolio and reconciliation interfaces and adds the current document-evidence lifecycle. Peer review covers the actual native APIs. Execution belongs to the saved operation's returned results.

## 1. Select genuine publisher editions

Copy [intake.template.json](intake.template.json) into the private operating directory and replace every placeholder with actual source information. Preserve the publisher identifier and observed publication/export timestamp with timezone. Each edition provides a distinct stable ID, name, complete organisation and activity XML, actual export/filter scope and financial coverage, and explicit native activity selection.

Relative XML paths resolve against the configuration file. Select the actual assessment date, financial-year start, methodology and forward-year range. Keep customer inputs and working directories in their authorized private location. For expenditure, select the publisher's actual transaction types: IATI type 4 denotes expenditure. Catalogs retain the original transaction dates and values; a budget comparison does not silently become an expenditure comparison.

```sh
python products/iati-export-review/receive_export_review.py \
  --iati-source stellar/scf-starforge-20261009/sf30-seller-sdk/iati \
  --configuration /absolute/private/intake.json \
  --output /absolute/private/publisher-review
```

The result is `CATALOGS_PREPARED`. Read both full `catalogs/` files, `intake.json` and `intake-definition.json`. Their selectors bind actual saved organisation and portfolio revisions.

## 2. Map real native rows and inspect previews

Copy [mapping.template.json](mapping.template.json), preserving operation and edition order. Select one to ten explicit comparisons per edition using exact catalog IDs. Each line includes the actual organisation row, activity rows, selected or complete coverage, a concrete scope explanation, and `separate` or explicitly selected `nominal` value-date policy.

```sh
python products/iati-export-review/receive_export_review.py \
  --iati-source stellar/scf-starforge-20261009/sf30-seller-sdk/iati \
  --configuration /absolute/private/intake.json \
  --output /absolute/private/publisher-review \
  --mapping /absolute/private/mapping.json
```

The result is `REVIEW_PREPARED`, with `mappingSha256` and `reviewPage`. The selected `preview/<mappingSha256>/` directory retains the original mapping, both full native previews, their definition/snapshot identities and the actual undecided form.

Open that form and read both previews. Supply the actual actor, decision, explanation and issue acknowledgments for each edition. Approval requires acknowledgment of every noninformational issue. Export the actual `review.json` and preserve its bytes.

An internal engineering demonstration may enter a supplied engineering instruction under the actual engineering actor and explicit internal purpose. The browser companion consumes this complete instruction; it never derives approval from issue presence or fabricates a customer decision.

## 3. Save named reviews and receive the full handover

```sh
python products/iati-export-review/receive_export_review.py \
  --iati-source stellar/scf-starforge-20261009/sf30-seller-sdk/iati \
  --configuration /absolute/private/intake.json \
  --output /absolute/private/publisher-review \
  --review /absolute/private/downloaded-review.json
```

Both previews and complete reviews validate before either financial save. The same side-effect-free native review normalizer checks actor/note, acknowledgment types, actual issue IDs and approval requirements. The programme then issues the retained original save/review requests.

The complete `delivery/` contains:

| Material | Purpose |
| --- | --- |
| Both edition HTML, CSV and JSON reports | Original reviewed values and financial contexts |
| `edition-comparison.json` | Changes between the two historical reviews |
| `received-current.html/.csv/.json` | Current report regenerated by the independent receiver |
| `Publisher_Financial_Review.zip` | Whole financial history and nested organisation/activity source packages |
| `preview/` mapping, both previews and original form | Exact context shown before named decisions |
| `intake-definition.json` and `review-definition.json` | Original input/scope identities and actual decisions |
| `receive_export_review.py` | Complete reusable programme |
| `index.html`, `RECEIVING.md` and `HANDOVER.json` | Recipient entry, receiving steps and all payload identities |

The manifest lists 21 payload files; `HANDOVER.json` is the manifest itself. The full working case also retains sender/receiver workspaces, original XML, exact requests, catalogs, previews, history and receiving result. Preserve that case on continuation.

## Browser opening and actual use

Start the ordinary loopback server in the original receiving terminal:

```sh
python -m http.server 8765 --bind 127.0.0.1 \
  --directory /absolute/private/publisher-review
```

Follow [BROWSER_RECEIVING.md](BROWSER_RECEIVING.md): run `review` before native review, then `handover` afterward with a separate phase output directory. Select the actual loopback origin and installed runtime in the private configuration. Each phase retains its complete source/input binding, actual downloads, observations, desktop/phone screenshots and browser-close result.

The browser comparison follows only native normalization: actor/note trim and unique acknowledgment IDs sorted for comparison. Every other preview/definition field stays exact, and the downloaded decision JSON remains unchanged.

## Continue the original operation

Use the same configuration, output directory, installed source and retained request IDs. Identical requests read back historical responses. Preserve existing decisions; changed instructions must not reuse a request ID for different content. Select intended new work explicitly.

If a later operation is interrupted, its original requests, revisions and complete native package remain available. The original export writes atomically; this programme uses its actual `file`, bytes and SHA descriptor. A completed browser phase belongs to its original source/input binding and output. Preserve its full files and result; changed source/input gets an explicitly selected receiving output.

## Producer's rendered-output instruction

Before presenting the outgoing application, handover, report or attachment, open/run/render the exact version, LOOK at it and normally use it as the recipient would. View the actual screenshots captured. Inspect desktop/presentation and relevant phone widths, important controls, populated/empty/loading/error states, downloads and reopened exports. Open usable ZIP contents and each applicable report/PDF page.

Source review, schemas, HTTP status, DOM counts and another worker's approval do not substitute for observing the actual product. Fix clipped, cramped, overflowing, unstyled or unreadable output in the same authorized case and continue delivery. Keep plain industrial design: readable tables, hierarchy, consistent typography/spacing, restrained controls and responsive layouts. Reuse accepted unchanged work and focus verification on actual remaining risks.

Preserve repository [AGENTS.md](../../AGENTS.md), original runtime ownership and source/data controls. Run the course in the existing native Linux or local receiving environment. GitHub Actions remain disabled.
