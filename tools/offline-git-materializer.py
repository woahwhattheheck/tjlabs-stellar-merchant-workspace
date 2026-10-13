#!/usr/bin/env python3
"""Materialize an exact selected Git checkout using verified local objects only."""
import argparse
import base64
import hashlib
import gzip
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import tempfile

SCHEMA = "commons.git-object-bundle.v1"
RECEIPT = "commons.offline-git-materialization.v1"
OID = re.compile(r"[0-9a-f]{40}")
MODES = {"40000": "tree", "100644": "blob", "100755": "blob",
         "120000": "blob", "160000": "commit"}

def need(value, message):
    if not value:
        raise ValueError(message)

def digest(kind, raw):
    return hashlib.sha1((kind + " " + str(len(raw)) + "\0").encode("ascii") + raw).hexdigest()

def sha256(raw):
    return hashlib.sha256(raw).hexdigest()

def oid(value):
    need(isinstance(value, str) and OID.fullmatch(value), "Use an exact SHA-1 Git object identity.")
    return value

def source_path(value):
    need(isinstance(value, str) and value and not value.startswith("/") and
         "\\" not in value and not any(ord(c) < 32 or ord(c) == 127 for c in value),
         "Use an ordinary repository-relative source path.")
    parts = value.split("/")
    need(all(p not in ("", ".", "..", ".git") for p in parts),
         "A selected source path is not a safe repository member: " + value)
    value.encode("utf-8", "strict")
    return value

def atomic(path, raw, mode=0o600):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix="." + path.name + ".writing-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            os.fchmod(handle.fileno(), mode)
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def decode_packet(raw):
    """Decode the existing explicit gzip carriers without fetching any source."""
    if raw.startswith(b"\x1f\x8b"):
        raw = gzip.decompress(raw)
    for _ in range(3):
        value = json.loads(raw)
        if isinstance(value, dict) and value.get("encoding") == "gzip+base64":
            decoded = gzip.decompress(base64.b64decode(value["data"], validate=True))
        elif isinstance(value, dict) and value.get("format") == "gzip" and "base64" in value:
            decoded = gzip.decompress(base64.b64decode(value["base64"], validate=True))
        else:
            return raw, value
        if "bytes" in value:
            need(value["bytes"] == len(decoded), "A source carrier's declared decoded size differs.")
        if "sha256" in value:
            need(value["sha256"] == sha256(decoded), "A source carrier's declared decoded hash differs.")
        raw = decoded
    raise ValueError("Use the original complete source carrier without recursive wrappers.")

def projected_files(files, bundle):
    """The historical bank omitted modes; read those only from its exact tree manifest."""
    modes = {row["path"]: row["mode"] for row in bundle["selectedFiles"]}
    return [{**row, "mode": row.get("mode", modes.get(row["path"]))} for row in files]

def git_environment():
    # No borrowed index, alternate object store, config, lazy fetch, filter or hook.
    env = {key: value for key, value in os.environ.items()
           if not key.startswith("GIT_")}
    env.update(GIT_TERMINAL_PROMPT="0", GIT_NO_LAZY_FETCH="1",
               GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull,
               GIT_ATTR_NOSYSTEM="1", GIT_LFS_SKIP_SMUDGE="1",
               GIT_OPTIONAL_LOCKS="0")
    return env

def git(repository, *args, data=None, timeout=180):
    command = ["git", "-c", "protocol.allow=never", "-c", "core.autocrlf=false",
               "-c", "core.safecrlf=false", "-c", "core.hooksPath=/dev/null",
               "-c", "submodule.recurse=false", "-C", str(repository), *map(str, args)]
    result = subprocess.run(command, input=data, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, env=git_environment(), timeout=timeout)
    if result.returncode:
        raise RuntimeError("Offline Git command failed (" + str(result.returncode) +
                           "): " + " ".join(map(str, args[:3])) + "\n" +
                           result.stderr.decode("utf-8", "replace")[-4000:])
    return result.stdout

