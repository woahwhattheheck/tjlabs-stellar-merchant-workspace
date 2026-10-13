# Central form release review

The **Form releases** desk connects retained Central form generations, current drafts, saved reporting commitments, and staff release decisions in the existing ODK workspace. Open it from the managed application's **Form releases** button. The desk shares that application's private listener, original Store, capture history, source files, and portable archive.

## Complete staff workflow

1. In **Retain published version**, choose the existing capture, original form, and published generation. An empty version is displayed as an original blank version and kept as an empty string.
2. Select the retained published edition as the baseline. Use **Retain current Central draft** to receive the current candidate from that form's existing Central connection. A composed authoring workspace can also supply a saved compiled candidate.
3. Open **Compare retained sources**, select the candidate, and name the review. The baseline must be a retained published source. The source cards show the exact project, form, version, origin, and retained content identity.
4. Expand **Original source details** to open the complete XForm, native fields JSON, original media, and retained authoring model when present. Downloads are issued by the existing authenticated listener.
5. Review **Reporting mappings**. Bind each actual saved table/field selector to its exact original XForm path. Map repeat tables to their original repeat paths, including tables used only for row counts. Native row and parent keys remain identified as generated keys. The native root `Submissions` table needs no repeat binding.
6. Read the categorized changes and their **Affected outputs**. Search by field, change, or output, and expand the complete before/after values when needed. Coverage identifies the original model facets available in each retained source.
7. Record the reviewer, each selected disposition and note, and the overall review note. **Save review** retains the work. **Request revision** retains the original comparison and the staff's request. Saving reporting mappings recomputes the comparison against current saved reports while preserving the prior assessment, dispositions, and approval in history.
8. Once all review items have dispositions, every incompatible change is resolved in a new candidate, and saved report definitions are current, approve the exact review. **Download publication plan** returns the frozen source selection, reporting interpretation, staff decisions, and native destination preconditions for the existing publication operation.

Review drafts remain in this browser's session storage. Saved sources, decisions, plans, and receiving records belong to the original workspace. A revision conflict reopens the current saved record while preserving the unsaved local draft for review.

## Original source receiving

### Published captures

`retainCapture({id,captureId,formKey,version})` selects the exact original XForm and native fields receipts already retained by the existing capture. It brings that form's other retained published generations into the historical type comparison and lists generations whose original schema is still absent.

The source retains the original capture's tabular catalog, table identities, row keys, repeat-parent relation, and media coverage. Historical captures continue to carry their original values after a later form changes.

### Current Central draft

`retainDraft({id,baselineId})` uses the baseline's saved Central connection and its existing Authorization environment reference. The receiver reads:

- Draft metadata and the complete attachment inventory.
- The complete draft XML and its native `/fields` response.
- Every available named attachment, sequentially, through the original attachment route.
- The native fields, attachment inventory, and draft metadata again before retaining the source record.

The XML bytes must match Central's draft MD5 identity. For uploaded binary attachments, available original size and MD5 values are compared with the received bytes. Each binary body streams into the Store's atomic content retention path. Linked datasets retain their original mode and the actual downloaded CSV bytes. Every named slot remains represented, including an unfilled or missing attachment.

The final draft definition, native fields, and inventory must agree with their initial originals. A concurrent definition or inventory change returns `FORM_REVIEW_DRAFT_CHANGED`; repeating the same source request receives the current originals. A form without a draft returns `FORM_REVIEW_DRAFT_ABSENT`. Each accepted source stores the original before/after receipts and complete file identities.

The response keeps native authoring coverage explicit: a Central field schema provides field paths, native types, and binary flags. Full labels, logic, choices, repeat rules, and translations enter the comparison when the original authoring model is supplied. Staff can open both complete XForms to review the collection semantics absent from a native-only field response.

### Request recovery

Use one source ID for one selected source operation. An accepted ID reopens the same retained source without another provider request. Concurrent calls for the same current-draft ID and baseline share the active receiving promise. Reusing that ID with another selection is rejected.

