// MIT. grist Applications registration over the original native implementation.
import { APPLICATION_PROVIDER_SCHEMA, applicationPreparation, observeApplicationStartup } from '../../../distribution/runtime-workspace/application-provider.mjs';
import { gristApplication, prepareGristApplication, gristStartup } from "./application.mjs";

export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: "grist-authoring", order: 470,
  catalog({ common, field }) { return [gristApplication(common)]; },
  async prepare(type, settings, context) {
    const { inputPath, selectedExecutable, applicationEnvironment, runtimeDirectory } = context;
    const { args, inputs, createDirectories, path, option } = applicationPreparation(settings, inputPath);
    const original = await prepareGristApplication(settings, { inputPath, runtimeDirectory });
    args.push(...original.args); inputs.push(...original.inputs); createDirectories.push(...original.createDirectories);
    return { args, inputs, createDirectories };
  },
  matchRequest(request) { return !request.pythonCommand && request.command === "grist-workspace"; },
  createObserver(request, directory, context) {
    return observeApplicationStartup(request, directory, text => {
      if (!text.startsWith("{\"schema\":\"stellar-forge.grist-authoring-startup.v1\",")) return null;
      return () => gristStartup(request, text);
    });
  },
};
