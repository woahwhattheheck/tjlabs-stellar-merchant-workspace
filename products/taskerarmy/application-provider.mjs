// MIT. Tasker source registration in the existing Applications owner.
import {APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup}
  from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import {join} from 'node:path';
import {taskerApplications, validateTaskerSettings, prepareTaskerApplication, verifyTaskerLaunch,
  prepareTaskerChild, taskerStartup, TASKER_PROCESS_SCHEMA} from './application.mjs';
export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: 'taskerarmy', order: 160, appendPort: false,
  catalog({field, common}) { return taskerApplications(field, common); },
  validateSettings: validateTaskerSettings,
  async prepare(type, settings, context) {
    const {inspectMerchantRuntime} = await import('../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs');
    const runtime = await inspectMerchantRuntime(context.runtimeDirectory, {load: false, source: false});
    return prepareTaskerApplication(type, settings, {...context, sourceDirectory: join(runtime.sourceRoot, 'products/taskerarmy')});
  },
  resourceKey(type, settings, {hash}) { return hash({family: 'taskerarmy', directory: settings.directory, role: type.id}); },
  runArguments({command, args, requestId}) { return [...args, '--managed-operation', requestId]; },
  matchRequest(request) { return !request.pythonCommand && request.command === 'taskerarmy' && request.args?.[0] === 'service'; },
  verifyLaunch: verifyTaskerLaunch,
  prepareChild: prepareTaskerChild,
  createObserver(request, directory, context) {
    return observeApplicationStartup(request, directory, text => {
      if (!text.includes(TASKER_PROCESS_SCHEMA)) return null;
      return () => taskerStartup(request, text, context);
    });
  },
};
