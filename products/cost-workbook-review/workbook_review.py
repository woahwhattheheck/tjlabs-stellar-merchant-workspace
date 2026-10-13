"""Original-workbook edition review. Python 3.11+, standard library only."""
from __future__ import annotations
import base64, contextlib, datetime, fcntl, hashlib, html, io, json, os, pathlib, posixpath, re, tempfile, zipfile
import xml.etree.ElementTree as ET

SCHEMA = "workbook-edition-review/v1"
ENGINE = "cost-workbook-review-20261013"
MAX_WORKBOOK = 20 * 1024 * 1024
MAX_EXPANDED = 200 * 1024 * 1024
MAX_CELLS = 250000
MAX_PARTS = 10000
SOURCE_FILES = ("workbook_review.py", "serve.py", "ui.js", "style.css", "README.md", "OPERATING.md", "SOURCE_NOTES.md")
CELL = re.compile(r"^[A-Z]{1,3}[1-9][0-9]{0,6}$")
S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PR = "{http://schemas.openxmlformats.org/package/2006/relationships}"

class ReviewError(ValueError):
    pass

def require(ok, message):
    if not ok:
        raise ReviewError(message)

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def identity(data):
    return {"bytes": len(data), "sha256": sha(data)}

def text(value, field, maximum=2000, empty=False):
    require(isinstance(value, str), field + " must be text")
    result = value.strip()
    require((empty or result) and len(result) <= maximum, field + " has an invalid length")
    return result

def atomic(path, data):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".writing-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)

def xml(data):
    require(b"<!DOCTYPE" not in data.upper() and b"<!ENTITY" not in data.upper(), "DTD/entity declarations are not accepted")
    try:
        return ET.fromstring(data)
    except ET.ParseError as exc:
        raise ReviewError("Invalid workbook XML: " + str(exc)) from exc

def tree(node):
    if node is None:
        return None
    return {"tag": node.tag, "attributes": dict(sorted(node.attrib.items())),
            "text": node.text or "", "children": [tree(child) for child in node]}

def safe_name(name):
    require(isinstance(name, str) and name and "\\" not in name and "\x00" not in name, "Invalid archive member name")
    p = pathlib.PurePosixPath(name)
    require(not p.is_absolute() and all(x not in ("", ".", "..") for x in p.parts), "Unsafe archive member: " + name)
    require(not re.match(r"^[A-Za-z]:", name), "Absolute archive path")
    return name

def archive(data, maximum=MAX_EXPANDED):
    require(len(data) <= MAX_WORKBOOK * 4, "Archive exceeds the supported input size")
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        infos = z.infolist()
        names = [i.filename for i in infos]
        require(len(infos) <= MAX_PARTS and len(names) == len(set(names)), "Too many or duplicate archive members")
        require(sum(i.file_size for i in infos) <= maximum, "Expanded archive is too large")
        result = {}
        for i in infos:
            if i.is_dir():
                continue
            safe_name(i.filename)
            require(not i.flag_bits & 1, "Encrypted archives are not supported")
            require((i.external_attr >> 16) & 0o170000 != 0o120000, "Archive symlinks are not accepted")
            result[i.filename] = z.read(i)
        return result
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError) as exc:
        raise ReviewError("Invalid or unsupported ZIP workbook: " + str(exc)) from exc

def relationships(parts, owner):
    directory, base = posixpath.split(owner)
    rel_path = posixpath.join(directory, "_rels", base + ".rels") if owner else "_rels/.rels"
    output = {}
    if rel_path not in parts:
        return output
    for item in xml(parts[rel_path]):
        rid = item.attrib.get("Id")
        require(rid and rid not in output, "Duplicate or missing relationship ID")
        external = item.attrib.get("TargetMode") == "External"
        target = item.attrib.get("Target", "")
        require(target, "Missing relationship target")
        if not external:
            target = posixpath.normpath(target.lstrip("/") if target.startswith("/") else posixpath.join(directory, target))
            safe_name(target)
            require(target in parts, "Missing workbook relationship target: " + target)
        output[rid] = {"type": item.attrib.get("Type", "").rsplit("/", 1)[-1],
                       "target": target, "external": external}
    return output

def rich_text(node):
    return "".join(item.text or "" for item in node.iter(S + "t")) if node is not None else ""

