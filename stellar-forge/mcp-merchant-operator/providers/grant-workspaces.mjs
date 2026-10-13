// MIT. Original grant-workspaces merchant metadata and lazy source hooks.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../provider-contract.mjs';
import { grantWorkspaceTools } from "../catalog/grant-workspace.mjs";

export default defineMerchantProvider({
  schema: MERCHANT_PROVIDER_SCHEMA, id: "grant-workspaces", family: "grantWorkspaces",
  title: "grant workspaces merchant", order: 40, catalogOrder: 390,
  configKey: "grantWorkspaces", summary: true, dependencies: [],
  maxRequestBytes: 33554432,
  configuration: { input: "grantWorkspaceConnection", privateExports: true,
    read: async (value, { base, config, hostPath }) => await (await import("../grant-workspace.mjs")).readGrantWorkspaceConfiguration(hostPath(value)) },
  tools: () => grantWorkspaceTools,
  instructions: [
    {
      "prefix": "merchant_grant_",
      "text": "For SF47 planning and delivery, select the declared grant workspace and read its original schema, plans and case versions. Use the exact original request ID, revision, actor, reviewed plan content and forecast input hashes for changes. Inspect a retained request after a lost reply. Reuse the original planner, cash model, evidence files, outcome register and grant Application writer. Page snapshots with the returned pointers and offsets; retain the complete immutable files and SHA-pinned input transfers. The open and reporting_capture tools may start only a host-authorized original workspace; a borrowed running Application stays with its owner. For complete Source Collections use source_collection_create/import, stage/edit, explicit use_existing, review, receive and reconcile. Retain the original collectionId and exact copy sequence. Every original request and receipt is saved before the next file. Use source_collection_export and the existing complete file reader to return the full original browser working copy. Explicit kind source-working-copy inputs and retained exports support512 MiB; native request32 MiB and file8 MiB bounds remain. For Installation Source Desk work, use source_desk_profiles/list/detail and the complete native preparation or commissioning review. source_desk_upload_prepare freezes exact input bytes; source_desk_review_prepare retains the full reviewed selection. Save the returned operation file before source_desk_execute, and use source_desk_reconcile after an uncertain reply. The original draft journal owns create, file intake, native preparation, archive receiving and Installation attachment. Complete preparation archives retain all native members, manifest and ZIP framing using their exact returned size and SHA. For complete economic Research Installation sources use research_installation_import with an explicit host input kind research-project, research-issued-package or research-customer-return and the exact original SHA. After response loss use request, then resume only INPUT_RETAINED; do not invent a new UUID. Inspect and template retain the native Workshare/case/Installation bindings. Use the existing source_desk_command_prepare/execute for explicit selection.save, prepare and research.attach; original Installation Preview/Save stays separate. Describe the actual saved Installation archive, then download with its returned SHA through research_installation_archive. Full archives stream to private retained files up to 2 GiB; existing file_read/release pages every byte without a giant agent JSON response. The provider request limit remains32 MiB. Reporting capture retains the original reviewed case, complete source inputs and portable preparation under one request ID. Use reporting_capture_inspect after a lost reply and the returned file_read references to receive every complete output.",
      "order": 60
    }
  ],
  load: () => import("../grant-workspace.mjs"),
  create: (module, config, options, dependencies) => new module.MerchantGrantWorkspaces(config),
  initialize: async options => (await import('../config.mjs')).initializeGrantWorkspaceMerchant(options)
});
