#!/usr/bin/env python3
"""Build a relocatable, create-only customer delivery around the original review runtime.

No network, package resolution, new comparison engine or user-workspace copy occurs.
Only explicitly selected source files and portable reports are copied in full.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import tempfile
import zipfile

BASE = Path("stellar/scf-starforge-20261009/sf88-operator-buyer-cli")
SKIP_DIRS = {".git", ".venv", "venv", "__pycache__", "node_modules", "build", "dist", ".pytest_cache"}
SCHEMA = "stellar-forge.python-review-customer.v1"

VERIFY = r'''"""Verify the exact supplied customer files before opening the original runtime."""
from pathlib import Path, PurePosixPath
import hashlib, json, os, stat

def verify(root=None):
    root = Path(__file__).resolve().parent if root is None else Path(root).resolve()
    manifest = json.loads((root / "PACKAGE.json").read_text(encoding="utf-8"))
    if manifest.get("schema") != "stellar-forge.python-review-customer.v1":
        raise ValueError("Unsupported customer package")
    seen = set()
    for item in manifest["files"]:
        name = item["path"]
        path = PurePosixPath(name)
        if not name or str(path) != name or path.is_absolute() or ".." in path.parts or "\\" in name or name in seen:
            raise ValueError("Invalid or repeated package path")
        seen.add(name)
        target = root / path
        if target.resolve() != target or not stat.S_ISREG(target.lstat().st_mode):
            raise ValueError("Package member must be a regular local file: " + name)
        digest = hashlib.sha256()
        count = 0
        with target.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                count += len(chunk); digest.update(chunk)
        if count != item["bytes"] or digest.hexdigest() != item["sha256"]:
            raise ValueError("Customer package changed: " + name)
    for target in (root / "source").rglob("*"):
        if "__pycache__" in target.parts or target.suffix == ".pyc":
            continue
        if target.is_file() and target.relative_to(root).as_posix() not in seen:
            raise ValueError("Unlisted runtime file: " + target.relative_to(root).as_posix())
    return {"files": len(seen), "bytes": sum(x["bytes"] for x in manifest["files"]),
            "reviewFiles": manifest["reviewFiles"]}

if __name__ == "__main__":
    print(json.dumps(verify(), indent=2))
'''

LAUNCH = '''#!/usr/bin/env python3
"""Receive, reopen, review and export using the supplied original application."""
from pathlib import Path
import sys
from verify import verify

root = Path(__file__).resolve().parent
try:
    verify(root)
except (OSError, ValueError, KeyError) as error:
    print(str(error), file=sys.stderr)
    raise SystemExit(2)
checkout = root / "source"
sys.path.insert(0, str(checkout / "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python"))
from stellar_forge_buyer.review_cli import main
raise SystemExit(main(["--checkout", str(checkout), *sys.argv[1:]]))
'''

GUIDE = '''# Resource review — customer workspace

Receive a complete edition comparison, keep your review decisions, reconcile another
reviewer's changes, and export a complete handover for the next operator.

## Open a delivered review

Use Python 3.11 or later and Node 22.16 or later on Linux. Extract the whole archive;
keep `review.py`, `verify.py`, `PACKAGE.json`, and `source/` together. No dependency
download or package installation is needed for this review application.

From the extracted directory, choose a private workspace outside the package:

```sh
python verify.py
python review.py --state "$HOME/customer-review" receive \\
  --input "/absolute/path/to/review.json" --operation-id "received-review-1" \\
  --serve --open-browser
```

The `reviews/` directory contains only the portable files deliberately selected for
this delivery. Supply a JSON handover for editable receiving; HTML and CSV are full
readable reports. Example data is identified in `REVIEWS.md` when included.

The command stays in the foreground. Stop it with Ctrl-C. Closing the command closes
the private listener and keeps your work. Reopen without importing again:

```sh
python review.py --state "$HOME/customer-review" serve --open-browser
```

A machine without a desktop can use `--show-url` in its own terminal, or
`--ready-file /absolute/private/new-connection.json`. The latter directory must
already be private (`chmod 700`). Connection files contain a private session URL;
keep them out of reports and shared folders. Normal status output omits that URL.
A connection file created for a running session is removed on a clean shutdown.
Use a new filename after a forced process termination.

## Review and return

The browser provides the original resource, comparison and returned-review screens.
Select a comparison, inspect each complete change and its source, then save a whole
case or individual change decision with your name and a note. Export JSON to retain
an editable review, or HTML/CSV for a readable complete report.

Importing into a new workspace receives the original comparison and its recorded
history. Importing into a workspace that already has the comparison uses its original
reconciliation rules: compatible later history can append; divergent history is
retained as a pending return. Review the pending return, choose which history to
keep for each divergence, then apply that reviewed plan. `--stage-return` stages an
incoming review against an existing comparison without applying it.

Reuse the same `--operation-id` and same input to recover an uncertain receiving
reply. Use a new identity for a genuinely different handover. A changed input with
an already-used identity is rejected rather than silently replacing the first one.

```sh
python review.py --state "$HOME/customer-review" compare list
python review.py --state "$HOME/customer-review" compare export COMPARISON_ID \\
  --format json --out "$HOME/review-delivery/review.json"
python review.py --state "$HOME/customer-review" return list
```

Output files are create-only; choose a new output path for a later report. The
library's SQLite files retain source paths and are not a portable customer handover.
Use complete JSON exports for another operator. The original comparison and return
CLI commands remain available; run `python review.py --help` and command `--help`.

## Python application use

The included wheel can be installed without dependencies, or import the supplied
Python source. The native checkout remains the package's `source/` directory.
`ResourceLibrary.browser()` shares the same original Node process and library:

```python
from pathlib import Path
from stellar_forge_buyer.review_library import ResourceLibrary

with ResourceLibrary.receiver(checkout=Path("/opt/review/source"),
                              state=Path("/private/customer-review")) as library:
    with library.browser(page="comparisons") as browser:
        print(browser.metadata())  # No private URL in ordinary logs.
        browser.open_tab()         # Explicit local desktop action.
        input("Press Enter to close the local review browser. ")
```

The Collections browser extension is included only when its original source entry
exists in the selected checkout; the available pages are returned by
`browser.pages`. Python collection operations continue through the original library.
The application never silently substitutes an alternative Collections interface.

## Files and preservation

`PACKAGE.json` records every delivered file's byte count and SHA-256. `verify.py`
checks those bytes, regular-file paths, and unlisted runtime additions. These checks
identify accidental changes; they are not publisher signatures. The archive contains
source and selected portable exports, not another operator's private workspace,
session credential, wallet key, or browser profile.
'''


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):h.update(chunk)
    return h.hexdigest()


def safe_source(path, root):
    if path.is_symlink() or path.resolve() != path:
        raise ValueError("Symlink source refused: " + str(path))
    if not stat.S_ISREG(path.stat().st_mode):
        raise ValueError("Regular source file required")
    return path.relative_to(root).as_posix()


def build(checkout: Path, out: Path, source_manifest: Path, reviews=(), wheel: Path | None = None, example_data=False):
    checkout = checkout.resolve(strict=True)
    if not out.is_absolute() or out.exists() or out.is_symlink():
        raise ValueError("A new absolute output file is required")
    if not out.parent.is_dir() or out.parent.resolve() != out.parent:
        raise ValueError("Existing canonical output directory required")
    required = [BASE / "python/review-bridge.mjs", BASE / "python/review-browser.mjs",
        BASE / "python/stellar_forge_buyer/review_browser.py", BASE / "python/stellar_forge_buyer/review_serve.py",
        BASE / "resource-library/library.mjs", BASE / "resource-library/server.mjs",
        BASE / "resource-library/comparison-extension.mjs"]
    for item in required:
        if not (checkout / item).is_file():raise ValueError("Missing customer runtime: " + str(item))
    selection = json.loads(source_manifest.read_text(encoding="utf-8"))
    selected_sources = {}
    for row in selection["files"]:
        name = row["path"]; relative = PurePosixPath(name)
        if not name or str(relative)!=name or relative.is_absolute() or ".." in relative.parts or "\\" in name or name in selected_sources:
            raise ValueError("Invalid source selection path")
        if type(row.get("bytes")) is not int or row["bytes"]<0 or len(row.get("sha256", ""))!=64:
            raise ValueError("Source selection requires byte counts and SHA-256")
        selected_sources[name] = row
    for item in required:
        if item.as_posix() not in selected_sources:raise ValueError("Customer runtime missing from source selection: " + str(item))
    # Required source-owned review pages are checked independently of the optional
    # Collections extension so a missing shipped page cannot become an empty UI.
    for name in ["index.html", "app.js", "style.css", "comparison.html", "comparison.js", "comparison.css",
                 "comparison-returns.html", "comparison-returns.js", "comparison-returns.css"]:
        if not (checkout / BASE / "resource-library" / name).is_file() or (BASE / "resource-library" / name).as_posix() not in selected_sources:
            raise ValueError("Missing review browser asset: " + name)
    with tempfile.TemporaryDirectory(prefix=".review-build-", dir=out.parent) as temp:
        stage = Path(temp) / "customer-review";stage.mkdir()
        for name, row in sorted(selected_sources.items()):
            path = checkout / name
            safe_source(path, checkout)
            dest = stage / "source" / name;dest.parent.mkdir(parents=True, exist_ok=True)
            before = path.stat()
            shutil.copyfile(path, dest)
            after = path.stat()
            if dest.stat().st_size != row["bytes"] or sha(dest) != row["sha256"]:
                raise ValueError("Selected source bytes changed: " + name)
            if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
                raise ValueError("Source changed during package build: " + name)
        selected = []
        for path in reviews:
            path = path.absolute();safe_source(path, path.parent)
            if path.suffix.lower() not in {".json", ".csv", ".html"}:raise ValueError("Portable JSON, CSV or HTML report required")
            dest = stage / "reviews" / path.name
            if dest.exists():raise ValueError("Repeated portable report name: " + path.name)
            dest.parent.mkdir(exist_ok=True);shutil.copyfile(path, dest);selected.append("reviews/" + path.name)
        if wheel:
            wheel = wheel.absolute();safe_source(wheel, wheel.parent)
            if wheel.suffix != ".whl":raise ValueError("Wheel file required")
            dest = stage / "wheels" / wheel.name;dest.parent.mkdir();shutil.copyfile(wheel, dest)
        for name, text in {"README.md": GUIDE, "review.py": LAUNCH, "verify.py": VERIFY}.items():
            (stage / name).write_text(text, encoding="utf-8")
        if selected:
            label = "The supplied reports use authored local example data for learning the review workflow." if example_data else "These are the exact portable reports selected by the package builder."
            (stage / "REVIEWS.md").write_text("# Included portable reviews\n\n" + label + "\n\n" + "\n".join("- `" + name + "`" for name in selected) + "\n")
        files = [{"path": p.relative_to(stage).as_posix(), "bytes": p.stat().st_size, "sha256": sha(p)}
                 for p in sorted(stage.rglob("*")) if p.is_file()]
        manifest = {"schema": SCHEMA, "python": ">=3.11 POSIX", "node": ">=22.16", "reviewFiles": selected,
            "browserPages": ["resources", "comparisons", "returns"] + (["collections"] if (BASE/"resource-library/collection-ui.mjs").as_posix() in selected_sources else []),
            "files": files}
        (stage / "PACKAGE.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
        archive = Path(temp) / "complete.zip"
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for path in sorted(stage.rglob("*")):
                if not path.is_file():continue
                info = zipfile.ZipInfo("customer-review/" + path.relative_to(stage).as_posix(), (2020,1,1,0,0,0))
                info.compress_type = zipfile.ZIP_DEFLATED;info.external_attr = (stat.S_IFREG | 0o644) << 16
                z.writestr(info, path.read_bytes())
        # Read every written member once, including CRC and exact manifest hashes,
        # before exposing a create-only final archive to another operator.
        with zipfile.ZipFile(archive) as z:
            for row in files:
                raw = z.read("customer-review/" + row["path"])
                if len(raw)!=row["bytes"] or hashlib.sha256(raw).hexdigest()!=row["sha256"]:
                    raise ValueError("Archive receiving mismatch: " + row["path"])
        with archive.open("rb") as f:os.fsync(f.fileno())
        os.link(archive, out)
        fd = os.open(out.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:os.fsync(fd)
        finally:os.close(fd)
        return {"path": str(out), "bytes": out.stat().st_size, "sha256": sha(out), "files": len(files)+1,
                "reviewFiles": selected, "browserPages": manifest["browserPages"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--source-manifest", required=True, type=Path, help="Explicit files array with path, bytes, sha256; no ambient checkout files are included")
    parser.add_argument("--review", action="append", default=[], type=Path)
    parser.add_argument("--wheel", type=Path)
    parser.add_argument("--example-data", action="store_true")
    args = parser.parse_args()
    try:print(json.dumps(build(args.checkout,args.out,args.source_manifest,args.review,args.wheel,args.example_data),indent=2))
    except (OSError,ValueError) as error:parser.exit(2,str(error)+"\n")

if __name__ == "__main__":main()
