"""MIT. Complete HILA history, native datasets and deterministic report receiving."""
from __future__ import annotations

from contextlib import contextmanager
import csv
import hashlib
import io
import os
from pathlib import Path, PurePosixPath
import stat
import tempfile
import zipfile

from hila_questionnaire import canonical, sha, inventory, MAX_FORM
import hila_source as source
import hila_rules as rules
from hila_workspace import (InputError, META_LIMIT, DEFINITION_FIELDS, EDITION, REVIEW,
                            strict_json, stable_build, publish, require_fields,
                            revision_number, request_id)
from workspace import Workspace, checked_id, regular, file_digest, sync_dir

PACKET = "stellar-forge.hila-review-packet.v1"
DOCUMENT = "stellar-forge.hila-review-history.v1"
REPORT_PACKET = "stellar-forge.hila-report-files.v1"
MAX_ARCHIVE = 4 * 1024 * 1024 * 1024
MAX_MEMBERS = 200000
FIXED_TIME = (1980, 1, 1, 0, 0, 0)


def safe_name(name):
    if (not isinstance(name, str) or not name or len(name) > 512 or "\\" in name or "\x00" in name or
        name.startswith("/") or any(part in {"", ".", ".."} for part in name.split("/")) or
        PurePosixPath(name).is_absolute()):
        raise InputError("Archive member must have a safe explicit relative file name")
    return name


def checked_size(path, limit=MAX_ARCHIVE):
    info = regular(Path(path), limit)
    return {"bytes": info.st_size, "sha256": file_digest(Path(path), limit)}


@contextmanager
def open_output(path):
    with os.fdopen(os.open(Path(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                           getattr(os, "O_NOFOLLOW", 0), 0o600), "wb") as out:
        yield out
        out.flush()
        os.fsync(out.fileno())



@contextmanager
def output_lease(path):
    """The original private-file OS lease, scoped to one complete output destination."""
    path = Path(path).expanduser().absolute()
    parent = path.parent.resolve(strict=True)
    if parent != path.parent or not parent.is_dir() or parent.is_symlink():
        raise InputError("Choose an original real output directory without aliases")
    lease_directory = parent / (".hila-output-" + sha(os.path.normcase(path.name).encode()))
    lease_directory.mkdir(mode=0o700, exist_ok=True)
    lease_info = lease_directory.lstat()
    if (not stat.S_ISDIR(lease_info.st_mode) or lease_info.st_mode & 0o077 or
        os.name == "posix" and lease_info.st_uid != os.getuid()):
        raise InputError("Complete output lease directory must remain private and operator-owned")
    lock_path = lease_directory / "lease.lock"
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    handle = os.fdopen(os.open(lock_path, flags, 0o600), "r+b", buffering=0)
    try:
        regular(lock_path, 1)
        before = lock_path.lstat()
        opened = os.fstat(handle.fileno())
        if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            raise InputError("Original output lease changed while opening")
        try:
            if os.name == "posix":
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            else:
                import msvcrt
                if not handle.read(1):
                    handle.write(b"0")
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as error:
            raise InputError("This complete output is already being published; continue its existing writer or retry after it closes") from error
        after = lock_path.lstat()
        if (after.st_dev, after.st_ino) != (opened.st_dev, opened.st_ino):
            raise InputError("Original output lease was replaced")
        yield path
    finally:
        handle.close()

def _member_limit(name):
    if name.startswith("native/") and name.endswith(".zip"):
        return 512 * 1024 * 1024
    if name.startswith("questionnaires/") and name.endswith(".xml"):
        return MAX_FORM
    if name.endswith(".html") or name.endswith(".csv"):
        return MAX_ARCHIVE
    return META_LIMIT


def _archive_open(path):
    regular(path, MAX_ARCHIVE)
    try:
        return zipfile.ZipFile(path)
    except (OSError, zipfile.BadZipFile) as e:
        raise InputError("Supply one complete verified HILA ZIP") from e


def inspect_archive(path, schema=None, destination=None):
    """Read every member, its full CRC and declared identity before accepting metadata."""
    path = Path(path)
    with _archive_open(path) as archive:
        infos = archive.infolist()
        names = [item.filename for item in infos]
        if not 1 < len(infos) <= MAX_MEMBERS or len(set(names)) != len(names) or "manifest.json" not in names:
            raise InputError("Archive must contain one unique manifest and a complete nonempty file selection")
        if sum(item.file_size for item in infos) > MAX_ARCHIVE:
            raise InputError("Complete uncompressed archive exceeds 4 GiB")
        for item in infos:
            safe_name(item.filename)
            mode = item.external_attr >> 16
            if (item.is_dir() or item.flag_bits & 1 or stat.S_ISLNK(mode) or
                stat.S_IFMT(mode) not in {0, stat.S_IFREG} or
                item.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED} or
                item.file_size > _member_limit(item.filename)):
                raise InputError("Unsupported archive member, compression, encryption or size")
        manifest = strict_json(archive.read("manifest.json"))
        require_fields(manifest, ("schema", "selection", "files"), "Complete archive manifest")
        if schema is not None and manifest["schema"] != schema:
            raise InputError("Archive selects another original product format")
        if not isinstance(manifest["files"], dict) or set(manifest["files"]) != set(names) - {"manifest.json"}:
            raise InputError("Archive manifest must account for every complete selected member")
        document = None
        for name, descriptor in manifest["files"].items():
            require_fields(descriptor, ("bytes", "sha256"), "Archive member identity")
            if type(descriptor["bytes"]) is not int or descriptor["bytes"] < 0:
                raise InputError("Archive member size must be a nonnegative integer")
            checked_id(descriptor["sha256"])
            if archive.getinfo(name).file_size != descriptor["bytes"]:
                raise InputError("Archive member size differs from its complete manifest")
            size, digest = 0, hashlib.sha256()
            out = None
            if destination is not None:
                target = Path(destination).joinpath(*name.split("/"))
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                out = os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb")
            chunks = [] if name == "document.json" else None
            try:
                with archive.open(name) as inp:
                    while block := inp.read(1024 * 1024):
                        size += len(block)
                        if size > descriptor["bytes"] or size > _member_limit(name):
                            raise InputError("Archive stream exceeds the retained member size")
                        digest.update(block)
                        if out is not None:
                            out.write(block)
                        if chunks is not None:
                            chunks.append(block)
                if out is not None:
                    out.flush()
                    os.fsync(out.fileno())
            except zipfile.BadZipFile as e:
                raise InputError("Complete archive member failed CRC verification") from e
            finally:
                if out is not None:
                    out.close()
            if descriptor != {"bytes": size, "sha256": digest.hexdigest()}:
                raise InputError("Complete archive member failed byte verification: " + name)
            if chunks is not None:
                document = strict_json(b"".join(chunks))
        return {"manifest": manifest, "document": document, **checked_size(path)}


