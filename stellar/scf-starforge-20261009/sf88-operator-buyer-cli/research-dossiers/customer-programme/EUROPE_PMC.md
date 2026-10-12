# Customer-selected Europe PMC receiving

This module runs the Europe PMC phase of a customer Research programme through the maintained Research workspace. It consumes the customer's selected original source packets or exact existing READY operations, applies only the supplied record decisions and dossier receiving requests, exports the complete selected library, and verifies that library through a separate receiving workspace.

The caller owns the two original Research clients and their listeners. The module does not initialize a workspace, create a dossier or question, start a provider acquisition, choose a review decision, or close either client. Keep those lifetimes with the complete customer programme.

## Source and callable entrypoints

The module is `research-dossiers/customer-programme/europe-pmc.mjs` beneath the installed `sf88-operator-buyer-cli` source. It imports the original Europe PMC source validators and builder, workspace portable validator, Research host-file reader, private lock, and native retained-file helpers from the same selected checkout. Use the complete selected Research source cohort, including its license and runtime assets; this file alone is not an executable engine distribution.

The public interface is:

```js
import {
  inspectCustomerEuropePmcLibrary,
  validateCustomerEuropePmcSelection,
  runCustomerEuropePmc
} from './europe-pmc.mjs';

const result = await runCustomerEuropePmc({
  client,
  receivingClient,
  selection,
  dossierId,
  questionIds,
  expectedRevision,
  directory,
  adapters: {}
});
```

| Argument | Meaning |
| --- | --- |
| `client` | The already connected original `ResearchWorkspaceClient` holding the selected dossier and Europe PMC library. |
| `receivingClient` | A connected original client in a different Research workspace. Its selected Europe PMC library must initially be empty. The caller retains and closes it. |
| `selection` | The complete immutable Europe PMC selection described below. |
| `dossierId` | The actual existing native dossier ID, including an ID created and reconciled by the parent programme. |
| `questionIds` | An object mapping customer aliases to the actual existing native question IDs. Aliases are used only in the operation selection; the original engine receives actual IDs. |
| `expectedRevision` | The dossier's exact revision at the start of this phase. Reentry uses this same original number, even after this phase has received editions. |
| `directory` | An absolute private directory dedicated to this one selected phase. Retain the whole directory for recovery. |
| `adapters` | Optional callbacks explicitly named by `selection.adapters`. They can inspect or replay the completed original requests and retain their outputs. |

The function returns `finalRevision`, complete native source/query/plan/edition/review/receiving/backup identities, and `files` descriptors. Each descriptor has a relative `file`, an absolute `path`, `bytes`, `sha256`, and `kind`. The parent can verify and include those exact files in its final customer archive. Keep private selection, journal, temporary download and value-index files in the original operation directory; the returned inventory identifies the delivered artifacts.

`validateCustomerEuropePmcSelection(selection)` validates and clones the wrapper selection without opening a client or changing a workspace. The native engine still validates every original request and original source document when the phase operates.

## Select the complete library deliberately

Europe PMC's original workspace export contains the whole selected Europe PMC library: its queries, original event history, operations, source pages, review history and native receiving receipts. It is not a query-filtered export.

For a newly dedicated customer workspace, use:

```json
{
  "name": "original",
  "scope": "dedicated-empty"
}
```

The module verifies revision zero, no saved queries, no operations and an empty library history before any selected query or plan is created. Optional `id`, `revision: 0`, and `inventorySha256` provide additional exact pins.

For an existing library, first read its complete inventory through the original client:

```js
const observed = await inspectCustomerEuropePmcLibrary({client});
const library = {
  ...observed.library,
  scope: 'complete-library'
};
// Retain and review observed.inventory with the complete customer selection.
```

This returns the actual Research workspace ID, library name and ID, library revision, complete paginated operation inventory and a canonical inventory SHA256. Use the returned library name, ID, revision and digest unchanged. A `complete-library` selection requires all those pins. The reviewed scope includes every original query and operation in that library, including earlier work; select a dedicated library if those contents do not belong in this customer delivery.

The module retains the full initial inventory and reads each inventory twice around the original library history. It refuses a running operation or a changing inventory. At export, it verifies the original history prefix, every unselected operation, all selected original plans and receipts, and only this phase's exact new request effects. A concurrent unrelated query, review, plan or receipt causes a reconciliation error rather than silently joining the customer archive.

## Complete selection shape