The browser keeps each pending request's ID and original arguments. After an interrupted response it refreshes the workspace and resumes that request. A source receiving attempt that failed before accepting a source can receive again under that same request. Existing content-addressed file bodies are reused. Closing the workspace waits for active receiving operations before the original writer closes.

## Field and reporting semantics

Native XForm paths and OData table/field selectors are different identities. The comparator joins only explicit bindings and original retained mappings. A basename match or a slash substitution is insufficient to identify the original field.

The inventory is built from current commissioning output/indicator definitions and saved warehouse approvals for the same connection, project, and form. Definitions retain their full original hashes. Every dependency includes its actual table independently of selected fields, so repeat row-count outputs and native-key-only projections participate in impact review.

A saved review retains its assessed dependency generation. Opening the review also presents the current reporting inventory. If a report changes, its current selectors become actionable and obsolete mappings are listed. Saving the complete current mapping arrays recomputes the comparison. Omitting a field or table from those arrays clears that explicit binding.

The native compatibility comparison preserves:

- Original absolute paths, version strings, native field types, and binary flags.
- Published history for a path that was removed and later reintroduced.
- Central's scalar-to-string conversion rule. A structure or repeat cannot become text under that exception; other incompatible native type changes remain revision items.
- Field and repeat removal effects on explicit descendant fields, repeat tables, and saved outputs.
- Actual authoring fields, choices, labels, logic, translations, settings, and media when present in the retained model.

Central's published OData schema drives subsequent exports. A removed selected field or repeat table can affect the next capture or downstream projection; earlier retained workspace captures keep their original schema and values. The original provider sources are linked below.

A staff disposition of **Revise the candidate** remains unresolved even on an otherwise compatible or informational change. An approval is bound to the exact assessment and dependency hashes. Remapping or later changes to report definitions require a current review before the existing native publisher uses that approval.

## Programmatic composition

The managed Central application mounts the desk at `/form-releases/` alongside commissioning and warehouse. Its startup result exposes `formReleasesUrl`, and its owner exposes `formReleases`.

Trusted hosts that already own a Store can compose the same module:

```js
import {composeCentralFormReleaseReview} from './release-review/index.mjs';

const composed = composeCentralFormReleaseReview({
  workspace,
  store,
  fetchImpl,
  authoring: existingAuthoringResolver,
});
// Add composed.extension to the existing Central listener's extensions.
// composed.review uses the same Store and workspace lifecycle.
```

For a dedicated opening, `openCentralFormReleaseReview({directory,fetchImpl,extend,authoring})` returns the original workspace, review API, listener extensions, and close method. `openCentralWarehouse` also accepts a trusted `extend({workspace,store,commissioning,warehouse})` callback and additional listener extensions, which is how the managed application composes the desk.

The optional authoring adapter has two methods:

```ts
resolveCandidate({id,expectedRevision}): Promise<FormSourceInput>
listCandidates?(): Promise<{id,revision,title?,version}[]>
```

The candidate must use `origin.kind: 'authoring'`, preserve the compiler's actual identity and revision, and reference complete XML/media bytes already in this same Store. `fields.values` contains the actual native-shaped field facts. An existing fields receipt is read and compared to those facts; otherwise the supplied original authoring field model is retained as its own clearly identified JSON source. The original model, when supplied, is retained separately.

Authoring models may supply `fields` keyed by original absolute `path`, with actual labels, logic, selection choices, and other original field properties; `repeats` keyed by original paths; and original `languages`, `defaultLanguage`, `settings`, `entities`, `datasets`, `submission`, and `encryption`. The comparator preserves complete values and distinguishes saved choice codes from visible labels.

## HTTP and SDK contract

All routes use the parent listener's existing bearer authentication.

