# Commission pipeline work in the existing preparation application

The Commission work page carries a saved multistage pipeline through customer preparation and independently editable receiving. It is part of the original Preparation application and uses its existing private Applications connection. The original Jobs customer helpers remain responsible for preparing the input package, verifying the purchased result, and receiving or reopening the native editable project.

## Prepare the exact work

1. Open the existing Preparation application from Applications and choose **Commission work**.
2. Select a saved pipeline and explicitly load the desired positive edition number. The latest edition is offered initially; an earlier saved edition can be entered.
3. Review the complete saved SQL, parameters, stage bindings and named outputs. Choose an original source edition for every declared input. The page uses the original workspace's sources and saved pipeline definitions.
4. Give the report a name of 1–120 nonempty characters. Optionally choose a retained, nonrunning execution whose unchanged stages may be reused by the original engine.
5. Choose **Prepare this complete order**.

The application saves a stable operation identity before exporting the original project. It exports the native project once, records that complete archive's byte count and SHA-256, and calls the installed original pipeline Jobs CLI with the explicit pipeline edition, report name, source mapping and reuse choice. Its original preparation helper validates all these choices against the received project and produces the complete selection. It does not execute the SQL during preparation.

The saved order exposes these five complete files:

| File | Purpose |
| --- | --- |
| project.zip | Original whole native preparation and pipeline project |
| selection.json | Complete approved saved edition, original source records, SQL, parameters, source bindings and reuse choice |
| input.json | Original ordinary input for the executePipeline function |
| review.html | Original complete preflight review |
| prepared.json | Original preparation statement and retained file identities |

The inline review displays the entire saved selection. It never truncates SQL or replaces full source records with a sample. Each download is rechecked against the saved complete byte count and SHA-256.

The original preparation contract accepts project.zip up to 28 MiB and selection.json up to 1 MiB. Its original expanded-project limit and native validation continue to apply. A project exceeding the original product's allowance remains saved locally, and preparation reports the original limit error. It is not silently reduced.

## Use the original merchant Request

The prepared ordinary input is the exact object in input.json. Its function is executePipeline. The attachment slots are project for project.zip and selection for selection.json.

The existing paid-jobs Request application owns merchant discovery, function and price display, sealed file upload, retained request identity and ticket preparation. Its original Checkout and Buyer own the spending approval and purchase. Preparation does not create an alternate checkout or payment implementation.

A complete existing Request can be continued after reopening the customer workspace. Preserve its original reference, request ID, sealed attachment descriptors, checkout and job. Do not create another purchase merely because a browser tab was closed.

In the prepared order's Merchant requests section, select a host-declared existing customer, enter the merchant origin and retain a readable reference and label. Choose **Review merchant catalog**. The complete current executePipeline function's amount, network, asset and payee are displayed, and its entire catalog can be opened for review. Choose **Create Request with both complete files** to retain the original draft and seal the selected files. **Open original Request** opens that exact customer request for its existing ticket, checkout and approval flow.

A stopped upload offers **Continue same original Request**. The original helper derives the same request from merchant origin and reference, reads it before drafting, and resumes its original missing chunks. It does not post a new ordinary input after the first attachment changed the request. Each merchant request has a separate saved identity, so another merchant can be reviewed against the same prepared order without changing its files.

The native Request handoff is composed through jobs/request-handoff.mjs and its fixed CLI companion. The host selects an existing private customer workspace; the prepared order selects an observed merchant catalog and a stable reference. The helper validates the current original customer launch and uses the original authenticated intake HTTP routes to retain the same draft and seal both whole prepared files. The original Request page then opens at that saved request. It does not advance spending approval.

## Receive complete purchased work

The original Jobs workspace downloads the complete named result package and retains its expected package descriptor. Select those original artifacts in **Receive a purchased result**:

- The complete result ZIP, within the original 64 MiB package limit.
- The original expected package descriptor as a complete JSON object.
- The original expected job identity, if available.
- The prepared order to which the result should be matched. Choose **Independent existing job** to receive an existing product job that was prepared elsewhere.

The browser computes the whole ZIP's SHA-256 and saves that identity with a new stable receiving operation. The receiving endpoint streams the complete declared body, checks its byte count and SHA-256, flushes it, and publishes that exact file once. A retry with the same identity reuses the saved upload.

The original Node receivePipelineJob helper independently verifies the complete result package with the original Jobs output receiver. Its Python helper validates the named report, project, execution and, for a completed job, results outputs. It reconciles the original job/attempt, selected pipeline, original input records, SQL and parameters, execution status and saved native files before publishing a separate editable workspace.

When matched to a prepared order, the application also compares the entire returned execution selection against that order's selection.json. This includes the exact source project identity, pipeline definition, source records and bindings, and optional reuse identity. An execution of another input edition cannot pass just because it used the same pipeline ID.

All the original named files can be downloaded in full. COMPLETE and REVIEW_REQUIRED remain distinct. A REVIEW_REQUIRED result retains its unfinished execution so the native application can review and resume it using the existing engine.

## Reopen and continue local work

