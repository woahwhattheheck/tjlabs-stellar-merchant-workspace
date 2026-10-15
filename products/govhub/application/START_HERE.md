# GovHub operations — start and receive

This package contains the complete retained cutover application, the unchanged original cutover comparator, the content consolidation and visitor journey products, their native Drupal receiving components, and the Drush, Acquia, Lagoon and Pantheon provider integrations. The source lock identifies every original file and its exact revision.

## Open the application

Use Linux and Python 3.11 or later. The application uses the Python standard library, SQLite and local files. Native providers run with their existing supported tools and account context. Keep the supplied directory structure together: workspace/server.py imports the original parent cutover.py and the included assessment core.

Extract the complete ZIP into a new application directory. Change into its govhub-operations folder. Create separate private directories for the operating workspace and incoming source files. Use the existing staff account when receiving an established workspace.

For a new operating workspace, run:

    python3 workspace/cli.py --workspace /absolute/private/govhub-workspace \
      --source-root /absolute/private/govhub-incoming --username operator \
      init --name "GovHub operations" --mode SUPPLIED

The original application asks for the new staff password in the terminal. Start its browser service on loopback:

    python3 workspace/server.py --workspace /absolute/private/govhub-workspace \
      --source-root /absolute/private/govhub-incoming --port 8792

Open http://127.0.0.1:8792 and use the retained staff account. The full operating guide is workspace/README.md. DOMAIN.md explains the inventory, native operations and original comparison workflow. NATIVE_SOURCES.md gives the native acquisition and receiving contracts. The original examples in the package root are clearly named example CSVs and remain separate from imported operating inventories.

For a terminal-only service, run the same durable queue:

    python3 workspace/cli.py --workspace /absolute/private/govhub-workspace \
      --source-root /absolute/private/govhub-incoming --username operator \
      worker --until-idle

The CLI retains the worker while an accepted original provider workflow is pollable, including a scheduled next poll. It returns when the queue settles or a saved operation requires its actual observation, original provider ID or other operator input. Its JSON result names the saved operations.

## Use the complete native providers

Configure the original site, environment and native tool references in the application's environment register. The original operating profile belongs to the selected target. Provider observations, exact native command outputs, original backup files, selected work and workflow continuation remain attached to each operation.

For Pantheon, read workspace/PANTHEON.md, workspace/pantheon_bridge/PHP_BRIDGE.md and workspace/PANTHEON_RECEIVING.md together. The receiving command in workspace/pantheon_receive.py prepares the exact original toolchain, opens the existing staff workspace and executes or resumes the same saved instruction through the application's own dispatch APIs.

The optional native/terminus.phar is the unchanged Terminus 4.3.3 release:

- Source commit: 4cd1810ad892157131cec5919baf3036ab457d57.
- Original GitHub release asset: 522697387.
- Complete bytes: 12,336,985.
- SHA-256: e7ca9bcad3acbb1cfc0cec32550eeb2351e578dc6d5f79cd3a5303201893bade.
- Its original license is retained in workspace/native/TERMINUS-LICENSE.txt.

Use the receiving preparation command to check the actual PHP runtime, PHAR version and single original govhub:bridge plugin before native work. The bridge records the actual returned workflow ID immediately; the provider resumes that same workflow when process output is lost. Read the existing account/site context through the native host. Staff workspace backups and provider account credentials retain their separate established custody.

A package built without the PHAR contains the same complete application and bridge source. Supply the installed original Terminus release through the receiving command. Native site inventories and API actions use the account already configured on that host.

## Receive an established operation

Open the existing editable workspace backup through the application's receiving-copy workflow. Retain the complete original database, source files, command outputs and native operation directory. The receiving APIs preserve the original family and operation IDs, revisions, selected sources, approval history and native workflow continuation.

Use the receiving guide's exact workspace and source-store arguments. A private directory may move during receiving; the original command and request/receipt files follow the application’s private custody relocation. The configured business target remains the selected native site and environment.

Reopen the received workspace first and inspect its retained operations. Continue the same original provider workflow using its saved native ID or durable bridge receipt. Read the actual provider result and attach the observed restored inventory through the normal operating form. Export the completed handover and the editable workspace backup from the same application.

The content and visitor products retain their original receiving guides under workspace/content_consolidation and workspace/visitor_journeys. The package includes these whole namespaces so their source intake, native Drupal delivery and staff workflows remain available after receiving.

## Build a complete application release

The package includes workspace/build_application.py. It performs three distinct operations: retain an immutable source lock from Git, build the full ZIP from those exact files, and reopen a delivered ZIP to verify its members. It uses only Python's standard library and native Git for the lock command. Build and verify use the received source files and need no network access.

