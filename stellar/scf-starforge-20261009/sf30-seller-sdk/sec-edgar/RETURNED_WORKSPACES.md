# SEC EDGAR — reconcile returned operator workspaces

This workflow continues the complete saved SEC merchant workspace after another operator edits its portable copy. Open **Returned workspaces** in the original authenticated browser. The browser, `sec-edgar-workspace` command and six merchant tools operate the same saved return, comparison and native draft revision.

A return retains the complete original ZIP, the exact received revision tree, every original source capture, its complete manifest, and each review request and result. Original merchant history stays editable in its existing workspace. Applying a return writes one new native revision with the selected decisions and reviewer.

## 1. Issue and edit the complete workspace

Save the intended merchant draft. Use **Buyer handoff → Whole workspace handover → Review saved workspace → Save complete handover**. Download the complete ZIP and its source manifest, and retain the archive SHA-256 printed by that original export.

The recipient uses the existing whole-workspace receiver:

~~~sh
starforge sec-edgar-workspace inspect --archive /absolute/incoming/sec-edgar-workspace.zip --sha256 ORIGINAL_ARCHIVE_SHA256
starforge sec-edgar-workspace receive --archive /absolute/incoming/sec-edgar-workspace.zip --sha256 ORIGINAL_ARCHIVE_SHA256 --out /absolute/private/received-sec
starforge sec-edgar-workspace open --root /absolute/private/received-sec --port 8468
~~~

The recipient edits the normal product controls, retains original source bindings, saves its new native draft and exports the entire workspace again. The original author can continue saving newer work while that recipient operates its independent copy.

The complete export includes all revisions from the original workspace creation. That history identifies the issued version. The latest byte-identical common prefix is the default comparison baseline. A specifically selected earlier issued revision must match exactly in both histories.

## 2. Receive the colleague's return

Open **Returned workspaces** in the original authoring browser. Choose the complete returned ZIP, its original export SHA-256 and a useful label. **Receive complete return** streams the ZIP into the private operator intake, verifies the selected digest, and uses the maintained native archive receiver.

The returned workspace is retained separately under the original workspace's `returned-workspaces/<archive-sha256>/` tree. Its identifier is its complete archive SHA-256. Repeating the same receive reopens that original return.

The return must have the same original workspace identity and a matching issued history. Every received source, merchant revision and complete archive member is checked through the existing compiler and native source engine. A source edition with the same identifier and different original content remains an explicit conflict; receive and comparison do not rewrite its source.

After a lost upload response, choose **Refresh retained returns**. The completed return remains available under its original archive identity. A host with the original ZIP already on disk can receive it directly:

~~~sh
starforge sec-edgar-workspace return-receive \
  --workspace /absolute/private/original-sec/workspace \
  --store /absolute/private/original-sec/source-store \
  --archive /absolute/incoming/colleague-return.zip \
  --sha256 ORIGINAL_RETURNED_ARCHIVE_SHA256 \
  --label "Colleague product review"
~~~

Keep the original application lifecycle: use the running authenticated browser or attached merchant tools, or stop its original listener before using a headless CLI on that same mutable workspace. The original receiver's Python choice can be supplied with `--python /absolute/python`.

## 3. Review issued, current and returned work

Choose the retained return and **Compare the three revisions**. The comparison names all three exact native revisions and displays the complete original values beside each changed field.

| Field | Choice preserved |
| --- | --- |
| Merchant title and public origin | Each is a separate exact value. |
| Existing product | Its exact native product ID identifies the same product across the three revisions. |
| Source binding | Kind, CIK, edition ID and original source SHA are one atomic group. |
| Product definition | Route, description, concepts, filing forms, page size and example query retain their complete values. |
| Payment alternatives | The complete ordered payment-options array is one choice. |
| Product addition or deletion | The entire native product is selected together. |
| Product order | Choose the exact current/returned order, or enter every selected product ID in a combined order. |

A missing field is displayed as **Absent**, distinct from JSON `null`. The comparison preserves array order and original values. Search by product or field, show unchanged fields when useful, and inspect original source editions in the same screen.

Incoming-only changes and divergent changes require an explicit choice. **Keep current for every changed field** records a deliberate retention choice. Selecting **Use returned** adopts that complete field. Native compilation and source queries validate the selected combined configuration.

When each branch added a different product, enter the full desired product roster under **Combine product additions and set their order**. The original resolver checks the selected IDs; a missing or extra product produces a concrete correction rather than a silently altered roster.

