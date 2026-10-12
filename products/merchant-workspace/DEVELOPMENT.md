# Development architecture and delivery plan

This is the unified development guide for TokenJunkieLabs' Stellar merchant
workspace and the **Stellar Discovery Trust Layer** SCF46 proposal. It connects
the existing implementation, source ownership, user interfaces, future work,
native acceptance operations and customer handover in one place. The
[operator guide](OPERATING.md) gives the full commands for day-to-day use.

The development baseline below was inspected on October 12, 2026 against
standalone commit **1f5809232b5b3ef26cbc5b63c04f4e0dbc8ef2ec**. Completed upstream
changes that have a newer selection are identified by their own immutable source
links. A built archive's manifest is the authority for the source actually
installed on a host.

## 1. Product outcome and engineering boundary

A merchant selects one resource, its access rules and payment terms. An
independent buyer approves the exact HTTP request or MCP tool call, controls its
wallet and aggregate spending, and receives the complete useful output. The
operating product carries those decisions through source acquisition, Stellar
settlement, result delivery, fulfillment or accounting, and recovery.

The practical unit of implementation is one customer's recurring task. It can
be a complete data edition consumed by an existing report, an approved live
query entering an analytical application, a selected image collection, or an
order action reaching fulfillment. Its commissioning record names the resource
owner, buyer, receiving engineer, original source rights, exact input/output,
freshness trigger, host, payment authority and acceptance owner.

Existing Stellar SDKs and configured facilitators perform their native signing,
verification and settlement. The product composes those services with the
customer's source and receiving application. It retains the native x402 and MPP
Charge models in their respective implementations. A Session/channel integration
requires its own source and authority model.

The SCF request develops the selected independent installations using the
delivered foundation. Work completed before award belongs to that foundation.
The funded roadmap in section 6 assigns only the remaining customer-specific
Stellar integration, deployment, threat response and technical handover.

## 2. Architecture and control of state

~~~mermaid
flowchart TB
    MW["Private merchant workspace"] -->|"Reviewed source and terms"| S["Paid HTTP or MCP service"]
    BW["Private buyer workspace"] -->|"Approved exact request"| S
    S -->|"Native payment flow"| P["Stellar SDK and facilitator"]
    P -->|"Settlement"| L["Stellar ledger"]
    S -->|"Complete original output"| C["Buyer application and receiving"]
    BW -->|"Selected task and destination"| C
    S -->|"Original delivery event"| F["Fulfillment and accounting"]
    L --> R["Transfer reconciliation"]
    R --> BW
    R --> F
~~~

The merchant workspace owns source selection, immutable reviews, published
packages and release generations. The buyer workspace owns selected offers,
exact requests, approvals, attempts and acquired outputs. Their services run on
their operators' hosts. Public resource endpoints expose approved operations;
administration and operating state use the private interfaces described by each
product's original launch guide.

| Layer | Maintained source | Responsibility and retained identity |
| --- | --- | --- |
| Source authoring and merchant execution | [Seller SDK](../../stellar/scf-starforge-20261009/sf30-seller-sdk/README.md), [seller](../../stellar/scf-starforge-20261009/sf30-seller-sdk/seller.mjs), [resource server](../../stellar/scf-starforge-20261009/sf30-seller-sdk/resource-server.mjs) | The original provider workspace, source edition/query, reviewed routes, complete payment alternatives and compiled merchant package. |
| Exact request and buyer authority | [Buyer transport](../../stellar/scf-starforge-20261009/sf31-buyer-client/README.md), [spend governor](../../stellar/scf-starforge-20261009/sf36-spend-governor), [native buyer operator](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/README.md) | Endpoint, method or tool, arguments/body, selected native requirement, approval/reservation owner, original attempt and complete response. |
| Native payment and reconciliation | [Native facilitator](../../stellar/scf-starforge-20261009/native-facilitator), [native buyer signer](../../stellar/scf-starforge-20261009/sf103-native-buyer-signer), [RPC transfer reconciliation](../../stellar/scf-starforge-20261009/sf86-rpc-transfer-reconcile) | Scheme/network/asset/recipient/atomic amount, signer reference, facilitator outcome and independently observed transaction identity. |
| Complete data receiving | [Dataset delivery](../../stellar/scf-starforge-20261009/sf100-buyer-dataset-delivery), [Python buyer and Analysis](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python), [retained collections](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/collections/README.md) | Complete parent result, original pages/files, source meaning, saved queries, reviewed reports, workbooks and received editions. |
| Merchant fulfillment and books | [Delivery outbox](../../stellar/scf-starforge-20261009/sf98-merchant-delivery/README.md), [settlement accounting](../../stellar/scf-starforge-20261009/merchant-settlement-accounting) | Original delivery event, destination acknowledgment, order/accounting state and subsequent reconciliation. |
| Runtime and operator lifecycle | [Runtime installation](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md), [Applications](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/README.md), [source providers](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/APPLICATION_PROVIDERS.md) | Selected source archive, dependency profile/lock, private workspace, reviewed launch inputs, original child process and operation. |
| Incident response and recovery | [Incident sources](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/INCIDENT_SOURCES.md), [merchant recovery](../../stellar/scf-starforge-20261009/sf101-merchant-recovery/README.md) | Capture history, notification attempts, acknowledgment, original case, quiesced backup, receiving state and later-operation reconciliation. |

