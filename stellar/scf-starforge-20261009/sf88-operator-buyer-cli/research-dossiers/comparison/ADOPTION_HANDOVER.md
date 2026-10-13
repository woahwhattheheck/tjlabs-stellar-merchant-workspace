# Complete Research adoption handover

This command freezes one selected native author revision and adoption plan together with the contributor’s exact returned dossier. It completes the review and return workflow across Research and the maintained LDA Research handovers workspace. It supports complete, partially accepted and superseded plans and preserves each status.

## Choose the actual saved result

Use the existing adoption workspace to inspect the original plan and choose an explicit author revision. The selected plan’s ID and the selected revision identify the delivered result. If a plan has been continued, the handover includes all its ancestors and successors that exist at that revision. Later legitimate work on either dossier remains separate.

Run from the installed research-dossiers directory:

```bash
node comparison/adoption-handover-cli.mjs \
  --store /absolute/original-research-store \
  --dossier d_ORIGINAL_UUID \
  --revision SELECTED_INTEGER \
  --plan cmpadopt_ORIGINAL_PLAN_HASH \
  --operation ORIGINAL_HANDOVER_OPERATION \
  --directory /absolute/private-adoption-handover
```

The original comparison command also accepts `adoption handover` followed by these same arguments. Node and Python must already be installed; `--python /absolute/python` selects a particular installed Python. The command uses the original local dossier store. Its reusable producer is `exportAdoptionHandover(store, dossierId, options)` in adoption-handover.mjs. It borrows the original store and does not own its lifecycle.

## What the recipient receives

Research_Comparison_Adoption_Handover.zip contains exactly twenty ordinary members:

| Member | Contents |
| --- | --- |
| manifest.json | Fixed family/schema, selection and each member’s exact bytes and SHA-256 |
| selection.json | Operation, dossier, author revision/head, adoption plan, original source, case, protocol and question |
| author.research.json.gz | Complete original author dossier through the selected revision |
| returned.research.json | Exact original contributor file bytes retained by the plan |
| adoption.json | Complete original selected adoption result, including reviewed plan and accepted native receipts |
| adoption.html | The original native human-readable result with complete result JSON |
| lineage.json | Every original ancestor/successor result in this adoption family, evaluated at the same selected revision |
| README.md | Opening and receiving instructions carried with the archive |
| engine/ — twelve files | Complete fixed inspection dependency set in its original relative topology |

The fixed returned.research.json member name is an archive role. Its bytes may be plain JSON or gzip; its actual original filename, media type, size and digest remain in `report.plan.source`. Save it under that original filename when opening it with an application. No conversion, recompression or regenerated exportedAt value replaces the contributor’s file.

Both native portable members preserve their full revision history and retained original content, including raw producer results and artifact bytes. Reference-only external editions retain their original references and access terms. The producer does not fetch those external sources.

The twelve engine members are node/store.mjs; research-dossiers/portable.mjs; research-dossiers/comparison/contracts.mjs, model.mjs, render.mjs and inspect-handover.mjs; research-dossiers/dossier-returns/contracts.mjs and source.mjs; and research-dossiers/comparison/adoption-contracts.mjs, adoption-model.mjs, adoption-render.mjs and inspect-adoption-handover.mjs. The original comparison handover family and its thirteen-member archive remain unchanged.

## Reading the adoption correctly

The selected result reports the original accepting operator, review time, review statement, source question and editions, full reviewed plan, target decisions, accepted native operations and source-to-author mappings. The original researcher and reviewer remain separately attributed in the retained returned records. An author-side adoption performs ordinary comparison operations; it does not rerun an experiment or recalculate a metric.

Each lineage result has its own reviewed plan and accepted prefix. An old plan can be SUPERSEDED while its accepted case and candidate continue through a later plan. A continuation inherits the already accepted mappings and schedules only its remaining operations. Read all lineage entries before assessing the completed family. The accepting operator’s explicit decision is preserved as recorded; local LDA staff notes have their own authority and attribution.

The installed inspector returns the full selected native report, whole lineage, author history and metadata, unique author blob descriptors, and returned history, metadata, unique blob descriptors and all original comparison arrays. LDA can display the original foreign records, planned mappings and accepted mappings without guessing their state from labels.

## Exact publication and recovery

The original private lock protects the operation directory. Before creating any member, intent.json records the original store path and complete selection. Reusing that directory for another plan, revision, source or operation fails. Choose a fresh deliberate operation and directory for a later handover.

The first complete author portable is retained atomically. A retry reuses its exact bytes, including exportedAt. The original returned source is streamed from retained source chunks, checked against the original source size and digest and published without replacement. JSON, HTML, lineage, README and all engine members must remain exactly equal to the retained originals. The manifest fixes that entire generation.

The complete fixed inspector runs before archive creation. Python writes a private temporary ZIP, checks every original member, syncs and publishes it without replacing another file. A reused ZIP is reopened and checked again, including complete member order, size, digest and ordinary-file permissions. handover-result.json is an immutable final receipt. Keep the complete operation directory after interruption and retry the same original command.

The producer never submits another adoption request. It reads a fixed historical generation and does not change the author or returned dossier.

## Installed inspection and complete native receiving

Use the maintained fixed inspector:

```bash
node comparison/inspect-adoption-handover.mjs \
  --directory /absolute/extracted-fixed-members \
  --manifest-sha256 ORIGINAL_MANIFEST_SHA256 \
  --out /absolute/new-inspection.json
```

The LDA reader verifies the complete ZIP and fixed engine pins before staging ordinary members and invokes its own installed inspector. Uploaded engine source is retained for inspection and download; it is not executed.

The inspector validates every portable envelope, original history digest, complete blob bytes and original comparison transition. It runs the original comparison and adoption state validators. At each adoption-plan commit, it reconstructs the retained source branch and uses the original adoption planner and transition validator to reproduce the exact plan, shared ancestor, question/source bindings, target mappings and retained native requests. Nested returned branches are validated and cached only after their original validations finish. The selected source portable must have the original source identity and incoming head.

The selected report and every lineage result come from the original adoption model at the selected author revision. adoption.json and adoption.html must exactly match the original shared native renderer. lineage.json must exactly match the whole native continuation chain. No projected summary substitutes for any full file.

This inspector covers comparison/adoption semantics and exact portable custody. Open both portable dossiers in the maintained Research application for complete semantic receiving across all other Research domains, then operate the actual editable projects. The LDA receiving course uses the existing original three-Journal handover operation and its supplied applications/browser; it does not create another host or replace original Research authority.

## Capacity and actual outgoing inspection

The whole archive and all decoded members together must fit 256 MiB. Each original portable retains its maintained 256 MiB streaming limit, 8 MiB revision-entry limit and 64 MiB blob limit. Complete JSON, HTML, lineage and inspection projections must fit 32 MiB. The fixed inspector limits the aggregate staged decoded branch closure to 1 GiB, including nested source files, original revision envelopes and blob bytes. Oversized whole selections fail explicitly; no history, record or file is clipped to fit.

Before delivery, open the full actual HTML and JSON result, full lineage, both native portable projects and every carried source member. Use the installed LDA screen to inspect original returned records, planned/accepted mappings, source-bound staff notes, exact Search selections, ordered Briefs and the received project. View the actual desktop and narrow-screen output and use the controls. The original equipped operation records actual native and browser receiving; source checks alone do not establish rendered readiness.

Use the original equipped operation’s supplied browser and observe its current owner reservation before any browser action. An isolated cloud browser can be used when the operation explicitly owns it.