def commit_headers(raw):
    head, separator, _ = raw.partition(b"\n\n")
    need(separator and b"\0" not in raw, "Retain the complete original Git commit payload.")
    lines = head.split(b"\n")
    need(lines and lines[0].startswith(b"tree "), "The original commit has no root tree.")
    tree = oid(lines[0][5:].decode("ascii"))
    parents = []
    for line in lines[1:]:
        if line.startswith(b"parent "):
            parents.append(oid(line[7:].decode("ascii")))
    need(any(line.startswith(b"author ") for line in lines) and
         any(line.startswith(b"committer ") for line in lines),
         "The original commit author and committer headers are missing.")
    return tree, parents

def tree_rows(raw):
    result = []
    position = 0
    names = set()
    while position < len(raw):
        space = raw.find(b" ", position)
        zero = raw.find(b"\0", space + 1)
        need(space > position and zero > space + 1 and zero + 21 <= len(raw),
             "An original Git tree object is truncated.")
        mode = raw[position:space].decode("ascii")
        name_bytes = raw[space + 1:zero]
        name = name_bytes.decode("utf-8", "strict")
        need(mode in MODES and "/" not in name and source_path(name) == name,
             "An original Git tree entry is invalid.")
        need(name not in names, "An original Git tree repeats a member.")
        names.add(name)
        ident = raw[zero + 1:zero + 21].hex()
        result.append({"name": name, "mode": mode, "kind": MODES[mode], "oid": ident})
        position = zero + 21
    return result

def verified_bundle(bundle, expected_repository, expected_commit, expected_tree):
    need(isinstance(bundle, dict) and bundle.get("schema") == SCHEMA,
         "Select the complete original Git object bundle.")
    need(bundle.get("repository") == expected_repository and
         bundle.get("commit") == expected_commit and bundle.get("tree") == expected_tree,
         "The object bundle belongs to a different original source selection.")
    oid(expected_commit)
    oid(expected_tree)
    need(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", expected_repository),
         "Use the original repository owner and name.")
    rows = bundle.get("objects")
    need(isinstance(rows, list) and rows, "The original Git object bundle is empty.")
    objects = {}
    for row in rows:
        need(isinstance(row, dict) and row.get("type") in ("commit", "tree", "blob") and
             row.get("encoding") == "base64", "An original Git object descriptor is incomplete.")
        ident = oid(row.get("oid"))
        need(ident not in objects, "The original object bundle repeats an object.")
        raw = base64.b64decode(row["data"], validate=True)
        need(type(row.get("bytes")) is int and len(raw) == row["bytes"] and
             digest(row["type"], raw) == ident, "The canonical original Git object bytes differ: " + ident)
        if row.get("sha256") is not None:
            need(row["sha256"] == sha256(raw), "The original object SHA256 differs: " + ident)
        objects[ident] = (row["type"], raw)
    need(expected_commit in objects and objects[expected_commit][0] == "commit",
         "The exact original commit object is absent.")
    tree, parents = commit_headers(objects[expected_commit][1])
    need(tree == expected_tree, "The original commit points to a different root tree.")
    if "parents" in bundle:
        need(bundle["parents"] == parents, "The original parent headers differ from the bundle.")
    entries = {}
    used_trees = set()

    def descend(ident, prefix="", ancestry=()):
        need(len(ancestry) < 256 and ident not in ancestry, "The original tree ancestry is invalid.")
        need(ident in objects and objects[ident][0] == "tree",
             "The complete original tree closure is missing object " + ident)
        used_trees.add(ident)
        for row in tree_rows(objects[ident][1]):
            path = source_path(prefix + row["name"])
            if row["kind"] == "tree":
                descend(row["oid"], path + "/", ancestry + (ident,))
            else:
                need(path not in entries, "The original tree repeats a full source path.")
                entries[path] = {"mode": row["mode"], "kind": row["kind"], "gitBlob": row["oid"]}
    descend(tree)
    selected = bundle.get("selectedFiles")
    need(isinstance(selected, list) and selected, "Retain every selected original source identity.")
    selection = {}
    for row in selected:
        path = source_path(row["path"])
        need(path not in selection, "The selected source manifest repeats a path.")
        entry = entries.get(path)
        need(entry and entry["kind"] == "blob" and row.get("mode") in ("100644", "100755") and
             row["mode"] == entry["mode"] and row.get("gitBlob") == entry["gitBlob"],
             "A selected source descriptor differs from the original complete tree: " + path)
        selection[path] = dict(entry)
    return {"objects": objects, "entries": entries, "selection": selection,
            "treeObjects": sorted(used_trees), "parents": parents}

