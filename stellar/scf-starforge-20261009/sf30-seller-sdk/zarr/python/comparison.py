"""Exact retained-result comparison; no array decoding, resampling or unit conversion."""
from __future__ import annotations
import base64, csv, html, io, itertools, json, math, re
from pathlib import Path
from files import require, object_fields, encoded, digest, value_digest, read_json, read_file, publish, relative, file_identity
import native

SCHEMA="stellar-forge.zarr-result-comparison.v1"
MAX_BYTES=96*1024*1024
MAX_REPORT_BYTES=384*1024*1024
MAX_ROWS=2000000
STATUSES=("same","changed","left-only","right-only")
MEANING=("Pairs use exact original source-index tuples only. Equal typed representations do not establish "
         "equal physical coordinates, units, time meaning or scientific equivalence. No alignment, "
         "resampling, unit conversion or aggregate statistic is performed.")
HASH=re.compile(r"^[a-f0-9]{64}$")
def _text(value,label,maximum=4000):
    require(isinstance(value,str) and 0<len(value.strip())<=maximum,"ZARR_COMPARISON_INPUT",
            "Enter "+label+" of at most "+str(maximum)+" characters")
    return value.strip()
def _typed(value,depth=0):
    require(depth<=64 and isinstance(value,dict),"ZARR_COMPARISON_VALUE","Retain the complete original typed value")
    kind=value.get("kind")
    fields={"boolean":("kind","value"),"text":("kind","value"),"integer":("kind","value"),"float":("kind","value"),
            "bytes":("kind","base64"),"complex":("kind","real","imaginary"),
            "datetime":("kind","dtype","ticks","display"),"timedelta":("kind","dtype","ticks","display"),
            "record":("kind","fields"),"subarray":("kind","shape","values")}
    require(kind in fields and set(value)==set(fields[kind]),"ZARR_COMPARISON_VALUE","Use an unchanged original typed value")
    if kind=="boolean":require(type(value["value"]) is bool,"ZARR_COMPARISON_VALUE","Boolean representation changed")
    elif kind=="text":require(isinstance(value["value"],str),"ZARR_COMPARISON_VALUE","Text representation changed")
    elif kind=="integer":require(isinstance(value["value"],str) and re.fullmatch(r"-?(0|[1-9][0-9]*)",value["value"]) is not None,
                                 "ZARR_COMPARISON_VALUE","Integer values remain exact decimal text")
    elif kind=="float":
        v=value["value"]
        require(isinstance(v,str) and (v in ("NaN","Infinity","-Infinity") or
                re.fullmatch(r"-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?",v) is not None),
                "ZARR_COMPARISON_VALUE","Floating values remain their original round-trip text")
    elif kind=="bytes":
        require(isinstance(value["base64"],str),"ZARR_COMPARISON_VALUE","Byte values retain original base64")
        try:decoded=base64.b64decode(value["base64"],validate=True)
        except (ValueError,TypeError):require(False,"ZARR_COMPARISON_VALUE","Original byte encoding is invalid")
        require(base64.b64encode(decoded).decode()==value["base64"],"ZARR_COMPARISON_VALUE","Original byte encoding is not canonical")
    elif kind in ("datetime","timedelta"):
        require(all(isinstance(value[k],str) for k in ("dtype","ticks","display")) and
                re.fullmatch(r"-?(0|[1-9][0-9]*)",value["ticks"]) is not None,
                "ZARR_COMPARISON_VALUE","Original time dtype, ticks and display remain explicit")
    elif kind=="complex":
        _typed(value["real"],depth+1);_typed(value["imaginary"],depth+1)
        require(value["real"]["kind"]==value["imaginary"]["kind"]=="float","ZARR_COMPARISON_VALUE","Complex components retain their original float type")
    elif kind=="record":
        require(isinstance(value["fields"],dict),"ZARR_COMPARISON_VALUE","Original record fields are required")
        for field in value["fields"].values():_typed(field,depth+1)
    elif kind=="subarray":
        require(isinstance(value["shape"],list) and all(type(x) is int and x>=0 for x in value["shape"]) and
                isinstance(value["values"],list) and math.prod(value["shape"])==len(value["values"]),
                "ZARR_COMPARISON_VALUE","Original subarray shape and all components are required")
        for field in value["values"]:_typed(field,depth+1)
    return value

