# HILA round review

This product retains a complete HILA questionnaire, one or two approved anonymised response editions, explicit scoring and disclosure rules, named review decisions and the complete portable history. It uses the original XML SourceFormat/Workspace and SF30 Dataset engine. HILA has its own consent, response and denominator domain.

## Open the original operator

Use an existing Node 22+ and Python 3.11+ installation. The command selects the same Node executable for the original Dataset child:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/hila/cli.mjs --python /absolute/python --workspace /absolute/private/hila init
node stellar/scf-starforge-20261009/sf30-seller-sdk/hila/cli.mjs --python /absolute/python --workspace /absolute/private/hila serve --port 0
~~~

Open the complete private console URL returned by the command. The link is a process capability. The console uses the original loopback Host/Origin/capability gate and drains accepted requests before closing the workspace. Close the original process before reopening that same workspace in another process.

The managed Applications provider is **hila**, command **dataset-hila**. Select the existing private workspace, existing Python executable and original installed runtime. Review, save and start through Applications. It records the actual workspace/SQLite identities, selected Python and the complete declared source hashes. Startup verifies the same source, binding and live /api/launch record. Stop and recovery remain with the original Applications lifetime.

The source-selection recipe is distribution/selections/hila-operator.json. It selects the whole HILA and XML components, original runtime UI/Python components, SF46 and the original dynamic/static support closure. The HILA provider and contribution are additive source-owned registrations.

## Original questionnaire

Upload the complete original XForm XML and its explicit label, original URL, retrieval time with UTC offset, license or permission statement, and source/use notice. The product retains the exact bytes and a full reconstructed catalogue:

- primary instance attributes and full original form identity;
- all languages, translation IDs and original translation text;
- original bindings, constraints, required expressions and branch relevance;
- every control, label, hint, itemset and literal answer value;
- all original calculations, including presentation helpers;
- the complete consent and private-field boundaries.

XML parsing reuses the original hardened parser. External entities and DTDs are rejected. Original external itemset declarations are retained in the catalogue; a field whose choices cannot be resolved from the supplied form is not inferred.

The initial source investigated on 12 October 2026 is identified in METHODOLOGY.md. The questionnaire is an input with its own license/permission status. The product source does not redistribute or relicense it.

## Retain and map an edition

Upload the entire UTF-8 CSV or a top-level JSON array of response objects. The source inventory retains complete row and column counts and the distinction between absent, null, blank and array values. Nested JSON object paths use slash-separated field names; flat arrays retain their complete coded memberships.

A saved edition selects:

~~~json
{
  "requestId": "one-retained-original-request",
  "name": "Approved round one",
  "source": "<original-response-source-sha256>",
  "questionnaire": "<original-xform-sha256>",
  "acquisition": "<questionnaire-provenance-id>",
  "mapping": {"consent_cont/consent_acknowledge": "consent_cont/consent_acknowledge"},
  "respondentKey": null,
  "provenance": {
    "kind": "approved-anonymized",
    "label": "Approved round one",
    "sourceUrl": "",
    "obtainedAt": "2026-10-12T10:00:00Z",
    "periodStart": "2026-01-01",
    "periodEnd": "2026-06-30",
    "approvedBy": "Named data owner",
    "approvedAt": "2026-10-12T10:00:00Z",
    "approval": "Exact approval and anonymisation basis supplied by the data owner"
  }
}
~~~

The example mapping is deliberately incomplete. The real preview supplies every unambiguous original coded-field suggestion and explicitly lists missing or ambiguous fields. Review those suggestions and save the whole selected mapping. Full XPath, rootless field path and unique leaf-name matches are supported. Refusal reasons, organisation names, free text and audio remain outside analysis mappings.

An optional explicit respondent key becomes a hashed internal record identity and an original Dataset key. Without it, the original source ordinal and full row hash identify the row. These internal identities are private; they do not establish person matching between independent survey rounds. Duplicate explicit keys fail the original native build.

The complete original source is preserved, alongside its native data.csv, dataset.json, review and SQLite index. Source records can contain fields excluded from analytics; therefore a full workspace packet is a private operator handover.

The supported delivery envelope is one agreed questionnaire, one or two editions, at most 100,000 combined original rows and 100,000,000 combined uncompressed source bytes. Individual cells and normalized rows have explicit bounds. A complete methodology is at most 64 KiB; full review input is at most 64 MiB. Full outer archives are bounded at 4 GiB including all uncompressed members and their manifest.

## Methodology and denominator review

Read METHODOLOGY.md before selecting a composite measure. Load the unconfigured template for the exact questionnaire or import the complete supplied configuration. The template retains every original dimension item and every answer code. It contains no invented ordinal scores, weights or disclosure thresholds.

The supported explicit calculation is a weighted item mean for each eligible respondent, followed by an equally weighted mean of scored respondents within each cell. The method has a stable semantics version. An approved method must supply every included item's exact decimal weight, its complete code-to-score mapping and an explicit minimum answered count for each dimension. Excluded items retain a named reason.

The original **no_response** answer is non-numeric. A valid coded answer that the approved method explicitly leaves unscored is reported as **explicitMissing**. A missing field, absent mapping, invalid code, unknown branch and ineligible branch are distinct states. A stale value in a hidden branch is counted separately and contributes no score. Original consent remains decisive after every analyst decision.

Country, sector, organisation type and role use original source codes. Within each cell, a respondent is counted once. Multi-select country and role cells overlap; adding cell counts does not produce a unique respondent total. Overall edition totals preserve unique source rows, consenting respondents, cohort exclusions, analyst exclusions and scored respondents.

