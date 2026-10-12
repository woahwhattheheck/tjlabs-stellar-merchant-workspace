"""MIT. Complete AMP source, original IATI portfolios, journal and reopening."""
from __future__ import annotations
from copy import deepcopy
import hashlib
import os
from pathlib import Path
import re
import stat
import zipfile
from iati_source import InputError
from workspace import private_write, regular, file_digest, sync_dir
from .codec import loads, dumps, encode, fingerprint, identity, MAX_JSON
from . import domain
from .workspace import TABLES, RUN_SCHEMA

SCHEMA = "stellar-forge.iati-amp-workspace-packet.v1"
MAX_PACKET = 4 * 1024 * 1024 * 1024
MAX_FILES = 16384
HERE = Path(__file__).resolve().parent
RUNTIME_NOTE = (
    "Complete installed IATI and XML application source, original standalone dataset handler, "
    "available Merchant and Applications source, upstream AMP contract/licence, complete original "
    "portfolio packages, all selected native capture bytes, complete plan history and native journal."
)


def source_files():
    sdk = HERE.parent.parent
    result = {}
    for root, prefix in ((sdk / "iati", "runtime/sf30-seller-sdk/iati/"),
                         (sdk / "xml", "runtime/sf30-seller-sdk/xml/")):
        if not root.is_dir():
            raise InputError("The original IATI/XML runtime source directory is absent")
        for path in sorted(root.rglob("*")):
            relative = path.relative_to(root)
            if any(part.startswith(".") or part in {"node_modules", "__pycache__", "venv"} for part in relative.parts):
                continue
            if path.suffix in {".pyc", ".pyo"}:
                continue
            if path.is_symlink():
                raise InputError("Application source must retain ordinary files")
            if path.is_file():
                result[prefix + relative.as_posix()] = path
    native = sdk / "dataset-handler.mjs"
    if not native.is_file():
        raise InputError("The original native dataset handler is absent")
    result["runtime/sf30-seller-sdk/dataset-handler.mjs"] = native
    for relative in ("package.json", "LICENSE", "README.md"):
        path = sdk / relative
        if path.is_file() and not path.is_symlink():
            result["runtime/sf30-seller-sdk/" + relative] = path
    for relative in ("distribution/runtime-workspace/application-iati.mjs", "distribution/contributions/iati.json"):
        path = sdk.parent / relative
        if path.is_file() and not path.is_symlink():
            result["runtime/" + relative] = path
    # Carry the existing optional Merchant entry points in their original source layout.
    repository = sdk.parents[2]
    merchant = repository / "stellar-forge/mcp-merchant-operator"
    if not merchant.is_dir():
        merchant = sdk.parent / "stellar-forge/mcp-merchant-operator"
    if merchant.is_dir():
        for path in sorted(merchant.rglob("*")):
            relative = path.relative_to(merchant)
            if any(part.startswith(".") or part in {"node_modules", "__pycache__"} for part in relative.parts):
                continue
            if path.is_symlink():
                raise InputError("Merchant source must retain ordinary files")
            if path.is_file() and path.suffix not in {".pyc", ".pyo"}:
                result["runtime/stellar-forge/mcp-merchant-operator/" + relative.as_posix()] = path
    return result


def asset_descriptors(value):
    result = {}
    def visit(item):
        if isinstance(item, dict):
            if item.get("kind") == "amp-asset":
                identity(item.get("sha256"))
                result[item["sha256"]] = item
            else:
                for child in item.values():
                    visit(child)
        elif isinstance(item, list):
            for child in item:
                visit(child)
    visit(value)
    return result


def collect(planner, selected):
    limits = {}
    def history(ident, revision):
        if limits.get(ident, 0) >= revision:
            return
        limits[ident] = revision
        if len(limits) > 1000:
            raise InputError("The complete linked programme history exceeds 1,000 plans")
        for p in planner.history(ident)[:revision]:
            previous = p["definition"].get("previousPlan")
            if previous:
                history(previous["id"], previous["revision"])
    history(selected["id"], selected["revision"])
    # The one native operation can be shared by later reviewed preparations.
    # Retain their complete original context along with that operation's journal.
    while True:
        before = dict(limits)
        for ident, revision in list(limits.items()):
            for summary in planner.runs(ident):
                if summary["revision"] <= revision:
                    for link in planner.run(summary["id"]).get("linkedPreparations", []):
                        history(link["plan"], link["revision"])
        if before == limits:
            break
    plans = [p for ident, revision in limits.items() for p in planner.history(ident) if p["revision"] <= revision]
    captures = {p["definition"]["captureId"]: planner.capture(p["definition"]["captureId"]) for p in plans}
    runs = []
    for ident in limits:
        for summary in planner.runs(ident):
            if summary["revision"] <= limits[ident]:
                runs.append(planner.run(summary["id"]))
    run_ids = {r["id"] for r in runs}
    events = [{"sequence": row["original_sequence"], "run": row["run"], "body": loads(row["body"])}
              for row in planner.ws.db.execute("SELECT sequence,original_sequence,run,body FROM iati_amp_events ORDER BY run,original_sequence")
              if row["run"] in run_ids]
    requests = []
    for row in planner.ws.db.execute("SELECT * FROM iati_amp_requests ORDER BY rowid"):
        result = loads(row["result"])
        relevant = (result.get("captureId") in captures or result.get("runId") in run_ids
                    or result.get("id") in limits and result.get("revision", 0) <= limits[result["id"]])
        if relevant:
            requests.append(dict(row))
    return {"selection": {k: selected[k] for k in ("id", "revision", "recordSha256")},
            "plans": plans, "captures": list(captures.values()), "runs": runs,
            "events": events, "requests": requests}


