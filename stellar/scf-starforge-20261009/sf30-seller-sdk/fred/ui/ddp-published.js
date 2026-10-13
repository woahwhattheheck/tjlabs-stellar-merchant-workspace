// MIT. Current-publication report desk over each retained native operation.
const $ = id => document.getElementById(id);
const labels = {EQUAL:'Equal figures',DIFFERENT:'Different figures',BOTH_MISSING:'Unavailable in both',
  MISSING_CHANGED:'Availability differs',SOURCE_ONLY:'Board periods only',TARGET_ONLY:'FRED periods only'};
const text = value => value === null || value === undefined ? '' : String(value);
export function mountFredDdpPublished({api,table,select,getState,getBusy,refresh,message}) {
  let projectId = null, operation = null, report = null, rowPage = null, inventory = null;
  let working = false, timer = null, generation = 0, history = [], rowsShown = 0;
  const key = () => 'fred-published-request:' + getState().id;
  const visible = () => !document.querySelector('[data-panel="published"]').hidden;
  function saved() {
    const raw = sessionStorage.getItem(key()); if(!raw) return null;
    let value; try { value = JSON.parse(raw); } catch { message('Open the retained edition history to continue the original publication.',true); return null; }
    if(value.action !== 'ddp-published-run' || typeof value.id !== 'string' || typeof value.migrationId !== 'string' ||
      !Number.isSafeInteger(value.expectedRevision)) { message('Open the retained edition history to continue the original publication.',true); return null; }
    return value;
  }
  function sync() {
    const blocked = working || Boolean(getBusy());
    $('published-start').disabled = blocked || !$('published-migration').value;
    $('published-resume').disabled = blocked || !operation && !saved();
    $('published-open').disabled = working || !$('published-operation').value;
    $('published-report-open').disabled = working || operation?.state !== 'COMPLETE';
    $('published-download').disabled = working || !operation?.files.length || !$('published-file').value;
    $('published-inventory-prev').disabled = working || !inventory || inventory.offset === 0;
    $('published-inventory-next').disabled = working || inventory?.nextOffset === null || !inventory;
    $('published-series-prev').disabled = working || !report || report.offset === 0;
    $('published-series-next').disabled = working || report?.nextOffset === null || !report;
    $('published-rows-prev').disabled = working || history.length === 0;
    $('published-rows-next').disabled = working || rowPage?.nextOffset === null || !rowPage;
    $('published-rows-open').disabled = working || !report;
  }
  function bind(id,work,type = 'click') {
    $(id).addEventListener(type,async event => {
      event.preventDefault(); if(working) return;
      working = true; message(); sync();
      try { await work(); } catch(error) { message(error.message,true); }
      finally { working = false; sync(); }
    });
  }
  function renderOperation(value) {
    operation = value;
    $('published-operation-state').textContent = [
      value.state + ' · ' + value.id,
      value.progress?.step ? 'Step: ' + value.progress.step : '',
      value.progress?.series ? 'Series: ' + value.progress.series + ' of ' + value.progress.of : '',
      value.progress?.message ?? '',
      value.result ? 'Retained public observations: ' + value.result.observations.toLocaleString('en-US') +
        ' · Original files: ' + value.result.exactOriginalFiles.toLocaleString('en-US') : '',
      value.result ? 'Collected publication basis: ' + value.result.timeBasis : ''
    ].filter(Boolean).join('\n');
    const files = [...value.files].sort((a,b) => (b.name === 'edition-package.tar.gz') - (a.name === 'edition-package.tar.gz') || a.name.localeCompare(b.name));
    select('published-file',files.map(file => [file.name,file.name + ' · ' + file.bytes.toLocaleString('en-US') + ' bytes']));
    $('published-file-details').textContent = files.find(file => file.name === $('published-file').value)?.sha256 ?? '';
    if(value.state === 'COMPLETE') sessionStorage.removeItem(key());
    schedule(); sync();
  }
  function schedule() {
    clearTimeout(timer); timer = null;
    if(operation?.state !== 'RUNNING' || !visible()) return;
    const selected = operation.id, current = generation;
    timer = setTimeout(async () => {
      if(current !== generation || !visible()) return;
      try {
        const value = await api('/api/ddp-publication?' + new URLSearchParams({operation:selected}));
        if(current !== generation) return;
        renderOperation(value); await refresh();
        if(value.state === 'COMPLETE') { await inventoryPage(inventory?.offset ?? 0,selected); await openReport(0); }
      } catch(error) { message(error.message,true); }
    },5000);
  }
  async function inventoryPage(offset = 0,wanted) {
    const value = await api('/api/ddp-publications?' + new URLSearchParams({offset:String(offset),limit:'100'}));
    inventory = value;
    select('published-operation',value.items.map(item => [item.id,item.createdAt + ' · ' + item.state + ' · ' + item.id]),wanted);
    $('published-inventory-page').textContent = value.total ? (offset + 1) + '–' + (offset + value.items.length) + ' of ' + value.total + ' editions' : 'No retained publication editions.';
    table('published-operation-history',value.items.map(item => ({Operation:item.id,Created:item.createdAt,State:item.state,
      Migration:item.migrationId,Series:item.result?.summary?.seriesCount ?? '',Observations:item.result?.observations ?? '',Step:item.progress ?? ''})));
    sync();
  }
  async function openOperation(id = $('published-operation').value) {
    if(!id) return;
    generation++; report = null; rowPage = null; history = []; rowsShown = 0;
    const current = generation, value = await api('/api/ddp-publication?' + new URLSearchParams({operation:id}));
    if(current !== generation) return;
    renderOperation(value); if(value.state === 'COMPLETE') await openReport(0);
  }
  async function openReport(offset = 0) {
    if(operation?.state !== 'COMPLETE') return;
    const current = generation, value = await api('/api/ddp-publication-report?' + new URLSearchParams({
      operation:operation.id,query:$('published-series-query').value,offset:String(offset),limit:'100'}));
    if(current !== generation) return; report = value;
    $('published-report-context').textContent = value.summary.seriesCount.toLocaleString('en-US') + ' mapped series · ' +
      value.summary.sourceObservationCount.toLocaleString('en-US') + ' Board observations · ' +
      value.summary.targetOriginalObservationCount.toLocaleString('en-US') + ' FRED observations. Collected ' +
      value.targetRetrieval.from + ' through ' + value.targetRetrieval.through + '.';
    table('published-summary',[Object.fromEntries(Object.entries(labels).map(([key,label]) => [label,value.summary.counts[key]]))]);
    table('published-series-table',value.rows.map(item => ({'Board series':item.boardSeriesId,'FRED series':item.fredSeriesId,
      Title:item.title,'Source frequency':item.sourceFrequency?.label ?? item.sourceFrequency?.code,'FRED frequency':item.targetFrequency,
      'Source observations':item.sourceObservationCount,'FRED observations':item.targetOriginalObservationCount,
      Different:item.counts.DIFFERENT,'Availability differs':item.counts.MISSING_CHANGED,'Board only':item.counts.SOURCE_ONLY,
      'FRED only':item.counts.TARGET_ONLY,'Unavailable in both':item.counts.BOTH_MISSING})));
    select('published-row-series',[['','All original series'],...value.rows.map(item => [item.sourceSeriesId,item.boardSeriesId + ' / ' + item.fredSeriesId])]);
    $('published-series-page').textContent = value.total ? (offset + 1) + '–' + (offset + value.rows.length) + ' of ' + value.total + ' matching series' : 'No matching series.';
    sync();
  }
  async function openRows(offset = 0) {
    if(!report) return;
    const current = generation, value = await api('/api/ddp-publication-rows?' + new URLSearchParams({operation:operation.id,
      comparison:report.id,series:$('published-row-series').value,status:$('published-row-status').value,offset:String(offset),limit:'100'}));
    if(current !== generation) return; rowPage = value;
    table('published-row-table',value.rows);
    $('published-row-page').textContent = value.total ? (rowsShown + (value.rows.length ? 1 : 0)) + '–' + (rowsShown + value.rows.length) +
      ' of ' + value.total.toLocaleString('en-US') + ' matching original rows' : 'No original rows have this selected status.';
    const selected = report.rows.find(item => item.sourceSeriesId === $('published-row-series').value);
    table('published-row-meaning',selected ? [{'Board series':selected.boardSeriesId,'FRED series':selected.fredSeriesId,
      'Source units':selected.sourceUnits,'FRED units':selected.targetUnits,'Source multiplier':selected.sourceScale,
      'FRED multiplier':selected.targetScale,'Source calendar':selected.sourcePeriodRule,'FRED calendar':selected.targetPeriodRule,
      'Original unavailable codes':selected.sourceMissingCodes}] : []);
    sync();
  }
  async function start(request) {
    sessionStorage.setItem(key(),JSON.stringify(request)); generation++; report = null; rowPage = null; history = []; rowsShown = 0;
    renderOperation(await api('/api/action',request));
    await refresh(); await inventoryPage(0,request.id);
    message('The complete publication operation is retained. Its original acquisition and report continue on this host.');
  }
  bind('published-start',async () => {
    await refresh();
    await start({action:'ddp-published-run',id:'published-' + crypto.randomUUID().replaceAll('-',''),
      expectedRevision:getState().revision,migrationId:$('published-migration').value});
  });
  bind('published-resume',async () => {
    const request = operation ? {action:'ddp-published-run',id:operation.id,expectedRevision:operation.expectedRevision,migrationId:operation.migrationId} : saved();
    if(request) await start(request);
  });
  bind('published-open',() => openOperation());
  bind('published-refresh',async () => { await refresh(); await inventoryPage(inventory?.offset ?? 0,operation?.id); if(operation) await openOperation(operation.id); });
  bind('published-inventory-prev',() => inventoryPage(Math.max(0,inventory.offset - inventory.limit)));
  bind('published-inventory-next',() => inventoryPage(inventory.nextOffset));
  bind('published-report-open',() => openReport(0));
  bind('published-series-prev',() => openReport(Math.max(0,report.offset - report.limit)));
  bind('published-series-next',() => openReport(report.nextOffset));
  bind('published-rows-open',async () => { history = []; rowsShown = 0; await openRows(0); });
  bind('published-rows-next',async () => { history.push({offset:rowPage.offset,shown:rowsShown}); rowsShown += rowPage.rows.length; await openRows(rowPage.nextOffset); });
  bind('published-rows-prev',async () => { const previous = history.pop(); rowsShown = previous.shown; await openRows(previous.offset); });
  bind('published-download',async () => {
    const file = operation.files.find(item => item.name === $('published-file').value);
    const value = await api('/api/ddp-publication-download-ticket',{id:operation.id,name:file.name,expectedSha256:file.sha256});
    const link = document.createElement('a'); link.href = value.url; link.download = file.name.split('/').at(-1); link.click();
    message('The complete retained file is downloading directly from the original workspace.');
  });
  $('published-file').addEventListener('change',() => {
    $('published-file-details').textContent = operation?.files.find(file => file.name === $('published-file').value)?.sha256 ?? ''; sync();
  });
  for(const id of ['published-row-series','published-row-status']) $(id).addEventListener('change',() => { rowPage = null; history = []; rowsShown = 0; sync(); });
  document.addEventListener('visibilitychange',() => { if(document.hidden) clearTimeout(timer); else schedule(); });
  function onState() {
    const state = getState(); if(!state) return;
    if(projectId !== state.id) { projectId = state.id; generation++; clearTimeout(timer); operation = null; report = null; inventory = null; rowPage = null; history = []; }
    select('published-migration',(state.ddpMigrations ?? []).filter(item => item.summary.ready).map(item => [item.id,item.name ?? item.input?.name ?? item.id]));
    sync();
  }
  return {onState,async onOpen() { await inventoryPage(0,operation?.id); if(operation) await openOperation(operation.id);
    else { const original = saved(); if(original) { try { await openOperation(original.id); } catch(error) { if(error.status !== 404) throw error; } }
      else if($('published-operation').value) await openOperation(); } schedule(); }};
}
