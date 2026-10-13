// MIT. Passive catalogue extraction. Original UTF-8 bytes and occurrence order remain authoritative.
import { sha256 } from './source-table-workspace.mjs';
export const COLLECTION_SOURCE_SCHEMA = 'stellar-forge.collection-source.v1';
export const SOURCE_LIMIT = 4 * 1024 * 1024;
const encoder = new TextEncoder();
const fail = message => { throw Object.assign(new Error(message), { code: 'COLLECTION_SOURCE' }); };
const size = value => encoder.encode(value).length;
const entities = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:'\u00a0', ndash:'–', mdash:'—', lsquo:'‘', rsquo:'’', ldquo:'“', rdquo:'”', hellip:'…', copy:'©', reg:'®' };
function decoded(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (whole, key) => {
    if(key[0]==='#') { const n=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
      if(!n||n>0x10ffff||n>=0xd800&&n<=0xdfff)fail('The source contains an invalid numeric character reference.');
      return String.fromCodePoint(n);
    }
    if(!Object.hasOwn(entities,key))fail('Unsupported named character reference '+whole+'. Use a reviewed structured catalogue retaining the original page.');
    return entities[key];
  });
}
function attrs(raw) {
  const result=Object.create(null);
  for(const match of raw.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    const name=match[1].toLowerCase();if(Object.hasOwn(result,name))continue; // HTML keeps the first attribute; original markup remains retained.
    result[name]=match[2]??match[3]??match[4];
  }
  return result;
}
function markup(value) {
  const root={tag:'#root',start:0,openEnd:0,end:value.length,closeStart:value.length,children:[]}, stack=[root];
  const token=/<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][A-Za-z0-9:-]*(?:[^>"']|"[^"]*"|'[^']*')*>/g;
  const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  let m;
  while((m=token.exec(value))) {
    const raw=m[0];if(raw.startsWith('<!')){stack[stack.length-1].children.push({tag:'#ignored',start:m.index,openEnd:token.lastIndex,closeStart:token.lastIndex,end:token.lastIndex,children:[]});continue;}
    const closing=raw.startsWith('</'), tag=/^<\/?([^\s/>]+)/.exec(raw)[1].toLowerCase();
    if(closing) {
      let i=stack.length-1;while(i>0&&stack[i].tag!==tag)i--;
      if(!i)continue;
      while(stack.length>i){const node=stack.pop();node.closeStart=m.index;node.end=token.lastIndex;}
    } else {
      const node={tag,attrs:attrs(raw.slice(tag.length+1)),start:m.index,openEnd:token.lastIndex,end:null,closeStart:null,children:[]};
      stack[stack.length-1].children.push(node);
      if(tag==='script'||tag==='style') {
        const end=new RegExp('</'+tag+'\\s*>','ig');end.lastIndex=token.lastIndex;const close=end.exec(value);
        if(!close)fail('The source contains an unfinished script or style element.');
        node.closeStart=close.index;node.end=end.lastIndex;token.lastIndex=end.lastIndex;
      } else if(voids.has(tag)||/\/>$/.test(raw)){node.closeStart=node.openEnd;node.end=node.openEnd;}
      else stack.push(node);
    }
  }
  return root;
}
const hasClass=(node,name)=>(node.attrs?.class||'').split(/\s+/).includes(name);
function all(node,predicate) { const out=[]; const visit=n=>{if(predicate(n))out.push(n);for(const c of n.children)visit(c);};visit(node);return out; }
function one(node,predicate,label) {const found=all(node,predicate);if(found.length!==1)fail('Choose one complete '+label+'; found '+found.length+'.');return found[0];}
function content(value,node) {
  if(node.end===null)fail('The selected source element is unfinished.');
  let out='', cursor=node.openEnd;
  for(const child of node.children) {
    out+=decoded(value.slice(cursor,child.start));
    if(child.tag!=='script'&&child.tag!=='style'&&child.tag!=='#ignored')out+=child.tag==='br'?'\n':content(value,child);
    if(['p','li'].includes(child.tag))out+='\n';
    cursor=child.end;
  }
  out+=decoded(value.slice(cursor,node.closeStart));
  return out;
}
const ordinary=(value,label,max=20000)=>{if(typeof value!=='string'||value.length>max||/\u0000/.test(value))fail(label+' must be complete ordinary text.');return value;};
export function collectionURL(value) {
  ordinary(value,'Source link',12000);let u;try{u=new URL(value);}catch{fail('Keep an absolute HTTP(S) source link.');}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)fail('Keep an HTTP(S) source link without credentials.');
  return value;
}
function strings(value,label){if(!Array.isArray(value)||value.length>100)fail(label+' must be a bounded string array.');return value.map(x=>ordinary(x,label,1000));}
function institution(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))fail('Keep the original institution description.');
  return {title:ordinary(value.title,'Institution title',500),description:ordinary(value.description||'','Description'),address:ordinary(value.address||'','Address',4000),
    topics:strings(value.topics||[],'Topics'),characteristics:strings(value.characteristics||[],'Collection characteristics')};
}
export function extractArchiveBlack(sourceText) {
  const tree=markup(sourceText), main=one(tree,n=>n.tag==='main'&&n.attrs?.id==='primary','main#primary');
  const title=one(main,n=>n.tag==='h1'&&hasClass(n,'entry-title'),'institution title');
  const list=one(main,n=>hasClass(n,'moba-collection-list'),'ordered collection list');
  const anchors=all(list,n=>n.tag==='a'&&hasClass(n,'moba-collection'));
  if(!anchors.length||anchors.length>10000)fail('Keep a nonempty catalogue of at most 10,000 occurrences.');
  const topics=all(main,n=>n.tag==='a'&&hasClass(n,'keyword')).map(n=>content(sourceText,n));
  const characteristics=one(main,n=>n.tag==='ul'&&hasClass(n,'moba-collection'),'collection characteristics');
  const address=one(main,n=>hasClass(n,'address'),'institution address');
  // Description paragraphs are exactly those after the title and before the topic block.
  const topicBlock=one(main,n=>hasClass(n,'moba-keywords'),'topic block');
  const description=all(main,n=>n.tag==='p'&&n.start>title.end&&n.end<topicBlock.start)
    .filter(n=>!all(n,c=>c.tag==='strong').length).map(n=>content(sourceText,n)).join('\n');
  const entries=anchors.map((node,index)=>{
    const label=one(node,n=>n.tag==='span'&&hasClass(n,'title'),'original occurrence title');
    const rawHref=node.attrs.href;if(typeof rawHref!=='string')fail('An original occurrence has no href.');
    return {ordinal:index+1,title:content(sourceText,label),url:collectionURL(decoded(rawHref)),rawHref,
      rawTitle:sourceText.slice(label.openEnd,label.closeStart),rawAnchor:sourceText.slice(node.start,node.end),
      sourceLocator:{start:size(sourceText.slice(0,node.start)),end:size(sourceText.slice(0,node.end))}};
  });
  return {institution:institution({title:content(sourceText,title),description,address:content(sourceText,address),topics,
    characteristics:all(characteristics,n=>n.tag==='li').map(n=>content(sourceText,n))}),entries};
}
function extractStructured(sourceText) {
  let value;try{value=JSON.parse(sourceText);}catch{fail('The structured catalogue is not JSON.');}
  if(value?.schema!=='stellar-forge.collection-input.v1'||!Array.isArray(value.entries)||!value.entries.length||value.entries.length>10000)
    fail('Use the complete collection-input.v1 document with ordered entries.');
  return {institution:institution(value.institution),entries:value.entries.map((entry,index)=>({
    ordinal:index+1,title:ordinary(entry.title,'Original combined title',4000),url:collectionURL(entry.url),
    sourceLocator:{jsonPointer:'/entries/'+index},rawRecord:JSON.parse(JSON.stringify(entry))
  }))};
}
export async function createCollectionSource({format,sourceText,filename,url,observedAt}) {
  ordinary(sourceText,'Original source',SOURCE_LIMIT);if(size(sourceText)>SOURCE_LIMIT)fail('A collection source exceeds 4 MiB.');
  ordinary(filename,'Filename',240);collectionURL(url);
  if(!['archiveblack-html','structured-json'].includes(format))fail('Choose ArchiveBlack HTML or a structured original catalogue.');
  if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt)))fail('Record when the complete source was observed.');
  const sha=await sha256(sourceText), source={format,filename,url,observedAt,sha256:sha,bytes:size(sourceText)};
  const identity=await sha256(JSON.stringify(source)), extracted=format==='archiveblack-html'?extractArchiveBlack(sourceText):extractStructured(sourceText);
  const id='collection-'+identity;
  return {schema:COLLECTION_SOURCE_SCHEMA,id,source:{...source,sourceText},institution:extracted.institution,
    entries:extracted.entries.map(entry=>({...entry,id:id+':'+entry.ordinal}))};
}
export async function verifyCollectionSource(value) {
  if(value?.schema!==COLLECTION_SOURCE_SCHEMA)fail('Keep the complete original collection source.');
  const rebuilt=await createCollectionSource(value.source||{});
  if(JSON.stringify(rebuilt)!==JSON.stringify(value))fail('The retained source, extraction or occurrence identity changed.');
  return rebuilt;
}
