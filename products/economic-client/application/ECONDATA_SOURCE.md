# EconData original source acquisition

This client is the source-acquisition component of the saved economic client briefing workspace. It reads the existing EconData API, retains complete original responses, joins native metadata, and transports the same source journal to a receiving customer workspace.

## Original authority and dependencies

The complete primary contracts are included under the product's `upstream/` directory:

- Codera's original Swagger 2 document at <https://www.econdata.co.za/sdmx-codera/swagger.json>, 95,052 bytes, SHA-256 `40c9a7c4671b948586bd31ebdd32a38e68c2de8c5701f5af610ec37465a3d0b9`.
- The released MIT-licensed `coderaanalytics/econdatar` 4.0.4 source, commit `9a2f5ed2130122c461c05f3b880c5c4f3ed8f911`, annotated tag object `16d23978f43c3352d19e20c14e3ca94297501c47`. The complete selected R functions cover authentication, registry/data reading, pagination, release conversion and metadata. Their original file identities are in `upstream/ECONDATA_SOURCES.json`.
- Maintained MIT-licensed `lossless-json` 4.3.1, original published UMD distribution, 9,626 bytes, SHA-256 `3eebf0821060a4d9910c55e6c50f11961062cc20944ee745007ea19e3cdec885`. The unchanged distribution, license and original npm release metadata are under `application/vendor/`.

Swagger documents request paths and query types but does not define the response schemas. The released R consumer supplies the native typed-message, dataset, release, metadata-reference and pagination contracts. The client keeps those original response bytes and exposes an untagged lossless projection.

Use Node.js 20 or later. Node builtins supply filesystem durability, HTTPS, SHA-256 and response decompression. The included original lossless parser is the sole runtime dependency; there is no package installation step.

## Application API

```js
import { createEconDataClient } from './econdata-client.mjs';

const client = createEconDataClient({
  directory: '/private/client-workspace/econdata',
  credentialEnv: 'ECONDATA_CREDENTIALS',
  baseUrl: 'https://www.econdata.co.za/sdmx-codera/v1',
  timeoutMs: 120000,
  maxResponseBytes: 64 * 1024 * 1024,
});
```

Configuration contains environment variable names. An existing `client_id;client_secret` value follows the released R client's Cognito client-credentials exchange. An existing API JWT value is used as the original bearer token. An optional `credentialsEnv` selects a service-credential-only variable instead of `credentialEnv`. The default token endpoint is `https://codera-econdata.auth.af-south-1.amazoncognito.com/oauth2/token`; an explicit authorized deployment can supply `authUrl`.

Construction and source inspection, export, and import do not inspect credential values or make HTTP calls. A workspace containing only its original OECD companion can use the same customer handover. Credential values and OAuth response bodies remain process memory and are excluded from source journals and exports.

Each acquisition method uses a caller-supplied operation ID. Reusing that ID with the same exact selection continues its original sources and frozen release. Reusing it with different input is rejected. A new requested edition gets a new operation ID.

### Registry

```js
await client.registry(operationId, {
  kind: 'datasets', // datasets | dataflows | datastructures | codelists
  agencyids: ['ECONDATA'],
  ids: selectedIds,
  versions: ['latest'],
  detail: 'full',
  relations: 'references',
});
```

The three plural filters accept native comma strings or explicit arrays of strings. The result has `schema`, `state`, `operation_id`, `selection`, `records`, `structures`, `sources`, `acquired_at`, and `number_encoding`.

The dataset catalogue does not document a `detail` query. The original selection retains it while the actual catalogue request omits it. Dataflow, DSD and codelist requests use the documented parameter. Every returned next link is consumed.

### Capture

```js
await client.capture(operationId, {
  dataset: { agencyid: originalAgency, id: originalId, version: originalVersion },
  release: { kind: 'latest' },
  // Or {kind:'description', value: originalDescription},
  // {kind:'timestamp', value: originalTimestamp}, or {kind:'unreleased'}.
  series_keys: selectedNativeQueryStrings,
  start: originalStart,
  end: originalEnd,
  hist_obs: true,
});
```

Omit optional keys instead of passing undefined or null. Omitting `series_keys`, or passing an empty array, requests the selected dataset. A nonempty list contains unique native query strings. The original returned `series-key` value remains its actual scalar, object or array type.

The catalogue resolves the selected agency, ID and version to one original dataset before capture. A native reference is formed from its full returned triplet; it is never reverse-split on hyphens. A `latest` or description release is resolved once from the native release list and retained before dataset requests. A missing description needs a corrected new selection. It never silently chooses another release.

The released R reader treats timestamps returned by the release catalogue as UTC, then formats the request in Africa/Johannesburg. This client preserves the complete original release row and the separate exact query string. An explicit offset-bearing timestamp is converted to the same provider timezone. An explicit timestamp without an offset is already the provider's local query wall time. `unreleased` omits the release query and is marked mutable. `hist_obs` remains independent of release selection.

The complete result is:

```text
schema: tjl.econdata.capture.v1
state: COMPLETE
operation_id, selection, dataset_ref, release
datasets: complete native dataset objects with merged series[].obs[]
structures: complete returned registry collections
structure_sources: original source ID and projection pointer for each structure
metadata_joins: dataset → provision agreement → dataflow → DSD → concepts/codelists
series_sources: each source/page/filter/series observation range
sources: complete original GET response identities
acquired_at
number_encoding: json-number-lexeme-string
```