**Download complete comparison** saves every row, original configuration, source status and the current choices, including the exact pending request when one exists. **Download original returned ZIP** retrieves the retained incoming archive.

## 4. Save the selected decisions

Name the reviewing operator, enter decision notes and select **Save selected changes as a new revision**. Save or download any unsaved local merchant edits first.

The saved request binds the original return, all three reviewed revisions, complete choices, reviewer and notes. The native expected-revision check preserves changes made by another operator after the comparison opened. Applying an unchanged configuration still creates a revision: that revision records the explicit decision to retain the author's current work.

The source engine receives selected missing original editions using their retained original bytes and metadata. The native merchant compiler then validates the entire selected product configuration and each source-bound example. Source capture, query definitions and payment alternatives retain their original semantics.

Publishing the resulting draft uses the existing merchant controls. This workflow's action is the saved authoring revision.

### Continue an interrupted save

The browser stores the exact pending request before sending it. **Continue original request** resends that same request identity and body. The core reads the immutable native revision token to recover a completed save whose HTTP response was lost.

**Read saved request** shows the retained operation. An uncertain operation stays pending until its original outcome is recovered. A definitive stale-revision rejection is recorded after checking that its original token did not commit. **Review after an unsent or rejected request** clears the local pending selection only when the server has no recorded request or has recorded that definitive rejection. Open the current comparison before making a new choice.

A later normal merchant edit creates its own ordinary revision. The returned-workspace token remains in the original applied revision, so recovery can still find it after newer work.

## 5. Command-line and library operation

All commands use the existing complete source store. A typical review is:

~~~sh
starforge sec-edgar-workspace returns --workspace /absolute/private/original-sec/workspace --store /absolute/private/original-sec/source-store
starforge sec-edgar-workspace return-inspect --workspace /absolute/private/original-sec/workspace --store /absolute/private/original-sec/source-store --return ORIGINAL_RETURN_SHA256
starforge sec-edgar-workspace return-preview --workspace /absolute/private/original-sec/workspace --store /absolute/private/original-sec/source-store --return ORIGINAL_RETURN_SHA256 --output /absolute/review/comparison.json
~~~

`--output` creates a new file exclusively, preserving an existing review. To select a particular exact historical baseline, add `--issued-revision N`.

Prepare one complete request from that actual comparison:

~~~json
{
  "returnId": "ORIGINAL_RETURN_SHA256",
  "reviewSha256": "ORIGINAL_COMPARISON_SHA256",
  "issuedRevision": 4,
  "requestId": "apply-original-operator-request",
  "actor": "Actual reviewing operator",
  "notes": "Use the reviewed recipient product description and retain the current public origin.",
  "decisions": {
    "EXACT_FIELD_KEY_FROM_COMPARISON": "returned"
  }
}
~~~

The SHA values, issued revision and field key above are placeholders for the original comparison. Include every required choice with its exact key. A mixed product order uses `{"order":["EXACT_FIRST_PRODUCT_ID","EXACT_SECOND_PRODUCT_ID"]}` for the `products.order` decision.

~~~sh
starforge sec-edgar-workspace return-apply --workspace /absolute/private/original-sec/workspace --store /absolute/private/original-sec/source-store --input /absolute/review/original-request.json
starforge sec-edgar-workspace return-operation --workspace /absolute/private/original-sec/workspace --store /absolute/private/original-sec/source-store --return ORIGINAL_RETURN_SHA256 --request-id apply-original-operator-request
~~~

Resend the exact original request file after an interrupted command. Keep that request and the returned native revision with the source package.

The installed library exposes `@tokenjunkielabs/starforge-merchant/seller/sec-edgar/returns`; ordinary integrations use the original `openEdgarWorkspace` object's `receiveReturn`, `listReturns`, `inspectReturn`, `previewReturn`, `applyReturn` and `returnOperation` methods. The same original object owns its saved draft and capture store.

## 6. Merchant agent operation

The existing private SEC connection file can name complete incoming operator ZIPs:

~~~json
{
  "schema": "stellar-forge.sec-edgar-workspace-connection.v1",
  "workspaces": {
    "issuer-research": {
      "directory": "/absolute/private/original-sec/workspace",
      "storeDirectory": "/absolute/private/original-sec/source-store",
      "returnedWorkspaces": {
        "colleague-return": {
          "label": "Colleague product review",
          "file": "/absolute/incoming/colleague-return.zip",
          "sha256": "ORIGINAL_RETURNED_ARCHIVE_SHA256"
        }
      }
    }
  }
}
~~~

