#!/usr/bin/env python3
"""Build the selected original STAM/Leaflet browser closure for DataCove.

Run through the maintained native capacity runner. This programme does not
modify shared dependencies or start a SensorThings/FROST business job.
"""
from __future__ import annotations
import argparse
import base64
import datetime
import hashlib
import io
import json
import mimetypes
import os
from pathlib import Path, PurePosixPath
import re
import resource
import shlex
import subprocess
import sys
import tarfile
import urllib.request
import zipfile

SCHEMA = "datacove.stam-browser-build.v1"
EXPECTED_SOURCE = "0e414f3441a8773619f242c797fe75e9af3fc04d"

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def atomic(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".part")
    with temp.open("wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)

def save(path, value):
    atomic(path, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode())

def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def relative(value):
    p = PurePosixPath(value)
    if not value or p.is_absolute() or ".." in p.parts or "\\" in value:
        raise ValueError("Unsafe archive/member path: " + value)
    return p

def measure(path):
    data = Path(path).read_bytes()
    return {"bytes": len(data), "sha256": digest(data), "gitBlob": blob(data)}

def acquire(url, target, max_bytes):
    target = Path(target)
    receipt_path = target.with_name(target.name + ".receipt.json")
    if target.is_file() and receipt_path.is_file():
        receipt = read(receipt_path)
        actual = measure(target)
        if receipt["url"] != url or any(receipt[k] != actual[k] for k in ("bytes", "sha256")):
            raise ValueError("Retained source transfer changed: " + str(target))
        return receipt
    request = urllib.request.Request(url, headers={"User-Agent": "TJLabs-original-STAM-build/1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read(max_bytes + 1)
        if len(body) > max_bytes:
            raise ValueError("Source transfer exceeds selected bound")
        receipt = {"url": url, "finalUrl": response.url, "observedAt": now(),
                   "httpStatus": response.status, "bytes": len(body),
                   "sha256": digest(body), "etag": response.headers.get("ETag"),
                   "contentType": response.headers.get("Content-Type")}
    atomic(target, body)
    save(receipt_path, receipt)
    return receipt

def original_source(root, pin):
    archive = root / "downloads" / ("STAM-" + pin["commit"] + ".tar.gz")
    receipt = acquire("https://codeload.github.com/" + pin["repository"] + "/tar.gz/" + pin["commit"],
                      archive, 16 * 1024 * 1024)
    expected = {x["path"]: x for x in pin["tree"]["tree"] if x["type"] == "blob"}
    if any(x["mode"] not in ("100644", "100755") for x in expected.values()):
        raise ValueError("Selected tree includes unsupported non-regular leaves")
    source, seen = root / "original" / "STAM", set()
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle:
            path = PurePosixPath(member.name)
            if len(path.parts) < 2:
                continue
            name = str(PurePosixPath(*path.parts[1:]))
            if name not in expected:
                if member.isfile():
                    raise ValueError("Archive contains an unpinned source leaf: " + name)
                continue
            if not member.isfile() or name in seen:
                raise ValueError("Source member is not one regular file: " + name)
            item = expected[name]
            data = bundle.extractfile(member).read(item["size"] + 1)
            if len(data) != item["size"] or blob(data) != item["sha"]:
                raise ValueError("Original source blob mismatch: " + name)
            out = source / relative(name)
            if out.exists() and out.read_bytes() != data:
                raise ValueError("Existing pinned source differs: " + name)
            if not out.exists():
                atomic(out, data)
                out.chmod(0o755 if item["mode"] == "100755" else 0o644)
            seen.add(name)
    if seen != set(expected):
        raise ValueError("Original archive is missing pinned leaves")
    return source, receipt, expected

def verify_source(source, expected):
    values = []
    for name, item in sorted(expected.items()):
        actual = measure(source / relative(name))
        if actual["gitBlob"] != item["sha"] or actual["bytes"] != item["size"]:
            raise ValueError("Original build modified its pinned input: " + name)
        values.append({"path": name, **actual})
    return values

def pnpm_programme(root, pin):
    archive = root / "downloads" / "pnpm-12.0.0.tgz"
    receipt = acquire(pin["pnpm"]["url"], archive, 32 * 1024 * 1024)
    data = archive.read_bytes()
    integrity = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
    if integrity != pin["pnpm"]["integrity"] or hashlib.sha1(data).hexdigest() != pin["pnpm"]["shasum"]:
        raise ValueError("The selected pnpm tarball integrity does not match")
    base = root / "build-tool" / "pnpm"
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for member in tar:
            parts = PurePosixPath(member.name).parts
            if not parts or parts[0] != "package":
                raise ValueError("Unexpected pnpm tarball prefix")
            if len(parts) == 1 or member.isdir():
                continue
            if not member.isfile():
                raise ValueError("Unsupported pnpm archive member")
            content = tar.extractfile(member).read()
            out = base / relative(str(PurePosixPath(*parts[1:])))
            if out.is_file() and out.read_bytes() == content:
                continue
            atomic(out, content)
    package = read(base / "package.json")
    if package["version"] != pin["pnpm"]["version"]:
        raise ValueError("Wrong pnpm package version")
    cli = base / relative(package["bin"]["pnpm"].removeprefix("./"))
    if not cli.is_file():
        raise ValueError("Original pnpm CLI is absent")
    return cli, receipt

def run(root, name, argv, cwd, env):
    log, done = root / "logs" / (name + ".log"), root / "logs" / (name + ".result.json")
    if done.is_file():
        previous = read(done)
        if previous["argv"] != argv or previous["cwd"] != str(cwd):
            raise ValueError("Saved build command binding differs")
        if previous["exitCode"] == 0:
            return previous
        raise RuntimeError("Original build step already failed; inspect retained " + str(done))
    log.parent.mkdir(parents=True, exist_ok=True)
    started = now()
    print(json.dumps({"stage": name, "state": "running", "startedAt": started}), flush=True)
    with log.open("wb") as stream:
        result = subprocess.run(argv, cwd=cwd, env=env, stdout=stream, stderr=subprocess.STDOUT)
        stream.flush()
        os.fsync(stream.fileno())
    receipt = {"argv": argv, "cwd": str(cwd), "startedAt": started, "endedAt": now(),
               "exitCode": result.returncode, "log": str(log.relative_to(root)),
               "logFile": measure(log), "childrenPeakRssKiB": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss}
    save(done, receipt)
    print(json.dumps({"stage": name, "state": "complete" if result.returncode == 0 else "failed",
                      "exitCode": result.returncode, "log": str(log)}), flush=True)
    if result.returncode:
        raise RuntimeError("Original " + name + " exited " + str(result.returncode))
    return receipt

def copy_exact(src, dst):
    data = Path(src).read_bytes()
    atomic(dst, data)
    if Path(dst).read_bytes() != data:
        raise ValueError("Asset copy did not retain original bytes")
    return measure(dst)

def package_roots(source):
    pnpm = source / "node_modules" / ".pnpm"
    seen, result = set(), []
    for virtual in sorted(pnpm.iterdir()):
        directory = virtual / "node_modules"
        if not directory.is_dir():
            continue
        for entry in sorted(directory.iterdir()):
            if entry.name.startswith("."):
                continue
            candidates = sorted(entry.iterdir()) if entry.name.startswith("@") and entry.is_dir() else [entry]
            for candidate in candidates:
                actual = candidate.resolve()
                if actual in seen or not (actual / "package.json").is_file():
                    continue
                if pnpm.resolve() not in actual.parents:
                    continue
                seen.add(actual)
                result.append(actual)
    return result

def licences(source, output, pin):
    out = output / "ui" / "vendor" / "licences"
    out.mkdir(parents=True, exist_ok=True)
    original = read(source / "package.json")
    copy_exact(source / "LICENSE.md", out / "STAM-LICENSE.md")
    copy_exact(source / "README.md", out / "STAM-README.md")
    records = []
    for package_root in package_roots(source):
        package = read(package_root / "package.json")
        name, version = package.get("name"), package.get("version")
        if not isinstance(name, str) or not isinstance(version, str):
            raise ValueError("An installed package has no native name/version")
        key = re.sub(r"[^A-Za-z0-9._-]", "_", name) + "-" + version
        folder, files, candidates = out / "packages" / key, [], []
        for item in package_root.iterdir():
            upper = item.name.upper()
            if item.is_file() and upper.startswith(("LICENSE", "LICENCE", "COPYING", "NOTICE", "COPYRIGHT")):
                candidates.append(item)
            elif item.is_dir() and upper in ("LICENSE", "LICENSES", "LICENCE", "LICENCES"):
                candidates.extend(x for x in item.rglob("*") if x.is_file())
        copy_exact(package_root / "package.json", folder / "package.json")
        for item in sorted(candidates):
            dest = folder / item.relative_to(package_root)
            files.append({"path": str(dest.relative_to(output / "ui")), **copy_exact(item, dest)})
        records.append({"name": name, "version": version, "declaredLicense": package.get("license"),
                        "repository": package.get("repository"), "files": files,
                        "packageMetadata": str((folder / "package.json").relative_to(output / "ui"))})
    document = {"schema": "datacove.stam-licences.v1", "source": pin["commit"],
                "stamPackageDeclaration": original.get("license"), "stamOriginalLicence": "vendor/licences/STAM-LICENSE.md",
                "sourceLicenceObservation": "The selected package.json declares MIT. The selected LICENSE.md contains the original two-clause BSD terms. Both original files are retained without replacing the author declarations.",
                "scope": "Original STAM licence plus notices and metadata of every installed frozen-lockfile package; this is an over-inclusive source/build graph, not a claim that every package is bundled into the Leaflet entry.",
                "packages": records}
    save(out / "index.json", document)
    notice = [
        "DataCove commissioning — original STAM and Leaflet browser assets", "",
        "STAM repository: https://github.com/" + pin["repository"],
        "Selected commit: " + pin["commit"],
        "Original STAM LICENSE.md and README.md are preserved beside this notice.",
        "The selected package metadata declares MIT; the original LICENSE.md contains two-clause BSD terms.",
        "This package retains both author-provided declarations and all available dependency licence/notice files.", "",
        "The exact package versions and notice paths are in index.json.",
        "Package metadata without a separate notice is explicitly retained as metadata, not substituted licence text.", "",
    ]
    notice.extend(r["name"] + "@" + r["version"] + " — " + str(r["declaredLicense"]) +
                  " — " + (", ".join(x["path"] for x in r["files"]) or "no separate root notice found") for r in records)
    atomic(out / "NOTICE.txt", ("\n".join(notice) + "\n").encode())
    return document

def csp_styles(source, expected):
    text = (source / "src" / "leaflet.ts").read_text(encoding="utf-8")
    pattern = r"addCss\(\s*" + chr(96) + r"([^" + chr(96) + r"$]*)" + chr(96) + r"\s*,?\s*\)"
    values = re.findall(pattern, text)
    if len(values) != 2:
        raise ValueError("Selected original addCss literals changed or are no longer two constants")
    result = []
    for css in values:
        data = css.encode("utf-8")
        expression = "'sha256-" + base64.b64encode(hashlib.sha256(data).digest()).decode() + "'"
        result.append({"source": "src/leaflet.ts", "sourceBlob": expected["src/leaflet.ts"]["sha"],
                       "text": css, "encoding": "UTF-8", "bytes": len(data), "sha256": digest(data), "cspSource": expression})
    return result

def asset_type(path):
    suffix = Path(path).suffix.lower()
    return {".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
            ".map": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
            ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
            ".ts": "text/plain; charset=utf-8"}.get(suffix, mimetypes.guess_type(str(path))[0] or "application/octet-stream")

def validate_browser_closure(root, node, ui):
    stam = ui / "vendor" / "stam"
    entry = stam / "stam-leaflet.js"
    if not entry.is_file():
        raise ValueError("Original selected STAM Leaflet ESM entry is absent")
    reachable, pending, references = set(), [entry], []
    dynamic_imports = re.compile(r"""\bimport\s*\(\s*["']([^"']+)["']\s*\)""")
    parser = "import vm from 'node:vm';import fs from 'node:fs';const m=new vm.SourceTextModule(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(m.dependencySpecifiers));"
    while pending:
        path = pending.pop()
        if path in reachable:
            continue
        reachable.add(path)
        code = path.read_text(encoding="utf-8")
        result = subprocess.run([node, "--experimental-vm-modules", "--input-type=module", "-e", parser],
                                input=code, text=True, capture_output=True)
        if result.returncode:
            raise ValueError("Generated ESM syntax failed: " + path.name + ": " + result.stderr[:1000])
        specifiers = json.loads(result.stdout) + [x.group(1) for x in dynamic_imports.finditer(code)]
        for specifier in sorted(set(specifiers)):
            if not specifier.startswith(("./", "../")):
                raise ValueError("Selected browser entry contains an unserved bare/remote module: " + specifier)
            target = (path.parent / specifier).resolve()
            if stam.resolve() not in target.parents or not target.is_file():
                raise ValueError("Generated module closure is incomplete: " + specifier)
            references.append({"from": str(path.relative_to(ui)), "specifier": specifier, "to": str(target.relative_to(ui))})
            if target.suffix in (".js", ".mjs"):
                pending.append(target)
    leaflet = ui / "vendor" / "leaflet"
    css, css_refs = (leaflet / "leaflet.css").read_text(encoding="utf-8"), []
    for match in re.finditer(r"url\(\s*['\"]?([^)'\"\s]+)", css):
        value = match.group(1)
        if value.startswith("data:"):
            continue
        if value.startswith(("http:", "https:", "//")):
            raise ValueError("Leaflet CSS references a remote asset")
        target = (leaflet / value).resolve()
        if leaflet.resolve() not in target.parents or not target.is_file():
            raise ValueError("Leaflet CSS-relative asset is absent: " + value)
        css_refs.append(value)
    umd = (leaflet / "leaflet.js").read_text(encoding="utf-8")
    if "1.9.4" not in umd or ".L=" not in umd:
        raise ValueError("Selected Leaflet UMD identity/global binding changed")
    return {"entry": str(entry.relative_to(ui)), "reachableModules": sorted(str(x.relative_to(ui)) for x in reachable),
            "moduleReferences": references, "leafletCssAssets": css_refs, "esmSyntax": "passed",
            "browserExecution": "pending original commissioning operator journey"}

def build(args):
    root = Path(args.root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    pin_path, pin = Path(args.input).resolve(), read(args.input)
    if pin["commit"] != EXPECTED_SOURCE or pin["pnpm"]["version"] != "12.0.0":
        raise ValueError("The original selected build identity changed")
    output, result_path = root / "output", root / "STAM_BUILD_RESULT.json"
    if result_path.is_file():
        result = read(result_path)
        if result.get("state") == "complete" and result["input"]["sha256"] == measure(pin_path)["sha256"]:
            for item in result["assetFiles"]:
                if measure(output / item["path"])["sha256"] != item["sha256"]:
                    raise ValueError("Completed original asset changed")
            return result
        raise ValueError("Existing terminal build result requires an explicit source-bound continuation")
    node = str(Path(args.node).resolve())
    actual_version = subprocess.check_output([node, "--version"], text=True).strip()
    if not actual_version.startswith("v24."):
        raise ValueError("Selected build runner requires the observed Node 24 runtime")
    source, source_transfer, expected = original_source(root, pin)
    before = verify_source(source, expected)
    cli, pnpm_transfer = pnpm_programme(root, pin)
    bin_dir = root / "bin"
    bin_dir.mkdir(exist_ok=True)
    atomic(bin_dir / "pnpm", ("#!/bin/sh\nexec " + shlex.quote(node) + " " + shlex.quote(str(cli)) + " \"$@\"\n").encode())
    (bin_dir / "pnpm").chmod(0o755)
    env = dict(os.environ)
    env.update({"PATH": str(bin_dir) + os.pathsep + str(Path(node).parent) + os.pathsep + env.get("PATH", ""),
                "PNPM_HOME": str(root / "pnpm-home"), "XDG_CACHE_HOME": str(root / "cache"),
                "XDG_STATE_HOME": str(root / "state"), "TMPDIR": str(root / "tmp"),
                "COREPACK_ENABLE_AUTO_PIN": "0", "CI": "true", "NODE_OPTIONS": "--max-old-space-size=640"})
    Path(env["TMPDIR"]).mkdir(exist_ok=True)
    pnpm_version = subprocess.check_output([node, str(cli), "--version"], env=env, text=True).strip()
    if pnpm_version != "12.0.0":
        raise ValueError("Pinned build tool version mismatch")
    install = run(root, "original-frozen-install", [node, str(cli), "install", "--frozen-lockfile", "--ignore-scripts",
                  "--store-dir", str(root / "pnpm-store"), "--network-concurrency=2",
                  "--child-concurrency=1", "--reporter=append-only"], source, env)
    compilation = run(root, "original-build", [node, str(cli), "run", "build"], source, env)
    after = verify_source(source, expected)
    if before != after:
        raise ValueError("Pinned source changed during original build")
    ui, dist = output / "ui", source / "dist"
    if not dist.is_dir():
        raise ValueError("Original build did not create dist")
    for item in sorted(dist.rglob("*")):
        if item.is_file():
            copy_exact(item, ui / "vendor" / "stam" / item.relative_to(dist))
    leaflet = (source / "node_modules" / "leaflet").resolve()
    leaflet_package = read(leaflet / "package.json")
    if leaflet_package["version"] != pin["leafletVersion"]:
        raise ValueError("Frozen Leaflet package version differs from selected asset contract")
    for item in sorted((leaflet / "dist").rglob("*")):
        if item.is_file():
            copy_exact(item, ui / "vendor" / "leaflet" / item.relative_to(leaflet / "dist"))
    license_result, css = licences(source, output, pin), csp_styles(source, expected)
    closure = validate_browser_closure(root, node, ui)
    assets, routes = [], list(pin["manifest"]["routes"])
    for item in sorted(ui.rglob("*")):
        if not item.is_file():
            continue
        local = item.relative_to(ui).as_posix()
        assets.append({"path": "ui/" + local, "url": "/commissioning/" + local, "type": asset_type(local), **measure(item)})
        routes.append(["/commissioning/" + local, [local, asset_type(local)]])
    manifest = dict(pin["manifest"])
    manifest.update({"routes": routes, "cspStyleHashes": [x["cspSource"] for x in css],
                     "stamAssets": {"leafletScript": "/commissioning/vendor/leaflet/leaflet.js",
                                    "leafletStyle": "/commissioning/vendor/leaflet/leaflet.css",
                                    "stamModule": "/commissioning/vendor/stam/stam-leaflet.js",
                                    "stamSource": pin["commit"], "leafletVersion": leaflet_package["version"],
                                    "leafletIntegrity": "sha256-" + base64.b64encode(
                                        hashlib.sha256((ui / "vendor" / "leaflet" / "leaflet.js").read_bytes()).digest()).decode(),
                                    "licence": "/commissioning/vendor/licences/NOTICE.txt"}})
    save(output / "browser-assets.json", manifest)
    save(output / "source-pin.json", pin)
    result = {"schema": SCHEMA, "state": "complete", "operationId": args.operation_id, "completedAt": now(),
              "input": {"path": "build-input.json", **measure(pin_path)},
              "source": {"repository": pin["repository"], "commit": pin["commit"],
                         "transfer": source_transfer, "verifiedFiles": after},
              "build": {"nodePath": node, "nodeVersion": actual_version, "pnpmVersion": pnpm_version,
                        "pnpmTransfer": pnpm_transfer, "originalPackageScript": read(source / "package.json")["scripts"]["build"],
                        "install": install, "compile": compilation, "originalInputsUnchanged": True,
                        "dependencyLifecycleScripts": "not invoked (--ignore-scripts); original build invoked explicitly"},
              "styles": css, "browserClosure": closure, "licencePackageCount": len(license_result["packages"]),
              "assetFiles": assets, "browserManifest": measure(output / "browser-assets.json"),
              "sourcePackageLicense": read(source / "package.json").get("license"),
              "qualification": "Actual selected-source asset build; provider commissioning and complete browser receiving remain their original operations."}
    save(result_path, result)
    return result

def seal(root, input_path, programme_path):
    root = Path(root)
    archive = root / "STAM_0e414_Leaflet_1_9_4_Complete_Browser_Assets.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        selected = []
        for folder in ("output", "logs"):
            p = root / folder
            if p.is_dir():
                selected.extend(x for x in p.rglob("*") if x.is_file())
        source, pin = root / "original" / "STAM", read(input_path)
        if source.is_dir():
            for entry in pin["tree"]["tree"]:
                p = source / entry["path"]
                if entry["type"] == "blob" and p.is_file():
                    selected.append(p)
        for name in ("STAM_BUILD_RESULT.json", "STAM_BUILD_FAILURE.json"):
            p = root / name
            if p.is_file():
                selected.append(p)
        for item in sorted(set(selected)):
            bundle.write(item, item.relative_to(root).as_posix())
        bundle.write(input_path, "build-input.json")
        bundle.write(programme_path, "build_stam_assets.py")
    return {"path": str(archive), **measure(archive)}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--node", required=True)
    parser.add_argument("--operation-id", required=True)
    parser.add_argument("--retention-module")
    parser.add_argument("--helper-directory")
    args = parser.parse_args()
    root, state = Path(args.root).resolve(), 0
    try:
        result = build(args)
        print(json.dumps({"stage": "complete-original-browser-assets", "state": result["state"],
                          "assetFiles": len(result["assetFiles"]), "source": result["source"]["commit"]}), flush=True)
    except BaseException as error:
        state = 1
        root.mkdir(parents=True, exist_ok=True)
        failure = {"schema": SCHEMA, "state": "failed", "operationId": args.operation_id,
                   "at": now(), "error": type(error).__name__ + ": " + str(error)}
        save(root / "STAM_BUILD_FAILURE.json", failure)
        print(json.dumps(failure), flush=True)
    artifact = seal(root, Path(args.input), Path(__file__))
    save(root / "BUILD_ARTIFACT.json", artifact)
    print(json.dumps({"stage": "sealed", "artifact": artifact}), flush=True)
    if args.retention_module:
        import importlib.util
        spec = importlib.util.spec_from_file_location("original_artifact_retention", args.retention_module)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.retain_artifact(root / "retention", artifact, args.operation_id + "-RETURN",
                               args.helper_directory, input_stream=sys.stdin,
                               emit=lambda value: print(value, flush=True), artifact_type="other")
    return state

if __name__ == "__main__":
    raise SystemExit(main())
