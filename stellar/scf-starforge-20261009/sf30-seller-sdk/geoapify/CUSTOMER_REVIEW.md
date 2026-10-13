# Customer address review and complete returns

This workflow lets the source owner or receiving customer review a frozen address edition on their own computer, retain unfinished work, and return deliberate choices to the original Geoapify operator. The operator sees the issued baseline, the current workspace and the customer's choices together before adopting anything. The resulting decisions use the existing Geoapify validator and one original workspace commit.

Start with the [complete address workspace](README.md), its retained original source, actual provider responses and an existing frozen edition. The [Customer Installation guide](../../../scf_2026/sf49_data_commissioning/installation-workorders/GEOAPIFY_CUSTOMER.md) is a separate continuation for the original Workshare, commercial bindings and receiving case. Customer review choices become address decisions; the original Installation remains responsible for its own acceptance, deployment and payment records.

## What is issued

Each issue selects one exact frozen edition, independently of the currently active source and selected dataset. Its project retains the edition, workspace/revision, normalized intake SHA, mapping, source provenance, every original query and every original row in that query, full candidates, exact response SHA and original baseline decision. Invalid source records and duplicate business identities remain present.

A grouped address query may represent several original business records. The customer sees every grouped row and its original ordinal; a decision covers that exact original query group. Repeated business identifiers do not merge unrelated queries. A confidence score is provider information; the customer still chooses a candidate and coordinate policy deliberately.

The project, full working file, issued HTML and original issue request are retained in the native workspace. Subsequent source imports, local review changes and new editions leave those issued files intact. Names, notes and hashes preserve attribution and source identity. They do not authenticate a person's identity or create an electronic signature.

## Issue and open the customer's complete files

1. Open the original private operator and select **Customer review & returns**.
2. Choose the exact retained frozen edition. Enter a useful review title and intended customer reviewer, then issue the review.
3. Open the issued original and inspect its source, grouped rows, candidates and baseline.
4. Export the issued files. Open `customer-review.html` and retain `customer-review.json`; the separate `customer-review-project.json` is the unchanged original project.
5. Deliver those exact files through the existing customer relationship and receiving operation. The HTML embeds the whole project, the original shared review model and its complete interface. It makes no network requests and contains no provider account key.

Use a current browser with WebCrypto and JavaScript support. Opening the saved HTML works from the received file without a server. If that browser refuses the required cryptography, use a current browser that supports it; the interface reports the missing capability.

## Work in the offline review

Choose a query from **Original address queries**. Search covers the original query and source records; filters distinguish unreviewed queries, unfinished forms and recorded choices. Query and original-row pagination change the visible page while the saved working file remains complete.

For each query, inspect all source rows, the issued baseline, every candidate, provider attribution and confidence, and the original versus proposed coordinates. Record either a selected candidate or **keep source**, with your name, reason and coordinate policy. Candidate acceptance binds the exact issued response and candidate. Keeping the source explicitly preserves its original coordinates.

Typing a form does not record a choice. The interface preserves those unfinished values when navigating, recording a different query, saving and reopening. Clearing a recorded choice adds a history event and retains the earlier event. Review history includes working changes, recorded choices and clears.

Use **Save working JSON** or **Save working HTML** to download the complete current project, recorded choices, unfinished forms, editor selection and history. Saved HTML remains a complete offline application. **Export all source rows** produces a convenient CSV with every original source record and its recorded choice; working JSON remains the full fidelity version for further editing.

Browser recovery is an additional copy. When the browser finds another retained version, it asks whether to recover that draft or keep the displayed file before editing. Save your complete file when you finish a session. Opening a different JSON file requires saving current work first. A selected local file must be opened or explicitly cleared before exporting the displayed work.

The shared model admits complete compact JSON up to128MiB and retains space for the return envelope. Unfinished forms have a16MiB bound. A change that would exceed the retained budget is rejected while the preceding complete draft remains available. The browser's file picker has a256MiB input-read ceiling; the original shared model still applies its smaller semantic limit.

## Create and receive a return

Record at least one deliberate choice. Under **Return recorded choices**, enter your name and return note, then use **Create complete return**. The downloaded JSON contains the unchanged issued project, every recorded choice, all unfinished forms, complete history and the return's original identity. Keep the working file if you will continue reviewing later.

