# SeaTable customer commissioning and complete workspace handover

This course turns one authorized SeaTable source into a reviewed data delivery that a second operator can continue. It covers the customer source/output agreement, the complete saved authoring workspace, private receiving, original publisher and release history, a useful later edition, and the working handover back to the original team.

Use the [source workspace guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/seatable/WORKSPACE.md) for the installed authoring application, [provider input](../../stellar/scf-starforge-20261009/sf30-seller-sdk/seatable/PROVIDER_INPUT.md) for actual source acquisition, and [the original native receiving course](../../stellar/scf-starforge-20261009/sf30-seller-sdk/seatable/RECEIVING.md) for the existing complete execution programme. Customer-specific correspondence, quotes and decisions remain in their original customer case.

## Agree the useful customer delivery

Start with the downstream use of the dataset: the portal, client application, reporting process or team that needs it. Agree what a useful complete edition looks like and what event makes a later edition necessary. Then bind that work to the actual authorized source and receiving operator.

| Decision | Record in the original workorder |
| --- | --- |
| Source and permission | Actual service origin, observed provider version/edition, authorized base, table and saved view; source owner and permitted use. |
| Selected observations | One or more actual SQL or native-view selections, their field union, filters/order, native IDs, declared read limits and capture cadence. |
| Public output | Approved columns and aliases, scalar types, exact numeric handling, null/empty policy, record identifier and customer CSV/JSON contract. |
| Publication | Actual query, public subset, extraction order, immutable source version, original publication plan and useful edition acceptance. |
| Receiving installation | Supported host, private destination, selected package/runtime, receiving maintainer and original managed application/merchant configuration. |
| Operating responsibility | Source owner, reviewer, implementation payer, merchant/release operator, customer receiver and acceptance contact. |
| Commercial scope | Agreed installation and adaptation, acceptance cases, supported output profile, support period and explicit later scope changes. |
| Later handover | The complete progressed workspace to return, authorized private transfer route, intended receiving team and responsibility for a source or publication disagreement. |

Use the customer's existing authorized SeaTable service and appropriate edition. Keep provider credentials in the original host's private setup. The data permission and approved public projection are separate decisions: a read token may expose fields that the customer has not authorized for publication.

The commissioning record uses the actual source size and declared limits. The reader's maximum is a software limit, not an agreement to supply a customer implementation of that size or a claim about available runtime memory. Confirm practical capture size, field types and downstream output before committing the installed work.

## Choose the correct complete handover

Different artifacts carry different parts of this workflow. Select the artifact for the receiving operator's actual job.

| Artifact | What it carries and how it is used |
| --- | --- |
| Original capture packet | Complete provider observation, raw resources and manifest. Reuse it to inspect the original selected rows without another provider extraction. |
| Reviewed source/version packet | The retained observation plus approved source-query projection and source/version provenance. Importing it creates local authoring request/version records. |
| Complete editable workspace handover | The original saved authoring and operating history selected by the complete workspace exporter, with its retained files and independent receiving contract. Use it when the recipient must continue the working product. |
| Original five-file SF82 staging package | Reviewed dataset, schema, seller configuration, source binding and native release binding for the merchant host. The native binding is a private operating input. |
| Customer client/export package | The approved public projection and original generated request/client contract. Use it for the downstream consumer rather than giving that consumer the private source archive. |

Native row IDs, capture manifests, authoring version IDs, publisher plan IDs, request UUIDs and runtime instances identify different objects. A source-packet import preserves the observation while allocating local operating records. A complete workspace receiving workflow preserves the selected saved project history through its maintained receiving mechanism. Record the actual preserved identities and the recipient's newly assigned local runtime ownership separately.

A private workspace can contain raw visible fields that the public output omits. Transfer it only through the authorized operator route. The public delivery remains the chosen customer output. A private source archive is not substituted for a normal client dataset.

## Establish the reviewed source baseline

Use the actual captured SQL and native-view inputs already held by the original operation. Keep the same source and capture identities through source review and workspace handover.

For constructed SQL, the original reader uses the real field keys, parameterized selection, stable native identity order, opening/closing counts, metadata and base/server observations. For a native view, the real view defines visibility, filtering and order; preserve its actual view ID. A native view does not gain an independent count by being copied or received.

The provider's current [SQL query reference](https://api.seatable.com/reference/querysql) and [native row/view reference](https://api.seatable.com/reference/listrows) describe the gateway contracts used by this source. The maintained reader and retained observation determine the actual selected limits and output semantics.

Both modes retain complete pages through the original empty terminal page. Both remain paged provider observations with `atomicSourceSnapshot:false`. An exact portable copy preserves what the provider returned; it does not turn that original observation into a database transaction snapshot.

Review every selected output field. Preserve distinctions between an absent key, an explicit null, an empty string and a structured value. Use `number-text` when the original numeric token must remain exact; a decimal or large integer must not silently pass through rounded numeric conversion. Native identity stays a string. Structured links, files, collaborators or other unsupported values require an actually supported source/output contract.

The source field union and selection are fixed by the retained observation. A later alias, scalar encoding or null policy can be reviewed over that observation. The narrower public subset and publication extraction order belong to the original publisher. A different source field union, source filter or native view requires its own deliberate provider selection.

Use the original **Save draft**, **Validate every row** and **Freeze and select source version** controls. Retain the actual draft revision, preview UUID, selected version and reviewer note. A 25-row browser preview is a preview; the source validator still checks the complete captured rows.

## Prepare the complete saved workspace

Choose the exact operating point that the recipient needs: selected source version, unfinished draft if relevant, original capture review, publication and release history, and the agreed completed customer output. Review pending or interrupted requests in the original operation history before exporting.

The complete workspace exporter creates an immutable streamed `.stwh` archive. It retains `sources.sqlite` with the original capture, draft, version, preview, operation and event records; the owned input/capture/preview/version files; publisher plans, candidates, reviews and history; the dataset version store; and SF82 packages, releases, selection and history. Retain the complete archive, its actual byte count, SHA-256 and prepared export identity in the customer handover.

Live locks, service control/session files and external host credential files are excluded from the transfer. Earlier source, version, plan, candidate and release objects remain the original bytes and IDs. The receiving contract carries a complete working branch, including its private data and retained operating history.

Preparing this complete snapshot drains and stops this workspace's owned publisher and deployment services through their existing lifecycle. Plan that deliberate operating boundary with the original operator: finish useful in-flight work, retain the current request, and inspect the saved outcome before preparing the archive. The exporter acquires the original publisher, dataset and stopped-release leases needed for a consistent saved handover. It does not take control of an unrelated runtime. A copied listener address, lease file or stale process handle cannot authorize the receiving host to operate the source host.

The existing installation binds source versions, dataset paths, publisher state and release packages to actual native paths. Follow the complete export/receive mechanism when moving the project. Do not perform a global string replacement in SQLite, manifests or capture files to make a copied folder appear relocated. The receiver must distinguish preserved original evidence from destination-owned operating references.

Export the whole agreed source and working history rather than rebuilding the project from the most recent public CSV. Earlier source versions, reviews, publication choices, interrupted-work records and customer outputs explain how the current edition was produced and let the recipient continue it.

## Receive into the intended private installation

Select the maintained software package/runtime for the actual receiving host. Retain its source manifest and supported dependency profile. Use the original installer and its saved recovery; supply the destination's credentials and runtime references through its private configuration.

Before creating the receiving workspace, confirm the selected complete file, destination and intended source project. The browser shows the uploaded file's actual complete SHA-256 and byte count. The native receiver validates the full manifest and member inventory during receiving; inspect the retained source and operating bindings in the completed receiving record and workspace. Keep the complete source file available through the original request's recovery.

Use one stable receiving request UUID for that exact archive, full SHA-256 and receiving name. The maintained receiver creates a new child under `received-workspaces/name`; it does not overwrite or merge the parent workspace. Continue an interrupted receive using its original input and request. Open an already received child to continue its saved work rather than treating a repeated upload as a command to reset it.

Destination runtime binding is a receiving action. Only the host settings are rebound, and their full originals remain in `workspace-history`. The receiver resolves unchanged source capture references and installs the unchanged release objects through the original SF82 dataset-release store. The original observations, authoring history and published bytes remain the recorded evidence. Configure destination credentials and operating references through its private host configuration, then separately review any new source, publisher or release action. Receiving a workspace does not itself perform a fresh provider capture, publication, release activation or payment.

Open the completed receiving copy in its ordinary managed application or private browser. Confirm its actual source/capture/version history, current draft and selected publication. Open an earlier edition and inspect the original values that matter to the commissioned client. Retain the returned receiving name, workspace identity, source and counts with that same customer case. **Open received workspace** supplies its current private URL; the receive receipt itself identifies the child and does not contain that browser connection.

## Continue useful work and return the progressed project

Use a meaningful continuation over the existing source: review a public alias or scalar/null policy, save a later draft/version, choose another agreed public subset/order, or inspect and resolve an actual interrupted original operation. Keep the original provider observation when the task only changes its projection. A later provider read is a separate explicit source operation with its own observed time.

Open the original publisher from the selected reviewed source version. Preserve its native plan, candidate, review, published run and dataset identities. An existing immutable plan continues to describe its selected source even after the workspace selects another version. The receiver's later publication is a new reviewed edition; it does not rewrite the earlier delivery.

For merchant operation, retain the original SF82 stage/review and actual owned instance. Review the received package and destination bindings through its maintained interface before an intentional release action. Source receiving and a payment-required HTTP response do not establish a paid transaction. The existing buyer/facilitator path retains actual approved payment and delivered output records.

Prepare a new `.stwh` archive of the complete progressed receiving workspace as a later handover, again observing its deliberate owned-service drain boundary. Send it back through the same authorized customer case with its original source, operation and useful result identified. The original team opens that complete branch through the maintained receiver. Keep both the original author workspace and returned progressed workspace until the reviewer chooses the operating continuation. A complete return is not implicitly a field-by-field merge into a concurrently edited author database.

A subsequent team can receive, edit and export the same progressed working project. Reopening the first received handover must retain that recipient's later work. The practical acceptance is that an independent operator can continue the useful data service, locate earlier editions and recover its original work.

## Exact installed transfer controls

### Browser and managed application

Open **Workspace handover** in the existing SeaTable application. The source workspace remains selected until the operator explicitly opens the independently received child.

| Control | Useful operating result |
| --- | --- |
| **Close consoles and create workspace file** | Uses the current draft revision and selected version to prepare the immutable whole-workspace archive at the deliberate owned-service boundary. |
| **Download complete workspace** | Downloads the exact saved `.stwh` archive through its one-use download ticket. Retain the complete file with its reported byte count and SHA-256. |
| **Upload complete workspace file** | Transfers the chosen original file in chunks and displays the actual full-file identity before receiving. |
| **Receive independent workspace** | Receives that exact uploaded file and SHA-256 under the chosen independent child name. |
| **Open received workspace** | Opens the received child through its own URL and ordinary workspace controls. It leaves the parent and its earlier working history separate. |
| **Refresh saved handovers** | Reads the existing export and receiving records. Use the saved record to recover an uncertain response. |

Use **Check original handover receipt** when a response is uncertain. **Retry original request** preserves the original request identity and input. **Resume with the same file** continues a paused upload using that original file. **Pause local upload** stops the local transfer activity; inspect the saved transfer and receiving state before deciding the next action.

Review the complete SHA-256 shown for the uploaded archive. Its filename and size help identify the selected file, but the actual complete digest binds the receive to its exact bytes. If the browser lost its local file selection, choose the same retained original file and continue its existing request; an unrelated file belongs to its own handover.

The receiving child is `received-workspaces/NAME` under the existing workspace. Its original capture/version/publication objects remain identifiable, while its private local runtime ownership is independent. Open it through the provided child URL, then operate its normal draft, review, publisher and release controls for the agreed continuation.

### Installed command line

Use the maintained installed `seatable-workspace` entry or the source `seatable/workspace/cli.mjs` with the selected supported Node runtime. Read the current workspace status and original saved request before selecting revisions. The placeholders below stand for values from that actual source and saved operation; they are not sample customer identifiers.

Prepare one immutable handover from the chosen saved state:

```sh
seatable-workspace workspace-export \
  --directory /absolute/private/author-workspace \
  --expected-revision ACTUAL_DRAFT_REVISION \
  --expected-selected-version ACTUAL_VERSION_OR_null \
  --request ORIGINAL_EXPORT_UUID \
  --out /absolute/private/customer-workspace.stwh
```

Use literal `null` when the current workspace has no selected version. Preserve the original UUID for uncertainty or recovery. To list existing saved exports and download an already prepared file:

```sh
seatable-workspace workspace-exports \
  --directory /absolute/private/author-workspace

seatable-workspace workspace-download \
  --directory /absolute/private/author-workspace \
  --request ORIGINAL_EXPORT_UUID \
  --out /absolute/private/customer-workspace.stwh
```

Receive the exact complete archive into a new named child beneath the intended receiving parent:

```sh
seatable-workspace workspace-receive \
  --directory /absolute/private/receiving-parent \
  --archive /absolute/private/customer-workspace.stwh \
  --sha256 ACTUAL_COMPLETE_ARCHIVE_SHA256 \
  --name CUSTOMER_CHILD_NAME \
  --request ORIGINAL_RECEIVE_UUID

seatable-workspace workspace-received \
  --directory /absolute/private/receiving-parent
```

Read the saved receiving result for the actual child directory, name and workspace identity. The CLI child is the original parent directory followed by `received-workspaces/name`; open it through the existing serve/managed application entry or the parent's **Open received workspace** control. Do not replace a progressed destination directory with the original archive. Continue its normal saved workspace, and export that child's later state when the customer returns useful changes.

### Original model contract

The native model prepares a workspace file with `exportWorkspace({requestId, expectedDraftRevision, expectedSelectedVersion})`. `exportWorkspaceFile(id)` supplies the saved streaming file descriptor. Receiving uses `receiveWorkspaceFile({archiveFile, expectedSha256, name, requestId})`; `receivedWorkspaces()` returns the saved independent children. Call these on the existing open model and retain the actual returned record and operation identity.

A prepared export result contains `id`, `filename`, `bytes`, `sha256`, `manifestSha256`, `source` and `counts`. A completed receive returns `name`, `requestId`, `archiveSha256`, `bytes`, `manifestSha256`, `source`, `counts`, `directory` and `workspaceIdentity`. The file descriptor provides the exact saved archive for streaming; it is separate from the independent child's browser URL.

The implementation accepts at most 32 GiB of member contents and a 32 MiB manifest, with 1 MiB upload chunks. The original source reader's limits, available storage and the customer's agreed pilot scope still govern practical operation. Keep sufficient destination space for the complete original archive and independent editable workspace.

### Customer-agent receiving

The installed original provider exposes these actions on the configured `workspace` alias:

| Tool | Selected operation |
| --- | --- |
| `merchant_seatable_workspace_export` | Prepare the archive with `requestId`, `expectedDraftRevision` and `expectedSelectedVersion`. |
| `merchant_seatable_workspace_exports` | List existing completed handovers. |
| `merchant_seatable_workspace_transfer` | Read the exact `kind: "export"` or `kind: "receive"` receipt using its original `requestId`. |
| `merchant_seatable_workspace_read` | Read the saved export's bytes in retained chunks using its request ID, returned read ID, expected hash and offset. Release the retained read through `merchant_seatable_packet_release`. |
| `merchant_seatable_workspace_receive` | Select the host-declared `input` alias of kind `workspace`, actual `expectedSha256`, receiving `name` and original `requestId`. |
| `merchant_seatable_workspace_received` | List the saved independent children. |
| `merchant_seatable_workspace_open_received` | Open the chosen child's `name` and use the returned `childWorkspace` alias for its ordinary tools. |

The private host configuration declares the actual workspace archive input. A tool call selects that configured alias; it does not turn an arbitrary external path into an authorized source. Preserve the returned child alias and original parent ownership. Closing the parent drains the child through that same owner.

For a retained read, continue the returned cursor/offset and exact original file identity through the final chunk. A partial chunk, base64 excerpt or filename is not the delivered whole workspace.

## A practical customer commissioning course

Use one coherent authorized customer source and the original SeaTable operation. The source owner supplies actual base/table/view IDs and the representative pilot; the operator reads counts and source limits from actual retained output.

1. Agree the source/output map and who can approve the public fields. Record the customer-facing dataset contract and the receiving maintainer.
2. Reopen the original complete SQL and saved-view observations, inspect native field/row identities and their distinct completeness descriptions, and validate every selected output value.
3. Save the reviewed source version and retain a complete earlier edition. Open the original publisher, inspect the chosen public columns/order and complete the agreed publication/client output.
4. Prepare the complete editable workspace handover. Retain its exact input, original files, draft/review/version and publisher/release history.
5. Receive that whole workspace into an independent private installation through the maintained receiving workflow. Reopen it through the actual supported browser/CLI/agent entry.
6. Make a useful receiving-only continuation, save it, then reopen the earlier incoming handover and confirm the later work remains. Continue an actual interrupted request through its original UUID when that state occurs.
7. Export the progressed receiving workspace and open it with another operator. Inspect the prior source/publication and current result, continue one reviewed operation and cold-reopen the same saved project.
8. Open the exact source UI, receiving preview, saved-state/error screens and public customer files at desktop/screenshare width and 390 pixels. Operate every important control and LOOK at the rendered results. Repair unreadable or overflowing source tables, long values, disabled labels, file controls and narrow action layouts in this product.

