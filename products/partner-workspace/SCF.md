# Mobility and education workbench installations

This product connects two complete source-based staff applications to the maintained Customer Installation, Merchant and Applications surfaces. A mobility team works with original monthly mobility publications, quality findings, comparisons and station flows. An education team works with exact course/framework/pathway editions, evidence, criterion decisions and linked corrective actions. The original workbench remains the application and database owner.

## Select the original complete work

Keep the actual Workshare, source rights, commercial milestones and customer records in the original case. Select the complete runtime source, original LICENSE and all relative dependencies with the manifest described in native/API.md. Select an existing original workspace archive when continuing a completed customer workspace. Source import, original business edits and their history stay in that workspace.

The generic Installation profiles are mobility-source-review and education-quality-review. They preserve the actual seed's Workshare, workorder, funding, merchant/buyer selections and acceptance checks. Company-specific fees and contacts are not embedded in a generic profile.

Run the original commissioning join:

    starforge partner-commission --seed /PRIVATE/Original_Installation_Seed.json --bindings /PRIVATE/Original_Bindings.json --selection /PRIVATE/Partner_Selection.json --out /PRIVATE/commissioning

The private selection uses schema stellar-forge.partner-installation-selection.v1, product mobility or education, a retained operationId, exact seed case and workshareCaseId, original source attachment ID/root/manifest/SHA256/workshareReference, the selected installation directory/Python/optional original workspace archive, and the actual actor. Its output preserves whole original inputs and creates the ordinary prepared Installation document/preview, complete workorder and unchanged native preparation request. The original case owner then uses its normal preview/save workflow.

## Prepare and open the whole application

    starforge partner-workspace prepare --directory /PRIVATE/installation --source-root /PRIVATE/original-runtime --source-manifest /PRIVATE/Partner_Source.json --workspace-archive /PRIVATE/Original_Workspace.zip --python /usr/bin/python3 --request-id UUID
    starforge partner-workspace inspect --directory /PRIVATE/installation

Omit workspace-archive only when intentionally starting an original empty workspace. The selected Python must be3.11 or later and include its ordinary SQLite module.

In Applications choose Mobility source review or Education quality review, then the prepared directory and adapter Python. Save, inspect/review the selected original source and start. The existing managed supervisor launches the original server directly with its lease. Open the returned local URL; use the actual staff UI for monthly import/review or course/framework/review/action work. Stop and reopen that same entry through Applications.

The service-ready identity binds the original product, workspace UUID, installation UUID, source edition, Python, child PID and loopback origin. Selecting an education application for a mobility installation is refused.

## Merchant integration

A private owned configuration file uses schema stellar-forge.partner-workspace-connection.v1:

    {"schema":"stellar-forge.partner-workspace-connection.v1","workspaces":{"review":{"label":"Original review","directory":"/PRIVATE/installation","python":"/usr/bin/python3","sourceRoot":"/PRIVATE/original-runtime","sourceManifest":"/PRIVATE/Partner_Source.json","transferDirectory":"/PRIVATE/exports"}}}

Set partnerWorkspaceConnection in the existing Merchant configuration. Optional workspaceArchive selects original preparation input; receiveArchive selects the complete installation ZIP for a new receiving alias. Optional binding pins installation_id and source_identity. Retired temporary donors do not prevent a completed named request from being received; different surviving bytes still fail that original request.

The15 merchant_partner tools inspect the original installation/source/state, current records and history, original evidence, actual mobility comparison/station flow, lifecycle requests and service descriptors. Named source adoption, snapshot, original export and independent receive use the same original native functions as the typed client and CLI. Exported files use host-selected private paths. Service lifetime remains with Applications.

Typed consumers import PartnerInstallation from the installed merchant/partner export. Call close() to drain original pending operations before disposing the client. No queue, retry controller or duplicate business database is introduced.

## Original exports and independent delivery

Stop the selected service and export the useful original data:

    starforge partner-workspace export --directory /PRIVATE/installation --kind report --output /PRIVATE/exports/Review.md --request-id UUID
    starforge partner-workspace export --directory /PRIVATE/installation --kind csv --output /PRIVATE/exports/Review.csv --request-id UUID
    starforge partner-workspace export --directory /PRIVATE/installation --kind workspace --output /PRIVATE/exports/Original_Workspace.zip --request-id UUID
    starforge partner-workspace snapshot --directory /PRIVATE/installation --output /PRIVATE/exports/Complete_Installation.zip --request-id UUID

Each command retains its own original UUID. The original workspace ZIP is independently runnable with its complete original source and state. The installation ZIP additionally carries source editions, the complete original workspace and lifecycle lineage.

Receive the installation into a new private directory:

    starforge partner-workspace receive --directory /PRIVATE/received --archive /PRIVATE/exports/Complete_Installation.zip --python /usr/bin/python3 --request-id UUID
    starforge partner-workspace inspect --directory /PRIVATE/received

The receiver assigns a new installation identity while preserving the actual workspace UUID/product and source/history. Open the received directory through the matching Applications entry, inspect original editable records and their history, continue ordinary work, and export onward from the received installation.

## Source successors and recovery

Close the service, then use adopt-source with the complete selected successor manifest and its retained UUID. The same database is validated with the successor's original model; previous editions and lifecycle records remain. Inspect and review the saved Applications entry before reopening.

After an interrupted lifecycle response, read requests.get with its exact requestId and retry that same original request if necessary. The original committed result or marker is reconciled before donor paths are required. An output path containing different bytes is preserved and refused. Source and workspace IDs are never replaced with a summary or reconstructed sample.

The private receiving programme for an actual customer case consumes its existing source/browser outputs and original archived workspace. It adds the installed managed-start/export/independent-reopen journey to that same product delivery.
