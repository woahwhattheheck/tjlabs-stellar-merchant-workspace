#!/usr/bin/env python3
"""Receive and run the original complete NEED county-report operation.
Python standard library only. The original source, production and browser
programme can be followed by the complete paid Merchant/Customer continuation
against the same retained native project and configured testnet installation.
"""
import argparse, datetime, fcntl, hashlib, json, os, pathlib, re, shutil
import signal, stat, subprocess, sys, tempfile, uuid, zipfile

OPERATION = "NEED-REGIONAL-REPORTS-9B2C-20261012"
SCHEMA = "stellar-forge.qcew-native-source-packet.v1"
PREFIX = "stellar/scf-starforge-20261009/sf30-seller-sdk"
SEED_SHA = "a9cdafc2b51bd8571149ef7abd3d628f88713a5195c7a5099111393e012f21b9"

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
def git_blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()
def check(value, message):
    if not value:
        raise ValueError(message)
def private_directory(path):
    path = pathlib.Path(path).absolute()
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    check(stat.S_ISDIR(info.st_mode) and not path.is_symlink(), "Use an ordinary private operation directory: " + str(path))
    check(info.st_uid == os.getuid() and info.st_mode & 0o077 == 0, "Use an owned private operation directory: " + str(path))
    return path
def read_regular(path):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        check(stat.S_ISREG(os.fstat(stream.fileno()).st_mode), "Use a complete ordinary file: " + str(path))
        return stream.read()
def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
def atomic_json(path, value):
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    descriptor, temporary = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
def retain_exact(path, raw):
    if path.exists():
        check(read_regular(path) == raw, "Retained operation bytes differ: " + str(path))
        return
    descriptor, temporary = tempfile.mkstemp(prefix=".retain-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            check(read_regular(path) == raw, "Retained operation bytes differ: " + str(path))
        sync_directory(path.parent)
    finally:
        os.unlink(temporary)

def read_packet(path, expected):
    raw = read_regular(path)
    check(sha(raw) == expected, "Complete source packet SHA256 differs from the published handoff.")
    packet = json.loads(raw.decode("utf-8"))
    check(packet.get("schema") == SCHEMA and packet.get("operation") == OPERATION, "Use this original county-report source packet.")
    names, total = set(), 0
    for file in packet["files"]:
        name = file["path"]
        parts = pathlib.PurePosixPath(name).parts
        check(isinstance(name, str) and name and not name.startswith("/") and "\\" not in name and
              name == "/".join(parts) and all(part not in ("", ".", "..") for part in parts),
              "Source packet contains a noncanonical relative path.")
        check(name not in names, "Source packet repeats a source path.")
        names.add(name)
        body = file["content"].encode("utf-8")
        check(len(body) == file["bytes"] and sha(body) == file["sha256"] and git_blob(body) == file["gitSha1"],
              "Complete source bytes differ: " + name)
        total += len(body)
    check(len(names) == packet["source"]["files"] and total == packet["source"]["bytes"], "Complete source inventory differs.")
    return packet, raw

def materialize(root, packet):
    source = root / "source"
    if not source.exists():
        stage = root / ("source-stage-" + str(uuid.uuid4()))
        stage.mkdir(mode=0o700)
        for file in packet["files"]:
            path = stage / file["path"]
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with open(path, "xb") as stream:
                os.fchmod(stream.fileno(), 0o600)
                stream.write(file["content"].encode("utf-8"))
                stream.flush()
                os.fsync(stream.fileno())
        os.rename(stage, source)
        sync_directory(root)
    check(not source.is_symlink(), "The retained source directory changed.")
    names = set()
    for directory, dirs, files in os.walk(source, followlinks=False):
        check(all(not (pathlib.Path(directory) / item).is_symlink() for item in dirs), "Source directories must remain ordinary directories.")
        for name in files:
            names.add((pathlib.Path(directory) / name).relative_to(source).as_posix())
    check(names == {file["path"] for file in packet["files"]}, "The retained source file inventory changed.")
    for file in packet["files"]:
        raw = read_regular(source / file["path"])
        check(len(raw) == file["bytes"] and sha(raw) == file["sha256"] and git_blob(raw) == file["gitSha1"],
              "The retained source bytes changed: " + file["path"])
    return source

def run_stage(name, command, root, lock, state, environment):
    started = now()
    entry = {"name": name, "startedAt": started, "command": command, "status": "running"}
    state["stages"].append(entry)
    atomic_json(root / "run.json", state)
    emit({"event": "qcew_native_stage_start", **entry})
    log_path = root / "logs" / (str(len(state["stages"])).zfill(3) + "-" + name + ".log")
    with open(log_path, "xb") as log:
        os.fchmod(log.fileno(), 0o600)
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            env=environment, start_new_session=True, pass_fds=(lock.fileno(),))
        entry["pid"] = process.pid
        atomic_json(root / "run.json", state)
        try:
            while True:
                block = process.stdout.read1(65536)
                if not block:
                    break
                log.write(block)
                log.flush()
                sys.stdout.buffer.write(block)
                sys.stdout.buffer.flush()
            code = process.wait()
        except BaseException:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
            raise
        finally:
            process.stdout.close()
            log.flush()
            os.fsync(log.fileno())
    entry.update({"completedAt": now(), "exitCode": code, "status": "completed" if code == 0 else "interrupted",
                  "log": str(log_path)})
    atomic_json(root / "run.json", state)
    check(code == 0, "Original " + name + " programme exited " + str(code) + "; its full output and retained workspace are preserved.")

