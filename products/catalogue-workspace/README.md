# Native catalogue workspace

A Symfony bundle for reviewing a selected Akeneo product cohort before the existing Sylius importer handles it. It runs inside an installed Sylius project and uses its original administration session, Messenger transport, Doctrine connection, product importer, media storage and import-result records.

The selected connector baseline is [Webgriffe SyliusAkeneoPlugin 3.1.0](https://github.com/webgriffe/SyliusAkeneoPlugin/tree/f5a38abc9537356dde16ad75f046f324a22ed6ec). The actual installed Composer lock and configured services are checked during commissioning. The bundle does not install another shop, reset a database or invoke the connector's development fixtures.

## What the operator can do

- Select explicit product identifiers, locales and channels in a retained project.
- Capture complete native source responses, dependencies and media, then inspect the original product beside current native values.
- Keep individual fields local or source-owned and approve an immutable source/native/mapping comparison.
- Dispatch the original stamped ItemImport, inspect its actual generated result, and continue the same operation after a lost response or pending media publication.
- Retain an unapplied stale operation explicitly, then make a following capture and approval without reactivating the old stamp.
- Review a selected missing product and explicitly disable that variant after a fresh native check.
- Download original source files and receive the complete catalogue archive without overwriting later work on an exact replay.
- Transfer the installed Symfony/Sylius project separately, with authenticated code, vendor, SQL, queue and storage plus an explicit existing-target review and recovery copy.

No broad all-variant reconciliation is called. Unselected identifiers continue through the existing importer. An ordinary unstamped import of a selected active identifier is retained for review through the native failure mechanism.

## Start with the existing project

Read [the installation guide](receiving/INSTALLATION.md) and supply the actual project root, PHP, Composer, existing administrator and private work paths. The reviewed installer stages the complete application package and resolves a candidate lock separately. It rejects changes to pre-existing dependency packages, presents exact Composer/bundle/configuration/route postimages, and applies the selected review before running the native install and engine actions.

The product package is `tjl/catalogue-workspace`. Its bundle is `Tjl\CatalogueWorkspace\TjlCatalogueWorkspaceBundle`. The admin route resource is `@TjlCatalogueWorkspaceBundle/config/routes.php`, normally under `/%sylius_admin.path_name%/catalogue-workspace` inside the existing admin firewall. The private Store must be available to the original web, console and worker processes.

The native CLI is:

```text
/actual/php /actual/project/bin/console catalogue:workspace ACTION \
  --input /private/input.json \
  --operation-id original-command-id \
  --actor existing-admin-username \
  --output /private/result.json
```

Every action takes a JSON object, including `{}` for `install` and `engine`. A zero exit with `WAITING_NATIVE` records an observed response; it does not mean the worker completed the import. Keep the original operation ID and input when continuing. Read `operation` to see current native state after a retained dispatch acknowledgement.

See [the complete action and state contract](application/SOURCE_CONTRACT.md) for input fields, response envelopes, field ownership and exact retry behavior.

## Source and media consistency

[Source capture](application/SOURCE_CAPTURE.md) uses the original authenticated Akeneo client. Complete request/response bytes and source dependencies are retained privately. At actual item handling, the source is checked again; the importer then consumes those already checked native response streams. Unknown or changed dependencies suspend the operation before unreviewed data is imported.

The original Doctrine transaction holds the native mutation and its APPLIED marker together. Media writes are staged privately until that marker survives commit. The operation then publishes and reads back retained file intents using the original storage adapters. A pending publication remains visible and resumes without repeating the catalogue mutation. This is explicit post-commit publication, not an atomic database/filesystem transaction.

Credentials and token caches remain with the installed host. Source journals and exported original bodies must be handled as private operational data.

## Two different archives

The catalogue ZIP includes the selected project, review/approval/import records, source/media journals, complete referenced bytes and original attempts. Its immutable archive identity allows the same accepted receive to reopen without resetting later local work.

The [native project handover](application/tools/NATIVE_PROJECT_HANDOVER.md) carries the installed shop graph: application and vendor, complete SQL, selected queue, public/private storage and the catalogue Store. It preserves target-private configuration and requires actual drain, dump/import, resume and verification commands. Native database files are explicitly excluded from filesystem copying when SQL is their transfer authority. External queues require their own native export/import and reopen verification.

The receiving programme uses the catalogue archive with the separately received original native project. It does not reconstruct unrelated native product, administrator or result IDs from review JSON.

## Complete source and receiving

- `application/SOURCE.json` enumerates the complete installable package by relative path, byte size, SHA-256 and Git blob identity. The manifest itself is an explicitly selected metadata file.
- `SOURCE.json` enumerates this complete product, including receiving tools, guides and the selected upstream source bank.
- `upstream/SOURCE.json` identifies every unchanged retained connector file. The original dependency remains Composer-owned.
- `receiving/` contains the existing-project installer and the native/browser receiving course. Its examples require actual selected paths, accounts and native decisions; they do not contain manufactured customer data.

The maintained source has independent syntax and integration review. Actual installation, worker handling, database/media receiving and rendered acceptance remain pending until an equipped original receiver supplies those results.

Before presenting an application, report, archive or attachment, the producing operator must open the exact outgoing version, visually inspect the actual wide and narrow views, use the important controls, verify downloads and reopen the original project. Source inspection, status codes and DOM counts do not replace looking at the product. Keep the original receiving operation and fix concrete findings in this implementation.

New bundle and receiving source is MIT-licensed. Selected upstream files retain their original license and notices. Installed third-party dependencies retain their own licenses.
