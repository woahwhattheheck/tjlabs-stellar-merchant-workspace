# Run the catalog-to-native-request journey

`catalog-native-journey.mjs` exercises the installed buyer SDK against a running
merchant workspace. It reads the complete configured catalog view, selects an
eligible service after the first original page, prepares its durable native intent,
executes through the original host approval flow, reopens history and downloads the
complete saved response.

Use the existing configured native workspace and its real request parameters.
The same command also supports an explicit service ID in a native registry. It
selects that service's original configured catalog before the first page.

## Configure the run

Create a local JSON configuration with these fields:

| Field | Value |
| --- | --- |
| `url` | The running authenticated MCP endpoint |
| `workspaceId` | Optional exact ID from the host's `request-workspaces` response |
| `tokenEnv` | Optional existing access-token variable name; defaults to `MCP_ACCESS_TOKEN` |
| `intentId` | Optional new stable ID; otherwise generated once and saved before connecting |
| `maxAtomic` | Explicit positive atomic amount ceiling as a decimal string |
| `input.path` | Optional explicit raw string values for the selected published route template |
| `input.query` | Actual declared query names with string or repeated string values |
| `input.body` | Optional exact UTF-8 request text |
| `discovery` | `{mode:"resources",arguments:{...}}` or `{mode:"search",arguments:{query:"...",...}}` |
| `discovery.arguments.catalogId` | Optional configured source ID; it must match the selected service's original `catalogUrl` |
| `sourceRevision` | Optional complete commit SHA identifying the selected host checkout |

The input body uses the existing workspace's configured Content-Type. Request
preparation applies the original native route, network, asset, recipient and amount
checks. Use the concrete inputs required by that service. Published templates such as
`/inspect/:address` take the selected raw account address in `input.path.address`.
The buyer encodes each value into one URL segment and keeps it attached to the
selected listing. An existing concrete advertised path supplies its own fixed
bindings; seller example values are never substituted.

An existing native workspace retains its exact pathname. To authorize variable
paths within a trusted service, its operator initializes the native adapter with
`--route-template /inspect/:address` (using the actual published pattern). That
pattern must match the original configured operation URL. The template is a
trusted host setting; journey inputs only select concrete values.

Discovery starts from offset zero or the initial search page. The default is an
unfiltered resources walk with five rows per page. Supply actual filters when
evaluating a specific provider view. On a host with named catalogs, the command
reads `bazaar_catalogs`, finds the source matching the selected service and pins
its ID for every page. An explicit source ID must match that original URL.
`run.json` retains the supplied configuration separately from `catalog` and the
resolved `discoveryRequest`. The normal discovery client preserves complete
normalized requests, provider pagination, local filtering counts and
`partialResults` throughout the walk.

A later-page exercise needs the configured service to appear after the first page
of that actual view. Choose the relevant existing workspace and a useful original
page size. The command reports the selected original page index and raw provider
page hash.

## Execute

From the installed package:

```sh
starforge mcp-catalog-journey --help
starforge mcp-catalog-journey \
  --config /absolute/native-journey-request.json \
  --out /absolute/new-native-journey
```

From the merchant workspace checkout:

```sh
node stellar-forge/mcp-paid-agent/catalog-native-journey.mjs \
  --config /absolute/native-journey-request.json \
  --out /absolute/new-native-journey
```

The output directory must be new. Keep the normal operator console open for the
existing approval request. Progress is written as JSON lines with the stable intent
ID, so the original operator can find the exact pending request.

The journey completes these connected steps:

1. Open the maintained native request client, inspect the original workspace, and
   bind the lifecycle to its resolved service ID when the host supplies one, then
   select its original catalog by the configured URL.
2. Traverse every resources offset or search cursor, retaining each returned page
   and every HTTP/MCP description.
3. Prepare the first matching later-page HTTP service whose original offer matches
   the workspace's route and payment configuration. Resolve its explicit path and
   query values through the maintained request codec before selecting it.
4. Finish the complete catalog walk and reopen that same durable native intent.
5. Execute through the existing SF88 operator, approval, signer and queue.
6. Reopen the original result, download every byte using the client's existing
   range and SHA-256 verification, and find the intent in the original history.

Preparation occurs while the selected page's handle is live. Later catalog pages
may retire cached handles; the subsequent review and execution use the durable
intent and its retained complete provider page. The selected description must match
that page's hash, byte count and original row index before preparation, and the
retained preparation must preserve the same page hash and row index. The selected
`requestUrl` and `pathBinding` retain the advertised URL, canonical route template,
actual parameter values and concrete request URL. Preparation, reopened review
and completed result must keep that same URL and original catalog ID/URL.

## Read the results

| Output | Contents |
| --- | --- |
| `run.json` | Supplied configuration, resolved catalog and request, source hashes, HTTP/MCP/template coverage, selected-page and concrete-path identity, native lifecycle and measured phases |
| `catalog-pages.ndjson` | Complete broker discovery responses with their original provider page hashes and pagination |
| `resource-descriptions.ndjson` | Actual HTTP/MCP request declarations read from those handles |
| `result.bin` | Complete verified saved native response |

`run.json` is updated after each phase. It retains the original error and native
intent hints when a phase fails. Continue that ID through the normal SDK or console
history after an interrupted run; the workflow makes one execution request.
If the existing operator is busy, the report retains the queued intent and resolved
workspace with an explicit execute continuation. Resume that same identity once the
active operation finishes.

The raw provider capture used by the SF41 ranking replay remains a separate input.
The NDJSON page file contains the broker's documented discovery response, including
the hash of the original provider bytes retained by the host.

## Understand the measurements

Each phase records elapsed time, client CPU time and process memory before and
after the operation. The report includes Node version, machine CPU count and load,
plus the actual installed discovery/native client, query codec and route-binding source hashes. An optional supplied
commit is identified as the operator-selected revision.

These observations describe the journey process and observed MCP round trips.
The complete-discovery phase includes the nested selected-request preparation
phase, so those durations are not additive. Operator approval time is part of the
observed execute phase.

For the lexical engine's CPU and ranking comparison, use the existing
[SF41 source replay](https://github.com/woahwhattheheck/public-commons-sprint-2026/tree/main/stellar/scf-starforge-20261009/sf41-real-source-replay)
with the complete original provider capture and the same source pair. That runner
reports the nine original query probes separately from queries derived from
published request schemas.

Together the two runs cover catalog capture, search, pagination, declared inputs,
durable selection, original native execution and complete result delivery.
