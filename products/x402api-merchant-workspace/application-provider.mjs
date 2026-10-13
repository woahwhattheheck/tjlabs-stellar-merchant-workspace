// MIT License. Source-owned Applications registration for the original merchant.
import { APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import { merchantApplication, validateMerchantSettings, checkMerchantRuntime, prepareMerchantApplication,
  verifyMerchantApplicationLaunch, merchantApplicationStartup } from './managed-application.mjs';
import { RECEIVED_REVIEW_SCHEMA } from './received-project-review.mjs';
import { RECEIVED_REVIEW_KIND, RECEIVED_REVIEW_COMMAND, receivedMerchantApplication,
  validateReceivedMerchantSettings, prepareReceivedMerchantApplication,
  verifyReceivedMerchantLaunch, receivedMerchantStartup } from './managed-review.mjs';

import { MERCHANT_INTAKE_SCHEMA } from './project-intake.mjs';
import { MERCHANT_INTAKE_KIND, MERCHANT_INTAKE_COMMAND, merchantIntakeApplication,
  validateMerchantIntakeSettings, prepareMerchantIntake, verifyMerchantIntakeLaunch,
  merchantIntakeStartup } from './managed-intake.mjs';

export default {
  schema: APPLICATION_PROVIDER_SCHEMA,
  id: 'x402api-merchant',
  order: 1000,
  catalog({ common, field }) {
    return [merchantApplication(common, field), receivedMerchantApplication(common, field), merchantIntakeApplication(common, field)];
  },
  validateSettings(type, settings) {
    if (type.id === MERCHANT_INTAKE_KIND) return validateMerchantIntakeSettings(type, settings);
    return type.id === RECEIVED_REVIEW_KIND
      ? validateReceivedMerchantSettings(type, settings) : validateMerchantSettings(type, settings);
  },
  checkRuntime: checkMerchantRuntime,
  prepare(type, settings, context) {
    if (type.id === MERCHANT_INTAKE_KIND) return prepareMerchantIntake(settings, context);
    return type.id === RECEIVED_REVIEW_KIND
      ? prepareReceivedMerchantApplication(settings, context) : prepareMerchantApplication(settings, context);
  },
  matchRequest(request) {
    return !request.pythonCommand && (request.command === MERCHANT_INTAKE_COMMAND || request.command === RECEIVED_REVIEW_COMMAND ||
      request.command === 'x402api-merchant' && request.args?.[0] === 'serve');
  },
  verifyLaunch(request) {
    if (request.command === MERCHANT_INTAKE_COMMAND) return verifyMerchantIntakeLaunch(request);
    return request.command === RECEIVED_REVIEW_COMMAND
      ? verifyReceivedMerchantLaunch(request) : verifyMerchantApplicationLaunch(request);
  },
  createObserver(request, directory) {
    return observeApplicationStartup(request, directory, text => {
      if (!text.startsWith('{')) return null;
      let value;
      try { value = JSON.parse(text); } catch { return null; }
      if (request.command === MERCHANT_INTAKE_COMMAND) {
        if (value?.schema !== MERCHANT_INTAKE_SCHEMA) return null;
        return () => merchantIntakeStartup(request, value);
      }
      if (request.command === RECEIVED_REVIEW_COMMAND) {
        if (value?.schema !== RECEIVED_REVIEW_SCHEMA) return null;
        return () => receivedMerchantStartup(request, value);
      }
      if (value?.schema !== 'stellar-forge.x402api-merchant-workspace.v1') return null;
      return () => merchantApplicationStartup(request, value);
    }, { lineLimit: request.command === MERCHANT_INTAKE_COMMAND ? 65536 : 16384 });
  },
};