def _bound(workspace,ident,pin):
    require(isinstance(pin,str) and HASH.fullmatch(pin),"ZARR_COMPARISON_BINDING","Pin both complete original result hashes")
    item=workspace.entity("results",ident)
    require(item["contentSha256"]==pin,"ZARR_COMPARISON_BINDING","The chosen original result hash changed",409)
    raw=read_file(workspace.root/relative(item["file"]),32*1024*1024)
    data=json.loads(raw)
    require(value_digest(data)==pin,"ZARR_RESULT_CHANGED","The retained original typed result changed",409)
    plan=workspace.entity("selections",item["selectionId"])
    source=workspace.entity("sources",item["sourceId"])
    source_file=read_json(workspace.root/relative(source["file"]))
    require(source_file["item"]==source and value_digest(source_file["files"])==source["sourceSha256"],
            "ZARR_SOURCE_CHANGED","The original source receipt changed",409)
    arrays=[x for x in source["inspection"]["nodes"] if x["path"]==plan["array"] and x["nodeType"]=="array"]
    require(len(arrays)==1,"ZARR_COMPARISON_BINDING","Original selected array is missing",409)
    metadata=arrays[0]
    require(data.get("schema")=="stellar-forge.zarr-native-result.v1" and data.get("readOnly") is True and
            data.get("order")=="C" and data.get("sourceId")==source["id"] and
            data.get("sourceSha256")==source["sourceSha256"]==plan["sourceSha256"]==item["sourceSha256"] and
            data.get("selectionId")==plan["id"] and data.get("array")==plan["array"]==item["array"] and
            data.get("selection")==plan["axes"] and data.get("metadata")==metadata and
            data.get("arrayMetadataSha256")==metadata["metadataSha256"]==plan["metadataSha256"] and
            data.get("sourceShape")==metadata["shape"]==item["sourceShape"] and
            data.get("shape")==item["shape"] and data.get("dtype")==item["dtype"] and data.get("engine")==item["engine"] and
            item["id"]==value_digest({"operationId":data.get("operationId"),"contentSha256":pin}),
            "ZARR_COMPARISON_BINDING","Original result, source, array and selection must agree exactly",409)
    original=workspace.operation(data["operationId"])
    require(original["state"]=="COMPLETE" and original["request"]["action"]=="run" and
            original["request"]["input"]=={"selectionId":plan["id"]} and original["result"]["item"]==item,
            "ZARR_COMPARISON_BINDING","The complete original native run receipt is required",409)
    _,positions=native.normalize_selection(metadata["shape"],plan["axes"])
    count=math.prod(len(x) for x in positions)
    require(type(data.get("rowCount")) is int and data["rowCount"]==count==plan["selectedCellCount"]==item["rowCount"] and
            isinstance(data.get("rows"),list) and len(data["rows"])==count and count<=1000000,
            "ZARR_COMPARISON_POPULATION","The complete original selected population is required",409)
    shape=[len(p) for p,a in zip(positions,plan["axes"]) if type(a) is not int]
    require(data["shape"]==shape,"ZARR_COMPARISON_POPULATION","Original selected shape changed",409)
    for ordinal,(row,index) in enumerate(zip(data["rows"],itertools.product(*positions))):
        object_fields(row,("ordinal","sourceIndex","value"),("ordinal","sourceIndex","value"),"original result row")
        require(type(row["ordinal"]) is int and row["ordinal"]==ordinal and row["sourceIndex"]==list(index) and
                all(type(x) is int for x in row["sourceIndex"]),
                "ZARR_COMPARISON_POPULATION","Original row order or source indices changed",409)
        _typed(row["value"])
    keys=("id","title","sourceSha256","sourceBytes","memberCount","provenance","captureAtomic","directoryReadConsistency")
    context={"source":{k:source[k] for k in keys},"selection":plan,"result":item,"metadata":metadata,
             "reviews":[r for r in workspace.items("reviews") if r["resultId"]==item["id"]]}
    return context,data

