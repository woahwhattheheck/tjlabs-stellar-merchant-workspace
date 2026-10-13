// MIT. humanitarian Applications registration over the original native implementation.
import { APPLICATION_PROVIDER_SCHEMA, applicationPreparation, observeApplicationStartup } from '../application-provider.mjs';
import { humanitarianApplication, prepareHumanitarianApplication, humanitarianStartup } from "../application-humanitarian.mjs";

export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: "humanitarian", order: 176,
  catalog({ common, field }) { return [humanitarianApplication(common)]; },
  async prepare(type, settings, context) {
    const { inputPath, selectedExecutable, applicationEnvironment, runtimeDirectory } = context;
    const { args, inputs, createDirectories, path, option } = applicationPreparation(settings, inputPath);
    const prepared = await prepareHumanitarianApplication(settings, {
      inputPath, selectedExecutable, runtimeDirectory, applicationEnvironment,
    });
    args.push(...prepared.args); inputs.push(...prepared.inputs);
    return { args, inputs, createDirectories };
  },
  matchRequest(request) { return !request.pythonCommand && request.command === "dataset-humanitarian"; },
  createObserver(request, directory, context) {
    return observeApplicationStartup(request, directory, text => {
      if (!text.startsWith("{\"schema\":\"stellar-forge.humanitarian-workspace-launch.v1\",")) return null;
      return () => humanitarianStartup(request, text);
    });
  },
};