### Source meaning survives the payment path

The source adapter owns the input contract and the meaning of the result.
A saved edition retains the acquired original; a live query can observe a later
state. The implementation must preserve that distinction when an operator
refreshes a source or a customer returns.

For tabular data, retain declared keys, field types, exact numeric spellings,
units, periods and missing/null states. For pagination, bind the complete
ordered requests and continuations to the selected query. For files and imagery,
retain the complete declared member inventory, original asset identities and
selected bytes. A limit or intentionally smaller selection appears in the
customer's reviewed scope.

The complete OData collection is a concrete implementation of this boundary.
Its [current collection source and contract][odata-collection] retain the full
cursor chain and declared entity keys, preserve original scalar text, and
project either typed JSON or a CSV/state representation into the native Analysis
receiver. GUID and temporal key identity are normalized for duplicate detection
while original source cells remain readable. Projection checks cover the
receiver's row, mapped-output and original-document limits before publication.

### Request approval and financial outcome

The buyer's original approval binds the actual operation and payment option.
The transport exposes the full accepted requirement and request-body identity;
the caller's existing reservation/budget owner controls aggregate spending.
Native signer integration consumes that reviewed selection. A changed source,
request or requirement returns to the original review operation.

A seller's settlement header, an independently observed transfer, and a
complete useful result are different records. Keep the original attempt and
read each actual outcome before continuing. A lost reply can leave a settled
transfer with unfinished delivery. The original recovery path resolves that
unfinished step using the retained intent, transaction and entitlement.

The fulfillment outbox similarly retains the original event and destination
acknowledgment. A receiving service uses the existing event identity when an
attempt is repeated. Financial reconciliation and output recovery remain
attached to the same merchant/buyer operation.

### Private runtime and recoverable state

Keep source/runtime directories separate from mutable merchant and buyer
workspaces. Configuration selects environment or secret-manager references.
Each receiving host supplies its own authorized access and signer references.

The original managed lifecycle reviews the executable, arguments, source,
workspace and environment inputs, then starts the selected native process.
Applications' private URL reader binds the original startup announcement to
that operation and its actual listener. Native terminal approval remains with
terminal applications.

An upgrade selects a complete new runtime and attaches the existing workspace
through the product's original configuration. Stop/drain must retain active
source and delivery work until the original owners close. A backup is taken
under the product's complete export or quiesced recovery contract; the receiving
engineer restores it into a new private destination and reconciles later work.

## 3. User interfaces and developer entry points

The browser, CLI and MCP interfaces act on the same original saved product.
An integration should expose its native source selection and operation history
through those existing interfaces.

| User task | Existing interface | Development seam |
| --- | --- | --- |
| Select/install source and operate a managed application | Runtime workspace and Applications: Review, Save, Connect, Review Start, Start, Open, Stop and recovery | Source-owned provider catalog, native preparation, exact request selector and original startup reader. |
| Author a supplier API or query product | [Captured API](../captured-api/OPERATING.md), [GraphQL](../../stellar/scf-starforge-20261009/sf105-subquery-graphql-merchant/workspace/README.md), provider workspace | Native capture/schema intake, immutable operation review, complete plan, actual preview, merchant compilation and release. |
| Review aid-finance publishers and deliver the portfolio | [IATI console, CLI, Applications and typed client](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/OPERATIONS.md), original source-workspace MCP | Complete original XML and native editions, exact grouped finance, named review revisions, retained comparisons and independent portfolio/customer receiving. |
| Acquire and use complete data | Buyer dataset workspace, source-specific customer client, Analysis | Original purchase/request identities, complete parent result, typed receiving and saved analytical work. |
| Change source or price | Native source review and [merchant economics](../merchant-economics/OPERATING.md) | New reviewed source/terms generation, exact route allocation and original prior-customer output. |
| Resolve an incident or hand over service | Incident desk, retained case and native recovery/export commands | Last useful source capture, original financial/delivery event, acknowledgment and receiving-host continuation. |