The operator receives that entire return in the original workspace. A return must match its original issue and complete project. Receiving saves the original bytes; it does not apply the choices. Sending the same original return again recovers its existing record. Reusing its identity with different contents is rejected.

The browser accepts a complete local return up to16MiB through its existing authenticated action endpoint. For a larger admitted return, use the original native CLI path or a host-declared MCP `customer-return` import. Those paths retain the full original file under the shared128MiB bound.

Issue, return and adoption histories have independent pages. The operator can inspect an issued source, inspect a received customer's unfinished form and recorded choice, and download the complete files for either the original issue or the selected return. Changing customer selection clears earlier customer download buttons and query pages.

## Compare issued, current and customer decisions

Preview the received return against the current original workspace. The complete preview binds the original issue, return, current intake, current response/candidates and current local decision. It is an observation of those exact current values.

| Status | Meaning and available continuation |
| --- | --- |
| NO_CUSTOMER_CHOICE | The customer has no recorded choice for this query. Unfinished forms remain in the return. |
| READY | The customer's explicit choice can be adopted against the unchanged relevant baseline and response. |
| ALREADY_CURRENT | The current native decision already agrees with the returned choice. |
| CONFLICT | The current local decision differs from the issued baseline and the customer choice. Review all three before selecting customer, current or skip. |
| RESPONSE_CHANGED | The original response/candidates or query context changed. Keep the current result or skip; obtain a review of the new exact result before adopting a customer choice. |
| SOURCE_CHANGED | The currently active intake differs from the issued original. Reopen the intended original source and preview again, or issue the new source for review. |

Both accepted-candidate and keep-source choices carry the exact intake and response context. A keep-source return cannot silently override a newer provider result. Preview rows show every grouped source row, issued candidates/baseline, current candidates/decision and the customer's attributed choice.

Select resolutions explicitly. Choices are retained against the exact preview SHA and each row's current-context SHA, including across pages. Enter the receiving reviewer's name and adoption reason.

**Adopt all READY choices** is an explicit alternative for a large return. It selects every READY query in the complete exact preview, including those outside the visible page or filter. It leaves conflicts, changed contexts, already-current rows and unrecorded queries untouched. The native request retains the expanded resolutions.

Adoption checks the expected workspace revision, active intake and complete preview. It passes each selected customer decision through the original `validateDecision`, then records all resulting native decisions and the adoption in one original atomic state change. A later source or local decision requires a fresh preview. The issued files and customer return stay unchanged.

## Interrupted operations and original request recovery

Issue and adoption have a stable caller-generated `requestId`. The browser saves the complete pending request in a dedicated workspace-specific storage entry before dispatch. If that write fails, it reports the storage problem before making a native request. An uncertain native outcome retains the exact request for **Recover original request**.

The native writer retains the original normalized request, actual first-attempt time and source context before creating derived immutable files. Retrying an interrupted attempt uses those original values. A committed original request is returned through recovery before the generic revision check, so a lost response can be recovered after the workspace revision advances. Reusing a request identity for different contents is rejected.

A definitive source/revision/context rejection leaves the forms available for a fresh preview and new request. Unknown or interrupted outcomes retain the original request. Receiving the same complete return also recovers the existing original return record.

Original issued and returned HTML are retained. Re-exporting a previously exported issue/return reads its original bytes rather than regenerating it under a later software version.

## Native CLI

Read the current revision from the original operator. Payload examples below are templates: replace the example IDs, hashes and revision with values returned by that same workspace.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/geoapify/cli.mjs status \
  --dir /private/customer-addresses

node stellar/scf-starforge-20261009/sf30-seller-sdk/geoapify/cli.mjs act customer.issue \
  --dir /private/customer-addresses --payload /private/issue.json
~~~

An issue payload:

~~~json
{
  "expectedRevision": 12,
  "requestId": "customer-review-001",
  "editionId": "edition-REPLACE_WITH_ORIGINAL_ID",
  "title": "Customer location review",
  "recipient": "Original customer reviewer"
}
~~~

Export with `customer.export` and `{issueId, expectedRevision}`. Include `returnId` to export the complete selected return and its working HTML/JSON. Original `readExport` supplies the exact retained files.

Receive an actual returned file with:

~~~json
{
  "expectedRevision": 14,
  "path": "/private/received/customer-return.json"
}
~~~