def _output_path(path, inputs):
    path = Path(path).expanduser().absolute()
    if not path.parent.is_dir() or path.parent.is_symlink() or path.name in {"", ".", ".."}:
        raise InputError("Choose an existing real output directory and a complete file name")
    resolved = path.parent.resolve() / path.name
    for source_path in inputs.values():
        original = Path(source_path).resolve(strict=True)
        if resolved == original or resolved in original.parents:
            raise InputError("Output overlaps a selected original input")
    if path.exists() or path.is_symlink():
        regular(path, MAX_ARCHIVE)
    return path


def _same_manifest(path, expected):
    read = inspect_archive(path, expected["schema"])
    if read["manifest"] != expected:
        raise InputError("Completed ZIP selects different original files or history")
    return read


def write_archive(output, files, schema, selection):
    with output_lease(output) as selected:
        return _write_archive_locked(selected, files, schema, selection)


def _write_archive_locked(output, files, schema, selection):
    files = dict(sorted(files.items()))
    if not 1 <= len(files) < MAX_MEMBERS:
        raise InputError("Complete archive file count is outside its bound")
    for name in files:
        safe_name(name)
        if name == "manifest.json":
            raise InputError("The archive writer owns its original manifest")
    output = _output_path(output, files)
    entries = {name: checked_size(path, _member_limit(name)) for name, path in files.items()}
    if sum(item["bytes"] for item in entries.values()) > MAX_ARCHIVE:
        raise InputError("Complete uncompressed output exceeds 4 GiB")
    manifest = {"schema": schema, "selection": selection, "files": entries}
    encoded = canonical(manifest)
    if len(encoded) > META_LIMIT:
        raise InputError("Complete manifest exceeds 64 MiB")
    if sum(item["bytes"] for item in entries.values()) + len(encoded) > MAX_ARCHIVE:
        raise InputError("Full manifest and uncompressed archive exceed 4 GiB")
    if output.exists():
        verified = _same_manifest(output, manifest)
        return {"file": str(output), "bytes": verified["bytes"], "sha256": verified["sha256"],
                "selection": selection, "reused": True}
    fd, temporary = tempfile.mkstemp(prefix="." + output.name + "-", suffix=".partial", dir=output.parent)
    stage = Path(temporary)
    def info(name):
        value = zipfile.ZipInfo(name, FIXED_TIME)
        value.create_system = 3
        value.external_attr = (stat.S_IFREG | 0o600) << 16
        value.compress_type = zipfile.ZIP_DEFLATED
        return value
    with os.fdopen(fd, "w+b") as out:
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
            archive.writestr(info("manifest.json"), encoded)
            for name, source_path in files.items():
                h, count = hashlib.sha256(), 0
                with Path(source_path).open("rb") as inp, archive.open(info(name), "w", force_zip64=True) as target:
                    while block := inp.read(1024 * 1024):
                        count += len(block)
                        if count > entries[name]["bytes"]:
                            raise InputError("Original input changed during complete output publication")
                        target.write(block)
                        h.update(block)
                if entries[name] != {"bytes": count, "sha256": h.hexdigest()} or checked_size(source_path, _member_limit(name)) != entries[name]:
                    raise InputError("Original selected input changed during output publication")
        out.flush()
        os.fsync(out.fileno())
    _same_manifest(stage, manifest)
    os.replace(stage, output)
    sync_dir(output.parent)
    return {"file": str(output), **checked_size(output), "selection": selection, "reused": False}


