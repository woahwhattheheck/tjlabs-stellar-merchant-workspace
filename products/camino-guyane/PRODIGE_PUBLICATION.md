# Publish an existing Analysis edition through Prodige

This adapter carries an existing reviewed Analysis export into a selected Prodige catalogue resource. It keeps the original intake, SQL, indicator, review, report, workbook and editable-workspace implementations. The two JavaScript files prepare complete publication files, compile the selected instance's documented request shapes and reconcile all returned target pages. The existing authorized catalogue session remains the transport and credential owner.

## Actual source contract

The reference contract was read from the complete original SIGLoire API documentation at https://catalogue.sigloire.fr/api/doc/ on 13 October 2026. Its embedded OpenAPI 3 document declares version 1.0.1 and 16 operations. The reference is an implementation example: inspect and retain the complete actual target instance specification before planning that instance's publication.

| Resource and action | Declared route |
| --- | --- |
| Read a geographical or tabular resource | GET /api/data/{uuid} |
| Inspect existing columns | GET /api/structure/{uuid} |
| Append geographical rows | POST /api/data/{uuid} |
| Update geographical rows using existing server IDs | PATCH /api/data/{uuid}/gid |
| Append tabular rows | POST /api/data_tabulaire/{uuid} |
| Update tabular rows using existing server IDs | PATCH /api/data_tabulaire/{uuid} |

The read endpoint declares nature, limit, offset and sort_by. The maintained API guide describes the Link response header for paging. The adapter reads with nature=edit and gid:asc, follows every original rel=next, and rejects a changed origin, resource, selection, duplicate parameter or nonadvancing offset. It does not infer a separate tabular read path.

Catalogue creation, deposit, API activation, permissions and scientific publication approval stay in their original operating workflow. The resource UUID selects an existing deposited resource. The actual resource structure must agree with the approved field, geometry and CRS mapping before the operator executes any prepared request.

Primary references:

- API use and complete readback: https://www.prodige-opensource.org/accueil/tutoriels-v5/diffusion-des-donnees/utiliser-api-prodige
- Resource API activation: https://www.prodige-opensource.org/accueil/documentation-version-5/prodige-catalogue/mode-expert/diffusion-de-la-donnee-wmswfsapi
- Original data deposit: https://www.prodige-opensource.org/accueil/documentation-version-5/prodige-catalogue/mode-expert/depot-de-la-donnee

## Retain the actual original edition

Select the complete original exported JSON file, its byte count and SHA-256, and the exact JSON Pointer to its complete row array. Every source column is another explicit JSON Pointer relative to a row. A publication column has a selected target name, type and nullability. The original nonempty text business key must be present and unique. Prodige's gid is reserved for the separately observed target record ID.

Supported attributes are text, safe integers, booleans and decimal-text. Dates remain their original text. A decimal-text value remains an exact token, optionally with a selected fixed scale. No implicit number/date coercion occurs. Geographic publication preserves the original geometry object and requires the already-selected source CRS to equal the target CRS; any required transform belongs to the original GIS workflow.

attributes.csv is UTF-8, fully quoted, comma-delimited and CRLF-terminated. CSV alone cannot distinguish a null from an empty text cell here: features.geojson, edition.json and the full mapping preserve that meaning. Open CSV as typed data; formula-looking original text remains original text. Geometries remain in complete GeoJSON. No spatial topology or unique-land-coverage claim is inferred from source-reported areas.

## Complete worked source

The retained Camino example uses the actual maintained supplier parser's 68,708-byte complete observations and its 61 national/Guyane research-title comparison rows. It publishes seven selected attributes: the title ID, both original publisher date cells, the publisher's explicit ISO date interpretations and both retained tabular ISO dates. It preserves disagreements instead of replacing either edition.

The same original example prepares a 6,561-byte CSV (SHA-256 35ae0d9e144489bb717a9e979c6f6b30446635090718d8875b6b3470eaaeded6) and 24,354-byte pretty-printed GeoJSON (SHA-256 6b174b033753f121101a43e5e7812b0d96f576b4cf2e95651509238e645dfd6d). The source JSON and exact input are under prodige-reference. No catalogue UUID or target result is invented for this example.

From the complete existing checkout:

    node products/camino-guyane/prodige_publication_cli.mjs prepare \
      --input products/camino-guyane/prodige-reference/camino-publication-input.json \
      --out /absolute/owned/output/camino-publication-edition

Each command preserves both complete adapter source files and writes a whole-file manifest. Existing identical files replay; differing files are rejected so the original edition remains intact. The output manifest is published last. A rerun after partial publication fills only missing identical members. Retain the complete directory, not just its manifest.

## Prepare the actual target publication

First save the actual complete instance OpenAPI JSON returned by its original documentation endpoint. The reference parser also accepts the original Swagger wrapper containing a spec object.

    node products/camino-guyane/prodige_publication_cli.mjs inspect \
      --spec /absolute/source/instance-openapi.json \
      --out /absolute/owned/output/instance-contract

The target selection JSON has exactly these fields: origin, resourceUuid, specification, mode, batchSize and optional gidByBusinessKey. specification contains the actual file's bytes and sha256. The origin is one HTTPS catalogue origin; no credentials, URL user information or extra transport configuration belongs in this file. mode is append or update. Supply the instance's accepted batch size explicitly.

