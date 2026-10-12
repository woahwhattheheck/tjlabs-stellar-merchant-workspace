#!/usr/bin/env python3
"""Restore the pinned Lab source, borrow existing dependencies, and run its original receiver."""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
PREFIX = "stellar/scf-starforge-20261009/"
OPERATION = "MCCAMPBELL-LAB-MCP-RECEIVING-9F77-20261012"
SOURCE_COMMIT = "1a1de98824ac82991a7420375c8a2eaf7362b949"

def demand(condition, message):
    if not condition:
        raise RuntimeError(message)

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")

def private_directory(path):
    demand(path.is_absolute(), "Use an absolute owned directory.")
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    demand(stat.S_ISDIR(info.st_mode) and not path.is_symlink() and
           info.st_uid == os.getuid() and not info.st_mode & 0o077 and
           path.resolve(strict=True) == path, "The operation directory must be private and canonical.")
    return path

def immutable(path, body):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    def equal_existing():
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, "rb") as stream:
            info = os.fstat(stream.fileno())
            demand(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and
                   info.st_nlink == 1 and not info.st_mode & 0o077 and
                   stream.read(len(body) + 1) == body,
                   "Different retained input: " + str(path))
    if path.exists() or path.is_symlink():
        equal_existing()
        return
    descriptor, temporary_name = tempfile.mkstemp(
        prefix="." + path.name + ".", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            descriptor = None
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError:
            equal_existing()
        finally:
            temporary.unlink(missing_ok=True)
        parent_descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent_descriptor)
        finally:
            os.close(parent_descriptor)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        temporary.unlink(missing_ok=True)

def read_package(path, expected=None):
    info = path.lstat()
    demand(stat.S_ISREG(info.st_mode) and not path.is_symlink(), "Regular package file required.")
    body = path.read_bytes()
    if expected is not None:
        demand(len(body) == expected["bytes"] and hashlib.sha256(body).hexdigest() == expected["sha256"],
               "Package bytes changed: " + str(path))
    return body

def borrowed_directory(value, name):
    demand(value.is_absolute(), name + " must be absolute.")
    result = value.resolve(strict=True)
    demand(result.is_dir(), name + " must select an existing directory.")
    return result

