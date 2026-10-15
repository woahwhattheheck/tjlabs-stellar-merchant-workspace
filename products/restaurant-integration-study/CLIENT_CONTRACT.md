# Compass native request engine

The engine is independently authored against Compass's current public API contract on 15 October 2026. It retains exact request and response originals and exposes explicit identity selection. A browser operator prepares requests and imports complete journals; only the native owner environment supplies credentials.

## Runtime

`compass-client.cjs.run(operation, services)` takes `io.load(id)` and `io.append(id, record)`, native `fetch`, optional clock/sleep/random/signalFactory, and `apiKey` from COMPASS_API_KEY. The wrapper must hold one exclusive operation lock across the entire call. Append resolves only after the immutable record is durable. Every record has a zero-based sequence, previous_sha256 and canonical-body sha256. Do not mutate records inside the storage service.

A repeated operation ID is input-bound. A retained exact operation returns its complete receipt without another HTTP request, including an uncertain dispatched outcome. Changing the input under that ID is rejected. New retry decisions must have a distinct explicit operation and retained relationship in the study.

Current supported routes are metadata, Search, Enrich, Decide and Changes. The fixed official HTTPS origin and paths are in compass-contract.cjs. Redirects are refused. Explicit fast/rich mode is required for metered calls. No provider idempotency is assumed.

## Journal

Operation original precedes dispatch. Dispatch precedes the actual call. Response headers precede complete body retention. Transport failures, partial bodies and interrupted durability remain distinguishable from successful responses. Response bytes use base64, byte length and SHA-256; allowlisted usage headers remain observed snapshots. The API key is not a journal field.

The first event retains the whole operation. Events may be operation, dispatch, response_headers, response, transport_failure, retry_wait or terminal. verify(events) validates the full chain; receipt(events) produces a compass.journal/v1 envelope with original operation, all attempts and all events. Do not erase partial/unselected filesystem artifacts; expose them in recovery exports separately from the committed chain.

Only documented per-minute/IP 429 codes retry automatically, with Retry-After, jitter, four attempts and a 30-second total bound. Monthly quota, entitlement, validation and dispatched transport uncertainty do not auto-retry. A stopped process cannot silently restart the network call.

## Explicit selection

prepareDecision accepts a retained upstream packet, the exact compass_id selected by a named person, selection time, profile, new operation ID and mode. An Enrich identity must be matched:true; a Search selection must occur exactly once among its retained candidates. It returns an input-bound Decide operation. run reloads and checks the original upstream chain, selected response hash and body hash before dispatch.

HTTP 200, resolved identity and actual fit verdict are separate states. Search match_for_profile is a preview. Unknown is an actual Decide verdict when attached to a resolved Compass identity. An unresolved response with no decision remains unresolved. No first-candidate selection is supplied.

## Filesystem receiving contract

Use a private directory with a stable checked filesystem identity; operation names are portable and validated. Write immutable exact events exclusively, flush bytes and parent directory where supported, and select durable records without overwriting competing work. A lock conflict must be explicit. The Linux runner holds a kernel advisory lock on a stable lock file. The operating system releases the lock when the process exits; the file is never deleted to guess that a lock is stale. A reopened operation returns its retained receipt rather than dispatching again.

The delivered CLI is native/compass-call.cjs and its journal implementation is native/compass-journal.cjs. Commands run, inspect, export and prepare-decision retain exclusive output files and accept original JSON request/profile files. The API key is read only from COMPASS_API_KEY; never accept it as a command-line argument or copy it into an artifact. Metadata requires no key.

## Pricing and metadata

Published modelled credits are Search fast 1 / rich 2, Enrich fast 1 / rich unknown, Decide fast 2 / rich 5, and metadata 0. Changes pricing is unlisted. Monthly usage headers are cumulative snapshots, not per-operation increments. Keep observed usage, modelled credits, HTTP attempts and dollar subscriptions separate.

Current metadata distinguishes scoringVersion from model_versions.scoring. Preserve both and every original response field. A metadata 304 response references a retained prior snapshot; it does not itself contain a new dataset. Changes pages are not a complete city inventory or a guarantee that every merge, redirect or city wipe is listed.

## Sources

https://compassfoodtechnologies.com/openapi.json
https://compassfoodtechnologies.com/docs/api/search
https://compassfoodtechnologies.com/docs/api/enrich
https://compassfoodtechnologies.com/docs/api/decide-fit
https://compassfoodtechnologies.com/docs/api/query-contract
https://compassfoodtechnologies.com/docs/api/metadata
https://compassfoodtechnologies.com/docs/integration-patterns
https://compassfoodtechnologies.com/docs/errors
https://compassfoodtechnologies.com/docs/pricing

The fresh machine contract supersedes stale cached examples: retired Search GET and restaurant GET return 410; retired refresh has no replacement. Changes is available across tiers. Conflicting cached Sandbox narratives must be resolved by actual entitlement responses, not a guessed client-side tier restriction.