Pass it to `customer.receive`. Preview with `customer.preview` and `{returnId,offset:0,limit:25}`; read later pages using the returned total. The optional status filter changes the displayed rows, while the preview SHA still binds the complete preview.

An adoption payload:

~~~json
{
  "expectedRevision": 15,
  "requestId": "customer-adoption-001",
  "returnId": "REPLACE_WITH_ORIGINAL_RETURN",
  "expectedIntakeSha256": "REPLACE_WITH_CURRENT_INTAKE_SHA256",
  "expectedPreviewSha256": "REPLACE_WITH_COMPLETE_PREVIEW_SHA256",
  "reviewer": "Original receiving reviewer",
  "note": "Reviewed the returned address choices against the current source.",
  "resolutions": [
    {
      "queryId": "q_REPLACE_WITH_ORIGINAL_QUERY_HASH",
      "choice": "customer",
      "expectedCurrentSha256": "REPLACE_WITH_THIS_QUERY_CURRENT_SHA256"
    }
  ]
}
~~~

Use `"readyAll":true` instead of `resolutions` for the explicit all-READY operation. Keep the exact original payload for recovery. The command sends one action through the original operator; it never runs a provider request implicitly.

## HTTP and installed merchant tools

The existing private browser server uses authenticated `POST /api/action` with `{action,payload}`. The seven actions are `customer.issue`, `customer.list`, `customer.inspect`, `customer.export`, `customer.receive`, `customer.preview` and `customer.adopt`. Mutations use the current original revision; adoption also requires the active intake and exact complete preview.

The installed `geoapify-workspaces` provider now has twenty tool families. `merchant_geoapify_customer` provides these same actions, with declared workspace/import aliases and independently paged query and original-source-row inspection. Its `receive` selects a host-declared `customer-return` input; it does not accept an arbitrary agent-supplied filesystem path.

Use `merchant_geoapify_file` with `kind:"source-export"`, the returned export ID and exact filename to read complete original files. Retained byte chunks carry their SHA, original read ID and continuation offset. Finish or release that original read. The original Installation, publisher, buyer, provider job and source-history tools continue through the same operator and writer lease.

See [native operator configuration](../../../../stellar-forge/mcp-merchant-operator/GEOAPIFY_WORKSPACES.md) for the private connection, original host aliases and complete installed tool contract.

## Whole backup, restore and customer Installation

The original `package.export` includes all issued request/project/working/HTML files, complete received returns and rendered returned HTML when produced, every adoption's original request/preview/result, and all native decisions alongside sources, jobs, forms and frozen editions.

Restore uses the same complete package inspector as Customer Installation source preparation. It reconstructs issued projects from their original frozen source, validates complete returned drafts and history, reconstructs each adoption preview from the unchanged original customer choices and retained current context, resolves the original decisions, and verifies their presence in the native decision history before adopting the restored workspace. An altered preview cannot attribute a choice to an unchanged return.

Use the existing empty-workspace restore, then reopen the original issue and return, inspect the same grouped records, export the original customer files and build the next frozen edition after the intended decisions are adopted. The original Installation preparer carries the complete archive and selected frozen dataset with the existing Workshare and receiving bindings.

## Same customer receiving course

Use the existing Geoapify equipped receiving operation and its actual customer source/provider account. On the exact outgoing operator and standalone customer HTML:

1. Open the issued frozen source and inspect grouped, duplicate, invalid, pending and multi-candidate records at desktop and narrow widths.
2. Type unfinished forms in two queries, record one, navigate and save/reopen both complete JSON and HTML. Inspect the actual downloaded CSV and all original records.
3. Create a full return, receive it in the original operator and inspect both the original source and the customer's unfinished forms.
4. Change one local decision and review the actual three-way conflict. Change a response, including for a keep-source query, and observe the source-bound refusal. Select deliberate resolutions against the fresh complete preview.
5. Exercise interrupted original request recovery and inspect the original adoption once. Build a following edition; export/restore the entire workspace and reopen the original issue, return, adopted decisions and all retained files.
6. Switch between two customers' issues/returns and verify source labels, pages and downloads remain attached to the selected customer.
7. Continue the original Customer Installation and independent receiving case. The producing operator views the actual rendered frames, operates the controls and opens every outgoing attachment before presenting the customer version.

Preserve the original receiving owner and complete source course when moving between equipped hosts. Keep existing demonstration/report tabs and the user's current browser instructions.