def read_workbook(data, filename):
    require(filename.lower().endswith(".xlsx"), "Choose an original .xlsx workbook")
    require(0 < len(data) <= MAX_WORKBOOK, "Workbook must be between 1 byte and 20 MiB")
    parts = archive(data)
    require(not any(n.lower().endswith("vbaproject.bin") for n in parts), "Macro workbooks require a separate original-application workflow")
    roots = relationships(parts, "")
    office = [x for x in roots.values() if x["type"] == "officeDocument" and not x["external"]]
    require(len(office) == 1, "Workbook must have one main document")
    path = office[0]["target"]
    workbook = xml(parts[path])
    require(workbook.tag == S + "workbook", "This reader supports transitional SpreadsheetML .xlsx workbooks")
    rels = relationships(parts, path)
    shared = []
    styles = {}
    for rel in rels.values():
        if rel["type"] == "sharedStrings" and not rel["external"]:
            shared = [rich_text(i) for i in xml(parts[rel["target"]]).findall(S + "si")]
        if rel["type"] == "styles" and not rel["external"]:
            styles = {n.tag.rsplit("}", 1)[-1]: n for n in xml(parts[rel["target"]])}
    xfs = list(styles.get("cellXfs", []))
    formats = {i.attrib.get("numFmtId"): i.attrib.get("formatCode") for i in styles.get("numFmts", [])}

    def format_at(index):
        require(0 <= index < len(xfs) or (index == 0 and not xfs), "Cell references an unknown style")
        if not xfs:
            return None
        xf = xfs[index]
        answer = tree(xf)
        answer["numberFormatCode"] = formats.get(xf.attrib.get("numFmtId"))
        for attr, table in (("fontId", "fonts"), ("fillId", "fills"), ("borderId", "borders"), ("xfId", "cellStyleXfs")):
            ref = int(xf.attrib.get(attr, "0"))
            collection = list(styles.get(table, []))
            if collection:
                require(0 <= ref < len(collection), "Invalid " + table + " index")
                answer[attr + "Definition"] = tree(collection[ref])
        return answer

    sheets = {}
    cell_count = 0
    for sheet in workbook.find(S + "sheets") or []:
        name = sheet.attrib.get("name", "")
        require(name and name not in sheets, "Duplicate or unnamed sheet")
        rel = rels.get(sheet.attrib.get(R + "id"))
        require(rel and not rel["external"], "Missing internal sheet relationship")
        if rel["type"] != "worksheet":
            sheets[name] = {"state": sheet.attrib.get("state", "visible"), "kind": rel["type"],
                            "part": rel["target"], "cells": {}, "controls": {"originalPart": identity(parts[rel["target"]])}}
            continue
        ws = xml(parts[rel["target"]])
        require(ws.tag == S + "worksheet", "Unsupported worksheet namespace")
        cells = {}
        shared_formulas = {}
        for node in ws.findall(".//" + S + "sheetData/" + S + "row/" + S + "c"):
            address = node.attrib.get("r", "")
            require(CELL.fullmatch(address) and address not in cells, "Invalid or duplicate cell coordinate")
            cell_count += 1
            require(cell_count <= MAX_CELLS, "Workbook exceeds 250,000 stored cells")
            kind = node.attrib.get("t", "n")
            value_node = node.find(S + "v")
            value = value_node.text if value_node is not None else None
            if kind == "s" and value is not None:
                index = int(value)
                require(0 <= index < len(shared), "Invalid shared string index")
                value = shared[index]
            elif kind == "inlineStr":
                value = rich_text(node.find(S + "is"))
            f = node.find(S + "f")
            formula = None if f is None else {"text": f.text or "", "attributes": dict(f.attrib)}
            if formula and f.attrib.get("t") == "shared" and f.text:
                shared_formulas[f.attrib.get("si")] = {"cell": address, **formula}
            cells[address] = {"type": kind, "value": value, "formula": formula,
                              "format": format_at(int(node.attrib.get("s", "0")))}
        for address, cell in cells.items():
            f = cell["formula"]
            if f and f["attributes"].get("t") == "shared":
                master = shared_formulas.get(f["attributes"].get("si"))
                require(master, "Shared formula has no retained master")
                f["sharedMaster"] = master
        controls = {}
        for name_control in ("mergeCells", "dataValidations", "sheetProtection", "autoFilter", "tableParts",
                             "conditionalFormatting", "hyperlinks", "sheetFormatPr", "cols", "sheetViews"):
            nodes = ws.findall(S + name_control)
            if nodes:
                controls[name_control] = [tree(n) for n in nodes]
        controls["rowPresentation"] = [dict(n.attrib) for n in ws.findall(S + "sheetData/" + S + "row")
                                       if set(n.attrib) - {"r", "spans"}]
        sheet_rels = relationships(parts, rel["target"])
        controls["relatedParts"] = {rid: {**r, "content": identity(parts[r["target"]]) if not r["external"] else None}
                                    for rid, r in sheet_rels.items()}
        sheets[name] = {"state": sheet.attrib.get("state", "visible"), "kind": "worksheet",
                        "part": rel["target"], "cells": cells, "controls": controls}
    require(sheets, "Workbook has no sheets")
    controls = {"properties": tree(workbook.find(S + "workbookPr")),
                "calculation": tree(workbook.find(S + "calcPr")),
                "definedNames": tree(workbook.find(S + "definedNames")),
                "externalRelationships": {rid: r for rid, r in rels.items() if r["external"]},
                "sheetOrder": list(sheets)}
    # Every package part is retained and compared. Changes to charts, comments, links,
    # pivots or metadata remain visible even when no cell text changes.
    return {"filename": pathlib.Path(filename).name, **identity(data), "sheets": sheets, "controls": controls,
            "cellCount": cell_count, "parts": {n: identity(v) for n, v in sorted(parts.items())}}

