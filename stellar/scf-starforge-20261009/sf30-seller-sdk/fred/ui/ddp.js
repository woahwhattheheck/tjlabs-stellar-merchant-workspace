// MIT. Original DDP packages, reviewed mappings and complete receiving in the economic workspace.
const $ = id => document.getElementById(id);
const kinds = new Set(['ddp-crosswalk-import', 'ddp-crosswalk-capture', 'ddp-package-import',
  'ddp-migration-save', 'ddp-migration-acquire']);
const display = value => value === null || value === undefined ? '' : typeof value === 'object'
  ? JSON.stringify(value) : String(value);
const meaning = value => value?.label || value?.code || '';
const human = value => String(value ?? '').toLowerCase().replaceAll('_', ' ');
const PAGE = 100;
const draftFields = ['ddp-crosswalk', 'ddp-package', 'ddp-migration-name', 'ddp-bookmark', 'ddp-date-policy',
  'ddp-last-count', 'ddp-start', 'ddp-end', 'ddp-as-of', 'ddp-page-size', 'ddp-max-rows', 'ddp-migration-note'];
const sourceKey = item => item.release + '\u0000' + item.boardSeriesId;

export function mountFredDdp({ api, upload, download, table, select, getState, refresh, message,
  openObservations, openReleaseWatch }) {
  let projectId = null, lastRevision = null, working = 0, current = null, receiving = null;
  let decisions = [], bindings = [], crosswalkPage = null, packagePage = null, observationPage = null;
  let migrationPage = null, receivingPage = null, candidates = [], candidateSource = null;
  const generations = {}, series = new Map(), memoryUploads = new Map();
  const state = () => getState();
  const records = key => state()?.[key] ?? [];
  const key = purpose => 'fred-ddp-' + purpose + ':' + state().id;
  const serial = part => generations[part] = (generations[part] ?? 0) + 1;
  const isCurrent = (part, value) => generations[part] === value;
  const choice = (id, text) => [id, text + ' · ' + id.slice(-10)];
  const selectedSeries = () => series.get($('ddp-decision-series').value);
  const uploadKey = request => state().id + ':' + request.id;

  function bind(id, callback, type = 'click') {
    $(id).addEventListener(type, async event => {
      event.preventDefault();
      if (working && type !== 'change') return;
      working++; message(); sync();
      try { await callback(event); } catch (error) { message(error.message, true); }
      finally { working--; sync(); }
    });
  }
  function metrics(id, entries) {
    const root = $(id); root.replaceChildren();
    for (const [label, value] of entries) {
      const node = document.createElement('div'), strong = document.createElement('strong'), span = document.createElement('span');
      node.className = 'metric'; strong.textContent = display(value); span.textContent = label;
      node.append(strong, span); root.append(node);
    }
  }
  function pager(part, page) {
    const total = page?.total ?? 0, offset = page?.offset ?? 0, count = page?.rows?.length ?? 0;
    $('ddp-' + part + '-page').textContent = total ? (offset + 1) + '–' + (offset + count) + ' of ' + total : '0 rows';
    $('ddp-' + part + '-prev').disabled = working > 0 || !page || offset === 0;
    $('ddp-' + part + '-next').disabled = working > 0 || !page || page.nextOffset === null;
  }
  function request() {
    const pending = state()?.pending;
    if (pending && kinds.has(pending.kind))
      return { ...pending.payload, action: pending.kind, id: pending.id, expectedRevision: pending.expectedRevision };
    const raw = sessionStorage.getItem(key('request'));
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || !kinds.has(value.action) || typeof value.id !== 'string' || !Number.isSafeInteger(value.expectedRevision))
      throw new Error('Read the project history before clearing the incomplete saved browser action.');
    return value;
  }
  function sync() {
    if (!state()) return;
    const busy = working > 0;
    const source = Boolean($('ddp-crosswalk').value), pkg = Boolean($('ddp-package').value);
    const migration = Boolean($('ddp-migration').value), result = Boolean($('ddp-receiving').value);
    for (const id of ['ddp-crosswalk-capture', 'ddp-export-project']) $(id).disabled = busy;
    $('ddp-crosswalk-import').disabled = busy || !$('ddp-crosswalk-file').files.length;
    $('ddp-package-import').disabled = busy || !$('ddp-package-file').files.length;
    for (const id of ['ddp-crosswalk-open', 'ddp-crosswalk-original', 'ddp-crosswalk-download']) $(id).disabled = busy || !source;
    for (const id of ['ddp-package-open', 'ddp-package-original', 'ddp-package-download']) $(id).disabled = busy || !pkg;
    $('ddp-observation-open').disabled = busy || !pkg || !$('ddp-observation-series').value;
    $('ddp-migration-preview').disabled = busy || !source || !pkg;
    $('ddp-migration-save').disabled = busy || current?.mode !== 'preview' || current.value?.revision !== state().revision;
    for (const id of ['ddp-migration-open', 'ddp-migration-download']) $(id).disabled = busy || !migration;
    $('ddp-migration-acquire').disabled = busy || current?.mode !== 'saved' ||
      current.migrationId !== $('ddp-migration').value || !current.value?.migration?.summary?.ready;
    for (const id of ['ddp-receiving-open', 'ddp-receiving-html', 'ddp-receiving-csv', 'ddp-receiving-json'])
      $(id).disabled = busy || !result;
    for (const id of ['ddp-open-observations', 'ddp-use-release-watch'])
      $(id).disabled = busy || !receiving || !$('ddp-result-capture').value;
    for (const id of ['ddp-decision-apply', 'ddp-decision-remove', 'ddp-binding-apply', 'ddp-binding-remove'])
      $(id).disabled = busy || !selectedSeries();
    $('ddp-decision-target').disabled = $('ddp-decision-action').value !== 'map';
    for (const [part, page] of [['crosswalk',crosswalkPage],['package',packagePage],['observation',observationPage],
      ['migration',migrationPage],['receiving',receivingPage]]) pager(part,page);
    let saved;
    try { saved = request(); }
    catch (error) {
      $('ddp-recovery').hidden = false; $('ddp-recovery-text').textContent = error.message;
      $('ddp-resume').disabled = true; $('ddp-discard').disabled = busy || Boolean(state().pending); return;
    }
    $('ddp-recovery').hidden = !saved;
    if (saved) $('ddp-recovery-text').textContent = records('operations').some(item => item.id === saved.id)
      ? 'The retained action completed. Continue to open its saved result.'
      : 'The original request is retained. Continue it to finish the same source import or acquisition.';
    $('ddp-resume').disabled = busy || !saved;
    $('ddp-discard').disabled = busy || Boolean(state().pending);
  }
  function saveDraft() {
    const fields = Object.fromEntries(draftFields.map(id => [id,$(id).value]));
    sessionStorage.setItem(key('draft'), JSON.stringify({ fields, decisions, bindings }));
  }
  function invalidate() {
    serial('migration');
    if (current?.mode === 'preview') {
      current = null; migrationPage = null;
      $('ddp-migration-status').textContent = 'The selection changed. Preview the complete migration before saving.';
    }
    saveDraft(); sync();
  }
  function windowControls() {
    const policy = $('ddp-date-policy').value, fixed = policy === 'fixed';
    $('ddp-last-label').hidden = policy !== 'last';
    for (const [label, input] of [['ddp-start-label','ddp-start'],['ddp-end-label','ddp-end']]) {
      $(label).hidden = !fixed; $(input).disabled = !fixed; $(input).required = fixed;
    }
    $('ddp-last-count').disabled = policy !== 'last'; $('ddp-last-count').required = policy === 'last';
  }
  function selection() {
    const policy = $('ddp-date-policy').value;
    return { packageId: $('ddp-package').value, crosswalkId: $('ddp-crosswalk').value,
      name: $('ddp-migration-name').value, asOf: $('ddp-as-of').value,
      window: policy === 'last' ? { kind: 'last', count: Number($('ddp-last-count').value) }
        : policy === 'fixed' ? { kind: 'fixed', start: $('ddp-start').value, end: $('ddp-end').value } : { kind: 'source' },
      decisions, bindings, pageSize: Number($('ddp-page-size').value), maxRows: Number($('ddp-max-rows').value),
      bookmark: $('ddp-bookmark').value || null, note: $('ddp-migration-note').value };
  }
  function decisionTables() {
    table('ddp-decision-table', decisions.map(item => ({ Release:item.release, 'Board series':item.boardSeriesId,
      Choice:human(item.action), 'FRED series':item.fredSeriesId ?? '', Reason:item.note })));
    table('ddp-binding-table', bindings.map(item => ({ 'Original series':series.get(item.seriesId)?.boardSeriesId ?? item.seriesId,
      Period:human(item.periodRule), 'Source multiplier':item.sourceScale, 'FRED multiplier':item.targetScale,
      Units:item.expectedFredUnits, Frequency:item.expectedFredFrequency,
      'Seasonal adjustment':item.expectedFredSeasonalAdjustment, Reason:item.note })));
  }
  function onState() {
    if (!state()) return;
    const changed = projectId !== state().id, revisionChanged = lastRevision !== state().revision;
    projectId = state().id; lastRevision = state().revision;
    select('ddp-crosswalk', records('ddpCrosswalks').map(item => choice(item.id, item.source?.name ?? 'Published crosswalk')));
    select('ddp-package', records('ddpPackages').map(item => choice(item.id,
      (item.release ?? '') + ' · ' + (item.source?.name ?? item.format ?? 'Original package'))));
    select('ddp-migration', records('ddpMigrations').map(item => choice(item.id,item.name ?? item.input?.name ?? 'Saved migration')));
    select('ddp-receiving', records('ddpReceivings').map(item => choice(item.id,records('ddpMigrations').find(plan=>plan.id===item.planId)?.name ?? 'Saved comparison')));
    if (changed) {
      decisions = []; bindings = []; series.clear(); current = null; receiving = null;
      $('ddp-as-of').value = state().selection.asOf;
      $('ddp-start').value = state().selection.start; $('ddp-end').value = state().selection.end;
      const raw = sessionStorage.getItem(key('draft'));
      if (raw) {
        try {
          const draft = JSON.parse(raw);
          for (const id of draftFields) if (typeof draft.fields?.[id] === 'string') {
            if ($(id).tagName !== 'SELECT' || [...$(id).options].some(option => option.value === draft.fields[id]))
              $(id).value = draft.fields[id];
          }
          decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
          bindings = Array.isArray(draft.bindings) ? draft.bindings : [];
        } catch { message('The saved browser selection could not be opened. The original project sources remain available.', true); }
      }
    } else if (revisionChanged && current?.mode === 'preview' && current.value?.revision !== state().revision) {
      serial('migration'); current = null; migrationPage = null;
      $('ddp-migration-status').textContent = 'Project state advanced. Preview the selection against this revision before saving.';
    }
    windowControls(); decisionTables(); sync();
  }

  async function originalFiles(files) {
    const output=[];
    for (const file of files) {
      const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
      output.push({name:file.name,bytes:file.size,sha256:[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')});
    }
    return output;
  }
  async function recoverUpload(saved) {
    const crosswalk=saved.action==='ddp-crosswalk-import', file=$(crosswalk?'ddp-crosswalk-file':'ddp-package-file').files[0];
    const supplements=crosswalk?[]:[...$('ddp-package-supplements').files];
    if (!file || !Array.isArray(saved.uploadFiles)) throw new Error('Select the same original source files, then continue this upload.');
    const fingerprint=await originalFiles([file,...supplements]);
    if (JSON.stringify(fingerprint)!==JSON.stringify(saved.uploadFiles))
      throw new Error('The selected files differ from this original upload. Select its unchanged file set.');
    return {key:uploadKey(saved),request:saved,file,supplements};
  }
  async function uploadStore(mode, record) {
    return new Promise((resolve, reject) => {
      const opened = indexedDB.open('fred-ddp-original-uploads',1);
      opened.onupgradeneeded = () => opened.result.createObjectStore('uploads',{keyPath:'key'});
      opened.onerror = () => reject(opened.error);
      opened.onblocked = () => reject(new Error('The original browser upload store is in use.'));
      opened.onsuccess = () => {
        const db = opened.result, transaction = db.transaction('uploads',mode === 'get' ? 'readonly' : 'readwrite');
        const store = transaction.objectStore('uploads');
        const result = mode === 'get' ? store.get(record) : mode === 'delete' ? store.delete(record) : store.put(record);
        transaction.oncomplete = () => { db.close(); resolve(result.result); };
        transaction.onerror = () => { db.close(); reject(transaction.error); };
        transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('The original upload was not retained.')); };
      };
    });
  }
  async function discardRequest(saved) {
    sessionStorage.removeItem(key('request'));
    if (saved) {
      const entryKey = uploadKey(saved); memoryUploads.delete(entryKey);
      try { await uploadStore('delete',entryKey); } catch {}
    }
  }
  async function transmit(saved) {
    sessionStorage.setItem(key('request'),JSON.stringify(saved));
    try {
      let result;
      if (saved.upload) {
        const entryKey = uploadKey(saved);
        let retained = memoryUploads.get(entryKey);
        if (!retained) { try { retained = await uploadStore('get',entryKey); } catch {} }
        if (!retained) retained = await recoverUpload(saved);
        const form = new FormData();
        const { upload:marker, uploadFiles:fingerprints, ...metadata } = saved;
        form.set('request',JSON.stringify(metadata)); form.set('source',retained.file);
        for (const file of retained.supplements) form.append('supplement',file);
        result = await upload('/api/ddp-import',form);
      } else result = await api('/api/action',saved);
      await discardRequest(saved); await refresh(); return result;
    } catch (error) {
      try {
        await refresh();
        const completed = records('operations').find(item => item.id === saved.id);
        if (completed) { await discardRequest(saved); return completed.result; }
      } catch {}
      throw error;
    }
  }
  async function mutate(action, payload = {}, revision = state().revision) {
    const retained = request();
    if (retained) throw new Error('Continue the retained action before starting another source change.');
    const saved = { action, id: action + '-' + crypto.randomUUID().replaceAll('-',''),
      expectedRevision: revision, ...payload };
    return transmit(saved);
  }
  async function retainUpload(action) {
    if (request()) throw new Error('Continue the retained action before importing another source.');
    const crosswalk = action === 'ddp-crosswalk-import', file = $(crosswalk ? 'ddp-crosswalk-file' : 'ddp-package-file').files[0];
    const supplements = crosswalk ? [] : [...$('ddp-package-supplements').files];
    if (!file) throw new Error('Choose the original source file.');
    const retainedJson = /\.json$/i.test(file.name), total = [file,...supplements].reduce((sum,item)=>sum+item.size,0);
    if ((retainedJson && (file.size > 384*1024*1024 || supplements.length)) || (!retainedJson && total > 256*1024*1024))
      throw new Error('Choose a complete source within its 256 MiB original-file or 384 MiB retained-JSON capacity.');
    let csvLayout = null;
    if (!crosswalk && $('ddp-package-format').value === 'ddp-csv' && $('ddp-csv-layout').value.trim())
      csvLayout = JSON.parse($('ddp-csv-layout').value);
    const saved = { action, id: action + '-' + crypto.randomUUID().replaceAll('-',''),
      expectedRevision: state().revision, receivedAt: new Date().toISOString(), upload: true,
      uploadFiles: await originalFiles([file,...supplements]),
      ...(!crosswalk ? { release:$('ddp-package-release').value, format:$('ddp-package-format').value, csvLayout } : {}) };
    const record = { key:uploadKey(saved), request:saved, file, supplements };
    memoryUploads.set(record.key,record);
    try { await uploadStore('put',record); }
    catch { message('Keep this page open until the original upload finishes; the browser could not retain it across reloads.'); }
    return transmit(saved);
  }

  async function openCrosswalk(offset = 0) {
    const crosswalk = $('ddp-crosswalk').value;
    if (!crosswalk) throw new Error('Choose a retained original crosswalk.');
    const gen = serial('crosswalk');
    const value = await api('/api/ddp-crosswalk?' + new URLSearchParams({ crosswalk, offset, limit:PAGE,
      release:$('ddp-crosswalk-release').value, query:$('ddp-crosswalk-query').value }));
    if (!isCurrent('crosswalk',gen) || crosswalk !== $('ddp-crosswalk').value) return;
    crosswalkPage = value.crosswalk;
    $('ddp-crosswalk-context').textContent = crosswalkPage.total + ' matching rows · ' +
      crosswalkPage.summary.sourceSeriesCount + ' original Board series · ' + (crosswalkPage.source?.name ?? '');
    table('ddp-crosswalk-table',crosswalkPage.rows.map(item=>({ Row:item.row, Release:item.release,
      'Board series':item.boardSeriesId, 'FRED series':item.fredSeriesId, 'Original source row':item.original })));
    sync();
  }
  function sourceSeriesChoices(rows) {
    for (const row of rows) series.set(row.id,row);
    for (const id of ['ddp-observation-series','ddp-decision-series']) {
      const prior = series.get($(id).value), choices = rows.map(item=>[item.id,
        item.boardSeriesId + ' · ' + meaning(item.frequency) + ' · ' + item.title]);
      if (prior && !rows.some(item=>item.id===prior.id))
        choices.unshift([prior.id,prior.boardSeriesId + ' · ' + meaning(prior.frequency) + ' · ' + prior.title]);
      select(id,choices);
    }
  }
  async function openPackage(offset = 0) {
    const packageId = $('ddp-package').value;
    if (!packageId) throw new Error('Choose a retained original package.');
    const gen = serial('package');
    const value = await api('/api/ddp-package?' + new URLSearchParams({ package:packageId, section:'series',
      offset,limit:PAGE,frequency:$('ddp-package-frequency').value,query:$('ddp-package-query').value }));
    if (!isCurrent('package',gen) || packageId !== $('ddp-package').value) return;
    packagePage = value.package;
    select('ddp-package-frequency',[['','All original frequencies'],...(packagePage.frequencies ?? []).map(item=>
      [item.code ?? item.label ?? '',(item.label || item.code || 'Unspecified') + ' · ' + item.count + ' series'])]);
    const summary = packagePage.summary;
    $('ddp-package-context').textContent = packagePage.release + ' · ' + human(packagePage.format) + ' · ' +
      (packagePage.source?.name ?? '') + ' · ' + summary.firstPeriod + ' through ' + summary.lastPeriod;
    metrics('ddp-package-summary',[['Original series',summary.seriesCount],['Original observations',summary.observationCount],
      ['Original datasets',summary.datasetCount],['Matching series',packagePage.total]]);
    sourceSeriesChoices(packagePage.rows);
    table('ddp-package-table',packagePage.rows.map(item=>({ 'Board series':item.boardSeriesId, Title:item.title,
      Frequency:meaning(item.frequency), Units:meaning(item.unit), Multiplier:meaning(item.multiplier),
      Currency:meaning(item.currency), 'Seasonal adjustment':meaning(item.seasonalAdjustment),
      Observations:item.observationCount, 'First period':item.firstPeriod, 'Last period':item.lastPeriod, Dataset:item.datasetId })));
    decisionTables(); await loadDecision(); sync();
  }
  async function openObservationsPage(offset = 0) {
    const packageId = $('ddp-package').value, seriesId = $('ddp-observation-series').value;
    if (!packageId || !seriesId) throw new Error('Choose an original package series from the source table.');
    const gen = serial('observation');
    const value = await api('/api/ddp-package?' + new URLSearchParams({ package:packageId,
      section:'observations',seriesId,offset,limit:PAGE }));
    if (!isCurrent('observation',gen) || packageId !== $('ddp-package').value || seriesId !== $('ddp-observation-series').value) return;
    observationPage = value.package;
    table('ddp-observation-table',observationPage.rows.map(item=>({ 'Board series':item.boardSeriesId,
      Period:item.period, Value:item.value, Status:item.status, 'Original attributes':item.original,
      'Source location':item.location }))); sync();
  }
  async function loadDecision() {
    const selected = selectedSeries(), crosswalkId = $('ddp-crosswalk').value, gen = serial('candidates');
    candidates = []; candidateSource = null;
    if (!selected) { select('ddp-decision-target',[]); sync(); return; }
    const mapped = decisions.find(item=>sourceKey(item)===sourceKey(selected));
    $('ddp-decision-action').value = mapped?.action ?? 'automatic';
    $('ddp-decision-note').value = mapped?.note ?? '';
    const bound = bindings.find(item=>item.seriesId===selected.id);
    $('ddp-binding-period').value = bound?.periodRule ?? '';
    $('ddp-binding-source-scale').value = bound?.sourceScale ?? '1';
    $('ddp-binding-target-scale').value = bound?.targetScale ?? '1';
    $('ddp-binding-units').value = bound?.expectedFredUnits ?? '';
    $('ddp-binding-frequency').value = bound?.expectedFredFrequency ?? '';
    $('ddp-binding-adjustment').value = bound?.expectedFredSeasonalAdjustment ?? '';
    $('ddp-binding-note').value = bound?.note ?? '';
    if (crosswalkId) {
      let offset = 0;
      do {
        const response = await api('/api/ddp-crosswalk?' + new URLSearchParams({ crosswalk:crosswalkId,
          release:selected.release,query:selected.boardSeriesId,offset,limit:500 }));
        if (!isCurrent('candidates',gen) || selected.id !== $('ddp-decision-series').value || crosswalkId !== $('ddp-crosswalk').value) return;
        const page = response.crosswalk;
        for (const row of page.rows) if (row.release===selected.release && row.boardSeriesId===selected.boardSeriesId &&
          row.fredSeriesId && !candidates.includes(row.fredSeriesId)) candidates.push(row.fredSeriesId);
        offset = page.nextOffset;
      } while (offset !== null);
      candidateSource = sourceKey(selected);
    }
    select('ddp-decision-target',candidates.sort().map(id=>[id,id]),mapped?.fredSeriesId);
    sync();
  }
  function keepDecision() {
    const selected = selectedSeries(), action = $('ddp-decision-action').value;
    if (!selected) throw new Error('Choose the original source series.');
    if (action==='automatic') return removeDecision();
    const note = $('ddp-decision-note').value.trim();
    if (!note) throw new Error('Record the reason for this source mapping or exclusion.');
    const value = { release:selected.release,boardSeriesId:selected.boardSeriesId,action,note };
    if (action==='map') {
      const target = $('ddp-decision-target').value;
      if (candidateSource!==sourceKey(selected) || !candidates.includes(target))
        throw new Error('Choose a published target from this original crosswalk.');
      value.fredSeriesId = target;
    }
    decisions = [...decisions.filter(item=>sourceKey(item)!==sourceKey(selected)),value];
    decisionTables(); invalidate();
  }
  function removeDecision() {
    const selected = selectedSeries();
    if (!selected) throw new Error('Choose the original source series.');
    decisions = decisions.filter(item=>sourceKey(item)!==sourceKey(selected));
    $('ddp-decision-action').value = 'automatic'; $('ddp-decision-note').value = '';
    decisionTables(); invalidate();
  }
  function keepBinding() {
    const selected = selectedSeries(), note = $('ddp-binding-note').value.trim();
    if (!selected || !note) throw new Error('Choose the original source series and record the comparison reason.');
    const value = { seriesId:selected.id,periodRule:$('ddp-binding-period').value || null,
      sourceScale:$('ddp-binding-source-scale').value.trim(),targetScale:$('ddp-binding-target-scale').value.trim(),
      expectedFredUnits:$('ddp-binding-units').value.trim() || null,
      expectedFredFrequency:$('ddp-binding-frequency').value.trim() || null,
      expectedFredSeasonalAdjustment:$('ddp-binding-adjustment').value.trim() || null,note };
    bindings = [...bindings.filter(item=>item.seriesId!==selected.id),value];
    decisionTables(); invalidate();
  }
  function removeBinding() {
    const selected = selectedSeries();
    if (!selected) throw new Error('Choose the original source series.');
    bindings = bindings.filter(item=>item.seriesId!==selected.id);
    decisionTables(); invalidate(); return loadDecision();
  }
  function showMigration(value) {
    const page = value.migration; migrationPage = page;
    const summary = page.summary;
    $('ddp-migration-status').textContent = page.input.name + ' · ' + (summary.ready
      ? 'The complete original package selection is ready to acquire.'
      : 'Review the unresolved mapping, period, or empty-window rows before acquisition.');
    metrics('ddp-migration-summary',[['Original series',summary.seriesCount],['Mapped series',summary.mappedCount],
      ['Excluded series',summary.excludedCount],['Selected observations',summary.selectedObservationCount],
      ['Ambiguous mappings',summary.ambiguousCount],['Unmapped series',summary.unmappedCount],
      ['Calendar choices needed',summary.unresolvedPeriodCount],['Original source requests',summary.acquisitionCount]]);
    if (page.section==='mappings') table('ddp-migration-table',page.rows.map(item=>({ Release:item.release,
      'Board series':item.boardSeriesId, Status:human(item.status), 'FRED series':item.fredSeriesId,
      Candidates:item.candidates, 'Original rows':item.sourceRows, 'Retained decision':item.decision })));
    else if (page.section==='acquisitions') table('ddp-migration-table',page.rows.map(item=>({
      'Acquisition identity':item.id, 'FRED series':item.series, 'FRED as of':item.selection.asOf,
      Start:item.selection.start, End:item.selection.end, 'Rows per request':item.selection.pageSize,
      'Combined row capacity':item.selection.maxRows })));
    else table('ddp-migration-table',page.rows.map(item=>({ 'Board series':item.boardSeriesId, Title:item.title,
      'FRED series':item.fredSeriesId, Status:human(item.mappingStatus), 'Selected observations':item.selectedObservationCount,
      Window:item.window, 'Comparison meaning':item.binding, 'Review items':item.issues, Dataset:item.datasetId })));
    sync();
  }
  async function openMigration(offset = 0) {
    if (!current) throw new Error('Preview a migration or open a saved selection.');
    const active = current, gen = serial('migration'), section = $('ddp-migration-section').value;
    const value = active.mode==='preview'
      ? await api('/api/ddp-migration-preview',{ ...active.selection,section,offset,limit:PAGE })
      : await api('/api/ddp-migration?' + new URLSearchParams({ migration:active.migrationId,section,offset,limit:PAGE }));
    if (!isCurrent('migration',gen) || current!==active) return;
    active.value = value; showMigration(value);
  }
  function restoreSelection(page) {
    const input = page.input, previousPackage = $('ddp-package').value;
    $('ddp-package').value = page.packageId; $('ddp-crosswalk').value = page.crosswalkId;
    $('ddp-migration-name').value = input.name; $('ddp-as-of').value = input.asOf;
    $('ddp-date-policy').value = input.window.kind;
    if (input.window.kind==='last') $('ddp-last-count').value = input.window.count;
    if (input.window.kind==='fixed') { $('ddp-start').value=input.window.start; $('ddp-end').value=input.window.end; }
    $('ddp-page-size').value=input.pageSize; $('ddp-max-rows').value=input.maxRows;
    $('ddp-bookmark').value=input.bookmark ?? ''; $('ddp-migration-note').value=input.note ?? '';
    decisions = structuredClone(input.decisions); bindings = structuredClone(input.bindings);
    if (previousPackage!==page.packageId) {
      serial('package'); serial('observation'); serial('candidates'); series.clear(); packagePage=null; observationPage=null;
      select('ddp-observation-series',[]); select('ddp-decision-series',[]);
      select('ddp-package-frequency',[['','All original frequencies']]); $('ddp-package-query').value='';
    }
    windowControls(); decisionTables(); saveDraft();
  }
  async function openSavedMigration() {
    const migrationId=$('ddp-migration').value;
    if (!migrationId) throw new Error('Choose a saved migration.');
    current={mode:'saved',migrationId};
    await openMigration();
    if (current?.mode==='saved' && current.migrationId===migrationId && current.value)
      restoreSelection(current.value.migration);
    sync();
  }
  function renderReceiving() {
    if (!receiving) return;
    const model=receiving, summary=model.summary, meanings=model.meanings ?? [];
    const names = new Map(meanings.map(item=>[item.seriesId,series.get(item.seriesId)?.boardSeriesId ?? item.source?.title ?? item.seriesId]));
    select('ddp-receiving-series',[['','All retained series'],...meanings.map(item=>[item.seriesId,names.get(item.seriesId)])]);
    select('ddp-result-capture',(model.captures ?? []).map(item=>[item.id,
      item.selection.asOf + ' · ' + item.selection.series.join(', ')]));
    $('ddp-receiving-context').textContent = (model.source.package?.name ?? 'Original package') + ' · FRED as of ' +
      model.source.fredAsOf + ' · ' + summary.rowCount + ' complete comparison rows';
    metrics('ddp-receiving-summary',[['Compared values',summary.comparedCount],['Value differences',summary.differentCount],
      ['Missing-value changes',summary.missingChangedCount],['Series meanings to review',summary.meaningReviewSeriesCount],
      ['Source-only rows',summary.sourceOnlyCount],['FRED-only rows',summary.targetOnlyCount]]);
    if ($('ddp-receiving-section').value==='meanings') {
      const filtered=meanings.filter(item=>!$('ddp-receiving-series').value || item.seriesId===$('ddp-receiving-series').value);
      const offset=receivingPage?.section==='meanings' ? receivingPage.offset : 0, rows=filtered.slice(offset,offset+PAGE);
      receivingPage={section:'meanings',offset,limit:PAGE,total:filtered.length,rows,nextOffset:offset+rows.length<filtered.length?offset+rows.length:null};
      table('ddp-receiving-table',rows.map(item=>({ 'Original series':names.get(item.seriesId),
        'Source frequency':meaning(item.source.frequency),'Source units':meaning(item.source.unit),
        'Source multiplier':meaning(item.source.multiplier),'Source currency':meaning(item.source.currency),
        'Source adjustment':meaning(item.source.seasonalAdjustment),'FRED metadata':item.target,
        'Reviewed binding':item.binding,Compatible:item.compatible ? 'Yes':'Review', 'Review items':item.issues })));
    } else {
      receivingPage={...model,section:'observations'};
      table('ddp-receiving-table',model.rows.map(item=>({ 'Board series':item.boardSeriesId,'FRED series':item.fredSeriesId,
        'Original period':item.period,'Comparison period':item.periodKey,Status:human(item.status),
        'Original DDP value':item.source?.value ?? '', 'Original FRED value':item.target?.value ?? '',
        'Raw difference':item.rawDifference,'Compared difference':item.difference,
        'Source details':item.source,'FRED details':item.target })));
    }
    sync();
  }
  async function openReceiving(offset=0) {
    const receivingId=$('ddp-receiving').value;
    if (!receivingId) throw new Error('Choose a saved comparison.');
    if ($('ddp-receiving-section').value==='meanings' && receiving?.id===receivingId) {
      receivingPage={section:'meanings',offset}; renderReceiving(); return;
    }
    const gen=serial('receiving');
    const value=await api('/api/ddp-receiving?' + new URLSearchParams({ receiving:receivingId,offset,
      limit:PAGE,seriesId:$('ddp-receiving-series').value,changesOnly:$('ddp-receiving-changes').checked?'1':'0' }));
    if (!isCurrent('receiving',gen) || receivingId!==$('ddp-receiving').value) return;
    receiving=value.receiving; receivingPage=null; renderReceiving();
  }
  async function showResult(result) {
    if (result.crosswalkId) {
      $('ddp-crosswalk').value=result.crosswalkId; saveDraft(); await openCrosswalk();
      message('The complete original crosswalk is saved with its published rows.');
    } else if (result.packageId) {
      if ($('ddp-package').value!==result.packageId) {decisions=[];bindings=[];}
      $('ddp-package').value=result.packageId; series.clear(); packagePage=null; observationPage=null;
      select('ddp-package-frequency',[['','All original frequencies']]); $('ddp-package-query').value='';
      saveDraft(); await openPackage(); message('The original package and its source dictionaries are saved.');
    } else if (result.receivingId) {
      $('ddp-receiving').value=result.receivingId; receiving=null; receivingPage=null;
      select('ddp-receiving-series',[['','All retained series']]);
      await openReceiving(); message('The complete migration comparison and handover files are saved.');
    } else if (result.migrationId) {
      $('ddp-migration').value=result.migrationId; await openSavedMigration();
      message('The full migration selection is saved. Acquire it to retain and compare its FRED observations.');
    }
    sync();
  }

  function sourceChanged() {
    for (const part of ['package','observation','candidates']) serial(part);
    series.clear(); packagePage=null; observationPage=null; candidates=[]; candidateSource=null;
    decisions=[]; bindings=[];
    select('ddp-observation-series',[]); select('ddp-decision-series',[]); select('ddp-decision-target',[]);
    select('ddp-package-frequency',[['','All original frequencies']]); $('ddp-package-query').value='';
    table('ddp-package-table',[]); table('ddp-observation-table',[]);
    decisionTables(); invalidate();
  }
  bind('ddp-crosswalk-capture',async()=>showResult(await mutate('ddp-crosswalk-capture')));
  bind('ddp-crosswalk-import-form',async()=>showResult(await retainUpload('ddp-crosswalk-import')),'submit');
  bind('ddp-package-import-form',async()=>showResult(await retainUpload('ddp-package-import')),'submit');
  for (const id of ['ddp-crosswalk-file','ddp-package-file']) $(id).addEventListener('change',sync);
  $('ddp-package-format').addEventListener('change',()=>{
    $('ddp-csv-layout-label').hidden=$('ddp-package-format').value!=='ddp-csv';
  });
  $('ddp-crosswalk').addEventListener('change',()=>{
    serial('crosswalk'); serial('candidates'); crosswalkPage=null; candidates=[]; candidateSource=null;
    table('ddp-crosswalk-table',[]); invalidate();
    loadDecision().catch(error=>message(error.message,true));
  });
  $('ddp-package').addEventListener('change',sourceChanged);
  bind('ddp-crosswalk-open',()=>openCrosswalk());
  bind('ddp-crosswalk-prev',()=>openCrosswalk(Math.max(0,(crosswalkPage?.offset??0)-PAGE)));
  bind('ddp-crosswalk-next',()=>crosswalkPage?.nextOffset!==null ? openCrosswalk(crosswalkPage.nextOffset) : undefined);
  bind('ddp-crosswalk-original',()=>download('/api/ddp-crosswalk?' + new URLSearchParams({
    crosswalk:$('ddp-crosswalk').value,original:'1'}),'DDP-FRED-Data-Series-Crosswalk.csv'));
  bind('ddp-crosswalk-download',()=>download('/api/ddp-crosswalk?' + new URLSearchParams({
    crosswalk:$('ddp-crosswalk').value,download:'1'}),'fred-ddp-crosswalk.json'));
  bind('ddp-package-open',()=>openPackage());
  bind('ddp-package-frequency',()=>openPackage(),'change');
  bind('ddp-package-prev',()=>openPackage(Math.max(0,(packagePage?.offset??0)-PAGE)));
  bind('ddp-package-next',()=>packagePage?.nextOffset!==null ? openPackage(packagePage.nextOffset) : undefined);
  bind('ddp-package-original',()=>download('/api/ddp-package?' + new URLSearchParams({
    package:$('ddp-package').value,original:'1'}),'ddp-original-package'));
  bind('ddp-package-download',()=>download('/api/ddp-package?' + new URLSearchParams({
    package:$('ddp-package').value,download:'1'}),'fred-ddp-package.json'));
  $('ddp-observation-series').addEventListener('change',()=>{serial('observation');observationPage=null;sync();});
  bind('ddp-observation-open',()=>openObservationsPage());
  bind('ddp-observation-prev',()=>openObservationsPage(Math.max(0,(observationPage?.offset??0)-PAGE)));
  bind('ddp-observation-next',()=>observationPage?.nextOffset!==null ? openObservationsPage(observationPage.nextOffset) : undefined);
  bind('ddp-decision-series',loadDecision,'change');
  $('ddp-decision-action').addEventListener('change',sync);
  bind('ddp-decision-apply',keepDecision); bind('ddp-decision-remove',removeDecision);
  bind('ddp-binding-apply',keepBinding); bind('ddp-binding-remove',removeBinding);
  $('ddp-migration-form').addEventListener('input',invalidate);
  $('ddp-date-policy').addEventListener('change',()=>{windowControls();invalidate();});
  bind('ddp-migration-form',async()=>{
    const selected=selection();
    current={mode:'preview',selection:structuredClone(selected)}; await openMigration();
  },'submit');
  bind('ddp-migration-save',async()=>{
    if (current?.mode!=='preview' || !current.value || current.value.revision!==state().revision ||
      JSON.stringify(current.selection)!==JSON.stringify(selection()))
      throw new Error('Preview the complete current selection before saving.');
    const active=current;
    await showResult(await mutate('ddp-migration-save',{...active.selection,previewId:active.value.previewId},active.value.revision));
  });
  $('ddp-migration').addEventListener('change',()=>{
    serial('migration');current=null;migrationPage=null;
    $('ddp-migration-status').textContent='Open the saved migration to review its complete source selection.';sync();
  });
  bind('ddp-migration-open',openSavedMigration);
  bind('ddp-migration-section',()=>current?openMigration():undefined,'change');
  bind('ddp-migration-prev',()=>openMigration(Math.max(0,(migrationPage?.offset??0)-PAGE)));
  bind('ddp-migration-next',()=>migrationPage?.nextOffset!==null ? openMigration(migrationPage.nextOffset) : undefined);
  bind('ddp-migration-download',()=>download('/api/ddp-migration?' + new URLSearchParams({
    migration:$('ddp-migration').value,download:'1'}),'fred-ddp-migration.json'));
  bind('ddp-migration-acquire',async()=>{
    if (current?.mode!=='saved' || current.migrationId!==$('ddp-migration').value ||
      !current.value?.migration?.summary?.ready) throw new Error('Open a complete saved migration that is ready to acquire.');
    await showResult(await mutate('ddp-migration-acquire',{migrationId:current.migrationId}));
  });
  $('ddp-receiving').addEventListener('change',()=>{
    serial('receiving');receiving=null;receivingPage=null;
    select('ddp-receiving-series',[['','All retained series']]);select('ddp-result-capture',[]);sync();
  });
  bind('ddp-receiving-open',()=>openReceiving());
  bind('ddp-receiving-section',()=>{receivingPage=null;return $('ddp-receiving').value?openReceiving():undefined;},'change');
  bind('ddp-receiving-series',()=>{receivingPage=null;return openReceiving();},'change');
  bind('ddp-receiving-changes',()=>openReceiving(),'change');
  bind('ddp-receiving-prev',()=>openReceiving(Math.max(0,(receivingPage?.offset??0)-PAGE)));
  bind('ddp-receiving-next',()=>receivingPage?.nextOffset!==null?openReceiving(receivingPage.nextOffset):undefined);
  for (const format of ['html','csv','json']) bind('ddp-receiving-'+format,()=>download('/api/ddp-receiving?' +
    new URLSearchParams({receiving:$('ddp-receiving').value,format}),'fred-ddp-receiving.'+format));
  $('ddp-result-capture').addEventListener('change',sync);
  bind('ddp-open-observations',()=>openObservations($('ddp-result-capture').value));
  bind('ddp-use-release-watch',async()=>{
    const capture=receiving?.captures.find(item=>item.id===$('ddp-result-capture').value);
    if (!capture) throw new Error('Choose a retained FRED source from the completed migration.');
    const saved=records('ddpMigrations').find(item=>item.id===receiving.planId);
    await openReleaseWatch({name:saved?.name??'Migrated DDP reporting selection',series:capture.selection.series,
      observationStart:capture.selection.start,observationEnd:capture.selection.end,baselineAsOf:capture.selection.asOf});
  });
  bind('ddp-export-project',()=>download('/api/bundle','fred-economic-project.json'));
  bind('ddp-resume',async()=>{
    await refresh();
    const saved=request(); if (!saved) throw new Error('No DDP action is retained.');
    const completed=records('operations').find(item=>item.id===saved.id);
    if (completed) {await discardRequest(saved);await showResult(completed.result);return;}
    await showResult(await transmit(saved));
  });
  bind('ddp-discard',async()=>{
    const latest=await api('/api/state');
    if (latest.busy || latest.project.pending) throw new Error('Continue the original project action before clearing this browser request.');
    await discardRequest(request()); await refresh();message('The browser request is cleared and the original project history is available.');
  });
  async function onOpen() {
    if (!state()) return;
    working++;sync();
    try {
      const tasks=[];
      if ($('ddp-crosswalk').value && !crosswalkPage) tasks.push(openCrosswalk());
      if ($('ddp-package').value && !packagePage) tasks.push(openPackage());
      const results=await Promise.allSettled(tasks);
      const failed=results.find(item=>item.status==='rejected');
      if (failed) throw failed.reason;
    } finally {working--;sync();}
  }
  return {onState,onOpen};
}