def copy_complete(source_path, destination, expected=None):
    with output_lease(destination) as selected:
        return _copy_complete_locked(source_path, selected, expected)


def _copy_complete_locked(source_path, destination, expected=None):
    source_path, destination = Path(source_path), Path(destination)
    expected = expected or checked_size(source_path)
    _output_path(destination, {"original": source_path})
    if destination.exists():
        if checked_size(destination) != expected:
            raise InputError("Completed output differs from the selected original archive")
        return destination
    fd, name = tempfile.mkstemp(prefix="." + destination.name + "-", suffix=".partial", dir=destination.parent)
    stage = Path(name)
    h, count = hashlib.sha256(), 0
    with source_path.open("rb") as inp, os.fdopen(fd, "wb") as out:
        while block := inp.read(1024 * 1024):
            count += len(block)
            if count > expected["bytes"]:
                raise InputError("Retained original changed while copying")
            h.update(block)
            out.write(block)
        out.flush()
        os.fsync(out.fileno())
    if {"bytes": count, "sha256": h.hexdigest()} != expected or checked_size(source_path) != expected:
        raise InputError("Retained original failed complete copy verification")
    if checked_size(stage) != expected:
        raise InputError("Complete private copy readback differs from its original")
    os.replace(stage, destination)
    sync_dir(destination.parent)
    if checked_size(destination) != expected:
        raise InputError("Published complete output differs from its original")
    return destination


def _cache_key(view, history, kind):
    return sha(canonical({"schema": kind, "review": view["id"], "revision": view["revision"],
                          "history": [{"revision": row["revision"], "definition": row["definitionSha256"],
                                       "report": row["report"]} for row in history]}))


def _native_packet(ws, edition):
    build = edition["build"]
    path = ws.root / "packet-cache" / ("native-" + build["id"] + ".zip")
    if path.exists():
        _verify_native(path, edition)
        return path
    fd, temporary = tempfile.mkstemp(prefix=".native-", suffix=".partial", dir=path.parent)
    os.close(fd)
    Path(temporary).unlink()
    stage = Path(temporary)
    Workspace.export_packet(ws, build["id"], stage)
    _verify_native(stage, edition)
    os.replace(stage, path)
    sync_dir(path.parent)
    return path


