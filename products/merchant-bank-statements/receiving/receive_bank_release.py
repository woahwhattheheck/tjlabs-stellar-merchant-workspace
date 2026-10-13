import base64, hashlib, json, os, pathlib, shutil, signal, stat, subprocess, sys, tempfile, time, zipfile, zlib, urllib.request
configuration = sys.argv[1]
payload = json.loads(configuration if configuration.lstrip().startswith("{") else pathlib.Path(configuration).read_text(encoding="utf-8"))
root = pathlib.Path(tempfile.mkdtemp(prefix="dff77-bank-product-release-", dir="/dev"))
for name in ["logs", "helpers", "runner", "delivery"]:
    (root/name).mkdir()
env=dict(os.environ)
env["GIT_TERMINAL_PROMPT"]="0"
env["TMPDIR"]=str(root)
env["npm_config_cache"]=str(root/"npm-cache")
journal=[]
saved=[]
saved_by_path={}
pending_saves={}
uncertain_saves={}
active_child_pid=None
last_checkpoint_blob_count=0
source_receipt=None
def emit(value):
    print(json.dumps(value, separators=(",",":")),flush=True)
def identity(data):
    return {"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),"git_blob_sha1":hashlib.sha1(("blob "+str(len(data))+"\0").encode()+data).hexdigest()}
def file_identity(path):
    h=hashlib.sha256(); size=0
    with pathlib.Path(path).open("rb") as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b""):
            size+=len(chunk);h.update(chunk)
    return {"bytes":size,"sha256":h.hexdigest()}
def put(row,folder):
    data=row["content"].encode("utf-8")
    if identity(data)!={k:row[k] for k in ["bytes","sha256","git_blob_sha1"]}:
        raise ValueError("Original source identity: "+row["path"])
    path=folder/row["path"]
    path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
def run(name,args,cwd=None,timeout=600,acceptable=(0,)):
    global active_child_pid
    out=root/"logs"/(name+".stdout")
    err=root/"logs"/(name+".stderr")
    observations=root/"logs"/(name+".observations.jsonl")
    emit({"stage":name,"status":"started"})
    start=time.monotonic()
    stderr_offset=0
    stderr_pending=b""
    next_observation=0
    last_progress=None
    with out.open("wb") as stdout,err.open("wb") as stderr:
        proc=subprocess.Popen(args,cwd=cwd,env=env,stdout=stdout,stderr=stderr,start_new_session=True)
        active_child_pid=proc.pid
        try:
            while True:
                code=proc.poll()
                elapsed=time.monotonic()-start
                if name.startswith("source-build-"):
                    with err.open("rb") as source:
                        source.seek(stderr_offset)
                        chunk=source.read(128*1024)
                        stderr_offset+=len(chunk)
                    stderr_pending+=chunk
                    lines=stderr_pending.split(b"\n")
                    stderr_pending=lines.pop()
                    if len(stderr_pending)>256*1024:
                        stderr_pending=b""
                    for line in lines:
                        try: event=json.loads(line.decode("utf-8"))
                        except (UnicodeError,ValueError): continue
                        if not isinstance(event,dict):continue
                        selected={key:event[key] for key in (
                            "phase","files","totalFiles","sourceFiles","bytes","totalBytes","sourceCommit",
                            "copiedFiles","resumedFiles","reusedFiles","writtenBytes","archiveBytes","sha256",
                            "requested","missing","objects","count","status","code","message"
                        ) if key in event and (event[key] is None or isinstance(event[key],(str,int,float,bool)))}
                        if "missingObjects" in event and isinstance(event["missingObjects"],list):
                            selected["missingObjectCount"]=len(event["missingObjects"])
                        if selected and selected!=last_progress:
                            emit({"stage":name,"status":"original-progress",**selected})
                            last_progress=selected
                if elapsed>=next_observation or code is not None:
                    observation={"stage":name,"elapsedSeconds":round(elapsed,3),**process_observation(proc.pid)}
                    with observations.open("a",encoding="utf-8") as record:
                        record.write(json.dumps(observation,separators=(",",":"))+"\n")
                    emit(observation)
                    next_observation=elapsed+30
                if code is not None:break
                if elapsed>=timeout:
                    os.killpg(proc.pid,signal.SIGTERM)
                    try:proc.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        os.killpg(proc.pid,signal.SIGKILL);proc.wait()
                    code=124
                    break
                time.sleep(1)
        except BaseException:
            if proc.poll() is None:
                try:os.killpg(proc.pid,signal.SIGTERM)
                except ProcessLookupError:pass
                try:proc.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid,signal.SIGKILL);proc.wait()
            raise
        finally:
            active_child_pid=None
    item={"stage":name,"exit_code":code,"seconds":round(time.monotonic()-start,3),"stdout":out.name,"stderr":err.name,"observations":observations.name}
    journal.append(item)
    write_json_atomic(root/"delivery"/"operation-journal.json",journal)
    emit(item)
    if code not in acceptable:
        emit({"stage":name,"stdout":out.read_text(errors="replace")[-4000:],"stderr":err.read_text(errors="replace")[-12000:]})
        raise RuntimeError(name+" exited "+str(code))
    return out.read_bytes()
def save_paths(label,paths):
    requests=[]
    for path in paths:
        if str(path) in pending_saves or str(path) in uncertain_saves:
            raise RuntimeError("Reconcile the original saved-file request before repeating its write: "+path.name)
    for path in paths:
        prior=saved_by_path.get(str(path))
        item={"local_path":str(path),"purpose":"replace_library_file" if prior else "create_library_file"}
        if prior:
            item["library_file_id"]=prior["library_file_id"]
            version=prior.get("version_id",prior.get("version"))
            if isinstance(version,int) and not isinstance(version,bool):
                item["expected_current_version"]=version
            elif isinstance(version,str) and version.isdigit():
                item["expected_current_version"]=int(version)
        else:
            item["library_artifact_type"]="other"
        requests.append(item)
    for path in paths:
        pending_saves[str(path)]={"label":label,"local_path":str(path),**file_identity(path)}
    try:
        result=subprocess.run([sys.executable,str(root/"helpers"/"library_upload.py")],input=json.dumps({"uploads":requests}).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,timeout=600)
    except BaseException:
        for path in paths:uncertain_saves[str(path)]=pending_saves.pop(str(path))
        raise
    (root/"logs"/(label+".stdout")).write_bytes(result.stdout)
    (root/"logs"/(label+".stderr")).write_bytes(result.stderr)
    try:response=json.loads(result.stdout)
    except ValueError:
        for path in paths:uncertain_saves[str(path)]=pending_saves.pop(str(path))
        emit({"stage":label,"exit_code":result.returncode,"stderr":result.stderr.decode(errors="replace")[-5000:]})
        raise RuntimeError("Source artifact saving returned no complete result: "+label)
    rows=response.get("results",[])
    complete=len(rows)==len(paths)
    current=[]
    for index,path in enumerate(paths):
        row=rows[index] if index<len(rows) else {}
        if row.get("local_path") and pathlib.Path(row["local_path"])!=pathlib.Path(path):
            raise ValueError("Saved artifact path mismatch")
        if row.get("status")=="succeeded" and row.get("library_file_id"):
            stored={**row,**file_identity(path)}
            saved.append(stored);current.append(stored);saved_by_path[str(path)]=stored
            pending_saves.pop(str(path),None)
        else:
            uncertain_saves[str(path)]=pending_saves.pop(str(path))
            complete=False
    emit({"stage":label,"exit_code":result.returncode,"files":current})
    if result.returncode or not complete:
        raise RuntimeError("Source artifact saving incomplete: "+label)
    return rows
