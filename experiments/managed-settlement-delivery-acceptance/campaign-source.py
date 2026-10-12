#!/usr/bin/env python3
"""MIT. Exact selected rollout source inside the original E49 receiving operation.

Uses the original Commons d0b16bd source bootstrap and configured read-only Git donor.
The sole original receiving controller owns admission, processes and output persistence.
"""
import hashlib,json,os,pathlib,posixpath,re,stat,subprocess,sys,time
OPERATION="SCF-MANAGED-SF98-DELIVERY-E49D-20261012"
HEAD="e316fc9db6ef67949938b560a36c4700bf38410b"
PREFIX="stellar/scf-starforge-20261009/distribution/"
MAX_FILE=2*1024*1024
MAX_SOURCE=128*1024*1024
PREFIXES=["stellar/scf-starforge-20261009/distribution/","stellar/scf-starforge-20261009/merchant-fleet-gateway/","stellar/scf-starforge-20261009/sf82-seller-pilot/","stellar-forge/mcp-merchant-operator/","stellar/scf-starforge-20261009/sf30-seller-sdk/python/"]
PINNED={
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/workspace/server.mjs": "70c562dba3e53c17368081eff7ed107ac5058ee0",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/workspace/browser.mjs": "695b0c70bd061efa11ad7cdbef3e46559d730d5e",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/workspace/campaigns.mjs": "c526caeda6e3fb67f8f8e6ca5abe69898dce9e64",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/workspace/index.html": "eb7115e135123c791838179dabf60c6e7c36c743",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/workspace/style.css": "0f4575f70c039d6aaa26570f1c271107297bcd24",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/workspace/browser-assets.json": "9846b47efa09d9c0f80eab69a5c9c2d9e0ce0e00",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/release-campaigns.mjs": "af3ce6437da2957ff4e7bf9dff5a22f841cba61e",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/release-operator.mjs": "2e773e8c34ed77854c99a4e82c46df677718c311",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/rollout-state.mjs": "df2d3d09d127a19e56382e30cccdaf74209b3e5d",
  "stellar/scf-starforge-20261009/distribution/selections/merchant-fleet.json": "c68cba56cac2ec58aaa4437b7d30f476ce73bc6e",
  "stellar/scf-starforge-20261009/distribution/contributions/merchant-fleet-campaigns.json": "051d7510a439ea7b94bb8ed10ec3491e4aa2e8e3",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/examples/campaign.json": "23e28bfb6e02b9b2907df31bb100a2a73a7e2ba5",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/CAMPAIGNS.md": "aa8ae0826e5f2ca82631499115100688f7935c51",
  "products/merchant-fleet/OPERATING.md": "dde7aab5a44fce8705809c3fb437c99705c8c57c",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/release-cli.mjs": "2eab02c97120118ad20d4e416ad1ad27b9b24b35",
  "stellar-forge/mcp-merchant-operator/catalog/fleet-campaigns.mjs": "394cea451610aad9ecd9a49de996eb147c5f5e84",
  "stellar-forge/mcp-merchant-operator/catalog/fleet.mjs": "89a14df2cac8a57ef4ad86e6fa2ba35ddb8decec",
  "stellar-forge/mcp-merchant-operator/providers/fleet.mjs": "7e83ac625d6ee16af1d83f86b335ed1a5d31a014",
  "stellar-forge/mcp-merchant-operator/fleet.mjs": "6163a07c463f326ecd1cf406907af93a58912d19",
  "stellar-forge/mcp-merchant-operator/fleet-campaign-client.mjs": "bb12aa0ba433a9cb3dc6222c0d14c12f1ff26cf9",
  "stellar-forge/mcp-merchant-operator/fleet-campaign-client.d.mts": "abf3010517c97e51d3f02bcc828dcca3039785b3",
  "stellar-forge/mcp-merchant-operator/FLEET_CAMPAIGN_CLIENT.md": "9b160d63f1b08aac276903229a02661a2f08d442",
  "stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs": "1485e7684755399b136013c8bf882cf590000b95",
  "stellar/scf-starforge-20261009/sf82-seller-pilot/release-python.mjs": "f8532d6b13e346d3fe7e74788eb518d6c9f11167",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs": "ad324ba35f477871856a8fab8f18a7c873004201",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/application-environment.mjs": "9320041597a7d04afd9f15c707a303bd3cc25042",
  "stellar/scf-starforge-20261009/sf98-merchant-delivery/outbox.mjs": "48e4f643601fb8464f695dd8e8785f4ad9e0f21c",
  "stellar-forge/mcp-merchant-operator/serve.mjs": "082122ec84d445058026afd4211ed8cf643b390c",
  "stellar-forge/mcp-merchant-operator/provider-contract.mjs": "84a78fa4f594294b3b3e82d7056a5aeff740ab3d"
}
ENTRIES=[
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/workspace/server.mjs",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/release-cli.mjs",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/release-operator.mjs",
  "stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs",
  "stellar/scf-starforge-20261009/sf82-seller-pilot/release-child.mjs",
  "stellar/scf-starforge-20261009/sf82-seller-pilot/release-python.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/application-environment.mjs",
  "stellar/scf-starforge-20261009/sf98-merchant-delivery/outbox.mjs",
  "stellar-forge/mcp-merchant-operator/serve.mjs",
  "stellar-forge/mcp-merchant-operator/providers/fleet.mjs",
  "stellar-forge/mcp-merchant-operator/fleet.mjs",
  "stellar-forge/mcp-merchant-operator/fleet-campaign-client.mjs"
]
MODULE_IMPORTS = r"""
const { SourceTextModule } = await import('node:vm');
let data = '';
for await (const chunk of process.stdin) data += chunk;
const rows = JSON.parse(data), result = [];
for (const row of rows) {
  const module = new SourceTextModule(row.content, { identifier: row.path });
  const imports = new Set(module.dependencySpecifiers);
  for (const match of row.content.matchAll(/\bimport\s*\(\s*(['"])([^'"\r\n]+)\1\s*\)/g)) if (match[2].startsWith('.')) imports.add(match[2]);
  const resources = [];
  for (const match of row.content.matchAll(/\bnew\s+URL\s*\(\s*(['"])([^'"\r\n]+)\1\s*,\s*import\.meta\.url\s*\)/g)) resources.push(match[2]);
  result.push({ path: row.path, imports: [...imports], resources });
}
process.stdout.write(JSON.stringify(result));
"""

