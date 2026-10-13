"""MIT. Deterministic complete offline IATI geography review renderer.

The original portable writer owns the output path and immutable native selection.
This renderer streams every original row, embeds the complete saved review and
uses only local browser APIs. Updated findings download as one original flat
save request; the original workspace remains the writer of saved revisions.
"""
from __future__ import annotations

import base64
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path

_SCRIPT = r"""(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const text = value => value === null || value === undefined ? "" : String(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const node = (tag, content, className) => {
    const value = document.createElement(tag);
    if (content !== undefined) value.textContent = text(content);
    if (className) value.className = className;
    return value;
  };
  const say = (value, error = false) => {
    const target = byId("notice");
    target.textContent = value;
    target.className = error ? "notice error" : "notice";
    target.hidden = !value;
  };
  const fail = message => { throw new Error(message); };
  let data;
  try {
    data = JSON.parse(byId("geography-data").textContent);
    if (!Array.isArray(data.rows) || !data.view || !Array.isArray(data.fields) ||
        !Array.isArray(data.definitionFields) || !data.contract ||
        data.rows.length !== data.view.report.counts.rows) {
      fail("The complete report data does not match its saved review.");
    }
  } catch (error) {
    say("This report could not be opened: " + error.message, true);
    byId("workspace").hidden = true;
    return;
  }
  const view = data.view;
  const records = data.rows;
  const draft = {};
  for (const field of data.definitionFields) draft[field] = clone(view[field]);
  const keyOf = row => row.source + ":" + (row.row_id || row.rowId);
  const originalFindings = new Map(view.findings.map(value => [keyOf(value), clone(value)]));
  const findings = new Map(view.findings.map(value => [keyOf(value), clone(value)]));
  const changedFindings = new Set();
  const decisions = new Set(["accepted", "needs-correction", "note"]);
  const labels = {
    "valid": "Valid reported point", "missing": "Point missing",
    "invalid": "Invalid point", "not-reported": "Location not reported",
    "accepted": "Accepted", "needs-correction": "Needs correction",
    "note": "Note", "unreviewed": "Unreviewed",
    "draft": "Draft", "reviewed": "Reviewed"
  };
  const label = value => labels[value] || text(value);
  const acquisitions = new Map(view.acquisition.map(value => [value.source, value]));
  const sourceOrdinal = new Map(view.sources.map((value, index) => [value, index + 1]));
  const sourceName = source => {
    const original = acquisitions.get(source);
    return original && original.publisher ? original.publisher : "Source " + sourceOrdinal.get(source);
  };
  const locationName = row => row.location_name || row.location_ref ||
    (row.location_present === "false" ? "Activity without a reported location" : "Unnamed reported location");
  const decisionOf = row => findings.get(keyOf(row))?.decision || "unreviewed";
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/;
  const point = row => {
    if (row.coordinate_status !== "valid" || row.srs_name !== data.contract.crs ||
        typeof row.latitude !== "string" || typeof row.longitude !== "string" ||
        !decimal.test(row.latitude) || !decimal.test(row.longitude)) return null;
    const lat = Number(row.latitude), lon = Number(row.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? {lat, lon} : null;
  };
  const pretty = value => JSON.stringify(value, null, 2);
  const jsonField = value => {
    try { return JSON.parse(value); } catch (_) { return null; }
  };
  const badge = (value, fallback) => node("span", label(value) || fallback || "", "badge " + (
    value === "accepted" || value === "valid" ? "positive" :
    value === "needs-correction" || value === "invalid" ? "attention" : "neutral"));
  const option = (value, caption) => {
    const element = node("option", caption);
    element.value = value;
    return element;
  };
  const showValue = (parent, title, value, multiline = false) => {
    const line = node("div", undefined, "detail-field");
    line.append(node("dt", title));
    line.append(node(multiline ? "pre" : "dd", value === "" ? "Not reported" : value));
    parent.append(line);
  };
  const plainText = (value, title, max, required) => {
    if (typeof value !== "string") fail(title + " must be text.");
    const selected = value.trim();
    if ((required && !selected) || Array.from(value).length > max)
      fail(title + (required && !selected ? " is required." : " is too long."));
    return value;
  };
  const dirty = () => changedFindings.size > 0 || draft.name !== view.name || draft.notes !== view.notes ||
    JSON.stringify(draft.review) !== JSON.stringify(view.review);
  let selectedIndex = null;
  let selectedMatches = false;
  let filtered = [];
  let page = 0;
  let filterGeneration = 0;
  let filterTimer = null;
  let mapGeneration = 0;
  const mapView = {lon: 0, lat: 0, zoom: 1};
  let plot = null;
  let drag = null;
  let clickCycle = {signature: "", at: 0};
  const canvas = byId("map");
  let context = canvas.getContext("2d");
  const rowsPerPage = () => Number(byId("page-size").value);
  const setChanged = key => {
    if (JSON.stringify(findings.get(key) || null) === JSON.stringify(originalFindings.get(key) || null))
      changedFindings.delete(key);
    else changedFindings.add(key);
  };
  const updateDraftSummary = () => {
    const count = findings.size;
    byId("finding-total").textContent = String(count);
    byId("finding-caption").textContent = changedFindings.size ?
      changedFindings.size + " finding selection" + (changedFindings.size === 1 ? "" : "s") + " edited locally" :
      "Saved finding selections";
    byId("edit-status").textContent = dirty() ?
      "Local review edits are ready to download. Save the downloaded request in the original workspace." :
      "This is the saved review selection. You can edit findings and download a complete update.";
    byId("reset-all").disabled = !dirty();
    byId("download-update").textContent = "Download review update";
  };
  const matches = (row, query) => {
    if (query.source && row.source !== query.source) return false;
    if (query.status && row.coordinate_status !== query.status) return false;
    if (query.decision && decisionOf(row) !== query.decision) return false;
    if (query.exactness && row.exactness !== query.exactness) return false;
    if (!query.search) return true;
    const finding = findings.get(keyOf(row));
    if ([row.source, sourceName(row.source), finding?.reviewer, finding?.note]
        .some(value => text(value).toLowerCase().includes(query.search))) return true;
    return data.fields.some(field => text(row[field]).toLowerCase().includes(query.search));
  };
  const queryValue = () => ({
    source: byId("source-filter").value,
    status: byId("status-filter").value,
    decision: byId("decision-filter").value,
    exactness: byId("exactness-filter").value,
    search: byId("search").value.trim().toLowerCase()
  });
  const runFilters = (resetPage = true) => {
    const generation = ++filterGeneration;
    const query = queryValue();
    const result = [];
    let offset = 0;
    byId("filter-state").textContent = "Searching the complete register…";
    byId("register").setAttribute("aria-busy", "true");
    const step = () => {
      if (generation !== filterGeneration) return;
      const end = Math.min(offset + 4000, records.length);
      for (; offset < end; offset++) if (matches(records[offset], query)) result.push(offset);
      if (offset < records.length) {
        requestAnimationFrame(step);
        return;
      }
      filtered = result;
      if (resetPage) page = 0;
      const pages = Math.max(1, Math.ceil(filtered.length / rowsPerPage()));
      page = Math.min(page, pages - 1);
      selectedMatches = selectedIndex !== null && filtered.includes(selectedIndex);
      byId("filter-state").textContent = filtered.length.toLocaleString() + " of " +
        records.length.toLocaleString() + " complete records match.";
      byId("register").setAttribute("aria-busy", "false");
      renderRegister();
      renderMap();
      if (selectedIndex !== null) byId("selected-filter-state").textContent = selectedMatches ?
        "Selected from the current filtered register." : "Selected record is outside the current filters.";
    };
    step();
  };
  const scheduleFilters = () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => runFilters(true), 160);
  };
  const renderRegister = () => {
    const body = byId("register-body");
    const fragment = document.createDocumentFragment();
    const size = rowsPerPage(), start = page * size;
    for (const index of filtered.slice(start, start + size)) {
      const row = records[index];
      const tr = node("tr");
      if (selectedIndex === index) tr.className = "selected";
      const main = node("td");
      const open = node("button", locationName(row), "record-link");
      open.type = "button";
      open.addEventListener("click", () => selectRow(index, true));
      main.append(open, node("span", row.title || "Untitled activity", "cell-subtitle"),
        node("code", row.activity_id, "cell-code"));
      const source = node("td");
      source.append(node("span", sourceName(row.source)), node("code", row.source, "cell-code"));
      const coordinate = node("td");
      coordinate.append(badge(row.coordinate_status));
      if (point(row)) coordinate.append(node("span", row.latitude + ", " + row.longitude, "cell-subtitle"));
      else coordinate.append(node("span", row.position_text || "No mapped geometry", "cell-subtitle"));
      const precision = data.contract.exactness[row.exactness] || (row.exactness ? "Code " + row.exactness : "Exactness not reported");
      coordinate.append(node("small", precision));
      const org = node("td", row.reporting_org_ref || "Not reported");
      const decision = node("td");
      decision.append(badge(decisionOf(row)));
      const finding = findings.get(keyOf(row));
      if (finding) decision.append(node("small", finding.reviewer));
      if (changedFindings.has(keyOf(row))) decision.append(node("small", "Local edit", "local-mark"));
      tr.append(main, source, coordinate, org, decision);
      fragment.append(tr);
    }
    if (!filtered.length) {
      const tr = node("tr"), td = node("td", "No records match these filters. Clear the filters to reopen the complete register.");
      td.colSpan = 5;
      tr.append(td);
      fragment.append(tr);
    }
    body.replaceChildren(fragment);
    const pages = Math.max(1, Math.ceil(filtered.length / size));
    byId("page-status").textContent = filtered.length ?
      "Records " + (start + 1).toLocaleString() + "–" + Math.min(start + size, filtered.length).toLocaleString() +
      " · page " + (page + 1) + " of " + pages : "No matching records";
    byId("previous-page").disabled = page === 0;
    byId("next-page").disabled = page + 1 >= pages;
  };
  const selectRow = (index, focus = false) => {
    selectedIndex = index;
    selectedMatches = filtered.includes(index);
    const row = records[index];
    byId("empty-detail").hidden = true;
    byId("record-detail").hidden = false;
    byId("selected-title").textContent = locationName(row);
    byId("selected-filter-state").textContent = selectedMatches ?
      "Selected from the current filtered register." : "Selected record is outside the current filters.";
    const identity = byId("selected-identity");
    identity.replaceChildren();
    showValue(identity, "Publisher source", row.source);
    showValue(identity, "Original row", row.row_id);
    showValue(identity, "Activity", row.activity_id);
    showValue(identity, "Reporting organisation", row.reporting_org_ref);
    showValue(identity, "Coordinate status", label(row.coordinate_status));
    showValue(identity, "Reported latitude", row.latitude);
    showValue(identity, "Reported longitude", row.longitude);
    showValue(identity, "Original position", row.position_text);
    showValue(identity, "Reported CRS", row.srs_name);
    showValue(identity, "Publisher exactness", data.contract.exactness[row.exactness] || row.exactness);
    showValue(identity, "Location class", data.contract.locationClass[row.location_class] || row.location_class);
    showValue(identity, "Location reach", data.contract.locationReach[row.location_reach] || row.location_reach);
    const problems = jsonField(row.issues_json);
    const issueList = byId("record-issues");
    issueList.replaceChildren();
    if (Array.isArray(problems) && problems.length) {
      for (const issue of problems) {
        const li = node("li");
        li.append(node("strong", text(issue.code) + " · " + text(issue.severity || "warning")),
          node("p", issue.message || pretty(issue)));
        issueList.append(li);
      }
    } else issueList.append(node("li", "No native issue entries."));
    const fields = byId("all-fields");
    fields.replaceChildren();
    for (const field of data.fields) {
      const block = node("details", undefined, "native-field");
      block.append(node("summary", field));
      const value = row[field];
      block.append(node("pre", value));
      if (field.endsWith("_json")) {
        const parsed = jsonField(value);
        if (parsed !== null) {
          const formatted = node("details");
          formatted.append(node("summary", "Formatted view of this original JSON"), node("pre", pretty(parsed)));
          block.append(formatted);
        }
      }
      fields.append(block);
    }
    const acquisition = acquisitions.get(row.source);
    byId("selected-attribution").textContent = acquisition ? pretty(acquisition) :
      "This selected source has no acquisition metadata in the saved review. Its full source identity remains " + row.source + ".";
    loadFindingForm();
    renderRegister();
    renderMap();
    if (focus) byId("selected-title").focus({preventScroll: false});
  };
  const loadFindingForm = () => {
    if (selectedIndex === null) return;
    const row = records[selectedIndex], finding = findings.get(keyOf(row));
    byId("finding-decision").value = finding?.decision || "";
    byId("finding-reviewer").value = finding?.reviewer || "";
    byId("finding-note").value = finding?.note || "";
    byId("finding-reviewer").disabled = !finding;
    byId("finding-note").disabled = !finding;
    byId("remove-finding").disabled = !finding;
    byId("restore-finding").disabled = !changedFindings.has(keyOf(row));
    byId("finding-original").textContent = originalFindings.has(keyOf(row)) ?
      pretty(originalFindings.get(keyOf(row))) : "No finding was saved for this original source and row.";
  };
  const updateFinding = () => {
    if (selectedIndex === null) return;
    const row = records[selectedIndex], key = keyOf(row);
    const decision = byId("finding-decision").value;
    if (!decision) {
      if (findings.has(key)) byId("finding-decision").value = findings.get(key).decision;
      return;
    }
    findings.set(key, {source: row.source, rowId: row.row_id, decision,
      reviewer: byId("finding-reviewer").value, note: byId("finding-note").value});
    setChanged(key);
    byId("finding-reviewer").disabled = false;
    byId("finding-note").disabled = false;
    byId("remove-finding").disabled = false;
    byId("restore-finding").disabled = !changedFindings.has(key);
    updateDraftSummary();
    runFilters(false);
  };
  const clampView = () => {
    mapView.zoom = Math.min(32, Math.max(1, mapView.zoom));
    const halfLon = 180 / mapView.zoom, halfLat = 90 / mapView.zoom;
    mapView.lon = Math.min(180 - halfLon, Math.max(-180 + halfLon, mapView.lon));
    mapView.lat = Math.min(90 - halfLat, Math.max(-90 + halfLat, mapView.lat));
  };
  const bounds = () => ({left: mapView.lon - 180 / mapView.zoom, right: mapView.lon + 180 / mapView.zoom,
    bottom: mapView.lat - 90 / mapView.zoom, top: mapView.lat + 90 / mapView.zoom});
  const project = (location, area, range) => ({
    x: area.x + (location.lon - range.left) / (range.right - range.left) * area.w,
    y: area.y + (range.top - location.lat) / (range.top - range.bottom) * area.h
  });
  const within = (location, range) => location.lon >= range.left && location.lon <= range.right &&
    location.lat >= range.bottom && location.lat <= range.top;
  const gridStep = span => [1, 2, 5, 10, 15, 30, 60, 90].find(value => span / value <= 10) || 90;
  const degreeLabel = (value, axis) => value === 0 ? "0°" :
    Math.abs(value).toFixed(Math.abs(value % 1) > 0.00001 ? 1 : 0) + "°" + (axis === "lon" ? value < 0 ? "W" : "E" : value < 0 ? "S" : "N");
  const renderMap = () => {
    if (!context) {
      byId("map-caption").textContent = "Canvas drawing is unavailable. Every reported coordinate remains in the full register.";
      return;
    }
    clampView();
    const generation = ++mapGeneration;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width), height = Math.max(220, rect.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const area = {x: 48, y: 22, w: width - 65, h: height - 62};
    const range = bounds();
    plot = {area, range, width, height};
    context.fillStyle = "#f5f5f5";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(area.x, area.y, area.w, area.h);
    context.font = "11px system-ui, sans-serif";
    context.lineWidth = 1;
    const lonStep = gridStep(range.right - range.left), latStep = gridStep(range.top - range.bottom);
    for (let lon = Math.ceil(range.left / lonStep) * lonStep; lon <= range.right + 0.000001; lon += lonStep) {
      const at = project({lon, lat: 0}, area, range);
      context.beginPath();
      context.moveTo(at.x, area.y);
      context.lineTo(at.x, area.y + area.h);
      context.strokeStyle = Math.abs(lon) < 0.000001 ? "#adadad" : "#dfdfdf";
      context.stroke();
      context.fillStyle = "#535353";
      context.textAlign = "center";
      context.fillText(degreeLabel(lon, "lon"), at.x, height - 21);
    }
    for (let lat = Math.ceil(range.bottom / latStep) * latStep; lat <= range.top + 0.000001; lat += latStep) {
      const at = project({lon: 0, lat}, area, range);
      context.beginPath();
      context.moveTo(area.x, at.y);
      context.lineTo(area.x + area.w, at.y);
      context.strokeStyle = Math.abs(lat) < 0.000001 ? "#adadad" : "#dfdfdf";
      context.stroke();
      context.fillStyle = "#535353";
      context.textAlign = "right";
      context.fillText(degreeLabel(lat, "lat"), area.x - 8, at.y + 4);
    }
    context.strokeStyle = "#979797";
    context.strokeRect(area.x, area.y, area.w, area.h);
    context.save();
    context.beginPath();
    context.rect(area.x, area.y, area.w, area.h);
    context.clip();
    const colors = {"unreviewed": "#666666", "accepted": "#303030", "needs-correction": "#111111", "note": "#969696"};
    let at = 0, valid = 0, visible = 0, rejected = 0;
    const batch = () => {
      if (generation !== mapGeneration) return;
      const end = Math.min(at + 8000, filtered.length);
      for (; at < end; at++) {
        const row = records[filtered[at]], location = point(row);
        if (!location) {
          if (row.coordinate_status === "valid") rejected++;
          continue;
        }
        valid++;
        if (!within(location, range)) continue;
        visible++;
        const projected = project(location, area, range);
        const color = colors[decisionOf(row)] || colors.unreviewed;
        context.strokeStyle = color;
        context.fillStyle = color;
        if (row.exactness === "2") context.strokeRect(projected.x - 2.5, projected.y - 2.5, 5, 5);
        else context.fillRect(projected.x - 2, projected.y - 2, 4, 4);
      }
      if (at < filtered.length) {
        byId("map-caption").textContent = "Drawing all filtered reported points: " + at.toLocaleString() + " records inspected…";
        requestAnimationFrame(batch);
        return;
      }
      if (selectedIndex !== null) {
        const location = point(records[selectedIndex]);
        if (location && within(location, range)) {
          const projected = project(location, area, range);
          context.beginPath();
          context.arc(projected.x, projected.y, 7, 0, Math.PI * 2);
          context.lineWidth = 2;
          context.strokeStyle = "#111111";
          context.stroke();
        }
      }
      context.restore();
      byId("map-caption").textContent = visible.toLocaleString() + " of " + valid.toLocaleString() +
        " filtered reported points in this extent · " + (filtered.length - valid).toLocaleString() +
        " filtered records have no drawable geometry." + (rejected ? " A valid-status row failed the original coordinate/CRS check." : "") +
        " All matching records remain in the register.";
      byId("map-empty").hidden = visible > 0;
      byId("map-empty").textContent = valid ? "No filtered points in this map extent." : "No valid reported points in the current selection.";
      byId("map-zoom").textContent = mapView.zoom.toFixed(mapView.zoom < 10 ? 1 : 0) + "×";
    };
    batch();
  };
  const setZoom = (factor, anchor = null) => {
    if (anchor && plot) {
      const area = plot.area, range = plot.range;
      const x = Math.max(0, Math.min(1, (anchor.x - area.x) / area.w));
      const y = Math.max(0, Math.min(1, (anchor.y - area.y) / area.h));
      const lon = range.left + x * (range.right - range.left);
      const lat = range.top - y * (range.top - range.bottom);
      mapView.zoom = Math.min(32, Math.max(1, mapView.zoom * factor));
      mapView.lon = lon + (0.5 - x) * 360 / mapView.zoom;
      mapView.lat = lat + (y - 0.5) * 180 / mapView.zoom;
    } else mapView.zoom *= factor;
    renderMap();
  };
  const pickPoint = (x, y) => {
    if (!plot) return;
    const close = [];
    for (const index of filtered) {
      const location = point(records[index]);
      if (!location || !within(location, plot.range)) continue;
      const at = project(location, plot.area, plot.range);
      const distance = Math.hypot(at.x - x, at.y - y);
      if (distance <= 10) close.push({index, distance});
    }
    close.sort((a, b) => a.distance - b.distance || a.index - b.index);
    if (!close.length) {
      byId("map-selection").textContent = "No reported point at this position. Use the register for every unlocated record.";
      return;
    }
    const nearest = close.filter(value => value.distance <= close[0].distance + 1);
    const signature = nearest.map(value => value.index).join(",");
    if (clickCycle.signature === signature) clickCycle.at = (clickCycle.at + 1) % nearest.length;
    else clickCycle = {signature, at: 0};
    const selected = nearest[clickCycle.at].index;
    selectRow(selected, false);
    byId("map-selection").textContent = locationName(records[selected]) +
      (nearest.length > 1 ? " · " + (clickCycle.at + 1) + " of " + nearest.length + " nearby records; click again to cycle." : " · details opened.");
  };
  const downloadBytes = (filename, contents, type) => {
    const blob = new Blob([contents], {type});
    const href = URL.createObjectURL(blob);
    const link = node("a");
    link.href = href;
    link.download = filename;
    document.body.append(link);
    try { link.click(); } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
    }
  };
  const requestId = () => {
    const crypto = window.crypto;
    if (!crypto || typeof crypto.getRandomValues !== "function")
      fail("This browser cannot create a fresh request identity. Open this complete report in a browser with Web Crypto.");
    if (typeof crypto.randomUUID === "function") return "geography-review-" + crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    return "geography-review-" + Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  };
  const completeRequest = () => {
    const selected = clone(draft);
    selected.name = plainText(selected.name, "Review name", 160, true);
    selected.notes = plainText(selected.notes, "Review notes", 16000, false);
    selected.review.reviewer = plainText(selected.review.reviewer, "Overall reviewer", 160, selected.review.status !== "draft");
    selected.review.note = plainText(selected.review.note, "Overall review note", 4000, false);
    if (!["draft", "reviewed", "needs-correction"].includes(selected.review.status)) fail("Choose a supported overall review status.");
    if (findings.size > 100000) fail("The original review supports at most 100,000 location findings.");
    selected.findings = [...findings.values()].map(value => {
      if (!decisions.has(value.decision)) fail("A finding has an unsupported decision.");
      return {source: value.source, rowId: value.rowId, decision: value.decision,
        reviewer: plainText(value.reviewer, "Reviewer for row " + value.rowId, 160, true),
        note: plainText(value.note, "Finding note for row " + value.rowId, 8000, false)};
    }).sort((a, b) => a.source < b.source ? -1 : a.source > b.source ? 1 : a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0);
    const output = {id: view.id, expectedRevision: view.revision, ...selected};
    // Generate a new request identity only in the explicit download action.
    // Reuse that downloaded file verbatim when continuing an uncertain save.
    output.requestId = requestId();
    const encoded = JSON.stringify(output, null, 2) + "\n";
    if (new TextEncoder().encode(encoded).length > 64 * 1024 * 1024)
      fail("The complete review update exceeds the original 64 MiB input bound.");
    return {output, encoded};
  };
  const renderSources = () => {
    const target = byId("source-attribution");
    for (const source of view.sources) {
      const block = node("section", undefined, "source-card");
      block.append(node("h3", sourceName(source)));
      const fields = node("dl", undefined, "source-fields");
      showValue(fields, "Original publisher source", source);
      const acquisition = acquisitions.get(source);
      if (acquisition) {
        for (const [key, title] of [["publisher", "Publisher"], ["url", "Original URL"], ["retrievedAt", "Retrieved at"],
            ["license", "License"], ["citation", "Citation / attribution"]])
          showValue(fields, title, acquisition[key] || "", key === "citation" || key === "license");
      } else showValue(fields, "Acquisition metadata", "Not supplied in this saved review.");
      const summary = view.report.bySource.find(value => value.source === source);
      if (summary) showValue(fields, "Complete source coverage", pretty(summary), true);
      const edition = view.editions.find(value => value.source === source);
      if (edition) {
        const native = node("details");
        native.append(node("summary", "Original native edition"), node("pre", pretty(edition)));
        block.append(fields, native);
      } else block.append(fields);
      target.append(block);
    }
  };
  const init = () => {
    document.title = view.name + " — IATI geography review";
    byId("review-title").textContent = view.name;
    byId("review-notes").textContent = view.notes || "Complete publisher location register and named geography review.";
    byId("saved-review").append(badge(view.review.status), node("span", "Revision " + view.revision),
      node("span", view.review.reviewer ? "Reviewed by " + view.review.reviewer : "Reviewer not yet named"));
    byId("identity-line").textContent = "Review " + view.id + " · definition SHA-256 " + view.definitionSha256;
    byId("row-total").textContent = records.length.toLocaleString();
    byId("activity-total").textContent = Number(view.report.counts.activities).toLocaleString();
    byId("mapped-total").textContent = Number(view.report.counts.mapped).toLocaleString();
    byId("unmapped-total").textContent = (records.length - Number(view.report.counts.mapped)).toLocaleString();
    byId("source-filter").append(...view.sources.map(source => option(source, sourceName(source) + " · " + source.slice(0, 12))));
    for (const status of data.contract.coordinateStatuses) byId("status-filter").append(option(status, label(status)));
    for (const decision of ["unreviewed", ...decisions]) byId("decision-filter").append(option(decision, label(decision)));
    for (const [code, title] of Object.entries(data.contract.exactness)) byId("exactness-filter").append(option(code, title + " · code " + code));
    byId("edit-name").value = draft.name;
    byId("edit-notes").value = draft.notes;
    byId("review-status").value = draft.review.status;
    byId("review-reviewer").value = draft.review.reviewer;
    byId("review-note").value = draft.review.note;
    byId("saved-report").textContent = pretty(view.report);
    const selection = {};
    for (const key of ["id", "revision", "definitionSha256", "sources", "selection", "portfolio", "baselineRevision", "created", "updated", "previousRevision"])
      selection[key] = view[key];
    byId("saved-selection").textContent = pretty(selection);
    byId("source-contract").textContent = pretty(data.contract);
    byId("flat-selection").textContent = pretty({id: view.id, expectedRevision: view.revision,
      sources: view.sources, selection: view.selection, portfolio: view.portfolio, baselineRevision: view.baselineRevision});
    renderSources();
    byId("filters").addEventListener("submit", event => event.preventDefault());
    byId("finding-form").addEventListener("submit", event => event.preventDefault());
    byId("review-form").addEventListener("submit", event => event.preventDefault());
    byId("search").addEventListener("input", scheduleFilters);
    for (const id of ["source-filter", "status-filter", "decision-filter", "exactness-filter"])
      byId(id).addEventListener("change", () => runFilters());
    byId("clear-filters").addEventListener("click", () => {
      for (const id of ["source-filter", "status-filter", "decision-filter", "exactness-filter", "search"]) byId(id).value = "";
      runFilters();
    });
    byId("page-size").addEventListener("change", () => { page = 0; renderRegister(); });
    byId("previous-page").addEventListener("click", () => { if (page > 0) page--; renderRegister(); });
    byId("next-page").addEventListener("click", () => {
      if ((page + 1) * rowsPerPage() < filtered.length) page++;
      renderRegister();
    });
    byId("finding-decision").addEventListener("change", updateFinding);
    byId("finding-reviewer").addEventListener("input", updateFinding);
    byId("finding-note").addEventListener("input", updateFinding);
    byId("remove-finding").addEventListener("click", () => {
      if (selectedIndex === null) return;
      const key = keyOf(records[selectedIndex]);
      findings.delete(key);
      setChanged(key);
      loadFindingForm();
      updateDraftSummary();
      runFilters(false);
    });
    byId("restore-finding").addEventListener("click", () => {
      if (selectedIndex === null) return;
      const key = keyOf(records[selectedIndex]);
      if (originalFindings.has(key)) findings.set(key, clone(originalFindings.get(key)));
      else findings.delete(key);
      setChanged(key);
      loadFindingForm();
      updateDraftSummary();
      runFilters(false);
    });
    byId("download-record").addEventListener("click", () => {
      if (selectedIndex === null) return;
      const row = clone(records[selectedIndex]);
      row.finding = clone(findings.get(keyOf(row)) || null);
      downloadBytes("iati-location-" + row.row_id + ".json",
        pretty({schema: "stellar-forge.iati-geography-offline-record.v1",
          review: {id: view.id, revision: view.revision, definitionSha256: view.definitionSha256},
          sourceAcquisition: acquisitions.get(row.source) || null, row,
          savedFinding: originalFindings.get(keyOf(row)) || null}) + "\n", "application/json");
    });
    for (const id of ["edit-name", "edit-notes", "review-status", "review-reviewer", "review-note"])
      byId(id).addEventListener(id === "review-status" ? "change" : "input", () => {
        draft.name = byId("edit-name").value;
        draft.notes = byId("edit-notes").value;
        draft.review = {status: byId("review-status").value, reviewer: byId("review-reviewer").value, note: byId("review-note").value};
        updateDraftSummary();
      });
    byId("reset-all").addEventListener("click", () => {
      if (!window.confirm("Restore the saved review and every saved finding? Local edits in this open report will be removed.")) return;
      for (const field of data.definitionFields) draft[field] = clone(view[field]);
      findings.clear();
      for (const [key, value] of originalFindings) findings.set(key, clone(value));
      changedFindings.clear();
      byId("edit-name").value = draft.name;
      byId("edit-notes").value = draft.notes;
      byId("review-status").value = draft.review.status;
      byId("review-reviewer").value = draft.review.reviewer;
      byId("review-note").value = draft.review.note;
      loadFindingForm();
      updateDraftSummary();
      runFilters(false);
      say("The original saved review selection is restored.");
    });
    byId("download-update").addEventListener("click", () => {
      try {
        const selected = completeRequest();
        downloadBytes("iati-geography-review-" + view.id + "-after-r" + view.revision + ".json", selected.encoded, "application/json");
        say("Downloaded the complete review update, including all " + selected.output.findings.length +
          " selected findings, for revision " + view.revision + ". Reuse this downloaded file for the same save request.");
      } catch (error) { say(error.message, true); }
    });
    byId("zoom-in").addEventListener("click", () => setZoom(2));
    byId("zoom-out").addEventListener("click", () => setZoom(0.5));
    byId("world-view").addEventListener("click", () => { Object.assign(mapView, {lon: 0, lat: 0, zoom: 1}); renderMap(); });
    byId("fit-view").addEventListener("click", () => {
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const index of filtered) {
        const location = point(records[index]);
        if (!location) continue;
        minLon = Math.min(minLon, location.lon); maxLon = Math.max(maxLon, location.lon);
        minLat = Math.min(minLat, location.lat); maxLat = Math.max(maxLat, location.lat);
      }
      if (!Number.isFinite(minLon)) { say("The current filters contain no valid reported coordinates."); return; }
      mapView.lon = (minLon + maxLon) / 2;
      mapView.lat = (minLat + maxLat) / 2;
      mapView.zoom = Math.min(32, 360 / Math.max(12, (maxLon - minLon) * 1.15),
        180 / Math.max(6, (maxLat - minLat) * 1.15));
      renderMap();
    });
    canvas.addEventListener("wheel", event => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      setZoom(event.deltaY < 0 ? 1.25 : 0.8, {x: event.clientX - rect.left, y: event.clientY - rect.top});
    }, {passive: false});
    canvas.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !plot) return;
      drag = {pointer: event.pointerId, x: event.clientX, y: event.clientY, lon: mapView.lon, lat: mapView.lat, moved: false};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.pointer || !plot) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      mapView.lon = drag.lon - dx / plot.area.w * 360 / mapView.zoom;
      mapView.lat = drag.lat + dy / plot.area.h * 180 / mapView.zoom;
      renderMap();
    });
    canvas.addEventListener("pointerup", event => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const prior = drag;
      drag = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!prior.moved) {
        const rect = canvas.getBoundingClientRect();
        pickPoint(event.clientX - rect.left, event.clientY - rect.top);
      }
    });
    canvas.addEventListener("pointercancel", () => { drag = null; });
    canvas.addEventListener("keydown", event => {
      const stepLon = 36 / mapView.zoom, stepLat = 18 / mapView.zoom;
      if (event.key === "+" || event.key === "=") setZoom(2);
      else if (event.key === "-") setZoom(0.5);
      else if (event.key === "Home") { Object.assign(mapView, {lon: 0, lat: 0, zoom: 1}); renderMap(); }
      else if (event.key === "ArrowLeft") { mapView.lon -= stepLon; renderMap(); }
      else if (event.key === "ArrowRight") { mapView.lon += stepLon; renderMap(); }
      else if (event.key === "ArrowUp") { mapView.lat += stepLat; renderMap(); }
      else if (event.key === "ArrowDown") { mapView.lat -= stepLat; renderMap(); }
      else if (event.key === "Enter" && plot) pickPoint(plot.area.x + plot.area.w / 2, plot.area.y + plot.area.h / 2);
      else return;
      event.preventDefault();
    });
    if (typeof ResizeObserver === "function") new ResizeObserver(() => renderMap()).observe(canvas);
    else window.addEventListener("resize", renderMap);
    window.addEventListener("beforeunload", event => {
      if (dirty()) { event.preventDefault(); event.returnValue = ""; }
    });
    updateDraftSummary();
    runFilters();
  };
  try { init(); } catch (error) { say("The report could not finish opening: " + error.message, true); }
})();
"""

