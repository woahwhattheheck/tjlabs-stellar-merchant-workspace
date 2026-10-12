# Merchant Support

Operate a merchant from its original support case through implementation, service commitments, native adjustments, buyer period close, accountant handoff, recorded usage, pricing revision, quotation and complete customer receiving. The browser, command line and merchant agent use the same saved case, source editions and native delivery operations.

## Start with the existing work

Open **Applications → Merchant support** in a READY runtime built with the `merchant-support` selection. Select the actual private case directory and incident source profile. The profile may contain an empty `sources` array for case work before a seller watcher is attached. Optional source, complete-package and remote Handoffs paths belong to that same application.

The workspace provides the following complete workflow:

| Work | Workspace | Saved result |
| --- | --- | --- |
| Receive and investigate the merchant | Cases, Incidents, Handoffs, Diagnose and Runtime | Original captures, case ownership, selected route, full runtime support and immutable case versions |
| Agree and carry out the work | Workorder and Implementation | Original terms and packet, assigned tasks, full materials, receiving observations, measurements and edition comparisons |
| Deliver the underlying files | Source delivery and Complete delivery | Original manifests and every source member, complete case history, native archives and a resumable customer receiving operation |
| Operate service commitments | Service | Original terms, calendars, incident observations, exclusions, calculations and complete monthly reports |
| Reconcile an agreed service adjustment | Adjustments | Reviewed service proposal, native adjustment and reverse-transfer verification, full native capture and buyer source |
| Complete buyer and accountant work | Adjustments and original Buyer expenses | Purchase and credit coding, issued period, original accountant files, returned revisions and full project receiving |
| Prepare and receive a quotation | Commercial | Full retained pricing inputs, quote editions, customer responses, source comparisons and complete pricing-workspace receiving |
| Apply accepted scope and change orders | Commercial → Implementation | Exact accepted quotation, explicit task and plan choices, preserved delivery progress, linked commercial history and current receiving |
| Continue through an agent | The installed Merchant Support provider | The same case operations, Service and quotation actions, complete-package operations and streamed original-file reads |

[Operating instructions](OPERATING.md) cover the managed application, private configuration, direct commands and daily work. [Installation and receiving](RECEIVING.md) covers the selected source build, original runtime installation, complete customer package and independent reopening.

## Install this product

Build from a checkout containing the selected full commit:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref ORIGINAL_COMMIT \
  --selection merchant-support --out /absolute/merchant-support-release
```

The existing **Build a product** view in Runtime workspace offers the same recipe. Its original request, selected commit, output and archive remain the inputs to installation and continuation. Follow [the original Source Build workflow](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/SOURCE_BUILDS.md) to use the browser.

Use the emitted archive and its actual SHA-256 with the original runtime profile and installer. The selection includes the original Support component, commissioning source engine, Service and commercial modules, merchant agent, native receiving code, Applications providers and this guide. Accounting and buyer providers share their original owner lifecycles with Support; their complete native workspace source ships in the same selection. It also carries the original runtime and managed release machinery.

The archive's README opens the complete product and operating guides under `source/`. Its `manifest.json` retains the original commit, every packaged file and the exact `merchant-support` recipe. The existing `starforge` executable exposes the selected original commands.

## Direct operation

With the installed `starforge` command:

```sh
starforge support-console \
  --cases-dir /absolute/private/merchant-cases \
  --source-dir /absolute/private/merchant-cases/source-bundles \
  --package-dir /absolute/private/merchant-packages \
  --incident-sources /absolute/private/incident-sources.json \
  --port 8784
