#!/usr/bin/env python3
"""Continue the saved native04 customer operation and its complete financial handoff."""
import base64, ctypes, datetime, fcntl, gc, hashlib, importlib.util, io, json, os, pathlib, resource, shutil, signal, stat, subprocess, sys, tempfile, traceback, zipfile

REPO = "woahwhattheheck/tjlabs-stellar-merchant-workspace"
ORIGINAL_ROOT = pathlib.Path("/dev/scf-performance-25fd-20261012-native04")
WORK = ORIGINAL_ROOT / "work"
EXPECTED_ARCHIVE = "3d59a1c33cb3c02439c2ba6f77cfc87ed5212cf2b83d66220f451a63d8f7ad04"
EXPECTED_PRICING = "22b452ba-8fd6-42ec-ac03-cb46f6a606f5"
SCF = pathlib.Path("stellar/scf-starforge-20261009")
HELPER = pathlib.Path("experiments/merchant-performance-financial-84df-20261012/performance-financial.mjs")

FINANCIAL_BASE = {
    "gitBlob":"0fff38e8e50d8c96be1b3f91cad7b4f8e8dc2c01",
    "indexGitBlob":"0c5ca60440d46895bcd2c03a6254850708f29620",
    "bytes":9291618,
    "sha256":"6a0bb5c96335fcc82cee328b4932952b84437c6e42eda53e69c3b539c8b816e5"
}
FINANCIAL_FOLLOWING = {
    "gitBlob":"a5548d76367906e07c4726bd6237080fbe3ef410",
    "bytes":250851,
    "sha256":"aa97fd5757afdf49f2e8b244621266e7384f187d8c5edafc5978b4a2f1772355"
}
FINANCIAL_RECEIVER_GIT = "43ad53377c68eb82e06f2187993b3e3de20ea328"
FINANCIAL_MERGE = "c2199987c03b59ee41cc28c0f247840e3948ea87"

os.umask(0o077)

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()

def write_bytes(path, data):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix=path.name + ".84df-",dir=path.parent)
    pending = pathlib.Path(temporary)
    try:
        with os.fdopen(fd,"wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(pending,path)
    finally:
        if pending.exists():
            pending.unlink()

def write_json(path, value):
    write_bytes(path, (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))

def read_json(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))

def checked_relative(value):
    path = pathlib.PurePosixPath(value)
    if path.is_absolute() or not path.parts or ".." in path.parts or "\\" in value:
        raise RuntimeError("Source member is not a relative repository path")
    return path

def files_from(packet):
    files = packet.get("files")
    if not isinstance(files, list):
        raise RuntimeError("Source packet has no complete files array")
    return files

def install_files(packet, target, receipt):
    for row in files_from(packet):
        rel = checked_relative(row["path"])
        content = row.get("content")
        if isinstance(content, str):
            data = content.encode("utf-8")
        elif isinstance(row.get("base64"), str):
            data = base64.b64decode(row["base64"], validate=True)
        else:
            raise RuntimeError("Source file has no original bytes: " + str(rel))
        expected = row.get("gitBlob") or row.get("sha")
        actual = git_blob(data)
        if expected and expected != actual:
            raise RuntimeError("Source Git identity differs: " + str(rel))
        if row.get("bytes") is not None and row["bytes"] != len(data):
            raise RuntimeError("Source byte count differs: " + str(rel))
        if row.get("sha256") and row["sha256"] != sha(data):
            raise RuntimeError("Source SHA256 differs: " + str(rel))
        path = target / rel
        previous = git_blob(path.read_bytes()) if path.is_file() else None
        if previous != actual:
            write_bytes(path, data)
        receipt.append({"path":str(rel),"gitBlob":actual,"bytes":len(data),
                        "previousGitBlob":previous,"changed":previous != actual})
    return receipt

def live_native04_processes():
    found = []
    for child in pathlib.Path("/proc").iterdir():
        if not child.name.isdecimal():
            continue
        pid = int(child.name)
        if pid in {os.getpid(), os.getppid()}:
            continue
        try:
            args = (child / "cmdline").read_bytes().split(b"\0")
        except (OSError, ProcessLookupError):
            continue
        if not args or not args[0]:
            continue
        executable = pathlib.PurePosixPath(os.fsdecode(args[0])).name
        if not (executable.startswith("node") or executable.startswith("python")):
            continue
        if any(str(ORIGINAL_ROOT).encode() in arg for arg in args[1:]):
            found.append({"pid":pid,"executable":executable})
    return found

def native_sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

native_ensured_directories = set()

def native_directory(path):
    path = pathlib.Path(path)
    if path in native_ensured_directories:
        return
    if path.parent != path:
        native_directory(path.parent)
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        info = path.lstat()
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            raise RuntimeError("Keep the original native directory: " + str(path))
    native_sync_directory(path)
    if path.parent != path:
        native_sync_directory(path.parent)
    native_ensured_directories.add(path)

