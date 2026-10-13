/** Compose complete recurring source with the original saved Installation. */
import {prepareCalendar, reviewTaskBudget, calendarCsv} from "./recurring-core.mjs";
import {commercialWorkshare, commercialMarkdown, commercialHtml} from "./commercial-workshare-core.mjs";
const copy = value => JSON.parse(JSON.stringify(value));
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const check = (value, message) => { if (!value) throw new Error(message); };
const ordered = value => Array.isArray(value) ? value.map(ordered) : record(value) ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const missing = Symbol("absent original field");
const same = (left, right) => left === missing || right === missing ? left === right :
  JSON.stringify(ordered(left)) === JSON.stringify(ordered(right));
const clone = value => value === missing ? missing : copy(value);
export const PROGRAMME_FIELDS = ["useCalendar", "commissioning", "workflowPeriods"];
export const PROGRAMME_SCHEMA = "stellar-forge.installation-customer-programme.v1";
function fields(value, allowed, label) {
  check(record(value) && Object.keys(value).every(key => allowed.includes(key)),
    "Use the complete declared " + label + " fields.");
}
function read(value, key) { return Object.hasOwn(value, key) ? value[key] : missing; }
function arrayKey(arrays) {
  for (const key of ["id", "entryId", "fundingId", "cycleId"])
    if (arrays.every(rows => rows.every(row => record(row) && typeof row[key] === "string" && row[key]) &&
      new Set(rows.map(row => row[key])).size === rows.length)) return key;
  return null;
}
function merge(base, proposed, current, path) {
  if (same(proposed, base) || same(current, proposed)) return clone(current);
  if (same(current, base)) return clone(proposed);
  if ([base, proposed, current].every(record)) {
    const value = {};
    for (const key of new Set([...Object.keys(current), ...Object.keys(proposed), ...Object.keys(base)])) {
      const next = merge(read(base, key), read(proposed, key), read(current, key), path + "." + key);
      if (next !== missing) value[key] = next;
    }
    return value;
  }
  if ([base, proposed, current].every(Array.isArray)) {
    const key = arrayKey([base, proposed, current]);
    if (key) {
      const maps = [base, proposed, current].map(rows => new Map(rows.map(row => [row[key], row])));
      const value = [];
      for (const id of new Set([...current.map(row => row[key]), ...proposed.map(row => row[key]), ...base.map(row => row[key])])) {
        const next = merge(...maps.map(rows => rows.has(id) ? rows.get(id) : missing), path + "[" + id + "]");
        if (next !== missing) value.push(next);
      }
      return value;
    }
  }
  throw new Error("The original saved customer programme and selected draft both changed " + path +
    ". Reopen that field in the existing Installation editor and retain its complete explicit resolution.");
}

/** Read a complete native editor draft and preserve later independent saved work. */
export function applyProgrammeChange({seed, document, change}) {
  check(record(seed) && record(document), "Supply the current original native seed and complete document.");
  if (change === undefined) return copy(document);
  fields(change, ["schema", "source", "workshareCaseId", "planSha256", "installationId",
    "expectedRevision", "baseDocument", "document"], "original programme change");
  check(change.schema === "stellar-forge.installation-programme-change.v1",
    "Use a complete original programme change.");
  check(record(change.source) && record(change.baseDocument) && record(change.document),
    "Retain the original native source selection and both complete editor documents.");
  for (const key of ["caseId", "planId", "planRevision", "planContentSha256", "planSourceSha256"])
    check(change.source[key] === seed.source[key], "The programme draft selects another original " + key + ".");
  check(change.workshareCaseId === seed.workshare.caseId && change.planSha256 === seed.workshare.planSha256,
    "Keep the programme draft with its original complete Workshare edition.");
  for (const source of [change.baseDocument, change.document])
    check(source.workshare?.caseId === change.workshareCaseId &&
      source.workshare?.planSha256 === change.planSha256,
      "Keep both complete editor documents with this original Workshare.");
  check(Number.isSafeInteger(change.expectedRevision) && change.expectedRevision >= 0 &&
    change.expectedRevision <= seed.expectedRevision, "Retain the actual original Installation draft revision.");
  const alreadyApplied = PROGRAMME_FIELDS.every(key => same(read(change.document, key), read(document, key)));
  check(change.installationId === seed.installationId ||
    (change.installationId === null && change.expectedRevision === 0 && alreadyApplied),
    "The programme draft belongs to a different original Installation identity.");
  for (const key of new Set([...Object.keys(change.baseDocument), ...Object.keys(change.document)]))
    if (!PROGRAMME_FIELDS.includes(key))
      check(same(read(change.baseDocument, key), read(change.document, key)),
        "Retain the original " + key + " edit through its existing Installation binding or owner.");
  const result = copy(document);
  for (const key of PROGRAMME_FIELDS) {
    const value = merge(read(change.baseDocument, key), read(change.document, key), read(document, key), key);
    if (value === missing) delete result[key]; else result[key] = value;
  }
  return result;
}