Use a restrained industrial interface: descriptive labels, conventional tables,
legible numeric and state columns, and explicit source/revision selections.
Show the useful result and the action available on its actual saved operation.
A user changing a source or spending decision must see the relevant request,
terms and result scope. Technical hashes and launch details belong in the
associated source/operation view where they help the receiving engineer.

The [complete operating guide](OPERATING.md) already connects source intake,
merchant compilation, native customer operation, deployment and handover.
The [MPP workspace guide](../mpp-workspace/README.md),
[imagery guide](../stac-workspace/OPERATING.md), and
[grant purchase reviewer](../grant-reviewer/OPERATING.md) carry their original
product-specific browser and receiving flows.

## 4. Implement a complete source contribution

Begin with the original provider workspace and its native APIs. Follow the
existing source/review/save/operate/export/receive lifecycle, including saved
identities after interruption. An additional client or Application adapter
calls that implementation.

The maintained [contribution contract][contributions] places commands, help,
exports, runtime dependencies, browser assets and Application providers in
`distribution/contributions/<provider>.json`.
Extend the provider's existing declaration. Use its actual original dependency
manifest and browser-asset manifest so the pinned builder receives the entire
closure. The installed registry reports which source declared each command.

Applications providers default-export the versioned contract documented in
[APPLICATION_PROVIDERS.md][providers]. Preparation returns the original argv,
input identities and required private directories. A request selector
distinguishes exact subcommands when a dispatcher is shared. The startup reader
uses the product's original announcement and listener verification. Preserve
the original observer's context and line limits during integration.

For a customer-facing change, deliver the producer and its receiver together:
the actual input contract, meaningful browser/CLI operation, complete exported
result, native receiving path, and reopened saved work. Extend the current
semantic or paid-result representation instead of flattening a new adapter's
data into an incompatible generic shape.

The IATI contribution is a complete instance of this contract. Its source-owned
`distribution/contributions/iati.json` registers `dataset-iati`, the typed
client export and original Applications provider. The `iati-operator` selection
includes the complete IATI and XML sources, browser assets, original source MCP
adapter, installer and release support. The installed application uses the same
workspace and native dataset engine as the direct CLI.

### Work from one selected source

The following read-only entry points report the source and registrations of the
actual installed product:

~~~sh
starforge source
starforge registrations
starforge registrations --command dataset
~~~

For source development, the same dispatcher is
`node stellar/scf-starforge-20261009/distribution/cli.mjs`.
The product [README](README.md) and [runtime guide][runtime] provide installation
and feature selection. Use the original package manager and dependency versions
recorded by that runtime.

The [pinned builder][building] reads one Git commit, the complete selected
components, source contributions, static imports and browser mappings. It
produces an archive and manifest containing original paths, Git blobs, SHA-256
digests and byte counts. This development chapter is inside the existing
`products/merchant-workspace` component and travels with that same archive.

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/product-checkout \
  --ref FULL_SELECTED_COMMIT \
  --out /absolute/private/merchant-release
~~~

After an interruption, retain that output and resume its original selected
build. Its [BUILDING.md][building] documents source acquisition, complete-file
reconciliation and native packaging recovery. Source already selected by an
active producer remains attached to that producer's operation.

## 5. Existing development artifacts and the receiving example

The application baseline on October 12 records eighteen distinct team-operated
testnet purchases totaling **411,000 stroops / 0.0411 native XLM**, with fees
recorded separately. The prospective independent-customer milestones below
have their own cohort and observation windows.

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

The runner consumes the exact original packet described in its guide. The
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
retention. It belongs to the delivered foundation described in section 1.

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

## 6. Prospective SCF46 roadmap

