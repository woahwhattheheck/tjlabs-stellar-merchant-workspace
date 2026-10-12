# Supplier accounts: install, operate and receive

Configure shared supplier accounts in the merchant's original upstream file, review the exact changes, continue interrupted saves and hand over the complete operator workspace. The browser, installed command and managed Applications entry use the same retained source, change IDs and quota accounts.

The **supplier-accounts** source selection includes the complete original workspace, the shared account compiler and registry, the maintained quota owner, the Runtime/Applications lifecycle, this guide and the original completed receiving package. The full merchant distribution includes the same contribution.

## Install the selected product

Use Linux with the maintained package's Node requirement, **22.16.0 or newer**, including its original `node:sqlite` module and the host's util-linux `flock` command. The supplier workspace operates through Node's built-in modules. The original merchant keeps its own provider and payment runtime.

Build from one selected commit in the standalone checkout:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout \
  --ref FULL_SELECTED_COMMIT \
  --selection supplier-accounts \
  --out /private/releases/supplier-accounts
~~~

Use the archive path and SHA-256 returned by that build. Retain the archive, its complete manifest and selected source commit together. In an application directory, install that actual archive:

~~~sh
npm install --ignore-scripts --offline --omit=optional /private/releases/ACTUAL_ARCHIVE.tgz

npx --no-install starforge source
npx --no-install starforge registrations --source supplier-accounts
npx --no-install starforge supplier-accounts --help
~~~

The installed registry exposes the original `supplier-accounts` command and its model, server and Applications exports. The selection also includes `supplier-quotas` for direct configuration and quota inspection, together with the original installation, runtime profile, installation transfer and Runtime workspace commands.

For managed operation, receive the selected archive through the maintained [runtime installer](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md), retain that installation and open its [Applications workspace](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/APPLICATIONS.md). Select **Supplier accounts** and its actual existing upstream configuration. The provider uses the same Review, Save, Connect, Review Start, Start, Open, Stop and recovery lifecycle as other installed applications.

## Select the merchant's working source

Use the merchant's existing `stellar-forge.seller-upstreams.v1` configuration. Its bindings retain their original methods, source URLs, request mappings, authentication references, response contracts, cache and idempotency settings. Each shared account keeps its stable alias, account label, credential reference and private quota directory.

The upstream file must be a regular single-link file in an operator-owned private directory. Keep the supplier workspace in a private directory beside the merchant's operating state. For example, open the actual selected file through the installed command:

~~~sh
npx --no-install starforge supplier-accounts serve \
  --state /private/merchant/supplier-workspace \
  --upstreams /private/merchant/upstreams.json \
  --port 0
~~~

Open the complete URL printed by that process. The original server binds to loopback and supplies the access token for that host instance. Reopening the same state retains its workspace and change history; a new server instance prints its own launch URL.

The operator's source view identifies the selected file and capture time. The account table shows complete declared accounts, their configured rate and rolling allowance, and membership of the original source bindings. The installed [native guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/supplier-quota/workspace/README.md) documents every field and request.

## Review and save a complete configuration change

1. Edit the account allowances and binding membership in the browser. Adding an account requires its stable label, original private quota directory and at least one source binding.
2. Give the change a reason and choose **Prepare review**. Inspect the account and assignment differences against the captured source.
3. Choose **Save reviewed change**. The workspace retains that change before publishing the exact reviewed configuration and returns its saved outcome.
4. Use the merchant's existing managed stop/start to load the saved policy. Processes sharing an account should select the same policy and original quota directory.
5. Choose **Read account usage** to inspect the native ledger under the currently saved configuration.

Allowances count original supplier calls: 1–1,000 calls per second and 1–100,000,000 calls per rolling 24 hours. Provider-specific monetary tariffs or weighted credits keep their existing provider calculations. The original ledger continues to own atomic dispatch reservation, minute-bucket usage and provider cooldowns.

Account identity and usage survive configuration changes. Retiring an account removes it from the draft and unassigns its bindings while preserving its retained identity and ledger. Reinstating that alias keeps the same account.

### Continue source changes and interrupted saves

| Operator situation | Action on the existing work |
| --- | --- |
| The file changed after a review | Open the retained conflict, compare the current source and use **Rebase review on current source**. The new review retains its predecessor. |
| Separate limit fields changed independently | Rebase preserves unrelated edits and presents the remaining intended field changes. |
| A save response was lost or a private output was interrupted | Open the same change and choose **Recover this save**. Recovery reconciles its exact original source, retained output and completed target. |
| A prior change needs restoration | Choose **Prepare restoration**, review its inverse against the current source, and save through the same source check. |
| The workspace moved to another source-file identity | Receive the complete history, then rebase a pending review against the actual receiving file. |
| A policy was saved while the merchant was running | Continue through the merchant's normal managed restart, then inspect the original account ledger. |

An applied change returns its existing outcome when reopened or recovered. A restoration against the unchanged reviewed target returns the exact original source bytes; with later independent edits, it preserves their configuration values.

## Work through the CLI

The native command acts on the same workspace as the browser:

~~~sh
npx --no-install starforge supplier-accounts init \
  --state /private/merchant/supplier-workspace \
  --upstreams /private/merchant/upstreams.json