def source_bodies(files, verified):
    need(isinstance(files, list) and files, "Retain the full selected source bodies.")
    bodies = {}
    for row in files:
        path = source_path(row["path"])
        need(path not in bodies, "The full source bank repeats a path.")
        if row.get("encoding") == "base64":
            raw = base64.b64decode(row["content"], validate=True)
        else:
            need(isinstance(row.get("content"), str), "A selected full UTF-8 source body is missing.")
            raw = row["content"].encode("utf-8", "strict")
        selected = verified["selection"].get(path)
        ident = row.get("gitBlob", row.get("gitSha", row.get("sha")))
        need(selected and ident == selected["gitBlob"] and row.get("mode") == selected["mode"] and
             type(row.get("bytes")) is int and len(raw) == row["bytes"] and
             row.get("sha256") == sha256(raw) and digest("blob", raw) == ident,
             "The selected source body differs from its original Git identity: " + path)
        if ident in verified["objects"]:
            need(verified["objects"][ident] == ("blob", raw),
                 "The selected object bundle and full source bank disagree: " + path)
        bodies[path] = raw
    need(set(bodies) == set(verified["selection"]),
         "The source bank does not exactly cover the selected Git source manifest.")
    return bodies

def sparse_pattern(path):
    # Non-cone sparse checkout patterns use gitignore escaping.
    return "/" + "".join("\\" + char if char in "\\*?[] !#" else char for char in path)

def native_tree(repository, commit):
    entries = {}
    for row in git(repository, "ls-tree", "-r", "-z", "--full-tree", commit).split(b"\0"):
        if not row:
            continue
        left, raw_path = row.split(b"\t", 1)
        mode, kind, ident = left.decode("ascii").split(" ")
        path = source_path(raw_path.decode("utf-8", "strict"))
        need(path not in entries, "Git returned a duplicate original tree path.")
        entries[path] = {"mode": mode, "kind": kind, "gitBlob": ident}
    return entries

def regular_file(path, root):
    relative = path.relative_to(root)
    parent = root
    for part in relative.parts[:-1]:
        parent = parent / part
        need(not parent.is_symlink() and parent.is_dir(),
             "A selected source parent is not an ordinary original directory.")
    need(not path.is_symlink() and path.is_file(),
         "A selected source member is not an ordinary file: " + str(relative))
    return path.read_bytes()

def verify_objects(repository, objects):
    ordered = sorted(objects)
    reply = git(repository, "cat-file", "--batch",
                data=("\n".join(ordered) + "\n").encode("ascii"), timeout=300)
    position = 0
    for ident in ordered:
        end = reply.find(b"\n", position)
        need(end >= position, "Native Git object verification is incomplete.")
        header = reply[position:end].decode("ascii").split(" ")
        kind, raw = objects[ident]
        need(header == [ident, kind, str(len(raw))],
             "Native Git returned a different or absent original object: " + ident)
        start = end + 1
        stop = start + len(raw)
        need(reply[start:stop] == raw and reply[stop:stop + 1] == b"\n",
             "The retained original Git object bytes differ: " + ident)
        position = stop + 1
    need(position == len(reply), "Native Git returned unexpected object verification bytes.")

