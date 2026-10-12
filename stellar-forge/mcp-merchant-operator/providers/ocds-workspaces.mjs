// MIT. Independent OCDS merchant metadata; native source opens through lazy hooks.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../provider-contract.mjs';
import { ocdsWorkspaceTools } from '../catalog/ocds-workspace.mjs';

export default defineMerchantProvider({
  schema: MERCHANT_PROVIDER_SCHEMA, id: 'ocds-workspaces', family: 'ocdsWorkspaces',
  title: 'OCDS procurement workspaces', order: 520, catalogOrder: 520,
  configKey: 'ocdsWorkspaces', summary: true, dependencies: [], maxRequestBytes: 1048576,
  configuration: { input: 'ocdsWorkspaceConnection', privateExports: true,
    read: async (value, { hostPath }) => (await import('../ocds-workspace.mjs')).readOcdsWorkspaceConfiguration(hostPath(value)) },
  tools: ocdsWorkspaceTools,
  instructions: [{
    prefix: 'merchant_ocds_', order: 520,
    text: 'Open a host-declared original OCDS workspace. Browser and tools share its one SQLite model. Read the current global workspace revision before imports, receives, exports and merchant preparation; review updates use the selected process review revision. Releases, publisher compiled releases and versioned history retain distinct identities and exact source pointers. Continue collection pages with nextOffset. Export complete original source, document, comparison or package files and read their exact listed SHA256 in chunks. Merchant preparation uses the original SF30 dataset compiler and public host payment terms. All dataset query values are strings. Filter using where_ocid or where_package_id, retain the complete fields and continue page.nextCursor unchanged. Each process packet retains its full original sources and every chunk; receive the complete selected packet through the original SF100 delivery before adopting it. Inspect retained publications and receiving history after a lost mutation response. Close only the current owned workspace or seller instance. Saved publisher selections use their own revision. Source refresh starts or resumes a native durable window; follow its original window ID through completion. Assigned source reviews have a separate revision and saved owner. Original acquisition imports read host-declared inputs and preserve actual provider metadata; an unknown retrieval timestamp remains null. Inspect a sourceDelivery alias and pass its exact handoff ID before receiving. Source-handoff exports retain every original binary document and editable review file through the existing file reader. Source and document values remain original publisher data.'
  }],
  load: () => import('../ocds-workspace.mjs'),
  create: (module, config) => new module.MerchantOcdsWorkspaces(config),
  initialize: async options => (await import('../ocds-workspace.mjs')).initializeOcdsWorkspaceMerchant(options)
});
