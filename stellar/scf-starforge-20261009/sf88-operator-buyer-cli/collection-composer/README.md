# Customer collection plan interfaces

Use the existing Request Collections workspace's **Request plans** panel for the
complete customer workflow. The maintained [authoring guide](../collections/AUTHORING.md)
covers catalog selection, saved revisions, named periods, original collection
creation, later operations and receiving.

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
