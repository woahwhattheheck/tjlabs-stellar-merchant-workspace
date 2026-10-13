## Merchant implementation, source delivery and offline customer review

### The customer task

An implementation customer needs a complete working delivery and a clear way to review it. The engineer needs to know which source, task definition and delivered files the customer actually inspected. Merchant Support now connects the original technical handover to saved implementation tasks, an offline recipient review, explicit technical and customer observations, and a complete case that another operator can receive and continue.

This workflow supports a merchant or integration partner commissioning a useful Stellar-paid service. The existing workorder identifies the customer task, merchant, independent buyer, source, host, receiving application and expected output. The implementation case carries the work needed to make that task usable. A receiving engineer can inspect the actual service and its output, keep unfinished work visible, and record the customer's own observation against the precise delivery.

The shipped foundation is the Grafana case-delivery integration in [Merchant PR1422](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/1422) and [Commons PR37491](https://github.com/woahwhattheheck/commons/pull/37491), plus offline implementation review in [Merchant PR1565](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/1565). Grafana provides one complete technical-delivery example. The recipient review uses the original implementation model and can review the selected tasks and materials of another saved Support case.

### Retain and inspect the original technical handover

The operator opens **Grafana delivery** in the existing Merchant Support application, chooses the saved case and supplies the complete ZIP exported by the original Grafana workbench. The source transfer retains that unchanged archive as one native source member, along with the original workorder and selected case revision.

The [native inspector](https://github.com/woahwhattheheck/commons/blob/ea850ded8c1db17af09103ad98c12235e509d792/opportunities/ma_eotss_observability_2026/integrations/grafana_handover_inspect.py) reads the full handover: project, retained project history, referenced source editions, immutable provider objects, SQLite checkpoint, native jobs and target actions. It uses the [original project and history validators](https://github.com/woahwhattheheck/commons/blob/ea850ded8c1db17af09103ad98c12235e509d792/opportunities/ma_eotss_observability_2026/service/state.py). The displayed scope includes operations present in the complete private checkpoint, including operations outside the proposed task mapping. The operator reviews that scope before transferring customer material.

The inspection keeps a recorded job status, individual measurement result, target action, rollback and customer receiving observation as distinct facts. The operator sees the actual retained errors or unresolved work. The original project and provider snapshots remain separately identified, with their own capture history.

Choose the real implementation tasks and only operation IDs already selected by the original handover owner. **Review exact attachment** presents the original and proposed task definitions, workorder changes, source identities, native outcomes and delivery notes together. The [case-delivery service](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b81137ecb4e8ca27a108cb28b09ae12558bcbc86/stellar/scf-starforge-20261009/sf74-merchant-support-console/case-grafana-delivery.mjs) freezes that reviewed selection before the operator attaches it.

Attachment uses four existing case commands: retain the reviewed intent, attach the source workorder, link the original ZIP as a source-backed deliverable, and add the readable native-result review. Each completed step remains in the case if a later step is interrupted. A retry continues the same request and reconciles accepted steps through the original case revision and command receipts. The [complete operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b81137ecb4e8ca27a108cb28b09ae12558bcbc86/stellar/scf-starforge-20261009/sf74-merchant-support-console/GRAFANA_CASE_DELIVERY.md) covers the browser course; the [installed CLI guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/b81137ecb4e8ca27a108cb28b09ae12558bcbc86/stellar/scf-starforge-20261009/sf74-merchant-support-console/GRAFANA_CASE_DELIVERY_CLI.md) covers intake, inspect, review, apply, status, reopen, export and independent receive.

### Give the recipient the full review and working material

Open **Recipient review** from the original Support navigation at `/implementation-review`. Select the actual saved case, its implementation tasks and the original materials that the recipient needs. Prepare the complete packet and a self-contained HTML review. The packet retains the selected workorder, plan, task definitions, material identities and deliverables from that original case revision.

The recipient opens the HTML locally, reads the original task and material context, and downloads embedded original files. Larger or separately delivered native companions remain clearly identified so the recipient can open the complete accompanying delivery. The [packet model](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/59928e62d6d521a1344d539145897668bd3e7d47/stellar/scf-starforge-20261009/sf74-merchant-support-console/implementation-review-model.mjs) validates the whole selected source and review rather than silently omitting an oversized file or observation.

Named local copies let the recipient keep separate working reviews. Unfinished observations are autosaved with the draft, and a browser transaction checks the local revision before replacing a copy. A competing edit remains visible for the user to resolve. The complete recovery JSON retains the draft, original packet and observations for reopening. The [recipient implementation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/59928e62d6d521a1344d539145897668bd3e7d47/stellar/scf-starforge-20261009/sf74-merchant-support-console/implementation-review-recipient.js) tracks unsaved state when browser storage fails and asks the recipient to preserve or explicitly discard it before replacing the visible copy.

The recipient records what they actually inspected: technical or customer receiving, outcome, observer, observation time, selected tasks, inspected materials, reference and complete notes. The original outcomes are `accepted`, `changes_required`, `not_run` and `not_applicable`. Technical and customer observations are separate. Task progress remains a separate operating field, so finishing engineering work does not substitute for a customer observation.

### Compare and record the returned review

The operator opens the complete original returned file in the same originating case. The [operator desk](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/59928e62d6d521a1344d539145897668bd3e7d47/stellar/scf-starforge-20261009/sf74-merchant-support-console/implementation-review.mjs) compares its immutable review basis with the current saved implementation, displaying changes in the task definitions, receiving-relevant plan fields, source material and delivered files.

Every observation retains the subject that was actually reviewed. A changed implementation remains visible as a different current subject. Corrections preserve the original historical subject and prior record; an inspection of newly delivered work becomes a new observation. Earlier accepted observations remain in history when subsequent changes make a fresh review necessary.

After explicit review, the [native receiving service](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/59928e62d6d521a1344d539145897668bd3e7d47/stellar/scf-starforge-20261009/sf74-merchant-support-console/case-implementation-review.mjs) retains the exact original returned UTF-8 file as an observation material and records every attributed observation through one original `record_receiving_batch` command. The [existing implementation model](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/59928e62d6d521a1344d539145897668bd3e7d47/stellar/scf-starforge-20261009/sf74-merchant-support-console/commissioning.mjs) validates the complete next state, and one CaseStore compare-and-swap saves it. A stale or invalid row prevents partial application of the batch.

The original request identity binds the case, returned-file identity, operator and recording time. Lost responses continue through the original request status and retained receipt, including when the case has subsequently advanced. The browser preserves the unresolved request before dispatch. The [installed CLI](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/59928e62d6d521a1344d539145897668bd3e7d47/stellar/scf-starforge-20261009/sf74-merchant-support-console/implementation-review-cli.mjs) exposes the same `prepare`, `inspect-return`, `preview`, `apply` and `status` flow through `starforge merchant-implementation-review`.

### Deliver the whole case and continue in the receiving installation

Export the complete selected case through the existing Handoffs and native case-package workflow. It retains original source bundles, the unchanged Grafana ZIP when selected, saved case history, task definitions, material, readable reports, observations and the exact original returned review. The recipient transfers and opens that complete package.

The independent Support installation uses its own case and source stores. The original receiver validates all package members and returns its actual local case identity and imported revision. Grafana reopening resolves the original delivery through that native receiving result and reruns the original read-only inspection. Original source IDs remain in history, while later local edits belong to the receiving case.

The receiving operator inspects the restored tasks, original files, observations and history, then prepares any new recipient review from the actual received local case. That preserves the originating review's identity while allowing the customer relationship and implementation work to continue in the new installation.

| Stage | Useful result for the customer and next operator |
| --- | --- |
| Select the implementation | A saved workorder and tasks describing the actual merchant service, independent buyer, required output and receiving application. |
| Retain the technical source | The complete original archive, source editions, native project history and provider checkpoint with their actual scope. |
| Review and attach the work | A source-bound task mapping, full deliverable and readable native outcome in the existing case. |
| Inspect the delivery offline | A self-contained review with original task context, available source downloads, unfinished draft and complete recovery copy. |
| Return explicit observations | Technical and customer findings with named observers, actual inspection times, inspected files and full notes. |
| Apply the reviewed return | The unchanged returned file and all validated observations saved in one native case transaction. |
| Independently receive and continue | The whole case and original sources reopened in the receiving installation, with history and subsequent local work preserved. |

### Contribution to the funded programme

These merged capabilities are an existing implementation and handover foundation. The requested grant remains **USD38,000, 400 prospective hours, 150 days and six funded packages**. Completed reusable work remains part of the starting baseline. Each later customer adaptation, delivery hour and care obligation is allocated once to the relevant grant package or separately commissioned work.

The workflow supports the existing authority-and-handover and production/returning-customer/maintenance outcomes: select actual customer sources and terms; operate the useful service and original Stellar purchase path; retain the complete output; obtain explicit receiving observations; and let another engineer restore and continue the case. The funded installations, customer organizations, host choices, receiving responsibilities and actual purchase observations stay attached to their existing workorders and customer records.

The source has been merged and its full authored files independently read back. Complete native operation and rendered receiving continue in the original Support programme with its actual installed source, case and selected archives. The [full implementation-review guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/59928e62d6d521a1344d539145897668bd3e7d47/stellar/scf-starforge-20261009/sf74-merchant-support-console/IMPLEMENTATION_REVIEW.md) gives that operating course, including desktop and narrow views, original file downloads, draft recovery, a changed delivery subject, an interrupted apply, complete export and independent reopening. The actual resulting observations and artifacts update this same customer record and application chapter.
