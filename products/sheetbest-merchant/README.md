# Sheet Best merchant

This is the complete Sheet Best product entry for the standalone TokenJunkieLabs merchant repository. It installs through the maintained distribution and runtime installer, opens the original private source workspace, and connects that workspace to the original dataset publisher, SF82 merchant deployment, Applications and Merchant MCP.

Use the source browser to inspect actual captured records, choose public fields, preview every captured row and retain a reviewed source version. The source version fixes the original observation, public aliases, types, null and empty-string rules, query, and explicit extraction order. Existing publisher plans and published editions retain their own source even when a later source version is selected.

For an already completed merchant publication, the product also supplies a complete receiving operation. It reads the original publisher under its existing lease, preserves the actual numeric plan IDs and separate folder UUIDs, receives the exact published field projection and order, compares every original CSV byte, and reopens both private source packets through the original importer. That workflow makes no provider read, new publication, signature or payment.

## Product contents and source lineage

The source-owned recipe is:

~~~
stellar/scf-starforge-20261009/distribution/selections/sheetbest-merchant.json
~~~

It selects the original Sheet Best source and publisher contribution, the complete Sheet Best authoring contribution, this product's three commands, and the original publishers and provider-tools MCP contributions. Its dependency closure retains the original seller, dataset, SF82, browser, native buyer and facilitator components and their existing licenses. It uses the original source-selection, contribution, build, runtime-install and provider loaders.

The sixteen workspace files, authoring guide and authoring contribution are received unchanged from public source PR2026, commit e4443043b7849236ece0030818bbb0f4cda4a923. Their per-file identities are in SOURCE_LINEAGE.json. The installed original package manifest is authoritative for this standalone edition and every subsequent source-selected build.

| Task | Installed command or native entry |
| --- | --- |
| Prepare, open or inspect this product | sheetbest-product |
| Receive exact completed publisher runs into private inputs | sheetbest-completed-input |
| Complete source-authoring receiving from those inputs | sheetbest-receive |
| Source authoring and its original API | sheetbest-workspace |
| Existing source capture/inspection | sheetbest-source |
| Existing dataset publisher | sheetbest-publisher |
| Managed merchant release | releases |
| Managed Applications | runtime-workspace |
| Original MCP host | merchant-mcp or merchant-mcp-stdio |
| Original provider catalog | merchant-providers |

The product exports ./products/sheetbest, ./products/sheetbest/completed and ./products/sheetbest/receiving. The original ./seller/sheetbest/workspace exports remain available.

## Host requirements

Use a Linux host with Node 24, Python 3.11 or later, npm, Git and the standard flock command. Node's original SQLite module stores source and publisher state. The maintained builder requires a Git version supporting its no-lazy-fetch invocation. An ordinary working directory, an original source checkout and enough space for the complete selected source/runtime are required.

The source-only Sheet Best REST/capture adapter adds no database server or Google OAuth dependency. Native seller and MCP support use the dependency declarations already retained by the original distribution. The installation below selects both native and MCP features and pins the original native versions. Installation does not fund accounts, sign payments, start a seller or call Sheet Best.

Browser receiving is optional and uses an existing Playwright module and Chromium executable explicitly supplied by the host. The product does not install or download a second browser.

## Build the selected original source

Use the exact reviewed standalone commit that includes this product. Set the four absolute paths below to private receiving locations and retain the selected commit. The build output must be new or belong to that same original build.

~~~bash
SHEETBEST_REPO=/absolute/source/tjlabs-stellar-merchant-workspace
SHEETBEST_COMMIT=REVIEWED_FULL_COMMIT_SHA
SHEETBEST_RELEASE=/absolute/private/sheetbest-release
SHEETBEST_RUNTIME=/absolute/private/sheetbest-runtime
SHEETBEST_DIST="$SHEETBEST_REPO/stellar/scf-starforge-20261009/distribution"

