# Following public-document observation

This programme extends a saved document-evidence case through one explicitly
requested complete public-document capture, a named review, historical comparison,
full export and independent receiving. It uses the original IATI workspace,
fetcher, JavaScript SDK and Merchant tools.

The original case's recipient becomes the following phase's sender. The original
recipient's local notes and all earlier observations remain in the same linear
plan. The complete original packet and native result remain available at their
original paths. The following phase has its own files below
`case/following/<operationId>/`.

## The FCDO continuation

The installed example continues the actual FCDO organisation case. Its selected
source has 80 document rows, of which the original evidence plan selected two.
The original sender ended at revision5; its independent recipient added a local
note at revision6. The following input selects that exact revision6 and observes
the first row's literal URL once:

`https://www.gov.uk/government/publications/fcdo-annual-report-and-accounts-2024-to-2025`

The selected publisher URL is a landing page. This operation captures the complete
response to that exact URL. It does not select linked attachments on the operator's
behalf. An attachment can be a separate explicitly selected future document.

The original DNS-failure observation and the second row's refused trailing-space
URL remain in the history. The new observation is added to the first row. The
named following review defers substantive relevance assessment and carries forward
the second row's existing URL-correction decision.

| Saved edition | Operation | Retained work |
| --- | --- | --- |
| Original recipient revision6 | Existing local receiving note | Original source selection, both observations, complete named review and local note |
| Following revision7 | One acknowledged observation | Same literal URL, actual HTTP receipt and complete response body; all previous observations retained |
| Following revision8 | Complete named review | New body receives the authored deferred decision; the other original decision is carried forward |
| Independent recipient revision9 | Local receiving note | Full revision1–8 history and document body, followed by the new recipient's local note |

These revision numbers describe the selected example. The programme uses the
explicit input's base identity, and the original model assigns the subsequent
revisions. It never changes the original sender into a competing branch.

## Select the complete installed source edition

Install the entire released IATI Applications source and the matching Merchant
source before running this continuation. The same full installed-source
declarations must include:

- `document_evidence/following_observation.py`
- `document_evidence/FOLLOWING.md`
- `examples/fcdo-organisation-2026/document-following-input.example.json`
- The accompanying complete `document_evidence/receiving.py` and
  `document_evidence/receiving.mjs` editions.

The ordinary SDK entry point remains `iati/client.mjs`. Merchant uses the existing
`stellar-forge/mcp-merchant-operator` source directory.

Evidence packets contain the exact installed source edition that accompanies
their exports. The original importer checks that edition before accepting a
packet. The following programme exports a new packet under the final installed
edition and receives that new packet throughout its connected journey. The old
packet remains a complete historical deliverable with its original matching
source.

Keep the complete source edition together between native export, independent
receive and the connected SDK/Merchant stage. If a source repair is required,
retain the previous output and select the repaired complete edition deliberately;
an existing packet is not silently rewritten to match changed code.

## Configure one explicit operation

Copy
[`document-following-input.example.json`](../examples/fcdo-organisation-2026/document-following-input.example.json)
to a private operator configuration file. Select the actual retained case in
`caseDirectory`. The remaining fields bind the original case and the requested
new action:

| Input | Meaning |
| --- | --- |
| `operationId` | One following operation and its original acquisition request ID |
| `originalOperationId` | The completed original native case |
| `originalResultSha256` | SHA256 of the complete original native-result JSON file |
| `workspaceSha256` | The original recipient's actual workspace identity |
| `base` | Exact plan ID, revision and record SHA256 to continue |
| `rowId`, `publishedUrl` | One original selected row and its exact literal URL |
| `limits` | The complete unchanged capture limits already saved in the selected plan |
| `acknowledgeNewObservation` | Explicit `true` for this additional network observation |
| `actor` | Named operator responsible for the observation and review |
| `review` | The authored deferred decision and substantive note for the new capture |

The example's original-result identity is
`58265f78ace6fa72b57d6ebe3148d7f174e929f452eefeda1a0e47351d61d2a9`.
Its original packet is 1,688,605 bytes with SHA256
`99632773844ec981a5ef57e9dc97d59b5d31245cc90c6541f107e5a514270b6f`.
The selected original recipient is revision6 of plan
`97a0a60458635f96c79b18f00dc871245aa2e7f2b0dc5582e766efcd985d250a`,
record
`c065be976009292b8c9d22a47439499b8d6b0a4c9eecdab9f399f90452e13dbc`.

The example selects a16MiB response capacity,30-second total request timeout,
10-second connection timeout and up to5 redirects, exactly as saved in that plan.
Changing these values in the continuation configuration does not change the
original saved plan; a mismatch is rejected before capture.

The programme stores the complete operation definition in its following phase.
The physical case path is recorded separately in a content-addressed runtime
input. Moving a closed complete case to another authorized worker therefore
preserves the same operation and its original requests while retaining both
runtime selections.

## Run the complete native programme

Use an available worker that can reach the selected original public URL through
the maintained native fetcher. Transfer the complete closed case and exact
installed source together when using another worker. The existing case lock and
workspace lease keep one active owner for this case.

From the complete installed source:

```bash
python3 -B \
  stellar/scf-starforge-20261009/sf30-seller-sdk/iati/document_evidence/following_observation.py \
  --config /absolute/private/following-input.json
```

The native stage performs these connected operations:

1. Verify the original native result, original packet and unchanged original
   sender. Reopen the exact selected recipient history and the saved named
   decisions.
2. Retain the complete explicit request before calling the original
   `DocumentEvidence.observe`. Reopening this request returns its existing
   acquisition or terminal result.
3. Copy the full native response body from its original retained descriptor and
   verify its complete byte count and SHA256.
4. Carry the complete prior decision set into the next named review, replacing
   only the selected row's observation and authored deferred decision.
