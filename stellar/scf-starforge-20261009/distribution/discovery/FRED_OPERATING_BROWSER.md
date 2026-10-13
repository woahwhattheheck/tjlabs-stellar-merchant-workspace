# Economic procedures in Operating Plans

The FRED procedure controller uses the existing Operating Plans editor, catalog, saved-plan store and complete-history receiving. It prepares an editable customer procedure from a retained economic source descriptor and appends reviewed results to that same plan.

## Open the source and prepare the procedure

Open **Operating plans** from the installed Command finder and choose **Economic procedure**. A Command finder result also offers **Select for economic procedure**; the selected actual registration is highlighted among the phase choices.

Choose the original **source.json** from the native FRED operating-source package. The descriptor travels with the complete economic project and any retained current-publication archives. The browser shows:

- Original project ID, revision, creation/capture context and every history checkpoint.
- The original economic selection and complete saved inventories.
- Each publication operation's original view and, when complete, the exact edition path, byte length and SHA256.
- Every original result reference and the complete artifact identity that carries it.

The selected descriptor's complete bytes and file SHA256 are shown after file import. The native source receiver verifies the carried project and publication bytes, reopens their original source graphs and checks project-history continuity.

Enter a stable plan ID, title, customer, operator and period. Review all ten phases:

| Phase | Work retained in the plan |
| --- | --- |
| Sources | Receive the economic project and complete publication editions |
| Acquisition | Select the actual API, ALFRED or current-publication source edition |
| Review | Review original observations, meaning and analyst reports |
| Recurring | Continue the saved briefing template and successor lineage |
| Releases | Work the saved release watch, catch-up plan and explicit vintages |
| Migration | Review the original Board package, mappings, units and receiving |
| Historical | Receive the selected ALFRED vintage and original metadata coverage |
| Publications | Deliver the existing complete current-publication comparison |
| Customer | Continue the configured merchant and customer delivery |
| Handover | Carry the editable procedure, complete sources and both histories |

Each phase can remain a manual step or select an actual registration from the current installed catalog. Arguments are a separate JSON string array. **Use selected command help** copies the maintained registration's help arguments so the operator can inspect and replace them with the exact intended operation. The saved plan retains the original registration snapshot and argument array separately.

Choose **Preview procedure**, inspect every step and its source inputs, then **Create reviewed procedure**. Changed source text, catalog or form values invalidate the preview. Creation uses the original editor transaction and retains the active working draft before switching plans. The same preview can be downloaded as complete plan JSON.

## Edit and record the work

Use the original plan editor to change owners, instructions, selected commands, ordering, status and customer wording. **Save revision** retains those changes in the existing complete history.

To record a source-backed result, open the saved FRED procedure and load the original source descriptor or a descriptor from a later revision of the same economic project. The source must include the original project history prefix used when the plan was created.

Select an existing FRED phase, recorded status and reviewing operator. Enter the reviewed result:

```json
{
  "summary": "The reviewed receiving and complete files are ready for the customer.",
  "evidenceIds": ["EXACT_ID_FROM_THE_SELECTED_SOURCE"]
}
```

The example shows the input shape. Use the actual returned source reference. **Include this reference** adds a selected original ID directly from the reviewed source. Each reference displays its kind, original locator and complete artifact identity. A completed step requires at least one such original reference.

Choose **Review result revision** and inspect the resulting full plan. **Save reviewed result revision** receives it through the original complete-history transaction. Source, plan or result changes invalidate the preview. A removed phase must be restored explicitly in the customer plan before recording an outcome for it.

Results are added to the latest saved customer revision. Save customer edits first when they should form part of that revision; any remaining working draft is retained by the existing editor. Earlier revisions, other phases and original registration choices stay available.

## Complete handover and continuation

Use **Complete editable JSON** or **Download current saved plan** to carry every saved revision. Keep the source package together: source.json, its complete native project file and every listed publication archive. The full artifacts retain their original paths and identities; the descriptor itself is a source index.

On the receiving host, use the maintained `fred-operating-plan receive-source` command for the source package and **Import complete plan** for the editable procedure. The existing prefix-history receive preserves later customer revisions. Divergent plans remain available for an explicit comparison or separate copy.

The Command finder and browser controller use the same pure FRED bridge as native and installed operators. The existing economic workspace continues to perform acquisition, review, recurring briefing, release planning, migration, publication and customer delivery. The procedure retains the selected commands, instructions and actual reviewed results around that work.

## Maintained source

- Browser controller: `discovery/public/fred-operating-plan.mjs`.
- Source and plan rules: `discovery/fred-operating-plan.mjs`.
- Saved plan and receiving: the original `discovery/operating-plan.mjs` and editor.
- Explicit browser imports and guide route: `discovery/browser-assets.json`.
