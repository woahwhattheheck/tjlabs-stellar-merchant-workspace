"""Run and retain the original customer receiving programme after source composition."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import importlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tempfile
import zipfile

from continue_review_customer import (
    OPERATION, CONTINUATION, ACCEPTED, ACCEPTED_OUTPUTS, PYTHON, PINNED,
    build_customer, checked_row, copy_exact, directory, encoded, identity,
    module, now, publish_bytes, publish_json, read_json, relative, sync,
)

PROGRAMME_SCHEMA = "commons.scf-original-customer-programme.v1"
LIBRARY_MODULES = ("native_library_delivery.py", "native_library_requests.py")
LIBRARY_HELPERS = ("library_upload.py", "library_hosted_apps.py", "library_file_transfer.py")
ORIGINAL_VIEWS = {
    "edition-review-1440.png", "edition-review-390.png",
    "returned-journal-conflict-1440.png", "returned-journal-conflict-390.png",
    "returned-journal-applied-1440.png", "returned-journal-applied-390.png",
    "independent-receiving-edit-1440.png", "independent-receiving-edit-390.png",
    "incoming-review-return-1440.png", "incoming-review-return-390.png",
    "complete-review-report-1440.png", "complete-review-report-390.png",
}


def canonical_directory(path):
    path = Path(path)
    if not path.is_absolute() or path.resolve(strict=True) != path or not path.is_dir():
        raise ValueError("An existing canonical runtime directory is required: " + str(path))
    return path


def helper_sources(host, helpers):
    return {"host": {name: identity(host / name) for name in LIBRARY_MODULES},
            "helpers": {name: identity(helpers / name) for name in LIBRARY_HELPERS}}


def verify_programme(plan):
    if (plan.get("schema") != PROGRAMME_SCHEMA or plan.get("operation_id") != OPERATION
            or not isinstance(plan.get("argv"), list) or not plan["argv"]
            or any(not isinstance(x, str) or not x or "\x00" in x for x in plan["argv"])):
        raise ValueError("Use the captured original B41A customer programme and argument array")
    if not plan.get("source_files") or not isinstance(plan["source_files"], list):
        raise ValueError("Retain the full source identities of the original receiving programme")
    seen = set()
    for row in plan["source_files"]:
        path = Path(row["path"])
        if str(path) in seen or identity(path) != checked_row(row):
            raise ValueError("The selected original programme source differs: " + str(path))
        seen.add(str(path))
    if not isinstance(plan.get("portable_reports"), list) or not plan["portable_reports"]:
        raise ValueError("Select the original programme's complete portable report outputs")
    if not isinstance(plan.get("outputs", []), list):
        raise ValueError("The original retained receiving outputs must be an explicit file selection")
    return plan


def replacements(args, work):
    installed = work / "installed" / "customer-review"
    return {
        "@@WORK@@": str(work / "receiving"),
        "@@CUSTOMER@@": str(installed),
        "@@SOURCE@@": str(installed / "source"),
        "@@PYTHON_SOURCE@@": str(installed / "source" / PYTHON),
        "@@RETAINED_OUTPUTS@@": str(work / "retained-outputs"),
        "@@ACCEPTED_CUSTOMER@@": str(work / "accepted-customer"),
        "@@PYTHON@@": str(Path(sys.executable).resolve(strict=True)),
        "@@NODE@@": str(args.node),
        "@@CHROMIUM@@": str(args.chromium),
        "@@PLAYWRIGHT_ROOT@@": str(args.playwright_root),
        "@@OPERATION@@": OPERATION,
        "@@CONTINUATION@@": CONTINUATION,
    }


def expand(value, mapping):
    if not isinstance(value, str):
        raise ValueError("An original command field must be text")
    for token, actual in mapping.items():
        value = value.replace(token, actual)
    if re.search(r"@@[A-Z_]+@@", value):
        raise ValueError("An original command contains an unknown continuation path token")
    return value


def selected_output(value, mapping, receiving):
    path = Path(expand(value, mapping))
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise ValueError("An original receiving output must be a canonical absolute path")
    path.relative_to(receiving)
    identity(path)
    return path


def runtime_observation(args):
    versions = {}
    for name, argv in (("python", [sys.executable, "--version"]),
                       ("node", [str(args.node), "--version"]),
                       ("chromium", [str(args.chromium), "--version"])):
        completed = subprocess.run(argv, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   timeout=20, check=True)
        versions[name] = (completed.stdout or completed.stderr).strip()
    node_match = re.search(r"v?(\d+)\.(\d+)", versions["node"])
    if node_match is None or tuple(map(int, node_match.groups())) < (22, 16):
        raise ValueError("The installed customer runtime requires Node 22.16 or newer")
    playwright = args.playwright_root / "playwright" / "index.js"
    if not playwright.is_file():
        raise ValueError("Select the existing Playwright module root containing playwright/index.js")
    return {"versions": versions, "python": identity(Path(sys.executable).resolve(strict=True)),
            "node": identity(args.node), "chromium": identity(args.chromium),
            "playwright": identity(playwright.resolve(strict=True))}


def bind(args, work, receiver_path):
    canonical_directory(args.playwright_root)
    canonical_directory(args.library_host)
    canonical_directory(args.library_helpers)
    plan = verify_programme(read_json(args.programme))
    mapping = replacements(args, work)
    receiving = directory(work / "receiving")
    runtime = runtime_observation(args)
    selected = {
        "schema": "commons.scf-customer-continuation-intent.v1",
        "operation_id": OPERATION, "continuation_id": CONTINUATION,
        "accepted_archive": {"path": str(args.customer_zip), **identity(args.customer_zip)},
        "retained_outputs_archive": {"path": str(args.retained_outputs_zip), **identity(args.retained_outputs_zip)},
        "programme": {"path": str(args.programme), **identity(args.programme)},
        "programme_source": plan["source_files"],
        "argv": [expand(value, mapping) for value in plan["argv"]],
        "cwd": expand(plan["cwd"], mapping),
        "result": expand(plan["result"], mapping),
        "runtime": runtime,
        "library": {"host": str(args.library_host), "helpers": str(args.library_helpers),
                    "sources": helper_sources(args.library_host, args.library_helpers)},
        "implementation": {
            "continue_review_customer.py": identity(receiver_path.with_name("continue_review_customer.py")),
            "review_continuation_receiving.py": identity(receiver_path),
            "installers": {name: identity(args.delivery_python.resolve(strict=True) / name) for name in PINNED},
        },
    }
    if selected["accepted_archive"] != {"path": str(args.customer_zip), **ACCEPTED}:
        raise ValueError("Continue the exact accepted complete customer package")
    if selected["retained_outputs_archive"] != {"path": str(args.retained_outputs_zip), **ACCEPTED_OUTPUTS}:
        raise ValueError("Continue the exact accepted retained review state and outputs")
    if not any(str(work / "installed" / "customer-review") in value for value in selected["argv"]):
        raise ValueError("The original receiving command must explicitly select the installed customer source")
    result_path = Path(selected["result"])
    if not result_path.is_absolute():
        raise ValueError("The receiving programme result path must be absolute")
    result_path.relative_to(receiving)
    publish_json(work / "intent.json", selected)
    return selected


def receiving_result(path, plan, mapping, receiving):
    result = read_json(path)
    if result.get("schema") == "commons.scf-complete-receiving.v2":
        if result.get("operation_id") != OPERATION:
            raise ValueError("The receiving result belongs to another original programme")
        browser = result.get("browser", {})
    elif result.get("schema") == "commons.scf-complete-customer-browser.v1":
        browser = result
    else:
        raise ValueError("The original complete receiving result schema is required")
    if browser.get("state") != "completed":
        raise ValueError("The original customer browser programme has not completed")
    if browser.get("pageErrors") != [] or browser.get("consoleErrors") != []:
        raise ValueError("The original programme returned browser errors")
    names = browser.get("screenshots", [])
    if not isinstance(names, list) or len(names) != len(set(names)) or not ORIGINAL_VIEWS.issubset(names):
        raise ValueError("The original twelve customer views are incomplete")
    capture_directory = Path(expand(plan["screenshots_directory"], mapping))
    if not capture_directory.is_absolute():
        raise ValueError("The captured browser directory must be absolute")
    capture_directory.relative_to(receiving)
    captures = []
    for name in names:
        path = selected_output(str(capture_directory / relative(name)), mapping, receiving)
        captures.append({"name": "views/" + name, "source": str(path), **identity(path)})
    required_steps = {"review-original-conflict-apply-export",
                      "independent-source-absent-receiving-edit-reopen",
                      "original-incoming-review-browser"}
    if not required_steps.issubset({row.get("step") for row in browser.get("steps", [])}):
        raise ValueError("The original receiving and independent reopening steps are incomplete")
    widths = {row.get("width") for row in browser.get("layouts", [])}
    if not {1440, 390}.issubset(widths):
        raise ValueError("The original desktop and phone receiving views are incomplete")
    for row in browser.get("layouts", []):
        if any(row.get(field, 0) > row.get("viewport", 0) + 1 for field in ("document", "body")):
            raise ValueError("A recorded customer screen exceeds its viewport")
    return result, captures



def complete_outputs(result_path, plan, mapping, receiving):
    """Adopt only the original programme's entire selected completed output set."""
    result, captures = receiving_result(result_path, plan, mapping, receiving)
    outputs = []
    for row in plan.get("outputs", []):
        name = str(relative(row["name"]))
        path = selected_output(row["path"], mapping, receiving)
        outputs.append({"name": name, "source": str(path), **identity(path)})
    report_paths = [selected_output(value, mapping, receiving) for value in plan["portable_reports"]]
    if any(path.suffix.lower() not in {".json", ".html", ".csv"} for path in report_paths):
        raise ValueError("Keep the original complete portable JSON, HTML and CSV report formats")
    if not {".json", ".html"}.issubset({path.suffix.lower() for path in report_paths}):
        raise ValueError("The complete current journal requires its JSON and readable HTML exports")
    names = [row["name"] for row in outputs]
    if len(names) != len(set(names)):
        raise ValueError("The original receiving outputs repeat a selected archive name")
    reports = [{"source": str(path), **identity(path)} for path in report_paths]
    return result, captures, outputs, reports

