// Apache-2.0. Source-owned partner services for the existing Applications owner.
import {APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup}
  from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import {join} from 'node:path';
import {partnerApplications, validatePartnerSettings, preparePartnerApplication, verifyPartnerLaunch,
  preparePartnerChild, partnerStartup, PARTNER_PROCESS_SCHEMA} from './application.mjs';
export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: 'partner-workspace', order: 168, appendPort: false,
  catalog({field, common}) { return partnerApplications(field, common); },
  validateSettings: validatePartnerSettings,
  async prepare(type, settings, context) {
    const {inspectMerchantRuntime} = await import('../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs');
    const runtime = await inspectMerchantRuntime(context.runtimeDirectory, {load: false, source: false});
    return preparePartnerApplication(type, settings, {...context,
      sourceDirectory: join(runtime.sourceRoot, 'products/partner-workspace')});
  },
  resourceKey(type, settings, {hash}) {
    return hash({family: 'partner-workspace', directory: settings.directory, role: type.id});
  },
  runArguments({args, requestId}) { return [...args, '--managed-operation', requestId]; },
  matchRequest(request) {
    return !request.pythonCommand && request.command === 'partner-workspace' && request.args?.[0] === 'service';
  },
  verifyLaunch: verifyPartnerLaunch,
  prepareChild: preparePartnerChild,
  createObserver(request, directory, context) {
    return observeApplicationStartup(request, directory, text => {
      if (!text.includes(PARTNER_PROCESS_SCHEMA)) return null;
      return () => partnerStartup(request, text, context);
    });
  },
};