def link_existing(path, target):
    demand(target.exists(), "Original dependency is missing: " + str(target))
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.is_symlink() or path.exists():
        demand(path.resolve(strict=True) == target.resolve(strict=True),
               "Different installed dependency: " + str(path))
        return
    path.symlink_to(target, target_is_directory=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--seller-dependencies", type=Path, required=True,
                        help="Existing node_modules with original x402 core, Stellar and Bazaar 2.28.0.")
    parser.add_argument("--buyer-dependencies", type=Path, required=True,
                        help="Existing SF88 node_modules with original Stellar SDK 16.3.0.")
    parser.add_argument("--re2js", type=Path, required=True,
                        help="Existing re2js 2.8.6 package directory.")
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    demand(sys.platform.startswith("linux"), "The original native receiver requires Linux.")
    root = private_directory(args.directory)
    node = args.node.resolve(strict=True)
    demand(args.node.is_absolute() and node.is_file() and os.access(node, os.X_OK),
           "Use the existing absolute Node executable.")
    seller = borrowed_directory(args.seller_dependencies, "Seller dependencies")
    buyer = borrowed_directory(args.buyer_dependencies, "Buyer dependencies")
    re2js = borrowed_directory(args.re2js, "RE2JS")
    package = json.loads(read_package(HERE / "package-manifest.json"))
    demand(package["operationId"] == OPERATION and package["sourceCommit"] == SOURCE_COMMIT,
           "Original receiving source selection changed.")
    for entry in package["files"]:
        parts = Path(entry["path"]).parts
        demand(parts and not Path(entry["path"]).is_absolute() and
               all(part not in ("", ".", "..") for part in parts), "Invalid package member.")
        read_package(HERE.joinpath(*parts), entry)
    originals = json.loads(read_package(HERE / "originals.json"))
    manifest = json.loads(read_package(HERE / "manifest.json"))
    demand(manifest["source_ref"] == SOURCE_COMMIT and manifest["operation_id"] == OPERATION,
           "Original source manifest changed.")
    source = root / "source"
    preparation = {
        "schema": "stellar-forge.lab-native-source-preparation.v1",
        "operationId": OPERATION, "sourceCommit": SOURCE_COMMIT,
        "directory": str(root), "sourceDirectory": str(source),
        "sourceCarrier": package["sourceCarrier"],
        "node": str(node), "sellerDependencies": str(seller),
        "buyerDependencies": str(buyer), "re2js": str(re2js),
    }
    immutable(root / "preparation.json", encoded(preparation))
    receipt = root / "source-receipt.json"
    with receipt.open("wb") as output:
        os.chmod(receipt, 0o600)
        subprocess.run([str(node), "--max-old-space-size=192",
                        str(HERE / "host" / "receive_source_carriers.cjs"),
                        "--input", str(HERE / "source.json"), "--manifest", str(HERE / "manifest.json"),
                        "--out", str(source)], check=True, stdout=output)
        output.flush()
        os.fsync(output.fileno())
    received = json.loads(receipt.read_bytes())
    demand(received["status"] == "COMPLETE" and
           received["coverage"]["reconstructed_files"] == len(manifest["files"]),
           "The original source receiver did not complete.")
    for item in originals["files"]:
        parts = Path(item["path"]).parts
        demand(parts and not Path(item["path"]).is_absolute() and
               all(part not in ("", ".", "..") for part in parts), "Invalid original source member.")
        body = base64.b64decode(item["content"], validate=True)
        demand(len(body) == item["bytes"] and hashlib.sha256(body).hexdigest() == item["sha256"],
               "Original laboratory archive changed.")
        immutable(source.joinpath(*parts), body)
    modules = source / "node_modules"
    private_directory(modules)
    link_existing(modules / "@x402", seller / "@x402")
    link_existing(modules / "@stellar", buyer / "@stellar")
    link_existing(modules / "re2js", re2js)
    if (seller / "jose").exists():
        link_existing(modules / "jose", seller / "jose")
    link_existing(source / PREFIX / "sf88-operator-buyer-cli" / "node_modules", buyer)
    # These imports load the actual selected merchant, scientific and customer
    # families, including top-level native developer assets and the two providers.
    preflight = (
        "import {createRequire} from 'node:module';"
        "import {readFile} from 'node:fs/promises';"
        "import {dirname,join} from 'node:path';"
        "import {pathToFileURL} from 'node:url';"
        "const root=process.argv[1];"
        "if(Number(process.versions.node.split('.')[0])<24)throw Error('NODE_24_REQUIRED');"
        "const require=createRequire(join(root,'package.json'));"
        "for(const [name,want,entry] of "
        "[['@x402/core','2.28.0','@x402/core/server'],['@x402/stellar','2.28.0','@x402/stellar'],"
        "['@x402/extensions','2.28.0','@x402/extensions/bazaar'],"
        "['@stellar/stellar-sdk','16.3.0','@stellar/stellar-sdk'],['re2js','2.8.6','re2js']]){"
        "let current=dirname(require.resolve(entry)),found=false;"
        "for(let depth=0;depth<12;depth++,current=dirname(current)){"
        "try{const p=JSON.parse(await readFile(join(current,'package.json'),'utf8'));"
        "if(p.name===name){if(p.version!==want)throw Error(name+':'+p.version);found=true;break;}}"
        "catch(e){if(e.code!=='ENOENT')throw e;}}if(!found)throw Error('PACKAGE_REQUIRED:'+name);}"
        "for(const path of "
        "['stellar/scf-starforge-20261009/sf30-seller-sdk/native-factory.mjs',"
        "'stellar/scf-starforge-20261009/sf30-seller-sdk/lab-edd/application.mjs',"
        "'stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/client.mjs',"
        "'stellar-forge/mcp-merchant-operator/lab-edd-workspaces.mjs',"
        "'stellar-forge/mcp-merchant-operator/paid-jobs.mjs'])"
        "await import(pathToFileURL(join(root,path)).href);"
        "console.log(JSON.stringify({status:'NATIVE_IMPORTS_READY',node:process.versions.node}));"
    )
    subprocess.run([str(node), "--max-old-space-size=256", "--input-type=module", "-e", preflight,
                    str(source)], check=True, cwd=source)
    native = source / "stellar-forge" / "mcp-merchant-operator" / "lab-edd-native-receiving.py"
    command = [sys.executable, str(native), "--source-root", str(source),
               "--directory", str(root / "operation"), "--node", str(node)]
    print(json.dumps({"status": "SOURCE_READY", "operationId": OPERATION,
                      "sourceCommit": SOURCE_COMMIT, "directory": str(root),
                      "files": len(manifest["files"]) + len(originals["files"]),
                      "command": command}, separators=(",", ":")), flush=True)
    if not args.prepare_only:
        # The original launcher takes over this admitted process. Its original
        # PTY, ledger, worker, cancellation and resume paths own the operation.
        os.execve(sys.executable, command, dict(os.environ))
    return 0

if __name__ == "__main__":
    os.umask(0o077)
    raise SystemExit(main())
