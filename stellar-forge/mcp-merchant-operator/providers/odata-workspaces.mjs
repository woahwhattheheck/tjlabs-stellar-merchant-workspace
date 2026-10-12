// MIT. Original odata-workspaces merchant metadata and lazy source hooks.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../provider-contract.mjs';
import { odataWorkspaceTools } from "../catalog/odata-workspace.mjs";

export default defineMerchantProvider({
  schema: MERCHANT_PROVIDER_SCHEMA, id: "odata-workspaces", family: "odataWorkspaces",
  title: "odata workspaces merchant", order: 200, catalogOrder: 150,
  configKey: "odataWorkspaces", summary: true, dependencies: [],
  maxRequestBytes: 131072,
  configuration: { input: "odataWorkspaceConnection", privateExports: true,
    read: async (value, { base, config, hostPath }) => await (await import("../odata-workspace.mjs")).readODataWorkspaceConfiguration(hostPath(value)) },
  tools: odataWorkspaceTools,
  instructions: [{
    prefix: "merchant_odata_",
    text: "Open a declared original OData workspace and retain its connection, query, edition, service and collection IDs. Receive original saved responses before selecting their complete ordered cursor chain. For large collection chains select the declared complete collectionSelections file. Inspect full row/page counts, source/query identity and every paginated inventory. Original Analysis source discovery returns the complete document and exact file references; transfer all of them with their hashes and relative paths, register that document in the existing AnalysisWorkspace, then use its actual source name/revision for the original mapping. Continue the original native Analysis jobs, SQL/report/workbook and complete workspace receiving. Restore collections using a pinned host source document or an inspected source collection under a declared workspace. Compare two saved complete collections using both inspected hashes and a stable comparison ID. Page the original changed cells and exact entity keys; retain review request IDs and complete notes across uncertain replies. Publish the selected review revision, then select both its edition ID and source SHA256 for the complete comparison source and file inventory. A declared comparisonReviews file supplies a large original review request within the native key limit. Transfer every declared analytical file and register its actual Analysis source revision for SQL/report/workbook work. Receive the full comparison through a pinned comparisonSources document or a declared source workspace edition, preserving compatible later review history. Reuse original job, collection, comparison and transfer IDs after interrupted replies; close drains this workspace's existing operations and file reads.",
    order: 380
  }],
  load: () => import("../odata-workspace.mjs"),
  create: (module, config, options, dependencies) => new module.MerchantODataWorkspaces(config),
  initialize: async options => (await import('../config.mjs')).initializeODataWorkspaceMerchant(options)
});
