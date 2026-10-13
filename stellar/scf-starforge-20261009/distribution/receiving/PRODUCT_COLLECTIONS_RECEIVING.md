# Receive product source, installed Collections and a later reporting period

Run the complete product journey with the existing Linux operator's original catalog, request definitions, operator workspaces and browser. The entrypoint builds the full committed toolkit, opens its installed Collections command, saves and reopens two plan revisions, creates the first period, carries the prepared later period through encrypted receiving, and creates that period from its retained source after restore.

The command retains the original source review, runtime operations, plan and edition hashes, collection manifests, native recovery requests, original exports and desktop and phone views. The software installation, receiving output and original business state use separate directories.

## One command

From the complete maintained checkout at the selected immutable commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/receiving/product-collections-receiving.mjs \
  --input /absolute/existing-case/product-collections-input.json
~~~

The same command continues its retained journal after an interruption. Keep the input file, output directory and original request IDs. Progress is emitted as JSON lines. A completed invocation emits the complete archive path, byte count and SHA-256, plus the adjacent delivery JSON.

Use the existing accepted native operation for this work. The source entrypoint and browser module live together in this directory:

- [product-collections-receiving.mjs](product-collections-receiving.mjs) operates the original native controllers.
- [product-collections-browser.mjs](product-collections-browser.mjs) opens and uses the maintained product interfaces.
- [Source Builds](../runtime-workspace/SOURCE_BUILDS.md) describes source review, package building and runtime installation.
- [Collections authoring](../../sf88-operator-buyer-cli/collections/AUTHORING.md) describes the complete original plan and period format.
- [Collections recovery](../../sf88-operator-buyer-cli/collections/RECOVERY.md) describes the encrypted source and receiving operation.

## Existing host and original inputs

Use Linux, Node 22 or newer, Git, util-linux flock, tar, Python, and the operator's existing Playwright module and Chromium executable. The browser module accepts their absolute paths and launches that installed browser directly. The original runtime installer receives the existing npm cache and optional Node headers directory.

The source repository must be a complete checkout whose HEAD is the selected commit. Both receiving modules must be tracked there, and the product source must match that checkout. Source discovery, product details, comparison and build all use that same immutable commit.

Select an initialized Runtime workspace and the original initialized Collections store. Keep the original inbox and operator workspaces attached to that store. The Collections directory must be inside the original recovery state root. The native recovery review determines the exact required roots, source files, configurations and operator dependencies.

Choose two complete plan files describing the actual requests for this business task. Each must contain at least two requests, and both must retain the same plan reference while expressing distinct revisions. They may be raw plan JSON or the complete saved response containing a plan field. The entrypoint saves those revisions through the actual Request plans interface; previously saved authoring records are optional.

Every selected request carries its real catalog path and row/terms selection, actual URL and method, original operator workspace or configuration path, and actual body, ticket and response paths when applicable. Use the original catalog and native operator configuration to make those choices. The entrypoint reads and records their original file identities before preparation and retains both complete plan inputs before moving the original state.

Both periods supply every declared parameter explicitly. The first uses revision 0; the later period uses revision 1. Collection references must be distinct and belong to this receiving continuation. The later period remains prepared while its source is backed up and received.

Set the existing backup passphrase environment variable in the native process environment. The input contains its variable name. The same value is inherited by the installed native backup and receiving commands.

The operator must finish other writers to the selected original inbox, Collections store and operator workspaces before this receiving command runs. The quiesced selection is passed to the original recovery engine. Its native leases and source checks remain authoritative throughout snapshot and restore.

### Original 0D0B / Vellar receiving inputs