The client joins the dataset's original provision agreement, its dataflow, the dataflow's DSD, all component concept schemes, and every referenced codelist. This includes codelists used by attributes. Missing complete referenced schemes or lists are fetched through their documented native GET. Every original structure field is retained. The join records the native component, its actual original `native_type`, source ID and projection pointer, selected concept, scheme reference and optional codelist reference. A native component without a type wrapper has `native_type: null`; no Dimension/Attribute/TimeDimension/PrimaryMeasure type is inferred.

Every actual `Link: …; rel=next` is followed through the complete chain. Next pages must retain the original API authority, endpoint and frozen selectors. Offset and limit can advance. Each selected series filter has its own chain.

Datasets merge by the full native agency/ID/version. Series merge by the canonical value of their original `series-key`, preserving scalar, object or array types. Observations concatenate in received page order. Historical repeated periods and overlapping-filter memberships remain in the result, with `series_sources` identifying their complete source, selector, page, native series index, observation offset and count. Conflicting non-observation metadata raises a retained attention outcome.

### Explicit documented reads

```js
await client.read(operationId, {
  resource: 'datasets',
  ref: nativeDatasetReference,
  section: 'release',
  query: { latest: true },
});
```

Supported resources are datasets, dataflows, datastructures, codelists, conceptschemes and provisionagreements. Dataset sections are release, schema and series; the series section optionally takes `series_ref`. Only each endpoint's documented query names and native types are admitted. This method returns complete `responses[]` with their source IDs, projected data and numeric-token maps, plus full `sources[]`.

## Exact numeric and native source values

`parseEconDataJSON(rawText)` uses the unchanged lossless parser. Every JSON numeric token becomes its exact lexical string, including integer digits beyond JavaScript precision, trailing decimal zeros, exponent notation and tiny values. Native JSON strings remain strings. The accompanying `number_lexemes` maps original JSON pointers to numeric tokens, so a reader can distinguish native strings from projected numbers.

Only native two-element wrappers whose first value begins `#sdmx.`, `#sdmx:` or `#sdmx/` are unwrapped. Ordinary arrays and localized `["en", "label"]` values remain arrays. Complete raw responses preserve all original wrapper types. `type_tags` maps untagged projection JSON pointers to their original wrapper tags, independently of the raw numeric-token pointers. Nested wrappers at one pointer retain their ordered original tags.

```js
const received = client.readSource(sourceId);
// {source, raw_text, data, number_lexemes, type_tags}
const status = client.inspect(operationId);
// Complete result, or exact saved attention/progress/frozen selection.
```

Every body is read from its retained relative path and checked against its original SHA-256 and byte length. Original wire bytes and decoded JSON bytes both survive content encoding. Ordinary acquisition requests ask for identity encoding; gzip, deflate and Brotli are decoded only after their complete original wire body is retained. Duplicate object keys are rejected by the maintained parser.

## Native acquisition and continuation

The client journals the operation and request before the actual GET. Each attempt retains its complete headers, status, HTTP version, wire body and terminal result. A process interrupted after writing a complete HTTP envelope can reuse that envelope. A short body, incomplete framing, unsupported encoding or invalid JSON remains retained for diagnosis and a later explicit continuation.

Requests use one configured HTTPS authority and original bearer session. The source directory freezes its authority once any source operation exists. An empty source directory created for an OECD-only export may still select its first actual EconData authority. Redirects are recorded individually and must remain within that API authority and path. There is no automatic request retry or alternate identity. A returned 401 clears only the in-memory service token; a later explicit continuation can obtain the current token. Provider Retry-After deadlines are retained and enforced across subsequent operations.

The response byte limit and deadline are explicit controls. Exceeding them produces an attention outcome with the original saved selection and response prefix. It does not mark a partial page as complete. A caller can increase its local configured resource bound and continue the same operation.

Sensitive response header fields such as Set-Cookie and authentication-info are omitted with their names recorded. Authorization request values and token response bodies never enter source packets.

A process-owned native directory lock serializes source mutation. Linux uses the original PID, boot and process-start identity. Other Node hosts conservatively retain a live PID binding. Stale owner recovery preserves the previous lock record. Customer transfer omits machine locks and imports into the receiver's own directory.

## Full source export and independent reopening

```js
const packet = await client.exportState();
const receiver = createEconDataClient({
  directory: '/private/received-customer/econdata',
  credentialEnv: 'CUSTOMER_ECONDATA_CREDENTIALS',
});
await receiver.importState(packet);
const capture = receiver.inspect(originalOperationId);
```

The source-state packet contains the complete original operation and GET journals, all complete body objects, attempt response records and retained prefixes, the original API authority, and the provider delay record. Every member has a safe relative path, exact base64 content, byte count and SHA-256. A manifest binds the ordered member identities.

Import validates the complete packet before writes, rejects links and conflicting existing members, and preserves original IDs and journal bytes. An interrupted receive can repeat the same packet into the same receiving directory. Completed captures reopen without network or credential values. Pending operations retain their frozen native version/release and original source requests, while the receiving customer chooses its environment variable name.

The surrounding client-briefing project retains this complete packet with its editable source selection, report objects and untouched original OECD project archive. Source account access and source distribution rights remain attached to the actual provider and selected data; an API capture does not create new data rights.

## Validation and native receiving

The entire authored module was parsed with the original Acorn distribution from Node.js v22.16.0. A focused execution used the actual unchanged lossless-json bundle to verify exact large integers, decimal zeros, typed wrapper handling, localized arrays and the release-list UTC conversion. The full native receiving course should execute the selected authorized registry/capture, create its complete report, export the project, and independently reopen the same source bytes under the receiver's original environment binding.
