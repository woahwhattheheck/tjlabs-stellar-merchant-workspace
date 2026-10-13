# Geoapify address operations

This operator takes an original CSV or JSON source through Geoapify's generic asynchronous batch API, complete candidate review, immutable SF30 dataset editions, the original merchant publisher, seller releases and buyer acquisition. The browser, CLI and merchant tools share the same private workspace and original job history.

## Open the actual workspace

Use the maintained Node runtime with node:sqlite support. Set GEOAPIFY_API_KEY in that host's existing private environment. The key is read at operator startup, sent only through the documented x-api-key header, and excluded from saved source, requests and reports.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/geoapify/cli.mjs serve \
  --dir /private/geoapify-addresses --port 0
~~~

Open the exact private URL printed by the process. The browser token stays in the fragment/session storage. HTTP binds to127.0.0.1 and preserves the original host/origin check. Close the original process to release its writer and any publisher process it owns.

Installed contribution command: geoapify. Native provider: geoapify-workspaces. Read stellar-forge/mcp-merchant-operator/GEOAPIFY_WORKSPACES.md for declared file aliases, private setup, native tools, complete chunk downloads and the same browser instance. The ordinary merchant provider initializer installs this provider without changing Geocodio or OpenCage.

## 1. Retain the complete original source

Choose the actual source file from the browser computer (up to16MiB), or an original regular file path on the operator host (up to256MiB). Choose CSV or a JSON array of object records, give the source its real name and record its rights/provenance. CSV uses the maintained original parser. JSON numeric lexemes become strings before address/identity projection so large record identifiers retain their exact original digits.

Provide an explicit mapping. Text and structured address modes are separate:

~~~json
{"text":"address","identity":"customer_id","latitude":"latitude","longitude":"longitude"}
~~~

~~~json
{"housenumber":"address.number","street":"address.street","postcode":"address.postcode","city":"address.city","state":"address.state","country":"address.country","identity":"id","latitude":"geo.lat","longitude":"geo.lon"}
~~~

Map both original coordinate fields together or leave both empty. Dot paths address nested JSON objects; a matching literal CSV header takes precedence. Structured address fields may be incomplete: the original input remains visible for review, and records without any usable address become INVALID_SOURCE rather than disappearing.

The workspace retains its first original source and following source editions. Use Following source to stage a complete refresh against a chosen frozen edition before activating it. All source ordinals remain separate even when business identifiers repeat. Identical mapped address parameters share one query ID and provider lookup; their individual identities, original coordinates and output rows are preserved. Inspect source rows and repeated identities before submitting.

## 2. Prepare an explicit original job

The adapter uses /v1/batch with api /v1/geocode/search. It deliberately retains caller query IDs and complete FeatureCollections rather than the simplified forward-batch response.

Choose a maximum of1–1000 queries per job, candidate limit1–20, explicit priority0.5–1, global or EU endpoint, and any language, address-type, geographic filter and bias. Language is a two-letter code. The default bias is countrycode:none: provider IP geography must not silently affect a portable review. A different chosen bias remains part of the exact request.

Prepare selects the next eligible original query IDs up to the chosen maximum and reports both the selected count and remaining eligible count. A large source therefore becomes several explicit jobs. A refreshed completed query requires an explicit list of its original query IDs and the Refresh selection. Queries already in open prepared/sending/pending jobs continue through those original jobs.

The prepared envelope contains endpoint and body and has its own SHA-256. Download prepared envelope retains those exact bytes. Download exact provider POST body contains the actual body serialized for submission, with its separate SHA-256 and byte count. Review original inputs, priority, filters and counts before pressing Send reviewed request once.

The native writer durably saves SENDING before calling the provider. A returned200 can complete immediately;202 retains the actual job ID. A transport interruption or HTTP408 retains an uncertain POST instead of issuing it again. Definite request/authentication/quota rejection stays visible with the original response.

## 3. Continue, import and recover the same job

Choose the exact original job in Batch jobs. Poll original job performs one GET using its returned ID and the originally selected documented host. This operator does not auto-poll. Every submission and poll counts as a provider API call. The next poll is at least60seconds after the prior attempt/return and respects a later Retry-After.

