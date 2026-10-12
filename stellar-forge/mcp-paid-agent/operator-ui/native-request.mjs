/** MIT. Native HTTP request desk for the original SF43/SF88 buyer workspace. */
const TOOL = 'sf43_discover_review_and_pay';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value);
const bytesOf = value => new TextEncoder().encode(value);
const objectJSON = (text, label) => {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error(label + ' must be valid JSON.'); }
  if (!plain(value)) throw new Error(label + ' must be a JSON object.');
  return value;
};
function queryInput(text) {
  const value = objectJSON(text, 'Query values');
  for (const [key, item] of Object.entries(value)) {
    if (!key || typeof item !== 'string' && !(Array.isArray(item) && item.length && item.every(part => typeof part === 'string')))
      throw new Error('Query field ' + key + ' must contain a string or a nonempty array of strings.');
  }
  return value;
}
function exactText(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('The request body contains an incomplete Unicode character.');
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error('The request body contains an incomplete Unicode character.');
  }
  return value;
}
function requestBytes(args) {
  return bytesOf(JSON.stringify({jsonrpc:'2.0', id:Number.MAX_SAFE_INTEGER, method:'tools/call',
    params:{name:TOOL, arguments:args}})).length;
}
function intentName() { return 'http-' + crypto.randomUUID(); }

