// MIT. Record an observed snapshot by retaining the exact prior original and adding one complete source edition.
export function appendMakerObservation(core,workspace,p){
 const w=core.reopen(workspace),e=w.editions.find(e=>e.id===p?.editionId);
 if(!e)throw Error('Choose a retained source edition for the observation');
 const selected=core.plan(w,{editionId:e.id,asOf:p.asOf});
 if(!selected.stages.some(s=>s.batchId===p.batchId&&s.stageId===p.stageId))throw Error('Choose a batch and stage in this exact source');
 const d=p.event,fields=['eventId','observedAt','localDate','status','inputQty','goodQty','rejectQty','heldQty','sourceRef'];
 if(!d||Object.keys(d).length!==fields.length||fields.some(k=>typeof d[k]!=='string'))throw Error('Keep the complete original observation fields');
 const row={event_id:d.eventId,batch_id:p.batchId,stage_id:p.stageId,observed_at:d.observedAt,local_date:d.localDate,status:d.status,input_qty:d.inputQty,good_qty:d.goodQty,reject_qty:d.rejectQty,held_qty:d.heldQty,source_ref:d.sourceRef};
 const sources=Object.fromEntries(Object.entries(e.sources).map(([k,v])=>[k,{name:v.name,text:v.text}]));
 const original=sources.observations.text,first=(original.charCodeAt(0)===65279?original.slice(1):original).split(/\r\n|\n|\r/)[0],headers=first.split(',').map(h=>h.startsWith('"')&&h.endsWith('"')?h.slice(1,-1).replace(/""/g,'"'):h),expected=core.columns.observations;
 if(headers.length!==expected.length||new Set(headers).size!==expected.length||headers.some(h=>!expected.includes(h)))throw Error('Observation header needs the original simple canonical columns');
 const cell=x=>'"'+String(x).replace(/"/g,'""')+'"';
 sources.observations.text=original+(/[\r\n]$/.test(original)?'':'\n')+headers.map(h=>cell(row[h])).join(',')+'\n';
 const next=core.addEdition(w,{id:p.newEditionId,label:p.label||e.label+' · observation '+d.eventId,sources,settings:JSON.parse(JSON.stringify(e.settings)),notes:e.notes+'\nObserved-stage entry '+d.eventId+' retained from the working form.'});
 core.plan(next,{editionId:p.newEditionId,asOf:d.localDate>p.asOf?d.localDate:p.asOf});return next;
}
