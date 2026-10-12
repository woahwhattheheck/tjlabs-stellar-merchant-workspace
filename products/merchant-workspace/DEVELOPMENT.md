# Merchant commissioning and development guide

TokenJunkieLabs' Stellar merchant workspace connects a useful data service to
Stellar payment access, customer applications and day-to-day operation. A
merchant prepares its source and terms; a buyer approves the request and payment;
the customer receives the complete result and can return for the next period or
source edition. The same product supports deployment, accounting, maintenance
and transfer to another operator.

This chapter gives the developer and receiving engineer a complete route from
customer task to installed service. The [operating guide](OPERATING.md) supplies
the detailed commands for each workflow. The SCF46 Open Track proposal develops
two independent merchant installations using the existing product, with the
fixed funding scope in section 6. The existing implementation and completed
runs form the delivered foundation. The grant packages fund the remaining
customer-specific Stellar integration, deployment, incident response and
technical handover.

The development examples below retain their October 12, 2026 source and result
identities. The earlier architecture baseline was inspected at standalone
commit **1f5809232b5b3ef26cbc5b63c04f4e0dbc8ef2ec**. Select a current complete
release for new work: its archive manifest and `starforge source` output identify
the source actually installed. Each saved customer operation keeps the source
selected when that work began.

## 1. Customer outcome and the role of Stellar

Start with a recurring task whose result someone already needs: an API response
used by an application, a complete data edition entering a report, an imagery
selection used in a study, or a service action reaching fulfillment. Name the
customer application and the decision or work it completes. That choice determines
the required source fields, complete output, refresh cadence and receiving path.

The merchant retains control of its provider access, source selection, public
routes and payment terms. The buyer retains control of its wallet, exact request,
selected payment option and aggregate spending. Both operators can reopen their
saved work. A customer can keep an acquired edition while the merchant prepares
a later source or changes its offer.

### Why this workflow uses Stellar

The product places a native Stellar transfer inside an ordinary HTTP or MCP
resource transaction. Its [x402 buyer][buyer] binds the approved operation to
the offered network, asset, recipient, atomic amount and payment timing. The
[native facilitator][facilitator] uses the official Stellar implementation for
transaction parsing, Soroban simulation, authorization verification, fee signing
and settlement. Operators select their own RPC, account references, fee policy
and merchant configuration.

This arrangement gives an independent service owner a payment path that a
separately operated customer can use through its existing application. The
receiving application keeps the complete source result; the original purchase
keeps its payment identity for ledger reconciliation, fulfillment and accounting.
A subsequent report period or changed source can become another useful purchase
through the same installed workflow.

The proposed ecosystem contribution is the complete operating path around that
native payment: source authoring, explicit buyer spending, complete delivery,
recurring customer use, two facilitator deployments and maintainable receiving
installations. The funded outcome is measured in useful purchases by independent
customers and operating mainnet services. Section 6 fixes the cohort, periods and
engineering needed to reach it.

### Select the actual payment behavior

Use the payment model implemented by the selected service. The existing x402
authorization flow verifies the buyer's authorization, prepares the permitted
result, settles and releases it. The supported upfront flow settles before
fulfillment begins and can deliver a finite stream as it arrives. Merchant and
facilitator policy must allow the advertised timing; the buyer selects that
timing before approval. A settled upfront request can still need output
recovery after an interrupted connection. The original payment and result
records carry those outcomes.

The [MPP product guide][mpp-guide] documents its native Charge implementation and
runtime selection. Keep its original purchaser, spending control and settlement
lifecycle when selecting MPP. A future Session or channel integration needs its
own implemented source and authority model.

### Define the complete useful result

Agree the source and receiving contract before adapting a customer installation.
For a table, preserve keys, types, exact numerical values, units, dates and
missing/null meanings. For a paginated query, retain all pages and continuations
in the selected query. For files and imagery, retain the selected member
inventory and complete bytes. The customer's reviewed selection states any
intentional row, file or time limit.

A saved edition and a fresh live query have different meanings. Reopening the
saved edition uses its acquired result. A new capture or query receives a later
source and keeps its own identity. That distinction lets the customer reproduce
an earlier report and understand what changed in the next one.

## 2. Commission a complete customer workflow

Use the [customer launch playbook](CUSTOMER_LAUNCH.md) to select and start the
customer engagement. The engineering work below carries that task through the
existing source, merchant, buyer, receiving and support workspaces.

### Keep the customer decisions with their operating records

