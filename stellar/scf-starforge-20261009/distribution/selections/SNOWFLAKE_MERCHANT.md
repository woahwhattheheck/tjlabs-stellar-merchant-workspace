# Snowflake merchant installation and customer receiving

This product carries an existing Snowflake read from its original SQL API request
through complete retained result partitions, review, a native SQLite merchant,
Stellar release operation and customer receiving. The private browser and
merchant agent use the same saved source, editions and publication history.
Customers receive the selected merchant files and native snapshot together with
the exact original result bodies.

The maintained source selection is **snowflake-merchant**. It includes the
Snowflake workspace, managed Applications provider, 33 merchant actions, typed
JavaScript client, command line, SQLite workbench, SF82 release controls, original
buyer and complete receiving programs. The recipe registers 31 commands, 57
exports, two Applications providers and four merchant providers. The source
builder records the selected commit and measures its complete archive.

## 1. Build the selected product

Use a complete checkout of the standalone merchant repository containing this
recipe and the commit intended for release. From that checkout:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/starforge-checkout --ref ORIGINAL_COMMIT_SHA \
  --selection snowflake-merchant --out /absolute/snowflake-release
~~~

Keep the returned archive path and SHA-256 together. The original manifest
records every source file, the selected Git commit, contribution inputs and
the recipe's exact path, Git blob, SHA-256 and length. The package name remains
@tokenjunkielabs/starforge-merchant; its source version includes
.selection.snowflake-merchant. Repository identity comes from the selected
standalone distribution.

The original builder resolves static module dependencies and declared browser
assets from the same Git tree. The recipe retains the full Snowflake and SQLite
products, release and buyer components, installer, managed worker files, Python
operator support and the complete original receiving input. The buyer's declared
browser asset maps travel with the selected source.

Continue an interrupted build in its original output directory:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/starforge-checkout --out /absolute/snowflake-release --resume

node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out /absolute/snowflake-release --status
~~~

Resume retains the selected commit and recipe when their flags are omitted.
A completed matching output reopens its retained archive. Select a new output
directory for a different release or product. Add --offline when all required
Git objects are already present.

## 2. Install the original runtime

The maintained installer requires Linux, Node 22.16 or newer, Python 3.11 or
newer, npm and flock. The Snowflake journal and editions operate native
node:sqlite. Use the source-selected runtime profile for the complete merchant:

| Selection | Capability |
| --- | --- |
| --native | Original Stellar SDK, settlement and native buyer dependencies |
| --feature schema | Shared offer and route schema support |
| --feature openapi | API descriptions and original shared merchant support |
| --feature mcp | Authenticated merchant transport and original MCP SDK |
| --operator | Linux/Python/flock requirements for managed operation |

The selected source manifests determine dependency versions. Retain that profile,
the complete dependency lock and the installed source together.

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /private/snowflake-runtime \
  --archive /absolute/snowflake-release/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /private/snowflake-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /private/snowflake-runtime --load --source
~~~

Use the actual archive and digest returned by the build. Final inspection
reports the selected source, dependency profile and readiness. Declared SQLite
readiness executes an isolated database operation; the loaded inspection also
imports the selected installed entries.

For an existing package cache, continue install or resume with
--offline --cache /absolute/original-npm-cache. Native compilation from that
cache also needs matching local Node headers and a compiler; select the header
prefix with --node-headers /absolute/node-header-prefix. The prefix contains
include/node.

When complete compatible node_modules and its original lock have already been
received into this installation, use install --dir /private/snowflake-runtime
--adopt-existing. The original installer verifies the selected dependency graph,
imports and native operations under the installation's existing lease.

The examples below forward commands through that installation. Set these
task-specific paths to the actual checkout and received runtime:

~~~sh
SNOWFLAKE_TOOLS=/absolute/starforge-checkout/stellar/scf-starforge-20261009/distribution
SNOWFLAKE_RUNTIME=/private/snowflake-runtime

snowflake_starforge() {
  node "$SNOWFLAKE_TOOLS/runtime-install-cli.mjs" run \
    --dir "$SNOWFLAKE_RUNTIME" -- "$@"
}

snowflake_starforge source
snowflake_starforge registrations --source snowflake
snowflake_starforge merchant providers inspect snowflake-workspaces
~~~

