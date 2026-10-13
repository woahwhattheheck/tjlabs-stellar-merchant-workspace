// MIT. Retained chapter reading, source comparison and complete workspace receiving.
export async function mountCompanionReadingWorkspace(root,{api,reader,initialSource,initialWorkspace=null,persist=null,onOffline=null,origin=''}={}) {
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let workspace=initialWorkspace?await api.reopen(JSON.stringify(initialWorkspace)):await api.create(initialSource,{origin});
  let serial=0,busy=false,destroyed=false,readingMount=null,comparison=null,noteChapter=workspace.reading.chapter_id,noteId='',status='';
  if(initialSource){const received=await api.receive(workspace,initialSource,{origin});workspace=received.workspace;if(!received.already_received)status='The current published edition is retained. Compare it with your selected edition before switching.';}
  const edition=()=>api.getEdition(workspace),chapters=()=>reader.parseCompanionMarkdown(edition().markdown).chapters;
  const selectedNote=()=>workspace.notes.find(n=>n.id===noteId);
  const one=s=>root.querySelector(s);
  const download=(body,name,type)=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([body],{type}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  function report(value){status=value;const node=one('[data-reading-status]');if(node)node.textContent=value;}
  function retain(next,{draw=false,message=''}={}) {
    if(destroyed)throw new Error('Reopen the current reading workspace.');
    if(next===workspace)return;
    workspace=next;serial++;
    try{persist?.(workspace);}catch(error){status='Reading work is retained in this open page. Download the complete workspace; browser storage could not save this edition.';}
    if(message)status=status.startsWith('Reading work is retained in this open page.')?message+' '+status:message;
    if(draw)render();else if(status)report(status);
  }
  async function operation(fn){if(busy||destroyed)return;busy=true;toggleBusy();try{await fn();}catch(error){report(error.message||String(error));}finally{busy=false;toggleBusy();}}
  function toggleBusy(){root.setAttribute('aria-busy',String(busy));root.querySelectorAll('[data-reading-operation]').forEach(b=>b.disabled=busy);}
  function options(items,current){return items.map(([value,label])=>'<option value="'+esc(value)+'"'+(value===current?' selected':'')+'>'+esc(label)+'</option>').join('');}
  function editionLabel(e){return e.captured_at+' · '+e.sha256.slice(0,12)+' · '+Number(e.bytes).toLocaleString()+' bytes';}
  function formData(){return{edition_id:workspace.selected_edition,chapter_id:noteChapter,note_id:noteId,author:one('[name=note-author]').value,title:one('[name=note-title]').value,body:one('[name=note-body]').value,bookmark:one('[name=note-bookmark]').checked,status:one('[name=note-status]').value};}
  function loadNoteForm(){
    const old=selectedNote()?.versions.at(-1),draft=(workspace.drafts||[]).find(d=>d.edition_id===workspace.selected_edition&&d.chapter_id===noteChapter&&d.note_id===noteId);
    const value=draft||old||{author:'',title:'',body:'',bookmark:false,status:'open'};
    const notes=workspace.notes.filter(n=>n.edition_id===workspace.selected_edition&&n.chapter_id===noteChapter);
    one('[name=note-chapter]').innerHTML=options(chapters().map(c=>[c.id,c.title]),noteChapter);
    one('[name=note-existing]').innerHTML='<option value="">New reading note</option>'+options(notes.map(n=>[n.id,n.versions.at(-1).title||'Note by '+n.versions.at(-1).author]),noteId);
    for(const key of ['author','title','body','status'])one('[name=note-'+key+']').value=value[key];
    one('[name=note-bookmark]').checked=value.bookmark;
    one('[data-note-binding]').textContent='Bound to '+api.getChapter(edition(),noteChapter).title+' · '+edition().sha256.slice(0,12)+(draft?' · retained working draft':'');
  }
  function renderNotes(){
    const rows=workspace.notes.map(n=>{const latest=n.versions.at(-1),same=n.edition_id===workspace.selected_edition;return'<article class="reading-note"><h4>'+esc(latest.title||n.chapter_title)+'</h4><p>'+esc(n.chapter_title)+' · '+esc(latest.author)+' · '+esc(latest.status)+(latest.bookmark?' · bookmarked':'')+' · '+n.versions.length+' versions</p><p>'+esc(latest.body).replace(/\n/g,'<br>')+'</p><p class="reading-small">Original edition '+esc(n.edition_id.replace('edition-','').slice(0,12))+(n.parent_id?' · carried from '+esc(n.parent_id):'')+'</p><div class="reading-actions"><button data-note-open="'+esc(n.id)+'">Open original chapter</button>'+(same?'<button data-note-edit="'+esc(n.id)+'">Edit this note</button>':'<button data-note-carry="'+esc(n.id)+'">Carry into selected chapter</button>')+'</div><details><summary>Complete note history</summary>'+n.versions.map(v=>'<section><h5>Version '+v.version+' · '+esc(v.at)+'</h5><p>'+esc(v.author)+' · '+esc(v.status)+'</p><p>'+esc(v.title)+'</p><pre>'+esc(v.body)+'</pre></section>').join('')+'</details></article>';}).join('');
    one('[data-reading-notes]').innerHTML=rows||'<p>Saved notes and bookmarks appear here with their original source edition.</p>';
    one('[data-draft-count]').textContent=(workspace.drafts||[]).length+' retained working drafts';
  }
  function renderComparison(){
    const box=one('[data-reading-comparison]');if(!comparison){box.innerHTML='<p>Compare any two retained editions to inspect their complete changed chapters and source records.</p>';return;}
    const changes=comparison.chapters.filter(c=>c.kind!=='unchanged'||c.moved),sources=comparison.sources.filter(s=>s.kind!=='unchanged'),s=comparison.summary;
    box.innerHTML='<h3>Edition comparison</h3><p>'+s.added+' added chapters · '+s.changed+' changed · '+s.removed+' removed · '+s.moved+' moved · '+s.source_changes+' source changes</p>'+
      '<p class="reading-small">'+esc(comparison.from)+' → '+esc(comparison.to)+'</p>'+
      changes.map(c=>'<details class="reading-change"><summary>'+esc(c.title)+' · '+esc(c.kind)+(c.moved?' · moved':'')+'</summary><div class="reading-compare-grid"><section><h4>Earlier complete chapter</h4>'+(c.before?c.before.html:'<p>This chapter was absent.</p>')+'</section><section><h4>Later complete chapter</h4>'+(c.after?c.after.html:'<p>This chapter is absent.</p>')+'</section></div></details>').join('')+
      (!changes.length?'<p>The complete chapter text and order are unchanged.</p>':'')+
      '<h4>Original source records</h4>'+sources.map(s=>'<details><summary>'+esc(s.id)+' · '+esc(s.kind)+'</summary><div class="reading-compare-grid"><pre>'+esc(JSON.stringify(s.before,null,2))+'</pre><pre>'+esc(JSON.stringify(s.after,null,2))+'</pre></div></details>').join('')+
      (!sources.length?'<p>The complete source catalogue entries are unchanged.</p>':'');
  }
  function render(){
    readingMount?.destroy();readingMount=null;
    const e=edition(),model=reader.parseCompanionMarkdown(e.markdown);if(!model.chapters.some(c=>c.id===noteChapter)){noteChapter=workspace.reading.chapter_id;noteId='';}
    root.innerHTML='<section class="reading-workspace"><h2>Retained reading workspace</h2><p>Keep source editions, reading notes and bookmarks together while reviewing the complete application companion.</p><p data-reading-status role="status" aria-live="polite">'+esc(status)+'</p>'+
      '<div class="reading-actions"><button data-reading-action="export" data-reading-operation>Download complete workspace</button><button data-reading-action="notes" data-reading-operation>Download complete notes</button><button data-reading-action="offline" data-reading-operation>Save offline reading workspace</button><label>Reopen complete workspace<input data-reading-import type="file" accept=".json,application/json"></label></div>'+
      '<div class="reading-grid"><label>Selected source edition<select name="selected-edition">'+options(workspace.editions.map(e=>[e.id,editionLabel(e)]),workspace.selected_edition)+'</select></label><label>Compare from<select name="compare-from">'+options(workspace.editions.map(e=>[e.id,editionLabel(e)]),workspace.editions.length>1?workspace.editions.at(-2).id:workspace.selected_edition)+'</select></label><label>Compare to<select name="compare-to">'+options(workspace.editions.map(e=>[e.id,editionLabel(e)]),workspace.editions.at(-1).id)+'</select></label></div>'+
      '<div class="reading-actions"><button data-reading-action="select" data-reading-operation>Read selected edition</button><button data-reading-action="compare" data-reading-operation>Compare complete editions</button></div>'+
      '<details><summary>Receive another complete source edition</summary><p>Select the original companion Markdown and its matching source index. The complete pair is retained before you select it for reading.</p><div class="reading-grid"><label>Companion Markdown<input data-companion-file type="file" accept=".md,.txt,text/markdown,text/plain"></label><label>Original source index<input data-companion-index type="file" accept=".json,application/json"></label><label>Original source URL or context<input name="edition-origin" type="text"></label></div><button data-reading-action="receive" data-reading-operation>Receive source pair</button></details>'+
      '<details class="reading-notebook" open><summary>Chapter notes and bookmarks</summary><p data-note-binding></p><div class="reading-grid"><label>Original chapter<select name="note-chapter"></select></label><label>Note<select name="note-existing"></select></label><label>Named author<input name="note-author" maxlength="200"></label><label>Note title<input name="note-title" maxlength="500"></label></div><label>Reading note<textarea name="note-body" maxlength="50000" rows="5"></textarea></label><div class="reading-actions"><label class="reading-checkbox"><input name="note-bookmark" type="checkbox">Bookmark this chapter</label><label>Review state<select name="note-status"><option value="open">Open</option><option value="resolved">Resolved</option></select></label><button data-reading-action="save-note" data-reading-operation>Save note revision</button></div><p data-draft-count class="reading-small"></p><div data-reading-notes></div></details>'+
      '<details class="reading-comparisons"><summary>Full edition and source comparison</summary><div data-reading-comparison></div></details></section><div data-retained-reader></div>';
    const host=one('[data-retained-reader]');host.innerHTML=reader.companionReaderMarkup(model,e);
    readingMount=reader.activateCompanionReader(host,e,null,{reading:workspace.reading,onReading:value=>{const next=api.reading(workspace,value);if(next!==workspace)retain(next);}});
    loadNoteForm();renderNotes();renderComparison();wire();toggleBusy();
  }
  function changeEdition(key,chapterId='') {
    comparison=null;noteId='';noteChapter=chapterId||workspace.reading.chapter_id;
    retain(api.select(workspace,key,{chapterId:noteChapter}),{draw:true,message:'Reading the retained selected edition. Earlier source and notes remain available.'});
  }
  function wire(){
    one('[name=note-chapter]').onchange=event=>{noteChapter=event.target.value;noteId='';loadNoteForm();readingMount.select('#'+noteChapter,true);};
    one('[name=note-existing]').onchange=event=>{noteId=event.target.value;loadNoteForm();};
    for(const key of ['author','title','body','bookmark','status'])one('[name=note-'+key+']').addEventListener('input',()=>{retain(api.draft(workspace,formData()));one('[data-draft-count]').textContent=workspace.drafts.length+' retained working drafts';});
    one('[data-reading-notes]').onclick=event=>operation(async()=>{
      const button=event.target.closest('button');if(!button)return;
      const key=button.dataset.noteOpen||button.dataset.noteEdit||button.dataset.noteCarry,n=workspace.notes.find(n=>n.id===key);if(!n)return;
      if(button.dataset.noteOpen){changeEdition(n.edition_id,n.chapter_id);return;}
      if(button.dataset.noteEdit){noteChapter=n.chapter_id;noteId=n.id;loadNoteForm();readingMount.select('#'+noteChapter,true);return;}
      if(button.dataset.noteCarry){const author=one('[name=note-author]').value;const next=api.carry(workspace,n.id,{chapterId:noteChapter,author});retain(next,{draw:true,message:'Carried the note into the explicitly selected chapter; original note and all versions retained.'});}
    });
    one('[data-reading-import]').onchange=event=>operation(async()=>{
      const file=event.target.files?.[0];if(!file)return;const before=serial;
      try {
        if(file.size>api.maxBytes)throw new Error('Open a complete workspace under 64 MiB.');
        const incoming=await api.reopen(await file.text());
        if(before!==serial)throw new Error('Reading work changed during file import. Reopen the file again to replace this workspace deliberately.');
        noteId='';noteChapter=incoming.reading.chapter_id;comparison=null;retain(incoming,{draw:true,message:'Complete source editions, note versions and working drafts reopened.'});
      } finally {event.target.value='';}
    });
    root.querySelectorAll('[data-reading-action]').forEach(button=>button.onclick=()=>operation(async()=>{
      const action=button.dataset.readingAction;
      if(action==='export'){download(JSON.stringify(workspace,null,2)+'\n','scf-companion-reading-workspace.json','application/json');report('Downloaded every retained source edition, note version and working draft.');return;}
      if(action==='notes'){download(api.notesMarkdown(workspace),'scf-companion-reading-notes.md','text/markdown;charset=utf-8');return;}
      if(action==='offline'){if(onOffline)await onOffline(workspace);else throw new Error('The complete offline source is unavailable in this host. Download the complete workspace.');return;}
      if(action==='select'){changeEdition(one('[name=selected-edition]').value);return;}
      if(action==='compare'){const before=serial;const result=await api.compare(workspace,one('[name=compare-from]').value,one('[name=compare-to]').value);if(serial!==before)throw new Error('Reading work changed during comparison. Compare the current editions again.');comparison=result;renderComparison();one('.reading-comparisons').open=true;return;}
      if(action==='save-note'){const d=formData();retain(api.note(workspace,{noteId:d.note_id,chapterId:d.chapter_id,author:d.author,title:d.title,body:d.body,bookmark:d.bookmark,status:d.status}),{draw:true,message:'Complete note revision saved against the selected original chapter.'});return;}
      if(action==='receive'){
        const markdown=one('[data-companion-file]').files?.[0],index=one('[data-companion-index]').files?.[0],origin=one('[name=edition-origin]').value,before=serial;
        if(!markdown||!index)throw new Error('Choose both original files.');
        if(markdown.size>16*1024*1024||index.size>16*1024*1024)throw new Error('Each complete source file must be under 16 MiB.');
        const [body,indexText]=await Promise.all([markdown.text(),index.text()]);
        const result=await api.receive(workspace,{markdown:body,indexText},{origin});
        if(serial!==before)throw new Error('Reading work changed while receiving sources. Receive that same pair again.');
        retain(result.workspace,{draw:true,message:result.already_received?'This exact source pair is already retained.':'Complete source pair received. Compare the editions before choosing your reading edition.'});
        if(result.already_received)report('This exact source pair is already retained.');
      }
    }));
  }
  render();try{persist?.(workspace);}catch{report('Download the complete workspace to retain this source edition; browser storage is unavailable.');}
  return{getWorkspace:()=>JSON.parse(JSON.stringify(workspace)),destroy(){destroyed=true;readingMount?.destroy();root.replaceChildren();}};
}

export function offlineCompanionReadingWorkspace(workspace,{css,coreSource,editionSource,viewSource,applicationUrl='',submissionUrl=''}={}) {
  for(const value of [css,coreSource,editionSource,viewSource])if(typeof value!=='string'||!value.trim())throw new Error('Retain all complete reader sources for the offline workspace.');
  const payload={workspace,runtime:{css,coreSource,editionSource,viewSource,applicationUrl,submissionUrl}};
  const json=JSON.stringify(payload).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
  const clean=source=>source.replace(/^export /gm,'');
  const boot=String.raw`(async()=>{
    const payload=JSON.parse(document.getElementById('reading-source').textContent),root=document.getElementById('companion-reader');
    const api=createCompanionEditionModel({parseMarkdown:parseCompanionMarkdown});
    const key='scf-companion-reading:'+payload.workspace.id;
    let initial=payload.workspace,warning='';
    try{const saved=localStorage.getItem(key);if(saved)initial=await api.reopen(saved);}catch(error){warning='The saved browser copy could not reopen; the complete embedded workspace is selected. '+error.message;}
    const save=(body,name)=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([body],{type:'text/html;charset=utf-8'}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);};
    const markup=(model,source)=>{
      let html=companionReaderMarkup(model,source),runtime=payload.runtime;
      if(runtime.applicationUrl)html=html.replace('href="./grant.html"','href="'+runtime.applicationUrl.replaceAll('&','&amp;').replaceAll('"','&quot;')+'"');
      if(runtime.submissionUrl)html=html.replace('href="./grant-submission.html"','href="'+runtime.submissionUrl.replaceAll('&','&amp;').replaceAll('"','&quot;')+'"');
      if(runtime.applicationUrl)html=html.replaceAll('href="./grant-data/','href="'+runtime.applicationUrl.replace(/[^/]*$/,'')+'grant-data/');
      return html;
    };
    await mountCompanionReadingWorkspace(root,{api,reader:{parseCompanionMarkdown,companionReaderMarkup:markup,activateCompanionReader},initialWorkspace:initial,persist:w=>localStorage.setItem(key,JSON.stringify(w)),onOffline:w=>save(offlineCompanionReadingWorkspace(w,payload.runtime),'scf-companion-reading-workspace.html')});
    if(warning)root.querySelector('[data-reading-status]').textContent=warning;
  })().catch(error=>{const p=document.createElement('p');p.setAttribute('role','alert');p.textContent=error.message;document.getElementById('companion-reader').append(p);});`;
  const code=[clean(coreSource),clean(editionSource),clean(viewSource),boot].join('\n').replace(/<\/script/gi,'<\\/script');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCF companion reading workspace</title><style>'+css.replace(/<\/style/gi,'<\\/style')+'</style></head><body><a class="skip-link" href="#companion-content">Skip to companion</a><div id="companion-reader"><p class="loading" role="status">Opening complete retained reading workspace…</p></div><script id="reading-source" type="application/json">'+json+'</script><script>'+code+'</script></body></html>\n';
}
