# Zotero customer commissioning and returned-project delivery

This course commissions a recurring evidence-library service and carries one useful delivered project through independent customer editing, author reconciliation and a complete revised handover. It uses the installed Zotero workspace, its original SQLite history, the existing Research dossier and the customer's existing Merchant configuration.

Start with [OPERATING.md](./OPERATING.md). The original customer-agent configuration is in [MERCHANT_SETUP.md](../../stellar/scf-starforge-20261009/sf30-seller-sdk/zotero/MERCHANT_SETUP.md). The selected package and [native receiving course](../../stellar/scf-starforge-20261009/sf30-seller-sdk/zotero/NATIVE_RECEIVING.md) remain the implementation and execution entry points.

## Agree the useful service

The first delivery should answer a named research question for a receiving team, using an agreed collection scope and an output the team can actually continue. Record the following in the original customer workorder before adapting the installation.

| Commissioning decision | Record in the existing case |
| --- | --- |
| Source and authority | Original user/group library ID, source owner, permitted access, source/reuse terms and any separate rights for full text. |
| Useful research task | The question, intended audience, required evidence classification, finding format and practical use of the delivered update. |
| Collection scope | Original collection keys, descendant choice, explicit trash policy and treatment of child notes/attachment metadata. |
| People and responsibility | The source owner, author/operator, customer reviewer, receiving maintainer, implementation payer and person authorized to accept a revised delivery. |
| Delivery | The selected source edition, project and Research dossier/question; complete editable project; required report and original-file exports; private receiving destination. |
| Update and return | The actual cadence or event that calls for another edition, how the customer sends back its complete progressed project, and who resolves a substantive disagreement. |
| Commercial scope | Agreed installation/adaptation, later update work, support responsibility and each separately approved paid source/buyer operation. |

The installation can use a public library or the customer's authorized private library. Private API-key values stay in the original host environment; the source profile stores its environment-reference name. The receiving host supplies its own current private listener binding. Put working data outside the source checkout.

An item’s attachment metadata identifies an attachment. Delivering that metadata does not acquire its PDF or establish redistribution rights. Record a separately supplied full-text original and its access terms when the work actually needs it.

### Existing OSF programme

Continue the completed original `SCF-ZOTERO-LIBRARY-RESEARCH-DELIVERY-20261012` case with SDK12 / Root2D58. Its retained source is OSF group **479248**, library version **11212**, with **5,503 metadata items**, **18 collections** and **58 original API responses**. The original four-root project contains **1,254 items**. Its Research handoff has **1,255 occurrences**, **1,236 normalized sources** and **five source-linked findings**, and the original Research receiving reached revision **5**.

These are different parts of the same saved source path. A library item, selected project item, evidence occurrence and normalized source have different identities and purposes; retain their original counts in their appropriate records.

The original public-source archive is `OSF_Original_Catalogue_And_Research_Reports_2026-10-13.zip`, 8,150,009 bytes, SHA-256 `c3fa9d12ea5bfbac58e19303d63a4b94c91f52f2b6d479691080814764c412d3`. The original native owner retains the completed 258,846,497-byte project archive. Retrieve that already-saved archive through its original case locator and preserve its workspace, project, dossier and receiving history. The return course begins there.

## Prepare one complete baseline delivery

Open the actual saved library/project and original Research binding through the current installed application. Verify the selected profile and source edition, then page the original project through the terminal page. Review the actual collection tree, selection, evidence notes and findings against the commissioned question.

The baseline must retain the original project identity and saved revision that both the author and customer will branch from. Use `project.return.prepare` to freeze that exact reviewed project, its history and original source as an immutable `project-delivery` record; download its complete JSON. Retain the delivery identity, original length, SHA-256, source edition and project revision. The dedicated delivery is an independently editable portable packet with the selected project's full history, source editions, profile history and original source objects. Also export the whole workspace when the receiving customer needs the linked Research dossier.

An accepted export UUID always identifies its original exported edition. If the author changes a note later, an unchanged retry of that UUID still returns the originally delivered bytes. A genuinely later delivery uses a new export UUID. This distinction makes a later customer return attributable to the baseline that the customer actually received.