def run_original(args, work, intent, context, lock_fd):
    if identity(args.programme) != {k: intent["programme"][k] for k in ("bytes", "sha256")}:
        raise ValueError("Resume the originally captured receiving command and output selection")
    plan = verify_programme(read_json(args.programme))
    mapping = replacements(args, work)
    receiving = work / "receiving"
    receipt_path = work / "receiving-completed.json"
    source_binding = {"intent_sha256": identity(work / "intent.json")["sha256"],
                      "installed_input": context["record"]["package"],
                      "source_manifest": context["record"]["source_manifest"]}
    if receipt_path.exists():
        retained = read_json(receipt_path)
        if retained.get("binding") != source_binding:
            raise ValueError("The retained receiving belongs to another installed customer")
        result_path = Path(intent["result"])
        if identity(result_path) != retained["result"]:
            raise ValueError("The original completed receiving result changed")
        result, captures, outputs, reports = complete_outputs(result_path, plan, mapping, receiving)
        if outputs != retained["outputs"] or reports != retained["portable_reports"] or captures != retained["captures"]:
            raise ValueError("The complete retained receiving output selection changed")
        for row in retained["outputs"] + retained["portable_reports"] + retained["captures"]:
            if identity(Path(row["source"])) != checked_row(row):
                raise ValueError("A retained complete receiving output changed")
        return retained, result, captures
    cwd = canonical_directory(Path(intent["cwd"]))
    result_path = Path(intent["result"])
    started_path = work / "receiving-started.json"
    if started_path.exists():
        started = read_json(started_path)
        if started.get("binding") != source_binding:
            raise ValueError("The original in-flight receiving belongs to another installed customer")
    else:
        if result_path.exists() or result_path.is_symlink():
            raise ValueError("An unbound receiving result already occupies the original output path")
        started = {"schema": "commons.scf-customer-receiving-started.v1",
                   "operation_id": OPERATION, "started_at": now(), "binding": source_binding,
                   "argv": intent["argv"], "cwd": str(cwd)}
        publish_json(started_path, started)
    # A known terminal failure follows the original retry/repair path, even if
    # an earlier stage wrote the browser result before the process failed.
    observed_failure = False
    process_result_path = work / "receiving-process-result.json"
    if process_result_path.exists():
        process_result = read_json(process_result_path)
        if process_result.get("binding") != source_binding or type(process_result.get("returncode")) is not int:
            raise ValueError("The retained receiving process result belongs to another original attempt")
        observed_failure = process_result["returncode"] != 0
    # Lost-parent recovery adopts only the complete selected set: browser result,
    # captures, portable reports and operating outputs. A missing final file must
    # return to the original programme rather than repeatedly skipping it.
    complete = False
    if result_path.exists() and not observed_failure:
        try:
            complete_outputs(result_path, plan, mapping, receiving)
            complete = True
        except (OSError, ValueError, KeyError, TypeError):
            complete = False
    if not complete:
        env = os.environ.copy()
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        env["NODE_PATH"] = str(args.playwright_root)
        env["SCF_CUSTOMER_CONTINUATION_WORK"] = str(receiving)
        env["SCF_CUSTOMER_CONTINUATION_SOURCE"] = str(context["installed"] / "source")
        env["SCF_CUSTOMER_CHROMIUM"] = str(args.chromium)
        env["SCF_CUSTOMER_PYTHON"] = str(Path(sys.executable).resolve(strict=True))
        env["SCF_CUSTOMER_RETAINED_OUTPUTS"] = str(context["retained_outputs"])
        env["SCF_CUSTOMER_ACCEPTED"] = str(context["accepted_customer"])
        prior_signals = {}
        child = None
        def forward(signum, _frame):
            if child is not None and child.poll() is None:
                child.send_signal(signum)
        try:
            for signum in (signal.SIGINT, signal.SIGTERM):
                prior_signals[signum] = signal.signal(signum, forward)
            with (work / "receiving.stdout.log").open("ab") as out, (work / "receiving.stderr.log").open("ab") as err:
                child = subprocess.Popen(intent["argv"], cwd=cwd, env=env, stdout=out, stderr=err,
                                         pass_fds=(lock_fd,))
                publish_json(work / "receiving-process.json",
                             {"operation_id": OPERATION, "pid": child.pid, "started_at": now(),
                              "binding": source_binding}, replace=True)
                code = child.wait()
            publish_json(work / "receiving-process-result.json",
                         {"operation_id": OPERATION, "pid": child.pid, "returncode": code,
                          "finished_at": now(), "binding": source_binding}, replace=True)
            if code:
                raise RuntimeError("The original receiving programme returned " + str(code)
                                   + "; its outputs and original request remain in " + str(receiving))
        finally:
            for signum, handler in prior_signals.items():
                signal.signal(signum, handler)
    result, captures, outputs, reports = complete_outputs(result_path, plan, mapping, receiving)
    retained = {"schema": "commons.scf-customer-receiving-completed.v1",
                "operation_id": OPERATION, "continuation_id": CONTINUATION, "completed_at": now(),
                "binding": source_binding, "result": identity(result_path), "captures": captures,
                "outputs": outputs,
                "portable_reports": reports}
    publish_json(receipt_path, retained)
    return retained, result, captures


