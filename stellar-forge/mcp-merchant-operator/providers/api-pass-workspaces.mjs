// MIT. Original api-pass-workspaces merchant metadata and lazy source hooks.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../provider-contract.mjs';
import { apiPassWorkspaceTools } from "../api-pass-protocol.mjs";

export default defineMerchantProvider({
  schema: MERCHANT_PROVIDER_SCHEMA, id: "api-pass-workspaces", family: "apiPassWorkspaces",
  title: "api pass workspaces merchant", order: 70, catalogOrder: 20,
  configKey: "apiPassWorkspaces", summary: true, dependencies: [],
  concurrency: 'provider',
  maxRequestBytes: 131072,
  configuration: { input: "apiPassWorkspaceConnection", privateExports: true,
    read: async (value, { base, config, hostPath }) => await (await import("../api-pass-connection.mjs")).readApiPassWorkspaceConfiguration(hostPath(value)) },
  tools: apiPassWorkspaceTools,
  instructions: [
    {
      "prefix": "merchant_api_pass_",
      "text": "For API customers, list the configured workspace aliases and reopen the original saved customer session. Use host-declared file and purchase handles, inspect their complete source hashes, and retain each exact operationId and expectedRevision before dispatch. After an interrupted reply, read merchant_api_pass_operation and recover the same original request and payload. Original purchase, request, approval and recovery semantics remain in the customer service. Page the original per-order portfolio and its attention requests at one returned revision. Retain one selected refresh batch, observe its actual task IDs and skips, and use the strict-revision portfolio configuration for the saved default. New requests explicitly select that reviewed profile; existing calls retain their original profile/order/request identity. Prepare a replacement with purchase_replenish using a declared hash-pinned handoff, then complete the original Buyer/Inbox review and purchase before explicitly selecting the new pass. Page passes and complete customer history at the returned revision. Capture complete original response, review, proof, report or history files under a stable exportId; use the typed client or merchant-api-pass to resume SHA-pinned downloads after either process restarts. Retained exports remain available after the customer service closes. The optional private agent directory reopens the original connection, merchant settings and local MCP client together.",
      "order": 90
    }
  ],
  load: () => import("../api-pass-workspace.mjs"),
  create: (module, config) => new module.MerchantApiPassWorkspaces(config),
  initialize: async options => (await import('../config.mjs')).initializeApiPassWorkspaceMerchant(options)
});