| Decision | What to record | Existing operating record |
| --- | --- | --- |
| Useful customer task | Customer, intended result, receiving application, current method and reason to repeat the work | Merchant profile, saved workflow and recurring customer series |
| Source and permitted use | Provider, source owner, access reference, original edition or query, selected fields/files and applicable source terms | Provider workspace, captured source, immutable review and merchant plan |
| Service and payment | Public HTTP method/path or MCP tool, complete inputs, output scope, network, asset, recipient, price and payment timing | Compiled seller package, selected release and facilitator profile |
| Buyer operation | Exact request, selected payment alternative, wallet reference, aggregate spending limit and result destination | Buyer workspace, original intent/reservation and customer access profile |
| Receiving and maintenance | Receiving host/operator, complete files, source/runtime selection, deployment changes, support destination and recovery procedure | Original customer export, complete profile, support case and installation record |
| Funded adaptation | Customer-specific implementation, contributor ownership, remaining hours and the completed package outcome | Existing grant delivery and implementation case |

For each installation, name the merchant operator, buyer operator and receiving
engineer. Select the actual source credentials and signer references through
their host configuration. The two-merchant and two-buyer milestones count
independent customers by the definitions in section 7.

### Install the selected product and open its real interface

The source product requires Linux, Node.js 22.16 or later, Git and util-linux
`flock`; individual selections declare additional requirements. Keep installed
source/runtime files separate from private merchant and buyer state. The
[product README](README.md), [runtime installer][runtime] and relevant operating
guide provide the selected dependency closure.

From a source checkout, inspect the actual dispatcher:

~~~sh
node stellar/scf-starforge-20261009/distribution/cli.mjs --help
node stellar/scf-starforge-20261009/distribution/cli.mjs registrations
~~~

An installed package uses `starforge` for that dispatcher. Commands launched
inside a prepared runtime use:

~~~sh
starforge runtime-install run --dir /srv/starforge/runtimes/merchant -- COMMAND ARGUMENTS
~~~

Use the returned private URL when opening a workspace. Managed Applications
retains the original process through **Review**, **Save**, **Connect**,
**Review start**, **Start**, **Open** and **Stop**. Its provider-specific guide
defines which source and workspace files to select.

### Author and publish the customer's service

For captured HTTP traffic, the existing complete entry point is:

~~~sh
starforge captured-api init --dir /srv/starforge/state/captured-api \
  --name 'Supplier API'
starforge captured-api open --dir /srv/starforge/state/captured-api --browser-only
~~~

In **Captured API sources**, receive the original HAR and review its operations.
Save the selected path templates, request/response contracts, authorization
references and parameter choices. **Use approved source** opens that saved
source in the merchant form. Set the complete upstream and payment choices,
review exact route prices in the worksheet, then compile and save the merchant
package. Continue through the package's native prepare, stage, select and start
release actions. [Captured API operating instructions][captured-api] carry the
full installation, refresh and receiving workflow.

For GraphQL, open **Applications → GraphQL merchant workspace**, capture the
served schema, choose the permitted query and buyer-variable bounds, and preview
the operation against its configured source. Save and export the project with
its generated buyer client. The selected deployment retains the project
revision, source preview and release generation. Reopen that same project when
the source or terms change.

For complete source products such as OData, IATI or imagery, use their native
source workspace and publication path. The [operating guide](OPERATING.md)
connects these products to the same merchant/customer lifecycle. Preserve their
typed results, source dimensions and full output inventories while adapting
the customer's receiving application.

### Make the result usable by the buyer

Select the real customer entry point for the service being sold:

| Customer task | Existing entry point | Completion |
| --- | --- | --- |
| Use a purchased API allowance | **Applications → API-pass customer**, `starforge api-pass-workspace` | Retained access, original purchase/request, allowance state and complete response opened by the customer |
| Run selected paid requests under one spending policy | **Applications → Request collections**, `starforge buyer-collections-workspace` | Each selected intent has its own payment/output outcome and complete customer files |
| Use a complete data edition in analysis | Native dataset customer and Analysis | Selected pages/files received, typed import, useful saved query/report/workbook and reopened result |
| Receive a saved source or merchant project | Product-specific customer export and receiving command | Complete original files and history opened on the receiving installation |
| Continue the service into accounts | [Merchant financial operations](FINANCIAL_OPERATIONS.md) | Original settlement reconciled, commercial documents and receipts applied, and accountant receiving continued |

