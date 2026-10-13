# Retained merchant customer case

TokenJunkieLabs · Original operation: SCF-RECEIVABLES-NATIVE-2A51-20261012

This continuation keeps an existing merchant account useful after a receiving programme ends. Staff receive a dated case index, complete original customer documents, published response forms, received response files, reviewed outcomes, collection histories, credit decisions and selected cash-plan editions. The same customer remains editable in the original merchant workspace.

The original PAYMENT_CHECK.mjs and MCP_RECEIVABLES_CHECK.mjs remain the predecessor programmes recorded in programs/original-programs.json. The new named MCP_RECEIVABLES_CUSTOMER_CASE.mjs retains that complete MCP commercial lifecycle and adds the complete follow-up, customer return and durable case leg. It writes its own result and retains its workspace on success and failure.

## Original owner receiving

2A51 / BC3D / D156 keep the existing installed-provider operation and controller. Receive these additive files alongside the currently selected merchant source, including the complete dependency cohort. Keep the directory layout from the repository:

- durable-customer-case.mjs: original customer selection, complete native capture, original prepared actions and original encrypted checkpoint.
- durable-customer-case-html.mjs: local desktop and phone staff handover.
- durable-customer-case-cli.mjs: create, inspect, capture, prepare, execute, reconcile and checkpoint commands.
- serve-retained-customer-case.mjs: reopen the retained native customer workspace on its original loopback endpoint.
- retained-customer-followup.mjs and retained-customer-followup-cli.mjs: complete saved follow-up and its resumable customer delivery.
- programs/MCP_RECEIVABLES_CUSTOMER_CASE.mjs: complete retained successor of the original MCP programme.
- stellar-forge/mcp-merchant-operator/accounting-receivables-client.mjs: current original connector with a 32 MiB complete-response default; caller overrides remain available.

The successor resolves the repository root from its own original programs/ path. It uses the selected original installed Stellar and MCP dependencies at their maintained source paths. Preserve the original receiving history, full current source manifest and existing selected dependency directories when composing this arm.

Run the selected successor once in the existing receiving operation:

    node operations/scf-receivables-native-2a51-20261012/programs/MCP_RECEIVABLES_CUSTOMER_CASE.mjs

SCF_MCP_RECEIVABLES_TMP selects the owner's existing private working volume. Its first output identifies the exact retained workspace and sibling backup directory. Later output retains customer/invoice/publication identities, the original quote/issue/payment/publication request paths, complete case index and file digests. The successor result is MCP_RECEIVABLES_CUSTOMER_CASE_RESULT.json at the selected source root.

RETENTION.json lives inside the retained workspace from startup onward. It records STARTED, INCOMPLETE or COMPLETE, original programme provenance and the current exact paths. Failure keeps both the workspace and the original operation journals. Closing the programme closes its owned handles; it leaves the business records in place.

The original commercial programme records an explicit USD 100 invoice, USD 25 credit, replaced preliminary receipt, corrected USD 75 receipt and original allocation. Its saved Stellar observation uses its existing controlled NOT_FOUND programme. The added follow-up uses that same customer and the original invoice, credit, collection, cash-plan and response writers. The reusable customer case also accepts actual customer returns through the original intake.

## Complete payment follow-up in the same customer case

The named successor first verifies the original implementation invoice remains paid, then continues that same customer with a complete authored demonstration order. The following amounts are the programme's explicit input to the original ledger, policies and reporting engines.

| Stage | Original application records |
| --- | --- |
| New implementation order | USD 4,800 draft; explicit customer policy with a USD 6,000 limit, 14 allowed overdue days, dispute review and review of every order |
| Invoice release | Complete current credit assessment, reasoned approval and original invoice issue; the approval is consumed in the same ledger commit |
| Assigned follow-up | Named case owner and next action; original contact, USD 3,000 payment promise and USD 800 delivery query |
| Initial cash plan | Original invoice and promise dates; the disputed amount stays separate from expected cash |
| Customer return | Exact account-bound JSON with a revised USD 2,800 promise and a USD 1,000 payment notice |
| Statement entry | Separate original USD 1,000 receipt and allocation matched to the reported reference |
| Merchant review | Current balance changes are acknowledged; the previous promise is explicitly withdrawn and replaced; the payment correspondence remains on the case |
| Delivery clarification | Original dispute resolution retains the invoice and complete case history |
| Updated plan and account | Second immutable cash-plan edition, full comparison JSON/CSV, updated customer account; USD 3,800 remains due |
| Cold reopening | Same invoice, USD 2,800 promise, resolved query, consumed approval and both response decisions reopen under their original identities |