def build(workspace,op,value):
    required=("leftResultId","rightResultId","leftContentSha256","rightContentSha256","title","note","pairing")
    object_fields(value,required,required,"retained-result comparison")
    require(value["pairing"]=="source-index","ZARR_COMPARISON_PAIRING","Explicitly select original source-index tuple pairing")
    name=_text(value["title"],"a comparison title",200);note=_text(value["note"],"the interpretation and source limitations")
    left,ld=_bound(workspace,value["leftResultId"],value["leftContentSha256"])
    right,rd=_bound(workspace,value["rightResultId"],value["rightContentSha256"])
    right_rows={tuple(r["sourceIndex"]):r for r in rd["rows"]}
    left_keys=set();rows=[];counts={k:0 for k in STATUSES}
    for lr in ld["rows"]:
        key=tuple(lr["sourceIndex"]);left_keys.add(key);rr=right_rows.get(key)
        status="left-only" if rr is None else "same" if encoded(lr["value"])==encoded(rr["value"]) else "changed"
        rows.append({"ordinal":len(rows),"sourceIndex":lr["sourceIndex"],"status":status,"left":lr,"right":rr});counts[status]+=1
    for rr in rd["rows"]:
        if tuple(rr["sourceIndex"]) not in left_keys:
            rows.append({"ordinal":len(rows),"sourceIndex":rr["sourceIndex"],"status":"right-only","left":None,"right":rr});counts["right-only"]+=1
    require(len(rows)<=MAX_ROWS,"ZARR_COMPARISON_LIMIT","The complete comparison exceeds two million original index positions")
    context={"left":left,"right":right,"pairing":"source-index","meaning":MEANING,
             "metadataEqual":encoded(left["metadata"])==encoded(right["metadata"]),
             "sourceEditionEqual":left["source"]["sourceSha256"]==right["source"]["sourceSha256"],
             "arrayPathEqual":left["result"]["array"]==right["result"]["array"],
             "dtypeEqual":left["result"]["dtype"]==right["result"]["dtype"],
             "sourceShapeEqual":left["result"]["sourceShape"]==right["result"]["sourceShape"],
             "leftRows":ld["rowCount"],"rightRows":rd["rowCount"]}
    data={"schema":SCHEMA,"workspaceId":workspace.meta("id"),"operationId":op["id"],"createdAt":op["created"],
          "title":name,"note":note,"context":context,"counts":counts,"rowCount":len(rows),"rows":rows}
    raw=encoded(data);require(len(raw)<=MAX_BYTES,"ZARR_COMPARISON_LIMIT","The complete typed comparison exceeds 96 MiB; choose smaller explicit selections")
    sha=digest(raw);ident=value_digest({"operationId":op["id"],"contentSha256":sha})
    folder=workspace.root/"comparisons"/op["id"]
    files={}
    for fmt,content in (("json",raw),("csv",csv_report(data)),("html",html_report(data))):
        require(len(content)<=MAX_REPORT_BYTES,"ZARR_COMPARISON_LIMIT","A complete comparison report exceeds 384 MiB; choose smaller explicit selections")
        path=folder/("comparison."+fmt);publish(path,content)
        files[fmt]={"file":str(path.relative_to(workspace.root)),"bytes":len(content),"sha256":digest(content)}
    return {"id":ident,"title":name,"note":note,"createdAt":op["created"],"operationId":op["id"],
            "leftResultId":left["result"]["id"],"rightResultId":right["result"]["id"],
            "leftContentSha256":left["result"]["contentSha256"],"rightContentSha256":right["result"]["contentSha256"],
            "pairing":"source-index","contentSha256":sha,"rowCount":len(rows),"counts":counts,"files":files}

def read(workspace,item):
    path=relative(item["files"]["json"]["file"])
    require(path=="comparisons/"+item["operationId"]+"/comparison.json","ZARR_COMPARISON_CHANGED","Comparison path changed",409)
    raw=read_file(workspace.root/path,MAX_BYTES)
    require({"bytes":len(raw),"sha256":digest(raw)}=={k:item["files"]["json"][k] for k in ("bytes","sha256")} and
            digest(raw)==item["contentSha256"],"ZARR_COMPARISON_CHANGED","The complete retained comparison changed",409)
    data=json.loads(raw)
    require(data["schema"]==SCHEMA and data["workspaceId"]==workspace.meta("id") and
            data["operationId"]==item["operationId"] and data["title"]==item["title"] and data["note"]==item["note"] and
            data["rowCount"]==len(data["rows"])==item["rowCount"] and data["counts"]==item["counts"] and
            item["id"]==value_digest({"operationId":item["operationId"],"contentSha256":item["contentSha256"]}),
            "ZARR_COMPARISON_CHANGED","Retained comparison metadata changed",409)
    for side in ("left","right"):
        result=workspace.entity("results",item[side+"ResultId"])
        require(result==data["context"][side]["result"] and result["contentSha256"]==item[side+"ContentSha256"],
                "ZARR_COMPARISON_CHANGED","Original comparison result binding changed",409)
    return data