The selected proposal requests **$38,000 equivalent in XLM for 400 future
delivery hours over 150 days from actual award acceptance**, using the $95/hour
planning assumption. It has six packages in three delivery windows.
The [original costed scenario][budget] retains the underlying package selection.
The architecture above is the application-time design; each package implements
and operates the selected customer's actual deployment.

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
SCF pays XLM using the published scheduled-payment conversion method. The
[issuer's budget and deliverable guidance][scf-budget] governs actual award
terms, milestone acceptance and the receipt-based submission clock. Award
acceptance supplies the actual day zero; customer access, contributor
availability and actual receipts are entered into that dated implementation.

Before award and at each customer scope decision, reconcile completed source
against these same six packages. Assign a performed adaptation once to its
grant package or separately commissioned workorder. Keep the approved source,
scope, contributor ownership and completion with that original record.

## 7. Native acceptance and recovery plan

A native acceptance operation uses the actual installed source, provider,
approved terms, signer/budget owner, merchant, buyer application and received
output. Its expected result comes from the selected source and customer's task.
Local protocol fixtures are useful for a targeted defect; the deployed
milestones use the actual service and network recorded for their cohort.

| Operation to perform | Native acceptance | Failure or recovery observation |
| --- | --- | --- |
| Source and terms review | Reopen the selected source, typed input/output and exact payment alternatives; preview the approved operation and save its merchant generation. | A changed source, terms or request returns to its original review. Retain the rejected cause and affected original identity. |
| Complete acquisition and receiving | Receive every selected page/file; compare native keys, total selected rows, original scalar/unit/period meaning and complete byte inventory; use the result in the buyer's actual application. | Retain incomplete members and continuations. Recover from the original source/result operation and reopen the finished parent. |
| Approved native purchase | Bind the original intent to its independently observed transfer and complete useful output, with actual network/asset/recipient/amount and fees. | Retain the original attempt after an uncertain reply. Reconcile financial outcome before continuing the unfinished delivery. |
| Source/terms change or withdrawal | A second receiving operator reviews and applies the change on the actual host. The current offer reflects that generation; prior acquired output remains usable. | Reopen after Stop/drain and compare the saved operation and release selected for restart. |
| Merchant delivery failure | The original notification, destination and event ID show actual failure, acknowledgment and recovery. The resulting order/accounting state is usable. | Resume the same delivery event; inspect the original financial and fulfillment records after receiving. |
| Installed threat response | Trigger the two agreed deployment cases, observe the incident and notification, acknowledge it and recover the actual task. | Measure observation coverage, outstanding age, alert/acknowledgment times and time to useful recovered output. |
| Cold receiving and handover | Receive the authorized complete export/backup in a new private destination, reopen source/results/support history and reconcile subsequent operations. | Measure actual recovery time, restored inventory and active receiving effort; record the original unresolved work. |

Perform one complete focused journey after a material integration or recovery
change. Exercise the concrete changed failure boundary within that same
operation. Retain source/configuration identity and meaningful native outcome;
the existing source-specific tests can diagnose a particular remaining defect.

### Cohort and useful-outcome measurement

Count each independent organization or person once across agents and wallets.
A completed purchase joins a distinct approved intent, an independently
observed native transfer and complete useful output. Deduplicate transactions
within their network and keep exact amounts and fees by asset.

Report completed/attempted purchases, complete/started parent datasets or files,
returning buyers and accepted handovers. Keep partial, unresolved, canceled and
refunded outcomes in that same cohort; include required fulfillment state.
Payment, complete output and recovery keep their actual clocks.

For a recurring customer task, retain its prior method and active effort where
available, the installed task's complete result, manual corrections and
receiving effort. Compare the same source/input/output scope. Record the later
period, fresh query or new order that makes another purchase useful.

## 8. Technical handover and ongoing ownership

The receiving engineer needs the selected source archive and manifest, its
runtime/dependency selection, authorized source configuration, complete private
state export, original results, release history and recovery procedure. The
product's native handover supplies those members under their original scope.
The receiver verifies complete bytes and opens the saved work through the
original application.

A handover includes a performed maintenance task: change the selected source or
terms, recover an interrupted result, rotate the receiving host's configured
access, or restore and reconcile an actual backup. Save the original operation
and useful outcome with the commissioning case. Observed implementation and
care effort inform the following customer estimate.

Bryce Muhlnickel is accountable for the project's artifacts, statements,
customer commitments and delivery. AI agents generated and assisted code, UI,
operating scripts, design, documentation and this application material, and
performed source review and native operating exercises. Original maintainers
retain the source and customer-operation ownership reflected by the component
guides and Git history.

This chapter implements the unified architecture, roadmap, development-artifact,
UI and verification documentation requested by the [SCF Open Track][scf-open].
Update the existing chapter as the original product and accepted roadmap
advance; its selected archive retains the exact version delivered to a customer.

[contributions]: ../../stellar/scf-starforge-20261009/distribution/CONTRIBUTIONS.md
[providers]: ../../stellar/scf-starforge-20261009/distribution/runtime-workspace/APPLICATION_PROVIDERS.md
[runtime]: ../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md
[building]: ../../stellar/scf-starforge-20261009/distribution/BUILDING.md
[odata-collection]: https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/ab30feff66a1a38ab60fe86f21e2e50ea683d0bc/stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/COLLECTIONS.md
[odata-customer]: https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/e37a3b0649a16b9c5814097ef7b02c5893e4c327/stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/examples/COLLECTION_CUSTOMER.md
[budget]: https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/2761cc9a44d511959e224dc7ee5998aa13df7e8e/stellar/scf_2026/sf47_budget_model/sf10_current_candidate.json
[scf-open]: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/open-track
[scf-budget]: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines
