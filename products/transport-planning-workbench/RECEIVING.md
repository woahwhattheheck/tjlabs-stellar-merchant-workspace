# Transport Planning Workbench — installed receiving and onward handover

This is the complete installed customer course for the privately supplied transportation planning application. It adopts the completed output of the already selected original programme, then uses the installed Applications service, the original browser, the transport agent tools, the native command journal, and two independently prepared application copies. It retains the full working product and every original source, table, historical revision, native calculation and published edition.

The public package contains generic adapters and this course. The selected private application, source authority, customer documents, original programme archive, actual workspace and commercial material remain in their authorized private custody. A source publication or successful composition is not a native programme result or a rendered product inspection. Continue the original equipped operation when its complete output is still outstanding.

## 1. Select the actual original operating result

Use the same original programme request, source edition, receiving owner and execution identity already selected for the customer. The installed receiver does not run the original example or repeat its evaluator, source intake, browser or PDF generation. Its donor input is a completed archive with the original outcome, the complete native example result, both usable native ZIPs, every original edition, screenshots and applicable documents.

The helper rejects a donor unless its original outcome positively reports a closed successful browser course, all eight original panes at both desktop and phone widths, and the expected full source and workspace outputs. It independently opens both the original application archive and the workspace recovery archive, reconstructs all eight native tables, and checks the original workspace fingerprints and evaluator binding against the complete original result. It also checks all published editions in ZIP, HTML, JSON and CSV forms.

If the original operation has no actual complete result, continue that operation with its existing owner. Do not create a second example, accept an unexecuted source packet as a completed donor, substitute another customer's workspace, or change the original source selection to make an incomplete journal appear complete.

A full customer source authority and the source folder are required for private preparation. Use the exact source and hash authority selected by the original owner. For the present application family the complete private edition has 24 original files; the generic private admission code validates the selected authority and actual closure rather than inserting customer-specific paths or hashes into public code.

## 2. Required input register

Keep the following inputs as complete files. Read the actual preparation result and original archive inventory for their paths; do not infer installation paths from another host.

| Input | Required selection and purpose |
| --- | --- |
| Installed Merchant runtime | A complete installed distribution including the transport product, current Applications controller, managed command closure implementation, source archive and package manifest. |
| Private preparation result | The actual READY result returned by Transport preparation, with two distinct applicationDirectory values and the exact source authority, Python and Node selections. |
| Original donor request | One saved JSON object described below; it selects the completed original full archive and its actual member names. |
| Private course directory | One canonical owned private directory outside the installed public source, original source folders and all workspace directories. Reuse it for every continuation. |
| Merchant Runtime Workspace | The existing private installed-runtime observer/controller directory. This course retains its actual application IDs, request IDs and positive Stop receipts. |
| Python | The actual original application interpreter, CPython 3.12 or later, selected by preparation. |
| Node | The actual canonical Node.js 18 or later executable selected by preparation for the unchanged native evaluator. The installed generic CLI also runs through the installed distribution's selected Node runtime. |
| Playwright and Chromium | The actual complete module and executable paths from the equipped receiver. Select the original usable browser installation, not another newly downloaded browser on each resume. |
| Named operator | An existing profile in the original workspace configuration. The default is Data analyst. The host actor and browser-selected profile must agree. |

Private source and data directories, source authority, live connection files, credentials and input files must keep the original ownership and access controls. The receiver creates private directories with mode 0700 and ordinary artifacts with mode 0600. It never publishes credentials in the handover.

The original application archive installs an application directory containing all original source plus delivery metadata and possibly a nested recovery ZIP. Preserve that complete archive unchanged. Managed launch intentionally uses the exact prepared source-only applicationDirectory, while selecting the workspace returned by the native receive operation. Do not point strict source inventory validation at the archive's application directory with its additional delivery members.

## 3. Prepare both local application copies

Preparation is source and runtime intake. It verifies every selected source member, the actual local Python and Node executables, and original module imports in isolation. It does not execute the customer programme or create business records.

Use the maintained installed preparation command, or the same selected source entry:

~~~sh
node products/transport-planning-workbench/prepare.mjs prepare \
  --directory /srv/private/transport-prepared \
  --python /opt/python/bin/python3 \
  --node /opt/node/bin/node \
  --source /srv/private/transport-original-source \
  --source-manifest /srv/private/transport-authority/SOURCE.json \
  --source-manifest-sha256 FULL_LITERAL_AUTHORITY_SHA256
~~~

Keep the returned result as the selected preparation result. Its schema is stellar-forge.transport-planning-preparation.v1 and its state is READY. Each primary and receiving object supplies applicationDirectory, sourceManifestFile, sourceManifestSha256, python and node. This product does not require a runtimeReadyFile.

The installed course calls inspectTransportPlanningPreparation with the original preparation directory, Python and Node. It requires the inspection envelope's result to equal the saved full preparation result. Preparation's own source transfer and local runtime observations stay independent of the customer's operating archives.

Inspect or resume the exact preparation through its maintained commands:

~~~sh
node products/transport-planning-workbench/prepare.mjs inspect \
  --directory /srv/private/transport-prepared \
  --python /opt/python/bin/python3 \
  --node /opt/node/bin/node
~~~

Use --resume only for an existing incomplete preparation request, retaining its exact inputs. See PREPARING.md for the full source transfer, archive inspection and local interpreter contract. On another host, receive the complete private source-transfer ZIP with its exact SHA and that host's actual selected Python/Node; do not relabel the earlier host's runtime observations as local observations.

## 4. Save the original donor request once

The file supplied to --original-request is the helper's literal original request. It has no additional envelope:

~~~json
{
  "id": "original-completed-transport-donor",
  "action": "inspect-original",
  "operationId": "ORIGINAL_OPERATION_ID",
  "archive": {
    "path": "/srv/private/original-complete-transport-result.zip",
    "bytes": 123456,
    "sha256": "ACTUAL_FULL_ARCHIVE_SHA256"
  },
  "outcomeMember": "complete-result.json",
  "exampleResultMember": "programme/example-result.json",
  "applicationMember": "programme/COMPLETE_APPLICATION_ARCHIVE.zip",
  "recoveryMember": "programme/COMPLETE_WORKSPACE_ARCHIVE.zip"
}
~~~

The numerical size, digest, operation ID and member names above are parameters. Replace them with the literal observed descriptors from the existing original delivery; never use these example values as evidence. The current original equipped-input materializer can produce this file from the actual completed archive. It does not rerun the customer programme.

Every member name is relative, exact and case sensitive. Keep the original full outcome and example result; the receiver verifies their operation identities and complete business result agree. The application and recovery descriptors must match the selected archive members and the original result. The full outer archive is copied into final private handover custody, preserving the original browser/PDF outputs and any commercial attachments as original bytes.

The immutable donor ID must be a readable stable string of letters, digits, period, underscore or hyphen, beginning with a letter or digit and at most 160 characters. It is used for the helper's own saved step. Do not reuse another step's identity with a changed body.

## 5. Run the one installed receiving course

Run from the exact installed Merchant distribution. The receiver verifies that its source root is the sourceRoot reported by inspectMerchantRuntime. A copied script beside an unrelated runtime is not the selected installed product.

~~~sh
node products/transport-planning-workbench/receive.mjs \
  --directory /srv/private/transport-installed-receiving \
  --merchant-workspace /srv/private/merchant-runtime-workspace \
  --merchant-runtime /srv/private/merchant-installed-runtime \
  --preparation-result /srv/private/transport-prepared/.preparation/PREPARED.json \
  --original-request /srv/private/transport-inputs/DONOR_REQUEST.json \
  --playwright /opt/browser/node_modules/playwright/index.mjs \
  --chromium /opt/browser/chromium/chrome \
  --actor "Data analyst"
~~~

The installed command name is transport-planning-workbench-receive. The flags, identities and source selection are the same whether it is called through the installed command or the selected source entry. Choose real paths from the receiver's available runtime. This guide does not authorize downloading a new paid runtime, enabling GitHub Actions or replacing an already selected controller.

If interrupted, invoke exactly the same command with --resume:

~~~sh
node products/transport-planning-workbench/receive.mjs \
  --directory /srv/private/transport-installed-receiving \
  --merchant-workspace /srv/private/merchant-runtime-workspace \
  --merchant-runtime /srv/private/merchant-installed-runtime \
  --preparation-result /srv/private/transport-prepared/.preparation/PREPARED.json \
  --original-request /srv/private/transport-inputs/DONOR_REQUEST.json \
  --playwright /opt/browser/node_modules/playwright/index.mjs \
  --chromium /opt/browser/chromium/chrome \
  --actor "Data analyst" \
  --resume
~~~

The result is stellar-forge.transport-planning-installed-result.v1 with state COMPLETE, the exact source/input selection, all completed phases, every retained file descriptor and the full installed handover descriptor. Progress messages identify the same receivingId and phase. An interrupted result, a source-only review, a pending application start or a screenshot file by itself does not satisfy this result.

## 6. What the course actually operates

### Original donor and complete baseline

