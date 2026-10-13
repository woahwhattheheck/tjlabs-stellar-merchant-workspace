# Assigned Property Continuity discrepancy review

This extension sends an explicitly assigned set of original reconciliation findings to a separate reviewer, retains that reviewer's complete returned work, and brings selected named decisions back through the existing Property Continuity workspace. It uses the same original report, sources, evidence, decision engine, SQLite transaction, request history and full archive.

No tenant, financial, mapping, rehearsal or cutover operation occurs here. The reviewer proposes findings dispositions. The receiving operator explicitly chooses what to adopt. The unchanged native finding.decide rule still requires a reason and complete original evidence, and cannot accept a BLOCKING finding as an exception.

The original partner role, source permission, commercial scope and IDA qualification status remain as documented in CONTINUITY_DOMAIN.md and OPERATING.md. The bundled seven-family training case remains visibly TRAINING; it is not a customer migration or accepted delivery.

## The complete operator workflow

1. Open an actual saved independent reconciliation. Read its original source and independently retrieved target populations, their declared and observed coverage, mapping editions, current mapping approvals and full report.
2. Select the findings to assign, name the actual reviewer by ID and name, and describe the requested work. The issue freezes the exact current state hash, original reconciliation/report identity, selected findings, implicated full rows, current finding decisions, source editions, mappings, captured mapping approvals and every selected source/evidence file.
3. Produce the complete issued JSON and standalone reviewer HTML. Retain both original byte sequences before recording the issue. A first issue may also generate a complete original report JSON object; retain that file with the other issue sources before admission.
4. Open the HTML as a recipient. Inspect the source/target values and their exact numeric token descriptions. Download and open the original files. Enter incomplete reasoning, notes, evidence and draft controls as useful; an unfinished return can contain zero named editions.
5. Name a complete reviewer edition when ready. Every assigned finding remains present exactly once. A finding can stay undecided, require correction, or accept an exception where its original severity is REVIEW. Named decisions carry the assigned reviewer's exact identity, an explicit observed time, reasons, evidence and an immutable parent/hash. Later corrections create later editions.
6. Return the whole JSON or HTML. The receiver retains the raw original file, including all named editions, the independent working-copy identity, unfinished draft and complete evidence. Files are never converted to a decision merely because they were uploaded.
7. Select an actual named edition. Compare the issued baseline decision, current original decision and returned reviewer decision for every assigned finding. Read the full reasons, evidence and attribution; a changed current decision remains visible.
8. Choose KEEP/CURRENT or APPLY/RETURNED for every finding. The complete comparison hash and original workspace revision bind the displayed choices. A changed workspace requires a fresh comparison. KEEP changes no finding decision. APPLY invokes the unchanged original finding.decide operation under the receiving supervisor's actor/time and retains the reviewer edition as its original provenance.
9. Reopen the historical adoption, then export and independently receive the whole original workspace. The issued HTML, JSON, returned bytes, all original source/evidence objects, native decision children, original outer request/result and full earlier histories travel together. Later edits in an existing received branch remain preserved by the original receiving contract.

A named undecided item has null disposition, an empty reason and no selected evidence. Its unfinished reasoning can remain in the separate draft editor. No undecided item can be applied as a native decision. A BLOCKING finding permits only correction or undecided; a later corrected source/mapping/reconciliation remains the existing way to resolve it.

## Exact source and numeric fidelity

Source bytes remain original blob objects. JSON non-integer numbers and unsafe integers in original source data use the existing native source display and numberTokens projection. The issue's report rows are the original safe report projection, not a browser reparse of raw source numbers. The full original report JSON is supplied as an original file as well.

An original source descriptor stays unchanged in its source wrapper. Outgoing portable file names use a plain basename when a source's original label is not a portable filename. The original label remains in the source wrapper. If a returned decision still selects the same baseline evidence SHA, native comparison preserves the baseline descriptor metadata; filename presentation does not manufacture a decision conflict.

Complete selected source populations accompany the issue. A finding concerning cross-population integrity can require all relevant population rows. The preparation fails explicitly if the full document will exceed capacity; it never substitutes an excerpt, missing counterpart or summarized evidence for the complete selected source.

