# Customer collection plan interfaces

Use the existing Request Collections workspace's **Request plans** panel for the
complete customer workflow. The maintained [authoring guide](../collections/AUTHORING.md)
covers catalog selection, saved revisions, named periods, original collection
creation, portable source sharing, independent buyer adoption and receiving.

## Local model

`openCollectionComposer({collections})` accepts the existing original controller
returned by `openCollections`. It exposes:

| Method | Input | Result |
| --- | --- | --- |
| `savePlan` | `{plan}` | Complete immutable revision and original normalized plan |
| `inspectPlan` | `id, planSha256` | That exact saved revision |
| `listPlans` | none | All immutable revision summaries, newest first |
| `inspectCatalog` | `{path}` | Actual native rows and indexed accepted terms |
| `prepareEdition` | `{planId,planSha256,collectionId,name,values}` | Retained period and original collection preview |
| `inspectEdition` | `collectionId` | Current source/operator readiness and original collection |
| `listEditions` | none | Saved periods with their immutable plan references |
| `createEdition` | `{collectionId,expectedEditionSha256,expectedPreviewSha256}` | Same period joined to the original collection |
| `inspectRecoverySources` | none | Retained request configs and original operator config paths |
| `close` | none | Close this authoring facade |

The authoring facade does not own the supplied collection controller. Its
`close()` must be followed by the original controller's `close()` when that
caller owns both.

The plan schema is `stellar-forge.sf88.collection-plan.v1`. Pure validation and
resolution are exported by `plan.mjs`: `validateCollectionPlan(plan)` and
`resolveCollectionEdition(plan, input)`. Parameters are substituted only into
selected file paths and URL query values. Query substitutions are percent
encoded; file substitutions are single path segments. Saved operator bindings,
accepted-option indices, HTTP method and original request-body bytes stay
explicit. Decimal payment amounts come from the original selected catalog row.

An edition uses stable intents `collectionId:requestKey`. The collection ID
may be at most 80 characters and a request key at most 40. Changing a period's
plan, name or resolved parameter values requires a separately named edition.
A repeated request with the same identity resumes its original retained inputs.

## Retention and original recovery

Plan revisions are immutable JSON under the original collection directory's
`authoring/plans`. A saved-only plan refers to inputs needed when its first
period is prepared. It does not import those inputs or provision an operator.

A completed request capture retains the exact original saved catalog, source
operator configuration, native workspace manifest when selected, request body,
operation ticket and native prepared configuration. Identical catalog bodies
share a file by SHA-256 within the period. Inputs and metadata use the original
private, create-only, fsynced initialization helpers. Completed captures can be
reopened after the external catalog/body/ticket authoring files are removed.

A partial request that has not completed capture still needs its original
inputs when preparation resumes. The complete period is marked prepared only
after every selected request has been captured and the original collection
preview has succeeded. No request is enqueued by preparation or creation.

All mutations hold the original collection root's shared recovery lease and
then the authoring directory's exclusive lease. Original collection creation
continues through the same controller under that ordering. An interrupted
original collection whose state is `PREPARING` resumes through that original
create operation and retains the same IDs.

`inspectRecoverySources()` exposes completed request captures, including
completed rows of a partially prepared period. The existing Collections
encrypted recovery uses those original configs to discover the actual operator
workspaces, private journals, policy and keys through its existing engine.
It also retains an external original operator configuration path needed for
the same binding after restore. The authoring subtree remains part of the
original root's complete native snapshot. The existing recovery requirements
for native operator configuration and state-root containment still apply.

## HTTP client

`createCollectionComposerClient({url, fetch?})` accepts the original running
Collections workspace's private URL. It uses the same bearer session,
original HTTP endpoints and host. Methods are `listPlans`, `inspectPlan`,
`savePlan`, `inspectCatalog`, `listEditions`, `inspectEdition`,
`prepareEdition` and `createEdition`. Each accepts an optional final
`{signal}` for caller cancellation. The full request/response types are in
`client.d.ts`.

The read and write methods return complete JSON. Open a created period's
`collection.id` in the original Collections screen for queueing, browser or
terminal approval, original attempt recovery and received-output export.

## Portable plans and independent buyer adoption

`composer.sharing` joins data transfer to the same authoring facade and recovery lease. It exports an exact prepared period's selected catalog and body objects, then lets a recipient bind existing local operators and save a new immutable plan.

