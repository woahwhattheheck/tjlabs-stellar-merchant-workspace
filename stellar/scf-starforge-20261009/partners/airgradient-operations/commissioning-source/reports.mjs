/**
 * Complete reporting for retained AirGradient public Map source packets.
 * No network, clock, filesystem or third-party dependency is used here.
 */
export const REPORT_VERSION = "airgradient.selected-source-report.v1";
export const MEASURES = Object.freeze(["pm25", "pm10", "atmp", "rhum", "rco2"]);
const HOUR = 3600000;
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const VALID = new Set(["REPORTED_NUMBER", "REPORTED_DECIMAL_STRING"]);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const fail = (message) => { throw new Error(message); };
const clone = (value) => JSON.parse(JSON.stringify(value));
const round = (value) => value === null ? null : Number(value.toFixed(6));

export function safeRelativePath(path) {
  if (typeof path !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)
      || path.split("/").some(part => !part || part === "." || part === "..")) {
    fail("Unsafe relative source path: " + String(path));
  }
  return path;
}

function utcHour(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:00:00(?:\.000)?Z$/.test(value)) {
    fail(label + " must be an explicit whole UTC hour");
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    fail(label + " is not a valid UTC hour");
  }
  return ms;
}

function locationKey(source, id) {
  if (!["outdoor", "indoor"].includes(source) || !Number.isSafeInteger(id) || id < 1) {
    fail("Invalid source-qualified Location ID");
  }
  return source + ":" + id;
}

function decoded(file, label) {
  try { return JSON.parse(file.content); }
  catch (error) { fail("Invalid JSON in " + label + ": " + error.message); }
}

function digest(text, hashText) {
  const result = hashText(text);
  if (!result || !Number.isSafeInteger(result.bytes) || result.bytes < 0
      || !/^[a-f0-9]{64}$/.test(result.sha256)) fail("Invalid SHA-256 adapter result");
  return {bytes: result.bytes, sha256: result.sha256};
}

