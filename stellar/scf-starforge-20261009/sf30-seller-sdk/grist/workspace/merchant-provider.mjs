// MIT. Source-owned Grist merchant registration with the original provider lifetime.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import { gristWorkspaceTools } from './catalog.mjs';
export default defineMerchantProvider({
  schema: MERCHANT_PROVIDER_SCHEMA, id: 'grist-workspaces', family: 'gristWorkspaces',
  title: 'Grist source authoring', order: 470, catalogOrder: 470, configKey: 'gristWorkspaces',
  summary: true, dependencies: ['publishers'], maxRequestBytes: 32*1024*1024,
  configuration: { input: 'gristWorkspaceConnection', privateExports: true,
    read: async (value, { hostPath }) => (await import('./mcp.mjs')).readGristWorkspaceConfiguration(hostPath(value)) },
  tools: gristWorkspaceTools,
  instructions: [{ prefix: 'merchant_grist_', order: 470,
    text: 'List host-declared Grist workspaces, then open the original source model. Import an exact frozen source/private packet or intentionally inspect and capture the declared Grist document/table membership selection with complete typed responses and native history heads. Inspect all source fields, save the exact captured field/type union and public aliases/null policy with the current draft revision, validate every row, review and freeze the exact source version. Use the SAME borrowed publisher tools for candidate review/publication and original buyer handoff. Source deployment tools retain the original SF82 store, reviewed package, generation/digest/instance and uncertain-command observation. Private packet reads contain ALL original source records; publish customer-facing data through the original publisher and release controls. Operating-plan tools retain complete customer instructions/history inside the same source database and operation journal. Select saved document/catalog/capture/version/request IDs, save with procedure version CAS, capture local observations explicitly, receive complete histories and review divergent returns. Capture preserves operator-authored status and results; it never opens a publisher, starts a scheduler, refreshes provider data or dispatches work. Close drains the owned browser, borrowed publisher/scheduler, pending requests and packet reads before releasing the original workspace.' }],
  load: () => import('./mcp.mjs'),
  create: (module, config, options, dependencies) => new module.MerchantGristWorkspaces(config, dependencies.publishers),
});