def under(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False

def preserve_archive(root, intake, archive_directory):
    destination = private_directory(archive_directory) / ("needecon-qcew-native-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8] + ".zip")
    check(not under(destination, root) and not under(destination, intake), "Save the complete archive outside the original working directories.")
    roots = [(root, "operation")]
    if not under(intake, root):
        roots.append((intake, "original-intake"))
    records = []
    with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        os.chmod(destination, 0o600)
        for source_root, prefix in roots:
            if not source_root.exists():
                continue
            for directory, dirs, files in os.walk(source_root, followlinks=False):
                dirs.sort()
                check(all(not (pathlib.Path(directory) / item).is_symlink() for item in dirs), "An output directory is a symlink.")
                for name in sorted(files):
                    source = pathlib.Path(directory) / name
                    relative = prefix + "/" + source.relative_to(source_root).as_posix()
                    with os.fdopen(os.open(source, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
                        info = os.fstat(stream.fileno())
                        check(stat.S_ISREG(info.st_mode), "An output is not an ordinary file: " + str(source))
                        checksum, length = hashlib.sha256(), 0
                        with archive.open(relative, "w", force_zip64=True) as output:
                            while True:
                                block = stream.read(1024 * 1024)
                                if not block:
                                    break
                                checksum.update(block)
                                length += len(block)
                                output.write(block)
                        check(length == info.st_size, "An output changed while preserving the complete original archive.")
                        records.append({"path": relative, "bytes": length, "sha256": checksum.hexdigest()})
        archive.writestr("archive-manifest.json", json.dumps({"schema": "stellar-forge.qcew-native-archive.v1",
            "operation": OPERATION, "createdAt": now(), "files": records}, ensure_ascii=False, indent=2) + "\n")
    descriptor = os.open(destination, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    sync_directory(destination.parent)
    length = destination.stat().st_size
    digest256 = hashlib.sha256()
    digest_git = hashlib.sha1(b"blob " + str(length).encode("ascii") + b"\0")
    with open(destination, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest256.update(block)
            digest_git.update(block)
    return {"path": str(destination), "bytes": length, "sha256": digest256.hexdigest(),
            "gitSha1": digest_git.hexdigest(), "files": len(records) + 1}

NATIVE_HOST_SOURCE = r"""// MIT. Continue the complete NEED county programme on its existing funded native host.
import { readFile, realpath, lstat } from 'node:fs/promises';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, X509Certificate } from 'node:crypto';
import { createServer as httpServer, request as httpRequest } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { connect as netConnect, createServer as netServer } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

const OPERATION = 'NEED-REGIONAL-REPORTS-9B2C-20261012';
const PAYMENT = Object.freeze({ scheme: 'exact', network: 'stellar:testnet',
  asset: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  payTo: 'GBB37T6QFXSFLVG7FHVVOQOK4YHE4T7ISG3ITPDRS3XNNY6JBWRIYOGC',
  amount: '10000', maxTimeoutSeconds: 600 });
const EXPECTED_ORIGIN = 'https://merchant.routescan39da.scf.test';
const EXPECTED_RPC = 'https://soroban-testnet.stellar.org';
const check = (ok, message, code = 'QCEW_NATIVE_HOST_INPUT_REQUIRED') => {
  if (!ok) throw Object.assign(new Error(message), { code });
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stamp = () => new Date().toISOString();
const log = value => process.stdout.write(JSON.stringify(value) + '\n');
const portNumber = value => Number.isInteger(value) && value > 0 && value <= 65535;
function argumentsFor(args) {
  const result = {}, allowed = new Set(['source', 'directory', 'original', 'ca',
    'chromium', 'playwright-module', 'path', 'accept-index']);
  for (let index = 0; index < args.length; index++) {
    check(/^--[a-z-]+$/.test(args[index]), 'Use the complete native host programme options.');
    const name = args[index].slice(2);
    check(allowed.has(name) && result[name] === undefined && args[index + 1] &&
      !args[index + 1].startsWith('--'), 'Select each native host option and its value once.');
    result[name] = args[++index];
  }
  for (const name of ['source', 'directory', 'original', 'chromium', 'playwright-module'])
    check(isAbsolute(result[name] ?? ''), 'Select the absolute original host, source, native directory and installed browser paths.');
  if (result.ca !== undefined) check(isAbsolute(result.ca), 'Select the absolute installed certificate authority file.');
  const index = Number(result['accept-index'] ?? 0);
  check(Number.isSafeInteger(index) && index === 0,
    'The existing native host advertises its original single testnet payment alternative.');
  return { ...result, acceptIndex: index, path: result.path ?? '/county-reports' };
}
async function listen(server, port = 0) {
  return new Promise((accept, reject) => {
    const failed = error => { server.removeListener('listening', ready); reject(error); };
    const ready = () => { server.removeListener('error', failed); accept(server.address().port); };
    server.once('error', failed); server.once('listening', ready); server.listen(port, '127.0.0.1');
  });
}
async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((accept, reject) => {
    server.close(error => error ? reject(error) : accept());
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
  });
}
function ordinaryEnvironmentName(value) {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}
function publicProfile(configuration) {
  return Object.fromEntries(['operator', 'signerModule', 'trustedPayer', 'buyerTransport',
    'requestTimeoutMs', 'bodyCaptureTimeoutMs']
    .filter(name => configuration[name] !== undefined).map(name => [name, configuration[name]]));
}
export async function runOriginalNativeHost(options) {
  process.umask(0o077);
  const SOURCE = await realpath(options.source), DIRECTORY = await realpath(options.directory);
  const ORIGINAL = await realpath(options.original), OPERATOR = join(ORIGINAL, 'operator-workspace');
  const originalManifestBytes = await readFile(join(OPERATOR, 'workspace.json'));
  const manifest = JSON.parse(originalManifestBytes);
  check(isAbsolute(manifest.sourceCli ?? ''), 'The original operator workspace must retain its installed native CLI.');
  const ORIGINAL_SOURCE = await realpath(dirname(dirname(manifest.sourceCli)));
  const moduleAt = path => import(pathToFileURL(join(SOURCE, path)).href);
  const originalModuleAt = path => import(pathToFileURL(join(ORIGINAL_SOURCE, path)).href);
  const [
    { privateDirectory, readJson, readBytes, writeJson, writeBytes, jsonBytes, exists },
    { withPrivateLock }, { openWorkspace }, { createNativeFacilitator },
    { startFacilitatorServer }, { runQcewMerchantJourney }
  ] = await Promise.all([
    moduleAt('sf88-operator-buyer-cli/node/store.mjs'),
    moduleAt('sf30-seller-sdk/routescan/quota.mjs'),
    originalModuleAt('sf88-operator-buyer-cli/workspace.mjs'),
    originalModuleAt('native-facilitator/runtime.mjs'),
    originalModuleAt('native-facilitator/server.mjs'),
    moduleAt('sf30-seller-sdk/fred/qcew/merchant-journey.mjs')
  ]);
  const ROOT = await privateDirectory(join(DIRECTORY, 'native-host'));
  const retain = async (name, value) => {
    const file = join(ROOT, name), bytes = jsonBytes(value);
    if (await exists(file)) {
      check((await readBytes(file, Math.max(1048576, bytes.length))).equals(bytes),
        'Continue this original native host with its retained configuration: ' + name,
        'QCEW_NATIVE_HOST_SELECTION_CHANGED');
    } else await writeBytes(file, bytes, { exclusive: true });
  };
  return withPrivateLock(ROOT, 'native-host.lock', async () => {
    const environmentBefore = new Map(), tunnels = new Set(), upstreamRequests = new Set();
    const counters = { merchantConnect: 0, rpcConnect: 0, refusedConnect: 0 };
    const setEnv = (name, value) => {
      check(ordinaryEnvironmentName(name) && typeof value === 'string',
        'Use the original operator environment names and string values.');
      if (!environmentBefore.has(name)) environmentBefore.set(name, process.env[name]);
      process.env[name] = value;
    };
    const restoreEnvironment = () => {
      for (const [name, value] of environmentBefore)
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
    };
    const tracked = socket => {
      tunnels.add(socket); socket.once('close', () => tunnels.delete(socket)); return socket;
    };
    let phase = 'ORIGINAL_HOST_READ', facilitator, facilitatorHttp, tls, proxy, result, failure;
    const progress = async (next, extra = {}) => {
      phase = next;
      const value = { schema: 'stellar-forge.qcew-native-host-progress.v1',
        operation: OPERATION, phase, at: stamp(), ...extra };
      await writeJson(join(ROOT, 'progress.json'), value); log(value);
    };
    try {
      const funding = await readJson(join(ORIGINAL, 'funding-result.json'), 4194304);
      const accounts = await readJson(join(ORIGINAL, 'accounts.public.json'), 65536);
      const active = await openWorkspace(['--dir', OPERATOR], { accounting: true });
      check(funding.state === 'TESTNET_ACCOUNTS_FUNDED' && funding.network === PAYMENT.network &&
        active.manifest.network === PAYMENT.network && active.config.trustedPayer === accounts.buyer,
      'Reopen the original funded testnet operator and its existing Buyer.');
      check(accounts.asset === PAYMENT.asset && accounts.merchant === PAYMENT.payTo,
        'Use this installation’s original public testnet payment selection.');
      const transport = active.config.buyerTransport;
      check(transport?.origin === EXPECTED_ORIGIN && transport.mode === 'explicit-connect' &&
        ordinaryEnvironmentName(transport.proxyEnv), 'Use the existing native merchant CONNECT transport.');
      const origin = transport.origin, merchantHost = new URL(origin).hostname;
      const rpc = new URL(active.manifest.signer.rpcUrl);
      check(rpc.origin === EXPECTED_RPC && rpc.pathname === '/' &&
        !rpc.search && !rpc.hash && !rpc.username && !rpc.password,
      'Use the original Stellar testnet RPC endpoint.');
      const certificateBytes = await readBytes(join(ORIGINAL, 'tls/server.pem'), 1048576);
      const certificate = new X509Certificate(certificateBytes);
      check(certificate.checkHost(merchantHost) !== undefined,
        'The original TLS certificate must cover the selected public merchant host.');
      const selectedCa = await realpath(options.ca ?? join(ORIGINAL, 'tls/extra-ca.pem'));
      check((await lstat(selectedCa)).isFile() && process.env.NODE_EXTRA_CA_CERTS &&
        await realpath(process.env.NODE_EXTRA_CA_CERTS) === selectedCa,
      'Start Node with the selected original NODE_EXTRA_CA_CERTS file so TLS trust is loaded before startup.');
      const facilitatorPolicyBytes = await readBytes(join(ORIGINAL, 'facilitator.json'), 65536);
      const facilitatorPolicy = JSON.parse(facilitatorPolicyBytes);
      check(facilitatorPolicy.network === PAYMENT.network && facilitatorPolicy.rpcUrl === EXPECTED_RPC &&
        facilitatorPolicy.operations?.ownershipDirectory === join(ORIGINAL, 'signer-ownership') &&
        facilitatorPolicy.payments?.maxAtomic === PAYMENT.amount,
      'Reopen the existing native facilitator and signer ownership directory.');
      check(facilitatorPolicy.signers?.length === 1 &&
        facilitatorPolicy.signers[0].address === accounts.fee &&
        ordinaryEnvironmentName(facilitatorPolicy.signers[0].secretEnv) &&
        ordinaryEnvironmentName(active.manifest.signer.secretEnv),
      'Select the original funded Buyer and fee signer environment bindings.');
      const operatorProfile = publicProfile(active.config);
      await retain('host-selection.json', { schema: 'stellar-forge.qcew-native-host-selection.v1',
        operation: OPERATION, nativeDirectory: DIRECTORY, originalHost: ORIGINAL,
        originalSource: ORIGINAL_SOURCE, operatorWorkspace: OPERATOR,
        buyer: accounts.buyer, feePayer: accounts.fee, origin, rpc: rpc.origin,
        path: options.path, payment: PAYMENT, acceptIndex: options.acceptIndex,
        operatorManifestSha256: sha(originalManifestBytes),
        facilitatorPolicySha256: sha(facilitatorPolicyBytes),
        certificateSha256: sha(certificateBytes), caFile: selectedCa,
        caSha256: sha(await readBytes(selectedCa, 4194304)) });
      const buyerConfig = join(ROOT, 'buyer-settings.json'), stateDirectory = join(ROOT, 'buyer-state');
      await privateDirectory(stateDirectory);
      let buyerSettings = { runtimeDirectory: join(SOURCE, 'sf88-operator-buyer-cli'),
        stateDirectory, operatorProfile, timeoutMs: 600000 };
      if (await exists(buyerConfig)) {
        const previous = await readJson(buyerConfig, 1048576);
        check(typeof previous.runtimeDirectory === 'string' && isAbsolute(previous.runtimeDirectory),
          'Reopen the same retained native Buyer runtime.');
        const runtime = await realpath(previous.runtimeDirectory);
        check(runtime === previous.runtimeDirectory && (await lstat(runtime)).isDirectory(),
          'Keep the installed runtime selected by this original Buyer.');
        buyerSettings = { ...buyerSettings, runtimeDirectory: runtime };
      }
      await retain('buyer-settings.json', buyerSettings);
      const paymentFile = join(ROOT, 'public-payment.json');
      await retain('public-payment.json', PAYMENT);
      const selectedPortPath = join(ROOT, 'merchant-listener.json');
      let merchantPort;
      if (await exists(selectedPortPath)) {
        const saved = await readJson(selectedPortPath, 65536);
        check(saved.schema === 'stellar-forge.qcew-native-merchant-listener.v1' &&
          saved.origin === origin && portNumber(saved.port),
        'Reopen the existing county merchant listener.');
        merchantPort = saved.port;
      } else {
        const probe = netServer();
        try { merchantPort = await listen(probe); } finally { await closeServer(probe); }
        await retain('merchant-listener.json', {
          schema: 'stellar-forge.qcew-native-merchant-listener.v1', origin, port: merchantPort });
      }
      for (const [name, value] of Object.entries(active.operatorEnvironment)) setEnv(name, value);
      const privateAccounts = await readJson(join(ORIGINAL, 'accounts.private.json'), 65536);
      setEnv(active.manifest.signer.secretEnv, privateAccounts.accounts.buyer.secret);
      setEnv(facilitatorPolicy.signers[0].secretEnv, privateAccounts.accounts.fee.secret);
      setEnv('SF36_OBSERVER_USE_SYSTEM_CA', '1');
      if (!(process.env.NODE_OPTIONS ?? '').split(/\s+/).includes('--use-system-ca'))
        setEnv('NODE_OPTIONS', ((process.env.NODE_OPTIONS ?? '') + ' --use-system-ca').trim());
      await progress('ORIGINAL_NATIVE_FACILITATOR_START', { originalHost: ORIGINAL, source: SOURCE,
        operatorWorkspace: OPERATOR, buyerState: stateDirectory, merchantPort });
      facilitator = await createNativeFacilitator(facilitatorPolicy, { environment: process.env });
      const listenerPath = join(ROOT, 'facilitator-listener.json');
      const savedListener = await exists(listenerPath) ? await readJson(listenerPath, 65536) : null;
      if (savedListener) {
        check(portNumber(savedListener.port), 'Reopen the retained native facilitator port.');
        const previous = new URL(savedListener.url);
        check(previous.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(previous.hostname) &&
          Number(previous.port) === savedListener.port && previous.pathname === '/' &&
          !previous.search && !previous.hash && !previous.username && !previous.password,
        'Use the retained original local facilitator URL.');
      }
      facilitatorHttp = await startFacilitatorServer({ facilitator, port: savedListener?.port ?? 0 });
      const facilitatorUrl = facilitatorHttp.url;
      await retain('facilitator-listener.json', {
        url: facilitatorUrl, port: Number(new URL(facilitatorUrl).port) });

      tls = httpsServer({ key: await readBytes(join(ORIGINAL, 'tls/server-key.pem'), 65536),
        cert: certificateBytes }, (request, response) => {
        const outgoing = httpRequest({ hostname: '127.0.0.1', port: merchantPort,
          path: request.url, method: request.method, headers: request.headers, agent: false }, incoming => {
          response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response);
          incoming.once('error', () => response.destroy());
        });
        upstreamRequests.add(outgoing); outgoing.once('close', () => upstreamRequests.delete(outgoing));
        outgoing.once('error', () => {
          if (!response.headersSent) response.writeHead(502); response.end();
        });
        request.once('aborted', () => outgoing.destroy());
        response.once('close', () => { if (!response.writableEnded) outgoing.destroy(); });
        request.pipe(outgoing);
      });
      const tlsPort = await listen(tls);
      const selectedEgress = process.env.HTTPS_PROXY ?? process.env.https_proxy ??
        process.env.HTTP_PROXY ?? process.env.http_proxy;
      const upstreamProxy = new URL(selectedEgress);
      check(['http:', 'https:'].includes(upstreamProxy.protocol) &&
        !upstreamProxy.username && !upstreamProxy.password &&
        upstreamProxy.pathname === '/' && !upstreamProxy.search && !upstreamProxy.hash,
      'Use this host’s existing HTTP CONNECT egress proxy.');
      const bridgeRpc = (socket, authority) => {
        const upstream = tracked(upstreamProxy.protocol === 'https:' ?
          tlsConnect({ host: upstreamProxy.hostname, port: Number(upstreamProxy.port || 443),
            servername: upstreamProxy.hostname }) :
          netConnect({ host: upstreamProxy.hostname, port: Number(upstreamProxy.port || 80) }));
        upstream.once('error', () => socket.destroy());
        socket.once('error', () => upstream.destroy()); socket.once('close', () => upstream.destroy());
        upstream.once('close', () => socket.destroy());
        upstream.setTimeout(30000, () => { upstream.destroy(); socket.destroy(); });
        upstream.once(upstreamProxy.protocol === 'https:' ? 'secureConnect' : 'connect',
          () => upstream.write('CONNECT ' + authority + ' HTTP/1.1\r\nHost: ' + authority + '\r\n\r\n'));
        let buffer = Buffer.alloc(0);
        const handshake = data => {
          buffer = Buffer.concat([buffer, data]);
          if (buffer.length > 16384) { upstream.destroy(); socket.destroy(); return; }
          const end = buffer.indexOf('\r\n\r\n'); if (end < 0) return;
          upstream.removeListener('data', handshake); upstream.setTimeout(0);
          if (!/^HTTP\/1\.[01] 200(?: |\r)/.test(buffer.toString('latin1', 0, end))) {
            upstream.destroy(); socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); return;
          }
          socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (buffer.length > end + 4) socket.write(buffer.subarray(end + 4));
          socket.pipe(upstream); upstream.pipe(socket);
        };
        upstream.on('data', handshake);
      };
      proxy = httpServer((_request, response) => { response.writeHead(405); response.end(); });
      proxy.on('connect', (request, socket, head) => {
        tracked(socket); socket.on('error', () => {});
        if (request.url === merchantHost + ':443' && head.length === 0) {
          counters.merchantConnect++;
          const target = tracked(netConnect({ host: '127.0.0.1', port: tlsPort }, () => {
            socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            socket.pipe(target); target.pipe(socket);
          }));
          target.once('error', () => socket.destroy()); target.once('close', () => socket.destroy());
          socket.once('error', () => target.destroy()); socket.once('close', () => target.destroy());
        } else if (request.url === rpc.hostname + ':443' && head.length === 0) {
          counters.rpcConnect++; bridgeRpc(socket, request.url);
        } else {
          counters.refusedConnect++; socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
        }
      });
      const proxyUrl = 'http://127.0.0.1:' + await listen(proxy);
      setEnv(transport.proxyEnv, proxyUrl);
      await writeJson(join(ROOT, 'running-service.json'), {
        schema: 'stellar-forge.qcew-native-host-services.v1', operation: OPERATION,
        recordedAt: stamp(), origin, merchantPort, tlsPort, proxyUrl,
        facilitator: facilitatorUrl, buyerConfig, paymentFile });
      await progress('COMPLETE_ORIGINAL_COUNTY_MERCHANT_CUSTOMER', { origin, facilitator: facilitatorUrl,
        merchantPort, buyerConfig, paymentFile });
      result = await runQcewMerchantJourney({ directory: DIRECTORY,
        chromium: options.chromium, playwrightModule: options['playwright-module'],
        buyerConfig, paymentFile, origin, path: options.path, facilitator: facilitatorUrl,
        allowLocalFacilitator: true, merchantPort, acceptIndex: options.acceptIndex });
      check(result?.schema === 'stellar-forge.qcew-merchant-result.v1' && result.operation === OPERATION,
        'Receive the complete result from this original Merchant and Customer programme.');
      await writeJson(join(ROOT, 'host-result.json'), {
        schema: 'stellar-forge.qcew-native-host-result.v1', operation: OPERATION,
        state: 'COMPLETE', completedAt: stamp(), originalHost: ORIGINAL, source: SOURCE,
        buyerState: stateDirectory, origin, merchantPort, facilitator: facilitatorUrl,
        transport: counters, result });
      await progress('COMPLETE_ORIGINAL_COUNTY_RECEIVING', {
        projectId: result.projectId, publication: result.publication, transport: counters });
    } catch (error) {
      failure = error;
      const record = { schema: 'stellar-forge.qcew-native-host-interruption.v1',
        operation: OPERATION, phase, at: stamp(),
        code: typeof error.code === 'string' ? error.code : 'QCEW_NATIVE_HOST_INTERRUPTED',
        message: String(error.message ?? '').slice(0, 2000) };
      await writeJson(join(ROOT, 'host-error.json'), record).catch(() => {});
      log(record);
    } finally {
      const shutdown = { schema: 'stellar-forge.qcew-native-host-shutdown.v1',
        operation: OPERATION, at: stamp(), transport: counters, errors: [] };
      try {
        if (facilitatorHttp) shutdown.facilitator = await facilitatorHttp.close() ?? null;
        else if (facilitator) shutdown.facilitator = await facilitator.drain() ?? null;
      } catch (error) { shutdown.errors.push({ component: 'facilitator',
        code: error.code ?? 'NATIVE_FACILITATOR_DRAIN_FAILED' }); failure ??= error; }
      for (const outgoing of upstreamRequests) outgoing.destroy();
      for (const socket of tunnels) socket.destroy();
      for (const [component, server] of [['proxy', proxy], ['tls', tls]]) {
        try { await closeServer(server); } catch (error) {
          shutdown.errors.push({ component, code: error.code ?? 'NATIVE_LISTENER_DRAIN_FAILED' });
          failure ??= error;
        }
      }
      restoreEnvironment();
      try { await writeJson(join(ROOT, 'shutdown.json'), shutdown); }
      catch (error) { failure ??= error; }
      log({ event: 'qcew_native_host_shutdown', operation: OPERATION,
        complete: shutdown.errors.length === 0, transport: counters });
    }
    if (failure) throw failure;
    return result;
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  runOriginalNativeHost(argumentsFor(process.argv.slice(2))).catch(error => {
    console.error(JSON.stringify({ code: error.code ?? 'QCEW_NATIVE_HOST_INTERRUPTED',
      message: String(error.message ?? '').slice(0, 2000) })); process.exitCode = 1;
  });
"""

SDK_INSPECTOR = "import { readFile } from 'node:fs/promises';\nimport { dirname, join } from 'node:path';\nimport { createRequire } from 'node:module';\nimport { pathToFileURL } from 'node:url';\nimport { createHash } from 'node:crypto';\nimport { HTTPFacilitatorClient, x402ResourceServer, x402HTTPResourceServer } from '@x402/core/server';\nimport { ExactStellarScheme } from '@x402/stellar/exact/server';\nimport { bazaarResourceServerExtension, validateBazaarRouteExtensions } from '@x402/extensions/bazaar';\nconst { NATIVE_SDK_VERSION } = await import(pathToFileURL(process.argv[2]).href);\nif ([HTTPFacilitatorClient, x402ResourceServer, x402HTTPResourceServer, ExactStellarScheme,\n  validateBazaarRouteExtensions].some(value => typeof value !== 'function') ||\n  !bazaarResourceServerExtension) throw new Error('The installed original native seller SDK is incomplete.');\nconst require = createRequire(import.meta.url), packages = [];\nfor (const [name, specifier] of [['@x402/core','@x402/core/server'],\n  ['@x402/stellar','@x402/stellar/exact/server'], ['@x402/extensions','@x402/extensions/bazaar']]) {\n  let directory = dirname(require.resolve(specifier)), found = null;\n  for (;;) {\n    try {\n      const bytes = await readFile(join(directory, 'package.json'));\n      const value = JSON.parse(bytes);\n      if (value.name === name) {\n        if (value.version !== NATIVE_SDK_VERSION) throw new Error('Use the original ' + name + '@' + NATIVE_SDK_VERSION + '.');\n        found = { name, version: value.version, packageSha256: createHash('sha256').update(bytes).digest('hex') };\n        break;\n      }\n    } catch (error) { if (error.code !== 'ENOENT') throw error; }\n    const parent = dirname(directory);\n    if (parent === directory) break;\n    directory = parent;\n  }\n  if (!found) throw new Error('Read the installed original package metadata for ' + name + '.');\n  packages.push(found);\n}\nconsole.log(JSON.stringify({ event: 'qcew_native_sdk_ready', nativeSdk: NATIVE_SDK_VERSION, packages }));\n"

def select_merchant_dependencies(root, paid_root, selected):
    if selected:
        modules = pathlib.Path(selected).resolve(strict=True)
        check(modules.is_dir() and modules.name == "node_modules", "Select the existing installed seller node_modules directory.")
        parent = private_directory(root.parent)
        link = parent / "node_modules"
        if link.exists() or link.is_symlink():
            check(link.resolve(strict=True) == modules, "Use this operation parent's already selected seller dependencies.")
        else:
            os.symlink(str(modules), link, target_is_directory=True)
            sync_directory(parent)
        selection = {"schema": "stellar-forge.qcew-native-sdk-selection.v1",
                     "installedDirectory": str(modules), "resolutionPath": str(link)}
        retain_exact(paid_root / "seller-dependencies.json",
                     (json.dumps(selection, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    inspector = paid_root / "inspect-sdk.mjs"
    retain_exact(inspector, SDK_INSPECTOR.encode("utf-8"))
    return inspector

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", required=True)
    parser.add_argument("--packet-sha256", required=True)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--intake-directory")
    parser.add_argument("--node", default="node")
    parser.add_argument("--chromium")
    parser.add_argument("--playwright-module")
    parser.add_argument("--pdfinfo", default="pdfinfo")
    parser.add_argument("--profile")
    parser.add_argument("--original-project")
    parser.add_argument("--archive-directory")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--merchant-packet")
    parser.add_argument("--merchant-packet-sha256")
    parser.add_argument("--original-native-host",
        help="Existing funded native operator installation; derives the retained Buyer, payment and local services.")
    parser.add_argument("--native-ca", help="Existing certificate authority for the original native host.")
    parser.add_argument("--buyer-config")
    parser.add_argument("--seller-node-modules", help="Existing installed native seller dependencies, outside the original source/archive.")
    parser.add_argument("--payment")
    parser.add_argument("--origin")
    parser.add_argument("--merchant-path", default="/county-reports")
    parser.add_argument("--facilitator")
    parser.add_argument("--allow-local-facilitator", action="store_true")
    parser.add_argument("--merchant-port", type=int)
    parser.add_argument("--accept-index", type=int, default=0)
    parser.add_argument("--paid-only", action="store_true",
        help="Append the paid phase to this operation's completed original native and browser results.")
    options = parser.parse_args()
    packet, packet_bytes = read_packet(options.packet, options.packet_sha256)
    merchant_packet, merchant_bytes = None, None
    check(bool(options.merchant_packet) == bool(options.merchant_packet_sha256),
          "Supply the complete paid source packet together with its published SHA256.")
    if options.merchant_packet:
        merchant_packet, merchant_bytes = read_packet(options.merchant_packet, options.merchant_packet_sha256)
        check(merchant_packet.get("originalPacketSha256") == options.packet_sha256,
              "Continue this original native source operation with its corresponding complete paid source.")
        check(merchant_packet.get("entrypoints", {}).get("merchant") == PREFIX + "/fred/qcew/merchant-journey.mjs" and
              any(file["path"] == merchant_packet["entrypoints"]["merchant"] for file in merchant_packet["files"]),
              "Use the complete installed paid Merchant/Customer programme.")
        if options.original_native_host:
            check(not any((options.buyer_config, options.payment, options.origin, options.facilitator,
                           options.merchant_port, options.allow_local_facilitator)),
                  "The original native host derives its existing Buyer, payment, HTTPS route and facilitator.")
            check(options.accept_index == 0, "Use the existing native host's original testnet payment alternative.")
        else:
            check(not options.native_ca, "Select the original native host for its certificate authority.")
            if not options.prepare_only:
                check(all((options.buyer_config, options.payment, options.origin, options.facilitator)) and
                      options.merchant_port is not None and 0 < options.merchant_port <= 65535 and options.accept_index >= 0,
                      "Select the existing testnet Buyer, public payment file, HTTPS origin, facilitator and fixed merchant port.")
    else:
        check(not options.paid_only and not any((options.buyer_config, options.payment, options.origin,
              options.facilitator, options.merchant_port, options.allow_local_facilitator, options.seller_node_modules,
              options.original_native_host, options.native_ca)),
              "Use the complete paid source packet for the selected Merchant/Customer continuation.")
    root = private_directory(options.directory)
    intake = pathlib.Path(options.intake_directory).absolute() if options.intake_directory else root / "intake"
    archive_directory = pathlib.Path(options.archive_directory).absolute() if options.archive_directory else root.parent / (root.name + "-archives")
    with os.fdopen(os.open(root / "operation.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), "a+b") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        identity = {"operation": OPERATION, "packetSha256": options.packet_sha256,
            "sourceCommit": packet["source"]["baseCommit"], "sourceOverlays": packet["source"].get("overlays", []),
            "intakeDirectory": str(intake), "profile": str(pathlib.Path(options.profile).absolute()) if options.profile else None,
            "originalProject": str(pathlib.Path(options.original_project).absolute()) if options.original_project else None}
        header = root / "operation.json"
        check(not options.paid_only or header.exists(), "Append the paid phase to the retained original operation directory.")
        if header.exists():
            check(json.loads(read_regular(header).decode("utf-8")) == identity, "Continue this original operation with the same retained inputs and source.")
        else:
            atomic_json(header, identity)
        retain_exact(root / "source-packet.json", packet_bytes)
        controller_bytes = read_regular(pathlib.Path(__file__).absolute())
        controllers = private_directory(root / "controllers")
        controller_path = controllers / ("run-native-" + sha(controller_bytes) + ".py")
        retain_exact(controller_path, controller_bytes)
        if not (root / "run_native.py").exists():
            retain_exact(root / "run_native.py", controller_bytes)
        source = materialize(root, packet)
        merchant_source, sdk_inspector, native_host_controller = None, None, None
        if merchant_packet is not None:
            paid_root = private_directory(root / "paid-sources" / options.merchant_packet_sha256)
            retain_exact(paid_root / "source-packet.json", merchant_bytes)
            merchant_source = materialize(paid_root, merchant_packet)
            sdk_inspector = select_merchant_dependencies(root, paid_root, options.seller_node_modules)
            if options.original_native_host:
                native_host_bytes = NATIVE_HOST_SOURCE.encode("utf-8")
                native_host_controller = controllers / ("native-host-" + sha(native_host_bytes) + ".mjs")
                retain_exact(native_host_controller, native_host_bytes)
            emit({"event": "qcew_paid_source_ready", "operation": OPERATION, "directory": str(paid_root),
                "source": str(merchant_source), "files": merchant_packet["source"]["files"],
                "sourceBytes": merchant_packet["source"]["bytes"], "packetSha256": options.merchant_packet_sha256,
                "controller": str(controller_path)})
        (root / "logs").mkdir(mode=0o700, exist_ok=True)
        available = os.statvfs(root)
        emit({"event": "qcew_source_ready", "operation": OPERATION, "directory": str(root), "source": str(source),
            "files": packet["source"]["files"], "sourceBytes": packet["source"]["bytes"], "packetSha256": options.packet_sha256,
            "availableBytes": available.f_bavail * available.f_frsize})
        if options.prepare_only:
            return 0
        check(options.chromium and options.playwright_module, "Select the installed Chromium and Playwright module for the full PDF/browser operation.")
        node = shutil.which(options.node) or options.node
        versions = json.loads(subprocess.check_output([node, "-p", "JSON.stringify(process.versions)"], text=True))
        version = tuple(int(item) for item in versions["node"].split(".")[:2])
        check(version >= (22, 16), "Run the maintained product on Node 22.16 or newer.")
        check(pathlib.Path(options.chromium).is_file() and pathlib.Path(options.playwright_module).is_file(),
              "Use the existing complete browser executable and Playwright module.")
        if (root / "run.json").exists():
            state = json.loads(read_regular(root / "run.json").decode("utf-8"))
            check(state.get("schema") == "stellar-forge.qcew-native-controller.v1" and state.get("identity") == identity,
                  "The retained native controller belongs to another original operation.")
        else:
            state = {"schema": "stellar-forge.qcew-native-controller.v1", "identity": identity,
                     "startedAt": now(), "stages": []}
        state.update({"lastStartedAt": now(), "status": "running", "runtime": {"node": versions, "python": sys.version}})
        state.pop("completedAt", None)
        state.pop("error", None)
        atomic_json(root / "run.json", state)
        product = source / PREFIX
        environment = dict(os.environ)
        environment["QCEW_EXPECTED_SEED_SHA256"] = SEED_SHA
        runtime_tmp = private_directory(root.parent / (root.name + "-runtime-tmp"))
        environment["TMPDIR"] = str(runtime_tmp)
        original_native_host, native_ca = None, None
        if options.original_native_host:
            original_native_host = pathlib.Path(options.original_native_host).resolve(strict=True)
            check(original_native_host.is_dir(), "Select the complete existing native operator installation.")
            native_ca = pathlib.Path(options.native_ca).resolve(strict=True) if options.native_ca else (
                original_native_host / "tls" / "extra-ca.pem").resolve(strict=True)
            check(native_ca.is_file(), "Select the existing native host certificate authority.")
            environment["NODE_EXTRA_CA_CERTS"] = str(native_ca)
            environment["SF36_OBSERVER_USE_SYSTEM_CA"] = "1"
        failed = None
        try:
            completed_original = all(any(stage.get("name") == name and stage.get("status") == "completed"
                for stage in state["stages"]) for name in ("complete-production-receiving", "original-browser-receiving"))
            reuse_original = options.paid_only or merchant_source is not None and completed_original
            if not reuse_original:
                run_stage("original-source", [sys.executable, "-u", str(product / "fred/qcew/source_fetch.py"),
                    "--directory", str(intake), "--years", "1990:2026"], root, lock, state, environment)
                native = [node, str(product / "fred/qcew/native-journey.mjs"), "--directory", str(root / "native"),
                    "--intake-directory", str(intake), "--cpi", str(product / "fred/sources/cpiaucsl-20261012.public-table.json"),
                    "--chromium", str(pathlib.Path(options.chromium).absolute()), "--pdfinfo", options.pdfinfo]
                if options.profile:
                    native += ["--profile", str(pathlib.Path(options.profile).absolute())]
                if options.original_project:
                    native += ["--original-project", str(pathlib.Path(options.original_project).absolute())]
                run_stage("complete-production-receiving", native, root, lock, state, environment)
                run_stage("original-browser-receiving", [node, str(product / "fred/qcew/workspace-journey.mjs"),
                    "--directory", str(root / "native"), "--chromium", str(pathlib.Path(options.chromium).absolute()),
                    "--playwright-module", str(pathlib.Path(options.playwright_module).absolute())],
                    root, lock, state, environment)
            if reuse_original:
                native_result = json.loads(read_regular(root / "native" / "native-result.json").decode("utf-8"))
                browser_result = json.loads(read_regular(root / "native" / "browser-workspace" / "workspace-result.json").decode("utf-8"))
                check(native_result.get("schema") == "stellar-forge.qcew-native-result.v1" and
                      native_result.get("operation") == OPERATION and len(native_result.get("reports", [])) >= 2 and
                      browser_result.get("schema") == "stellar-forge.qcew-workspace-result.v1" and
                      browser_result.get("projectId") == native_result["project"]["projectId"],
                      "Use this operation's complete original native production and browser receiving results.")
                emit({"event": "qcew_original_production_reopened", "operation": OPERATION,
                      "projectId": native_result["project"]["projectId"],
                      "reports": [item["edition"]["id"] for item in native_result["reports"]],
                      "originalNativeResultSha256": sha(read_regular(root / "native" / "native-result.json")),
                      "originalBrowserResultSha256": sha(read_regular(root / "native" / "browser-workspace" / "workspace-result.json"))})
            if merchant_source is not None:
                run_stage("original-native-seller-sdk", [node, str(sdk_inspector),
                    str(merchant_source / PREFIX / "native-version.mjs")], root, lock, state, environment)
                if original_native_host is not None:
                    paid = [node, "--use-system-ca", str(native_host_controller),
                        "--source", str(merchant_source / pathlib.PurePosixPath(PREFIX).parent),
                        "--directory", str(root / "native"), "--original", str(original_native_host),
                        "--ca", str(native_ca), "--chromium", str(pathlib.Path(options.chromium).absolute()),
                        "--playwright-module", str(pathlib.Path(options.playwright_module).absolute()),
                        "--path", options.merchant_path, "--accept-index", str(options.accept_index)]
                else:
                    paid = [node, str(merchant_source / merchant_packet["entrypoints"]["merchant"]),
                        "--directory", str(root / "native"), "--chromium", str(pathlib.Path(options.chromium).absolute()),
                        "--playwright-module", str(pathlib.Path(options.playwright_module).absolute()),
                        "--buyer-config", str(pathlib.Path(options.buyer_config).absolute()),
                        "--payment", str(pathlib.Path(options.payment).absolute()),
                        "--origin", options.origin, "--path", options.merchant_path, "--facilitator", options.facilitator,
                        "--merchant-port", str(options.merchant_port), "--accept-index", str(options.accept_index)]
                    if options.allow_local_facilitator:
                        paid.append("--allow-local-facilitator")
                state["paidSource"] = {"packetSha256": options.merchant_packet_sha256,
                    "source": str(merchant_source), "controller": str(controller_path)}
                atomic_json(root / "run.json", state)
                run_stage("complete-paid-merchant-customer-receiving", paid, root, lock, state, environment)
            state.update({"status": "completed", "completedAt": now()})
        except BaseException as error:
            failed = error
            state.update({"status": "interrupted", "interruptedAt": now(),
                          "error": {"type": type(error).__name__, "message": str(error)}})
        atomic_json(root / "run.json", state)
        archive = preserve_archive(root, intake, archive_directory)
        result = {"event": "qcew_native_delivered", "operation": OPERATION, "status": state["status"],
                  "directory": str(root), "archive": archive, "stages": state["stages"]}
        if failed:
            result["error"] = state["error"]
        atomic_json(root / "archive-result.json", result)
        emit(result)
        if failed:
            raise failed
        return 0

if __name__ == "__main__":
    def interrupted(signum, _frame):
        raise InterruptedError("Original native operation interrupted by signal " + str(signum))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        sys.exit(main())
    except BaseException as error:
        if isinstance(error, SystemExit):
            raise
        emit({"event": "qcew_native_controller_error", "operation": OPERATION,
              "type": type(error).__name__, "message": str(error)})
        raise
