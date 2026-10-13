# CanadaBuys customer: original MCP operations and complete receiving

This entry connects a customer or Claude tool workflow to the existing CanadaBuys procurement and bidder workspace. It reads the retained federal source, saves the operator's company profile, evidence, requirement assessments and bid decision, and brings complete published reports or packages back to a local workspace.

The original CanadaBuys application owns the data model, source revisions, decisions and publication files. The customer uses its existing 37 MCP tools. It does not define another source collector, bidder model, payment method or remote upload endpoint.

## Installed entry and source

The existing merchant distribution registers:

- Command: **canadabuys-customer**
- Typed client: **./merchant/canadabuys/client**
- Complete file receiving: **./merchant/canadabuys/download**
- Retained operation requests: **./merchant/canadabuys/operations**

From an original source checkout, use:

    node stellar-forge/mcp-merchant-operator/canadabuys-cli.mjs --help

For a source-owned customer release, the maintained builder has the `canadabuys-customer` selection. From the repository root, build the selected immutable commit:

    node stellar/scf-starforge-20261009/distribution/build.mjs \
      --repo . --ref YOUR_COMMIT --selection canadabuys-customer \
      --out canadabuys-customer-release

Use the archive path and SHA-256 returned by that build with the original runtime installer:

    node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
      --dir canadabuys-customer-runtime --archive ORIGINAL_ARCHIVE.tgz \
      --sha256 ORIGINAL_ARCHIVE_SHA256 --operator
    node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
      --dir canadabuys-customer-runtime --offline
    node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
      --dir canadabuys-customer-runtime --load --source

This workflow selects no external runtime feature: the native workspace uses Node's SQLite support, and the retained writer uses Linux flock. The original installer still records and verifies its dependency lock. Its `--offline` option uses the selected local npm installation and cache. The source archive declares `starforge`, `canadabuys` and `canadabuys-customer` binaries; a normal npm installation exposes those names. With the maintained private runtime layout, dispatch the same installed customer through:

    node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
      --dir canadabuys-customer-runtime -- canadabuys-customer --help

The commands below use `canadabuys-customer` as that installed entry. The same runtime dispatch accepts `canadabuys serve --workspace DIRECTORY --operator customer` when opening a received native workspace.

The customer's HTTP transport uses the maintained merchant MCP initialization and tool-call implementation. The original authenticated endpoint must already exist. Its operator selects workspace, input and delivery aliases in the existing merchant configuration. This client does not create that configuration or interpret an arbitrary remote path as an input.

Use Node 24 or later for the whole workflow, including the original SQLite workspace receiving. Local operation and download directories use the repository's existing Linux flock lease, supplied by util-linux. The client itself has no new third-party dependency.

Source contracts:

- Original provider: [canadabuys-workspace.mjs](./canadabuys-workspace.mjs).
- Original 37-tool catalogue: [catalog/canadabuys-workspace.mjs](./catalog/canadabuys-workspace.mjs).
- Original native workspace and package validation: [workspace.mjs](../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/workspace.mjs).
- Original bidder persistence and command deduplication: [bidder-desk-workspace.mjs](../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/bidder-desk-workspace.mjs).
- Original bidder operator guide: [BIDDER_DESK.md](../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/BIDDER_DESK.md).
- Existing complete file writer: [retained-download.mjs](./retained-download.mjs).
- Existing MCP host/Claude registration: [STDIO.md](./STDIO.md) and [client-config.mjs](./client-config.mjs).

The full customer receiving programme accompanies this entry. Its result must be read as actual execution evidence; this guide does not substitute authored source for a run.

## Connect the original customer

Create a private working directory and connection template:

    umask 077
    mkdir canadabuys-customer-work
    canadabuys-customer connection-template --out canadabuys-customer-work/connection.json

Edit the template to select the actual endpoint, existing host alias and credential environment variable:

    {
      "schema": "stellar-forge.canadabuys-customer-connection.v1",
      "url": "https://your-existing-merchant.example/mcp",
      "tokenEnv": "MCP_ACCESS_TOKEN",
      "workspace": "procurement",
      "workspaceId": null,
      "maximumResponseBytes": 4194304
    }

This URL and alias are illustrative; use the values supplied by the original merchant operator. Populate the selected environment variable through the existing credential mechanism. The connection file contains the environment variable name, never its token value.

Bind that alias to the observed native workspace:

    canadabuys-customer bind \
      --connection canadabuys-customer-work/connection.json \
      --out canadabuys-customer-work/bound-connection.json

The returned observation contains the native workspace UUID, revision and original operator browser URL. The saved bound connection retains the observed UUID. Later operations compare that UUID before dispatch; an alias reconfigured to a different workspace is rejected. bind opens the existing original workspace service. Disconnecting the customer leaves that application available.