5. Save the comparison from the original recipient edition to the following
   reviewed edition. Preserve the existing correction draft and prepare the full
   report, register, plan and applicable correction-request files.
6. Reopen each original following request and its historical result. Export the
   complete new packet, receive it into the following phase's independent
   workspace, add a local receiving note, and receive the same packet again.
7. Close and reopen both workspaces and verify the complete received body and
   original local-note edition before committing the complete native result.

The packet contains all selected plan revisions, retained original requests,
complete observations, response assets, historical comparisons, original
organisation data, full reports and matching installed source. The independent
recipient is a separate workspace, with its original import result and latest
local revision both retained.

## Continue through the SDK, Merchant and browser

The same command can run the complete connected stage immediately after native
receiving:

```bash
python3 -B \
  stellar/scf-starforge-20261009/sf30-seller-sdk/iati/document_evidence/following_observation.py \
  --config /absolute/private/following-input.json \
  --connected \
  --node /absolute/node \
  --mcp-directory /absolute/source/stellar-forge/mcp-merchant-operator \
  --playwright-module /absolute/playwright/index.mjs \
  --chromium /absolute/chrome-headless-shell
```

Provide both browser arguments together. Omit both to run the native SDK and
Merchant journey without the browser stage. The runtime retains each explicit
configuration by its full content hash.

The reused original `receiving.py` creates private console connections for the
existing recipient and the following independent receiver. Its explicit
`workspace_paths` argument maps those real workspaces; the phase directory
continues to own its outputs, exports and private connection files. All original
workspace and phase locks remain active for the connected run.

The existing `receiving.mjs` programme then:

- Reads the complete document register and every selected row's full detail
  through both SDK and Merchant.
- Pages the entire Merchant history using the original inventory snapshot and
  compares it with the full SDK history.
- Reopens the saved comparison and correction through both interfaces.
- Replays the retained following request IDs and verifies their exact historical
  results, then checks the current selected sender edition.
- Downloads the complete report, register, plan and applicable correction through
  the SDK and Merchant.
- Reads every retained body. For the new document, both connected downloads must
  match the native observation's byte count and SHA256, and the full observation
  must match across both interfaces.
- Retains and downloads a complete new Merchant packet, releases its initial
  prefix cursor, reopens the retained export to completion, receives the export,
  and streams the native packet through the SDK into the same independent
  recipient.
- Closes and reopens Merchant and verifies the retained complete export while
  preserving the recipient's later note.
- When the browser is selected, opens the same saved edition in all six existing
  desktop views and the original mobile acquisition/handoff views.

The optional browser stage uses the actual installed browser executable. Runtime
selection changes produce a new retained configuration, preserving earlier
runtime observations.

## Find the complete output

For the selected `operationId`, the following phase contains:

| Path below `case/following/<operationId>/` | Complete content |
| --- | --- |
| `original-input.json` | Path-independent original operation definition |
| `runtime-input-<sha256>.json` | Complete input with the actual physical case path |
| `requests/` | Original observation, complete review, comparison and recipient-note requests |
| `results/base-plan.json` | Full original recipient edition selected for continuation |
| `results/base-observations.json` | All observations already retained by that edition |
| `results/observation-1.json` | Exact new native acquisition result |
| `results/document-*.bin` | Complete native response-body copy |
| `results/following-evidence-comparison.json` | Full saved historical comparison |
| `results/following-url-correction-draft.json` | Complete correction draft from the carried named review |
| `results/native-receiving.json` | Complete following native outcome after both workspaces reopen |
| `document-evidence.zip` | New full native portable packet |
| `receiver/` | Independent receiving workspace and its local note |
| `connected/files/` | Full SDK/Merchant files and packet downloads |
| `connected/observations/` | Complete selected connected reads |
| `connected/complete.json` | Complete SDK/Merchant result and optional browser result |
| `merchant-exports/` | Original retained Merchant exports and readback metadata |

The response's media type, redirects, timestamps, actual HTTP status and complete
body descriptor remain in the observation. The body preserves the native HTTP
message representation and content-encoding descriptor. The programme does not
convert HTML into a PDF or replace a compressed response with different bytes.

## Interpret the historical comparison

The comparison uses the original model's exact row pairing and content rules.
A prior DNS failure has no complete body to compare with the new complete
response, so that row's content comparison remains `indeterminate`. The saved
comparison still shows the new actual observation and named-review change. A
later comparison between two complete compatible body representations can
identify the same or changed bytes.

The unchanged second row keeps its refused observation and authored URL
correction. Its correction request remains a complete draft for the original
organisation planner. Substantive review of the newly acquired document remains
the explicit named `deferred` decision.

## Continue after interruption

Reopen the same configuration and operation. The original request IDs, saved
results and complete output files decide where execution continues. The original
model returns an already-recorded observation without another public request.
Historical replay preserves the latest reviewed sender and receiving note.

If the actual request returns DNS failure, refusal, truncation or an empty
response, its complete result is retained in `results/observation-1.json` and the
native observation history. The following programme reports that concrete
acquisition result before attempting the full-body connected delivery. Select a
working authorized acquisition route, carry the complete closed current case to
it, and author the next explicit operation from the now-current saved revision.
The earlier request remains the record of its actual result.

If an active acquisition still owns the original request, use the original
request lookup and owner continuation. If transport was lost after completion,
read the existing complete result and reopen it. The programme does not create a
replacement workspace to recover an existing case.

For moving a completed case between workers, close its console and browser
processes, retain both original workspaces and the complete following directory,
and transfer the full closed checkpoint with its matching source. Ephemeral
console capabilities are recreated by the original server on the receiving
worker. Resume with the same operation definition and the receiving worker's
actual `caseDirectory`.
