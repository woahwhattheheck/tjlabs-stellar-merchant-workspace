// Apache-2.0. Source-owned publication metadata and lazy original native operations.
import {defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA} from '../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {publicationWorkspaceTools} from './catalog.mjs';
export default defineMerchantProvider({
  schema: MERCHANT_PROVIDER_SCHEMA, id: 'publication-workspaces', family: 'publicationWorkspaces',
  title: 'Publication installations', order: 164, catalogOrder: 764,
  configKey: 'publicationWorkspaces', summary: true, dependencies: [], maxRequestBytes: 2097152,
  configuration: {input: 'publicationWorkspaceConnection', privateExports: true,
    read: async (value, {hostPath}) => (await import('./workspace.mjs')).readPublicationWorkspaceConfiguration(hostPath(value))},
  tools: publicationWorkspaceTools,
  instructions: [{prefix: 'merchant_publication_', order: 164,
    text: 'Use the configured publication alias and inspect its original installation and retained source before operating it. Prepare from the complete original source and selected workspace backup, or independently receive the complete installation ZIP. Each lifecycle change retains one request UUID and exact arguments. Read its existing request after interruption. The staff editor performs the original source, procurement, media, review, release and native-return work; Applications launches that editor, a chosen frozen resident release and the original WordPress service against the same installation. The whole snapshot preserves every source edition, original editable operator handover, closed native site and lifecycle lineage. Close staff and WordPress roles before a whole snapshot, and staff before an original export; reopen their same Applications entries afterward. The native login remains the selected original environment reference.'}],
  load: () => import('./workspace.mjs'),
  create: (module, config) => new module.MerchantPublicationWorkspaces(config),
});
