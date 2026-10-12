# Mapping workbooks in the original GIS workspace

The mapping workbook carries the complete saved source and mapping choices into a spreadsheet, then returns an analyst's changes to the same GIS workspace. The native mapping editor remains the place to save and review the complete resulting plan. The saved workspace keeps the original register, edited XLSX, proposed plan, final saved plan and their full comparison together.

Use this workflow for a customer who reviews field names, data types, null handling, coordinate systems, keys or project choices in a spreadsheet. The register is generated from an actual saved plan and its retained capture. It includes every source field and layer, the complete plan, ordered project layers, original source bodies, native field profiles and the saved review history.

## 1. Select the original saved plan

Open the existing **GIS migration** application and read its Sources and Plans. Select the capture and saved plan the customer is reviewing. Keep the actual workspace ID; the operator, merchant and native engine all use that same identity.

In **Mapping → Customer mapping workbook**, select the saved plan and choose **Export Mapping-Register.json**. A saved plan's detail view also offers this export. The response includes the exact original JSON file and its complete byte count and SHA-256. The browser verifies those bytes before download.

The original plan can be a saved draft. Its actual review state is included in the register. Continue through the normal native review after the returned mapping has been saved.

The installed command provides the same export:

~~~sh
starforge migration-operator workbook-register \
  --workspace /absolute/original/migration-workspace \
  --python /absolute/path/to/operator-python \
  --expected-workspace-id ORIGINAL_WORKSPACE_ID \
  --plan-id ORIGINAL_SAVED_PLAN_ID \
  --output /absolute/private/workbook/Mapping-Register.json
~~~

Choose the real IDs returned by the existing workspace and an output path outside that workspace. The command uses the selected ordinary Python environment and original engine. An existing output can be reopened only when its full bytes match the original result. A different exported revision uses its own output path.

## 2. Build the customer's complete XLSX

The unchanged original exporter and renderer are included under [mapping_workbook](mapping_workbook/README.md). The renderer creates the complete workbook, retains the identical JSON register beside it, and writes every declared original input under originals/. It also retains its original request, publication checkpoint, output manifest and available previews.

Use the supplied spreadsheet authoring runtime with its installed @oai/artifact-tool package. Copy the unchanged renderer into a private builder directory, bind that directory's node_modules to the existing runtime dependency directory, and run it there:

~~~sh
mkdir -p /absolute/private/mapping-builder

cp /absolute/selected/stac/migration/mapping_workbook/build_mapping_register.mjs \
  /absolute/private/mapping-builder/build_mapping_register.mjs

ln -s "$CODEX_PRIMARY_RUNTIME_NODE_MODULES" \
  /absolute/private/mapping-builder/node_modules

"$CODEX_PRIMARY_RUNTIME_NODE" \
  /absolute/private/mapping-builder/build_mapping_register.mjs \
  /absolute/private/workbook/Mapping-Register.json \
  /absolute/private/workbook/rendered
~~~

Reuse an already correct dependency link. The link belongs beside the copied renderer because Node resolves its package imports from that source location. The supplied Node executable alone does not change that resolution.

The native register export, workbook return, plan saving and customer receiving use the product's existing Python/Node environments. The supplied authoring package is needed when producing a new XLSX with this original renderer.

Give the customer the complete rendered output. Keep Mapping-Register.json beside Lutra-GIS-Mapping-Register.xlsx. Preserve the output directory when resuming an interrupted render; the original PENDING.json and COMPLETE.json continue the original publication from its retained files.

## 3. Review the editable choices

White choice cells are editable. Gray source cells identify the original records. Keep the exported worksheet names, row order, headers and gray cells intact. Filtering is available. Restore the original order if a spreadsheet sort has changed it before returning the file.

The importer accepts the following complete choice groups:

| Worksheet | Choices returned to the native plan |
| --- | --- |
| Field mapping | Target field, target type, null handling and mapping note for every selected source field |
| Layers | Target layer name, destination format, geometry treatment and layer note |
| Coordinates | Target coordinate system and its rationale |
| Keys | Composite-key name, null handling and note, associated with the complete existing ordered key |
| Projects | Project title, filename, coordinate system and note |
| Project layers | Existing layer selection, display name and complete JSON options |

The exact exported headings and permitted values remain visible in the workbook. The native plan normalizer validates their resulting values against the original capture.

For composite keys, a changed name, null rule or note on one member applies to the whole key. Multiple changed cells for that same key must agree. Existing key membership and ordering are retained. Make key membership changes, row additions/removals and other structural changes in the full native editor.

The workbook's Original choices sheet is the retained comparison baseline. Preserve it with the other source sheets. The return reader checks that baseline against a fresh export of the selected original plan. It also checks the original workbook overview, source identity cells and row association before applying any choice.

The renderer keeps exact source numbers as text when spreadsheet conversion would alter them. It splits values larger than one cell into Text details and retains their complete original value in the JSON register. The importer preserves those original long values; edit a long choice in the native plan editor after loading the proposal.

Computed workbook columns are for the reader's convenience. The importer derives the actual complete change list from the selected original register and edited choice cells. Editable cells use literal values; enter a choice as text instead of a spreadsheet formula.

## 4. Return the reviewed workbook

In **Mapping → Customer mapping workbook**:

