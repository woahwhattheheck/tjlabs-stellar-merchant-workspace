// MIT. Source-owned SeaTable merchant registration with the original provider lifetime.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import { seatableWorkspaceTools } from './catalog.mjs';
export default defineMerchantProvider({
  schema: MERCHANT_PROVIDER_SCHEMA, id: 'seatable-workspaces', family: 'seatableWorkspaces',
  title: 'SeaTable source authoring', order: 470, catalogOrder: 470, configKey: 'seatableWorkspaces',
  summary: true, dependencies: ['publishers'], maxRequestBytes: 1048576,
  configuration: { input: 'seatableWorkspaceConnection', privateExports: true,
    read: async (value, { hostPath }) => (await import('./mcp.mjs')).readSeaTableWorkspaceConfiguration(hostPath(value)) },
  tools: seatableWorkspaceTools,
  instructions: [{ prefix: 'merchant_seatable_', order: 470,
    text: 'List host-declared SeaTable workspaces, then open the original source model. Import an exact frozen source/private packet or intentionally inspect and capture a declared SQL selection or original native view. Inspect all source fields, save the exact captured field/type union and public aliases/null policy with the current draft revision, validate every row, review and freeze the exact source version. Use the SAME borrowed publisher tools for candidate review/publication and original buyer handoff. Source deployment tools retain the original SF82 store, reviewed package, generation/digest/instance and uncertain-command observation. Private packet reads contain ALL original source records; publish customer-facing data through the original publisher and release controls. Close drains the owned browser, borrowed publisher/scheduler, pending requests and packet reads before releasing the original workspace.' }],
  load: () => import('./mcp.mjs'),
  create: (module, config, options, dependencies) => new module.MerchantSeaTableWorkspaces(config, dependencies.publishers),
});
