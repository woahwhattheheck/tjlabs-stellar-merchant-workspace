// MIT. Original nocodb-workspaces merchant metadata and lazy source hooks.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../provider-contract.mjs';
import { nocodbWorkspaceTools } from "../catalog/nocodb-workspace.mjs";

export default defineMerchantProvider({
  schema: MERCHANT_PROVIDER_SCHEMA, id: "nocodb-workspaces", family: "nocodbWorkspaces",
  title: "nocodb workspaces merchant", order: 280, catalogOrder: 230,
  configKey: "nocodbWorkspaces", summary: true, dependencies: ["publishers"],
  maxRequestBytes: 1048576,
  configuration: { input: "nocodbWorkspaceConnection", privateExports: true,
    read: async (value, { base, config, hostPath }) => await (await import("../nocodb-workspace.mjs")).readNocoDBWorkspaceConfiguration(hostPath(value)) },
  tools: nocodbWorkspaceTools,
  instructions: [
    {
      "prefix": "merchant_nocodb_",
      "text": "For NocoDB authoring, list merchant_nocodb_workspaces and open the declared original model and browser. Inspect host input hashes or discover the actual table through its existing connection, then capture complete original pages with exact field IDs/types and native identity order. Save the draft with its current revision, preview all retained rows and review the source version against the current selection. Open its original publisher and use merchant_nocodb_publisher_* against the SAME publisher and scheduler; original run UUIDs, candidate/review hashes, target revisions and buyer handoffs remain authoritative. Deployment tools use that source model's original SF82 store and console, exact generation/digest/instance and uncertain-command observation. Receive private source packets with original version/capture/hash/offset and reopen the same request after lost replies. Use merchant_nocodb_workspace_* for complete private .ncwh exports and named independent receiving. Review current draft/selection before export; exact completed request replay returns its immutable archive without stopping a later service. Inputs of kind workspace carry the full original history; select the exact hash and request before receiving. Open the returned childWorkspace through its original parent, work on that independent model and retain whole archives through the chunked read. This is distinct from source packets, which allocate local capture/version identities. Returned customer review freezes the existing named child and compares exact shared source and ordered draft ancestry. Save the complete local/returned/base choice map against the current preview, refresh its revision and digest, then apply only the reviewed draft. Original native field IDs, provider types, numeric token encodings and source selection remain validated by the original model. Run full-row preview and deliberately save/select/publish the corrected edition afterward. Close drains retained readers, received children, the original model, borrowed publisher calls and owned services.",
      "order": 110
    }
  ],
  load: () => import("../nocodb-workspace.mjs"),
  create: (module, config, options, dependencies) => new module.MerchantNocoDBWorkspaces(config, dependencies.publishers),
  initialize: async options => (await import('../config.mjs')).initializeNocoDBWorkspaceMerchant(options)
});