The same forwarded commands are available as starforge when the selected
package's original bin is on PATH. For another host, the maintained
runtime-transfer workflow receives the original source, profile and dependency
material. See [runtime installation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) and
[runtime transfer](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/RUNTIME_TRANSFER.md) for that complete operation.

## 3. Initialize and open the data workspace

Choose a canonical private parent directory on the operating host. Initialize
one Snowflake workspace and retain its returned native UUID:

~~~sh
snowflake_starforge snowflake init \
  --directory /private/snowflake-finance

snowflake_starforge snowflake inspect \
  --directory /private/snowflake-finance
~~~

The directory, workspace.sqlite and retained source objects belong together.
The UUID identifies this workspace across browser or merchant host restarts.
An independent receiving workspace has its own UUID while preserving the
received edition's identity.

For a direct foreground browser:

~~~sh
snowflake_starforge snowflake serve \
  --directory /private/snowflake-finance --port 0
~~~

Open the exact private URL printed by the command. The listener binds
127.0.0.1, and its URL fragment authenticates requests to that original browser
instance. Leave its foreground process open during use. The browser provides
Source & capture, operation history, edition comparison and review, complete
original-file receiving, and merchant publication.

### Managed Applications

To keep the same workspace in the maintained Applications lifecycle, initialize
an operator workspace, attach the READY runtime and open the operator:

~~~sh
snowflake_starforge runtime-workspace init \
  --workspace /private/snowflake-operator

snowflake_starforge runtime-workspace attach \
  --workspace /private/snowflake-operator \
  --runtime /private/snowflake-runtime \
  --label "Snowflake merchant runtime"

snowflake_starforge runtime-workspace serve \
  --workspace /private/snowflake-operator --port 8465
~~~

In Applications choose **Snowflake data workspace**, select that runtime and
enter /private/snowflake-finance as the existing Snowflake workspace. Select
the host's existing private environment file when the account credentials are
supplied that way. Use **Review application**, **Save application**,
**Review start**, then **Start reviewed application**.

The preparation records the original workspace UUID and exact Snowflake launch
source. Start verifies that the selected installed source and executing source
match, then authenticates the actual listener and native instance before
offering its link. Use the existing Connect, output, recovery and Stop controls
for that saved application. Mutable editions and reviews remain in the original
workspace; changing its source data does not create another application.

The direct browser, Applications and merchant provider all acquire the original
native workspace writer. Stop the currently owning browser/application before
opening that same directory through a different owner. Within a merchant host,
its human browser and agent calls already share one native writer.

See [managed Snowflake operation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/snowflake/MANAGED.md)
and the [Applications guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/runtime-workspace/APPLICATIONS.md) for the
original saved application and operation records.

## 4. Configure and capture an existing Snowflake read

The source declaration names environment variables containing the existing
account HTTPS origin and bearer token. Set those values in the selected host's
service environment. The declaration supports the existing OAuth, key-pair JWT
or programmatic access token mode and the account's exact warehouse, database,
schema and role.

The following is a complete source authoring shape. Replace its context, table,
columns and query with the actual approved read:

~~~json
{
  "schema": "stellar-forge.snowflake-source.v1",
  "label": "Reviewed finance observations",
  "accountUrlEnv": "SF30_SNOWFLAKE_ACCOUNT",
  "tokenEnv": "SF30_SNOWFLAKE_TOKEN",
  "tokenType": "OAUTH",
  "context": {
    "warehouse": "EXISTING_WAREHOUSE",
    "database": "EXISTING_DATABASE",
    "schema": "EXISTING_SCHEMA",
    "role": "EXISTING_READ_ROLE"
  },
  "queries": {
    "observations": {
      "sql": "SELECT \"ID\", \"OBSERVED_AT\", \"AMOUNT\" FROM \"OBSERVATIONS\" WHERE \"ID\" = $id AND \"AMOUNT\" >= $minimum",
      "columns": ["ID", "OBSERVED_AT", "AMOUNT"],
      "keyColumns": ["ID"],
      "parameters": {
        "id": {"type": "string", "maxLength": 128},
        "minimum": {"type": "decimal", "precision": 38, "scale": 8}
      },
      "maxRows": 250000,
      "maxResultBytes": 268435456,
      "timeoutSeconds": 300
    }
  },
  "requestTimeoutMs": 30000,
  "maxPartitionBytes": 33554432,
  "pollIntervalMs": 1000
}
~~~

