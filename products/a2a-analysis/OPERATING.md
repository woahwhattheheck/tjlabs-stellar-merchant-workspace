# Operate the complete A2A analytical product

## 1. Build and install the selected source

Start from a maintained checkout and select an immutable commit that contains the product. The builder reads committed source, resolves the complete relative module closure and retains the source-owned product declaration.

~~~sh
node /absolute/merchant-checkout/stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout --ref ORIGINAL_COMMIT \
  --selection a2a-analysis --out /private/a2a-release
~~~

Use the returned archive path and complete SHA-256. Run the source product command before an installed command is available:

~~~sh
node /absolute/merchant-checkout/products/a2a-analysis/cli.mjs runtime prepare \
  --dir /private/a2a-runtime \
  --archive /private/a2a-release/RETURNED_ARCHIVE.tgz \
  --sha256 RETURNED_ARCHIVE_SHA256 \
  --feature a2a --feature a2a-analysis --operator

node /absolute/merchant-checkout/products/a2a-analysis/cli.mjs runtime install \
  --dir /private/a2a-runtime

node /absolute/merchant-checkout/products/a2a-analysis/cli.mjs runtime inspect \
  --dir /private/a2a-runtime --load --source
~~~

The private parent directory must exist at its real absolute path. The original installer creates its child and retains the source, profile, dependency lock, installation log and state. Its SQLite preparation uses the declared original better-sqlite3 hook and verifies an actual transaction. Successful inspection returns READY with the original source and dependency identities.

The selected dependency groups are:

| Feature | Dependencies |
| --- | --- |
| `a2a` | A2A SDK 1.3.0 and jose 6.2.12 |
| `a2a-analysis` | A2A SDK 1.3.0, Express 5.1.0, Kysely 0.29.5 and better-sqlite3 13.0.3 |

The original profile selects the shared SDK once and probes both components from their source locations. `--operator` records the Linux, Python and flock host requirements. Native payment operation can additionally select the original `--native` peers when preparing its runtime.

For every later command, select the installed source through the original runtime:

~~~sh
node /absolute/merchant-checkout/products/a2a-analysis/cli.mjs runtime run \
  --dir /private/a2a-runtime -- a2a-product COMPONENT ORIGINAL_ARGUMENTS
~~~

The shorter examples below use an available `starforge` dispatcher. Replace that prefix with the full source command above when needed.

## 2. Open the analytical workspace and prepare source

Create the original private analytical workspace under a separate data directory:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product workspace --database /private/customer-analysis serve --port 0
~~~

This launches the original Python Analysis Workspace with the installed source root and Node executable. It prints the local address and the path of its private launch record. Open the original private browser URL from that record. Keep this process running while the analytical A2A service operates; the native adapter reads this same launch record when the original application restarts.

In the analytical browser, complete the customer source workflow:

1. Register the original acquisition, source document or received dataset package.
2. Inspect its complete source and projection, then import the selected edition.
3. Select the desired named view and retain its original version.
4. Save the queries the customer may run. Review their SQL, parameter text and query revision.
5. Save any report definition with its selected query revisions and presentation content.

The [original workspace guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/WORKSPACE.md) covers those operations. [Source documents](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/SOURCE_DOCUMENTS.md) and [complete query exports](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/SQL_EXPORTS.md) describe the source and file contracts.

The analytical service executes the procedures captured in the next step. Select source views and query/report revisions deliberately; each running task retains that choice.

## 3. Capture the customer procedures

The following example assumes saved query `monthly_observations` revision 2 and saved report `operations` revision 1 already exist in the original workspace:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product agent capture \
  --directory /private/a2a-service \
  --database /private/customer-analysis \
  --query monthly_observations@2 \
  --report operations@1 \
  --public-url http://127.0.0.1:41242/a2a \
  --host 127.0.0.1 --port 41242 \
  --name 'Customer operations analysis' \
  --out /private/a2a-service/config.json
~~~

Capture writes the actual workspace ID, complete view selection, saved SQL and unchanged parameter text, report definition, permitted output formats and procedure IDs. The output configuration is a new private file.

Use a fixed agent origin for a retained service. For a public deployment, capture the existing HTTPS origin, for example `https://analysis.example.com/a2a`, while keeping the local listener behind the existing proxy.

Add `--allow-parameters` only for selected queries whose caller may supply parameters. The A2A request carries parameters as unchanged JSON text, so exact 64-bit integers reach the original Python engine. The original query binding still determines the permitted SQL.

Initialize the official SDK task schema and check the original selection:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product agent init --config /private/a2a-service/config.json

starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product agent check --config /private/a2a-service/config.json
~~~

## 4. Start and deploy the analytical service

Supply `A2A_ANALYSIS_TOKEN` from the host's private environment configuration. A token contains 32–1,024 characters without whitespace. The configuration can select another environment variable and multiple stable principal names with different permitted procedure IDs.

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product agent serve --config /private/a2a-service/config.json
~~~

The service exposes:

| Route | Operation |
| --- | --- |
| `/.well-known/agent-card.json` | Public generic Agent Card |
| `/a2a` | Authenticated A2A JSONRPC |
| `/healthz` | Process liveness |
| `/readyz` | Authenticated original workspace identity check |

