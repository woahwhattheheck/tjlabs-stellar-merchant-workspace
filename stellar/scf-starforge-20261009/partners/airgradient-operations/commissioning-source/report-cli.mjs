#!/usr/bin/env node
/**
 * Build, receive and reopen a complete selected-source report collection.
 * Uses only Node built-ins and the adjacent reports.mjs implementation.
 */
import * as fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {compileSourceReports, safeRelativePath} from "./reports.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROGRAM_FILES = ["reports.mjs", "report-cli.mjs", "OPERATOR.md"];
const hashText = text => ({bytes: Buffer.byteLength(text, "utf8"),
  sha256: createHash("sha256").update(text, "utf8").digest("hex")});

function options(argv) {
  const [command, ...args] = argv;
  if (!["build", "verify", "receive"].includes(command)) {
    throw new Error("Usage: node report-cli.mjs build --out DIR [--source PACKET] | verify --directory DIR | receive --from DIR --out DIR");
  }
  const result = {command};
  const allowed = command === "build" ? ["out", "source"] : command === "verify" ? ["directory"] : ["from", "out"];
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!/^--[a-z]+$/.test(flag) || !allowed.includes(flag.slice(2))
        || index + 1 >= args.length || args[index + 1].startsWith("--") || result[flag.slice(2)]) {
      throw new Error("Unknown, repeated or incomplete argument: " + flag);
    }
    result[flag.slice(2)] = args[index + 1];
  }
  if (command === "build" && !result.out || command === "verify" && !result.directory
      || command === "receive" && (!result.from || !result.out)) throw new Error("Missing required directory argument");
  return result;
}

async function checkedRead(root, relative) {
  safeRelativePath(relative);
  const absoluteRoot = path.resolve(root);
  const rootStat = await fs.lstat(absoluteRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Receiving root must be a physical directory: " + absoluteRoot);
  const parts = relative.split("/");
  let current = absoluteRoot;
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
      throw new Error("Receiving member is not a physical regular file: " + relative);
    }
  }
  return fs.readFile(current, "utf8");
}

async function makeBundle(sourceText) {
  const compiled = compileSourceReports(sourceText, hashText);
  const files = {"input/source-packet.json": sourceText, ...compiled.outputs};
  for (const file of compiled.input.packet.files) files["source/" + file.path] = file.content;
  for (const file of PROGRAM_FILES) files[file] = await checkedRead(HERE, file);
  const manifest = {schema: "airgradient.complete-report-receiving.v1",
    source_packet: compiled.input.binding, operation_id: compiled.input.packet.operation_id,
    files: Object.keys(files).sort().map(name => ({path: name, ...hashText(files[name])}))};
  files["delivery.json"] = JSON.stringify(manifest, null, 2) + "\n";
  return {files, manifest, compiled};
}

async function verifyBundle(directory, expected = null) {
  const sourceText = await checkedRead(directory, "input/source-packet.json");
  const bundle = expected || await makeBundle(sourceText);
  if (hashText(sourceText).sha256 !== bundle.manifest.source_packet.sha256) {
    throw new Error("Destination contains a different original source packet");
  }
  const manifestText = await checkedRead(directory, "delivery.json");
  if (manifestText !== bundle.files["delivery.json"]) throw new Error("Receiving manifest differs from the complete source-derived collection");
  for (const [relative, content] of Object.entries(bundle.files)) {
    if (await checkedRead(directory, relative) !== content) throw new Error("Receiving member differs: " + relative);
  }
  return bundle;
}

async function ensureDirectory(root, relative = "") {
  const absolute = path.resolve(root);
  await fs.mkdir(absolute, {recursive: true, mode: 0o700});
  if (!(await fs.lstat(absolute)).isDirectory() || (await fs.lstat(absolute)).isSymbolicLink()) {
    throw new Error("Output root must be a physical directory");
  }
  let current = absolute;
  for (const part of relative ? relative.split("/") : []) {
    current = path.join(current, part);
    await fs.mkdir(current, {mode: 0o700}).catch(error => { if (error.code !== "EEXIST") throw error; });
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Output member parent is not a physical directory");
  }
  return current;
}

async function writeBundle(bundle, directory) {
  const root = await ensureDirectory(directory);
  // Preflight existing selected members before writing anything. Matching partial
  // exports can resume; a different existing body is never replaced.
  for (const [relative, content] of Object.entries(bundle.files)) {
    try {
      if (await checkedRead(root, relative) !== content) throw new Error("Existing output differs; choose a new directory: " + relative);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const staging = await fs.mkdtemp(path.join(path.dirname(root), ".airgradient-report-stage-"));
  try {
    let index = 0;
    // delivery.json is inserted last and therefore appears only after all members.
    for (const [relative, content] of Object.entries(bundle.files)) {
      safeRelativePath(relative);
      const parent = path.posix.dirname(relative);
      if (parent !== ".") await ensureDirectory(root, parent);
      const staged = path.join(staging, String(index++));
      const handle = await fs.open(staged, "wx", 0o600);
      try { await handle.writeFile(content, "utf8"); await handle.sync(); } finally { await handle.close(); }
      const destination = path.join(root, ...relative.split("/"));
      try {
        // Hard-link creation is atomic and refuses an existing destination.
        await fs.link(staged, destination);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (await checkedRead(root, relative) !== content) throw new Error("Output changed during receiving: " + relative);
      }
      await fs.unlink(staged);
    }
  } finally {
    await fs.rm(staging, {recursive: true, force: true});
  }
  await verifyBundle(root, bundle);
  return root;
}

async function main() {
  const args = options(process.argv.slice(2));
  let bundle, directory;
  if (args.command === "build") {
    const sourcePath = path.resolve(args.source || path.join(HERE, "input/source-packet.json"));
    bundle = await makeBundle(await fs.readFile(sourcePath, "utf8"));
    directory = await writeBundle(bundle, args.out);
  } else if (args.command === "verify") {
    bundle = await verifyBundle(args.directory);
    directory = path.resolve(args.directory);
  } else {
    bundle = await verifyBundle(args.from);
    directory = await writeBundle(bundle, args.out);
  }
  process.stdout.write(JSON.stringify({schema: "airgradient.report-command-result.v1",
    command: args.command, directory, members: Object.keys(bundle.files).length,
    source_packet: bundle.manifest.source_packet, operation_id: bundle.manifest.operation_id,
    periods: bundle.compiled.periods.map(report => ({...report.period, ...report.totals})),
    operator_report: path.join(directory, "reports", "operator-report.html"),
    receiving: "Every original source member, complete generated export and program member was reopened and matched."
  }, null, 2) + "\n");
}

main().catch(error => {
  process.stderr.write("AirGradient reporting: " + error.message + "\n");
  process.exitCode = 1;
});
