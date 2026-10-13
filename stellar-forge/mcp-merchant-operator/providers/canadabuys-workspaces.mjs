// MIT. Independent CanadaBuys merchant metadata; native source opens through lazy hooks.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../provider-contract.mjs';
import { canadabuysWorkspaceTools } from '../catalog/canadabuys-workspace.mjs';

export default defineMerchantProvider({
  schema: MERCHANT_PROVIDER_SCHEMA, id: 'canadabuys-workspaces', family: 'canadabuysWorkspaces',
  title: 'CanadaBuys procurement workspaces', order: 530, catalogOrder: 530,
  configKey: 'canadabuysWorkspaces', summary: true, dependencies: [], maxRequestBytes: 262144,
  configuration: { input: 'canadabuysWorkspaceConnection', privateExports: true,
    read: async (value, { hostPath }) => (await import('../canadabuys-workspace.mjs')).readCanadaBuysWorkspaceConfiguration(hostPath(value)) },
  tools: canadabuysWorkspaceTools,
  instructions: [{
    prefix: 'merchant_canadabuys_', order: 530,
    text: 'Open a host-declared original CanadaBuys workspace. Browser, CLI and tools share its one SQLite model. Read global workspace revision before source imports, source captures, receiving, exports and merchant preparation; review and workshare updates use their own current revision. Original CSV columns and bytes, bilingual descriptions, source observations and source-linked workshare history remain retained. Closing timestamps without an offset use the official fixed UTC minus five hours. A notice absent from the latest complete open feed keeps its original source status separately. Award joins use exact historical solicitation numbers; supplier and commodity overlaps are review candidates with explicit evidence. Read every collection page with nextOffset. Use complete original CSV or package export and the retained file reader for large inputs. Merchant preparation freezes the selected complete procurement/workshare packages; use host public payment terms and the original SF30 dataset/SF100 receiving protocol. All dataset query values are strings. Query where_notice_id or where_package_id, retain all transport fields and continue page.nextCursor unchanged. Inspect original captures/publications/receiving after a lost response; continue the existing operation. Supplier response collaboration uses merchant_canadabuys_response_* on this same workspace. Declare complete preparation, comparison and apply JSON requests as host input aliases and pin their SHA256. Preparation and adoption preserve the entire original command input; replay it unchanged after a lost response, without replacing expectedRevision. Inspect saved response metadata and export complete document/transfer/editor/Markdown files through the original retained-file reader. Comparison retains its full values in a publication and advances the global workspace revision; use a fresh status before preparing a new apply input, retain explicit field choices and changed-source/workshare acknowledgements, and preserve named supplier review attribution. Export an explicit recordRevision to retain a historical response. Open the response editor at /response-review/ with its trailing slash. Close the currently owned workspace or seller instance.'
  }],
  load: () => import('../canadabuys-workspace.mjs'),
  create: (module, config) => new module.MerchantCanadaBuysWorkspaces(config),
  initialize: async options => (await import('../canadabuys-workspace.mjs')).initializeCanadaBuysWorkspaceMerchant(options)
});