The programme calls the original provider for every draft, credit policy, decision, issued invoice, collection event, cash-plan edition, account, received response, receipt and allocation. It saves complete durable requests before submitting those mutations. Its customer-response JSON is an explicitly authored private receiving scenario, and its separate statement entry exercises the original receipt writer. The resulting documents remain editable and exportable through the same merchant workspace.

The final case captures both immutable cash-plan editions alongside the collection history, consumed credit decision, both published follow-up accounts, exact inbound response bytes and merchant reviews. The original USD 100 account remains in the same customer history.

### Resume an interrupted follow-up

Two additive files own this leg:

- retained-customer-followup.mjs uses the original durable provider requests and retains each stage.
- retained-customer-followup-cli.mjs inspects or continues the same saved selection and finishes its complete case delivery.

RETENTION.json records followupDirectory and the original workspace identity before this leg begins. The follow-up directory contains selection.json, flow.json, every operations/<stage>/request.json and its original recovery state, plus documents/customer-response.json. All IDs and complete original previews or arguments are retained before preparation. The original preparer writes into preparations/<stage>; the caller publishes its complete request/state directory atomically to operations/<stage>. An interrupted unpublished preparation keeps its original bytes under an interrupted name and reuses the same saved intent and request ID. A published operation always resumes through its original request journal.

After the original programme has closed, reopen its same merchant host with the existing serve-retained-customer-case.mjs and RETENTION.json. Then inspect or continue that retained directory:

    node operations/scf-receivables-native-2a51-20261012/retained-customer-followup-cli.mjs inspect \
      --directory /private/retained-workspace/customer-followup

    node operations/scf-receivables-native-2a51-20261012/retained-customer-followup-cli.mjs continue \
      --directory /private/retained-workspace/customer-followup

Continue first reconciles each original request against the provider journal. Committed stages keep their original IDs; an uncommitted stage uses its saved complete request. An unchanged completed follow-up returns its retained completion. A stale date, revision or credit assessment remains attached to that actual request so the owner can review its current source through the original operator rather than silently changing the decision.

The resume command produces a complete customer/staff case under customer-followup/customer-case and returns its index path. Its delivery-selection.json retains the case and capture UUIDs before creation. Once delivery.json exists, repeating the command returns that same delivery. Use the regular durable case capture command with a new edition UUID to retain later account work.

The named full programme already delivers the final case at its original customer-case path. Use the resume entry point for an interrupted leg or its already retained completion; keep the original programme history and complete workspace together.


## Use an already retained customer

Read the actual workspace and customer identities from the existing merchant status/account. Save an owner-private selection JSON with the following fields. IDs below describe fields; use the IDs from that original account.

| Field | Selection |
| --- | --- |
| id | New UUID for this retained case |
| title | Human case title |
| originalOperation | Original receiving or business operation |
| url | Existing HTTPS or loopback MCP endpoint |
| workspace | Configured original accounting alias |
| tokenEnv | Bearer-token environment variable name |
| workspaceId | Original accounting workspace identity SHA-256 |
| customerId | Existing original customer UUID |
| asOf | Chosen dated customer account |
| cashPlans | Explicit cashPlanId and editionId pairs |
| requestIds | Original request IDs to include in the staff handover |

Keep the source dates and exact IDs. The token itself stays in the existing environment. Selected cash-plan editions preserve their full original planning scope, including other customers if that plan contains them; they appear in the staff part of the handover.

    node operations/scf-receivables-native-2a51-20261012/durable-customer-case-cli.mjs create \
      --case /private/customer-case --selection /private/selection.json

    node operations/scf-receivables-native-2a51-20261012/durable-customer-case-cli.mjs capture \
      --case /private/customer-case --edition-id ORIGINAL_NEW_EDITION_UUID

Open editions/EDITION_UUID/index.html. The industrial interface supports narrow phone widths, wide accounting tables, print output and local original-file links. Each human account date is formatted for reading; JSON and original documents retain their exact machine values.

A completed edition contains:

- customer/current/: complete dated native account files and account.tar.
- customer/publications/: each original published account, its editable customer response document and all linked invoice files.
- staff/responses/: exact received JSON, complete reviewed outcomes and the full native response package.
- staff/collections/: dated case history, CSV, printable case and eligible reminder.
- staff/credit/: each saved original decision, its assessment, history and readable document.
- staff/cash/: explicitly selected immutable planning editions.
- staff/records/: complete original source metadata and selected native request records.
- identity.json and edition.json: exact workspace, case selection, revision and complete retained file identities.

