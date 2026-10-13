"""MIT. Preserve one complete HILA runtime and operated review as a private customer ZIP."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tempfile
import zipfile

SCHEMA = "stellar-forge.hila-customer-handover.v1"
LIMIT = 4 * 1024 * 1024 * 1024
META = 64 * 1024 * 1024
HEX = re.compile(r"[a-f0-9]{64}\Z")
COMMIT = re.compile(r"[a-f0-9]{40}\Z")


def need(value, message):
    if not value:
        raise ValueError(message)


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode()


def digest(body):
    return hashlib.sha256(body).hexdigest()


def absolute(value):
    need(isinstance(value, str) and value.startswith("/") and "\0" not in value,
         "Select a complete absolute original path")
    path = Path(value)
    need(str(path) == value and path.resolve() == path, "Select an original path without links or traversal")
    return path


def private_directory(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    info = path.lstat()
    need(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode) and path.resolve() == path,
         "Keep the original real output directory")
    need(info.st_uid == os.getuid() and not stat.S_IMODE(info.st_mode) & 0o077,
         "Keep the original output directory private and operator-owned")


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def exists(path):
    try:
        path.lstat()
        return True
    except FileNotFoundError:
        return False


def signature(value):
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns)


@contextmanager
def original_file(path, maximum=LIMIT):
    path = absolute(str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and 0 <= before.st_size <= maximum,
             "Select a complete bounded regular original file: " + str(path))
        with os.fdopen(fd, "rb", closefd=False) as stream:
            yield stream, before
        after, named = os.fstat(fd), path.lstat()
        need(signature(before) == signature(after) and before.st_dev == named.st_dev and before.st_ino == named.st_ino,
             "An original selected file changed during full reading: " + str(path))
    finally:
        os.close(fd)


def identity(path):
    total, hashed = 0, hashlib.sha256()
    with original_file(path) as (stream, first):
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            total += len(block)
            hashed.update(block)
        need(total == first.st_size, "An original file returned incomplete bytes")
    return {"bytes": total, "sha256": hashed.hexdigest()}


def descriptor(value):
    need(isinstance(value, dict) and {"path", "bytes", "sha256"} <= set(value),
         "Use a complete original file descriptor")
    need(type(value["bytes"]) is int and 0 <= value["bytes"] <= LIMIT and HEX.fullmatch(value["sha256"]),
         "Use a bounded full byte/SHA identity")
    path = absolute(value["path"])
    need(identity(path) == {key: value[key] for key in ("bytes", "sha256")},
         "Complete original file identity changed: " + str(path))
    return path


def read_json(path):
    with original_file(path, META) as (stream, _):
        value = json.loads(stream.read().decode("utf-8"), parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
    encoded(value)
    return value


def atomic(path, body, immutable=False):
    private_directory(path.parent)
    if immutable and exists(path):
        with original_file(path, META) as (stream, _):
            need(stream.read() == body, "The original retained complete record changed: " + str(path))
        return path
    fd, temporary = tempfile.mkstemp(prefix=".hila-handover-", suffix=".partial", dir=path.parent)
    temporary = Path(temporary)
    with os.fdopen(fd, "wb") as stream:
        stream.write(body)
        stream.flush()
        os.fsync(stream.fileno())
    with original_file(temporary, META) as (stream, _):
        need(stream.read() == body, "The original complete publication stage changed")
    os.replace(temporary, path)
    sync_dir(path.parent)
    return path


@contextmanager
def output_lease(output):
    private_directory(output.parent)
    name = hashlib.sha256(output.name.encode()).hexdigest()
    directory = output.parent / (".hila-customer-output-" + name)
    private_directory(directory)
    lock = directory / "writer.lock"
    fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_nlink == 1,
             "Retain the original permanent output lease")
        fcntl.flock(fd, fcntl.LOCK_EX)
        named = lock.lstat()
        need(info.st_dev == named.st_dev and info.st_ino == named.st_ino, "Original output lease identity changed")
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def member_name(value):
    need(isinstance(value, str) and value and len(value) <= 240 and "\\" not in value and "\0" not in value,
         "Use a complete plain ZIP member name")
    name = PurePosixPath(value)
    need(not name.is_absolute() and str(name) == value and all(x not in {"", ".", ".."} for x in name.parts),
         "ZIP member traversal is not allowed")
    need(all(ord(x) >= 32 and ord(x) != 127 for x in value), "ZIP member names must be readable")
    return value


def chosen_files(raw):
    need(isinstance(raw, dict) and raw.get("schema") == SCHEMA, "Use the full original HILA handover input")
    need(isinstance(raw.get("operationId"), str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,139}", raw["operationId"]),
         "Retain one original operation identity")
    need(COMMIT.fullmatch(raw.get("sourceCommit", "")), "Retain the exact selected source commit")
    output = absolute(raw["output"])
    need(output.suffix.lower() == ".zip", "Select the complete customer ZIP")
    core_path, operator_path, runtime_path = [descriptor(raw[key]) for key in ("coreResult", "operatorResult", "runtimeResult")]
    core, operator, runtime = [read_json(path) for path in (core_path, operator_path, runtime_path)]
    need(core.get("schema") == "stellar-forge.hila-native-receiving-result.v1" and core.get("state") == "COMPLETE",
         "Select the completed original core receiving")
    need(operator.get("schema") == "stellar-forge.hila-operator-receiving.v1" and operator.get("state") == "COMPLETE",
         "Select the completed installed operator receiving")
    need(runtime.get("schema") == "stellar-forge.hila-runtime-ready.v1" and runtime.get("state") == "READY",
         "Select the actual original READY runtime")
    need(operator["coreResult"] == raw["coreResult"] and operator["source"]["original"] == core["sourceReview"],
         "The operator did not continue the selected complete core case")
    need(runtime["sourceCommit"] == raw["sourceCommit"] == operator["runtime"]["sourceCommit"] and
         runtime["sourceManifestSha256"] == operator["runtime"]["sourceManifestSha256"],
         "The complete runtime/source authority differs")
    need(operator["runtime"]["installationId"] == runtime["installationId"] and
         operator["runtime"]["profileId"] == runtime["profileId"], "The actual selected runtime installation changed")
    expected_checks = {"originalQuestionnaire", "completeNativeEditions", "sameUiRequest", "typedClient", "installedCli",
                       "fullDownloads", "independentReceiving", "olderPacketPreservesLocal", "coldReopen", "applicationsStopped"}
    need(set(operator["checks"]) == expected_checks and all(operator["checks"][key] is True for key in expected_checks),
         "Complete every selected original operator check before handover")
    need(len(operator["applications"]) == 2 and all(row["phase"] == "STOPPED" for row in operator["applications"]),
         "Both original Applications must complete Stop")
    files, by_name = [], {}

    def add(name, path, wanted):
        name = member_name(name)
        need(name not in by_name and name.casefold() not in {x.casefold() for x in by_name},
             "A complete handover member is selected more than once")
        path = descriptor({"path": str(path), "bytes": wanted["bytes"], "sha256": wanted["sha256"]})
        need(path not in {output, output.parent / "result.json", output.parent / "input.json"},
             "The output would overlap an original selected file")
        value = {"name": name, "path": str(path), "bytes": wanted["bytes"], "sha256": wanted["sha256"]}
        files.append(value)
        by_name[name] = value

    core_root = core_path.parent
    core_files = core["files"]
    for name, wanted in core_files.items():
        member_name(name)
        descriptor({"path": str(core_root / name), **wanted})
    add("engineering/HILA_Complete_Engineering_Receiving.zip",
        core_root / "HILA_Complete_Engineering_Receiving.zip", core_files["HILA_Complete_Engineering_Receiving.zip"])
    add("reviews/core-revision-" + str(core["sourceReview"]["revision"]) + ".zip",
        core_root / "hila-complete-history.zip", core_files["hila-complete-history.zip"])
    add("originals/SYNTHETIC_INPUT_NOTICE.txt", core_root / "SYNTHETIC_INPUT_NOTICE.txt", core_files["SYNTHETIC_INPUT_NOTICE.txt"])
    for name, wanted in core_files.items():
        if name.startswith("originals/") or name.startswith("merchant-datasets/"):
            add(name, core_root / name, wanted)
    required_datasets = {"merchant-datasets/round-" + str(index) + "/" + member
                         for index in (1, 2) for member in ("data.csv", "dataset.json", "hila-lineage.json")}
    need(required_datasets <= set(by_name), "Retain both complete original merchant datasets")
    need({"originals/questionnaire.xml", "originals/questionnaire-catalogue.json",
          "originals/questionnaire-acquisition.json", "originals/synthetic-methodology.json",
          "originals/mapping-round-1.json", "originals/mapping-round-2.json"} <= set(by_name),
         "Retain the complete source, translations, mapping, scoring and permission history")

    source_files = {}
    for file in operator["files"]:
        member_name(file["name"])
        need(file["name"] not in source_files, "The complete operator output contains duplicate names")
        descriptor(file)
        source_files[file["name"]] = file
    names = {
        "downloads/source-review.zip": "reviews/operated-source-complete-history.zip",
        "downloads/received-complete-history.zip": "reviews/received-complete-history.zip",
        "downloads/source-report.zip": "reports/source/private-report.zip",
        "downloads/source-public.zip": "reports/source/public-aggregates.zip",
        "downloads/source-report.html": "reports/source/report.html",
        "observations/source-reviewed-report.json": "reports/source/report.json",
        "downloads/received-private-report.zip": "reports/received/private-report.zip",
        "downloads/received-public-aggregates.zip": "reports/received/public-aggregates.zip",
        "downloads/received-report.html": "reports/received/report.html",
        "observations/received-local-report.json": "reports/received/report.json",
        "observations/recipient-history.json": "reviews/received-history.json",
    }
    for selected, name in names.items():
        need(selected in source_files, "The complete final operator output is missing: " + selected)
        file = source_files[selected]
        add(name, file["path"], file)
    source_report = read_json(Path(source_files["observations/source-reviewed-report.json"]["path"]))
    received_report = read_json(Path(source_files["observations/received-local-report.json"]["path"]))
    for report, review in ((source_report, operator["source"]["reviewed"]), (received_report, operator["received"]["review"])):
        need(report["reviewId"] == review["id"] and report["revision"] == review["revision"] and
             report["definitionSha256"] == review["definitionSha256"], "The full final report selects another review")
    need(source_report["editions"] == received_report["editions"] and
         source_report["comparison"] == received_report["comparison"], "The final recipient changed original reported source results")

    archive = absolute(runtime["distribution"]["archive"])
    archive_identity = identity(archive)
    need(archive_identity["sha256"] == runtime["distribution"]["sha256"], "The original distribution archive changed")
    add("runtime/" + archive.name, archive, archive_identity)
    guides = raw.get("guides")
    need(isinstance(guides, list) and 4 <= len(guides) <= 64, "Retain the complete public operating guides")
    for guide in guides:
        need(isinstance(guide, dict) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.md", guide.get("name", "")),
             "Guide names must be plain Markdown filenames")
        add("guides/" + guide["name"], guide["path"], guide)
    need(sum(file["bytes"] for file in files) <= LIMIT, "The complete selected customer source exceeds 4 GiB")
    safe_runtime = {key: operator["runtime"][key] for key in (
        "installationId", "profileId", "profileSha256", "lockSha256", "sourceCommit", "sourceManifestSha256", "dependencyCount")}
    summary = {
        "schema": SCHEMA, "operationId": raw["operationId"], "sourceCommit": raw["sourceCommit"],
        "notice": core["notice"], "questionnaire": core["questionnaire"], "editions": core["editions"],
        "runtime": safe_runtime, "sourceReview": operator["source"]["reviewed"],
        "receivedReview": operator["received"]["review"], "historyRevisions": operator["received"]["historyRevisions"],
        "counts": [edition["counts"] for edition in received_report["editions"]],
        "checks": operator["checks"], "actor": operator["actor"],
        "sourceOperation": core["operationId"], "operatorOperation": operator["operationId"],
        "inputIdentities": {key: {field: raw[key][field] for field in ("bytes", "sha256")}
                            for key in ("coreResult", "operatorResult", "runtimeResult")},
    }
    return output, files, summary


def supporting_files(summary, files):
    notice = """# HILA source and use