Retain any existing captures, acquisition profiles, merchant profiles, package aliases and configured runtime when adding this selection. `merchant_edgar_status` lists the declared return aliases and exact archive digests.

| Tool | Same original operation |
| --- | --- |
| `merchant_edgar_return_receive` | Receive a configured archive alias with its exact selected SHA-256. |
| `merchant_edgar_returns` | Page every retained returned workspace. |
| `merchant_edgar_return_inspect` | Inspect the complete original return and manifest. |
| `merchant_edgar_return_preview` | Read all three native revisions, exact rows and source status. |
| `merchant_edgar_return_apply` | Save explicit choices with the original request ID and comparison SHA. |
| `merchant_edgar_return_operation` | Recover the original applied, pending or rejected result. |

Large complete comparisons use the existing `merchant_edgar_result_file` reader. The same retained result SHA and byte offsets provide the full body. Receipt and apply share the existing original-workspace mutation guard, while status and recovery remain readable.

## 7. Export and independently reopen all continued work

Use the same **Whole workspace handover** after applying the return. Its complete native export includes the original histories, source captures, received return archives, extracted return trees and operation requests/results. The optional typed returned-workspace inventory preserves original manifests that predate this capability.

Receive that complete archive into a fresh directory with the original `receive` command and open it through the normal browser or Applications entry. Reopen the applied native revision, retained return, full three-version comparison and original operation result. A recipient can continue its own next edits using the ordinary product controls.

Native source/version members retain their existing file limits. Complete nested return ZIPs use streaming integrity and the whole-archive expanded size ceiling; aggregate member and expanded-byte limits apply to the full export.

## 8. Complete original receiving course

Continue the original **SCF-SEC-EDGAR-OPERATOR-PORTABLE-6200-20261012** receiving operation and its actual Apple facts / Genpact filing source package. Keep its full original source, runtime, capture metadata, original 25,135 facts and 1,003 filings, and installed application identity together. Build/install the complete maintained `sec-edgar` selection containing this chapter and its source.

Operate one issued workspace and an independently received copy. Save useful recipient changes through the original product controls, continue newer author edits, export the entire recipient workspace, receive that exact return and choose the combined next draft. Include a real conflict, an independent returned field and an explicitly retained author change.

Continue a save after an interrupted response and reopen its exact original request after another normal edit. Export the entire continued workspace, independently receive it, and use its normal controls to inspect the applied revision, original return, source, comparison, operation result and editable next draft.

Open and LOOK at the actual desktop and 390 px views, operate the changed controls, download and reopen the comparison and original returned ZIP, then open the complete exported project as a recipient. Keep the actual returned files and viewed images with that original receiving operation. The following complete standing owner instruction travels with this guide.

---

# Repository delivery instructions

Use the current README and the existing product's build/receiving guide. Coordinate through the original implementation and receiving owners, preserve concurrent source, and carry work through its authorized delivery.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

## GitHub Actions zero spend — existing owner instruction

Keep GitHub Actions disabled in this repository's provider settings and preserve the disabled source policy in [.github/hosted-ci-policy.json](.github/hosted-ci-policy.json). Every workflow job must retain the established literal-false condition, including manual dispatch and reusable jobs. Preserve its original condition inside the wrapper, and preserve the complete steps, commands, source and delivery artifacts.

Run focused product work in the existing cloud Linux or original local receiving operation. A public repository, available free minutes, cloud admission failure or a missing green check does not authorize enabling or dispatching hosted Actions. Do not set `HOSTED_CI=on`, add scheduled hosted runs or choose a paid runner. Keep source-native receiving moving with its original owner and saved operation.

Before publishing workflow changes, use the maintained Commons `tools/hosted_ci_gate.py --zero-spend REPO_ROOT` and `--check REPO_ROOT` source operation where that existing runtime is available. Its canonical wrapper is `${{ (false) && (ORIGINAL_CONDITION) }}`; the original condition is retained for native continuation. Provider disablement, the whole-account spending budget and dated billing remain separate controls; preserve current artifacts and their original custody.

This carries Bryce's existing zero-spend instruction from [Commons RULES, CI and spend](https://github.com/woahwhattheheck/commons/blob/main/RULES.md#4-ci-and-spend) into this repository's consumed entry guidance. Original cost coordination: https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791755765336589 .

