// Apache-2.0. Source-owned odr services for the existing Applications owner.
import {APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup}
  from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import {join} from 'node:path';
import {odrApplications, validateOdrSettings, prepareOdrApplication, verifyOdrLaunch,
  prepareOdrChild, odrStartup, ODR_PROCESS_SCHEMA} from './application.mjs';
export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: 'odr-workspace', order: 179, appendPort: false,
  catalog({field, common}) { return odrApplications(field, common); },
  validateSettings: validateOdrSettings,
  async prepare(type, settings, context) {
    const {inspectMerchantRuntime} = await import('../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs');
    const runtime = await inspectMerchantRuntime(context.runtimeDirectory, {load: false, source: false});
    return prepareOdrApplication(type, settings, {...context,
      sourceDirectory: join(runtime.sourceRoot, 'products/odr-workspace')});
  },
  resourceKey(type, settings, {hash}) {
    return hash({family: 'odr-workspace', directory: settings.directory, role: type.id});
  },
  runArguments({args, requestId}) { return [...args, '--managed-operation', requestId]; },
  matchRequest(request) {
    return !request.pythonCommand && request.command === 'odr-workspace' && request.args?.[0] === 'service';
  },
  verifyLaunch: verifyOdrLaunch,
  prepareChild: prepareOdrChild,
  createObserver(request, directory, context) {
    return observeApplicationStartup(request, directory, text => {
      if (!text.includes(ODR_PROCESS_SCHEMA)) return null;
      return () => odrStartup(request, text, context);
    });
  },
};