def export_plan(planner, ident, output, revision=None):
    from iati_workspace import packet_write
    output = Path(output).expanduser().absolute()
    if not output.parent.is_dir() or output.is_symlink():
        raise InputError("Choose an existing output directory and a new complete ZIP filename")
    with planner.ws.mutex, planner.ws.scratch() as temporary:
        selected = planner.plan(ident, revision)
        body = collect(planner, selected)
        entries = source_files()
        metadata = temporary / "amp-workspace.json"
        private_write(metadata, encode(body))
        entries["amp-workspace.json"] = metadata
        for sha, descriptor in asset_descriptors(body).items():
            planner._bytes(descriptor)
            entries["assets/" + sha + ".bin"] = planner.assets / (sha + ".bin")
        portfolio_limits = {}
        for p in body["plans"]:
            portfolio = p["definition"]["portfolio"]
            portfolio_limits[portfolio["id"]] = max(portfolio_limits.get(portfolio["id"], 0), portfolio["revision"])
        body_portfolios = {}
        for portfolio, upto in portfolio_limits.items():
            target = temporary / (portfolio + ".zip")
            planner.ws.export_portfolio(portfolio, target, upto)
            entry = "portfolios/" + portfolio + ".zip"
            entries[entry] = target
            body_portfolios[portfolio] = {"revision": upto, "path": entry}
        instructions = temporary / "REOPEN.md"
        private_write(instructions, (
            "# Reopen the complete AMP commissioning workspace\n\n"
            "Install/use the original IATI application source under runtime/sf30-seller-sdk. "
            "Python 3 and the original Node native dataset runtime are required. "
            "Keep the whole runtime tree, including schema/codelist and upstream licence assets.\n\n"
            "From sf30-seller-sdk/iati, run:\n\n"
            "    python3 cli.py --workspace /absolute/new-workspace init\n"
            "    python3 cli.py --workspace /absolute/new-workspace amp-receive --file /absolute/AMP_Commissioning.zip\n"
            "    python3 cli.py --workspace /absolute/new-workspace serve\n\n"
            "The receiving operator validates the entire archive before rebuilding original IATI portfolios. "
            "It then reconstructs the selected AMP plans, exact native captures, original requests, "
            "full response bodies and every native operation. Open AMP commissioning in the existing browser.\n\n"
            "Native credential values and session cookies are entered locally for an authorized native continuation. "
            "A step that already sent a request is reconciled using its actual native project before continuation. "
            "The receiving command imports data and saved work; it does not execute source files inside this ZIP.\n"
        ).encode("utf-8"))
        entries["REOPEN.md"] = instructions
        return packet_write(output, entries, SCHEMA, {"selection": body["selection"],
                            "portfolios": body_portfolios, "runtimeSourceScope": RUNTIME_NOTE})