A404 on the original completed/pending provider job is retained as EXPIRED. Geoapify normally retains completed generic-batch results for24hours; save the actual result locally when it is returned. No new provider POST is inferred from an expired result.

If an interrupted original request has its acknowledgment or result elsewhere, import that complete original JSON into the selected job with its actual HTTP status. A202 acknowledgment binds the original returned job ID and enables later polling. A200 result joins candidates by the caller query IDs. Parameters, job IDs and API identities are checked. Missing, duplicate and foreign IDs remain explicit partial-return issues; input positions are never used to guess an identity.

Provider reply credentials are removed from URL query parameters and credential fields before saving customer exports. Original byte count/SHA and the redacted field locations remain in the event. Polling always constructs the documented endpoint from the saved host and job ID; it does not execute a returned arbitrary URL.

If the original outcome cannot be recovered, Explicitly abandon retains the original request, returns, previous status, reviewer and reason. It allows a deliberate new selection and states that another provider charge may result. This is an operator decision, not an automatic retry.

## 4. Review the complete original candidates

Filter and page original queries, then open one. The review shows every linked source record, every returned Feature, geometry, property coordinates, datasource, confidence, result type and match level. Original coordinate pairs and displacement appear separately for every source ordinal.

Confidence is a provider score. Match type describes the level matched. Neither automatically accepts an address. Missing geometry, invalid confidence or disagreement between geometry and property coordinates is visible. An accepted candidate needs usable geometry and the exact currently viewed response SHA.

Choose one action:

- Accept selected candidate, with explicit reviewer and reason.
- Keep original source without a provider selection, with explicit reviewer and reason.

Then choose the coordinate policy: preserve original, use selected provider, or fill missing/unusable original pairs. Every output retains the original and provider pairs alongside the selected pair. The same address shared by multiple business records therefore keeps each record's original coordinates under Preserve original.

Decisions remain tied to the original query, returned response and selected feature identity. A later provider response cannot silently apply an earlier candidate approval. Raw browser decision drafts are keyed by query and response. Save working forms retains address-operation forms, selected original job/request hash, query/response identity and unfinished decisions in the native workspace. Browser-local drafts are additionally keyed by the original workspace ID. Restore saved forms reopens the same matching sources before restoring those drafts.

Unimported file-picker bytes are not yet part of the workspace. The browser asks you to import or clear them before exporting and warns before closing. Other raw form inputs remain editable after errors; failed paging retains the actual last displayed page.

## 5. Freeze and inspect a dataset edition

Choose all original source rows, including explicit unreviewed/invalid status, or the explicitly reviewed subset. Add up to32 original scalar fields with distinct native output names. Standard columns retain source ordinal, identity, query, review state, formatted address, confidence, result/match type, original/provider/selected coordinates, displacement, coordinate policy, reviewer/reason and datasource attribution/licence/URL.

Build uses the original SF30 CSV dataset handler and snapshot calculation. It freezes exact CSV/config, complete GeoJSON, complete candidate review JSON, original review basis and a standalone readable HTML review. Later decisions or provider jobs leave this edition unchanged. Select a prior edition to inspect/export its original snapshot.

Query the selected native dataset with its actual typed fields and continuation cursor. The browser clears the previous preview on edition change. The full standalone report retains every selected dataset row and complete candidate details; it has no network or script dependency.

## 6. Deliver through the original merchant and buyer

Configure the actual public origin, route and original payment terms. The existing dataset seller builder validates them; credentials stay in the configured seller/buyer workspaces.

Export complete workspace and selected edition. This creates a retained output directory with:

| File | Content |
| --- | --- |
| starforge-geoapify.json.gz | Complete original source/job/review/edition workspace and saved address forms |
| dataset.csv, dataset.json | Exact typed SF30 edition |
| dataset.geojson | Same selected records and coordinates; null geometry remains explicit |
| review.html | Complete portable human review |
| address-review.json | Full frozen source/candidate/decision view |
| query.json | Original selected dataset query and native continuation metadata |
| source.json | Source, mapping, provider returns, attribution, edition and complete source-file identities |
| seller.json | Validated original merchant offer, when configured |
| raw/ | Complete retained source, prepared requests, provider returns and immutable edition files |