_STYLE = r"""
:root{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#262626;background:#eeeeee;font-size:14px;line-height:1.5}
*{box-sizing:border-box}body{margin:0}button,input,select,textarea{font:inherit}button,a,input,select,textarea,summary,[tabindex]{outline-offset:3px}
button{border:1px solid #9b9b9b;background:#ffffff;color:#262626;padding:.5rem .8rem;border-radius:3px;cursor:pointer;min-height:38px}
button:hover{background:#ececec}button:disabled{opacity:.45;cursor:default}.primary{background:#3b3b3b;color:#ffffff;border-color:#3b3b3b}.primary:hover{background:#292929}
input,select,textarea{width:100%;border:1px solid #a4a4a4;border-radius:3px;background:#ffffff;padding:.5rem .6rem;color:inherit}
textarea{resize:vertical;min-height:92px}input:disabled,textarea:disabled{background:#f0f0f0}label{font-weight:600;display:block}label>input,label>select,label>textarea{font-weight:400;display:block;margin-top:.25rem}
h1,h2,h3,p{margin:0 0 .75rem}h1{font-size:2rem;line-height:1.2;letter-spacing:-.025em}h2{font-size:1.25rem}h3{font-size:1rem}small{font-size:.8rem;display:block;color:#646464}
code,pre{font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere;white-space:pre-wrap}pre{margin:.5rem 0;max-width:100%;overflow:auto}
[hidden]{display:none!important}.appbar{background:#2b2b2b;color:#f7f7f7;padding:13px max(20px,calc((100vw - 1536px)/2));display:flex;gap:20px;align-items:center;justify-content:space-between}
.appbar strong{font-size:.9rem;letter-spacing:.025em}.appbar span{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase}
main{max-width:1536px;margin:auto;padding:24px}.intro{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;margin-bottom:20px}
.eyebrow{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#646464;margin-bottom:.5rem}
.intro p{white-space:pre-wrap;overflow-wrap:anywhere;max-width:1000px}.identity{font:11px/1.6 ui-monospace,monospace;color:#646464;overflow-wrap:anywhere}
.saved-review{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:12px;font-size:.85rem}.badge{display:inline-block;padding:2px 8px;border:1px solid #b3b3b3;border-radius:3px;font-size:.76rem;line-height:1.65;white-space:nowrap;font-weight:600}
.badge.positive{background:#ececec;border-color:#aaaaaa;color:#444444}.badge.attention{background:#eeeeee;border-color:#a8a8a8;color:#464646}.badge.neutral{background:#f0f0f0;border-color:#afafaf;color:#474747}
.stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:20px}.stat{background:#ffffff;border:1px solid #c9c9c9;border-top:3px solid #7f7f7f;padding:14px}
.stat strong{font-size:1.8rem;display:block;font-variant-numeric:tabular-nums;font-weight:650}.stat span{font-size:.83rem;font-weight:600}.stat small{margin-top:4px}
.panel{background:#ffffff;border:1px solid #c9c9c9;margin-bottom:18px;padding:20px}.panel-header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.panel-header h2{margin:0}
.panel-description{color:#5f5f5f;font-size:.87rem;margin:9px 0 15px}.filters{display:grid;grid-template-columns:2fr 1.25fr 1fr 1fr 1fr auto;gap:12px;align-items:end}
.filters label{font-size:.8rem}.filter-state{margin:12px 0 0;font-size:.84rem;color:#585858;min-height:1.5em}
.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.map-controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.map-controls button{min-width:42px}
.map-wrap{position:relative;margin-top:16px}canvas{display:block;width:100%;height:430px;border:1px solid #c9c9c9;touch-action:none;cursor:crosshair}
.map-empty{position:absolute;top:45%;left:15%;right:10%;margin:0;text-align:center;background:#ffffffeb;border:1px solid #c9c9c9;padding:12px;pointer-events:none;color:#5f5f5f}
.legend{display:flex;gap:16px;flex-wrap:wrap;align-items:center;font-size:.8rem;margin-top:12px;color:#525252}.legend-item{display:inline-flex;gap:6px;align-items:center}
.swatch{width:9px;height:9px;display:inline-block;background:#666666}.swatch.accepted{background:#303030}.swatch.correction{background:#111111}.swatch.note{background:#969696}.swatch.approximate{background:transparent;border:1px solid #666666}
.map-caption,.map-selection{font-size:.82rem;color:#5f5f5f;min-height:1.5em;margin:8px 0 0}.map-selection{color:#3a3a3a}
.explore{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(310px,1fr);gap:18px;align-items:start}.explore>.panel{min-width:0}
.table-scroll{overflow:auto;margin:16px -20px 0}table{border-collapse:collapse;width:100%;font-size:.82rem}th{text-align:left;background:#f0f0f0;color:#4a4a4a;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em}
th,td{padding:11px 12px;border-top:1px solid #d6d6d6;vertical-align:top;overflow-wrap:anywhere}th:first-child,td:first-child{padding-left:20px}tbody tr.selected{background:#f2f2f2}td:first-child{min-width:180px}
.record-link{font-weight:600;text-align:left;border:0;background:none;color:#434343;padding:0;min-height:0;line-height:1.45}.record-link:hover{background:none;text-decoration:underline}
.cell-subtitle{display:block;margin-top:5px;white-space:pre-wrap}.cell-code{display:block;color:#6f6f6f;font-size:10px;margin-top:5px}.local-mark{color:#525252;font-weight:600}
.pagination{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:16px;flex-wrap:wrap;font-size:.8rem}
.page-size{display:flex;align-items:center;gap:6px;font-weight:400}.page-size select{width:auto;margin:0;min-width:70px}.pagination .actions{margin-left:auto}
.empty-detail{border:1px dashed #c2c2c2;background:#f6f6f6;padding:22px;color:#5f5f5f}.detail-title{overflow-wrap:anywhere}.detail-field{padding:8px 0;border-bottom:1px solid #e3e3e3}
dl{margin:0}dt{font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:#6d6d6d;font-weight:600}dd{margin:3px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.86rem}
.detail-field pre{font-size:11px}.details-section{margin-top:20px}.details-section h3{margin-bottom:10px}.finding-form{display:grid;gap:10px;background:#f6f6f6;border:1px solid #cfcfcf;padding:14px}
.finding-form label{font-size:.8rem}.finding-form .actions button{font-size:.8rem;padding:.4rem .6rem}.native-field{border-top:1px solid #d6d6d6;padding:9px 0}
summary{cursor:pointer;font-weight:600;overflow-wrap:anywhere}details>pre{padding:10px;background:#f3f3f3}details details{margin-top:10px}ul.issue-list{padding-left:18px;font-size:.83rem}.issue-list p{margin:4px 0 10px}
.review-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.review-grid .wide{grid-column:1/-1}.review-grid label{font-size:.83rem}
.review-bottom{border-top:1px solid #d8d8d8;margin-top:18px;padding-top:16px;display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.review-bottom p{font-size:.85rem;margin:0;max-width:750px}.help{font-size:.82rem;color:#5f5f5f;margin-top:8px}.notice{background:#efefef;border:1px solid #b7b7b7;color:#3f3f3f;padding:12px 16px;margin:0 0 18px;overflow-wrap:anywhere}
.notice.error{background:#f0f0f0;border-color:#a8a8a8;color:#464646}.source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:18px}.source-card{border:1px solid #d0d0d0;padding:16px;min-width:0}
.source-card h3{overflow-wrap:anywhere}.source-card pre{font-size:11px}.source-fields .detail-field:last-child{border:0}.reference-panel details+details{border-top:1px solid #d7d7d7;margin-top:12px;padding-top:12px}
.footer{color:#616161;font-size:.79rem;margin:18px 0 0}.noscript{border:1px solid #a8a8a8;background:#f0f0f0;padding:16px;margin:20px}
@media(max-width:1200px){.filters{grid-template-columns:2fr 1fr 1fr}.explore{grid-template-columns:minmax(0,1.4fr) minmax(300px,1fr)}.stats{gap:8px}.stat{padding:11px}.stat strong{font-size:1.55rem}}
@media(max-width:920px){.explore{grid-template-columns:1fr}.source-grid{grid-template-columns:1fr}.stats{grid-template-columns:repeat(3,minmax(0,1fr))}.intro{grid-template-columns:1fr}canvas{height:360px}}
@media(max-width:580px){main{padding:14px}.panel{padding:15px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.filters,.review-grid{grid-template-columns:1fr}.review-grid .wide{grid-column:auto}.appbar{padding:12px 14px}.appbar span{max-width:130px;text-align:right}.table-scroll{margin-left:-15px;margin-right:-15px}canvas{height:290px}.pagination{align-items:flex-start}.map-controls{width:100%}}
@media print{body{background:#ffffff}.appbar,button,.filters,.pagination,.review-bottom,.notice,.map-controls{display:none!important}main{max-width:none;padding:0}.panel{break-inside:avoid;border-color:#aaaaaa;padding:12px}.explore{display:block}.stats{grid-template-columns:repeat(5,minmax(0,1fr))}canvas{height:360px}.table-scroll{overflow:visible}th{color:#111111}a{color:#111111}}
"""