def cell_order(address):
    match = re.fullmatch(r"([A-Z]+)([0-9]+)", address)
    n = 0
    for ch in match[1]:
        n = n * 26 + ord(ch) - 64
    return (int(match[2]), n)

def normalize_mapping(raw, before, after):
    require(isinstance(raw, dict), "Mapping must be an object")
    require(set(raw) <= {"sheetPairs", "focus", "methodology", "period", "currency"}, "Unknown mapping field")
    result = {"sheetPairs": [], "focus": [], "methodology": text(raw.get("methodology", ""), "methodology", 4000, True),
              "period": text(raw.get("period", ""), "period", 200, True),
              "currency": text(raw.get("currency", ""), "currency", 40, True)}
    pairs = raw.get("sheetPairs")
    if pairs is None:
        pairs = [{"before": n if n in before["sheets"] else None, "after": n if n in after["sheets"] else None}
                 for n in dict.fromkeys([*before["sheets"], *after["sheets"]])]
    require(isinstance(pairs, list) and pairs, "sheetPairs must be a nonempty array")
    left, right = set(), set()
    for pair in pairs:
        require(isinstance(pair, dict) and set(pair) == {"before", "after"}, "Each sheet pair needs before and after")
        a, b = pair["before"], pair["after"]
        require(a is not None or b is not None, "An empty sheet pair is invalid")
        for key, book, seen in ((a, before, left), (b, after, right)):
            require(key is None or isinstance(key, str) and key in book["sheets"] and key not in seen,
                    "Each original sheet must appear exactly once")
            if key is not None:
                seen.add(key)
        result["sheetPairs"].append(pair.copy())
    require(left == set(before["sheets"]) and right == set(after["sheets"]), "Sheet mapping must retain every original sheet")
    focus = raw.get("focus", [])
    require(isinstance(focus, list) and len(focus) <= 200, "Use at most 200 named review fields")
    seen = set()
    for item in focus:
        require(isinstance(item, dict) and set(item) <= {"id", "label", "before", "after", "category", "rationale"}, "Invalid review field")
        fid = text(item.get("id"), "focus id", 100)
        require(fid not in seen, "Duplicate focus id")
        seen.add(fid)
        row = {"id": fid, "label": text(item.get("label"), "focus label", 200),
               "category": text(item.get("category", ""), "category", 100, True),
               "rationale": text(item.get("rationale", ""), "rationale", 2000, True)}
        for side, book in (("before", before), ("after", after)):
            ref = item.get(side)
            require(ref is None or isinstance(ref, dict) and set(ref) == {"sheet", "cell"}, "Review reference needs sheet and cell")
            if ref:
                require(ref["sheet"] in book["sheets"] and isinstance(ref["cell"], str) and CELL.fullmatch(ref["cell"]),
                        "Review field references an unknown sheet or invalid cell")
                require(ref["cell"] in book["sheets"][ref["sheet"]]["cells"], "Review field points to an unstored cell; choose the exact original cell")
            row[side] = ref
        require(row["before"] or row["after"], "Review field needs at least one edition reference")
        result["focus"].append(row)
    return result