From an existing repository checkout, retain the full application source at the final composed commit:

    python3 products/govhub/application/workspace/build_application.py lock \
      --repository /absolute/commons --revision FULL_40_CHARACTER_COMMIT \
      --output /absolute/release/APPLICATION_SOURCE.json

The lock reads every tracked source member under products/govhub/application from that commit through one native Git object batch. Existing generated source/package indexes and the optional runtime PHAR have their own package slots. The source lock requires all native provider, bridge, receiver, content, visitor, core, UI and licensing dependencies.

Place the exact locked source in one application directory, preserving relative paths. Then build the original release:

    python3 /absolute/application/workspace/build_application.py build \
      --source-root /absolute/application \
      --manifest /absolute/release/APPLICATION_SOURCE.json \
      --terminus-phar /absolute/native/terminus-4.3.3.phar \
      --output /absolute/release/govhub-operations.zip

Omit --terminus-phar when the receiver will use its existing native installation. Every output path is create-only. Use a new filename for an updated source lock or application edition.

During the build, each file streams from its opened source into the ZIP and is checked against both its original Git blob and its SHA-256. The builder retains modes, original licenses, the full source lock and a package index. It reopens the completed ZIP and checks every member before publishing the final filename.

Verify a received ZIP using the original whole-file SHA-256 from its delivery:

    python3 workspace/build_application.py verify /absolute/received/govhub-operations.zip \
      --expected-sha256 ORIGINAL_64_CHARACTER_ZIP_SHA256

The result reports the complete ZIP bytes and SHA-256, original source commit, source member count and whether the pinned Terminus PHAR is included. The included source lock is a readable file map; the independently delivered whole-ZIP hash identifies the selected delivery.

## Source and licensing

The maintained Commons application and this packaging code use the Apache License, Version 2.0 retained in LICENSE. The unchanged assessment core keeps its original attribution in workspace/vendor/assessment-core/README.md. Terminus retains its original Pantheon and WP-CLI attribution and MIT license. Its unchanged release PHAR includes the upstream dependency distribution. Native Drupal receiving code and original provider tools retain their source-level notices.

The complete source and native input contracts are included so the receiving operator can edit, maintain and rerun the application from the exact delivered revision.


## POTS delivery projects

Open **POTS delivery → Builds and deployments** in the same application to join
an original CircleCI/POTS run to the selected Pantheon environment, native
recovery operations and content transition. Save the actual project/target
identities and delivery scope. Install the postdeployment capture in the
consuming project's original PHP job using workspace/pots/CAPTURE.md.

workspace/pots/README.md contains the complete native CircleCI V3 collector,
streaming receiving command, browser workflow, source-revision semantics and
independent handover. The application retains complete run editions, native
job output, source/configuration files, artifacts, selected-target observations,
linked operating work and reviews. The POTS project handover includes its
complete originals and joins the existing content and recovery deliveries.

The complete application package includes the capture, collector, receiving
parser, project service, handover integration and browser views. The existing
full workspace backup includes their saved project records and files. Reopen
that backup with this same application, inspect an original received run,
reopen its linked operations and create a new complete handover.


## Current Upsun environments

Use workspace/UPSUN.md for the complete current Upsun profile, native inventory,
snapshot creation, branch/activate/synchronize/deploy/merge/restore operations and
original activity continuation. workspace/UPSUN_NATIVE.md retains the exact API
and native activity contracts; the complete original specification and selected
official clients are included under workspace/native/upsun/.

Native snapshots remain provider restore resources. workspace/UPSUN_SOURCE.md
documents the separate complete Git, SQL and mount export, exact receiving and
independent original source reopening. The original credentials remain host
references and each native response/source keeps its complete identity.

workspace/UPSUN_RECEIVING.md gives the whole saved native course and independent
application/project handover. Its receiver preserves the original request and
uses a separate continuation for actual activity associations and current host
references. The complete browser course opens the actual installed source at
desktop and narrow widths, operates its important controls, receives complete
downloads and reopens the original operation in a separate authenticated session.

The producing peer must look at the actual rendered screens or returned images,
open/use every final attachment and extracted deliverable, and fix concrete
presentation or workflow problems before calling this outgoing application ready.
Source checks and an unviewed screenshot capture do not replace that delivery.
Use the current equipped owner's same account, workspace, operation and native
lifetime; this feature does not allocate a second receiving host.


## Reviewed target environment edition

This source edition adds explicit reviewed source-to-target URL maps to the existing whole application. Open a cohort and choose **Review target expectations**. The full guide and continuing native course are in `workspace/TARGET_ENVIRONMENTS.md`. Original source, actual restored inventory, named decisions, native checkpoints and all old operations remain intact. `APPLICATION_SOURCE.json` pins this source edition; its `source_commit` identifies the retained base, while `source_edition` identifies the additive unpublished working edition and its exact files.
