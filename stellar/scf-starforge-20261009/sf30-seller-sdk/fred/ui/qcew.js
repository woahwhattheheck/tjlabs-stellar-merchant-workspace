// MIT. Complete county-report production on the original economic project.
const $ = id => document.getElementById(id);
const actions = new Set(['qcew.import', 'qcew.cpi', 'qcew.profile', 'qcew.produce', 'qcew.receive']);
const statuses = { available: 'Available', disclosed_components: 'Disclosed components', withheld: 'Withheld',
  historical_unavailable: 'Historical value unavailable', classification_unavailable: 'Classification unavailable',
  missing_source: 'Source unavailable', missing_price: 'Price observation unavailable', missing: 'Unavailable',
  no_activity: 'No covered activity', zero_denominator: 'Zero denominator' };
const copy = value => JSON.parse(JSON.stringify(value));
const periodLabel = value => value.year + '-Q' + value.quarter;
const short = value => String(value ?? '').slice(0, 10);
function formatted(value) {
  const parts = String(value).split('.');
  return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (parts[1] ? '.' + parts[1] : '');
}
function quantity(value, suffix = '', prefix = '') {
  if (!value || value.value === null) return statuses[value?.status] ?? 'Unavailable';
  return prefix + formatted(value.value) + suffix + (value.status === 'disclosed_components' ? ' (partial)' : '');
}
function dateRange(values) { return values?.length ? values[0] + '–' + values[values.length - 1] : ''; }
let database;
function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('fred-county-report-workspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('saved');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close the older county-report tab to open its saved work.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = null; };
      resolve(db);
    };
  }).catch(error => { database = null; throw error; });
  return database;
}
async function localRecord(key, method = 'get', value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('saved', method === 'get' ? 'readonly' : 'readwrite');
    const store = transaction.objectStore('saved');
    const request = method === 'put' ? store.put(value, key) : store[method](key);
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('The browser did not retain the selected county-report work.'));
  });
}
export function mountFredQcew({ api, download, table, select, getState, getBusy, refresh, message }) {
  let capabilities = null, active = null, selectedReport = null, reportGeneration = 0;
  let definition = null, jsonDirty = false, working = 0, metadataGeneration = 0;
  let openedProject = null, initialized = false, initializing = null, lastRevision = null, draftTimer = null;
  const project = () => getState();
  const inventory = () => project()?.qcew ?? { captures: [], profiles: [], editions: [],
    selectedCapture: null, selectedProfile: null, selectedEdition: null };
  const key = name => name + ':' + project().id;
  const newId = action => 'fred-' + action.replaceAll('.', '-') + '-' + crypto.randomUUID().replaceAll('-', '');
  const selectedProfile = () => inventory().profiles.find(item => item.id === $('qcew-produce-profile').value);
  function validateRecord(value) {
    if (!value) return null;
    if (value.schema !== 'fred-qcew-browser-request.v1' || value.projectId !== project().id ||
        !actions.has(value.request?.action) || typeof value.request.id !== 'string' ||
        !Number.isSafeInteger(value.request.expectedRevision) ||
        !['prepared', 'submitted', 'returned_error'].includes(value.phase))
      throw new Error('The saved county-report action needs its complete original browser record.');
    if (value.server && !/^[a-f0-9]{64}$/.test(value.server.requestSha256 ?? ''))
      throw new Error('Continue this workspace’s original retained request.');
    if (value.file && (!(value.file.blob instanceof Blob) || value.file.blob.size !== value.file.bytes ||
        !['capture', 'bundle'].includes(value.file.field)))
      throw new Error('The original selected source file is missing from the saved browser action.');
    return value;
  }
  function fromHost(value) {
    return { schema: 'fred-qcew-browser-request.v1', projectId: project().id,
      request: { action: value.action, id: value.id, expectedRevision: value.expectedRevision },
      phase: value.phase === 'failed' ? 'returned_error' : 'submitted', file: null,
      server: { requestSha256: value.requestSha256 }, hostSelection: copy(value.selection ?? {}),
      preparedAt: value.retainedAt, lastError: value.lastError ?? null };
  }
  async function adoptHost(value) {
    if (value && !['completed', 'cleared'].includes(value.phase) &&
        (!active || active.request.id === value.id)) {
      active = validateRecord(fromHost(value)); await localRecord(key('request'), 'put', active);
    }
  }
  function completed(record = active) {
    return record ? project()?.operations.find(item => item.id === record.request.id) : null;
  }
  function refreshPredecessors() {
    const selected = selectedProfile();
    const editions = inventory().editions.filter(item => item.profileId === selected?.id);
    select('qcew-produce-previous', [['', 'First edition'], ...editions.map(item =>
      [item.id, periodLabel(item.period) + ' · ' + short(item.id)])]);
    const series = selected?.definition.price.seriesId ?? definition?.price?.seriesId ?? 'CPIAUCSL';
    const captures = (project()?.captures ?? []).filter(item => item.selection.series.includes(series));
    select('qcew-produce-cpi', captures.map(item => [item.id,
      item.selection.series.join(', ') + ' · ' + item.selection.asOf + ' · ' + short(item.id)]));
    $('qcew-produce-cpi').title = 'Choose an original capture containing ' + series;
    sync();
  }
  function sync() {
    if (!project()) return;
    const busy = !initialized || working > 0 || Boolean(getBusy?.()), another = Boolean(active && !completed());
    for (const id of ['qcew-import', 'qcew-import-cpi', 'qcew-save-profile', 'qcew-produce', 'qcew-receive'])
      $(id).disabled = busy || another || Boolean(project().pending);
    $('qcew-save-profile').disabled ||= !definition || jsonDirty;
    $('qcew-produce').disabled ||= !selectedProfile() || !$('qcew-produce-source').value || !$('qcew-produce-cpi').value;
    $('qcew-pdf').disabled = busy || !capabilities?.pdf;
    $('qcew-open-profile').disabled = busy || !$('qcew-profile-load').value;
    $('qcew-download-profile').disabled = busy || !$('qcew-profile-load').value;
    $('qcew-default-profile').disabled = busy;
    $('qcew-edition').disabled = busy;
    $('qcew-section').disabled = busy || !selectedReport;
    $('qcew-filter-region').disabled = busy || !selectedReport || !['matrix', 'sources'].includes(selectedReport.section);
    $('qcew-filter-period').disabled = busy || !selectedReport || !['matrix', 'sources'].includes(selectedReport.section);
    $('qcew-filter-industry').disabled = busy || !selectedReport || selectedReport.section === 'files';
    $('qcew-open-edition').disabled = busy || !$('qcew-edition').value;
    $('qcew-use-edition').disabled = busy || !$('qcew-edition').value;
    $('qcew-download-original').disabled = busy || !$('qcew-produce-source').value;
    $('qcew-export-project').disabled = busy || Boolean(project().pending);
    $('qcew-page-previous').disabled = busy || !selectedReport || selectedReport.offset === 0;
    $('qcew-page-next').disabled = busy || !selectedReport || selectedReport.nextOffset === null;
    const ownPending = project().pending && project().pending.kind.startsWith('qcew.');
    $('qcew-recovery').hidden = !active && !ownPending;
    $('qcew-resume').disabled = busy || !active;
    const done = completed();
    const clearable = active && (done || !project().pending && !getBusy?.() &&
      ['prepared', 'returned_error'].includes(active.phase));
    $('qcew-clear-request').disabled = working > 0 || !clearable;
    if (active) {
      const file = active.server ? ' The complete original input is retained on this workspace host.'
        : active.file ? ' Original file: ' + active.file.name + '.' : '';
      $('qcew-recovery-text').textContent = done
        ? 'This action completed in project history. Continue to open the saved result.'
        : 'Your ' + active.request.action.replace('qcew.', '') + ' action and original selection are retained.' + file +
          (active.lastError ? ' ' + active.lastError.message : ' Continue the same action after an interruption.');
    } else if (ownPending) {
      $('qcew-recovery-text').textContent = 'This project has an unfinished county-report action. Continue it from the browser or command that retains its original source selection.';
    }
  }
  function bind(id, work, type = 'click') {
    $(id).addEventListener(type, async event => {
      event.preventDefault(); if (working) return;
      working++; message(); sync();
      try { await work(event); } catch (error) { message(error.message, true); }
      finally { working--; sync(); }
    });
  }
  function editableDefinition(input) {
    const value = input?.definition ?? input;
    if (!value || typeof value !== 'object' || !Array.isArray(value.regions) ||
        !value.regions.length || !value.regions.every(item => item && typeof item.id === 'string' &&
          typeof item.label === 'string' && Array.isArray(item.areas) &&
          item.areas.every(area => typeof area === 'string')) ||
        !value.regions.some(item => item.id === value.focus))
      throw new Error('Choose a complete report profile definition with its focus region and original area codes.');
    return copy(value);
  }
  function resetReportFilters() {
    for (const id of ['qcew-filter-region', 'qcew-filter-industry', 'qcew-filter-period']) $(id).value = '';
  }
  function paintProfile() {
    if (!definition) return;
    const focus = definition.regions.find(item => item.id === definition.focus);
    if (!focus) throw new Error('Choose the focus region from this profile’s complete region list.');
    const values = {
      'qcew-profile-name': definition.name, 'qcew-profile-title': definition.title ?? definition.name,
      'qcew-focus-label': focus.label, 'qcew-focus-areas': focus.areas.join(', '),
      'qcew-baseline': definition.baseline?.year ?? 2019, 'qcew-history-start': definition.history?.startYear ?? 1990,
      'qcew-employment': definition.employment ?? 'quarter_mean', 'qcew-wage-method': definition.wageMethod ?? 'from_totals',
      'qcew-coverage': definition.coverage ?? 'complete', 'qcew-dollar-basis': definition.price?.dollars ?? 'constant',
      'qcew-price-series': definition.price?.seriesId ?? 'CPIAUCSL', 'qcew-price-quarter': definition.price?.quarterly ?? 'quarter_end',
      'qcew-publisher': definition.publisher?.name ?? '', 'qcew-publisher-contact': definition.publisher?.contact ?? '',
      'qcew-sponsor': definition.publisher?.sponsor?.name ?? '', 'qcew-sponsor-line': definition.publisher?.sponsor?.line ?? ''
    };
    for (const [id, value] of Object.entries(values)) $(id).value = String(value);
    $('qcew-profile-json').value = JSON.stringify(definition, null, 2);
    table('qcew-profile-context', definition.regions.map(item => ({
      region: item.label, area_codes: item.areas.join(', '), role: item.id === definition.focus ? 'Report focus' : 'Comparator'
    })), ['region', 'area_codes', 'role']);
    table('qcew-profile-industries', (definition.industries ?? []).map(item => ({
      industry: item.label, original_code: item.code, aggregation: item.kind ?? '', ownerships: (item.ownerships ?? []).join(', ')
    })), ['industry', 'original_code', 'aggregation', 'ownerships']);
    jsonDirty = false; sync();
  }
  function formDefinition() {
    if (!definition || jsonDirty) throw new Error('Apply the complete profile definition before saving.');
    const value = copy(definition), focus = value.regions.find(item => item.id === value.focus);
    value.name = $('qcew-profile-name').value.trim(); value.title = $('qcew-profile-title').value.trim();
    focus.label = $('qcew-focus-label').value.trim();
    focus.areas = $('qcew-focus-areas').value.split(/[\s,]+/).filter(Boolean);
    value.baseline = { ...value.baseline, year: Number($('qcew-baseline').value) };
    value.history = { ...value.history, startYear: Number($('qcew-history-start').value),
      tableYears: (value.history?.tableYears ?? []).filter(year => year >= Number($('qcew-history-start').value)) };
    value.employment = $('qcew-employment').value; value.wageMethod = $('qcew-wage-method').value;
    value.coverage = $('qcew-coverage').value;
    value.price = { ...value.price, dollars: $('qcew-dollar-basis').value,
      seriesId: $('qcew-price-series').value.trim(), quarterly: $('qcew-price-quarter').value };
    value.publisher = { ...value.publisher, name: $('qcew-publisher').value.trim(),
      contact: $('qcew-publisher-contact').value.trim(), sponsor: $('qcew-sponsor').value.trim()
        ? { ...value.publisher?.sponsor, name: $('qcew-sponsor').value.trim(), line: $('qcew-sponsor-line').value.trim() || 'Prepared with support from' } : null };
    return value;
  }
  function saveDraftSoon() {
    clearTimeout(draftTimer);
    const projectId = project()?.id;
    if (!projectId) return;
    draftTimer = setTimeout(() => {
      if (project()?.id !== projectId) return;
      const value = { definition, rawDefinition: $('qcew-profile-json').value, jsonDirty,
        inputMode: $('qcew-input-mode').value, intake: $('qcew-intake').value,
        receivingDirectory: $('qcew-receive-directory').value,
        year: $('qcew-report-year').value, quarter: $('qcew-report-quarter').value };
      localRecord('draft:' + projectId, 'put', value).catch(error => message(error.message, true));
    }, 200);
  }
  function sourceMode() {
    const isFile = $('qcew-input-mode').value === 'capture';
    $('qcew-capture-field').hidden = !isFile; $('qcew-intake-field').hidden = isFile;
    $('qcew-capture-file').required = isFile; $('qcew-intake').required = !isFile;
  }
  function fileSelection(id, field, limit) {
    const file = $(id).files[0];
    if (!file) throw new Error('Choose the complete original file.');
    if (!file.size || file.size > limit) throw new Error('Choose a complete file within the ' + Math.floor(limit / 1048576) + ' MiB input capacity.');
    return { blob: file, name: file.name, bytes: file.size, field };
  }
  async function retainResult(record, result) {
    await localRecord(key('last-result'), 'put', { action: record.request.action, result });
    await localRecord(key('request'), 'delete'); active = null;
    return result;
  }
  async function transmit(record) {
    validateRecord(record);
    const prior = completed(record);
    if (prior) return retainResult(record, prior.result);
    const request = copy(record.request);
    if (record.file) {
      try { request[record.file.field] = JSON.parse(await record.file.blob.text()); }
      catch { throw new Error('The retained input is not complete JSON. Select the complete source file.'); }
    }
    active = { ...record, phase: 'submitted', submittedAt: new Date().toISOString() };
    await localRecord(key('request'), 'put', active);
    sync();
    try {
      const result = await api('/api/qcew/action', record.server ? { action: 'qcew.continue',
        id: record.request.id, requestSha256: record.server.requestSha256 } : request);
      await refresh();
      return await retainResult(record, result);
    } catch (error) {
      await refresh().catch(() => {});
      const finished = completed(record);
      if (finished) return retainResult(record, finished.result);
      await api('/api/qcew/state').then(value => adoptHost(value.retainedAction)).catch(() => {});
      if (Number.isInteger(error.status)) {
        active = { ...active, phase: 'returned_error',
          lastError: { status: error.status, code: error.code ?? null, message: error.message } };
        await localRecord(key('request'), 'put', active);
      }
      throw error;
    }
  }
  async function mutate(action, payload, file = null) {
    if (!initialized) throw new Error('Open the county report workspace before selecting an action.');
    if (active) throw new Error('Continue or clear the saved browser action before selecting another.');
    if (project().pending || getBusy?.()) throw new Error('Finish the current project action before starting another.');
    const record = { schema: 'fred-qcew-browser-request.v1', projectId: project().id, phase: 'prepared',
      request: { action, id: newId(action), expectedRevision: project().revision, ...payload }, file,
      preparedAt: new Date().toISOString() };
    await localRecord(key('request'), 'put', record); active = record; sync();
    return transmit(record);
  }
  async function showResult(action, result) {
    if (result.edition) {
      $('qcew-edition').value = result.edition.id; resetReportFilters();
      $('qcew-section').value = 'overview'; await openEdition(result.edition.id);
      message('The complete county report edition is saved.');
    } else if (result.profile) {
      definition = editableDefinition(result.profile); paintProfile();
      $('qcew-produce-profile').value = result.profile.id; $('qcew-profile-load').value = result.profile.id;
      refreshPredecessors(); message('The reusable report profile is saved.');
    } else if (result.receiving) {
      showReceiving(result); message('The complete economic project was received and reopened.');
    } else if (result.captureSha256) {
      $('qcew-produce-source').value = result.captureSha256;
      message('The complete original BLS source is retained for report production.');
    } else if (result.captureId) {
      refreshPredecessors(); $('qcew-produce-cpi').value = result.captureId;
      message('The original price source is retained in the economic project.');
    }
    sync();
  }
  function showReceiving(result) {
    $('qcew-received-status').textContent = result.title + ' was received and reopened. Select this directory in Applications to continue its reports.';
    table('qcew-received-detail', [{ directory: result.directory, project: result.projectId,
      revision: result.receivedRevision, BLS_sources: result.sourceCaptures,
      profiles: result.reportProfiles, report_editions: result.reportEditions }]);
  }
  function metrics(id, values) {
    const root = $(id); root.replaceChildren();
    for (const [label, value] of values) {
      const box = document.createElement('div'), number = document.createElement('strong'), caption = document.createElement('span');
      box.className = 'metric'; number.textContent = String(value); caption.textContent = label;
      box.append(number, caption); root.append(box);
    }
  }
  function paintInventory() {
    const value = inventory();
    metrics('qcew-summary', [['BLS source editions', value.captures.length], ['Saved profiles', value.profiles.length],
      ['Report editions', value.editions.length], ['Project revision', project().revision]]);
    const sources = value.captures.map(item => [item.id,
      dateRange(item.summary.years) + ' · ' + item.summary.areas.length + ' areas · ' + short(item.id)]);
    select('qcew-produce-source', sources, $('qcew-produce-source').value || value.selectedCapture);
    table('qcew-source-list', value.captures.map(item => ({ source: short(item.id), years: dateRange(item.summary.years),
      areas: item.summary.areas.join(', '), original_files: item.summary.originalFiles,
      original_rows: item.summary.originalRows, collected_through: item.summary.retrievedThrough })));
    const profiles = value.profiles.map(item => [item.id, item.definition.name + ' · ' + short(item.id)]);
    select('qcew-profile-load', profiles, $('qcew-profile-load').value || value.selectedProfile);
    select('qcew-produce-profile', profiles, $('qcew-produce-profile').value || value.selectedProfile);
    select('qcew-edition', [...value.editions].reverse().map(item => [item.id,
      periodLabel(item.period) + ' · ' + (value.profiles.find(profile => profile.id === item.profileId)?.definition.name ?? '') +
      ' · ' + (item.formats.includes('pdf') ? 'HTML and PDF' : 'HTML') + ' · ' + short(item.id)]),
      $('qcew-edition').value || value.selectedEdition);
    refreshPredecessors();
  }
  const svgElement = (name, attributes = {}, text) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function drawCharts(figures) {
    const root = $('qcew-charts'); root.replaceChildren();
    const dashes = ['', '7 3', '2 3', '10 3 2 3'];
    for (const figure of figures ?? []) {
      const wrapper = document.createElement('figure'), caption = document.createElement('figcaption');
      wrapper.className = 'qcew-chart'; caption.textContent = figure.title; wrapper.append(caption);
      const points = figure.series.flatMap(series => series.points);
      const present = points.filter(point => point.value?.value !== null && Number.isFinite(Number(point.value?.value)));
      if (!present.length) { const empty = document.createElement('p'); empty.textContent = 'The selected original series has no available values.'; wrapper.append(empty); root.append(wrapper); continue; }
      const width = 560, height = 260, left = 70, right = 14, top = 15, bottom = 35;
      const years = points.map(point => point.year), first = Math.min(...years), last = Math.max(...years);
      const values = present.map(point => Number(point.value.value));
      const low = Math.min(0, ...values), high = Math.max(1, ...values), span = high - low || 1, maximum = high + span * 0.08;
      const x = year => left + (year - first) / (last - first || 1) * (width - left - right);
      const y = value => height - bottom - (value - low) / (maximum - low) * (height - top - bottom);
      const graph = svgElement('svg', { viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-label': figure.title });
      for (let index = 0; index <= 4; index++) {
        const value = low + (maximum - low) * index / 4, position = y(value);
        graph.append(svgElement('line', { x1: left, x2: width - right, y1: position, y2: position, stroke: '#dedede' }));
        graph.append(svgElement('text', { x: left - 7, y: position + 4, 'text-anchor': 'end' },
          new Intl.NumberFormat('en-US', { maximumFractionDigits: value < 10 ? 1 : 0, notation: Math.abs(value) >= 1000000 ? 'compact' : 'standard' }).format(value)));
      }
      for (const year of [...new Set([first, ...years.filter(year => year % 10 === 0), last])])
        graph.append(svgElement('text', { x: x(year), y: height - 10, 'text-anchor': 'middle' }, String(year)));
      const legend = document.createElement('div'); legend.className = 'qcew-legend';
      figure.series.forEach((series, index) => {
        let segment = [];
        const flush = () => {
          if (!segment.length) return;
          graph.append(svgElement('path', { d: segment.map((point, i) => (i ? 'L' : 'M') + x(point.year).toFixed(2) + ',' + y(Number(point.value.value)).toFixed(2)).join(' '),
            fill: 'none', stroke: '#252525', 'stroke-width': index === 0 ? 2.3 : 1.6, 'stroke-dasharray': dashes[index % dashes.length] }));
          segment = [];
        };
        for (const point of series.points) {
          if (point.value?.value === null || !Number.isFinite(Number(point.value?.value))) { flush(); continue; }
          segment.push(point);
          const dot = svgElement('circle', { cx: x(point.year), cy: y(Number(point.value.value)), r: 2,
            fill: index % 2 ? '#fff' : '#252525', stroke: '#252525' });
          dot.append(svgElement('title', {}, series.label + ' · ' + point.period + ' · ' + quantity(point.value)));
          graph.append(dot);
        }
        flush();
        const label = document.createElement('span'), marker = svgElement('svg', { viewBox: '0 0 28 12', 'aria-hidden': 'true' });
        marker.append(svgElement('line', { x1: 1, x2: 27, y1: 6, y2: 6, stroke: '#252525', 'stroke-width': 2, 'stroke-dasharray': dashes[index % dashes.length] }));
        label.append(marker, document.createTextNode(series.label)); legend.append(label);
      });
      wrapper.append(graph, legend); root.append(wrapper);
    }
  }
  function renderRows(value) {
    const labels = new Map(value.regions.map(item => [item.id, item.label]));
    const names = new Map(value.industries.map(item => [item.code, item.label]));
    let rows;
    if (value.section === 'overview') rows = value.items.map(item => {
      const row = { industry: item.label, covered_employment: quantity(item.employment),
        weekly_wage: quantity(item.weeklyWage, '', '$'), employment_change: quantity(item.employmentChange, '%'),
        wage_change: quantity(item.wageChange, '%') };
      for (const relative of item.relativeWages) row['Relative to ' + labels.get(relative.region)] = quantity(relative.ratio, '×');
      return row;
    });
    if (value.section === 'matrix') rows = value.items.map(item => ({ period: item.period, region: labels.get(item.region),
      industry: names.get(item.industry), establishments: quantity(item.establishments),
      employment: quantity(item.employment), quarterly_wages: quantity(item.quarterlyWages, '', '$'),
      nominal_weekly_wage: quantity(item.weeklyWageNominal, '', '$'), report_weekly_wage: quantity(item.weeklyWage, '', '$'),
      source_components: item.coverage.components, unavailable_components: item.coverage.unavailable }));
    if (value.section === 'sources') rows = value.items.map(item => ({
      period: item.year + '-Q' + item.qtr, area: item.area_fips, industry: item.industry_code, ownership: item.own_code,
      aggregation: item.agglvl_code, status: statuses[item.status] ?? item.status,
      establishments: item.originalValues?.qtrly_estabs ?? null, month_1: item.originalValues?.month1_emplvl ?? null,
      month_2: item.originalValues?.month2_emplvl ?? null, month_3: item.originalValues?.month3_emplvl ?? null,
      quarterly_wages: item.originalValues?.total_qtrly_wages ?? null,
      published_weekly_wage: item.originalValues?.avg_wkly_wage ?? null,
      disclosure: item.disclosureCode, original_row: item.originalRow, source_file: item.file
    }));
    if (value.section === 'changes') rows = value.items.map(item => ({ industry: item.label,
      earlier_employment: quantity(item.employmentBefore), current_employment: quantity(item.employmentAfter),
      earlier_weekly_wage: quantity(item.weeklyWageBefore, '', '$'), current_weekly_wage: quantity(item.weeklyWageAfter, '', '$') }));
    if (value.section === 'files') {
      rows = value.items.map(item => ({ file: item.file, year: item.year, area: item.area, bytes: item.bytes, original_rows: item.rowCount }));
      table('qcew-report-table', rows);
      const rendered = $('qcew-report-table').querySelectorAll('tbody tr');
      const heading = document.createElement('th'); heading.textContent = 'Download';
      $('qcew-report-table').querySelector('thead tr')?.append(heading);
      rendered.forEach((row, index) => {
        const cell = document.createElement('td'), button = document.createElement('button');
        button.type = 'button'; button.textContent = 'Download original CSV';
        button.addEventListener('click', () => download('/api/qcew/original?' + new URLSearchParams({
          capture: value.edition.captureSha256, name: value.items[index].file
        }), value.items[index].file.replace(/\.gz$/, '')).catch(error => message(error.message, true)));
        cell.append(button); row.append(cell);
      });
      return;
    }
    table('qcew-report-table', rows ?? []);
  }
  function renderReport(value) {
    selectedReport = value;
    $('qcew-edition').value = value.edition.id;
    $('qcew-section').value = value.section;
    $('qcew-report-status').textContent = value.title + ' · ' + value.period + ' · comparison ' + value.baseline +
      ' · ' + (value.profile.definition.price.dollars === 'constant' ? value.priceBase + ' dollars' : 'nominal dollars');
    metrics('qcew-report-metrics', [['Industries', value.industries.length], ['Regions', value.regions.length],
      ['Available current wage cells', value.availability.weeklyWageStatuses.available ?? 0],
      ['Report files', value.manifest.files.length]]);
    select('qcew-filter-region', [['', 'All regions'], ...value.regions.map(item => [item.id, item.label])], value.filters.region);
    select('qcew-filter-industry', [['', 'All industries'], ...value.industries.map(item => [item.code, item.label])], value.filters.industry);
    select('qcew-filter-period', [['', 'All periods'], ...value.periods.map(item => [item, item])], value.filters.period);
    const downloads = $('qcew-downloads'); downloads.replaceChildren();
    const names = { 'report.html': 'Offline report', 'report.pdf': 'PDF report', 'report.json': 'Complete report JSON',
      'data.csv': 'Calculated data CSV', 'source-rows.csv': 'Original source rows CSV', 'methodology.md': 'Methodology',
      'changes.json': 'Full changes JSON', 'changes.csv': 'Changes CSV' };
    for (const file of value.manifest.files) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = names[file.name] ?? file.name;
      button.addEventListener('click', () => download('/api/qcew/file?' + new URLSearchParams({
        edition: value.edition.id, name: file.name }), file.name).catch(error => message(error.message, true)));
      downloads.append(button);
    }
    if (value.figures) drawCharts(value.figures);
    renderRows(value);
    $('qcew-page').textContent = value.total ? (value.offset + 1) + '–' + (value.offset + value.items.length) + ' of ' + value.total + ' rows' : 'No rows in this selection.';
    const context = $('qcew-methodology'); context.replaceChildren();
    const methodologyLabels = { employment: 'Employment', wage: 'Weekly wages', coverage: 'Regional coverage',
      history: 'Historical series', prices: 'Price basis', sourceEdition: 'Source edition',
      seasonality: 'Seasonality', interpretation: 'Interpretation' };
    for (const [label, text] of Object.entries(value.methodology)) {
      if (label === 'citations') continue;
      const paragraph = document.createElement('p'), strong = document.createElement('strong');
      strong.textContent = (methodologyLabels[label] ?? label) + ': ';
      paragraph.append(strong, document.createTextNode(String(text))); context.append(paragraph);
    }
    const citations = document.createElement('ul');
    for (const citation of value.methodology.citations ?? []) {
      const item = document.createElement('li'), link = document.createElement('a');
      const url = new URL(citation.url);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = citation.title; item.append(link); citations.append(item);
    }
    if (citations.childElementCount) context.append(citations);
    const original = document.createElement('p'); original.className = 'qcew-source-note';
    original.textContent = 'BLS source collected through ' + value.source.retrievedThrough + '. Price source: ' +
      (value.cpi.metadata.title ?? value.cpi.metadata.id) + '. The full original records and calculation status remain in the downloads.';
    context.append(original); sync();
  }
  async function openEdition(editionId = $('qcew-edition').value, offset = 0) {
    if (!editionId) throw new Error('Choose a saved county report edition.');
    const generation = ++reportGeneration;
    const query = new URLSearchParams({ edition: editionId, section: $('qcew-section').value,
      offset: String(offset), limit: '100', region: $('qcew-filter-region').value,
      industry: $('qcew-filter-industry').value, period: $('qcew-filter-period').value });
    working++; sync();
    try {
      const value = await api('/api/qcew/edition?' + query);
      if (generation !== reportGeneration) return;
      if (selectedReport?.edition.id !== value.edition.id && !value.figures) drawCharts([]);
      renderReport(value);
    } finally { working--; sync(); }
  }
  async function initialize() {
    const projectId = project().id, generation = ++metadataGeneration;
    const [metadata, saved, draft, last] = await Promise.all([
      api('/api/qcew/state'), localRecord(key('request')), localRecord(key('draft')), localRecord(key('last-result'))
    ]);
    if (generation !== metadataGeneration || project()?.id !== projectId) return;
    capabilities = metadata.capabilities; active = validateRecord(saved);
    await adoptHost(metadata.retainedAction);
    $('qcew-pdf-state').textContent = capabilities.pdf
      ? 'PDF output is configured for this workspace. HTML and all data files are included in every edition.'
      : 'HTML and all data files are available. Configure the installed Chromium in this workspace to add PDF output.';
    $('qcew-pdf').checked = capabilities.pdf;
    if (draft?.definition) {
      definition = editableDefinition(draft.definition); paintProfile();
      if (draft.jsonDirty) { $('qcew-profile-json').value = draft.rawDefinition; jsonDirty = true; }
      $('qcew-input-mode').value = draft.inputMode ?? 'intake'; $('qcew-intake').value = draft.intake ?? '';
      $('qcew-receive-directory').value = draft.receivingDirectory ?? '';
      $('qcew-report-year').value = draft.year ?? ''; $('qcew-report-quarter').value = draft.quarter ?? '4';
    } else {
      definition = editableDefinition(await api('/api/qcew/profile'));
      if (project()?.id !== projectId) return;
      paintProfile();
    }
    if (!$('qcew-report-year').value) { $('qcew-report-year').value = String(new Date().getFullYear() - 1); $('qcew-report-quarter').value = '4'; }
    if (last?.result.receiving) showReceiving(last.result);
    else if (metadata.retainedAction?.result?.receiving) showReceiving(metadata.retainedAction.result);
    sourceMode(); initialized = true; paintInventory(); onState();
  }
  function ensureInitialized() {
    if (initialized) return Promise.resolve();
    if (initializing) return initializing;
    const operation = initialize();
    initializing = operation;
    operation.finally(() => { if (initializing === operation) initializing = null; }).catch(() => {});
    return operation;
  }
  function onState() {
    if (!project()) return;
    if (openedProject !== project().id) {
      openedProject = project().id; initialized = false; initializing = null; capabilities = null;
      active = null; definition = null; selectedReport = null; lastRevision = null;
      ++metadataGeneration; ++reportGeneration; clearTimeout(draftTimer);
      ensureInitialized().catch(error => { $('qcew-status').textContent = error.message; message(error.message, true); });
    }
    if (lastRevision !== project().revision) {
      lastRevision = project().revision; paintInventory();
    }
    $('qcew-status').textContent = !initialized ? 'Opening the saved county report workspace…' : project().pending
      ? 'The project is retaining its current action. Its saved report editions remain available.'
      : 'Source editions, reusable profiles and report history are ready.';
    sync();
  }
  bind('qcew-source-form', async () => {
    const file = $('qcew-input-mode').value === 'capture' ? fileSelection('qcew-capture-file', 'capture', capabilities.captureLimitBytes) : null;
    const payload = file ? {} : { inputDirectory: $('qcew-intake').value.trim() };
    await showResult('qcew.import', await mutate('qcew.import', payload, file));
  }, 'submit');
  bind('qcew-cpi-form', async () => {
    await showResult('qcew.cpi', await mutate('qcew.cpi', {}, fileSelection('qcew-cpi-file', 'capture', 128 * 1048576)));
  }, 'submit');
  bind('qcew-default-profile', async () => { definition = editableDefinition(await api('/api/qcew/profile')); paintProfile(); saveDraftSoon(); });
  bind('qcew-open-profile', async () => {
    definition = editableDefinition(await api('/api/qcew/profile?' + new URLSearchParams({ profile: $('qcew-profile-load').value })));
    paintProfile(); saveDraftSoon();
  });
  bind('qcew-download-profile', () => download('/api/qcew/profile?' + new URLSearchParams({
    profile: $('qcew-profile-load').value, download: '1' }), 'county-report-profile.json'));
  bind('qcew-apply-profile-json', async () => {
    const value = editableDefinition(JSON.parse($('qcew-profile-json').value));
    definition = value;
    paintProfile(); saveDraftSoon();
  });
  bind('qcew-profile-form', async () => {
    definition = formDefinition();
    await showResult('qcew.profile', await mutate('qcew.profile', { profile: definition }));
    paintProfile(); saveDraftSoon();
  }, 'submit');
  $('qcew-profile-form').addEventListener('input', event => {
    if (event.target.id === 'qcew-profile-json') jsonDirty = true;
    else if (definition && !jsonDirty) {
      try { definition = formDefinition(); $('qcew-profile-json').value = JSON.stringify(definition, null, 2); }
      catch {}
    }
    saveDraftSoon(); sync();
  });
  $('qcew-input-mode').addEventListener('change', () => { sourceMode(); saveDraftSoon(); });
  for (const id of ['qcew-intake', 'qcew-receive-directory', 'qcew-report-year', 'qcew-report-quarter'])
    $(id).addEventListener('input', saveDraftSoon);
  for (const id of ['qcew-produce-source', 'qcew-produce-cpi', 'qcew-edition', 'qcew-profile-load'])
    $(id).addEventListener('change', sync);
  $('qcew-produce-profile').addEventListener('change', refreshPredecessors);
  bind('qcew-produce-form', async () => {
    const payload = { captureSha256: $('qcew-produce-source').value, profileId: $('qcew-produce-profile').value,
      cpiCaptureSha256: $('qcew-produce-cpi').value, period: { year: Number($('qcew-report-year').value), quarter: Number($('qcew-report-quarter').value) },
      previousEditionId: $('qcew-produce-previous').value || null, pdf: $('qcew-pdf').checked };
    await showResult('qcew.produce', await mutate('qcew.produce', payload));
  }, 'submit');
  bind('qcew-open-edition', async () => {
    resetReportFilters(); await openEdition();
  });
  bind('qcew-use-edition', async () => {
    const edition = inventory().editions.find(item => item.id === $('qcew-edition').value);
    if (!edition) throw new Error('Choose a saved report edition.');
    $('qcew-produce-profile').value = edition.profileId; refreshPredecessors();
    $('qcew-produce-source').value = edition.captureSha256; $('qcew-produce-cpi').value = edition.cpiCaptureSha256;
    $('qcew-produce-previous').value = edition.id;
    $('qcew-report-year').value = String(edition.period.quarter === 4 ? edition.period.year + 1 : edition.period.year);
    $('qcew-report-quarter').value = String(edition.period.quarter === 4 ? 1 : edition.period.quarter + 1);
    saveDraftSoon(); message('The predecessor is selected. Choose the next quarter’s retained source and produce its edition.'); sync();
  });
  for (const id of ['qcew-section', 'qcew-filter-region', 'qcew-filter-industry', 'qcew-filter-period'])
    bind(id, () => $('qcew-edition').value ? openEdition(undefined, 0) : undefined, 'change');
  bind('qcew-page-previous', () => openEdition(undefined, Math.max(0, (selectedReport?.offset ?? 0) - 100)));
  bind('qcew-page-next', () => selectedReport?.nextOffset != null ? openEdition(undefined, selectedReport.nextOffset) : undefined);
  bind('qcew-download-original', () => download('/api/qcew/source?' + new URLSearchParams({
    capture: $('qcew-produce-source').value }), 'bls-qcew-original-capture.json'));
  bind('qcew-export-project', () => download('/api/bundle', 'fred-economic-project.json'));
  bind('qcew-receive-form', async () => {
    await showResult('qcew.receive', await mutate('qcew.receive', { targetDirectory: $('qcew-receive-directory').value.trim() },
      fileSelection('qcew-receive-file', 'bundle', capabilities.projectLimitBytes)));
  }, 'submit');
  bind('qcew-resume', async () => {
    if (!active) throw new Error('Open the browser that retains this action’s complete original selection.');
    const record = active; await showResult(record.request.action, await transmit(record));
  });
  bind('qcew-clear-request', async () => {
    if (!active) return;
    await refresh();
    if (!completed() && (project().pending || getBusy?.() || !['prepared', 'returned_error'].includes(active.phase)))
      throw new Error('Continue the original request to receive its outcome before clearing it.');
    const metadata = await api('/api/qcew/state');
    if (metadata.retainedAction?.id === active.request.id) {
      await api('/api/qcew/action', { action: 'qcew.clear', id: active.request.id,
        requestSha256: metadata.retainedAction.requestSha256 });
      metadata.retainedAction = null;
    }
    await localRecord(key('request'), 'delete'); active = null;
    await adoptHost(metadata.retainedAction);
    message('The ended request is cleared. Saved project work remains available.');
  });
  sourceMode();
  return { onState, async open() {
    if (!project()) return;
    if (openedProject !== project().id) onState();
    await ensureInitialized();
    if (inventory().selectedEdition && !selectedReport) await openEdition(inventory().selectedEdition);
  } };
}