A working workspace can be exported before an edition exists. That package retains unfinished jobs and forms for continuation. A report/data delivery requires a completed selected edition.

Publisher & buyer opens the original publisher directly on the retained export. Prepare the exact dataset; stage/select/start its original seller release; preview and publish retained versions; read the actual customer offer; prepare its original buyer request; and continue with the host-declared buyer, original account, limits and signer. The existing release generation, publication recovery and buyer accounting remain authoritative. Optional host facilitator profiles reuse the original SF82 review/stage controls.

Customer/source redistribution rights and returned attribution remain part of delivery. Geoapify API access is not itself a transferable API resale licence. The customer uses its authorized account and plan; a source owner approves its actual intended output distribution.

## 7. Reopen and receive the complete original work

Restore starforge-geoapify.json.gz into an empty private Geoapify workspace. The importer checks every retained file's exact bytes/hash, original source/request bindings and native dataset snapshots before acknowledging the restored state. It preserves the original workspace identity, jobs, decisions and editions. Continue a pending returned job by its original ID.

The provider workspace package and original publisher/buyer workspaces have separate ownership. The address package restores address/source/job/review state. Retain the seller and buyer's own original workspace/backup when transferring an already running commercial deployment.

For a customer receiving operation, use the complete original source and actual authorized account; open the populated browser, inspect desktop and narrow widths, prepare/send or import the exact original job, compare all candidate types, save/reopen a working decision, freeze the edition, query it, inspect all outgoing report/data files, export and reopen on an independent workspace, then operate the original publisher/customer acquisition with its configured limits.

## CLI and source contracts

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/geoapify/cli.mjs status \
  --dir /private/geoapify-addresses

node stellar/scf-starforge-20261009/sf30-seller-sdk/geoapify/cli.mjs act provider.prepare \
  --dir /private/geoapify-addresses --payload /private/original-action.json
~~~

Mutations include expectedRevision from current status. provider.run and provider.poll additionally require the original job ID and expectedRequestSha256. Reads status/source.inspect/review.list/review.query/provider.request use the current retained source. The HTTP interface uses GET /api/state, POST /api/action and authenticated original export routes. Source modules expose openGeoapifyWorkspace and openGeoapifyOperator for native composition; borrowed models are closed only by their original owner.

### Current primary provider sources

- Generic batch: https://apidocs.geoapify.com/docs/batch
- OpenAPI3.1 / Batch API1.1.1: https://apidocs.geoapify.com/assets/openapi/specs/batch/batch-api-openapi-specs.json
- Forward geocoding result and parameter meanings: https://apidocs.geoapify.com/docs/geocoding/
- Terms/attribution: https://www.geoapify.com/terms-and-conditions/

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

## Recurring customer sources and following editions

A workspace now retains a complete sequence of source intakes. The first source remains its original descriptor; earlier provider jobs, decisions, frozen editions and working forms keep their own source. Source selection and frozen customer-edition selection are independent.

Use **Following source** after building a baseline edition. Choose that exact frozen edition, retain the next complete CSV or JSON, describe its original provenance and either keep the baseline mapping or supply an explicit mapping. Staging saves full bytes and a fixed comparison; it leaves the current editor source, selected customer edition and publisher unchanged.

The comparison pairs records only when a nonempty business identity occurs exactly once in both sources. Added, removed, changed and unchanged records are explicit. Duplicate and missing identities are unpaired original rows, with their original ordinals and complete values available. There is no positional match or invented correspondence. Coordinate and other field changes appear even when an address query is unchanged.

### Review before choosing reuse

Matching address parameters can share a retained baseline candidate response. This is separate from matching business records. Candidate provenance names the frozen baseline edition and review hash; its original provider response remains visible. Original-coordinate distances are calculated for the following intake's records.

No baseline decision automatically approves the following source. Choose the eligible query checkboxes, explicitly choose **reuse every eligible decision**, or activate with no reuse. A chosen reuse records the new reviewer and reason, the original decision and exact comparison SHA-256. It preserves the original coordinate policy: preserve-source uses the following source coordinates; fill-missing uses that source pair when present; use-provider uses the explicitly chosen candidate. Inspect changes to original coordinates before reusing that policy. Address changes receive their own query and review.