A buyer reviews the actual request and current payment option before native
execution. Keep its original approval/reservation owner and signer integration.
After execution, open both the useful output and the original payment record.
A response interrupted after settlement continues through that purchase's
recovery operation.

For an API-pass customer, select the original Buyer workspace, Buyer state,
Inbox, Python executable and installed source in its native configuration.
The [customer operating guide][api-customer] supplies the complete command;
the configured browser and MCP client then share that customer's profiles,
purchase reviews, requests and received results.

### Commission the second useful period

The existing [Recurring customer work][series] product makes repeat business
part of the saved workflow. In the merchant Console, open
**Workflows → Recurring customer work**:

1. Select the customer's complete native workflow, including the source review,
   publication and customer-export steps it needs.
2. Save a series with the customer, useful task, selected workflow revision,
   complete default inputs and calendar.
3. Choose **New period or source edition**. Enter a stable cycle key, complete
   dates, due date, actual source reference and the reason this work is useful.
4. Use **Review complete cycle** and **Save reviewed cycle** to retain the full
   native requests and input mappings. **Review first start** binds the saved
   work to the currently configured host.
5. Choose **Open original run and customer receiving**. Continue its native
   work and use **Prepare customer** to receive the complete exported files.
6. For the next useful period or changed source, prepare another explicit cycle.
   The earlier inputs, results and customer files remain in the series history.

Manual, daily, weekly and monthly calendars propose complete periods; the
operator starts each cycle. The terminal command is
`starforge merchant-workflow-series`; the typed
`MerchantWorkflowSeriesClient` operates the same saved records. These are
existing interfaces, including their complete input limits and restart behavior,
documented in the series guide.

### Transfer a customer who can continue working

Use the native customer export for the chosen source and its complete profile
or workspace handover. A receiving engineer opens the delivered application
files, reopens the saved source/history and performs the agreed next task.
For recurring work, `merchant-workflow-series capture`, `receive` and
`reopen` carry the selected complete customers and original series history.
A planned cycle can be reviewed on the receiving host; an active run uses its
original explicit handover operation.

Commercial charging follows the customer's actual transaction. A paid request
keeps its native transfer; an API allowance keeps its purchased order and
consumption; an implementation invoice keeps its agreed scope, dated balance
and receipts. The [financial chapter](FINANCIAL_OPERATIONS.md) joins settlement,
invoices, credits, payment plans and Xero receiving in the same accounting
workspace. A second operator can therefore continue the customer service and
its financial work from the delivered state.

## 3. Architecture and ownership of operating state

~~~mermaid
flowchart TB
    MW["Merchant workspace"] -->|"Source and terms"| S["Paid HTTP or MCP service"]
    BW["Buyer workspace"] -->|"Approved request"| S
    S -->|"Native payment"| P["Stellar SDK and facilitator"]
    P -->|"Settlement"| L["Stellar ledger"]
    S -->|"Complete result"| C["Customer application"]
    S -->|"Delivery event"| F["Fulfillment and accounting"]
    L --> R["Transfer reconciliation"]
    R --> BW
    R --> F
~~~

The merchant workspace owns source selections, saved reviews, published packages
and release generations. The buyer workspace owns selected offers, requests,
approvals, attempts and acquired outputs. Public endpoints expose the merchant's
approved operations. Private administration and operating state remain on the
operators' configured hosts.