def _verify_native(path, edition):
    expected_names = {"manifest.json", "source.hila", "plan.json", "data.csv", "dataset.json", "review.json"}
    limits = {"manifest.json": 16384, "source.hila": source.MAX_BYTES, "plan.json": 65536,
              "data.csv": 256 * 1024 * 1024, "dataset.json": 65536, "review.json": 131072}
    with _archive_open(path) as archive:
        infos = archive.infolist()
        if len(infos) != 6 or {info.filename for info in infos} != expected_names:
            raise InputError("Native packet must retain all six original Dataset files")
        bodies, descriptors = {}, {}
        for info in infos:
            mode = info.external_attr >> 16
            if (info.is_dir() or info.flag_bits & 1 or stat.S_ISLNK(mode) or
                info.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED} or
                info.file_size > limits[info.filename]):
                raise InputError("Invalid original native packet member")
            size, h = 0, hashlib.sha256()
            chunks = [] if info.filename in {"manifest.json", "plan.json", "review.json"} else None
            with archive.open(info) as inp:
                while block := inp.read(1024 * 1024):
                    size += len(block)
                    if size > limits[info.filename]:
                        raise InputError("Native packet member exceeded its complete limit")
                    h.update(block)
                    if chunks is not None:
                        chunks.append(block)
            descriptors[info.filename] = {"bytes": size, "sha256": h.hexdigest()}
            if chunks is not None:
                bodies[info.filename] = strict_json(b"".join(chunks))
        manifest, reviewed = bodies["manifest.json"], bodies["review.json"]
        if (manifest != {"schema": "stellar-forge.hila-packet.v1", "build": edition["build"]["id"],
                         "files": {name: item for name, item in descriptors.items() if name != "manifest.json"}} or
            stable_build(reviewed) != stable_build(edition["build"]) or
            descriptors["source.hila"]["sha256"] != edition["source"] or
            descriptors["plan.json"]["sha256"] != edition["plan"] or
            descriptors["data.csv"] != edition["build"]["files"]["data.csv"] or
            descriptors["dataset.json"] != edition["build"]["files"]["dataset.json"]):
            raise InputError("Original native packet and edition do not identify one full source projection")
        return bodies


def _csv(path, header, rows):
    with open_output(path) as out:
        wrapper = io.TextIOWrapper(out, encoding="utf-8", newline="", write_through=True)
        try:
            writer = csv.writer(wrapper, lineterminator="\n")
            writer.writerow(header)
            for row in rows:
                writer.writerow(row)
            wrapper.flush()
        finally:
            wrapper.detach()
    checked_size(path)
    return path


def report_files(view, report, form, directory, public=False):
    from hila_html import write_html
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    files = {}
    files["report.json"] = publish(directory / "report.json", canonical(report))
    files["report.html"] = write_html(view if not public else None, report, form if not public else None,
                                      directory / "report.html")
    def cells():
        for edition in report["editions"]:
            for cell in edition["cells"]:
                yield [edition["edition"], cell["key"], cell["dimension"], cell["axis"],
                       "" if cell["value"] is None else cell["value"], cell["respondents"],
                       cell["scoredRespondents"], cell["meanScore"] if cell["meanScore"] is not None else "",
                       canonical(cell.get("states", {})).decode().strip()]
    files["cells.csv"] = _csv(directory / "cells.csv",
        ["edition", "cellKey", "dimension", "axis", "value", "respondents", "scoredRespondents", "meanScore", "denominatorStates"], cells())
    if not public:
        def frequencies():
            for edition in report["editions"]:
                for field in edition["fields"]:
                    for code, count in field["values"].items():
                        yield [edition["edition"], field["field"], code, count,
                               canonical(field["states"]).decode().strip()]
        files["coded-answer-frequencies.csv"] = _csv(directory / "coded-answer-frequencies.csv",
            ["edition", "questionnaireField", "originalCode", "respondents", "denominatorStates"], frequencies())
        files["methodology.json"] = publish(directory / "methodology.json", canonical(view["rules"]))
        files["review-update-template.json"] = publish(directory / "review-update-template.json",
            canonical({key: view[key] for key in DEFINITION_FIELDS} | {"id": view["id"], "expectedRevision": view["revision"]}))
    files["SOURCE_AND_USE.md"] = publish(directory / "SOURCE_AND_USE.md", (
        "# HILA round review\n\n"
        "This complete report retains the selected questionnaire identity, explicit calculation rules, "
        "source provenance and original review revision. Individual editions are independent samples. "
        "Country and role cells can overlap; do not sum them as distinct respondents. A missing, hidden, "
        "invalid, unmapped or explicit non-response answer is not a zero score.\n\n"
        + ("This is the selected approved aggregate release. Whole-axis suppression is applied across both editions. "
           "The original private report and respondent files are not part of this release.\n"
           if public else
           "This is a private analyst delivery. It contains complete aggregate distributions and named decisions. "
           "The separate full workspace packet retains the original questionnaire and source files under their own "
           "rights and consent. Public release requires its selected approved disclosure definition and reviewed revision.\n")
    ).encode())
    return files


