# Hardware revision review desk

## Keep the complete source operation

The desk opens blank. Original sources, mappings, frozen editions, proposals and named reviews are independent records. Save complete working JSON regularly. Editable HTML contains the same full state in a lossless compressed boot and the complete application source. Both retain unfinished mapping, proposal and review text, prior replaced sessions and every original byte. Browser storage may be limited; its status line says whether saving succeeded.

Opening a new or received session first retains the current session, including a draft-only session. A failed import leaves the current workspace available. Another tab's browser copy is not silently overwritten: select the copy explicitly in Open and restore. The full working+HTML+source+originals ZIP has a measured 128 MiB /2,000-member admission; select a smaller scoped revision if this full handover exceeds the limit.

## Original intake

Retain each authorized original using Original sources. The selected KiCad adapter accepts XML export D/E, including the current KiCad9 E exporter. Use the documented native command in CONTRACT; retain the exact output. This desk parses that selected source contract and does not infer an original CAD edit from a report.

BOM and owner-declared firmware pin tables may be CSV, TSV or JSON. Inspect the exact retained table before mapping. For JSON, declare the array pointer and use pointers relative to each selected object. For CSV/TSV, use exact original header names. Duplicate JSON members or malformed tables remain errors; the full original stays retained. Opaque files can be preserved but cannot support parsed numeric claims.

Download exact originals at any time. Netlist inspection displays design metadata, complete components, connection occurrences, library pin inventory and all source-linked findings. Physical pin strings, unit UUIDs and sheet paths remain exact.

## Explicit mappings

Scope identifies product, revision and owner. Select the original netlist. Choose the component field that actually corresponds to the BOM's part number; the supplied MPN default is a template, not a manufacturer/internal-code equivalence assertion.

The selected BOM contract is per assembly with unit each. Required meanings are part number and positive exact quantity. Set the literal reference separator and optional default unit. Reference ranges are not expanded. DNP and exclude-from-BOM records remain visible separately; exclude-from-board is also retained.

The firmware table is an explicit owner contract: stable row ID, component reference, physical package pin string, expected connection/net and symbol. It does not parse arbitrary source code or infer GPIO/register-to-package mapping. An unconnected assertion depends on the matching supplied library pin inventory.

Use the typed controls or the full editable JSON. All unexposed fields remain in the full draft. Required disciplines are a JSON array drawn from EE, FW and MFG; unfinished invalid discipline text remains retained separately. Repair it before preview.

Original sources also offers a complete BOM/firmware group mapping preview. Copy the current mapping, edit it, and select the exact source/format. Preview evaluates the entire proposed input against the originals. Adoption changes the draft only and retains a prior snapshot.

## Freeze and compare revisions

Name the edition and preparer. Preview the complete source reconciliation. An invalid received selection can be frozen to preserve the actual received state, then corrected in a successor edition. The report distinguishes input errors, component/BOM reconciliation and declared firmware findings. A finding is not an electrical safety conclusion.

All report arrays are paginated. Full JSON and CSV preserve every row and source reference. Per-assembly quantities retain exact rational numerator/denominator alongside display decimals.

Copy a frozen edition as a correction, retain corrected originals separately, update explicit mappings, and freeze a successor. Its parent links to the prior edition. No earlier source or result is overwritten.

Compare exact baseline and candidate editions. Local net-code renumbering is not a connectivity change. Stable package identity, named nets, complete endpoint cohorts, pin function/type, BOM groups and declared firmware contracts remain separately compared. Different products, ambiguous identities and unresolved source errors appear in comparison reasons.

## Proposal and discipline decisions

Prepare a proposal from two distinct frozen editions, with a name, preparer and reason. Preview the full change and retain it. The proposal stores the complete comparison and SHA256.

Reviewers select the retained proposal, discipline, decision and their name and note. Each decision binds the exact comparison hash. The latest explicit decision for each required discipline governs the source review status; earlier decisions remain retained. Required approvals cannot be satisfied by selecting a different comparison.

The source review handoff exports complete baseline/candidate reports, selected proposal/status, named decisions and every original. Its nativeApplication field remains NOT_APPLIED: the owning workflow controls CAD/PLM application and production release.

## Reopen and deliver

Complete working JSON reopens the operator. Domain workspace JSON opens the native CLI. Complete source download is an exact gzip+Base64 envelope; use the included unchanged Python opener:

```sh
python3 materialize-source.py Hardware_Complete_Application_Source.json NEW_SOURCE_DIRECTORY
cd NEW_SOURCE_DIRECTORY
node native/build-desk.mjs NEW_Hardware_Desk.html
node native/build-desk.mjs NEW_Editable.html Hardware_Working.json
```

The standalone source and editable desk have no runtime network dependency. Use the full source/native guide and browser receiving course included in this package. Create outputs in a new directory; existing files are preserved by the native publication workflow.

Large operations are synchronous. The desk paints a working notice, saves drafts and then invokes the unchanged core. Source-execution timings are not native/browser latency measurements. The commissioning capacity source and actual receiving results specify what was executed.

## Complete source execution and browser receiving

Run `node native/receive-operator.mjs NEW_DIRECTORY` to execute the actual complete controller with explicit in-memory DOM, storage and download adapters. The result retains its full working state and all export identities. Follow `docs/BROWSER_RECEIVING.md` on the actual standalone artifact to record rendered browser observations.

The retained large workspace can be received without rerunning analysis generation: `node native/receive-capacity-transport.mjs EXISTING_WORKSPACE.json NEW_DIRECTORY`. This independently receives that exact workspace, measures and verifies the complete working/HTML/source/originals ZIP, and reopens its editable state.

Internal session copies retain only the core's validated immutable workspace identities, including prior snapshots, while copying all editable metadata and drafts. Imported JSON still undergoes complete source-history validation. This avoids replaying unchanged histories on each controlled edit; original serialized content and review authority remain the same.
