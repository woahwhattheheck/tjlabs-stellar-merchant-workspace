# OpenLineage selected product package

The `openlineage-operations` selection produces the complete OpenLineage product, its
installed command-line interface, the operator runtime, Applications and the
authenticated merchant connection. Its source archive is also the source used by
the installed Quality receiving programme.

## Build the selected product

Use one published source commit for both the builder and its Git input. From that
checkout, run the maintained builder with the product selection:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/path/to/source-checkout \
  --ref FULL_PUBLISHED_SOURCE_COMMIT \
  --selection openlineage-operations \
  --out /absolute/private/openlineage-package
~~~

The result identifies the complete archive, its SHA-256, the source commit, the
selected source count and the unpacked source bytes. Retain the archive together
with that result. The package manifest records each file's original Git object,
byte count and SHA-256 and binds the exact selection declaration.

Continue an interrupted build with the same output, source commit and selection,
adding `--resume`. Inspect an existing build with `--out DIRECTORY --status`.
A completed build is reused only when its retained identity and output agree.
The builder's normal Git-source receiver can acquire a missing original object;
an offline build requires that exact object in its existing source cache.

## What travels with this product

| Area | Included source |
| --- | --- |
| OpenLineage application | Complete current application, editable workspace receiving, Service Levels, Quality, producer interfaces, operator guides and original upstream notice |
| Product installation | SF46 release preparation, installation, activation and maintained templates |
| Operator experience | Runtime Workspace pages, saved Applications, worker entry points and the runtime modules required by the selected commands |
| Merchant connection | Complete merchant console, authenticated HTTP and stdio hosts, client configuration and the explicitly declared workflow modules |
| Delivery | Product operating and receiving programmes, package receiver, runtime installer, transfer tools and installation guidance |

The selection preserves the original selected commands, exports, runtime features,
OpenLineage Applications provider and OpenLineage merchant provider. It also carries
the maintained Runtime Workspace and response-cache browser maps used by the
runtime. Required command and provider entry points are explicit package inputs.
The maintained builder follows static module imports and each selected server's
browser asset map to carry their dependencies with them.

Complete directories are retained where the product reads files dynamically: the
OpenLineage application and its own source inventories, the release templates,
the Runtime Workspace public pages, the merchant console and the reviewer pages.
Worker entry points, source files read by release and export operations, and the
Python helpers with their original local modules are declared explicitly because
these paths can be loaded without a static JavaScript import. The console's
OpenAPI, gRPC and reviewer workflow source remains selected. The upstream
`OPENLINEAGE_LICENSE` is an explicit original source file.

The reviewer retains the original Buyer quote store, result store, MCP server and
protocol modules that it loads from the selected source root. Its
`/native-client.mjs` route serves the same explicitly retained Buyer browser client.
The Buyer's maintained console asset map carries its complete pages and shared
route-identity modules. These original runtime and browser inputs are part of the
package even when the reviewer reaches them through a dynamic module load or file
read.

This scope is defined by the product's installed interfaces. A required imported
module is included even when it lives in another repository component. Applications
and merchant services load their providers from the selected distribution record.
Additional provider suites can be built from their own maintained selections.
Optional runtime dependencies retain their original pinned declarations.

## Install and receive the package

The complete installed journey is described in
[INSTALLED_RECEIVING.md](INSTALLED_RECEIVING.md). It covers the selected package,
release installation, an offline source-verified operator runtime, Applications,
desktop and phone review, the seven Quality merchant tools, an explicit reconnect
after restart and independent editable receiving.

For an already prepared package, use the `selectedPackage` input with the
archive's exact SHA-256 and source commit. To build it during the journey, use
the mutually exclusive `sourceBuild` input and this product selection.
Both routes operate the same original installed application.

When continuing an older Quality customer export into a newer published
application, use the explicit upgrade input in that guide. Retain the old
source snapshot and any published source corrections alongside the original
complete customer export. The upgrade verifies both source editions and carries
the complete customer state and objects into the current application.

Keep a changed source commit or selection in its own receiving case. The
receiving journal binds its original source package, input export and operation.
The previous completed case remains a useful editable customer delivery.

## Read the delivered source

A complete installed delivery contains `source-package.tgz`,
`runtime-unpack.py`, the original receiving programme, the editable customer
workspace, all three Quality reports and the complete native result. Unpack the
source package with its recorded identity:

~~~sh
python3 runtime-unpack.py \
  --archive source-package.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --out selected-package
~~~

The result's `manifest.json` is the complete selected file inventory.
`package.json` exposes the selected commands and exports.
The application remains ordinary editable source under
`source/stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace`.
Use the delivered operating guide to start its received workspace and inspect the
saved customer evaluation, decisions and reports.

When handing the installed product to another operator, retain the full package
and complete receiving ZIP. The same source and customer data can then be opened,
installed and independently received without the original development checkout.