The account origin uses the existing Snowflake HTTPS account domain. Saved
configuration retains the credential environment names. Match unquoted output
aliases using Snowflake's uppercase column names, or explicitly quote lowercase
aliases in SQL and declare those exact names.

Use Source & capture to save this configuration and enter typed arguments.
Exact decimal input is a JSON string:

~~~json
{"id":"THE-SELECTED-EXISTING-ID","minimum":"12.34000000"}
~~~

The compiler binds only declared parameter tokens, preserves literals/comments
and applies the exact column projection and configured row limit. SQL values
retain their original strings or JSON null through capture and native SQLite
materialization. Large integer strings, timestamps, empty strings and the
literal string "null" remain distinct.

When operating from the command line with the browser owner stopped, the
equivalent source and capture actions are:

~~~sh
snowflake_starforge snowflake source-save \
  --directory /private/snowflake-finance \
  --source /private/snowflake-source.json

snowflake_starforge snowflake capture \
  --directory /private/snowflake-finance \
  --query observations --input /private/snowflake-arguments.json \
  --request-id ORIGINAL_REQUEST_UUID

snowflake_starforge snowflake status \
  --directory /private/snowflake-finance \
  --request-id ORIGINAL_REQUEST_UUID
~~~

Create and retain one request UUID before its first dispatch. The original
journal records the native body before the SQL API request and keeps the actual
statement handle, response observations, cooldowns and partition coverage.
Completion requires all ordered partitions, native row count and declared
row/byte limits.

Resume or cancel that selected operation by its same UUID:

~~~sh
snowflake_starforge snowflake resume \
  --directory /private/snowflake-finance --request-id ORIGINAL_REQUEST_UUID

snowflake_starforge snowflake cancel \
  --directory /private/snowflake-finance --request-id ORIGINAL_REQUEST_UUID
~~~

A retry reuses the saved original request/body and statement handle. Provider
timing remains in the journal. Credentials or account settings can be corrected
in the existing host environment before continuing that request.

## 5. Receive complete original results

An original export contains receiving.json, edition.json and every named
partition. The receiving manifest selects the source/query, original request,
statement handle, immutable edition and exact file lengths and SHA-256 values.
Choose its complete folder in the browser to continue the original transfer.

A local export and independent native receiving use:

~~~sh
snowflake_starforge snowflake export \
  --directory /private/snowflake-finance --edition ORIGINAL_EDITION_SHA256 \
  --out /private/exports/finance-originals

snowflake_starforge snowflake receive \
  --directory /private/snowflake-receiver \
  --manifest /private/exports/finance-originals/receiving.json
~~~

The export destination is create-only. Importing the same complete original
result into a fresh workspace preserves its edition ID. Receiving reads those
files through the original engine and recovers missing local materialization
without issuing another warehouse query.

The source's declared limits remain effective: at most 64 MiB per original
partition, 20,000 partitions and 1 GiB of result bodies in a receiving selection,
with a 2 MiB receiving manifest. The merchant transfer sends fixed chunks up to
196,608 bytes and resumes each partition at its retained byte cursor.

## 6. Review, prepare and operate the merchant

Use Editions to inspect complete native rows, comparison totals and duplicate
key findings. Comparisons use the declared unique keys; an edition without keys
uses row multiset comparison. Record an explicit reviewer, ACCEPTED or REJECTED
decision and the reason for the exact edition.

Merchant preparation requires an accepted edition and the actual SQLite
merchant draft. Its source data is the retained records table. This complete
draft shape matches the example source above:

~~~json
{
  "merchant": {
    "name": "Reviewed finance observations",
    "origin": "https://YOUR_EXISTING_MERCHANT_ORIGIN",
    "network": "stellar:testnet",
    "asset": "YOUR_CONFIGURED_STELLAR_ASSET",
    "payTo": "YOUR_EXISTING_RECEIVING_ADDRESS",
    "maxTimeoutSeconds": 60
  },
  "queries": [
    {
      "name": "observation",
      "method": "GET",
      "path": "/observations",
      "sql": "SELECT \"ID\", \"OBSERVED_AT\", \"AMOUNT\" FROM records WHERE \"ID\" = $id",
      "columns": ["ID", "OBSERVED_AT", "AMOUNT"],
      "parameters": {"id": {"type": "string", "maxLength": 128}},
      "publicInput": {"id": "DELIBERATE_PUBLIC_EXAMPLE"},
      "maxRows": 1000,
      "maxBytes": 917504,
      "timeoutMs": 1000,
      "description": "Reviewed original finance observations",
      "amount": "YOUR_ATOMIC_PRICE"
    }
  ]
}
~~~

