// MIT. seatable Applications registration over the original native implementation.
import { APPLICATION_PROVIDER_SCHEMA, applicationPreparation, observeApplicationStartup } from '../../../distribution/runtime-workspace/application-provider.mjs';
import { seatableApplication, prepareSeaTableApplication, seatableStartup } from "./application.mjs";

export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: "seatable-authoring", order: 470,
  catalog({ common, field }) { return [seatableApplication(common)]; },
  async prepare(type, settings, context) {
    const { inputPath, selectedExecutable, applicationEnvironment, runtimeDirectory } = context;
    const { args, inputs, createDirectories, path, option } = applicationPreparation(settings, inputPath);
    const original = await prepareSeaTableApplication(settings, { inputPath, runtimeDirectory });
    args.push(...original.args); inputs.push(...original.inputs); createDirectories.push(...original.createDirectories);
    return { args, inputs, createDirectories };
  },
  matchRequest(request) { return !request.pythonCommand && request.command === "seatable-workspace"; },
  createObserver(request, directory, context) {
    return observeApplicationStartup(request, directory, text => {
      if (!text.startsWith("{\"schema\":\"stellar-forge.seatable-authoring-startup.v1\",")) return null;
      return () => seatableStartup(request, text);
    });
  },
};