npx --no-install starforge supplier-accounts proposal \
  --state /private/merchant/supplier-workspace \
  --out /private/merchant/proposed-accounts.json

npx --no-install starforge supplier-accounts prepare \
  --state /private/merchant/supplier-workspace \
  --draft /private/merchant/proposed-accounts.json

npx --no-install starforge supplier-accounts review \
  --state /private/merchant/supplier-workspace \
  --id ORIGINAL_CHANGE_ID

npx --no-install starforge supplier-accounts apply \
  --state /private/merchant/supplier-workspace \
  --id ORIGINAL_CHANGE_ID \
  --revision RETURNED_REVISION \
  --review-sha256 RETURNED_REVIEW_SHA256
~~~

Use the IDs, current revision and digest returned by the actual retained review. The exported proposal contains the complete account and binding inventory, so edits preserve the intended complete source.

The same command exposes `recover`, `cancel`, `restore-change`, `rebase`, `inspect`, `show`, `report`, `backup` and `receive`. The [original command reference](../../stellar/scf-starforge-20261009/sf30-seller-sdk/supplier-quota/workspace/README.md#command-line-operation) supplies their exact arguments and source-conflict behavior.

## Deliver and receive the whole workspace

Create the readable report and complete private backup from the original state:

~~~sh
npx --no-install starforge supplier-accounts report \
  --state /private/merchant/supplier-workspace \
  --out /private/merchant/account-history.json

npx --no-install starforge supplier-accounts backup \
  --state /private/merchant/supplier-workspace \
  --out /private/merchant/supplier-workspace-backup.json
~~~

Transfer the backup, the matching original upstream content, the selected source archive and its manifest to the receiving host. Include the quota ledgers through the merchant's existing complete handover so their account identity, reservations and provider cooldowns remain attached to the live service.

Select a new or empty private receiving workspace and the exact transferred upstream file:

~~~sh
npx --no-install starforge supplier-accounts receive \
  --state /private/receiving/supplier-workspace \
  --upstreams /private/receiving/upstreams.json \
  --backup /private/receiving/supplier-workspace-backup.json

npx --no-install starforge supplier-accounts show \
  --state /private/receiving/supplier-workspace

npx --no-install starforge supplier-accounts serve \
  --state /private/receiving/supplier-workspace \
  --upstreams /private/receiving/upstreams.json \
  --port 0
~~~

The backup retains complete source revisions, immutable reviews, outcomes, account identities and operating events. Receiving the same completed backup returns the same received workspace. Applied changes retain their outcomes. A pending review that names the sending file can be continued with a new receiving review bound to the actual source digest and inode.

An operator can then edit, save, restore, export and reopen this received workspace through the original browser or CLI. The [complete native handover contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/supplier-quota/workspace/README.md#complete-handover) covers partial initialization and original source receiving.

## Open the original completed receiving package

The installed selection includes [the original completed packet](../../stellar/scf-starforge-20261009/sf30-seller-sdk/supplier-quota/receiving/original-workspace-84eb/RECEIVING.md), its journal, report, private backup, original upstream source, receiving driver and single ZIP. Its full archive is explicitly selected in the product contribution so the binary travels with both the selected and complete distributions.

Original operation **SCF-SUPPLIER-ACCOUNT-WORKSPACE-84EB-20261012** completed all **29 phases** at **2026-10-12T11:38:31.598Z**. The retained journal covers separate policy reviews, saved edits, stale-source conflict and rebase, restoration that preserves independent edits, exact original-source restoration, unchanged quota history, full workspace receiving, receiving-file rebase, actual Applications startup and CLI reopening.

| Object | Original identity |
| --- | --- |
| Complete ZIP | `completed-supplier-workspace-84eb.zip`, 18,326 bytes |
| ZIP SHA-256 | `5bbbbc41561aab67191a1cba5a691aac60338ef1b918d2afc3bc0240c00884a4` |
| Original source | 1,027 bytes; SHA-256 `11becf66fa3bee3b160f51925d48002fa207e9d7c9263955eeef354bffde89e6` |
| Backup used for receiving | 6 changes and 16 events |
| Later received-workspace report | 8 changes and 23 events |
| Original quota before and after | Revision 1, total dispatched 1, one rolling-window call and 9,999 remaining calls |

The backup and final report retain their respective points in the same completed operation. Read the included journal and report directly to reuse those accepted outcomes. Continued merchant work uses the original workspace with its actual source and quota directories.

## Source lineage

The complete application is adopted from [public PR #1898](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/1898), merge `dffaea9bf479fbf27be07c007df61f927a5773f1`. The complete receiving package is adopted from [Commons PR #35306](https://github.com/woahwhattheheck/commons/pull/35306), merge `032876f2a07618f9b0b591e615e06c1a3ca528a6`.

[SOURCE_ADOPTION.json](SOURCE_ADOPTION.json) maps every original member to its repository, selected commit and Git blob. The standalone source recipe and generated package manifest identify the particular installed edition. The original [source operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/supplier-quota/workspace/README.md) and [completed receiving guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/supplier-quota/receiving/original-workspace-84eb/RECEIVING.md) travel with that edition.