| Layer | Maintained source | Responsibility and retained identity |
| --- | --- | --- |
| Source authoring and merchant execution | [Seller SDK](../../stellar/scf-starforge-20261009/sf30-seller-sdk/README.md), [seller](../../stellar/scf-starforge-20261009/sf30-seller-sdk/seller.mjs), [resource server](../../stellar/scf-starforge-20261009/sf30-seller-sdk/resource-server.mjs) | The original provider workspace, source edition/query, reviewed routes, complete payment alternatives and compiled merchant package. |
| Exact request and buyer authority | [Buyer transport](../../stellar/scf-starforge-20261009/sf31-buyer-client/README.md), [spend governor](../../stellar/scf-starforge-20261009/sf36-spend-governor), [native buyer operator](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/README.md) | Endpoint, method or tool, arguments/body, selected native requirement, approval/reservation owner, original attempt and complete response. |
| Native payment and reconciliation | [Native facilitator](../../stellar/scf-starforge-20261009/native-facilitator), [native buyer signer](../../stellar/scf-starforge-20261009/sf103-native-buyer-signer), [RPC transfer reconciliation](../../stellar/scf-starforge-20261009/sf86-rpc-transfer-reconcile) | Scheme/network/asset/recipient/atomic amount, signer reference, facilitator outcome and independently observed transaction identity. |
| Complete data receiving | [Dataset delivery](../../stellar/scf-starforge-20261009/sf100-buyer-dataset-delivery), [Python buyer and Analysis](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python), [retained collections](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/collections/README.md) | Complete parent result, original pages/files, source meaning, saved queries, reviewed reports, workbooks and received editions. |
| Merchant fulfillment and books | [Delivery outbox](../../stellar/scf-starforge-20261009/sf98-merchant-delivery/README.md), [settlement accounting](../../stellar/scf-starforge-20261009/merchant-settlement-accounting) | Original delivery event, destination acknowledgment, order/accounting state and subsequent reconciliation. |
| Runtime and operator lifecycle | [Runtime installation](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md), [Applications](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/README.md), [source providers](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/APPLICATION_PROVIDERS.md) | Selected source archive, dependency profile/lock, private workspace, reviewed launch inputs, original child process and operation. |
| Incident response and recovery | [Incident sources](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/INCIDENT_SOURCES.md), [merchant recovery](../../stellar/scf-starforge-20261009/sf101-merchant-recovery/README.md) | Capture history, notification attempts, acknowledgment, original case, quiesced backup, receiving state and later-operation reconciliation. |


### Preserve the source's meaning

The provider adapter owns the input contract and interpretation of the result.
Carry its native representation through source review, merchant publication and
customer receiving. A client's output serializer, pagination helper or analytical
projection must retain the fields that make the selected task useful.

The [complete OData collection][odata-collection] is an implemented example. It
retains the full cursor chain and declared entity keys, preserves original scalar
text, and projects typed JSON or a CSV/state representation into Analysis. GUID
and temporal key identity are normalized for duplicate detection while original
cells stay readable. Its receiving projection checks the actual row, mapped-output
and source-document limits before publication.

The customer's whole result owns its component pages and files. Recovery reopens
that parent and continues its remaining source or delivery work. A received report
can therefore be traced back to its selected collection and reopened with the
same source meanings.

### Keep approval, settlement and delivery connected

The buyer's approval binds the actual operation and selected payment requirement,
including its complete accepted terms and replayable request-body identity.
The configured reservation owner controls aggregate spending. Native signing
consumes that reviewed selection.

The saved purchase connects three outcomes: what the buyer approved, what
settled on the selected ledger, and what useful output arrived. Read the original
attempt after an uncertain reply. A settled transfer with unfinished delivery
continues through the existing entitlement and output recovery.

The delivery outbox retains the original event and destination acknowledgment.
A receiving service uses that event identity when an attempt is repeated.
Reconciliation keeps the merchant/buyer operation connected to its fulfillment,
accounting and recovered output.

### Keep a runtime replaceable and the customer state recoverable

Configuration names the environment or secret-manager references supplied by
the receiving host. Runtime/source directories stay separate from private
merchant, buyer and customer workspaces.

The managed lifecycle reviews executable, arguments, source, workspace and
environment inputs before launching the selected process. Applications reads
that process's original startup announcement and actual listener. Terminal
purchase approvals remain in the configured terminal workflow.

For an upgrade, install the selected complete release in a fresh runtime
directory and attach the existing state through the product's supported
configuration. Stop or drain the original owner so active source, payment and
delivery work can finish or enter its native recovery. Use the complete export
or quiesced backup contract for receiving, then reconcile work performed after
the backup point.

## 4. Develop and release a complete contribution

Begin with the customer's selected source workspace and native APIs. Extend the
existing source, review, save, operate, export and receive lifecycle. A browser,
CLI or MCP integration acts on the same saved product and its existing operation
identities.

The maintained [contribution contract][contributions] registers commands, help,
exports, runtime dependencies, browser assets and Application providers in
`distribution/contributions/<provider>.json`. Extend the provider's existing
declaration and its dependency/browser manifests. The selected builder follows
those declarations to package the complete source needed by the installed product.

### Implement the producer and receiver together

| Change being made | Complete implementation |
| --- | --- |
| Add or extend a source adapter | Original source acquisition and continuation; complete input contract; typed edition; meaningful source review; native merchant compilation; full customer result and reopen |
| Add an Application entry | Versioned provider contract, native preparation, source and private-directory selection, exact subcommand selector, startup reader, original stop/drain and reopening |
| Add a recurring customer operation | Existing complete workflow, complete period/source inputs, saved cycle review, original native execution, customer export and second-operator receiving |
| Extend paid-result delivery | Selected requirement/body identity, original buyer reservation, complete response representation, native transaction reconciliation and interrupted-result recovery |
| Extend financial receiving | Original settlement or issued document, exact amount/asset/date meaning, reviewed destination mapping, returned provider identity and complete customer/accountant state |

