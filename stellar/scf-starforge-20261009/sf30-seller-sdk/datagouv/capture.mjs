// MIT. Complete retained data.gouv CSV editions; udata is never represented as CKAN.
import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
export const hash = raw => createHash('sha256').update(raw).digest('hex');
export const encoded = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
export const need = (condition,message) => {if(!condition)throw new Error(message);};
export function member(root,name){
  need(typeof name==='string'&&name&&!name.includes('\\')&&!name.includes('\0')&&!name.startsWith('/')&&!name.split('/').some(v=>!v||v==='.'||v==='..'),'Invalid retained member path');
  const file=resolve(root,name);need(file.startsWith(resolve(root)+sep),'Retained member leaves capture');return file;
}
export async function regular(file,max=268435456){
  const s=await lstat(file);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=max,'A complete regular file within the selected limit is required');
  return readFile(file);
}
export function parseCsv(text){
  if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
  const rows=[];let row=[],cell='',mode='plain',started=false,fieldStart=true;
  const field=()=>{row.push(cell);cell='';fieldStart=true;mode='plain';};
  const record=()=>{field();rows.push(row);row=[];started=false;};
  for(let i=0;i<text.length;i++){
    const c=text[i];started=true;
    if(mode==='quoted'){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else mode='closed';}else cell+=c;continue;}
    if(mode==='closed'&&c!==','&&c!=='\r'&&c!=='\n')throw new Error('Unexpected bytes after a closing CSV quote');
    if(c==='"'){need(fieldStart&&mode==='plain','Quote within an unquoted CSV field');mode='quoted';fieldStart=false;}
    else if(c===',')field();
    else if(c==='\r'||c==='\n'){record();if(c==='\r'&&text[i+1]==='\n')i++;}
    else{need(mode==='plain','Invalid CSV state');cell+=c;fieldStart=false;}
  }
  need(mode!=='quoted','Unclosed CSV quote');
  if(started||row.length||cell)record();
  return rows;
}
export async function readCapture(filename,expected){
  const manifestBytes=await regular(resolve(filename),8*1024*1024),manifestHash=hash(manifestBytes),m=JSON.parse(manifestBytes);
  if(expected)need(expected===manifestHash,'The selected capture manifest changed');
  need(m.schema==='stellar-forge.datagouv-capture.v1'&&m.provider==='datagouv'&&m.protocol==='udata-api-1'&&m.read_only===true&&m.complete_source===true&&m.state==='COMPLETE','A complete native data.gouv capture is required');
  need(Array.isArray(m.files)&&m.files.length===3&&Array.isArray(m.header)&&m.header.length>0&&m.header.length<=64&&new Set(m.header).size===m.header.length,'Invalid complete-file capture contract');
  const root=dirname(resolve(filename)),rawFiles=new Map();
  for(const entry of m.files){
    need(!rawFiles.has(entry.path),'Repeated capture member');
    const raw=await regular(member(root,entry.path));
    need(raw.length===entry.bytes&&hash(raw)===entry.sha256,'Retained source bytes changed: '+entry.path);rawFiles.set(entry.path,raw);
  }
  for(const name of ['original/dataset.json','original/resource.csv','rows.jsonl'])need(rawFiles.has(name),'Capture member is missing: '+name);
  const metadata=JSON.parse(rawFiles.get('original/dataset.json'));
  need(metadata.id===m.dataset_id&&metadata.resources.filter(r=>r.id===m.resource_id).length===1,'Native resource binding differs');
  const csvRows=parseCsv(new TextDecoder('utf-8',{fatal:true}).decode(rawFiles.get('original/resource.csv')));
  need(JSON.stringify(csvRows.shift())===JSON.stringify(m.header),'Original CSV header differs from the captured header');
  const lines=rawFiles.get('rows.jsonl').toString('utf8').split('\n');need(lines.pop()==='','A complete newline-terminated row export is required');
  need(lines.length===m.row_count&&csvRows.length===m.row_count,'Complete CSV and JSONL row counts differ');
  const rows=lines.map((line,i)=>{
    const row=JSON.parse(line);need(row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length===m.header.length,'Captured row width differs');
    need(csvRows[i].length===m.header.length&&m.header.every((name,j)=>typeof row[name]==='string'&&row[name]===csvRows[i][j]),'Captured row differs from unchanged original CSV values');
    return row;
  });
  return {manifest:m,manifestBytes,manifestHash,manifestFile:resolve(filename),rawFiles,rows,metadata};
}
export async function retainCapture(capture,directory){
  await mkdir(directory,{recursive:true,mode:0o700});
  for(const [name,raw] of [...capture.rawFiles,['capture.json',capture.manifestBytes]]){
    const path=member(directory,name);await mkdir(dirname(path),{recursive:true,mode:0o700});
    try{await writeFile(path,raw,{flag:'wx',mode:0o600});}
    catch(e){if(e.code!=='EEXIST')throw e;need(hash(await regular(path))===hash(raw),'A retained source member already differs');}
  }
  return join(directory,'capture.json');
}
export function projectionFor(header,projection){
  need(projection&&typeof projection==='object'&&!Array.isArray(projection),'Select a source projection');
  need(Object.keys(projection).length>0&&Object.keys(projection).length<=64,'Select one to 64 fields');
  for(const [alias,spec] of Object.entries(projection)){
    need(/^[a-z][a-z0-9_]{0,62}$/.test(alias)&&spec&&Object.keys(spec).every(k=>['field','type','nullable','encoding'].includes(k)),'Invalid selected field');
    need(header.includes(spec.field)&&spec.type==='string'&&spec.nullable===false&&(spec.encoding??'native')==='native','CSV source values remain exact non-null strings; choose aliases without changing their meaning');
  }
  return structuredClone(projection);
}
export function compareCaptures(left,right,keys){
  need(left.manifest.dataset_id===right.manifest.dataset_id&&left.manifest.resource_id===right.manifest.resource_id,'Compare editions of the same native resource');
  need(Array.isArray(keys)&&keys.length>0&&new Set(keys).size===keys.length&&keys.every(k=>left.manifest.header.includes(k)&&right.manifest.header.includes(k)),'Choose actual source key fields in both editions');
  function index(c){const map=new Map();for(const row of c.rows){need(keys.every(k=>row[k]!==''),'An empty field cannot identify a row');const key=JSON.stringify(keys.map(k=>row[k]));need(!map.has(key),'Selected comparison key is not unique');map.set(key,row);}return map;}
  const before=index(left),after=index(right),changes=[];let added=0,removed=0,changed=0,unchanged=0;
  for(const [key,row] of before){if(!after.has(key)){removed++;changes.push({key:JSON.parse(key),kind:'removed',before:row,after:null});}else{const next=after.get(key);if(JSON.stringify(row)===JSON.stringify(next))unchanged++;else{changed++;changes.push({key:JSON.parse(key),kind:'changed',before:row,after:next});}}}
  for(const [key,row] of after)if(!before.has(key)){added++;changes.push({key:JSON.parse(key),kind:'added',before:null,after:row});}
  const summary={schema:'stellar-forge.datagouv-comparison.v1',before:left.manifestHash,after:right.manifestHash,keys,added,removed,changed,unchanged,
    headerChanged:JSON.stringify(left.manifest.header)!==JSON.stringify(right.manifest.header),metadataChanged:hash(left.rawFiles.get('original/dataset.json'))!==hash(right.rawFiles.get('original/dataset.json')),
    rawBodyChanged:hash(left.rawFiles.get('original/resource.csv'))!==hash(right.rawFiles.get('original/resource.csv')),changes};
  return {...summary,sha256:hash(encoded(summary))};
}