Set the deployed origin, selected network/asset, receiving address, atomic price
and deliberately public example input before preparation. Retain a publication
UUID for the exact edition and terms. The original compiler validates the
read query and produces its native merchant files; SF82 stages the native
SQLite snapshot and original release.

Command line equivalents, with the browser owner stopped:

~~~sh
snowflake_starforge snowflake review \
  --directory /private/snowflake-finance --edition ORIGINAL_EDITION_SHA256 \
  --decision ACCEPTED --actor "Actual reviewer" --note "Actual review decision"

snowflake_starforge snowflake prepare \
  --directory /private/snowflake-finance --edition ORIGINAL_EDITION_SHA256 \
  --draft /private/snowflake-merchant-draft.json \
  --publication-id ORIGINAL_PUBLICATION_UUID

snowflake_starforge snowflake publication \
  --directory /private/snowflake-finance \
  --publication-id ORIGINAL_PUBLICATION_UUID

snowflake_starforge snowflake resume-publication \
  --directory /private/snowflake-finance \
  --publication-id ORIGINAL_PUBLICATION_UUID
~~~

The saved publication restores its edition, merchant terms, runtime and native
release. Resume continues that request. To prepare changed terms, select a new
publication identity while preserving the previous release.

Open the original release console from the workspace's Merchant release page
or through the selected foreground command:

~~~sh
snowflake_starforge snowflake console \
  --directory /private/snowflake-finance
~~~

The original SF82 console owns release selection, activation, seller startup,
rollback, the configured facilitator, receiving and customer exports. Its store
is /private/snowflake-finance/release-store. Status and the shared release
console also operate that same path:

~~~sh
snowflake_starforge releases status \
  --store /private/snowflake-finance/release-store

snowflake_starforge releases console \
  --store /private/snowflake-finance/release-store
~~~

Keep the selected source, snapshot, request and merchant terms with the release.
The native snapshot contains the exact original partition BLOBs and source
metadata as well as the derived rows used for customer reads.

## 7. Connect the same product to merchant agents

Create a private connection JSON selecting the original canonical workspace
directory and its actual UUID:

~~~json
{
  "schema": "stellar-forge.snowflake-merchant-connection.v1",
  "workspaces": {
    "finance": {
      "label": "Finance retained queries",
      "directory": "/private/snowflake-finance",
      "workspaceId": "THE-EXISTING-NATIVE-WORKSPACE-UUID"
    }
  }
}
~~~

Each alias selects one existing workspace. A connection supports up to 32
workspaces. The host reader checks their original SQLite identities before
configuration. Select the primary workspace whose existing release-store the
shared merchant controls:

~~~sh
chmod 600 /private/snowflake-connection.json

snowflake_starforge merchant-snowflake init \
  --directory /private/snowflake-merchant \
  --connection /private/snowflake-connection.json --workspace finance

snowflake_starforge merchant serve \
  --config /private/snowflake-merchant/merchant-mcp.json
~~~

Provide the existing MCP_ACCESS_TOKEN in that service environment, along with
the Snowflake credential variables selected by the saved source. Use the actual
host endpoint printed by the merchant service. Inspect the exact action schemas
with merchant-snowflake tools.

The provider opens the original native browser lazily. merchant_snowflake_open
returns its workspace UUID, instanceId, private URL and saved state. Repeated
opens share that original writer. An explicit close selects the returned
instanceId, drains accepted calls and releases the owned server. The next open
keeps the workspace UUID and creates a new process instance.

| Work | Original action family |
| --- | --- |
| Workspace/source | workspaces, open, state, sources, source, save_source, close |
| Capture/recovery | capture, resume, cancel, operations, operation, observations |
| Edition/review | editions, edition, rows, compare, review |
| Original upload | receive_begin, receive_status, receive_chunk, receive_repair, receive_commit |
| Publication | prepare, publications, publication, resume_publication, release_console |
| Full delivery | export, exports, manifest, file, file_release |

