# Distribution Lot and Order Study Desk

A complete offline operator desk for a consecutive industrial-distribution study. Open Distribution_Lot_and_Order_Study_Desk.html in a current browser. The application starts empty. Its labelled authored course follows two fictional warehouses, five physical lots and six order lines through receipt, documented unit conversion, same-material repacking, transfer, certificate amendments, QA holds, supplied allocation decisions, dispatch, a partial return and write-off.

The maintained CommonJS source has no installed package dependency. Node 18 or later can use native/distribution-desk.cjs; NATIVE.md describes every command.

## Ordinary work

1. Enter the operator, completed period, actual source cutoff and complete source-family counts.
2. Import each original and returned CSV and map its actual columns. Include header-only CSVs for observed empty families. An unmapped field remains unobserved.
3. Retain supporting documents as exact bytes with their real availability. Link record identities explicitly. An unchanged filename does not establish unchanged contents.
4. Enter physical observations and corrections using the full record editor. Each retained edit preserves the preceding study and source extract. Version IDs are immutable; record_key and the family business ID stay constant across a revision chain.
5. Review stock, QA, frozen allocation decisions and actual customer outcomes. A supplied proposal is distinct from an observed allocation, pick or dispatch.
6. Bind QA inputs, certificate bytes and decision-review populations with the source-binding helper. Record the actual named review and event time.
7. Review the exact study edition as QA and operations. Editing the study makes the prior acceptance historical.
8. Save the complete session, then export the study ZIP and maintained source. The complete session preserves pending forms, history and competing browser branches.

QUICK_START.md contains a practical receiving walkthrough. DOMAIN_CONTRACT.md gives the operating boundary. SCHEMA_REFERENCE.md maps the 39 families. Filled course CSVs and header-only templates use the exact delivered schema.

## Physical stock

Each product has a stated material, grade and physical base unit. A different unit requires a dated original conversion document. Physical lot identity is separate from supplier labels. Receiving, transfer departure/arrival, repack consumption/output, actual dispatch, returns, return disposition and write-offs produce distinct ledger movements. Repacking balances the same material's inputs against outputs and actual process loss. Stock in transit stays outside either warehouse's on-hand balance until actually received.

Returned stock enters the physical warehouse when received. It remains quarantined from available stock until its recorded disposition. An actual disposal reduces physical stock. A copied original movement reference is counted once when the observations agree; contradictory aliases remain unresolved. Observed negative stock, excess picking, excess dispatch and excess returns remain visible.

## QA and decisions

A certificate's original bytes, named QA review and actual lot-state decision are separate records. Release needs the effective warehouse/material policy, the declared complete input population and each required certificate's exact accepted review. Open holds restrict eligibility. A later certificate amendment cannot validate an earlier decision. Conflicting same-time reviews and unresolved later state observations suppress eligibility.

A decision freezes the complete operator's then-known lot/order population and relevant source inputs. Its proposals stay within the case warehouse and exact product. Both held and eligible lots remain in its population. The desk evaluates supplied proposals and ranks eligible candidates using the stated FEFO/FIFO policy; it does not recreate a vendor's private model. A recorded score keeps its supplied unit.

Customer expiry and retest requirements are explicit and distinct. An absent customer rule remains unknown. Required remaining life is evaluated against the actual order due date. An override reason records what happened and does not silently change eligibility.

## Outcomes and work

Order, line and product/unit totals remain separate. An allocation is not a pick; a pick is not a dispatch; dispatch is not customer acceptance. The full study preserves cancelled, incomplete, late and unresolved lines. Actual movement remains in physical stock even if the review or release chain is incomplete.

Recurring work has eight phases for every included physical-lot, receipt and order member. Baseline and current active person-minutes require matching populations, named people, actual intervals and stable work identities. Increased QA or exception work remains visible. One incomplete member keeps the whole comparison unresolved while retaining the matched subset and observed current work.

Commercial postings retain their original transaction reference, category and currency. Conflicting aliases make the affected total unresolved. The software does not convert an operational risk score, elapsed wait or time comparison into money.

## Preservation

Browser saves use IndexedDB compare-and-swap. A second tab cannot silently replace a saved branch. Failed or oversized input remains available through emergency recovery. Complete files can move between the browser and native command. History reconstruction preserves original field order and review digest identity.

Exported JSON contains the complete per-record analysis; readable Markdown explains the selected scope; CSV and original document bytes remain editable and independently readable. SOURCE_MANIFEST.json covers every delivered source member.

## Complete embedded source

The offline HTML retains every maintained source member and original course file in a deterministic gzip stream. The included Pako 2.1.0 implementation decodes it locally; no network request or installed package is needed. Source export reconstructs all original members byte for byte. The vendor MIT license is retained in vendor/PAKO_LICENSE.txt.