/** The existing native validators and save transaction own every staged record. */
export function composeCustomerProgramme({seed, document, profile, commissioning, selection,
  calendarInput, taskBudget, nativeChange}) {
  const commercial = commercialWorkshare({seed, commissioning, profile, selection});
  const calendar = prepareCalendar(calendarInput);
  const participant = calendar.inputs.participants.find(row => row.profile === profile.id);
  check(participant, "Include this original customer profile in its complete recurring calendar.");
  if (commercial.recurringSelection)
    check(participant.kind === commercial.recurringSelection.selection.calendarType,
      "The selected recurring source kind differs from the original customer programme.");
  const next = applyProgrammeChange({seed, document, change: nativeChange});
  const budget = taskBudget === undefined ? null : reviewTaskBudget(taskBudget);
  if (budget) {
    for (const key of ["network", "asset", "recipient"])
      check(budget[key] === next.payment[key], "The complete recurring task selects a different native " + key + ".");
    check(budget.maximumAtomic === next.payment.taskBudgetAtomic,
      "The full recurring task budget differs from the same native Installation budget.");
    check(budget.withinBudget, "The complete priced recurring task exceeds the selected native budget.");
  }
  for (const key of ["workorder", "assignments", "checks", "workshare", "coordination", "commercial"])
    check(same(read(next, key), read(document, key)),
      "Programme composition changed the original " + key + " owner.");
  return {
    schema: PROGRAMME_SCHEMA + ".prepared", profile: profile.id,
    workshareCaseId: commercial.caseId, planSha256: commercial.planSha256,
    document: next, commercial, calendar,
    customerRows: calendar.rows.filter(row => row.profile === profile.id),
    taskBudget: budget, originalNativeChange: nativeChange === undefined ? null : copy(nativeChange),
    originalSelection: selection === undefined ? null : copy(selection),
    sourceCalendarInput: copy(calendarInput),
    nativeProgramme: Object.fromEntries(PROGRAMME_FIELDS.filter(key => Object.hasOwn(next, key)).map(key => [key, copy(next[key])]))
  };
}

export function programmeFiles(value) {
  const json = item => JSON.stringify(item, null, 2) + "\n";
  const body = new Map([
    ["commercial.json", json(value.commercial)],
    ["COMMERCIAL.md", commercialMarkdown(value.commercial)],
    ["commercial.html", commercialHtml(value.commercial)],
    ["calendar.json", json(value.calendar)],
    ["calendar.csv", calendarCsv(value.calendar)],
    ["customer-programme.json", json(Object.fromEntries(Object.entries(value)
      .filter(([key]) => !["document", "nativeProgramme"].includes(key))))]
  ]);
  if (value.taskBudget) body.set("task-budget.json", json(value.taskBudget));
  let markdown = "# " + value.commercial.title + " — customer programme\n\n" +
    "Original Workshare: " + value.workshareCaseId + "\n\n" +
    "Complete quoted fee: " + value.commercial.commercial.currency + " " + value.commercial.commercial.amount +
    "; " + value.commercial.totalEffortHours + " original phase hours.\n\n" +
    "## Selected useful work\n\n" +
    value.customerRows.length + " complete scheduled customer tasks from " + value.calendar.startDate +
    " through " + value.calendar.endDateInclusive + ".\n\n" +
    "| UTC review | Source start inclusive | Source end exclusive | Requested snapshot |\n|---|---|---|---|\n";
  for (const row of value.customerRows) markdown += "| " + row.scheduledAt + " | " +
    (row.sourceStartInclusive || "") + " | " + (row.sourceEndExclusive || "") + " | " +
    (row.requestedSnapshotAt || "") + " |\n";
  if (value.taskBudget) markdown += "\n## Complete selected task spending\n\n" +
    value.taskBudget.selectedTotalAtomic + " atomic " + value.taskBudget.asset + " in " +
    value.taskBudget.network + "; maximum " + value.taskBudget.maximumAtomic + "; recipient " +
    value.taskBudget.recipient + ".\n\n" + value.taskBudget.feeTreatment + "\n";
  markdown += "\n## Saved native programme\n\n" +
    "The complete proposed calendar, original commercial terms and selected task budget are retained in the case Sources. " +
    "The existing Customer use and Customer commissioning desks retain dated work, funding groups, actual purchases, native cycles and output decisions. " +
    "The original Installation preview and save validate the selected complete draft; its complete handover carries every saved edition and source attachment.\n";
  body.set("CUSTOMER_PROGRAMME.md", markdown);
  return body;
}