| Operation | Route or method | Result |
| --- | --- | --- |
| Workspace inventory | `GET /api/form-releases/state` | Retained sources, captures, reviews, receiving outcomes and capabilities |
| Full saved review | `GET /api/form-releases/reviews/:id` | Assessment, current reporting inventory, decisions and readiness |
| Complete retained source | `GET /api/form-releases/sources/:id` | Original XML/fields/model/media receipts and provenance |
| Source retention | `POST /api/form-releases/actions/retainCapture`, `retainDraft`, `retainAuthoring` | Accepted original source |
| Comparison | `POST /api/form-releases/actions/createReview` | Source-bound assessment |
| Reporting decision | `POST /api/form-releases/actions/mapReports` | Recomputed assessment and preserved history |
| Staff review | `POST /api/form-releases/actions/decide` | Saved dispositions or approved frozen plan identity |
| Frozen plan | `POST /api/form-releases/actions/publicationPlan` | Complete immutable plan under `result` |
| Original file | `POST /api/downloads {kind:'source',hash,name}` | Short-lived local download ticket |

Action responses are `{ok:true,result}`. Writes to an existing review use its exact `expectedRevision`. `mapReports` receives `bindings:[{table,field,path}]` and `tableBindings:[{table,path}]`, with reviewer and note. `decide` receives reviewer, note, `decisions:[{changeId,decision,note}]`, and `overall` equal to `review`, `approve`, or `revise`.

The original native publication owner uses SDK `validatePublicationPlan({planId,candidateContentHash,target})` to compare the current saved approval with the exact selected source and target. It then verifies the actual current published version and XML against the plan's destination preconditions as part of its existing Central operation. The plan retains the candidate version and full XML; a deliberate provider-side version override requires its actual final XML to be retained and reviewed.

After native publication, `receivePublication({id,planId,source})` retains the full original published source and compares target, version, XML, native fields, and attachment identities. Its result is `MATCHED` or `RECEIVED_DIFFERENT`, with the exact differences. This receiving result appears in the staff desk and travels with the original workspace archive.

The complete SDK declarations are in `index.d.mts` and `index.d.ts`; the parent ODK entry exports these interfaces and factories.

## Original native receiving case