Two editions are compared as observed samples. The report includes full same-cell before/after values, respondent and scored-denominator differences, added/removed cells, full item frequencies and branch coverage. It makes no causal or population-representativeness claim.

## Save a named review

A review's complete definition contains:

| Field | Meaning |
| --- | --- |
| name, notes | Operator-selected title and complete notes |
| editions | One or two immutable edition IDs in before/after order |
| rules | Complete source-bound methodology and disclosure document |
| selection | country, sector, organization and role arrays; empty includes all; null selects missing membership |
| review | draft, needs-correction or reviewed, named reviewer and note |
| rowDecisions | Complete edition/recordId/include-exclude-note/reviewer/note list |
| cellDecisions | Complete cell key/accepted-needs-correction-note/reviewer/note list |

Creation includes a stable requestId. Editing adds the saved id and expectedRevision together. Reusing exactly the same request and full input returns its original result. Reusing the request with different input fails. A stale expected revision fails while retaining the selected input for reconciliation.

Open a historical revision explicitly. Its definition, original report and full source selection stay fixed. Editing that historical selection uses its exact expected revision; the operator must deliberately reconcile a later saved revision.

In the browser, each mutating operation retains its entire input and input SHA before HTTP dispatch. Full upload bytes live in the original browser IndexedDB operation record. A lost reply continues the retained request and checks the original server request/result. A definite HTTP 400 rejection can be kept as a rejected record before a new edited request is created. Uncertain outcomes remain available for the same operation.

Browser drafts and pending inputs are scoped to the original workspace and current console origin. Use the same retained console port to reopen a browser draft. Download the complete input before changing machines or browser origins. All accepted source, edition and review state lives in the original native workspace independently of browser storage.

## Full reports and public release

The Report tab reads the selected saved revision. Draft edits are saved separately before they change output.

Available outputs:

- complete private analyst JSON;
- deterministic offline HTML with all cells, coded frequencies, languages, original labels and named decisions;
- complete report ZIP with full HTML/JSON, cell CSV, coded-answer CSV, methodology, review update and source/use guide;
- complete private review/workspace ZIP;
- original three-file merchant Dataset export for each edition;
- approved aggregate release when every explicit release condition is satisfied.

The offline HTML embeds the entire report safely and uses only local code. Search and pagination change the view, while exported CSV/JSON include the whole selected report. Named cell edits and overall review changes return as a complete flat save request. It retains the original review id, expectedRevision, methodology, row decisions and untouched cell decisions; a fresh requestId is created only when the operator clicks Download review update.

A public release requires approved scoring, approved disclosure and a named reviewed revision. The method supplies minimum respondent and scored counts. The supported conservative rule suppresses the entire dimension/breakdown axis across selected editions when any relevant cell fails the threshold. Public reports omit respondent microdata and private item distributions. Public comparison release must also be explicitly enabled. An approved anonymised microdata release is a separate data-owner decision and is not generated by this product.

## Receive and reopen

~~~sh
node .../hila/cli.mjs --python /absolute/python --workspace /absolute/private/received init
node .../hila/cli.mjs --python /absolute/python --workspace /absolute/private/received receive --file /absolute/hila-workspace.zip
node .../hila/cli.mjs --python /absolute/python --workspace /absolute/private/received review --id <review-id> --revision <revision>
~~~

A full review packet contains the complete questionnaire and catalogue, acquisition provenance, original edition requests, original six-member Dataset packets, all selected review revisions, all original save requests and every historical report output. Every member has an exact byte count and SHA-256 in the complete outer manifest.

Receiving reads every member and CRC, re-inventories the questionnaire, reconstructs all native datasets, verifies stable Dataset capabilities/snapshot/source/mapping/CSV identities, reconstructs every report/HTML/CSV, and only then publishes review history. Receiving-host SQLite and engine implementation bytes are retained separately from the original edition's portable identity.

Importing an older exact prefix preserves later local revisions. Exact repeat receiving reuses the original identities. Completed cached exports preserve their original full archive bytes. Destination-specific original OS leases hold through the complete check, stage, publication and readback; a different existing completed output is preserved. The full history is validated before final report paths are published, using staged files to keep memory proportional to one report.

## CLI and typed client

The CLI supports init, list, binding, questionnaire, source, mapping, rules-template, save-edition, save-review, review, history, report, export, report-export, receive, query, dataset and serve. Its general call entry reads a complete **{operation,args}** file; operation names are declared in hila_cli.py and mirror native methods.

The typed client export is **./seller/hila/client**. It requires the actual private loopback console URL, uses the original capability, refuses redirects and never creates a request ID for the caller. Keep the full request before a mutating call. Its request(id) method reads the original saved operation for reconciliation.

Download methods return the complete original Response. Consume or cancel its body before closing the client. The downloadHilaFile helper writes a private fsynced stage, verifies full byte/SHA identity, and publishes or reuses the complete file under the same destination lease as the Python exporters. Interrupted private stages remain available for inspection. A failed request may have reached the original server; reconcile it rather than changing request identity.

## Source custody and ownership

Implementation files are MIT source in the existing merchant repository. The original questionnaire, response editions and supplied methodology keep their own rights, approvals and provenance. Their original use notice remains in each questionnaire acquisition and edition provenance record. Full response packets are private operator handovers.

The programme is led by Kobo, iMMAP, CartONG and HOT; see the original links in METHODOLOGY.md. This application is an independent engineering implementation of reproducible receiving and review, not a claim of programme endorsement or completed official survey analysis.