The issue is an exact issued record, not a signature or independent proof of the proposed reviewer's identity. Named attribution is checked against the assigned identity. The operator remains responsible for using the authorized recipient and assessing its actual return.

## Original command and transaction contract

Every command uses the existing envelope:

    {requestId, kind, actor:{id,name}, at, body}

Workspace.execute(command, expected_revision) remains the sole writer. It retains the complete original envelope and expected revision, returns the original first result when the same UUID/input is replayed, and owns BEGIN IMMEDIATE, complete state validation and commit. The review extension creates no database or separate business transaction.

Host preparation occurs under the existing workspace lock. Immutable blobs are retained before a compact command; source objects do not cause nested commits during business adoption. The host must preflight all distinct new bytes against the existing aggregate blob allowance before the first upload in that group. A retained but unused immutable object is not a committed issue or accepted finding.

### Issue preparation and recording

prepare_issue(state, command, read_blob) takes a preparation command with kind review.issue and body:

    {
      id,
      reconciliationId,
      findingIds:[original SHA256 finding IDs],
      reviewer:{id,name},
      note
    }

It returns:

    {
      document: complete issued JSON value,
      issued: {sha256,bytes,mediaType,name},
      raw: exact canonical UTF-8 JSON bytes
    }

The issued document's workspace contains id, title and stateSha256. The pure domain has no SQLite revision; the original expected_revision remains in the outer command envelope. Both the state hash and original outer revision guard must hold when recording the prepared issue.

The original host calls initial_return(raw), renders its own complete reviewer template with that value in one inert application/json script whose ID is property-review-data, and retains the exact HTML. The issued document.files entries include all required raw bytes as Base64; retain each of them, raw and the HTML before recording:

    kind: "review.issue"
    body: {id, issued:{sha256,bytes,mediaType,name},
              html:{sha256,bytes,mediaType,name}}

Use the same requestId, actor and at as preparation. Admission rebuilds the entire issue from the actual current original state and compares exact canonical bytes. It also checks the HTML's complete inert initial payload and all retained evidence. If anything advanced, retain the failed candidate and prepare a new explicitly reviewed original request.

The committed event result includes issueRequest (the complete preparation envelope), issuedSha256, htmlSha256, reconciliationId, reviewer, findingIds and files descriptors with roles issued_json and issued_html. This retains enough original input to recover a lost response without guessing that a UUID belongs to the current screen selection.

### Return preview and receipt

Upload the exact returned JSON or HTML as an existing blob. prepare_return(state, descriptor, read_blob) validates the original embedded issue, complete immutable edition chain, draft, all file identities and assigned population. It returns:

    {
      issueId, workingCopyId,
      editions:[{id,parentId,name,actor,at,sha256}],
      draft,
      files:[{sha256,bytes,mediaType,name,base64}],
      file:{sha256,bytes,mediaType,name}
    }

This is an internal preparation result. The host retains every complete files member before the business command; an HTTP preview can omit Base64 only when the exact raw document/file download remains available. No selected finding, edition or draft is truncated.

Record through:

    kind: "review.receive"
    body: {id, file:{sha256,bytes,mediaType,name}}

The original file is retained unchanged, including an unfinished zero-edition return. A named edition UUID already received for this same issue must retain its exact complete canonical edition body and hash. A correction uses a new edition UUID. Distinct-edition divergent histories remain admissible even when independently edited devices carry the same workingCopyId: each complete returned file and its own parent chain are retained, and the operator explicitly selects returnId, editionId and the current comparison hash before adoption. The receiver does not discard a valid offline branch merely because its local copy identity is shared. Every named edition time must precede the actual receive command observation. The result binds issueId, workingCopyId, editionIds, editionSha256s, draftSha256, fileSha256 and a returned_file descriptor. Receiving does not create finding decisions.

### Complete comparison and adoption

compare(state, return_id, edition_id, read_blob) returns:

    {
      readOnly:false,
      comparison:{
        schema, workspaceId, stateSha256,
        issueId, returnId, returnSha256, editionId, editionSha256,
        reconciliationId, reportSha256,
        rows:[{
          findingId, finding, baselineDecision, currentDecision,
          returned, returnedDecision, status, canApply
        }],
        reviewSha256
      }
    }