def verified_archive(path, selection):
    expected = {row["name"]: row for row in selection["members"]}
    if len(expected) != len(selection["members"]) or "DELIVERY.json" in expected:
        raise ValueError("The complete archive selection repeats a member")
    raw = encoded(selection)
    with zipfile.ZipFile(path) as archive:
        if set(archive.namelist()) != set(expected) | {"DELIVERY.json"} or len(archive.namelist()) != len(expected) + 1:
            raise ValueError("The retained archive has a different complete member selection")
        if archive.read("DELIVERY.json") != raw:
            raise ValueError("The retained archive belongs to another delivery selection")
        for name, row in expected.items():
            value, count = hashlib.sha256(), 0
            with archive.open(name) as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    value.update(chunk)
                    count += len(chunk)
            if {"bytes": count, "sha256": value.hexdigest()} != checked_row(row):
                raise ValueError("A complete retained archive member differs: " + name)
    return identity(path)


def write_archive(path, members, *, kind, binding):
    for row in members:
        relative(row["name"])
        if identity(Path(row["source"])) != checked_row(row):
            raise ValueError("A selected complete archive source changed")
    selection = {"schema": "commons.scf-customer-artifact-selection.v1", "kind": kind,
                 "operation_id": OPERATION, "continuation_id": CONTINUATION,
                 "binding": binding, "members": members}
    if path.exists() or path.is_symlink():
        identity(path)
        return {"path": str(path), **verified_archive(path, selection)}
    directory(path.parent)
    fd, name = tempfile.mkstemp(prefix=".complete-customer-", dir=path.parent)
    stage = Path(name)
    try:
        with os.fdopen(fd, "w+b") as stream:
            with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                def info(name):
                    entry = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
                    entry.create_system = 3
                    entry.external_attr = (stat.S_IFREG | 0o644) << 16
                    entry.compress_type = zipfile.ZIP_DEFLATED
                    return entry
                archive.writestr(info("DELIVERY.json"), encoded(selection))
                for row in members:
                    path_source = Path(row["source"])
                    with path_source.open("rb") as inp, archive.open(info(row["name"]), "w", force_zip64=True) as out:
                        while True:
                            chunk = inp.read(1024 * 1024)
                            if not chunk:
                                break
                            out.write(chunk)
                    if identity(path_source) != checked_row(row):
                        raise ValueError("An archive source changed during publication")
            stream.flush()
            os.fsync(stream.fileno())
        verified_archive(stage, selection)
        try:
            os.link(stage, path)
        except FileExistsError:
            verified_archive(path, selection)
        sync(path.parent)
    finally:
        stage.unlink(missing_ok=True)
    return {"path": str(path), **identity(path)}