git -C "$SHEETBEST_REPO" cat-file -e "$SHEETBEST_COMMIT^{commit}"
node "$SHEETBEST_DIST/build.mjs" \
  --repo "$SHEETBEST_REPO" --ref "$SHEETBEST_COMMIT" \
  --selection sheetbest-merchant --out "$SHEETBEST_RELEASE"
~~~

The maintained builder resolves the complete original import/asset closure and writes the original distribution receipt, source manifest and archive. Do not substitute an archive filename or a handmade manifest. If that exact build was interrupted, repeat the same command with --resume. An existing output cannot change its commit or selection.

A current full merchant distribution that already includes this source is also usable. The product checks the original runtime and complete source manifest before preparing a workspace.

## Install the original runtime

This executable stanza derives the archive and hash from the actual original build receipt, preserves exact dependency pins, and invokes only the maintained installer. All paths and the source commit come from the preceding step.

~~~bash
node --input-type=module - "$SHEETBEST_REPO" "$SHEETBEST_RELEASE" "$SHEETBEST_RUNTIME" "$SHEETBEST_COMMIT" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [repository, release, runtime, commit] = process.argv.slice(2);
const receipt = JSON.parse(fs.readFileSync(path.join(release, 'distribution.json'), 'utf8'));
if (receipt.status !== 'PACKAGED' || receipt.sourceCommit !== commit) {
  throw Error('The original build is not packaged at the selected source commit');
}
const pinsFile = path.join(release, 'sheetbest-native-pins.json');
const pins = JSON.stringify({
  '@x402/core': '2.28.0',
  '@x402/stellar': '2.28.0',
  '@x402/extensions': '2.28.0',
  '@stellar/stellar-sdk': '16.3.0'
}, null, 2) + '\n';
if (fs.existsSync(pinsFile)) {
  if (fs.readFileSync(pinsFile, 'utf8') !== pins) throw Error('Retained dependency selection changed');
} else {
  fs.writeFileSync(pinsFile, pins, { flag: 'wx', mode: 0o600 });
}
const cli = path.join(repository, 'stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs');
const run = args => execFileSync(process.execPath, [cli, ...args], { stdio: 'inherit' });
const existing = fs.existsSync(runtime);
if (!existing) run(['prepare', '--dir', runtime, '--archive', receipt.archive,
  '--sha256', receipt.sha256, '--native', '--feature', 'mcp', '--operator', '--pins', pinsFile]);
run([existing ? 'resume' : 'install', '--dir', runtime]);
run(['inspect', '--dir', runtime, '--load', '--source']);
console.log(JSON.stringify({
  sourceRoot: path.join(runtime, 'package', 'source'),
  sourceManifest: path.join(runtime, 'package', 'manifest.json'),
  runtimeDirectory: runtime
}, null, 2));
NODE
~~~

The explicit MCP feature is required for the original MCP host. Node ESM resolves dependencies from the common runtime ancestor; placing dependencies only under an unrelated buyer subdirectory does not satisfy sibling seller/MCP imports.

For a failed installation, the same installer resume command retains the original archive, profile and lock. Its supported --adopt-existing option may receive a complete matching node_modules and lockfile without npm; it verifies that graph and the original source-selected profile. It does not authorize reusing an incomplete dependency tree or changing the retained installation selection.

The original runtime's package/source is the source root used by every command below. Its package/manifest.json binds the complete source and selected recipe.

## Prepare and open a private product

~~~bash
SHEETBEST_SOURCE="$SHEETBEST_RUNTIME/package/source"
SHEETBEST_PRODUCT=/absolute/private/sheetbest-product

node "$SHEETBEST_SOURCE/products/sheetbest-merchant/product.mjs" prepare \
  --runtime "$SHEETBEST_RUNTIME" --directory "$SHEETBEST_PRODUCT" \
  --title "Sheet Best merchant"

