# Install and move the complete bank application

The **merchant-bank-statements** product packages the complete bank reconciliation desk with the original Receivables, Bank receipts, remittance receiving, customer statements, payment plans, accounting and support workflows. Its source selection includes the original browser assets, typed clients, Python bank parsers, source guides, Applications providers and the maintained runtime installer.

Use the release's complete archive and its accompanying distribution receipt. The receipt identifies the source commit, selected product, archive filename and SHA-256. Keep the source manifest with that archive so a later installation can identify the original files.

The [operator handover](HANDOVER.md) follows the installed application from original statement receiving through customer allocation, a balanced close and recovery. The [product guide](README.md) describes every posting and correction workflow.

## 1. Receive an existing release or build its committed source

An existing release can go straight to installation. To build a release from the maintained repository, use an exact commit containing the bank source selection:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout \
  --ref FULL_COMMIT_SHA \
  --selection merchant-bank-statements \
  --out /private/bank-release
~~~

The original builder reads that commit's Git objects, resolves the selected source and produces the complete package through its existing archive workflow. Use the returned archive path and SHA-256 in the next step. The package version contains both the source commit and selection.merchant-bank-statements.

To continue that same interrupted build, preserve its output directory and repository:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout \
  --out /private/bank-release --resume

node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out /private/bank-release --status
~~~

The original Runtime workspace offers the same operation under **Build a product**. Load the committed products, choose **Merchant bank statements and cash reconciliation**, inspect its source and installation requirements, then review and build it. **Choose adapters and install** opens the completed archive in **Source & profile**. **Download package** returns the original archive.

Saved source reviews retain their commit, selection and request. **Continue original build** resumes the selected operation. The [complete source-build guide](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/SOURCE_BUILDS.md) covers original Git acquisition, saved reviews, progress, downloads and recovery.

## 2. Prepare and install the selected runtime

The maintained complete operator installation uses Linux, Node 22.16 or later, Python 3.11 or later, npm and flock. The Bank receipts Python parsers are included in the original product source.

From the corresponding maintained source checkout, prepare a new runtime using the original release archive:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /private/bank-runtime \
  --archive /absolute/returned-bank-package.tgz \
  --sha256 RETURNED_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /private/bank-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /private/bank-runtime --load --source
~~~

These choices come from the bank selection's own runtime catalog. Native dependencies equip the included Stellar verification and recovery paths. Schema and OpenAPI equip the selected source, quotation and support components. Operator mode retains the managed runtime's host requirements. The installer resolves the release's exact declared packages and checks the installed source and imports.

The complete source remains under /private/bank-runtime/package/ and its dependencies remain beside it under /private/bank-runtime/node_modules/. The installer keeps the selected profile, original archive, lock and operation state in that runtime.

To continue an interrupted installation, use its same directory:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs resume \
  --dir /private/bank-runtime
~~~