Use the existing typed client, CLI or customer-agent file interface. A customer-agent file read is complete only when every returned chunk has been assembled through the reported terminal offset and its full length and digest match. The current maximum chunk is 196,608 bytes; full-project transfer retains the existing 256 MiB limit. Preserve an unfinished file reader for continuation, then release it after the whole file is received.

## Receive and edit the customer's working copy

Receive the whole baseline into a new private directory or the original named receiving child, using one stable receiving UUID. A retry keeps the same packet, directory/name and UUID. The receiving record and original source ancestry travel with the project.

Through the customer-agent interface, use the returned `childWorkspace` alias for the actual child. Through the browser or CLI, open that same received directory and its current connection. The original source and selected project remain identifiable. When the received packet is the whole workspace, its original linked Research dossier travels with it; the dedicated project delivery has no Research dossier copy.

Have the receiving operator perform a useful review change in that copy: revise an evidence classification or source note, adjust the agreed project selection, or update a source-linked finding. Use actual source keys and the saved expected revision. Record the reason in the project's existing fields where appropriate. Continue independent Research review through its maintained Research interface.

While that review occurs, the author may continue its own original project. Preserve those later revisions. Use `project.return.prepare` in the customer's progressed copy to retain and download its complete returned project. Return that whole immutable JSON file with its original identity. The importer also accepts the original full-workspace format. The original delivered baseline and both independently progressed histories are the inputs to reconciliation.

A project-delivery return includes its original project history and source objects. The complete-workspace alternative also carries the linked Research installation. A spreadsheet of changed notes, a screenshot or a report preview cannot supply the project's complete original ancestry.

## Reconcile the returned project

Use the installed returned-project workflow on the original author's project. Retain the complete customer file as its original source before reviewing changes. Select the same original project and the actual common saved ancestry. The source engine establishes the baseline and validates the returned history; the operator should never type a guessed common revision to make two unrelated projects appear compatible.

Review the original baseline, the author's current value and the customer's returned value together. Work through each changed selection, classification, note, finding and supported project field. Preserve independent changes according to the maintained comparison's proposal. Where both sides diverge, explicitly choose `local`, `returned` or `base` for that field and retain the decision reason. The comparison covers title and description, collection scope, item selection/classification/note, and findings including deletions. A field deliberately cleared by a reviewer remains different from an unchanged field.

A useful review considers the whole evidence relationship. For example, a returned finding may refer to an item that the author has subsequently deselected. Review the relevant source and selection together before accepting the combined result. The native validator decides whether the final project is internally valid; a superficially successful file import does not establish that the scientific interpretation is correct.

A previously applied customer branch retains its incoming ancestry, so a later return can find that real common history. The same numeric revision number on two branches does not establish a common base. A changed source edition follows the original source-review/update workflow and a compatible delivery; this return path reconciles projects over the same original source edition.

The original Research dossier has its own customer-return workflow and history. A Zotero project return changes the library/project review. Continue downstream evidence publication through the original Research preparation and receiving path, with its actual current dossier revision. Use the existing 396C Research handover desk for returned Research decisions. These linked records retain their separate writers and attribution.

### Exact installed return controls

The typed client is exported from `@tokenjunkielabs/starforge-merchant/zotero/client`. Open the actual private connection with `createZoteroClient(await loadZoteroConnection(connectionFile))` and call `verify()` before using it. Keep the actual project ID, current revision and stable request UUIDs in the original workorder. These controls operate that same installed workspace:

| Stage | Exact interface and retained result |
| --- | --- |
| Freeze a selected project | `client.invoke('project.return.prepare', {projectId, projectRevision}, prepareUuid)` returns `record` with kind `project-delivery`, ID and revision, plus `value` with the original project revision, object and filename. |
| Download the frozen project | `client.download(prepared.record)` returns the complete `bytes`, checked `sha256`, content type and filename. Save those unchanged. |
| Receive an independently editable copy | `client.receiveWorkspace(delivery.bytes, {name, requestId: receiveUuid})` uses the original named-child receiver. `openReceiver(name)` reopens that receiver. The dedicated project delivery carries project/source/profile history and source objects; a whole-workspace export additionally carries linked Research dossiers. |
| Retain a customer return | `client.importProjectReturn(returnedBytes, {projectId, requestId: importUuid})` returns the retained `project-return` record. Its input may be a dedicated project delivery or the original whole-workspace format. |
| Read the comparison | `client.invoke('project.return.preview', {id: returnId, offset, limit})` returns baseline/local/returned identities, `previewSha256`, field rows, review state, readiness and issues. Follow `nextOffset` through `null`; the maximum page limit is 200. |
| Save decisions | `client.invoke('project.return.review', {id: returnId, expectedRevision, expectedProjectRevision, previewSha256, choices, note}, reviewUuid)`. Supply the current return revision, current author project revision and exact current preview hash. `choices` maps actual returned row IDs to `local`, `returned` or `base`. |
| Apply the reviewed result | Refresh the preview after saving decisions. If it is ready, call `client.invoke('project.return.apply', {id: returnId, expectedRevision, expectedProjectRevision, previewSha256}, applyUuid)` with the refreshed identities. Its `record` identifies the resulting project revision and `returnRecord` identifies the saved reconciliation outcome. |
| Download the original return or review | `client.download({kind: 'project-return', id: returnId, revision, role: 'source'})` returns the original uploaded bytes. Omit `role` to download the saved review record. |
| Deliver the whole progressed workspace | `client.exportWorkspace(deliveryUuid)` returns the complete bytes and checked hash for the revised customer handover. |

The comparison's `base`, `local` and `returned` identities contain revisions and hashes. Each changed row contains its stable `id`, field `path`, original/local/returned cells, automatic proposal and explicit choice. A cell's `present` flag distinguishes a deletion from an empty value. Review the complete rows and issues, including `summary.unresolved` and `ready`, before applying.

A saved partial review is useful working state. When saving again, carry the complete intended choice map for that review; `choices` is the saved selection, not a patch of only the last clicked row. Keep any unresolved decisions for the next review. Applying requires a saved ready review. An author's intervening change invalidates the old comparison; refresh it and review the new values.

Customer-agent operators use the existing configured workspace alias and `merchant_zotero_save` for prepare/review/apply, `merchant_zotero_view` for the preview, and `merchant_zotero_return_import` with `{workspace, requestId, projectId, sourceFile}` for the actual configured return file. `merchant_zotero_export` selects `{kind: 'record', record: prepared.record}` for the immutable delivery. Use the original `merchant_zotero_request` and `merchant_zotero_resume` for a saved request's outcome or interruption. The retained file reader and named receiving child use the original setup guide.

A direct typed client's `close()` detaches its attachment. Use the existing managed/owned lifecycle documented in the operating guide when stopping an owned server or customer-agent workspace.

### Browser and installed CLI

Open **Returned projects**, whose page heading is **Returned project review**. Choose the actual saved project, then **Prepare complete project handover** and **Download prepared project handover**. After the customer sends its progressed file, use **Retain complete returned source**, select its **Saved return** and read all changed values. **Save reviewed choices** retains the working review; **Apply reviewed return as a new project revision** commits the reviewed outcome.

**Download original returned bytes**, **Download saved review** and **Complete return history** retain the audit trail. **Open current saved project** opens the result. The review's **Download review working copy** and **Open selected working copy** preserve the review draft for continued operation. **Resume original request** continues its original saved request after an interruption.

The installed CLI is `starforge zotero` (or `npx --no-install starforge zotero` from the installed package directory). Each command below also takes `--connection ABS_PRIVATE_JSON`, selecting the current connection file for the original workspace.

| Command | Arguments |
| --- | --- |
| `project-handover` | `--project PROJECT_ID --project-revision REVISION --request-id UUID --out FILE` |
| `return-import` | `--project PROJECT_ID --file RETURN_JSON --request-id UUID`; optional `--out FILE` |
| `return-preview` | `--id RETURN_ID`; optional `--offset OFFSET --limit LIMIT --out FILE` |
| `return-review` | `--id RETURN_ID --revision RETURN_REVISION --project-revision LOCAL_REVISION --preview-sha256 HASH --choices-file CHOICES_JSON --request-id UUID`; optional `--note-file NOTE_TEXT --out FILE` |
| `return-apply` | `--id RETURN_ID --revision RETURN_REVISION --project-revision LOCAL_REVISION --preview-sha256 HASH --request-id UUID`; optional `--out FILE` |
| `return-download` | `--id RETURN_ID --out FILE`; optional `--revision REVISION --role source` |