| Method | Input | Result |
| --- | --- | --- |
| `exportPackage` | `collectionId`, `expectedEditionSha256`, optional per-request `headerSelections` | Complete portable file descriptor and manifest |
| `listPackages` | none | Original package summaries and receiving progress |
| `inspectPackage` | `{packageSha256}` | Full manifest, phase and per-object received bytes |
| `receiveManifest` | `{manifest}` | Existing/new receiving state for that exact package |
| `receiveChunk` | Package/object hashes, offset and Base64 bytes | Compact object receipt |
| `finishReceiving` | `{packageSha256}` | Complete object verification and ready status |
| `packageFile` | `{packageSha256}` | Create/reopen a full portable file for a ready package |
| `reviewAdoption` | Recipient plan name/ID, operator/request bindings and delivery selection | Complete source/local-operator review with `reviewSha256` |
| `adoptPlan` | Same selection plus `expectedReviewSha256` | `{saved, adoption}` through original plan retention |

Package objects are addressed by SHA-256 and retained under the original authoring tree. Shared manifests preserve the original plan and prepared-period references, original request keys, catalog/body objects and operator-group metadata. Local operator and source placeholders in the portable definition are replaced only by an explicit adoption selection.

Access-ticket metadata describes the recipient's required local input. Representation headers are retained; selected noncredential custom headers can be included explicitly. Other headers require a local value or explicit omission. Existing operator preparation, ticket checks, payment terms and spending-limit checks run when the recipient reviews its bindings.

A reviewed adoption records every retained source and the chosen local operator configuration. `adoptPlan` reads those inputs again and saves only the matching review. It returns the original `SavedPlan` shape, so the normal editor, `prepareEdition`, `createEdition` and original collection execution continue from that result.

### Streaming package contract

`package-format.mjs` is shared by Node and the existing browser. Its `parsePlanPackage(asyncIterableOfUint8Array)` yields:

```js
{ type: 'manifest', manifest }
{ type: 'object', sha256, offset, base64 }
{ type: 'complete', packageSha256 }
```

The complete file must have a final newline. The parser validates the manifest and portable plan identities, object order, exact offsets and complete byte counts. Exhaust its iterator before calling `finishReceiving`; a completion record followed by additional content is an invalid file.

Objects use 64 KiB raw chunks with a smaller final chunk when needed. The package maximum is 128 MiB of unique source objects and a 16 MiB manifest. `receiveManifest` and `inspectPackage` return each object's saved `receivedBytes`; a repeated receive can skip complete retained chunks. Each accepted chunk returns only its own package/object identity and progress, avoiding repeated full-manifest responses. Completion verifies the entire original object hash.

The portable plan retains source URL parameters and begins with the selected edition's values. Adopted catalog/body references point at the retained package objects. The selected delivery parameter changes the output namespace. A business request that needs a new body or catalog uses actual new inputs and another original plan revision.

### Client and command-line continuation

The HTTP client's nested `sharing` methods match the local model. All methods accept the original optional `{signal}`. The additional `downloadPackage({packageSha256})` makes an authenticated GET and returns the fetch response; stream `response.body` as needed. First use `exportPackage` or `packageFile` to prepare the complete file. The client uses a fixed same-origin route with the original private session.

The CLI adds `share-export`, `share-receive`, `share-list`, `share-show`, `share-file`, `adopt-review` and `adopt`. It uses the shared parser and the same local model, including resumable object receipt and guarded adoption. The [complete authoring guide](../collections/AUTHORING.md) provides the browser and command-line sequence, exact binding examples, API paths and receiving corrections.

## CLI

Run `starforge buyer-collection-plans --help` in a distribution that includes
the `buyer-collection-composer` contribution, or run the source directly:

```sh
node stellar/scf-starforge-20261009/sf88-operator-buyer-cli/collection-composer/cli.mjs --help
```

Commands are `list`, `show`, `save`, `catalog`, `editions`, `edition`,
`prepare` and `create`. The full authoring guide supplies the operating
sequence and flags. Local commands reopen an existing collection store;
the original Collections command remains responsible for its setup and run.

The composer uses the native Linux `flock` command already required by the
original Collections controller.

## Saved customer-use commissioning

[Customer-use commissioning](CUSTOMER_USE.md) joins exact Grant Installation calendars to these original saved plans and periods. Its complete browser, CLI and typed client retain immutable commissioning revisions, reuse original buyer requests and return verified native evidence through the existing Grant receiving workflow. The same encrypted Collections handover retains the complete authoring history.
