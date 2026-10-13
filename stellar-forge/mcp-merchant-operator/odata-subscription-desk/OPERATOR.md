# OData subscription customer desk

The installed customer desk receives complete editions from an existing merchant subscription. It combines the original remote customer client with a local browser, saved edition reviews, native customer receiving, full output files and independent restoration. The merchant continues to own its publisher and source collection. This desk does not recapture that source, append publisher editions or run a purchase.

The native engines are the existing OData subscription implementation and the remote customer client introduced in PR985. A local browser request becomes a saved action before its first effect. Downloads retain the original client checkpoint; receiving and backup restoration retain the original native customer history.

## Install and open

Select the complete maintained **odata-subscriptions** distribution containing both **odata-subscription-customer** and **odata-subscription-desk**. Use its selected Node 24 or newer runtime. The source entry is:

~~~sh
node stellar-forge/mcp-merchant-operator/odata-subscription-desk/cli.mjs --help
~~~

The installed command is:

~~~sh
starforge odata-subscription-desk --help
~~~

Copy the supplied connection.example.json into a private host directory, change the sample URL to the merchant's actual complete MCP endpoint and choose the configured publisher alias. Keep that file private (0600). It declares one to 64 profiles:

~~~json
{
  "schema": "stellar-forge.odata-customer-desk-connection.v1",
  "title": "Orders customer subscriptions",
  "profiles": [
    {
      "id": "orders",
      "label": "Orders customer",
      "url": "https://merchant.example/mcp",
      "publisher": "orders",
      "tokenEnv": "MCP_ACCESS_TOKEN"
    }
  ]
}
~~~

The URL above is an example, not a live merchant. HTTPS is accepted; loopback HTTP is supported for the original local merchant. URLs cannot contain a username, password, query or fragment. The named token environment variable supplies the existing merchant credential at call time. Its value is never placed in a profile, browser request, downloaded customer, request journal or portable package.

Each profile owns one native customer below the selected desk directory. Choose a new private desk directory for a different merchant or publisher. A reopened desk rejects changed profile IDs, endpoints, publisher aliases or credential-variable names, preserving the meaning of its saved requests. Updating the value in the same host environment variable does not change that identity.

~~~sh
starforge odata-subscription-desk serve \
  --directory /absolute/private/orders-desk \
  --connection /absolute/private/orders-connection.json \
  --source-root /absolute/installed/package/source \
  --source-manifest /absolute/installed/package/manifest.json \
  --port 0
~~~

The command prints the actual loopback origin and local operator URL. Open that URL in the browser. Its local token moves from the fragment into memory and an HttpOnly, SameSite=Strict cookie so original downloads can stream directly. The token is not saved in IndexedDB or the action history. A new process normally generates a new local operator token. An existing host may supply --token-env NAME to retain its own configured local token. This is separate from the remote merchant token.

The complete source manifest is optional for ordinary receiving and native exports, and required for packaging the full source with an output. Use the installed distribution's actual complete source inventory and root. Packaging verifies every selected source file and the complete leaf set, including the code executing the desk. A short list of source witnesses is rejected.

The source manifest, executable and dependency graph remain selected by the original distribution and runtime installer. This command neither installs dependencies nor marks an unprepared runtime ready.

## Customer workspace

The browser has five views:

| View | Work |
| --- | --- |
| Customer | Inspect the current native edition, full row count, definition, endpoint and original receiving history. |
| Published editions | Page every original publisher edition, inspect its full source and scope, and save a receiving review. |
| Current rows | Read paginated rows from the complete current native customer. |
| Requests & reviews | Inspect exact requests, continue interrupted work, receive a reviewed edition and record a customer decision. |
| Backups & delivery | Create full native backups or Analysis sources, independently restore them and package original output plus complete source. |

All data tables are pages of the original complete result. Continue their returned next page to read later rows. A browser page is not a substitute for a full customer export.

### Receive a first baseline

1. Select the configured customer profile.
2. Open **Published editions** and inspect the intended edition's complete record. Review its original source, query, mapping, counts, note and manifest SHA.
3. Choose **Review receiving**, select **First full baseline**, and record the source and scope decision.
4. In **Requests & reviews**, open the saved review. Select **Receive this reviewed edition**, add the receiving note and save the request.
5. Inspect the original delivery, download and native receiving result. Return to **Customer** and **Current rows**.
6. Record the actual customer review as accepted or changes requested, with the completed receiving request selected.

The review retains the exact publisher, endpoint, definition, ending edition/SHA and original source record. The receiving action creates a stable artifact alias from the saved request ID, asks the original merchant to export that exact baseline, downloads every unchanged member and invokes the original native receiver. The complete artifact inventory and native manifest are checked before receiving.

### Continue the same customer

