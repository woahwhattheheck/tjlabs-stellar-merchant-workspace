#!/usr/bin/env python3
"""Continue the original invoice sources as a complete saved SQL customer project."""
from __future__ import annotations
import argparse, hashlib, json, os, sys, tempfile
from pathlib import Path

HERE=Path(__file__).resolve().parent
PREPARATION=HERE.parents[2]/"sf30-seller-sdk"/"data-preparation"
sys.path.insert(0,str(PREPARATION))
sys.path.insert(0,str(PREPARATION/"pipelines"))
from preparation import Workspace, digest, dumps
from engine import PipelineWorkspace, canonical, validate_definition
from delivery import export_project

OPERATION="SCF-JOB-RESULT-PACKAGES-0B8D-20261012"
PHASE="pipeline-commissioning"
PID="p_"+hashlib.sha256((OPERATION+":"+PHASE).encode()).hexdigest()[:32]
LABEL="Original supplier invoice reconciliation"
SQL="""SELECT l.invoiceId,l.lineId,l.sku,l.currency,l.quantity,l.chargedMinor,
p.unitPriceMinor,
CASE WHEN p.unitPriceMinor IS NULL THEN NULL ELSE decimal_mul(l.quantity,p.unitPriceMinor) END AS expectedMinor,
CASE WHEN p.unitPriceMinor IS NULL THEN NULL ELSE decimal_sub(l.chargedMinor,decimal_mul(l.quantity,p.unitPriceMinor)) END AS varianceMinor,
CASE WHEN p.unitPriceMinor IS NULL THEN
 CASE WHEN EXISTS(SELECT 1 FROM prices allprices WHERE allprices.sku=l.sku) THEN 'CURRENCY_MISMATCH' ELSE 'UNKNOWN_SKU' END
 WHEN decimal_cmp(l.chargedMinor,decimal_mul(l.quantity,p.unitPriceMinor))=0 THEN 'MATCH'
 WHEN decimal_cmp(l.chargedMinor,decimal_mul(l.quantity,p.unitPriceMinor))>0 THEN 'OVERCHARGED'
 ELSE 'UNDERCHARGED' END AS state
FROM ledger l LEFT JOIN prices p ON p.sku=l.sku AND p.currency=l.currency
ORDER BY l.invoiceId,l.lineId"""
TOTALS="""SELECT currency,COUNT(*) AS lines,
SUM(CASE WHEN expectedMinor IS NOT NULL THEN 1 ELSE 0 END) AS pricedLines,
SUM(CASE WHEN expectedMinor IS NULL THEN 1 ELSE 0 END) AS unpricedLines,
decimal_sum(chargedMinor) AS allChargedMinor,
decimal_sum(CASE WHEN expectedMinor IS NOT NULL THEN chargedMinor ELSE '0' END) AS pricedChargedMinor,
decimal_sum(COALESCE(expectedMinor,'0')) AS expectedMinor,
decimal_sum(COALESCE(varianceMinor,'0')) AS varianceMinor
FROM reconciled GROUP BY currency ORDER BY currency"""
COUNTS="SELECT state,COUNT(*) AS records FROM reconciled GROUP BY state ORDER BY state"
EXCEPTIONS="SELECT * FROM reconciled WHERE state<>'MATCH' ORDER BY invoiceId,lineId"

def need(ok,message):
    if not ok: raise ValueError(message)

def body(path,maximum=64*1024*1024):
    p=Path(path)
    need(p.is_file() and not p.is_symlink(),"Select an ordinary complete original file")
    raw=p.read_bytes()
    need(len(raw)<=maximum,"Original input exceeds its declared allowance")
    return raw

def read(path):
    return json.loads(body(path))

def ident(path):
    raw=body(path)
    return {"bytes":len(raw),"sha256":hashlib.sha256(raw).hexdigest()}

