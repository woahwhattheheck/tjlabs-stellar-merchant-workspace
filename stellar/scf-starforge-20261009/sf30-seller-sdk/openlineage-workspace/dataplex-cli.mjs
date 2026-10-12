#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleLineageDelivery, prepareGoogleDelivery, receiveGooglePackage, verifyGooglePackage, googleAccessToken, recoverGoogleWriter } from "./dataplex.mjs";

const HELP = [
  "OpenLineage — Google catalog delivery",
  "",
  "  openlineage-google prepare --directory DIR --input WORKSPACE.json --project PROJECT --location LOCATION --edition ID [--quota-project PROJECT] [--expected-fqns FILE] [--title TITLE]",
  "  openlineage-google status --directory DIR",
  "  openlineage-google report --directory DIR --out NEW.html",
  "  openlineage-google approve --directory DIR --plan-sha256 SHA256 --operator NAME [--events FILE.json]",
  "  openlineage-google publish --directory DIR [--gcloud EXECUTABLE] [--timeout-ms N]",
  "  openlineage-google reconcile --directory DIR [--gcloud EXECUTABLE] [--timeout-ms N]",
  "  openlineage-google export --directory DIR --out NEW.json",
  "  openlineage-google verify --input PACKAGE.json",
  "  openlineage-google receive --input PACKAGE.json --out NEW_DIRECTORY",
  "  openlineage-google recover-lock --directory DIR --id ORIGINAL_LOCK_ID",
  "",
  "Prepare from a complete original OpenLineage workspace and saved edition.",
  "Review the Google destination, original event bodies and expected table assets;",
  "approve the exact plan before publishing. Original request UUIDs survive retry,",
  "restart and complete receiving. Credentials come from the current host.",
  "See DATAPLEX.md for source mapping, Google permissions and full operator handover."
].join("\n");
function parse(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) throw new Error("Unexpected argument: " + argv[i]);
    const key = argv[i].slice(2);
    if (Object.hasOwn(result, key)) throw new Error("Repeated option: " + key);
    if (i + 1 >= argv.length || argv[i+1].startsWith("--")) throw new Error("Missing value: " + key);
    result[key] = argv[++i];
  }
  return result;
}
function check(options, allowed) { for (const key of Object.keys(options)) if (!allowed.includes(key)) throw new Error("Unknown option: " + key); }
function need(value, label) { if (!value) throw new Error(label + " is required"); return value; }
const read = path => fs.readFile(resolve(need(path, "input")));
const readJSON = async path => JSON.parse((await read(path)).toString("utf8"));
const print = value => console.log(JSON.stringify(value, null, 2));
function timeout(options) {
  const value = options["timeout-ms"] === undefined ? 60000 : Number(options["timeout-ms"]);
  if (!Number.isSafeInteger(value) || value < 1000 || value > 60000) throw new Error("timeout-ms must be between 1000 and 60000");
  return value;
}
export async function main(argv = process.argv.slice(2)) {
  const args = [...argv], command = args.shift();
  if (!command || ["help","--help","-h"].includes(command)) { console.log(HELP); return 0; }
  const options = parse(args);
  if (command === "verify") {
    check(options, ["input"]);
    const result = verifyGooglePackage(await read(options.input));
    print({ operationId: result.plan.operationId, workspaceId: result.plan.workspaceId, packageSha256: result.packageSha256, applicationFiles: result.files.size });
    return 0;
  }
  if (command === "receive") {
    check(options, ["input","out"]);
    print(await receiveGooglePackage(await read(options.input), need(options.out, "out")));
    return 0;
  }
  const directory = need(options.directory, "directory");
  if (command === "prepare") {
    check(options, ["directory","input","project","location","quota-project","edition","expected-fqns","title"]);
    print(await prepareGoogleDelivery({ directory, sourceBytes: await read(options.input),
      project: need(options.project,"project"), location: need(options.location,"location"), quotaProject: options["quota-project"], editionId: need(options.edition,"edition"),
      expectedFqns: options["expected-fqns"] ? await readJSON(options["expected-fqns"]) : [], title: options.title }));
    return 0;
  }
  if (command === "recover-lock") {
    check(options, ["directory","id"]);
    print(await recoverGoogleWriter(directory, need(options.id,"id"))); return 0;
  }
  const delivery = new GoogleLineageDelivery(directory);
  if (command === "status") { check(options, ["directory"]); print(await delivery.status()); return 0; }
  if (command === "report") { check(options, ["directory","out"]); print(await delivery.writeReport(need(options.out,"out"))); return 0; }
  if (command === "approve") {
    check(options, ["directory","plan-sha256","operator","events"]);
    print(await delivery.approve({ planSha256: need(options["plan-sha256"],"plan-sha256"), operator: need(options.operator,"operator"),
      eventIds: options.events ? await readJSON(options.events) : null })); return 0;
  }
  if (command === "publish" || command === "reconcile") {
    check(options, ["directory","gcloud","timeout-ms"]);
    const result = await delivery[command]({ accessToken: () => googleAccessToken({ gcloud: options.gcloud ?? "gcloud" }), timeoutMs: timeout(options) });
    print(result);
    const entries = result.journal.approval.eventIds.map(id => result.journal.events[id]);
    const completed = command === "publish" ? entries.every(row => row?.state === "CONFIRMED") : entries.every(row => row?.receiving?.state === "RECEIVED");
    return completed ? 0 : 2;
  }
  if (command === "export") { check(options, ["directory","out"]); print(await delivery.exportPackage(need(options.out,"out"))); return 0; }
  throw new Error("Unknown Google delivery command: " + command);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(JSON.stringify({ error: error.message, code: error.code ?? null })); process.exitCode = 1; });
}
