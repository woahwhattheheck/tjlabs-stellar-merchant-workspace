# Lutra mapping register and workbook

This directory produces the mapping workbook promised in the original Lutra workshare. The original migration workspace owns source capture, plan normalization, review, native conversion, QGIS projects and receiving. The exporter reads that saved workspace once and the renderer creates the spreadsheet from the resulting complete register.

## Select the original native input

Use the workspace and plan returned by the existing Lutra GIS receiving operation. Preserve its actual workspace ID and selected source directory. The complete native source is declared by `stac/migration/source-files.json`; public PR2350 joins the five original QGIS field-workflow files into that declaration and the original merchant contribution.

Run the read-only exporter in the Python environment that already opens this original migration workspace:

```bash
python3 mapping_register.py \
  --stac-root /absolute/selected/stac \
  --workspace /absolute/original/migration-workspace \
  --expected-workspace-id ORIGINAL_WORKSPACE_ID \
  --plan-id ORIGINAL_SAVED_PLAN_ID \
  --output /absolute/output/Mapping-Register.json
```

The placeholders identify records from the original operation. The exporter does not choose a different source or record a review. It reads one workspace revision and verifies the retained plan, source audit, capture and original input descriptors. Its output carries their complete original bodies and hashes, every source field and layer, mapped keys, null and geometry choices, CRS decisions, project definitions, ordered project layers, native field profiles, explicit decisions and the actual review history.

A saved draft can be exported with its real review state. Acceptance remains the original review operation. Choose a new output path for a different source revision or plan; an existing output is reusable only when all bytes match.

## Produce the complete workbook

The renderer uses the installed `@oai/artifact-tool` package. In a ChatGPT cloud session, keep both scripts in a private working directory and bind its existing runtime dependencies:

```bash
ln -s "$CODEX_PRIMARY_RUNTIME_NODE_MODULES" /absolute/private/builder/node_modules
"$CODEX_PRIMARY_RUNTIME_NODE" /absolute/private/builder/build_mapping_register.mjs \
  /absolute/output/Mapping-Register.json /absolute/output/workbook
```

Use an already correct dependency link when present. For the first actual spreadsheet-authoring command in this task, run the spreadsheet skill's prescribed operation marker once immediately before the renderer. The renderer requires no new package installation or provider service.

The output includes:

- `Lutra-GIS-Mapping-Register.xlsx`, with the overview first and the complete editable mapping register.
- `Mapping-Register.json`, identical to the selected native export.
- `originals/`, containing every original plan, audit, source inspection, capture manifest and original input body retained in that register.
- `Mapping-Register-Guide.txt`, with operator editing and review instructions.
- Rendered workbook previews and the actual bounded workbook inspection, when the selected sheet size supports rendering.
- The exact build request, publication checkpoint and complete output file manifest.

Source fields, layer metadata, coordinates, key components, project-wide decisions, ordered project layers, native profiles and review history remain separately filterable. Original choices are retained beside the working register. The overview counts proposed edits through formulas; the builder makes and restores one actual cell edit to check that calculation before exporting the workbook.

Identifiers, hashes, long source values and precise decimal tokens remain text where spreadsheet number conversion would lose information. Values too large for one cell are split into numbered `Text details` rows, with their exact complete value also retained in the original register. White working cells are the operator's editable choices; gray source fields describe the selected native input. The style is neutral and deliberately plain.

## Apply an analyst's correction

The workbook is an editable review and handover document. Enter accepted changes into the original migration desk's complete plan editor, or use its maintained `save_plan` operation with the same explicit choices. The native engine then validates all source fields, keys, null treatment, formats, geometry, CRS and project bindings and records a new plan and review.

Use that actual new plan to regenerate the workbook. This preserves the original source history and makes the revised native plan, spreadsheet and eventual QGIS receiving refer to the same records. A spreadsheet edit itself does not change the native workspace.

## Continue after interruption

Rerun the same renderer command with the same register, source file and output directory. `build-request.json` binds the original register bytes, workspace/revision, plan, capture and renderer source. A completed output is reopened only after all recorded file bytes and hashes match.

Before exposing any final workbook path, `PENDING.json` retains every produced file descriptor and its private staging directory. If publication is interrupted, the same command completes from those retained bytes; it does not regenerate a second workbook over a partially delivered one. `COMPLETE.json` is saved only after the entire declared output is present.

For a different input or renderer revision, select a separate output directory. Preserve an existing pending directory until its original publication has been completed or deliberately retired.

## Source and execution ownership

The native register exporter and the complete renderer have independent source reviews, including original-body custody, exact numbers, complete field/project coverage, editable-choice calculations and restart-safe output publication. The actual workbook and layout inspection are produced by the one native rendering over the original returned Lutra workspace.

The original QGIS/capture/receiving producer remains the existing Lutra operation. These helpers add its promised spreadsheet deliverable through the maintained plan and source interfaces.
