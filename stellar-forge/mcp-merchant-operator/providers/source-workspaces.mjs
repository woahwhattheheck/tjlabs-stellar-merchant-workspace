// MIT. Original source-workspaces merchant metadata and lazy source hooks.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../provider-contract.mjs';
import { sourceWorkspaceTools } from "../catalog/source-workspace.mjs";

export default defineMerchantProvider({
  schema: MERCHANT_PROVIDER_SCHEMA, id: "source-workspaces", family: "sourceWorkspaces",
  title: "source workspaces merchant", order: 370, catalogOrder: 330,
  configKey: "sourceWorkspaces", summary: true, dependencies: [],
  maxRequestBytes: 131072,
  configuration: { input: "sourceWorkspaceConnection", privateExports: true,
    read: async (value, { base, config, hostPath }) => await (await import("../source-workspace.mjs")).readSourceWorkspaceConfiguration(hostPath(value)) },
  tools: sourceWorkspaceTools,
  instructions: ['Organisation budgets and documents use the existing IATI source console. Ingest a complete declared publisher file, inspect its organisation profile, and retain original source/revision/target identities across save, review and release. Recover an interrupted mutation with merchant_source_iati_organisation_request and its unchanged requestId. Full organisation exports and files use merchant_source_file_read; received organisation ZIPs use merchant_source_iati_organisation_receive.'],
  load: () => import("../source-workspace.mjs"),
  create: (module, config, options, dependencies) => new module.MerchantSourceWorkspaces(config),
  initialize: async options => (await import('../config.mjs')).initializeSourceWorkspaceMerchant(options)
});
