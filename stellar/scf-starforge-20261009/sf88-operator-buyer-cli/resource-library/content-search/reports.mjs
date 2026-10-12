// MIT — Full paginated findings; exact source positions and plain portable formats.
import {mkdtemp,open,rm,link,unlink} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {setImmediate} from 'node:timers/promises';
import {requireValue,digest} from '../files.mjs';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const csv=s=>'"'+String(s??'').replace(/^[\s]*[=+@\-\t\r]/,m=>"'"+m).replaceAll('"','""')+'"';
export function researchReport(search,options={}){
  const format=options.format??'json';requireValue(['json','csv','html'].includes(format),'REPORT_FORMAT_INVALID');
  const first=search.search({...options,offset:0,limit:1}),build=search.inspect(first.build);
  const meta={schema:'stellar-forge.resource-research-report.v1',createdAt:new Date().toISOString(),
    query:{q:first.q,mode:first.mode},build:first.build,source:build.binding,coverage:{files:build.files,bytes:build.bytes,counts:build.counts,issues:build.issues},matchingFiles:first.total};
  // Prime the generator before returning so annotations are captured with this report.
  const iterator=search.findings({...options,build:first.build}),head=iterator.next();
  async function *chunks({signal}={}){
    if(format==='json')yield JSON.stringify(meta).slice(0,-1)+',"findings":[';
    if(format==='csv')yield ['File','Source SHA-256','Line start','Line end','Byte start','Byte end (exclusive)','Excerpt','Note','Tags','Starred'].map(csv).join(',')+'\r\n';
    if(format==='html')yield '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Research findings</title><style>body{font:16px/1.55 system-ui,sans-serif;color:#202020;max-width:960px;margin:40px auto;padding:0 24px}h1{font-size:30px}h2{font-size:20px}article{border-top:1px solid #bbb;padding:24px 0;break-inside:avoid}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f3f3;padding:18px}small,footer{overflow-wrap:anywhere;color:#555}.meta{border:1px solid #bbb;padding:16px}mark{background:#ddd;color:inherit}</style><h1>Research findings</h1><p>'+escape(first.q)+'</p><div class="meta">'+escape(first.mode==='all'?'All words, anywhere in a file':'Any word')+' · '+first.total+' matching files · '+build.counts.TEXT+' searchable text files</div>'+(build.issues.length?'<p>Files without searchable text: '+build.issues.map(x=>escape(x.name)+' ('+escape(x.state.toLowerCase())+')').join('; ')+'.</p>':'');
    let current=head,count=0;
    try{while(!current.done){
      signal?.throwIfAborted();const f=current.value;
      if(format==='json')yield (count?',':'')+JSON.stringify(f);
      if(format==='csv')yield [f.resource.name,f.resource.sha256,f.excerpt.lineStart,f.excerpt.lineEnd,f.excerpt.byteStart,f.excerpt.byteEnd,f.excerpt.text,f.annotation?.note??'',f.annotation?.tags?.join('; ')??'',f.annotation?.starred?'yes':'no'].map(csv).join(',')+'\r\n';
      if(format==='html')yield '<article><h2>'+escape(f.resource.name)+'</h2><p>Lines '+f.excerpt.lineStart+'–'+f.excerpt.lineEnd+' · Bytes '+f.excerpt.byteStart+'–'+f.excerpt.byteEnd+' (end exclusive)</p><pre>'+escape(f.excerpt.text)+'</pre>'+(f.annotation?.note?'<p><strong>Review note</strong><br>'+escape(f.annotation.note)+'</p>':'')+(f.annotation?.tags?.length?'<p>Tags: '+f.annotation.tags.map(escape).join(', ')+'</p>':'')+'<small>Source SHA-256: '+escape(f.resource.sha256)+'</small></article>';
      count++;if(count%32===0)await setImmediate();current=iterator.next();
    }}finally{iterator.return?.();}
    if(format==='json')yield '],"findingCount":'+count+'}\n';
    if(format==='html')yield '<footer>'+count+' matching passages. Excerpts retain original UTF-8 byte and line positions; long passages are excerpted. Source snapshot: '+escape(first.build)+'.</footer></html>';
  }
  return {meta,format,filename:'research-findings.'+format,chunks};
}
export async function reportDownload(search,options={},signal){
  const report=researchReport(search,options),dir=await mkdtemp(join(search.library.state,'.research-')),path=join(dir,report.filename);
  let file;try{
    file=await open(path,'wx+',0o600);const hash=createHash('sha256');let bytes=0;
    for await(const chunk of report.chunks({signal})){const part=Buffer.from(chunk);hash.update(part);let offset=0;while(offset<part.length){const r=await file.write(part,offset,part.length-offset,bytes+offset);requireValue(r.bytesWritten>0,'REPORT_WRITE_STALLED',500);offset+=r.bytesWritten;}bytes+=part.length;}
    await file.sync();let disposed=false;
    return {file,bytes,sha256:hash.digest('hex'),resource:{id:digest(report.meta.build+report.meta.createdAt),name:report.filename},
      async dispose(){if(disposed)return;disposed=true;try{await file.close();}finally{await rm(dir,{recursive:true,force:true});}}};
  }catch(e){await file?.close();await rm(dir,{recursive:true,force:true});throw e;}
}
/** Complete create-only output. Existing files are never replaced. */
export async function saveReport(search,destination,options={}){
  const target=resolve(destination),tmp=await mkdtemp(join(dirname(target),'.research-publish-')),part=join(tmp,'report');let file;
  try{file=await open(part,'wx',0o600);const report=researchReport(search,options),hash=createHash('sha256');let bytes=0;
    for await(const chunk of report.chunks(options)){const b=Buffer.from(chunk);hash.update(b);await file.writeFile(b);bytes+=b.length;}
    await file.sync();await file.close();file=null;await link(part,target);await unlink(part);
    return {path:target,bytes,sha256:hash.digest('hex'),...report.meta};
  }finally{await file?.close();await rm(tmp,{recursive:true,force:true});}
}
