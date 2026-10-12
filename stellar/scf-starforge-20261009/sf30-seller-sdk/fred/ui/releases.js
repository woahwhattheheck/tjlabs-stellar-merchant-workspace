// MIT. Calendar source, reviewed plans and original-vintage capture in the private FRED workspace.
const $ = id => document.getElementById(id);
const actions = new Set(['release-import', 'release-capture', 'release-watch-save', 'release-plan-save', 'release-vintage-capture']);
const human = value => typeof value === 'string' ? value.replaceAll('_', ' ').toLowerCase() : value;
const display = value => value === null || value === undefined ? '' : Array.isArray(value)
  ? value.map(display).join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value);
const list = value => [...new Set(value.split(/[\s,]+/).map(item => item.trim()).filter(Boolean))].sort();
const datePlus = (value, days) => { const date = new Date(value + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

export function mountFredReleases({ api, download, table, select, getState, refresh, message, openObservations, openBriefing }) {
  let working = 0, initialized = false, lastRevision = null, generation = 0, sourceGeneration = 0;
  let current = null, sourcePage = null;
  const state = () => getState();
  const watches = () => state()?.releaseWatches ?? [];
  const captures = () => state()?.releaseCaptures ?? [];
  const plans = () => state()?.releasePlans ?? [];
  const catches = () => state()?.releaseCatchUps ?? [];
  const watch = () => watches().find(item => item.id === $('release-watch').value);
  const requestKey = () => 'fred-release-request:' + state().id;
  const captureLabel = item => item.selection.asOf + ' · ' + item.selection.series.join(', ') + ' · ' + item.id.slice(0, 10);

  function request() {
    const pending = state()?.pending;
    if (pending && actions.has(pending.kind))
      return { ...pending.payload, action: pending.kind, id: pending.id, expectedRevision: pending.expectedRevision };
    const raw = sessionStorage.getItem(requestKey());
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!actions.has(value.action) || typeof value.id !== 'string' || !Number.isSafeInteger(value.expectedRevision))
      throw new Error('Read project history before clearing the incomplete saved browser action.');
    return value;
  }
  function bind(id, callback, type = 'click') {
    $(id).addEventListener(type, async event => {
      event.preventDefault(); if (working && type !== 'change') return;
      working++; message(); sync();
      try { await callback(event); } catch (error) { message(error.message, true); }
      finally { working--; sync(); }
    });
  }
  function sync() {
    if (!state()) return;
    const busy = working > 0, selectedWatch = watch(), selectedSource = Boolean($('release-source').value);
    $('release-watch-save').disabled = busy;
    $('release-capture').disabled = busy || !selectedWatch;
    $('release-import').disabled = busy || !$('release-import-file').files.length;
    $('release-plan-preview').disabled = busy || !selectedWatch || !$('release-after').value;
    $('release-plan-save').disabled = busy || current?.mode !== 'preview' || !current.value || current.value.revision !== state().revision;
    for (const id of ['release-source-open', 'release-source-download']) $(id).disabled = busy || !selectedSource;
    for (const id of ['release-plan-open', 'release-plan-download']) $(id).disabled = busy || !$('release-plan').value;
    $('release-source-prev').disabled = busy || !sourcePage || sourcePage.offset === 0;
    $('release-source-next').disabled = busy || !sourcePage || sourcePage.nextOffset === null;
    const page = current?.value?.plan;
    $('release-plan-prev').disabled = busy || !page || page.offset === 0;
    $('release-plan-next').disabled = busy || !page || page.nextOffset === null;
    $('release-vintage-capture').disabled = busy || current?.mode !== 'saved' || current.planId !== $('release-plan').value || !$('release-capture-vintage').value;
    const completed = catches().find(item => item.planId + '|' + item.asOf === $('release-completed').value);
    $('release-open-observations').disabled = busy || !completed;
    $('release-open-briefing').disabled = busy || !completed || !watches().find(item => item.id === completed.watchId)?.template;
    let saved;
    try { saved = request(); } catch (error) {
      $('release-recovery').hidden = false; $('release-recovery-text').textContent = error.message;
      $('release-resume').disabled = true; $('release-discard').disabled = busy || Boolean(state().pending); return;
    }
    $('release-recovery').hidden = !saved;
    $('release-recovery-text').textContent = saved
      ? state().operations.some(item => item.id === saved.id)
        ? 'The saved action completed. Continue to reopen its result.'
        : 'This release action is retained. Continue the same request to finish or recover its result.'
      : '';
    $('release-resume').disabled = busy || !saved;
    $('release-discard').disabled = busy || Boolean(state().pending);
  }
  function invalidate() {
    generation++;
    if (current?.mode === 'preview') {
      current = null; $('release-fill-history').hidden = true;
      $('release-plan-status').textContent = 'Selection changed. Preview a plan from the current watch and sources.';
    }
    sync();
  }
  function refreshWatch() {
    const chosen = watch(), matching = captures().filter(item => !chosen || chosen.series.every(id => item.selection.series.includes(id)));
    select('release-before', [['', 'No earlier source comparison'], ...matching.map(item => [item.id, captureLabel(item)])]);
    select('release-after', matching.map(item => [item.id, captureLabel(item)]));
    const selectedPlans = plans().filter(item => !chosen || item.watchId === chosen.id);
    select('release-plan', [...selectedPlans].reverse().map(item => [item.id, (item.metadataAsOf ?? 'Saved plan') + ' · ' + item.id.slice(-10)]));
    const completed = catches().filter(item => !chosen || item.watchId === chosen.id);
    select('release-completed', [...completed].reverse().map(item => [item.planId + '|' + item.asOf,
      item.asOf + ' · ' + item.selection.series.join(', ') + ' · ' + item.captureId.slice(0, 10)]));
    $('release-watch-detail').textContent = chosen
      ? chosen.name + ': ' + chosen.series.join(', ') + '; observations from ' + chosen.observationStart + ' through ' +
        (chosen.observationEnd === 'as_of' ? 'each captured vintage' : chosen.observationEnd) + '; ' +
        (chosen.catchUp === 'all_vintages' ? 'retain every selected vintage' : 'capture the latest selected vintage') + '.'
      : 'Save a watch to choose the series and observation history this project should follow.';
    sync();
  }
  function onState() {
    if (!state()) return;
    const project = state(), today = new Date().toISOString().slice(0, 10);
    if (!initialized) {
      $('release-watch-series').value = project.selection.series.join(', ');
      $('release-watch-start').value = project.selection.start;
      $('release-watch-end').value = project.selection.end;
      $('release-watch-baseline').value = project.selection.asOf;
      $('release-as-of').value = today; $('release-calendar-start').value = today;
      $('release-calendar-end').value = datePlus(today, 90);
      $('release-vintage-start').value = project.selection.asOf; $('release-vintage-end').value = today;
      initialized = true;
    }
    if (lastRevision !== null && lastRevision !== project.revision && current?.mode === 'preview') invalidate();
    lastRevision = project.revision;
    select('release-watch-template', [['', 'Independent series watch'], ...(project.briefingTemplates ?? []).map(item => [item.id, item.name])]);
    select('release-watch', watches().map(item => [item.id, item.name + ' · ' + item.id.slice(-10)]));
    select('release-source', captures().map(item => [item.id, captureLabel(item)]));
    refreshWatch(); sync();
  }
  async function transmit(saved, extra = {}) {
    sessionStorage.setItem(requestKey(), JSON.stringify(saved));
    try {
      const result = await api('/api/action', { ...saved, ...extra });
      sessionStorage.removeItem(requestKey()); await refresh(); return result;
    } catch (error) {
      await refresh().catch(() => {});
      const completed = state().operations.find(item => item.id === saved.id);
      if (completed) { sessionStorage.removeItem(requestKey()); return completed.result; }
      throw error;
    }
  }
  async function mutate(action, payload, extra = {}, expectedRevision = state().revision) {
    if (request()) throw new Error('Continue the saved release action before starting another.');
    return transmit({ action, id: 'fred-' + action + '-' + crypto.randomUUID().replaceAll('-', ''),
      expectedRevision, ...payload }, extra);
  }
  function planSelection() {
    if (!watch()) throw new Error('Choose a saved release watch.');
    return { watchId: watch().id, beforeCaptureId: $('release-before').value || null,
      afterCaptureId: $('release-after').value };
  }
  function tableRows(section, rows) {
    if (section === 'series') return { rows: rows.map(row => ({ series: row.id, title: row.title, units: row.units,
      frequency: row.frequency, seasonal_adjustment: row.seasonalAdjustment, first_observation: row.observationStart,
      latest_observation: row.observationEnd, source_updated: row.lastUpdated, releases: display(row.releaseIds), notes: row.notes })),
      columns: ['series', 'title', 'units', 'frequency', 'seasonal_adjustment', 'first_observation', 'latest_observation', 'source_updated', 'releases', 'notes'] };
    if (section === 'releases') return { rows: rows.map(row => ({ release: row.id, name: row.metadata.name,
      series: display(row.series), source: row.metadata.link ?? row.metadata.url ?? '', notes: row.metadata.notes ?? '' })),
      columns: ['release', 'name', 'series', 'source', 'notes'] };
    if (section === 'calendar' || section === 'schedule') return { rows: rows.map(row => ({ release: row.releaseId,
      date: row.date, series: display(row.series), name: row.original?.release_name ?? '',
      schedule: human(row.phase ?? 'publisher_calendar_date') })), columns: ['release', 'date', 'series', 'name', 'schedule'] };
    if (section === 'vintages') return { rows: rows.map(row => ({ series: row.series, vintage: row.date })), columns: ['series', 'vintage'] };
    if (section === 'acquisitions') return { rows: rows.map(row => ({ vintage: row.asOf, changed_series: display(row.changedSeries),
      source_vintages: display(row.triggerVintageDates), reasons: display(row.reasons.map(human)), all_series: display(row.selection.series),
      observation_start: row.selection.start, observation_end: row.selection.end })),
      columns: ['vintage', 'changed_series', 'source_vintages', 'reasons', 'all_series', 'observation_start', 'observation_end'] };
    return { rows: rows.map(row => ({ change: human(row.kind ?? row.reason ?? ''), series: display(row.series),
      release: row.releaseId ?? '', date: row.date ?? row.asOf ?? '', reasons: display(row.reasons?.map(human) ?? []),
      before: display(row.before), after: display(row.after) })), columns: ['change', 'series', 'release', 'date', 'reasons', 'before', 'after'] };
  }
  function pager(id, page, count) {
    $(id).textContent = count ? (page.offset + 1) + '–' + Math.min(page.offset + page.limit, count) + ' of ' + count : 'No rows in this view.';
  }
  async function openSource(offset = 0) {
    const id = $('release-source').value, section = $('release-source-section').value, expected = ++sourceGeneration;
    if (!id) throw new Error('Choose a retained release source.');
    const value = await api('/api/release-capture?' + new URLSearchParams({ capture: id, section, offset: String(offset), limit: '100' }));
    if (sourceGeneration !== expected || id !== $('release-source').value || section !== $('release-source-section').value) return;
    sourcePage = value;
    const rendered = tableRows(section, value.items); table('release-source-table', rendered.rows, rendered.columns);
    $('release-source-context').textContent = 'Metadata as of ' + value.selection.asOf + '; source collected ' +
      value.source.retrievalWindow.start + ' through ' + value.source.retrievalWindow.end +
      '. ' + value.counts.series + ' series, ' + value.counts.calendar + ' calendar dates and ' + value.counts.vintages + ' vintage entries.';
    pager('release-source-page', value, value.total); sync();
  }
  function renderPlan(value) {
    const page = value.plan, chosen = watches().find(item => item.id === page.watchId), summary = $('release-plan-summary');
    summary.replaceChildren();
    for (const [label, count] of [['Observation captures', page.summary.observationAcquisitions],
      ['Vintage changes', page.summary.vintageChanges], ['Late discovered vintages', page.summary.lateDiscoveredVintages],
      ['Calendar changes', page.summary.calendarChanges]]) {
      const metric = document.createElement('div'), strong = document.createElement('strong'), text = document.createElement('span');
      metric.className = 'metric'; strong.textContent = count; text.textContent = label; metric.append(strong, text); summary.append(metric);
    }
    $('release-plan-status').textContent = (current.mode === 'saved' ? 'Saved plan' : 'Preview') + ' · ' +
      (chosen?.name ?? 'Release watch') + ' · metadata as of ' + page.metadataAsOf;
    const coverage = page.coverage;
    $('release-plan-coverage').textContent = coverage.complete
      ? 'The retained vintage history covers the watched period. The selected observation captures use the original available vintage dates.'
      : 'Additional vintage history is needed to cover ' + coverage.start + ' through ' + coverage.end + '. Known available vintages remain listed in this plan.';
    $('release-fill-history').hidden = coverage.complete;
    const rendered = tableRows(page.section, page.rows); table('release-plan-table', rendered.rows, rendered.columns);
    pager('release-plan-page', page, page.count);
    if (page.section === 'acquisitions' && current.mode === 'saved') {
      const options = $('release-vintage-options'); options.replaceChildren();
      for (const item of page.rows) { const option = document.createElement('option'); option.value = item.asOf; options.append(option); }
      if (!$('release-capture-vintage').value && page.rows.length) $('release-capture-vintage').value = page.rows[0].asOf;
    }
    sync();
  }
  async function openCurrent(offset = 0) {
    if (!current) throw new Error('Preview a plan or open a saved plan.');
    const active = current, expected = ++generation, section = $('release-plan-section').value;
    const value = active.mode === 'preview'
      ? await api('/api/release-plan-preview', { ...active.selection, section, offset, limit: 100 })
      : await api('/api/release-plan?' + new URLSearchParams({ plan: active.planId, section, offset: String(offset), limit: '100' }));
    if (generation !== expected || active !== current) return;
    active.value = value; renderPlan(value);
  }
  async function openSaved(planId = $('release-plan').value) {
    const saved = plans().find(item => item.id === planId);
    if (!saved) throw new Error('Choose a saved release plan.');
    $('release-watch').value = saved.watchId; refreshWatch(); $('release-plan').value = planId;
    $('release-capture-vintage').value = ''; $('release-plan-section').value = 'acquisitions';
    current = { mode: 'saved', planId }; await openCurrent();
  }
  async function showResult(result) {
    if (result.releaseCaptureId) {
      $('release-source').value = result.releaseCaptureId; $('release-after').value = result.releaseCaptureId;
      await openSource(); message('The complete calendar and vintage source is retained.');
    } else if (result.watchId && result.watch) {
      $('release-watch').value = result.watchId; refreshWatch();
      $('release-vintage-start').value = result.watch.baselineAsOf;
      message('The release watch is saved. Choose its calendar and vintage source interval.');
    } else if (result.captureId && result.planId) {
      $('release-completed').value = result.planId + '|' + result.asOf;
      message('The original observations are retained. Open the source or review the linked recurring briefing.');
    } else if (result.planId) {
      await openSaved(result.planId); message('The capture plan is saved. Select an available vintage to collect.');
    }
    sync();
  }
  async function importFile() {
    const file = $('release-import-file').files[0];
    if (!file || file.size > 128 * 1024 * 1024) throw new Error('Choose a complete original release JSON capture up to 128 MiB.');
    const capture = JSON.parse(await file.text());
    if (!/^[a-f0-9]{64}$/.test(capture.captureSha256 ?? '')) throw new Error('Choose the original release capture with its complete source identity.');
    return capture;
  }

  bind('release-watch-form', async () => {
    const templateId = $('release-watch-template').value || null;
    await showResult(await mutate('release-watch-save', { name: $('release-watch-name').value,
      series: list($('release-watch-series').value), templateId, observationStart: $('release-watch-start').value,
      observationEnd: $('release-watch-end-current').checked ? 'as_of' : $('release-watch-end').value,
      baselineAsOf: $('release-watch-baseline').value, catchUp: $('release-watch-policy').value }));
  }, 'submit');
  $('release-watch-template').addEventListener('change', () => {
    const selected = (state().briefingTemplates ?? []).find(item => item.id === $('release-watch-template').value);
    $('release-watch-series').readOnly = Boolean(selected);
    if (selected) {
      $('release-watch-series').value = selected.briefing.series.map(item => item.id).join(', ');
      if (!$('release-watch-name').value) $('release-watch-name').value = selected.name;
      const source = state().captures.find(item => item.id === selected.origin.captureId);
      if (source) $('release-watch-baseline').value = source.selection.asOf;
    }
  });
  $('release-watch-end-current').addEventListener('change', () => { $('release-watch-end').disabled = $('release-watch-end-current').checked; });
  $('release-watch').addEventListener('change', () => {
    generation++; current = null; $('release-fill-history').hidden = true; $('release-capture-vintage').value = '';
    $('release-plan-status').textContent = 'Choose this watch’s sources to preview a plan, or open one of its saved plans.';
    refreshWatch(); if (watch()) $('release-vintage-start').value = watch().baselineAsOf;
  });
  for (const id of ['release-before', 'release-after']) $(id).addEventListener('change', invalidate);
  bind('release-source-form', async () => {
    if (!watch()) throw new Error('Choose a saved release watch.');
    await showResult(await mutate('release-capture', { selection: { series: watch().series,
      asOf: $('release-as-of').value, calendarStart: $('release-calendar-start').value, calendarEnd: $('release-calendar-end').value,
      vintageStart: $('release-vintage-start').value, vintageEnd: $('release-vintage-end').value,
      pageSize: Number($('release-page-size').value), maxRows: Number($('release-max-rows').value) } }));
  }, 'submit');
  $('release-import-file').addEventListener('change', sync);
  bind('release-import', async () => {
    const capture = await importFile();
    await showResult(await mutate('release-import', { releaseCaptureId: capture.captureSha256 }, { capture }));
  });
  $('release-source').addEventListener('change', () => { sourceGeneration++; sourcePage = null; sync(); });
  bind('release-source-open', () => openSource());
  bind('release-source-section', () => $('release-source').value ? openSource() : undefined, 'change');
  bind('release-source-prev', () => openSource(Math.max(0, (sourcePage?.offset ?? 0) - 100)));
  bind('release-source-next', () => {
    const offset = sourcePage?.nextOffset; if (offset !== null && offset !== undefined) return openSource(offset);
  });
  bind('release-source-download', () => download('/api/release-capture?' +
    new URLSearchParams({ capture: $('release-source').value, download: '1' }), 'fred-release-capture.json'));
  bind('release-plan-preview', async () => {
    current = { mode: 'preview', selection: planSelection() }; await openCurrent();
  });
  bind('release-plan-save', async () => {
    if (current?.mode !== 'preview' || !current.value || current.value.revision !== state().revision ||
        JSON.stringify(current.selection) !== JSON.stringify(planSelection())) throw new Error('Preview the current watch and sources before saving.');
    const active = current;
    await showResult(await mutate('release-plan-save', { ...active.selection, previewId: active.value.previewId }, {}, active.value.revision));
  });
  $('release-plan').addEventListener('change', () => { generation++; current = null; $('release-capture-vintage').value = ''; $('release-fill-history').hidden = true; $('release-plan-status').textContent = 'Open the selected saved plan to review or capture its observation editions.'; sync(); });
  bind('release-plan-open', () => openSaved());
  bind('release-plan-section', () => current ? openCurrent() : undefined, 'change');
  bind('release-plan-prev', () => openCurrent(Math.max(0, (current?.value?.plan.offset ?? 0) - 100)));
  bind('release-plan-next', () => {
    const offset = current?.value?.plan.nextOffset; if (offset !== null && offset !== undefined) return openCurrent(offset);
  });
  bind('release-plan-download', () => download('/api/release-plan?' + new URLSearchParams({ plan: $('release-plan').value, download: '1' }), 'fred-release-plan.json'));
  bind('release-fill-history', async () => {
    const page = current?.value?.plan, original = captures().find(item => item.id === page?.afterCaptureSha256);
    if (!page || !original) throw new Error('Open the plan with its current source.');
    const selection = original.selection;
    $('release-as-of').value = selection.asOf;
    $('release-calendar-start').value = selection.calendarStart; $('release-calendar-end').value = selection.calendarEnd;
    $('release-vintage-start').value = selection.vintageStart < page.coverage.start ? selection.vintageStart : page.coverage.start;
    $('release-vintage-end').value = selection.asOf;
    $('release-page-size').value = selection.pageSize; $('release-max-rows').value = selection.maxRows;
    $('release-source-form').scrollIntoView({ block: 'start' });
    message('The complete vintage interval is selected. Capture this source to fill the history.');
  });
  $('release-capture-vintage').addEventListener('input', sync);
  bind('release-vintage-capture', async () => {
    if (current?.mode !== 'saved' || current.planId !== $('release-plan').value) throw new Error('Open the saved plan for this capture.');
    await showResult(await mutate('release-vintage-capture', { planId: current.planId, asOf: $('release-capture-vintage').value }));
  });
  $('release-completed').addEventListener('change', sync);
  bind('release-open-observations', async () => {
    const item = catches().find(item => item.planId + '|' + item.asOf === $('release-completed').value);
    if (!item) throw new Error('Choose a completed observation capture.'); await openObservations(item.captureId);
  });
  bind('release-open-briefing', async () => {
    const item = catches().find(item => item.planId + '|' + item.asOf === $('release-completed').value);
    const selected = watches().find(value => value.id === item?.watchId);
    if (!selected?.template) throw new Error('Choose a completed capture with a linked briefing template.');
    await openBriefing({ templateId: selected.template.id, captureId: item.captureId });
  });
  bind('release-resume', async () => {
    const saved = request(); if (!saved) throw new Error('No release action is retained.');
    const completed = state().operations.find(item => item.id === saved.id);
    if (completed) { sessionStorage.removeItem(requestKey()); await showResult(completed.result); return; }
    let extra = {};
    if (saved.action === 'release-import' && $('release-import-file').files.length) {
      const capture = await importFile();
      if (capture.captureSha256 !== saved.releaseCaptureId) throw new Error('Choose the same original source capture for this import.');
      extra = { capture };
    }
    await showResult(await transmit(saved, extra));
  });
  bind('release-discard', async () => {
    const latest = await api('/api/state');
    if (latest.busy || latest.project.pending) throw new Error('Continue the original project action before clearing this browser request.');
    sessionStorage.removeItem(requestKey()); await refresh(); message('The browser request is cleared; the project history is retained.');
  });
  return { onState };
}