Applications providers default-export the contract in
[APPLICATION_PROVIDERS.md][providers]. Preparation returns the native arguments,
input identities and required private directories. When several subcommands
share a dispatcher, the request selector names the exact supported command.
The startup reader preserves the original observer's context and line limits.

The IATI contribution shows this pattern. Its
`distribution/contributions/iati.json` registers `dataset-iati`, typed client
exports and its Applications provider. The `iati-operator` selection includes
complete IATI/XML source, browser assets, source MCP, installer and release
support. The installed product and direct CLI use the same workspace and dataset
engine.

Use a restrained industrial interface: descriptive labels, conventional tables,
legible amounts and states, and explicit source/revision selections. Show the
result the customer needs and the action available on the saved operation.
Source details, launch configuration and file hashes belong in the engineering
views where they support a concrete receiving or maintenance decision.

### Select one complete release

Inspect the actual installed source and command registrations:

~~~sh
starforge source
starforge registrations
starforge registrations --command dataset
~~~

The [pinned builder][building] reads one Git commit, selected components, source
contributions, static imports and browser mappings. It produces the archive and
manifest with source paths, Git blobs, file digests and byte counts. The complete merchant
distribution includes this guide and the customer launch playbook under
`source/products/merchant-workspace/`. Named product selections retain the
components, support files and guides declared by their own recipe and source
contributions.

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/product-checkout \
  --ref FULL_SELECTED_COMMIT \
  --out /absolute/private/merchant-release
~~~

Choose the product's documented `--selection` when building a named installed
edition, such as `iati-operator` or `merchant-receivables-xero`. The product
[README](README.md) and its receiving guide define that selection and dependency
features. Install with the original runtime installer and package versions
recorded by the selected source.

Preserve an interrupted build's selected source, output directory and manifest.
[BUILDING.md][building] describes complete-file reconciliation and packaging
recovery. An active producer keeps the source already selected for its operation.

### Finish the changed customer journey

After a material integration change, operate the actual producer, buyer and
receiving application through the changed behavior and its relevant recovery
case. Use the complete installed product and selected customer inputs. Keep the
result files, useful outcome and original operation so the receiving engineer
can continue from them. Existing focused source checks can diagnose a specific
remaining implementation defect.

## 5. Existing delivery foundation and receiving examples

The retained development baseline on October 12 records eighteen distinct team-operated
testnet purchases totaling **411,000 stroops / 0.0411 native XLM**, with fees
recorded separately. Section 6's independent-customer milestones use their own
cohort and observation windows.

Two completed development operations illustrate the whole-result boundary.
The Queens HPD selection acquired all 144 rows as pages of 100 and 44, each
associated with a 10,000-stroop native testnet transfer. The paid MySQL query
acquired 100 rows, 14 columns and all 53,468 bytes for 50,000 stroops. That
query's retained result SHA-256 is
`4c22f8a26d48156c3e07543328b62ca6f993ce60856166d6805dc0660d9acb8d`;
its testnet transaction is
`50d61d1102bfcf960af44171e5248e0899ed6d99cec1951a62075f9a65a6cbed`,
ledger 5,145,195, completed October 11 at 20:12:58 UTC. Its native purchase and
complete output were reopened in another directory.

The completed OData customer operation used the original five retained live envelopes
containing **830 Northwind Orders**. It completed on October 12 at **12:45:14 UTC**
through the original live-service collection, native Analysis import and saved SQL,
the **21-country** summary, published report and two-sheet workbook, complete
workspace transfer, independent workbook receiving, and reconstruction of the
original collection from its analytical source. All twelve original native
Analysis steps completed in the same customer operation.

The accepted source closure contains 827 selected files, with canonical source
**ab30feff66a1a38ab60fe86f21e2e50ea683d0bc** and the original reviewed caller
corrections at upstream **f46a9797a2c5803072b8fdcb49c47615dbc8280b**. The
original operation keeps **677ba67611b869daed454d689ddc0201ae7a4654** as its
journal lineage; its retained source-selection record binds the actual complete
corrected source bytes.