Keep JSON files private (0600) and directories private (0700). The reader rejects symlinks, replacement during a read and oversized inputs. --out creates the complete result exclusively. Choose a different output filename for a later observation; original result files are not overwritten.

## Read the complete original source

List the exact available input schemas without opening a workspace:

    canadabuys-customer tools --out canadabuys-customer-work/tools.json

Read the current workspace and complete notice collection:

    canadabuys-customer read \
      --connection canadabuys-customer-work/bound-connection.json \
      --tool status --all \
      --out canadabuys-customer-work/notices.json

For a different collection, save a request such as:

    {"collection":"sources","limit":100}

Then pass that private JSON through --args. The CLI accepts the short tool name or the original merchant_canadabuys_ name. read permits only original read-only tools. --all follows every actual page.nextOffset and accepts the completed collection only if the native workspace UUID and revision remain unchanged across the read. If the workspace advances, retain those observations and make a new complete read.

Read one notice with noticeId. It includes original editions, current retained row, review, award and arrangement candidates and workshares. Read the exact original source edition with entryId. The full before/after comparison uses beforeId, afterId and includeValues:true; comparisons can also be paged completely.

Original source/body results may exceed the selected MCP response bound. For a large original CSV or package, retain a publication through the original export tool and use the bounded chunk download below. The client never replaces an entire source with a sample.

## Review and save one original request

Read-only observations can be called directly. Changes are prepared as an immutable local request before they are entered.

For example, a company profile request uses the existing bidder_create tool:

    {
      "kind": "profile",
      "expectedRevision": 12,
      "commandId": "company-profile-review-20261013",
      "record": {
        "label": "Reviewed supplier profile",
        "legalName": "Replace with the actual legal entity",
        "description": "Replace with the reviewed capabilities",
        "keywords": [],
        "commodityCodes": [],
        "qualificationClaims": [],
        "evidenceIds": [],
        "notes": "Record the source and reviewer for the declarations."
      }
    }

The revision and business facts above are examples, not current workspace data. Use the actual global revision returned by status and the operator's declarations. Save this JSON, then prepare:

    canadabuys-customer plan \
      --connection canadabuys-customer-work/bound-connection.json \
      --directory canadabuys-customer-work/profile-operation \
      --operation-id company-profile-review-20261013 \
      --tool bidder_create \
      --args canadabuys-customer-work/profile-request.json \
      --out canadabuys-customer-work/profile-plan.json

plan is offline. It records the original endpoint identity, alias, native UUID, exact tool and arguments, source-backed replay policy and SHA256 of the complete request bytes. Inspect request.json or the plan output, then enter that request:

    canadabuys-customer run \
      --directory canadabuys-customer-work/profile-operation \
      --out canadabuys-customer-work/profile-response.json

run does not invent a newer revision or change fields after a conflict. A changed request needs its own reviewed operation directory. The original bidder commandId provides transactional deduplication for the same create/update input; reusing that ID with different input is a conflict.

For bidder updates, expectedRevision is the selected record's current revision, not the global workspace revision. The wrapper retains the exact original arguments. A repeated native command may return the original saved record with the current workspace metadata and alreadyApplied:true; that is the maintained API's response and is preserved.

## Complete bidder work

The client exposes the whole existing workflow:

| Stage | Original tools | Retained result |
|---|---|---|
| Company capabilities | bidder_status, bidder_list, bidder_record, bidder_create, bidder_update | Original profiles and every saved edition |
| Original evidence | inputs, bidder_create, bidder_update, export with format evidence | Complete configured input bytes, SHA256 and explicit review state |
| Requirement review | bidder_create or bidder_update with kind requirement | Exact source/supplier evidence editions, page/section, assessment and reviewer |
| Fit and current context | bidder_fit, bidder_assess | Original field observations, gaps, unknowns and contextSha256 |
| Reviewed decision | bidder_create or bidder_update with kind decision | Operator choice and rationale bound to exact context |
| Changed context | bidder_compare | Original and current editions with material change evidence |
| Partner work | workshare_create, workshare_update, workshare | Scope, integer-cent costs, milestones and original history |
| Reports and portable copy | export, files, file_read, file_release | Exact complete publication bytes and native workspace package |

A configured evidence input is selected by its host alias and the SHA256 observed through inputs. The provider reads the original file and checks that hash before the native evidence transaction. The customer cannot substitute a local client path for an input alias.

For evidence intake, include kind:evidence, input, expectedSha256 and the original record metadata. The source body, byte count and SHA256 are retained by the provider. Evidence access/review status remains explicit; an unavailable or unreviewed document is not marked reviewed by the client.

For a decision, first read bidder_assess with the exact noticeId, sourceEntryId, profileId and profileRevision. Retain its returned contextSha256. The decision request includes that SHA, the same original selection, the operator's choice and rationale. The native transaction checks the current context again. A new source or evidence edition requires the operator to examine the change; the client does not silently replace the selected context.