1. Select the original Mapping-Register.json.
2. Select the complete reviewed XLSX.
3. Choose **Review workbook changes**.
4. Open any changed choice to read its complete original and proposed values.
5. Choose **Load complete plan into mapping editor**.

The review shows the selected base plan, capture, changed cells and changed mapping choices. It produces the full native plan, preserving every unchanged field, layer, key, project and option. Its full source pair remains attached to that loaded draft.

The browser binds each proposal to the exact selected pair. Selecting another register or workbook invalidates the preceding proposal. Pending file reads retain their own selection identity, so a slower prior read cannot replace the most recently selected file. A stale review or old Load button requires a review of the current selection.

The panel offers **Download complete change review** and **Save complete workbook return**. The latter retains both complete source files and the complete proposal in one portable JSON file. **Import complete workbook return** opens that packet and recomputes its proposal through the selected native workspace before loading it.

Keep each register and XLSX within 16 MiB, and their combined decoded size within 24 MiB. The complete portable return can be up to 40 MiB. These limits refer to whole files; a partial register or workbook cannot be returned.

## 5. Save and review the complete native revision

After loading the proposal, review the full mapping in the existing editor. It remains editable. Make any agreed structural or long-value changes there, then use the original **Save plan** action.

The save validates the original register and edited XLSX again inside the existing mutation. It normalizes the final complete plan against its actual capture and retains both the workbook proposal and any additional native editor changes. The original request journal checks a replay before evaluating the workbook source, so a recovered save returns its original result.

The complete source pair stays in the existing browser draft checkpoint. Starting a different mapping draft, copying another plan or importing a different plan clears its prior workbook association. The normal source, revision, actor and request identities continue to govern the save.

Reopen the saved plan and record the normal accepted or changes-requested review with its actual note. Use that accepted plan for native conversion, QGIS projects, map publication and customer receiving. A correction to source data belongs to the original corrected-edition workflow; choose its actual new capture and complete plan.

## 6. Use the same flow from CLI, API or MCP

To prepare a complete portable return from two original files:

~~~sh
starforge migration-operator workbook-propose \
  --workspace /absolute/original/migration-workspace \
  --python /absolute/path/to/operator-python \
  --expected-workspace-id ORIGINAL_WORKSPACE_ID \
  --register /absolute/private/workbook/Mapping-Register.json \
  --workbook /absolute/private/workbook/Reviewed-Mapping-Register.xlsx \
  --output /absolute/private/workbook/Workbook-Return.json
~~~

This command opens both regular files without following a final symlink, checks their size and complete file identity during the read, invokes the original engine and publishes a create-only portable return. Open that return in the Mapping panel to review and save its complete plan.

The original API commands and merchant tools expose the same workflow:

| Native command | Merchant tool | Complete input |
| --- | --- | --- |
| mapping-register | merchant_migration_mapping_register | Selected workspace and planId |
| workbook-propose | merchant_migration_workbook_propose | source / sourceJson with the complete register and workbook |
| save-plan | merchant_migration_save_plan | Complete plan plus optional workbookSource / workbookSourceJson, original revision, requestId and actor |
| review-plan | merchant_migration_review_plan | Saved planId, actual review decision and note, original revision, requestId and actor |

The workbook source object has schema starforge.gis-migration-workbook-source.v1, registerBase64, workbookBase64 and filename. Native API commands take that object directly; the merchant tool's sourceJson and workbookSourceJson fields carry its complete JSON text. The complete portable return has schema starforge.gis-migration-workbook-return.v1, source and proposal.

Use the returned planBase64 or the existing exact JSON codec when retaining precise numeric tokens. The merchant's save tool accepts complete planJson and keeps its original bytes. Its original result download and request-recovery paths remain available for large responses.

Both export/proposal commands are read operations. Saving and review use the existing write operation and journal. The two workbook reads run to the completion of the actual original operation; the installed operator's short control-command timeout does not terminate a full workbook return.

## 7. Deliver the complete saved workspace

Every saved workbook input retains these five complete files under its original workspace input record:

| File | Purpose |
| --- | --- |
| Mapping-Register.json | Exact selected native register and original source bodies |
| Edited-Mapping-Register.xlsx | Exact returned workbook bytes |
| proposed-plan.json | Complete normalized plan derived from the workbook |
| saved-plan.json | Complete final plan saved after native editor changes |
| workbook-review.json | Every workbook choice change, subsequent native edit and original association |

Open **Retained mapping workbooks** on the saved plan to download any of them. The input record's existing files list declares all five files. The original complete-workspace export and receiver carry those declarations and bytes with the original captures, plans, review history, native output, maps, publications, event journal and selected application source.

Receive the full archive into a separate workspace through the product's [receiving guide](../../../../../products/gis-migration/RECEIVING.md). Reopen the original selected plan, its workbook input files and its native maps. Continue from the application source included in that archive, then export and independently reopen the complete onward delivery.

The portable native application includes the original QGIS analyst and Field/PostGIS sources as well as the workbook reader, unchanged exporter/renderer and this guide. The installed distribution also carries the original merchant, managed operator and browser entrypoints.

## Source lineage

The original mapping_register.py, build_mapping_register.mjs and their README are adopted without changes from the existing mapping-register source. The integration adds workbook.py and public/workbook.mjs and joins the original workspace, engine, server, managed operator and merchant tools. SOURCE_ADOPTION.json in the product directory retains the original source identities, the full native analyst source join and these integration paths.
