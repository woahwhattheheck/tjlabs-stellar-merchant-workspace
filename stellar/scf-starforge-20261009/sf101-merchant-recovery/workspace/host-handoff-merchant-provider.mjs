// MIT. Source-owned standalone adapter for the original whole-host handoff engine.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import { hostHandoffMerchantTools } from './host-handoff-merchant-catalog.mjs';

export default defineMerchantProvider({
  schema: MERCHANT_PROVIDER_SCHEMA, id: 'recovery-host-handoffs', family: 'hostHandoffs',
  title: 'Merchant whole-host handoffs', order: 611, catalogOrder: 611,
  configKey: 'hostHandoffs', summary: true, dependencies: [],
  configuration: { input: 'hostHandoffConnection', privateExports: true,
    read: async (value, { base, config, hostPath }) =>
      (await import('./host-handoff-merchant.mjs')).readHostHandoffMerchantConfiguration(hostPath(value), {
        operatorDirectory: base, releaseStore: config.releaseStore, exportsDirectory: config.exportsDirectory
      }) },
  tools: hostHandoffMerchantTools, maxRequestBytes: 128 * 1024,
  concurrency: 'host', shutdown: 'provider',
  load: () => import('./host-handoff-merchant.mjs'),
  create: (module, config, options = {}) => new module.MerchantHostHandoffs(config, {
    consoleDirectory: options.consoleDirectory
  }),
  initialize: async options =>
    (await import('./host-handoff-merchant-setup.mjs')).initializeHostHandoffMerchant(options),
  instructions: [{ prefix: 'merchant_host_handoff_', order: 611, text:
    'Use only an operator-selected host alias from merchant_host_handoff_hosts. This dedicated provider invokes the original offline whole-host engine; selected recovery workspace listeners and other selected producers must be stopped. Read the complete source selection and its SHA with merchant_host_handoff_selection. With actual source quiescence, call plan once using expectedSelectionSha256 and quiesced:true. Plan creation is create-only: after a lost reply read saved_plan, preserving the original plan and full returned SHA. After a successful plan response, also read saved_plan with its returned SHA and inspect those complete original bytes before export. Export uses expectedPlanSha256 and continued quiesced:true; after uncertainty read capture for the same host and plan before explicitly continuing the original operation. Capture and operation tools return recorded-only state, not fresh bundle authentication. Move the complete original encrypted bundle by the existing binary transfer route, retaining the exact native manifest SHA. Restore and receiving review use expectedManifestSha256 against fixed host paths; inspect the complete native review before adopting its expectedReviewSha256 with quiesced:true. After an uncertain adoption reply read operation by that same host and review. No automatic retries or replacement operation directories. Callers cannot select paths, executables, passphrase values or environment names. The dedicated operator uses an empty release store and no other configured provider family; its configuration, state and optional console remain outside selected source and receiving roots. Native operations serialize with original core mutations. Closing this provider stops admission, requests cancellation only for an operation-backed adoption, and drains every original call before release. Other native operations may finish during close. Preserve every original result, code, journal and identity.' }]
});
