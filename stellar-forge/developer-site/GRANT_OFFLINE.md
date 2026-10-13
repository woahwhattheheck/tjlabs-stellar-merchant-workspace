# Edit a complete application offline

The original **Prepare submission** workspace can export one editable HTML file containing its complete current draft and actual editor. Open the file in a browser to continue the same application without the application host. The file includes all nine answers, issuer form mapping and recorded limits, original source editions and files, native planning selections, product declarations, saved versions, prepared handovers and observations already retained in that draft.

The editing model, validation and saved-draft format remain the original submission implementation. The HTML carries the original editor modules and styles with their exact byte counts and SHA-256 identities. It checks those sources before starting. Its module imports resolve to those retained local bytes; it makes no automatic request to an application host.

## Export from the current workspace

1. Open **Prepare submission** and select the application or an existing complete draft.
2. Review the selected title and source. Current unsaved edits are included.
3. Choose **Download offline editor**. The workspace retains its complete editor closure and downloads a file named after the draft, ending in \`-offline-editor.html\`.
4. Keep that file alongside the original complete draft and open it in a current browser.

The original **Download full draft**, **Save version** and **Save as separate draft** controls continue to work. Downloading the offline editor does not change the original draft, select another source, mark comments resolved or submit an application.

The exported HTML is an executable copy of this editor and contains the draft's full retained files and history. Transfer it only to the intended collaborators, using the same care as the complete native draft. Source hashes detect changed retained editor bytes; they are not a signature asserting who authored an arbitrary HTML file.

## Open, edit and retain an updated edition

Open the HTML in a browser that supports ES modules, import maps and Web Crypto. If a phone's document preview displays the file instead of running it, use its browser opening action or transfer the same file to a desktop browser. A browser that cannot start the retained runtime displays a specific error in the page.

The header identifies **Offline submission**. The same nine views remain available:

| View | Work retained by the original editor |
|---|---|
| Canonical answers | Complete answer text and its source selection |
| Issuer form fields | Explicit answer mapping, manual field text and recorded issuer word/character limits |
| Required content | Original required-content reviews and coverage |
| Planning edition | Actual retained planning source, selections and updates |
| Source editions | Original source snapshots and source comparisons |
| Product sources | Existing source imports and product selections |
| Submission handover | Prepared editions, received observations and original handover output |
| Saved versions | Full retained snapshots and original restoration behavior |
| Browser drafts | The existing local saved-draft store, where supported by the browser |

Edit the answers or mapped fields as usual. Limits, manual edits and history retain their original meaning. Use **Save version** to retain a version through the existing local browser store, or **Save as separate draft** for a separate local draft. The offline file starts without the sender's browser-record binding, so saving cannot address a sender-local saved row.

The original file on disk is a snapshot. **Download offline editor** creates a new complete HTML edition with the current draft and the same retained editor runtime. **Download full draft** produces the original complete JSON envelope. Keep one of those downloads after making changes; edits in an open tab do not rewrite the file on disk. If the browser cannot provide local draft storage, downloads still provide the complete portable outputs.

**Open draft file** uses the original full-envelope importer. Original unsaved-work preservation and conflict behavior remain active when changing drafts.

## Receive another source while offline

The source controls display **Open source package**. Choose a complete original reviewer source-package JSON from your device. The original source comparison and explicit receiving flow remain in charge: simply opening another source does not silently replace manual answers.

The source package retains its application, source index, budget and companion bytes. Native planning and issuer inputs remain original file-based operations in the existing views. The offline HTML does not attempt to discover a newer application or resolve remote sources automatically. External issuer/reference links are available as explicit navigation when the device has a connection.

To use a newer editor implementation, open the full draft JSON in the maintained application workspace and export a new offline edition there. Receiving a newer application source inside the offline file updates its source material, while retaining the editor runtime shipped with that file.

## Return to the maintained application

1. In the offline edition choose **Download full draft**.
2. Open **Prepare submission** on the existing installed application or published workspace.
3. Choose **Open draft file** and select that complete JSON.
4. Review the retained source and current fields, then use **Save version** or the original handover flow.

The authoritative importer verifies the same envelope hash and native draft. This route preserves answer identities, fields, limits, source bytes, planning, handover and full saved history. The HTML is not a separate saved-project record or a replacement import writer.

## Native export

Use the existing exporter from a complete checkout or installed source package:

\`\`\`sh
node stellar-forge/developer-site/grant-export.mjs \
  --draft /private/application-complete-draft.json \
  --offline-editor \
  --out /private/new-application-edition
\`\`\`

The installed command is also available through the original distribution:

\`\`\`sh
starforge grant-export \
  --draft /private/application-complete-draft.json \
  --offline-editor \
  --out /private/new-application-edition
\`\`\`

The new output directory contains all existing export files plus **edit.html**. **review.html** remains the prepared copy/print page. **draft.json** remains the complete native draft. The original manifest includes the exact bytes and SHA-256 of edit.html along with the other files; it is written after all complete files.

The same option works when starting from the exporter's explicit \`--source\`, \`--source-index\` and \`--source-url\`, and with original source-package, issuer-case and form-map receiving options. The editor opens the final prepared draft from that export. The original field-limit exit code is retained.

The native adapter reads the maintained **browser-assets.json** rather than a second list of editor dependencies. It follows the actual static imports, including original discovery/operating-plan aliases, and uses the same package builder as the browser. A missing declared source fails before a new output directory is created.

## Source interfaces and limits

\`dist/grant-offline-package.mjs\` supplies:

- \`collectOfflineRuntime({readText})\`: read the complete original HTML/module/style closure through an explicit source reader.
- \`collectBrowserOfflineRuntime({baseUrl,signal})\`: same-origin bounded stream receiving for the current installed browser assets.
- \`validateOfflineRuntime(runtime)\`: check exact source paths, sizes, hashes and complete dependency closure.
- \`createOfflineEditor({envelope,runtime,planningOptions,exportedAt})\`: validate the original draft envelope and return the complete editable HTML.

\`grant-offline.mjs\` supplies \`readOfflineRuntime({directory})\` and \`createNativeOfflineEditor(...)\` for the original exporter and installed API. The distribution exports them as \`./grant/offline-editor\` and \`./grant/offline-editor/package\`.

The package retains up to 96 editor assets, 2 MiB per source and 8 MiB total source, plus the original bounded draft envelope. Source receiving uses complete UTF-8; browser downloads are captured as bounded streams. Unsupported dynamic module loading or external stylesheet dependencies are rejected until the maintained runtime contract can retain them completely. The original native draft size and planning/source validation continue to apply.

The embedded Content Security Policy permits the retained editor scripts and styles, local generated download blobs and explicit link navigation, while disabling automatic network connections, form submission, objects and alternate base URLs. All draft JSON is embedded as escaped data, including script-like text and Unicode separators.

## Maintained receiving

Continue the existing saved-application/browser receiving case:

1. Select the actual complete draft and record its original source, fields and saved version count.
2. Export the offline HTML from the current installed workspace or original native exporter.
3. Open it from the local file with network disconnected; edit an actual answer and mapped field, retain a version, and exercise the recorded issuer limit.
4. Download an updated offline edition and full draft.
5. Reopen the updated HTML. Open the JSON in the original maintained workspace and compare the selected source, exact edited text, field mapping/limits and saved history.
6. Receive an actual source-package file through the existing comparison flow and retain another complete edition.

Use the same actual application and original receiving operation. This is a continuation of its customer workflow; it does not create a second review round, source registry, application or publisher.


## Prepare an issuer-form workbook in the offline editor

The complete offline graph also carries **Issuer-form workbook** in the original Form fields view. Prepare the baseline and profile/field CSV or TSV sheets from the retained application, read complete original answer references, receive edited sheets from the device, compare them with the current native form and apply explicit choices through the original history. Export the complete updated draft or offline HTML afterward. Keep the workbook JSON if you want to retain unfinished worksheet text before closing. [GRANT_FORM_WORKBOOK.md](./GRANT_FORM_WORKBOOK.md) describes the full spreadsheet and native return workflow.