Choose a later published edition and select **Continue saved edition**. The saved review binds the actual current customer revision and edition SHA. The ending edition must be later and at most 100 editions ahead. Every intervening native edition is delivered and replayed by the original engine.

The desk checks the current customer against the saved review before selecting a new delivery. A customer changed by another original operator needs a new deliberate review. Once the original receiving step has begun, replay uses the same download, artifact SHA and destination; it does not select a new head.

An unchanged source may produce a valid new edition with zero change events. Keep its source and receipt. A row leaving a selected query is a membership change; it is not automatically a supplier deletion. The original source/query and scope-change note remain available for interpretation.

### Inspect an older edition independently

Select **Independent historical customer** for the original desired edition. The desk requests a full baseline into a separate native customer under historical/<original-request-hash>. It leaves the active profile's current customer intact.

The full receiving result records that independent customer's revision and SHA. The JavaScript and HTTP row APIs can read the selected historical receiving request. The original CLI can also inspect that native directory directly when the host needs further analysis.

## Exact requests and recovery

Before POST, the browser saves the original request ID, complete body, expected desk revision and profile in IndexedDB under the exact origin and desk identity. No mutating control becomes available until that original storage read succeeds. If storage fails, use **Retry original request read**. The failed read does not erase or replace the pending request.

The server uses the original subscription private-file writer and cross-process release lease. It saves each request and binding before the first effect. One pending action prevents a new action from replacing it. Each committed response retains its original revision and result; replay reports the current desk revision separately.

After a lost response:

- Refresh the saved desk state.
- Inspect the pending request and its original error.
- Save the original request JSON if it needs to be moved to the existing operator.
- Select **Resume this request** once the original active operation has ended.

A committed native receiving or export is reconciled under the same original request, artifact and native intent. Downloading resumes the original retained-file checkpoint. The desk never uses an unknown return as evidence that the merchant export or native receiving did not occur.

Browser refresh does not create a new request. The pending banner also recovers the server's original request if the browser moved to another origin or lost its local storage. A response can clear only the exact request that produced it.

Use the same original request from the command line:

~~~sh
starforge odata-subscription-desk action \
  --directory /absolute/private/orders-desk \
  --connection /absolute/private/orders-connection.json \
  --request /absolute/private/original-customer-request.json
~~~

Keep any source-root/source-manifest arguments if the selected action packages complete source. Do not edit the saved request or rename its native artifact to bypass a pending result.

SIGINT or SIGTERM closes the original server, stops new requests, asks an active remote download to pause at its original checkpoint and waits for accepted operations and native work to settle. Local native receiving remains governed by its original engine and lease. Reopening uses the same desk and customer histories; a different process does not manufacture a completed receipt.

## Native backups and Analysis

A backup and Analysis export both bind the current customer revision and edition SHA. The source engine enforces that selection under its customer lease.

**Back up current customer** retains the definition, baseline, all applied transfers, every intermediate snapshot and current state. **Export Analysis source** retains source.json, dataset.csv, customer.json and all content-addressed document/proof members.

The complete files appear with their byte counts and SHA256s. Download links stream original retained bytes and return Content-Length and X-Content-SHA256. Retain all declared members with their relative paths when using them as a native directory.

The analytical document preserves exact Decimal/Int64 lexical values as text. Every projected field has an explicit state column, so source null and an original empty string remain distinct. The original type and nullability declarations stay in the subscription definition.

After the Analysis source is registered by the existing Analysis document receiver, use **Registered-source mapping** with its actual registered alias and source revision. That source revision is independent of the subscription edition number. Mapping does not itself register a source, run a query or perform a purchase.

**Restore independently** invokes the original backup or Analysis receiver into a separate destination. It replays the original customer history and compares the reconstructed native rows. The active profile customer remains available. The completed restore retains its full native result and can receive a customer acceptance decision.

## Complete output and source package

After a native backup or Analysis export, choose **Package complete output + source**. This creates customer-output.ndjson, a bounded streaming container with:

- The complete original native output, with unchanged relative names and exact SHA256s.
- Every selected installed source file, preserving its original repository path.
- The literal original complete source manifest.
- A complete member inventory and final completion frame.

This container does not replace the native customer format. Receiving verifies the complete package, writes every unchanged original member, then calls the original native receiver on its backup.json or source.json. Included implementation source is provenance; the receiving command executes the receiving host's selected installed implementation.

The package includes full customer data and original source. Deliver it through the customer’s intended private file route. It does not include the host connection file, environment credential values, node_modules or a fabricated runtime-ready receipt. The source distribution's original runtime installation remains the dependency route.

Download the saved complete package from **Backups & delivery**. Its retained result provides the full package SHA. Inspect and independently receive it on the selected host:

~~~sh
starforge odata-subscription-desk inspect-package \
  --file /absolute/private/customer-output.ndjson