The existing programme is SCF-BUYER-REQUEST-COLLECTIONS-0D0B-20261012. Its current continuation is in the [original Collections receiving thread](https://tokenjunkielabs.slack.com/archives/C0C1F274SGH/p1791767352437119).

The retained original Vellar catalog has 27 rows and 45,753 UTF-8 bytes:

~~~text
SHA-256 63a7662d63c4cc610917ddfc7f2dbd490e88a9e491abf7b7038714a51d1b8c81
/home/hatch/workspace/sim-work/sf41-sf45-worker/capture-live/vellar-testnet-00000000.json
~~~

The existing F1CB host also retained the complete source at:

~~~text
/dev/shm/f1cb-scf-bazaar/vellar-fresh-testnet.json
~~~

The [original complete source return](https://tokenjunkielabs.slack.com/archives/C0C1F274SGH/p1791829396155439?thread_ts=1791692545.342529) contains the native source identity. Its original discovery endpoint is:

~~~text
https://vellar-facilitator-testnet-production.up.railway.app/discovery/resources?network=stellar%3Atestnet&limit=100&offset=0
~~~

Select the actual retained operator paths and intended requests from the accepting host. The historical 0D0B lifecycle directory and its request fixtures are separate from this merchant catalog. Reuse the existing native operation and actual customer source selections when joining this journey.

## Complete input format

This example shows the directory roles and every required selection. Replace its path placeholders and FULL_IMMUTABLE_COMMIT with the accepting operator's current original paths and exact source commit. Supply the actual plan files and their actual parameter values.

~~~json
{
  "schema": "stellar-forge.product-collections-receiving.v1",
  "operationId": "SCF-BUYER-REQUEST-COLLECTIONS-0D0B-20261012",
  "outputDirectory": "/srv/receiving/product-collections",
  "source": {
    "repository": "/srv/source/tjlabs-stellar-merchant-workspace",
    "commit": "FULL_IMMUTABLE_COMMIT",
    "python": "/usr/bin/python3",
    "offline": true,
    "compareSelections": ["all", "buyer-expenses"],
    "searchQuery": "Complete toolkit"
  },
  "runtime": {
    "workspaceDirectory": "/srv/runtime-workspace",
    "name": "collections-receiving",
    "profile": {
      "native": true,
      "operator": true,
      "features": [],
      "pins": {}
    },
    "install": {
      "offline": true,
      "cache": "/srv/npm-cache"
    }
  },
  "collections": {
    "directory": "/srv/operator-state/request-collections",
    "planFiles": [
      "/srv/receiving-inputs/first-plan.json",
      "/srv/receiving-inputs/revised-plan.json"
    ],
    "periods": [
      {
        "collectionId": "selected-first-period",
        "name": "Selected first period",
        "revision": 0,
        "values": {"period": "ACTUAL_FIRST_PERIOD"}
      },
      {
        "collectionId": "selected-later-period",
        "name": "Selected later period",
        "revision": 1,
        "values": {"period": "ACTUAL_LATER_PERIOD"}
      }
    ],
    "enqueueFirstPeriod": true
  },
  "recovery": {
    "stateRoot": "/srv/operator-state",
    "retainedStateRoot": "/srv/retained/operator-state-before-receiving",
    "passphraseEnv": "SF88_BACKUP_PASSPHRASE",
    "python": "/usr/bin/python3",
    "quiesced": true
  },
  "browser": {
    "playwrightModule": "/srv/existing-browser/node_modules/playwright/index.mjs",
    "executablePath": "/srv/existing-browser/chrome-headless-shell-linux64/chrome-headless-shell"
  },
  "operationTimeoutSeconds": 3600
}
~~~

The full toolkit is always the built product. The other comparison selections must be available named recipes from the same committed catalog. The program opens their original product details and readable guides, compares them with the full toolkit, and verifies that manifest-backed adapter groups appear in the full product and comparison.

The full toolkit includes Collections, its authoring commands and the original recovery modules. A narrower comparison product has its own intended command set; it does not replace the full toolkit installation.

### Reuse an exact existing installation

To reuse a ready installation of this exact source and selected profile, replace runtime.name with:

~~~json
"installedDirectory": "/absolute/existing/complete-toolkit-runtime"
~~~

Retain workspaceDirectory, profile and install. Copy the actual profile selection from that installation's runtime-profile.json when appropriate. Its source commit, profile ID, source archive and selected native dependencies are inspected through the original installer. An installation of an earlier source belongs to its own retained product edition.

With runtime.name, the original Runtime workspace prepares a new installation beneath its configured runtimeHome. The entrypoint passes the completed package archive and reviewed profile to that original preparation. It then uses the same runtime directory for original dependency installation and native inspection.

Supply actual exact pins whenever the chosen original dependency declarations require them. Optional Node headers may be selected with runtime.install.nodeHeaders. Source fetching and dependency fetching remain the explicit source.offline and runtime.install.offline choices.

### Directory separation

The output directory must be private and separate from the source checkout, Runtime workspace, installed runtime, original state root and retained original state. The original state root and retained destination must also be separate from the installation. The retained destination must be absent, its parent must already exist, and it must use the same filesystem as the original state root so the whole original directory can be preserved by rename.

At the recovery boundary, the entrypoint closes its owned Collections and Runtime listeners, records the original root's filesystem identity, and renames that whole root to retainedStateRoot. All original bytes remain there. The downloaded encrypted bundle then restores the original absolute root through the original native receiving workflow.

The target therefore has the same absolute paths recorded by the original collection, request and operator configurations. After receiving, the prepared later period opens its retained source, reaches the original collection creator, and reopens from a freshly launched installed workspace.

## Operated product sequence

| Product step | Original authority and retained result |
| --- | --- |
| Catalog search and selection | Source Builds catalog at the selected immutable commit, actual browser search rows and full product description |
| Requirements and comparison | Downloaded JSON and readable guides; original package-manifest adapter groups in details and comparison |
| Saved source build | Original review ID, selection hash and source-build request ID; original full package and archive SHA-256 |
| Installation | Original Runtime workspace profile review, prepare/install operations or exact installed-runtime adoption |
| Saved build reopening | New Runtime listener, same saved review, completed download and install controls, same installed profile |
| Request-plan authoring | Actual browser imports and native saves of both complete revisions, original-plan reopening and catalog inspection |
| First period | Original edition preparation, returned preview and edition hashes, original collection creation and selected enqueue |
| Later period preparation | Distinct explicit values and revised plan, saved PREPARED edition and its captured original source |
| Native backup | Original recovery review and SNAPSHOT request, every encrypted member received with original relative path and identity |
| Native receiving | Original VERIFY and RESTORE requests against the original record hash and absent original state root |
| Restored authoring | Both saved revisions reopen; the retained later-period preview creates the original collection |
| Final workspace reopening | Fresh installed Collections listener, both original collection manifests and operator mappings, saved first revision |
| Complete handover | Original source package, input selections, native outputs, collection exports, encrypted bundle and desktop/phone views in one archive |

The first period enters the original inbox only when enqueueFirstPeriod is true. Its queue result must include every original request. The maintained workspace keeps the original approval and run controls attached to those requests.

Creation uses the actual returned edition.editionSha256 and edition.preview.previewSha256. A partially prepared original collection continues its original creator. The later period's immutable edition and preview must match across recovery.

## Retained files

The complete output contains:

- RESULT.json: source edition, installed runtime, plan revisions, both collection manifests, backup/restore identities and actual browser files.
- receiving.json: stage checkpoints and original native request IDs.
- input.json and inputs/: complete receiving selection, both complete original plan definitions, original file identities and host/source identity.
- source/: original product catalog selections, full descriptions, installed CLI comparison, saved source-build operation and complete toolkit archive.
- browser-exports/: actual product, comparison, plan and period downloads.
- collections/ and collection-exports/: original snapshots, native queue result and complete original HTML/CSV/JSON export members.
- recovery/: original review, operation results and full received member descriptors.
- original-encrypted-backup/ and received-encrypted-backup/: original published bundle and independently received complete encrypted members.
- receiving-workspace/: the original native VERIFY/RESTORE journal.
- logs/: complete native Collections startup/stdout/stderr files.
- views/: desktop 1440×1000 and phone 390×844 PNGs from the actual product interface.
- browser-observations.json: actual view/download identities and browser exception observations across continuation.

The adjacent outputDirectory.tar.gz is the complete receiving output. The adjacent outputDirectory.delivery.json adds its actual archive byte count and SHA-256. Preserve both through the existing native owner's durable-file capture and return them to the same operation thread.

The retained original state remains at retainedStateRoot as a separate complete original directory. Its encrypted receiving copy is included in the handover archive.

## Resume the same operation

Repeat the same one command with unchanged input. The receiving lease admits one owner at a time.

The entrypoint reuses the saved source review and original source-build request. It follows an existing active worker and calls the original source-build recovery route for an interrupted build. Runtime preparation retains its original request; dependency installation resumes its original installation directory. A previously failed installation may receive one following original installer request on the next invocation, with the predecessor ID retained.

Owned installed listeners retain their actual PID, process-start identity and original startup log. A continuation reopens that same listener when it is still alive. Completed native recovery results are reused; an unfinished recovery continues the same native request. Original collection and edition references stay attached to their original stores.

After the state-root move, the checkpoint and original directory identity determine whether the same rename already happened. Native receiving then reconciles its own retained restore. A completed product journey whose outer archive was interrupted only resumes packaging.

Correct a concrete underlying input, capacity or dependency problem through the original operator case, preserve its source and journal, and rerun the existing operation. Source or business-selection changes belong in a new explicit input/output continuation because the current journal binds its original selection.

Native progress and failure records identify the exact original request and stage. An active operation that outlasts operationTimeoutSeconds retains its native ID and progress for continuation. The timeout can be selected when preparing the receiving input for the existing host.