def delivery(args, work, intent, context, received, result, captures):
    out = directory(work / "delivery")
    report_directory = directory(out / "reports")
    reports, names = [], {}
    # Preserve the original reports exactly and add the current complete exports.
    for current, paths in ((False, context["reviews"]),
                           (True, [Path(row["source"]) for row in received["portable_reports"]])):
        for path in paths:
            row = identity(path)
            name = path.name
            if name in names:
                if names[name] == row:
                    continue
                name = ("Current_" if current else "Original_") + name
            if name in names and names[name] != row:
                raise ValueError("Two complete reports would share the same customer filename")
            target = report_directory / name
            copy_exact(path, target)
            names[name] = row
            reports.append(target)
    customer = build_customer(context["builder"], context["checkout"], context["selection"],
                             out / "Starforge_Complete_Resource_Review_Application.zip",
                             reports, context["wheel"], context["example_data"])
    source = read_json(context["selection"])
    binding = {"accepted_customer": ACCEPTED, "accepted_retained_outputs": ACCEPTED_OUTPUTS,
               "source_manifest": identity(context["selection"]),
               "receiving": identity(work / "receiving-completed.json")}
    source_members = [{"name": "source/" + row["path"], "source": str(context["checkout"] / row["path"]),
                       **checked_row(row)} for row in source["files"]]
    source_members.append({"name": "SOURCE.json", "source": str(context["selection"]),
                           **identity(context["selection"])})
    source_zip = write_archive(out / "Starforge_Complete_Customer_Source.zip",
                               source_members, kind="complete-customer-source", binding=binding)
    view_members = captures + received["outputs"] + [
        {"name": "receiving/complete-result.json", "source": intent["result"],
         **identity(Path(intent["result"]))},
        {"name": "receiving/current-package.json", "source": str(work / "source-prepared.json"),
         **identity(work / "source-prepared.json")},
    ]
    views = write_archive(out / "Starforge_Complete_Review_Browser_Views.zip",
                          view_members, kind="original-customer-receiving", binding=binding)
    report_rows = [{"path": str(path), **identity(path)} for path in reports]
    result_record = {
        "schema": "commons.scf-customer-continuation-delivery.v1",
        "operation_id": OPERATION, "continuation_id": CONTINUATION, "state": "completed",
        "binding": binding, "customer": customer, "source": source_zip, "views": views,
        "reports": report_rows, "installed_customer": str(context["installed"]),
        "selected_source_files": len(source["files"]), "original_receiving": received,
        "runtime": intent["runtime"],
    }
    publish_json(out / "Starforge_Complete_Customer_Continuation.json", result_record)
    result_file = {"path": str(out / "Starforge_Complete_Customer_Continuation.json"),
                   **identity(out / "Starforge_Complete_Customer_Continuation.json")}
    guide = (
        "# Complete resource review application\n\n"
        "Open Starforge_Complete_Resource_Review_Application.zip and follow its README.md. "
        "The package includes the full selected Python and native resource runtime, "
        "the original reports, and the complete current journal exports.\n\n"
        "The existing receive command opens a complete returned journal in its comparison. "
        "Saved comparison, incoming-return and journal-plan selectors are available through "
        "the original customer command and browser. The included browser and report source "
        "contains the continued decision editor and readable, printable complete report.\n\n"
        "Starforge_Complete_Customer_Source.zip contains every selected source file and SOURCE.json. "
        "Starforge_Complete_Review_Browser_Views.zip contains the original desktop and phone "
        "receiving views and the explicitly selected operating outputs. "
        "Starforge_Complete_Customer_Continuation.json connects this delivery to the complete "
        "accepted application, both source overlays and the actual receiving result.\n\n"
        "Original programme: " + OPERATION + "\n\n"
        "The retained working installation is " + str(context["installed"]) + ". "
        "Keep its original receiver state to continue the same review. "
        "The continuation command resumes completed source, build, receiving and save phases "
        "from the same working directory.\n"
    )
    publish_bytes(out / "START_HERE.md", guide.encode("utf-8"))
    artifacts = [customer, source_zip, views, result_file,
                 {"path": str(out / "START_HERE.md"), **identity(out / "START_HERE.md")},
                 *report_rows]
    publish_json(out / "artifacts.json", {"operation_id": OPERATION, "continuation_id": CONTINUATION,
                                        "binding": binding, "files": artifacts})
    return result_record, artifacts