node "$SHEETBEST_SOURCE/products/sheetbest-merchant/product.mjs" open \
  --directory "$SHEETBEST_PRODUCT" --port 8471
~~~

Open the exact private loopback URL printed by the process. It contains that process's workspace token. Do not publish the URL or place it in a customer document.

Preparation verifies the original READY runtime, creates the original source workspace, and retains one preparation intent. Repeating it with the same paths, title and manifest resumes that intent. It refuses an unrelated existing workspace or a different runtime binding. It performs no Sheet Best read and makes no public field selection.

The product retains these private files:

| File or directory | Purpose |
| --- | --- |
| product.json and PREPARATION.json | Exact product/runtime/workspace binding and original preparation intent |
| workspace/ | Original source SQLite database, captures, draft, previews, saved source versions, publisher and deployment history |
| sheetbest-workspaces.json | Original host-declared MCP workspace binding |
| merchant-overlay.json | One configuration field to merge into the existing reviewed merchant configuration |
| application-settings.json | Exact existing workspace selection for the original Applications form |
| PREPARED.json | Original preparation completion and workspace identity |

The overlay is a fragment, not a replacement merchant configuration. Preserve the existing seller, resource, facilitator, accounting and other provider settings when adding its sheetbestWorkspaceConnection field.

Stop the browser process with SIGTERM or Ctrl-C and let the original server drain. The product prints no success until its original open completes, and shutdown waits for the original model and its borrowed publisher/deployment work.

## Receive the two completed editions without replaying publication

For the already completed Sheet Best development input, use the original closed publisher. Do not run the historical native consumer again and do not change any old absolute declaration paths.

First create the private receiving input using the actual original run UUIDs. The helper reads the database in read-only mode under its original publisher flock, verifies the original source/capture, immutable plan, completed candidate, review and publication, and copies only the resulting private receiving files.

~~~bash
SHEETBEST_ORIGINAL_PUBLISHER=/absolute/original/sheetbest-native-operational/publisher
SHEETBEST_INPUT=/absolute/private/sheetbest-completed/input.json

node "$SHEETBEST_SOURCE/products/sheetbest-merchant/completed.mjs" \
  --publisher "$SHEETBEST_ORIGINAL_PUBLISHER" \
  --run 8af8192b-7729-4fc2-926f-4088333912fc \
  --run 70d64a06-8f53-41c1-8ba1-bfb2dee25f54 \
  --out "$SHEETBEST_INPUT" --reviewer "Receiving operator" \
  --title "Sheet Best merchant"
~~~

Those run IDs refer to the retained 516-row development exercise. For another completed publisher, use that publisher's actual selected run IDs and an explicitly chosen order. A numeric native plan ID and its UUID storage folder are different identities; the helper reads and preserves both.

The generated input preserves:

- The original database hash and selected publication/review identities.
- Each actual immutable plan, dataset description, candidate and complete published CSV.
- The original capture bytes and manifest inside a private source packet.
- Only the actual published column projection, with the exact original extraction order.
- Original aliases, scalar conversion, nullable/empty-string handling and capture provenance.

The four public fields in the retained exercise are id, amount_text, age_text and created_at, all nullable text. Raw Name and email fields are not added to the public projection. The full raw observation remains in the operator's private packet so the source can be reviewed and edited later.

Run the complete receiving operation against the prepared product, after closing any browser, MCP or Applications owner of that same workspace:

~~~bash
node "$SHEETBEST_SOURCE/products/sheetbest-merchant/receive.mjs" \
  --runtime "$SHEETBEST_RUNTIME" --directory "$SHEETBEST_PRODUCT" \
  --input "$SHEETBEST_INPUT"
~~~

The receiver starts from an empty source workspace. If product preparation was done separately, its title and runtime must match the input. It refuses to overwrite a newer operator draft or selected version on continuation.

For the full browser receiving leg, supply a private 0600 JSON file with two absolute paths:

~~~json
{
  "module": "/absolute/existing/node_modules/playwright-core/index.mjs",
  "executable": "/absolute/existing/chrome-headless-shell"
}
~~~

Then append --browser-config /absolute/private/browser.json to the same receiving command. The source manifest, input hash and browser paths are retained in the operation basis. Keep that selection on retry. The browser calls the original Preview and Save source version forms, retains their actual UUID/body before dispatch, and records desktop/mobile images. It cannot browse an external provider during this operation.

The receiver:

1. Imports each selected original packet through the original source importer.
2. Previews all captured rows and checks the actual publication summary: capture identity, source/emitted row counts, public aliases and exact order.
3. Saves the reviewed source version with the original draft and selected-version compare-and-swap guards.
4. Runs the unchanged source projector and scalar/CSV encoders over the original captured bytes, and compares the complete result to the original published CSV.
5. Retains the two private source-version packets and the original version comparison.
6. Produces the original publisher plan input for the selected source version; it does not create or publish another dataset edition.
7. Closes the source browser and reopens that same private workspace through the original MCP adapter, checking its selected source version and hash.
8. Uses the original Applications preparation helper to bind the same source, immutable settings, database identity and runtime. Applications Start is a later explicit operator action.
9. Independently imports the private packets into received-source/, closes that workspace, reopens it and checks the retained capture identities.
10. Reopens the main source workspace and verifies every saved source-version hash.

Success is receiving/result.json with state COMPLETE. The result distinguishes browser NOT_REQUESTED from a completed actual browser leg. It contains exact source-version, CSV, packet, original run/plan/snapshot and runtime-manifest identities. It does not claim seller activation, a payment, or customer acceptance.

The full private receiving directory also contains the operation state, source comparisons, original publisher plan input, Application preparation and any requested screenshots. Preserve it with the complete original source workspace.

### Resume the same receiving operation

Repeat the exact same command and input paths after an interruption. The receiver retains native request UUIDs before dispatch, reads the original operation record before deciding whether to resume, and reuses the original UUID after a lost response. It does not invent another import/version when a saved receipt already exists.

The original source lease must be free before reopening. Stop the exact owner and let it drain; do not delete a lock to bypass a running source or publisher. A newer operator draft or selection is a conflict requiring review, not permission for the receiver to replace it.

If result.json was saved before the last receiving-state update, the same invocation reads that complete result and checks its historical source-version hashes before returning. It does not reset a later operator selection to the receiving baseline.

Once input.json and its file inventory are retained, use those same files. Do not regenerate them after unrelated original publisher history has advanced and expect the old input identity to change. The original publisher is never rewritten by the input helper.

## Operate the received product

Open the product again with sheetbest-product open. The two saved source versions and exact original orders are visible in Review and Versions.

The existing browser review shows the actual capture time and manifest, source and emitted row counts, the chosen public fields/types/null/empty-string rules, query and order. Every captured row is emitted with those selected columns. This workspace does not implement row filtering. The extraction sorts nulls last in either direction and uses original row ordinal for ties.

Editing or selecting a source version affects future publisher plans. Already retained plans and published editions preserve their original captured source and review. Save a new reviewed source version when changing aliases, types, null handling or order; the original model rejects alias collisions, missing source fields, incompatible conversions and stale draft revisions.

The complete native browser, CLI, HTTP and MCP operation reference is included at:

~~~
stellar/scf-starforge-20261009/sf30-seller-sdk/sheetbest/WORKSPACE.md
~~~

That guide covers host-declared live connections, source import, preview, version comparison, chunked private packet transfer, original request recovery and managed deployment. A live capture remains an explicit original read; opening this product does not call Sheet Best.

### Original publisher and SF82 deployment

Use the selected reviewed source version to open its existing publisher and export the original plan input. Review the candidate using the original publisher UI. Publishing, scheduling and subsequent edits use that same publisher store and native dataset version writer.

