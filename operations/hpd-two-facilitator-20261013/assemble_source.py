#!/usr/bin/env python3
"""Assemble the complete retained HPD publisher and paired-facilitator operating source."""
import argparse, fcntl, hashlib, json, os, pathlib, stat, tempfile

ORIGINAL_BYTES = 2880193
ORIGINAL_SHA = "fd0747faf9df47ba23023985ceeb6276aebcec30c940871fc31bdc4f94dfda62"
PRODUCT_BYTES = 83104
PRODUCT_SHA = "d9ab5ae0461c5c436f9b5d9e5786ac18aac07945d92183707cc2f31ce9e107ce"
ENGINE_PATH = "products/facilitator-commissioning/commissioning.mjs"

def require(ok, message):
    if not ok:
        raise ValueError(message)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def encode(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()

def private(path, create=False):
    if create:
        if not path.parent.exists():
            private(path.parent, True)
        path.mkdir(mode=0o700, exist_ok=True)
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and not path.is_symlink()
            and path.resolve() == path and info.st_uid == os.getuid()
            and info.st_mode & 0o077 == 0,
            "Select a canonical private output directory owned by this operator.")

def ordinary(path):
    st = path.lstat()
    require(stat.S_ISREG(st.st_mode) and not path.is_symlink(),
            "Select an ordinary retained source file: " + str(path))
    return path.read_bytes()