def report_file(workspace,item,fmt):
    require(fmt in ("json","csv","html"),"ZARR_COMPARISON_FORMAT","Choose JSON, CSV or HTML")
    read(workspace,item)
    selected=item["files"][fmt];path=relative(selected["file"])
    require(path=="comparisons/"+item["operationId"]+"/comparison."+fmt,"ZARR_COMPARISON_CHANGED","Report path changed",409)
    require(file_identity(workspace.root/path,MAX_REPORT_BYTES)=={k:selected[k] for k in ("bytes","sha256")},
            "ZARR_COMPARISON_CHANGED","The complete comparison report changed",409)
    return {"id":item["id"],"format":fmt,"path":str(workspace.root/path),"name":"Zarr_Comparison_"+item["id"]+"."+fmt,
            "bytes":selected["bytes"],"sha256":selected["sha256"],
            "contentType":{"json":"application/json; charset=utf-8","csv":"text/csv; charset=utf-8","html":"text/html; charset=utf-8"}[fmt]}

def csv_report(data):
    out=io.StringIO(newline="");writer=csv.writer(out,lineterminator="\n")
    writer.writerow(("comparison_operation","left_result","right_result","ordinal","source_index_json","status",
                     "left_original_row_json","right_original_row_json"))
    c=data["context"]
    for row in data["rows"]:
        # JSON cells retain explicit types and begin with JSON punctuation; never spreadsheet formulas.
        writer.writerow((data["operationId"],c["left"]["result"]["id"],c["right"]["result"]["id"],row["ordinal"],
                         encoded(row["sourceIndex"]).decode().rstrip("\n"),row["status"],
                         encoded(row["left"]).decode().rstrip("\n"),encoded(row["right"]).decode().rstrip("\n")))
    return out.getvalue().encode("utf-8")

def html_report(data):
    esc=lambda v:html.escape(str(v),quote=True)
    def detail(label,value):
        return "<details><summary>"+esc(label)+"</summary><pre>"+esc(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False))+"</pre></details>"
    sections=[]
    for side in ("left","right"):
        c=data["context"][side]
        sections.append("<section><h2>"+side.title()+" original result</h2><p>"+esc(c["result"]["title"])+"</p>"+
                        detail("Complete source, selection, native metadata and retained review context",c)+"</section>")
    cells=[]
    for r in data["rows"]:
        def v(row):return '<span class="absent">Absent from this selection</span>' if row is None else "<pre>"+esc(json.dumps(row,ensure_ascii=False,indent=2,allow_nan=False))+"</pre>"
        cells.append("<tr><th scope=\"row\">"+str(r["ordinal"])+"</th><td>"+esc(json.dumps(r["sourceIndex"]))+"</td><td>"+esc(r["status"])+"</td><td>"+v(r["left"])+"</td><td>"+v(r["right"])+"</td></tr>")
    css="body{font:16px/1.5 system-ui,sans-serif;color:#20262d;background:#f6f7f8;margin:0}main{max-width:1500px;margin:auto;padding:2rem}h1{font-size:2rem}section,header{background:white;border:1px solid #ccd2d8;border-radius:8px;padding:1.25rem;margin-bottom:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.45 ui-monospace,monospace;margin:0}details{margin:.6rem 0}summary{cursor:pointer;font-weight:600}.table{overflow:auto}table{border-collapse:collapse;width:100%;background:white}td,th{border:1px solid #ccd2d8;padding:.65rem;text-align:left;vertical-align:top}thead{background:#e9edf0}.absent{color:#58616a}.note{white-space:pre-wrap;overflow-wrap:anywhere}.counts{display:flex;gap:1rem;flex-wrap:wrap}@media(max-width:640px){main{padding:.6rem}h1{font-size:1.5rem}td,th{min-width:6rem;padding:.4rem}}@media print{body{background:white}main{max-width:none;padding:0}section,header{break-inside:avoid}.table{overflow:visible}pre{font-size:9pt}thead{display:table-header-group}}"
    counts="".join("<span><strong>"+esc(k)+"</strong>: "+str(v)+"</span>" for k,v in data["counts"].items())
    return ("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>"+esc(data["title"])+"</title><style>"+css+"</style><main><header><p>Retained Zarr result comparison</p><h1>"+esc(data["title"])+"</h1><p>"+esc(MEANING)+"</p><p class=\"note\">"+esc(data["note"])+"</p><div class=\"counts\">"+counts+"</div>"+detail("Original comparison identity",{k:data[k] for k in ("workspaceId","operationId","createdAt","rowCount")})+"</header>"+"".join(sections)+"<section><h2>Complete original cell population</h2><p>All "+str(data["rowCount"])+" paired or unmatched index positions. “same” means identical typed JSON representation; it is not a scientific equivalence decision.</p><div class=\"table\"><table><thead><tr><th>Row</th><th>Original source index</th><th>Representation</th><th>Left original row</th><th>Right original row</th></tr></thead><tbody>"+"".join(cells)+"</tbody></table></div></section></main></html>\n").encode("utf-8")
