// SPDX-License-Identifier: MIT
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=x=>'<ul>'+x.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>';
const table=(headers,rows)=>'<div class="table"><table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+
  '</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
export function renderCommissioningReport(report,status) {
  const p=report.providers, review=status.results.filter(r=>r.action==='review');
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>'+esc(status.title)+' — commissioning</title><style>'+
  '*{box-sizing:border-box}body{font:15px/1.5 system-ui,sans-serif;margin:0;background:#f4f4f3;color:#202224}main{max-width:1120px;margin:auto;padding:28px}'+
  'h1{font-size:28px;line-height:1.2}h2{font-size:20px;margin-top:32px}h3{font-size:16px}p{max-width:85ch}section{background:white;border:1px solid #c9cbcd;padding:20px;margin:16px 0}'+
  '.table{overflow:auto}table{border-collapse:collapse;width:100%;min-width:640px}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #ddd;vertical-align:top}th{background:#eceeed}'+
  'code,pre{font-family:ui-monospace,monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f3;padding:12px}details{margin:12px 0}summary{cursor:pointer}small{color:#53585c}'+
  '@media(max-width:600px){main{padding:12px}section{padding:12px}h1{font-size:23px}h2{margin-top:24px}}@media print{body{background:white}main{padding:0}section{break-inside:avoid}.table{overflow:visible}table{min-width:0}}'+
  '</style><main><header><small>Facilitator commissioning · '+esc(report.jobId)+'</small><h1>'+esc(status.title)+'</h1>'+
  '<p>'+esc(report.service.purpose)+'</p><p><strong>'+esc(report.state.replaceAll('_',' '))+'</strong> · '+report.usefulTasks+
  ' of 2 provider tasks received · '+report.originalAttempts+' original buyer attempts</p></header>'+
  '<section><h2>Customer task and receiving</h2>'+table(['Selection','Retained value'],[
    ['Source edition',report.sourceEdition],['Source authority',report.service.sourceReference],
    ['Receiving application',report.service.receiver.system],['Receiving operator',report.service.receiver.operator],
    ['Complete task',report.requests.length+' selected requests/pages'],['Job revision',status.revision]])+
  '<details><summary>Complete source identities</summary><pre>'+esc(JSON.stringify({scope:report.service.scope,
    schema:report.service.schema,acceptance:report.service.acceptance,selectionSha256:report.selectionSha256},null,2))+'</pre></details></section>'+
  p.map(provider=>'<section><h2>'+esc(provider.operatorName)+' · '+esc(provider.alias)+'</h2><p>'+
    esc(provider.complete?'Complete useful task received':'Operating work remains')+'</p><p>'+esc(provider.authorityReference)+'</p>'+
    table(['Request/page','Receiving state','Original buyer intents'],provider.requests.map(r=>[r.id,r.complete?'ACCEPTED':'OPEN',r.acceptedIntents.join(', ')]))+
    '<h3>All returned attempts</h3>'+table(['Request','Intent','Native payment state','Output','Customer decision'],
      provider.requests.flatMap(r=>r.attempts.map(a=>[r.id,a.intentId,a.payment,a.output,a.receiving])))+'</section>').join('')+
  '<section><h2>Provider capabilities and original release</h2>'+table(['Provider','Observed','Compatibility','Original review'],
    review.map(r=>[r.result.proposed.provider.alias,r.result.observedAt,r.result.compatible?'COMPATIBLE':r.result.error?.code,r.result.id]))+
    review.map(r=>'<details><summary>'+esc(r.result.proposed.provider.alias)+' — complete ordered native payment alternatives</summary><pre>'+
      esc(JSON.stringify(r.result.nativePayments,null,2))+'</pre></details>').join('')+'</section>'+
  '<section><h2>Observed transfers</h2>'+table(['Network','Asset','Original atomic units'],report.payment.observedTransferAtomicByAsset.map(r=>[r.network,r.asset,r.atomicTotal]))+
  '<p>Transfers, complete output and the receiving decision retain their separate original results. Amounts keep their network and asset units.</p></section>'+
  '<section><h2>Continue and hand over</h2><p>'+esc(report.scope)+'</p>'+
    list(['Continue a pending command using its unchanged original command file.','Run each provider through the original seller release owner.',
      'Reconcile an uncertain buyer result through its existing SF88 operation before receiving a later observation.',
      'Transfer the complete commissioning job alongside the original merchant and buyer recovery packages.'])+
    '<details><summary>Pending original commands ('+status.pending.length+')</summary><pre>'+esc(JSON.stringify(status.pending,null,2))+'</pre></details></section>'+
  '</main></html>';
}
