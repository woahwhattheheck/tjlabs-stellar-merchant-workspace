#!/usr/bin/env python3
"""Receive the complete SF74 runtime and operate its original economics course.
Usage: python3 receive.py source-carrier.json /ABS/private/economics-receiving
Uses installed Node, Python, Playwright and Chromium. No package installation.
"""
import base64, fcntl, gzip, hashlib, json, os, pathlib, shutil, signal, subprocess, sys, time, traceback
OPERATION = "SF74-PRIVATE-ECONOMICS-A238-20261013"
EXPECTED = "8bec9f9f675a8b7b4e517aab742189aeba325481b933a354b2c3424ba413f4b8"
PROBE = "const fs=require('node:fs'),path=require('node:path');\nconst roots=[process.cwd(),process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,process.env.CODEX_PRIMARY_RUNTIME_ROOT,\n'/usr/local/lib/node_modules','/opt/node_modules','/workspace/node_modules',...(process.env.NODE_PATH||'').split(path.delimiter)].filter(Boolean);\nlet selected;\nfor(const name of ['playwright','playwright-core']){\n try{\n  const resolved=require.resolve(name,{paths:roots}),module=require(resolved);\n  if(!module.chromium)continue;\n  const esm=path.join(path.dirname(resolved),'index.mjs');\n  const candidates=[process.env.CHROMIUM_EXECUTABLE_PATH,process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,\n   module.chromium.executablePath(),'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/opt/google/chrome/chrome'].filter(Boolean);\n  const chromium=candidates.find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());\n  if(chromium){selected={node:process.execPath,playwright:fs.existsSync(esm)?esm:resolved,chromium};break;}\n }catch(error){}\n}\nif(!selected)throw new Error('The complete receiving course requires an installed Playwright module and Chromium executable. Supply their existing paths in the documented example command.');\nprocess.stdout.write(JSON.stringify(selected)+'\\n');"
def digest(data): return hashlib.sha256(data).hexdigest()
def retain(path,data):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    if path.is_symlink(): raise ValueError("Retained path is a symlink: "+str(path))
    if path.exists():
        if path.read_bytes()!=data: raise ValueError("Retained bytes differ: "+str(path))
        return
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as file: file.write(data);file.flush();os.fsync(file.fileno())
    directory=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
    try: os.fsync(directory)
    finally: os.close(directory)