def export_report(ws, ident, output, revision=None, public=False):
    with ws.mutex:
        view = ws.review(ident, revision)
        report = ws.report(ident, view["revision"], public=public)
        form = ws.questionnaire(ws.edition(view["editions"][0])["questionnaire"])
        with ws.scratch() as temp:
            files = report_files(view, report, form, temp / "report", public)
            return write_archive(output, files, REPORT_PACKET,
                {"review": ident, "revision": view["revision"], "definitionSha256": view["definitionSha256"],
                 "visibility": "approved-aggregates" if public else "private-analyst"})


def _history_selection(ws, ident, revision):
    view = ws.review(ident, revision)
    history = [item for item in ws.history(ident) if item["revision"] <= view["revision"]]
    return view, history


def _document(ws, view, history):
    ids = sorted({ident for item in history for ident in item["editions"]})
    editions = [ws.edition(ident) for ident in ids]
    forms = sorted({edition["questionnaire"] for edition in editions})
    acquisitions = [ws.acquisition(ident) for ident in sorted({edition["acquisition"] for edition in editions})]
    requests = []
    for row in ws.db.execute("SELECT * FROM hila_requests ORDER BY id"):
        result = strict_json(row["result"])
        selected = ((row["kind"] == "edition.save" and result["id"] in ids) or
                    (row["kind"] == "review.save" and result["id"] == view["id"] and result["revision"] <= view["revision"]))
        if selected:
            requests.append({"id": row["id"], "kind": row["kind"], "inputSha256": row["input_sha"],
                             "input": strict_json(row["input"]), "result": result})
    return {"schema": DOCUMENT, "reviewId": view["id"], "revision": view["revision"],
            "history": history, "editions": editions, "questionnaires": forms,
            "acquisitions": acquisitions, "requests": requests}


def _validate_cached(ws, path, view, history):
    result = inspect_archive(path, PACKET)
    doc = result["document"]
    if not isinstance(doc, dict) or doc.get("history") != history or doc.get("reviewId") != view["id"] or doc.get("revision") != view["revision"]:
        raise InputError("Cached full packet differs from its exact saved review history")
    if result["manifest"]["selection"] != {"review": view["id"], "revision": view["revision"],
                                          "definitionSha256": view["definitionSha256"]}:
        raise InputError("Cached packet selects another original review")
    for edition in doc["editions"]:
        if not edition_equal(ws.edition(edition["id"]), edition):
            raise InputError("Cached packet native source differs from retained edition")
    return result


def export_review(ws, ident, output, revision=None):
    with ws.mutex:
        view, history = _history_selection(ws, ident, revision)
        key = _cache_key(view, history, PACKET)
        retained = ws.root / "packet-cache" / (key + ".zip")
        if retained.exists():
            _validate_cached(ws, retained, view, history)
        else:
            doc = _document(ws, view, history)
            with ws.scratch() as temp:
                files = {"document.json": publish(temp / "document.json", canonical(doc))}
                for form_id in doc["questionnaires"]:
                    ws.questionnaire(form_id)
                    files["questionnaires/" + form_id + ".xml"] = ws.root / "questionnaires" / (form_id + ".xml")
                    files["questionnaires/" + form_id + ".json"] = ws.root / "questionnaires" / (form_id + ".json")
                for edition in doc["editions"]:
                    files["native/" + edition["id"] + ".zip"] = _native_packet(ws, edition)
                for saved in history:
                    report = ws.report(ident, saved["revision"])
                    form = ws.questionnaire(ws.edition(saved["editions"][0])["questionnaire"])
                    for name, path in report_files(saved, report, form, temp / str(saved["revision"])).items():
                        files["reports/" + str(saved["revision"]) + "/" + name] = path
                write_archive(retained, files, PACKET, {"review": ident, "revision": view["revision"],
                                                       "definitionSha256": view["definitionSha256"]})
                _validate_cached(ws, retained, view, history)
        output = Path(output).expanduser().absolute()
        if output != retained:
            copy_complete(retained, output)
        return {"file": str(output), **checked_size(output), "review": ident, "revision": view["revision"],
                "definitionSha256": view["definitionSha256"]}


def is_review_packet(path):
    with _archive_open(Path(path)) as archive:
        if "manifest.json" not in archive.namelist() or archive.getinfo("manifest.json").file_size > META_LIMIT:
            raise InputError("Complete import has no bounded manifest")
        return strict_json(archive.read("manifest.json")).get("schema") == PACKET


