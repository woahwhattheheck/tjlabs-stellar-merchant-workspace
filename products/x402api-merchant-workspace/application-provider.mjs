// MIT License. Source-owned Applications registration for the original merchant.
import { APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import { merchantApplication, validateMerchantSettings, checkMerchantRuntime, prepareMerchantApplication,
  verifyMerchantApplicationLaunch, merchantApplicationStartup } from './managed-application.mjs';

export default {
  schema: APPLICATION_PROVIDER_SCHEMA,
  id: 'x402api-merchant',
  order: 1000,
  catalog({ common, field }) { return [merchantApplication(common, field)]; },
  validateSettings: validateMerchantSettings,
  checkRuntime: checkMerchantRuntime,
  prepare(_type, settings, context) { return prepareMerchantApplication(settings, context); },
  matchRequest(request) {
    return !request.pythonCommand && request.command === 'x402api-merchant' && request.args?.[0] === 'serve';
  },
  verifyLaunch: verifyMerchantApplicationLaunch,
  createObserver(request, directory) {
    return observeApplicationStartup(request, directory, text => {
      if (!text.startsWith('{')) return null;
      let value;
      try { value = JSON.parse(text); } catch { return null; }
      if (value?.schema !== 'stellar-forge.x402api-merchant-workspace.v1') return null;
      return () => merchantApplicationStartup(request, value);
    });
  },
};