export function readSourcePacket(sourceText, hashText) {
  if (typeof sourceText !== "string" || typeof hashText !== "function") {
    fail("Supply the complete source packet text and a synchronous SHA-256 adapter");
  }
  const binding = digest(sourceText, hashText);
  if (binding.bytes > 64 * 1024 * 1024) fail("Source packet exceeds the 64 MiB import limit");
  let packet;
  try { packet = JSON.parse(sourceText); } catch { fail("Source packet is not JSON"); }
  if (packet?.schema !== "commons.delivery.source_packet.v1" || !Array.isArray(packet.files)
      || !packet.files.length || packet.files.length > 10000) fail("Unsupported source packet");
  const files = new Map();
  for (const file of packet.files) {
    safeRelativePath(file.path);
    if (files.has(file.path)) fail("Duplicate source member: " + file.path);
    if (file.encoding !== "utf8" || typeof file.content !== "string") {
      fail("Source member must contain its complete UTF-8 text: " + file.path);
    }
    const actual = digest(file.content, hashText);
    if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) {
      fail("Source member does not match its declared body: " + file.path);
    }
    files.set(file.path, file);
  }
  const get = (path) => {
    const value = files.get(path);
    if (!value) fail("Missing original source member: " + path);
    return value;
  };
  const scope = decoded(get("source-scope.json"), "source-scope.json");
  const manifest = decoded(get("source-manifest.json"), "source-manifest.json");
  const catalogue = decoded(get("catalogs/measurements.json"), "catalogs/measurements.json");
  if (scope.schema !== "commons.research.source_scope.v1"
      || scope.source_class !== "AirGradient public Map"
      || scope.operation_id !== packet.operation_id
      || manifest.operation_id !== packet.operation_id) fail("Source scope and packet identity differ");
  if (!Array.isArray(manifest.sources) || !Array.isArray(catalogue)) fail("Invalid source catalogue");
  const manifestSources = new Map();
  for (const item of manifest.sources) {
    if (manifestSources.has(item.path)) fail("Duplicate source manifest member: " + item.path);
    const file = get(item.path);
    if (item.sha256 !== file.sha256 || item.bytes !== file.bytes) {
      fail("Source manifest and original member differ: " + item.path);
    }
    manifestSources.set(item.path, item);
  }
  if (!Array.isArray(scope.locations) || !scope.locations.length || scope.locations.length > 20) {
    fail("The selected-source installation requires one to twenty locations");
  }
  if (!Array.isArray(scope.histories) || scope.histories.length !== scope.locations.length) {
    fail("Each selected location must have its one retained hourly history");
  }
  if (scope.capture_interval?.bucket_size !== "1h") fail("This report contract uses one-hour UTC buckets");
  const captureStart = utcHour(scope.capture_interval.start, "Capture start");
  const captureEnd = utcHour(scope.capture_interval.end, "Capture end");
  if (captureEnd <= captureStart) fail("Capture end must follow its start");
  const windows = scope.report_windows?.map(window => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(window.id)) fail("Invalid report window ID");
    const start = utcHour(window.start, "Report start");
    const end = utcHour(window.end, "Report end");
    const hours = (end - start) / HOUR;
    if (hours < 1 || hours > 24 * 366 || window.hours !== hours
        || start < captureStart || end > captureEnd) fail("Invalid or uncovered report interval");
    return {...clone(window), startMs: start, endMs: end};
  });
  if (!Array.isArray(windows) || windows.length !== 2
      || new Set(windows.map(window => window.id)).size !== 2) {
    fail("Supply the initial and later report windows");
  }
  const units = {};
  for (const measure of MEASURES) {
    const choices = catalogue.filter(item => item.name === measure);
    if (choices.length !== 1) fail("Measurement catalogue must uniquely define " + measure);
    const defaults = choices[0].units?.filter(unit => unit.isDefault === true);
    if (!defaults || defaults.length !== 1 || typeof defaults[0].label !== "string") {
      fail("Measurement catalogue must define one default unit for " + measure);
    }
    units[measure] = clone(defaults[0]);
  }
  const locations = new Map();
  for (const entry of scope.locations) {
    const key = locationKey(entry.source, entry.location_id);
    if (locations.has(key)) fail("Duplicate selected location: " + key);
    if (entry.location?.locationId !== entry.location_id
        || entry.current_observation?.locationId !== entry.location_id) fail("Location metadata ID differs: " + key);
    for (const [kind, record] of [["locations", entry.location], ["current", entry.current_observation]]) {
      const original = decoded(get("public/" + entry.source + "/" + kind + "-page-1.json"), "Original location page");
      const match = original.data?.filter(row => row.locationId === entry.location_id);
      if (!match || match.length !== 1 || JSON.stringify(match[0]) !== JSON.stringify(record)) {
        fail("Selected location is not the exact retained " + kind + " record: " + key);
      }
    }
    locations.set(key, {key, ...clone(entry)});
  }
  const histories = [];
  const seenHistories = new Set();
  for (const descriptor of scope.histories) {
    const key = locationKey(descriptor.source, descriptor.location_id);
    if (!locations.has(key) || seenHistories.has(key)) fail("History selection differs: " + key);
    seenHistories.add(key);
    const file = get(descriptor.source_file);
    const record = manifestSources.get(descriptor.source_file);
    if (descriptor.source_sha256 !== file.sha256 || !record
        || record.url !== descriptor.source_url) fail("History source identity differs: " + key);
    if (descriptor.bucket_size !== "1h"
        || utcHour(descriptor.request_start, "History start") !== captureStart
        || utcHour(descriptor.request_end, "History end") !== captureEnd) fail("History request interval differs: " + key);
    const body = decoded(file, file.path);
    if (!Array.isArray(body.data) || descriptor.returned_rows !== body.data.length
        || body.total !== descriptor.total || body.page !== descriptor.page
        || body.pagesize !== descriptor.pagesize) fail("History response envelope differs: " + key);
    if (body.page !== null || body.pagesize !== null) fail("This import expects the complete unpaged history response");
    const requested = descriptor.source === "indoor" ? [...MEASURES] : [descriptor.measure];
    if (requested.some(measure => !MEASURES.includes(measure))
        || (descriptor.source === "indoor" && descriptor.measure !== null)) fail("Unsupported captured measurement selection");
    const byHour = new Map();
    const rows = body.data.map((row, sourceRow) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) fail("Invalid history row");
      const ms = utcHour(row.timebucket, key + " history timestamp");
      if (ms < captureStart || ms > captureEnd) fail("History row is outside the captured interval: " + key);
      if (byHour.has(ms)) fail("Duplicate hour must be resolved in source acquisition: " + key + " " + row.timebucket);
      const reading = {ms, source_row: sourceRow, record: clone(row)};
      byHour.set(ms, reading);
      return reading;
    }).sort((a, b) => a.ms - b.ms);
    histories.push({key, location: locations.get(key), descriptor: clone(descriptor), requested, rows, byHour});
  }
  return {packet, sourceText, binding, files, scope, manifest, catalogue, units, windows, histories};
}