This is the complete private engineering handover for the source-selected HILA round-review product.

The questionnaire is the actual original public HILA XForm, including all four languages, all five dimensions and all 46 agreement items. The original acquisition record retains its public URL, retrieval time, byte identity and permission status. The public response supplied no questionnaire redistribution licence. Keep the original co-lead terms and obtain the necessary permission before distributing that questionnaire beyond its authorized private use.

The two response editions and score/disclosure configuration are explicitly synthetic engineering fixtures. Their arithmetic demonstrates the implemented method and its receiving behavior. They are not HILA survey respondents, official HILA scores or customer findings. Official composite scoring, weights, missingness and disclosure thresholds remain supplied and approved inputs.

Private report packages include original source definitions and coded analysis data. Use reports/*/public-aggregates.zip for the selected aggregate-only output. Publishing a private review packet or individual coded rows requires its own approved disclosure decision.

The runtime archive is retained byte-for-byte from the original source-selection builder and installer. The guides describe installation, operation, independent receiving and continuation. Every customer file is recorded in manifest.json with its complete byte count and SHA-256.
"""
    contents = [
        "# Complete HILA round-review handover", "",
        summary["notice"], "",
        "Source commit: " + summary["sourceCommit"] + ".",
        "Operated source review: revision " + str(summary["sourceReview"]["revision"]) + ".",
        "Independent recipient: revision " + str(summary["receivedReview"]["revision"]) +
        ", with all " + str(summary["historyRevisions"]) + " saved revisions retained.", "",
        "Open reports/received/report.html for the complete offline report. Its register, filters, source details and review-update download work without network access.",
        "Use reviews/received-complete-history.zip for complete native receiving. Both complete original merchant datasets are under merchant-datasets/.",
        "Use the unchanged archive under runtime/ with the original installer described in the operating guides.",
        "Read SOURCE_AND_USE.md and originals/SYNTHETIC_INPUT_NOTICE.txt before interpreting or sharing the engineering data.", "",
        "## Complete files", "", "| File | Bytes | SHA-256 |", "| --- | ---: | --- |",
    ]
    for file in sorted(files, key=lambda x: x["name"]):
        contents.append("| " + file["name"] + " | " + str(file["bytes"]) + " | " + file["sha256"] + " |")
    contents.append("")
    return {"summary.json": encoded(summary), "SOURCE_AND_USE.md": notice.encode(),
            "CONTENTS.md": "\n".join(contents).encode()}


def info(name):
    item = zipfile.ZipInfo(member_name(name), (1980, 1, 1, 0, 0, 0))
    item.create_system = 3
    item.external_attr = (stat.S_IFREG | 0o600) << 16
    item.compress_type = zipfile.ZIP_DEFLATED
    return item


def verify_archive(path, manifest):
    wanted = {file["name"]: file for file in manifest["files"]}
    need(len(wanted) == len(manifest["files"]), "Manifest member names differ")
    expected_manifest = encoded(manifest)
    with original_file(path) as (stream, _):
        with zipfile.ZipFile(stream) as archive:
            members = archive.infolist()
            need(len(members) == len(wanted) + 1 and {item.filename for item in members} == set(wanted) | {"manifest.json"},
                 "The complete customer archive has a different member selection")
            for item in members:
                member_name(item.filename)
                need(not item.is_dir() and stat.S_IFMT(item.external_attr >> 16) == stat.S_IFREG and
                     not item.flag_bits & 1, "Retain only complete regular unencrypted ZIP members")
                if item.filename == "manifest.json":
                    need(item.file_size == len(expected_manifest) and archive.read(item) == expected_manifest,
                         "The complete archive manifest changed")
                    continue
                selected = wanted[item.filename]
                need(item.file_size == selected["bytes"], "A complete archive member size changed")
                total, hashed = 0, hashlib.sha256()
                with archive.open(item) as member:
                    for block in iter(lambda: member.read(1024 * 1024), b""):
                        total += len(block)
                        need(total <= selected["bytes"], "An archive member exceeds its original selected bytes")
                        hashed.update(block)
                need(total == selected["bytes"] and hashed.hexdigest() == selected["sha256"],
                     "A complete archive member changed: " + item.filename)
    return identity(path)


def handover(raw):
    output = absolute(raw["output"])
    with output_lease(output):
        output, files, summary = chosen_files(raw)
        atomic(output.parent / "input.json", encoded(raw), immutable=True)
        generated = supporting_files(summary, files)
        selected = [{"name": file["name"], "bytes": file["bytes"], "sha256": file["sha256"]} for file in files]
        selected.extend({"name": name, "bytes": len(body), "sha256": digest(body)} for name, body in generated.items())
        manifest = {"schema": "stellar-forge.hila-customer-files.v1", "operationId": raw["operationId"],
                    "sourceCommit": raw["sourceCommit"], "files": sorted(selected, key=lambda x: x["name"])}
        expected = {"schema": SCHEMA, "operationId": raw["operationId"], "sourceCommit": raw["sourceCommit"],
                    "selectionSha256": digest(encoded(manifest)), "output": str(output)}
        prior = read_json(output.parent / "result.json") if exists(output.parent / "result.json") else None
        if prior:
            need(all(prior.get(key) == value for key, value in expected.items()) and prior.get("state") == "COMPLETE",
                 "The original completed handover receipt changed")
            actual = verify_archive(output, manifest)
            need(all(prior[key] == actual[key] for key in ("bytes", "sha256")), "The completed customer archive changed")
            return {**prior, "reused": True}
        reused = exists(output)
        if reused:
            actual = verify_archive(output, manifest)
        else:
            fd, temporary = tempfile.mkstemp(prefix=".hila-customer-", suffix=".partial", dir=output.parent)
            staged = Path(temporary)
            with os.fdopen(fd, "w+b") as stream:
                with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9, allowZip64=True) as archive:
                    for file in sorted(files, key=lambda x: x["name"]):
                        total, hashed = 0, hashlib.sha256()
                        with original_file(Path(file["path"])) as (source, _):
                            with archive.open(info(file["name"]), "w", force_zip64=True) as member:
                                for block in iter(lambda: source.read(1024 * 1024), b""):
                                    member.write(block)
                                    total += len(block)
                                    hashed.update(block)
                        need(total == file["bytes"] and hashed.hexdigest() == file["sha256"],
                             "The original selected source changed while packaging: " + file["name"])
                    for name, body in sorted(generated.items()):
                        archive.writestr(info(name), body)
                    archive.writestr(info("manifest.json"), encoded(manifest))
                stream.flush()
                os.fsync(stream.fileno())
            actual = verify_archive(staged, manifest)
            need(actual["bytes"] <= LIMIT, "The complete customer ZIP exceeds the 4 GiB transfer bound")
            os.link(staged, output, follow_symlinks=False)
            sync_dir(output.parent)
            staged.unlink()
            sync_dir(output.parent)
            need(identity(output) == actual, "The fully published customer archive changed")
        result = {**expected, "state": "COMPLETE", **actual, "files": len(manifest["files"]) + 1,
                  "sourceReview": summary["sourceReview"], "receivedReview": summary["receivedReview"],
                  "completedAt": datetime.now(timezone.utc).isoformat(), "reused": reused}
        atomic(output.parent / "result.json", encoded(result), immutable=True)
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Package the complete original installed HILA customer handover")
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    selected = read_json(absolute(args.input))
    print(json.dumps(handover(selected), ensure_ascii=False, sort_keys=True, indent=2))
