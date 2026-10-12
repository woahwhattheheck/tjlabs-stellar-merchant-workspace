#!/usr/bin/env node
// MIT. Install the complete receiving integration into the exact published x402engine MCP source.
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpath, mkdir, readdir, chmod, lstat } from 'node:fs/promises';
import { readBytes, writeBytes, digest, jsonBytes, privateDirectory, matchingWriteTemporaries } from '../../sf88-operator-buyer-cli/node/store.mjs';
import { withDeliveryLease } from '../../sf98-merchant-delivery/delivery-lock.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PREFIX = 'stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving';
const SOURCE = [
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/x402engine.mjs",
    "bytes": 24805,
    "sha256": "67e05b8e43bb4e0f4700335057f0effe29f8d9f30d7fecb03e68ce5c40fb8e40"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/operator.mjs",
    "bytes": 11446,
    "sha256": "54514ffd64ba008b288059c6f8a0d1c8bf7dd35611699bf03d7f1860c7d5bbe0"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/cli.mjs",
    "bytes": 4501,
    "sha256": "9c97b7b55d24da09f13636532ffc7404ac18269750fb275ca88cc37067b36739"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/public/index.html",
    "bytes": 2382,
    "sha256": "a2b90211e0349fb543455d4d254483e582bf2621fe0fd06092387bb8f87c8683"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/public/style.css",
    "bytes": 2652,
    "sha256": "07ddceba2bc96399f1751530b1d297dd4ca07193ade805436e942e1815cee061"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/public/app.mjs",
    "bytes": 3129,
    "sha256": "d5c9f6fbfc6917f6047338293cef2fcc38929a42bf73b5177a4ad084226230e3"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/README.md",
    "bytes": 9856,
    "sha256": "9b0fffcf9a0f0d69471dd34ab7b262251d3fd05c6d73bd778049ef0977f07656"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/response-file.mjs",
    "bytes": 18815,
    "sha256": "1aa6e71f1b308a4ea71b61ee597323c41da379408e75633bcc62246f3818c295"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/response-stream.mjs",
    "bytes": 8035,
    "sha256": "9f9c5df11bc0b3b1efe77c84783eaceacae65c432a3b162011b4240a6887e9e0"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/public-transport.mjs",
    "bytes": 14318,
    "sha256": "8bb1a5ecd80fcb168133d291fb46d3640e2c4423477df02c4b59d05e11bbddfa"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/request-body.mjs",
    "bytes": 121,
    "sha256": "bf4c83c27a0dea7ef18064743936c45786fe752e2db3428c538b117f146f9437"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf85-live-402-capture/proxy-connect.mjs",
    "bytes": 4833,
    "sha256": "6aca71bb1801fa0268da56708886ce879702d6ca3eaacfaefe092372b9f2bee1"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/result.mjs",
    "bytes": 11333,
    "sha256": "fc2eb897ba7d67f5c4716a5b970e9697a93214f1755e03dda7b7995753c78cd2"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/store.mjs",
    "bytes": 15563,
    "sha256": "dbaac9e39164422318839eb8b6e0de6e362f8d0c687c5d6e2b555c93fc72be04"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf98-merchant-delivery/delivery-lock.mjs",
    "bytes": 4868,
    "sha256": "2aaa10b2eadd7c4da28fce4004493fea15fdd34194978ccb589e37900d989a59"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/mcp-workspace.mjs",
    "bytes": 27395,
    "sha256": "559f8c5bcaebd03f6f69fa8b69044acb8edd05a350dd4f294e05df144cac6042"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/mcp.mjs",
    "bytes": 8713,
    "sha256": "bd2cbd1c469aab15cf70ddd13491a85af635ce06a3fef0baf6a159651371ea06"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/mcp-workspace.d.mts",
    "bytes": 3054,
    "sha256": "bd1e062fb2b4dcb0070315bc37eba5a49881c6fce158d0455d9f8abe3b28413f"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/mcp.d.mts",
    "bytes": 425,
    "sha256": "83da20f134ec4c80e9fe27dbf8cfdfc1342f479ab64ccc4a9377ee8264ef7276"
  },
  {
    "file": "stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/MCP.md",
    "bytes": 12272,
    "sha256": "b826c3a57b0d09d84024931cd4579315ccd42a98bad9f5b92aa2c4eb72286a45"
  }
];
const ORIGINAL = {
  'src/index.ts': '6ad8810093d7cd06ad1858fe5e1bb5cd28c054768a9b23dd5a8d23138c37e7ee',
  'src/payment.ts': '381c56e93186ca0ab69fcca08313337d5649ea8e8592645db5cc2301d484a21c',
  'src/cli.ts': '288e9014678cce7b020e7742d9fb800ce31a7bc2b2c1a6e47052befad12f23f3',
  'package.json': '7707b6179534a2ae36080fb5bb3faf57e7a76359c4f42059b67acbe128654a8b',
  'tsconfig.json': 'a7a8bf7dd7d168407b3057a25f98ecdd0e22cadbb85d4fbb2ade100cf847328b',
};
const UPSTREAM = { package: 'x402engine-mcp', version: '1.1.1',
  repository: 'https://github.com/agentc22/x402engine-mcp',
  gitHead: 'dd1c2745ea5d7d2331a0e18990cc43195780f0ca' };