def save_library(args, work, intent, artifacts):
    expected_sources = intent["library"]["sources"]
    if helper_sources(args.library_host, args.library_helpers) != expected_sources:
        raise ValueError("Resume with the original maintained Library module and helper sources")
    sys.path.insert(0, str(args.library_host))
    loaded = [importlib.import_module(name[:-3]) for name in LIBRARY_MODULES]
    for name, imported in zip(LIBRARY_MODULES, loaded):
        if Path(imported.__file__).resolve() != args.library_host / name:
            raise ValueError("The loaded native Library module is from a different selected source")
    native = loaded[0]
    if not all(callable(getattr(native, name, None)) for name in ("_load_helpers", "_workflow")):
        raise ValueError("The maintained native Library workflow is required")
    out = work / "delivery"
    binding = {"artifacts": identity(out / "artifacts.json"),
               "sources": expected_sources, "operation_id": OPERATION, "continuation_id": CONTINUATION}
    retained_path = out / "library-result.json"
    if retained_path.exists():
        retained = read_json(retained_path)
        if retained.get("binding") != binding:
            raise ValueError("The retained provider save belongs to another complete delivery")
        if retained.get("state") == "completed":
            return retained
    uploads = []
    for row in artifacts:
        path = Path(row["path"])
        if identity(path) != checked_row(row):
            raise ValueError("An artifact changed before its original save")
        uploads.append({"local_path": str(path), "purpose": "create_library_file",
                        "library_artifact_type": "report" if path.suffix.lower() in {".html", ".md"} else "other"})
    publish_json(out / "library-request.json", {"binding": binding, "uploads": uploads,
                                               "uploadMode": "returned-put"})
    helper = native._load_helpers(args.library_helpers)
    flow = native._workflow(helper, directory(out / "helper-state"), directory(out / "provider"),
                            uploads=uploads, upload_mode="returned-put")
    returned = flow.run({"uploads": uploads})
    publish_json(out / "library-helper-result.json", returned, replace=True)
    rows = returned.get("results", [])
    expected = {row["local_path"] for row in uploads}
    if len(rows) != len(expected):
        raise RuntimeError("The original provider journal has not saved every selected artifact")
    saved = set()
    for row in rows:
        path = row.get("local_path")
        if (path not in expected or path in saved or row.get("status") != "succeeded"
                or not row.get("file_id") or not row.get("library_file_id")):
            raise RuntimeError("Continue the original retained provider request for the unfinished artifact")
        saved.add(path)
    complete = {"schema": "commons.scf-customer-library-continuation.v1", "state": "completed",
                "operation_id": OPERATION, "continuation_id": CONTINUATION,
                "binding": binding, "saved_at": now(), "results": rows}
    publish_json(retained_path, complete)
    return complete


def continue_original(args, work, intent, context, lock_fd):
    received, result, captures = run_original(args, work, intent, context, lock_fd)
    completed, artifacts = delivery(args, work, intent, context, received, result, captures)
    saved = save_library(args, work, intent, artifacts)
    return {"operation_id": OPERATION, "continuation_id": CONTINUATION, "state": "completed",
            "customer": completed["customer"], "source": completed["source"],
            "views": completed["views"], "reports": completed["reports"],
            "library": saved["results"], "work_dir": str(work)}