The completed customer edition is **1,523,504 bytes / 16 members**, SHA-256
`6e4fa8ba14bdcf28984be8d172fd3eb66982a698c2e8b97ef09098f691d12582`.
It preserves all thirteen original native output members and includes the
selected receiving source and opening instructions. The collection manifest is
`f811529bf906eb890b6654839a5ec1d201f6c71fa79a752745675caf29cca994`;
the Analysis source is
`c680c6239f3109388a55ab3f75eb47674fd266199d576d445f9eb8817b72bd88`.
The original [completed operation](https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791809822934779?thread_ts=1791764617.053699)
retains the full output identities and receiving results. These analytical
results extend the completed customer capability; the eighteen-purchase
testnet baseline above retains its original purchase accounting.

The [complete live comparison](../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/COLLECTION_COMPARISONS.md)
extends those original collections with declared-key before/after comparison,
explicit source/null/selection/type changes, four review scopes, and complete
reviewed analytical editions. It receives both original source collections with
every saved review and uses the same native workspace backup/restore owner.

The [customer runner guide][odata-customer] describes the complete packet and
native receiving operation. The
command below assumes that packet and the selected source closure have already
been received, together with Node 24, Python and the original openpyxl runtime:

~~~sh
python3 -B SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/examples/collection-customer.py \
  --checkout SOURCE \
  --packet ORIGINAL_PACKET_DIRECTORY \
  --output ONE_PRIVATE_OPERATION_DIRECTORY \
  --node ACTUAL_NODE24_EXECUTABLE \
  --source-ref 677ba67611b869daed454d689ddc0201ae7a4654
~~~

Repeat that exact command with `--resume` to continue an interrupted
operation. Its guide includes the original inputs, module identities, native
phases, saved-query/workbook semantics and complete output inventory. The
first actual restore receipt and final package identity are retained so a
completed receive can be reconciled after an interrupted parent process.

### Aid-finance publisher review and full customer receiving

The full IATI product is adopted from upstream commit
**c5348b13834012b41c5b40573bc0c390c4226efc**, including both complete public
publisher inputs, the original runtime selection and customer metadata
retention. It belongs to the existing delivery foundation.

Its [complete operation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/COMPLETE.md)
connects the committed source builder and runtime installer to all three native
dataset editions, exact financial reconciliation, named portfolio revisions,
source comparison and full report/portfolio export. It then operates the
original saved Applications through the real browser, source MCP and CLI,
receives the complete history into another workspace, reopens both sides and
packages the complete customer archive. The original result retains the installed
source and every output identity.

| Included original publisher | Source and retained attribution |
| --- | --- |
| AidData Nigeria AIMS, 2016 XML edition | Complete 309,331-byte IATI 2.03 file; original release citation, publication context and ODC-By notice. |
| Transparency International, XML generated April 2, 2026 | Complete 131,359-byte IATI 2.03 file acquired October 12, 2026; unchanged 337-byte official metadata, CC-BY identifier, full source provenance and notice. |

The first publisher carries reported transactions and the second carries
reported budgets. Native parsing and the original report determine their full
activity and financial results. The workflow retains the source dimensions and
exact amounts throughout query, review, comparison and receiving. The
[domain model](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/DOMAIN.md) documents the source-backed
interpretation.

A selected operation keeps its existing input, runtime and output directory
through recovery. The two publisher operations use separate IDs/workspaces and
run sequentially in the owning foreground. Their complete customer ZIPs contain
the runtime, original publisher and metadata, final reviewed portfolio/report,
native merchant files and full handover guides.

## 6. Fixed SCF46 delivery scope

The selected Open Track proposal requests **$38,000 equivalent in XLM for 400 future
delivery hours over 150 days from actual award acceptance**, using the $95/hour
planning assumption. It has six packages in three delivery windows.
The [original costed scenario][budget] retains the underlying package selection.
The architecture above is the application-time design; each package implements
and operates the selected customer's deployment.