The course adopts the original outer archive, verifies every member, opens both native formats, checks the original command population and all eight native table fingerprints, and retains the full native snapshot. It receives the original application into the primary container and exports a complete baseline under the selected current source.

The snapshots preserve meta, config, sources, records, history, commands, events and dataset_rows. Source BLOBs are emitted as complete files with byte/SHA descriptors; the tables preserve every other field. The snapshot records contain complete current values and full historical values. HTTP history views expose the original metadata, while the archive/snapshot retains the complete historical content.

### Installed Applications and agent

The course attaches the actual installed runtime, reviews and saves each application, connects the selected release and starts the original managed host using a saved review and request. The actual connection binds workspace identity, prepared application, authority digest, Python/Node, named actor, port and launch ID.

The transport catalogue contains 21 declared tools. The course retains the exact complete catalogue, operates the installed workflow, and retains all native response files. It does not claim every possible mutating tool was dispatched.

Agent reads include complete state, catalogue, every original record and history metadata, every dataset page, all source objects, all four formats of every published performance/scenario/plan/report edition, the operating guide and complete request history. Retained response descriptors are resolved through exact byte ranges to EOF. Full body hashes and sizes are checked; a bounded projection does not substitute for the full original response.

### Browser operation and uncertain command recovery

The actual private console is opened through the selected connection, and its original profile control selects the same named actor. All eight original panes are operated: overview, sources, services, performance, scenarios, actions, reports and delivery. The course captures desktop and narrow screens and uses every original dataset page control.

On the primary host, the original action form adds a technical receiving note to an existing action. It preserves title, responsible owner, phase, status, due date, working days, capital/annual cents, dependencies, source references and completion references. It does not invent service outcomes, change measurements, approve a scenario or mark an action complete.

The browser creates its own original operation ID. The receiver saves that complete original actor/request/body before forwarding the request. After the original application accepts it, the first HTTP response is deliberately withheld from the page. The original pending-operation storage remains. The course reloads the page and uses the original Resume control with the same ID and body, then requires the original exact saved native result. The main course consumes the actual browser-generated ID, not its earlier planned selection ID.

If interrupted before the first response was withheld, the course settles that original first request and then resumes the same request for the second stage. It never creates a replacement operation to hide an uncertain outcome.

### Full editions and usable downloads

For every published edition, the course downloads the original CSV and ZIP, opens the original rendered HTML at desktop and narrow widths, retains the exact HTML and reopens it from the local saved file. It reopens the complete CSV text and retains every byte. The agent also retrieves the original JSON format, which the original UI does not present as a separate link.

The browser downloads both the full application ZIP and workspace recovery ZIP. The agent separately retains both native formats. The native helper inspects each archive, reconstructs its workspace in its own retained staging directory, verifies source and member closure, and compares the full snapshot to the selected edition. Native archive timestamps can differ between separate exports; each archive is bound to its own exact bytes and the same full semantic workspace.

### Independent receiving and later edits

A separate agent receiving exercise uses a declared complete baseline input and a fresh destination. The original receive API requires a fresh target and is not safely replayable as another mutation. The course saves the dispatch before entering it. If the HTTP outcome is uncertain, it inspects the exact destination and complete native snapshot; it does not call receive again and does not label a recovered destination as an observed HTTP response.

The actual forward course receives the primary's full post-note application archive through the maintained native helper into the independent receiving container, using the second prepared source copy. It then opens that installed workspace with the same complete agent and browser course.

A complete host-declared JSON input appends the second technical note to a different existing action. The input's request ID and body are frozen before agent setup. The original agent dispatch and exact replay must return the same result. Native audits require exactly one new command/history/event for each technical note and unchanged unrelated business records, configuration, sources and dataset rows.

After the second note, the course exports the latest complete application and recovery archives. It reopens the earlier incoming archive through the helper's explicit same-archive receiving reconciliation and verifies that the later local note and all full earlier history remain intact.

### Cold reopening and onward package

Both application hosts are positively stopped, reopened through the original Applications controller, and connected to the same immutable agent configuration and retained export store. Previously saved agent file IDs and expected hashes are read again to EOF. Fresh full native reads must still match the selected snapshot.

The course positively stops each reopened host, performs an exact native audit and exports all complete native source objects and published editions. It then closes every remaining browser, request reader, manager and application owner before freezing the final result candidate.

## 7. Ownership, Stop and interruption semantics

The top-level course holds its own kernel-owned lease and retains the actual Course object before opening any dependent owner. SIGINT and SIGTERM request Stop on the same browser/helper/application owners. Helper processes have retained stdout/stderr and complete command identities; cleanup waits for the actual child close event before releasing descriptors.