The choices file is the complete JSON object mapping actual row IDs to `local`, `returned` or `base`. Removing an entry removes that prior explicit choice. Page the whole preview and refresh it after a saved review; use its new revision and digest for Apply. Keep the UUID and exact input for each save in the original operating record.

## Apply and hand over the revised result

Before Apply, confirm the reviewed author project revision is still current. If another author edit arrived during review, refresh the native comparison against that actual revision, keep the retained customer return, and resolve the changed proposal. An outdated review must not overwrite a newer author decision.

Save the explicit choices and review note with `project.return.review`, then apply through `project.return.apply` using one original durable request UUID. The maintained writer atomically adds the reviewed project revision and retained apply result against the exact current preview and local revision. Retain its returned comparison/review identity, source identity and original project revision/result. After an uncertain response, look up that request and continue it with identical input. A replacement UUID is not recovery for a save that may already have completed.

Open the resulting author project and inspect the useful outcome against the commissioned question. Confirm the accepted returned material and the author's retained changes in the actual interface. Keep the original customer return, the review and the resulting project history together.

Prepare or revise the linked Research handoff through its original workflow when the chosen evidence or findings should enter the dossier. Review the actual source bundle and target dossier/question, then receive against its current revision. Large views use complete per-item JSON and the compact manifest's original-file and lineage links; full abstracts and unknown metadata stay in their original files.

Export the complete progressed author workspace under a new delivery UUID. Deliver the agreed reports and full original files alongside it. A second receiving maintainer opens the whole revised project, reads the actual accepted decisions and linked dossier, makes a useful continuation, then exports and cold-reopens that same saved work. This establishes a practical maintained service beyond the initial report.

## Customer delivery contents

Keep one clear opening guide with the delivery. It identifies the actual selected source and project, the useful result, the current operating entry and how to reopen the complete working project.

| Delivery member | Customer use |
| --- | --- |
| Complete progressed Zotero workspace | Reopen the exact library/project history and linked Research state; continue work through the installed product. |
| Immutable baseline and returned project deliveries, retained return and reconciliation outcome | Explain the actual common history, customer changes, explicit resolutions and resulting author revision. |
| Selected source edition and original files | Inspect original metadata, source pages, item/collection identities and source terms. |
| Agreed evidence/report exports | Read or use the customer-facing result without starting the full operator. |
| Current installation and private-host instructions | Open the selected package against the real receiving store, with destination-specific credentials and listener bindings. |
| Workorder and service handover | Identify the receiving maintainer, next useful update, support route and actual accepted scope. |

Private live capabilities, API-key values, database writer locks and process handles stay with their host. The handover supplies source, history and operating instructions; the receiver creates its own current private connection through the maintained product.

## Commissioning course and acceptance

Run one complete meaningful customer course on the original OSF programme or the actual commissioned customer's authorized saved source. Use a real selected item and a useful authored note/finding. Do not invent an accepted customer opinion, payment or clinical/scientific finding to populate the course.

1. Open the exact baseline, read its full selected view, freeze/download the immutable project delivery and provide the complete workspace for independent operation.
2. Receive the baseline independently, edit a source-linked review, and freeze/download the complete progressed returned project.
3. Make an independent author change in the original workspace; retain both complete histories.
4. Receive the exact returned file, inspect the actual common ancestry and full side-by-side changed values, and resolve a real divergent field.
5. Save or resume the same reviewed apply request, including an uncertain-response continuation using the original UUID.
6. Open the resulting project, continue the existing Research handoff where required, and deliver the full revised customer package. Make a later change in the received branch and return it again to check the retained incoming ancestry in the same real workflow.
7. Independently receive, edit, export and cold-reopen that progressed package while retaining the original source and accepted return history.
8. Operate the actual browser at desktop/screenshare and 390-pixel width. Look at the original, changed, conflict/error and reopened screens, then inspect every required customer-facing report and downloaded file. Correct clipping, overflow, unreadable values and broken controls in this same product.