| Package and window | Hours / cost | Concrete future engineering | Acceptance outcome |
| --- | --- | --- | --- |
| T1 merchant-resource integration, days 1–30 | 80 / $7,600 | Connect two selected merchants' actual source/runtime and consumer mappings, provider access, typed inputs/output, public routes and native payment terms. | Each independent merchant operates one agreed HTTP or MCP service on its own host; the buyer opens the complete useful result in its receiving application. |
| T1 authority and handover, days 1–30 | 40 / $3,800 | Integrate actual source/terms change or withdrawal, receiver configuration and installation-specific recovery. | A second accountable operator reopens each installation, makes the agreed change or withdrawal, and can still use output previously acquired under its original terms. |
| T2 provider and ledger deployment, days 31–90 | 70 / $6,650 | Register and integrate the same useful operation with two independently operated facilitators and the customer's buyer/ledger owner. | Two independent buyers complete at least ten useful testnet purchases during seven consecutive days ending by day 90, with actual provider identity, transfer and complete output retained. |
| T2 deployed threat response, days 31–90 | 50 / $4,750 | Implement deployment-specific threat assessment, monitoring, notifications, assigned response and material fixes. | Operate interrupted-settled-purchase and merchant-delivery-failure cases, then recover useful output and reopen the original incident. |
| T3 mainnet rollout, days 91–150 | 90 / $8,550 | Integrate both production hosts, actual network/asset/account configuration, recurring task, controlled release and rollback. | Two merchants operate on mainnet; two independent buyers complete at least thirty useful purchases during fourteen consecutive days ending by day 150, and both return for a distinct purchase on another day. |
| T3 production recovery and handover, days 91–150 | 70 / $6,650 | Complete customer-specific supervision, private off-host retention, key rotation, receiving-host restore and reconciliation after the backup point. | An authorized receiving engineer restores the original state/files, measures recovery, reconciles subsequent operations and completes an independent maintainer's support case. |
| **Total** | **400 / $38,000** | **Two merchants, two buyers, two facilitators and their complete useful workflow.** | **Independently maintainable mainnet installations.** |

The allocation is 320 engineering hours plus 80 integration/handover hours:
96 + 24 in T1, 96 + 24 in T2, and 128 + 32 in T3. The three delivery windows
cost $11,400, $11,400 and $15,200. Commercial sales, routine operations and
purchased usage stay in their own business records. The usage targets carry
no purchase subsidy. Planned hosted Actions and incremental service reserve
are both $0.