def native_read_regular(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise RuntimeError("Retain the original regular artifact: " + str(path))
        with os.fdopen(fd, "rb", closefd=False) as stream:
            return stream.read()
    finally:
        os.close(fd)

def native_retain(path, data):
    path = pathlib.Path(path)
    native_directory(path.parent)
    try:
        previous = native_read_regular(path)
    except FileNotFoundError:
        previous = None
    if previous is not None:
        if previous != data:
            raise RuntimeError("Preserve the earlier complete native artifact: " + str(path))
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
        native_sync_directory(path.parent)
        return
    fd, name = tempfile.mkstemp(prefix=path.name + ".84df-receipt-", dir=path.parent)
    temporary = pathlib.Path(name)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            if native_read_regular(path) != data:
                raise RuntimeError("Preserve the earlier complete native artifact: " + str(path))
            existing = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                os.fsync(existing)
            finally:
                os.close(existing)
        native_sync_directory(path.parent)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        native_sync_directory(path.parent)

def native_encoded(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")

def begin_native_attempt(status):
    """Keep the preceding actual journal and allocate this invocation's own logs."""
    if (status.get("operation") != "SCF-TARIFF-USAGE-PERFORMANCE-25FD-20261012"
        or status.get("root") != str(ORIGINAL_ROOT)):
        raise RuntimeError("Keep the original native04 operation identity")
    status_path = WORK / "FINANCIAL_NATIVE_OPERATION.json"
    previous = None
    if status_path.exists():
        data = native_read_regular(status_path)
        saved = json.loads(data)
        if (saved.get("schema") != "commons.scf-performance-financial-native-operation.v1"
            or saved.get("operation") != status["operation"]
            or saved.get("root") != status["root"]):
            raise RuntimeError("The retained native journal belongs to a different operation")
        retained = WORK / "financial-native-attempts" / ("status-" + sha(data) + ".json")
        native_retain(retained, data)
        previous = {"path": str(retained), "bytes": len(data), "sha256": sha(data)}
    logs = WORK / "financial-native-logs"
    native_directory(logs)
    log_root = pathlib.Path(tempfile.mkdtemp(prefix="attempt-", dir=logs))
    native_sync_directory(log_root)
    native_sync_directory(logs)
    status["attempt"] = {"id": log_root.name, "logs": str(log_root)}
    if previous is not None:
        status["attempt"]["previousJournal"] = previous
    native_retain(log_root / "attempt.json", native_encoded({
        "schema": "commons.scf-native04-attempt.v1",
        "operation": status["operation"],
        "root": status["root"],
        "startedAt": status["startedAt"],
        "pid": status["pid"],
        "attempt": status["attempt"],
    }))
    write_json(status_path, status)
    native_sync_directory(WORK)
    return log_root

def retain_source_bytes(path, data):
    path = pathlib.Path(path)
    for parent in [path, *path.parents]:
        if parent.is_symlink():
            raise RuntimeError("Retained source path contains a symbolic link: " + str(parent))
    native_retain(path, data)

def install_original_performance(packet, target):
    changes = {row["path"]:row for row in packet.get("changedOrAddedFromNative04", [])}
    original_rows = [row for row in files_from(packet)
                     if row["path"] not in changes or changes[row["path"]]["previousGitBlob"] is not None]
    if len(original_rows) != 411:
        raise RuntimeError("Keep the original complete411-file Performance source selection")
    checks = []
    for row in original_rows:
        rel = checked_relative(row["path"])
        path = target / rel
        for parent in [path, *path.parents]:
            if parent.is_symlink():
                raise RuntimeError("Original Performance source contains a symbolic link")
        data = row["content"].encode("utf-8")
        if git_blob(data) != row["gitBlob"] or len(data) != row["bytes"] or sha(data) != row["sha256"]:
            raise RuntimeError("Original Performance carrier file identity differs: " + str(rel))
        original = changes.get(row["path"])
        existing = path.read_bytes() if path.is_file() else None
        if original is not None:
            # The financial capsule contains newer installed guides, not their original bodies.
            # Preserve whichever original/current guide the existing receiver already retained.
            if existing is None or git_blob(existing) not in {original["previousGitBlob"],row["gitBlob"]}:
                raise RuntimeError("Keep the original retained installed guide: " + str(rel))
        elif existing is not None and existing != data:
            raise RuntimeError("Original Performance source differs from the captured native04 bytes: " + str(rel))
        elif path.exists() and existing is None:
            raise RuntimeError("Original Performance source path is not a regular file: " + str(rel))
        checks.append((row,path,existing if existing is not None else data,existing is None))
    receipt = []
    for row,path,data,missing in checks:
        if missing:
            retain_source_bytes(path, data)
        receipt.append({"path":row["path"],"gitBlob":git_blob(data),"bytes":len(data),
                        "addedMissingSource":missing,"existingSourcePreserved":not missing})
    return receipt


def selected_financial_paths(payload):
    requested = WORK / checked_relative(payload.get("financialOutput", "performance-financial"))
    candidates = [requested]
    previous_path = WORK/"FINANCIAL_NATIVE_OPERATION.json"
    if previous_path.is_file():
        previous = read_json(previous_path)
        hint = previous.get("financialOutput")
        if isinstance(hint,str) and pathlib.Path(hint).is_absolute():
            hinted = pathlib.Path(hint)
            if WORK in hinted.parents:
                candidates.append(hinted)
    candidates.extend([WORK/"performance-financial",WORK/"financial"])
    unique = list(dict.fromkeys(candidates))
    retained = []
    for candidate in unique:
        operation_path = candidate/"operation.json"
        if not operation_path.exists():
            continue
        if not operation_path.is_file() or operation_path.is_symlink():
            raise RuntimeError("Keep the original regular financial operation journal")
        operation = read_json(operation_path)
        if (operation.get("schema") != "stellar-forge.merchant-performance-financial-operation.v1"
            or operation.get("nativeRun") != str(WORK/"original-native")
            or operation.get("performanceRun") != str(WORK/"performance")):
            raise RuntimeError("Existing financial output belongs to a different original operation: " + str(candidate))
        retained.append((candidate,operation))
    if len(retained) > 1:
        raise RuntimeError("More than one retained financial operation exists; preserve their exact output identities")
    output, operation = retained[0] if retained else (requested,None)
    source = pathlib.Path(operation["sourceRoot"]) if operation is not None else WORK/"financial-source"
    if not source.is_absolute() or pathlib.Path(os.path.abspath(source)) != source:
        raise RuntimeError("Keep the financial operation's absolute normalized sourceRoot")
    for path in [output, source]:
        for parent in [path,*path.parents]:
            if parent.is_symlink():
                raise RuntimeError("Financial source/output contains a symbolic link: " + str(parent))
    for protected in [WORK/"source",WORK/"foundation-source",WORK/"original-native",WORK/"performance"]:
        if output == protected or protected in output.parents or output in protected.parents:
            raise RuntimeError("Financial output overlaps an original saved source or operation")
    if source == output or source in output.parents or output in source.parents:
        raise RuntimeError("Financial source and output must preserve their separate original directories")
    return output,source,operation


def receive_retained_financial(packets, output, source, operation, status):
    """Adopt the owned financial sources while retaining the original411 files."""
    if source != WORK/"source" or operation is None:
        raise RuntimeError("Use this adoption only for the retained original-source financial operation")
    operation_path = output/"operation.json"
    operation_bytes = native_read_regular(operation_path)
    if json.loads(operation_bytes) != operation or operation.get("sourceRoot") != str(source):
        raise RuntimeError("The retained financial operation changed before source adoption")
    base = packets["performance"]
    following = packets["financial-following"]
    base_rows = {row["path"]:row for row in files_from(base)}
    changes = {row["path"]:row for row in base["changedOrAddedFromNative04"]}
    original_paths = {path for path in base_rows
                      if path not in changes or changes[path]["previousGitBlob"] is not None}
    final_rows = dict(base_rows)
    for row in files_from(following):
        final_rows[row["path"]] = row
    if len(base_rows) != 471 or len(original_paths) != 411 or len(final_rows) != 474:
        raise RuntimeError("The complete original and following source selections differ")
    if sum(len(row["content"].encode("utf-8")) for row in final_rows.values()) != 6697479:
        raise RuntimeError("The complete following source byte count differs")
    adoption = WORK/"financial-source-adoptions"/sha(operation_bytes)/FINANCIAL_FOLLOWING["gitBlob"]
    request_path = adoption/"request.json"
    complete_path = adoption/"COMPLETE.json"
    prior_request_bytes = native_read_regular(request_path) if request_path.exists() else None
    prior_request = json.loads(prior_request_bytes) if prior_request_bytes is not None else None
    binding = {
        "schema":"commons.scf-native04-retained-financial-source.v1",
        "operation":"SCF-TARIFF-USAGE-PERFORMANCE-25FD-20261012",
        "financialOperationId":operation["operationId"],
        "financialOperationSha256":sha(operation_bytes),
        "financialOutput":str(output),
        "sourceRoot":str(source),
        "originalNativeResultSha256":operation["nativeResultSha256"],
        "originalPerformanceResultSha256":operation["performanceResultSha256"],
        "baseSource":FINANCIAL_BASE,
        "followingSource":FINANCIAL_FOLLOWING,
        "followingSourceMerge":FINANCIAL_MERGE,
    }
    if prior_request is not None and prior_request.get("binding") != binding:
        raise RuntimeError("The retained financial source adoption belongs to a different operation")

    def descriptor(data):
        return {"gitBlob":git_blob(data),"sha256":sha(data),"bytes":len(data)}

    previous_by_path = {}
    if prior_request is not None:
        for row in prior_request.get("files",[]):
            if row["path"] in previous_by_path:
                raise RuntimeError("The retained financial source request repeats a path")
            previous_by_path[row["path"]] = row
        if set(previous_by_path) != set(final_rows)-original_paths:
            raise RuntimeError("The retained financial source request changed its complete file selection")

    checks = []
    protected = []
    overrides = []
    for name,row in sorted(final_rows.items()):
        rel = checked_relative(name)
        path = source/rel
        for parent in [path,*path.parents]:
            if parent.is_symlink():
                raise RuntimeError("Retained financial source contains a symbolic link: "+str(parent))
        data = row["content"].encode("utf-8")
        after = descriptor(data)
        if (after["gitBlob"] != row["gitBlob"] or after["bytes"] != row["bytes"]
            or after["sha256"] != row["sha256"]):
            raise RuntimeError("The complete following file identity differs: "+name)
        existing = native_read_regular(path) if path.exists() else None
        before = descriptor(existing) if existing is not None else None
        if name in original_paths:
            expected = {base_rows[name]["gitBlob"]}
            if name in changes:
                expected.add(changes[name]["previousGitBlob"])
            if before is None or before["gitBlob"] not in expected:
                raise RuntimeError("Preserve the original Performance source file: "+name)
            protected.append({"path":name,**before})
            if before != after:
                overrides.append({"path":name,"originalPerformance":before,"followingFile":after})
            continue
        allowed = {after["gitBlob"]}
        if name in base_rows:
            allowed.add(base_rows[name]["gitBlob"])
        if before is not None and before["gitBlob"] not in allowed:
            raise RuntimeError("Financial source has an unowned current change: "+name)
        prior = previous_by_path.get(name)
        if prior is not None:
            if prior.get("after") != after:
                raise RuntimeError("The retained financial target source changed: "+name)
            original_before = prior.get("before")
            if before != original_before and before != after:
                raise RuntimeError("The interrupted financial source member differs: "+name)
        else:
            original_before = before
        checks.append({"name":name,"path":path,"data":data,"existing":existing,
                       "before":original_before,"actual":before,"after":after})
    request = {"binding":binding,
               "files":[{"path":row["name"],"before":row["before"],"after":row["after"]} for row in checks],
               "preservedPerformance":protected,"preservedSourceOverrides":overrides}
    request_bytes = native_encoded(request)
    if prior_request_bytes is not None and prior_request_bytes != request_bytes:
        raise RuntimeError("The original financial adoption request or preserved Performance bytes changed")
    # Retain every preceding complete source body and the full request before
    # the first financial-only replacement. Same-request replay uses these bytes.
    for row in checks:
        if row["before"] is None:
            continue
        retained_path = adoption/"original"/checked_relative(row["name"])
        if row["existing"] is not None and descriptor(row["existing"]) == row["before"]:
            native_retain(retained_path,row["existing"])
        else:
            retained = native_read_regular(retained_path)
            if descriptor(retained) != row["before"]:
                raise RuntimeError("The prior complete financial source body changed: "+row["name"])
            native_retain(retained_path,retained)
    native_retain(request_path,request_bytes)
    for row in checks:
        path = row["path"]
        current = native_read_regular(path) if path.exists() else None
        actual = descriptor(current) if current is not None else None
        if actual != row["before"] and actual != row["after"]:
            raise RuntimeError("The financial source changed during its retained adoption: "+row["name"])
        if actual != row["after"]:
            native_directory(path.parent)
            write_bytes(path,row["data"])
            native_sync_directory(path.parent)
        native_retain(path,row["data"])
    for row in protected:
        if descriptor(native_read_regular(source/checked_relative(row["path"]))) != {
            key:row[key] for key in ("gitBlob","sha256","bytes")}:
            raise RuntimeError("The original Performance source changed during financial adoption")
    if native_read_regular(operation_path) != operation_bytes:
        raise RuntimeError("The original financial business journal changed during source adoption")
    complete = {
        "schema":"commons.scf-native04-retained-financial-source-ready.v1",
        "state":"SOURCE_READY","requestSha256":sha(request_bytes),
        "financialOperationId":operation["operationId"],
        "financialOperationSha256":sha(operation_bytes),
        "sourceRoot":str(source),"files":len(final_rows),
        "financialSourceFiles":len(checks),"preservedPerformanceFiles":len(protected),
        "sourceOverrides":overrides,
    }
    native_retain(complete_path,native_encoded(complete))
    status["source"].append({"role":"complete financial successor at the retained operation sourceRoot",
        "adoption":str(complete_path),**complete})
    write_json(WORK/"FINANCIAL_NATIVE_OPERATION.json",status)
    native_sync_directory(WORK)
    print(json.dumps({"phase":"RETAINED_FINANCIAL_SOURCE","status":"SOURCE_READY",
                      "sourceRoot":str(source),"files":len(final_rows),
                      "preservedPerformanceFiles":len(protected),
                      "financialSourceFiles":len(checks),"adoption":str(complete_path)}),flush=True)

def retain_completed_financial(output, operation, status):
    path = output/"flow-result.json"
    if not path.is_file():
        return False
    result_bytes = path.read_bytes()
    result = json.loads(result_bytes)
    if operation is None:
        raise RuntimeError("A completed financial result must retain its original operation journal")
    native = (WORK/"original-native/flow-result.json").read_bytes()
    performance = (WORK/"performance/flow-result.json").read_bytes()
    if (result.get("schema") != "stellar-forge.merchant-performance-financial-result.v1"
        or result.get("state") != "COMPLETE" or result.get("output") != str(output)
        or result.get("operationId") != operation.get("operationId")
        or result.get("sourceRoot") != operation.get("sourceRoot")
        or result.get("originalNative") != str(WORK/"original-native")
        or result.get("originalPerformance") != str(WORK/"performance")
        or operation.get("nativeResultSha256") != sha(native)
        or operation.get("performanceResultSha256") != sha(performance)
        or result.get("originalResults",{}).get("nativeSha256") != sha(native)
        or result.get("originalResults",{}).get("performanceSha256") != sha(performance)):
        raise RuntimeError("The completed financial result differs from its retained original operation")
    status["results"]["performance-financial-operation"] = result
    status["phases"].append({"phase":"performance-financial-operation","status":"RECEIVED_COMPLETE",
        "result":str(path),"resultSha256":sha(result_bytes),"sourceRoot":operation["sourceRoot"]})
    return True


def receive_following_financial(packets, output, source, operation, python, status, logs, environment):
    for protected in [WORK/"source",WORK/"foundation-source",WORK/"original-native",WORK/"performance",output]:
        if source == protected or source in protected.parents or protected in source.parents:
            raise RuntimeError("The retained financial sourceRoot overlaps an original source or saved operation: " + str(source))
    following = packets["financial-following"]
    if (following.get("schema") != "stellar-forge.merchant-performance-financial-source-successor.v1"
        or following.get("baseSourceGitBlob") != FINANCIAL_BASE["gitBlob"]
        or following.get("baseSourceTransferGitBlob") != FINANCIAL_BASE["indexGitBlob"]):
        raise RuntimeError("Keep the complete merged PR424 following financial source")
    carrier = WORK/"source-carriers"
    successor_path = carrier/("financial-following-"+FINANCIAL_FOLLOWING["gitBlob"]+".json")
    index_path = carrier/"performance-parts/source-transfer.json"
    if git_blob(successor_path.read_bytes()) != FINANCIAL_FOLLOWING["gitBlob"]:
        raise RuntimeError("The retained full financial successor differs")
    matches = [row for row in following["files"] if row["path"] == str(HELPER.parent/"receive-financial-source.py")]
    if len(matches) != 1:
        raise RuntimeError("The following source must contain its maintained source-only receiver")
    receiver = matches[0]
    data = receiver["content"].encode("utf-8")
    if git_blob(data) != FINANCIAL_RECEIVER_GIT or len(data) != receiver["bytes"] or sha(data) != receiver["sha256"]:
        raise RuntimeError("The maintained complete financial source receiver differs")
    receiver_path = carrier/"financial-following/receive-financial-source.py"
    retain_source_bytes(receiver_path,data)
    result_path = logs/"financial-source-receiving.json"
    run_phase("following-financial-source",
        [python,str(receiver_path),"--index",str(index_path),"--successor",str(successor_path),"--output",str(source)],
        result_path,status,logs,environment,expected_state="SOURCE_READY",result_stdout=True)
    received = status["results"]["following-financial-source"]
    if (received.get("sourceRoot") != str(source) or received.get("files") != 474
        or received.get("sourceBytes") != 6697479
        or received.get("baseSourceGitBlob") != FINANCIAL_BASE["gitBlob"]
        or received.get("successorGitBlob") != FINANCIAL_FOLLOWING["gitBlob"]
        or received.get("successorSha256") != FINANCIAL_FOLLOWING["sha256"]
        or received.get("performanceRun") != str(WORK/"performance")):
        raise RuntimeError("The following source receipt differs from the complete current financial tree")
    if operation is not None and read_json(output/"operation.json") != operation:
        raise RuntimeError("Source receiving changed the original financial operation journal")
    status["source"].append({"role":"following financial source in its retained separate root",
        "sourceCommit":FINANCIAL_MERGE,"capturedBaseCommit":following.get("sourceCommit"),
        "sourceCarrier":FINANCIAL_FOLLOWING,"receiverGitBlob":FINANCIAL_RECEIVER_GIT,
        "sourceRoot":str(source),"fileCount":received["files"],"sourceBytes":received["sourceBytes"],
        "receiving":str(result_path),"originalFinancialOperationRetained":operation is not None})
    return received

def restore_archive(archive):
    data = native_read_regular(archive)
    if len(data) != 10843745 or sha(data) != EXPECTED_ARCHIVE:
        raise RuntimeError("Saved original native04 archive identity changed; reconcile its current result")
    foundation = WORK / "original-native/flow-result.json"
    receiving = ORIGINAL_ROOT / "84df-original-archive-receiving" / EXPECTED_ARCHIVE
    request_path = receiving / "request.json"
    complete_path = receiving / "COMPLETE.json"

    def original_foundation():
        original = read_json(foundation)
        if original.get("status") != "COMPLETE" or original.get("pricingVersion") != EXPECTED_PRICING:
            raise RuntimeError("Original completed foundation identity differs")
        if original.get("operationDirectory") != str(WORK / "original-native"):
            raise RuntimeError("Original native04 absolute directory differs")
        return original

    def retain_receiving(request_bytes, complete_bytes):
        durable = WORK / "original-archive-receiving" / EXPECTED_ARCHIVE
        native_retain(durable / "request.json", request_bytes)
        native_retain(durable / "COMPLETE.json", complete_bytes)
        return durable / "COMPLETE.json"

    # Preserve the original live/saved native04 reuse path. Once this receiver
    # has its own request, its completion marker determines extraction state.
    if foundation.exists() and not request_path.exists() and not complete_path.exists():
        original_foundation()
        return {"reused": True, "archiveBytes": len(data), "archiveSha256": sha(data)}

    # Read the same bytes whose original archive identity was just verified.
    with zipfile.ZipFile(io.BytesIO(data)) as stream:
        members = stream.infolist()
        total = sum(row.file_size for row in members)
        if len(members) != 1401 or total > 1024 ** 3:
            raise RuntimeError("Original native04 archive inventory changed")
        selected = {}
        directories = {""}
        inventory = []
        for row in members:
            relative = checked_relative(row.filename)
            name = str(relative)
            if name != row.filename.rstrip("/") or name in selected:
                raise RuntimeError("Original native04 archive repeats or changes a member path")
            if stat.S_ISLNK(row.external_attr >> 16):
                raise RuntimeError("Original native04 archive contains an unexpected symlink")
            selected[name] = row
            if row.is_dir():
                directories.add(name)
            for parent in relative.parents:
                if str(parent) != ".":
                    directories.add(str(parent))
            inventory.append([name, row.file_size, row.CRC, row.is_dir()])
        request = {
            "schema": "commons.scf-native04-archive-receiving.v1",
            "operation": "SCF-TARIFF-USAGE-PERFORMANCE-25FD-20261012",
            "root": str(ORIGINAL_ROOT),
            "work": str(WORK),
            "archiveBytes": len(data),
            "archiveSha256": EXPECTED_ARCHIVE,
            "entries": len(members),
            "uncompressedBytes": total,
            "inventorySha256": sha(native_encoded(inventory)),
            "pricingVersion": EXPECTED_PRICING,
        }
        request_bytes = native_encoded(request)
        if request_path.exists() and native_read_regular(request_path) != request_bytes:
            raise RuntimeError("The original archive receiving request changed")
        if complete_path.exists():
            if not request_path.exists():
                raise RuntimeError("The original completed archive is missing its retained request")
            complete_bytes = native_read_regular(complete_path)
            complete = json.loads(complete_bytes)
            if (complete.get("schema") != "commons.scf-native04-archive-received.v1"
                or complete.get("requestSha256") != sha(request_bytes)
                or complete.get("archiveSha256") != EXPECTED_ARCHIVE
                or complete.get("entries") != len(members)):
                raise RuntimeError("The original archive completion identity changed")
            original_foundation()
            if complete.get("foundationSha256") != sha(native_read_regular(foundation)):
                raise RuntimeError("The original received foundation bytes changed")
            native_retain(request_path, request_bytes)
            native_retain(complete_path, complete_bytes)
            retained_receiving = retain_receiving(request_bytes, complete_bytes)
            return {"reused": True, "archiveBytes": len(data), "archiveSha256": EXPECTED_ARCHIVE,
                    "entries": len(members), "uncompressedBytes": total,
                    "receiving": str(retained_receiving)}

        # A partial legacy extraction is accepted only when every existing
        # member is an exact prefix of this same original archive member.
        # Unrelated files and symbolic links are preserved and reported.
        if WORK.exists():
            if WORK.is_symlink() or not WORK.is_dir():
                raise RuntimeError("Keep the original native04 work directory")
            for directory, dirs, files in os.walk(WORK, followlinks=False):
                for name in dirs:
                    path = pathlib.Path(directory) / name
                    relative = str(path.relative_to(WORK))
                    if path.is_symlink() or relative not in directories:
                        raise RuntimeError("Existing native04 directory is outside the selected archive: " + relative)
                for name in files:
                    path = pathlib.Path(directory) / name
                    relative = str(path.relative_to(WORK))
                    row = selected.get(relative)
                    if row is None or row.is_dir():
                        raise RuntimeError("Existing native04 file is outside the selected archive: " + relative)
                    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
                    try:
                        info = os.fstat(fd)
                        if not stat.S_ISREG(info.st_mode) or info.st_size > row.file_size:
                            raise RuntimeError("Existing native04 member differs: " + relative)
                        with os.fdopen(fd, "rb", closefd=False) as old, stream.open(row) as incoming:
                            remaining = info.st_size
                            while remaining:
                                size = min(1024 * 1024, remaining)
                                expected = incoming.read(size)
                                actual = old.read(size)
                                if len(actual) != size or actual != expected:
                                    raise RuntimeError("Existing native04 member differs: " + relative)
                                remaining -= size
                    finally:
                        os.close(fd)
        native_directory(receiving)
        native_retain(request_path, request_bytes)
        native_directory(WORK)
        resumed = 0
        for row in members:
            relative = checked_relative(row.filename)
            destination = WORK / relative
            if row.is_dir():
                native_directory(destination)
                continue
            native_directory(destination.parent)
            try:
                fd = os.open(destination, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            except FileExistsError:
                fd = os.open(destination, os.O_RDWR | os.O_NOFOLLOW)
            try:
                info = os.fstat(fd)
                if not stat.S_ISREG(info.st_mode) or info.st_size > row.file_size:
                    raise RuntimeError("Original native04 member differs: " + str(relative))
                retained = info.st_size
                resumed += retained
                with os.fdopen(fd, "r+b", closefd=False) as out, stream.open(row) as incoming:
                    offset = 0
                    while True:
                        chunk = incoming.read(1024 * 1024)
                        if not chunk:
                            break
                        prefix = min(len(chunk), max(0, retained - offset))
                        if prefix and out.read(prefix) != chunk[:prefix]:
                            raise RuntimeError("Original native04 member differs: " + str(relative))
                        if prefix < len(chunk):
                            out.write(chunk[prefix:])
                        offset += len(chunk)
                    if offset != row.file_size:
                        raise RuntimeError("Original native04 member size differs: " + str(relative))
                    out.flush()
                os.fsync(fd)
            finally:
                os.close(fd)
            native_sync_directory(destination.parent)
        original_foundation()
        complete = {
            "schema": "commons.scf-native04-archive-received.v1",
            "requestSha256": sha(request_bytes),
            "archiveSha256": EXPECTED_ARCHIVE,
            "entries": len(members),
            "uncompressedBytes": total,
            "completedAt": now(),
            "foundationSha256": sha(native_read_regular(foundation)),
        }
        complete_bytes = native_encoded(complete)
        native_retain(complete_path, complete_bytes)
        retained_receiving = retain_receiving(request_bytes, complete_bytes)
        return {"reused": False, "archiveBytes": len(data), "archiveSha256": EXPECTED_ARCHIVE,
                "entries": len(members), "uncompressedBytes": total,
                "resumedBytes": resumed, "receiving": str(retained_receiving)}

def run_phase(name, argv, result_path, status, log_root, environment, *,
              expected_state="COMPLETE", result_stdout=False):
    result_path = pathlib.Path(result_path)
    log_root = pathlib.Path(log_root)
    item = {"phase": name, "startedAt": now(), "argv": argv,
            "stdout": str(log_root / (name + ".stdout")),
            "stderr": str(log_root / (name + ".stderr"))}
    status["phases"].append(item)
    write_json(WORK / "FINANCIAL_NATIVE_OPERATION.json", status)
    native_sync_directory(WORK)
    process = None
    pending = []
    signals = (signal.SIGTERM, signal.SIGINT)
    original_handlers = {number: signal.getsignal(number) for number in signals}

    def defer(number, frame):
        pending.append(number)

    def interrupt(number, frame):
        raise SystemExit(128 + number)

    with open(item["stdout"], "xb") as stdout, open(item["stderr"], "xb") as stderr:
        try:
            for number in signals:
                signal.signal(number, defer)
            process = subprocess.Popen(argv, stdout=stdout, stderr=stderr, env=environment,
                                       cwd=WORK, start_new_session=True)
            item["pid"] = process.pid
            for number in signals:
                signal.signal(number, interrupt)
            if pending:
                raise SystemExit(128 + pending[0])
            print(json.dumps({"phase": name, "pid": process.pid, "status": "RUNNING"}), flush=True)
            write_json(WORK / "FINANCIAL_NATIVE_OPERATION.json", status)
            native_sync_directory(WORK)
            item["exitCode"] = process.wait()
        except BaseException as error:
            for number in signals:
                signal.signal(number, signal.SIG_IGN)
            try:
                if process is not None:
                    item["interruption"] = {"type": type(error).__name__, "message": str(error),
                                            "processGroup": process.pid, "requested": "TERM"}
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        item["interruption"]["requested"] = "KILL"
                        try:
                            os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        process.wait()
                    # The original child may have exited before its own CLI
                    # descendant. End only the group created for this phase.
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    item["exitCode"] = process.returncode
                    item["interruption"]["childDrained"] = True
                item["completedAt"] = now()
                try:
                    write_json(WORK / "FINANCIAL_NATIVE_OPERATION.json", status)
                    native_sync_directory(WORK)
                except Exception as journal_error:
                    item["journalError"] = str(journal_error)
                    print(json.dumps({"phase": name, "journalError": str(journal_error)}),
                          file=sys.stderr, flush=True)
            finally:
                for number, handler in original_handlers.items():
                    signal.signal(number, handler)
            raise
        finally:
            for number, handler in original_handlers.items():
                signal.signal(number, handler)
            stdout.flush()
            stderr.flush()
            os.fsync(stdout.fileno())
            os.fsync(stderr.fileno())
    native_sync_directory(log_root)
    item["completedAt"] = now()
    if result_stdout and item["exitCode"] == 0:
        result_bytes = native_read_regular(item["stdout"])
        result = json.loads(result_bytes)
        if not isinstance(result, dict):
            raise RuntimeError(name + " did not return its original JSON result")
        native_retain(result_path, result_bytes)
    if result_path.is_file():
        result_bytes = native_read_regular(result_path)
        result = json.loads(result_bytes)
        if not isinstance(result, dict):
            raise RuntimeError(name + " did not retain its original JSON result")
        item["result"] = str(result_path)
        item["resultBytes"] = len(result_bytes)
        item["resultSha256"] = sha(result_bytes)
        item["resultState"] = result.get("state") or result.get("status")
        status["results"][name] = result
    if item["exitCode"]:
        stderr_text = pathlib.Path(item["stderr"]).read_text(encoding="utf-8", errors="replace")
        stdout_text = pathlib.Path(item["stdout"]).read_text(encoding="utf-8", errors="replace")
        item["error"] = stderr_text[-20000:]
        print(json.dumps({"phase": name, "exitCode": item["exitCode"],
                          "stderr": stderr_text[-20000:], "stdout": stdout_text[-4000:]}), flush=True)
        raise RuntimeError(name + " exited " + str(item["exitCode"]))
    if item.get("resultState") != expected_state:
        raise RuntimeError(name + " did not retain its " + expected_state + " result")
    write_json(WORK / "FINANCIAL_NATIVE_OPERATION.json", status)
    native_sync_directory(WORK)
    print(json.dumps({"phase": name, "status": expected_state, "result": item["result"],
                      "resultSha256": item["resultSha256"]}), flush=True)

def save_complete_operation(status, receiving, helpers):
    status["nativeCompletedAt"] = now()
    status_path = WORK / "FINANCIAL_NATIVE_OPERATION.json"
    write_json(status_path, status)
    saved_name = ("SCF_Performance_Financial_Operation_20261012" if "performance-financial-operation" in status["results"]
                  else "SCF_Performance_Continued_Operator_Run_20261012")
    archive = receiving / (saved_name + ".zip")
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=3) as bundle:
        entries = 0
        for directory, dirs, files in os.walk(WORK):
            dirs.sort()
            files.sort()
            for name in files:
                path = pathlib.Path(directory) / name
                if path.is_symlink():
                    raise RuntimeError("Retained native operation contains an unexpected symlink")
                bundle.write(path, str(path.relative_to(WORK)))
                entries += 1
    archive_hash = hashlib.sha256()
    with archive.open("rb") as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b""):
            archive_hash.update(chunk)
    status["archive"] = {"path":str(archive),"bytes":archive.stat().st_size,"sha256":archive_hash.hexdigest(),"entries":entries}
    release_source_memory()
    report = receiving / (saved_name + ".json")
    write_json(report, status)
    uploads = [
        {"local_path":str(archive),"purpose":"create_library_file","library_artifact_type":"other"},
        {"local_path":str(report),"purpose":"create_library_file","library_artifact_type":"report"}
    ]
    report_html = pathlib.Path(status.get("financialOutput",str(WORK/"financial"))) / "index.html"
    if report_html.is_file():
        html = receiving / (saved_name + ".html")
        shutil.copyfile(report_html, html)
        uploads.append({"local_path":str(html),"purpose":"create_library_file","library_artifact_type":"report"})
    request = {"uploads":uploads}
    upload_state = receiving/"upload-state"
    upload_state.mkdir(mode=0o700)
    upload_entry = (
        "import json,sys\nfrom pathlib import Path\n"
        "sys.path.insert(0,sys.argv[1])\n"
        "from library_upload import LibraryUploadWorkflow,HostedAppsClient,LibraryFileMaterializer,SignedUrlUploader\n"
        "request=json.load(sys.stdin)\n"
        "workflow=LibraryUploadWorkflow(apps_client=HostedAppsClient(),materializer=LibraryFileMaterializer(),uploader=SignedUrlUploader(),state_parent=Path(sys.argv[2]))\n"
        "print(json.dumps(workflow.run(request),separators=(',',':')))\n"
    )
    run = subprocess.run([sys.executable,"-c",upload_entry,str(helpers),str(upload_state)],input=json.dumps(request),
                         text=True,capture_output=True,cwd=receiving)
    write_bytes(receiving/"library-upload.stdout",run.stdout.encode())
    write_bytes(receiving/"library-upload.stderr",run.stderr.encode())
    if run.returncode:
        print(json.dumps({"phase":"SAVE_FAILED","exitCode":run.returncode,"stdout":run.stdout,
                          "stderr":run.stderr,"archive":status["archive"]}),flush=True)
        raise RuntimeError("Private completed operation save failed")
    saved = json.loads(run.stdout)
    results = saved.get("results") if isinstance(saved,dict) else None
    if not isinstance(results,list) or len(results) != len(uploads):
        raise RuntimeError("Private save did not return every ordered artifact result")
    status["saved"] = saved
    print(json.dumps({"phase":"SAVED","status":status["status"],"receiving":str(receiving),
                      "work":str(WORK),"archive":status["archive"],"saved":saved}),flush=True)
    write_json(receiving/"SAVED_FINANCIAL_OPERATION.json",status)
    if any(row.get("status") != "succeeded" for row in results):
        raise RuntimeError("One or more private artifact saves failed; retain the ordered results")
    return saved

def source_json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

def source_checked(data, row, label):
    if len(data) != row["bytes"] or sha(data) != row["sha256"] or git_blob(data) != row["gitBlob"]:
        raise RuntimeError("Original source identity differs: " + label)
    return data

def resource_snapshot():
    result = {"pid":os.getpid()}
    for name in ("memory.max","memory.current","memory.events","memory.swap.max"):
        path = pathlib.Path("/sys/fs/cgroup")/name
        if path.is_file():
            try:
                result[name] = path.read_text().strip()
            except OSError:
                pass
    try:
        result["maxRssKiB"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        result["childMaxRssKiB"] = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    except (AttributeError, OSError):
        pass
    return result

def release_source_memory():
    gc.collect()
    try:
        libc = ctypes.CDLL(None)
        trim = libc.malloc_trim
        trim.argtypes = [ctypes.c_size_t]
        trim.restype = ctypes.c_int
        trim(0)
    except (AttributeError,OSError):
        pass

def retained_source_blob_reader(source_files):
    """Read the exact original source carriers supplied by the receiving operator."""
    if (not isinstance(source_files, dict)
        or set(source_files) not in ({"compact", "complete", "following"}, {"compact", "index", "following"})):
        raise RuntimeError("sourceFiles must select compact, following and one original complete file or index")
    selected = {}
    for name, value in source_files.items():
        if not isinstance(value, str) or not value or not pathlib.Path(value).is_absolute():
            raise RuntimeError("Use the absolute original sourceFiles path for " + name)
        selected[name] = pathlib.Path(value)
    descriptors = {
        "compact": {"gitBlob": "96d4980da9795e19f7cc1daecdb51634e04da018", "bytes": 2485576},
        "complete": FINANCIAL_BASE,
        "following": FINANCIAL_FOLLOWING,
        "index": {"gitBlob": FINANCIAL_BASE["indexGitBlob"], "bytes": 4949},
    }

    def read_carrier(name):
        if name == "complete" and "index" in selected:
            index = json.loads(read_carrier("index"))
            pieces = []
            for number, descriptor in enumerate(index["parts"], 1):
                if descriptor["part"] != number or descriptor["total"] != len(index["parts"]):
                    raise RuntimeError("Original local source index order differs")
                path = selected["index"].parent / checked_relative(descriptor["path"])
                part = json.loads(source_checked(native_read_regular(path), descriptor, str(path)))
                if (part["schema"] != "commons.complete-source-text-part.v1"
                    or part["part"] != number or part["total"] != len(index["parts"])
                    or part["completeSourceGitBlob"] != FINANCIAL_BASE["gitBlob"]
                    or part["encoding"] != "utf-8"):
                    raise RuntimeError("Original local source part identity differs")
                piece = part["content"].encode("utf-8")
                if (len(piece) != descriptor["sourceContentBytes"] or sha(piece) != descriptor["sourceContentSha256"]
                    or len(piece) != part["contentBytes"] or sha(piece) != part["contentSha256"]):
                    raise RuntimeError("Original local source content segment differs")
                pieces.append(piece)
            data = b"".join(pieces)
        else:
            data = native_read_regular(selected[name])
        descriptor = descriptors[name]
        if len(data) != descriptor["bytes"] or git_blob(data) != descriptor["gitBlob"]:
            raise RuntimeError("Complete original local source differs: " + name)
        if "sha256" in descriptor and sha(data) != descriptor["sha256"]:
            raise RuntimeError("Complete original local source digest differs: " + name)
        return data

    def read_blob(expected):
        for name, descriptor in descriptors.items():
            if expected == descriptor["gitBlob"] and (name in selected or name == "complete"):
                return read_carrier(name)
        compact = json.loads(read_carrier("compact"))
        if expected == compact["indexGitBlob"]:
            return source_json_bytes(compact["indexTemplate"])
        supplied = compact["sourceBlobs"].get(expected)
        if supplied is not None:
            return supplied.encode("utf-8")
        complete_bytes = read_carrier("complete")
        for descriptor, template in zip(compact["indexTemplate"]["parts"], compact["partTemplates"], strict=True):
            if descriptor["gitBlob"] == expected:
                offset = sum(row["sourceContentBytes"] for row in compact["indexTemplate"]["parts"]
                             if row["part"] < descriptor["part"])
                piece = complete_bytes[offset:offset + descriptor["sourceContentBytes"]]
                if len(piece) != descriptor["sourceContentBytes"] or sha(piece) != descriptor["sourceContentSha256"]:
                    raise RuntimeError("Original local source segment differs")
                if template["part"] != descriptor["part"] or template["total"] != len(compact["indexTemplate"]["parts"]):
                    raise RuntimeError("Original local source part order differs")
                part = {**template, "content": piece.decode("utf-8")}
                return source_checked(source_json_bytes(part), descriptor, descriptor["path"])
        complete = json.loads(complete_bytes)
        for row in complete["files"] + complete["foundationFiles"]:
            if row["gitBlob"] == expected:
                return source_checked(row["content"].encode("utf-8"), row, row["path"])
        raise RuntimeError("The selected original source carriers do not contain Git blob " + expected)

    def checked_blob(expected):
        data = read_blob(expected)
        if git_blob(data) != expected:
            raise RuntimeError("Original local source bytes differ: " + expected)
        return data

    # Verify every complete selection before source adoption. The original caller
    # still owns each source write, its journal and the complete customer run.
    for name in ("compact", "complete", "following"):
        read_carrier(name)
    return checked_blob


def receive_compact_source(payload, receiving):
    local_files = payload.get("sourceFiles")
    if local_files is not None:
        local_read = retained_source_blob_reader(local_files)
        receipts = []
        def receive_blob(expected):
            data = local_read(expected)
            receipts.append({"action":"source","transport":"retained-local-source",
                             "gitBlob":expected,"bytes":len(data)})
            return data
    else:
        path = pathlib.Path(payload.get("githubReaderPath","/workspace/scratch/c79fd06aedf2/scf-usage/github_ops.py"))
        if sha(path.read_bytes()) != "86f055b8ff4da2ebb35fdeeba48e0f76f09b843eb2de5fd8bd7f92329c49618a":
            raise RuntimeError("The original secondary Git reader changed")
        spec = importlib.util.spec_from_file_location("scf_original_github_reader",path)
        reader = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(reader)
        identity = reader.api_response("/user",actor="tokenjunkielabs")
        if identity["data"].get("id") != 311286379 or identity["data"].get("login") != "tokenjunkielabs":
            raise RuntimeError("Original secondary Git actor differs")
        receipts = [{"action":"identity","login":identity["data"]["login"],"id":identity["data"]["id"],
                     "receipt":identity["receipt"]}]
        def receive_blob(expected):
            response = reader.api_response("/repos/"+REPO+"/git/blobs/"+expected,actor="tokenjunkielabs")
            value = response["data"]
            if value.get("sha") != expected or value.get("encoding") != "base64":
                raise RuntimeError("Original Git source response differs")
            data = base64.b64decode(value["content"].replace("\n",""),validate=True)
            if git_blob(data) != expected:
                raise RuntimeError("Original Git source bytes differ")
            receipts.append({"action":"source","gitBlob":expected,"bytes":len(data),"receipt":response["receipt"]})
            return data
    raw = receive_blob(payload["compactSource"]["gitBlob"])
    if len(raw) != payload["compactSource"]["bytes"]:
        raise RuntimeError("The compact original source byte count differs")
    compact = json.loads(raw)
    if compact.get("schema") != "commons.native04-original-archive-source-delta.v1":
        raise RuntimeError("Unknown original archive source continuation")
    if compact["originalArchive"]["sha256"] != EXPECTED_ARCHIVE:
        raise RuntimeError("Source continuation belongs to a different saved archive")
    carrier = WORK/"source-carriers"
    carrier.mkdir(parents=True,exist_ok=True,mode=0o700)
    retain_source_bytes(carrier/"native04-source-delta.json",raw)
    base = compact["baseTemplate"]
    installed = []
    for role, rows, target in (("current",base["files"],WORK/"source"),
                               ("foundation",base["foundationFiles"],WORK/"foundation-source")):
        for row in rows:
            destination = target/checked_relative(row["path"])
            prior = destination.read_bytes() if destination.is_file() else None
            retained = prior is not None and git_blob(prior) == row["gitBlob"]
            if retained:
                data = prior
            elif row["gitBlob"] in compact["sourceBlobs"]:
                data = compact["sourceBlobs"][row["gitBlob"]].encode("utf-8")
            else:
                data = receive_blob(row["gitBlob"])
            source_checked(data,row,row["path"])
            # Reconstruct the exact source carrier only. The original producer's
            # installer below owns source changes and preserves its retained411 files.
            row["content"] = data.decode("utf-8")
            installed.append({"role":role,"path":row["path"],"gitBlob":row["gitBlob"],
                              "bytes":len(data),"loadedFromRetainedFile":retained})
    if len(base["files"]) != base["fileCount"] or sum(row["bytes"] for row in base["files"]) != base["sourceBytes"]:
        raise RuntimeError("Original complete source counts differ")
    full = source_json_bytes(base)
    expected = compact["completeSource"]
    if git_blob(full) != expected["gitBlob"]:
        full = receive_blob(expected["gitBlob"])
        base = json.loads(full)
    source_checked(full,expected,"complete original0fff source")
    retain_source_bytes(carrier/("performance-"+expected["gitBlob"]+".json"),full)
    index_bytes = source_json_bytes(compact["indexTemplate"])
    if git_blob(index_bytes) != compact["indexGitBlob"]:
        index_bytes = receive_blob(compact["indexGitBlob"])
    index = json.loads(index_bytes)
    if index["completeSource"]["gitBlob"] != expected["gitBlob"]:
        raise RuntimeError("Original source index changed")
    index_path = carrier/"performance-parts/source-transfer.json"
    retain_source_bytes(index_path,index_bytes)
    offset = 0
    for descriptor, template in zip(index["parts"],compact["partTemplates"],strict=True):
        if template["part"] != descriptor["part"] or template["total"] != len(index["parts"]):
            raise RuntimeError("Original source part order differs")
        piece = full[offset:offset+descriptor["sourceContentBytes"]]
        offset += len(piece)
        if len(piece) != descriptor["sourceContentBytes"] or sha(piece) != descriptor["sourceContentSha256"]:
            raise RuntimeError("Original source content segment differs")
        template["content"] = piece.decode("utf-8")
        part = source_json_bytes(template)
        if git_blob(part) != descriptor["gitBlob"]:
            part = receive_blob(descriptor["gitBlob"])
        source_checked(part,descriptor,descriptor["path"])
        retain_source_bytes(index_path.parent/checked_relative(descriptor["path"]),part)
    if offset != len(full):
        raise RuntimeError("Original source part range is incomplete")
    following = compact["financialSuccessor"]
    following_bytes = source_checked(following["content"].encode("utf-8"),following,"financial successor")
    following_commit = "c2199987c03b59ee41cc28c0f247840e3948ea87"
    following_path = "experiments/merchant-performance-financial-84df-20261012/financial-source-successor.json"
    if local_files is not None:
        published_bytes = receive_blob(FINANCIAL_FOLLOWING["gitBlob"])
        published_git = git_blob(published_bytes)
    else:
        response = reader.api_response("/repos/"+REPO+"/contents/"+following_path+"?ref="+following_commit,actor="tokenjunkielabs")
        value = response["data"]
        if value.get("path") != following_path or value.get("encoding") != "base64":
            raise RuntimeError("Published following source response differs")
        published_bytes = base64.b64decode(value["content"].replace("\n",""),validate=True)
        published_git = git_blob(published_bytes)
        if value.get("sha") != published_git:
            raise RuntimeError("Published following source Git response differs")
        receipts.append({"action":"following-source","gitBlob":published_git,"sourceCommit":following_commit,"receipt":response["receipt"]})
    source_checked(published_bytes, FINANCIAL_FOLLOWING, "published PR424 following source")
    retain_source_bytes(carrier/"financial-source-predecessor.json",following_bytes)
    following_bytes = published_bytes
    following = {"gitBlob":published_git,"bytes":len(published_bytes),"sha256":sha(published_bytes),"sourceCommit":following_commit}
    print(json.dumps({"phase":"FOLLOWING_SOURCE_RECEIVED",**following}),flush=True)
    successor_path = carrier/("financial-following-"+following["gitBlob"]+".json")
    retain_source_bytes(successor_path,following_bytes)
    successor = json.loads(following_bytes)
    receiver = next(row for row in successor["files"] if row["path"] == compact["financialReceiver"]["path"])
    receiver_bytes = source_checked(receiver["content"].encode("utf-8"),receiver,"original financial source receiver")
    if receiver["gitBlob"] != "43ad53377c68eb82e06f2187993b3e3de20ea328":
        raise RuntimeError("Published PR424 financial source receiver differs")
    receiver_path = carrier/"financial-following/receive-financial-source.py"
    retain_source_bytes(receiver_path,receiver_bytes)
    write_json(carrier/("receiving-"+receiving.name+".json"),{"requests":receipts,"files":installed,
        "sourceFiles":local_files})
    result = {"sourceIndex":str(index_path),"sourceSuccessor":str(successor_path),
              "sourceReceiver":str(receiver_path),"sourceCarrier":expected,
              "compactSource":payload["compactSource"],"financialSuccessor":{k:following[k] for k in ("gitBlob","bytes","sha256")},
              "authority":{"native04":base.get("native04"),"financialSource":base.get("financialSource")},
              "sourceOverrides":base.get("sourceOverrides",[]),"fileCount":len(base["files"]),
              "foundationFiles":len(base["foundationFiles"]),"sourceBodiesReceived":sum(not row["loadedFromRetainedFile"] for row in installed),
              "following":successor["receiving"],"followingGraph":successor["graph"],
              "sourceRequests":0 if local_files is not None else len(receipts)-1,
              "sourceIntake":"retained-local-source" if local_files is not None else "original-secondary-Git",
              "retainedBlobReads":len(receipts) if local_files is not None else None}
    print(json.dumps({"phase":"SOURCE_RECEIVED","gitBlob":expected["gitBlob"],"bytes":expected["bytes"],
                      "files":result["fileCount"],"foundationFiles":result["foundationFiles"],
                      "sourceBodiesReceived":result["sourceBodiesReceived"],"sourceRequests":result["sourceRequests"]}),flush=True)
    return {"packets":{"performance":base,"financial-following":successor},"receipt":result}


def native_receiving_parent(payload):
    value = payload.get("receivingDirectory")
    if value is None:
        return pathlib.Path("/dev")
    if not isinstance(value, str) or not value or "\0" in value:
        raise RuntimeError("receivingDirectory must be an absolute private directory")
    parent = pathlib.Path(value)
    if not parent.is_absolute() or pathlib.Path(os.path.abspath(parent)) != parent:
        raise RuntimeError("receivingDirectory must be an absolute normalized private directory")
    if parent == ORIGINAL_ROOT or ORIGINAL_ROOT in parent.parents:
        raise RuntimeError("Retain receiving and complete archives outside the original native04 work tree")
    native_directory(parent)
    info = parent.lstat()
    if (not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode)
        or info.st_uid != os.getuid() or info.st_mode & 0o077):
        raise RuntimeError("receivingDirectory must be owned by the original receiver with mode0700")
    return parent

def main(payload):
    receiving = pathlib.Path(tempfile.mkdtemp(prefix="scf-performance-financial-84df-",dir=native_receiving_parent(payload)))
    helpers = receiving/"library-helpers"
    helpers.mkdir(mode=0o700)
    for name, body in payload["helpers"].items():
        write_bytes(helpers/name, body.encode("utf-8"))
    print(json.dumps({"phase":"RECEIVING","pid":os.getpid(),"receiving":str(receiving),"originalRoot":str(ORIGINAL_ROOT),"resource":resource_snapshot()}),flush=True)
    original_processes = live_native04_processes()
    if original_processes:
        raise RuntimeError("Original native04 process still active: "+json.dumps(original_processes))
    ORIGINAL_ROOT.mkdir(exist_ok=True,parents=True,mode=0o700)
    lock = open(ORIGINAL_ROOT/"84df-continuation.lock","a+")
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    archive = pathlib.Path("/dev/scf-performance-84df-receive-fxtudpgu/downloads/SCF_Performance_Operator_Run_20261012.zip")
    if not archive.is_file():
        download = subprocess.run([sys.executable,str(helpers/"library_download.py")],
            input=json.dumps({"result":payload["result"],"selection":payload["selection"],"destination":"downloads"}),
            text=True,capture_output=True,cwd=receiving)
        write_bytes(receiving/"library-download.stdout",download.stdout.encode())
        write_bytes(receiving/"library-download.stderr",download.stderr.encode())
        if download.returncode:
            print(json.dumps({"phase":"DOWNLOAD_FAILED","exitCode":download.returncode,
                              "stdout":download.stdout,"stderr":download.stderr}),flush=True)
            raise RuntimeError("Original saved archive receiving failed")
        downloaded = json.loads(download.stdout)
        candidates = []
        def original_download_paths(value):
            if isinstance(value,dict):
                for item in value.values():
                    original_download_paths(item)
            elif isinstance(value,list):
                for item in value:
                    original_download_paths(item)
            elif isinstance(value,str) and pathlib.Path(value).is_absolute():
                path = pathlib.Path(value)
                if path.is_file() and not path.is_symlink() and path.stat().st_size == 10843745:
                    if sha(path.read_bytes()) == EXPECTED_ARCHIVE:
                        candidates.append(path)
        original_download_paths(downloaded.get("files",downloaded))
        candidates = list(dict.fromkeys(candidates))
        if len(candidates) != 1:
            raise RuntimeError("The original Library receiver must return the exact saved native04 archive")
        archive = candidates[0]
    receiving_info = restore_archive(archive)
    financial_output,financial_source,financial_operation = selected_financial_paths(payload)
    status = {"schema":"commons.scf-performance-financial-native-operation.v1",
              "operation":"SCF-TARIFF-USAGE-PERFORMANCE-25FD-20261012",
              "continuation":"84DF accepted quote to issued invoice and service calendar",
              "startedAt":now(),"pid":os.getpid(),"root":str(ORIGINAL_ROOT),"status":"RUNNING",
              "originalArchive":{**payload["archiveIdentity"],**receiving_info},
              "financialOutput":str(financial_output),"financialSourceRoot":str(financial_source),
              "existingFinancialOperation":None if financial_operation is None else {
                  "operationId":financial_operation["operationId"],
                  "sourceRoot":financial_operation["sourceRoot"],
                  "operationSha256":sha((financial_output/"operation.json").read_bytes())},
              "phases":[],"results":{},"source":[]}
    logs = begin_native_attempt(status)
    def interrupted(signum, frame):
        raise InterruptedError("Original native04 receiving interrupted by signal "+str(signum))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    source = WORK/"source"
    try:
        prior_metadata = payload.get("sourcePackets",{}).get("performance",{})
        if prior_metadata and prior_metadata.get("gitBlob") != FINANCIAL_BASE["gitBlob"]:
            raise RuntimeError("Use the original native04 full471-file base carrier for this continuation")
        received = receive_compact_source(payload, receiving)
        packets = received.pop("packets")
        status["source"].append({"role":"compact original carrier receiving",**received["receipt"]})
        original_packet = packets["performance"]
        original_receipt = install_original_performance(original_packet, source)
        status["source"].append({"role":"original retained Performance continuation",
            "sourceCarrier":FINANCIAL_BASE,
            "sourceAuthority":{"native04":original_packet.get("native04")},
            "fileCount":len(original_receipt),
            "addedMissingFiles":sum(row["addedMissingSource"] for row in original_receipt),
            "existingFilesPreserved":sum(row["existingSourcePreserved"] for row in original_receipt),
            "sourceRoot":str(source)})
        write_json(logs/"original-performance-source.json",original_receipt)
        write_json(WORK/"FINANCIAL_NATIVE_OPERATION.json",status)
        node = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
        python = os.environ.get("CODEX_PRIMARY_RUNTIME_PYTHON") or sys.executable
        if not node:
            raise RuntimeError("Original programme requires Node")
        environment = dict(os.environ)
        environment["TMPDIR"] = str(receiving)
        status["node"] = node
        del original_packet, packets
        release_source_memory()
        status["resourcesBeforePerformance"] = resource_snapshot()
        print(json.dumps({"phase":"SOURCE_BUFFERS_RELEASED","resource":status["resourcesBeforePerformance"]}),flush=True)
        completed = WORK/"performance/flow-result.json"
        if completed.is_file():
            original_result = read_json(completed)
            if (original_result.get("schema") != "stellar-forge.merchant-performance-customer-result.v1"
                or original_result.get("state") != "COMPLETE"
                or original_result.get("operationDirectory") != str(WORK/"performance")
                or original_result.get("originalNative") != str(WORK/"original-native")):
                raise RuntimeError("Keep the complete original Performance result and directory")
            status["results"]["performance-customer-operation"] = original_result
            status["phases"].append({"phase":"performance-customer-operation","status":"RECEIVED_COMPLETE",
                "result":str(completed),"resultSha256":sha(completed.read_bytes())})
        else:
            run_phase("performance-customer-operation",
                [node,str(source/SCF/"sf74-merchant-support-console/commercial/performance-native.mjs"),
                 "--native-run",str(WORK/"original-native"),"--output",str(WORK/"performance"),"--python",python],
                completed,status,logs,environment)
        financial_complete = retain_completed_financial(financial_output,financial_operation,status)
        retained_performance_source = financial_operation is not None and financial_source == source
        packets = {}
        if not financial_complete:
            packets["financial-following"] = read_json(WORK/"source-carriers"/("financial-following-"+FINANCIAL_FOLLOWING["gitBlob"]+".json"))
            if retained_performance_source:
                packets["performance"] = read_json(WORK/"source-carriers"/("performance-"+FINANCIAL_BASE["gitBlob"]+".json"))
                receive_retained_financial(packets,financial_output,financial_source,financial_operation,status)
            else:
                receive_following_financial(packets,financial_output,financial_source,financial_operation,
                                           python,status,logs,environment)
        else:
            status["source"].append({"role":"retained financial operation and its original source",
                "sourceRoot":str(financial_source),"operationId":financial_operation["operationId"],
                "resultSha256":sha((financial_output/"flow-result.json").read_bytes()) if financial_complete else None,
                "originalSourceBindingPreserved":True})
        del packets
        release_source_memory()
        status["resourcesBeforeFinancial"] = resource_snapshot()
        financial_argv = [node,str(financial_source/HELPER),"--source-root",str(financial_source),
            "--native-run",str(WORK/"original-native"),"--performance-run",str(WORK/"performance"),
            "--output",str(financial_output),"--python",python]
        if financial_operation is not None:
            for flag,key in [("--actor","actor"),("--start-date","startDate"),("--term-months","termMonths"),
                             ("--billing-months","billingMonths"),("--currency-scale","currencyScale")]:
                financial_argv.extend([flag,str(financial_operation[key])])
        run_phase("performance-financial-operation",financial_argv,financial_output/"flow-result.json",
                  status,logs,environment)
        status["status"] = "COMPLETE"
    except BaseException as error:
        status["status"] = "FAILED"
        status["failure"] = {"type":type(error).__name__,"message":str(error),"traceback":traceback.format_exc()}
        print(json.dumps({"phase":"OPERATION_FAILED","error":status["failure"],"resource":resource_snapshot()}),flush=True)
    finally:
        release_source_memory()
        save_complete_operation(status,receiving,helpers)
    return 0 if status["status"] == "COMPLETE" else 1

if __name__ == "__main__":
    raise SystemExit(main(json.load(sys.stdin)))