For an already retained, matching node_modules graph and original lock, the maintained install and resume commands accept --adopt-existing. Offline installation uses --offline with the original npm cache; a native package compiled from source also needs the matching local Node headers through --node-headers and the normal compiler toolchain. The [runtime transfer](#6-move-the-source-and-dependencies-to-another-operator) workflow supplies a complete dependency handover.

Run the original command through its installed layout:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /private/bank-runtime -- bank-statements help

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /private/bank-runtime -- registrations
~~~

The remaining examples use starforge for readability. Pass the same arguments after runtime-install run -- when using the source installer directly.

## 3. Open the merchant's accounting directory

Reopen the existing private accounting workspace:

~~~sh
starforge bank-statements serve \
  --directory /private/merchant/accounting \
  --port 8448
~~~

The command prints the bound accounting directory, its workspace ID, source configuration identity and local opening URL. Open the printed bank address, normally http://127.0.0.1:8448/bank-statements/.

For first initialization, select the merchant's original source directories and accounting terms:

~~~sh
starforge bank-statements serve \
  --directory /private/merchant/accounting \
  --outbox /private/merchant/source/outbox \
  --proof-dir /private/merchant/source/proofs \
  --terms /private/merchant/source/terms.json \
  --port 8448
~~~

Keep the accounting directory outside its source inputs. The original initializer validates the selected source paths and terms before saving them. Subsequent openings use the saved directory and its original configuration.

Use **Customers and statements** in the same service to maintain the original customer references and billing details. In Receivables, save the issuer's document settings and payment instructions, then use the original invoice, receipt and refund records throughout the bank workflows. Customer UUIDs, issued documents and receipt identities continue through the existing writer.

The local service provides these connected desks:

| Desk | Address on the same running service | Work |
| --- | --- | --- |
| Bank reconciliation | /bank-statements/ | Original source intake, complete CAMT page assembly, exact posting parts, correction and account close. |
| Accountant receiving | /bank-statements/accountant-receiving/ | Open complete original account archives, compare editions and retain an independent accountant review. |
| Receivables | /receivables/ | Customer invoices, original payments, Bank receipts, credit/refund controls and cash planning. |
| Customer statements | /customer-statements/ | Original customers, dated balances and account delivery. |
| Payment plans | /payment-plans/ | Original installment schedules and collections. |
| Remittance receiving | /receivables/remittances.html | Receive a complete original remittance CSV and apply its reviewed invoice allocations. |

The same accounting lease covers these views. Open them through the running service; use its existing Stop control or a normal terminal interrupt before another process opens the same accounting directory.

## 4. Save and launch the application in Applications

The installed bank selection includes its source-owned **Bank statement reconciliation** provider. Attach the ready runtime to the existing Runtime workspace:

~~~sh
starforge runtime-workspace init \
  --workspace /private/bank-operator

starforge runtime-workspace attach \
  --workspace /private/bank-operator \
  --runtime /private/bank-runtime \
  --label "Merchant bank"

starforge runtime-workspace serve \
  --workspace /private/bank-operator \
  --port 8465
~~~

Open the printed Runtime workspace address, choose **Applications**, then:

1. Select **Bank statement reconciliation** from the attached runtime.
2. Select the initialized accounting directory.
3. Review and save the application.
4. Start the saved application and choose Open.
5. Continue through its Bank reconciliation, Receivables and customer links.

The source provider retains the selected accounting workspace ID and source configuration. It checks those same identities when the original process acquires the accounting lease and when the managed startup returns its local address.

Reopen the saved application to continue the same customer work after a restart. Use **Stop** on that saved application before starting another application that owns its accounting directory.

## 5. Keep the complete customer handover

A bank close exports the original statement files, full bank transactions and postings, retained reconciliation history, related customer account exports, readable HTML, editable JSON, manifests and the complete TAR. The [operator handover](HANDOVER.md) identifies the selected close, original source and correction files to retain.

The working accounting directory also contains records needed for continued editing. Keep that original directory with its bank-statement originals and saved close files through the existing whole-workspace recovery process. Preserve the selected source inputs with their original source identities.

An installed runtime and a customer accounting directory have separate lifecycles. Runtime upgrade/recovery uses a new runtime directory while the original customer directory keeps its identity and original financial history.

### Receive the bank and accountant workflow in the installed release

Use a committed release containing the complete page assembly and accountant receiving source. Multi-page assembly merged at `c15e2ea80154078886011d792e0aa7be6a5a94b2`; the complete accountant reader is part of that same source lineage. The existing bank selection carries the full accounting component, so its source package includes both workflows with their browser assets and guides.

The receiving engineer follows one merchant period:

| Stage | Installed action | Material carried forward |
| --- | --- | --- |
| Original statement | Receive the actual complete source and select its original account sections. | Exact original bytes, selected account and complete source interpretation. |
| Complete pages | Combine every original page, inspect the period and boundaries, and select the assembled source balances. | Full page review, original import IDs and source-bound balance selection. |
| Cash and close | Match or classify every included booked movement and retain the reviewed balanced close. | Original financial records, retained close, transaction/posting exports and complete account archive. |
| Accountant review | Open the original account archive, compare available editions and retain source-bound notes. | Original closes plus the accountant's separately retained review history. |
| Receiving operator | Export and cold-receive the complete accountant review; reopen the original accounting workspace for continued financial work. | Portable review and original financial workspace with their own existing identities. |

Open the accountant desk from the Bank header. The installed nested command exposes the same reader:

~~~sh
starforge bank-statements accountant help
~~~

The [complete page guide](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/PAGE_ASSEMBLY.md) includes the native `PAGE_ASSEMBLY_RECEIVE.mjs` course against an existing private workspace with original pages and reviewed postings. The [accountant guide](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/accountant-receiving/ACCOUNTANT_RECEIVING.md) supplies the complete browser, CLI, comparison, review export and receiving instructions. Follow the same original operation and output directory when continuing either receiving course.

## 6. Move the source and dependencies to another operator

Use the original runtime transfer after the runtime reports ready. It retains the selected source archive, runtime profile, original lock and required dependency tarballs in a manifest and declared part files.

On the sending host:

~~~sh
starforge runtime-transfer review \
  --runtime /private/bank-runtime

starforge runtime-transfer export \
  --runtime /private/bank-runtime \
  --directory /private/bank-runtime-transfer \
  --cache /private/original-npm-cache

starforge runtime-transfer inspect \
  --directory /private/bank-runtime-transfer --verify
~~~

The default export uses the selected populated cache offline. Add --online when the sender is authorized to retrieve missing public dependency tarballs. An interrupted export reopens its own partial directory and preserves the reviewed source/profile/lock.

Keep manifest.json, every part file it declares and the returned manifest SHA-256 together. On the receiving host, use new private directories:

~~~sh
starforge runtime-transfer receive \
  --directory /private/bank-runtime-receive \
  --manifest /private/received-transfer/manifest.json \
  --sha256 RETURNED_MANIFEST_SHA256 \
  --parts /private/received-transfer

starforge runtime-transfer inspect \
  --directory /private/bank-runtime-receive --verify

starforge runtime-transfer complete \
  --directory /private/bank-runtime-receive

starforge runtime-transfer install \
  --directory /private/bank-runtime-receive \
  --runtime /private/received-bank-runtime
~~~

A complete receive with --parts already finishes its intact cohorts and populates the private cache. The complete command also resumes that same operation when parts arrived separately. receive-part accepts each originally declared part by its index. The installer owns dependency readiness and any required native preparation on the receiving host.

Inspect the received runtime with --load --source, then attach it to the existing Applications workspace and open the retained customer accounting directory. The original transfer's [full guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_TRANSFER.md) covers individual parts, resumed receiving, native headers and recovery.

## 7. Upgrade or recover the installed runtime

Prepare an upgrade beside the existing runtime using the new original archive and its actual hash:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs upgrade \
  --from /private/bank-runtime \
  --dir /private/bank-runtime-next \
  --archive /absolute/next-bank-package.tgz \
  --sha256 NEXT_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /private/bank-runtime-next --load --source

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs compare \
  --before /private/bank-runtime \
  --after /private/bank-runtime-next
~~~

The old runtime remains available. Attach the ready new runtime, stop the previous saved application, then review and start the bank application against the same original accounting directory.

To recover from an existing retained runtime, the original installer accepts recover --from ORIGINAL_RUNTIME --dir NEW_RUNTIME. To recover using a received dependency transfer, use runtime-transfer recover with its original receiver, retained runtime and new destination.

## Release contents and source references

The package manifest maps every included source path to its original Git object, byte count and SHA-256. The selected bank product includes the complete original accounting component, maintained bank receipt parsers, Receivables and remittance sources, bank browser assets, typed clients, distribution/runtime modules and its selected support components.

The maintained source contracts are:

- [Bank source selection](../../stellar/scf-starforge-20261009/distribution/selections/merchant-bank-statements.json).
- [Bank contribution and Applications provider declaration](../../stellar/scf-starforge-20261009/distribution/contributions/merchant-bank-statements.json).
- [Original bank client and request types](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/client.d.ts).
- [Original bank source formats](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/SOURCE_FORMATS.md).
- [Complete financial operating workflow](../merchant-workspace/FINANCIAL_OPERATIONS.md).

## Whole original-file preparation

The installed Bank navigation includes **Statement collections**. The source-owned asset registry includes its original-file model and industrial collection desk. Open several complete original files, preserve a separate interpretation for each, and use the existing financial source editor for their account/statement intake. The full collection can be downloaded and reopened independently.

The native entry point is `starforge bank-statements collection help`. Its `prepare`, `inspect` and `extract` commands receive a complete explicit file manifest, run the original source parser across included files, and recover each exact original in a private create-only directory. See the [complete guide](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/SOURCE_COLLECTIONS.md) for manifest fields and operating commands. The selected bank package already includes the original source parser, domain and complete source-owned asset tree used by this workflow.

## Authenticated agent operation of the same Bank desk

The committed bank selection also includes the existing accounting Merchant MCP provider, its MCP host commands and the typed Bank reconciliation client. Prepare the runtime with its declared mcp feature when using this interface, alongside the original native/schema/openapi/operator selections:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /private/bank-agent-runtime --archive /absolute/returned-bank-package.tgz \
  --sha256 RETURNED_ARCHIVE_SHA256 --native --feature schema --feature openapi --feature mcp --operator
~~~

Use the original merchant-mcp, merchant-mcp-stdio and merchant-mcp-client-config commands to configure the existing accounting workspace alias and its authentication. The installed merchant-accounting-bank-statements command adds complete source inspection, retained original requests, CAMT page assembly, bank transaction decisions, balanced closes and full original file downloads.

The [complete agent guide](../../stellar-forge/mcp-merchant-operator/ACCOUNTING_BANK_STATEMENTS.md) gives exact preparation, recovery and receiving commands. Original Applications and MCP must share the same accounting identity serially: stop its current writer before opening the other interface. This adds no separate account, ledger, parser or payment engine.