export function measureValue(row, source, measure, requested) {
  if (!requested.includes(measure)) return {state: "NOT_REQUESTED", value: null};
  if (!row) return {state: "NO_BUCKET", value: null};
  const field = source === "outdoor" ? "value" : measure;
  if (!own(row, field)) return {state: "ABSENT_FIELD", value: null};
  const raw = row[field];
  if (raw === null) return {state: "NULL", value: null};
  if (typeof raw === "number" && Number.isFinite(raw)) return {state: "REPORTED_NUMBER", value: raw};
  if (typeof raw === "string" && DECIMAL.test(raw) && Number.isFinite(Number(raw))) {
    return {state: "REPORTED_DECIMAL_STRING", value: Number(raw)};
  }
  return {state: "INVALID", value: null};
}

function seriesSummary(history, window, measure, units) {
  const counts = {REPORTED_NUMBER: 0, REPORTED_DECIMAL_STRING: 0, NULL: 0, ABSENT_FIELD: 0, NO_BUCKET: 0, INVALID: 0};
  let sum = 0, compensation = 0, min = null, max = null, zeros = 0, outside = 0;
  const gaps = [];
  let active = null;
  for (let ms = window.startMs; ms < window.endMs; ms += HOUR) {
    const row = history.byHour.get(ms)?.record;
    const reading = measureValue(row, history.descriptor.source, measure, history.requested);
    counts[reading.state]++;
    if (VALID.has(reading.state)) {
      const value = reading.value;
      const y = value - compensation, next = sum + y;
      compensation = (next - sum) - y; sum = next;
      min = min === null ? value : Math.min(min, value);
      max = max === null ? value : Math.max(max, value);
      if (value === 0) zeros++;
      const unit = units[measure];
      if ((typeof unit.min === "number" && value < unit.min)
          || (typeof unit.max === "number" && value > unit.max)) outside++;
      if (active) { gaps.push(active); active = null; }
    } else if (active && active.state === reading.state) {
      active.end = new Date(ms + HOUR).toISOString(); active.hours++;
    } else {
      if (active) gaps.push(active);
      active = {window: window.id, source: history.descriptor.source,
        location_id: history.descriptor.location_id, measure, state: reading.state,
        start: new Date(ms).toISOString(), end: new Date(ms + HOUR).toISOString(), hours: 1,
        source_file: history.descriptor.source_file};
    }
  }
  if (active) gaps.push(active);
  const valid = counts.REPORTED_NUMBER + counts.REPORTED_DECIMAL_STRING;
  return {
    summary: {window: window.id, source: history.descriptor.source, location_id: history.descriptor.location_id,
      measure, unit: units[measure].label, expected_hours: window.hours,
      returned_hours: window.hours - counts.NO_BUCKET, valid_hours: valid,
      null_hours: counts.NULL, absent_field_hours: counts.ABSENT_FIELD,
      missing_hours: counts.NO_BUCKET, invalid_hours: counts.INVALID,
      numeric_string_hours: counts.REPORTED_DECIMAL_STRING, zero_hours: zeros,
      outside_catalogue_range_hours: outside, coverage_pct: round(100 * valid / window.hours),
      min, max, mean: valid ? round(sum / valid) : null,
      mean_basis: "Unweighted arithmetic mean of available provider hourly aggregates",
      source_file: history.descriptor.source_file, source_sha256: history.descriptor.source_sha256},
    gaps
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
export function csvText(columns, records) {
  return [columns.join(","), ...records.map(row => columns.map(key => csvCell(row[key])).join(","))].join("\r\n") + "\r\n";
}
const SUMMARY_COLUMNS = ["window", "source", "location_id", "measure", "unit", "expected_hours", "returned_hours",
  "valid_hours", "null_hours", "absent_field_hours", "missing_hours", "invalid_hours", "numeric_string_hours",
  "zero_hours", "outside_catalogue_range_hours", "coverage_pct", "min", "max", "mean", "mean_basis",
  "source_file", "source_sha256"];
const GAP_COLUMNS = ["window", "source", "location_id", "measure", "state", "start", "end", "hours", "source_file"];
const READING_COLUMNS = ["window", "source", "location_id", "timebucket",
  ...MEASURES.flatMap(measure => [measure, measure + "_state"]), "source_file", "source_row"];
const JSON_TEXT = value => JSON.stringify(value, null, 2) + "\n";

export function compileSourceReports(sourceText, hashText) {
  const input = readSourcePacket(sourceText, hashText);
  const outputs = {};
  const periods = [];
  for (const window of input.windows) {
    const summaries = [], gaps = [], csvRows = [], histories = [];
    const totals = {locations: input.histories.length, expected_location_hours: input.histories.length * window.hours,
      returned_location_hours: 0, missing_location_hours: 0, outdoor_rows: 0, indoor_rows: 0,
      valid_measurements: 0, null_fields: 0, absent_fields: 0, invalid_fields: 0, zero_values: 0};
    for (const history of input.histories) {
      const rows = history.rows.filter(row => row.ms >= window.startMs && row.ms < window.endMs);
      const source = history.descriptor.source, id = history.descriptor.location_id;
      totals.returned_location_hours += rows.length;
      totals.missing_location_hours += window.hours - rows.length;
      totals[source + "_rows"] += rows.length;
      histories.push({source, location_id: id, source_file: history.descriptor.source_file,
        source_sha256: history.descriptor.source_sha256, source_url: history.descriptor.source_url,
        requested_measures: history.requested,
        rows: rows.map(row => ({source_row: row.source_row, record: row.record}))});
      for (const measure of history.requested) {
        const result = seriesSummary(history, window, measure, input.units);
        summaries.push(result.summary); gaps.push(...result.gaps);
        totals.valid_measurements += result.summary.valid_hours;
        totals.null_fields += result.summary.null_hours;
        totals.absent_fields += result.summary.absent_field_hours;
        totals.invalid_fields += result.summary.invalid_hours;
        totals.zero_values += result.summary.zero_hours;
      }
      for (const row of rows) {
        const record = {window: window.id, source, location_id: id, timebucket: row.record.timebucket,
          source_file: history.descriptor.source_file, source_row: row.source_row};
        for (const measure of MEASURES) {
          const reading = measureValue(row.record, source, measure, history.requested);
          record[measure] = reading.value; record[measure + "_state"] = reading.state;
        }
        csvRows.push(record);
      }
    }
    const report = {schema: REPORT_VERSION, source_packet: {...input.binding, operation_id: input.packet.operation_id,
        created_at: input.packet.created_at, selected_members: input.packet.files.length},
      source_class: input.scope.source_class, source_selection: clone(input.scope.selection),
      period: {id: window.id, start: window.start, end: window.end, hours: window.hours,
        interval: "Half-open [start, end), one-hour UTC buckets"},
      measurement_units: clone(input.units),
      attribution: clone(input.scope.attribution), locations: clone(input.scope.locations),
      interpretation: {
        source: "Actual retained public Map responses for these twenty or fewer selected public Location IDs.",
        roster: "Candidate page-1 responses are retained for selection; they are not a complete global roster.",
        privacy: "Indoor coordinates are the provider's coarse public coordinates; no address or building is inferred.",
        values: "Original provider record objects and zero-based source_row positions are retained below. Decimal strings and nulls are unchanged.",
        coverage: "Coverage is valid reported values divided by all expected hours for each requested measure.",
        mean: "Means are unweighted arithmetic means of available provider hourly aggregates, presented to six decimals.",
        processing: "No interpolation, zero fill, health classification, unit conversion or second provider correction is applied.",
        missing: "NO_BUCKET means no returned hourly bucket. NULL is an explicit null in a returned bucket; ABSENT_FIELD and INVALID remain separate.",
        selection: "Outdoor history contains only its explicitly requested measure; other CSV measures are NOT_REQUESTED.",
        range: "Catalogue range excursions are counted and retained, without clamping or exclusion.",
        csv: "Numeric cells are normalized finite numbers. Text beginning with spreadsheet formula prefixes receives a leading apostrophe; original text remains in JSON/source."
      }, totals, summaries, gaps, histories};
    periods.push(report);
    const prefix = "reports/" + window.id + "/";
    outputs[prefix + "report.json"] = JSON.stringify(report) + "\n";
    outputs[prefix + "readings.csv"] = csvText(READING_COLUMNS, csvRows);
    outputs[prefix + "summary.csv"] = csvText(SUMMARY_COLUMNS, summaries);
    outputs[prefix + "gaps.csv"] = csvText(GAP_COLUMNS, gaps);
  }
  const earlier = input.windows[0], later = input.windows[1];
  const transitions = input.histories.map(history => {
    const a = new Set(history.rows.filter(row => row.ms >= earlier.startMs && row.ms < earlier.endMs).map(row => row.ms));
    const b = new Set(history.rows.filter(row => row.ms >= later.startMs && row.ms < later.endMs).map(row => row.ms));
    const retained = [...a].filter(ms => b.has(ms)).length;
    return {source: history.descriptor.source, location_id: history.descriptor.location_id,
      initial_rows: a.size, later_rows: b.size, retained_rows: retained,
      leaving_rows: a.size - retained, entering_rows: b.size - retained, net_rows: b.size - a.size,
      source_file: history.descriptor.source_file};
  });
  const comparison = {schema: "airgradient.selected-source-window-comparison.v1", source_packet: input.binding,
    initial: periods[0].period, later: periods[1].period,
    interpretation: "Both reports use the same frozen source capture. Differences describe movement of the report window; they do not assert a subsequent provider revision.",
    totals: transitions.reduce((total, row) => {
      for (const key of ["initial_rows", "later_rows", "retained_rows", "leaving_rows", "entering_rows", "net_rows"]) total[key] = (total[key] || 0) + row[key];
      return total;
    }, {}), locations: transitions};
  outputs["reports/window-comparison.json"] = JSON_TEXT(comparison);
  outputs["reports/window-comparison.csv"] = csvText(["source", "location_id", "initial_rows", "later_rows",
    "retained_rows", "leaving_rows", "entering_rows", "net_rows", "source_file"], transitions);
  outputs["reports/operator-report.html"] = renderOperatorReport(periods, comparison);
  outputs["reports/ATTRIBUTION.md"] = renderAttribution(input);
  const artifactEntries = Object.entries(outputs).map(([path, content]) => ({path, ...digest(content, hashText)}));
  const manifest = {schema: "airgradient.selected-source-delivery.v1", report_version: REPORT_VERSION,
    source_packet: {...input.binding, path: "input/source-packet.json", operation_id: input.packet.operation_id,
      created_at: input.packet.created_at},
    source_members: input.packet.files.map(file => ({path: "source/" + file.path, bytes: file.bytes, sha256: file.sha256})),
    artifacts: artifactEntries,
    periods: periods.map(report => ({...report.period, ...report.totals})),
    receiving: "Regenerate from input/source-packet.json with report-cli.mjs; the command retains every original member, all complete exports and this deterministic manifest."};
  outputs["reports/manifest.json"] = JSON_TEXT(manifest);
  return {input, periods, comparison, manifest, outputs};
}

const htmlEscape = value => String(value ?? "").replace(/[&<>"']/g, char =>
  ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char]));
const human = value => value === null ? "—" : htmlEscape(value);
const displayLocation = entry => entry.source === "indoor" ? "Public indoor " + entry.location_id
  : (entry.location.locationName || "Public outdoor " + entry.location_id);

export function renderOperatorReport(periods, comparison) {
  const [a, b] = periods;
  const byKey = new Map(b.summaries.map(row => [row.source + ":" + row.location_id + ":" + row.measure, row]));
  const names = new Map(a.locations.map(entry => [entry.source + ":" + entry.location_id, displayLocation(entry)]));
  const rows = a.summaries.map(first => {
    const second = byKey.get(first.source + ":" + first.location_id + ":" + first.measure);
    const name = names.get(first.source + ":" + first.location_id);
    return "<tr><th scope=\"row\">" + htmlEscape(name) + "<small>" + htmlEscape(first.source + " · " + first.location_id)
      + "</small></th><td>" + htmlEscape(first.measure) + "<small>" + htmlEscape(first.unit) + "</small></td>"
      + [first, second].map(row => "<td>" + row.valid_hours + " / " + row.expected_hours
        + "<small>" + row.coverage_pct + "% values</small></td><td>" + human(row.mean)
        + "<small>" + human(row.min) + " to " + human(row.max) + "</small></td><td>"
        + row.missing_hours + " / " + row.null_hours + "<small>"
        + row.absent_field_hours + " absent · " + row.invalid_hours + " invalid</small></td>").join("") + "</tr>";
  }).join("");
  const editions = periods.map(period => "<section><h2>" + htmlEscape(period.period.id)
    + " report</h2><p>" + htmlEscape(period.period.start) + " ≤ hour &lt; " + htmlEscape(period.period.end)
    + "</p><dl><div><dt>Selected locations</dt><dd>" + period.totals.locations
    + "</dd></div><div><dt>Returned hourly records</dt><dd>" + period.totals.returned_location_hours
    + "</dd></div><div><dt>Missing location hours</dt><dd>" + period.totals.missing_location_hours
    + "</dd></div><div><dt>Valid measured values</dt><dd>" + period.totals.valid_measurements
    + "</dd></div></dl><p class=\"downloads\">"
    + [["report.json", "Complete JSON"], ["readings.csv", "All readings CSV"], ["summary.csv", "Measure summary CSV"], ["gaps.csv", "Gap intervals CSV"]]
      .map(([file, label]) => "<a href=\"" + htmlEscape(period.period.id) + "/" + file + "\">" + label + "</a>").join(" · ")
    + "</p></section>").join("");
  const locations = a.locations.map(entry => {
    const m = entry.location;
    return "<tr><th scope=\"row\">" + htmlEscape(displayLocation(entry)) + "</th><td>"
      + htmlEscape(entry.source + ":" + entry.location_id) + "</td><td>"
      + htmlEscape(m.ownerName ?? "Not supplied") + "</td><td>"
      + htmlEscape(m.dataSource ?? m.provider ?? "Not supplied") + "</td><td>"
      + htmlEscape((m.licenses || []).join("; ")) + "</td></tr>";
  }).join("");
  return "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    + "<title>AirGradient selected-location reporting</title><style>"
    + "*{box-sizing:border-box}body{margin:0;color:#202020;background:#f4f4f4;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}"
    + "main{max-width:1440px;margin:auto;padding:32px}h1{font-size:28px;line-height:1.2}h2{font-size:20px}h3{font-size:16px}"
    + "header,section{background:#fff;border:1px solid #bbb;padding:24px;margin-bottom:20px}"
    + ".editions{display:grid;grid-template-columns:1fr 1fr;gap:20px}.editions section{margin:0 0 20px}"
    + "dl{display:grid;grid-template-columns:1fr 1fr;gap:12px}dl div{border-top:1px solid #ddd;padding-top:10px}dt{font-size:13px;color:#444}dd{font-size:24px;margin:0}"
    + "a{color:#171717;text-underline-offset:3px}small{display:block;font-size:12px;font-weight:400;color:#444}table{border-collapse:collapse;width:100%;font-size:13px}"
    + "th,td{padding:10px 8px;border-bottom:1px solid #ccc;vertical-align:top;text-align:left}thead th{background:#eee;white-space:nowrap}tbody th{min-width:170px}"
    + ".table-scroll{overflow:auto}.mono{font-family:ui-monospace,monospace;overflow-wrap:anywhere}li{margin:8px 0}footer{font-size:13px;color:#444}"
    + "@media(max-width:700px){main{padding:12px}header,section{padding:16px}.editions{display:block}h1{font-size:24px}}"
    + "@media print{body{background:white}main{padding:0;max-width:none}.table-scroll{overflow:visible}header,section{border:0;padding:8px 0}tr{break-inside:avoid}a{color:inherit}}"
    + "</style></head><body><main><header><h1>AirGradient selected-location reporting</h1>"
    + "<p>Complete initial and later reports from the same retained public Map capture. " + a.locations.length + " selected locations; one-hour UTC aggregation.</p>"
    + "<p>Source operation <span class=\"mono\">" + htmlEscape(a.source_packet.operation_id) + "</span><br>Captured packet "
    + htmlEscape(a.source_packet.created_at) + " · " + a.source_packet.selected_members + " complete source members</p></header>"
    + "<div class=\"editions\">" + editions + "</div><section><h2>Read the coverage correctly</h2><ul>"
    + "<li>Coverage counts valid values for each requested measure. A returned hour with a null PM10 value is not a reported PM10 measurement.</li>"
    + "<li>Missing bucket hours, explicit nulls, absent fields and invalid values remain separate. Valid zero values are included.</li>"
    + "<li>Outdoor history requested PM2.5 only. Other outdoor fields in CSV are labelled NOT_REQUESTED, even when the separate current snapshot contains them.</li>"
    + "<li>Means use available provider hourly aggregates with equal weight. No interpolation, health classification, extra correction or unit conversion is applied.</li>"
    + "<li>Indoor names and addresses are not inferred from coarse public coordinates. Candidate pages do not represent the full global sensor population.</li></ul>"
    + "<p>Both reports use the same frozen source: " + comparison.totals.leaving_rows + " records leave the window, "
    + comparison.totals.entering_rows + " enter, and " + comparison.totals.retained_rows + " remain. This is a window comparison, not a claim of later source revision.</p>"
    + "<p><a href=\"window-comparison.csv\">Per-location window comparison CSV</a> · <a href=\"window-comparison.json\">Complete comparison JSON</a></p></section>"
    + "<section><h2>All requested measure series</h2><p>Mean with minimum to maximum below it. Gap columns show missing bucket hours / explicit null hours; absent and invalid fields follow below.</p>"
    + "<div class=\"table-scroll\"><table><thead><tr><th rowspan=\"2\">Location</th><th rowspan=\"2\">Measure</th>"
    + "<th colspan=\"3\">" + htmlEscape(a.period.id) + "</th><th colspan=\"3\">" + htmlEscape(b.period.id) + "</th></tr>"
    + "<tr><th>Valid hours</th><th>Mean / range</th><th>Missing / null</th><th>Valid hours</th><th>Mean / range</th><th>Missing / null</th></tr></thead><tbody>"
    + rows + "</tbody></table></div></section><section><h2>Source owners and attribution</h2>"
    + "<p>AirGradient and the original contributors. Selected source data and these derived reports retain CC BY-SA 4.0 attribution. Full original metadata is preserved in each report and the source packet.</p>"
    + "<div class=\"table-scroll\"><table><thead><tr><th>Location</th><th>Public ID</th><th>Owner as supplied</th><th>Data source</th><th>License</th></tr></thead><tbody>"
    + locations + "</tbody></table></div><p><a href=\"ATTRIBUTION.md\">Full attribution and source links</a> · <a href=\"manifest.json\">Complete delivery manifest</a> · "
    + "<a href=\"../input/source-packet.json\">All 41 original source members</a></p></section>"
    + "<footer><p>Source SHA-256 <span class=\"mono\">" + htmlEscape(a.source_packet.sha256)
    + "</span><br>Report format " + REPORT_VERSION + ". Full original response text remains available for every derived value.</p></footer></main></body></html>\n";
}

function renderAttribution(input) {
  const lines = ["# AirGradient source and report attribution", "",
    "Provider: AirGradient — https://www.airgradient.com", "",
    "The selected location data identifies CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/ . These derived data reports are distributed under the same license.",
    "Changes: selected two half-open UTC reporting windows, calculated per-measure coverage and arithmetic summaries, normalized numeric values for CSV, and rendered the report. Original response members and JSON value representations remain unchanged.", "",
    "Original capture operation: " + input.packet.operation_id,
    "Original capture timestamp: " + input.packet.created_at,
    "Complete source packet SHA-256: " + input.binding.sha256, "",
    "Official data-sharing explanation: https://www.airgradient.com/documentation/kb/kb-diy-data-ownership-and-sharing/",
    "Official indoor dataset explanation: https://www.airgradient.com/documentation/kb/global-indoor-air-quality-dataset/", "",
    "## Selected contributors and original location metadata", ""];
  for (const history of input.histories) {
    const entry = history.location, m = entry.location;
    lines.push("### " + displayLocation(entry) + " (" + history.key + ")", "",
      "Owner as supplied: " + (m.ownerName ?? "not supplied") + ". Owner ID: " + (m.ownerId ?? "not supplied") + ".",
      "Owner URL as supplied: " + (m.url ?? "not supplied") + ".",
      "Provider: " + (m.provider ?? "not supplied") + ". Data source: " + (m.dataSource ?? "not supplied") + ".",
      "Source details: " + JSON.stringify(m.dataSourceDetail ?? null),
      "License details: " + JSON.stringify(m.licenseDetails ?? m.licenses ?? null),
      "Original history: " + history.descriptor.source_url,
      "Original source member: source/" + history.descriptor.source_file,
      "Original source SHA-256: " + history.descriptor.source_sha256, "");
  }
  lines.push("## Scope", "",
    "Public indoor coordinates retain the provider's coarse precision. No address or building is inferred.",
    "Provider metadata and owner URLs are reproduced as supplied; a URL lacking a scheme is not promoted into a verified link.",
    "This attribution applies to the captured data and derived reports. Existing application software retains its repository license and notices.", "");
  return lines.join("\n");
}