Fit output supports review. The existing model distinguishes matches, gaps, unknowns, source timing and mandatory review. It does not make a human bid decision or convert an unknown qualification into eligibility. See the original bidder guide for complete profile, evidence, requirement and decision fields; the customer TypeScript declarations reuse those native types directly.

## Request interruption and recovery

Each local operation retains:

    request.json
    state.json
    attempts/000001/entered.json
    attempts/000001/result.json or error.json
    complete.json
    reconciliations/<evidence-sha256>.json when explicitly adopted

The original Linux lease prevents two writers from entering the same operation directory concurrently. Process exit releases that kernel-owned lease. Saved request and attempt/result files remain immutable.

run publishes entered.json before the original call. It saves the complete result before publishing complete.json. If the response was saved and the parent stopped before completion publication, the same run command recovers that original response without another remote call. Once complete.json exists, run reopens it offline and does not look up credentials.

show is a lock-free saved-progress read. It never opens the provider or retrieves credentials. It may observe the last saved state while another writer is active:

    canadabuys-customer show --directory canadabuys-customer-work/profile-operation

An entered request with no saved response is handled by its actual original contract:

| Request | Reopen behavior |
|---|---|
| Original read-only tool | Repeat the same read; retain its new observation |
| Original open | Reopen the same saved workspace alias and UUID |
| Bidder create/update with commandId | Re-enter the exact original input; native command history resolves a committed result |
| Capture with retained captureId | Continue that original capture and its retained source state |
| Another entered mutation | Preserve RECONCILIATION_REQUIRED; do not repeat it automatically |
| Explicit provider error applied:false | Preserve the error; the same original request may be tried again |

A timeout or transport failure is not proof that a mutation failed. The customer retains that uncertainty. It has no generic force or retry-with-new-ID option.

### Recover an original exported file

The native export creates a new immutable publication. It does not accept an idempotency key. If its reply was lost, read the current publications collection and inspect the actual candidate with files before selecting it.

Create an evidence template for that same original export:

    canadabuys-customer publication-selection \
      --directory canadabuys-customer-work/package-operation \
      --out canadabuys-customer-work/package-selection.json

Fill only the observed publicationId and operator note. Preserve operationId and requestSha256, then:

    canadabuys-customer adopt-publication \
      --directory canadabuys-customer-work/package-operation \
      --evidence canadabuys-customer-work/package-selection.json

Adoption reads files for that exact UUID and verifies the original native workspace, format, sourceRevision, selected arguments and file bytes/hash. It records ADOPTED_ORIGINAL_PUBLICATION, the complete evidence note and observed response. It does not call export.

A matching publication is compatible with the entered export; matching fields alone cannot prove uniqueness if another operator made an identical concurrent export. Selecting the original observed UUID is an explicit operator reconciliation. A contradictory publication is rejected.

## Download every original file

A successful export response returns its original publicationId. Inspect the complete publication:

    canadabuys-customer inspect-publication \
      --connection canadabuys-customer-work/bound-connection.json \
      --publication-id ORIGINAL_PUBLICATION_UUID \
      --out canadabuys-customer-work/publication-inspection.json

Then retain every original file:

    canadabuys-customer download \
      --connection canadabuys-customer-work/bound-connection.json \
      --publication-id ORIGINAL_PUBLICATION_UUID \
      --directory canadabuys-customer-work/package-download \
      --manifest-sha256 ORIGINAL_INSPECTED_MANIFEST_SHA256 \
      --out canadabuys-customer-work/package-download-receipt.json

Use the UUID and SHA returned by the actual inspection. The customer-generated canadabuys-publication.json contains the original workspace UUID, full original files response and an exact descriptor for every selected file. That manifest is an explicit client receiving envelope; it is not represented as a server-generated archive.

The transfer uses only the existing files, file_read and file_release tools. The local adapter maps those real operations into the repository's existing retained-file writer. Its internal dispatch labels are not additional MCP endpoints.

The writer preserves:

- Full original relative file names, including native merchant payload directories.
- Original MIME types, byte counts and SHA256.
- The provider's original readId and exact nextOffset.
- Complete native-file bytes, bounded Base64 chunks and final full-file hashing.
- Durable verified partial prefixes and atomic completed file publication.
- Exact original manifest and download checkpoint when resumed.

The native reader reports the basename in its file descriptor. The client checks that original basename before mapping the descriptor to the full relative path already supplied by files. The complete path and original descriptor remain in the client manifest.

If a saved read lease has expired, the existing writer reopens the same original file at the retained offset and verifies the full identity; it does not create another publication. Disconnect closes this client's retained readers. The provider's file_release now returns its structured acknowledgment only after the original release completes, including the absent/already-released case.