Continue the existing native Central programme, original host, selected project
and retained receiving journal. The generic fixture module
`odk/native/released-fixtures.mjs` and the published removed-field example are
distinct source sequences. See the existing [native receiving guide](../native/RELEASED_FIXTURES.md)
and the [pinned provider structural-change case](https://github.com/getodk/central-backend/blob/de0d2a07fd7c9ff698cbc312e550dd40ff058340/test/integration/api/forms/versions.js)
for their original source and operating context.

The generic module publishes `simple` with blank and `updated` versions. Its
`updated` XML changes the version attribute only and retains the age field:
845 bytes, SHA-256
`5563cff48739e852e2b1e46d6765515a297e79a1df65a45a868da11e3c1e25a2`.
It also creates the original submission `two` as Bob with age 34 under the
blank version. Completing that programme does not establish a removed-age draft
or a version-`2` publication.

The separate published structural-change case uses the original `simple`
blank-version XML as baseline, then changes its version to `2` and removes
only the main-instance `<age/>` element. Its old age bind and input remain.
Receive the actual native fields for both definitions; a text search for the
remaining bind does not establish native field membership.

Original baseline XML: 827 bytes, SHA-256
`93fdcefabfe5b6ea49f207e0c6fc8ba72ceb34828bff9c7929ef56eafd2d84cc`.
Exact structural candidate: 833 bytes, SHA-256
`bc2cc021848d1cdf66107b118f0cbd407eb35c0f138324ec0b0628576da661f5`.
Preserve these literal provider originals and their attribution.

Before staging or publishing the candidate, the original source owner inspects
the actual current project/form, published version and XML, draft and existing
submission IDs. Reopen any already accepted source request under its original
ID. Do not rerun the generic fixture creator to manufacture the structural
case, rewrite its saved inputs, or reuse an existing submission ID for different
XML. In particular, the structural case's version-`2` Bob submission named
`two` differs from the generic programme's already-created `two`.

A historical blank generation remains a valid retained comparison source.
A publication plan based on it also requires blank to be the actual current
published version and requires that exact current XML hash. If the current form
is already `updated` or another version, preserve the historical comparison
and inspect the current native source. Any authorized following publication
needs a separately reviewed comparison against that actual current retained
baseline. Do not relabel `updated` as blank, synthesize a replacement pair or
bypass the frozen plan's destination preconditions.

For the exact blank-to-`2` provider sequence, reopen the programme's original
structural-case target when present. Otherwise, the same native owner selects
or retains a distinct actual target within the existing authorized programme,
recording its original request identity before any creation. Keep the literal
form ID `simple`: if that ID is already occupied by the generic cohort, select
a different actual project in which this source will not collide. Retain the
returned native project ID and all request/response originals. The existing
native API publishes the exact baseline, receives its original submission,
stages the exact candidate as a draft, and continues only after review. This
uses the same host and original operation journal; it adds no competing
controller, altered fixture XML or assumed customer source. An uncertain create
is reconciled through its original unique request and actual native objects
before any replay.

In the selected original Store, retain the actual age output and row-count
commitment from commissioning or the approved warehouse source. A generic
saved report alone is not a substitute for those dependency records. Receive
the current draft through the baseline's existing connection, explicitly bind
its actual age selector, and inspect the affected output and collection
coverage. Keep earlier captured age values and schemas unchanged. Complete the
current staff and colleague review; refresh changed reporting definitions before
approval.

Give the resulting frozen plan to the existing native publisher. It validates
the current approval and exact target, then verifies the actual published
version/XML before its original mutation. Receive the complete actual published
source afterward and retain any differences. The review desk neither publishes
XML nor supplies a replacement publisher. A draft-only course ends with the
reviewed draft/plan and explicitly has no publication result. Reopen the same
complete workspace and continue its actual next reporting period.

The source hashes above identify provider example inputs, not an observed
Central result. The native receiving operator retains its real source,
publication and rendered-operation outcomes in the original programme.

## Complete colleague review and returned feedback

**Colleague review** now exports the saved comparison and both source editions into a complete self-contained working HTML. It carries the original XML, fields, form media, applicable inventory/reporting originals and native review history. The colleague can retain unfinished work, save attributed editions, download/reopen complete HTML and return the complete JSON.

The installed desk receives that original file, displays changed current/colleague dispositions and applies explicit staff choices through the same revision-bound review transaction. Changed source comparisons or current report definitions remain visible before a following current package is prepared. Accepted same-request replay, full original downloads and receiving history stay with this workspace.

See [COLLEAGUE_REVIEW.md](./COLLEAGUE_REVIEW.md) for the complete staff course, native metadata custody, original-file receiving, SDK and existing installed/rendered continuation.

## Primary provider sources

- [Official form, version, draft, field and attachment API](https://docs.getodk.org/central-api-form-management/).
- [Official OData API](https://docs.getodk.org/central-api-odata-endpoints/).
- [Published-version structural change case](https://github.com/getodk/central-backend/blob/de0d2a07fd7c9ff698cbc312e550dd40ff058340/test/integration/api/forms/versions.js).
- [Native draft scalar, structure and repeat compatibility cases](https://github.com/getodk/central-backend/blob/de0d2a07fd7c9ff698cbc312e550dd40ff058340/test/integration/api/forms/draft.js).
- [Production native type predicate and published-schema history](https://github.com/getodk/central-backend/blob/de0d2a07fd7c9ff698cbc312e550dd40ff058340/lib/model/query/forms.js).
- [Published OData source selection](https://github.com/getodk/central-backend/blob/de0d2a07fd7c9ff698cbc312e550dd40ff058340/lib/resources/odata.js) and [original field/table exporter](https://github.com/getodk/central-backend/blob/de0d2a07fd7c9ff698cbc312e550dd40ff058340/lib/formats/odata.js).

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949
