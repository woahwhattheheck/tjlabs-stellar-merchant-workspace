const $ = id => document.getElementById(id);
const token = location.hash.slice(1) || sessionStorage.getItem('federalPortfolioToken') || '';
if (location.hash) { sessionStorage.setItem('federalPortfolioToken', token); history.replaceState(null, '', location.pathname); }
let data, page = 0, activeCapture, revision = 0;
const choices = new Map();
const keys = ['status','fit','fundingChange','proposedWorkshare','deliverables','acceptance','owner','caseUrl','nextAction','notes'];
const labels = ['Status','Scope fit','Funding changes','Proposed workshare','Deliverables','Acceptance','Relationship owner','Case URL','Next action','Notes'];
async function api(path, body) {
  const r = await fetch(path, {method: body === undefined ? 'GET' : 'POST', headers: {'x-portfolio-token': token, ...(body === undefined ? {} : {'content-type':'application/json'})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  if (!r.ok) { const error = await r.json(); throw new Error(error.message || error.error); } return r;
}
function query() { const q = new URLSearchParams(); if (choices.size) for (const id of choices.values()) q.append('capture', id); return q; }
function elem(tag, text, className) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; }
const amount = value => value === null ? 'Unknown' : value;
function visible() { const q = $('search').value.toLowerCase(), status = $('status').value; return data.rows.filter(r => (!status || r.reviewStatus === status) && (!q || [r.awardKey,r.recipient,r.agency,r.description,r.owner,r.workshare,r.naics].join(' ').toLowerCase().includes(q))); }
function render() {
  const rows = visible(); page = Math.min(page, Math.max(0, Math.ceil(rows.length / 50) - 1));
  $('rows').replaceChildren();
  for (const row of rows.slice(page * 50, (page + 1) * 50)) {
    const tr = elem('tr'), name = elem('td'); name.append(elem('strong', row.recipient || '(Unspecified recipient)'), elem('span', row.awardKey, 'muted mono')); tr.append(name, elem('td',row.agency), elem('td',String(row.transactions)), elem('td',amount(row.netObligationUsd)), elem('td',row.reviewStatus));
    const action = elem('td'), select = elem('select'); select.setAttribute('aria-label','History for ' + row.awardKey);
    for (const c of [{captureId:row.captureId,status:row.complete?'complete':'partial'}, ...data.selection.alternatives.filter(c => c.awardKey === row.awardKey)]) { const o=elem('option',c.captureId+' · '+c.status);o.value=c.captureId;select.append(o); }
    select.value=row.captureId;select.onchange=()=>{choices.set(row.awardKey,select.value);refresh();};
    const button=elem('button','Review');button.disabled=!row.complete;button.onclick=()=>edit(row);
    action.append(select,elem('br'),button);tr.append(action);$('rows').append(tr);
  }
  if (!rows.length) { const td=elem('td','No awards match this filter.');td.colSpan=6;const tr=elem('tr');tr.append(td);$('rows').append(tr); }
  $('page').textContent = rows.length + ' awards · page ' + (page + 1) + ' / ' + Math.max(1,Math.ceil(rows.length/50));$('prev').disabled=page===0;$('next').disabled=(page+1)*50>=rows.length;
}
async function refresh() {
  $('refresh').disabled=true;$('message').textContent='Reading retained captures…';
  try { data=await (await api('/api/view?'+query())).json();
    $('awards').textContent=data.totals.awards+' / '+data.totals.completeAwards;$('total').textContent=amount(data.totals.completeNetObligationUsd);$('known').textContent=amount(data.totals.knownNetObligationUsd);
    for (const [id,groups] of [['agencies',data.byAgency],['recipients',data.byRecipient]]) {$ (id).replaceChildren();for(const g of groups){const line=elem('div',undefined,'group');line.append(elem('span',g.name+' · '+g.awards),elem('span',amount(g.completeNetObligationUsd)));$(id).append(line);}}
    $('message').textContent='Retained portfolio · '+data.sha256.slice(0,16)+' · '+data.selection.alternatives.length+' alternative captures';render();
  }catch(error){$('message').textContent=error.message;}finally{$('refresh').disabled=false;}
}
function edit(row){activeCapture=row.captureId;const current=data.reviews.find(r=>r.captureId===row.captureId)?.review;revision=current?.revision??0;$('fields').replaceChildren();$('review-award').textContent=row.awardKey;$('revision').textContent='Source-bound review revision '+revision;$('review-error').textContent='';
  keys.forEach((key,i)=>{const label=elem('label',labels[i]),input=elem(key==='status'?'select':'textarea');input.name=key;input.id='field-'+key;if(key==='status')for(const value of ['researching','scope_match','review_with_owner','passed']){const o=elem('option',value);input.append(o);}else input.maxLength=key==='notes'?12000:4000;input.value=current?.data?.[key]??(key==='status'?'researching':'');label.append(input);$('fields').append(label);});$('editor').showModal();
}
$('review-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await api('/api/review',{captureId:activeCapture,expectedRevision:revision,review:Object.fromEntries(keys.map(k=>[k,$('field-'+k).value]))});$('editor').close();await refresh();}catch(error){$('review-error').textContent=error.message;}finally{button.disabled=false;}};
$('cancel').onclick=()=>$('editor').close();$('refresh').onclick=()=>{choices.clear();refresh();};$('search').oninput=$('status').onchange=()=>{page=0;render();};$('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};
for(const [id,format]of[['json','json'],['csv','csv'],['brief','md']])$(id).onclick=async()=>{try{const q=query();q.set('format',format);q.set('search',$('search').value);q.set('status',$('status').value);q.set('reviews',String($('private').checked));const blob=await(await api('/api/export?'+q)).blob(),url=URL.createObjectURL(blob),a=elem('a');a.href=url;a.download='federal-award-portfolio.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){$('message').textContent=error.message;}};
refresh();