Names have the merchant_snowflake_ prefix. The installed typed export is
./merchant/snowflake; its adjacent client.d.mts describes each action and
the retained histories, selections and file results.

~~~js
import { openSnowflakeClient } from
  '@tokenjunkielabs/starforge-merchant/merchant/snowflake';

const client = await openSnowflakeClient({
  url: process.env.SNOWFLAKE_MCP_URL
});
const opened = await client.open({ workspace: 'finance' });
const current = await client.state({ workspace: 'finance' });

for await (const page of client.pages('editions', {
  workspace: 'finance', limit: 100
})) {
  for (const edition of page.items) {
    console.log(edition.id, edition.rowCount);
  }
}
~~~

Named actions use camel case, including saveSource, receiveBegin and
resumePublication. Save a source with its current expectedRevision. Capture
requires a caller-retained requestId. The pages iterator follows every
nextOffset until null and rejects a nonadvancing cursor. awaitOperation selects
{workspace, operationId} and observes the same native operation; its timeout
affects observation. Actual provider timing remains in the source journal.

Snowflake selects a 16 MiB MCP response limit for its original metadata
envelopes. Large delivery bytes travel through the retained file operations and
their fixed-size chunks. See the [complete merchant guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/snowflake/merchant/README.md)
for all action contracts and client methods.

## 8. Upload, deliver and reopen every selected customer file

Upload the original receiving manifest and all its named partition files:

~~~sh
snowflake_starforge merchant-snowflake upload \
  --url ORIGINAL_MCP_ENDPOINT --workspace finance \
  --manifest /private/original-export/receiving.json \
  --workspace-id ORIGINAL_WORKSPACE_UUID
~~~

The client checks every input length/hash and resumes the server's committed
receivedBytes cursor. Repeat the same command after an interruption. Exact
replayed bytes are accepted; a damaged incomplete partition can be repaired
under the same receiving ID. Complete partitions stay attached to that
original selection.

To export the accepted edition and prepared merchant together, call the
original typed action with a retained export ID:

~~~js
const selected = await client.export({
  workspace: 'finance',
  editionId: process.env.SNOWFLAKE_EDITION_ID,
  publicationId: process.env.SNOWFLAKE_PUBLICATION_ID,
  exportId: 'finance-original-delivery'
});
console.log(selected);
~~~

The export ID fixes the exact delivery selection. Repeating it reopens the same
immutable manifest after later review or host changes. Inspect, download and
reopen that complete delivery:

~~~sh
snowflake_starforge merchant-snowflake inspect \
  --url ORIGINAL_MCP_ENDPOINT --export-id finance-original-delivery

snowflake_starforge merchant-snowflake download \
  --url ORIGINAL_MCP_ENDPOINT --export-id finance-original-delivery \
  --directory /private/customer/finance-original-delivery \
  --manifest-sha256 ORIGINAL_INSPECTED_MANIFEST_SHA256

snowflake_starforge merchant-snowflake reopen \
  --export-id finance-original-delivery \
  --directory /private/customer/finance-original-delivery \
  --manifest-sha256 ORIGINAL_INSPECTED_MANIFEST_SHA256
~~~

Continue the original download directory after a connection or host restart.
The checkpoint binds the native workspace UUID and manifest, so a changed
loopback port can continue the same delivery. Offline reopen reads and verifies
every selected file and checks the receiving/edition identities.