def edition_equal(left, right):
    return ({key: value for key, value in left.items() if key not in {"build", "created"}} ==
            {key: value for key, value in right.items() if key not in {"build", "created"}} and
            stable_build(left["build"]) == stable_build(right["build"]))


def _validate_history(document):
    require_fields(document, ("schema", "reviewId", "revision", "history", "editions",
                              "questionnaires", "acquisitions", "requests"), "Complete HILA history")
    if document["schema"] != DOCUMENT:
        raise InputError("Unsupported complete HILA history version")
    ident = checked_id(document["reviewId"])
    last = revision_number(document["revision"])
    history = document["history"]
    if not isinstance(history, list) or len(history) != last:
        raise InputError("Packet must retain the complete uninterrupted review history")
    for revision, view in enumerate(history, 1):
        fields = set(DEFINITION_FIELDS) | {"schema", "id", "revision", "definitionSha256",
                                         "created", "updated", "previousRevision", "report"}
        require_fields(view, fields, "Saved review snapshot")
        if (view["schema"] != REVIEW or view["id"] != ident or view["revision"] != revision or
            view["previousRevision"] != (revision - 1 if revision > 1 else None) or
            view["created"] != history[0]["created"]):
            raise InputError("Saved review history is not one exact original revision chain")
        rules.instant(view["created"], "Original review creation")
        rules.instant(view["updated"], "Original review update")
        definition = {key: view[key] for key in DEFINITION_FIELDS}
        if sha(canonical(definition)) != view["definitionSha256"]:
            raise InputError("Saved review definition SHA does not match its complete fields")
        require_fields(view["report"], ("bytes", "sha256", "editions"), "Original report identity")
        checked_id(view["report"]["sha256"])
        if type(view["report"]["bytes"]) is not int or not 0 < view["report"]["bytes"] <= META_LIMIT:
            raise InputError("Original report has an invalid complete byte count")
    if not isinstance(document["editions"], list) or not document["editions"]:
        raise InputError("Packet must retain all selected immutable editions")
    selected = {ident for view in history for ident in view["editions"]}
    if len(document["editions"]) != len(selected) or {item.get("id") for item in document["editions"] if isinstance(item, dict)} != selected:
        raise InputError("Full packet must contain exactly the editions required by its history")
    if not isinstance(document["requests"], list) or len(document["requests"]) > MAX_MEMBERS:
        raise InputError("Original request journal exceeds the complete packet bound")
    seen, results = set(), {}
    for item in document["requests"]:
        require_fields(item, ("id", "kind", "inputSha256", "input", "result"), "Original request replay record")
        request_id(item["id"])
        if not isinstance(item["input"], dict) or not isinstance(item["result"], dict):
            raise InputError("Original request input and result must be complete objects")
        if item["id"] in seen or item["input"].get("requestId") != item["id"] or sha(canonical(item["input"])) != item["inputSha256"]:
            raise InputError("Request replay identity does not match its complete original input")
        seen.add(item["id"])
        if item["kind"] not in {"edition.save", "review.save"}:
            raise InputError("Unsupported original HILA request kind")
        if item["kind"] == "review.save":
            selected_revision = item["result"].get("revision")
            if type(selected_revision) is not int or not 1 <= selected_revision <= last or item["result"] != history[selected_revision - 1]:
                raise InputError("Review request result is not its retained exact historical snapshot")
            raw = item["input"]
            if selected_revision == 1:
                if "id" in raw or "expectedRevision" in raw or sha(canonical({"schema": REVIEW, "creationRequest": item["id"]})) != ident:
                    raise InputError("Original creation request does not identify this review")
            elif raw.get("id") != ident or raw.get("expectedRevision") != selected_revision - 1:
                raise InputError("Original edit request does not identify its predecessor revision")
            results[selected_revision] = True
        elif item["result"].get("id") not in selected:
            raise InputError("Edition replay record is outside this complete review")
    if set(results) != set(range(1, last + 1)):
        raise InputError("Every saved revision needs its complete original request and result")
    return history


def _expected_names(doc):
    report_names = {"report.json", "report.html", "cells.csv", "coded-answer-frequencies.csv",
                    "methodology.json", "review-update-template.json", "SOURCE_AND_USE.md"}
    return ({"document.json"} |
            {"questionnaires/" + ident + suffix for ident in doc["questionnaires"] for suffix in [".xml", ".json"]} |
            {"native/" + edition["id"] + ".zip" for edition in doc["editions"]} |
            {"reports/" + str(view["revision"]) + "/" + name for view in doc["history"] for name in report_names})