/** Uses the existing authenticated browser client; no token or signer is retained here. */
export function createNativeRequestDesk({client, ui, onView}) {
  const {node, table, facts, badge, detail, empty, pre, url, download, renderRecords, errorText, notice} = ui;
  const state = {generation:0, connected:false, workspace:null, workspacePromise:null, workspaceError:null,
    offers:new Set(), history:[], historyCursor:null, historyRead:0, historyLoaded:false, historySeen:new Set(),
    current:null, selection:0, reviewRead:0, reading:0, file:null, busy:new Map(),
    uncertain:new Set(), preparations:new Map(), urls:new Set()};
  const root = () => document.getElementById('native-requests');
  const current = generation => state.connected && generation === state.generation;
  const message = (text, error = false) => {
    notice(text, error);
    const target = document.getElementById('native-notice');
    if (target) { target.textContent = text; target.classList.toggle('error', error); }
  };
  const size = value => Number.isSafeInteger(value) ? value.toLocaleString() + ' bytes' : '—';
  const stamp = value => typeof value === 'number' ? new Date(value).toLocaleString() : value ?? '—';
  function button(label, action, {disabled = false, primary = false, ...attributes} = {}) {
    const element = node('button', {type:'button', text:label, className:primary ? 'primary' : '', ...attributes});
    element.disabled = disabled;
    element.addEventListener('click', async () => {
      const generation = state.generation;
      element.disabled = true;
      try { await action(); }
      catch (error) { if (current(generation)) message(errorText(error), true); }
      finally { if (element.isConnected && current(generation)) element.disabled = disabled; }
    });
    return element;
  }
  function call(args) { return client.call(TOOL, args); }
  function revoke() { for (const href of state.urls) URL.revokeObjectURL(href); state.urls.clear(); }
  function reset() {
    state.generation++; state.connected = false; state.workspace = null; state.workspacePromise = null;
    state.workspaceError = null; state.history = []; state.historyCursor = null; state.historyLoaded = false;
    state.historySeen.clear(); state.historyTotal = null;
    state.current = null; state.file = null; state.selection++; state.reviewRead++; state.reading++; state.historyRead++;
    state.offers.clear(); state.busy.clear(); state.uncertain.clear(); state.preparations.clear(); revoke();
    root()?.replaceChildren(empty('Connect to the buyer workspace to open its native HTTP requests.'));
  }
  function mount() {
    root().replaceChildren(
      node('section', {id:'native-workspace', className:'panel'}),
      node('output', {id:'native-notice', className:'notice', role:'status', 'aria-live':'polite'}),
      node('section', {id:'native-history', className:'panel'}),
      node('section', {id:'native-selected', className:'panel native-request', hidden:true, 'aria-label':'Selected native request'}),
      node('section', {id:'native-file', className:'panel native-request', hidden:true, 'aria-label':'Complete native HTTP response'}));
    renderWorkspace(); renderHistory();
  }
  function connected() {
    state.connected = true; mount();
    ensureWorkspace().catch(() => {});
  }
  async function ensureWorkspace(refresh = false) {
    if (!state.connected) throw new Error('Connect to this buyer workspace first.');
    if (!client.tools.has(TOOL)) {
      const error = new Error('This running workspace does not expose the native HTTP buyer.');
      state.workspaceError = error; renderWorkspace(); throw error;
    }
    if (state.workspace && !refresh) return state.workspace;
    if (state.workspacePromise) return state.workspacePromise;
    const generation = state.generation;
    const promise = (async () => {
      try {
        const result = await call({action:'request-workspace'});
        if (!current(generation)) return null;
        if (result.schema !== 'stellar-forge.mcp-native-request-workspace.v1' ||
            result.available !== true || !plain(result.route) || !plain(result.payment) ||
            !plain(result.limits) || !Array.isArray(result.actions))
          throw new Error(result.reason ?? result.message ?? 'The native request workspace is unavailable on this server.');
        state.workspace = result; state.workspaceError = null; renderWorkspace();
        return result;
      } catch (error) {
        if (current(generation)) { state.workspaceError = error; renderWorkspace(); }
        throw error;
      } finally { if (current(generation) && state.workspacePromise === promise) state.workspacePromise = null; }
    })();
    state.workspacePromise = promise;
    return promise;
  }
  function renderWorkspace() {
    const target = document.getElementById('native-workspace'); if (!target) return;
    const value = state.workspace;
    if (!value) {
      target.replaceChildren(node('h3', {text:'Native request workspace'}),
        state.workspaceError ? node('p', {className:'notice error', text:errorText(state.workspaceError)})
          : empty('Reading the configured native route…'),
        ...(state.workspaceError && client.tools.has(TOOL) ? [button('Read workspace configuration', () => ensureWorkspace(true))] : []));
      return;
    }
    target.replaceChildren(node('div', {className:'detail-heading'}, [
      node('div', {}, [node('h3', {text:'Configured HTTP route'}),
        node('p', {text:'Requests use this operator configuration and its original approval gate.'})]),
      badge('NATIVE WORKSPACE')]),
      facts([['Method', value.route.method], ['Resource', value.route.origin + value.route.pathname],
        ['Content-Type', value.route.contentType], ['Network', value.payment.network],
        ['Asset', value.payment.asset], ['Recipient', value.payment.payTo], ['Workspace ceiling', value.payment.maxAtomic]]),
      detail('Workspace limits and available actions', {limits:value.limits, actions:value.actions}));
  }
  function routeError(value, workspace, paymentIndex) {
    let selected;
    try { selected = new URL(value.resource.url); } catch { return 'The selected resource has no usable HTTP URL.'; }
    if (Number.isSafeInteger(value.source?.pageBytes) && value.source.pageBytes > workspace.limits.sourcePageBytes)
      return 'The complete original provider page exceeds the native source-page limit. Explore with a smaller provider page size, then select the original offer again.';
    const route = workspace.route, method = value.preview.method;
    if (selected.origin !== route.origin || selected.pathname !== route.pathname || method !== route.method)
      return 'This native workspace is configured for ' + route.method + ' ' + route.origin + route.pathname + '.';
    const choice = value.accepts[paymentIndex], terms = workspace.payment;
    if (!choice || ['scheme','network','asset','payTo'].some(key => choice[key] !== terms[key]))
      return 'Select a payment option matching the native workspace network, asset, recipient, and scheme.';
    if (!positive(choice.amount)) return 'The selected native paid request requires a positive original amount.';
    if (!positive(terms.maxAtomic) || BigInt(choice.amount) > BigInt(terms.maxAtomic))
      return 'The selected amount exceeds this native workspace’s configured ceiling.';
    return null;
  }
  function offer(value, isCurrent) {
    const target = node('section', {className:'content-block native-heading', 'aria-label':'Prepare native HTTP request'});
    const generation = state.generation;
    target.append(node('h3', {text:'Save a native HTTP request'}), empty('Reading the native workspace configuration…'));
    ensureWorkspace().then(workspace => {
      if (!workspace || !current(generation) || !isCurrent()) return;
      renderOffer(target, value, workspace, isCurrent, generation);
    }).catch(error => {
      if (!current(generation) || !isCurrent()) return;
      target.replaceChildren(node('h3', {text:'Native HTTP request'}),
        node('p', {className:'field-note', text:errorText(error)}));
    });
    return target;
  }
  function renderOffer(target, value, workspace, isCurrent, generation) {
    let revision = 0, submission = null;
    const method = value.preview.method, bodyAllowed = !['GET','HEAD'].includes(method);
    const options = node('select', {'aria-label':'Native payment option'}, value.accepts.map((item, index) =>
      node('option', {value:index, text:(index + 1) + ' · ' + item.amount + ' ' + item.asset + ' · ' + item.network})));
    const maximum = node('input', {type:'text', inputmode:'numeric', required:true, pattern:'[1-9][0-9]*',
      'aria-label':'Maximum native payment in base units', autocomplete:'off', spellcheck:'false'});
    maximum.value = value.accepts[0]?.amount ?? '';
    const query = node('textarea', {spellcheck:'false', 'aria-label':'Native HTTP query values JSON'}); query.value = '{}';
    const bodyMode = node('select', {'aria-label':'Request body'}, [
      node('option', {value:'none', text:'No request body'}),
      ...(bodyAllowed ? [node('option', {value:'text', text:'Explicit UTF-8 text'})] : []),
    ]);
    const body = node('textarea', {className:'native-body', spellcheck:'false', 'aria-label':'Exact UTF-8 request body'});
    const bodyLabel = node('label', {text:'Exact UTF-8 body', hidden:true}, [body]);
    const byteCount = node('p', {className:'field-note'});
    const selectedTerms = node('div'), eligibility = node('p', {className:'field-note'});
    const pending = node('div'), saved = node('div');
    const submit = node('button', {type:'submit', className:'primary', text:'Save native request'});
    const controls = node('fieldset', {}, [
      node('legend', {text:'Original request inputs'}),
      node('div', {className:'detail-grid'}, [
        node('label', {text:'Original payment option'}, [options]),
        node('label', {text:'Maximum payment in original asset base units'}, [maximum]),
      ]),
      selectedTerms,
      node('label', {text:'Query values (JSON object)'}, [query]),
      node('p', {className:'field-note', text:'Use explicit strings or nonempty arrays of strings. The published query encoding applies; unselected fixed URL values remain intact.'}),
      node('label', {text:'Request body'}, [bodyMode]), bodyLabel, byteCount,
      node('p', {className:'field-note', text:'Content-Type is supplied by the configured native workspace: ' + (workspace.route.contentType ?? 'none') + '.'}),
      eligibility, submit,
    ]);
    const form = node('form', {className:'native-form'}, [controls, pending, saved]);
    function update() {
      revision++; bodyLabel.hidden = bodyMode.value !== 'text';
      byteCount.textContent = bodyMode.value === 'text' ? size(bytesOf(body.value).length) +
        ' entered · Body limit ' + size(workspace.limits.bodyBytes) + ' · Encoded request limit ' +
        size(workspace.limits.toolRequestBytes) : 'The saved request will have no body.';
      selectedTerms.replaceChildren(facts(Object.entries(value.accepts[Number(options.value)] ?? {})));
      const why = routeError(value, workspace, Number(options.value));
      eligibility.textContent = why ?? 'The selected offer matches this native workspace.';
      eligibility.classList.toggle('error', Boolean(why));
      submit.disabled = Boolean(why) || !workspace.actions.includes('request-prepare');
    }
    for (const element of [maximum, query, body]) element.addEventListener('input', update);
    options.addEventListener('change', update); bodyMode.addEventListener('change', update); update();
    target.replaceChildren(node('h3', {text:'Save a native HTTP request'}),
      node('p', {text:'Save the selected original offer and exact request in the native inbox. Continue its approval, execution, and result from HTTP requests.'}),
      facts([['Method', method], ['Source resource', value.resource.url]]),
      detail('Advertised HTTP body and request schema', {input:value.bazaar.info?.input, schema:value.bazaar.schema}),
      form);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!current(generation) || !isCurrent()) { message('Inspect the selected resource again before saving its request.', true); return; }
      if (controls.disabled) return;
      try {
        const acceptIndex = Number(options.value), routeFailure = routeError(value, workspace, acceptIndex);
        if (routeFailure) throw new Error(routeFailure);
        const maxAtomic = maximum.value;
        if (!positive(maxAtomic)) throw new Error('Enter a positive integer maximum in the asset’s original base units.');
        if (BigInt(maxAtomic) < BigInt(value.accepts[acceptIndex].amount))
          throw new Error('The maximum must cover the selected original amount.');
        if (BigInt(maxAtomic) > BigInt(workspace.payment.maxAtomic))
          throw new Error('The maximum exceeds this native workspace’s configured ceiling.');
        const input = {query:queryInput(query.value)};
        if (bodyMode.value === 'text') {
          input.body = exactText(body.value);
          if (bytesOf(input.body).length > workspace.limits.bodyBytes) throw new Error('The complete body exceeds the native workspace body limit.');
        }
        const selection = {handle:value.handle, acceptIndex, maxAtomic, input};
        const key = JSON.stringify(selection);
        if (!submission || submission.key !== key) submission = {key, intentId:intentName()};
        const args = {action:'request-prepare', intentId:submission.intentId, ...selection};
        if (requestBytes(args) > workspace.limits.toolRequestBytes)
          throw new Error('The complete encoded request exceeds the server’s ' + size(workspace.limits.toolRequestBytes) + ' limit. Shorten this request body or query before saving.');
        const intentId = submission.intentId, selectedRevision = revision, requestSelection = state.selection;
        state.preparations.set(intentId, {intentId, arguments:structuredClone(args), state:'PREPARING'});
        pending.replaceChildren(node('p', {className:'native-pending', text:'Saving request ' + intentId + '…'}));
        controls.disabled = true;
        let result;
        try {
          result = await call(args);
        } catch (error) {
          if (current(generation)) {
            state.preparations.set(intentId, {intentId, arguments:structuredClone(args), state:'REOPEN', error});
            pending.replaceChildren(node('p', {className:'native-pending', text:'Keep original request ' + intentId + '. Reopen it to inspect any completed save, or submit the same inputs to retry the same preparation.'}),
              button('Reopen original request', () => openIntent(intentId)));
          }
          throw error;
        } finally { if (current(generation) && controls.isConnected) controls.disabled = false; }
        if (!current(generation)) return;
        state.preparations.delete(intentId);
        pending.replaceChildren();
        saved.replaceChildren(node('p', {text:'Native request saved: ' + intentId}),
          button('Open saved native request', () => openIntent(intentId)),
          detail('Original native preparation', result));
        state.historyLoaded = false;
        if (isCurrent() && revision === selectedRevision && state.selection === requestSelection) {
          await openIntent(intentId); onView();
        } else message('Native request ' + intentId + ' was saved with the submitted inputs. Open it in HTTP requests.');
      } catch (error) { if (current(generation)) message(errorText(error), true); }
    });
  }

  // Original native history, request review, action, and complete-result views follow.

  function validView(value, intentId) {
    if (!plain(value) || value.schema !== 'stellar-forge.mcp-native-buyer.v1' ||
        value.intentId !== intentId || !plain(value.request) || typeof value.state !== 'string')
      throw new Error('The native response does not match the selected original request.');
    return value;
  }
  function renderHistory() {
    const target = document.getElementById('native-history'); if (!target) return;
    const id = node('input', {type:'text', required:true, maxlength:128,
      pattern:'[A-Za-z0-9._:\\-]{1,128}', 'aria-label':'Original native intent ID', placeholder:'Original request ID'});
    const opener = node('form', {className:'native-controls'}, [
      node('label', {text:'Reopen an original request'}, [id]),
      node('button', {type:'submit', text:'Open request'}),
      button('Refresh requests', () => loadHistory(false)),
    ]);
    opener.addEventListener('submit', event => {
      event.preventDefault(); const generation = state.generation;
      openIntent(id.value).catch(error => { if (current(generation)) message(errorText(error), true); });
    });
    const rows = state.history.map(view => [
      button(view.intentId, () => openIntent(view.intentId), {class:'linklike'}),
      view.request?.method, node('span', {className:'mono', text:view.request?.url}),
      badge(view.state), view.request?.expected?.maxAtomic ?? '—', stamp(view.createdAt),
      button('Open original request', () => openIntent(view.intentId)),
    ]);
    const pages = node('div', {className:'pager'}, [
      node('span', {text:state.history.length + (Number.isSafeInteger(state.historyTotal) ? ' of ' + state.historyTotal : '') + ' native requests loaded'}),
      ...(state.historyCursor ? [button('Load more native requests', () => loadHistory(true))] : []),
    ]);
    const pending = [...state.preparations.values()].map(item => node('div', {className:'native-pending'}, [
      node('p', {text:(item.state === 'PREPARING' ? 'Preparation in progress: ' : 'Reopen original preparation: ') + item.intentId}),
      button('Open original request', () => openIntent(item.intentId)),
    ]));
    target.replaceChildren(node('h3', {text:'Saved native requests'}), opener, ...pending,
      rows.length ? table(['Request','Method','Resource','State','Maximum','Created',''], rows)
        : empty(state.historyLoaded ? 'This native inbox has no saved HTTP requests.' : 'Refresh requests to read the original native inbox.'),
      pages);
  }
  async function loadHistory(more = false) {
    const generation = state.generation, workspace = await ensureWorkspace();
    if (!current(generation) || !workspace) return;
    if (!workspace.actions.includes('history')) throw new Error('Native history is unavailable in this workspace.');
    if (more && !state.historyCursor) return;
    const sequence = ++state.historyRead;
    const cursor = more ? state.historyCursor : null;
    const value = await call({action:'history', limit:25, ...(cursor ? {cursor} : {})});
    if (!current(generation) || sequence !== state.historyRead) return;
    if (!Array.isArray(value.records) || !Number.isSafeInteger(value.total) || value.total < 0 ||
        value.records.some(item => !plain(item) || typeof item.intentId !== 'string' || !plain(item.request)) ||
        value.nextCursor !== null && typeof value.nextCursor !== 'string')
      throw new Error('The native inbox returned an incomplete request page.');
    if (!more) state.historySeen.clear();
    if (cursor) state.historySeen.add(cursor);
    if (value.nextCursor && state.historySeen.has(value.nextCursor)) throw new Error('The native inbox repeated an already loaded history cursor.');
    state.history = more ? [...state.history, ...value.records] : value.records;
    state.historyTotal = value.total; state.historyCursor = value.nextCursor; state.historyLoaded = true;
    renderHistory();
  }
  async function open() {
    const generation = state.generation;
    const workspace = await ensureWorkspace();
    if (current(generation) && workspace && !state.historyLoaded) await loadHistory(false);
  }
  async function openIntent(intentId) {
    if (typeof intentId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(intentId))
      throw new Error('Enter the original native request ID.');
    const generation = state.generation, workspace = await ensureWorkspace();
    if (!current(generation) || !workspace) return;
    const selection = ++state.selection, sequence = ++state.reviewRead;
    state.current = {intentId, value:null, error:null}; state.file = null; state.reading++; revoke();
    document.getElementById('native-file').hidden = true;
    renderRequest(); onView();
    try {
      const value = validView(await call({action:'request-review', intentId}), intentId);
      if (!current(generation) || selection !== state.selection || sequence !== state.reviewRead) return;
      state.current = {intentId, value, error:null};
      if (value.state !== 'RUNNING_OR_INTERRUPTED') state.uncertain.delete(intentId);
      state.preparations.delete(intentId); renderRequest(); renderHistory();
      document.getElementById('native-selected').scrollIntoView({behavior:'smooth', block:'start'});
      message('Opened native request ' + intentId + '.');
      if (!state.historyLoaded) {
        try { await loadHistory(false); }
        catch (error) { if (current(generation)) message('Request opened. ' + errorText(error), true); }
      }
    } catch (error) {
      if (!current(generation) || selection !== state.selection || sequence !== state.reviewRead) return;
      state.current.error = error; renderRequest(); throw error;
    }
  }
  async function refreshRequest(intentId) {
    const generation = state.generation, selection = state.selection, sequence = ++state.reviewRead;
    const value = validView(await call({action:'request-review', intentId}), intentId);
    if (!current(generation) || selection !== state.selection || sequence !== state.reviewRead || state.current?.intentId !== intentId) return value;
    state.current = {intentId, value, error:null};
    if (value.state !== 'RUNNING_OR_INTERRUPTED') state.uncertain.delete(intentId);
    renderRequest(); return value;
  }
  function renderRequest() {
    const target = document.getElementById('native-selected'), selected = state.current;
    if (!target || !selected) return;
    target.hidden = false;
    const value = selected.value;
    if (!value) {
      target.replaceChildren(node('h3', {text:'Original native request'}), node('p', {className:'mono', text:selected.intentId}),
        selected.error ? node('p', {className:'notice error', text:errorText(selected.error)}) : empty('Opening the saved native request…'),
        ...(selected.error ? [button('Reopen this request', () => openIntent(selected.intentId))] : []));
      return;
    }
    const request = value.request, preparation = value.preparation, actions = new Set(value.availableActions ?? []);
    const inFlight = state.busy.get(value.intentId), busy = Boolean(inFlight?.size), uncertain = state.uncertain.has(value.intentId);
    const controls = node('div', {className:'actions'}, [
      button('Refresh saved request', () => refreshRequest(value.intentId)),
    ]);
    if (actions.has('execute')) controls.append(button('Request host approval and execute', () => action('execute', value.intentId),
      {primary:true, disabled:busy || uncertain}));
    if (actions.has('cancel')) controls.append(button('Cancel native request', () => action('cancel', value.intentId),
      {disabled:inFlight?.has('cancel') || busy && !inFlight?.has('execute')}));
    if (actions.has('recover')) controls.append(button('Recover original request', () => action('recover', value.intentId), {disabled:busy}));
    if (actions.has('read')) controls.append(button('Read complete response', () => readResult(value.intentId), {disabled:busy}));
    const source = preparation ? node('div', {}, [
      node('h4', {text:'Original discovered offer'}),
      facts([['Provider page SHA256', preparation.pageSha256], ['Provider row index', preparation.rowIndex],
        ['Original payment option index', preparation.acceptIndex]]),
      detail('Discovery source and original listing', {source:preparation.source, originalListing:preparation.originalListing}),
      detail('Selected original payment terms', preparation.accepted),
    ]) : empty('The original request has no discovery preparation attached.');
    const body = preparation?.body;
    const requestBody = body === null ? empty('The original request has no body.') :
      body && typeof body.text === 'string' ? node('div', {}, [
        facts([['Content-Type', body.contentType], ['Exact UTF-8 bytes', body.bytes], ['Body SHA256', body.sha256]]),
        pre(body.text),
        button('Download original request body', () => download(bytesOf(body.text), value.intentId + '-request.txt', body.contentType ?? 'text/plain;charset=utf-8')),
      ]) : empty('Open the complete prepared request to read its retained body.');
    target.replaceChildren(node('div', {className:'detail-heading'}, [
      node('div', {}, [node('h2', {text:'Native HTTP request'}), node('p', {className:'mono', text:value.intentId})]),
      badge(value.state)]),
      facts([['Method', request.method], ['URL', request.url], ['Created', value.createdAt],
        ['Request body bytes', request.bodyBytes], ['Request body SHA256', request.bodySha256]]),
      detail('Original request and configured payment bounds', request),
      controls,
      ...(busy ? [node('p', {className:'native-pending', text:'The original native action is in progress. Its saved request ID remains ' + value.intentId + '.'})] : []),
      ...(uncertain ? [node('p', {className:'native-pending', text:'The last action response was interrupted. Refresh this saved request to read the original native outcome.'})] : []),
      node('p', {className:'field-note', text:'Execution uses the host’s original approval prompt and native request queue. Status and recovery continue this same saved intent.'}),
      node('div', {className:'detail-grid'}, [source, node('div', {}, [node('h4', {text:'Saved request body'}), requestBody])]),
      detail('Original native execution and recovery', {
        attempt:value.attempt, originalBuyer:value.originalBuyer, originalRecovery:value.originalRecovery,
        lastError:value.lastError, retry:value.retry,
      }),
      detail('Complete native request view', value));
  }
  async function action(name, intentId) {
    let inFlight = state.busy.get(intentId);
    if (inFlight?.has(name) || inFlight?.size && !(name === 'cancel' && inFlight.has('execute'))) return;
    const selection = state.selection, generation = state.generation;
    if (state.current?.intentId !== intentId || !state.current.value?.availableActions?.includes(name))
      throw new Error('Refresh this original request before choosing its next native action.');
    if (!inFlight) { inFlight = new Set(); state.busy.set(intentId, inFlight); }
    inFlight.add(name); renderRequest();
    message((name === 'execute' ? 'Requesting host approval for ' : name === 'recover' ? 'Recovering ' : 'Cancelling ') + intentId + '…');
    let operationError;
    try {
      const result = validView(await call({action:name, intentId}), intentId);
      if (!current(generation)) return;
      state.uncertain.delete(intentId); state.historyLoaded = false;
      const prior = state.current?.intentId === intentId ? state.current.value : null;
      if (prior && selection === state.selection) state.current.value = {...prior, ...result};
    } catch (error) {
      if (!current(generation)) return;
      operationError = error; state.uncertain.add(intentId);
    } finally {
      if (current(generation)) {
        inFlight.delete(name);
        if (!inFlight.size && state.busy.get(intentId) === inFlight) state.busy.delete(intentId);
        if (selection === state.selection && state.current?.intentId === intentId) {
          try { await refreshRequest(intentId); }
          catch (error) { operationError ??= error; renderRequest(); }
        }
      }
    }
    if (!current(generation)) return;
    if (operationError) message(errorText(operationError) + ' Original request: ' + intentId + '.', true);
    else message('Updated original native request ' + intentId + '.');
  }
  async function readResult(intentId) {
    if (state.current?.intentId !== intentId || !state.current.value?.availableActions?.includes('read'))
      throw new Error('Open an original request with a saved response first.');
    const generation = state.generation, selection = state.selection;
    const workspace = await ensureWorkspace();
    if (!current(generation) || !workspace || selection !== state.selection || state.current?.intentId !== intentId) return;
    const sequence = ++state.reading;
    const target = document.getElementById('native-file'), progress = node('p', {className:'field-note'});
    let stopped = false;
    target.hidden = false;
    target.replaceChildren(node('h3', {text:'Reading complete native response'}), node('p', {className:'mono', text:intentId}),
      progress, button('Stop reading', () => { stopped = true; progress.textContent = 'Reading stopped. The original response remains in the native workspace.'; }));
    target.scrollIntoView({behavior:'smooth', block:'start'});
    const active = () => current(generation) && selection === state.selection && sequence === state.reading && !stopped;
    let offset = 0, whole, identity, metadata;
    try {
      for (;;) {
        if (!active()) return;
        const page = await call({action:'read', intentId, byteOffset:offset, maxBytes:65536});
        if (!active()) return;
        const value = page.result;
        if (page.schema !== 'stellar-forge.mcp-native-buyer.v1' || page.intentId !== intentId ||
            !['QUEUED','RUNNING_OR_INTERRUPTED','ATTEMPT_RECORDED','RECOVERED','CANCELLED'].includes(page.state) ||
            !plain(value) || value.verifiedSavedFile !== true ||
            value.encoding !== 'base64' || value.byteOffset !== offset || typeof value.data !== 'string' ||
            !Number.isSafeInteger(value.bytes) || value.bytes < 0 ||
            !Number.isSafeInteger(value.returnedBytes) || value.returnedBytes < 0 || value.returnedBytes > 65536 ||
            !/^[a-f0-9]{64}$/.test(value.sha256))
          throw new Error('The saved response range does not match this original native request.');
        if (Number.isSafeInteger(workspace.limits.responseBytes) && value.bytes > workspace.limits.responseBytes)
          throw new Error('The saved response exceeds this native workspace’s configured response limit.');
        const bound = JSON.stringify([value.bytes, value.sha256, value.contentType]);
        if (identity !== undefined && identity !== bound) throw new Error('The original response identity changed during this read.');
        if (identity === undefined) {
          identity = bound;
          try { whole = new Uint8Array(value.bytes); }
          catch { throw new Error('This browser cannot allocate the complete response. Its original saved file remains available through the native client.'); }
        }
        let chunk;
        try {
          const decoded = atob(value.data);
          if (btoa(decoded) !== value.data) throw new Error('Noncanonical base64');
          chunk = Uint8Array.from(decoded, character => character.charCodeAt(0));
        } catch { throw new Error('The native response range contains invalid or noncanonical base64.'); }
        if (value.returnedBytes !== Math.min(65536, value.bytes - offset) || chunk.length !== value.returnedBytes || offset + chunk.length > value.bytes)
          throw new Error('The saved response range is incomplete.');
        whole.set(chunk, offset); offset += chunk.length; metadata = value;
        progress.textContent = size(offset) + ' of ' + size(value.bytes) + ' received.';
        if (value.nextByteOffset === null) {
          if (offset !== value.bytes) throw new Error('The complete native response ended before all bytes arrived.');
          break;
        }
        if (!chunk.length || value.nextByteOffset !== offset) throw new Error('The native response did not continue at the original next byte.');
      }
      if (!active()) return;
      progress.textContent = 'Checking the complete response against its saved SHA256…';
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', whole))]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      if (!active()) return;
      if (digest !== metadata.sha256) throw new Error('The complete response does not match its saved SHA256.');
      state.file = {intentId, bytes:whole, metadata}; renderFile(); message('Complete native response opened for ' + intentId + '.');
    } catch (error) {
      if (!active()) return;
      target.replaceChildren(node('h3', {text:'Complete response read interrupted'}),
        node('p', {className:'notice error', text:errorText(error)}),
        button('Read the original saved response again', () => readResult(intentId)));
      throw error;
    }
  }
  function renderFile() {
    const file = state.file, target = document.getElementById('native-file');
    if (!file || !target) return;
    revoke(); target.hidden = false;
    const mime = typeof file.metadata.contentType === 'string' ? file.metadata.contentType : 'application/octet-stream';
    let text = null, structured, structuredError = null;
    try { text = new TextDecoder('utf-8', {fatal:true}).decode(file.bytes); } catch {}
    if (text !== null && (/^application\/(?:[a-z0-9.+-]+\+)?json(?:;|$)/i.test(mime) || /^\s*[\[{]/.test(text))) {
      try {
        structured = JSON.parse(text, (_key, value) => {
          if (typeof value === 'number' && (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)))
            throw new Error('This JSON contains numbers that cannot be displayed exactly as JavaScript numbers. Read or download the original response text.');
          return value;
        });
      } catch (error) { structuredError = error; }
    }
    const body = node('div'), tabs = node('div', {className:'subtabs', role:'tablist', 'aria-label':'Native HTTP response views'});
    const choices = [...(structured !== undefined ? [['structured','Structured data']] : []),
      ...(text !== null ? [['text','Original response text']] : []), ['metadata','Original file']];
    function show(kind) {
      for (const tab of tabs.children) tab.setAttribute('aria-selected', String(tab.dataset.kind === kind));
      if (kind === 'structured') body.replaceChildren(renderRecords(structured));
      else if (kind === 'text') body.replaceChildren(pre(text));
      else body.replaceChildren(facts([['Content-Type', mime], ['Bytes', file.bytes.length], ['SHA256', file.metadata.sha256]]),
        detail('Verified native file metadata', file.metadata));
    }
    for (const [kind, label] of choices) tabs.append(button(label, () => show(kind), {role:'tab', 'data-kind':kind, 'aria-selected':'false'}));
    const mediaType = mime.split(';')[0].trim().toLowerCase();
    const extensions = {'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp',
      'application/pdf':'pdf','application/zip':'zip','text/csv':'csv'};
    const extension = extensions[mediaType] ?? (/\bjson\b/i.test(mime) ? 'json' : /^text\//i.test(mime) ? 'txt' : 'bin');
    const filename = file.intentId + '-response.' + extension;
    target.replaceChildren(node('div', {className:'detail-heading'}, [
      node('div', {}, [node('h2', {text:'Complete native HTTP response'}),
        node('p', {className:'mono', text:file.intentId}), node('p', {text:size(file.bytes.length) + ' · ' + mime})]),
      button('Download complete response', () => download(file.bytes, filename, mime), {primary:true}),
    ]), facts([['Verified SHA256', file.metadata.sha256]]),
      ...(structuredError ? [node('p', {className:'field-note', text:structuredError.message})] : []), tabs, body);
    const imageType = mime.split(';')[0].trim().toLowerCase();
    if (['image/png','image/jpeg','image/gif','image/webp'].includes(imageType)) {
      const source = URL.createObjectURL(new Blob([file.bytes], {type:imageType})); state.urls.add(source);
      target.append(node('div', {className:'content-block'}, [node('img', {src:source, alt:'Complete saved native response image'})]));
    }
    show(structured !== undefined ? 'structured' : text !== null ? 'text' : 'metadata');
  }
  return Object.freeze({connected, reset, offer, open});
}
