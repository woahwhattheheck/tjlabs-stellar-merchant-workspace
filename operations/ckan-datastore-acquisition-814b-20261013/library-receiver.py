import os,sys,json,pathlib,subprocess,tempfile,traceback
known_browser=pathlib.Path("/workspace/scratch/5403360e55a4/counterpress-capture-runtime/bin/chromium")
if not payload.get("browserExecutable") and not os.environ.get("CKAN_ACQUISITION_BROWSER_EXECUTABLE") and known_browser.is_file() and os.access(known_browser,os.X_OK):
    payload["browserExecutable"]=str(known_browser)
native_status=1
try:
    exec(compile(payload.pop("nativeRunner"),"<original-native-runner>","exec"))
except SystemExit as ended:
    native_status=ended.code if isinstance(ended.code,int) else 1
except BaseException as error:
    print(json.dumps({"phase":"controller-error","error":str(error),"trace":traceback.format_exc()}),flush=True)
output_root=pathlib.Path(payload.get("workDirectory","/dev/commons-ckan-acquisition-814b")).absolute()
if output_root.is_dir():
    helper_root=pathlib.Path(tempfile.mkdtemp(prefix="ckan-acquisition-library-",dir=str(output_root)))
    for name,body in payload["libraryHelpers"].items():
        if name not in ("library_upload.py","library_hosted_apps.py","library_file_transfer.py"): raise ValueError("helper path")
        (helper_root/name).write_text(body,encoding="utf8")
    artifacts=[output_root/"acquisition-result.json",output_root/"operator"/"complete-acquisition-workspace.ckanw",output_root/"acquisition-journey-record.json",output_root/"native-acquisition.log",output_root/"Rendered_Product_Views.zip",output_root/"rendered-product"/"rendered-index.json"]
    uploads=[{"local_path":str(path),"purpose":"create_library_file","library_artifact_type":"report" if path.suffix==".json" else "other"} for path in artifacts if path.is_file()]
    if uploads:
        saved=subprocess.run([sys.executable,str(helper_root/"library_upload.py")],input=json.dumps({"uploads":uploads}),text=True,capture_output=True,timeout=180,check=False)
        print(json.dumps({"phase":"saved-native-delivery","returncode":saved.returncode,"stdout":saved.stdout,"stderr":saved.stderr}),flush=True)
        if saved.returncode and native_status==0:native_status=1
    else:
        print(json.dumps({"phase":"saved-native-delivery","state":"NO_OUTPUT","native_returncode":native_status}),flush=True)
print(json.dumps({"phase":"original-controller-final","returncode":native_status}),flush=True)

if payload.get("holdForRenderedInspection") and (output_root/"rendered-product"/"rendered-index.json").is_file():
    import base64,hashlib,stat
    index=json.loads((output_root/"rendered-product"/"rendered-index.json").read_text())
    approved={entry["file"]:entry for entry in index.get("images",[])}
    print(json.dumps({"phase":"rendered-inspection-ready","images":list(approved.values()),"native_returncode":native_status}),flush=True)
    for line in sys.stdin:
        try:
            command=json.loads(line)
            if command.get("action")=="close":break
            if command.get("action")!="rendered-file" or command.get("file") not in approved:raise ValueError("select a retained rendered image")
            name=command["file"];path=output_root/"rendered-product"/name;entry=approved[name]
            info=path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.geteuid() or info.st_size!=entry["bytes"]:raise ValueError("rendered image changed")
            with path.open("rb") as incoming:
                actual_sha=hashlib.file_digest(incoming,"sha256").hexdigest()
                if actual_sha!=entry["sha256"]:raise ValueError("rendered image hash changed")
                offset=command.get("offset",0);length=command.get("length",12288)
                if type(offset) is not int or type(length) is not int or offset<0 or offset>info.st_size or length<1 or length>12288:raise ValueError("rendered image range")
                incoming.seek(offset);part=incoming.read(length)
            print(json.dumps({"phase":"rendered-image-chunk","file":name,"offset":offset,"bytes":len(part),
                "size":info.st_size,"sha256":actual_sha,"base64":base64.b64encode(part).decode("ascii")}),flush=True)
        except Exception as error:
            print(json.dumps({"phase":"rendered-image-error","error":str(error)}),flush=True)

sys.exit(native_status)