_BODY = r"""
<header class="appbar"><strong>DATA OPERATIONS / IATI GEOGRAPHY</strong><span>Offline review edition</span></header>
<noscript><p class="noscript">Enable JavaScript in this local report to explore its complete embedded register and edit findings. The complete ZIP also contains locations.csv, locations.jsonl, locations.geojson, the saved review and every original publisher source.</p></noscript>
<main>
<div id="notice" class="notice" role="status" aria-live="polite" hidden></div>
<div id="workspace">
<section class="intro" aria-labelledby="review-title">
<div><p class="eyebrow">Publisher locations / saved review</p><h1 id="review-title">IATI geography review</h1>
<p id="review-notes"></p><div id="saved-review" class="saved-review"></div></div>
</section>
<p id="identity-line" class="identity"></p>
<section class="stats" aria-label="Complete saved dataset">
<div class="stat"><strong id="row-total">—</strong><span>Complete records</span><small>Every selected native location row</small></div>
<div class="stat"><strong id="activity-total">—</strong><span>Activities</span><small>Distinct selected IATI identifiers</small></div>
<div class="stat"><strong id="mapped-total">—</strong><span>Reported points</span><small>Valid coordinates in the saved report</small></div>
<div class="stat"><strong id="unmapped-total">—</strong><span>Other records</span><small>Retained with null map geometry</small></div>
<div class="stat"><strong id="finding-total">—</strong><span>Selected findings</span><small id="finding-caption"></small></div>
</section>
<section class="panel" aria-labelledby="filter-heading">
<h2 id="filter-heading">Explore the full register</h2>
<p class="panel-description">Filters apply to every embedded record and every map point. Pagination changes the visible table rows.</p>
<form id="filters" class="filters">
<label>Search every native field<input id="search" type="search" maxlength="2000" placeholder="Activity, place, organisation, original record…" autocomplete="off"></label>
<label>Publisher source<select id="source-filter"><option value="">All sources</option></select></label>
<label>Coordinates<select id="status-filter"><option value="">All coordinate states</option></select></label>
<label>Finding<select id="decision-filter"><option value="">All finding decisions</option></select></label>
<label>Publisher exactness<select id="exactness-filter"><option value="">All exactness codes</option></select></label>
<button id="clear-filters" type="button">Clear filters</button>
</form>
<p id="filter-state" class="filter-state" aria-live="polite"></p>
</section>
<section class="panel" aria-labelledby="map-heading">
<div class="panel-header"><h2 id="map-heading">Reported coordinate map</h2>
<div class="map-controls"><button type="button" id="zoom-in" aria-label="Zoom in">+</button><button type="button" id="zoom-out" aria-label="Zoom out">−</button>
<span id="map-zoom" aria-live="polite">1.0×</span><button type="button" id="world-view">World extent</button><button type="button" id="fit-view">Fit filtered points</button></div></div>
<p class="panel-description">Longitude is horizontal and latitude is vertical on an equirectangular graticule. Only valid reported EPSG 4326 points are plotted. Source coordinate strings remain unchanged in record details.</p>
<div class="map-wrap"><canvas id="map" width="1200" height="430" tabindex="0" role="img" aria-label="Reported longitude and latitude map. Drag to pan; use arrow keys to pan, plus or minus to zoom, Home for the world, and Enter to select near the centre. Every point is also available in the record table.">The complete coordinates are available in the register.</canvas>
<p id="map-empty" class="map-empty" hidden></p></div>
<div class="legend" aria-label="Map legend">
<span class="legend-item"><i class="swatch"></i>Unreviewed</span><span class="legend-item"><i class="swatch accepted"></i>Accepted finding</span>
<span class="legend-item"><i class="swatch correction"></i>Needs correction</span><span class="legend-item"><i class="swatch note"></i>Note</span>
<span class="legend-item"><i class="swatch approximate"></i>Hollow square: publisher says approximate</span>
</div>
<p class="help">Filled squares retain other reported exactness codes, including an omitted code. Click a point to open its original record; repeated clicks cycle nearby records. No administrative boundaries or inferred locations are drawn.</p>
<p id="map-caption" class="map-caption" aria-live="polite"></p><p id="map-selection" class="map-selection" aria-live="polite"></p>
</section>
<div class="explore">
<section class="panel" id="register" aria-labelledby="register-heading">
<div class="panel-header"><h2 id="register-heading">Location register</h2><label class="page-size">Rows <select id="page-size"><option>25</option><option selected>50</option><option>100</option><option>250</option></select></label></div>
<p class="panel-description">Open a location to inspect all source fields and edit its finding. Rows for activities without a location remain in this register.</p>
<div class="table-scroll"><table><thead><tr><th scope="col">Location / activity</th><th scope="col">Publisher source</th><th scope="col">Coordinates</th><th scope="col">Reporting organisation</th><th scope="col">Finding</th></tr></thead><tbody id="register-body"></tbody></table></div>
<div class="pagination"><span id="page-status" aria-live="polite"></span><div class="actions"><button type="button" id="previous-page">Previous</button><button type="button" id="next-page">Next</button></div></div>
</section>
<aside class="panel" aria-labelledby="details-heading"><h2 id="details-heading">Record details and finding</h2>
<p id="empty-detail" class="empty-detail">Select a record from the map or register. Its complete publisher location, associations, issues and saved finding will open here.</p>
<div id="record-detail" hidden>
<h3 id="selected-title" class="detail-title" tabindex="-1"></h3><p id="selected-filter-state" class="help"></p>
<dl id="selected-identity"></dl>
<section class="details-section"><h3>Finding for this exact source and row</h3>
<form id="finding-form" class="finding-form">
<label>Decision<select id="finding-decision"><option value="">No finding selected</option><option value="accepted">Accepted</option><option value="needs-correction">Needs correction</option><option value="note">Note</option></select></label>
<label>Named reviewer<input id="finding-reviewer" maxlength="160" autocomplete="off" disabled></label>
<label>Evidence, correction or note<textarea id="finding-note" maxlength="8000" rows="5" disabled></textarea></label>
<div class="actions"><button type="button" id="remove-finding" disabled>Remove from update</button><button type="button" id="restore-finding" disabled>Restore saved finding</button></div>
</form><p class="help">Edits are retained across filters and pages in this open report. Download the complete review update to carry them to the original workspace.</p>
<details><summary>Original saved finding</summary><pre id="finding-original"></pre></details>
</section>
<section class="details-section"><h3>Original issue entries</h3><ul id="record-issues" class="issue-list"></ul></section>
<section class="details-section"><h3>Complete native fields</h3><div id="all-fields"></div></section>
<section class="details-section"><h3>Source attribution</h3><pre id="selected-attribution"></pre></section>
<div class="actions"><button type="button" id="download-record">Download this complete record</button></div>
</div></aside>
</div>
<section class="panel" aria-labelledby="update-heading"><h2 id="update-heading">Return an updated review</h2>
<p class="panel-description">The update keeps this review ID, expected revision, complete publisher selection, acquisition metadata, linked portfolio and baseline. It includes every retained finding, including rows outside the current filters.</p>
<form id="review-form" class="review-grid">
<label>Review name<input id="edit-name" maxlength="160" required></label>
<label>Overall status<select id="review-status"><option value="draft">Draft</option><option value="reviewed">Reviewed</option><option value="needs-correction">Needs correction</option></select></label>
<label class="wide">Review notes<textarea id="edit-notes" maxlength="16000" rows="3"></textarea></label>
<label>Overall reviewer<input id="review-reviewer" maxlength="160" autocomplete="off"></label>
<label>Overall review note<textarea id="review-note" maxlength="4000" rows="3"></textarea></label>
</form>
<div class="review-bottom"><p id="edit-status" aria-live="polite"></p><div class="actions"><button id="reset-all" type="button" disabled>Restore all saved selections</button><button id="download-update" class="primary" type="button">Download review update</button></div></div>
<p class="help">The download is a complete flat save request for the original Geography application. A fresh requestId is created when you click Download. Reuse that exact downloaded file when retrying its save. After a successful save, export the new review edition before making another update from it.</p>
<details><summary>Fixed original selection for this update</summary><pre id="flat-selection"></pre></details>
</section>
<section class="panel" aria-labelledby="source-heading"><h2 id="source-heading">Publisher sources and attribution</h2>
<p class="panel-description">Each source retains its original identity, acquisition details, coverage and native build. URLs below are recorded source references; this offline report makes no network requests.</p>
<div id="source-attribution" class="source-grid"></div>
</section>
<section class="panel reference-panel" aria-labelledby="reference-heading"><h2 id="reference-heading">Saved report and source semantics</h2>
<details><summary>Complete saved geography report</summary><pre id="saved-report"></pre></details>
<details><summary>Original review identity, selection and timestamps</summary><pre id="saved-selection"></pre></details>
<details><summary>IATI location contract, code labels and official references</summary><pre id="source-contract"></pre></details>
<p class="help">Financial amounts remain with their original activity and linked portfolio. This geography view does not distribute an amount among locations. Findings describe exact source rows and preserve the publisher XML.</p>
</section>
<p class="footer">This self-contained report carries the complete selected register. Local edits remain in this open browser until downloaded. The complete handover ZIP preserves the original sources, native datasets, saved review history and received requests.</p>
</div>
</main>
"""