def compare(before, after, mapping):
    mapping = normalize_mapping(mapping, before, after)
    changes = []
    def add(kind, sheet, address, a, b, label=None):
        if a != b:
            value = {"kind": kind, "sheet": sheet, "cell": address, "before": a, "after": b, "label": label}
            changes.append({"id": sha(canonical(value)), **value})
    for pair in mapping["sheetPairs"]:
        a = before["sheets"].get(pair["before"])
        b = after["sheets"].get(pair["after"])
        label = pair["after"] or pair["before"]
        add("sheet", label, "", None if a is None else {"name": pair["before"], "state": a["state"], "kind": a["kind"]},
            None if b is None else {"name": pair["after"], "state": b["state"], "kind": b["kind"]})
        ac, bc = a["cells"] if a else {}, b["cells"] if b else {}
        for address in sorted(ac.keys() | bc.keys(), key=cell_order):
            x, y = ac.get(address), bc.get(address)
            if x != y:
                kind = "formula" if (x or {}).get("formula") != (y or {}).get("formula") else "cell"
                add(kind, label, address, x, y)
        add("sheet-controls", label, "", a["controls"] if a else None, b["controls"] if b else None)
    add("workbook-controls", "", "", before["controls"], after["controls"])
    for part in sorted(before["parts"].keys() | after["parts"].keys()):
        add("package-part", "", part, before["parts"].get(part), after["parts"].get(part))
    focus_rows = []
    for item in mapping["focus"]:
        entry = dict(item)
        for side, book in (("before", before), ("after", after)):
            ref = item[side]
            entry[side + "Value"] = book["sheets"][ref["sheet"]]["cells"][ref["cell"]] if ref else None
        focus_rows.append(entry)
    report = {"schema": SCHEMA, "engine": ENGINE, "mapping": mapping,
              "before": {k: before[k] for k in ("filename", "bytes", "sha256", "cellCount")},
              "after": {k: after[k] for k in ("filename", "bytes", "sha256", "cellCount")},
              "sheetPairs": mapping["sheetPairs"], "focus": focus_rows, "changes": changes,
              "counts": {kind: sum(c["kind"] == kind for c in changes) for kind in
                         ("cell", "formula", "sheet", "sheet-controls", "workbook-controls", "package-part")}}
    report["sha256"] = sha(canonical(report))
    return report

def summaries(state):
    decisions = {}
    for event in state["reviews"]:
        for item in event["decisions"]:
            decisions[item["id"]] = {**item, "reviewer": event["reviewer"], "at": event["at"], "revision": event["revision"]}
    total = len(state["report"]["changes"])
    accepted = sum(v["action"] == "acknowledge" for v in decisions.values())
    return {"total": total, "acknowledged": accepted, "unresolved": total - accepted,
            "complete": total == accepted, "decisions": decisions}

def validate_history(state):
    require(state.get("schema") == SCHEMA and state.get("engine") == ENGINE, "Unknown review package edition")
    require(isinstance(state.get("reviews"), list) and state.get("revision") == len(state["reviews"]), "Invalid review history")
    ids = {c["id"] for c in state["report"]["changes"]}
    for index, event in enumerate(state["reviews"], 1):
        require(event.get("revision") == index and event.get("reportSha256") == state["report"]["sha256"], "Review history does not bind this comparison")
        text(event.get("reviewer"), "reviewer", 200)
        require(isinstance(event.get("decisions"), list), "Invalid retained decisions")
        for item in event["decisions"]:
            require(item["id"] in ids and item["action"] in ("acknowledge", "needs-correction", "needs-information"), "Invalid retained decision")
    require(isinstance(state.get("requests"), dict), "Missing original request history")
    for request, item in state["requests"].items():
        require(item.get("revision") in range(1, state["revision"] + 1) and len(item.get("payloadSha256", "")) == 64,
                "Invalid original request replay record")