def encoded(value): return (json.dumps(value,indent=2,ensure_ascii=False)+"\n").encode()
def main():
    if len(sys.argv)!=3: raise ValueError(__doc__)
    carrier_path=pathlib.Path(sys.argv[1])
    root=pathlib.Path(sys.argv[2])
    if not root.is_absolute() or root==pathlib.Path("/") or root.resolve()!=root: raise ValueError("Use one absolute normalized private output directory.")
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    lock=open(root/".receiving.lock","a+b")
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    raw=carrier_path.read_bytes()
    if digest(raw)!=EXPECTED: raise ValueError("Select the exact complete source carrier.")
    carrier=json.loads(raw)
    if carrier["schema"]!="commons.gzip-source-carrier.v1": raise ValueError("Wrong complete carrier schema.")
    compressed=base64.b64decode(carrier["content_base64"],validate=True)
    if len(compressed)!=carrier["gzip_bytes"] or digest(compressed)!=carrier["gzip_sha256"]: raise ValueError("Compressed source changed.")
    data=gzip.decompress(compressed)
    if len(data)!=carrier["decoded_bytes"] or digest(data)!=carrier["decoded_sha256"]: raise ValueError("Complete decoded source changed.")
    bank=json.loads(data)
    if bank["schema"]!="commons.sf74.complete-runtime-source.v1" or len(bank["files"])!=456: raise ValueError("Wrong selected source.")
    source=root/"source";seen=set();total=0
    for item in bank["files"]:
        relative=pathlib.PurePosixPath(item["path"])
        if relative.is_absolute() or ".." in relative.parts or str(relative)!=item["path"] or item["path"] in seen:
            raise ValueError("Unsafe or duplicated source path.")
        seen.add(item["path"]);body=item["content"].encode()
        if len(body)!=item["bytes"] or digest(body)!=item["sha256"]: raise ValueError("Source changed: "+item["path"])
        selected=source/pathlib.Path(relative)
        if selected.parent.resolve()!=selected.parent: raise ValueError("A source parent is redirected.")
        retain(selected,body);total+=len(body)
    if total!=carrier["source_bytes"]: raise ValueError("Complete source byte count changed.")
    retain(root/"source-carrier.json",raw)
    retain(root/"selected-source.json",encoded({"operation":OPERATION,"carrier_sha256":EXPECTED,"files":456,"source_bytes":total}))
    node=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
    if not node or not pathlib.Path(node).is_file(): raise RuntimeError("Use the installed Node executable.")
    retain(root/"installed-browser.cjs",PROBE.encode())
    probe=subprocess.run([node,str(root/"installed-browser.cjs")],cwd=source,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
    retain(root/"installed-browser.stdout",probe.stdout);retain(root/"installed-browser.stderr",probe.stderr)
    if probe.returncode: raise RuntimeError(probe.stderr.decode(errors="replace"))
    runtime=json.loads(probe.stdout);retain(root/"installed-runtime.json",encoded(runtime))
    course=root/"operator-course"
    executable=source/"stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial/economics-example.mjs"
    argv=[runtime["node"],str(executable),"--out",str(course),"--port","18774","--receive",
          "--playwright",runtime["playwright"],"--chromium",runtime["chromium"],"--python",sys.executable]
    retained_request={"operation":OPERATION,"argv":argv,"cwd":str(source),"source_sha256":EXPECTED}
    retain(root/"native-request.json",encoded(retained_request))
    done=root/"complete.json"
    if done.exists():
        result=json.loads(done.read_bytes())
        for item in result["screenshots"]:
            if digest(pathlib.Path(item["path"]).read_bytes())!=item["sha256"]: raise ValueError("Retained screenshot changed.")
        print(json.dumps(result),flush=True)
        return
    attempt=1
    while (root/("course-"+str(attempt)+".stdout")).exists(): attempt+=1
    output=root/("course-"+str(attempt)+".stdout");error=root/("course-"+str(attempt)+".stderr")
    print(json.dumps({"operation":OPERATION,"state":"OPERATING","files":456,"source_bytes":total,"directory":str(root),"output":str(output)}),flush=True)
    child=None
    def stop(signum,frame):
        if child is not None and child.poll() is None:
            os.killpg(child.pid,signum)
        raise KeyboardInterrupt("Original receiving owner requested signal "+str(signum))
    old={sig:signal.signal(sig,stop) for sig in (signal.SIGINT,signal.SIGTERM)}
    try:
        with open(output,"xb") as stdout,open(error,"xb") as stderr:
            child=subprocess.Popen(argv,cwd=source,stdout=stdout,stderr=stderr,start_new_session=True,pass_fds=(lock.fileno(),))
            try: code=child.wait(timeout=900)
            finally:
                if child.poll() is None:
                    os.killpg(child.pid,signal.SIGTERM)
                    try: child.wait(timeout=20)
                    except subprocess.TimeoutExpired: os.killpg(child.pid,signal.SIGKILL);child.wait()
        if code: raise RuntimeError("Original course exit "+str(code)+": "+error.read_text()[-6000:])
        result=json.loads((course/"receiving-course/result.json").read_bytes())
        if result.get("state")!="COMPLETE": raise RuntimeError("Original receiving course did not complete.")
        screenshots=result["browser"]["screenshots"]
        final={"operation":OPERATION,"state":"COMPLETE","directory":str(root),"original_result":str(course/"receiving-course/result.json"),
               "screenshots":screenshots,"case":result["selection"],"received":result["received"],"source_sha256":EXPECTED,
               "visual_inspection":"Open the retained actual screenshots and operate the application at desktop and narrow widths."}
        retain(done,encoded(final));print(json.dumps(final),flush=True)
    finally:
        for sig,handler in old.items(): signal.signal(sig,handler)
if __name__=="__main__":
    try: main()
    except BaseException as error:
        print(json.dumps({"operation":OPERATION,"state":"STOPPED","error":str(error),"type":type(error).__name__}),flush=True)
        raise