const VENDOR = 'vendor/tjlabs-video';
const IMPORT = 'import { registerX402VideoTools } from "../vendor/tjlabs-video/index.mjs";\n';
const PAYMENT_IMPORT = 'import { createPaymentFetch } from "./payment.js";\n';
const ANCHOR = 'const server = new McpServer({\n  name: "x402engine",\n  version: "1.1.1",\n});\n';
const HOOK = '\n// Complete video receiving shares this server’s original payment fetch and configuration.\n' +
  'registerX402VideoTools(server, {\n  z, getRequestFetch, baseUrl: BASE_URL,\n' +
  '  paymentHeader: PAYMENT_HEADER, devBypass: DEV_BYPASS,\n' +
  '  paymentContext: { network: process.env.X402_PAYMENT_NETWORK || "auto",\n' +
  '    maxPaymentUsd: process.env.X402_MAX_PAYMENT_USD || "1.00" },\n});\n';
const need = (condition, code) => { if (!condition) throw Object.assign(new Error(code), { code }); };
const one = (source, target) => source.split(target).length === 2;
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
async function originalIndex(path) {
  const current = (await readBytes(path, 1048576)).toString('utf8');
  if (digest(Buffer.from(current)) === ORIGINAL['src/index.ts']) return current;
  need(one(current, IMPORT) && one(current, HOOK), 'MCP_UPSTREAM_INDEX_CHANGED');
  const recovered = current.replace(IMPORT, '').replace(HOOK, '');
  need(digest(Buffer.from(recovered)) === ORIGINAL['src/index.ts'], 'MCP_UPSTREAM_INDEX_CHANGED');
  return recovered;
}
function patchedIndex(original) {
  need(one(original, PAYMENT_IMPORT) && one(original, ANCHOR), 'MCP_UPSTREAM_REGISTRATION_CHANGED');
  return Buffer.from(original.replace(PAYMENT_IMPORT, PAYMENT_IMPORT + IMPORT).replace(ANCHOR, ANCHOR + HOOK));
}
async function originalPackage(path) {
  const bytes = await readBytes(path, 1048576);
  if (digest(bytes) === ORIGINAL['package.json']) return JSON.parse(bytes);
  const recovered = JSON.parse(bytes);
  need(recovered.bin?.['x402engine-video'] === VENDOR + '/' + PREFIX + '/cli.mjs' &&
    Array.isArray(recovered.files) && recovered.files.filter(value => value === VENDOR).length === 1 &&
    recovered.engines?.node === '>=22.16.0', 'MCP_UPSTREAM_PACKAGE_CHANGED');
  delete recovered.bin['x402engine-video'];
  recovered.files = recovered.files.filter(value => value !== VENDOR);
  recovered.engines.node = '>=20.18.0';
  need(digest(json(recovered)) === ORIGINAL['package.json'], 'MCP_UPSTREAM_PACKAGE_CHANGED');
  return recovered;
}
function patchedPackage(original) {
  const result = structuredClone(original);
  need(result.name === UPSTREAM.package && result.version === UPSTREAM.version &&
    Array.isArray(result.files) && result.bin && typeof result.bin === 'object',
    'MCP_UPSTREAM_PACKAGE_CHANGED');
  result.files.push(VENDOR);
  result.bin['x402engine-video'] = VENDOR + '/' + PREFIX + '/cli.mjs';
  result.engines.node = '>=22.16.0';
  return json(result);
}
async function safeFile(root, file) {
  need(typeof file === 'string' && !file.startsWith('/') && !file.includes('\\') &&
    file.split('/').every(part => part && part !== '.' && part !== '..'), 'MCP_SOURCE_PATH_INVALID');
  const path = join(root, file);
  need(await realpath(dirname(path)) === dirname(path), 'MCP_SOURCE_PATH_ALIAS');
  const info = await lstat(path);
  need(info.isFile() && !info.isSymbolicLink(), 'MCP_SOURCE_FILE_REQUIRED');
  return path;
}
async function immutable(path, bytes) {
  try { await writeBytes(path, bytes, { exclusive: true }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    need((await readBytes(path, 1048576)).equals(bytes), 'MCP_VENDOR_SOURCE_CONFLICT');
  }
}
export async function installX402VideoMcp({ directory, sourceRoot = ROOT } = {}) {
  need(typeof directory === 'string' && resolve(directory) === directory && directory !== '/',
    'MCP_ABSOLUTE_SOURCE_DIRECTORY_REQUIRED');
  need(await realpath(directory) === directory && await realpath(join(directory, 'src')) === join(directory, 'src'),
    'MCP_CANONICAL_SOURCE_DIRECTORY_REQUIRED');
  need(typeof sourceRoot === 'string' && resolve(sourceRoot) === sourceRoot && await realpath(sourceRoot) === sourceRoot,
    'MCP_CANONICAL_RUNTIME_SOURCE_REQUIRED');
  const sources = [];
  for (const expected of SOURCE) {
    const path = await safeFile(sourceRoot, expected.file);
    const bytes = await readBytes(path, 1048576);
    need(bytes.length === expected.bytes && digest(bytes) === expected.sha256, 'MCP_RUNTIME_SOURCE_CHANGED');
    sources.push({ ...expected, bytes });
  }
  const target = join(directory, VENDOR);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  need(await realpath(dirname(target)) === dirname(target), 'MCP_VENDOR_DIRECTORY_ALIAS');
  await privateDirectory(target);
  need(await realpath(target) === target, 'MCP_VENDOR_DIRECTORY_ALIAS');
  return withDeliveryLease(target, async () => {
    for (const [file, sha256] of Object.entries(ORIGINAL)) {
      await safeFile(directory, file);
      if (file === 'src/index.ts' || file === 'package.json') continue;
      need(digest(await readBytes(join(directory, file), 1048576)) === sha256, 'MCP_UPSTREAM_SOURCE_CHANGED');
    }
    const beforeIndex = await originalIndex(join(directory, 'src/index.ts'));
    const beforePackage = await originalPackage(join(directory, 'package.json'));
    const index = patchedIndex(beforeIndex), packageBytes = patchedPackage(beforePackage);
    const generated = [
      { file: 'index.mjs', bytes: Buffer.from('export { registerX402VideoTools } from "./' + PREFIX + '/mcp.mjs";\n') },
      { file: 'index.d.mts', bytes: Buffer.from('export { registerX402VideoTools } from "./' + PREFIX + '/mcp.mjs";\n') },
      { file: '.gitignore', bytes: Buffer.from('.sf98-delivery.lock\n.write-*\n') },
      { file: '.npmignore', bytes: Buffer.from('.sf98-delivery.lock\n.write-*\n') },
      { file: 'NOTICE.md', bytes: Buffer.from('# TokenJunkie Labs video receiving\n\n' +
        'Maintained MIT source: https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace\n' +
        'Receiving product commit: 3d1698115f5b5665a3953013c4954b3976ce67b8\n' +
        'The installation manifest identifies every source file by full SHA-256 and byte length.\n' +
        'The original x402engine MCP package remains governed by its original MIT license.\n') },
    ];
    const manifest = { schema: 'tjlabs.x402engine-video-mcp-installation.v1', upstream: UPSTREAM,
      runtime: { os: 'linux', node: '>=22.16.0', commands: ['flock', 'tar'] },
      paymentAuthority: 'ORIGINAL_X402ENGINE_GET_REQUEST_FETCH',
      source: SOURCE, original: ORIGINAL,
      postimages: { 'src/index.ts': { bytes: index.length, sha256: digest(index) },
        'package.json': { bytes: packageBytes.length, sha256: digest(packageBytes) } },
      generated: generated.map(file => ({ file: file.file, bytes: file.bytes.length, sha256: digest(file.bytes) })),
      complete: true };
    const installationBytes = jsonBytes(manifest);
    const installFiles = [...sources, ...generated, { file: 'installation.json', bytes: installationBytes }];
    const expectedNames = new Set([...SOURCE.map(item => item.file), ...generated.map(item => item.file),
      'installation.json', '.sf98-delivery.lock']);
    const walk = async path => {
      const completeWrites = await matchingWriteTemporaries(path, installFiles
        .filter(file => dirname(join(target, file.file)) === path).map(file => file.bytes));
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const full = join(path, entry.name);
        need(!entry.isSymbolicLink(), 'MCP_VENDOR_LINK_UNSUPPORTED');
        if (entry.isDirectory()) await walk(full);
        else need(entry.isFile() && (expectedNames.has(relative(target, full)) || completeWrites.has(entry.name)),
          'MCP_VENDOR_EXTRA_FILE');
      }
    };
    await walk(target);
    for (const file of [...sources, ...generated]) {
      const destination = join(target, file.file);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      need(await realpath(dirname(destination)) === dirname(destination), 'MCP_VENDOR_DIRECTORY_ALIAS');
      await immutable(destination, file.bytes);
    }
    await chmod(join(target, PREFIX, 'cli.mjs'), 0o755);
    // All imports and assets exist before either original host file references them.
    await writeBytes(join(directory, 'src/index.ts'), index);
    await writeBytes(join(directory, 'package.json'), packageBytes);
    need(digest(await readBytes(join(directory, 'src/index.ts'), 1048576)) === digest(index) &&
      digest(await readBytes(join(directory, 'package.json'), 1048576)) === digest(packageBytes),
      'MCP_INSTALL_READBACK_MISMATCH');
    await immutable(join(target, 'installation.json'), installationBytes);
    return { schema: manifest.schema, directory, upstream: UPSTREAM, complete: true,
      runtimeFiles: SOURCE.length, generatedFiles: generated.length + 1, postimages: manifest.postimages,
      manifest: join(target, 'installation.json'),
      build: 'npm run build', command: 'node dist/cli.js', videoCommand: 'x402engine-video' };
  }, { purpose: 'drain' });
}
export async function runVideoMcpInstallCommand(argv = process.argv.slice(2), output = process.stdout) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    need(['--directory', '--source-root'].includes(argv[i]) && typeof argv[i + 1] === 'string' &&
      !values[argv[i]], 'MCP_INSTALL_ARGUMENT_INVALID');
    values[argv[i]] = argv[i + 1];
  }
  need(values['--directory'], 'MCP_INSTALL_DIRECTORY_REQUIRED');
  const result = await installX402VideoMcp({ directory: values['--directory'],
    ...(values['--source-root'] ? { sourceRoot: values['--source-root'] } : {}) });
  output.write(JSON.stringify(result, null, 2) + '\n');
  return result;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  runVideoMcpInstallCommand().catch(error => {
    process.stderr.write(JSON.stringify({ error: /^[A-Z][A-Z0-9_]{0,119}$/.test(error?.code ?? '') ?
      error.code : 'MCP_INSTALL_FAILED' }) + '\n');
    process.exitCode = 1;
  });
