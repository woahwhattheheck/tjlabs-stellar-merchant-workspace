// MIT. Original customer-review operator course, joined to the maintained recipient receiver.
import { promises as fs, constants } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";

const SCHEMA = "commons.openlineage.customer-review-receiving.v1";
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const equal = (a, b) => canonical(a) === canonical(b);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const digest = value => hash(Buffer.from(canonical(value)));
const json = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const clone = value => structuredClone(value);
const need = (value, message) => { if (!value) throw new Error(message); };
const GROUPS = { assessments: "assessmentIds", evaluations: "evaluationIds", comparisons: "comparisonIds", results: "resultIds" };
const FIELDS = ["title", "customer", "periodStart", "periodEnd", "recordedBy", "scope", "narrative"];

async function exists(path) {
  try { return await fs.lstat(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function ordinary(path) {
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat(); need(before.isFile(), "Keep the original ordinary receiving file: " + path);
    const bytes = await handle.readFile(), after = await handle.stat();
    need(before.dev === after.dev && before.ino === after.ino && before.size === after.size &&
      before.mtimeMs === after.mtimeMs && bytes.length === after.size, "The original file changed while reading: " + path);
    return bytes;
  } finally { await handle.close(); }
}
async function directory(path) {
  need(isAbsolute(path) && resolve(path) === path, "Use canonical absolute original receiving directories.");
  const info = await fs.lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && await fs.realpath(path) === path, "Keep the original receiving directory.");
}
async function syncParent(path) {
  const handle = await fs.open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function putExact(path, data) {
  const bytes = Buffer.from(data);
  if (await exists(path)) {
    need((await ordinary(path)).equals(bytes), "Preserve different retained output: " + path);
    await syncParent(path); return;
  }
  const stage = path + ".writing-" + randomUUID(), handle = await fs.open(stage, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try {
    try { await fs.link(stage, path); }
    catch (error) { if (error.code !== "EEXIST") throw error; need((await ordinary(path)).equals(bytes), "A different output already exists."); }
    await syncParent(path);
  } finally { await fs.unlink(stage).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}
function checkInput(value) {
  need(value && typeof value === "object" && !Array.isArray(value), "Select the original complete receiving input.");
  for (const field of ["operationId", "workspaceId", "draftName"])
    need(typeof value[field] === "string" && value[field].trim(), "Keep the explicit original " + field + ".");
  const d = value.document;
  need(d && d.schema === "commons.openlineage.customer-review-document.v1", "Select the complete original review document.");
  for (const field of FIELDS) need(typeof d[field] === "string" && (field === "narrative" || d[field].trim()), "Keep the explicit document " + field + ".");
  for (const field of Object.values(GROUPS))
    need(Array.isArray(d[field]) && d[field].every(id => typeof id === "string" && id.trim()) &&
      new Set(d[field]).size === d[field].length, "Select distinct actual saved originals in " + field + ".");
  need(Object.values(GROUPS).some(field => d[field].length), "Select at least one existing saved original.");
  need(d.supersedes === null || d.supersedes && typeof d.supersedes.id === "string" &&
    /^[a-f0-9]{64}$/.test(d.supersedes.contentSha256), "Keep the explicit original prior review selection.");
  need(value.source && /^[a-f0-9]{40}$/.test(value.source.commit) && Array.isArray(value.source.application) &&
    value.source.application.length && value.source.application.every(row => row && typeof row.path === "string" &&
      /^[a-f0-9]{64}$/.test(row.sha256) && Number.isSafeInteger(row.bytes) && row.bytes >= 0) &&
    new Set(value.source.application.map(row => row.path)).size === value.source.application.length,
    "Keep the complete selected published application manifest.");
  return clone(value);
}
function checkSource(full, input) {
  const actual = [...full.application].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const expected = clone(input.source.application).sort((a, b) => a.path.localeCompare(b.path));
  need(equal(actual, expected), "The entire actual application differs from the selected public source.");
  need(full.state.workspaceId === input.workspaceId, "The exported workspace identity differs.");
  for (const name of ["customer-service-review.mjs", "customer-service-review.js", "review-return.mjs", "review-return-ui.mjs"])
    need(full.application.has(name), "Keep the full original product, including " + name + ".");
}
function checkPreview(preview, input, before) {
  const { previewSha256, ...body } = preview ?? {};
  need(preview?.schema === "commons.openlineage.customer-review-preview.v1" &&
    preview.workspaceId === input.workspaceId && preview.sourceRevision === before.revision &&
    digest(body) === previewSha256 && equal(preview.document, input.document), "The complete original preview differs.");
  for (const kind of ["assessments", "evaluations", "comparisons", "incidents", "dispositions", "followups", "editions", "sources", "events", "results"])
    need(Array.isArray(preview.originals?.[kind]) && preview.counts?.[kind] === preview.originals[kind].length,
      "The original preview omitted " + kind + ".");
}
function checkSaved(before, after, review, request, preview) {
  const { contentSha256, ...body } = review ?? {};
  need(review?.schema === "commons.openlineage.customer-review.v1" && digest(body) === contentSha256 &&
    review.operationId === request.args.operationId && review.revision === before.revision + 1 &&
    equal(review.preview, preview), "The accepted customer review differs from its original preview/request.");
  const omit = state => Object.fromEntries(Object.entries(state).filter(([key]) =>
    !["revision", "updatedAt", "operations", "customerServiceReviews"].includes(key)));
  need(equal(omit(before), omit(after)) && after.workspaceId === before.workspaceId &&
    after.revision === before.revision + 1, "Original observations or decisions changed while the review was saved.");
  need(equal(after.customerServiceReviews, [...(before.customerServiceReviews ?? []), review]) &&
    equal(after.operations.slice(0, before.operations.length), before.operations) &&
    after.operations.length === before.operations.length + 1, "Keep the single original review and complete earlier operation history.");
  const operation = after.operations.at(-1);
  need(operation.id === request.args.operationId &&
    operation.requestHash === digest({ action: request.action, document: request.args.document,
      expectedPreviewSha256: request.args.expectedPreviewSha256 }) &&
    equal(operation.result, { customerReview: review, workspaceId: before.workspaceId, revision: review.revision, operationId: review.operationId }),
    "The original native acceptance receipt differs from the retained request.");
}
async function idle(page, workspaceId) {
  await page.waitForFunction(id => {
    const s = window.customerServiceReviewOperator?.inspect?.();
    return s?.workspaceId === id && !s.closed && !s.closing && s.active === 0;
  }, workspaceId, { timeout: 60000 });
}
/** The original caller owns navigation, authentication, server and Page. */
export async function openOriginalCustomerReviewDesk({ page, workspaceId }) {
  const state = await page.evaluate(() => window.customerServiceReviewOperator?.inspect?.() ?? null);
  need(state?.workspaceId === workspaceId && !state.closed && !state.closing,
    "Open the actual authenticated customer-service-review.html on the original Page first.");
  await idle(page, workspaceId);
}

/**
 * Complete the original customer review and recipient course on an existing case.
 * resolveRecipientInput returns explicitly entered values for the actual saved review.
 * receiveReviewReturns is the current unchanged maintained recipient receiver export.
 */
export async function receiveCustomerReview({
  page, client, workspace, store, outputDirectory, input: incoming, remember,
  receiveReviewReturns, resolveRecipientInput = null, openReviewDesk = openOriginalCustomerReviewDesk
}) {
  const input = checkInput(incoming), root = resolve(outputDirectory);
  await directory(root);
  if (resolveRecipientInput === null) {
    const r = input.recipient;
    need(r && typeof r === "object" && ["requestedBy","receivedBy","instructions","operatorNote"].every(k => typeof r[k] === "string") &&
      r.requestedBy.trim() && r.receivedBy.trim() && r.recipient && typeof r.recipient.name === "string" &&
      r.recipient.name.trim() && typeof r.recipient.organisation === "string" && typeof r.recipient.reference === "string" &&
      r.recipient.reference.trim(), "Supply the complete explicit recipient/operator fields before the original review runs.");
    need(r.reply && r.reply.respondent && ["name","organisation","role"].every(k => typeof r.reply.respondent[k] === "string") &&
      r.reply.respondent.name.trim() && ["comments","acknowledged","changes_requested"].includes(r.reply.overall) &&
      typeof r.reply.comment === "string" && Array.isArray(r.reply.items) &&
      r.reply.items.every(row => row && typeof row.itemId === "string" && typeof row.comment === "string" &&
        ["not_reviewed","acknowledged","question","change_requested"].includes(row.response)) &&
      new Set(r.reply.items.map(row => row.itemId)).size === r.reply.items.length,
      "Retain every explicit original recipient reply, with its entered attribution.");
    resolveRecipientInput = async ({ review, source, operationId, workspaceId }) => ({
      ...clone(r), operationId, workspaceId, reviewId: review.id, reviewSha256: review.contentSha256, source: clone(source)
    });
  }
  for (const [name, value] of Object.entries({ remember, receiveReviewReturns, resolveRecipientInput, openReviewDesk,
    action: client?.action, exportWorkspace: client?.exportWorkspace, downloadExport: client?.downloadExport,
    read: workspace?.read, verifyBundle: store?.verifyBundle }))
    need(typeof value === "function", "Keep the original receiving " + name + " function.");
  need(page && typeof page.route === "function" && typeof page.context === "function" &&
    typeof client.baseUrl === "string", "Keep the actual original Page and identity-bound client.");
  const inputPath = join(root, "customer-review-input.json"), journalPath = join(root, "customer-review-progress.json");
  await putExact(inputPath, json(input)); await remember(inputPath);
  let journal = { schema: SCHEMA, operationId: input.operationId, inputSha256: hash(json(input)),
    files: {}, captures: [], startedAt: new Date().toISOString() }, journalHash = null;
  if (await exists(journalPath)) {
    const bytes = await ordinary(journalPath); journal = JSON.parse(bytes); journalHash = hash(bytes);
    need(journal.schema === SCHEMA && journal.operationId === input.operationId && journal.inputSha256 === hash(json(input)),
      "Resume the original source/document in its retained receiving directory.");
  }
  async function commit(publish = true) {
    need(journalHash === null ? !await exists(journalPath) : hash(await ordinary(journalPath)) === journalHash,
      "Another receiver changed the original progress.");
    const data = json(journal), stage = journalPath + ".writing-" + randomUUID(), handle = await fs.open(stage, "wx", 0o600);
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    if (journalHash === null) { try { await fs.link(stage, journalPath); } finally { await fs.unlink(stage); } }
    else await fs.rename(stage, journalPath);
    await syncParent(journalPath); journalHash = hash(data);
    if (publish) await remember(journalPath);
  }
  async function retain(label, value, extension = "json", publish = true) {
    need(/^[a-z0-9-]+$/.test(label) && /^[a-z0-9]+$/.test(extension), "Keep portable complete output names.");
    const data = Buffer.from(value), path = join(root, label + "-" + hash(data) + "." + extension);
    await putExact(path, data);
    const descriptor = { path, bytes: data.length, sha256: hash(data) };
    journal.files[label] = descriptor; await commit(publish);
    if (publish) await remember(path);
    return descriptor;
  }
  async function readSaved(label) {
    const d = journal.files[label]; need(d && dirname(d.path) === root, "Keep the original " + label + " output.");
    const bytes = await ordinary(d.path);
    need(bytes.length === d.bytes && hash(bytes) === d.sha256, "The complete retained " + label + " differs.");
    return bytes;
  }
  async function screenshot(target, label) {
    const dimensions = await target.evaluate(() => ({
      width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth
    }));
    need(dimensions.documentWidth <= dimensions.width + 1, "The actual " + label + " overflows its viewport.");
    const saved = await retain(label, await target.screenshot({ fullPage: true }), "png");
    journal.captures.push({ ...saved, label, dimensions }); await commit();
  }
  async function download(target, trigger, label, extension = "json") {
    const transfer = target.waitForEvent("download", { timeout: 60000 }).then(value => ({ value }), error => ({ error }));
    try { await trigger(); } catch (error) { await transfer; throw error; }
    const observed = await transfer; if (observed.error) throw observed.error;
    need(!await observed.value.failure(), "The original browser download failed.");
    const temporary = join(root, ".download-" + randomUUID());
    try { await observed.value.saveAs(temporary); return await retain(label, await ordinary(temporary), extension); }
    finally { await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
  }
  async function exportNow(label) {
    if (journal.files[label]) {
      const bytes = await readSaved(label), full = store.verifyBundle(bytes); checkSource(full, input);
      return { bytes, full };
    }
    let record = journal[label + "Record"];
    if (!record) {
      record = await client.exportWorkspace({ includeApplication: true });
      need(record.workspaceId === input.workspaceId && /^[a-f0-9]{64}$/.test(record.id), "The original export changed identity.");
      journal[label + "Record"] = record; await commit();
    }
    const path = join(root, label + "-" + record.id + ".json");
    await client.downloadExport(record.id, path);
    const bytes = await ordinary(path);
    need(bytes.length === record.bytes && hash(bytes) === record.id, "The full original export download differs.");
    const full = store.verifyBundle(bytes); checkSource(full, input);
    await retain(label, bytes); return { bytes, full };
  }
  async function working(label) {
    const file = await download(page, () => page.locator("#download-working").click(), label);
    const value = JSON.parse(await ordinary(file.path));
    need(value.schema === "commons.openlineage.customer-review-working.v1" && value.workspaceId === input.workspaceId,
      "The original working file belongs to another workspace.");
    return value;
  }
  async function click(selector) { await page.locator(selector).click(); await idle(page, input.workspaceId); }
  async function openSavedReview(review) {
    await page.locator('[data-section="saved"]').click(); await idle(page, input.workspaceId);
    await page.locator("#saved-search").fill(review.preview.document.title);
    const rows = page.locator("#history tbody tr").filter({ hasText: review.preview.document.title });
    for (let index = 0; index < await rows.count(); index++) {
      await rows.nth(index).getByRole("button", { name: "Open saved edition", exact: true }).click();
      await idle(page, input.workspaceId);
      if ((await page.evaluate(() => window.customerServiceReviewOperator.inspect())).selectedReview === review.id) return;
    }
    throw new Error("Open the saved review with its exact original identity.");
  }
  const finalPath = join(root, "customer-review-complete.json");
  await commit();
  const baseline = await exportNow("original-workspace"), before = baseline.full.state;
  need(before.workspaceId === input.workspaceId, "Keep the exact original workspace.");
  let preview;
  if (journal.files.preview) preview = JSON.parse(await readSaved("preview"));
  else {
    const current = await workspace.read();
    need(equal(current, before), "The original workspace changed before the review preview.");
    preview = await client.action("customer-review.preview", { document: input.document });
    checkPreview(preview, input, before); await retain("preview", json(preview));
  }
  checkPreview(preview, input, before);
  if (input.recipient) {
    const itemIds = ["assessments","evaluations","comparisons","incidents","dispositions","followups","results"]
      .flatMap(kind => preview.originals[kind].map(row => kind + ":" + row.id)).sort();
    need(equal(input.recipient.reply.items.map(row => row.itemId).sort(), itemIds),
      "The entered recipient responses must cover exactly the complete original preview items.");
  }
  let request = journal.files["native-save-request"] ? JSON.parse(await readSaved("native-save-request")) : null;
  if (request) need(request.action === "customer-review.save" && request.args.expectedRevision === before.revision &&
    request.args.expectedPreviewSha256 === preview.previewSha256 && equal(request.args.document, input.document) &&
    request.body === JSON.stringify({ action: request.action, args: request.args }), "Preserve the captured exact native save body.");
  let state = await workspace.read(), saved;
  if (request) {
    const operation = state.operations.find(row => row.id === request.args.operationId);
    if (operation) {
      need(operation.requestHash === digest({ action: request.action, document: request.args.document,
        expectedPreviewSha256: request.args.expectedPreviewSha256 }), "The retained operation ID belongs to different work.");
      saved = operation.result.customerReview;
    }
  }
  if (await exists(finalPath)) {
    const result = JSON.parse(await ordinary(finalPath));
    need(result.schema === SCHEMA && result.complete === true && result.inputSha256 === journal.inputSha256 &&
      saved && saved.id === result.reviewId && saved.contentSha256 === result.reviewSha256,
      "Keep the same completed original customer-review result.");
    for (const label of Object.keys(journal.files)) await readSaved(label);
    const recipientInput = JSON.parse(await readSaved("recipient-input"));
    const recipient = await receiveReviewReturns({ page, client, workspace, store,
      outputDirectory: join(root, "recipient"), input: recipientInput, remember });
    need(equal(recipient, result.recipient), "The original completed recipient receiving differs.");
    await remember(finalPath); return result;
  }

  // A resumed input retains its old baseline, but its live producer must still serve the selected complete application.
  const admission = await client.exportWorkspace({ includeApplication: true });
  need(admission.workspaceId === input.workspaceId && /^[a-f0-9]{64}$/.test(admission.id),
    "The live original source admission changed identity.");
  const admissionPath = join(root, "live-source-" + admission.id + ".json");
  await client.downloadExport(admission.id, admissionPath);
  const admissionBytes = await ordinary(admissionPath);
  need(admissionBytes.length === admission.bytes && hash(admissionBytes) === admission.id,
    "The complete live source admission differs.");
  const liveFull = store.verifyBundle(admissionBytes); checkSource(liveFull, input);
  need(equal(liveFull.state, await workspace.read()), "The original workspace advanced during source admission.");
  await retain("live-source-admission", admissionBytes);

  await openReviewDesk({ page, client, workspaceId: input.workspaceId, input });
  await idle(page, input.workspaceId);
  need(new URL(page.url()).origin === new URL(client.baseUrl).origin, "Keep the authenticated original host origin.");
  const bound = await page.evaluate(() => window.customerServiceReviewOperator.inspect());
  need(client.expectedWorkspaceId === input.workspaceId && client.instanceId === bound.instanceId &&
    typeof bound.instanceId === "string" && bound.instanceId.length, "Keep the original client's actual workspace and current instance binding.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (!request && !journal.reviewCourseComplete) {
    const priorWorking = await working("operator-before");
    if (priorWorking.pending) {
      const p = priorWorking.pending, retained = journal.files["review-working-reopened"]
        ? JSON.parse(await readSaved("review-working-reopened")) : null;
      need(retained && p.workingDraft?.id === retained.draft.id && p.workspaceId === input.workspaceId &&
        p.action === "customer-review.save" && p.args?.expectedRevision === before.revision &&
        p.args.expectedPreviewSha256 === preview.previewSha256 && equal(p.args.document, input.document) &&
        equal(p.preview, preview) && equal(p.workingDraft.state, input.document) &&
        p.body === JSON.stringify({ action: p.action, args: p.args }),
        "Preserve the existing different pending customer review.");
      // A process may end after the UI prepared its request but before this route retained it.
      // Only that exact previously downloaded working draft can supply the original body.
      request = { action: p.action, args: clone(p.args), body: p.body };
      await retain("native-save-request", json(request));
    }
  }
  if (!saved && request) {
    const accepted = state.operations.find(row => row.id === request.args.operationId);
    if (accepted) {
      need(accepted.requestHash === digest({ action: request.action, document: request.args.document,
        expectedPreviewSha256: request.args.expectedPreviewSha256 }), "The retained original request differs from its native operation.");
      saved = accepted.result.customerReview;
    } else {
      need(equal(state, before), "Reconcile the original captured request before any later workspace work.");
      const replay = await client.action(request.action, request.args);
      saved = replay.customerReview; state = await workspace.read();
      await retain("recovered-native-receipt", json(replay));
    }
    await click("#refresh");
  }
  if (!saved) {
    need(equal(state, before), "A different operation advanced the original workspace before saving.");
    if (input.document.supersedes) {
      const prior = (before.customerServiceReviews ?? []).find(row => row.id === input.document.supersedes.id);
      need(prior?.contentSha256 === input.document.supersedes.contentSha256, "Select the actual unchanged preceding review.");
      await openSavedReview(prior);
      await page.getByRole("button", { name: "Start explicit following edition", exact: true }).click(); await idle(page, input.workspaceId);
    } else {
      await page.locator('[data-section="draft"]').click(); await click("#new-draft");
    }
    await page.locator("#draft-name").fill(input.draftName);
    for (const field of FIELDS) await page.locator("#" + field).fill(input.document[field]);
    // Clear the preceding edition's retained selections through the real controls.
    for (const [group, field] of Object.entries(GROUPS)) {
      await page.locator("#choice-group").selectOption(group);
      const currently = (await working("selection-before-" + group)).draft.state[field];
      for (const id of currently) {
        await page.locator("#choice-search").fill(id);
        const row = page.locator("#choices tbody tr").filter({ hasText: id });
        need(await row.count() === 1, "The original selected record is not uniquely visible: " + id);
        await row.getByRole("checkbox").uncheck();
      }
      for (const id of input.document[field]) {
        await page.locator("#choice-search").fill(id);
        const row = page.locator("#choices tbody tr").filter({ hasText: id });
        need(await row.count() === 1, "The chosen saved original is not uniquely visible: " + id);
        await row.getByRole("button", { name: "Full original", exact: true }).click(); await idle(page, input.workspaceId);
        await page.locator("#original-body summary").click();
        const actual = JSON.parse(await page.locator("#original-body pre").textContent());
        const authoritative = preview.originals[group].find(value => value.id === id);
        need(authoritative && equal(actual, authoritative), "The displayed original differs from the frozen selection.");
        await screenshot(page, "original-" + group + "-" + hash(Buffer.from(id)).slice(0,16));
        await page.locator('[data-close="original-dialog"]').click();
        await row.getByRole("checkbox").check();
      }
    }
    const originalWorking = await working("review-working");
    need(equal(originalWorking.draft.state, input.document), "The real operator form differs from the complete selected document.");
    const chooser = page.waitForEvent("filechooser", { timeout: 45000 }).then(value => ({ value }), error => ({ error }));
    try { await page.locator("#working-file").click(); } catch (error) { await chooser; throw error; }
    const picked = await chooser; if (picked.error) throw picked.error;
    await picked.value.setFiles(journal.files["review-working"].path);
    await idle(page, input.workspaceId);
    await page.locator("#incoming-dialog").waitFor({ state: "visible" });
    await click("#receive-working");
    const reopened = await working("review-working-reopened");
    need(equal(reopened.draft.state, input.document) && reopened.draft.id !== originalWorking.draft.id &&
      reopened.draft.forkedFrom?.id === originalWorking.draft.id, "Reopening lost the original full draft or its explicit fork lineage.");
    await click("#preview");
    const shown = JSON.parse(await page.locator("#preview-body pre").last().textContent());
    need(equal(shown, preview), "The actual displayed full preview differs from the native frozen selection.");
    await page.setViewportSize({ width: 1440, height: 1000 }); await screenshot(page, "review-preview-desktop");
    await page.setViewportSize({ width: 390, height: 844 }); await screenshot(page, "review-preview-phone");
    const actionUrl = client.baseUrl.replace(/\/$/, "") + "/api/action";
    const routeMatch = url => url.href === actionUrl;
    let captureError = null;
    const routeHandler = async route => {
      const outgoing = route.request();
      let body;
      try { body = JSON.parse(outgoing.postData() ?? "null"); } catch {}
      if (outgoing.method() !== "POST" || body?.action !== "customer-review.save") return route.fallback();
      try {
        need(!request && body.args && typeof body.args.operationId === "string" &&
          body.args.expectedRevision === before.revision && body.args.expectedPreviewSha256 === preview.previewSha256 &&
          equal(body.args.document, input.document), "The actual outgoing review differs from this frozen course.");
        request = { action: body.action, args: clone(body.args), body: outgoing.postData() };
        need(request.body === JSON.stringify({ action: request.action, args: request.args }), "Preserve the exact original UI save body.");
        // Local synchronized retention completes before the unchanged original request proceeds.
        await retain("native-save-request", json(request), "json", false);
        await route.fallback();
      } catch (error) { captureError = error; await route.abort("failed"); }
    };
    await page.route(routeMatch, routeHandler);
    try { await click("#save"); }
    finally { await page.unroute(routeMatch, routeHandler); }
    if (captureError) throw captureError;
    need(request && journal.files["native-save-request"], "The actual original native save was not observed.");
    await remember(journal.files["native-save-request"].path); await remember(journalPath);
    state = await workspace.read();
    const accepted = state.operations.find(row => row.id === request.args.operationId);
    need(accepted, "The original save outcome remains unresolved; resume its exact retained body.");
    saved = accepted.result.customerReview;
  }
  if (!journal.reviewCourseComplete) {
    const currentWorking = await working("operator-after-native");
    if (currentWorking.pending) {
      need(currentWorking.pending.args?.operationId === request.args.operationId &&
        currentWorking.pending.body === request.body, "Preserve a different pending original review.");
      const finish = page.locator("#pending").getByRole("button", { name: /^(Finish saved review|Reconcile \/ retry original request)$/ });
      await finish.click(); await idle(page, input.workspaceId);
      need(!(await working("operator-after-reconciliation")).pending, "The accepted original UI save still needs reconciliation.");
    }
  }
  const postReview = await exportNow("saved-review-workspace");
  checkSaved(before, postReview.full.state, saved, request, preview);
  await retain("saved-review", json(saved));
  if (!journal.reviewCourseComplete) {
  const replayBefore = await workspace.read(), replay = await client.action(request.action, request.args);
  need(replay.replayed === true && equal(replay.customerReview, saved) && equal(await workspace.read(), replayBefore),
    "The exact accepted customer review did not replay without another mutation.");
  await retain("accepted-review-replay", json(replay));
  await click("#refresh");
  await openSavedReview(saved);
  const shownSaved = JSON.parse(await page.locator("#saved-detail pre").last().textContent());
  need(equal(shownSaved, saved), "The full saved review display differs.");
  for (const [label, width, height] of [["desktop",1440,1000],["phone",390,844]]) {
    await page.setViewportSize({ width, height }); await screenshot(page, "saved-review-" + label);
  }
  for (const format of ["json", "csv", "html"]) {
    const native = await client.action("customer-review.report", { id: saved.id, format });
    await download(page, () => page.locator("#saved-detail").getByRole("button",
      { name: "Download " + format.toUpperCase(), exact: true }).click(), "review-report-" + format, format);
    need((await readSaved("review-report-" + format)).equals(Buffer.from(native.text)),
      "The complete browser report differs from its original native report.");
  }
  need(equal(JSON.parse((await readSaved("review-report-json")).toString("utf8")), saved), "The JSON report lost the complete review.");
  const reportPage = await page.context().newPage();
  try {
    await reportPage.goto(pathToFileURL(journal.files["review-report-html"].path).href, { waitUntil: "domcontentloaded" });
    for (const [label,width,height] of [["desktop",1440,1000],["phone",390,844]]) {
      await reportPage.setViewportSize({ width,height }); await screenshot(reportPage, "review-report-file-" + label);
    }
  } finally { await reportPage.close(); }
  const objects = new Map();
  for (const source of preview.originals.sources) objects.set(source.id, { id: source.id, bytes: source.bytes });
  for (const result of preview.originals.results) objects.set(result.objectId, { id: result.objectId, bytes: result.bytes });
  for (const selected of objects.values()) {
    const rows = page.locator("#saved-detail tbody tr").filter({ hasText: selected.id });
    need(await rows.count() > 0, "The complete original file is missing from the saved review.");
    const label = "review-object-" + selected.id;
    await download(page, () => rows.first().getByRole("button", { name: "Original bytes", exact: true }).click(), label, "bin");
    const bytes = await readSaved(label), original = baseline.full.objects.get(selected.id);
    need(original && bytes.equals(original) && bytes.length === selected.bytes && hash(bytes) === selected.id,
      "The actual downloaded original source/evidence bytes differ.");
  }
  await download(page, () => page.locator("#saved-detail").getByRole("button",
    { name: "Complete editable workspace", exact: true }).click(), "review-browser-workspace");
  const browserFull = store.verifyBundle(await readSaved("review-browser-workspace")); checkSource(browserFull, input);
  need(equal(browserFull.state, postReview.full.state), "The actual review workspace download differs from the native full export.");
  await working("operator-review-complete");
  journal.reviewCourseComplete = true; await commit();
  }

  let recipientInput;
  if (journal.files["recipient-input"]) recipientInput = JSON.parse(await readSaved("recipient-input"));
  else {
    recipientInput = await resolveRecipientInput({ review: clone(saved), preview: clone(preview),
      source: clone(input.source), operationId: input.operationId, workspaceId: input.workspaceId });
    need(recipientInput && recipientInput.workspaceId === input.workspaceId && recipientInput.reviewId === saved.id &&
      recipientInput.reviewSha256 === saved.contentSha256 && equal(recipientInput.source, input.source),
      "Bind the explicit recipient input to this actual saved review and complete source.");
    await retain("recipient-input", json(recipientInput));
  }
  const recipientRoot = join(root, "recipient");
  if (!await exists(recipientRoot)) { await fs.mkdir(recipientRoot, { mode: 0o700 }); await syncParent(recipientRoot); }
  await directory(recipientRoot);
  const recipient = await receiveReviewReturns({ page, client, workspace, store, outputDirectory: recipientRoot,
    input: recipientInput, remember });
  need(recipient.complete === true && recipient.workspaceId === input.workspaceId && recipient.reviewId === saved.id &&
    recipient.reviewSha256 === saved.contentSha256 && recipient.originalRevision === saved.revision &&
    recipient.revision === before.revision + 3, "Keep the single review followed by its original two recipient operations.");
  const result = { schema: SCHEMA, complete: true, operationId: input.operationId, inputSha256: journal.inputSha256,
    workspaceId: input.workspaceId, originalRevision: before.revision, reviewRevision: saved.revision,
    revision: recipient.revision, reviewId: saved.id, reviewSha256: saved.contentSha256,
    reviewOperationId: request.args.operationId, originalOperationIds: before.operations.map(row => row.id),
    source: clone(input.source), recipient: clone(recipient), files: clone(journal.files), captures: clone(journal.captures),
    completedAt: new Date().toISOString() };
  journal.complete = true; journal.completedAt = result.completedAt; await commit();
  await putExact(finalPath, json(result)); await remember(finalPath); return result;
}