def verify_checkout(repository, verified, bodies, commit, tree, require_full_index):
    top = pathlib.Path(git(repository, "rev-parse", "--show-toplevel").decode().strip()).resolve()
    need(top == repository, "Select the exact original Git checkout root.")
    need(git(repository, "rev-parse", "HEAD").decode().strip() == commit,
         "The selected checkout has a different original HEAD.")
    need(git(repository, "rev-parse", "HEAD^{tree}").decode().strip() == tree,
         "The selected checkout has a different original tree.")
    need(native_tree(repository, commit) == verified["entries"],
         "Git's complete original tree differs from the canonical object bundle.")
    all_objects = dict(verified["objects"])
    for path, raw in bodies.items():
        all_objects[verified["selection"][path]["gitBlob"]] = ("blob", raw)
    verify_objects(repository, all_objects)
    for path, raw in bodies.items():
        target = repository / path
        need(regular_file(target, repository) == raw, "The selected working source differs: " + path)
        mode = verified["selection"][path]["mode"]
        need(bool(target.stat().st_mode & stat.S_IXUSR) == (mode == "100755"),
             "The original source executable mode differs: " + path)
    # git diff checks the actual index and working files, not just supplied bytes.
    git(repository, "diff", "--no-ext-diff", "--quiet", "HEAD", "--")
    git(repository, "diff", "--cached", "--no-ext-diff", "--quiet", "HEAD", "--")
    indexed = {}
    for row in git(repository, "ls-files", "--stage", "-z").split(b"\0"):
        if not row:
            continue
        left, raw_path = row.split(b"\t", 1)
        mode, ident, stage = left.decode("ascii").split(" ")
        path = source_path(raw_path.decode("utf-8", "strict"))
        need(stage == "0" and path not in indexed, "The selected index has an unresolved merge.")
        indexed[path] = {"mode": mode, "gitBlob": ident}
    expected_index = {p: {"mode": row["mode"], "gitBlob": row["gitBlob"]}
                      for p, row in verified["entries"].items()}
    if require_full_index:
        need(indexed == expected_index, "The actual sparse checkout index lost original tree members.")
    else:
        for path, row in verified["selection"].items():
            need(indexed.get(path) == {"mode": row["mode"], "gitBlob": row["gitBlob"]},
                 "The original index does not retain the exact selected source: " + path)
    return indexed