Capture fences every source read against the original accounting revision and checks it again before publishing the completed edition. If the account changes while capture is underway, retain that incomplete edition and capture a new edition UUID. Retrying an unchanged incomplete edition reuses complete original files. A completed edition remains an immutable account record.

Send the selected original publication directory or its account package to the customer. The top-level index and staff files form the operator handover.

## Continue the customer conversation through the original writer

Use the existing Receivables client or CLI to prepare a complete publication, intake or response-review preview. The case CLI checks its original workspace and customer, then delegates preparation and request recovery to the maintained durable Receivables CLI:

    node operations/scf-receivables-native-2a51-20261012/durable-customer-case-cli.mjs prepare \
      --case /private/customer-case --operation-id NEW_OPERATION_UUID \
      --action customer-account-publish --preview /private/publication-preview.json \
      --actor "Responsible operator" --request-id RETAINED_REQUEST_ID

    node operations/scf-receivables-native-2a51-20261012/durable-customer-case-cli.mjs execute \
      --case /private/customer-case --operation-id ORIGINAL_OPERATION_UUID

    node operations/scf-receivables-native-2a51-20261012/durable-customer-case-cli.mjs reconcile \
      --case /private/customer-case --operation-id ORIGINAL_OPERATION_UUID

The other two actions are customer-response-receive and customer-response-review. Receiving retains the exact customer UTF-8 source. Review preserves the original choice, current invoice basis and explicit acknowledgement of changed balances. The original invoice and Collections writers apply the selected outcome. Save a new case edition after continued work.

Execute first looks up the original request ID. Reconcile observes its original journal and submits no mutation. Preserve the complete prepared request and state after an interrupted reply. A changed preview or revised business action receives its own new original operation.

## Retain an encrypted checkpoint

The original host must declare its existing recovery stateRoot, backupRoot and passEnv. The named successor declares the retained working directory as stateRoot and a separate sibling directory as backupRoot. Its passphrase variable is STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE. Use the owner's existing configured secret and preserve it through the original secret channel.

When that environment variable is configured, the successor performs the original encrypted checkpoint after its case capture. Otherwise the handover retains the complete native case and the explicit configured checkpoint entry point.

After stopping the original source, OAuth and selected-company writers, select the complete case edition:

    node operations/scf-receivables-native-2a51-20261012/durable-customer-case-cli.mjs checkpoint \
      --case /private/customer-case --edition-id ORIGINAL_EDITION_UUID \
      --checkpoint-id NEW_CHECKPOINT_UUID --actor "Responsible operator" \
      --external-writers-stopped true

The continuation retains original pause, source review, encrypted backup, verify and resume requests. Its source review must identify the captured account revision. The resulting checkpoint records the original backup catalog ID, manifest SHA, full original result and reopened revision.

A pending job retains its checkpoint UUID. Continue with the same command or use checkpoint-reconcile to observe only. A failed original job remains available for diagnosis in its saved operation directory. The resume request is prepared before pausing and remains available through the original maintenance CLI, including after a failed backup:

    node stellar-forge/mcp-merchant-operator/accounting-maintenance-cli.mjs execute \
      --dir /private/customer-case/checkpoints/ORIGINAL_CHECKPOINT_UUID/resume

Keep the encrypted backup directory, customer case directory, RETENTION.json, host-config.json and original request directories together in the complete private handover.

## Reopen the same retained workspace

Configure a current bearer secret under the handover's original token environment variable. Reopen the retained customer host:

    node operations/scf-receivables-native-2a51-20261012/serve-retained-customer-case.mjs \
      --handover /private/retained-workspace/RETENTION.json

The command reads the original private host configuration, verifies the original customer workspace identity, and listens on the retained loopback endpoint. It uses the original merchant host and accounting tools. Ctrl-C closes that owned listener and host.

In a second owner session:

    node operations/scf-receivables-native-2a51-20261012/durable-customer-case-cli.mjs inspect \
      --case /private/retained-workspace/customer-case

This returns the current original customer/account and revision. Continue original prepared requests, receive the customer's original return, review its entries, and capture the next dated case edition.

For a new filesystem location, use the existing relocation-aware accounting restore workflow with the selected original backup ID and manifest SHA. Preserve its original workspace/source binding and full configured source closure. Reopen the restored original workspace through its declared receiver, then select its retained original customer identity for continuing casework.

## Source ownership

Authored by TokenJunkieLabs. Original private programme source, business records and customer material retain the original owner's receiving surface. The programme predecessor, existing invoice/receipt/quote/payment writers, request journals, selected provider package and original financial recovery engine remain the execution lineage.
