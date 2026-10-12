// MIT. Whole Captured API operating capture, native restore and original-path receiving.
import { lstat, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { run as recover } from '../../../stellar/scf-starforge-20261009/sf101-merchant-recovery/recover.mjs';
import { readCapturedBundle, runLocalCapture } from '../../../stellar/scf-starforge-20261009/sf101-merchant-recovery/workspace/local.mjs';
import { operation } from '../handover-files.mjs';
import { readCapturedApi } from '../workspace.mjs';
import { prepareCapturedHandoverRecovery, applyCapturedHandoverRecovery } from '../handover-recovery-files.mjs';
import { RECEIVING_SCHEMA, OPERATION_SCHEMA, PLAN_ROOT, MAX_PLAN, MAX_MANIFEST, HASH,
  absolute, passEnv, identity, digest, bytes, copy, parse, need, failure, stamp, inside, overlap,
  typedPlan, inspectCapturedRecoveryManifest, targets, rootEntries, relativeName } from './model.mjs';
import { directory, present, readFile, readRecord, withRecord, verifyRoot, ownedDirectory,
  withParentLeases, placeRoot, retireRestore, requireOwner, inode, syncDirectory } from './files.mjs';
import { withCapturedRecoveryCapture, withCapturedRecoveryOwners, validateRecoveredCapturedProduct } from './source.mjs';
export { inspectCapturedRecovery, prepareCapturedRecoveryPlan, inspectCapturedRecoveryPlan } from './source.mjs';
export { SELECTION_SCHEMA, PROFILE_SCHEMA, TARGET_SCHEMA, RECEIVING_SCHEMA,
  inspectCapturedRecoveryManifest } from './model.mjs';

function retainedBytes(value, expected, maximum) {
  need(typeof value === 'string', 'CAPTURED_RECOVERY_RETAINED_BYTES');
  const raw = Buffer.from(value, 'base64');
  need(raw.length <= maximum && raw.toString('base64') === value && digest(raw) === expected,
    'CAPTURED_RECOVERY_RETAINED_BYTES', 'Keep the exact complete original retained source bytes.');
  return raw;
}
async function manifestFile(bundleDirectory, expectedManifestSha256) {
  absolute(bundleDirectory); await directory(bundleDirectory);
  const raw = await readFile(join(bundleDirectory, 'manifest.json'), MAX_MANIFEST);
  const sha256 = digest(raw);
  need(expectedManifestSha256 === undefined || HASH.test(expectedManifestSha256) &&
    sha256 === expectedManifestSha256, 'CAPTURED_RECOVERY_SNAPSHOT_CHANGED');
  const manifest = parse(raw, 'SF101 snapshot manifest');
  need(manifest.schema === 'stellar-forge.merchant-recovery.v1' &&
    manifest.capture?.schema === 'stellar-forge.merchant-recovery-capture.v1' &&
    HASH.test(manifest.capture.id) && HASH.test(manifest.capture.planSha256) &&
    Array.isArray(manifest.roots) && manifest.roots.some(row => row.name === PLAN_ROOT && row.kind === 'file'),
  'CAPTURED_RECOVERY_SNAPSHOT', 'Select an original Captured API typed snapshot.');
  return { raw, manifest, snapshotSha256: sha256 };
}
export async function verifyCapturedRecovery({ bundleDirectory, passphraseEnv, expectedManifestSha256 } = {}) {
  passEnv(passphraseEnv);
  const original = await manifestFile(bundleDirectory, expectedManifestSha256);
  const native = await recover(['verify', '--bundle', bundleDirectory, '--pass-env', passphraseEnv]);
  need(native.status === 'SNAPSHOT_VERIFIED' &&
    digest(await readFile(join(bundleDirectory, 'manifest.json'), MAX_MANIFEST)) === original.snapshotSha256,
  'CAPTURED_RECOVERY_SNAPSHOT_CHANGED');
  return { status: 'CAPTURED_RECOVERY_VERIFIED', bundleDirectory,
    snapshotSha256: original.snapshotSha256, planSha256: original.manifest.capture.planSha256,
    captureId: original.manifest.capture.id, files: native.files, bytes: native.bytes, original: native };
}
/** Exact original capture retries reuse native verification before inspecting later source edits. */
export async function captureCapturedRecovery({ planFile, bundleDirectory, operationDirectory,
  passphraseEnv, expectedPlanSha256, quiesced = false } = {}, { environment = process.env } = {}) {
  absolute(planFile); absolute(bundleDirectory); absolute(operationDirectory); passEnv(passphraseEnv);
  need(HASH.test(expectedPlanSha256), 'CAPTURED_RECOVERY_PLAN_REVIEW',
    'Supply the complete reviewed plan SHA-256.', 400);
  need(!overlap(bundleDirectory, operationDirectory) && !inside(operationDirectory, planFile) &&
    !inside(bundleDirectory, planFile), 'CAPTURED_RECOVERY_OPERATION_OVERLAP');
  await directory(dirname(bundleDirectory));
  const input = { planFile, bundleDirectory, operationDirectory, passphraseEnv, expectedPlanSha256 };
  return withRecord(operationDirectory, 'CAPTURE', input, async () => {
    const raw = await readFile(planFile, MAX_PLAN), { profile } = typedPlan(raw);
    need(digest(raw) === expectedPlanSha256 && profile.planFile === planFile, 'CAPTURED_RECOVERY_PLAN_CHANGED');
    for (const root of profile.roots) need(!overlap(root.path, operationDirectory) &&
      !overlap(root.path, bundleDirectory), 'CAPTURED_RECOVERY_OPERATION_OVERLAP');
    requireOwner(profile.owner);
    return { planBase64: raw.toString('base64') };
  }, async ({ record, state, save }) => {
    const raw = retainedBytes(record.retained.planBase64, expectedPlanSha256, MAX_PLAN);
    const { profile } = typedPlan(raw);
    const options = { plan: planFile, out: bundleDirectory, passEnv: passphraseEnv, expectedPlanSha256,
      captureId: identity({ schema: OPERATION_SCHEMA, kind: 'CAPTURE', inputSha256: record.inputSha256 }),
      captureKind: 'generic' };
    state.native ??= {};
    const found = await readCapturedBundle(options);
    const run = () => runLocalCapture({ options, state: state.native, save, allowCapture: quiesced === true });
    let result;
    if (found && !state.native.pendingRetirement) result = await run();
    else {
      need(quiesced === true, 'CAPTURED_RECOVERY_QUIESCENCE',
        'Keep the original selected writers stopped while the incomplete capture continues.', 400);
      requireOwner(profile.owner);
      result = await withCapturedRecoveryCapture({ planFile, expectedPlanSha256 }, run, { environment });
    }
    const complete = await readCapturedBundle(options);
    need(result.verified === true && complete, 'CAPTURED_RECOVERY_CAPTURE_INCOMPLETE');
    const matched = inspectCapturedRecoveryManifest({ planBytes: raw, manifest: complete.manifest });
    if (state.result) {
      need(state.result.snapshotSha256 === complete.snapshotId, 'CAPTURED_RECOVERY_SNAPSHOT_CHANGED');
    } else {
      state.result = { status: 'CAPTURED_RECOVERY_CAPTURED', bundleDirectory, operationDirectory,
        snapshotSha256: complete.snapshotId, planSha256: expectedPlanSha256,
        profileSha256: matched.profileSha256, captureId: matched.captureId,
        product: copy(profile.product), summary: copy(profile.summary), runtime: copy(profile.runtime),
        files: complete.manifest.fileCount, bytes: complete.manifest.totalPlainBytes,
        completedAt: stamp(), original: copy(result) };
    }
    state.phase = 'COMPLETE'; state.error = null; await save();
    return copy(state.result);
  });
}
function originalRestore(record, state, operationDirectory) {
  need(record.kind === 'RESTORE' && state?.result?.status === 'CAPTURED_RECOVERY_RESTORED' &&
    state.authenticated === true, 'CAPTURED_RECOVERY_RESTORE_INCOMPLETE',
  'Complete the original native restore before selecting it for receiving.');
  const raw = retainedBytes(record.retained.manifestBase64, record.input.expectedManifestSha256, MAX_MANIFEST);
  const manifest = parse(raw), planBytes = retainedBytes(state.planBase64, manifest.capture.planSha256, MAX_PLAN);
  const { profile } = typedPlan(planBytes);
  const matched = inspectCapturedRecoveryManifest({ planBytes, manifest });
  need(state.result.snapshotSha256 === record.input.expectedManifestSha256 &&
    state.result.planSha256 === matched.planSha256 &&
    state.result.restoreDirectory === join(operationDirectory, 'restored'),
  'CAPTURED_RECOVERY_RESTORE_CHANGED');
  return { manifest, manifestBytes: raw, planBytes, profile, matched,
    snapshotSha256: record.input.expectedManifestSha256,
    restoreDirectory: state.result.restoreDirectory, restoreOperation: operationDirectory,
    restoreOwner: state.restoreOwner };
}
async function verifyRestoreDirectory(manifest, path) {
  await directory(path);
  need(identity((await readdir(path)).sort()) === identity(manifest.roots.map(row => row.name).sort()),
    'CAPTURED_RECOVERY_RESTORE_EXTRA_FILES', 'Keep the complete native restore separate from its operation journal.');
  for (const root of manifest.roots) await verifyRoot(join(path, root.name), rootEntries(manifest, root.name));
  const planBytes = await readFile(join(path, PLAN_ROOT), MAX_PLAN);
  const matched = inspectCapturedRecoveryManifest({ planBytes, manifest });
  return { planBytes, matched, profile: typedPlan(planBytes).profile };
}
async function restoredContext(operationDirectory, verify = true) {
  absolute(operationDirectory);
  return operation(operationDirectory, async () => {
    const { record, state } = await readRecord(operationDirectory);
    const ctx = originalRestore(record, state, operationDirectory);
    if (verify) {
      const found = await verifyRestoreDirectory(ctx.manifest, ctx.restoreDirectory);
      need(digest(found.planBytes) === digest(ctx.planBytes), 'CAPTURED_RECOVERY_RESTORE_CHANGED');
      if (ctx.restoreOwner) need(identity(inode(await lstat(ctx.restoreDirectory, { bigint: true }))) ===
        identity(ctx.restoreOwner), 'CAPTURED_RECOVERY_RESTORE_REPLACED');
    }
    return ctx;
  });
}
/** The native restore lives inside its own retained operation. Interrupted native attempts
 * are preserved there, and a complete original restore reopens without the source bundle. */
export async function restoreCapturedRecovery({ bundleDirectory, operationDirectory,
  passphraseEnv, expectedManifestSha256 } = {}) {
  absolute(bundleDirectory); absolute(operationDirectory); passEnv(passphraseEnv);
  need(HASH.test(expectedManifestSha256) && !overlap(bundleDirectory, operationDirectory),
    'CAPTURED_RECOVERY_RESTORE_SELECTION');
  const input = { bundleDirectory, operationDirectory, passphraseEnv, expectedManifestSha256 };
  return withRecord(operationDirectory, 'RESTORE', input, async () => {
    const selected = await manifestFile(bundleDirectory, expectedManifestSha256);
    return { manifestBase64: selected.raw.toString('base64') };
  }, async ({ root, record, state, save }) => {
    const raw = retainedBytes(record.retained.manifestBase64, expectedManifestSha256, MAX_MANIFEST);
    const manifest = parse(raw), restoreDirectory = join(root, 'restored');
    if (state.result) {
      const ctx = originalRestore(record, state, root);
      await verifyRestoreDirectory(ctx.manifest, ctx.restoreDirectory);
      need(identity(inode(await lstat(ctx.restoreDirectory, { bigint: true }))) === identity(state.restoreOwner),
        'CAPTURED_RECOVERY_RESTORE_REPLACED');
      return copy(state.result);
    }
    if (state.pendingRetirement) await retireRestore({ root, path: restoreDirectory, state, save });
    let native = null, inspected, reused = false;
    if (await present(restoreDirectory)) {
      need(state.restoreIntent === true, 'CAPTURED_RECOVERY_RESTORE_OWNER',
        'This destination is outside the retained original native restore.');
      // A process can end after the native restore completes and before its
      // result is saved. Authenticate that same snapshot before accepting it.
      await verifyCapturedRecovery({ bundleDirectory, passphraseEnv, expectedManifestSha256 });
      try {
        inspected = await verifyRestoreDirectory(manifest, restoreDirectory); reused = true;
      } catch (error) {
        const incomplete = error.code === 'ENOENT' || [
          'CAPTURED_RECOVERY_RESTORE_EXTRA_FILES', 'CAPTURED_RECOVERY_RESTORED_SOURCE_CHANGED',
          'CAPTURED_RECOVERY_PLAN_CHANGED', 'CAPTURED_RECOVERY_JSON', 'CAPTURED_RECOVERY_PROFILE',
          'CAPTURED_RECOVERY_FILE', 'CAPTURED_RECOVERY_MANIFEST', 'CAPTURED_RECOVERY_CAPTURE_CHANGED',
          'CAPTURED_RECOVERY_TREE', 'CAPTURED_RECOVERY_TREE_PARENT',
        ].includes(error.code);
        if (!incomplete) throw error;
        await retireRestore({ root, path: restoreDirectory, state, save });
      }
    }
    if (!inspected) {
      await manifestFile(bundleDirectory, expectedManifestSha256);
      state.phase = 'RESTORING'; state.restoreIntent = true; state.attempts = (state.attempts ?? 0) + 1;
      await save();
      native = await recover(['restore', '--bundle', bundleDirectory, '--out', restoreDirectory,
        '--pass-env', passphraseEnv]);
      need(native.status === 'RESTORED_TO_NEW_DIR' &&
        digest(await readFile(join(bundleDirectory, 'manifest.json'), MAX_MANIFEST)) === expectedManifestSha256,
      'CAPTURED_RECOVERY_SNAPSHOT_CHANGED');
      inspected = await verifyRestoreDirectory(manifest, restoreDirectory);
    }
    state.authenticated = true; state.planBase64 = inspected.planBytes.toString('base64');
    state.restoreOwner = inode(await lstat(restoreDirectory, { bigint: true }));
    state.phase = 'COMPLETE'; state.error = null;
    state.result = { status: 'CAPTURED_RECOVERY_RESTORED', operationDirectory: root, restoreDirectory,
      snapshotSha256: expectedManifestSha256, planSha256: inspected.matched.planSha256,
      profileSha256: inspected.matched.profileSha256, captureId: inspected.matched.captureId,
      product: copy(inspected.profile.product), summary: copy(inspected.profile.summary),
      runtime: copy(inspected.profile.runtime), files: manifest.fileCount, bytes: manifest.totalPlainBytes,
      completedAt: stamp(), original: { restore: native, reused } };
    await syncDirectory(restoreDirectory); await syncDirectory(root); await save();
    return copy(state.result);
  });
}
async function receivingSelection(ctx, targetFile, operationDirectory) {
  absolute(targetFile); absolute(operationDirectory);
  const targetBytes = await readFile(targetFile, MAX_PLAN);
  const selected = targets(parse(targetBytes, 'original receiving targets'), ctx.matched.planSha256);
  const parents = [];
  for (const parent of selected.destinationParents)
    parents.push({ directory: parent, ...await ownedDirectory(parent, ctx.profile.owner) });
  const roots = ctx.profile.roots.map(root => ({ ...root, destination: root.path,
    restored: join(ctx.restoreDirectory, root.name), source: copy(ctx.profile.source.trees[root.name]) }));
  for (const root of roots) {
    need(selected.destinationParents.some(parent => parent !== root.destination && inside(parent, root.destination)),
      'CAPTURED_RECOVERY_TARGET_OUTSIDE_SELECTION', 'Every original root must be inside a selected private receiving parent.');
    need(!overlap(root.destination, operationDirectory) && !overlap(root.destination, ctx.restoreOperation) &&
      !inside(root.destination, targetFile) && !overlap(root.destination, ctx.profile.runtime.sourceDirectory),
    'CAPTURED_RECOVERY_TARGET_OVERLAP');
  }
  need(!overlap(operationDirectory, ctx.restoreOperation) && !inside(operationDirectory, targetFile),
    'CAPTURED_RECOVERY_OPERATION_OVERLAP');
  const review = { schema: RECEIVING_SCHEMA, snapshotSha256: ctx.snapshotSha256,
    sourcePlanSha256: ctx.matched.planSha256, profileSha256: ctx.matched.profileSha256,
    restoreOperation: ctx.restoreOperation, restoreDirectory: ctx.restoreDirectory,
    targetFile, targetSha256: digest(targetBytes), operationDirectory,
    destinationParents: parents, owner: copy(ctx.profile.owner), product: copy(ctx.profile.product),
    roots, environmentFiles: copy(ctx.profile.summary.environmentFiles),
    directoryEnvironment: ctx.profile.summary.oauth.map(row => ({ name: row.directoryEnv, directory: row.directory })),
    runtime: copy(ctx.profile.runtime) };
  return { review, reviewSha256: identity(review), targetBytes };
}
function savedReceiving(record, state, input) {
  need(record.kind === 'RECEIVE' && record.inputSha256 === identity(input) &&
    record.retained.reviewSha256 === input.expectedReviewSha256 &&
    identity(record.retained.review) === input.expectedReviewSha256,
  'CAPTURED_RECOVERY_RECEIVING_CHANGED');
  return state?.result?.status === 'CAPTURED_RECOVERY_RECEIVED' ? state.result : null;
}
export async function reviewRecoveredCapturedApi({ restoreOperation, targetFile, operationDirectory } = {}) {
  const ctx = await restoredContext(restoreOperation);
  if (targetFile === undefined)
    return { status: 'CAPTURED_RECOVERY_RESTORE_INSPECTED', snapshotSha256: ctx.snapshotSha256,
      sourcePlanSha256: ctx.matched.planSha256, profileSha256: ctx.matched.profileSha256,
      product: copy(ctx.profile.product), summary: copy(ctx.profile.summary),
      source: copy(ctx.profile.source), runtime: copy(ctx.profile.runtime),
      targets: ctx.profile.roots.map(root => ({ name: root.name, path: root.path, kind: root.kind })) };
  const selected = await receivingSelection(ctx, targetFile, operationDirectory);
  let saved = null;
  if (await present(join(operationDirectory, 'operation.json'))) {
    const found = await operation(operationDirectory, () => readRecord(operationDirectory));
    const input = { restoreOperation, targetFile, operationDirectory, expectedReviewSha256: selected.reviewSha256 };
    savedReceiving(found.record, found.state, input); saved = found.state;
  }
  const availability = [];
  for (const root of selected.review.roots)
    availability.push({ name: root.name, path: root.destination,
      state: saved?.roots?.[root.name]?.phase ?? (await present(root.destination) ? 'EXISTING_TARGET' : 'ABSENT') });
  return { status: saved?.result ? 'CAPTURED_RECOVERY_RECEIVING_COMPLETE' : 'CAPTURED_RECOVERY_RECEIVING_REVIEW',
    review: selected.review, reviewSha256: selected.reviewSha256, availability,
    summary: copy(ctx.profile.summary), operation: saved ? { phase: saved.phase, error: saved.error ?? null,
      result: copy(saved.result ?? null) } : null };
}
function receivingContext(record) {
  const review = record.retained.review, raw = retainedBytes(record.retained.manifestBase64,
    review.snapshotSha256, MAX_MANIFEST), manifest = parse(raw);
  const planBytes = retainedBytes(record.retained.planBase64, review.sourcePlanSha256, MAX_PLAN);
  const { profile } = typedPlan(planBytes);
  const matched = inspectCapturedRecoveryManifest({ planBytes, manifest });
  need(matched.profileSha256 === review.profileSha256 && identity(record.retained.review) === record.retained.reviewSha256,
    'CAPTURED_RECOVERY_RECEIVING_CHANGED');
  return { review, manifest, planBytes, profile, matched };
}
function bindingAdditions(plan, root) {
  if (!plan) return [];
  need(Array.isArray(plan.files) && Array.isArray(plan.directories), 'CAPTURED_RECOVERY_BINDING_PLAN');
  const directories = plan.directories.filter(row => row.root === root.name).map(row => {
    relativeName(row.name);
    return { relative: row.name, kind: 'directory' };
  });
  return [...directories, ...plan.files.filter(row => row.root === root.name).map(row => {
    relativeName(row.name);
    const raw = retainedBytes(row.contentBase64, row.sha256, MAX_MANIFEST);
    need(raw.length === row.bytes, 'CAPTURED_RECOVERY_BINDING_PLAN');
    return { relative: row.name, kind: 'file', size: row.bytes, sha256: row.sha256 };
  })];
}
/** The immutable receiving request is resolved before any later source/config/clock read.
 * All original roots are placed before native restored-file bindings are published. */
export async function receiveRecoveredCapturedApi({ restoreOperation, targetFile, operationDirectory,
  expectedReviewSha256, quiesced = false } = {}) {
  absolute(restoreOperation); absolute(targetFile); absolute(operationDirectory);
  need(HASH.test(expectedReviewSha256), 'CAPTURED_RECOVERY_RECEIVING_REVIEW',
    'Use the complete original receiving review SHA-256.', 400);
  const input = { restoreOperation, targetFile, operationDirectory, expectedReviewSha256 };
  return withRecord(operationDirectory, 'RECEIVE', input, async () => {
    need(quiesced === true, 'CAPTURED_RECOVERY_QUIESCENCE',
      'Keep the receiving product and selected external writers stopped until placement completes.', 400);
    const ctx = await restoredContext(restoreOperation);
    const selected = await receivingSelection(ctx, targetFile, operationDirectory);
    need(selected.reviewSha256 === expectedReviewSha256, 'CAPTURED_RECOVERY_RECEIVING_REVIEW_CHANGED');
    requireOwner(ctx.profile.owner);
    return { review: selected.review, reviewSha256: selected.reviewSha256,
      targetBase64: selected.targetBytes.toString('base64'), manifestBase64: ctx.manifestBytes.toString('base64'),
      planBase64: ctx.planBytes.toString('base64') };
  }, async ({ record, state, save }) => {
    const completed = savedReceiving(record, state, input);
    if (completed) return copy(completed);
    need(quiesced === true, 'CAPTURED_RECOVERY_QUIESCENCE',
      'Keep these original receiving writers stopped while the same operation continues.', 400);
    const ctx = receivingContext(record), { review, manifest, profile } = ctx;
    requireOwner(profile.owner);
    if (await present(targetFile))
      need(digest(await readFile(targetFile, MAX_PLAN)) === review.targetSha256,
        'CAPTURED_RECOVERY_TARGETS_CHANGED', 'The present target declaration differs from the retained original request.');
    const parents = review.destinationParents.map(row => row.directory);
    return withParentLeases(parents, profile.owner, async () => {
      for (const parent of review.destinationParents) {
        const current = await ownedDirectory(parent.directory, profile.owner);
        need(current.device === parent.device && current.inode === parent.inode, 'CAPTURED_RECOVERY_PARENT_REPLACED');
      }
      if (!state.roots) {
        // Establish the complete destination set before the first original root is created.
        for (const root of review.roots) need(!await present(root.destination), 'CAPTURED_RECOVERY_TARGET_EXISTS',
          'Receiving preserves the existing root: ' + root.destination);
        state.roots = Object.fromEntries(review.roots.map(root => [root.name,
          { phase: 'CREATING', destination: root.destination }]));
        state.operationId = identity({ purpose: 'receive-original-captured-product', reviewSha256: expectedReviewSha256 });
        state.phase = 'PLACING'; await save();
      }
      need(state.operationId === identity({ purpose: 'receive-original-captured-product',
        reviewSha256: expectedReviewSha256 }), 'CAPTURED_RECOVERY_RECEIVING_CHANGED');
      if (state.phase === 'PLACING') {
        await verifyRestoreDirectory(manifest, review.restoreDirectory);
        for (const root of review.roots) {
          const entries = rootEntries(manifest, root.name), progress = state.roots[root.name];
          if (progress.phase === 'PLACED') await verifyRoot(root.destination, entries);
          else await placeRoot({ root, entries, operationId: state.operationId, owner: profile.owner,
            parents, progress, save });
        }
        state.phase = 'REBINDING'; await save();
      }
      const nativeOwners = { product: profile.product, owner: profile.owner,
        release: profile.summary.release, oauth: profile.summary.oauth };
      return withCapturedRecoveryOwners(nativeOwners, async () => {
        if (!state.bindings) {
          for (const root of review.roots) await verifyRoot(root.destination, rootEntries(manifest, root.name));
          const bindingRoots = review.roots.map(root => ({ name: root.name, directory: root.destination,
            entries: rootEntries(manifest, root.name) }));
          state.bindings = await prepareCapturedHandoverRecovery({
            snapshotSha256: review.snapshotSha256, operationId: state.operationId, roots: bindingRoots });
          // Persist every exact addition before any original archive/upload sidecar is written.
          await save();
        }
        await applyCapturedHandoverRecovery(state.bindings, { roots: review.roots.map(root => ({
          name: root.name, directory: root.destination, entries: rootEntries(manifest, root.name) })) });
        for (const root of review.roots)
          await verifyRoot(root.destination, rootEntries(manifest, root.name), bindingAdditions(state.bindings, root));
        state.phase = 'VALIDATING'; await save();
        const original = await validateRecoveredCapturedProduct(profile);
        state.result = { status: 'CAPTURED_RECOVERY_RECEIVED', operationId: state.operationId,
          operationDirectory, reviewSha256: expectedReviewSha256, snapshotSha256: review.snapshotSha256,
          sourcePlanSha256: review.sourcePlanSha256, profileSha256: review.profileSha256,
          product: original.product, summary: copy(profile.summary), runtime: copy(profile.runtime),
          roots: review.roots.map(root => ({ name: root.name, path: root.destination,
            kind: root.kind, source: copy(root.source) })),
          recoveryBindings: copy(state.bindings.bindings ?? []),
          directoryEnvironment: copy(review.directoryEnvironment), environmentFiles: copy(review.environmentFiles),
          reopen: { command: 'starforge', argv: ['captured-api', 'open', '--dir', profile.product.directory] },
          completedAt: stamp() };
        state.phase = 'COMPLETE'; state.error = null; await save();
        return copy(state.result);
      });
    });
  });
}
export async function capturedRecoveryStatus(operationDirectory) {
  const { record, state } = await readRecord(absolute(operationDirectory));
  return { schema: OPERATION_SCHEMA, kind: record.kind, operationDirectory,
    input: copy(record.input), inputSha256: record.inputSha256,
    createdAt: record.createdAt, updatedAt: state?.updatedAt ?? null,
    phase: state?.phase ?? 'PREPARING', progress: state?.native?.progress ?? null,
    retainedCaptures: copy(state?.native?.retainedCaptures ?? []),
    retainedRestores: copy(state?.retainedRestores ?? []), error: copy(state?.error ?? null),
    result: copy(state?.result ?? null) };
}
export async function recoveredCapturedApiSelection(operationDirectory) {
  const status = await capturedRecoveryStatus(operationDirectory);
  need(status.kind === 'RECEIVE' && status.result?.status === 'CAPTURED_RECOVERY_RECEIVED',
    'CAPTURED_RECOVERY_RECEIVING_INCOMPLETE', 'Complete the retained product receiving before reopening it.');
  const product = await readCapturedApi(status.result.product.directory);
  // Later ordinary source/release/workflow edits are current product work. The
  // completed receiving receipt remains the original historical result.
  return { result: status.result, product };
}