Choose **Verify and reopen complete result**, then **Open editable project**. Reopening calls the original reopenPipelineJob helper against the retained verified package and editable directory. The original verifier preserves legitimate later local pipeline editions and continuation of unfinished work while protecting the original completed execution history and sources.

The independently editable child uses the existing managed listener and Applications lifecycle. Its private connection and source workspace remain those created by the original owner. Closing the parent drains its commissioning helpers, native execution workers, HTTP writers and child listeners.

Receiving never imports the purchased project's SQL into the original author's workspace. The complete editable copy is placed under this receiving's own retained directory.

## Restart and retry

Orders and receivings remain under the original preparation workspace:

- pipeline-commissioning/orders/OPERATION_ID
- pipeline-commissioning/receivings/OPERATION_ID
- pipeline-commissioning/requests/OPERATION_ID

Each operation has one immutable intent and a separate current state. A changed intent requires a new operation. Browser session storage only keeps the selected rows and unacknowledged request identities; the private saved files remain authoritative.

An interrupted preparation continues with its original exported source.zip and original prepared directory. An interrupted upload is reselected by complete byte count and SHA-256. An interrupted receiving continues with the same original package and editable destinations. Reopen checks those destinations instead of creating another copy.

The list is paginated by saved operation identity and current state. Selecting a row reads its complete retained result; file bodies remain available through full downloads. More saved rows remain available through **Load more orders** and **Load more receivings**. Long operations display their current state and can be stopped. The stop signal goes to the original Node CLI, whose AbortController drains the original Python helper process group before the operation finishes.

Two application lifetimes attempting the same saved operation are reconciled through its local file lock. The application never replaces another active owner's journal merely because this lifetime did not start that worker.

## Installation and ownership

Use the maintained Data preparation Jobs installation and its declared source closure. The product requires the original Node Jobs customer helpers, original output receiving modules, original Python preparation/pipeline modules and the original SQLite/data-processing dependencies. The new dynamic Python module is pipelines/commissioning.py and must be included in that selected installation.

SF30_PREPARATION_NODE optionally selects the installed absolute Node executable. Otherwise the application uses Node from its inherited PATH. The Python helper uses the current owned interpreter, preserving the installed native modules. Browser requests never supply an executable, shell command or arbitrary destination path.

To make an existing Request workspace selectable, point SF30_PREPARATION_JOB_CUSTOMERS at an absolute, operator-owned JSON file with mode0600 in a private directory. It maps aliases to a label and the original customer selection:

```json
{
  "existing_customer": {
    "label": "Existing Jobs customer",
    "customer": {
      "directory": "/absolute/original/customer",
      "runtimeDirectory": "/absolute/installed/sf88-operator-buyer-cli",
      "operatorWorkspace": "/absolute/original/operator"
    }
  }
}
```

Use the original operatorWorkspace or operatorProfile selection where configured. The helper validates the customer's current saved launch through readJobWorkspaceLaunch. An optional expectedInstanceId selects one exact currently running instance. The saved merchant operation retains its original private customer selection even if the host later edits the alias; the public alias list exposes only labels and aliases. The selected original customer application must already be running through its maintained owner.

The managed page inherits the existing bearer token, exact instance ID, same-origin checks and private owner. Complete downloads use the existing single-use download-ticket route. The standalone original loopback application inherits its existing Host and Origin checks. No additional root HTTP socket is opened.

## HTTP interface

All paths below are under the original /api/commissioning prefix. In a managed Applications session, the existing bridge maps them to /api/pipelines/commissioning and applies the original instance authentication.

| Method and path | Effect |
| --- | --- |
| GET orders, receivings or requests | Read a complete page using offset and limit |
| GET record?kind=…&id=… | Read the saved intent, current state and complete helper result |
| GET file?kind=…&id=…&file=… | Download a complete named file after original identity checks |
| POST prepare | Save an explicit order and prepare its original complete input |
| POST continue | Continue the same original prepared order by ID |
| POST receive-intent | Save an expected package, optional job and selected ZIP identity |
| POST upload?id=… | Stream the complete selected result ZIP |
| POST receive | Run the original complete package receiver |
| POST reopen | Verify the retained original package and editable project |
| POST open | Open the verified editable project through the original owner |
| GET customers | Read the configured existing customer aliases and labels |
| POST catalog | Save one merchant request identity and read the full original catalog |
| POST seed | Retain that exact reviewed Request and seal its two complete files |
| POST refresh-catalog | Continue an unselected original catalog read |
| POST cancel | Stop this lifetime's current operation and drain its native helper |

Commands accept JSON bodies within 1 MiB. Complete Request helper outputs allow up to 8 MiB, with retained catalog and request records limited to 9 MiB. The result upload uses its exact Content-Length and the retained package identity. Existing preparation and pipeline routes retain their original behavior.

## Source review

The original five edited files were compared against the current main commit before publication. Their complete preimages matched the recovered original source. The JavaScript application is syntax-checked as a complete script. Source review covers the original package helper delegation, exact selected-order reconciliation, managed download mapping and owned shutdown. Native receiving and browser rendering are validated in the original full product lifetime when an executor is admitted; no paid GitHub Actions run is introduced.