Applications Start preserves selected, dispatching and entered states. An uncertain earlier Start is reconciled through the same original request before Stop. A request known never to have been dispatched is recorded as such; it is not labeled as a native execution.

An inactive application alone is not closure evidence. The course accepts the exact same-operation prelaunch cancellation receipt, or the original SUCCEEDED command outcome with a dated positive terminal command result. LAUNCH_FAILED is accepted as owner closure only when the maintained original command result explicitly confirms that both acquired child and observer owners closed. This does not turn the failed launch into a successful product run.

QUEUED, PENDING, INTERRUPTED and OBSERVATION_UNAVAILABLE states remain unfinished. Preserve their actual owner and saved request. Do not delete lock files or use a second application/controller to force progress.

Browser closure retains the actual persistent context, pending acquisitions, routes, downloads and pages. Exact saved screenshot/download candidates are reused after an interruption. Completed result candidates are reopened before mutable preparation or setup work, so a lost final publication acknowledgment cannot change the selected result.

A native helper step has its own immutable request, full source selection, candidate and result. The helper's receive receipt applies only to the exact native receive performed by that helper. It is separate from an uncertain agent receive; inspect the latter's selected destination without inventing a receipt.

## 8. Complete outgoing artifacts

The private installed handover ZIP contains the selected complete artifact population plus HANDOVER-MANIFEST.json. Each manifest member has its exact relative path, bytes and SHA-256. The helper reopens the ZIP and validates its full population and every member.

The selected population includes:

- The original full outer donor archive, literal original outcome/example result and complete archive inventory.
- Original full application and workspace recovery archives.
- Prepared source authority, full private source-transfer ZIP, preparation request/result and local interpreter observations represented by the complete preparation/export records.
- The installed Merchant source archive, package manifest, installation plan and Runtime Workspace handoff.
- All helper source selections, exact requests, complete stdout/stderr, command closures, full snapshots and emitted source BLOBs.
- Every retained original agent response and artifact, full range-read receipts and complete file catalogues.
- Actual browser request/response, native replay result, all screenshots, full edition HTML/CSV/ZIP downloads and both complete native operating archives.
- Primary and receiving Applications reviews, request identities, connections without capabilities, positive closure receipts and cold reopen results.
- Latest independently editable application and recovery archives, every published edition in all four formats, and the full final installed result.

The archive is a private usable delivery. It can contain customer source, personal or organizational records, original commercial attachments and complete historical decisions. Keep it in the original authorized private custody. Do not publish it into the public generic adapter repository, public source chapters or customer-agent arguments.

The source transfer, installed Merchant distribution and native application ZIP serve different purposes. Preserve all three. The source transfer prepares a fresh host's full source and actual runtimes; the Merchant distribution supplies the installed generic interfaces; the native application/recovery ZIP supplies the customer's complete editable workspace. A native ZIP does not automatically contain the outside-workbench generic wrappers.

## 9. Open the onward delivery on another authorized host

Open and inspect the final handover manifest and usable ZIP contents. Retain the complete original and latest native archives rather than extracting only a report. Select the full private source-transfer ZIP and prepare it with that host's actual supported Python/Node. Install the same complete Merchant distribution according to its existing installation/receiving guide.

Use the original native application receiver to create a fresh workspace from the selected latest archive, preserving its returned workspace path and full delivered application directory. Keep managed launch.applicationDirectory on the exact prepared source-only copy. Put the new host's private launch/connection files outside both source and workspace. Select an existing named staff profile.

The source authority and source hashes remain fixed; local executable paths, observed runtime identities, private ports and connection capabilities are selected afresh on the new host. Never reuse another host's capability file or label its PID as a local owner.

Open the actual console, inspect all relevant report editions and operating data, and confirm an authorized user can continue editing with the original command/history semantics. Complete the actual producing-peer inspection below before any customer-facing presentation. Subsequent business changes belong to their original work item and authorizations, not to an automatic repeat of this receiving note.

## 10. Current status and communication boundary

This source supplies a concrete complete course. Source review, JavaScript grammar checks and maintained distribution selection are engineering evidence only. Record the actual original donor completion, installed execution result and rendered inspection separately.

Use the original customer/native/SCF threads for engineering delivery and equipped receiver continuation. Preserve the original sender and customer conversation owner. After positive human contact, each outgoing message and each attachment requires Bryce's approval of that exact content; approval of an earlier message does not approve a later one. Internal engineering and already authorized cold work continue within their standing scope.

No new paid Actions run, budget change, customer message, original programme rerun or replacement host controller is part of this course.


## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949
