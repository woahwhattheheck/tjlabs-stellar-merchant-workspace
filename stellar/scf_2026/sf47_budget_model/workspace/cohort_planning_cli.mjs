#!/usr/bin/env node
/**
 * Local file interface to cohort_planning.mjs. No network or provider actions.
 */
import { readFile, stat, open, link, unlink } from "node:fs/promises";
import { resolve, dirname, basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  COHORT_PLAN_SCHEMA, COHORT_PLAN_REPORT_SCHEMA, CohortPlanningError,
  seedCohortPlan, evaluateCohortPlan, exportCohortPlanCsv
} from "./cohort_planning.mjs";

const EDITION_SCHEMA = "stellar-forge.sf47-cohort-plan-edition.v1";
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const HELP = [
  "Cohort planning — original-case calendar and economics",
  "",
  "Usage:",
  "  node cohort_planning_cli.mjs seed --native-seed seed.json [options]",
  "  node cohort_planning_cli.mjs evaluate --input plan.json [--native-seed seed.json] [--output report.json]",
  "  node cohort_planning_cli.mjs csv --input report.json [--output report.csv]",
  "",
  "Seed options:",
  "  --as-of ISO_TIMESTAMP       Explicit observation time; defaults to native seed time.",
  "  --window-start YYYY-MM-DD  Start of the original consecutive calendar window.",
  "  --draft-id ID              Stable draft identity; default derives from source and seed time.",
  "  --plan-id ID               Original case plan identity when supplied by Grant Operations.",
  "  --plan-revision INTEGER    Original case plan revision.",
  "  --name TEXT               Customer-facing plan title.",
  "  --output FILE             Create a new output file; omit or use - for stdout.",
  "",
  "evaluate accepts a plan, complete planning report, or saved planning edition.",
  "csv accepts a complete planning report or saved planning edition.",
  "Use --input - to read JSON from stdin. A native seed must be a separate file.",
  "Files are created atomically and existing destinations are preserved.",
  "All amounts and hours in plan JSON use decimal text; atomic prices use integer text.",
  "capacityPools and schedule capacityPoolId compare shared daily active hours with recurring demand.",
  "sensitivity.minimumMarginPct optionally calculates complete-service price floors.",
  "Complete reports and CSV retain capacity, shortages, price groups and original source assumptions.",
  "The planner retains its source and rule. A supplied current seed adds a drift comparison.",
  ""
].join("\n");

function fail(code, message, path = "") { throw new CohortPlanningError(code, message, path); }

function parse(argv) {
  if (!argv.length || argv.includes("--help") || argv[0] === "help") return { command: "help", options: {} };
  const command = argv[0], options = {};
  const allowed = {
    seed: ["native-seed", "as-of", "window-start", "draft-id", "plan-id", "plan-revision", "name", "output"],
    evaluate: ["input", "native-seed", "output"],
    csv: ["input", "output"]
  }[command];
  if (!allowed) fail("INVALID_COMMAND", "Choose seed, evaluate or csv.", "command");
  for (let i = 1; i < argv.length; i += 2) {
    const flag = argv[i], key = flag.startsWith("--") ? flag.slice(2) : "";
    if (!allowed.includes(key)) fail("INVALID_ARGUMENT", "Unsupported argument " + flag + ".", "arguments");
    if (Object.prototype.hasOwnProperty.call(options, key)) fail("INVALID_ARGUMENT", "Repeated argument " + flag + ".", "arguments");
    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) fail("INVALID_ARGUMENT", flag + " requires one value.", flag);
    options[key] = argv[i + 1];
  }
  const required = command === "seed" ? "native-seed" : "input";
  if (!options[required]) fail("INVALID_ARGUMENT", "--" + required + " is required.", required);
  if (options["native-seed"] === "-") fail("INVALID_ARGUMENT", "Use a separate file for the native seed.", "native-seed");
  return { command, options };
}

