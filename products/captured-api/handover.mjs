// MIT. Complete selected merchant/source handover using the original native owners.
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { readCapturedApi } from './workspace.mjs';
import { Sf61WorkspaceClient } from '../../stellar-forge/mcp-merchant-operator/sf61-connection.mjs';
import { readPackage } from '../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/model.mjs';
import { packageName } from '../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/package-name.mjs';
import { inspectMerchantPackage, receiveMerchantPackage } from '../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/package-transfer.mjs';
import { parseMerchantPackageExport, PACKAGE_EXPORT_MANIFEST } from '../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/package-export-format.mjs';
import { openWorkspace, readRevision } from '../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/har/store.mjs';
import { openRefresh } from '../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/har/refresh.mjs';
import { buildDocument } from '../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/har/model.mjs';
import {
  HASH, METADATA_LIMIT, canonical, digest, encode, decode, exact, plain, title, absolute, childName,
  inside, directory, present, bytes, readJSON, publishBytes, publishJSON, fileRow, fileRows,
  includesFiles, verifyFiles, operation, requireEmptyOperation, fail,
} from './handover-files.mjs';

export const CAPTURED_HANDOVER_REQUEST_SCHEMA = 'stellar-forge.captured-api-handover-request.v1';
export const CAPTURED_HANDOVER_REVIEW_SCHEMA = 'stellar-forge.captured-api-handover-review.v1';
export const CAPTURED_HANDOVER_SCHEMA = 'stellar-forge.captured-api-handover.v1';
export const CAPTURED_HANDOVER_RECEIVE_SCHEMA = 'stellar-forge.captured-api-handover-receive.v1';
const OPERATION_SCHEMA = 'stellar-forge.captured-api-handover-operation.v1';
const MAX_MEMBERS = 1000;
const sourceKey = row => row.kind + '-' + row.id;
const query = input => new URLSearchParams(Object.entries(input).filter(([,value]) => value !== undefined)).toString();
const ordered = rows => rows.sort((a,b) => a.name.localeCompare(b.name));
function hash(value, label) {
  if (!HASH.test(value ?? '')) fail('CAPTURED_HANDOVER_INPUT', 'Use the full original ' + label + ' SHA-256.');
  return value;
}
function sourceSelection(value) {
  exact(value, ['kind','id','revision'], ['kind','id']);
  if (!['capture','refresh'].includes(value.kind)) fail('CAPTURED_HANDOVER_INPUT', 'Choose capture or refresh.');
  return { kind:value.kind, id:hash(value.id,'source'),
    ...(value.revision === undefined ? {} : { revision:hash(value.revision,'review') }) };
}
function normalizeRequest(value) {
  exact(value, ['schema','label','packages','sources'], ['schema']);
  if (value.schema !== CAPTURED_HANDOVER_REQUEST_SCHEMA)
    fail('CAPTURED_HANDOVER_INPUT', 'Use the captured handover request schema.');
  if (!Array.isArray(value.packages ?? []) || !Array.isArray(value.sources ?? []) ||
      (value.packages?.length ?? 0) > MAX_MEMBERS || (value.sources?.length ?? 0) > MAX_MEMBERS)
    fail('CAPTURED_HANDOVER_INPUT', 'Select the complete package/source collection within its member limit.');
  const packages = (value.packages ?? []).map(input => {
    const row = typeof input === 'string' ? { name:input } : input;
    exact(row,['name','manifestSha256'],['name']);
    return { name:packageName(row.name),
      ...(row.manifestSha256 === undefined ? {} : { manifestSha256:hash(row.manifestSha256,'package manifest') }) };
  }).sort((a,b) => a.name.localeCompare(b.name));
  if (new Set(packages.map(row => row.name)).size !== packages.length)
    fail('CAPTURED_HANDOVER_INPUT', 'Select each original package once.');
  const sources = (value.sources ?? []).map(sourceSelection).sort((a,b) => canonical(a).localeCompare(canonical(b)));
  if (new Set(sources.map(canonical)).size !== sources.length || !packages.length && !sources.length)
    fail('CAPTURED_HANDOVER_INPUT', 'Select at least one original member without repeated source selections.');
  return { schema:CAPTURED_HANDOVER_REQUEST_SCHEMA, label:title(value.label), packages, sources };
}
async function connected(profile) {
  const reference = new Sf61WorkspaceClient({ consoleUrlFile:profile.console.urlFile });
  const selected = await reference.connection();
  const client = new Sf61WorkspaceClient({ consoleUrlEnv:'CAPTURED_HANDOVER_CONSOLE' }, {
    environment:{ CAPTURED_HANDOVER_CONSOLE:selected.origin + '/#' + selected.token },
  });
  const library = await client.json('/api/har/library?limit=1');
  if (library.root !== join(profile.projectsDirectory,'.har-captures'))
    fail('CAPTURED_HANDOVER_CONSOLE', 'Use this retained product’s original projects console.');
  return client;
}
async function allPages(client, path, field, cursor) {
  const rows = [], seen = new Set(); let after = '';
  do {
    const page = await client.json(path + '?' + query({ limit:100, ...(after ? {after} : {}) }));
    if (!Array.isArray(page[field])) fail('CAPTURED_HANDOVER_SOURCE', 'The original native list is unavailable.');
    rows.push(...page[field]);
    const next = page[cursor];
    if (!next) return rows;
    if (typeof next !== 'string' || seen.has(next))
      fail('CAPTURED_HANDOVER_SOURCE', 'The original native page cursor repeated.');
    seen.add(next); after = next;
  } while (true);
}
/** Complete paged inventory from the original live console, before selecting a collection. */
export async function inventoryCapturedHandover({directory:productDirectory}) {
  const profile = await readCapturedApi(productDirectory), client = await connected(profile);
  const packages = await allPages(client,'/api/package-transfer/packages','packages','nextCursor');
  const sources = await allPages(client,'/api/har/library','items','next');
  return { schema:'stellar-forge.captured-api-handover-inventory.v1', directory:profile.directory,
    projectsDirectory:profile.projectsDirectory, name:profile.name, packages, sources,
    selectionSchema:CAPTURED_HANDOVER_REQUEST_SCHEMA };
}
async function sourceSnapshot(root, kind) {
  root = await directory(root);
  const packet = kind === 'refresh' ? await openRefresh(root) : null;
  const workspace = packet?.candidate ?? await openWorkspace(root);
  const files = [], revisions = [], previousRevisions = [];
  const addWorkspace = async (selected, prefix, saved) => {
    for (const name of ['source.har','inventory.json','source.json'])
      files.push(await fileRow(root,prefix + name));
    for (const name of (await readdir(join(selected.root,'reviews')))
      .filter(name => /^[a-f0-9]{64}\.json$/.test(name)).sort()) {
      const revision = name.slice(0,-5);
      await readRevision(selected,revision); saved.push(revision);
      files.push(await fileRow(root,prefix + 'reviews/' + name,4 * 1024 * 1024));
    }
  };
  if (packet) {
    await addWorkspace(packet.previous,'previous/',previousRevisions);
    await addWorkspace(packet.candidate,'candidate/',revisions);
    files.push(await fileRow(root,'refresh.json',METADATA_LIMIT));
    for (const name of Object.keys(packet.manifest.files).sort()) files.push(await fileRow(root,childName(name)));
  } else await addWorkspace(workspace,'',revisions);
  return { native:{ packet,workspace }, view:{ kind, id:packet?.manifest.operationId ?? workspace.manifest.sourceSha256,
    sourceSha256:workspace.manifest.sourceSha256, sourceBytes:workspace.manifest.sourceBytes,
    revisions, previousRevisions, ...(packet ? { lineage:packet.manifest.lineage } : {}), files:ordered(files) } };
}
function requiredSource(actual, selected) {
  if (actual.kind !== selected.kind || actual.id !== selected.id ||
      selected.sourceSha256 && actual.sourceSha256 !== selected.sourceSha256 ||
      (selected.revisions ?? []).some(revision => !actual.revisions.includes(revision)))
    fail('CAPTURED_HANDOVER_CHANGED', 'The copied source differs from its original selected capture and reviews.');
}
async function inspectPackageFiles(parent, name, manifest) {
  const retained = await inspectMerchantPackage({parent,name});
  const {name:originalName,...originalIdentity} = manifest.package;
  const {name:receivingName,...receivingIdentity} = retained.package;
  if (canonical(originalIdentity) !== canonical(receivingIdentity) ||
      canonical(retained.files) !== canonical(manifest.files) || retained.totalBytes !== manifest.totalBytes)
    fail('CAPTURED_HANDOVER_CHANGED', 'The original merchant package files differ: ' + name);
  return retained;
}
async function resolveSelection(profile, request, client) {
  const packages = [], sources = new Map();
  const include = async selected => {
    const key = sourceKey(selected);
    let row = sources.get(key);
    if (!row) {
      const inspected = await client.json('/api/har/inspect?' + query({
        kind:selected.kind,id:selected.id,revision:selected.revision,limit:1,
      }));
      if (inspected.selection.kind !== selected.kind || inspected.selection.id !== selected.id)
        fail('CAPTURED_HANDOVER_CHANGED', 'The original source selection changed.');
      row = { kind:selected.kind,id:selected.id,label:title(inspected.label,'Captured API source'),
        sourceSha256:hash(inspected.sourceSha256,'captured bytes'),revisions:[] };
      sources.set(key,row);
    }
    if (selected.revision && !row.revisions.includes(selected.revision)) row.revisions.push(selected.revision);
    return row;
  };
  for (const selected of request.sources) await include(selected);
  for (const selected of request.packages) {
    const retained = await client.json('/api/package-transfer/inspect?' + query({name:selected.name}));
    if (retained.name !== selected.name || selected.manifestSha256 && selected.manifestSha256 !== retained.manifestSha256)
      fail('CAPTURED_HANDOVER_CHANGED', 'The selected package manifest changed: ' + selected.name);
    const loaded = await client.json('/api/load?' + query({name:selected.name}));
    if (loaded.name !== selected.name || digest(Buffer.from(loaded.specText)) !== retained.sourceSha256)
      fail('CAPTURED_HANDOVER_CHANGED', 'The selected package source changed: ' + selected.name);
    let capturedSource = null, decoded;
    try { decoded = JSON.parse(loaded.specText); } catch {}
    if (decoded?.['x-starforge-har']) {
      ({ capturedSource } = await client.json('/api/har/locate',{specText:loaded.specText}));
      if (!capturedSource) fail('CAPTURED_HANDOVER_SOURCE',
        'Adopt the original capture/refresh for ' + selected.name + ' into this product before preparing its complete handover.');
      await include(sourceSelection({kind:capturedSource.kind,id:capturedSource.id,revision:capturedSource.revision}));
    }
    packages.push({name:selected.name,manifestSha256:hash(retained.manifestSha256,'package manifest'),
      capturedSource,environment:retained.manifest.preview?.environment ?? []});
  }
  if (sources.size > MAX_MEMBERS) fail('CAPTURED_HANDOVER_LIMIT',
    'This package selection includes more than 1,000 original sources; select a smaller complete collection.');
  return { packages, sources:[...sources.values()].map(row => ({...row,revisions:row.revisions.sort()}))
    .sort((a,b) => sourceKey(a).localeCompare(sourceKey(b))) };
}
function productIdentity(profile) {
  return {directory:profile.directory,projectsDirectory:profile.projectsDirectory,name:profile.name};
}
async function packageMember(root, selected, profile, getClient) {
  const manifestName = 'native-inputs/' + selected.name + '-package-export.json';
  let manifestBytes;
  if (await present(join(root,manifestName))) manifestBytes = await bytes(root,manifestName,METADATA_LIMIT);
  else {
    const exported = await (await getClient()).json('/api/package-transfer/export',{
      name:selected.name,expectedPackageManifestSha256:selected.manifestSha256,
    });
    manifestBytes = await bytes(join(profile.projectsDirectory,'.package-exports',hash(exported.exportId,'native export')),
      PACKAGE_EXPORT_MANIFEST,METADATA_LIMIT);
    if (digest(manifestBytes) !== exported.manifestFile.sha256)
      fail('CAPTURED_HANDOVER_CHANGED', 'The original retained package export changed.');
    await publishBytes(root,manifestName,manifestBytes);
  }
  const manifest = parseMerchantPackageExport(manifestBytes);
  if (manifest.package.name !== selected.name || manifest.package.manifestSha256 !== selected.manifestSha256)
    fail('CAPTURED_HANDOVER_CHANGED', 'The retained native export belongs to another selected package.');
  const parent = await directory(join(root,'packages'),true), destination = join(parent,selected.name);
  if (!await present(destination)) await receiveMerchantPackage({parent,
    directory:join(profile.projectsDirectory,'.package-exports',manifest.exportId),name:selected.name,
    expectedManifestSha256:digest(manifestBytes)});
  await inspectPackageFiles(parent,selected.name,manifest);
  await publishBytes(destination,PACKAGE_EXPORT_MANIFEST,manifestBytes);
  const manifestFile = {name:PACKAGE_EXPORT_MANIFEST,bytes:manifestBytes.length,sha256:digest(manifestBytes)};
  return {name:selected.name,path:'packages/' + selected.name,package:manifest.package,exportId:manifest.exportId,
    manifestFile,capturedSource:selected.capturedSource,environment:selected.environment,
    files:ordered([...manifest.files,manifestFile])};
}
async function sourceMember(root, selected, getClient) {
  const key = sourceKey(selected), recordName = 'records/source-' + key + '.json', path = 'sources/' + key;
  const saved = await readJSON(root,recordName,true);
  if (saved) {
    const snapshot = await sourceSnapshot(join(root,path),selected.kind);
    requiredSource(snapshot.view,selected);
    if (canonical(snapshot.view.files) !== canonical(saved.files))
      fail('CAPTURED_HANDOVER_CHANGED', 'A completed retained handover source changed.');
    return saved;
  }
  await directory(join(root,'sources'),true);
  let snapshot;
  try { snapshot = await sourceSnapshot(join(root,path),selected.kind); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await (await getClient()).json('/api/har/copy',{
      selection:{kind:selected.kind,id:selected.id},destination:join(root,path),
    });
    snapshot = await sourceSnapshot(join(root,path),selected.kind);
  }
  requiredSource(snapshot.view,selected);
  const result = {...snapshot.view,label:selected.label,path,requiredRevisions:selected.revisions};
  await publishJSON(root,recordName,result);
  return result;
}
async function assertCapturedPackage(root, source, member, retainedSnapshot) {
  if (!member.capturedSource) return;
  const native = retainedSnapshot ?? await sourceSnapshot(join(root,source.path),source.kind);
  const selected = member.capturedSource, saved = await readRevision(native.native.workspace,selected.revision);
  const document = buildDocument(native.native.workspace.inventory,saved.review);
  document['x-starforge-har'].reviewSha256 = saved.revision;
  const specText = encode(document).toString('utf8');
  const project = await readPackage(join(root,'packages'),member.name);
  if (digest(Buffer.from(specText)) !== selected.openApiSha256 || specText !== project.specText ||
      native.view.sourceSha256 !== selected.sourceSha256)
    fail('CAPTURED_HANDOVER_CHANGED', 'The merchant package differs from its copied original captured review.');
}
function readme(value) {
  const lines = ['# ' + value.label,'','Complete original captured API source and merchant package handover.','',
    '## Receive and reopen','',
    '1. Install the maintained Stellar merchant workspace on the receiving host.',
    '2. Initialize and open its private captured API product with its own credential references.',
    '3. Inspect this directory using starforge captured-api handover inspect --bundle ABSOLUTE_BUNDLE.',
    '4. Use receive-review to select receiving package names and inspect any existing-name conflicts.',
    '5. Use receive with that exact review SHA-256; repeat the same request to resume.',
    '6. Open the original captured-source library and each saved merchant package in the receiving browser.',
    '','The full HANDOVER.md in products/captured-api documents every command and retained state.','',
    '## Merchant packages',''];
  for (const row of value.packages) lines.push('- [' + row.name + '](' + row.path + '/RUN.md): complete source, plan, native compiled files and package-export.json.');
  lines.push('','## Original captured sources','');
  for (const row of value.sources) lines.push('- ' + row.kind + ' ' + row.id + ': ' + row.path +
    '; ' + row.revisions.length + ' candidate/source reviews and ' + row.previousRevisions.length + ' previous reviews.');
  lines.push('','Use the original received package’s browser/release controls with the receiving host’s declared backend and payment environment.','');
  return lines.join('\n');
}
function reviewCore(value) {
  return {schema:CAPTURED_HANDOVER_REVIEW_SCHEMA,label:value.label,createdAt:value.createdAt,
    requestSha256:value.requestSha256,sourceProduct:value.sourceProduct,
    packages:value.packages,sources:value.sources,files:value.files,totalBytes:value.totalBytes};
}
async function verifyReview(root, review) {
  if (!plain(review) || review.schema !== CAPTURED_HANDOVER_REVIEW_SCHEMA ||
      !HASH.test(review.requestSha256 ?? '') || !Array.isArray(review.packages) || !Array.isArray(review.sources) ||
      review.packages.length > MAX_MEMBERS || review.sources.length > MAX_MEMBERS)
    fail('CAPTURED_HANDOVER_INVALID', 'Use the complete original handover review.');
  title(review.label); fileRows(review.files);
  if (review.totalBytes !== review.files.reduce((total,row) => total + row.bytes,0))
    fail('CAPTURED_HANDOVER_INVALID', 'The complete handover byte count changed.');
  const declared = [], sourceMap = new Map();
  for (const source of review.sources) {
    sourceSelection({kind:source.kind,id:source.id});
    if (source.path !== 'sources/' + sourceKey(source) || sourceMap.has(sourceKey(source)))
      fail('CAPTURED_HANDOVER_INVALID', 'The original captured source path is repeated or changed.');
    const snapshot = await sourceSnapshot(join(root,source.path),source.kind);
    requiredSource(snapshot.view,{...source,revisions:source.requiredRevisions});
    if (canonical(snapshot.view.files) !== canonical(source.files) ||
        canonical(snapshot.view.revisions) !== canonical(source.revisions) ||
        canonical(snapshot.view.previousRevisions) !== canonical(source.previousRevisions) ||
        snapshot.view.sourceBytes !== source.sourceBytes || canonical(snapshot.view.lineage) !== canonical(source.lineage))
      fail('CAPTURED_HANDOVER_CHANGED', 'The complete original source history changed.');
    sourceMap.set(sourceKey(source),{source,snapshot});
    declared.push(...source.files.map(row => ({...row,name:source.path + '/' + row.name})));
  }
  const packages = new Set();
  for (const member of review.packages) {
    packageName(member.name);
    if (member.path !== 'packages/' + member.name || packages.has(member.name))
      fail('CAPTURED_HANDOVER_INVALID', 'The original merchant package path is repeated or changed.');
    packages.add(member.name);
    const manifestBytes = await bytes(join(root,member.path),PACKAGE_EXPORT_MANIFEST,METADATA_LIMIT);
    const manifest = parseMerchantPackageExport(manifestBytes);
    if (member.manifestFile?.name !== PACKAGE_EXPORT_MANIFEST ||
        digest(manifestBytes) !== member.manifestFile.sha256 || manifestBytes.length !== member.manifestFile.bytes ||
        canonical(manifest.package) !== canonical(member.package) || manifest.exportId !== member.exportId ||
        canonical(ordered([...manifest.files,member.manifestFile])) !== canonical(member.files))
      fail('CAPTURED_HANDOVER_CHANGED', 'The original merchant export manifest changed.');
    await inspectPackageFiles(join(root,'packages'),member.name,manifest);
    if (member.capturedSource) {
      const source = sourceMap.get(sourceKey(member.capturedSource));
      if (!source) fail('CAPTURED_HANDOVER_INCOMPLETE', 'A selected merchant is missing its original captured source.');
      await assertCapturedPackage(root,source.source,member,source.snapshot);
    }
    declared.push(...member.files.map(row => ({...row,name:member.path + '/' + row.name})));
  }
  declared.push(await fileRow(root,'READ-ME.md',METADATA_LIMIT));
  if (canonical(ordered(declared)) !== canonical(review.files))
    fail('CAPTURED_HANDOVER_INCOMPLETE', 'The complete native member roster changed.');
  await verifyFiles(root,review.files);
  return review;
}
/** Copies and reopens full native artifacts before the operator approves the collection. */
export async function prepareCapturedHandover({directory:productDirectory,out,request}) {
  const profile = await readCapturedApi(productDirectory), selected = normalizeRequest(request);
  out = absolute(out);
  if (inside(profile.projectsDirectory,out) || inside(out,profile.directory) || inside(out,profile.projectsDirectory))
    fail('CAPTURED_HANDOVER_DIRECTORY', 'Choose a separate private handover output outside the original project tree.');
  return operation(out,async root => {
    await requireEmptyOperation(root,'operation.json');
    let retained = await readJSON(root,'operation.json',true);
    if (retained) {
      if (retained.schema !== OPERATION_SCHEMA || canonical(retained.request) !== canonical(selected) ||
          canonical(retained.product) !== canonical(productIdentity(profile)))
        fail('CAPTURED_HANDOVER_CONFLICT', 'Continue this output with its original product and selection.');
    }
    let pendingClient;
    const getClient = () => pendingClient ??= connected(profile);
    if (!retained) {
      retained = {schema:OPERATION_SCHEMA,createdAt:new Date().toISOString(),product:productIdentity(profile),
        request:selected,selected:await resolveSelection(profile,selected,await getClient())};
      await publishJSON(root,'operation.json',retained);
    }
    const oldReview = await readJSON(root,'handover-review.json',true);
    if (oldReview) {
      if (oldReview.requestSha256 !== digest(encode(retained)))
        fail('CAPTURED_HANDOVER_CHANGED', 'The completed review belongs to another original selection.');
      await verifyReview(root,oldReview);
      const original = await bytes(root,'handover-review.json',METADATA_LIMIT);
      return {state:'PREPARED',directory:root,reviewSha256:digest(original),review:oldReview,reused:true};
    }
    const packages = [], sources = [];
    for (const row of retained.selected.packages) packages.push(await packageMember(root,row,profile,getClient));
    for (const row of retained.selected.sources) sources.push(await sourceMember(root,row,getClient));
    const value = {schema:CAPTURED_HANDOVER_REVIEW_SCHEMA,label:selected.label,createdAt:retained.createdAt,
      requestSha256:digest(encode(retained)),sourceProduct:{name:profile.name},packages,sources};
    await publishBytes(root,'READ-ME.md',Buffer.from(readme(value)));
    const files = [];
    for (const member of [...packages,...sources])
      files.push(...member.files.map(row => ({...row,name:member.path + '/' + row.name})));
    files.push(await fileRow(root,'READ-ME.md',METADATA_LIMIT));
    const review = {...value,files:ordered(files),totalBytes:files.reduce((total,row) => total + row.bytes,0)};
    await verifyReview(root,review);
    await publishJSON(root,'handover-review.json',review);
    const reviewBytes = await bytes(root,'handover-review.json',METADATA_LIMIT);
    return {state:'PREPARED',directory:root,reviewSha256:digest(reviewBytes),review,reused:false};
  },{create:true});
}
/** Finalize the reviewed complete collection. The sender may already be stopped or relocated. */
export async function publishCapturedHandover({out,expectedReviewSha256}) {
  hash(expectedReviewSha256,'review');
  return operation(out,async root => {
    const original = await bytes(root,'handover-review.json',METADATA_LIMIT);
    if (digest(original) !== expectedReviewSha256)
      fail('CAPTURED_HANDOVER_CHANGED', 'Review this original completed collection before publishing it.');
    const review = await verifyReview(root,decode(original));
    const selected = await readJSON(root,'operation.json');
    if (selected.schema !== OPERATION_SCHEMA || review.requestSha256 !== digest(encode(selected)))
      fail('CAPTURED_HANDOVER_CHANGED', 'Publish the review of this retained original selection.');
    const core = reviewCore(review), handoverId = digest(Buffer.from(canonical(core)));
    const manifest = {...core,schema:CAPTURED_HANDOVER_SCHEMA,handoverId,reviewSha256:expectedReviewSha256,
      reviewFile:{name:'handover-review.json',bytes:original.length,sha256:expectedReviewSha256}};
    const existed = await present(join(root,'handover.json'));
    await publishJSON(root,'handover.json',manifest);
    const manifestBytes = await bytes(root,'handover.json',METADATA_LIMIT);
    return {state:'PUBLISHED',directory:root,handoverId,manifestSha256:digest(manifestBytes),
      packages:manifest.packages.length,sources:manifest.sources.length,
      files:manifest.files.length,totalBytes:manifest.totalBytes,reused:existed};
  });
}
export async function inspectCapturedHandover({bundle,expectedManifestSha256}) {
  const root = await directory(bundle), original = await bytes(root,'handover.json',METADATA_LIMIT);
  const manifestSha256 = digest(original);
  if (expectedManifestSha256 !== undefined && hash(expectedManifestSha256,'handover manifest') !== manifestSha256)
    fail('CAPTURED_HANDOVER_CHANGED', 'Use the exact original published handover manifest.');
  const manifest = decode(original);
  if (manifest.schema !== CAPTURED_HANDOVER_SCHEMA || !HASH.test(manifest.handoverId ?? '') ||
      manifest.reviewFile?.name !== 'handover-review.json')
    fail('CAPTURED_HANDOVER_INVALID', 'Use a complete published captured merchant handover.');
  const reviewBytes = await bytes(root,'handover-review.json',METADATA_LIMIT), review = decode(reviewBytes);
  if (digest(reviewBytes) !== manifest.reviewSha256 || digest(reviewBytes) !== manifest.reviewFile.sha256 ||
      reviewBytes.length !== manifest.reviewFile.bytes || canonical(reviewCore(review)) !==
      canonical(reviewCore({...manifest,schema:CAPTURED_HANDOVER_REVIEW_SCHEMA})) ||
      digest(Buffer.from(canonical(reviewCore(review)))) !== manifest.handoverId)
    fail('CAPTURED_HANDOVER_CHANGED', 'The original complete handover review changed.');
  await verifyReview(root,review);
  return {state:'PUBLISHED',directory:root,handoverId:manifest.handoverId,manifestSha256,manifest,
    packages:manifest.packages.length,sources:manifest.sources.length,
    files:manifest.files.length,totalBytes:manifest.totalBytes};
}

