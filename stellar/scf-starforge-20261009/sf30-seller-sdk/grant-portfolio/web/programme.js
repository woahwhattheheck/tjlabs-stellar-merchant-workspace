/* MIT. Programme registers over the original portfolio console and saved writer. */
"use strict";
function GrantProgrammeConsole(H) {
  const {state, node, button, field, panel, heading, metric, table, api, response,
    action, render, notice, failure, showDialog, currentEdit, rawDetails, sourceName} = H;
  const U = {register:"overview", nodeId:"", grantId:"", search:"", archived:false,
    offset:0, actor:"", schema:null, selection:null};
  const names = {nodes:"Programmes and projects", partners:"Partners and applicants", grants:"Grants and subgrants",
    milestones:"Workplan and milestones", indicators:"Results framework", observations:"Reported results",
    risks:"Risk register", issues:"Issues and actions", documents:"Documents and evidence",
    reports:"Donor reports", closures:"Closure and lessons"};
  const labels = {nodeId:"Programme or project", projectId:"Project", grantId:"Grant or subgrant", parentId:"Parent programme or project",
    parentGrantId:"Parent grant", parentIndicatorId:"Parent result", recipientId:"Recipient",
    applicantIds:"Applicants", agreementId:"Grant agreement", amendmentIds:"Agreement amendments",
    dueDiligenceDocumentIds:"Due diligence evidence", corporateRegistrationEvidence:"Corporate registration evidence",
    dataManagementRequired:"Data management plan required", dataManagementBasis:"Donor or policy basis",
    corporateProjectReference:"Corporate project reference", corporateRegistrationMode:"Corporate registration method",
    hrReference:"HR ticket reference", documentIds:"Supporting documents", lessonDocumentIds:"Lessons documents",
    remainingIssueIds:"Remaining actions", replacesId:"Earlier document edition", indicatorId:"Indicator",
    sourceRefs:"Original source records", dependencyIds:"Milestone dependencies", resultLevel:"Results level",
    periodStart:"Period start", periodEnd:"Period end", reportedDate:"Date reported", submittedDate:"Date submitted",
    startDate:"Start date", endDate:"End date", dueDate:"Due date", completedDate:"Completion date",
    closedDate:"Closure date", reviewDate:"Review date", sourceEdition:"Publisher document edition",
    documentDate:"Document date", residualLikelihood:"Residual likelihood", residualImpact:"Residual impact",
    organizationIdentifier:"Organization identifier", contactName:"Contact name", contactEmail:"Contact email",
    content:"Structured document content", uri:"Document HTTPS link", object:"Uploaded document",
    riskScaleMaximum:"Maximum likelihood and impact", highRiskScore:"High risk threshold", asOf:"Reporting date"};
  const human = value => labels[value] || String(value).replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ").replace(/^./, letter => letter.toUpperCase());
  const p = () => state().portfolio;
  const model = () => p()?.definition.programme;
  const title = row => row ? (row.code ? row.code + " · " : "") + (row.title || row.name || row.id) : "No selection";
  const selected = () => ({portfolioId:p().id, revision:p().revision});
  const query = extra => new URLSearchParams({...selected(), ...extra}).toString();
  const rows = name => model()?.records[name] || [];
  const find = (name, id) => rows(name).find(row => row.id === id);
  const editable = () => currentEdit() && !state().pending;
  function current(selection) {
    if (!p() || p().id !== selection.portfolioId || p().revision !== selection.revision)
      throw new Error("The selected portfolio changed. Reopen this record in its selected revision.");
    if (!editable()) throw new Error("Open the latest revision and complete the original pending operation before editing.");
  }
  function resetSelection() {
    const identity = p()?.id + ":" + p()?.snapshot;
    if (U.selection === identity) return;
    U.selection = identity; U.offset = 0;
    if (!find("nodes", U.nodeId)) U.nodeId = rows("nodes").find(row => !row.archived && !row.parentId)?.id || "";
    if (!find("grants", U.grantId)) U.grantId = "";
    if (!U.actor) U.actor = p()?.review.reviewer || "";
  }
  function descendants(id, name = "nodes", parent = "parentId") {
    const result = new Set(), children = new Map();
    for (const row of rows(name)) {
      if (!children.has(row[parent])) children.set(row[parent], []);
      children.get(row[parent]).push(row.id);
    }
    const pending = [id];
    while (pending.length) { const next = pending.pop(); if (result.has(next)) continue;
      result.add(next); pending.push(...(children.get(next) || [])); }
    return result;
  }
  function scoped(name, row, scope) {
    if (!U.archived && row.archived) return false;
    if (!U.nodeId || name === "partners") return true;
    const {nodes, grants} = scope;
    if (name === "nodes") return nodes.has(row.id);
    if (name === "grants") return nodes.has(row.projectId) && (!grants || grants.has(row.id));
    if (name === "observations") row = find("indicators", row.indicatorId) || {};
    return nodes.has(row.nodeId) && (!grants || grants.has(row.grantId));
  }
  function options(name, optional = true) {
    return [...(optional ? [["", "All " + (name === "nodes" ? "programmes and projects" : "grants")]] : []),
      ...rows(name).map(row => [row.id, title(row) + (row.archived ? " · archived" : "")])];
  }
  function scopeBar(container) {
    const bar = node("div", null, "toolbar programme-scope");
    const project = field("Programme or project", "select", U.nodeId, options("nodes"));
    const grantOptions = options("grants").filter(([id]) => !id || !U.nodeId ||
      descendants(U.nodeId).has(find("grants", id).projectId));
    const grant = field("Grant or subgrant", "select", U.grantId, grantOptions);
    project.input.addEventListener("change", () => { U.nodeId = project.input.value; U.grantId = "";
      U.offset = 0; render().catch(failure); });
    grant.input.addEventListener("change", () => { U.grantId = grant.input.value; U.offset = 0; render().catch(failure); });
    bar.append(project.wrapper, grant.wrapper); container.append(bar);
  }
  function labeledValue(label, value) {
    const block = node("div", null, "programme-value"); block.append(node("strong", label), node("span", value ?? "—")); return block;
  }
  function referenceControl(name, value, {multiple = false, required = false, exclude = null, filter = null} = {}) {
    const wrapper = node("div", null, "programme-reference"), search = node("input"), available = node("select");
    search.type = "search"; search.placeholder = "Find " + names[name].toLowerCase();
    search.setAttribute("aria-label", search.placeholder); available.size = 5;
    available.setAttribute("aria-label", "Matching records");
    const chosen = new Set(multiple ? value || [] : value ? [value] : []), chips = node("div", null, "programme-chips");
    const list = () => {
      const term = search.value.toLocaleLowerCase();
      const matches = rows(name).filter(row => row.id !== exclude && (!filter || filter(row)) &&
        (!row.archived || chosen.has(row.id)) && title(row).toLocaleLowerCase().includes(term));
      available.replaceChildren();
      for (const row of matches.slice(0, 80)) {
        const option = node("option", title(row)); option.value = row.id; available.append(option);
      }
      available.disabled = matches.length === 0;
      count.textContent = matches.length > 80 ? "Showing 80 of " + matches.length + " matches. Refine the search." : matches.length + " matching records";
    };
    const paint = () => {
      chips.replaceChildren();
      for (const id of chosen) { const chip = node("span", null, "programme-chip");
        chip.append(node("span", title(find(name, id))), button("Remove", () => { chosen.delete(id); paint(); }));
        chips.append(chip); }
      if (!chosen.size) chips.append(node("span", "No record selected", "small"));
      list();
    };
    const add = () => { if (!available.value) return; if (!multiple) chosen.clear(); chosen.add(available.value); paint(); };
    const count = node("span", "", "small");
    search.addEventListener("input", list);
    available.addEventListener("dblclick", add);
    available.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); add(); } });
    wrapper.append(chips, search, available, count, button(multiple ? "Add selected record" : "Select record", add));
    paint();
    return {wrapper, read() { if (required && chosen.size === 0) throw new Error("Select " + names[name].toLowerCase() + ".");
      return multiple ? [...chosen].sort() : [...chosen][0] || null; }};
  }
  function dimensionsControl(value = {}) {
    const wrapper = node("div", null, "programme-repeater"), items = [];
    function add(key = "", value = "") {
      const line = node("div", null, "programme-dimension"), keyField = field("Dimension", "text", key);
      const valueField = field("Value", "text", value), item = {key:keyField.input, value:valueField.input, active:true};
      line.append(keyField.wrapper, valueField.wrapper, button("Remove dimension", () => { item.active = false; line.remove(); }));
      items.push(item); wrapper.insertBefore(line, addButton);
    }
    const addButton = button("Add dimension", () => add()); wrapper.append(addButton);
    for (const [key, item] of Object.entries(value)) add(key, item);
    return {wrapper, read() {
      const result = {};
      for (const item of items.filter(item => item.active)) {
        const key = item.key.value.trim(), value = item.value.value.trim();
        if (!key || !value) throw new Error("Complete each result dimension and its value.");
        if (Object.hasOwn(result, key)) throw new Error("A result dimension is repeated: " + key);
        result[key] = value;
      }
      return result;
    }};
  }
  function pointsControl(value = []) {
    const wrapper = node("div", null, "programme-repeater"), items = [];
    function add(point = {}) {
      const group = node("fieldset", null, "programme-point"), legend = node("legend", "Dated result point");
      const date = field("Date", "date", point.date || ""), amount = field("Original decimal value", "text", point.value || "");
      amount.input.inputMode = "decimal"; date.input.required = amount.input.required = true;
      const dimensions = dimensionsControl(point.dimensions), evidence = referenceControl("documents", point.documentIds, {multiple:true});
      const item = {date, amount, dimensions, evidence, active:true};
      const evidenceDetails = node("details"); evidenceDetails.append(node("summary", "Supporting documents"), evidence.wrapper);
      group.append(legend, date.wrapper, amount.wrapper, dimensions.wrapper, evidenceDetails,
        button("Remove point", () => { item.active = false; group.remove(); }));
      items.push(item); wrapper.insertBefore(group, addButton);
    }
    const addButton = button("Add dated point", () => add()); wrapper.append(addButton); value.forEach(add);
    return {wrapper, read() { return items.filter(item => item.active).map(item => ({
      date:item.date.input.value, value:item.amount.input.value.trim(),
      dimensions:item.dimensions.read(), documentIds:item.evidence.read()})); }};
  }
  function sourceControl(value, selection) {
    const wrapper = node("div", null, "programme-source-picker"), chosen = new Map(
      (value || []).map(ref => [ref.sourceId + ":" + ref.entityKey, ref]));
    const search = field("Search original source records", "search"), results = node("div"), list = node("div");
    let offset = 0, epoch = 0, term = "", snapshot = p().snapshot;
    function paint() {
      list.replaceChildren();
      for (const [key, ref] of chosen) {
        const line = node("div", null, "programme-chip");
        line.append(node("span", sourceName(ref.sourceId) + " · " + ref.entityKey.slice(0, 16)),
          button("Remove", () => { chosen.delete(key); paint(); }));
        list.append(line);
      }
      if (!chosen.size) list.append(node("p", "No original source records selected.", "small"));
    }
    async function searchPage(next = 0) {
      const requested = ++epoch;
      const data = await api("/api/rows?" + new URLSearchParams({...selection, table:"entities", search:term, offset:next, limit:50}));
      if (requested !== epoch) return;
      if (data.snapshot !== snapshot) throw new Error("The source search selected a different portfolio revision.");
      offset = next; results.replaceChildren(table(["Original record", "Source edition", "Select"], data.rows.map(row =>
        [row.title || row.originalId, sourceName(row.sourceId), button("Add original record", () => {
          chosen.set(row.sourceId + ":" + row.entityKey, {sourceId:row.sourceId, entityKey:row.entityKey, sha256:row.sha256});
          paint();
        })])));
      const navigation = node("div", null, "actions"), previous = button("Previous", () => searchPage(Math.max(0, offset - 50)));
      previous.disabled = offset === 0;
      const nextButton = button("Next", () => searchPage(data.nextOffset)); nextButton.disabled = data.nextOffset === null;
      navigation.append(previous, nextButton, node("span", data.total + " matching originals", "small")); results.append(navigation);
    }
    const apply = () => { term = search.input.value; return searchPage(); };
    search.input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); apply().catch(failure); } });
    wrapper.append(list, search.wrapper, button("Find original records", apply), results); paint();
    return {wrapper, read:() => [...chosen.values()]};
  }
  function documentControl(value) {
    const wrapper = node("div"), original = value ? {...value} : null;
    let selected = original, pending = null;
    const description = node("p", original ? original.filename + " · " + original.bytes + " bytes" : "No uploaded file", "small");
    const input = field("Select complete file", "file");
    input.input.addEventListener("change", () => { pending = input.input.files[0] || null;
      if (pending) description.textContent = pending.name + " · " + pending.size + " bytes; saved with this record."; });
    wrapper.append(description, input.wrapper, button("Remove uploaded file", () => {
      selected = null; pending = null; input.input.value = ""; description.textContent = "No uploaded file";
    }));
    return {wrapper, async read() {
      if (!pending) return selected;
      if (pending.size < 1 || pending.size > 4 * 1024 ** 3) throw new Error("Select a complete file from one byte to 4 GiB.");
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(pending.name))
        throw new Error("Give the uploaded file a name using letters, numbers, dots, hyphens or underscores.");
      const result = await api("/api/programme/upload", {method:"POST", headers:{"Content-Type":"application/octet-stream"}, body:pending});
      if (result.bytes !== pending.size || !/^[0-9a-f]{64}$/.test(result.sha256 || ""))
        throw new Error("The original complete file was interrupted.");
      const contentType = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(pending.type) ?
        pending.type : "application/octet-stream";
      selected = {sha256:result.sha256, bytes:result.bytes, filename:pending.name, contentType};
      pending = null; return selected;
    }};
  }
  function referenceCollection(name, key) {
    if (key === "parentId" || key === "nodeId" || key === "projectId") return "nodes";
    if (key === "grantId" || key === "parentGrantId") return "grants";
    if (key === "recipientId" || key === "applicantIds") return "partners";
    if (key === "indicatorId" || key === "parentIndicatorId") return "indicators";
    if (key === "dependencyIds") return "milestones";
    if (key === "remainingIssueIds") return "issues";
    if (key === "replacesId" || key === "agreementId" || /DocumentIds$/.test(key) ||
        key === "documentIds" || key === "amendmentIds" || key === "corporateRegistrationEvidence") return "documents";
    throw new Error("Unsupported record relationship: " + name + "." + key);
  }
  function control(name, key, spec, value, selection, record) {
    const required = U.schema.required[name].includes(key), bare = typeof spec === "string" ? spec.replace(/\?$/, "") : null;
    const wrapper = node("fieldset", null, "field programme-field"), label = node("legend", human(key));
    wrapper.append(label);
    let result;
    if (Array.isArray(spec)) {
      result = field(human(key), "select", value ?? spec[0], spec.map(value => [value, human(value)]));
      return {wrapper:result.wrapper, read:() => result.input.value};
    }
    if (bare === "id" || bare === "ids") {
      const target = referenceCollection(name, key);
      result = referenceControl(target, value, {multiple:bare === "ids", required,
        exclude:["parentId","parentGrantId","parentIndicatorId","replacesId","dependencyIds"].includes(key) ? record?.id : null,
        filter:key === "projectId" ? row => row.kind === "project" : key === "agreementId" ? row => row.category === "agreement" : null});
    } else if (bare === "sources") result = sourceControl(value, selection);
    else if (bare === "dimensions") result = dimensionsControl(value || {});
    else if (bare === "points") result = pointsControl(value || []);
    else if (bare === "file") result = documentControl(value);
    else if (bare === "money") {
      const grid = node("div", null, "programme-dimension"), amount = field("Original decimal amount", "text", value?.value || "");
      amount.input.inputMode = "decimal";
      const currency = field("Original currency", "text", value?.currency || ""); currency.input.maxLength = 3;
      grid.append(amount.wrapper, currency.wrapper);
      result = {wrapper:grid, read() {
        if (!amount.input.value.trim() && !currency.input.value.trim()) return null;
        if (!amount.input.value.trim() || !/^[A-Z]{3}$/.test(currency.input.value.trim()))
          throw new Error("Complete the original amount and three-letter currency.");
        return {value:amount.input.value.trim(), currency:currency.input.value.trim()};
      }};
    } else if (bare === "bool") {
      const choices = spec.endsWith("?") ? [["","To be selected"],["true","Yes"],["false","No"]] : [["true","Yes"],["false","No"]];
      const f = field(human(key), "select", value === null || value === undefined ? "" : String(value), choices);
      return {wrapper:f.wrapper, read:() => f.input.value === "" ? null : f.input.value === "true"};
    } else {
      const type = bare === "date" ? "date" : bare === "text" || bare === "strings" ? "textarea" :
        bare === "positive" ? "number" : bare === "uri" ? "url" : bare === "email" ? "email" : "text";
      const f = field(human(key), type, bare === "strings" ? (value || []).join("\n") : value ?? (bare === "percent" ? "0" : ""));
      f.input.required = required;
      if (bare === "positive") { f.input.min = "1"; f.input.max = "1000"; f.input.step = "1"; }
      if (bare === "decimal" || bare === "percent") f.input.inputMode = "decimal";
      if (bare === "short") f.input.maxLength = 240;
      if (bare === "text") f.input.maxLength = 16000;
      if (bare === "strings") f.wrapper.append(node("span", "One complete value per line.", "small"));
      return {wrapper:f.wrapper, read() {
        const value = f.input.value;
        if (bare === "strings") return value.split("\n").map(value => value.trim()).filter(Boolean);
        if (spec.endsWith("?") && !value.trim()) return null;
        return bare === "positive" ? Number(value) : value;
      }};
    }
    wrapper.append(result.wrapper);
    if (["sources","points","file","dimensions"].includes(bare)) wrapper.classList.add("full");
    return {wrapper, read:result.read};
  }
  async function save(selection, programme) {
    current(selection);
    const old = p().definition, {name, notes, sources, review} = old;
    return action("portfolio.save", {id:p().id, expectedPortfolioRevision:p().revision,
      name, notes, sources, review, programme});
  }
  function batch(actor, changes = [], extra = {}) {
    return {schema:U.schema.schema, expectedProgrammeRevision:model()?.revision || 0, actor,
      changes, ...extra};
  }
  async function editor(name, record = null) {
    const selection = selected(); current(selection);
    const form = node("form"), grid = node("div", null, "form-grid"), controls = {};
    const actor = field("Editor", "text", U.actor || p().review.reviewer); actor.input.required = true;
    form.append(actor.wrapper);
    const frozen = name === "reports" && record?.publication;
    if (name === "closures" && record?.positionAtRecording) throw new Error("The recorded closure is preserved. Open its history or create a following closure.");
    if (frozen) form.append(node("p", "This submitted report preserves its reporting position and evidence. Acknowledgment is recorded on the same report.", "coverage"));
    const orderedFields = [...Object.entries(U.schema.fields[name]).filter(([key]) => !["notes","sourceRefs"].includes(key)),
      ...["notes","sourceRefs"].map(key => [key, U.schema.fields[name][key]])];
    for (const [key, spec] of orderedFields) {
      if (frozen && key !== "status") continue;
      let value = record?.[key];
      if (!record) {
        if (key === "owner" || key === "collector") value = U.actor || p().review.reviewer;
        const scopeNode = U.grantId ? find("grants", U.grantId)?.projectId : U.nodeId;
        if (key === "nodeId") value = scopeNode || null;
        if (key === "projectId") value = find("nodes", scopeNode)?.kind === "project" ? scopeNode : null;
        if (key === "grantId") value = U.grantId || null;
        if (name === "grants" && key === "parentGrantId") value = U.grantId || null;
      }
      if (frozen) value = "acknowledged";
      controls[key] = control(name, key, frozen ? ["acknowledged"] : spec, value, selection, record);
      grid.append(controls[key].wrapper);
    }
    const submit = node("button", frozen ? "Record acknowledgment" : "Save record", "primary"); submit.type = "submit";
    form.append(grid, submit);
    form.addEventListener("submit", async event => {
      event.preventDefault(); submit.disabled = true;
      try {
        current(selection);
        const fields = {};
        for (const [key, item] of Object.entries(controls)) fields[key] = await item.read();
        U.actor = actor.input.value;
        await save(selection, batch(U.actor, [{collection:name, id:record?.id || crypto.randomUUID(),
          expectedRevision:record?.revision || 0, fields}]));
      } catch (error) { failure(error); } finally { submit.disabled = false; }
    });
    showDialog((record ? "Edit " : "Add to ") + names[name], [form]);
  }
  async function archive(name, record) {
    const selection = selected(); current(selection);
    const form = node("form"), reason = field("Reason for archiving", "textarea"), actor = field("Editor", "text", U.actor);
    reason.input.required = actor.input.required = true;
    form.append(node("p", title(record)), node("p", "The original record, documents and financial sources remain in the saved history.", "small"),
      actor.wrapper, reason.wrapper);
    const submit = node("button", "Archive original record", "primary"); submit.type = "submit"; form.append(submit);
    form.addEventListener("submit", async event => {
      event.preventDefault(); submit.disabled = true;
      try { U.actor = actor.input.value; await save(selection, batch(U.actor, [], {archive:[
        {collection:name, id:record.id, expectedRevision:record.revision, reason:reason.input.value}]})); }
      catch (error) { failure(error); } finally { submit.disabled = false; }
    });
    showDialog("Archive record", [form]);
  }
  async function downloadDocument(record, selection) {
    const descriptor = record.object;
    let target = null;
    if (typeof showSaveFilePicker === "function")
      target = await showSaveFilePicker({suggestedName:descriptor.filename});
    else if (descriptor.bytes > 64 * 1024 ** 2)
      throw new Error("For documents larger than 64 MiB, use a browser with direct file saving or the workspace document client.");
    const stream = await response("/api/programme/document?" + new URLSearchParams({...selection, id:record.id}));
    let reader = null, output = null, completed = false;
    try {
      if (stream.headers.get("content-length") !== String(descriptor.bytes) ||
          stream.headers.get("x-content-sha256") !== descriptor.sha256 ||
          stream.headers.get("content-type") !== descriptor.contentType ||
          stream.headers.get("etag") !== '"' + descriptor.sha256 + '"' ||
          stream.headers.get("content-disposition") !== 'attachment; filename="' + descriptor.filename + '"')
        throw new Error("The document response differs from the saved original.");
      if (target) {
        output = await target.createWritable(); reader = stream.body.getReader(); let bytes = 0;
        for (;;) { const part = await reader.read(); if (part.done) break;
          bytes += part.value.length; if (bytes > descriptor.bytes) throw new Error("The document response exceeded its original length.");
          await output.write(part.value); }
        if (bytes !== descriptor.bytes) throw new Error("The complete document was interrupted.");
        await output.close(); completed = true;
      } else {
        const blob = await stream.blob();
        if (blob.size !== descriptor.bytes) throw new Error("The complete document was interrupted.");
        const url = URL.createObjectURL(blob), link = node("a");
        link.href = url; link.download = descriptor.filename; document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000); completed = true;
      }
      notice("Document downloaded: " + descriptor.filename);
    } finally {
      if (!completed) { if (reader) await reader.cancel().catch(() => {}); else await stream.body?.cancel().catch(() => {});
        if (output) await output.abort().catch(() => {}); }
      if (reader) reader.releaseLock();
    }
  }
  function displayValue(name, key, value, selection, originalModel, historical) {
    const wrapper = node("div"), lookup = (collection, id) => originalModel.records[collection].find(row => row.id === id);
    if (value === undefined || value === null || value === "" || Array.isArray(value) && !value.length) return node("span", "—");
    const spec = U.schema.fields[name][key], bare = typeof spec === "string" ? spec.replace(/\?$/, "") : null;
    if (bare === "id" || bare === "ids") {
      const target = referenceCollection(name, key);
      for (const id of bare === "ids" ? value : [value]) {
        const record = lookup(target, id);
        wrapper.append(record ? button(title(record), () => detail(target, record, selection, historical)) : node("span", id));
      }
    } else if (bare === "points") {
      wrapper.append(table(["Date", "Original value", "Dimensions", "Evidence"], value.map(point =>
        [point.date, point.value, Object.entries(point.dimensions).map(([key, value]) => key + ": " + value).join("; "),
          point.documentIds.map(id => title(lookup("documents", id))).join("; ")])));
    } else if (bare === "sources") {
      wrapper.append(table(["Source edition", "Original record"], value.map(ref => [sourceName(ref.sourceId),
        button("Open original", async () => {
          const original = await api("/api/detail?" + new URLSearchParams({...selection, sourceId:ref.sourceId, entityKey:ref.entityKey}));
          if (original.entity.sha256 !== ref.sha256) throw new Error("This source binding needs review against its following edition.");
          showDialog(original.entity.title || original.entity.originalId, [
            node("p", original.source.coverage.statement, "coverage"), rawDetails("Original published record", original.entity.original),
            rawDetails("Original financial rows", original.financial)]);
        })])));
    } else if (bare === "money") wrapper.append(node("span", value.value + " " + value.currency));
    else if (bare === "file") wrapper.append(node("span", value.filename + " · " + value.bytes + " bytes"));
    else if (bare === "dimensions") wrapper.append(node("span", Object.entries(value).map(([key, value]) => key + ": " + value).join("; ")));
    else if (bare === "uri") { const link = node("a", value); link.href = value; link.target = "_blank"; link.rel = "noreferrer"; wrapper.append(link); }
    else wrapper.append(node("span", Array.isArray(value) ? value.join("; ") : typeof value === "boolean" ? value ? "Yes" : "No" : String(value)));
    return wrapper;
  }
  async function detail(name, record, selection = selected(), historical = false) {
    const opening = p()?.snapshot;
    const originalPortfolio = p()?.id === selection.portfolioId && p()?.revision === selection.revision ? p() :
      await api("/api/portfolio?" + new URLSearchParams({id:selection.portfolioId, revision:selection.revision}));
    if (p()?.snapshot !== opening) throw new Error("The selected portfolio changed while its original edition was opening.");
    const originalModel = originalPortfolio.definition.programme;
    const content = [], summary = node("div", null, "programme-detail");
    content.push(node("p", "Record revision " + record.revision + " · " + record.updatedAt + " · " + record.updatedBy, "small"));
    if (record.archived) content.push(node("p", "Archived: " + record.archiveReason, "coverage"));
    for (const [key] of Object.entries(U.schema.fields[name])) {
      const group = node("section"); group.append(node("h3", human(key)),
        displayValue(name, key, record[key], selection, originalModel, historical)); summary.append(group);
    }
    const actions = node("div", null, "actions");
    if (!historical && !record.archived && editable()) {
      if (!(name === "closures" && record.positionAtRecording) && !(name === "reports" && record.status === "acknowledged"))
        actions.append(button(record.publication ? "Acknowledge report" : "Edit record", () => editor(name, record)));
      actions.append(button("Archive", () => archive(name, record)));
    }
    if (name === "documents" && record.object) actions.append(button("Download document", () => downloadDocument(record, selection)));
    if (name === "nodes" && record.kind === "project") actions.append(button("Open project QA pack", () => quality(record.id, selection)));
    if (!historical) actions.append(button("Record history", async () => {
      const history = await api("/api/programme/history?" + new URLSearchParams({...selection, collection:name, id:record.id}));
      if (history.snapshot !== p()?.snapshot) throw new Error("The selected portfolio changed.");
      showDialog(title(record) + " · History", [table(["Revision", "Edited", "Editor", "State", "Open"], history.history.map(item =>
        [item.record.revision, item.record.updatedAt, item.record.updatedBy, item.record.archived ? "Archived" : item.record.status || "Current",
          button("Open edition", () => detail(name, item.record,
            {portfolioId:selection.portfolioId, revision:item.portfolioRevision}, true))]))]);
    }));
    content.push(actions, summary);
    const publication = record.publication || record.positionAtRecording;
    if (publication) {
      const frozen = panel("Saved reporting position", "Preserved when this report or closure was recorded.");
      positionView(frozen, publication.position); frozen.append(rawDetails("Referenced record editions", publication.recordRefs));
      content.push(frozen);
    }
    showDialog(title(record), content);
  }
  function positionView(container, position) {
    const metrics = node("div", null, "metrics");
    metrics.append(metric(position.completedMilestones + " / " + position.milestones, "milestones complete"),
      metric(position.overdueMilestoneIds.length, "overdue milestones"), metric(position.openIssueIds.length, "open actions"),
      metric(position.highRiskIds.length, "high risks"), metric(position.overdueReportIds.length, "overdue reports"));
    container.append(node("p", "Reporting date: " + position.asOf, "small"), metrics);
    const finance = panel("Financial position");
    finance.append(node("p", human(position.financialCoverage) + " · " + position.financialRecordCount + " original financial records", "small"),
      table(["Source edition", "Meaning and original dimensions", "Amount", "Included", "Excluded / missing"],
        position.financialTotals.map(total => [sourceName(total.dimensions.sourceId),
          Object.entries(total.dimensions).filter(([key]) => key !== "sourceId").map(([key, value]) => human(key) + ": " + value).join("; "),
          total.amount ?? "Missing", total.includedRecords, total.excludedRecords + " / " + total.missingRecords])));
    const results = panel("Results through " + position.asOf);
    results.append(table(["Indicator", "Dimensions", "Actual", "Target", "Variance", "Unit", "Calculation"],
      position.results.map(result => [result.title, Object.entries(result.dimensions).map(([key, value]) => key + ": " + value).join("; "),
        result.actual ?? "—", result.target?.value ?? "—", result.variance ?? "—", result.unit, human(result.status)])));
    container.append(finance, results);
  }
  async function quality(id = U.nodeId, selection = selected()) {
    const opening = p()?.snapshot, result = await api("/api/programme/qa?" + new URLSearchParams({...selection, nodeId:id}));
    if (p()?.snapshot !== opening || result.revision !== selection.revision || result.portfolioId !== selection.portfolioId)
      throw new Error("The selected portfolio changed.");
    const pack = result.qa, content = [node("h3", pack.reference + " · " + pack.title),
      node("p", "Reporting date " + pack.asOf + " · Portfolio revision " + selection.revision, "small")];
    content.push(table(["Step", "Required evidence", "Readiness", "Documents"], pack.checks.map(item => {
      const documents = node("div");
      for (const ref of item.documentRefs) documents.append(button("Open document", async () => {
        const original = await api("/api/programme/record?" + new URLSearchParams({...selection, collection:"documents", id:ref.id}));
        if (original.record.sha256 !== ref.sha256) throw new Error("The selected evidence edition differs.");
        return detail("documents", original.record, selection, selection.revision !== p()?.revision);
      }));
      return [item.sourceStep, human(item.category), human(item.status), documents];
    })));
    content.push(node("p", "Clearance roles: " + pack.requiredClearanceRoles.join(", "), "small"));
    if (pack.dataManagementBasis) content.push(labeledValue("Data management basis", pack.dataManagementBasis));
    content.push(labeledValue("Corporate registration", pack.corporateRegistration.reference ?
      pack.corporateRegistration.reference + " · " + human(pack.corporateRegistration.mode) : "Unrecorded"));
    const position = panel("Current project position"); positionView(position, pack.position); content.push(position);
    content.push(rawDetails("Complete saved QA pack", pack));
    showDialog("Project QA pack", content);
  }
  async function settings() {
    const selection = selected(); current(selection);
    const form = node("form"), actor = field("Editor", "text", U.actor), controls = {};
    actor.input.required = true; form.append(actor.wrapper);
    for (const [key, type] of Object.entries(U.schema.settings)) {
      const control = field(human(key), type === "date" ? "date" : "number", model().settings[key]);
      control.input.required = true; if (type === "positive") { control.input.min = "1"; control.input.max = "1000"; control.input.step = "1"; }
      controls[key] = control; form.append(control.wrapper);
    }
    const submit = node("button", "Save reporting settings", "primary"); submit.type = "submit"; form.append(submit);
    form.addEventListener("submit", async event => {
      event.preventDefault(); submit.disabled = true;
      try { U.actor = actor.input.value; await save(selection, batch(U.actor, [], {settings:Object.fromEntries(
        Object.entries(controls).map(([key, item]) => [key, U.schema.settings[key] === "date" ? item.input.value : Number(item.input.value)]))})); }
      catch (error) { failure(error); } finally { submit.disabled = false; }
    });
    showDialog("Reporting date and risk scale", [form]);
  }
  function introduction(container) {
    const form = node("form", null, "panel"), portfolioName = field("Portfolio name", "text", p()?.name || "");
    const actor = field("Editor", "text", p()?.review.reviewer || U.actor), code = field("Programme code", "text");
    const titleField = field("Programme title", "text"), asOf = field("Reporting date", "date", new Date().toISOString().slice(0, 10));
    for (const f of [portfolioName, actor, code, titleField, asOf]) { f.input.required = true; form.append(f.wrapper); }
    if (p()) portfolioName.input.disabled = true;
    form.prepend(node("h2", "Start a programme"), node("p", "Add the programme, then its projects, grants, workplan, evidence and results.", "muted"));
    const submit = node("button", "Create programme", "primary"); submit.type = "submit"; submit.disabled = !editable(); form.append(submit);
    const initial = p() ? selected() : null;
    form.addEventListener("submit", async event => {
      event.preventDefault(); submit.disabled = true;
      try {
        if (initial) current(initial); else if (p() || state().pending) throw new Error("The selected workspace changed. Reopen the programme form.");
        U.actor = actor.input.value;
        const programme = {schema:U.schema.schema, expectedProgrammeRevision:0, actor:U.actor,
          settings:{asOf:asOf.input.value}, changes:[{collection:"nodes", id:crypto.randomUUID(), expectedRevision:0,
            fields:{kind:"programme", code:code.input.value, title:titleField.input.value, owner:U.actor}}]};
        if (initial) await save(initial, programme);
        else await action("portfolio.save", {name:portfolioName.input.value, notes:"", sources:[],
          review:{status:"draft", reviewer:U.actor, note:""}, programme});
      } catch (error) { failure(error); } finally { submit.disabled = false; }
    });
    container.append(form);
  }
  function rowSummary(name, row) {
    if (name === "grants") return row.award ? row.award.value + " " + row.award.currency : row.purpose;
    if (name === "milestones") return row.progress + "% · Due " + row.dueDate;
    if (name === "indicators") return human(row.resultLevel) + " · " + row.unit + " · " + human(row.aggregation);
    if (name === "observations") return (row.value ?? "Missing") + " · " + row.periodStart + " to " + row.periodEnd;
    if (name === "risks") return "Score " + row.likelihood * row.impact + " · Review " + row.reviewDate;
    if (name === "issues") return human(row.severity) + " · Due " + row.dueDate;
    if (name === "documents") return human(row.category) + (row.object ? " · " + row.object.filename : "");
    if (name === "reports") return row.periodStart + " to " + row.periodEnd + " · Due " + row.dueDate;
    if (name === "closures") return row.closedDate;
    return row.kind ? human(row.kind) : row.organizationIdentifier || "";
  }
  async function renderProgramme(container, epoch) {
    if (!U.schema) U.schema = await api("/api/programme/schema");
    if (epoch !== state().epoch) return;
    resetSelection();
    const controls = [];
    if (model() && editable()) controls.push(button("Reporting settings", settings));
    container.append(heading("Programme delivery", "Projects, partners, grants, workplans, results, evidence and donor reporting.", controls));
    if (!model()) { introduction(container); return; }
    container.append(node("p", "Portfolio revision " + p().revision + " · Programme revision " + model().revision +
      " · Reporting date " + model().settings.asOf, "small"));
    const navigation = node("div", null, "toolbar"), register = field("Workspace", "select", U.register,
      [["overview","Programme position"], ...Object.entries(names)]);
    register.input.addEventListener("change", () => { U.register = register.input.value; U.offset = 0; U.search = ""; render().catch(failure); });
    navigation.append(register.wrapper);
    if (U.register !== "overview" && editable()) navigation.append(button("Add record", () => editor(U.register), "primary"));
    container.append(navigation); scopeBar(container);
    if (U.register === "overview") {
      if (!U.nodeId) { container.append(node("p", "Choose a programme or project to view its complete position.", "empty")); return; }
      const result = await api("/api/programme/position?" + query({nodeId:U.nodeId, ...(U.grantId ? {grantId:U.grantId} : {})}));
      if (epoch !== state().epoch) return;
      if (result.snapshot !== p().snapshot) throw new Error("The position selected a different original revision.");
      positionView(container, result.position);
      if (find("nodes", U.nodeId)?.kind === "project") container.append(button("Open project QA pack", () => quality()));
      return;
    }
    const filter = field("Search this register", "search", U.search), archived = field("Archived records", "select", String(U.archived),
      [["false","Active records"],["true","All records, including archived"]]);
    const bar = node("div", null, "toolbar");
    const apply = () => { U.search = filter.input.value; U.archived = archived.input.value === "true"; U.offset = 0; return render(); };
    filter.input.addEventListener("keydown", event => { if (event.key === "Enter") apply().catch(failure); });
    bar.append(filter.wrapper, archived.wrapper, button("Apply", apply)); container.append(bar);
    const needle = U.search.toLocaleLowerCase(), name = U.register;
    const scope = {nodes:U.nodeId ? descendants(U.nodeId) : null,
      grants:U.grantId ? descendants(U.grantId, "grants", "parentGrantId") : null};
    const matches = rows(name).filter(row => scoped(name, row, scope) && (!needle ||
      [title(row), row.owner, row.collector, row.description, row.notes, rowSummary(name, row)].join(" ").toLocaleLowerCase().includes(needle)))
      .sort((a, b) => title(a).localeCompare(title(b)) || a.id.localeCompare(b.id));
    const visible = matches.slice(U.offset, U.offset + 50);
    container.append(table(["Record", "Owner", "Position", "State", "Open"], visible.map(row => [
      name === "observations" ? title(find("indicators", row.indicatorId)) : title(row),
      row.owner || row.collector || "—", rowSummary(name, row), row.archived ? "Archived" : human(row.status || "Current"),
      button("Open record", () => detail(name, row))])));
    const paging = node("div", null, "pager"), buttons = node("div", null, "actions");
    const previous = button("Previous", () => { U.offset = Math.max(0, U.offset - 50); return render(); }); previous.disabled = U.offset === 0;
    const next = button("Next", () => { U.offset += 50; return render(); }); next.disabled = U.offset + 50 >= matches.length;
    buttons.append(previous, next); paging.append(node("span", matches.length ? (U.offset + 1) + "–" +
      (U.offset + visible.length) + " of " + matches.length + " records" : "No matching records", "small"), buttons); container.append(paging);
  }
  return {render:renderProgramme};
}