Current source bounds are 100,000 original files, 1 GiB per file, 8 GiB total, a 64 MiB complete manifest and a 128 MiB checkpoint. Chunk size is 1–196,608 bytes. These are explicit transfer bounds; exceeding one returns an error without truncating the source. The native MCP service's own input/reply limits still apply.

## Verify and open a complete customer workspace offline

Verify the final files without a connection file or token:

    canadabuys-customer verify \
      --directory canadabuys-customer-work/package-download \
      --publication-id ORIGINAL_PUBLICATION_UUID \
      --manifest-sha256 ORIGINAL_INSPECTED_MANIFEST_SHA256

Verification takes the original local directory lease and checks the completed manifest, checkpoint and every file. It uses no endpoint and sends no network request.

A publication exported with format:package contains the native complete CanadaBuys package. Receive it through the unchanged SQLite model:

    canadabuys-customer receive \
      --directory canadabuys-customer-work/package-download \
      --publication-id ORIGINAL_PUBLICATION_UUID \
      --workspace-directory canadabuys-customer-work/received-workspace \
      --expected-revision 0 \
      --operator customer \
      --out canadabuys-customer-work/receiving.json

Use revision0 only for a new empty workspace; otherwise supply the actual current local revision. The original receiver verifies the full package, original source bodies, saved bidder editions and evidence bytes. It keeps local review/record conflicts and the original receiving history. Reopening the same package preserves later local decisions through the original already-received behavior.

The returned customer receiving receipt binds the original publication UUID, source workspace UUID, manifest SHA256 and exact package file identity to the native receiving result and current local workspace. The source package itself remains byte-identical.

Open the complete received workspace with the installed native application:

    canadabuys serve --workspace canadabuys-customer-work/received-workspace --operator customer

Follow the loopback URL printed by that command, open **Bidder desk**, then **Decision & reports**. The page opens the same received source editions, evidence, requirements and saved decisions. Later local edits remain in that workspace when the original package is received again.

The full application and current customer modules are retained together in the installed distribution and receiving bundle.

## Programmatic use

The same lifecycle is available from the installed typed client:

    import { openCanadaBuysMerchantClient } from '<installed-package>/merchant/canadabuys/client';

    const client = await openCanadaBuysMerchantClient({
      url: originalEndpoint,
      tokenEnv: 'MCP_ACCESS_TOKEN',
      workspace: originalAlias,
      workspaceId: originalNativeUuid
    });
    try {
      await client.open();
      const current = await client.status();
      const records = await client.collect('bidder_list', { kind: 'profile', limit: 100 });
      const publication = await client.inspectPublication(originalPublicationId);
      const downloaded = await client.downloadPublication(originalPublicationId, privateOutputDirectory, {
        expectedManifestSha256: publication.manifestSha256
      });
      // Retain current, records and downloaded through the customer's original workflow.
    } finally {
      await client.disconnect();
    }

<installed-package> denotes the actual merchant distribution selected by the operator. The source checkout imports ./canadabuys-client.mjs directly. The interface does not choose or install a different package.

For a mutation that must survive process loss, use prepareCanadaBuysOperation followed by executeCanadaBuysOperation instead of wrapping a direct call in a generic retry loop. Its saved request is the concrete object to review. An application can read showCanadaBuysOperation during execution and preserve its final complete response beside the downloaded package.

## Completion evidence

A complete customer receiving result should identify:

1. The original native workspace and the full source/notice collection used.
2. Saved original profile, evidence, requirement and decision IDs/revisions.
3. The actual commandId and result used to recover a lost bidder mutation response.
4. The entered export and explicitly adopted original publication when its response was lost.
5. Every downloaded original file identity and the complete client manifest SHA.
6. The original file lease release result and same-file resume after interruption.
7. The full native package and offline receiving result, including a later local edit preserved on repeated receiving.
8. Final service/client drain and all complete source and received artifacts.

Continue operating from the received workspace and its printed application URL. Review the original source edition and evidence in **Decision & reports**, save any next local decision, and retain that workspace with the complete download and receiving receipts.


## Complete RFP, workbook and amendment intake

The installed customer now prepares and inspects a complete original document set, then saves it through the existing native atomic intake. Use **intake-template → prepare-intake → intake-plan → run** with the Merchant host's existing configured input alias. The prepared request retains the actual native workspace, original notice, command, revision and every document byte; the immutable customer operation binds the complete input SHA256. A lost response resumes the same native command. An actual revision conflict uses **refresh-intake** to retain the original request and explicitly select only its save revision.

The full operating sequence, host input declaration, source-file handling, JavaScript types and cold receiving path are in [CANADABUYS_EVIDENCE_INTAKE.md](CANADABUYS_EVIDENCE_INTAKE.md). This extends the same application and customer connection. It does not mark sources reviewed, create a purchase or change public payment terms.