Status is SAME, RETURNED_CHANGED, CURRENT_CHANGED or CONFLICT. It compares full disposition/reason/evidence values. Original attributed decision wrappers are retained separately even when their substantive values are equal. returnedDecision is null for a saved undecided item.

The supervisor authors the complete explicit choices:

    kind: "review.adopt"
    body:{
      id, returnId, editionId, reviewSha256,
      choices:[
        {findingId, action:"KEEP", resolution:"CURRENT"},
        {findingId, action:"APPLY", resolution:"RETURNED"}
      ]
    }

Exactly one choice per assigned finding is required. There is no automatic choice based on a status. KEEP/CURRENT preserves the actual current decision. APPLY/RETURNED requires a complete named decision and executes the existing native finding.decide with deterministic child request/decision UUIDs derived from the original adoption request and finding ID. Repeating the outer request returns its first result without producing more children.

The entire adoption is one original Workspace transaction. Any invalid finding, missing evidence, nonwaivable BLOCKING exception, changed comparison, history/state capacity error or final validation failure rolls back all native decision children and the review event together. The result records each original child decision ID/hash and the exact reviewer edition, comparison and original state basis.

The reviewer proposes; the adopting operator authorizes the native local finding decision. Both attributions remain inspectable. Neither attribution performs a tenant write or changes any mapping approval/rehearsal/cutover result.

## Historical replay and backward compatibility

new_state is unchanged. Existing archives with no reviewer work keep their exact original schema, genesis and state hashes. The optional reviewExchanges collection is initialized only by the first actual review command.

The original domain event sequence now includes that optional collection. An atomic adoption has original finding.decide child events followed by its review.adopt event. During complete replay, only deterministic children belonging to that exact adoption request are deferred; the parent invokes the original native children again, then the full reconstructed state and all original events must match. Missing, reordered, altered or fabricated child results cannot be accepted by a matching high-level count.

compare(..., adoption_id=original_adoption_id) returns readOnly:true, the comparison rebuilt from the exact original pre-adoption history, the complete original adoption and a separate current state/decision projection. Later accepted edits never rewrite the old comparison. The original archive exporter/importer already includes every state, command/result, publication and blob; the new domain validation runs inside that same complete receiving path.

## Documents and readable views

view(state,read_blob) returns {schema,records,limits}; records are complete native review event wrappers. view(state,read_blob,id) returns the exact record and original download descriptors. Issue details include the full issued metadata with files.Base64 removed; return details include every edition/draft and file descriptor, with the original issued Base64 omitted. Complete original JSON/HTML files remain the download authority.

document(state,id,role,read_blob) returns {descriptor,bytes}; roles are issued_json, issued_html and returned_file as applicable. These are exact original files, not a newly rendered replacement. Source/evidence file SHA values remain available through the original blob download route.

## Capacity and original file rules

The original application admits 64 MiB per blob, 256 MiB distinct blobs, an 8 MiB current state, 72 MiB complete logical history and a 384 MiB full archive. Review JSON and standalone HTML each have a separate complete 64 MiB limit. All encoded issue/source/evidence bytes and HTML overhead count. If the full HTML cannot fit while complete JSON does, retain the JSON and display the precise HTML capacity result; do not omit attachments.

An issue selects up to 1,000 actual findings. A returned copy retains up to 1,000 complete named editions. Each named decision references up to 64 unique evidence hashes with complete bytes. Unfinished arbitrary editor controls can occupy up to 4 MiB, in addition to their typed draft items. These are explicit local software limits, not the customer's record or controlled-document population.

Outgoing file descriptors use a plain basename of up to 240 characters without separators/control characters, mediaType up to 160 without CR/LF, exact bytes and lowercase SHA256. Named reviewer IDs are up to 128 characters and names up to 160; named edition names up to 240. Reasons and notes retain up to 8,000 characters. Draft time is bounded unfinished text up to 160 characters; named/received business times must satisfy the original offset date/time and chronology requirements.

## Same original receiving operation

Continue the original Property Continuity operation and existing Programme journal. Use its actual current workspace, original source/independent target returns and retained findings. A clearly labeled original TRAINING programme may exercise the same real application with its existing pre-authored training inputs; its outcomes remain training, not partner data.