def receive_review(ws, path):
    path = Path(path)
    with ws.mutex, ws.scratch() as temp:
        extracted = temp / "received"
        extracted.mkdir(mode=0o700)
        inspection = inspect_archive(path, PACKET, extracted)
        doc = inspection["document"]
        history = _validate_history(doc)
        view = history[-1]
        if inspection["manifest"]["selection"] != {"review": doc["reviewId"], "revision": doc["revision"],
                                                   "definitionSha256": view["definitionSha256"]}:
            raise InputError("Packet selection differs from its exact full history")
        form_ids = sorted({edition["questionnaire"] for edition in doc["editions"]})
        if doc["questionnaires"] != form_ids or set(inspection["manifest"]["files"]) != _expected_names(doc):
            raise InputError("Packet members must preserve exactly the selected forms, native datasets and every complete historical report")
        if not isinstance(doc["acquisitions"], list):
            raise InputError("Packet must preserve its complete original acquisition list")
        acquired = {item["id"]: item for item in doc["acquisitions"]}
        if len(acquired) != len(doc["acquisitions"]) or set(acquired) != {edition["acquisition"] for edition in doc["editions"]}:
            raise InputError("Packet acquisitions must match every selected edition exactly")
        for form_id in form_ids:
            original = (extracted / "questionnaires" / (form_id + ".xml")).read_bytes()
            rebuilt = inventory(original)
            supplied = strict_json((extracted / "questionnaires" / (form_id + ".json")).read_bytes())
            if rebuilt != supplied or rebuilt["sha256"] != form_id:
                raise InputError("Complete questionnaire, translations and field catalogue do not reconstruct")
            for acquisition in [item for item in acquired.values() if item["questionnaire"] == form_id]:
                require_fields(acquisition, ("schema", "questionnaire", "provenance", "id"), "Retained acquisition")
                if (acquisition["schema"] != "stellar-forge.hila-questionnaire-acquisition.v1" or
                    sha(canonical({key: item for key, item in acquisition.items() if key != "id"})) != acquisition["id"]):
                    raise InputError("Acquisition ID does not bind its complete original provenance")
                returned = ws.add_questionnaire(io.BytesIO(original), acquisition["provenance"])
                if returned["questionnaire"] != supplied or returned["acquisition"] != acquisition:
                    raise InputError("Questionnaire receiving changed the original source selection")
        receiving = []
        edition_requests = {}
        for item in doc["requests"]:
            if item["kind"] == "edition.save":
                edition_requests.setdefault(item["result"]["id"], []).append(item)
        if set(edition_requests) != {item["id"] for item in doc["editions"]}:
            raise InputError("Every immutable edition needs at least one complete original save request")
        for edition in doc["editions"]:
            if edition.get("schema") != EDITION:
                raise InputError("Unsupported retained edition schema")
            packet = extracted / "native" / (checked_id(edition["id"]) + ".zip")
            _verify_native(packet, edition)
            local = Workspace.import_packet(ws, packet)
            if stable_build(local["build"]) != stable_build(edition["build"]):
                raise InputError("Original native Dataset reconstruction differs from the selected edition")
            for operation in edition_requests[edition["id"]]:
                definition, mapped, original = ws._edition_definition(operation["input"])
                if (sha(canonical({"schema": EDITION, "definition": definition})) != edition["id"] or
                    any(edition.get(key) != value for key, value in definition.items()) or
                    sha(canonical(mapped)) != edition["plan"] or
                    edition.get("sourceBytes") != original["bytes"] or edition.get("rows") != local["build"]["rowCount"] or
                    not edition_equal(operation["result"], edition)):
                    raise InputError("Edition replay input, full source, mapping and original native result do not agree")
            receiving.append({"edition": edition["id"], "build": local["build"]})
        # Native source/build intake completes before the single domain-history transaction.
        validated_reports = []
        with ws.db:
            for edition in doc["editions"]:
                old = ws.db.execute("SELECT body FROM hila_editions WHERE id=?", (edition["id"],)).fetchone()
                if old is not None:
                    if not edition_equal(strict_json(old["body"]), edition):
                        raise InputError("Existing edition conflicts with the full incoming original")
                else:
                    ws.db.execute("INSERT INTO hila_editions VALUES(?,?)", (edition["id"], canonical(edition).decode()))
            for original in doc["requests"]:
                old = ws.db.execute("SELECT * FROM hila_requests WHERE id=?", (original["id"],)).fetchone()
                if old and (old["kind"] != original["kind"] or old["input_sha"] != original["inputSha256"] or
                            strict_json(old["input"]) != original["input"] or strict_json(old["result"]) != original["result"]):
                    raise InputError("Incoming original request conflicts with retained operation history")
            for saved in history:
                old = ws.db.execute("SELECT body FROM hila_reviews WHERE id=? AND revision=?",
                                    (saved["id"], saved["revision"])).fetchone()
                if old is not None and strict_json(old["body"]) != saved:
                    raise InputError("Incoming review history is not an exact prefix of the retained continuation")
                original_request = next(item for item in doc["requests"] if item["kind"] == "review.save" and item["result"]["revision"] == saved["revision"])
                definition = ws._definition(original_request["input"])
                if definition != {key: saved[key] for key in DEFINITION_FIELDS}:
                    raise InputError("Original save input no longer reconstructs the retained complete definition")
                for item in doc["requests"]:
                    if item["kind"] == "review.save" and item["result"]["revision"] == saved["revision"] and ws._definition(item["input"]) != definition:
                        raise InputError("Equivalent historical save requests disagree on the selected definition")
                reconstructed = ws.compose_report(saved["id"], saved["revision"], definition)
                encoded = canonical(reconstructed)
                selected_report = extracted / "reports" / str(saved["revision"]) / "report.json"
                if (encoded != selected_report.read_bytes() or
                    saved["report"] != {"bytes": len(encoded), "sha256": sha(encoded),
                        "editions": [{"id": item["edition"], "counts": item["counts"]} for item in reconstructed["editions"]]}):
                    raise InputError("Full source/rules/decisions do not reconstruct the complete original report")
                form = ws.questionnaire(ws.edition(saved["editions"][0])["questionnaire"])
                outputs = report_files(saved, reconstructed, form, temp / ("recomputed-" + str(saved["revision"])))
                for name, member in outputs.items():
                    relative = "reports/" + str(saved["revision"]) + "/" + name
                    if checked_size(member) != inspection["manifest"]["files"][relative]:
                        raise InputError("Full offline/CSV/report output differs on independent receiving: " + name)
                validated_reports.append((ws._report_path(saved["id"], saved["revision"]), selected_report,
                                          {"bytes": len(encoded), "sha256": sha(encoded)}))
            # No final report file is reserved by an invalid later history member.
            # Every native request, report, HTML and CSV has now been reconstructed.
            for report_path, staged_report, expected_report in validated_reports:
                if checked_size(staged_report, META_LIMIT) != expected_report:
                    raise InputError("Verified historical report changed before final publication")
                report_body = staged_report.read_bytes()
                if {"bytes": len(report_body), "sha256": sha(report_body)} != expected_report:
                    raise InputError("Complete historical report readback changed")
                publish(report_path, report_body)
                del report_body
            # Every complete report and original request is proven before publishing any review revision.
            for saved in history:
                ws.db.execute("INSERT OR IGNORE INTO hila_reviews VALUES(?,?,?)",
                              (saved["id"], saved["revision"], canonical(saved).decode()))
            for item in doc["requests"]:
                ws.db.execute("INSERT OR IGNORE INTO hila_requests VALUES(?,?,?,?,?)",
                              (item["id"], item["kind"], item["inputSha256"],
                               canonical(item["input"]).decode(), canonical(item["result"]).decode()))
            for item in receiving:
                ws.db.execute("INSERT OR REPLACE INTO hila_receiving_builds VALUES(?,?)",
                              (item["edition"], canonical(item["build"]).decode()))
        for edition in doc["editions"]:
            incoming = extracted / "native" / (edition["id"] + ".zip")
            retained = ws.root / "packet-cache" / ("native-" + edition["build"]["id"] + ".zip")
            if retained.exists():
                _verify_native(retained, edition)
            else:
                copy_complete(incoming, retained)
        key = _cache_key(view, history, PACKET)
        retained = ws.root / "packet-cache" / (key + ".zip")
        if retained.exists():
            _validate_cached(ws, retained, view, history)
        else:
            copy_complete(path, retained, {key: inspection[key] for key in ("bytes", "sha256")})
        return {"review": ws.review(view["id"], view["revision"]), "reconstructed": True,
                "currentRevision": ws.review(view["id"])["revision"], "receivingBuilds": receiving,
                "packet": {key: inspection[key] for key in ("bytes", "sha256")}}
