"""Retained source editions, reviewed selections and original-operation recovery."""
from __future__ import annotations
import base64, contextlib, fcntl, json, math, os, re, sqlite3, stat, time, uuid, zipfile
from pathlib import Path
from files import (require, object_fields, encoded, digest, value_digest, relative, private_directory,
                   sync_directory, destination, read_file, read_json, file_identity, publish, atomic_json,
                   tree_manifest, verify_tree, copy_file, ZarrWorkspaceError)
import native

SCHEMA="stellar-forge.zarr-workspace.v1"
HASH=re.compile(r"^[a-f0-9]{64}$")
UUID=re.compile(r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$")
def now():return time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
def identity(value):
    require(isinstance(value,str) and HASH.fullmatch(value),"ZARR_ID","Choose a retained source, selection, result or review ID");return value
def title(value):
    require(isinstance(value,str) and 0<len(value.strip())<=200,"ZARR_TITLE","Enter a title of at most 200 characters");return value.strip()
def request_id(value):
    require(isinstance(value,str) and UUID.fullmatch(value),"ZARR_REQUEST_ID","Retain one original UUID for this operation");return value
@contextlib.contextmanager
def workspace_lock(root):
    fd=os.open(root/"operation.lock",os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ZarrWorkspaceError("ZARR_WORKSPACE_BUSY","The original native operation still owns this workspace",409)
        yield
    finally:os.close(fd)

class Workspace:
    def __init__(self,directory,create=False,readonly=False):
        self.root=Path(directory)
        if create:
            require(not self.root.exists(),"ZARR_WORKSPACE_EXISTS","Reopen the existing original workspace",409)
            private_directory(self.root,True)
        private_directory(self.root)
        db=self.root/"workspace.sqlite"
        if not create:require(db.is_file() and not db.is_symlink(),"ZARR_WORKSPACE_MISSING","The original source database is missing",404)
        self.db=sqlite3.connect(str(db) if create else db.as_uri()+("?mode=ro" if readonly else "?mode=rw"),uri=not create,timeout=10)
        self.db.row_factory=sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.readonly=readonly
        if create:
            os.chmod(db,0o600)
            self.db.executescript("""
            PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
            CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS selections(id TEXT PRIMARY KEY,data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS results(id TEXT PRIMARY KEY,data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,result_id TEXT NOT NULL,data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,request_sha TEXT NOT NULL,request TEXT NOT NULL,
                admitted_revision INTEGER NOT NULL,state TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,
                result TEXT,error TEXT);
            """)
        if create:
            with self.db:
                for key,value in (("schema",SCHEMA),("id",str(uuid.uuid4())),("revision",0),("createdAt",now())):
                    self.db.execute("INSERT INTO meta VALUES(?,?)",(key,json.dumps(value)))
            for name in ("sources","selections","results","frozen","exports","operation-artifacts"):
                (self.root/name).mkdir(mode=0o700)
            sync_directory(self.root)
        require(self.meta("schema")==SCHEMA,"ZARR_WORKSPACE_SCHEMA","Select an original Zarr workspace")
    def close(self):self.db.close()
    def __enter__(self):return self
    def __exit__(self,*args):self.close()
    def meta(self,key):
        row=self.db.execute("SELECT value FROM meta WHERE key=?",(key,)).fetchone()
        return json.loads(row["value"]) if row else None
    def entity(self,table,ident):
        require(table in ("sources","selections","results","reviews"),"ZARR_TABLE","Unknown retained entity")
        row=self.db.execute("SELECT data FROM "+table+" WHERE id=?",(identity(ident),)).fetchone()
        require(row is not None,"ZARR_NOT_FOUND","Retained "+table+" item not found",404)
        return json.loads(row["data"])
    def items(self,table):
        return [json.loads(x["data"]) for x in self.db.execute("SELECT data FROM "+table+" ORDER BY rowid DESC")]
    def operation(self,ident):
        row=self.db.execute("SELECT * FROM operations WHERE id=?",(request_id(ident),)).fetchone()
        require(row is not None,"ZARR_OPERATION_NOT_FOUND","No accepted receipt exists for that original request",404)
        out=dict(row)
        for key in ("request","result","error"):
            if out[key] is not None:out[key]=json.loads(out[key])
        return out
    def status(self):
        with self.read_snapshot():return self._status()
    @contextlib.contextmanager
    def read_snapshot(self):
        owned=not self.db.in_transaction
        if owned:self.db.execute("BEGIN")
        try:yield
        finally:
            if owned:self.db.rollback()
    def frozen_items(self):
        return [json.loads(row["result"])["item"] for row in self.db.execute("SELECT result FROM operations WHERE state='COMPLETE' AND json_extract(request,'$.action')='freeze' ORDER BY rowid DESC")]
    def frozen_source(self,ident):
        matches=[x for x in self.frozen_items() if x["id"]==identity(ident)]
        require(len(matches)==1,"ZARR_FROZEN_NOT_FOUND","The selected reviewed source is not retained",404)
        item=matches[0];path=self.root/relative(item["file"])
        require(file_identity(path)=={"bytes":item["sourceBytes"],"sha256":item["sourceSha256"]},"ZARR_FROZEN_CHANGED","Retained reviewed source bytes changed",409)
        return {**item,"sourceFile":str(path)}
    def _status(self):
        return {"schema":SCHEMA,"workspaceId":self.meta("id"),"revision":self.meta("revision"),
                "sources":self.items("sources"),"selections":self.items("selections"),"results":self.items("results"),
                "reviews":self.items("reviews"),"frozen":self.frozen_items(),
                "operations":[self.operation(x["id"]) for x in self.db.execute("SELECT id FROM operations ORDER BY rowid DESC LIMIT 100")]}
    def read_result(self,ident,offset=0,limit=100):
        item=self.entity("results",ident)
        require(type(offset) is int and offset>=0 and type(limit) is int and 1<=limit<=500,"ZARR_PAGE","Use a non-negative offset and 1–500 rows")
        content=read_json(self.root/item["file"])
        require(value_digest(content)==item["contentSha256"],"ZARR_RESULT_CHANGED","Retained native result changed",409)
        return {"result":item,"rows":content["rows"][offset:offset+limit],"offset":offset,
                "next":offset+limit if offset+limit<content["rowCount"] else None,"total":content["rowCount"]}
    def begin(self,request):
        object_fields(request,("id","action","expectedRevision","input"),("id","action","expectedRevision","input"))
        ident=request_id(request["id"]);sha=value_digest(request)
        row=self.db.execute("SELECT id FROM operations WHERE id=?",(ident,)).fetchone()
        if row:
            original=self.operation(ident)
            require(original["request_sha"]==sha,"ZARR_OPERATION_CONFLICT","This UUID already binds a different original request",409)
            if original["state"]=="COMPLETE":return original,True
            require(original["state"]!="ABANDONED","ZARR_OPERATION_ABANDONED","This original operation was explicitly closed; its files and request remain retained",409)
            require(original["admitted_revision"]==self.meta("revision"),"ZARR_OPERATION_REVISION_CHANGED",
                    "The retained interrupted operation no longer matches the original workspace revision",409)
            with self.db:self.db.execute("UPDATE operations SET state='RUNNING',updated=?,error=NULL WHERE id=?",(now(),ident))
            return self.operation(ident),False
        require(type(request["expectedRevision"]) is int and request["expectedRevision"]==self.meta("revision"),
                "ZARR_REVISION_CONFLICT","Reload the current workspace revision before preparing this operation",409)
        unresolved=self.db.execute("SELECT id FROM operations WHERE state IN ('RUNNING','INTERRUPTED') LIMIT 1").fetchone()
        require(unresolved is None or (request["action"]=="abandon" and isinstance(request["input"],dict) and request["input"].get("operationId")==unresolved["id"]),
                "ZARR_ORIGINAL_OPERATION_PENDING","Resume or explicitly close the retained original operation before starting another",409)
        require(isinstance(request["input"],dict),"ZARR_FIELDS","Operation input must be an object")
        with self.db:self.db.execute("INSERT INTO operations VALUES(?,?,?,?,?,?,?,?,?)",
            (ident,sha,json.dumps(request),self.meta("revision"),"RUNNING",now(),now(),None,None))
        return self.operation(ident),False
    def commit(self,operation,table,item):
        next_revision=self.meta("revision")+1
        result={"operationId":operation["id"],"state":"COMPLETE","revision":next_revision,"item":item}
        with self.db:
            if table=="abandon":
                self.db.execute("UPDATE operations SET state='ABANDONED',updated=?,error=? WHERE id=? AND state IN ('RUNNING','INTERRUPTED')",
                    (now(),json.dumps({"code":"ZARR_OPERATION_ABANDONED","message":item["reason"],"closedBy":operation["id"]}),item["operationId"]))
            elif table=="reviews":
                self.db.execute("INSERT INTO reviews VALUES(?,?,?)",(item["id"],item["resultId"],json.dumps(item)))
            elif table:
                self.db.execute("INSERT INTO "+table+" VALUES(?,?)",(item["id"],json.dumps(item)))
            self.db.execute("UPDATE meta SET value=? WHERE key='revision'",(json.dumps(next_revision),))
            self.db.execute("UPDATE operations SET state='COMPLETE',updated=?,result=?,error=NULL WHERE id=?",
                            (now(),json.dumps(result),operation["id"]))
        return result
    def execute(self,request):
        require(not self.readonly,"ZARR_READ_ONLY","Open the original workspace for an explicit mutation")
        with workspace_lock(self.root):
            op,replayed=self.begin(request)
            if replayed:return {**op["result"],"replayed":True}
            try:
                actions={"import":self.import_source,"selection":self.save_selection,"run":self.run_selection,
                         "review":self.review_result,"freeze":self.freeze_result,"abandon":self.abandon_operation}
                require(request["action"] in actions,"ZARR_ACTION","Choose an existing source-workspace action")
                table,item=actions[request["action"]](op,request["input"])
                return self.commit(op,table,item)
            except BaseException as e:
                code=getattr(e,"code","ZARR_NATIVE_INTERRUPTED")
                with self.db:self.db.execute("UPDATE operations SET state='INTERRUPTED',updated=?,error=? WHERE id=?",
                    (now(),json.dumps({"code":code,"message":str(e)[:1000]}),op["id"]))
                raise
    def abandon_operation(self,op,value):
        object_fields(value,("operationId","reason"),("operationId","reason"),"close interrupted operation")
        original=self.operation(value["operationId"])
        require(original["id"]!=op["id"] and original["state"] in ("RUNNING","INTERRUPTED"),"ZARR_OPERATION_STATE","Only a non-running-owner interrupted original operation can be closed",409)
        require(isinstance(value["reason"],str) and 1<=len(value["reason"].strip())<=4000,"ZARR_OPERATION_REASON","Retain the reason for closing this original request")
        return "abandon",{"operationId":original["id"],"requestSha256":original["request_sha"],"reason":value["reason"].strip(),"artifactsPreserved":True}
    def import_source(self,op,value):
        object_fields(value,("path","kind","root","title","provenance","maxBytes","maxFiles","expectedSha256"),
                      ("path","kind","title","provenance"),"source input")
        require(value["kind"] in ("directory","zip"),"ZARR_SOURCE_KIND","Choose a complete directory or ZIP store")
        source=Path(value["path"]);require(source.is_absolute(),"ZARR_SOURCE_PATH","Select an absolute original source path")
        expected=value.get("expectedSha256")
        if expected is not None:
            require(value["kind"]=="zip" and isinstance(expected,str) and HASH.fullmatch(expected),
                    "ZARR_SOURCE_HASH","An expected source hash selects one exact original ZIP")
        name=title(value["title"]);require(isinstance(value["provenance"],dict),"ZARR_SOURCE_PROVENANCE","Retain the original source attribution and acquisition")
        maximum=value.get("maxBytes",512*1024*1024);max_files=value.get("maxFiles",100000)
        require(type(maximum) is int and 1<=maximum<=1024*1024*1024 and type(max_files) is int and 1<=max_files<=100000,
                "ZARR_SOURCE_LIMIT","Declare at most 1 GiB and 100,000 complete source members")
        folder=self.root/"sources"/op["id"];folder.mkdir(mode=0o700,exist_ok=True)
        selected=folder/"selection.json";store=folder/"store";store.mkdir(mode=0o700,exist_ok=True)
        prefix=relative(value.get("root",""),allow_root=True).rstrip("/")
        if selected.exists():selection=read_json(selected)
        elif value["kind"]=="directory":
            require(not prefix,"ZARR_SOURCE_ROOT","A directory source already selects its complete store root")
            rows=tree_manifest(source,max_files,maximum)
            selection={"kind":"directory","files":rows,"originalPath":str(source)}
            publish(selected,encoded(selection))
        else:
            if not (folder/"original.zip").exists():
                copy_file(source,folder/"original.zip",maximum=maximum)
            retained_zip=file_identity(folder/"original.zip",maximum)
            require(expected is None or retained_zip["sha256"]==expected,"ZARR_SOURCE_HASH_CHANGED",
                    "The retained original ZIP differs from the declared input hash",409)
            with zipfile.ZipFile(folder/"original.zip") as archive:
                all_names=[];rows=[];total=0
                for member in archive.infolist():
                    if member.is_dir():continue
                    original=relative(member.filename)
                    require(original not in all_names,"ZARR_SOURCE_MEMBER","ZIP contains duplicate members");all_names.append(original)
                    mode=stat.S_IFMT(member.external_attr>>16)
                    require(mode in (0,stat.S_IFREG),"ZARR_SOURCE_MEMBER","ZIP links and special members are not imported")
                    require(not member.flag_bits&1,"ZARR_SOURCE_MEMBER","Encrypted ZIP members are not supported")
                    if prefix:
                        if not original.startswith(prefix+"/"):continue
                        rel=original[len(prefix)+1:]
                    else:rel=original
                    require(member.file_size<=min(maximum,128*1024*1024),"ZARR_SOURCE_LIMIT","A complete source member exceeds the explicit 128 MiB member limit")
                    b=archive.read(member);total+=len(b)
                    require(len(rows)<max_files and total<=maximum,"ZARR_SOURCE_LIMIT","Expanded ZIP exceeds the complete source declaration")
                    rows.append({"path":relative(rel),"member":original,"bytes":len(b),"sha256":digest(b)})
                require(rows,"ZARR_SOURCE_ROOT","The selected original ZIP root contains no complete store")
            selection={"kind":"zip","zip":file_identity(folder/"original.zip",maximum),"root":prefix,"files":sorted(rows,key=lambda x:x["path"])}
            publish(selected,encoded(selection))
        if selection["kind"]=="directory":
            for row in selection["files"]:
                b=read_file(source/row["path"],min(maximum,128*1024*1024))
                require({"bytes":len(b),"sha256":digest(b)}=={k:row[k] for k in ("bytes","sha256")},
                        "ZARR_SOURCE_CHANGED","Original directory changed; preserve this attempt and select a new source edition",409)
                publish(destination(store,row["path"]),b)
            require(tree_manifest(source,max_files,maximum)==selection["files"],"ZARR_SOURCE_CHANGED",
                    "The original store member population or bytes changed during capture",409)
        else:
            require(file_identity(folder/"original.zip",maximum)==selection["zip"],"ZARR_SOURCE_CHANGED","Retained original ZIP changed",409)
            require(expected is None or selection["zip"]["sha256"]==expected,"ZARR_SOURCE_HASH_CHANGED",
                    "The retained original ZIP differs from the declared input hash",409)
            with zipfile.ZipFile(folder/"original.zip") as archive:
                for row in selection["files"]:
                    b=archive.read(row["member"])
                    require(digest(b)==row["sha256"] and len(b)==row["bytes"],"ZARR_SOURCE_CHANGED","Retained ZIP member changed",409)
                    publish(destination(store,row["path"]),b)
        members=[{k:row[k] for k in ("path","bytes","sha256")} for row in selection["files"]]
        verify_tree(store,members)
        inspection_file=folder/"inspection.json"
        if inspection_file.exists():inspection=read_json(inspection_file)
        else:
            inspection=native.inspect_store(store);publish(inspection_file,encoded(inspection))
        require(inspection.get("schema")=="stellar-forge.zarr-native-inspection.v1" and inspection.get("readOnly") is True and
                inspection.get("engine",{}).get("version")==native.ENGINE_VERSION and
                value_digest(inspection.get("nodes"))==inspection.get("metadataSha256"),"ZARR_INSPECTION_CHANGED","Retained native inspection is not its original complete observation",409)
        source_digest=value_digest(members)
        item={"id":value_digest({"operation":op["id"],"sourceSha256":source_digest,"provenance":value["provenance"]}),
              "title":name,"createdAt":op["created"],"file":str((folder/"source.json").relative_to(self.root)),
              "store":str(store.relative_to(self.root)),"sourceSha256":source_digest,
              "sourceBytes":sum(r["bytes"] for r in members),"memberCount":len(members),
              "provenance":value["provenance"],"inspection":inspection,
              "captureAtomic":value["kind"]=="zip","directoryReadConsistency":"complete before/after exact member verification" if value["kind"]=="directory" else None}
        publish(folder/"source.json",encoded({"schema":"stellar-forge.zarr-retained-source.v1","item":item,"files":members,"selection":selection}))
        return "sources",item
    def checked_source(self,ident):
        item=self.entity("sources",ident);saved=read_json(self.root/item["file"])
        require(saved["item"]==item and value_digest(saved["files"])==item["sourceSha256"],"ZARR_SOURCE_CHANGED","Source receipt changed",409)
        verify_tree(self.root/item["store"],saved["files"])
        return item,saved
    def save_selection(self,op,value):
        object_fields(value,("sourceId","array","axes","title","maxCells","maxNativeBytes"),("sourceId","array","axes","title"),"selection")
        source,_=self.checked_source(value["sourceId"])
        matches=[x for x in source["inspection"]["nodes"] if x["path"]==value["array"] and x["nodeType"]=="array"]
        require(len(matches)==1,"ZARR_SELECTION","Choose an array from the original source inventory")
        array=matches[0];_,positions=native.normalize_selection(array["shape"],value["axes"])
        max_cells=value.get("maxCells",250000);max_bytes=value.get("maxNativeBytes",64*1024*1024)
        require(type(max_cells) is int and 0<max_cells<=1000000 and type(max_bytes) is int and 0<max_bytes<=512*1024*1024,
                "ZARR_RESULT_LIMIT","Declare bounded full-result cell and native-memory limits")
        count=math.prod(len(x) for x in positions)
        require(count<=max_cells,"ZARR_RESULT_LIMIT","Selected cell population exceeds the explicit limit")
        item={"id":value_digest({"request":op["id"],"input":value}),"createdAt":op["created"],"title":title(value["title"]),
              "sourceId":source["id"],"sourceSha256":source["sourceSha256"],"array":array["path"],
              "metadataSha256":array["metadataSha256"],"axes":value["axes"],"selectedCellCount":count,
              "maxCells":max_cells,"maxNativeBytes":max_bytes}
        publish(self.root/"selections"/(item["id"]+".json"),encoded(item));return "selections",item
    def run_selection(self,op,value):
        object_fields(value,("selectionId",),("selectionId",),"native run")
        plan=self.entity("selections",value["selectionId"]);source,_=self.checked_source(plan["sourceId"])
        require(source["sourceSha256"]==plan["sourceSha256"],"ZARR_SELECTION_CHANGED","Original source selection differs",409)
        folder=self.root/"results"/op["id"];folder.mkdir(mode=0o700,exist_ok=True);output=folder/"native-result.json"
        if output.exists():result=read_json(output,32*1024*1024)
        else:
            result=native.extract(self.root/source["store"],plan,plan["maxCells"],plan["maxNativeBytes"])
            result.update(sourceId=source["id"],sourceSha256=source["sourceSha256"],selectionId=plan["id"],operationId=op["id"])
            output_bytes=encoded(result)
            require(len(output_bytes)<=32*1024*1024,"ZARR_RESULT_LIMIT","The complete typed JSON result exceeds the explicit 32 MiB result limit")
            publish(output,output_bytes)
        require(result["selectionId"]==plan["id"] and result["operationId"]==op["id"] and result["sourceSha256"]==source["sourceSha256"],
                "ZARR_RESULT_BINDING","Retained native result belongs to another original selection",409)
        item={"id":value_digest({"operationId":op["id"],"contentSha256":value_digest(result)}),"createdAt":op["created"],
              "title":plan["title"],"selectionId":plan["id"],"sourceId":source["id"],"sourceSha256":source["sourceSha256"],
              "file":str(output.relative_to(self.root)),"contentSha256":value_digest(result),"rowCount":result["rowCount"],
              "shape":result["shape"],"sourceShape":result["sourceShape"],"array":result["array"],"dtype":result["dtype"],
              "engine":result["engine"]}
        return "results",item
    def review_result(self,op,value):
        object_fields(value,("resultId","contentSha256","decision","comment"),("resultId","contentSha256","decision","comment"),"review")
        result=self.entity("results",value["resultId"])
        require(result["contentSha256"]==value["contentSha256"],"ZARR_REVIEW_CHANGED","Review the retained exact native result",409)
        self.read_result(result["id"],0,1)
        require(value["decision"] in ("accepted","needs-changes","rejected"),"ZARR_REVIEW","Choose a result decision")
        require(isinstance(value["comment"],str) and 1<=len(value["comment"].strip())<=4000,"ZARR_REVIEW","Record the interpretation and source limitations")
        item={"id":value_digest({"operationId":op["id"],"input":value}),"createdAt":op["created"],"resultId":result["id"],
              "contentSha256":result["contentSha256"],"decision":value["decision"],"comment":value["comment"].strip()}
        return "reviews",item
    def freeze_result(self,op,value):
        object_fields(value,("resultId","reviewId","title","valueType"),("resultId","reviewId","title","valueType"),"public source")
        result=self.entity("results",value["resultId"]);review=self.entity("reviews",value["reviewId"])
        latest=self.db.execute("SELECT id FROM reviews WHERE result_id=? ORDER BY rowid DESC LIMIT 1",(result["id"],)).fetchone()
        require(review["resultId"]==result["id"] and review["contentSha256"]==result["contentSha256"] and
                review["decision"]=="accepted" and latest["id"]==review["id"],"ZARR_REVIEW_REQUIRED","Use the current accepted review of this exact result",409)
        require(value["valueType"] in ("text","number","boolean"),"ZARR_PUBLIC_TYPE","Choose an explicit public scalar type")
        data=read_json(self.root/result["file"]);require(value_digest(data)==result["contentSha256"],"ZARR_RESULT_CHANGED","Retained result changed",409)
        def scalar(c):
            if value["valueType"]=="text":
                if c["kind"] in ("text","integer","float"):return c["value"]
                if c["kind"]=="boolean":return "true" if c["value"] else "false"
                return encoded(c).decode().rstrip("\n")
            if value["valueType"]=="boolean":
                require(c["kind"]=="boolean","ZARR_PUBLIC_TYPE","Every native value must be boolean");return c["value"]
            require(c["kind"] in ("integer","float"),"ZARR_PUBLIC_TYPE","Every native value must be a finite safe number")
            n=int(c["value"]) if c["kind"]=="integer" else float(c["value"])
            require(math.isfinite(n) and (c["kind"]!="integer" or abs(n)<=9007199254740991) and
                    not (isinstance(n,float) and n==0 and math.copysign(1,n)<0),
                    "ZARR_PUBLIC_PRECISION","Use text to preserve large integers, negative zero or non-finite values")
            return n
        rows=[{"row_id":result["contentSha256"]+":"+str(r["ordinal"]),"ordinal":r["ordinal"],
               "source_index":json.dumps(r["sourceIndex"],separators=(",",":")),"value":scalar(r["value"])} for r in data["rows"]]
        description={"schema":"stellar-forge.zarr-dataset-source.v1","title":title(value["title"]),
                     "query":"selected","columns":{"row_id":{"type":"text","nullable":False},
                     "ordinal":{"type":"number","nullable":False},"source_index":{"type":"text","nullable":False},
                     "value":{"type":value["valueType"],"nullable":False}},"rows":rows,
                     "origin":{"provider":"zarr-python","engine":result["engine"],"sourceId":result["sourceId"],
                               "sourceSha256":result["sourceSha256"],"resultId":result["id"],"resultSha256":result["contentSha256"],
                               "array":result["array"],"dtype":result["dtype"],"shape":result["shape"],
                               "selection":data["selection"],"sourceShape":result["sourceShape"],"rowCount":len(rows)},
                     "review":review}
        source_bytes=encoded(description);folder=self.root/"frozen"/op["id"];folder.mkdir(mode=0o700,exist_ok=True)
        publish(folder/"source.json",source_bytes)
        item={"id":digest(source_bytes),"title":description["title"],"file":str((folder/"source.json").relative_to(self.root)),
              "sourceSha256":digest(source_bytes),"sourceBytes":len(source_bytes),"resultId":result["id"],
              "reviewId":review["id"],"rowCount":len(rows),"valueType":value["valueType"],"createdAt":op["created"]}
        publish(folder/"receipt.json",encoded(item));return None,item
