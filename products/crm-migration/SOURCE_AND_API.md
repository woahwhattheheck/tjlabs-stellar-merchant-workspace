# CRM desk — reusable composition

Complete generic application source, fictional receiving examples and operating documentation. The comparison/workspace APIs are exported through runtime/crm-runtime.cjs. Workspace create/apply/validate/archive/restore retain complete immutable original operations and support exact retry. Native CLI and standalone renderer compose those same modules.

browser/render-desk.cjs exports renderDesk(files, archive). files is a path→complete-source map; archive is model.archive(workspace). Returned HTML embeds that exact module map and archive. runtime/crm-runtime.cjs exports migration,codec,comparison,workspace,report,zipper,exportFiles. Connect normal installed-app storage, CLI and agent operations around these APIs while retaining source validation and original inputs.

## Module identities
- runtime/migration-core.js — 22389 bytes / 3f2da0546574ee49a66c5dd3b9cba8357315c6d1ac2cb990b60129e69797a33e
- runtime/migration-codec.js — 16743 bytes / 4d0126c246d081328f889e952e52f767c0a508ccd7b5e05c2a776835ac63920a
- runtime/connected_zip.cjs — 12090 bytes / 857c79f789e9cf4f6321bf22804e1c8d55af6758495ae1ba09d4fa72fd97bb26
- runtime/connected_gzip.cjs — 47127 bytes / 1fc9f3b218c60d029c96bf9f1c1e4de5fcb86918ed5a0570586dc81488440119
- runtime/crm-comparison.cjs — 19524 bytes / d6253db47a8c64af05f1fc7c314054b816848eeec050922763e51f8235f7b581
- runtime/crm-workspace.cjs — 6281 bytes / 8f103f377f87982a585227d9cc9e0f9a1866ade5ccd980c58f87bf30b92affb3
- runtime/crm-runtime.cjs — 1504 bytes / 2668242438df68fefd80331798f090c0b2958af7576ef27186afbbc43e718d37
- browser/crm-desk.cjs — 29771 bytes / 9bbb268c13626d11b151e231b507de4d671932d3878f82b797138567b6855819

Existing CSV/codec and ZIP/gzip implementations are retained whole. CRM comparison, workspace, report, normal-form browser and receiving modules are the current contribution. The authored40-operation course and nine focused V8 checks execute against these same APIs. Native filesystem and rendered receiving are documented separately.

## Installed composition

The complete original generic source is retained in source-history/generic-base.gzip.json. The comparison, workspace, CSV/codec, reports, ZIP/gzip, examples and original file CLI remain complete. Current browser and renderer add the managed original-host path while retaining standalone use. host/ supplies private storage, one writer, authenticated local server and typed client; managed.mjs and application-provider.mjs join Applications; mcp.mjs, tools.mjs, setup.mjs and merchant-provider.mjs join the original merchant host. SOURCE_MANIFEST.json identifies every current file. package.json explicitly retains CommonJS semantics for the original .js/.cjs modules beneath the surrounding ESM distribution.

## HubSpot acquisition modules

runtime/hubspot-capture.cjs owns the current versioned read plan, page transitions, precise identifiers, response replay and complete CSV derivation. host/hubspot.mjs attaches response custody and resumable capture to the existing store serial writer. host/store.mjs exposes hubspot(action,args) and captureExport(id,expectedSha256); host/client.mjs exposes hubspot(action,args). The existing server, CLI, browser and merchant_crm_hubspot customer-agent operation all use those same paths. HUBSPOT.md contains the complete declared API contract and receiving instructions.

## Installed cutover composition

cutover/core.cjs, workspace.cjs and runtime.cjs retain the full four-snapshot model, operation replay, ordered packets, observed reconciliation and identity-bound reversal behavior. cutover/desk.cjs and render-desk.cjs provide the normal-form editor in offline and managed modes. host/cutover.mjs owns the original companion through the existing host/store.mjs queue and lease, including byte-exact source bridge, stable request recovery, full exports and retained reversal results. The existing CLI, listener, client and merchant_crm_cutover tool route to that same writer. Complete generic predecessor94 is retained under source-history/generic-cutover.gzip.json.