def read_packet(filename, temporary):
    regular(filename, MAX_PACKET)
    with zipfile.ZipFile(filename) as archive:
        infos = archive.infolist()
        names = [i.filename for i in infos]
        if len(infos) > MAX_FILES + 1 or len(names) != len(set(names)) or "manifest.json" not in names:
            raise InputError("Complete AMP packet has duplicate, missing or excessive members")
        total = 0
        for item in infos:
            name = item.filename
            parts = name.split("/")
            if (name.startswith("/") or "\\" in name or any(p in {"", ".", ".."} for p in parts)
                    or not re.fullmatch(r"[A-Za-z0-9._/@+ -]+", name) or item.is_dir()
                    or stat.S_ISLNK(item.external_attr >> 16) or item.flag_bits & 1
                    or item.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}):
                raise InputError("Invalid original AMP packet member")
            limit = MAX_JSON if name.endswith(".json") or name.startswith("assets/") else MAX_PACKET
            if item.file_size > limit:
                raise InputError("Original packet member exceeds its complete-file capacity")
            total += item.file_size
            if total > MAX_PACKET:
                raise InputError("Expanded complete AMP package exceeds 4 GiB")
        manifest = loads(archive.read("manifest.json"))
        if (not isinstance(manifest, dict) or manifest.get("schema") != SCHEMA
                or not isinstance(manifest.get("files"), dict)
                or set(manifest["files"]) != set(names) - {"manifest.json"}):
            raise InputError("AMP manifest does not name the complete original archive")
        for item in infos:
            if item.filename == "manifest.json":
                continue
            target = temporary / item.filename
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            checksum, count = hashlib.sha256(), 0
            with archive.open(item) as source, os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as destination:
                while block := source.read(65536):
                    count += len(block)
                    if count > item.file_size:
                        raise InputError("Native packet member expanded past its declared size")
                    checksum.update(block); destination.write(block)
                destination.flush(); os.fsync(destination.fileno())
            if manifest["files"][item.filename] != {"bytes": count, "sha256": checksum.hexdigest()}:
                raise InputError("The original complete packet bytes differ: " + item.filename)
        return manifest