SCF's published four payments are 10%, 20%, 30% and 40% of the award:
$3,800 / $7,600 / $11,400 / $15,200 in this request's USD-equivalent forecast.
Actual XLM disbursement follows the applicable award terms. The
[issuer's budget and deliverable guidance][scf-budget] sets the three-tranche
structure and requires each completion form within 90 calendar days of receiving
the previous payment. Award acceptance supplies this plan's actual day zero;
customer access, contributor availability and payment receipts are entered into
the dated implementation.

Before award and at each customer scope decision, reconcile completed source
against these same six packages. Assign a performed adaptation once to its
grant package or separately commissioned workorder. Keep the approved source,
scope, contributor ownership and completion with that original record.

## 7. Operate the installed service and measure useful adoption

A commissioning operation uses the actual installed source, provider, selected
terms, signer/budget owner, merchant, customer application and received output.
The expected result comes from the selected source and customer task. Complete
the changed customer journey and the relevant deployment recovery case on that
same installation.

| Operation | Useful outcome | Continue after interruption |
| --- | --- | --- |
| Source and terms review | Reopened source, typed inputs/output, complete payment alternatives, actual preview and saved merchant generation | Resume the saved review; a changed source, request or offer receives its next explicit review |
| Complete acquisition and receiving | Every selected page/file received; source keys, amounts, units and periods retained; result used in the customer's application | Reopen the original parent and its unfinished members or continuations |
| Native purchase | Approved intent connected to its independently observed transfer and complete useful result, with network/asset/recipient/amount and fees retained | Read the original attempt, reconcile payment and continue its unfinished delivery |
| Source/terms change or withdrawal | Receiving operator applies the agreed change; current service reflects that generation; earlier acquired output remains usable | Reopen the saved operation and release through the original stop/drain lifecycle |
| Merchant delivery failure | Failed destination event is recovered and acknowledged; its resulting order/accounting state can be used | Resume the same delivery event and reconcile original financial and fulfillment state |
| Deployed incident response | Agreed interruption and delivery-failure cases reach the configured notification, assigned operator and recovered customer task | Reopen the original case; retain outstanding work and time to useful recovered output |
| Receiving-host restoration | Complete export/backup opens at the receiving destination; source/results/support history and later operations reconcile | Resume the original receiving journal and restore inventory, then continue the customer's maintenance task |

Use the source's existing targeted checks when they resolve a specific defect in
this operation. Retain the accepted native outputs for the source they exercised.

### Measure distinct customers and complete tasks

Count an independent organization or person once across its clients and wallets.
A completed purchase joins a distinct approved intent, an independently observed
native transfer and the complete useful output. Deduplicate transaction identity
within its network, and keep exact native amounts and fees by asset.

Also report the useful customer task above those purchases: the selected report,
whole dataset, imagery delivery or fulfilled order. A task can contain several
pages, native calls or transfers. Preserve that task's original parent, complete
result and receiving history when reporting its purchases.

For each dated cohort, retain attempted and completed purchases, started and
completed parent datasets/files, returning buyers, complete customer tasks and
accepted handovers. Keep partial, unresolved, canceled and refunded outcomes in
the same cohort and carry required fulfillment state. Payment, output delivery
and recovery retain their actual clocks.

A returning buyer completes another distinct useful task on another day. Record
the later period, fresh source query or order that made the purchase useful. The
existing [customer series][series] preserves those periods and complete native
inputs through the original workflow and receiving application.

For a customer who previously performed this task, record the prior method and
active effort when available, the installed task's full result, manual
corrections and receiving effort. Compare the same source, input/output selection
and period. This gives the customer an understandable account of the work the
service takes off their plate.

### Assign the remaining funded implementation

The existing product supplies the foundation. Each funded customer deployment
selects the actual source, merchant host, buyer host, facilitator, receiving
application and integration work required by its six-package roadmap.

Keep performed adaptation with its customer and original workorder. When a
customer-specific change is already complete before award, reflect that in the
remaining package scope and hours before the next submission. The deployment
plan carries a concrete task, accountable operator and usable result for each
installation.

## 8. Technical handover and ongoing ownership

A complete handover equips another engineer to operate the same customer service.
It includes the selected source archive and manifest, dependency selection,
authorized configuration references, complete state export, acquired results,
release history and recovery procedure. The product's native export supplies
those members under the customer's selected scope.

The receiving engineer opens the customer files in their intended application,
reopens the source and operating history, and completes an agreed maintenance
task. That task can be the next customer period, a source or terms change,
recovery of an interrupted result, rotation of the receiving host's configured
access, or restore and reconciliation of a backup. Keep the performed task and
useful result with the same commissioning case.

| Responsibility | Ongoing work |
| --- | --- |
| Merchant operator | Source access, published routes and terms, deployment releases, delivered customer result and assigned incident response |
| Buyer operator | Exact requests, selected wallet and spending policy, original purchases, acquired outputs and task recurrence |
| Receiving engineer | Installed source/runtime, complete transferred state, host-specific configuration, maintenance and restoration |
| Component maintainer | Source-owned interface, runtime contribution, customer receiving behavior and fixes in that component |
| Project owner | Agreed customer scope, delivery commitments, grant-package allocation and release decisions |

Bryce Muhlnickel is accountable for the project's artifacts, statements,
customer commitments and delivery. Component guides and repository history
retain the maintainers responsible for the original source and operating
workflows. The performed commissioning and receiving work makes the selected
installation maintainable by its next operator.

This chapter connects architecture, developer entry points, interfaces, existing
results and the fixed Stellar rollout plan in the project's unified development
documentation. Continue updating the same guide as the product and customer
installations advance. Each selected archive retains the version delivered to
that customer.

[contributions]: ../../stellar/scf-starforge-20261009/distribution/CONTRIBUTIONS.md
[providers]: ../../stellar/scf-starforge-20261009/distribution/runtime-workspace/APPLICATION_PROVIDERS.md
[runtime]: ../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md
[building]: ../../stellar/scf-starforge-20261009/distribution/BUILDING.md
[odata-collection]: https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/ab30feff66a1a38ab60fe86f21e2e50ea683d0bc/stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/COLLECTIONS.md
[odata-customer]: https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/e37a3b0649a16b9c5814097ef7b02c5893e4c327/stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/examples/COLLECTION_CUSTOMER.md
[budget]: https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/2761cc9a44d511959e224dc7ee5998aa13df7e8e/stellar/scf_2026/sf47_budget_model/sf10_current_candidate.json
[scf-open]: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/open-track
[scf-budget]: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines

[buyer]: ../../stellar/scf-starforge-20261009/sf31-buyer-client/README.md
[facilitator]: ../../stellar/scf-starforge-20261009/native-facilitator/README.md
[mpp-guide]: ../mpp-workspace/README.md
[captured-api]: ../captured-api/OPERATING.md
[api-customer]: ../api-customer/OPERATING.md
[series]: ../../stellar-forge/mcp-merchant-operator/console/WORKFLOW_SERIES.md