class Workspace:
    def __init__(self, root):
        self.root = pathlib.Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    @contextlib.contextmanager
    def lock(self):
        with (self.root / ".workspace.lock").open("a+b") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    def case_path(self, case_id):
        require(re.fullmatch(r"[a-f0-9]{64}", str(case_id)), "Invalid case ID")
        return self.root / "cases" / case_id

    def read(self, case_id):
        p = self.case_path(case_id) / "case.json"
        require(p.is_file(), "Review case does not exist")
        return json.loads(p.read_bytes())

    def list(self):
        result = []
        for p in sorted((self.root / "cases").glob("*/case.json")):
            s = json.loads(p.read_bytes())
            result.append({k: s[k] for k in ("id", "title", "createdAt", "revision")} |
                          {k: v for k, v in summaries(s).items() if k != "decisions"})
        return result

    def create(self, title, before_data, before_name, after_data, after_name, mapping):
        title = text(title, "title", 200)
        before = read_workbook(before_data, before_name)
        after = read_workbook(after_data, after_name)
        report = compare(before, after, mapping)
        case_id = sha(canonical({"title": title, "report": report["sha256"]}))
        with self.lock():
            target = self.case_path(case_id)
            if (target / "case.json").exists():
                return self.read(case_id)
            state = {"schema": SCHEMA, "engine": ENGINE, "id": case_id, "title": title,
                     "createdAt": now(), "revision": 0, "report": report, "reviews": [], "requests": {}}
            atomic(target / "originals/before.xlsx", before_data)
            atomic(target / "originals/after.xlsx", after_data)
            atomic(target / "case.json", canonical(state) + b"\n")
            return state

    def review(self, case_id, request):
        require(isinstance(request, dict) and set(request) == {"requestId", "expectedRevision", "reportSha256", "reviewer", "decisions"},
                "Review requires requestId, expectedRevision, reportSha256, reviewer and decisions")
        request_id = text(request["requestId"], "requestId", 160)
        require(type(request["expectedRevision"]) is int and request["expectedRevision"] >= 0, "Invalid expected revision")
        reviewer = text(request["reviewer"], "reviewer", 200)
        require(isinstance(request["decisions"], list) and request["decisions"], "Choose at least one actual change")
        require(len(request["decisions"]) <= 5000, "Save at most 5,000 decisions per request")
        payload_sha = sha(canonical(request))
        with self.lock():
            state = self.read(case_id)
            previous = state["requests"].get(request_id)
            if previous:
                require(previous["payloadSha256"] == payload_sha, "Request ID already belongs to different decisions")
                return {"case": state, "replayed": True, "acceptedRevision": previous["revision"]}
            require(state["revision"] == request["expectedRevision"], "This review changed. Reload before saving.")
            require(state["report"]["sha256"] == request["reportSha256"], "Review belongs to a different workbook comparison")
            changes = {x["id"]: x for x in state["report"]["changes"]}
            result, seen = [], set()
            for item in request["decisions"]:
                require(isinstance(item, dict) and set(item) <= {"id", "action", "note", "category"}, "Invalid decision fields")
                require(item.get("id") in changes and item["id"] not in seen, "Unknown or repeated change ID")
                seen.add(item["id"])
                action = item.get("action")
                require(action in ("acknowledge", "needs-correction", "needs-information"), "Choose an actual review action")
                note = text(item.get("note", ""), "decision note", 4000, True)
                require(note or (action == "acknowledge" and changes[item["id"]]["kind"] in ("cell", "package-part")),
                        "Explain formula, structural or unresolved decisions")
                result.append({"id": item["id"], "action": action, "note": note,
                               "category": text(item.get("category", ""), "cost category", 200, True)})
            revision = state["revision"] + 1
            event = {"revision": revision, "at": now(), "reviewer": reviewer, "reportSha256": request["reportSha256"],
                     "requestId": request_id, "decisions": result}
            state["revision"] = revision
            state["reviews"].append(event)
            state["requests"][request_id] = {"payloadSha256": payload_sha, "revision": revision}
            atomic(self.case_path(case_id) / "case.json", canonical(state) + b"\n")
            return {"case": state, "replayed": False, "acceptedRevision": revision}

    def inspect(self, case_id, side, sheet, start=0, limit=250):
        require(side in ("before", "after"), "Choose before or after")
        state = self.read(case_id)
        data = (self.case_path(case_id) / "originals" / (side + ".xlsx")).read_bytes()
        require(identity(data) == {k: state["report"][side][k] for k in ("bytes", "sha256")}, "Original workbook changed on disk")
        book = read_workbook(data, state["report"][side]["filename"])
        require(sheet in book["sheets"], "Unknown sheet")
        require(type(start) is int and start >= 0 and type(limit) is int and 1 <= limit <= 500, "Invalid cell page")
        cells = book["sheets"][sheet]["cells"]
        names = sorted(cells, key=cell_order)
        return {"sheet": sheet, "total": len(names), "start": start,
                "cells": [{"cell": n, **cells[n]} for n in names[start:start + limit]],
                "next": start + limit if start + limit < len(names) else None}

    def export(self, case_id, source_root):
        with self.lock():
            state = self.read(case_id)
            validate_history(state)
            root = self.case_path(case_id)
            files = {"case.json": canonical(state) + b"\n"}
            for side in ("before", "after"):
                data = (root / "originals" / (side + ".xlsx")).read_bytes()
                require(identity(data) == {k: state["report"][side][k] for k in ("bytes", "sha256")}, "Original workbook bytes no longer match")
                files["originals/" + side + ".xlsx"] = data
            source_root = pathlib.Path(source_root)
            for name in SOURCE_FILES:
                p = source_root / name
                require(p.is_file(), "Complete source required for portable handover: " + name)
                files["source/" + name] = p.read_bytes()
            files["review.json"] = canonical({"caseId": case_id, "revision": state["revision"],
                                              "summary": summaries(state), "history": state["reviews"]}) + b"\n"
            files["mapping.json"] = canonical(state["report"]["mapping"]) + b"\n"
            payload = canonical(state).decode().replace("<", "\\u003c").replace("&", "\\u0026")
            style = files["source/style.css"].decode()
            script = files["source/ui.js"].decode().replace("</script", "<\\/script")
            page = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workbook edition review</title><style>' + style + '</style><body><main id="app"></main><script>window.DELIVERED_CASE=' + payload + ';</script><script>' + script + '</script></body></html>'
            files["index.html"] = page.encode()
            files["OPEN_FIRST.txt"] = ("Open index.html to read the complete retained review. Original Excel files are in originals/.\n"
                "Read source/README.md for full CLI and independent receiving.\n"
                "Run from the included source: python3 serve.py receive --workspace /new/private/workspace --packet /path/to/this.zip\n").encode()
            manifest = {"schema": "workbook-review-portable/v1", "engine": ENGINE, "caseId": case_id,
                        "revision": state["revision"], "reportSha256": state["report"]["sha256"],
                        "members": {n: identity(data) for n, data in sorted(files.items())}}
            files["manifest.json"] = canonical(manifest) + b"\n"
            out = io.BytesIO()
            with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
                for name, data in sorted(files.items()):
                    info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o100600 << 16
                    z.writestr(info, data)
            return out.getvalue(), manifest

    def receive(self, packet, source_root):
        files = archive(packet, MAX_EXPANDED * 2)
        require("manifest.json" in files and "case.json" in files, "Missing portable manifest")
        manifest = json.loads(files["manifest.json"])
        require(manifest.get("schema") == "workbook-review-portable/v1" and manifest.get("engine") == ENGINE, "Unknown portable format")
        require(set(files) == set(manifest.get("members", {})) | {"manifest.json"}, "Portable member set differs")
        for name, descriptor in manifest["members"].items():
            require(identity(files[name]) == descriptor, "Portable member differs: " + name)
        for name in SOURCE_FILES:
            p = pathlib.Path(source_root) / name
            require(p.is_file() and p.read_bytes() == files.get("source/" + name), "Receive with this packet's complete original source: " + name)
        state = json.loads(files["case.json"])
        validate_history(state)
        before = read_workbook(files["originals/before.xlsx"], state["report"]["before"]["filename"])
        after = read_workbook(files["originals/after.xlsx"], state["report"]["after"]["filename"])
        report = compare(before, after, state["report"]["mapping"])
        require(report == state["report"], "Independent original-workbook comparison differs")
        require(state["id"] == sha(canonical({"title": state["title"], "report": report["sha256"]})), "Case ID differs")
        require(manifest["caseId"] == state["id"] and manifest["revision"] == state["revision"] and manifest["reportSha256"] == report["sha256"], "Portable case selection differs")
        with self.lock():
            target = self.case_path(state["id"])
            existing = target / "case.json"
            if existing.exists():
                require(json.loads(existing.read_bytes()) == state, "Receiving workspace already contains another revision; choose an empty workspace")
            else:
                atomic(target / "originals/before.xlsx", files["originals/before.xlsx"])
                atomic(target / "originals/after.xlsx", files["originals/after.xlsx"])
                atomic(target / "case.json", canonical(state) + b"\n")
        return {"state": "RECEIVED", "caseId": state["id"], "revision": state["revision"],
                "reportSha256": report["sha256"], "packet": identity(packet),
                "originals": {"before": identity(files["originals/before.xlsx"]), "after": identity(files["originals/after.xlsx"])},
                "review": {k: v for k, v in summaries(state).items() if k != "decisions"}}
