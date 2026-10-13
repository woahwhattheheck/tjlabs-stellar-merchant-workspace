# Bloccpay payroll and reconciliation commissioning

A complete Node 24 operations workspace for connecting an existing payroll ledger to Stellar Disbursement Platform, Horizon and Bridge. It imports original CSV/JSON payroll, prepares SDP's exact instruction file, records creator/approver operations, captures native provider history and reconciles each payroll row against original resources.

## Run

Read OPERATIONS.md for the complete runtime, private configuration, browser and commissioning commands. The application uses Node 24's built-in SQLite; the service has no required npm dependencies. The separate actual browser programme uses an installed Playwright/Chromium selected in configuration.

- server.mjs: local web application and API.
- cli.mjs: same workspace commands and source receiving.
- worker.mjs: explicitly enabled scheduled read collections.
- operate-bloccpay.mjs: complete original-source commissioning programme and independent receiving.
- examples/configuration.example.json: one usable public Horizon connection plus unactivated private-provider templates.
- examples/programme.template.json: customer payroll mapping and source selection.

Choose existing tenant, source distribution wallet, creator/approver credentials, Bridge customer and public endpoint verification keys in the private configuration. Templates are descriptive placeholders. Original customer payroll and configuration remain in the private workspace and private receiving archive.

## Daily operations

1. Save a programme version with its exact asset, source wallet, period and CSV/JSON mapping.
2. Import the original payroll file. Amounts retain their original decimal spelling; receiver references and external payment IDs remain linked to their source row.
3. Capture native provider inventory, capabilities, payments, batches, transfers and deposit history. The default Bridge reads include transfer and virtual-account activity; SDP discovers the selected source wallet's actual capabilities.
4. Select the actual receiver wallet and DRAFT or READY disbursement. Generate its native CSV. The application checks contact mode, original receiver IDs, original amounts, asset and source wallet.
5. Prepare the upload, review the original bytes and dispatch. Download the provider's stored instruction file and read the actual batch before the separate start operation. SDP applies its actual creator/approver and balance rules.
6. Reconcile payroll by explicit native IDs and external payment IDs. View exceptions, separately denominated totals, original sources and version history. Corrections append records rather than editing original observations.
7. Enable read-only collections when desired. The interface shows configured and running worker state separately. Each run retains exact request identities and native cursor pages.

The full operation catalogue includes native CSV downloads/exports; immutable prepared multipart uploads; Bridge transfer and virtual-account creation; actual sandbox deposit simulation; and original provider reads. Schema source references accompany every operation.

## Original request recovery

The browser retains original method, argument bytes and file identity through response loss. SQLite and the append-only ledger preserve each host request, provider attempt and prepared provider body. A lost dispatch response is reconciled against original provider observations. A later request is not silently substituted.

Bridge's exact 409 resource_state_conflict permits an explicit operation.retry-original. The same body, URL and Idempotency-Key are retained. The service checks the latest provider attempt, original Retry-After and the 24-hour window measured from the first provider attempt. Automatic network retries are disabled.

## Provider semantics

See docs/payroll-semantics.md. Payroll outcomes, received deposit amounts, processed transfer amounts and fees remain separate. Bridge sandbox events exercise Bridge's own simulation API; they do not establish Stellar testnet settlement. Horizon settlement is joined only through the actual selected network response and original transaction.

All source contracts are included:
- sources/sdp-original.json: exact backend and documentation source files, including native CSV parsing/validation.
- sources/sdp-openapi.json: complete selected original bundled OpenAPI.
- sources/horizon-original.json: original maintained SDK and documentation source capsule.
- sources/bridge-original.json: 13 complete original Markdown documents.
- sources/bridge-contracts.json: original embedded OpenAPI objects parsed from those documents.

The SDP status body is explicitly transcribed from the original backend handler because its original OpenAPI omits that body. The sandbox deposit action is explicitly transcribed from Bridge's original sandbox guide. These provenance distinctions remain visible in the catalogue.

## Scope

This workspace supplies a concrete commissioning implementation for an existing Bloccpay product. Customer installation-specific authentication, ledger mapping, chosen payroll and account access are selected during commissioning. The retained programme records each actual phase and its outcome; source parsing, native runtime execution, provider acceptance, network settlement and commercial contact are separate recorded facts.

## Retained Horizon payment review

Use [the Horizon/payroll review guide](docs/horizon-payroll-review.md) and `node horizon-payroll.mjs help` to compare retained original operations with unlinked payroll rows. The companion keeps exact network, sender, destination, asset, memo and seven-decimal amount identity, shows ambiguous or unequal amounts, and retains an explicit operator choice through the existing correction transaction. Saved review, request and result files support offline reports, original-request replay and whole-workspace receiving. It makes no provider request or payment and leaves SDP/Bridge reconciliation authoritative.

## SDP delegation, events and Bridge intake

The invoice SDK can delegate its SDP batch, instruction and status operations to this workspace's existing operation writer. The integration retains the original company payroll, instruction file, provider body and response under each SDK intent. Configure the existing workspace adapter using `docs/invoice-sdp-integration.md` and `examples/invoice-sdp-adapter.configuration.json`.

Signed SDP events retain their complete identity and original body, select a readback in the same database transition, and validate the full native resource before projection. Open the SDP event inbox for original source inspection and explicit readback recovery. See `docs/sdp-events.md`.

Open `/bridge` for Bridge source intake and incident decisions. The desk and `bridge-cli.mjs` select full source pages, exact resource versions, signed attempts and capture coverage. Reviews and decisions are immutable files attached to the original workspace requests and travel through the existing export and receiving workflow. See `docs/bridge-intake.md`.

The existing `operate-bloccpay.mjs` commissioning programme consumes the selected original workspace, provider configuration and payroll sources. Its full operating report, source export and independent receiving remain the entrypoint for exercising the joined company application.