def _json(value):
    """JSON remains inert inside HTML, including complete original record text."""
    raw = json.dumps(value, ensure_ascii=False, allow_nan=False,
                     sort_keys=True, separators=(",", ":"))
    return (raw.replace("&", "\\u0026").replace("<", "\\u003c")
            .replace(">", "\\u003e").replace("\u2028", "\\u2028")
            .replace("\u2029", "\\u2029").encode("utf-8"))


def write_html(geo, view, path) -> Path:
    """Write all original rows to a private exclusive output, then fsync it.

    The portable module imports this renderer lazily. Keep its helpers late here
    as well so the same implementation serves direct exports and packet rebuilds.
    The selected original row order, saved timestamps, full fields and finding
    bodies determine the output. No current time or random identity is generated
    while rendering; request IDs are created only by the explicit browser action.
    """
    from geography import DEFINITION_FIELDS
    from geography_source import CONTRACT
    from geography_portable import rows, open_output, checked_size
    from iati_source import FIELDS, InputError
    from iati_workspace import MAX_PACKET

    path = Path(path)
    view = deepcopy(view)
    fields = list(FIELDS["locations"])
    if (not isinstance(view, dict)
            or any(name not in view for name in ("id", "revision", "report", "editions", *DEFINITION_FIELDS))
            or type(view["report"]["counts"]["rows"]) is not int
            or view["report"]["counts"]["rows"] < 0):
        raise InputError("Use the complete original saved geography review")
    sources = set(view["sources"])
    expected_findings = {(item["source"], item["rowId"]): item for item in view["findings"]}
    if len(expected_findings) != len(view["findings"]):
        raise InputError("The offline review repeats a source and location finding")
    metadata = {"schema": "stellar-forge.iati-geography-offline.v1",
                "view": view, "contract": CONTRACT, "fields": fields,
                "definitionFields": list(DEFINITION_FIELDS)}
    script, style = _SCRIPT.encode("utf-8"), _STYLE.encode("utf-8")
    script_hash = base64.b64encode(hashlib.sha256(script).digest()).decode("ascii")
    style_hash = base64.b64encode(hashlib.sha256(style).digest()).decode("ascii")
    policy = ("default-src 'none'; base-uri 'none'; object-src 'none'; "
              "connect-src 'none'; frame-src 'none'; form-action 'none'; "
              "script-src 'sha256-" + script_hash + "'; "
              "style-src 'sha256-" + style_hash + "'")
    count, selected_findings = 0, set()
    with open_output(path) as stream:
        def write(raw):
            if stream.tell() + len(raw) > MAX_PACKET:
                raise InputError("The complete offline geography report exceeds 4 GiB")
            stream.write(raw)

        write(b'<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n')
        write(b'<meta name="viewport" content="width=device-width,initial-scale=1">\n')
        write(b'<meta name="referrer" content="no-referrer">\n')
        write(b'<meta http-equiv="Content-Security-Policy" content="' + policy.encode("ascii") + b'">\n')
        write(b'<title>IATI geography review</title>\n<style>' + style + b'</style>\n</head>\n<body>\n')
        write(_BODY.encode("utf-8"))
        write(b'\n<script id="geography-data" type="application/json">')
        # The full view is bounded by its original 64 MiB metadata contract.
        # Native rows are encoded and written individually; there is no second
        # full register or pagination query in the Python renderer.
        write(_json(metadata)[:-1] + b',"rows":[')
        first = True
        for row in rows(geo, view):
            if (not isinstance(row, dict) or row.get("source") not in sources
                    or any(not isinstance(row.get(name), str) for name in ("source", *fields))):
                raise InputError("The complete geography export lost an original native field")
            key = (row["source"], row["row_id"])
            if row.get("finding") != expected_findings.get(key):
                raise InputError("The offline location finding differs from its saved source and row")
            if row.get("finding") is not None:
                selected_findings.add(key)
            if not first:
                write(b",")
            write(_json(row))
            first = False
            count += 1
        if count != view["report"]["counts"]["rows"] or selected_findings != set(expected_findings):
            raise InputError("The offline report did not retain the complete saved location and finding selection")
        write(b']}</script>\n<script>' + script + b'</script>\n</body>\n</html>\n')
        stream.flush()
        os.fsync(stream.fileno())
    return checked_size(path)