Use the original shared receiving and browser owner. Select actual findings; issue and inspect the whole reviewer HTML; retain unfinished work; name two explicitly authored editions with complete original attachments; make a deliberate current-versus-returned conflict through the original finding.decide command; compare and adopt explicit choices; repeat the original adoption request; export and independently cold-receive the complete workspace; inspect historical review and every original file; retain a later received edit and exercise repeat receiving plus its following full export. No new workspace engine, external source acquisition, controller, silent success or fabricated customer decision is introduced.

Source review and syntax checks do not establish native execution or rendered product readiness. The producing owner must operate the exact application and files and inspect their actual rendering. Retain the original operation/result identities and state clearly which stages actually completed.


<!-- bryce-rendered-product-inspection:begin -->
## Standing lab rule: inspect the rendered product before presenting it

Bryce's direct owner instruction, October 13, 2026. This applies to every current and future lab peer, provider, model, harness, local session, cloud session, and delegated or child worker.

Before calling a client/prospect-facing app, site, dashboard, demo, report, presentation, or export ready, or putting it before a client/prospect, the responsible producing peer MUST open/run/render the exact outgoing version and visually LOOK at the actual result. Inspect at the actual screenshare/presentation width and at narrow/mobile widths where relevant. Operate critical controls; inspect applicable loaded, empty, loading, and error states; exercise downloads/exports and reopen the delivered files. Capture real screenshots or rendered page images and actually VIEW them. Capturing without viewing does not satisfy this rule.

This includes ALL attachments. Literally observe the actual thing the way a user or recipient would see and use it: open and view downloaded HTML, every relevant PDF/report page, slides, spreadsheets, maps, images, video/audio, archives and project attachments in their normal recipient-facing viewer or application; play audiovisual media and inspect the usable contents of archives/projects. Metadata, schemas, source text, and a browser link do not substitute for opening the attachment and using the delivered result normally.

Fix ugly, cramped, broken, unstyled, clipped, overflowing, or unreadable results within the authorized task before presenting them. Favor simple industrial/plain presentation, consistent spacing and typography, readable tables, and working controls. Do not add decorative template slop. Source review, unit tests, HTTP 200, DOM counts, a reviewer/model approval, or an evidence form do not substitute for looking at and operating the real outgoing product.

This is focused internal product validation, never permission to build or submit a proof, test, or verification product, run broad suites, or repeatedly recheck an unchanged accepted version. Building and integrating the actual deliverable remains the main work; do not substitute endless reviews for delivery. Retain an exact-version visual receipt in the handoff: source/head or artifact hash, URL/file, viewport sizes, screenshots actually viewed, controls/states/export files exercised, fixes, and any precise unresolved gap. A changed outgoing version needs inspection of the affected result.

Bryce explicitly clarified: "that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it". A checklist, screenshot folder, receipt, passing test, or parallel review bureaucracy is not the requirement or a substitute for actual observation and normal use. Perform focused fixes and keep shipping the main work; create no review or approval gate.

Bryce also instructed: "also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them". For video/media narration, use available high-quality generative voice/TTS and applicable generative visual/media capabilities when helpful, with natural professional delivery instead of robotic default voices. Actually play/listen/watch the final exported attachment and inspect clarity, pronunciation, pacing, timing, and audio alignment. Reviewing a text script does not substitute for experiencing the final video/audio. This adds no paid-service purchase or real-person voice-cloning authorization; preserve lab attribution and third-party copyright/license controls.

Pass this rule to child/delegated workers and persist it in owner-controlled provider/project/cloud instruction copies. Record delivery and readback coverage; never claim every running session loaded it without evidence. This rule creates no hooks, watchers, restarts, approval queue, credential restrictions, or new publication authority. Preserve all existing owner rules, including no llama.cpp, no private GitHub repositories or Actions, focused validation, attribution, incident communication, personal meeting approval, contact holds, demo pauses, bounty restrictions, and owner cutoffs.

Canonical local policy: `C:/Users/lucys/.commons/rendered-product-inspection-policy.md` and `.json`. Portable repository copy: `docs/policies/rendered-product-inspection-policy.md` and `.json` when present. Only Bryce can change this standing rule.
<!-- bryce-rendered-product-inspection:end -->