starforge odata-subscription-desk receive-package \
  --file /absolute/private/customer-output.ndjson \
  --sha256 ACTUAL_COMPLETE_PACKAGE_SHA256 \
  --directory /absolute/private/received-package \
  --customer /absolute/private/independent-customer
~~~

Use two separate private receiving directories. Repeat those exact arguments after interruption. Package receiving preserves its intent and exclusively publishes original member bytes; it never overwrites a different selected package or destination. A completed replay verifies retained members and returns its original receipt.

The package permits at most 20,000 files, one GiB of original file content and 256 MiB per member. Frames contain at most 65,536 binary bytes. The native subscription and Analysis limits still apply; packaging cannot make an oversized native export valid.

## Original integration and authority

The module calls these original APIs from ../odata-subscription-client.mjs:

- Publisher inspection, edition pages and selected row/change pages.
- Exact delivery selection and complete retained-artifact download.
- Download inspection and original native receiving.
- Customer inspection/rows, backup, Analysis export and mapping.
- Independent customer backup or analytical restore.

The original files.mjs provides private directories, exact bytes, atomic state, immutable publication and the original SF82 release lease. No new scheduler, payment authority, publisher or substitution for the native change engine is introduced.

This desk is an additive customer workflow alongside the existing local publisher/customer browser and the managed Applications lifecycle. The original **ODATA-SUBSCRIPTION-MANAGED-F971-20261012-R1** still owns its complete managed Review/Start/download/restore/Stop/reopen operation. Source publication here is not evidence that that original native programme has executed.


## Inventory the actual installed source

Run the installed source inventory command against the source tree that executes the desk.
The output must be outside that tree:

```sh
starforge odata-subscription-desk source-manifest --output /private/customer-operation/source-files.json
starforge odata-subscription-desk verify-source --source-manifest /private/customer-operation/source-files.json
```

This records every ordinary source file with a relative path, byte count and SHA-256.
It excludes only Git internals, installed node_modules and Python bytecode caches.
The source verifier reopens the complete actual leaf set before packaging. Do not
pass an unrelated package manifest whose paths describe an outer `source/` prefix.
A supplied `--source-root` must be the actual executing source directory.

## Continue the original OData receiving programme

The additive `receiving/receive.mjs` exports `receiveCustomerDesk(options)`.
Call it from the existing managed OData owner after its original merchant and publisher
are ready, in that owner's original admitted process lifetime. This module neither
starts another managed merchant nor allocates another native job.

```js
const result = await receiveCustomerDesk({
  directory: originalOperationDirectory + '/customer-desk',
  connection: privateDeskConnectionFile,
  sourceRoot: actualInstalledSourceRoot,
  sourceManifest: completeSourceManifestFile,
  profile: originalPublisherProfileId,
  editions: [
    { revision: baselineRevision, manifestSha256: originalBaselineSha, rows: actualBaselineRows },
    { revision: nextRevision, manifestSha256: originalNextSha, rows: actualNextRows, changes: actualNextChangeCount }
  ],
  playwright: originalInstalledPlaywright,
  chromium: originalSelectedChromiumExecutable,
  onProgress
});
```

The two editions must already exist in the original publisher. The original 830-row
reference selects its reviewed edition 2 and unchanged edition 3, using their actual
manifest hashes; the unchanged edition is expected to have zero keyed changes.
Use the supplied original catalogue rather than manufacturing a replacement publisher.

The programme drives real browser controls through baseline review and receiving,
a full native backup and independent restore, recurring review and receiving,
customer acceptance, complete Analysis export and independent native restore,
and an older edition received in a separate historical customer. It reads all current
customer rows, observes the actual keyed-change count, packages the entire native
Analysis output with every executing source file, downloads the original CSV and
complete package through the UI, and independently receives/reopens that package.
It retains ten full-page desktop/mobile screenshots and all original operation
responses. Finally it closes the browser and desk, reopens the same desk at its
original origin, and replays the original baseline request while preserving the newer
customer state.

The same programme directory retains original HTTP request bodies before dispatch,
immutable download identities, screenshot bytes and matching dimensions, and its
actual first origin. Reuse that directory after interruption. The receiver holds its
original lease until browser and server closure succeeds; an unresolved close cannot
be reported as a completed run. A final candidate is written only after owners close,
and every selected output is reopened before the final result is published.
Private tokens and source-host filesystem paths are excluded from the public result.
Native execution remains unobserved until the original owner records an actual result.

### Correcting a rejected selection

Output titles use the native 160-character limit. The desk checks the action fields, source alias, revision bounds, existing customer and referenced completed request before selecting a new effect. If the server explicitly rejects that exact request ID before selection, the browser saves its authored body and rejection in local request history and releases only that active form slot for correction. A selected or uncertain request keeps its original identity and remains pending. Merchant credential changes, partial native receiving and uncertain network outcomes never take this pre-selection correction path.