function nameMappings(manifest, value = {}) {
  if (!plain(value) || Object.keys(value).some(name => !manifest.packages.some(row => row.name === name)))
    fail('CAPTURED_HANDOVER_INPUT', 'Map only original selected merchant names.');
  const rows = manifest.packages.map(row => ({name:row.name,
    targetName:packageName(Object.hasOwn(value,row.name) ? value[row.name] : row.name)}));
  if (new Set(rows.map(row => row.targetName)).size !== rows.length)
    fail('CAPTURED_HANDOVER_INPUT', 'Choose distinct receiving merchant names.');
  return rows;
}
const nativeManifest = member => {
  // The original native package closure uses binary file-name order, including RUN.md.
  const files = member.files.filter(row => row.name !== PACKAGE_EXPORT_MANIFEST)
    .sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return {package:member.package,files,totalBytes:files.reduce((total,row) => total + row.bytes,0)};
};
function receivingBinding(profile, inspected, names) {
  return {schema:CAPTURED_HANDOVER_RECEIVE_SCHEMA,handoverId:inspected.handoverId,
    manifestSha256:inspected.manifestSha256,product:productIdentity(profile),names};
}
function receivingId(binding) { return digest(Buffer.from(canonical(binding))); }
function targetSource(profile, source) {
  return join(profile.projectsDirectory,'.har-captures',source.kind,source.id);
}
async function inspectTargetSource(profile, source, {complete = false} = {}) {
  const target = targetSource(profile,source);
  if (!await present(target)) return {state:'NEW',selection:{kind:source.kind,id:source.id}};
  try {
    const current = (await sourceSnapshot(target,source.kind)).view;
    requiredSource(current,{kind:source.kind,id:source.id,sourceSha256:source.sourceSha256});
    includesFiles(current.files,complete ? source.files :
      source.files.filter(row => !/(^|\/)reviews\//.test(row.name)));
    return {state:source.revisions.every(revision => current.revisions.includes(revision)) &&
        source.previousRevisions.every(revision => current.previousRevisions.includes(revision)) ? 'REUSED' : 'MERGE_REVIEWS',
      selection:{kind:source.kind,id:source.id},sourceSha256:current.sourceSha256,
      retainedReviews:current.revisions.length,retainedPreviousReviews:current.previousRevisions.length};
  } catch (error) {
    if (error.code === 'ENOENT' && (await readdir(target)).length === 0)
      return {state:'NEW',selection:{kind:source.kind,id:source.id}};
    if (complete) throw error;
    return {state:'SOURCE_CONFLICT',selection:{kind:source.kind,id:source.id},
      error:{code:error.code ?? 'SOURCE_CONFLICT',message:error.message}};
  }
}
async function receivingReview(profile, inspected, names) {
  const packages = [], sources = [];
  for (const source of inspected.manifest.sources) sources.push(await inspectTargetSource(profile,source));
  for (const row of names) {
    const member = inspected.manifest.packages.find(item => item.name === row.name);
    if (!await present(join(profile.projectsDirectory,row.targetName))) {
      packages.push({...row,state:'NEW',package:member.package}); continue;
    }
    try {
      const current = await inspectPackageFiles(profile.projectsDirectory,row.targetName,nativeManifest(member));
      packages.push({...row,state:'REUSED',package:current.package});
    } catch (error) {
      packages.push({...row,state:'NAME_CONFLICT',incoming:member.package,
        error:{code:error.code ?? 'NAME_CONFLICT',message:error.message}});
    }
  }
  const binding = receivingBinding(profile,inspected,names);
  return {schema:CAPTURED_HANDOVER_RECEIVE_SCHEMA,state:
      sources.some(row => row.state === 'SOURCE_CONFLICT') || packages.some(row => row.state === 'NAME_CONFLICT')
        ? 'CONFLICT' : 'READY',
    operationId:receivingId(binding),reviewSha256:digest(encode(binding)),binding,
    packages,sources,handoverId:inspected.handoverId,manifestSha256:inspected.manifestSha256,
    directory:profile.directory,projectsDirectory:profile.projectsDirectory};
}
/** Review named receiving conflicts and immutable source matches without changing the target. */
export async function reviewCapturedHandoverReceive({directory:productDirectory,bundle,expectedManifestSha256,names}) {
  const profile = await readCapturedApi(productDirectory);
  const inspected = await inspectCapturedHandover({bundle,expectedManifestSha256});
  return receivingReview(profile,inspected,nameMappings(inspected.manifest,names));
}
async function receivingRoot(profile, id, create = false) {
  hash(id,'receiving operation');
  const parent = await directory(join(profile.receivingDirectory,'handovers'),create);
  return directory(join(parent,id),create);
}
async function verifyReceived(profile, manifest, names) {
  for (const source of manifest.sources) {
    const current = await inspectTargetSource(profile,source,{complete:true});
    if (current.state === 'NEW' || current.state === 'MERGE_REVIEWS')
      fail('CAPTURED_HANDOVER_INCOMPLETE', 'The original receiving source is incomplete.');
  }
  for (const row of names) {
    const member = manifest.packages.find(item => item.name === row.name);
    await inspectPackageFiles(profile.projectsDirectory,row.targetName,nativeManifest(member));
  }
}
async function originalReceiving(root, profile) {
  const request = await readJSON(root,'operation.json');
  if (request.schema !== CAPTURED_HANDOVER_RECEIVE_SCHEMA ||
      canonical(request.product) !== canonical(productIdentity(profile)) || receivingId(request) !== root.split('/').at(-1))
    fail('CAPTURED_HANDOVER_CONFLICT', 'Open this receiving operation in its original product.');
  let manifestBytes;
  try {manifestBytes = await bytes(root,'original-handover.json',METADATA_LIMIT);}
  catch (error) {
    if (error.code === 'ENOENT') return {request,manifest:null};
    throw error;
  }
  if (digest(manifestBytes) !== request.manifestSha256)
    fail('CAPTURED_HANDOVER_CHANGED', 'The retained original receiving manifest changed.');
  const manifest = decode(manifestBytes);
  if (manifest.schema !== CAPTURED_HANDOVER_SCHEMA || manifest.handoverId !== request.handoverId)
    fail('CAPTURED_HANDOVER_CHANGED', 'The retained original handover identity changed.');
  nameMappings(manifest,Object.fromEntries(request.names.map(row => [row.name,row.targetName])));
  return {request,manifest};
}
/** Native copy/adopt and native package receiving keep all original state writers and IDs. */
export async function receiveCapturedHandover({directory:productDirectory,bundle,expectedManifestSha256,
  expectedReviewSha256,names}) {
  hash(expectedReviewSha256,'receiving review');
  const profile = await readCapturedApi(productDirectory);
  const inspected = await inspectCapturedHandover({bundle,expectedManifestSha256});
  const mapping = nameMappings(inspected.manifest,names), review = await receivingReview(profile,inspected,mapping);
  if (review.reviewSha256 !== expectedReviewSha256)
    fail('CAPTURED_HANDOVER_CHANGED', 'Use the exact review of this handover and receiving product.');
  if (review.state !== 'READY') fail('CAPTURED_HANDOVER_CONFLICT',
    'Resolve the displayed original source or merchant-name conflict before receiving this collection.');
  const root = await receivingRoot(profile,review.operationId,true);
  return operation(root,async current => {
    await requireEmptyOperation(current,'operation.json');
    await publishJSON(current,'operation.json',review.binding);
    const manifestBytes = await bytes(inspected.directory,'handover.json',METADATA_LIMIT);
    if (digest(manifestBytes) !== inspected.manifestSha256)
      fail('CAPTURED_HANDOVER_CHANGED', 'The published handover changed while receiving.');
    await publishBytes(current,'original-handover.json',manifestBytes);
    const completed = await readJSON(current,'received.json',true);
    if (completed) {
      await verifyReceived(profile,inspected.manifest,mapping);
      return {...completed,reused:true};
    }
    let pendingClient;
    const getClient = () => pendingClient ??= connected(profile);
    const sources = [], packages = [];
    for (const source of inspected.manifest.sources) {
      const phaseName = 'records/source-' + sourceKey(source) + '.json';
      let saved = await readJSON(current,phaseName,true);
      let reusable = false;
      if (saved) {
        const checked = await inspectTargetSource(profile,source,{complete:true});
        reusable = checked.state === 'REUSED';
      }
      if (!reusable) {
        const adopted = await (await getClient()).json('/api/har/adopt',{
          kind:source.kind,directory:join(inspected.directory,source.path),label:source.label,
        });
        const checked = await inspectTargetSource(profile,source,{complete:true});
        if (checked.state !== 'REUSED') fail('CAPTURED_HANDOVER_INCOMPLETE', 'The native source receiving has not completed.');
        const value = {selection:{kind:source.kind,id:source.id},sourceSha256:source.sourceSha256,
          revisions:source.revisions,previousRevisions:source.previousRevisions,native:adopted};
        if (!saved) {await publishJSON(current,phaseName,value);saved=value;}
      }
      sources.push({selection:saved.selection,sourceSha256:saved.sourceSha256,
        revisions:saved.revisions,previousRevisions:saved.previousRevisions,record:phaseName});
    }
    for (const row of mapping) {
      const member = inspected.manifest.packages.find(item => item.name === row.name);
      const phaseName = 'records/package-' + row.name + '.json';
      let saved = await readJSON(current,phaseName,true), reusable = false;
      if (saved && await present(join(profile.projectsDirectory,row.targetName))) {
        await inspectPackageFiles(profile.projectsDirectory,row.targetName,nativeManifest(member)); reusable = true;
      }
      if (!reusable) {
        const received = await (await getClient()).json('/api/package-transfer/receive',{
          directory:join(inspected.directory,member.path),name:row.targetName,
          expectedManifestSha256:member.manifestFile.sha256,
        });
        const original = await inspectPackageFiles(profile.projectsDirectory,row.targetName,nativeManifest(member));
        const value = {...row,package:original.package,exportId:member.exportId,native:received};
        if (!saved) {await publishJSON(current,phaseName,value);saved=value;}
      }
      packages.push({...row,package:saved.package,exportId:saved.exportId,record:phaseName});
    }
    await verifyReceived(profile,inspected.manifest,mapping);
    const result = {schema:CAPTURED_HANDOVER_RECEIVE_SCHEMA,state:'RECEIVED',operationId:review.operationId,
      handoverId:inspected.handoverId,manifestSha256:inspected.manifestSha256,
      directory:profile.directory,projectsDirectory:profile.projectsDirectory,recordDirectory:current,
      sources,packages,reopen:{product:profile.directory,consoleUrlFile:profile.console.urlFile,
        workspace:'merchant',packageNames:mapping.map(row => row.targetName)},reused:false};
    await publishJSON(current,'received.json',result);
    return result;
  });
}
/** Reopen native receiving after restart, including after the original bundle has moved away. */
export async function inspectCapturedHandoverReceive({directory:productDirectory,operationId}) {
  const profile = await readCapturedApi(productDirectory), root = await receivingRoot(profile,operationId);
  const {request,manifest} = await originalReceiving(root,profile);
  if (!manifest) return {schema:CAPTURED_HANDOVER_RECEIVE_SCHEMA,state:'RECEIVING',operationId,
    handoverId:request.handoverId,manifestSha256:request.manifestSha256,
    directory:profile.directory,recordDirectory:root,pendingRecord:'original-handover.json',
    continuation:'Repeat receive with the original complete handover and review.'};
  const result = await readJSON(root,'received.json',true);
  if (result) {
    await verifyReceived(profile,manifest,request.names);
    return {...result,reused:true};
  }
  const sources = [], packages = [];
  for (const source of manifest.sources) {
    const phase = await readJSON(root,'records/source-' + sourceKey(source) + '.json',true);
    if (phase) {
      const current = await inspectTargetSource(profile,source,{complete:true});
      sources.push({selection:phase.selection,state:current.state});
    } else sources.push({selection:{kind:source.kind,id:source.id},state:'PENDING'});
  }
  for (const row of request.names) {
    const phase = await readJSON(root,'records/package-' + row.name + '.json',true);
    if (phase) {
      const member = manifest.packages.find(item => item.name === row.name);
      await inspectPackageFiles(profile.projectsDirectory,row.targetName,nativeManifest(member));
    }
    packages.push({...row,state:phase?'RECEIVED':'PENDING'});
  }
  return {schema:CAPTURED_HANDOVER_RECEIVE_SCHEMA,state:'RECEIVING',operationId,
    handoverId:request.handoverId,manifestSha256:request.manifestSha256,
    directory:profile.directory,recordDirectory:root,sources,packages};
}