def logs_archive(name):
    target=root/"delivery"/name
    with zipfile.ZipFile(target,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for path in sorted((root/"logs").rglob("*")):
            if path.is_file() and not any(part.startswith(("save-","read-checkpoint")) for part in path.relative_to(root/"logs").parts):
                archive.write(path,"logs/"+path.relative_to(root/"logs").as_posix())
        archive.writestr("operation-journal.json",json.dumps(journal,indent=2)+"\n")
    return target

def producer_identity():
    retained = globals().get("RECEIVING_PROGRAM_ID")
    if isinstance(retained, dict) and set(("bytes", "sha256", "git_blob_sha1")) <= set(retained):
        return {key: retained[key] for key in ("bytes", "sha256", "git_blob_sha1")}
    path = pathlib.Path(globals().get("__file__", sys.argv[0]))
    if not path.is_file():
        raise ValueError("Use the complete retained receiving programme")
    return identity(path.read_bytes())

def process_observation(pid=None):
    value = {"observed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    for name in ("memory.current", "memory.max"):
        path = pathlib.Path("/sys/fs/cgroup") / name
        try:
            raw = path.read_text().strip()
            value[name] = int(raw) if raw.isdigit() else raw
        except OSError:
            pass
    if pid is not None:
        try:
            rows = {}
            for line in (pathlib.Path("/proc")/str(pid)/"status").read_text().splitlines():
                if ":" in line:
                    key, item = line.split(":", 1)
                    if key in ("Name", "State", "VmRSS", "VmHWM", "VmSize", "Threads"):
                        rows[key] = item.strip()
            value["process"] = {"pid": pid, **rows}
        except OSError:
            value["process"] = {"pid": pid, "status": "closed"}
    return value

def checkpoint_member(name):
    path = pathlib.PurePosixPath(name)
    if (not name or path.is_absolute() or "\\" in name or "\0" in name or
        any(part in ("", ".", "..") for part in name.split("/"))):
        raise ValueError("The original continuation member has an invalid relative path")
    if not (name == "source-continuation.json" or name.startswith(("git-objects/", "build/", "logs/"))):
        raise ValueError("The continuation contains an unrelated member")
    return path

def write_json_atomic(path, value):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(value, ensure_ascii=False, indent=2)+"\n").encode("utf-8")
    descriptor, temporary = tempfile.mkstemp(prefix=".bank-release-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        pathlib.Path(temporary).unlink(missing_ok=True)

def inspect_checkpoint(archive):
    members = archive.infolist()
    if len(members) > 50000 or sum(row.file_size for row in members) > 512*1024*1024:
        raise ValueError("The complete source/build continuation exceeds the original receiver capacity")
    names = set()
    for member in members:
        name = member.filename
        if name != "continuation.json":
            checkpoint_member(name)
        if name in names or member.is_dir() or stat.S_ISLNK(member.external_attr >> 16):
            raise ValueError("The original continuation repeats a member or contains a symbolic link")
        names.add(name)
    if archive.getinfo("continuation.json").file_size > 16*1024*1024:
        raise ValueError("The continuation inventory exceeds its complete file bound")
    manifest = json.loads(archive.read("continuation.json"))
    if (manifest.get("schema") != "stellar-forge.bank-release-checkpoint.v1" or
        manifest.get("operation_id") != payload["operation_id"] or
        manifest.get("sourceCommit") != payload["commit"] or
        manifest.get("selection") != payload["selection"] or
        manifest.get("producer") != producer_identity()):
        raise ValueError("Use the same complete producer and original selected source for this continuation")
    records = manifest.get("files", [])
    expected = {row["path"]: row for row in records}
    if len(expected) != len(records) or set(expected) | {"continuation.json"} != names:
        raise ValueError("The complete continuation inventory differs")
    for name, row in expected.items():
        checkpoint_member(name)
        member = archive.getinfo(name)
        if member.file_size != row["bytes"] or not stat.S_ISREG(member.external_attr >> 16):
            raise ValueError("The original continuation member length or ordinary type differs: "+name)
        if stat.S_IMODE(member.external_attr >> 16)!=row.get("mode"):
            raise ValueError("The original continuation member mode differs: "+name)
        with archive.open(member) as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        if digest != row["sha256"]:
            raise ValueError("The original continuation member bytes differ: "+name)
        if row.get("mode") not in (0o600, 0o644, 0o700, 0o755):
            raise ValueError("The continuation member mode is unsupported")
    state = json.loads(archive.read("source-continuation.json"))
    if (state.get("schema") != "stellar-forge.bank-release-source-continuation.v1" or
        state.get("operation_id") != payload["operation_id"] or
        state.get("sourceCommit") != payload["commit"] or
        state.get("sourceTree") != manifest.get("sourceTree") or
        state.get("selection") != payload["selection"] or
        state.get("producer") != producer_identity()):
        raise ValueError("The receiving state differs from its original complete source")
    return manifest, state

def save_build_checkpoint(reason):
    global last_checkpoint_blob_count
    checkpoint_target=root/"delivery"/"merchant-bank-statements-source-and-build.zip"
    if str(checkpoint_target) in pending_saves or str(checkpoint_target) in uncertain_saves:
        raise RuntimeError("The original checkpoint save is retained for reconciliation")
    if "repo" not in globals() or not repo.is_dir() or "by_sha" not in globals():
        return None
    if globals().get("active_child_pid") is not None:
        raise ValueError("Finish the original source/build child before checkpointing its files")
    items = []
    for path in sorted((repo/"objects").glob("*/*")):
        if path.is_symlink():
            raise ValueError("An original Git cache member is a symbolic link")
        if not path.is_file():
            continue
        relative = path.relative_to(repo/"objects").as_posix()
        compact = relative.replace("/", "")
        if len(compact) != 40 or any(char not in "0123456789abcdef" for char in compact):
            continue
        items.append(("git-objects/"+relative, path))
    release = root/"release"
    if release.exists():
        for path in sorted(release.rglob("*")):
            if path.is_symlink():
                raise ValueError("The original selected build contains a symbolic link")
            if path.is_file():
                relative = path.relative_to(release)
                if relative.parts[0] in ("npm-cache", "pack-tmp"):
                    continue
                items.append(("build/"+relative.as_posix(), path))
    for path in sorted((root/"logs").rglob("*")):
        if path.is_symlink():
            raise ValueError("A receiving output is a symbolic link")
        if path.is_file() and not any(part.startswith(("save-", "read-checkpoint")) for part in path.relative_to(root/"logs").parts):
            items.append(("logs/"+path.relative_to(root/"logs").as_posix(), path))
    state = {
        "schema": "stellar-forge.bank-release-source-continuation.v1",
        "operation_id": payload["operation_id"], "sourceCommit": payload["commit"],
        "sourceTree": actual_tree, "selection": payload["selection"],
        "producer": producer_identity(), "completedBuildPass": globals().get("build_pass", 0),
        "reason": reason, "originalRoot": str(root), "receivedFiles": received_rows,
        "sourceIntake": source_spec, "sourceArchive": globals().get("source_archive_identity"),
        "sourceBase": source_packet["sourceBase"],
        "canonicalSourceChanges": source_packet["canonicalSourceChanges"],
        "builderFiles": payload["builderFiles"], "steps": list(journal),
        "observation": process_observation(),
    }
    state_path = root/"source-continuation.json"
    write_json_atomic(state_path, state)
    items.append(("source-continuation.json", state_path))
    records = []
    for name, path in items:
        checkpoint_member(name)
        observed = path.stat()
        if not stat.S_ISREG(observed.st_mode):
            raise ValueError("Select original ordinary continuation members")
        mode = stat.S_IMODE(observed.st_mode)
        if mode not in (0o600, 0o644, 0o700, 0o755):
            mode = 0o755 if mode & 0o111 else 0o600
        records.append({"path": name, **file_identity(path), "mode": mode})
    manifest = {
        "schema": "stellar-forge.bank-release-checkpoint.v1",
        "operation_id": payload["operation_id"], "sourceCommit": payload["commit"],
        "sourceTree": actual_tree, "selection": payload["selection"],
        "producer": producer_identity(), "completed_through": reason,
        "original_coordinates": {"root": str(root), "repository": str(repo), "output": str(release)},
        "files": records,
    }
    target = root/"delivery"/"merchant-bank-statements-source-and-build.zip"
    temporary = root/"delivery"/("source-and-build-"+str(time.monotonic_ns())+".zip")
    try:
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for (name, path), record in zip(items, records):
                archive.write(path, name)
                archive.getinfo(name).external_attr=(stat.S_IFREG|record["mode"])<<16
            archive.writestr("continuation.json", json.dumps(manifest, ensure_ascii=False, indent=2)+"\n")
        with zipfile.ZipFile(temporary) as archive:
            inspect_checkpoint(archive)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    rows = save_paths("save-source-build-checkpoint", [target])
    last_checkpoint_blob_count = sum(1 for sha in received_objects if sha in by_sha)
    emit({"stage": "source-build-checkpoint", "status": "saved", "reason": reason,
          "receivedBlobObjects": last_checkpoint_blob_count, "files": len(records),
          "artifact": {**rows[0], **file_identity(target)}})
    return rows[0]

def receive_build_checkpoint():
    specification = payload.get("resumeCheckpoint")
    if not specification:
        return None
    if not isinstance(specification, dict):
        raise ValueError("Select the original complete source/build continuation")
    path = pathlib.Path(specification["path"]).resolve(strict=True)
    if path.is_symlink() or not path.is_file() or file_identity(path) != {
        "bytes": specification["bytes"], "sha256": specification["sha256"]
    }:
        raise ValueError("The selected source/build continuation bytes differ")
    restored_rows = []
    relocation = []
    with zipfile.ZipFile(path) as archive:
        manifest, state = inspect_checkpoint(archive)
        if manifest["sourceTree"] != actual_tree:
            raise ValueError("The complete checkpoint selects another original tree")
        allowed_trees = {row["sha"] for row in source_packet["trees"]}
        source_rows = state["receivedFiles"]
        source_ids = {row["git_blob_sha1"] for row in source_rows}
        for record in manifest["files"]:
            name = record["path"]
            if name.startswith("git-objects/"):
                encoded = archive.read(name)
                sha = name.removeprefix("git-objects/").replace("/", "")
                if sha in source_ids and sha in by_sha:
                    maximum = max(row["bytes"] for row in by_sha[sha])+64
                elif sha in allowed_trees:
                    maximum = next(row["bytes"] for row in source_packet["trees"] if row["sha"]==sha)+64
                elif sha==payload["commit"]:
                    maximum = len(source_packet["originalCommitObject"].encode("utf-8"))+64
                else:
                    raise ValueError("The received cache names unrelated source")
                decoder=zlib.decompressobj()
                framed=decoder.decompress(encoded,maximum+1)
                if len(framed)>maximum or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
                    raise ValueError("The received original Git object exceeds its exact source bound")
                header, data = framed.split(b"\0", 1)
                kind, count = header.decode("ascii").split(" ", 1)
                if len(data) != int(count) or hashlib.sha1(framed).hexdigest() != sha:
                    raise ValueError("An original received Git object differs")
                if not ((kind == "blob" and sha in by_sha and sha in source_ids) or
                        (kind == "tree" and sha in allowed_trees) or
                        (kind == "commit" and sha == payload["commit"])):
                    raise ValueError("The received Git cache includes unrelated source")
                put_object(kind, sha, data)
        for row in source_rows:
            original = original_entries.get(row["path"])
            if (not original or original["type"] != "blob" or original["sha"] != row["git_blob_sha1"] or
                original["mode"] != row["mode"] or original["bytes"] != row["bytes"]):
                raise ValueError("A received original file differs from the selected tree")
            object_path = repo/"objects"/row["git_blob_sha1"][:2]/row["git_blob_sha1"][2:]
            framed = zlib.decompress(object_path.read_bytes())
            data = framed.split(b"\0", 1)[1]
            if identity(data) != {key: row[key] for key in ("bytes", "sha256", "git_blob_sha1")}:
                raise ValueError("A received source file differs from its original complete bytes")
            restored_rows.append(row)
        prior_logs = root/"logs"/"prior"/specification["sha256"]
        for record in manifest["files"]:
            name = record["path"]
            if name.startswith("build/"):
                relative = pathlib.PurePosixPath(name.removeprefix("build/"))
                destination = root/"release"/relative
            elif name.startswith("logs/"):
                relative = pathlib.PurePosixPath(name.removeprefix("logs/"))
                destination = prior_logs/relative
            else:
                continue
            if destination.exists() or destination.is_symlink():
                raise ValueError("Receive the original build into a fresh owned directory")
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(name) as incoming, destination.open("xb") as output:
                shutil.copyfileobj(incoming, output, 1024*1024)
            os.chmod(destination, record["mode"])
        receipt = root/"release"/"distribution.json"
        if receipt.is_file():
            original_bytes = receipt.read_bytes()
            value = json.loads(original_bytes)
            before = manifest["original_coordinates"]["output"]
            original_archive = value.get("archive")
            if (not isinstance(original_archive, str) or
                pathlib.PurePosixPath(original_archive).parent.as_posix() != before):
                raise ValueError("The saved original package has an unrelated archive coordinate")
            value["archive"] = str(root/"release"/pathlib.PurePosixPath(original_archive).name)
            write_json_atomic(receipt, value)
            relocation.append({"path": "build/distribution.json", "field": "archive",
                               "before": original_archive, "after": value["archive"],
                               "original_sha256": hashlib.sha256(original_bytes).hexdigest(),
                               "received_sha256": file_identity(receipt)["sha256"]})
        result = {
            "schema": "stellar-forge.bank-release-resume.v1", "operation_id": payload["operation_id"],
            "checkpoint": {"bytes": specification["bytes"], "sha256": specification["sha256"]},
            "sourceCommit": payload["commit"], "sourceTree": actual_tree, "selection": payload["selection"],
            "producer": producer_identity(), "original_coordinates": manifest["original_coordinates"],
            "current_coordinates": {"root": str(root), "repository": str(repo), "output": str(root/"release")},
            "completedBuildPass": state["completedBuildPass"], "receivedFiles": len(restored_rows),
            "relocated_controls": relocation, "original_state": state,
            "meaning": "All original source, Git object identities and package members retain their exact bytes. Only the package receipt's complete local archive coordinate moves to the receiving directory."
        }
        write_json_atomic(root/"delivery"/"merchant-bank-statements-source-resume.json", result)
    known = {(row["path"], row["git_blob_sha1"]) for row in received_rows}
    for row in restored_rows:
        if (row["path"], row["git_blob_sha1"]) not in known:
            received_rows.append(row)
    if specification.get("library_file_id"):
        original_record={"library_file_id":specification["library_file_id"]}
        if specification.get("version_id") is not None:
            original_record["version_id"]=specification["version_id"]
        saved_by_path[str(root/"delivery"/"merchant-bank-statements-source-and-build.zip")]=original_record
    emit({"stage": "source-build-continuation", "status": "received",
          "sourceCommit": payload["commit"], "restoredFiles": len(restored_rows),
          "completedBuildPass": result["completedBuildPass"]})
    return result

def cleanup_expansions():
    removed=[]
    for name in ["repository.git","runner","release","runtime","runtime-received","npm-cache","transfer","receiver","temporary-parts","source-archive.zip"]:
        path=root/name
        if path.exists():
            if path.is_dir():shutil.rmtree(path)
            else:path.unlink()
            removed.append(name)
    emit({"stage":"released-owned-expansions","directories":removed})
for row in payload["libraryHelpers"]:
    put(row,root/"helpers")
(root/"delivery"/"source-operation.json").write_text(json.dumps({k:v for k,v in payload.items() if k!="libraryHelpers"},indent=2)+"\n")
emit({"stage":"start","operation_id":payload["operation_id"],"directory":str(root),"sourceCommit":payload["commit"]})
try:
    git=shutil.which("git");node=shutil.which("node");npm=shutil.which("npm")
    if not all((git,node,npm)):raise RuntimeError("The original product builder requires Git, Node and npm.")
    versions={name:subprocess.check_output([binary,"--version"],env=env,text=True).strip() for name,binary in [("git",git),("node",node),("npm",npm)]}
    emit({"stage":"versions",**versions})
    source_spec=payload["sourceIntake"]
    source_url=source_spec["url"]
    def http_bytes(url,maximum):
        request=urllib.request.Request(url,headers={"Accept":"application/vnd.github.raw+json","User-Agent":"TJ-Labs-original-product-release"})
        chunks=[];count=0
        with urllib.request.urlopen(request,timeout=90) as response:
            while True:
                chunk=response.read(1024*1024)
                if not chunk:break
                count+=len(chunk)
                if count>maximum:raise ValueError("Original source response exceeds its declared intake limit")
                chunks.append(chunk)
        return b"".join(chunks)
    response_bytes=http_bytes(source_url,source_spec["capsule"]["bytes"]*2+1024*1024)
    try:
        response_value=json.loads(response_bytes)
    except (ValueError,UnicodeDecodeError) as error:
        raise ValueError("Original source capsule response is not complete UTF-8 JSON") from error
    if response_value.get("encoding")=="base64" and isinstance(response_value.get("content"),str):
        response_bytes=base64.b64decode("".join(response_value["content"].split()),validate=True)
        response_value=json.loads(response_bytes)
    if identity(response_bytes)!=source_spec["capsule"]:
        raise ValueError("The complete retained source capsule identity differs")
    if response_value.get("schema")!="commons.source-capsule.v1" or response_value.get("encoding")!="deflate-raw":
        raise ValueError("Unsupported retained source capsule")
    packed=base64.b64decode(response_value["data_base64"],validate=True)
    if identity(packed)!=response_value["packed"]:raise ValueError("Packed original source identity differs")
    inflater=zlib.decompressobj(-15)
    original=inflater.decompress(packed,source_spec["original"]["bytes"]+1)
    if not inflater.eof or inflater.unused_data or inflater.unconsumed_tail or len(original)!=source_spec["original"]["bytes"]:
        raise ValueError("Original source capsule is incomplete or exceeds its declared original size")
    if identity(original)!=source_spec["original"] or response_value["original"]!=source_spec["original"]:
        raise ValueError("Expanded original source identity differs")
    source_packet=json.loads(original)
    del response_bytes,response_value,packed,original,inflater
    if source_packet.get("schema")!="stellar-forge.original-git-source-intake.v1":
        raise ValueError("Unexpected original Git source intake schema")
    if source_packet["commit"]!=payload["sourceBaseCommit"] or source_packet["tree"]!=payload["sourceBaseTree"] or source_packet["selection"]!=payload["selection"]:
        raise ValueError("The retained original source base differs")
    if source_packet["operation_id"]!=payload["operation_id"]:
        raise ValueError("The original source operation differs")
    canonical_api="https://api.github.com/repos/woahwhattheheck/tjlabs-stellar-merchant-workspace"
    def original_git_json(suffix,label,maximum=32*1024*1024):
        data=http_bytes(canonical_api+suffix,maximum)
        value=json.loads(data)
        (root/"logs"/(label+".json")).write_bytes(data)
        return value
    current_commit=original_git_json("/git/commits/"+payload["commit"],"canonical-git-commit",1024*1024)
    if current_commit.get("sha")!=payload["commit"]:
        raise ValueError("Canonical Git returned a different pinned commit")
    verification=current_commit.get("verification") or {}
    unsigned=verification.get("payload");signature=verification.get("signature")
    if not isinstance(unsigned,str) or not isinstance(signature,str) or "\n\n" not in unsigned:
        raise ValueError("The exact signed canonical commit body is unavailable")
    boundary=unsigned.index("\n\n")
    original_commit=unsigned[:boundary]+"\ngpgsig "+signature.replace("\n","\n ")+unsigned[boundary:]
    commit_bytes=original_commit.encode("utf-8")
    if hashlib.sha1(("commit "+str(len(commit_bytes))+"\0").encode("ascii")+commit_bytes).hexdigest()!=payload["commit"]:
        raise ValueError("The reconstructed signed canonical commit is not the original Git object")
    current_tree=current_commit["tree"]["sha"]
    if not original_commit.startswith("tree "+current_tree+"\n") or payload.get("sourceTree") not in (None,current_tree):
        raise ValueError("The original signed commit tree differs")
    tree_response=original_git_json("/git/trees/"+current_tree+"?recursive=1","canonical-git-tree")
    if tree_response.get("sha")!=current_tree:
        raise ValueError("Canonical Git returned another source tree")
    if tree_response.get("truncated") is True:
        shallow=original_git_json("/git/trees/"+current_tree,"canonical-git-root")
        current_rows=list(shallow["tree"])
        for index,row in enumerate(shallow["tree"]):
            if row["type"]!="tree":continue
            child=original_git_json("/git/trees/"+row["sha"]+"?recursive=1","canonical-git-subtree-"+str(index))
            if child.get("sha")!=row["sha"] or child.get("truncated") is not False:
                raise ValueError("A complete canonical subtree is unavailable: "+row["path"])
            current_rows.extend({**item,"path":row["path"]+"/"+item["path"]} for item in child["tree"])
    elif tree_response.get("truncated") is False:
        current_rows=tree_response["tree"]
    else:
        raise ValueError("Canonical tree completeness is unspecified")
    current_entries=[]
    current_by_path={}
    for row in current_rows:
        path=row["path"]
        if not isinstance(path,str) or not path or path.startswith("/") or "\\" in path or "\0" in path or any(part in ("",".","..") for part in path.split("/")):
            raise ValueError("Unsafe canonical source path")
        if path in current_by_path:raise ValueError("Duplicate canonical source path: "+path)
        item={"path":path,"mode":row["mode"],"type":row["type"],"sha":row["sha"]}
        if row["type"]=="blob":item["bytes"]=row["size"]
        current_by_path[path]=item;current_entries.append(item)
    children={"":[]}
    for row in current_entries:
        if row["type"]=="tree":children[row["path"]]=[]
    for row in current_entries:
        parent=row["path"].rsplit("/",1)[0] if "/" in row["path"] else ""
        if parent not in children:raise ValueError("Canonical source tree omits a parent")
        children[parent].append(row)
    current_trees=[]
    for path,items in children.items():
        ordered=sorted(items,key=lambda item:(item["path"].rsplit("/",1)[-1]+("/" if item["type"]=="tree" else "")).encode("utf-8"))
        pieces=[]
        for item in ordered:
            basename=item["path"].rsplit("/",1)[-1]
            mode=item["mode"].lstrip("0") or "0"
            pieces.append((mode+" "+basename+"\0").encode("utf-8")+bytes.fromhex(item["sha"]))
        raw=b"".join(pieces)
        expected=current_tree if path=="" else current_by_path[path]["sha"]
        if hashlib.sha1(("tree "+str(len(raw))+"\0").encode("ascii")+raw).hexdigest()!=expected:
            raise ValueError("The complete canonical tree object differs: "+path)
        current_trees.append({"path":path,"sha":expected,"bytes":len(raw),"dataBase64":base64.b64encode(raw).decode("ascii")})
    allowed_changes=payload["selectedSourceChanges"]
    preserved_files=[];source_changes=[]
    for row in source_packet["files"]:
        current=current_by_path.get(row["path"])
        if not current or current["type"]!="blob" or current["mode"]!=row["mode"]:
            raise ValueError("A retained source member changed identity or mode: "+row["path"])
        if current["sha"]==row["git_blob_sha1"]:
            if current["bytes"]!=row["bytes"]:raise ValueError("Original source size differs")
            preserved_files.append(row);continue
        allowed=allowed_changes.get(row["path"])
        is_distribution=row["path"]=="stellar/scf-starforge-20261009/distribution/distribution.json"
        if not allowed and not is_distribution:
            raise ValueError("The pinned source contains another bank dependency change: "+row["path"])
        if allowed and (current["sha"]!=allowed["git_blob_sha1"] or current["bytes"]!=allowed["bytes"]):
            raise ValueError("The intended original source correction differs: "+row["path"])
        source_changes.append({"path":row["path"],"before":{"bytes":row["bytes"],"sha256":row["sha256"],"git_blob_sha1":row["git_blob_sha1"]},"after":{"bytes":current["bytes"],"git_blob_sha1":current["sha"]}})
    for path,change in allowed_changes.items():
        current=current_by_path.get(path)
        if not current or current["sha"]!=change["git_blob_sha1"] or current["bytes"]!=change["bytes"]:
            raise ValueError("The pinned original correction is absent: "+path)
    for row in payload["expectedSource"]:
        if row["path"] in allowed_changes:
            replacement=allowed_changes[row["path"]]
            if not replacement.get("sha256"):
                raise ValueError("The contribution correction needs its complete retained SHA256")
            row.update(replacement)
    source_packet.update({"commit":payload["commit"],"tree":current_tree,"originalCommitObject":original_commit,
      "trees":current_trees,"entries":current_entries,"files":preserved_files,"originalBankFiles":payload["expectedSource"],
      "canonicalSourceChanges":source_changes,
      "sourceBase":{"commit":payload["sourceBaseCommit"],"tree":payload["sourceBaseTree"],"capsule":source_spec["capsule"]},
      "archive":{"url":"https://codeload.github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/zip/"+payload["commit"],
        "rootName":"tjlabs-stellar-merchant-workspace-"+payload["commit"]}})
    payload["sourceTree"]=current_tree
    (root/"delivery"/"source-operation.json").write_text(json.dumps({key:value for key,value in payload.items() if key!="libraryHelpers"},indent=2)+"\n")
    emit({"stage":"canonical-original-source","sourceCommit":payload["commit"],"sourceTree":current_tree,"treeEntries":len(current_entries),"originalTrees":len(current_trees),"preservedFiles":len(preserved_files),"selectedChanges":source_changes})
    del current_commit,tree_response,current_rows,current_entries,current_by_path,children,current_trees,unsigned,signature,original_commit,commit_bytes
    original_entries={}
    for item in source_packet["entries"]:
        path=item["path"]
        if not isinstance(path,str) or not path or path.startswith("/") or "\\" in path or "\0" in path or any(part in ("",".","..") for part in path.split("/")):
            raise ValueError("Unsafe original repository member")
        if path in original_entries:raise ValueError("Duplicate original repository member: "+path)
        original_entries[path]=item
    original_bank={row["path"]:row for row in source_packet["originalBankFiles"]}
    for row in payload["expectedSource"]:
        current=original_bank.get(row["path"])
        if not current or any(current.get(key)!=row[key] for key in ("bytes","sha256","git_blob_sha1")):
            raise ValueError("The selected original bank file differs: "+row["path"])
    repo=root/"repository.git"
    run("git-init",[git,"init","--bare",str(repo)])
    received_objects=set()
    received_rows=[]
    def put_object(kind,sha,data):
        if not isinstance(sha,str) or len(sha)!=40 or any(char not in "0123456789abcdef" for char in sha):
            raise ValueError("Invalid original Git object identity")
        framed=(kind+" "+str(len(data))+"\0").encode("ascii")+data
        if hashlib.sha1(framed).hexdigest()!=sha:
            raise ValueError("Original "+kind+" Git object differs: "+sha)
        destination=repo/"objects"/sha[:2]/sha[2:]
        if destination.exists():
            if zlib.decompress(destination.read_bytes())!=framed:
                raise ValueError("The existing original Git object differs: "+sha)
        else:
            destination.parent.mkdir(parents=True,exist_ok=True)
            with destination.open("xb") as output:output.write(zlib.compress(framed,6))
        received_objects.add(sha)
    for row in source_packet["trees"]:
        data=base64.b64decode(row["dataBase64"],validate=True)
        if len(data)!=row["bytes"]:raise ValueError("Original tree byte count differs")
        put_object("tree",row["sha"],data)
    put_object("commit",payload["commit"],source_packet["originalCommitObject"].encode("utf-8"))
    (repo/"shallow").write_text(payload["commit"]+"\n",encoding="ascii")
    for row in source_packet["files"]:
        source_entry=original_entries.get(row["path"])
        if not source_entry or source_entry["type"]!="blob" or source_entry["sha"]!=row["git_blob_sha1"] or source_entry["mode"]!=row["mode"] or source_entry["bytes"]!=row["bytes"]:
            raise ValueError("Retained original file does not belong to the selected tree: "+row["path"])
        data=row["content"].encode("utf-8")
        if identity(data)!={key:row[key] for key in ("bytes","sha256","git_blob_sha1")}:
            raise ValueError("Retained original source byte identity differs: "+row["path"])
        put_object("blob",row["git_blob_sha1"],data)
        received_rows.append({"path":row["path"],"mode":row["mode"],**identity(data),"source":"retained-original-file"})
    actual_tree=subprocess.check_output([git,"--no-replace-objects","-C",str(repo),"rev-parse",payload["commit"]+"^{tree}"],env=env,text=True).strip()
    if actual_tree!=payload["sourceTree"]:raise ValueError("Original merged source tree differs")
    tree=subprocess.check_output([git,"--no-replace-objects","-C",str(repo),"ls-tree","-r","-z",payload["commit"]],env=env)
    by_path={}
    for item in tree.split(b"\0"):
        if item:
            header,path=item.split(b"\t",1)
            mode,kind,sha=header.decode().split(" ")
            by_path[path.decode()]={"mode":mode,"type":kind,"sha":sha}
    expected_leaves={path:{"mode":row["mode"],"type":row["type"],"sha":row["sha"]} for path,row in original_entries.items() if row["type"]!="tree"}
    if by_path!=expected_leaves:raise ValueError("The complete original Git tree differs from its retained source inventory")
    by_sha={}
    for row in original_entries.values():
        if row["type"]=="blob":by_sha.setdefault(row["sha"],[]).append(row)
    archive_spec=source_packet["archive"]
    expected_archive_url="https://codeload.github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/zip/"+payload["commit"]
    if archive_spec["url"]!=expected_archive_url or archive_spec["rootName"]!="tjlabs-stellar-merchant-workspace-"+payload["commit"]:
        raise ValueError("Original source archive is not bound to the selected repository commit")
    source_archive=None
    source_archive_file=root/"source-archive.zip"
    source_archive_identity=None
    def original_zip():
        global source_archive,source_archive_identity
        if source_archive is not None:return source_archive
        limit=sum(row.get("bytes",0) for row in original_entries.values() if row["type"]=="blob")+len(original_entries)*1024+16*1024*1024
        request=urllib.request.Request(archive_spec["url"],headers={"User-Agent":"TJ-Labs-original-product-release","Accept":"application/zip"})
        emit({"stage":"original-source-archive","status":"started","sourceCommit":payload["commit"]})
        count=0;digest=hashlib.sha256();start=time.monotonic()
        with urllib.request.urlopen(request,timeout=90) as response,source_archive_file.open("xb") as output:
            while True:
                chunk=response.read(1024*1024)
                if not chunk:break
                count+=len(chunk)
                if count>limit:raise ValueError("Original repository archive exceeds its full source bound")
                output.write(chunk);digest.update(chunk)
        source_archive_identity={"bytes":count,"sha256":digest.hexdigest(),"url":archive_spec["url"],"rootName":archive_spec["rootName"]}
        source_archive=zipfile.ZipFile(source_archive_file,"r")
        names=set()
        for entry in source_archive.infolist():
            name=entry.filename
            if name in names or not name.startswith(archive_spec["rootName"]+"/") or "\\" in name or "\0" in name or any(part in (".","..") for part in name.split("/")):
                raise ValueError("The original repository ZIP namespace is invalid")
            names.add(name)
        emit({"stage":"original-source-archive","status":"received","seconds":round(time.monotonic()-start,3),**source_archive_identity})
        return source_archive
    def hydrate_objects(shas):
        missing=sorted(set(shas)-received_objects)
        if not missing:return 0
        archive_reader=original_zip()
        for sha in missing:
            candidates=by_sha.get(sha)
            if not candidates:raise ValueError("The original builder requested an object outside its selected source tree: "+str(sha))
            candidates=[row for row in candidates if row["mode"] in ("100644","100755")]
            if not candidates:raise ValueError("The original source request is not a regular repository file: "+sha)
            row=min(candidates,key=lambda value:value["path"])
            size=row["bytes"]
            if not isinstance(size,int) or size<0 or size>2*1024*1024:
                raise ValueError("The original source member exceeds the maintained builder limit: "+row["path"])
            member=archive_reader.getinfo(archive_spec["rootName"]+"/"+row["path"])
            if member.is_dir() or member.file_size!=size:raise ValueError("The original source ZIP member size differs: "+row["path"])
            with archive_reader.open(member,"r") as source:
                data=source.read(size+1)
            if len(data)!=size:raise ValueError("The original source ZIP member is incomplete: "+row["path"])
            put_object("blob",sha,data)
            received_rows.append({"path":row["path"],"mode":row["mode"],**identity(data),"source":"original-repository-zip"})
        emit({"stage":"original-builder-source-received","newObjects":len(missing),"receivedBlobObjects":sum(1 for sha in received_objects if sha in by_sha)})
        return len(missing)
    source_resume=receive_build_checkpoint()
    builder_predecessors=payload["builderFiles"]
    for row in builder_predecessors:
        if by_path.get(row["path"],{}).get("type")!="blob":raise ValueError("Original builder source is unavailable: "+row["path"])
    hydrate_objects([by_path[row["path"]]["sha"] for row in builder_predecessors])
    current_builders=[]
    for row in builder_predecessors:
        current_sha=by_path[row["path"]]["sha"]
        data=subprocess.check_output([git,"--no-replace-objects","-C",str(repo),"cat-file","blob",current_sha],env=env)
        got=identity(data)
        if got["git_blob_sha1"]!=current_sha or got["bytes"]!=original_entries[row["path"]]["bytes"]:
            raise ValueError("Original canonical builder bytes differ")
        if current_sha==row["git_blob_sha1"] and got!={key:row[key] for key in ("bytes","sha256","git_blob_sha1")}:
            raise ValueError("Retained original builder identity differs")
        current_builders.append({"path":row["path"],**got})
        destination=root/"runner"/row["path"]
        destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data)
    payload["builderFiles"]=current_builders
    builder=root/"runner"/"stellar/scf-starforge-20261009/distribution/build.mjs"
    builder_driver=root/"runner"/"receive-original-build.mjs"
    builder_reply=root/"logs"/"original-build-reply.json"
    builder_driver.write_text(r'''import { writeFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [modulePath,repository,ref,output,selection,replyPath,python]=process.argv.slice(2);
try {
  const {buildDistribution}=await import(pathToFileURL(modulePath).href);
  const resume=await stat(output).then(value=>value.isDirectory(),error=>{if(error.code==='ENOENT')return false;throw error;});
  const result=await buildDistribution({repository,ref,output,selection,offline:true,resume,python,
    onProgress:event=>process.stderr.write(JSON.stringify(event)+'\n')});
  await writeFile(replyPath,JSON.stringify({status:'PACKAGED',result})+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify(result)+'\n');
} catch(error) {
  const sourceNeeded=error.code==='MISSING_SOURCE_OBJECTS';
  const result={status:sourceNeeded?'SOURCE_NEEDED':'FAILED',code:error.code??null,
    message:String(error.message),sourceCommit:error.sourceCommit??ref,
    missingObjects:sourceNeeded?error.missingObjects:[]};
  await writeFile(replyPath,JSON.stringify(result)+'\n',{mode:0o600});
  process.stderr.write(JSON.stringify(result)+'\n');
  process.exitCode=sourceNeeded?75:1;
}
''',encoding="utf-8")
    build_pass=source_resume["completedBuildPass"] if source_resume else 0
    build_heap=payload.get("buildHeapMiB",512)
    if not isinstance(build_heap,int) or isinstance(build_heap,bool) or not 256<=build_heap<=16384:
        raise ValueError("Select an explicit supported original builder heap budget")
    while True:
        build_pass+=1
        if builder_reply.exists():builder_reply.unlink()
        run("source-build-"+str(build_pass),[node,"--max-old-space-size="+str(build_heap),str(builder_driver),str(builder),str(repo),payload["commit"],str(root/"release"),payload["selection"],str(builder_reply),sys.executable],timeout=1800,acceptable=(0,75))
        reply=json.loads(builder_reply.read_text())
        if reply["status"]=="PACKAGED":break
        if reply["status"]!="SOURCE_NEEDED" or reply["sourceCommit"]!=payload["commit"] or not isinstance(reply["missingObjects"],list) or not reply["missingObjects"]:
            raise ValueError("The original builder returned an invalid source-receiving request")
        if any(not isinstance(sha,str) or sha not in by_sha for sha in reply["missingObjects"]):
            raise ValueError("The original builder requested source outside the retained tree")
        if not hydrate_objects(reply["missingObjects"]):
            raise RuntimeError("The original builder could not read its already received source objects")
        current_blob_count=sum(1 for sha in received_objects if sha in by_sha)
        if current_blob_count-last_checkpoint_blob_count>=128:
            save_build_checkpoint("source-build-"+str(build_pass)+"-source-received")
    if source_archive is not None:source_archive.close()
    if source_archive_file.exists():source_archive_file.unlink()
    source_intake_result={"schema":"stellar-forge.original-git-source-intake-result.v1","sourceCommit":payload["commit"],"sourceTree":actual_tree,"selection":payload["selection"],
      "capsule":source_spec["capsule"],"originalPacket":source_spec["original"],"originalTrees":len(source_packet["trees"]),"originalTreeEntries":len(original_entries),
      "receivedFiles":received_rows,"archive":source_archive_identity,"originalBuilderPasses":build_pass,"builderFiles":payload["builderFiles"],"builderPredecessors":builder_predecessors,"sourceBase":source_packet["sourceBase"],"canonicalSourceChanges":source_packet["canonicalSourceChanges"]}
    (root/"delivery"/"merchant-bank-statements-source-intake.json").write_text(json.dumps(source_intake_result,indent=2)+"\n")
    emit({"stage":"original-selected-source-built","sourceCommit":payload["commit"],"tree":actual_tree,"builderPasses":build_pass,"receivedFiles":len(received_rows)})
    del source_packet,original_entries,by_sha,expected_leaves
    source_receipt=json.loads((root/"release"/"distribution.json").read_text())
    package=root/"release"/"package"
    manifest=json.loads((package/"manifest.json").read_text())
    entries={entry["path"]:entry for entry in manifest["files"]}
    for row in payload["expectedSource"]:
        got=entries.get(row["path"])
        if not got or got["gitBlob"]!=row["git_blob_sha1"] or got["bytes"]!=row["bytes"] or got["sha256"]!=row["sha256"]:
            raise ValueError("Original bank product postimage differs: "+row["path"])
    archive=pathlib.Path(source_receipt["archive"]).resolve()
    if file_identity(archive)!={"bytes":source_receipt["archiveBytes"],"sha256":source_receipt["sha256"]}:
        raise ValueError("Original product archive differs")
    run("archive-reopen",[sys.executable,str(root/"runner"/"stellar/scf-starforge-20261009/distribution/runtime-unpack.py"),"--archive",str(archive),"--sha256",source_receipt["sha256"],"--out",str(package),"--verify"],timeout=300)
    distribution=package/"source"/"stellar/scf-starforge-20261009/distribution"
    cli=distribution/"cli.mjs"
    run("source-bank-command",[node,str(cli),"bank-statements","help"],timeout=120)
    run("source-receivables-command",[node,str(cli),"receivables","help"],timeout=120)
    run("source-registrations",[node,str(cli),"registrations"],timeout=120)
    portable_archive=root/"delivery"/archive.name
    shutil.copyfile(archive,portable_archive)
    shutil.copyfile(package/"manifest.json",root/"delivery"/"merchant-bank-statements-source-manifest.json")
    shutil.copyfile(root/"release"/"distribution.json",root/"delivery"/"merchant-bank-statements-distribution.json")
    stage_result={"schema":"stellar-forge.bank-release-receiving.v1","operation_id":payload["operation_id"],"status":"PACKAGED_AND_REOPENED","sourceCommit":payload["commit"],"sourceTree":actual_tree,"sourceSelection":payload["selection"],"versions":versions,"distribution":source_receipt,"originalPostimagesVerified":len(payload["expectedSource"]),"originalSourceIntake":{"originalTrees":source_intake_result["originalTrees"],"originalTreeEntries":source_intake_result["originalTreeEntries"],"receivedFiles":len(received_rows),"builderPasses":build_pass,"sourceCapsule":source_spec["capsule"]},"steps":list(journal)}
    stage_file=root/"delivery"/"merchant-bank-statements-package-result.json"
    stage_file.write_text(json.dumps(stage_result,indent=2)+"\n")
    save_paths("save-original-product",[portable_archive,root/"delivery"/"merchant-bank-statements-source-manifest.json",root/"delivery"/"merchant-bank-statements-distribution.json",root/"delivery"/"merchant-bank-statements-source-intake.json",stage_file])
    shutil.rmtree(repo)
    installer=distribution/"runtime-install-cli.mjs"
    transfer_cli=distribution/"runtime-transfer-cli.mjs"
    runtime=root/"runtime"
    prepared=json.loads(run("runtime-prepare",[node,str(installer),"prepare","--dir",str(runtime),"--archive",str(portable_archive),"--sha256",source_receipt["sha256"],"--native","--feature","schema","--feature","openapi","--operator"],timeout=300))
    native_header_options=["--node-headers",str(pathlib.Path(payload["nodeHeaders"]).resolve())] if payload.get("nodeHeaders") else []
    installed=json.loads(run("runtime-install",[node,str(installer),"install","--dir",str(runtime),"--cache",str(root/"npm-cache"),*native_header_options],timeout=1800))
    inspection=json.loads(run("runtime-inspect",[node,str(installer),"inspect","--dir",str(runtime),"--load","--source"],timeout=300))
    if inspection.get("ready") is not True:raise ValueError("Original selected runtime is not ready")
    run("installed-bank-command",[node,str(installer),"run","--dir",str(runtime),"--","bank-statements","help"],timeout=120)
    run("installed-receivables-command",[node,str(installer),"run","--dir",str(runtime),"--","receivables","help"],timeout=120)
    review=json.loads(run("transfer-review",[node,str(transfer_cli),"review","--runtime",str(runtime)],timeout=300))
    if review.get("ready") is not True:raise ValueError("Original runtime transfer inventory is not ready")
    sending=root/"transfer"
    exported=json.loads(run("transfer-export",[node,str(transfer_cli),"export","--runtime",str(runtime),"--directory",str(sending),"--cache",str(root/"npm-cache"),"--expect-lock",review["runtime"]["lockSha256"],"--online","--storage","files"],timeout=1800))
    checked=json.loads(run("transfer-source-inspect",[node,str(transfer_cli),"inspect","--directory",str(sending),"--verify"],timeout=600))
    manifest_file=sending/"manifest.json"
    transfer_manifest=json.loads(manifest_file.read_text())
    manifest_sha=file_identity(manifest_file)["sha256"]
    receiver=root/"receiver"
    run("transfer-receive",[node,str(transfer_cli),"receive","--directory",str(receiver),"--manifest",str(manifest_file),"--sha256",manifest_sha,"--storage","files"],timeout=300)
    part_root=root/"temporary-parts";part_root.mkdir()
    transfer_archive=root/"delivery"/"merchant-bank-statements-runtime-transfer.zip"
    with zipfile.ZipFile(transfer_archive,"w",compression=zipfile.ZIP_STORED,allowZip64=True) as archive_zip:
        archive_zip.write(manifest_file,"manifest.json")
        archive_zip.writestr("SOURCE.json",json.dumps({"sourceCommit":payload["commit"],"sourceSelection":payload["selection"],"manifestSha256":manifest_sha,"originalRuntime":review["runtime"]},indent=2)+"\n")
        for part in transfer_manifest["parts"]:
            index=part["index"];path=part_root/part["name"]
            run("transfer-part-download-"+str(index),[node,str(transfer_cli),"download-part","--directory",str(sending),"--index",str(index),"--file",str(path)],timeout=300)
            archive_zip.write(path,"parts/"+part["name"])
            run("transfer-part-receive-"+str(index),[node,str(transfer_cli),"receive-part","--directory",str(receiver),"--index",str(index),"--file",str(path)],timeout=300)
            path.unlink()
    completed=json.loads(run("transfer-complete",[node,str(transfer_cli),"complete","--directory",str(receiver)],timeout=1200))
    receiving_inspection=json.loads(run("transfer-received-inspect",[node,str(transfer_cli),"inspect","--directory",str(receiver),"--verify"],timeout=600))
    retained_transfer_manifest=root/"delivery"/"merchant-bank-statements-runtime-transfer-manifest.json"
    shutil.copyfile(manifest_file,retained_transfer_manifest)
    retained_transfer_result=root/"delivery"/"merchant-bank-statements-runtime-transfer-result.json"
    retained_transfer_result.write_text(json.dumps({"schema":"stellar-forge.bank-runtime-transfer-receiving.v1","sourceCommit":payload["commit"],"sourceSelection":payload["selection"],"manifestSha256":manifest_sha,"archive":file_identity(transfer_archive),"originalRuntime":review["runtime"],"source":checked,"complete":completed,"received":receiving_inspection,"steps":list(journal)},indent=2)+"\n")
    save_paths("save-complete-transfer",[transfer_archive,retained_transfer_manifest,retained_transfer_result])
    restored=root/"runtime-received"
    restore_result=json.loads(run("transfer-install",[node,str(transfer_cli),"install","--directory",str(receiver),"--runtime",str(restored),*native_header_options],timeout=1800))
    restored_inspection=json.loads(run("restored-runtime-inspect",[node,str(installer),"inspect","--dir",str(restored),"--source","--load"],timeout=300))
    if restored_inspection.get("ready") is not True:raise ValueError("Received original runtime is not ready")
    run("restored-bank-command",[node,str(installer),"run","--dir",str(restored),"--","bank-statements","help"],timeout=120)
    run("restored-receivables-command",[node,str(installer),"run","--dir",str(restored),"--","receivables","help"],timeout=120)
    comparison=json.loads(run("runtime-compare",[node,str(installer),"compare","--before",str(runtime),"--after",str(restored)],timeout=300))
    if comparison.get("sourceChanged") is not False or comparison.get("profileChanged") is not False or comparison.get("dependencies")!=[]:
        raise ValueError("The received original source, selected profile or dependency versions differ")
    result={**stage_result,"status":"PACKAGED_INSTALLED_TRANSFERRED_AND_REOPENED","runtime":inspection,"runtimeTransfer":{"review":review,"export":exported,"source":checked,"manifestSha256":manifest_sha,"partCount":len(transfer_manifest["parts"]),"complete":completed,"received":receiving_inspection,"archive":file_identity(transfer_archive)},"receivedRuntime":restored_inspection,"runtimeComparison":comparison,"steps":journal,"savedOriginalProduct":list(saved)}
    result_file=root/"delivery"/"merchant-bank-statements-complete-release-result.json"
    result_file.write_text(json.dumps(result,indent=2)+"\n")
    guide=root/"delivery"/"START_HERE.md"
    guide.write_text("# Merchant bank statements and cash reconciliation\n\n"
      "This release was built, installed, transferred and reopened from source commit "+payload["commit"]+".\n\n"
      "## Open the original source\n\n"
      "- Original package: "+portable_archive.name+"\n"
      "- Archive SHA-256: "+source_receipt["sha256"]+"\n"
      "- Source selection: merchant-bank-statements\n"
      "- Source files: "+str(source_receipt["sourceFiles"])+"\n"
      "- Original bank files matched: "+str(len(payload["expectedSource"]))+"\n\n"
      "The package includes INSTALLATION.md, HANDOVER.md and EXAMPLE.md under products/merchant-bank-statements. It carries the same original accounting writer, bank receipts, customer remittances, invoices, payment plans, typed client, CLI and saved Application.\n\n"
      "## Receive the complete runtime\n\n"
      "Use Linux, Node 22.16 or newer, Python 3.11 or newer, npm and flock. Offline SQLite preparation requires the matching local Node headers and compiler toolchain described in INSTALLATION.md. The retained profile selects native dependencies, schema, openapi and the Linux operator host.\n\n"
      "Extract the original TGZ into /private/bank-release and merchant-bank-statements-runtime-transfer.zip into /private/bank-transfer. Its manifest SHA-256 is "+manifest_sha+". The ZIP's declared part files are in its parts subdirectory. Run the maintained receiver from the original TGZ:\n\n"
      "    node /private/bank-release/package/source/stellar/scf-starforge-20261009/distribution/runtime-transfer-cli.mjs receive \\\n"
      "      --directory /private/bank-transfer-receiver \\\n"
      "      --manifest /private/bank-transfer/manifest.json --sha256 "+manifest_sha+" \\\n"
      "      --parts /private/bank-transfer/parts --storage files\n\n"
      "    node /private/bank-release/package/source/stellar/scf-starforge-20261009/distribution/runtime-transfer-cli.mjs install \\\n"
      "      --directory /private/bank-transfer-receiver --runtime /private/bank-runtime\n\n"
      "Add --node-headers /absolute/node/header-prefix to install when required. Its include/node directory must match the running Node version and ABI. Receive imports every original declared part, completes the source/profile/lock cohort and populates the receiver's private cache. Installation uses that retained cache offline.\n\n"
      "    node /private/bank-release/package/source/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \\\n"
      "      --dir /private/bank-runtime --load --source\n\n"
      "## Continue the customer accounting workspace\n\n"
      "Use the existing source/runtime command: starforge bank-statements serve --directory /absolute/private/accounting --port 8448. On first setup, supply the original accounting outbox, proof directory and terms described in INSTALLATION.md. The same process exposes /bank-statements/, /receivables/, /customer-statements/, /payment-plans/ and /receivables/remittances.html. The original Bank statement reconciliation Application opens this same saved accounting directory.\n\n"
      "Receive the customer's original statement, review exact account/currency/row meaning, match original receipts/refunds and fees, receive reviewed remittance allocations, and retain the balanced account close. The complete guide carries source corrections, previous closes, original customer exports and recovery through those same writers. The separate complete bank account/browser case retains its actual financial source and operating outcome.\n\n"
      "merchant-bank-statements-complete-release-result.json contains the actual package, original runtime, complete transfer and received-runtime results. The operations archive retains the complete command output.\n")
    operating_logs=logs_archive("merchant-bank-statements-release-operations.zip")
    save_paths("save-complete-release",[result_file,guide,operating_logs])
    emit({"stage":"complete","status":result["status"],"sourceCommit":payload["commit"],"sourceFiles":source_receipt["sourceFiles"],"runtimeTransferParts":len(transfer_manifest["parts"]),"saved":saved,"directory":str(root)})
    cleanup_expansions()
except BaseException as error:
    if "source_archive" in globals() and source_archive is not None:
        source_archive.close()
    failure={"schema":"stellar-forge.bank-release-receiving.v1","operation_id":payload["operation_id"],"status":"FAILED","sourceCommit":payload["commit"],"error":type(error).__name__,"message":str(error),"steps":journal,"saved":saved,"pendingSaves":list(pending_saves.values()),"uncertainSaves":list(uncertain_saves.values())}
    failure_file=root/"delivery"/"merchant-bank-statements-release-failure.json"
    failure_file.write_text(json.dumps(failure,indent=2)+"\n")
    emit({"stage":"failed",**failure,"directory":str(root)})
    try:
        if "repo" in globals() and repo.is_dir() and "source_packet" in globals():
            save_build_checkpoint("stopped-source-build")
    except BaseException as checkpoint_error:
        emit({"stage":"source-checkpoint-retained","error":type(checkpoint_error).__name__,"message":str(checkpoint_error)})
    try:
        failure_logs=logs_archive("merchant-bank-statements-release-failure-operations.zip")
        save_paths("save-failed-operation",[failure_file,failure_logs])
        cleanup_expansions()
    except BaseException as save_error:
        emit({"stage":"failure-retained","error":type(save_error).__name__,"message":str(save_error),"directory":str(root)})
    raise
