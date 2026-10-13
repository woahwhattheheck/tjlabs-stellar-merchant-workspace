// MIT. Browser-safe and standalone rendering of original OAuth aggregate source.
const esc=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STAGES=['authentication','authorization','hostAuthority','jwks'];
const FIELDS=['started','completed','allowed','denied','unavailable','failed'];
const table=(heads,rows)=>'<div class="scroll"><table><thead><tr>'+heads.map(v=>'<th>'+esc(v)+'</th>').join('')+
 '</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
function counters(value){return table(['Stage',...FIELDS],STAGES.map(stage=>[stage,...FIELDS.map(key=>value?.[stage]?.[key]??null)]));}
export function oauthSummaryHtml(s) {
  if(!s)return '<p>No original OAuth source is retained.</p>';
  const selection=s.selection??{};
  return '<h3>Original OAuth observation</h3>'+table(['Binding','Retained value'],[
    ['Coverage',s.coverage],['Selected resource',selection.resource],['Observed resource',s.resource],
    ['Selected configuration SHA-256',selection.configurationSha256],['Observed configuration SHA-256',s.configurationSha256],
    ['Protected source endpoint',selection.endpoint],['Session',s.sessionId],['Sequence',s.sequence],
    ['Source interval',(s.startedAt??'unavailable')+' → '+(s.capturedAt??'unavailable')],
    ['Source error',s.sourceError],['Host authority callback',s.authority?.hostCallback===undefined?null:s.authority.hostCallback?'Present':'Absent'],
    ['Observer errors',s.state?.observerErrors],['Clock error',s.state?.clockError],['Closed',s.state?.closed]])+
    '<p>Each stage counts checks. Authentication, authorization, host authority and JWKS outcomes are distinct; neither a grant nor a stage total proves customer fulfillment or a one-to-one audit-event match.</p>'+
    (s.counters?'<h4>Original cumulative stage counters</h4>'+counters(s.counters):'<p>The protected source was unavailable; missing counters are not zeros.</p>')+
    (s.window?'<h4>Original rolling window</h4><p>'+esc(s.window.from)+' → '+esc(s.window.through)+' · '+esc(s.window.minutes)+
      ' selected minutes · '+(s.window.complete?'Complete saved window':'Partial saved window')+'</p>'+counters(s.window.counters):'')+
    (s.last?'<details><summary>Original last stage outcomes</summary>'+table(['Stage','Outcome','Time','Duration ms'],STAGES.map(stage=>[
      stage,s.last[stage]?.outcome,s.last[stage]?.at,s.last[stage]?.durationMs]))+'</details>':'')+
    (s.issuers?'<details><summary>Original issuer aggregates</summary><pre>'+esc(JSON.stringify(s.issuers,null,2))+'</pre></details>':'');
}
export function oauthCaptureHtml(capture) {
 const s=capture.oauth;return oauthSummaryHtml(s)+
  '<details><summary>Original condition decisions</summary>'+table(['Condition','Decision','Observed values'],Object.entries(s.conditions??{}).map(([key,v])=>[
    key,v.bad===true?'Failing':v.bad===false?'Not failing':'Insufficient recovery evidence',JSON.stringify(v.values)]))+'</details>';
}
export function oauthComparisonHtml(comparison) {
 const o=comparison.oauth;if(!o)return '';
 return '<p>'+esc(o.aggregation??'Original observation kinds remain separate.')+'</p>'+
  (o.cumulativeChanges?'<h3>Changes between original cumulative snapshots</h3><p>'+esc(o.from)+' → '+esc(o.until)+
   '. These are stage-check changes; overlapping rolling windows are not added.</p>'+counters(o.cumulativeChanges)+
   '<details><summary>Exact stage outcome changes</summary><pre>'+esc(JSON.stringify(o.cumulativeChanges,null,2))+'</pre></details>':'');
}