def publish(path, raw):
    private(path.parent)
    try:
        require(ordinary(path) == raw,
                "A retained source member differs: " + str(path))
        return
    except FileNotFoundError:
        pass
    fd, temp = tempfile.mkstemp(prefix=".source-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temp, path)
        except FileExistsError:
            require(ordinary(path) == raw, "A concurrent source member differs.")
        descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        os.unlink(temp)

def packet(path, expected_sha, expected_bytes=None):
    raw = ordinary(path)
    require(sha(raw) == expected_sha and
            (expected_bytes is None or len(raw) == expected_bytes),
            "The selected complete packet identity differs: " + str(path))
    return json.loads(raw), {"bytes": len(raw), "sha256": sha(raw)}

def members(items):
    require(isinstance(items, list) and items, "The source must contain complete file bodies.")
    result = {}
    for item in items:
        name = item.get("path")
        require(isinstance(name, str) and name and "\\" not in name and
                not name.startswith("/") and
                all(x not in ("", ".", "..") for x in name.split("/")),
                "A source member has an invalid path.")
        require(name not in result and isinstance(item.get("content"), str),
                "A source member is duplicated or lacks its complete body.")
        raw = item["content"].encode()
        require(len(raw) == item.get("bytes") and sha(raw) == item.get("sha256"),
                "A complete source body differs: " + name)
        result[name] = {"path": name, "bytes": len(raw), "sha256": sha(raw), "raw": raw}
    return result

def public(row):
    return {key: row[key] for key in ("path", "bytes", "sha256")}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original", type=pathlib.Path, required=True)
    parser.add_argument("--commissioning-product", type=pathlib.Path, required=True)
    parser.add_argument("--integration", type=pathlib.Path, required=True)
    parser.add_argument("--integration-sha256", required=True)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args()
    original, original_ref = packet(args.original, ORIGINAL_SHA, ORIGINAL_BYTES)
    product, product_ref = packet(args.commissioning_product, PRODUCT_SHA, PRODUCT_BYTES)
    integration, integration_ref = packet(args.integration, args.integration_sha256)
    require(original.get("schema") == "commons.hpd-provider-complete-native-source.v1"
            and len(original.get("files", [])) == 192,
            "Use the original complete 192-file HPD publisher source.")
    require(integration.get("schema") == "commons.hpd-complete-commissioning-integration.v1"
            and integration.get("original", {}).get("providerSourceBlob") ==
            "6f1212bce3977b287c6c1a725dca27f807cec424",
            "Use the original HPD integration packet.")
    baseline = members(original["files"])
    product_files = members(product["files"])
    overlay = members(integration["nativeOverlay"])
    authored = members(integration["files"])
    selected = dict(baseline)
    provenance = {name: {"layer": "original-hpd", "result": public(row)}
                  for name, row in baseline.items()}
    for row in integration["nativeOverlay"]:
        name, before = row["path"], row.get("preimage")
        retained = baseline.get(name)
        if before is None:
            require(retained is None, "An added native file already exists in the original source: " + name)
        else:
            require(retained is not None and retained["bytes"] == before.get("bytes") and
                    retained["sha256"] == before.get("sha256"),
                    "A selected native preimage differs: " + name)
        selected[name] = overlay[name]
        provenance[name] = {"layer": "native-overlay", "preimage": before,
                            "source_commit": row.get("sourceCommit"), "result": public(overlay[name])}
    for name, row in product_files.items():
        require(name not in selected or selected[name]["sha256"] == row["sha256"],
                "The merged commissioning product collides with original source: " + name)
        selected[name] = row
        provenance[name] = {"layer": "merged-commissioning-product", "result": public(row)}
    preimage = integration.get("enginePreimage", {})
    require(ENGINE_PATH in product_files and
            product_files[ENGINE_PATH]["bytes"] == preimage.get("bytes") and
            product_files[ENGINE_PATH]["sha256"] == preimage.get("sha256"),
            "The commissioning engine correction has another merged preimage.")
    for name, row in authored.items():
        require(name == ENGINE_PATH or name not in selected or
                selected[name]["sha256"] == row["sha256"],
                "An integration member collides with selected source: " + name)
        selected[name] = row
        provenance[name] = {"layer": "hpd-commissioning-integration",
                            "preimage": preimage if name == ENGINE_PATH else None,
                            "result": public(row)}
    inventory = [public(selected[name]) for name in sorted(selected)]
    intent = {"schema": "commons.hpd-source-installation.v1",
              "operation": integration["operation"],
              "edition": integration["edition"],
              "inputs": {"original": original_ref, "commissioning_product": product_ref,
                         "integration": integration_ref},
              "files": inventory,
              "provenance": [provenance[name] for name in sorted(provenance)],
              "runtime": {"native_sdk": "x402 2.28.0", "node": "24",
                          "seller_family": "original SF82 dataset release",
                          "publisher_state": "separate original retained publisher workspace"}}
    out = args.out.absolute()
    require(out.resolve() == out, "Use a canonical private installation path.")
    private(out, True)
    lock_fd = os.open(out / ".install.lock", os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        lock_info = os.fstat(lock_fd)
        require(stat.S_ISREG(lock_info.st_mode) and lock_info.st_uid == os.getuid()
                and lock_info.st_mode & 0o077 == 0, "The installation lock is not private.")
        intent_raw = encode(intent)
        publish(out / "SOURCE_INSTALLATION.json", intent_raw)
        target = out / "source"
        private(target, True)
        allowed = set(selected)
        for current, directories, filenames in os.walk(target, followlinks=False):
            for name in directories:
                child = pathlib.Path(current) / name
                require(not child.is_symlink(), "Source directories must be original directories.")
            for name in filenames:
                child = pathlib.Path(current) / name
                relative = child.relative_to(target).as_posix()
                require(relative in allowed and ordinary(child) == selected[relative]["raw"],
                        "Existing output is not the same original installation: " + relative)
        for name in sorted(selected):
            path = target.joinpath(*name.split("/"))
            private(path.parent, True)
            publish(path, selected[name]["raw"])
        for name, row in selected.items():
            require(ordinary(target.joinpath(*name.split("/"))) == row["raw"],
                    "The installed complete source changed: " + name)
        receipt = {"schema": "commons.hpd-source-installation-result.v1",
                   "state": "COMPLETE", "operation": integration["operation"],
                   "source": str(target), "files": len(selected),
                   "source_bytes": sum(row["bytes"] for row in selected.values()),
                   "manifest": str(out / "SOURCE_INSTALLATION.json"),
                   "manifest_sha256": sha(intent_raw),
                   "original_archive_sha256": integration["original"]["customerArchiveSha256"]}
        publish(out / "SOURCE_INSTALLATION_RESULT.json", encode(receipt))
        print(json.dumps(receipt, separators=(",", ":")))
    finally:
        os.close(lock_fd)

if __name__ == "__main__":
    main()
