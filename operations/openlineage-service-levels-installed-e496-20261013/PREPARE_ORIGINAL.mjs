#!/usr/bin/env node
// MIT. Recover the original complete Service Levels input without replaying its business operations.
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const OPERATION = "SCF-OPENLINEAGE-SERVICE-LEVELS-BBBD-20261012";
const WORKSPACE = "74c371a0-9689-41d4-bcf2-3f0f57f5bebe";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const git = bytes => createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
const text = value => JSON.stringify(value, null, 2) + "\n";
async function exact(path, bytes) {
  const body = Buffer.from(bytes); await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try { await fs.writeFile(path, body, { mode: 0o600, flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; assert.ok(body.equals(await fs.readFile(path)), "Keep original bytes: " + path); }
}
async function child(executable, args) {
  return new Promise((done, reject) => {
    const process = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] }); let out = "", err = "";
    process.stdout.on("data", b => out += b); process.stderr.on("data", b => err += b);
    process.once("error", reject); process.once("close", code => code === 0 ? done(out) : reject(new Error("Original checkpoint receiving failed: " + err)));
  });
}
export async function prepareOriginal({ sourcePacketFile, sourcePacketSha256, checkpointFile, directory, pythonExecutable = "python3" }) {
  const packetBytes = await fs.readFile(resolve(sourcePacketFile)), envelopeBytes = await fs.readFile(resolve(checkpointFile));
  assert.match(sourcePacketSha256, /^[a-f0-9]{64}$/); assert.equal(sha(packetBytes), sourcePacketSha256);
  const packet = JSON.parse(packetBytes), envelope = JSON.parse(envelopeBytes);
  const checkpoint = envelope.original?.checkpoint ?? envelope;
  assert.equal(packet.schema, "commons.openlineage.service-level-native-delivery.v1"); assert.equal(packet.operation, OPERATION);
  assert.equal(packet.applicationVersion, 4); assert.equal(packet.applicationFiles, 66); assert.equal(packet.files.length, 67);
  assert.equal(checkpoint.schema, "commons.openlineage.original-service-checkpoint.v1");
  assert.equal(checkpoint.workspaceId, WORKSPACE); assert.equal(checkpoint.revision, 13); assert.equal(checkpoint.archiveRoot, "operation");
  const compressed = Buffer.from(checkpoint.contentBase64, "base64");
  assert.equal(compressed.length, checkpoint.compressedBytes); assert.equal(git(compressed), checkpoint.gitBlobSha);
  assert.equal(checkpoint.gitBlobSha, "084ca03d8cf7fc42fa8132d2d84b02bc911eead4");
  const root = resolve(directory); await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const lock = join(root, "preparing.lock"); let handle;
  try { handle = await fs.open(lock, "wx", 0o600); }
  catch (error) { if (error.code === "EEXIST") throw new Error("The original preparation is active or has a retained lock. Reconcile its recorded PID before resuming."); throw error; }
  await handle.writeFile(text({ id: randomUUID(), pid: process.pid, createdAt: new Date().toISOString() }));
  try {
    const binding = { operationId: OPERATION, workspaceId: WORKSPACE, sourcePacketSha256, checkpointGitBlob: checkpoint.gitBlobSha };
    await exact(join(root, "input-binding.json"), text(binding));
    await exact(join(root, "original-source-packet.json"), packetBytes);
    await exact(join(root, "original-checkpoint-envelope.json"), envelopeBytes);
    await exact(join(root, "original-engine-checkpoint.tar.gz"), compressed);
    const source = join(root, "source"), names = new Set();
    for (const member of packet.files) {
      assert.equal(typeof member.path, "string");
      assert.ok(member.path && !member.path.includes("/") && !member.path.includes("\\") && ![".",".."].includes(member.path) && !names.has(member.path));
      names.add(member.path); const bytes = Buffer.from(member.contentBase64, "base64");
      assert.equal(bytes.length, member.bytes); assert.equal(git(bytes), member.gitBlobSha);
      await exact(join(source, member.path), bytes);
    }
    const python = [
      "import io,json,pathlib,sys,tarfile,hashlib,os",
      "root=pathlib.Path(sys.argv[1]); envelope=json.loads((root/'original-checkpoint-envelope.json').read_text())",
      "c=envelope.get('original',{}).get('checkpoint',envelope); expected={x['path']:x for x in c['files']}; found={}",
      "with tarfile.open(root/'original-engine-checkpoint.tar.gz','r:gz') as source:",
      " for m in source.getmembers():",
      "  p=pathlib.PurePosixPath(m.name)",
      "  if m.isdir():",
      "   if p.is_absolute() or '..' in p.parts or p.parts[0]!='operation':raise ValueError('Unsafe original directory')",
      "   continue",
      "  if not m.isfile() or m.name not in expected or m.name in found or p.is_absolute() or '..' in p.parts:raise ValueError('Unexpected original checkpoint member')",
      "  data=source.extractfile(m).read(); row=expected[m.name]",
      "  if len(data)!=row['bytes']:raise ValueError('Original checkpoint length differs')",
      "  dest=root.joinpath(*p.parts); dest.parent.mkdir(parents=True,exist_ok=True,mode=0o700)",
      "  if dest.exists():",
      "   if dest.is_symlink() or not dest.is_file() or dest.read_bytes()!=data:raise ValueError('Retained original checkpoint differs')",
      "  else:",
      "   with open(dest,'xb') as out:out.write(data)",
      "   os.chmod(dest,0o600)",
      "  found[m.name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}",
      "if set(found)!=set(expected):raise ValueError('Original checkpoint is incomplete')",
      "print(json.dumps({'files':found},sort_keys=True))"
    ].join("\n");
    const extracted = JSON.parse(await child(pythonExecutable, ["-c", python, root]));
    const { LineageWorkspace, verifyBundle, APPLICATION_VERSION, APPLICATION_FILES } = await import(pathToFileURL(join(source, "store.mjs")).href);
    assert.equal(APPLICATION_VERSION, 4); assert.equal(APPLICATION_FILES.length, 66);
    const workspaceDirectory = join(root, "operation", "workspace");
    await fs.mkdir(join(workspaceDirectory, "exports"), { recursive: true, mode: 0o700 });
    const before = await fs.readFile(join(workspaceDirectory, "workspace.json"));
    const workspace = new LineageWorkspace(workspaceDirectory), state = await workspace.read();
    assert.equal(state.workspaceId, WORKSPACE); assert.equal(state.revision, 13); assert.equal(state.operations.length, 13);
    assert.equal(state.serviceLevels.assessments.length, 4); assert.equal(state.serviceLevels.incidents[0].status, "resolved");
    const record = await workspace.exportBundle({ includeApplication: true });
    const bytes = await fs.readFile(join(workspaceDirectory, "exports", record.id + ".json"));
    assert.equal(sha(bytes), record.id); const checked = verifyBundle(bytes);
    assert.equal(checked.application.size, 66); assert.deepEqual(checked.state, state);
    assert.ok(before.equals(await fs.readFile(join(workspaceDirectory, "workspace.json"))), "Export must preserve original stored state bytes.");
    const exported = join(root, "original-service-levels-workspace.json"); await exact(exported, bytes);
    const result = { schema: "commons.openlineage.original-service-prepared.v1", operationId: OPERATION,
      workspaceId: WORKSPACE, revision: 13, originalOperationIds: state.operations.map(x => x.id),
      originalStateSha256: sha(before), originalObjects: [...checked.objects.keys()].sort(),
      sourcePacketFile: join(root, "original-source-packet.json"), sourcePacketSha256, checkpoint: extracted,
      originalService: { workspaceFile: exported, sha256: record.id, sourcePacketFile: join(root, "original-source-packet.json"), sourcePacketSha256 } };
    await exact(join(root, "ORIGINAL_SERVICE_PREPARED.json"), text(result)); return result;
  } finally { await handle.close(); await fs.unlink(lock); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sourcePacketFile, sourcePacketSha256, checkpointFile, directory, pythonExecutable] = process.argv.slice(2);
  if (!directory) throw new Error("Use ORIGINAL_SOURCE_PACKET SHA256 CHECKPOINT_ENVELOPE NEW_PREPARATION_DIRECTORY [PYTHON]");
  prepareOriginal({ sourcePacketFile, sourcePacketSha256, checkpointFile, directory, pythonExecutable })
    .then(value => process.stdout.write(text(value))).catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
}