The following JavaScript constructs a complete single-edition selection. `originalPacket`, `selectedRecordKey`, `customerQuery` and `reviewerDecision` stand for previously reviewed customer inputs; they are not generated source evidence.

```js
const selection = {
  schema: 'sf88.research-customer-europe-pmc.v1',
  operationId: 'visible-epmc-selected-phase-01',
  library: {name: 'original', scope: 'dedicated-empty'},
  queries: [{
    key: 'clinical-scope',
    request: {
      requestId: 'visible-epmc-query-01',
      actor: customerReviewer,
      expectedRevision: 0,
      title: customerQuery.title,
      selection: {
        query: customerQuery.query,
        pageSize: customerQuery.pageSize,
        maxPages: customerQuery.maxPages,
        synonym: customerQuery.synonym
      },
      sourceTerms: customerQuery.sourceTerms
    }
  }],
  operations: [{
    key: 'selected-edition',
    query: 'clinical-scope',
    prepare: {
      requestId: 'visible-epmc-plan-01',
      actor: customerReviewer,
      label: customerQuery.editionLabel
    },
    import: {
      file: originalPacket.file,
      bytes: originalPacket.bytes,
      sha256: originalPacket.sha256
    },
    reviews: [{
      requestId: 'visible-epmc-record-review-01',
      actor: customerReviewer,
      recordKey: selectedRecordKey,
      expectedRevision: 0,
      decision: reviewerDecision.decision,
      note: reviewerDecision.note
    }],
    receives: [{
      requestId: 'visible-epmc-receive-01',
      actor: customerReviewer,
      question: 'effectiveness',
      label: customerQuery.receivingLabel
    }]
  }],
  comparisons: [],
  workspaceExport: {
    requestId: 'visible-epmc-workspace-export-01',
    actor: customerReviewer
  },
  restore: {
    requestId: 'visible-epmc-cold-restore-01',
    actor: customerReviewer,
    library: {name: 'original', scope: 'dedicated-empty'}
  }
};

validateCustomerEuropePmcSelection(selection);
```

Omit `sourceTerms` if the original engine's maintained default is selected; otherwise preserve the exact reviewed text. Empty `reviews` or `receives` arrays are allowed. The module does not infer decisions or receiving questions for omitted work.

Top-level fields are exactly `schema`, `operationId`, `library`, `queries`, `operations`, `comparisons`, `workspaceExport`, `restore`, and optional `adapters`. Unknown wrapper fields are rejected, so accidental spelling changes cannot silently discard a customer choice.

Customer aliases use letters, numbers, underscores or hyphens and start with a letter or number; their maximum length is 80. Native request IDs retain the original engine's format, with 8–160 letters, numbers, dots, underscores, colons or hyphens. Each query save, operation preparation, review, dossier receive, library export and cold restore uses a distinct selected request ID.

The customer-facing titles, labels, notes and query text remain the selected prose. Internal operation identifiers are not inserted into them.

## Queries and existing query versions

A query row contains `key` and exactly one of `request` or `existing`.

A new query request supplies the original native `requestId`, `actor`, `expectedRevision: 0`, `title`, `selection`, and optional `sourceTerms`. To save a reviewed new version of an existing query, also supply its actual `id` and its current `expectedRevision`. The module forwards that exact request to `saveQuery` and verifies the returned ID, version, actor, selected search and retained version digest. It does not create a replacement query to evade a revision conflict.

To use an already saved query version without a query mutation:

```js
{
  key: 'clinical-scope',
  existing: {
    id: selectedQuery.id,
    revision: selectedVersion.revision,
    sha256: selectedVersion.sha256
  }
}
```

The selected version may be older than the current query head. It must still be present and have the exact original version SHA256. Each operation is bound to that complete native version, including original query text, pagination limits, synonym choice, source terms, actor and creation time.

The original source validator enforces query and pagination limits. A declared page limit is not a claim that all possible results were captured. The retained edition and exports carry the original engine's actual coverage.

## Original source packets and provenance

Each prepared or continued operation requires an absolute, byte-pinned import file:

```json
{"file":"/private/customer/input.json","bytes":12345,"sha256":"<actual 64-character SHA256>"}
```

The example length and digest placeholder must be replaced by the exact retained file identity. Every selected input is read, validated and retained before this phase creates any query or plan.

The file uses the original schema `stellar-forge.europe-pmc-import.v1` and exactly one of `documents` or `pages`:

- `documents` contains complete original Europe PMC source-document descriptors with `bodyBase64`, original URL, byte length/digest, document ID, observation and provenance. The unchanged `validateDocument` validates every descriptor and original body. An HTTP observation remains an HTTP observation only when the retained source actually contains it.
- `pages` contains `url`, exact canonical `bodyBase64`, `retainedAt` and optional `provenance` for each saved public response document. The unchanged `sourceDocument` constructs a retained-document descriptor with unknown HTTP status, headers and retrieval time. This path does not reconstruct an HTTP200 response from a saved JSON body.

Optional `stopReason` is the original `page-limit`, `byte-limit`, `operator-stop`, or null. It is passed through the original import contract. The module never adds a terminal page or invents a missing cursor.

The complete packet limit is the original client limit of 48 MiB. Original source-page and edition limits remain enforced by the original source engine. On reentry, the module can consume its already retained exact packet if the original external pathname is no longer available.

A prepared plan's actual native clock, query version, label and continuation state are used with the original `buildEdition` to verify the received edition. The module does not replace that engine with an independent normalization model.

## Three operation forms

Each operation supplies `key`, a selected query alias, explicit `reviews` and `receives`, and exactly one preparation form.

### Prepare from retained source

Use `prepare: {requestId, actor, label}` and `import`. The module supplies the selected native query ID/revision and `mode: 'documents'` to the original plan API, then imports the exact packet. It never calls `start`.

### Continue an original page-limited part

A continuation uses an earlier operation alias as `parent`:

```js
{
  key: 'next-part',
  query: 'clinical-scope',
  parent: 'selected-edition',
  continuation: {
    requestId: 'visible-epmc-next-plan-01',
    actor: customerReviewer,
    label: customerQuery.nextPartLabel
  },
  import: nextOriginalPacket,
  reviews: [],
  receives: []
}
```

The parent must precede the child in the operation list and use the exact same selected query version. The module invokes original `continueSearch` with the parent's actual plan and edition digests. The engine chooses the retained next cursor and binds the parent. If the parent retained a boundary page, that original document is reused exactly as the original import implementation requires. A terminal parent or changed source produces the engine's original rejection.

This form creates a genuine linked part. A comparison across independently changed query text or synonym scope should use separately prepared operations and an explicit scope-change comparison instead.

### Use an exact existing READY operation

```js
{
  key: 'selected-edition',
  query: 'clinical-scope',
  existing: {
    operationId: originalOperation.operationId,
    planSha256: originalOperation.planSha256,
    editionSha256: originalOperation.editionSha256,
    editionBytes: originalOperation.editionBytes
  },
  reviews: [],
  receives: []
}
```

No import file is accepted in this form. The module verifies READY state and the selected original plan/query/edition identities, then operates the requested reviews and receiving against that same edition.

An optional `expect` object can additionally pin any of `planSha256`, `editionSha256`, `editionBytes`, `records`, `pages`, and the complete `coverage` object. Every supplied expectation must equal the native result.

## Record decisions and dossier receiving

Review rows contain exactly the original request ID, actor, record key, expected record-review revision, decision and note. Decisions are `include`, `exclude`, `uncertain` or `follow-up`. Record keys must occur in the selected edition. The module adds that operation's actual ID and edition digest to the original request, retains the complete body, and calls the native review API.

The module verifies the response and the review's presence in the complete record-history view. It paginates all records, preserves all original rows and their retained reviews, and exports the complete review projection. It does not collapse an excluded record out of the source edition.

Receiving rows name a key from `questionIds`. The actual native question ID, selected dossier ID, current phase revision, plan digest and edition digest form the original receiving request. Receives execute in operation order and then row order, advancing the returned revision one original save at a time. Later dossier phases use the returned `finalRevision`.

The module checks each original receipt against the full request fingerprint, source length/SHA, original and resulting revisions, question and native edition ID. It then reads the actual historical dossier metadata at that receipt revision to confirm the source edition is present. A lost reply is recovered with the same original request; a new request ID is not a recovery technique.

Reentry restarts the logical revision cursor at the original `expectedRevision` and recovers those saved receipts in order. It must not substitute today's dossier head for the original phase base. Unrelated later edits are preserved and reported as a revision conflict where they prevent completing the selected phase.

## Comparisons and complete exports

A comparison names two operation aliases, a customer label and either `same-query` or `scope-change`. The choice must match the original comparison engine's `queryScopeChanged` result. That original field compares the query text and synonym setting; changes only to page size or maximum pages remain the same search scope.