def materialize(repository, bundle, files, expected_repository, expected_commit, expected_tree,
                required_paths=None, allow_existing=False):
    """No connector or network calls. Existing clean sources are read, never reset."""
    repository = pathlib.Path(repository).absolute()
    need(not repository.is_symlink(), "Select an ordinary owned source directory.")
    repository = repository.resolve()
    checked = verified_bundle(bundle, expected_repository, expected_commit, expected_tree)
    bodies = source_bodies(files, checked)
    required = [source_path(path) for path in (required_paths or list(bodies))]
    need(len(required) == len(set(required)) and set(required) <= set(bodies),
         "A required runtime/scenario source is missing or repeated.")
    existed = repository.exists() and any(repository.iterdir())
    if existed:
        need(allow_existing,
             "Use a new owned source directory, or an explicitly selected exact clean checkout.")
        # A linked worktree legitimately keeps .git as a control file. Native
        # rev-parse, HEAD/tree/index and complete source checks establish identity.
        # No setting, reference, index or missing object is changed in an existing checkout.
        indexed = verify_checkout(repository, checked, bodies, expected_commit, expected_tree, False)
        mode = "EXISTING_VERIFIED"
    else:
        repository.mkdir(parents=True, exist_ok=True, mode=0o700)
        git(repository, "init", "--quiet", "--template=")
        git(repository, "config", "core.autocrlf", "false")
        git(repository, "config", "core.fileMode", "true")
        git(repository, "config", "core.sparseCheckout", "true")
        git(repository, "config", "core.sparseCheckoutCone", "false")
        git(repository, "config", "index.sparse", "false")
        git(repository, "remote", "add", "origin", "https://github.com/" + expected_repository + ".git")
        for ident, (kind, raw) in checked["objects"].items():
            inserted = git(repository, "hash-object", "-w", "-t", kind, "--stdin", data=raw).decode().strip()
            need(inserted == ident, "Native Git rejected an original object identity: " + ident)
        inserted_blobs = set()
        for path, raw in bodies.items():
            ident = checked["selection"][path]["gitBlob"]
            if ident in inserted_blobs or ident in checked["objects"]:
                continue
            inserted = git(repository, "hash-object", "-w", "--stdin", data=raw).decode().strip()
            need(inserted == ident, "Native Git rejected selected source bytes: " + path)
            inserted_blobs.add(ident)
        # Original parent headers remain untouched. The selected source commit is
        # an explicit ordinary shallow boundary; no parent history is fabricated.
        atomic(repository / ".git" / "shallow", (expected_commit + "\n").encode("ascii"))
        atomic(repository / ".git" / "info" / "sparse-checkout",
               ("\n".join(sparse_pattern(path) for path in sorted(bodies)) + "\n").encode("utf-8"))
        need(native_tree(repository, expected_commit) == checked["entries"],
             "Native Git's complete tree differs before checkout.")
        git(repository, "checkout", "--quiet", "--detach", expected_commit, timeout=600)
        indexed = verify_checkout(repository, checked, bodies, expected_commit, expected_tree, True)
        mode = "OFFLINE_MATERIALIZED"
    return {"schema": RECEIPT, "state": mode, "repository": expected_repository,
            "directory": str(repository), "commit": expected_commit, "tree": expected_tree,
            "originalParents": checked["parents"], "treeObjects": len(checked["treeObjects"]),
            "providedGitObjects": len(checked["objects"]), "selectedFiles": len(bodies),
            "selectedBytes": sum(map(len, bodies.values())), "indexEntries": len(indexed),
            "networkUsed": False, "files": [
                {"path": path, "mode": checked["selection"][path]["mode"],
                 "gitBlob": checked["selection"][path]["gitBlob"],
                 "bytes": len(bodies[path]), "sha256": sha256(bodies[path])}
                for path in sorted(bodies)]}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--objects", required=True)
    parser.add_argument("--source-bank", required=True)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--tree", required=True)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--allow-existing", action="store_true")
    args = parser.parse_args()
    object_raw, bundle = decode_packet(pathlib.Path(args.objects).read_bytes())
    source_raw, bank = decode_packet(pathlib.Path(args.source_bank).read_bytes())
    carrier = bundle.get("sourceCarrier", {})
    if carrier.get("decodedBytes") is not None:
        need(len(source_raw) == carrier["decodedBytes"] and
             sha256(source_raw) == carrier.get("decodedSha256"),
             "The complete original source packet differs from its pinned carrier.")
    if isinstance(bank, dict):
        binding = bank.get("source", {})
        need((bank.get("commit") or bank.get("sourceCommit") or binding.get("commit")) == args.commit,
             "The source bank names a different original commit.")
        need((bank.get("repository") or binding.get("repository")) == args.repository,
             "The source bank names a different original repository.")
    files = projected_files(bank["files"] if isinstance(bank, dict) else bank, bundle)
    receipt = materialize(args.directory, bundle, files, args.repository, args.commit,
                          args.tree, allow_existing=args.allow_existing)
    receipt["objectBundle"] = {"bytes": len(object_raw), "sha256": sha256(object_raw)}
    receipt["sourceBank"] = {"bytes": len(source_raw), "sha256": sha256(source_raw)}
    atomic(pathlib.Path(args.receipt), (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode())
    print(json.dumps({"schema": RECEIPT, "state": receipt["state"], "commit": receipt["commit"],
                      "tree": receipt["tree"], "selectedFiles": receipt["selectedFiles"],
                      "networkUsed": False, "receipt": args.receipt}, separators=(",", ":")))

if __name__ == "__main__":
    main()
