// MIT. Source-owned merchant fleet Applications registration.
import { APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup } from '../application-provider.mjs';
import { merchantFleetApplication, prepareMerchantFleetApplication, merchantFleetStartup } from '../application-merchant-fleet.mjs';

export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: 'merchant-fleet', order: 54,
  catalog({ common }) { return [merchantFleetApplication(common)]; },
  prepare(type, settings, context) { return prepareMerchantFleetApplication(settings, context); },
  matchRequest(request) { return !request.pythonCommand && request.command === 'merchant-fleet-workspace' && request.args?.[0] === 'managed'; },
  runArguments({ args, requestId }) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(requestId ?? '') ||
        args.includes('--operation-id')) throw new Error('APPLICATION_FLEET_OPERATION_ID_INVALID');
    return [...args, '--operation-id', requestId];
  },
  createObserver(request, directory) {
    return observeApplicationStartup(request, directory, line => {
      if (!line.startsWith('{"schema":"stellar-forge.fleet-workspace-startup.v1",')) return null;
      return () => merchantFleetStartup(request, line, directory);
    }, { lineLimit: 32768 });
  },
};