def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def bytes_sha(data):
    return hashlib.sha256(data).hexdigest()


def digest(path):
    value = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def read(path):
    with open(path, encoding="utf-8") as source:
        return json.load(source)


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def save(path, value):
    path = pathlib.Path(path)
    raw = (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()
    temporary = path.with_name(path.name + ".next-" + str(os.getpid()))
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=False) as output:
            output.write(raw)
            output.flush()
            os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.replace(temporary, path)
    sync_directory(path.parent)


def private_directory(path, create=False):
    path = pathlib.Path(path).absolute()
    if create:
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or path.is_symlink() or path.resolve() != path:
        raise ValueError("Select an ordinary canonical private directory: " + str(path))
    if info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise ValueError("Keep this operation directory private to its native actor: " + str(path))
    return path


def exact_file(path, content, executable=False):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    for parent in (path.parent, *path.parent.parents):
        if parent.is_symlink():
            raise ValueError("Do not materialize source through a symbolic directory.")
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
                             0o700 if executable else 0o600)
    except FileExistsError:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size != len(content) or digest(path) != bytes_sha(content):
            raise ValueError("Retained original source differs: " + str(path))
        return
    try:
        with os.fdopen(descriptor, "wb", closefd=False) as output:
            output.write(content)
            output.flush()
            os.fsync(descriptor)
    finally:
        os.close(descriptor)
    sync_directory(path.parent)