def receive_plan(planner, filename):
    with planner.ws.mutex, planner.ws.scratch() as temporary:
        manifest = read_packet(Path(filename), temporary)
        body = loads((temporary / "amp-workspace.json").read_bytes())
        if body.get("selection") != manifest.get("selection"):
            raise InputError("Original AMP packet selections disagree")
        if set(body) != {"selection", "plans", "captures", "runs", "events", "requests"}:
            raise InputError("Unknown complete AMP workspace record")
        selected = body["selection"]
        captures = {c["id"]: c for c in body["captures"]}
        if len(captures) != len(body["captures"]):
            raise InputError("Duplicate native captures in the original packet")
        for ident, capture in captures.items():
            if ident != fingerprint({k: v for k, v in capture.items() if k != "id"}):
                raise InputError("Original native capture identity differs")
            domain.capture_input({k: v for k, v in capture.items() if k not in {"id", "schema", "createdAt", "actor"}})
        plans = {}
        for plan in body["plans"]:
            verified = planner._decode(dumps(plan))
            key = (verified["id"], verified["revision"])
            if key in plans or verified["definition"]["captureId"] not in captures:
                raise InputError("Duplicate plan or missing complete native capture")
            plans[key] = verified
        if (selected["id"], selected["revision"]) not in plans or plans[(selected["id"], selected["revision"])]["recordSha256"] != selected["recordSha256"]:
            raise InputError("The selected complete AMP plan is absent")
        for (ident, revision), plan in plans.items():
            if plan["previousRevision"] != (revision - 1 if revision > 1 else None):
                raise InputError("AMP plan revision sequence is incomplete")
            if revision > 1 and (ident, revision - 1) not in plans:
                raise InputError("Complete original AMP plan history is missing")
        descriptors = asset_descriptors(body)
        for sha, descriptor in descriptors.items():
            path = temporary / "assets" / (sha + ".bin")
            if (not path.is_file() or path.stat().st_size != descriptor["bytes"]
                    or file_digest(path, MAX_JSON) != sha):
                raise InputError("Complete original native response or analysis bytes are absent")
        for ident, selection in manifest.get("portfolios", {}).items():
            if selection["path"] != "portfolios/" + identity(ident) + ".zip":
                raise InputError("Original portfolio packet identity differs")
        # All outer bytes are validated before original source/portfolio receiving begins.
        for ident, selection in manifest["portfolios"].items():
            planner.ws.receive_portfolio(temporary / selection["path"])
            planner.ws.portfolio(ident, selection["revision"])
        def asset_json(descriptor):
            return loads((temporary / "assets" / (descriptor["sha256"] + ".bin")).read_bytes())
        for plan in plans.values():
            selected_portfolio = plan["definition"]["portfolio"]
            portfolio = planner.ws.portfolio(selected_portfolio["id"], selected_portfolio["revision"])
            actual_rows = domain.source_rows(planner.ws, portfolio)
            if fingerprint(actual_rows) != plan["sourceRows"]["sha256"]:
                raise InputError("The native IATI rows do not reproduce the retained AMP source analysis")
            definition = domain.plan_definition(plan["definition"], captures[plan["definition"]["captureId"]], actual_rows)
            actual_analysis = domain.analyse(actual_rows, definition, captures[plan["definition"]["captureId"]])
            if fingerprint(actual_analysis) != plan["analysis"]["sha256"]:
                raise InputError("The current installed AMP analysis differs from the original full saved review")
            if plan.get("prepared") and fingerprint(domain.prepare(actual_analysis, definition, captures[plan["definition"]["captureId"]])) != plan["prepared"]["sha256"]:
                raise InputError("The current native request preparation differs from the saved whole request")
        run_ids = set()
        for run in body["runs"]:
            identity(run["id"])
            if run.get("schema") != RUN_SCHEMA or (run["plan"], run["revision"]) not in plans or run["id"] in run_ids:
                raise InputError("Invalid original native receiving operation")
            run_ids.add(run["id"])
            original = plans[(run["plan"], run["revision"])]
            if not original.get("prepared") or original["prepared"]["sha256"] != run["preparedSha256"]:
                raise InputError("Original native run differs from its complete prepared request")
            request_set = domain.native_request_set(run["connection"], run["steps"])
            if domain.native_request_set(captures[original["definition"]["captureId"]]["connection"],
                                         asset_json(original["prepared"])) != request_set:
                raise InputError("Original native run changed its actual target or complete requests")
            linked = set()
            for link in run.get("linkedPreparations", []):
                key = (link["plan"], link["revision"])
                if key in linked or key not in plans or link["plan"] != run["plan"]:
                    raise InputError("Missing, duplicated or different linked native preparation")
                linked.add(key)
                selected_plan = plans[key]
                if not selected_plan.get("prepared") or selected_plan["prepared"]["sha256"] != link["preparedSha256"]:
                    raise InputError("A linked preparation lost its complete original request")
                linked_capture = captures[selected_plan["definition"]["captureId"]]
                if domain.native_request_set(linked_capture["connection"], asset_json(selected_plan["prepared"])) != request_set:
                    raise InputError("A linked preparation has different native mutations")
        for event in body["events"]:
            if event["run"] not in run_ids or type(event["sequence"]) is not int or event["sequence"] < 1:
                raise InputError("A native event refers to a missing original operation or sequence")
        with planner.ws.db:
            for sha, descriptor in descriptors.items():
                if planner._retain((temporary / "assets" / (sha + ".bin")).read_bytes(), descriptor["name"], descriptor["media"]) != descriptor:
                    raise InputError("Original native asset descriptor changed")
            for ident, capture in captures.items():
                prior = planner.ws.db.execute("SELECT body FROM iati_amp_captures WHERE id=?", (ident,)).fetchone()
                if prior and prior["body"] != dumps(capture):
                    raise InputError("Receiving native capture conflicts with existing original work")
                planner.ws.db.execute("INSERT OR IGNORE INTO iati_amp_captures VALUES(?,?)", (ident, dumps(capture)))
            for (ident, revision), plan in plans.items():
                prior = planner.ws.db.execute("SELECT body FROM iati_amp_plans WHERE id=? AND revision=?", (ident, revision)).fetchone()
                if prior and prior["body"] != dumps(plan):
                    raise InputError("Receiving AMP history conflicts with existing original work")
                planner.ws.db.execute("INSERT OR IGNORE INTO iati_amp_plans VALUES(?,?,?)", (ident, revision, dumps(plan)))
            for run in body["runs"]:
                prior = planner.ws.db.execute("SELECT body FROM iati_amp_runs WHERE id=?", (run["id"],)).fetchone()
                if prior and prior["body"] != dumps(run):
                    raise InputError("The receiving workspace contains a different continuation of this native operation")
                planner.ws.db.execute("INSERT OR IGNORE INTO iati_amp_runs VALUES(?,?,?,?)",
                                     (run["id"], run["plan"], run["revision"], dumps(run)))
            for event in body["events"]:
                encoded = dumps(event["body"])
                prior = planner.ws.db.execute("SELECT body FROM iati_amp_events WHERE run=? AND original_sequence=?",
                                              (event["run"], event["sequence"])).fetchone()
                if prior and prior["body"] != encoded:
                    raise InputError("The original native event sequence has a different body")
                if not prior:
                    planner.ws.db.execute("INSERT INTO iati_amp_events(run,body,original_sequence) VALUES(?,?,?)",
                                         (event["run"], encoded, event["sequence"]))
            for request in body["requests"]:
                if request["input_sha"] != fingerprint(loads(request["input"])):
                    raise InputError("Original AMP request content identity differs")
                previous = planner.ws.db.execute("SELECT * FROM iati_amp_requests WHERE id=?", (request["id"],)).fetchone()
                if previous and dict(previous) != request:
                    raise InputError("The original request ID has another result in this workspace")
                planner.ws.db.execute("INSERT OR IGNORE INTO iati_amp_requests VALUES(?,?,?,?,?)",
                    tuple(request[k] for k in ("id", "input_sha", "action", "input", "result")))
        return {"schema": SCHEMA, "selection": selected, "plans": len(plans),
                "captures": len(captures), "nativeRuns": len(run_ids), "originalAssets": len(descriptors),
                "state": planner.plan(selected["id"], selected["revision"])["state"]}
