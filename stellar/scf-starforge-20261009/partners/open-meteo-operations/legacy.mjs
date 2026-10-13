// MIT. Open an existing complete frozen weather ZIP as an editable delivery.
import {spawn} from 'node:child_process';
import {need,sha,canonical} from './contract.mjs';
import {createWeatherHandover,inspectWeatherHandover,MAX_HANDOVER_BYTES,MAX_LEGACY_ARCHIVE_BYTES} from './portable.mjs';

const READER=String.raw`import base64,hashlib,io,json,re,stat,sys,zipfile
raw=base64.b64decode(sys.stdin.buffer.read(),validate=True)
if not 0<len(raw)<=33554432: raise ValueError("archive-size")
z=zipfile.ZipFile(io.BytesIO(raw))
infos=z.infolist()
if not 4<=len(infos)<=64: raise ValueError("archive-file-count")
names=[i.filename for i in infos]
if len(names)!=len(set(names)): raise ValueError("archive-duplicate")
allowed=re.compile(r"^(report\.json|report\.html|decisions\.json|manifest\.json|editable\.weather\.json|sources/capture-[a-f0-9-]{36}\.json|series/capture-[a-f0-9-]{36}\.csv)$")
if any(not allowed.fullmatch(n) for n in names): raise ValueError("archive-path")
if any(i.flag_bits&1 or stat.S_IFMT(i.external_attr>>16) not in (0,stat.S_IFREG) for i in infos): raise ValueError("archive-entry")
if any(i.file_size<0 or i.file_size>67108864 for i in infos) or sum(i.file_size for i in infos)>134217728: raise ValueError("archive-expanded-size")
data={i.filename:z.read(i) for i in infos}
manifest=json.loads(data["manifest.json"])
if manifest.get("schema")!="stellar-forge.weather-report-files.v1": raise ValueError("archive-manifest")
files=manifest.get("files")
if not isinstance(files,list) or len(files)!=len(infos)-1: raise ValueError("archive-manifest-count")
seen=set()
for item in files:
 n=item.get("name")
 if n in seen or n=="manifest.json" or n not in data: raise ValueError("archive-manifest-path")
 seen.add(n)
 if item.get("bytes")!=len(data[n]) or item.get("sha256")!=hashlib.sha256(data[n]).hexdigest(): raise ValueError("archive-manifest-content")
if seen!=set(names)-{"manifest.json"}: raise ValueError("archive-manifest-selection")
report=json.loads(data["report.json"])
if manifest.get("reportId")!=report.get("id") or manifest.get("reportSha256")!=report.get("sha256"): raise ValueError("archive-report")
decisions=json.loads(data["decisions.json"])
if decisions!=report.get("decisions"): raise ValueError("archive-decisions")
ids=[c["id"] for c in report["captures"]]
expected={"report.json","report.html","decisions.json","manifest.json"}|{"sources/"+i+".json" for i in ids}|{"series/"+i+".csv" for i in ids}
if "editable.weather.json" in data: expected.add("editable.weather.json")
if set(names)!=expected: raise ValueError("archive-report-files")
for capture in report["captures"]:
 original=data["sources/"+capture["id"]+".json"]
 if len(original)!=capture["bytes"] or hashlib.sha256(original).hexdigest()!=capture["sha256"]: raise ValueError("archive-source-content")
sources=[{"id":i,"content":base64.b64encode(data["sources/"+i+".json"]).decode("ascii")} for i in ids]
result={"report":report}
if "editable.weather.json" in data: result["editable"]=data["editable.weather.json"].decode("utf-8")
else: result["sources"]=sources
sys.stdout.write(json.dumps(result,separators=(",",":")))
`;

async function readArchive(bytes,{python=process.env.PYTHON??'python3',signal}={}){
 need(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=MAX_LEGACY_ARCHIVE_BYTES,'LEGACY_ARCHIVE_TOO_LARGE');
 need(typeof python==='string'&&python.length>0,'PYTHON_REQUIRED');
 return new Promise((resolve,reject)=>{
  const child=spawn(python,['-I','-c',READER],{stdio:['pipe','pipe','pipe'],signal});
  const chunks=[];let length=0,finished=false,diagnostic='';
  const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);if(error)reject(error);else resolve(result);};
  const fail=code=>Object.assign(new Error(code),{code});
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(fail('LEGACY_ARCHIVE_READ_TIMEOUT'));},30000);
  child.on('error',error=>finish(Object.assign(error,{code:error.name==='AbortError'?'OPERATOR_CANCELLED':error.code??'LEGACY_ARCHIVE_READER_FAILED'})));
  child.stdout.on('data',chunk=>{
   length+=chunk.length;
   if(length>MAX_HANDOVER_BYTES*2){child.kill('SIGKILL');finish(fail('LEGACY_ARCHIVE_EXPANDED_LIMIT'));return;}
   chunks.push(chunk);
  });
  child.stderr.on('data',chunk=>{if(diagnostic.length<2048)diagnostic+=chunk.toString('utf8').slice(0,2048-diagnostic.length);});
  child.stdin.on('error',()=>{});
  child.on('close',code=>{
   if(code!==0){finish(fail('LEGACY_ARCHIVE_INVALID'));return;}
   try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{finish(fail('LEGACY_ARCHIVE_OUTPUT_INVALID'));}
  });
  child.stdin.end(bytes.toString('base64'));
 });
}

/** The original ZIP retains its selected decision revisions. Subsequent editable
 * deliveries additionally retain the receiving workspace's complete revisions. */
export async function weatherHandoverFromZip(bytes,{expectedArchiveSha256,python,signal}={}){
 bytes=Buffer.from(bytes);const archiveSha256=sha(bytes);
 if(expectedArchiveSha256!==undefined)need(expectedArchiveSha256===archiveSha256,'LEGACY_ARCHIVE_HASH_CHANGED');
 const {report,sources,editable}=await readArchive(bytes,{python,signal});
 need(Array.isArray(report.captures),'LEGACY_ARCHIVE_REPORT_INVALID');
 let captures,originId='weather-archive-'+report.sha256,decisionHistory=report.decisions,receivingHistory=[];
 if(editable!==undefined){
  const original=inspectWeatherHandover(editable);
  need(canonical(original.value.report)===canonical(report),'LEGACY_ARCHIVE_REPORT_CHANGED');
  captures=original.captures;originId=original.value.originId;decisionHistory=original.decisions;
  receivingHistory=original.value.receivingHistory;
 }else{
  need(Array.isArray(sources),'LEGACY_ARCHIVE_REPORT_INVALID');
  const byId=new Map(sources.map(source=>[source.id,source.content]));
  need(byId.size===sources.length&&sources.length===report.captures.length,'LEGACY_ARCHIVE_SOURCE_SELECTION_CHANGED');
  captures=report.captures.map(capture=>{
   need(byId.has(capture.id),'LEGACY_ARCHIVE_SOURCE_MISSING');
   return {...capture,raw:Buffer.from(byId.get(capture.id),'base64')};
  });
 }
 const handover=createWeatherHandover({originId,report,captures,decisionHistory,receivingHistory,
  legacyArchive:{format:'stellar-forge.weather-report-zip.v1',
   bytes:bytes.length,sha256:archiveSha256,reportId:report.id,reportSha256:report.sha256,encoding:'base64',content:bytes.toString('base64')}});
 const inspection=inspectWeatherHandover(JSON.stringify(handover));
 need(canonical(inspection.value.report)===canonical(report),'LEGACY_ARCHIVE_REPORT_CHANGED');
 return handover;
}