The course's actual result records the source edition, baseline/returned/current/resulting project revisions, retained return and apply request, delivered files, receiving workspace and operator observations. Acceptance is the useful customer outcome: the receiving maintainer can understand and continue the reviewed evidence project without rebuilding its bibliography or losing the author's concurrent work.

Use the application's existing acceptance and cohort records for the named installation. Measure active setup/correction effort, actual receiving success, useful later operation and independent maintainer continuation there. Replaying a request, reopening a project or copying an accepted artifact continues its original operation.

## Recovery at an actual interruption

| Observation | Continue the original work |
| --- | --- |
| Return transfer stops mid-file | Resume the same retained file identity and next offset; check the complete length and SHA-256 before intake. |
| Saved apply response is lost | Inspect and resume the same native request UUID and original input. |
| Author advances during comparison | Keep the original return, obtain the new local revision through the maintained review workflow and review the resulting proposal. |
| A return lacks matching project/source ancestry | Preserve its original file and use the engine's stated incompatibility; select the actual compatible baseline/project or commission the different source as a separate edition. |
| Linked Research state has progressed | Continue its current dossier through the original Research writer and customer-return desk, retaining inherited history. |
| A receiving process is interrupted | Reuse its original packet, destination and UUID; preserve its existing marker and accepted source objects. |
| A listener close fails | Retry the same owned close and retained child/file-reader cleanup. Managed close only detaches its attachment. |
| Customer receives a new edition later | Export under a new delivery UUID, preserving the earlier delivery and accepted return history. |

## Fit to the existing funded programme

This course is the commissioning and maintainer handover for an existing source-owned product. It supplies a concrete recurring customer job for the original grant packages.

- **T1:** the existing 80-hour resource and 40-hour handover packages adapt the authorized library, collection/question, customer-agent access, useful output and independent receiving installation.
- **T2:** the existing 70-hour provider and 50-hour threat-response packages exercise the selected original service through both facilitators and recover its actual interrupted work.
- **T3:** the existing 90-hour mainnet and 70-hour recovery packages establish recurring production use, complete restore and continued operation by an independent maintainer.

The request remains **USD 38,000 for 400 prospective hours over 150 days**. The implemented source and completed original OSF capture are the starting assets. Customer-specific future integration is allocated once within those existing packages. A completed open-source library delivery does not itself create a paid purchase. The actual approved paid intent, selected payment option, native transfer and useful delivered output populate the original commercial and grant measures when that operation occurs.

## Source and ownership

The original OSF native programme remains with SDK12 / Root2D58. The returned-project engine and selected product source retain their current author; the current Research customer-return and intake desk remains with 396C. Browser, CLI and customer-agent controls call the same native workspace and its original request history.

Original source and operating references:

- [Zotero operating entry](./OPERATING.md)
- [Customer-agent setup](../../stellar/scf-starforge-20261009/sf30-seller-sdk/zotero/MERCHANT_SETUP.md)
- [Original native receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/zotero/NATIVE_RECEIVING.md)
- [Original Research operating entry](../research/OPERATING.md)
- [Research customer-return desk](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/HANDOVER_DESK.md)
- [Research first-use intake](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/HANDOVER_INTAKE.md)
- [Original completed customer-agent source](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/1529)

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Before calling any customer/prospect-facing application, website, dashboard, demo, report, presentation or export ready, open/run/render the exact outgoing version, look at the rendered screen or its actual screenshots, and operate the important user controls. Inspect the actual screenshare width and narrow/mobile width where relevant, populated/empty/loading/error states, downloads/exports and reopening. Capturing screenshots without viewing them is insufficient. Code review, DOM counts, HTTP 200, unit checks and another worker's approval do not replace seeing the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk; do not run broad suites or build a verification product.

Include this complete instruction in delegated assignments and the active owner-controlled policy, boot, build and receiving guidance those workers actually read. Preserve all other owner controls and original operation identities. Leave historical records and third-party/vendor policies intact. Do not force restarts, create watchers or revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
