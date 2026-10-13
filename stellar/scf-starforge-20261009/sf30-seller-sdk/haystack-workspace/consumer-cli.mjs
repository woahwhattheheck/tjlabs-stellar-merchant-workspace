// MIT. Complete consumer commands share the original request, receipt and replay path.
import { resolve, basename } from "node:path";
export const consumerHelp = `
Consumer receiving and acceptance
  consumer-files       [--page --offset N --limit N]
  consumer-file        --file-id SHA --out FILE
  consumer-retain      --file FILE --media-type TYPE --author TEXT [--name TEXT]
  consumer-projects    [--page --offset N --limit N]
  consumer-project     --project-id UUID [--version-id SHA]
  consumer-plan-preview --file PLAN_CONTENT.json
  consumer-create      --file PLAN_CONTENT.json --author TEXT [--project-id UUID]
                       [--note TEXT|--note-file FILE]
  consumer-save        --project-id UUID --head-id SHA --file PLAN_CONTENT.json
                       --author TEXT [--note TEXT|--note-file FILE]
  consumer-plan-review --project-id UUID --head-id SHA --decision ready|changes
                       --author TEXT --note TEXT|--note-file FILE
  consumer-run-open    --project-id UUID --head-id SHA --plan-review-id SHA
                       --mode actual|engineering --author TEXT [--run-id UUID]
                       [--supersedes-run-id UUID] [--note TEXT|--note-file FILE]
  consumer-run         --run-id UUID
  consumer-run-preview --run-id UUID --run-head-id SHA --file OBSERVATIONS.json
  consumer-run-receive --run-id UUID --run-head-id SHA --file OBSERVATIONS.json
                       --author TEXT [--note TEXT|--note-file FILE]
  consumer-run-review  --project-id UUID --head-id SHA --run-id UUID
                       --run-head-id SHA --decision accept|accept-exceptions|changes
                       [--exceptions ARRAY.json] --author TEXT --note TEXT|--note-file FILE
  consumer-report      --project-id UUID [--format json|csv|html] [--out FILE]
  consumer-return      --run-id UUID [--out FILE]
  consumer-return-preview --file COMPLETE_CONSUMER_RETURN.json
  consumer-return-apply --file COMPLETE_CONSUMER_RETURN.json --run-id UUID
                        --run-head-id SHA --author TEXT --note TEXT|--note-file FILE

Retain input, mapping, expected-population, command and output files by their full
original bytes. Plan and observation JSON files contain the documented content
objects. All writes support --expected-revision and the original request-file,
request-directory and operation-id options. Recover a lost response with replay
--request-file FILE; replay preserves the original operation and selected heads.
See CONSUMER_OPERATING.md for the full local, customer-return and merchant flows.
`;
export function consumerCommandOptions(mutationFlags, pageFlags) {
  const author = ["author", "note", "note-file"], project = ["project-id", "head-id"], run = ["run-id", "run-head-id"];
  return {
    "consumer-files": pageFlags, "consumer-file": ["file-id"],
    "consumer-retain": [...mutationFlags, "file", "media-type", "author", "name"],
    "consumer-projects": pageFlags, "consumer-project": ["project-id", "version-id"],
    "consumer-plan-preview": ["file"],
    "consumer-create": [...mutationFlags, "file", "project-id", ...author],
    "consumer-save": [...mutationFlags, ...project, "file", ...author],
    "consumer-plan-review": [...mutationFlags, ...project, "decision", ...author],
    "consumer-run-open": [...mutationFlags, ...project, "plan-review-id", "mode", "supersedes-run-id", "run-id", ...author],
    "consumer-run": ["run-id"], "consumer-run-preview": [...run, "file"],
    "consumer-run-receive": [...mutationFlags, ...run, "file", ...author],
    "consumer-run-review": [...mutationFlags, ...project, ...run, "decision", "exceptions", ...author],
    "consumer-report": [...mutationFlags, "project-id", "format"],
    "consumer-return": [...mutationFlags, "run-id"],
    "consumer-return-preview": ["file"],
    "consumer-return-apply": [...mutationFlags, ...run, "file", ...author]
  };
}
export async function runConsumerCommand(command, flags, target, h) {
  const { required, one, clean, optionalNote, revisionArgs, allPages, output, performMutation,
    deliveryToFile, readJson, plainRead, semanticBytes, exactFile } = h;
  const project = () => ({ projectId: required(flags, "project-id"), expectedHeadId: required(flags, "head-id") });
  const run = () => ({ runId: required(flags, "run-id"), expectedRunHeadId: required(flags, "run-head-id") });
  const author = async () => ({ author: required(flags, "author"), note: await optionalNote(flags) });
  const content = () => readJson(required(flags, "file"), 32 * 1024 * 1024);
  const returned = async () => ({ base64: (await plainRead(resolve(required(flags, "file")), 96 * 1024 * 1024)).toString("base64") });
  if (command === "consumer-files" || command === "consumer-projects") {
    const action = command === "consumer-files" ? "consumer.files.list" : "consumer.projects.list";
    return output(await allPages(target, action, await revisionArgs(target, flags), flags), flags);
  }
  if (command === "consumer-file") {
    const out = required(flags, "out"), bytes = await semanticBytes(target, "consumer.file.read", { fileId: required(flags, "file-id") });
    return output({ fileId: required(flags, "file-id"), file: await exactFile(out, bytes) }, {});
  }
  if (command === "consumer-project") return output(await target.request("consumer.project.read",
    await revisionArgs(target, flags, clean({ projectId: required(flags, "project-id"), versionId: one(flags, "version-id") }))), flags);
  if (command === "consumer-run") return output(await target.request("consumer.run.read",
    await revisionArgs(target, flags, { runId: required(flags, "run-id") })), flags);
  if (command === "consumer-plan-preview") return output(await target.request("consumer.plan.preview",
    await revisionArgs(target, flags, { content: await content() })), flags);
  if (command === "consumer-run-preview") return output(await target.request("consumer.run.preview",
    await revisionArgs(target, flags, { ...run(), content: await content() })), flags);
  if (command === "consumer-return-preview") return output(await target.request("consumer.return.preview",
    await revisionArgs(target, flags, await returned())), flags);
  let action, fields;
  if (command === "consumer-retain") {
    const path = resolve(required(flags, "file"));
    action = "consumer.file.retain"; fields = { name: one(flags, "name", basename(path)),
      mediaType: required(flags, "media-type"), base64: (await plainRead(path, 32 * 1024 * 1024)).toString("base64"),
      author: required(flags, "author") };
  } else if (command === "consumer-create" || command === "consumer-save") {
    action = command === "consumer-create" ? "consumer.project.create" : "consumer.project.save";
    fields = { ...(command === "consumer-create" ? clean({ projectId: one(flags, "project-id") }) : project()), content: await content(), ...await author() };
  } else if (command === "consumer-plan-review") {
    action = "consumer.plan.review"; fields = { ...project(), decision: required(flags, "decision"), ...await author() };
  } else if (command === "consumer-run-open") {
    action = "consumer.run.open"; fields = { ...project(), planReviewId: required(flags, "plan-review-id"),
      mode: required(flags, "mode"), supersedesRunId: one(flags, "supersedes-run-id", null),
      ...clean({ runId: one(flags, "run-id") }), ...await author() };
  } else if (command === "consumer-run-receive") {
    action = "consumer.run.receive"; fields = { ...run(), content: await content(), ...await author() };
  } else if (command === "consumer-run-review") {
    action = "consumer.run.review"; fields = { ...project(), ...run(), decision: required(flags, "decision"),
      exceptions: flags.exceptions === undefined ? [] : await readJson(required(flags, "exceptions"), 4 * 1024 * 1024), ...await author() };
  } else if (command === "consumer-return-apply") {
    action = "consumer.return.apply"; fields = { ...await returned(), ...run(), ...await author() };
  } else if (command === "consumer-report" || command === "consumer-return") {
    action = "delivery.prepare";
    if (command === "consumer-report") {
      const format = one(flags, "format", "json");
      if (!["json", "csv", "html"].includes(format)) throw new Error("Choose json, csv or html for the complete consumer report.");
      fields = { kind: "consumer-report", consumerProjectId: required(flags, "project-id"), format };
    } else fields = { kind: "consumer-return", consumerRunId: required(flags, "run-id") };
  } else throw new Error("Choose a declared consumer command.");
  const result = await performMutation(target, action, fields, flags);
  return action === "delivery.prepare" ? deliveryToFile(target, result, flags) : output(result, flags);
}
