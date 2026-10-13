# GovHub / Tome: complete native build and release receiving

This operating example joins the existing GovHub workspace to Drupal and the original Tome generator. It prepares two editorial editions in one dedicated Drupal site, captures both complete generated sites, reviews and publishes each edition, selects the retained predecessor, and independently reopens the complete operating handover.

The product uses the original GovHub account, source capture, worker, release controller and backup formats. The receiving package includes the generated sites, complete comparisons, reviews, native operation history and source identities. Everyday staff operation is documented in the application's `workspace/STATIC_RELEASES.md`.

## Exact source and prepared input

Build the complete selected GovHub application with workspace/build_application.py. Retain its actual full source commit, APPLICATION_SOURCE.json, PACKAGE.json and whole ZIP size/SHA-256. The package includes native_site.py, prepare_native_site.php and the full native/browser commissioning programmes; no private source acquisition is required for these application members.

Select the unchanged original Tome release archive tome-8.x-1.16.tar.gz, 100,337 bytes, SHA-256 a762990bf2c1fc9111db14fa537ab60db84499ce5130824dc217aae98dd63bfe. Retain its source notice and the actual installed runtime's dependency graph. The native release command uses this original generator implementation.

## Native runtime and directory selection

Use the shared original Drupal dependency collector and installer result. The installer must have completed and supplied its real `NATIVE_RUNTIME.json`, including the original and materialized Composer lock identities, installed PHP and Drush paths, dedicated project directory, and successful return codes.

Select an explicitly dedicated installed Drupal project for this operation. Its `web/` directory is the site's root. Keep the operation directory outside that project. Site preparation credentials are private operation inputs and must not enter the native project's restore capture.

A suitable layout is:

| Path | Purpose |
| --- | --- |
| `/private/govhub-tome/source/govhub-operations/` | Complete original application, with the two declared preparation files |
| `/private/govhub-tome/source/tome-8.x-1.16.tar.gz` | Unchanged original module archive |
| `/private/govhub-tome/runtime/NATIVE_RUNTIME.json` | Actual completed installer receipt |
| `/private/govhub-tome/runtime/project/web/` | Dedicated installed Drupal root |
| `/private/govhub-tome/operation/` | Native site preparation, private account, operating workspace and complete results |

The path names are examples. Use absolute paths that belong to the same equipped host. The runtime receipt's `project` must contain the selected site root.

The operating driver retains separate original input and workspace directories. It creates one private GovHub administrator for the example and reuses the account when reopening. Native site preparation owns its foreground PHP server and site lease; the original GovHub service lease owns the capture and release worker.

## Run the whole operating example

Place the exact driver beside the retained receiving sources, then invoke it once on the equipped host:

~~~sh
python3 run_tome_release.py \
  --application /private/govhub-tome/source/govhub-operations \
  --directory /private/govhub-tome/operation \
  --runtime-manifest /private/govhub-tome/runtime/NATIVE_RUNTIME.json \
  --site-root /private/govhub-tome/runtime/project/web \
  --tome-archive /private/govhub-tome/source/tome-8.x-1.16.tar.gz \
  --application-source-commit ACTUAL_FULL_SOURCE_COMMIT \
  --site-mail ACTUAL_SITE_ADMIN_EMAIL
~~~

Select the actual full source commit from the complete package. The callable accepts the same selection as run_tome_journey(..., expected_source_commit=selected_commit). The operation retains that commit and the source-manifest SHA-256 in inputs/Application-Source.json; complete results and cold reopening preserve the binding.

The original environment identifier is `govhub-tome-commissioning`. The native site bootstrap installs only into the selected dedicated project, retains its real site UUID and receiver identity, and starts the original Drupal HTTP router. The driver installs the exact Tome archive and uses its native generator, cache and command implementation.

The example's content is an operator-authored workshare exercise derived from the retained Mobomo public source. Edition A contains three published pages. Edition B changes an existing page, removes the original checklist and adds a receiving page. Stable native UUIDs and original content-command results preserve the same changes across continuation.

## What the operator receives

The driver completes these connected steps:

1. Prepare the dedicated original Drupal site, account and native profile; retain the actual runtime and site bindings.
2. Create edition A in Drupal. Configure the existing Tome source provider and complete its original source capture.
3. Receive the whole generated edition into Static releases. Configure the original local target, inspect every comparison page, and record approval against that exact comparison.
4. Let the original worker stage and publish the reviewed edition. Reopen the target to observe the selected release.
5. Apply edition B's actual editorial changes, capture the full new site, review the complete added/changed/removed paths, then stage and publish B.
6. Execute the original predecessor rollback and observe edition A as the selected release.
7. Produce `Static_Release_Handover.zip`, retaining both complete generated sites, the release and review histories, the original native results and the application's full receiving report.
8. Create the original full workspace backup, reopen it with the same account, inspect both retained editions and the selected release, and independently download the same complete handover bytes.

The final result is written to:

`operation/delivery/GovHub-Tome-Native-Result.json`

It identifies the selected original application source commit and source-manifest SHA-256, site UUID, target, both edition IDs, both published releases, final selected release, complete export, reopened editions and the independently downloaded ZIP.

The main handover files are:

- `operation/delivery/Static_Release_Handover.zip`
- `operation/delivery/Static_Release_Independent_Receiving.zip`
- `operation/delivery/handover-inspection.json`
- `operation/delivery/workspace-backup.json`
- `operation/receiving-workspace/`

The complete comparison pages and every original request/outcome are retained in `operation/results/` and `operation/requests/`.

## Continue or reopen

Use the same command, paths, account, selected source commit and installed source when continuing an interrupted operation. The driver preserves original request UUIDs and bodies, reads completed native commands, and reopens the original operation IDs. It does not initialize another workspace or replay a completed case.

If an original capture or release is waiting for native continuation, the driver uses the maintained resume action on that exact operation and revision. A failed native command is retained with its original result so the receiving engineer can fix the actual source or runtime condition and continue its existing operation.

After the complete result exists, the driver checks the original handover and independent download identities and returns that retained result. The original application can also open `receiving-workspace/` for staff inspection and subsequent use.

For everyday release decisions, open the account-bound Static releases screen from the same GovHub application. The staff workflow includes source selection, complete comparison, review, publication and predecessor rollback; the existing CLI exposes those same original controller actions.

## Private operating inputs and deliverable selection

The native site and GovHub administrator credentials stay in the operation's private preparation files. Deliver the application source, public source archive and source register, complete generated-site handover, approved workshare and the intended receiving workspace through their existing internal custody.

The native receiving result covers the selected commissioning cohort and original source edition. Any separately agreed customer scope and correspondence stay with that customer's private records.
