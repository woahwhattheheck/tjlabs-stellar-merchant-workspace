// Apache-2.0. Source-owned publication services for the existing Applications owner.
import {APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup}
  from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import {join} from 'node:path';
import {publicationApplications, validatePublicationSettings, preparePublicationApplication, verifyPublicationLaunch,
  preparePublicationChild, publicationStartup, PUBLICATION_PROCESS_SCHEMA} from './application.mjs';
export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: 'publication-workspace', order: 164, appendPort: false,
  catalog({field, common}) { return publicationApplications(field, common); },
  validateSettings: validatePublicationSettings,
  async prepare(type, settings, context) {
    const {inspectMerchantRuntime} = await import('../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs');
    const runtime = await inspectMerchantRuntime(context.runtimeDirectory, {load: false, source: false});
    return preparePublicationApplication(type, settings, {...context,
      sourceDirectory: join(runtime.sourceRoot, 'products/publication-workspace')});
  },
  resourceKey(type, settings, {hash}) {
    return hash({family: 'publication-workspace', directory: settings.directory, role: type.id});
  },
  runArguments({args, requestId}) { return [...args, '--managed-operation', requestId]; },
  matchRequest(request) {
    return !request.pythonCommand && request.command === 'publication-workspace' && request.args?.[0] === 'service';
  },
  verifyLaunch: verifyPublicationLaunch,
  prepareChild: preparePublicationChild,
  createObserver(request, directory, context) {
    return observeApplicationStartup(request, directory, text => {
      if (!text.includes(PUBLICATION_PROCESS_SCHEMA)) return null;
      return () => publicationStartup(request, text, context);
    });
  },
};