Reuse is applied only at first activation. Later switches restore the source's original decisions and saved working forms. Continue individual decisions through Review addresses. Comparison checkboxes, selected comparison and unfinished source/review inputs are included in Save working forms and complete packages. Retain or explicitly clear selected local files before switching or exporting; a file picker alone is not saved source data.

### Continue original jobs and choose a delivery

Batch preparation uses the active intake. Every prepared job records its own intake SHA-256, and its original request, poll/import and response remain bound to that source after another source is selected. The Jobs section displays that identity. The provider retry floor remains workspace-wide, and the existing explicit POST and minimum poll behavior remains in force.

Activating another source does not select a different frozen customer edition. Build the following dataset in Dataset, inspect it, then select the intended edition. Delivery exports that selected edition's own intake, review, CSV, GeoJSON and original snapshot, even while another source is being edited. The complete workspace archive additionally preserves all other source revisions, comparisons, jobs, returned data, decisions, saved forms and frozen editions.

A following edition adds **source-comparison.json** and **source-comparison.html** to its complete delivery. The full report retains every comparison record and both original row values. The eligible baseline-decision list describes commissioning eligibility; the ordinary frozen address review contains the actual accepted decisions.

### Browser, CLI and native operator actions

The existing authenticated action endpoint and CLI expose the same actions. Mutations use the current expectedRevision. Source SHA-256 below means the retained normalized intake descriptor, not the original CSV/JSON file hash.

| Action | Required selection | Result |
| --- | --- | --- |
| source.history | Optional offset / limit | Paged retained intakes, original source metadata, baseline and activation status |
| source.stage | Full text or original path, format/name/provenance, baselineEditionId; optional sourceURL/mapping | Original source and comparison retained, current selections unchanged |
| source.compare | sourceSha256; optional offset/limit/status/search and reuseOffset/reuseLimit | Fixed comparison identity/summary, paged full row pairs and eligible baseline decisions |
| source.activate | sourceSha256; first activation requires expectedComparisonSha256 | Select that source and restore its forms; retain frozen customer selection |
| source.activate with reuse | Exact comparison SHA plus reuseQueryIds OR reuseAllEligible:true, reviewer, note | Explicit one-time baseline decisions copied with original provenance |
| source.inspect / review.list / review.query | Optional sourceSha256 | Read the original historical source without selecting it |
| editor.save / provider.prepare / review.decide / edition.build | Optional expectedIntakeSha256, in addition to revision | Reject a change aimed at a different active intake |

The native provider now has eighteen tool families, including merchant_geoapify_sources. It uses declared host-file aliases, independently pages source changes/reusable decisions and preserves the same original operator, writer lease and account. Browser and native reads show the intake identity used for each decision. A historical query read should pass its returned intake SHA when later saving; the active source must match.

Example first activation without reusing a decision:

~~~json
{
  "sourceSha256": "NORMALIZED_INTAKE_SHA256",
  "expectedComparisonSha256": "RETAINED_COMPARISON_SHA256",
  "reuseQueryIds": [],
  "expectedRevision": 12
}
~~~

Run the existing installed geoapify act source.activate --dir PRIVATE_WORKSPACE --payload ORIGINAL_PAYLOAD.json. Replace example identities and revision with actual returned values. To reuse all eligible decisions, replace reuseQueryIds with reuseAllEligible:true and add the actual reviewer/reason; it is an explicit operator choice over that exact retained comparison.

### Complete same-case receiving continuation

Continue the existing Geoapify customer course. Retain two actual source editions where available; if exercising an authored change to the first source, label it as an operator-authored following source and keep the complete actual original untouched. Choose real original rows that cover changed coordinates/address text, added/removed records and repeated IDs. Do not present authored changes as provider or customer observations.

Operate stage → full comparison → specific/all/no reuse → source switching with unfinished forms → original pending-job continuation → following review and dataset → select each frozen edition → complete exports and independent reopening. Reopen the earlier edition while the following source is active and check that its report/data/source identify the earlier source. Keep the exact original provider response history. Inspect desktop and narrow UI, empty/error/changed-source recovery, each outgoing HTML/JSON/CSV/GeoJSON/archive and reopened original workspace. Return actual rendered frames and files to the same original equipped course for producer inspection.