| Customer file | Retained content |
| --- | --- |
| snowflake-export.json | Complete names, lengths, hashes and selected workspace/edition/publication |
| receiving.json, partition-*.json | Every original SQL API result body and native receiving selection |
| edition.json, review.json | Exact immutable edition and the review selected for this delivery |
| publication.json | Original merchant request, terms and release identity |
| merchant/** | Every original prepared merchant file, including nested members |
| native-snapshot.sqlite | Native SQLite snapshot with records and original partition BLOBs |
| cloud-delivery.json | Optional original selected cloud-delivery contract |
| README.md | Original receiving and reopening instructions |

The delivery manifest supports up to 40,032 members and 8 MiB of manifest
metadata. Individual selected files can reach 8 GiB and the complete delivery
32 GiB. Those delivery bounds are separate from the source query's original
partition/row budgets.

A customer can import the downloaded receiving.json into an independent
Snowflake workspace or use the selected prepared merchant and native snapshot
through the original SF82 release/receiving flow. The original governed buyer,
native signer and dataset buyer are included for operating the published offer
with the customer's selected payment environment.

## 9. Operate the complete receiving program

For a customer's real original export, prepare a private configuration:

~~~json
{
  "directory": "/private/snowflake-receiving-case",
  "manifestFile": "/private/original-export/receiving.json",
  "draftFile": "/private/original-merchant-draft.json",
  "publicationId": "THE-SELECTED-PUBLICATION-UUID",
  "exportId": "original-snowflake-delivery",
  "workspace": "warehouse"
}
~~~

~~~sh
snowflake_starforge merchant-snowflake-receive \
  --config /private/original-receiving-case.json
~~~

The original program initializes its native workspace, joins the common
Merchant MCP host and opens the authenticated original browser endpoint. It
retains an upload checkpoint, restarts the host and continues that transfer;
prepares/resumes the accepted publication; interrupts and resumes the complete
customer download across another host restart; reopens every file; compares
native snapshot rows and original partition BLOBs; receives the edition into a
second workspace; and activates/opens the original SF82 release console.

Retain the same configuration and case directory when continuing. Its journal
keeps the original inputs, publication UUID, workspace identity, stage results
and transfer state.

The selected archive also carries the complete original two-partition contract
case under operations/scf-snowflake-merchant-receiving-20261012/. Its 808-byte and
207-byte source bodies reproduce the retained edition
18bbd54c207434b5957ead9a86aecdfa9e75d58b93291c5ef9f0d86decb2ede2. This included
input exercises large integers, exact decimals, nanosecond timestamp text,
JSON null and the literal string "null" through the same native product.
Its existing case ID is C94-SNOWFLAKE-MERCHANT-MCP-20261012 and its publication
is 94c00000-0000-4000-8000-000000000002.

Use the actual sourceRoot reported by the installed runtime inspection:

~~~sh
node /actual/installed/source/operations/scf-snowflake-merchant-receiving-20261012/receive.mjs \
  --source-root /actual/installed/source \
  --directory /private/original-snowflake-merchant-case
~~~

Run that command with the installation's compatible Node and dependencies.
The caller verifies the complete bundled original inputs, creates its terms
through the installed Stellar SDK and records the actual selected product
source on each attempt. Its native receiving engine and current saved case own
continuation. See the [original input and receiving guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/operations/scf-snowflake-merchant-receiving-20261012/README.md).

The returned complete delivery includes result.json, its selected source record,
input-selection.json, merchant-case/merchant-receiving.json and every file under
merchant-case/complete-download/. Preserve the case on the accepting host so a
later attempt continues its retained state.

## 10. Continue daily operation and hand over the product

Use the existing saved identities for ongoing work:

| Change or interruption | Continue from |
| --- | --- |
| Browser/service restart | Original workspace UUID and its selected owner/application |
| Source configuration edit | Current source revision, reviewed declaration and existing credential environment |
| Warehouse query interruption | Original request UUID, body and actual statement handle |
| Partial original-file receiving | Same receiving ID and committed partition cursors |
| Changed source data | New complete edition with comparison to the selected predecessor |
| Publication interruption | Same publication UUID, edition, terms and native release |
| Customer download interruption | Same export ID, manifest and private receiving directory |
| Runtime/source upgrade | New installation directory retaining the previous operating runtime |

Use runtime-install upgrade or recover to prepare a new runtime from the
original source selection. Compare the installations and inspect the new
runtime before selecting it in Applications or the existing merchant service.
Reopen the same Snowflake workspace and existing release store after its
original owner has stopped.

A complete operational handover contains the selected source archive and
digest, runtime profile/lock, workspace identity and original journal, retained
source editions/reviews, native merchant/release selection and complete customer
export. Host environment values remain in the selected host's existing
credential configuration. The [source contract](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/snowflake/README.md),
[managed guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/snowflake/MANAGED.md) and
[merchant guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/snowflake/merchant/README.md) travel with
the same package.

MIT. The standalone distribution preserves the original Snowflake, SQLite,
merchant provider, Applications and SF82 implementation.