For persistent Linux deployment, adapt the original [systemd service](../../stellar-forge/a2a-analysis-agent/deploy/a2a-analysis.service) and [Nginx configuration](../../stellar-forge/a2a-analysis-agent/deploy/nginx.conf). Select the installed source entry, current operator account, private configuration/environment file, existing HTTPS hostname and TLS certificate paths. The selected archive includes both files.

Keep the Python workspace and analytical agent under their original process owners. The product's Python launcher forwards service-manager shutdown into the original CLI's KeyboardInterrupt/finally path and waits for that child to finish. The A2A service retains its task state while closing its listener, original jobs, database and writer lease.

## 5. Connect the merchant Agent workspace

Save a private connection file for the same agent. For the local example:

~~~json
{
  "schema": "stellar-forge.a2a-connections.v1",
  "connections": [{
    "id": "customer-analysis",
    "label": "Customer operations analysis",
    "cardUrl": "http://127.0.0.1:41242/.well-known/agent-card.json",
    "allowedOrigins": ["http://127.0.0.1:41242"],
    "trustedOrigins": ["http://127.0.0.1:41242"],
    "artifactOrigins": [],
    "credential": {"scheme": "Bearer", "env": "A2A_ANALYSIS_TOKEN"},
    "timeoutMs": 30000,
    "streamMs": 120000
  }]
}
~~~

For HTTPS, use the exact public origin and its reviewed artifact origins. The original analytical agent returns complete inline files. Its public card request and a separately configured attachment request retain their original authentication rules.

Open the merchant browser with that connection:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product merchant workspace \
  --workspace /private/agent-merchant \
  --connections /private/a2a-connections.json \
  --port 0
~~~

The original Applications provider also saves and launches this same workspace from a READY runtime. It binds the selected workspace identity and connection file, waits for the original ready record and opens the authenticated local application.

Create a project, capture the real Agent Card, review its selected interface and prepare a catalogue message:

~~~json
{
  "messageId": "CUSTOMER_SELECTED_CATALOGUE_MESSAGE_ID",
  "role": "ROLE_USER",
  "parts": [{"data": {"action": "catalog"}, "mediaType": "application/json"}]
}
~~~

Review and send that saved message. The returned catalogue lists the actual procedure IDs permitted to this principal. Prepare a new native message using one returned ID:

~~~json
{
  "messageId": "CUSTOMER_SELECTED_QUERY_MESSAGE_ID",
  "role": "ROLE_USER",
  "parts": [{
    "data": {"action": "run", "procedureId": "query_monthly_observations"},
    "mediaType": "application/json"
  }]
}
~~~

The message/request identities are retained before sending. Use the Tasks pane to read or subscribe to the original task. An interrupted local response can be reconciled through its saved request and original task history. The browser retains drafts and pending request bytes across reopening.

## 6. Review, publish and deliver the complete result

Use the Results pane to retain the complete native Task and every output Part. Review the original filenames, media types, byte counts and source task. The original receiver checks the exact output population, including inline bytes and the complete request/response binding of configured artifact URLs.

Freeze a named result edition after review. In Merchant and handoff, prepare the existing seller's service terms against that frozen result and inspect the resulting publication. The original SF30 seller owns its challenge, verification and settlement. The original SF82 engine owns release staging, activation, request draining and rollback.

The same operations are available through the original CLI:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product merchant publication \
  --workspace /private/agent-merchant \
  --id ORIGINAL_PROJECT_ID --publication ORIGINAL_PUBLICATION_ID \
  --out /private/customer-publication

starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product merchant release-stage \
  --workspace /private/agent-merchant \
  --id ORIGINAL_PROJECT_ID --publication ORIGINAL_PUBLICATION_ID \
  --releases /private/a2a-releases --release CUSTOMER_RELEASE_ID
~~~

Use `release-status` to read the current generation, then pass that actual generation to the original `release-activate`, `release-run` or `release-rollback` command. The [merchant operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/OPERATOR.md) supplies the complete terms and release commands.

Deliver the frozen result and, when the customer needs continuing operation, the complete editable workspace. [RECEIVING.md](RECEIVING.md) gives the exact commands and reopening behavior.

## 7. Reopen, resume and upgrade

Restart the analytical agent against its retained configuration and SDK task directory. The same principal name owns its original tasks after a token rotation. A task's resume uses its existing task/context IDs and original native jobs. A changed source view or saved procedure is surfaced by the original selection check; capture a deliberate new selection for later work.

Resume an interrupted dependency installation in its existing directory:

~~~sh
starforge runtime-install resume --dir /private/a2a-runtime
starforge runtime-install inspect --dir /private/a2a-runtime --load --source
~~~

Build the later source commit into a separate release directory, then use the original runtime upgrade:

~~~sh
starforge runtime-install upgrade \
  --from /private/a2a-runtime --dir /private/a2a-runtime-next \
  --archive /private/a2a-release-next/RETURNED_ARCHIVE.tgz \
  --sha256 RETURNED_ARCHIVE_SHA256 \
  --feature a2a --feature a2a-analysis --operator

starforge runtime-install compare \
  --before /private/a2a-runtime --after /private/a2a-runtime-next
~~~

Review and launch the new runtime against the intended retained customer work. The original previous runtime remains available for the established release rollback workflow. The [runtime guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) also covers cache-based installation, matching native headers, retained dependency adoption and recovery.