```

Open the local URL printed by that original command. Choose the existing case or receive its complete package. The default source directory is `source-bundles` inside the case directory; the default package directory is a sibling named after the case directory with `-packages`. Keep the actual selected paths when reopening.

A configured remote sender uses the existing `--handoff-sources` file. In Applications the corresponding optional field is **Private handoff source profiles**. The reviewed application binds that profile's bytes to the exact configuration loaded by its native listener.

To operate Service adjustments and buyer/accountant handovers, select **Private accounting configuration** and **Private buyer expense connection** in Applications, or pass the corresponding `--accounting-config` and `--buyer-expense-connection` files to the direct command. [Operating instructions](OPERATING.md#connect-adjustments-buyer-work-and-the-accountant) cover the complete source-to-period workflow and native owner lifecycle.

For a checkout, invoke the same command entry at `stellar/scf-starforge-20261009/sf74-merchant-support-console/server.mjs`. The native source archive engine uses Python; `SCF_PYTHON` can select the installed executable.

## Original tariff pricing through customer receiving

This edition includes **Merchant pricing and scenario planning**, its **Tariff planning** link, and **Merchant support → Commercial quotations**. Both applications use their original private workspaces and native owners.

Prepare graduated or volume tariffs against the original saved merchant source. Save the plan, choose the positive request quantity and complete its original scenario/pricing selection. The saved tariff total, derived uniform per-request rate and rounding remain explicit.

In the customer's quotation desk, open **Tariff sources** and select that original pricing directory, seller file and saved snapshot or history. Capture the completed selection with its full pricing backup, inspect the retained source, and attach it to the current saved case with its three retained case request UUIDs. The editor then selects the matching original pricing source and quantity for the quotation.

A changed monthly quantity shows the original tier calculation alongside the charge at the saved uniform rate. A new rate starts with a new completed native selection and a new quote edition. The customer document carries the original schedule, selected quantity, saved rate and rounding; the machine quote retains the complete source identities.

Record the actual customer response and continue through the accepted-scope workflow below. The full case package retains quote editions, responses, tariff material, original pricing backup and delivery history. After receiving the case, restore its retained pricing workspace and receive the selected tariff portfolio through the original engine. The same saved plan, comparison and both native outcomes reopen there.

Use `starforge merchant-tariffs` for the original planner and selected portfolio export/inspection. Use `starforge merchant-commercial tariffs` for customer source capture, inspection, attachment, quotation review, exact downloads and restoration. The existing Pricing and Support providers expose those same operations through the installed merchant agent. The complete [tariff customer guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial/TARIFFS.md) contains every private input and receiving command; the [Merchant economics guide](../merchant-economics/OPERATING.md) covers supplier costs, original tariff planning and pricing adoption.

## Recorded usage and customer pricing revisions

Open **Performance** in the original Pricing console and select a completed tariff selection plus the original saved usage version. Choose its exact request-count basis, optional native payment option and supplier-cost edition. Service counts use the complete retained opening and closing service snapshots and their original customer-statement compiler.

The review preserves the saved uniform per-request price, the original graduated or volume schedule and their values at the observed quantity. Save that review, then export its complete source envelope. The installed `starforge merchant-performance` command, typed HTTP client and original Pricing MCP provider use that same saved source.

In the customer's **Commercial quotations → Usage and revisions** desk:

1. Choose the measured original quotation and complete performance source. Preview the native comparison and save it as an original case material.
2. Select the retained usage review and the measured quote or a later edition. Enter an explicit monthly request volume.
3. Choose the existing tariff or a revised native selection already received through **Tariff sources** for the same route.
4. Prepare the ordinary quote draft. Review work, service, scope, quantities and payment terms, then publish its new edition using the original quote controls.
5. Record the actual customer response and continue accepted work through the original implementation and receiving flow.

The explicit monthly proposal retains the recorded period separately. A quote revision keeps its original parent, measured quote and saved performance binding. Complete customer packages carry the full performance source as original case material alongside the quote editions and customer history.

Use `starforge merchant-commercial performance` for `list`, `preview`, `receive`, `revision` and `file`. The original Support tools expose the same four case operations and retained file reader. The native Pricing proposal path uses `merchant-performance`. For complete receiving, create a new original Pricing backup after the review and proposal operations have been saved, retain the full tariff portfolio, restore that backup and receive the portfolio through the original Tariff owner. Reopening Performance over the same Pricing directory restores the complete proposal and selection history with its original request UUIDs.

The [Performance operator guide](../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/performance/README.md) includes all original source selectors, portable source and sixteen HTTP/native methods. The [Commercial performance guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial/PERFORMANCE.md) contains the full saved-case, quote revision, typed client and customer receiving contracts.

## Accepted quotations and change orders

Open **Commercial** for the saved merchant case. Prepare its quotation from the retained implementation, service and pricing sources, and record the customer's response against the exact saved quote edition.

1. Choose **Implementation** in the quotation desk and review the accepted edition. The comparison shows task changes, plan changes and the one-time and monthly commercial amounts.
2. When the current implementation and accepted quotation changed the same field, choose **Keep current edit** or **Use accepted scope**. Select **Review selected choices** to review the resulting work.
3. Enter **Recorded by** and an implementation note, then start the implementation or apply the accepted change order. The transfer retains the exact quotation, response and reviewed decisions with the same case.
4. Choose **Open implementation and receiving** to continue the selected case's assignments, delivery files and receiving. Existing task progress, owners and notes remain with that work.

In **Technical and customer receiving**, choose **Implementation plan tasks** as the receiving scope for tasks created from accepted custom quotation lines. Select the received tasks and original deliverables, choose technical or customer receiving and the observed result, then record the observation with its actual time and source reference. **Correct an earlier observation** restores that observation's receiving scope and original selections before the corrected record is saved.

For work from a retained workorder, select that original edition as the receiving scope. The **Before, installed and recurring effort** measurements continue to use their original workorder edition and task definition.

For a later change, prepare a revised quotation from the current agreed edition, record its customer acceptance and apply it through the same comparison. The commercial history keeps the original agreement and each accepted change order.

**Export and reopen → Open complete case handoff** continues in the original complete-delivery desk for that same case. Use its retained export and receiving operations to carry the original source bundles, attachments and case history into the receiving workspace.

The [accepted quotation and implementation guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/COMMERCIAL_IMPLEMENTATION.md) describes the complete workflow, field choices, request recovery and browser/controller contracts. The installed merchant provider and `merchant-commercial` commands expose the same preview and adoption operations.

## Complete delivery

**Save and export complete case** saves through the original Case desk and captures the selected saved revision. The resulting package contains its complete sender history, original Support handoff, implementation outputs and every referenced native source bundle across that history. Historical and unassigned source members remain included.

A receiver selects the complete folder or an existing remote Handoffs source, inspects the original manifest and starts the retained receiving operation. **Open received case** continues that receiver's original case. The receiving checkpoint keeps subsequent local edits when the package is reopened.

The [Complete delivery guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/CASE_PACKAGE_WORKSPACE.md) explains folder upload, streamed downloads, remote receiving, all sixteen package tools, inventories and interrupted operation recovery. The [native case package guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/CASE_SOURCE_PACKAGE.md) defines the complete format and original engine.

## Source ownership

This product composes the maintained SF74 case store and codec, SF93 incidents, SF77 workorder, SF49 source editions and archives, SF97 pricing, original Support Handoffs receiver, merchant provider, native settlement accounting and original SF36 buyer expense workspace. Installation uses the existing Source Build, SF46 release, runtime profile and Applications lifecycle.

The original [implementation guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/IMPLEMENTATION.md), [Service guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/SERVICE_OPERATIONS.md) and [commercial guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/COMMERCIAL.md) describe the underlying records and operating commands. The [accepted quotation and change-order guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/COMMERCIAL_IMPLEMENTATION.md) connects those records to the same implementation and complete customer handoff.