The acceptance record identifies the actual source/installation, original and receiving workspace, selected draft/version/publication, retained request IDs, delivered files and named operator observations. Capturing a screenshot without looking at it does not complete the final operating stage.

## Customer implementation and handover plan

The implementation work remains scoped in its original quote. The following six stages align the useful outcome with the existing source product:

| Stage | Customer-specific work | Useful acceptance |
| --- | --- | --- |
| Source and output agreement | Actual source map, permissions, query/view, scalar output, pilot limits, reviewer and receiving host. | The source/output contract describes the intended useful delivery and its approval. |
| Complete source configuration | Private credential references, source metadata, actual SQL/view capture and original recovery. | Complete retained observations preserve their source IDs, values and completeness semantics. |
| Review and immutable editions | Staff aliases/value policies, full validation, reviewer decisions and saved source versions. | The reviewer can reopen the approved edition and explain its public fields. |
| Client delivery profile | Original publisher plan, agreed CSV/JSON output and actual client-read example. | The client reads the complete correct edition; earlier output remains identifiable. |
| Installation and recovery | Selected runtime, independent whole-workspace receiving, real host bindings and interrupted-work continuation. | The receiving operator continues useful work and cold-reopens it without losing original history. |
| Operator handover | Complete source/configuration, source and customer files, private recovery inputs, practical teaching and agreed acceptance record. | The named maintainer independently operates the source-to-delivery workflow and returns a progressed project. |

Keep planned implementation effort separate from elapsed customer/access review time. The original agreed proposal controls its active days, fee, milestone invoices, review rounds, training session and defect-correction period. A later extension uses that same case's explicit scope revision; it does not silently expand one supported installation into ongoing managed operations.

A complete handover includes the opening guide, actual installed source/runtime identity, full private working project, original provider acquisition and provenance, complete client output, exact customer source/output map and receiving/recovery instructions. Secret values remain with the host; customer-approved references tell the maintainer where to configure them.

## Recovery and receiving decisions

| Actual observation | Continue the retained work |
| --- | --- |
| Original capture stopped | Read its saved request and attempt, then use the provider's same-operation recovery where supported. |
| Original source changed during capture | Retain the prior observation and review a deliberate new source capture through the original reader. |
| Workspace export or transfer stopped | Continue the saved export/input and exact complete file identity; preserve any durable returned bytes. |
| Receiving destination already has later work | Open the original receiving record and progressed destination. Review another complete input as its own selected handover. |
| Original publisher or release action has an uncertain result | Inspect its saved native request/state and continue through that engine's existing recovery. |
| Recipient lacks a private credential or runtime reference | Configure the actual destination reference through its original host mechanism. The retained source history remains available. |
| Source and public output disagree | Inspect the full original capture, projection, reviewed version and original publication; correct the selected contract through a new explicit review. |
| A returned workspace diverges from the author's current project | Preserve both complete projects and choose the intended operating continuation through the maintained receiving workflow. |
| Actual rendering is poor | Repair the exact outgoing source and repeat only the affected complete controls/export/reopen course. |

## Fit to the existing SCF programme

The complete source and transfer workflow supplies a concrete customer data-service installation. T1's existing 80-hour resource and 40-hour handover packages can adapt the selected customer's authorized base, public schema, client and receiving host. T2's 70-hour provider and 50-hour threat-response packages operate the same reviewed service through the original facilitator and recovery paths. T3's 90-hour mainnet and 70-hour recovery packages establish recurring use and independent maintainer continuation.

The application request remains USD 38,000, 400 prospective hours and 150 days across the original six packages. Reusable source engineering is the starting asset. Record actual approved paid operations and useful delivered outputs in their original commerce/cohort records. Reopening, exporting or receiving a previously delivered edition continues its existing operation.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

## Original operation and references

The provider/native continuation remains `SEATABLE-PROVIDER-OPERATOR-20261012-14F5`. Its original SQL/native-view inputs, source/runtime, publisher/release identities and output location stay with that existing owner. Customer relationship and commercial correspondence remain in the original SeaTable workshare.

- [Source and publisher entry](../../stellar/scf-starforge-20261009/sf30-seller-sdk/seatable/README.md)
- [Complete authoring workspace](../../stellar/scf-starforge-20261009/sf30-seller-sdk/seatable/WORKSPACE.md)
- [Actual provider input](../../stellar/scf-starforge-20261009/sf30-seller-sdk/seatable/PROVIDER_INPUT.md)
- [Original installed receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/seatable/RECEIVING.md)
