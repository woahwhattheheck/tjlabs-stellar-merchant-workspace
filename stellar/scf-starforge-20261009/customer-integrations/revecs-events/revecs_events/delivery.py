"""Complete portable receiving exports and verified restoration."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tempfile
from typing import Any
import zipfile

from .model import WorkspaceError, digest, encode, now
from .workspace import Workspace


def _html(snapshot: dict[str, Any]) -> str:
    template = (Path(__file__).parent / "public" / "index.html").read_text("utf-8")
    data = encode(snapshot).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return template.replace("<!-- REVECS_BOOT -->", "<script>window.REVECS_EXPORT=" + data + ";</script>")


def verify_archive(path: str | Path) -> dict[str, Any]:
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        names = [info.filename for info in infos]
        if len(set(names)) != len(names):
            raise WorkspaceError("ARCHIVE_DUPLICATE", "The archive repeats a member path.")
        for info in infos:
            relative = PurePosixPath(info.filename)
            if relative.is_absolute() or ".." in relative.parts or "\\" in info.filename or not relative.parts:
                raise WorkspaceError("ARCHIVE_PATH", "The archive contains an invalid member path.")
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise WorkspaceError("ARCHIVE_LINK", "The archive contains a symbolic link.")
        manifest_body = archive.read("manifest.json")
        manifest = json.loads(manifest_body)
        if manifest.get("schema") != "revecs.events.export.v1":
            raise WorkspaceError("ARCHIVE_VERSION", "This is not a supported event workspace export.")
        rows = manifest["files"]
        expected = {row["path"] for row in rows}
        if len(expected) != len(rows) or set(names) != expected | {"manifest.json"}:
            raise WorkspaceError("ARCHIVE_INVENTORY", "The archive does not match its complete file inventory.")
        total = 0
        for row in rows:
            hasher, length = hashlib.sha256(), 0
            with archive.open(row["path"]) as stream:
                while chunk := stream.read(1024 * 1024):
                    hasher.update(chunk)
                    length += len(chunk)
            if length != row["bytes"] or hasher.hexdigest() != row["sha256"]:
                raise WorkspaceError("ARCHIVE_CHANGED", "An exported file has changed.", path=row["path"])
            total += length
        if "workspace/workspace.sqlite3" not in expected or "index.html" not in expected:
            raise WorkspaceError("ARCHIVE_INCOMPLETE", "The complete workspace or offline reader is missing.")
    return {"members": len(names), "payload_bytes": total, "manifest": manifest,
            "manifest_sha256": digest(manifest_body)}


def export_workspace(workspace: Workspace, path: str | Path) -> dict[str, Any]:
    """Snapshot the whole database and publish one complete, self-contained ZIP."""
    target = Path(path).expanduser().resolve()
    if target.exists():
        raise WorkspaceError("EXPORT_EXISTS", "Choose a new export filename to preserve the existing delivery.")
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".revecs-export-", dir=target.parent) as temporary:
        root = Path(temporary)
        case = root / "workspace"
        case.mkdir()
        workspace.backup(case / "workspace.sqlite3")
        retained = Workspace(case)
        verified = retained.verify()
        snapshot = retained.snapshot(include_timelines=True)
        package = root / "revecs_events"
        original = Path(__file__).parent
        package.mkdir()
        for source in sorted(original.glob("*.py")):
            shutil.copyfile(source, package / source.name)
        for filename in ("OPERATING.md", "LICENSE", "payment-requirements.txt"):
            source = original / filename
            if source.is_file():
                shutil.copyfile(source, package / filename)
        shutil.copytree(original / "public", package / "public")
        shutil.copytree(original / "public", root / "assets")
        for response in snapshot["responses"]:
            directory = root / "responses" / response["id"]
            directory.mkdir(parents=True)
            complete = bool(response["complete"])
            body_path = directory / ("response.json" if complete else "response.partial")
            with body_path.open("wb") as stream:
                for chunk in retained.iter_body(response["id"]):
                    stream.write(chunk)
            metadata = retained.response(response["id"])
            metadata["representation"] = "Complete HTTP entity after Content-Encoding decoding" if complete else "Retained partial HTTP entity"
            (directory / "response-metadata.json").write_text(encode(metadata) + "\n", "utf-8")
            response["download"] = body_path.relative_to(root).as_posix()
        (root / "index.html").write_text(_html(snapshot), "utf-8")
        (root / "snapshot.json").write_text(encode(snapshot) + "\n", "utf-8")
        (root / "open.py").write_text(
            'from pathlib import Path\nfrom revecs_events.cli import main\n'
            'raise SystemExit(main(["serve", str(Path(__file__).parent / "workspace")]))\n', "utf-8")
        (root / "README.md").write_text(
            "# " + snapshot["configuration"]["name"] + "\n\n"
            "Open index.html for the complete saved offline reader. It includes the current "
            "watchlist, catalyst timelines and retained response downloads.\n\n"
            "Run python3 open.py for the local operator. All pages, earlier editions, payment "
            "metadata, partial receiving and watchlist revisions are in workspace/workspace.sqlite3. "
            "The operator creates a new private access token when it starts.\n\n"
            "The receiving process needs the optional dependencies listed in "
            "revecs_events/payment-requirements.txt and the customer's PAYER_PRIVATE_KEY environment "
            "variable. See revecs_events/OPERATING.md for receiving, history reconciliation, "
            "offline replay, restart and complete restoration.\n\n"
            "manifest.json binds every exported member to its complete size and SHA-256. "
            "The original provider response bodies are in responses/.\n", "utf-8")
        files = []
        for file in sorted(root.rglob("*")):
            if file.is_file() and "__pycache__" not in file.parts:
                body = file.read_bytes()
                files.append({"path": file.relative_to(root).as_posix(), "bytes": len(body), "sha256": digest(body)})
        manifest = {
            "schema": "revecs.events.export.v1", "created": now(),
            "workspace": snapshot["configuration"]["id"], "name": snapshot["configuration"]["name"],
            "mode": snapshot["configuration"]["mode"], "database": verified, "files": files,
        }
        (root / "manifest.json").write_text(encode(manifest) + "\n", "utf-8")
        temporary_zip = root / "delivery.zip"
        with zipfile.ZipFile(temporary_zip, "x", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for row in files:
                archive.write(root / row["path"], row["path"])
            archive.write(root / "manifest.json", "manifest.json")
        check = verify_archive(temporary_zip)
        with temporary_zip.open("rb") as stream:
            os.fsync(stream.fileno())
        # Publish a complete file while preserving an existing delivery.
        os.link(temporary_zip, target)
        os.chmod(target, 0o600)
        directory_fd = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        with target.open("rb") as stream:
            hasher = hashlib.file_digest(stream, "sha256").hexdigest()
        return {"path": str(target), "bytes": target.stat().st_size, "sha256": hasher,
                "members": check["members"], "payload_bytes": check["payload_bytes"], "database": verified}


def restore_workspace(archive_path: str | Path, destination: str | Path) -> dict[str, Any]:
    """Receive every original member, then reopen the complete database in its new location."""
    verified = verify_archive(archive_path)
    target = Path(destination).expanduser().resolve()
    if target.exists():
        raise WorkspaceError("DESTINATION_EXISTS", "Restore into a new directory to preserve existing work.")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".revecs-receive-", dir=target.parent))
    try:
        with zipfile.ZipFile(archive_path) as archive:
            for row in verified["manifest"]["files"] + [{"path": "manifest.json"}]:
                relative = row["path"]
                output = temporary.joinpath(*PurePosixPath(relative).parts)
                output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                hasher, length = hashlib.sha256(), 0
                with archive.open(relative) as source, output.open("xb") as sink:
                    while chunk := source.read(1024 * 1024):
                        sink.write(chunk)
                        hasher.update(chunk)
                        length += len(chunk)
                expected = verified["manifest_sha256"] if relative == "manifest.json" else row["sha256"]
                if hasher.hexdigest() != expected or (relative != "manifest.json" and length != row["bytes"]):
                    raise WorkspaceError("ARCHIVE_CHANGED", "The archive changed while restoring a member.", path=relative)
                os.chmod(output, 0o600)
        receiving = Workspace(temporary / "workspace")
        result = receiving.verify()
        os.rename(temporary, target)
        return {"path": str(target), "workspace": str(target / "workspace"),
                "members": verified["members"], "database": result}
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