async function readJson(filename) {
  let body;
  if (filename === "-") {
    const chunks = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_INPUT_BYTES) fail("INPUT_TOO_LARGE", "JSON input exceeds 64 MiB.", "input");
      chunks.push(buffer);
    }
    body = Buffer.concat(chunks).toString("utf8");
  } else {
    const info = await stat(filename);
    if (!info.isFile()) fail("INVALID_INPUT", "JSON input must be a regular file.", filename);
    if (info.size > MAX_INPUT_BYTES) fail("INPUT_TOO_LARGE", "JSON input exceeds 64 MiB.", filename);
    body = await readFile(filename, "utf8");
    if (Buffer.byteLength(body, "utf8") > MAX_INPUT_BYTES) fail("INPUT_TOO_LARGE", "JSON input exceeds 64 MiB.", filename);
  }
  try { return JSON.parse(body.replace(/^\uFEFF/, "")); }
  catch { fail("INVALID_JSON", "Input must contain one complete JSON document.", filename); }
}

function planFrom(value) {
  if (value?.schema === COHORT_PLAN_SCHEMA) return value;
  if (value?.schema === COHORT_PLAN_REPORT_SCHEMA && value.kind === "PLAN") return value.input;
  if (value?.schema === EDITION_SCHEMA) return value.plan;
  fail("INVALID_PLAN_SCHEMA", "Select a cohort plan, complete planning report or saved planning edition.", "input");
}

function reportFrom(value) {
  if (value?.schema === COHORT_PLAN_REPORT_SCHEMA && value.kind === "PLAN") return value;
  if (value?.schema === EDITION_SCHEMA && value.report?.schema === COHORT_PLAN_REPORT_SCHEMA) return value.report;
  fail("INVALID_PLAN_REPORT", "Select a complete planning report or saved planning edition.", "input");
}

async function output(body, filename) {
  if (!filename || filename === "-") {
    await new Promise((done, reject) => process.stdout.write(body, error => error ? reject(error) : done()));
    return;
  }
  const destination = resolve(filename);
  const temporary = join(dirname(destination), "." + basename(destination) + "." + randomUUID() + ".tmp");
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(body, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(temporary, destination);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
  process.stdout.write(JSON.stringify({ saved: destination, bytes: Buffer.byteLength(body, "utf8") }) + "\n");
}

async function main(argv) {
  const { command, options } = parse(argv);
  if (command === "help") { process.stdout.write(HELP); return; }
  let result;
  if (command === "seed") {
    const nativeSeed = await readJson(options["native-seed"]);
    const settings = {};
    for (const [flag, key] of [
      ["as-of", "asOfAt"], ["window-start", "windowStart"], ["draft-id", "draftId"],
      ["plan-id", "planId"], ["name", "name"]
    ]) if (options[flag] !== undefined) settings[key] = options[flag];
    if (options["plan-revision"] !== undefined) {
      if (!/^[1-9]\d*$/.test(options["plan-revision"])) fail("INVALID_ARGUMENT", "Plan revision must be a positive integer.", "plan-revision");
      settings.planRevision = Number(options["plan-revision"]);
      if (!Number.isSafeInteger(settings.planRevision)) fail("INVALID_ARGUMENT", "Plan revision exceeds the supported integer range.", "plan-revision");
    }
    result = seedCohortPlan(nativeSeed, settings);
  } else if (command === "evaluate") {
    const input = planFrom(await readJson(options.input));
    const nativeSeed = options["native-seed"] ? await readJson(options["native-seed"]) : undefined;
    result = evaluateCohortPlan(input, { nativeSeed });
  } else {
    result = exportCohortPlanCsv(reportFrom(await readJson(options.input)));
  }
  await output(typeof result === "string" ? result : JSON.stringify(result, null, 2) + "\n", options.output);
}

main(process.argv.slice(2)).catch(error => {
  const code = error.code === "EEXIST" ? "OUTPUT_EXISTS" : error.code || "COHORT_PLAN_FAILED";
  const message = error.code === "EEXIST" ? "The output file already exists. Choose a new edition filename." : error.message;
  process.stderr.write(JSON.stringify({ error: { code, message, path: error.path || "" } }) + "\n");
  process.exitCode = 1;
});