The module reads every comparison page and compares the complete result with original `compareEditions`. Each retained comparison includes both native source identities and the explicit customer scope label. Partial source coverage remains visible in the native comparison.

For each selected operation, the delivered inventory includes:

- The complete original edition JSON, original plan, record list and current review histories.
- Every original source-page body and descriptor, plus a retained boundary body/descriptor when present.
- Full RIS, CSV and review JSON exports, checked against the original engine's export bytes.
- Original saved requests, native receipts and linked-part history.
- The selected complete comparison results.

The complete library gzip export is retained as `Europe_PMC_Workspace.json.gz`. It is the original compressed JSON portable, not a ZIP. The module verifies its native receipt, complete library/event inventory, every operation plan/state and retained receipt before using it for cold receiving.

## Cold receiving proof

The caller provides a different Research workspace, with an explicitly selected empty Europe PMC library. The phase retains that target workspace and initial library inventory before the original restore request.

The original `restoreFile` receives the exact gzip archive under a stable request ID. The controller publishes its original selected received library. On reentry, the module accepts only the retained initial library or that same received-library identity. A different selected target is reported rather than overwritten.

After restore the module verifies the full query versions, library history, operations and receipts. It reads all selected records and their review histories through the cold API. It then downloads every selected edition, every source page and boundary, RIS, CSV and review export again and checks the complete bytes. Cold readback files can be discarded after their exact verification certificates are durably retained; the first original delivery copies remain in the inventory. Every selected comparison is reread and matched.

The source library inventory and source dossier revision are checked again after the cold proof. Restoring the independent receiver does not switch or edit the source workspace's library.

## Optional browser and Merchant callbacks

A caller may include `adapters: ['browser', 'merchant']` in the selection and provide those exact callbacks. Omit both when those receiving interfaces are not part of the selected operation. An unselected supplied callback or a selected missing callback is rejected.

Each callback receives the actual selected operation/query/edition identities, the already saved review/receive requests, a directory, a read facade, an exact-request replay facade and `retain(file, bytes, kind)`.

The read facade supplies original list/status/history, selected query and operation inspection, records, source descriptors, linked chains and comparisons. Record and comparison APIs remain paginated. The replay facade accepts only an original already-saved request ID from this phase; it cannot compose a new decision. A receive replay must return the original duplicate receipt and match the actual historical dossier.

A callback can close over a caller-owned browser connection or original Merchant attachment. It should inspect these actual identities, perform only the selected original replay, retain every complete output through `retain`, and drain its own browser/attachment lifetime in `finally`. Do not return bearer tokens, connection files or unretained temporary paths. The module retains the callback's complete result and does not invoke it again after that result is durably saved.

The EPMC module does not include a second browser decision workflow or a separate Merchant implementation. Use the existing product interfaces with the supplied selected identities. The parent programme remains responsible for supplying and reviewing a concrete callback when it selects one.

## Interruption and reentry

Retain the entire original phase directory and reuse the same source and receiving workspaces. The selection, workspace IDs, dossier/question mapping, original base revision and absolute operation directory are immutable. A lock protects that one directory.

Before each mutation the module saves the complete native request. A result is retained before its public receipt is published. If the response is lost before a durable result, reentry calls the same original native request and relies on the original engine's request recovery. A changed input is rejected instead of being assigned a new request ID.

File publication uses the original private native writer. Existing exact artifacts are reused. Conflicting files, changed source packets, changed requests, missing retained artifacts or a different target are preserved and reported. Original download candidates are checked before retrying a download, including the original writer's interrupted publication-link case. A received complete candidate without a durable response is labeled as recovered bytes; the module does not manufacture missing response metadata.

The final `COMPLETE.json` contains all native identities. The durable completion record and every returned artifact are verified on a later reentry. The phase returns that same completion instead of applying another save.

A retry after a disk or transport interruption uses the original directory and exact inputs. Resource recovery belongs to the original caller. Deleting the journal, changing request IDs, recreating a different receiving workspace or replacing the original dossier revision would create a different operation and is not a continuation.

## Source review and native completion

This module composes the maintained source engine and its native APIs. Its source has a V8 syntax check, independent exact Git readback, and a separate review of the complete library and cold restore against the original workspace implementation. Each executed programme retains its actual native completion, selected inputs, complete outputs and source identity together in the customer handover.