For append, leave gidByBusinessKey empty so the server creates IDs. For update, map every selected original business key to its actual target gid from retained complete readback. Extra mappings, missing mappings or duplicate IDs are rejected. Retain the original operator selection and current target structure with this mapping.

    node products/camino-guyane/prodige_publication_cli.mjs plan \
      --spec /absolute/source/instance-openapi.json \
      --edition /absolute/owned/output/camino-publication-edition/edition.json \
      --input /absolute/source/target-selection.json \
      --out /absolute/owned/output/prodige-publication-plan

The plan contains complete source/target selections, all FeatureCollection request bodies, the actual method/URL for every batch, the structure read and the initial readback URL. It is PREPARED. The adapter makes no HTTP call. Its standard Node runtime uses only maintained built-in modules; no dependency installation is needed.

## Execute through the original catalogue session

Use the existing authorized operator session for the actual declared API. Keep its credentials in that session. Before each mutation, persist the exact method, URL, complete body and CALLING state in the existing operation journal; after return preserve the original status, public response metadata and complete returned body. The inspected specification declares no idempotency key or compare-and-swap mechanism. A lost mutation response must therefore lead to full original target reconciliation before deciding any further write; do not blindly replay an append.

Readback equality proves that the retained target values match the selected edition. It cannot attribute those values to a particular writer. Pagination is not an atomic database snapshot: use the original owner's controlled publication window or other actual instance consistency mechanism. Preserve the complete provider response and operation history alongside the readback. This adapter neither invents approvals nor sends new catalogue changes.

## Reconcile all actual returned pages

Pass the exact prepared plan and a JSON array containing every original page, in returned order. Each page contains url, status, headers, rawBody and file with the raw body's exact UTF-8 bytes/SHA-256. Preserve rawBody literally, including whitespace. No provider authorization or signed transfer envelope belongs in this readback input.

    node products/camino-guyane/prodige_publication_cli.mjs reconcile \
      --input /absolute/owned/output/prodige-publication-plan/request-plan.json \
      --pages /absolute/source/prodige-original-readback-pages.json \
      --out /absolute/owned/output/prodige-readback

All response bodies are checked against their original whole-file identities. Complete pagination must terminate normally. The reconciler rejects duplicate business keys or gids, missing identifiers and an incomplete chain. It compares every selected attribute including its JSON type, geometry and the original gid for updates, and retains all differences plus unrelated target keys. CONFIRMED means the received target values match; DIFFERENT retains the complete mismatch report and exits 2. Input/contract failures exit 1.

Saved readback files retain only the original URL, status, exact body and file pin plus the public Link/content-type/content-length/date/ETag/last-modified/request-ID headers. Authorization, cookies and unrelated provider fields are excluded. The original transport remains responsible for its private receipt.

## Finish in the actual recipient workflow

Keep the original report, workbook, CSV/GeoJSON, metadata, request/readback records, source and editable Analysis archive together in the existing delivery package. Open the actual target table or map and the exported report and workbook, inspect the intended consumer views, correct visible defects in the original implementation, and retain the observed source/output version. A second source edition follows the same existing review, comparison, publication and cold-receiving workflow with explicit changed IDs and values.

Browser screenshots remain internal inspection on the live producing host. Preserve textual observations and exact inspected artifact identities with the delivery; the existing complete receiving operation controls final rendered review and original output saving.

## Small supported module interface

prodige_publication.mjs exports inspectSpecification(document), prepareEdition(input, {identify}), prepareRequests(specificationText, edition, target, {identify}) and reconcilePublished(plan, pages, {identify}). identify(text) must return the actual UTF-8 bytes and SHA-256. The CLI supplies Node's original crypto implementation. Original inputs, mappings and output identities are explicit; the module has no credentials, network client or alternate dataset engine.

## Complete current repository owner instructions

# Repository delivery instructions

Use the current README and the existing product's build/receiving guide. Coordinate through the original implementation and receiving owners, preserve concurrent source, and carry work through its authorized delivery.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

## GitHub Actions zero spend — existing owner instruction

Keep GitHub Actions disabled in this repository's provider settings and preserve the disabled source policy in [.github/hosted-ci-policy.json](.github/hosted-ci-policy.json). Every workflow job must retain the established literal-false condition, including manual dispatch and reusable jobs. Preserve its original condition inside the wrapper, and preserve the complete steps, commands, source and delivery artifacts.

Run focused product work in the existing cloud Linux or original local receiving operation. A public repository, available free minutes, cloud admission failure or a missing green check does not authorize enabling or dispatching hosted Actions. Do not set `HOSTED_CI=on`, add scheduled hosted runs or choose a paid runner. Keep source-native receiving moving with its original owner and saved operation.

Before publishing workflow changes, use the maintained Commons `tools/hosted_ci_gate.py --zero-spend REPO_ROOT` and `--check REPO_ROOT` source operation where that existing runtime is available. Its canonical wrapper is `${{ (false) && (ORIGINAL_CONDITION) }}`; the original condition is retained for native continuation. Provider disablement, the whole-account spending budget and dated billing remain separate controls; preserve current artifacts and their original custody.

This carries Bryce's existing zero-spend instruction from [Commons RULES, CI and spend](https://github.com/woahwhattheheck/commons/blob/main/RULES.md#4-ci-and-spend) into this repository's consumed entry guidance. Original cost coordination: https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791755765336589 .