def git(repository, arguments, env, log, data=None, optional=False):
    result = subprocess.run(["git", "--no-replace-objects", "--no-lazy-fetch", *arguments],
                            cwd=repository, env=env, input=data,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    with open(log, "ab") as output:
        os.fchmod(output.fileno(), 0o600)
        output.write(("git " + arguments[0] + " exit " + str(result.returncode) + "\n").encode())
        # A configured remote can contain credentials; keep its diagnostics private.
        output.write(result.stderr)
        output.flush()
    if result.returncode:
        if optional:
            return None
        raise RuntimeError("Original Git source operation failed (exit " + str(result.returncode) +
                           "); inspect private source-fetch.log.")
    return result.stdout


def private_git(root, intent, env):
    donor_repo = pathlib.Path(intent["repository"])
    clean = dict(env)
    for key in ("GIT_DIR", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY",
                "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_WORK_TREE"):
        clean.pop(key, None)
    log = root / "source-fetch.log"
    observed_head = git(donor_repo, ["rev-parse", "--verify", "HEAD"], clean, log, optional=True)
    original_head = observed_head.decode().strip() if observed_head else None
    object_name = git(donor_repo, ["rev-parse", "--git-path", "objects"], clean, log).decode().strip()
    objects = pathlib.Path(object_name)
    if not objects.is_absolute():
        objects = donor_repo / objects
    objects = objects.resolve(strict=True)
    directory = root / "source-git"
    if not (directory / "HEAD").exists():
        if directory.exists():
            raise ValueError("Retain and reconcile the incomplete private Git directory.")
        git(donor_repo, ["init", "--bare", "--object-format=sha1", str(directory)], clean, log)
        os.chmod(directory, 0o700)
    private_directory(directory)
    env.update({"GIT_DIR": str(directory), "GIT_COMMON_DIR": str(directory),
                "GIT_OBJECT_DIRECTORY": str(directory / "objects"),
                "GIT_ALTERNATE_OBJECT_DIRECTORIES": str(objects)})
    marker = directory / "donor-config.json"
    if not marker.exists():
        raw = git(donor_repo, ["config", "--null", "--get-regexp",
            r"^(remote\..*\.(url|fetch|promisor|partialclonefilter)|extensions\.partialclone)$"],
            clean, log, optional=True) or b""
        entries = []
        for item in raw.split(b"\0"):
            if item:
                key, value = item.split(b"\n", 1)
                entries.append((key.decode(), value.decode()))
        for key in dict.fromkeys(key for key, _ in entries):
            git(directory, ["config", "--local", "--unset-all", key], env, log, optional=True)
        for key, value in entries:
            git(directory, ["config", "--local", "--add", key, value], env, log)
        os.chmod(directory / "config", 0o600)
        # Persist the read-only alternate as well, so an independent later CLI can
        # reopen this exact private repository without inheriting our environment.
        exact_file(directory / "objects" / "info" / "alternates", (str(objects) + "\n").encode())
        save(marker, {"schema": "starforge.receiving-git-donor.v1",
                     "repository": str(donor_repo), "objects": str(objects),
                     "remoteConfigurationSha256": bytes_sha(raw)})
    observed = read(marker)
    if observed.get("repository") != str(donor_repo) or observed.get("objects") != str(objects):
        raise ValueError("The private Git source belongs to a different donor.")
    if git(directory, ["cat-file", "-e", HEAD + "^{commit}"], env, log, optional=True) is None:
        if intent["offlineSource"]:
            raise ValueError("The exact committed product is absent from the selected offline donor.")
        git(directory, ["-c", "credential.helper=", "-c", "fetch.negotiationAlgorithm=noop",
            "fetch", "--no-tags", "--no-write-fetch-head", "--no-auto-maintenance",
            "--recurse-submodules=no", "--depth=1", "--filter=blob:none", "origin", HEAD], env, log)
    actual = git(directory, ["rev-parse", "--verify", HEAD + "^{commit}"], env, log).decode().strip()
    if actual != HEAD:
        raise ValueError("The selected immutable product source differs.")
    return directory, clean, original_head


def bootstrap(root, intent, env):
    repository, donor_env, donor_before = private_git(root, intent, env)
    log = root / "source-fetch.log"
    tree_raw = git(repository, ["ls-tree", "-r", "-z", "--full-tree", HEAD], env, log)
    tree = {}
    for item in tree_raw.split(b"\0"):
        if not item:
            continue
        raw_meta, raw_path = item.split(b"\t", 1)
        mode, kind, oid = raw_meta.decode().split(" ")
        path = raw_path.decode("utf-8")
        if path.startswith("/") or "\\" in path or any(part in ("", ".", "..") for part in path.split("/")):
            raise ValueError("The original Git tree has an unsupported path.")
        tree[path] = {"mode": mode, "kind": kind, "oid": oid}
    for path, oid in PINNED.items():
        if tree.get(path, {}).get("oid") != oid:
            raise ValueError("The reviewed original workspace source differs: " + path)
    contents = {}
    records = {}
    total = 0
    def acquire(paths):
        nonlocal total
        paths = list(dict.fromkeys(paths))
        wanted = []
        for path in paths:
            if path in contents:
                continue
            item = tree.get(path)
            if not item or item["kind"] != "blob" or item["mode"] not in ("100644", "100755"):
                raise ValueError("The original bootstrap requires a regular source file: " + path)
            wanted.append(path)
        if not wanted:
            return
        # Reuse only exact same-byte/same-mode files from this operation's earlier
        # selected sources. No dependency directory or donor is modified.
        remaining = []
        for path in wanted:
            shared = None
            for base in intent.get("reuseSources", []):
                selected = pathlib.Path(base) / path
                if selected.is_symlink() or not selected.is_file():
                    continue
                info = selected.stat()
                if info.st_size > MAX_FILE or bool(info.st_mode & 0o111) != (tree[path]["mode"] == "100755"):
                    continue
                raw = selected.read_bytes()
                if hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() == tree[path]["oid"]:
                    shared = (selected, raw)
                    break
            if shared is None:
                remaining.append(path)
                continue
            selected, raw = shared
            target = root / "bootstrap" / path
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            for parent in (target.parent, *target.parent.parents):
                if parent.is_symlink():
                    raise ValueError("Original selected source parent is a symbolic link.")
            if target.exists() or target.is_symlink():
                if target.is_symlink() or not target.is_file() or target.read_bytes() != raw:
                    raise ValueError("Retained original selected source differs: " + path)
            else:
                os.link(selected, target)
                sync_directory(target.parent)
            contents[path] = raw
            total += len(raw)
            if total > MAX_SOURCE:
                raise ValueError("The bootstrap exceeds its complete source limit.")
            records[path] = {"path": path, "gitBlob": tree[path]["oid"],
                "sha256": bytes_sha(raw), "bytes": len(raw), "sharedOriginal": True}
        wanted = remaining
        if not wanted:
            return
        ids = list(dict.fromkeys(tree[path]["oid"] for path in wanted))
        lines = git(repository, ["cat-file", "--batch-check"], env, log,
                    ("\n".join(ids) + "\n").encode()).decode().splitlines()
        if len(lines) != len(ids):
            raise ValueError("The original Git metadata batch is incomplete.")
        missing = [oid for oid, line in zip(ids, lines) if line == oid + " missing"]
        if missing:
            if intent["offlineSource"]:
                raise ValueError("Exact bootstrap objects are absent from the selected offline donor.")
            git(repository, ["-c", "credential.helper=", "-c", "fetch.negotiationAlgorithm=noop",
                "fetch", "--no-tags", "--no-write-fetch-head", "--no-auto-maintenance",
                "--recurse-submodules=no", "--filter=blob:none", "--stdin", "--", "origin"],
                env, log, ("\n".join(missing) + "\n").encode())
            lines = git(repository, ["cat-file", "--batch-check"], env, log,
                        ("\n".join(ids) + "\n").encode()).decode().splitlines()
        sizes = {}
        for oid, line in zip(ids, lines):
            fields = line.split(" ")
            if len(fields) != 3 or fields[:2] != [oid, "blob"]:
                raise ValueError("An exact original bootstrap blob is unavailable.")
            size = int(fields[2])
            if size < 0 or size > MAX_FILE:
                raise ValueError("An original bootstrap file exceeds its size limit.")
            sizes[oid] = size
        if sum(sizes.values()) + total > MAX_SOURCE:
            raise ValueError("The bootstrap exceeds the original 128 MiB source limit.")
        raw = git(repository, ["cat-file", "--batch"], env, log, ("\n".join(ids) + "\n").encode())
        blobs = {}
        offset = 0
        for oid in ids:
            end = raw.index(b"\n", offset)
            fields = raw[offset:end].decode().split(" ")
            if len(fields) != 3 or fields[:2] != [oid, "blob"] or int(fields[2]) != sizes[oid]:
                raise ValueError("The original blob response changed.")
            size = sizes[oid]
            content = raw[end + 1:end + 1 + size]
            if raw[end + 1 + size:end + 2 + size] != b"\n":
                raise ValueError("The original blob framing is incomplete.")
            offset = end + size + 2
            if hashlib.sha1(b"blob " + str(size).encode() + b"\0" + content).hexdigest() != oid:
                raise ValueError("The original Git blob hash differs.")
            blobs[oid] = content
        if offset != len(raw):
            raise ValueError("The original blob batch has unexpected trailing bytes.")
        for path in wanted:
            content = blobs[tree[path]["oid"]]
            total += len(content)
            if total > MAX_SOURCE:
                raise ValueError("The bootstrap exceeds its complete source limit.")
            exact_file(root / "bootstrap" / path, content, tree[path]["mode"] == "100755")
            contents[path] = content
            records[path] = {"path": path, "gitBlob": tree[path]["oid"],
                             "sha256": bytes_sha(content), "bytes": len(content)}
    # Preserve all original distribution resources, including computed browser,
    # worker, Python, recipes and configuration reads. Only reachable module
    # imports are followed outside this existing directory.
    distribution = [path for path, item in tree.items()
                    if any(path.startswith(prefix) for prefix in PREFIXES) and item["kind"] == "blob"
                    and item["mode"] in ("100644", "100755")
                    and not any(part in ("node_modules", "__pycache__", ".git") for part in path.split("/"))]
    for start in range(0, len(distribution), 128):
        acquire(distribution[start:start + 128])
    acquire(list(PINNED))
    queue = list(ENTRIES)
    parsed = set()
    bare = set()
    while queue:
        batch = list(dict.fromkeys(queue))
        queue = []
        batch = [path for path in batch if path not in parsed]
        if not batch:
            break
        acquire(batch)
        for start in range(0, len(batch), 64):
            selected = batch[start:start + 64]
            payload = json.dumps([{"path": path, "content": contents[path].decode("utf-8")}
                                  for path in selected]).encode()
            result = subprocess.run([intent["node"], "--no-warnings", "--experimental-vm-modules",
                                     "--input-type=module", "-e", MODULE_IMPORTS],
                                    cwd=root, env=env, input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if result.returncode:
                save(root / "bootstrap-module-parse-error.json", {"sourceCommit": HEAD, "paths": selected, "stderr": result.stderr.decode("utf-8", errors="replace")})
                raise ValueError("Original bootstrap module syntax/dependency parsing failed; read its retained error.")
            rows = json.loads(result.stdout)
            if [row["path"] for row in rows] != selected:
                raise ValueError("Original module source parsing lost its identity.")
            for row in rows:
                path = row["path"]
                parsed.add(path)
                for specifier in row["imports"]:
                    if specifier.startswith("node:"):
                        continue
                    if not specifier.startswith("."):
                        bare.add(specifier)
                        continue
                    name = posixpath.normpath(posixpath.join(posixpath.dirname(path), specifier))
                    if name.startswith("../") or name.startswith("/"):
                        raise ValueError("A module import leaves the original source root.")
                    if name not in tree:
                        if name + ".mjs" in tree:
                            name += ".mjs"
                        elif name + ".js" in tree:
                            name += ".js"
                        elif name + "/index.mjs" in tree:
                            name += "/index.mjs"
                        else:
                            raise ValueError("An original relative import is missing: " + path + " -> " + specifier)
                    acquire([name])
                    if name.endswith((".mjs", ".js")):
                        queue.append(name)
                for specifier in row["resources"]:
                    if not specifier.startswith("."):
                        continue
                    name = posixpath.normpath(posixpath.join(posixpath.dirname(path), specifier))
                    if name in tree and tree[name]["kind"] == "blob":
                        acquire([name])
    # A bootstrap dependency seed, if actually required, is a separate explicit
    # observed input. It is never installed or copied here.
    if bare:
        seed = intent.get("bootstrapDependencies")
        if not seed:
            save(root / "bootstrap-required-imports.json", {"imports": sorted(bare)})
            raise ValueError("The original operator bootstrap names external imports; supply its verified existing dependency root.")
        link = root / "bootstrap" / "node_modules"
        target = pathlib.Path(seed).resolve(strict=True)
        if link.is_symlink():
            if link.resolve() != target:
                raise ValueError("The original bootstrap dependency reference differs.")
        elif link.exists():
            raise ValueError("Keep the original bootstrap dependency reference unchanged.")
        else:
            os.symlink(target, link)
            sync_directory(link.parent)
    observed_head = git(intent["repository"], ["rev-parse", "--verify", "HEAD"], donor_env, log, optional=True)
    donor_after = observed_head.decode().strip() if observed_head else None
    value = {"schema": "starforge.source-workspace-bootstrap.v1", "status": "MATERIALIZED",
             "at": now(), "sourceCommit": HEAD, "sourceRepository": str(repository),
             "donorRepository": intent["repository"], "donorHeadBefore": donor_before,
             "donorHeadAfter": donor_after, "donorWritesPerformed": False,
             "objectDirectory": env["GIT_OBJECT_DIRECTORY"], "bootstrap": [records[path] for path in sorted(records)],
             "moduleCount": len(parsed), "sourceBytes": total, "externalImports": sorted(bare),
             "scope": "Exact source materialization only; the original workspace performs the sole product build."}
    save(root / "source-result.json", value)
    print(json.dumps({"phase": "source", "status": "MATERIALIZED", "sourceCommit": HEAD,
                      "bootstrapFiles": len(records), "sourceBytes": total, "modules": len(parsed)}), flush=True)
    return value

def main():
    if len(sys.argv)!=2:
        raise ValueError("Supply the original private campaign source context.")
    os.umask(0o077)
    context=read(pathlib.Path(sys.argv[1]).resolve(strict=True))
    if context.get("operation")!=OPERATION or context.get("sourcePin")!=HEAD:
        raise ValueError("The rollout source context belongs to another operation or product.")
    root=private_directory(pathlib.Path(context["directory"]),True)
    for name in ("repository","node","bootstrapDependencies"):
        if not pathlib.Path(context[name]).exists():
            raise ValueError("The original selected input is absent: "+name)
    for selected in context.get("reuseSources",[]):
        private_directory(pathlib.Path(selected))
    selected={"operation":OPERATION,"sourcePin":HEAD,"directory":str(root),
        "repository":context["repository"],"node":context["node"],
        "bootstrapDependencies":context["bootstrapDependencies"],
        "reuseSources":context.get("reuseSources",[]),"offlineSource":False}
    intent_file=root/"rollout-source-intent.json"
    if intent_file.exists():
        if read(intent_file)!=selected:
            raise ValueError("Preserve the original rollout source selection.")
    else:
        save(intent_file,selected)
    environment=dict(os.environ,PYTHONDONTWRITEBYTECODE="1",GIT_TERMINAL_PROMPT="0")
    result=bootstrap(root,selected,environment)
    print(json.dumps({"phase":"rollout-source-complete","operation":OPERATION,
        "sourcePin":HEAD,"source":str(root/"bootstrap"),"files":len(result["bootstrap"]),
        "bytes":result["sourceBytes"],"sameByteSourcesReused":sum(bool(r.get("sharedOriginal")) for r in result["bootstrap"])}),flush=True)
    return 0

if __name__=="__main__":
    raise SystemExit(main())
