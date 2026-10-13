// MIT. Source-owned Tasker metadata and lazy native operations.
import {defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA} from '../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {taskerWorkspaceTools} from './catalog.mjs';
export default defineMerchantProvider({
  schema: MERCHANT_PROVIDER_SCHEMA, id: 'tasker-workspaces', family: 'taskerWorkspaces',
  title: 'Tasker notification installations', order: 160, catalogOrder: 760,
  configKey: 'taskerWorkspaces', summary: true, dependencies: [], maxRequestBytes: 2097152,
  configuration: {input: 'taskerWorkspaceConnection', privateExports: true,
    read: async (value, {hostPath}) => (await import('./workspace.mjs')).readTaskerWorkspaceConfiguration(hostPath(value))},
  tools: taskerWorkspaceTools,
  instructions: [{prefix: 'merchant_tasker_', order: 160,
    text: 'Use the configured Tasker alias and inspect its original installation before operating its queue. Prepare or receive the complete original application through the host-selected source/configuration/archive. Retain one request UUID for each complete mutation and reuse the exact arguments after interruption. Queue/configuration results are read through merchant_tasker_request in the original SQLite database; installation, source-adoption and archive receiving continue through their original native lifecycle records. Save the whole configuration at its current revision. Preserve delivery IDs and event-version cursors as decimal strings. Review the complete uncertain delivery and actual external outcome before resolving it. Applications starts the original operator, ingress and worker against this same installation; closing the MCP adapter drains its calls and leaves those services with their existing owner. Export the complete original application and SQLite state, then independently receive it through the same native archive operation.'}],
  load: () => import('./workspace.mjs'),
  create: (module, config) => new module.MerchantTaskerWorkspaces(config),
});