def put(path,value):
    p=Path(path);p.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    raw=value if isinstance(value,bytes) else (canonical(value)+"\n").encode()
    if p.exists():
        need(body(p)==raw,"Retain the original phase file: "+str(p));return
    fd,tmp=tempfile.mkstemp(prefix=".commissioning-",dir=p.parent)
    try:
        with os.fdopen(fd,"wb") as stream:
            stream.write(raw);stream.flush();os.fsync(stream.fileno())
        try:os.link(tmp,p)
        except FileExistsError:need(body(p)==raw,"Original phase file changed")
        d=os.open(p.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(d)
        finally:os.close(d)
    finally:os.unlink(tmp)

def originals(checkout):
    source=read(checkout)
    need(source.get("operation")==OPERATION and source.get("result")=="PASS",
         "Continue the complete original paid result-package checkout")
    fixture=Path(source["fixtureDirectory"]).resolve(strict=True)
    expected=source["inputFiles"]["originalInputFiles"]
    paths={"ledger":fixture/"input-originals/invoice-ledger.ndjson",
           "prices":fixture/"input-originals/supplier-prices.json"}
    for slot,p in paths.items():
        need(ident(p)==expected[slot],"Original retained "+slot+" bytes changed")
    ledger=[json.loads(line) for line in body(paths["ledger"]).splitlines() if line.strip()]
    book=read(paths["prices"])
    need(len(ledger)==6000 and book.get("schema")=="supplier-pricebook.v1",
         "Use the original complete 6000-row supplier case")
    seen=set();price_keys=set()
    for row in ledger:
        key=(row["invoiceId"],row["lineId"]);need(key not in seen,"Duplicate original invoice line");seen.add(key)
        need(type(row["quantity"]) is int and row["quantity"]>0 and str(row["chargedMinor"]).isdigit(),
             "Preserve exact original quantity and integer minor units")
    for row in book["prices"]:
        key=(row["sku"],row["currency"]);need(key not in price_keys,"Duplicate original price");price_keys.add(key)
        need(str(row["unitPriceMinor"]).isdigit(),"Preserve exact original price minor units")
    return source,paths,ledger,book

def definition(inputs):
    return {"label":LABEL,"description":"Complete original paid-job input rows, exact minor-unit arithmetic, original prices and all exceptions.",
      "inputs":inputs,"stages":[
       {"id":"reconciled","label":"Every original invoice line","sql":SQL,"parameters":{},
        "bindings":{"ledger":{"input":"ledger"},"prices":{"input":"prices"}}},
       {"id":"counts","label":"Complete status counts","sql":COUNTS,"parameters":{},
        "bindings":{"reconciled":{"stage":"reconciled"}}},
       {"id":"totals","label":"Exact currency totals","sql":TOTALS,"parameters":{},
        "bindings":{"reconciled":{"stage":"reconciled"}}},
       {"id":"exceptions","label":"All original exceptions","sql":EXCEPTIONS,"parameters":{},
        "bindings":{"reconciled":{"stage":"reconciled"}}}],
      "outputs":["reconciled","counts","totals","exceptions"]}

def seed(args):
    source,paths,ledger,book=originals(args.checkout)
    root=Path(args.workspace).resolve();phase=root.parent
    expected={"schema":"stellar-forge.preparation-original-invoice-source.v1","operation":OPERATION,
      "phase":PHASE,"checkout":ident(args.checkout),"originalJob":source["outputFiles"]["jobId"],
      "originalPackage":source["outputFiles"]["package"],
      "sources":source["inputFiles"]["originalInputFiles"],"records":len(ledger),
      "priceBookReference":book["reference"],"pipelineId":PID}
    put(phase/"original-input-selection.json",expected)
    price_rows=phase/"supplier-prices.jsonl"
    put(price_rows,b"".join((canonical(row)+"\n").encode() for row in book["prices"]))
    native=Workspace(root,create=not (root/'workspace.json').exists(),label=LABEL)
    l=native.import_file(paths["ledger"],"ledger","jsonl",label="Original 6000 invoice lines")
    p=native.import_file(price_rows,"prices","jsonl",label=book["reference"])
    need(l["sha256"]==expected["sources"]["ledger"]["sha256"] and l["rows"]==6000,"Exact ledger intake changed")
    pipeline=PipelineWorkspace(root); selected=definition({"ledger":l["id"],"prices":p["id"]})
    try:saved=pipeline.definition(PID,1)
    except ValueError:saved=pipeline.save(selected,pipeline_id=PID,expected_revision=0)
    need(saved["id"]==PID and saved["revision"]==1 and
         {k:v for k,v in saved.items() if k not in ("id","revision","createdAt")}==validate_definition(selected,native),
         "Retain the original saved SQL edition")
    archive=phase/"original-pipeline-project.zip"
    marker=phase/"original-project-export.json"
    if marker.exists():
        value=read(marker);need(ident(archive)==value["archive"],"Original complete exported project changed")
    else:
        if archive.exists():
            # The prior completed export may have preceded its receipt. Validate
            # its complete original project and selected source before adoption.
            from delivery import receive_project
            with tempfile.TemporaryDirectory(dir=phase,prefix=".verify-export-") as tmp:
                destination=Path(tmp)/"workspace";receive_project(archive,destination)
                restored=PipelineWorkspace(destination)
                need(restored.definition(PID,1)==saved,"Interrupted original project export differs")
                need(restored.native.get("sources",l["id"])==l and restored.native.get("sources",p["id"])==p,
                     "Interrupted project export sources differ")
                with restored.connection() as db:
                    snapshot=restored.snapshot(db)
                need(len(snapshot["definitions"])==1 and not snapshot["executions"],
                     "Unexpected state in original unexecuted export")
        else:export_project(pipeline,archive)
        value={"schema":"stellar-forge.preparation-original-project.v1","operation":OPERATION,
               "phase":PHASE,"archive":ident(archive),"pipeline":saved,
               "sourceSelection":expected,"workspace":str(root),"path":str(archive)}
        put(marker,value)
    return value

def rows(workspace,eid,stage):
    offset=0;result=[]
    while True:
        page=workspace.rows(eid,stage,offset,200)
        result.extend(dict(zip(page["columns"],values)) for values in page["rows"])
        offset=page["nextOffset"]
        if offset is None:return result

def verify(args):
    _,_,ledger,book=originals(args.checkout)
    root=Path(args.workspace).resolve(strict=True);workspace=PipelineWorkspace(root)
    retained=read(root/"commissioned-job.json")
    need(retained.get("status")=="COMPLETE" and retained["job"]["functionId"]=="executePipeline",
         "Receive the complete actual pipeline job first")
    execution=workspace.execution(retained["executionId"])
    need(execution["status"]=="COMPLETE" and execution["pipelineId"]==PID,"Original SQL execution changed")
    full=rows(workspace,execution["id"],"reconciled")
    exceptions=rows(workspace,execution["id"],"exceptions")
    counts=rows(workspace,execution["id"],"counts");totals=rows(workspace,execution["id"],"totals")
    need(len(full)==6000 and len(exceptions)==4000,"The complete original invoice population is required")
    need({r["state"]:int(r["records"]) for r in counts}==
         {"MATCH":2000,"OVERCHARGED":1000,"UNDERCHARGED":1000,"UNKNOWN_SKU":1000,"CURRENCY_MISMATCH":1000},
         "Original reconciliation counts differ")
    price={(r["sku"],r["currency"]):int(r["unitPriceMinor"]) for r in book["prices"]}
    skus={r["sku"] for r in book["prices"]};by_key={(r["invoiceId"],r["lineId"]):r for r in full}
    sums={}
    for original in ledger:
        r=by_key[(original["invoiceId"],original["lineId"])]
        for k in ("invoiceId","lineId","sku","currency","quantity","chargedMinor"):
            need(str(r[k])==str(original[k]),"An original invoice field changed")
        unit=price.get((original["sku"],original["currency"]))
        expected=None if unit is None else unit*original["quantity"]
        variance=None if expected is None else int(original["chargedMinor"])-expected
        state=("CURRENCY_MISMATCH" if original["sku"] in skus else "UNKNOWN_SKU") if expected is None else (
              "MATCH" if variance==0 else "OVERCHARGED" if variance>0 else "UNDERCHARGED")
        need(r["state"]==state and r["expectedMinor"]==(None if expected is None else str(expected)) and
             r["varianceMinor"]==(None if variance is None else str(variance)),
             "Original exact invoice reconciliation differs")
        t=sums.setdefault(original["currency"],dict(lines=0,pricedLines=0,unpricedLines=0,allChargedMinor=0,
             pricedChargedMinor=0,expectedMinor=0,varianceMinor=0))
        t["lines"]+=1;t["allChargedMinor"]+=int(original["chargedMinor"])
        if expected is None:t["unpricedLines"]+=1
        else:
            t["pricedLines"]+=1;t["pricedChargedMinor"]+=int(original["chargedMinor"])
            t["expectedMinor"]+=expected;t["varianceMinor"]+=variance
    need(len(totals)==len(sums),"Complete currency totals are required")
    for r in totals:
        need({k:int(r[k]) for k in sums[r["currency"]]}==sums[r["currency"]],
             "SQL currency totals differ from the full original source")
    before=canonical(execution)
    if args.action=="advance":
        later=definition(execution["definition"]["inputs"]);later["description"]+=" Independent customer continuation."
        selected=workspace.definition(PID)
        if selected["revision"]==1:selected=workspace.save(later,pipeline_id=PID,expected_revision=1)
        need(selected["revision"]==2 and selected["description"]==later["description"],"Retain the customer's second edition")
        following=workspace.enqueue(PID,OPERATION+":"+PHASE+":customer-edition-2",revision=2,
                                    reuse_execution=execution["id"])
        if following["status"]!="COMPLETE":
            following=workspace.execute(following["id"],resume=following["status"] not in ("QUEUED",))
        need(following["status"]=="COMPLETE","Complete the independent customer continuation")
        need(len(rows(workspace,following["id"],"reconciled"))==6000,"Customer continuation lost original rows")
        need(canonical(workspace.execution(execution["id"]))==before,"Original delivered execution changed")
    result={"schema":"stellar-forge.preparation-original-invoice-received.v1","operation":OPERATION,
      "phase":PHASE,"workspace":str(root),"originalExecutionId":execution["id"],
      "originalExecutionSha256":hashlib.sha256(before.encode()).hexdigest(),"records":len(full),
      "exceptions":len(exceptions),"counts":counts,"totals":totals,"currentRevision":workspace.definition(PID)["revision"]}
    if args.action=="advance":result["customerExecutionId"]=following["id"]
    return result

def main():
    os.umask(0o077)
    p=argparse.ArgumentParser();p.add_argument("action",choices=("seed","verify","advance"))
    p.add_argument("--checkout",required=True,type=Path);p.add_argument("--workspace",required=True,type=Path)
    args=p.parse_args();result=seed(args) if args.action=="seed" else verify(args)
    print(canonical(result),flush=True)
if __name__=="__main__":main()