The workspace's Deployment panel uses the original SF82 dataset release store for review, stage, start, stop, restart and rollback. It binds the original publisher run's numeric plan ID, candidate/review and exact published snapshot. It does not infer a plan ID from a folder UUID.

Merchant staging contains the real local dataset binding and may contain an absolute private path. Keep that staging package private to the merchant operator. Use the original release/client exporter for customer delivery. Customer material must contain the selected published projection and portable client/contract files; it must not contain a private raw source packet, host connection file, environment value or merchant staging binding.

The receiving helper does not activate an SF82 seller or repeat the historical challenge/payment exercise. Use the original deployment UI for a deliberate later merchant release, preserving all existing source and publication history.

### Applications

Close a separately opened source browser or MCP instance first. In the original runtime-workspace Applications UI, choose SheetBest source authoring, use the workspaceDirectory in application-settings.json, review/save, then Start and Open.

The original Application checks the selected source files, immutable database/settings identity, connection-file hash when configured, actual startup line and owned process. Stop drains the owned original model and services. A deliberate later Start has its own reviewed UUID while the same source workspace and publication history remain intact.

The receiving result records Application preparation only. It does not substitute that preparation for an actual Applications Start/Open/Stop result.

### Merchant MCP

Merge merchant-overlay.json into the existing reviewed merchant configuration. The original source-owned provider sheetbest-workspaces depends on the original publishers provider. The selected recipe includes both; no shared loader fork is used.

Open the host-declared merchant workspace with merchant_sheetbest_open. The original catalog exposes source/draft/preview/version, packet transfer, publisher and SF82 operations. Packet readers are scoped to this workspace and its original packet/version identities. The borrowed publisher remains owned by the source model and is never placed in a second publisher store.

Close the exact current MCP instance using its returned instanceId, or close the original MCP host and wait for drain. After closing, the product browser or Applications may reopen the same source workspace. Do not race independent owners of its native lease.

## Source and runtime upgrades

The original installer prepares a new runtime for a new archive and retains the previous runtime. Use its compare command and review the selected source/dependency changes before the existing runtime-workspace release workflow switches an Application.

This product's product.json intentionally binds one exact installed manifest. Repeating prepare with a different runtime is refused. Keep the prior product/workspace available and use the original private packet export/import and managed runtime/release tools for a deliberate upgrade. Do not edit a manifest or absolute source path to make an old preparation appear to use new bytes.

The old publisher plans, runs, candidate files, versioned dataset and completed-native receipt remain independent retained history. The original source packet importer is the supported receiving boundary for a new private source workspace.

## Validation and result boundaries

The predecessor Sheet Best native exercise completed with 516 actual captured records, two original publications, a seller 402 response, a pinned buyer configuration, exact-value comparison and cold original MCP/publisher reopen. The new authoring product sources were reviewed against the actual original model, publisher, deployment, Applications and MCP interfaces.

The standalone product source and receiving driver are implemented here. A selected archive/install or this new receiving operation is complete only when its own original build/runtime/receiving receipts say so. Source publication and code review are not native execution results. Record the actual selected commit, archive hash, package manifest hash and receiving/result.json together when that one receiving operation completes.

The retained development input's raw response hash is 0d1996d6668ebe54ca84b5252a41102425ed55e2bc01f6da5700a37376074245; its capture manifest hash is 28a98e2e7aff1dbd693ff5658253193274bf0e29a34c621e9fe44dcef867da16. The two original published snapshots are 04fdc82fa67b345ea212b242d5fa65931302efdac374faabfc0efe4303148cbb and a68b3c4f960bb10f5187ff94a5bb7edd860932c2a0fd0011616288810c49b878. The receiving program reads their actual plans and order arrays; it does not infer their order from this guide.

No raw captured records, connection identifiers, API keys, local private runtime files or customer correspondence are part of this repository product.
