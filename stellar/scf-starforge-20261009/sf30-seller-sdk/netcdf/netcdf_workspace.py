"""NetCDF native scientific selections and complete editable receiving. MIT."""
from __future__ import annotations
import base64, contextlib, csv, datetime, fcntl, hashlib, html, itertools, json, math
import os, pathlib, re, shutil, tempfile, threading, uuid, zipfile
import numpy as np
from netCDF4 import Dataset, CompoundType, EnumType, VLType, num2date

SCHEMA = "stellar-forge.netcdf-workspace.v1"
SOURCE_ROOT = pathlib.Path(__file__).resolve().parent
NATIVE_LOCK = threading.RLock()  # libnetcdf/HDF5 access is process-serialized.
SHA = re.compile(r"^[a-f0-9]{64}$")

class WorkspaceError(Exception):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)

def require(test, message, code="NETCDF_INVALID"):
    if not test: raise WorkspaceError(code, message)

def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def canonical(value): return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
def digest_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""): h.update(chunk)
    return h.hexdigest()

def typed(value):
    """JSON preserves raw scalar identity; tags carry values JSON cannot express."""
    if np.ma.is_masked(value): return {"kind": "missing"}
    if isinstance(value, np.void) and value.dtype.fields:
        return {"kind": "compound", "fields": {k: typed(value[k]) for k in value.dtype.names}}
    if isinstance(value, (np.ndarray, np.ma.MaskedArray)): return [typed(v) for v in value] if value.ndim else typed(value.item())
    if isinstance(value, (list, tuple)): return [typed(v) for v in value]
    if isinstance(value, (bytes, np.bytes_)): return {"kind": "bytes", "base64": base64.b64encode(bytes(value)).decode()}
    if isinstance(value, (np.bool_, bool)): return bool(value)
    if isinstance(value, (np.integer, int)):
        n = int(value)
        return {"kind": "integer", "value": str(n)} if abs(n) > 9007199254740991 else n
    if isinstance(value, (np.floating, float)):
        n = float(value)
        return n if math.isfinite(n) else {"kind": "float", "value": "NaN" if math.isnan(n) else ("Infinity" if n > 0 else "-Infinity")}
    if isinstance(value, (np.complexfloating, complex)): return {"kind": "complex", "real": typed(value.real), "imaginary": typed(value.imag)}
    if isinstance(value, (np.str_, str)): return str(value)
    if value is None: return None
    return {"kind": type(value).__name__, "value": str(value)}

def attributes(native): return {key: typed(native.getncattr(key)) for key in native.ncattrs()}
def group_path(group): return group.path or "/"
def dim_path(dim): return (group_path(dim.group()).rstrip("/") + "/" + dim.name)
def var_path(variable): return group_path(variable.group()).rstrip("/") + "/" + variable.name
def native_variable(dataset, path):
    require(isinstance(path, str) and path.startswith("/"), "Use an absolute original variable path")
    try: return dataset[path]
    except (KeyError, IndexError): raise WorkspaceError("NETCDF_MISSING", "The selected original variable does not exist")

def descriptor(var):
    dims = [{"name": d.name, "path": dim_path(d), "size": len(d), "unlimited": d.isunlimited()} for d in var.get_dims()]
    dtype = var.datatype
    kind = "compound" if isinstance(dtype, CompoundType) else "enum" if isinstance(dtype, EnumType) else "vlen" if isinstance(dtype, VLType) else "primitive"
    if dtype is str: type_name = "string"
    elif isinstance(dtype, VLType) and dtype.dtype is str: type_name = "string"
    else: type_name = str(getattr(dtype, "dtype", var.dtype))
    attrs = attributes(var)
    cf_keys = ["coordinates", "grid_mapping", "bounds", "ancillary_variables", "formula_terms", "calendar", "units", "standard_name", "axis", "cell_methods", "cell_measures"]
    out = {"path": var_path(var), "name": var.name, "group": group_path(var.group()), "dtype": type_name, "type_kind": kind,
           "shape": list(var.shape), "dimensions": dims, "attributes": attrs, "cf": {k: attrs[k] for k in cf_keys if k in attrs}, "selectable": True}
    if isinstance(dtype, EnumType): out["enum"] = dict(dtype.enum_dict)
    if isinstance(dtype, CompoundType): out["dtype_description"] = typed(dtype.dtype.descr)
    return out

def inspect(path):
    with NATIVE_LOCK, Dataset(path, "r") as ds:
        groups, dimensions, variables = [], [], []
        def visit(g):
            groups.append({"path": group_path(g), "attributes": attributes(g)})
            for d in g.dimensions.values(): dimensions.append({"name": d.name, "path": dim_path(d), "size": len(d), "unlimited": d.isunlimited()})
            variables.extend(descriptor(v) for v in g.variables.values())
            for child in g.groups.values(): visit(child)
        visit(ds)
        return {"format": ds.data_model, "attributes": attributes(ds), "groups": groups, "dimensions": dimensions, "variables": variables}

def selection_for(var, requested=None):
    require(isinstance(requested or {}, dict), "Slices must be keyed by original dimension name or path")
    requested = requested or {}
    valid = {d.name for d in var.get_dims()} | {dim_path(d) for d in var.get_dims()}
    require(set(requested) <= valid, "A slice names a dimension outside the selected variable")
    ranges, slices, shape = [], {}, []
    for d in var.get_dims():
        path = dim_path(d)
        if path in requested and d.name in requested: require(requested[path] == requested[d.name], "Conflicting dimension name and absolute path slices")
        spec = requested.get(path, requested.get(d.name, {}))
        require(isinstance(spec, dict) and set(spec) <= {"start", "stop", "step"}, "Each slice accepts start, stop and step")
        start, stop, step = spec.get("start", 0), spec.get("stop", len(d)), spec.get("step", 1)
        require(all(isinstance(n, int) and not isinstance(n, bool) for n in [start, stop, step]), "Slice bounds must be integers")
        require(0 <= start <= stop <= len(d) and step > 0, "Slice bounds must be half-open within the original dimension and step positive")
        r = range(start, stop, step)
        ranges.append(r); slices[path] = {"start": start, "stop": stop, "step": step}; shape.append(len(r))
    return {"slices": slices, "shape": shape, "cells": math.prod(shape)}, ranges

def referenced_variables(var, ds):
    names = [d.name for d in var.get_dims()]
    for key in ["coordinates", "bounds", "ancillary_variables", "grid_mapping", "formula_terms", "cell_measures"]:
        if key not in var.ncattrs(): continue
        value = var.getncattr(key)
        if not isinstance(value, str): continue
        # Expanded grid_mapping and formula_terms retain their reference tokens.
        names.extend(re.findall(r"(?:^|\s)([^\s:]+)(?=:|\s|$)", value))
    found = []
    for name in names:
        if name.startswith("/"):
            try: candidate = ds[name]
            except (KeyError, IndexError): continue
        else:
            g, candidate = var.group(), None
            while g is not None:
                if name in g.variables: candidate = g.variables[name]; break
                g = g.parent
        if candidate is not None and hasattr(candidate, "dimensions") and var_path(candidate) != var_path(var): found.append(candidate)
    return found

def prepared_variables(ds, choices, include_coordinates):
    selected = {}
    for choice in choices:
        var = native_variable(ds, choice["path"])
        normalized, _ = selection_for(var, choice.get("slices"))
        selected[var_path(var)] = {"path": var_path(var), "slices": normalized["slices"], "role": "selected"}
    if include_coordinates:
        queue = list(selected.values())
        while queue:
            item = queue.pop(0); var = native_variable(ds, item["path"])
            for related in referenced_variables(var, ds):
                path = var_path(related)
                slices = {dim_path(d): item["slices"][dim_path(d)] for d in related.get_dims() if dim_path(d) in item["slices"]}
                normalized, _ = selection_for(related, slices)
                if path in selected:
                    require(selected[path]["slices"] == normalized["slices"], "Related coordinates require incompatible slices; split this selection into separate results")
                else:
                    extra = {"path": path, "slices": normalized["slices"], "role": "coordinate-or-reference"}
                    selected[path] = extra; queue.append(extra)
    dimension_choices = {}
    for item in selected.values():
        for key, value in item["slices"].items():
            require(key not in dimension_choices or dimension_choices[key] == value, "Variables use conflicting slices of one original dimension; save separate selections")
            dimension_choices[key] = value
    return list(selected.values())

def native_rows(var, specs, decode=False, offset=0, limit=None):
    normalized, ranges = selection_for(var, specs)
    total = normalized["cells"]
    end = total if limit is None else min(total, offset + limit)
    if offset >= end: return
    shape = normalized["shape"]
    # Each first-axis slab is read independently; a selection's entire population
    # is streamed to disk rather than retained as one multidimensional array.
    var.set_auto_maskandscale(False); var.set_auto_chartostring(False)
    if not ranges:
        raw = var[...]
        row = {"index": [], "raw": typed(raw)}
        if decode:
            var.set_auto_maskandscale(True); row["decoded"] = typed(var[...]); var.set_auto_maskandscale(False)
        yield row; return
    last_count = shape[-1]
    if not last_count: return
    prefix_start, prefix_end = offset // last_count, (end - 1) // last_count
    for prefix_position in range(prefix_start, prefix_end + 1):
        positions = np.unravel_index(prefix_position, tuple(shape[:-1])) if len(shape) > 1 else ()
        prefix = tuple(ranges[i][n] for i, n in enumerate(positions))
        lo = max(0, offset - prefix_position * last_count)
        hi = min(last_count, end - prefix_position * last_count)
        for begin in range(lo, hi, 16384):
            finish = min(hi, begin + 16384)
            r = ranges[-1]
            key = prefix + (slice(r.start + begin * r.step, r.start + finish * r.step, r.step),)
            raw = var[key]
            decoded = None
            if decode:
                var.set_auto_maskandscale(True); decoded = var[key]; var.set_auto_maskandscale(False)
            for local in range(finish - begin):
                indexes = list(prefix) + [r[begin + local]]
                row = {"index": indexes, "raw": typed(raw[local])}
                if decode:
                    value = decoded[local]
                    row["decoded"] = typed(value)
                    if "units" in var.ncattrs() and isinstance(var.units, str) and " since " in var.units and not np.ma.is_masked(value):
                        calendar = getattr(var, "calendar", "standard")
                        try: row["calendar_value"] = {"value": str(num2date(value, var.units, calendar=calendar)), "calendar": calendar, "units": var.units}
                        except (ValueError, TypeError, OverflowError) as error:
                            row["calendar_value"] = {"status": "unsupported-by-selected-runtime", "calendar": calendar, "units": var.units, "message": str(error)}
                yield row


def csv_text(value):
    text = value if isinstance(value, str) else canonical(value)
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) and isinstance(value, str) else text

def create_native_subset(ds, choices, output):
    with Dataset(output, "w", format="NETCDF4") as target:
        target.setncatts({k: ds.getncattr(k) for k in ds.ncattrs() if k != "_NCProperties"})
        groups = {"/": target}
        def ensure_group(original):
            path = group_path(original)
            if path in groups: return groups[path]
            parent = ensure_group(original.parent)
            new = parent.createGroup(path.rsplit("/", 1)[-1]); groups[path] = new
            new.setncatts({k: original.getncattr(k) for k in original.ncattrs()})
            return new
        dimension_specs, type_cache = {}, {}
        for item in choices:
            var = native_variable(ds, item["path"])
            normalized, _ = selection_for(var, item["slices"])
            ensure_group(var.group())
            for d, count in zip(var.get_dims(), normalized["shape"]):
                scope = ensure_group(d.group()); key = dim_path(d)
                if key not in dimension_specs:
                    require(count > 0 or d.isunlimited(), "A native fixed dimension cannot be exported with zero length; select a non-empty window")
                    scope.createDimension(d.name, None if d.isunlimited() else count); dimension_specs[key] = count
        for item in choices:
            source = native_variable(ds, item["path"]); group = ensure_group(source.group()); native_type = source.datatype
            dtype = native_type
            if isinstance(native_type, (CompoundType, EnumType, VLType)):
                type_key = (group.path, native_type.name, str(native_type.dtype))
                if type_key not in type_cache:
                    if isinstance(native_type, CompoundType): dtype = group.createCompoundType(native_type.dtype, native_type.name)
                    elif isinstance(native_type, EnumType): dtype = group.createEnumType(native_type.dtype, native_type.name, native_type.enum_dict)
                    elif native_type.dtype is str: dtype = str
                    else: dtype = group.createVLType(native_type.dtype, native_type.name)
                    type_cache[type_key] = dtype
                dtype = type_cache[type_key]
            fill = {"fill_value": source.getncattr("_FillValue")} if "_FillValue" in source.ncattrs() else {}
            destination = group.createVariable(source.name, dtype, source.dimensions, **fill)
            destination.setncatts({k: source.getncattr(k) for k in source.ncattrs() if k != "_FillValue"})
            source.set_auto_maskandscale(False); source.set_auto_chartostring(False)
            destination.set_auto_maskandscale(False); destination.set_auto_chartostring(False)
            normalized, ranges = selection_for(source, item["slices"])
            if not ranges: destination[...] = source[...]; continue
            if not normalized["cells"]: continue
            prefix_shape = normalized["shape"][:-1]
            prefix_count = math.prod(prefix_shape)
            for ordinal in range(prefix_count):
                positions = np.unravel_index(ordinal, tuple(prefix_shape)) if prefix_shape else ()
                original_prefix = tuple(ranges[i][n] for i, n in enumerate(positions))
                last = ranges[-1]
                for begin in range(0, len(last), 16384):
                    finish = min(len(last), begin + 16384)
                    original_key = original_prefix + (slice(last.start + begin * last.step, last.start + finish * last.step, last.step),)
                    new_key = tuple(positions) + (slice(begin, finish),)
                    destination[new_key] = source[original_key]


class Workspace:
    def __init__(self, directory):
        self.directory = pathlib.Path(directory).expanduser().resolve()
        self.state_path = self.directory / "workspace.json"
        require(self.state_path.is_file(), "Initialize the NetCDF workspace first", "NETCDF_MISSING")

    @staticmethod
    def create(directory, title="Scientific data operations"):
        root = pathlib.Path(directory).expanduser().resolve()
        require(not root.exists() or not any(root.iterdir()), "Creation requires an empty destination", "NETCDF_RECEIVE_CONFLICT")
        root.mkdir(parents=True, mode=0o700, exist_ok=True)
        (root / "objects").mkdir(mode=0o700)
        state = {"schema": SCHEMA, "project": {"id": str(uuid.uuid4()), "title": str(title), "revision": 0, "created_at": now()},
                 "sources": [], "selections": [], "runs": [], "reviews": [], "requests": {}}
        Workspace._write_json(root / "workspace.json", state)
        return Workspace(root).binding()

    @staticmethod
    def _write_json(path, value):
        temp = path.with_name(path.name + "." + uuid.uuid4().hex + ".partial")
        with open(temp, "x", encoding="utf-8") as stream:
            os.chmod(temp, 0o600); stream.write(canonical(value)); stream.flush(); os.fsync(stream.fileno())
        os.replace(temp, path)

    def state(self):
        with open(self.state_path, encoding="utf-8") as stream: state = json.load(stream)
        require(state.get("schema") == SCHEMA, "The workspace schema changed", "NETCDF_SOURCE_CHANGED")
        return state

    def binding(self):
        project = self.state()["project"]
        value = {"schema": "stellar-forge.netcdf-binding.v1", "project_id": project["id"], "directory": str(self.directory)}
        return {**value, "sha256": hashlib.sha256(canonical(value).encode()).hexdigest()}

    def object_path(self, sha):
        require(isinstance(sha, str) and SHA.fullmatch(sha), "Use an exact SHA-256 object identity")
        path = self.directory / "objects" / sha
        require(path.is_file() and not path.is_symlink(), "The retained object does not exist", "NETCDF_MISSING")
        return path

    def put_file(self, path, name=None, mime="application/octet-stream"):
        path = pathlib.Path(path)
        require(path.is_file(), "The complete input file does not exist", "NETCDF_MISSING")
        object_dir = self.directory / "objects"
        fd, temp = tempfile.mkstemp(prefix="receiving-", suffix=".partial", dir=object_dir)
        sha, size = hashlib.sha256(), 0
        try:
            with os.fdopen(fd, "wb") as output, open(path, "rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    output.write(chunk); sha.update(chunk); size += len(chunk)
                output.flush(); os.fsync(output.fileno())
            identity = sha.hexdigest(); target = object_dir / identity
            if target.exists():
                require(digest_file(target) == identity, "A retained object changed", "NETCDF_SOURCE_CHANGED"); os.unlink(temp)
            else: os.chmod(temp, 0o600); os.replace(temp, target)
            return {"name": name or path.name, "sha256": identity, "bytes": size, "mime": mime}
        finally:
            if os.path.exists(temp): os.unlink(temp)

    @contextlib.contextmanager
    def mutation(self, method, params):
        with NATIVE_LOCK, open(self.directory / ".writer.lock", "a+b") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            state = self.state(); request_id = params.get("request_id"); fingerprint = hashlib.sha256(canonical({"method": method, "params": params}).encode()).hexdigest()
            existing = state["requests"].get(request_id) if request_id else None
            if existing:
                require(existing["fingerprint"] == fingerprint, "This request identity already belongs to other input", "NETCDF_CONFLICT")
                yield state, existing["result"], lambda value: None; return
            if "expected_revision" in params: require(params["expected_revision"] == state["project"]["revision"], "The original workspace revision changed; refresh before saving", "NETCDF_CONFLICT")
            def commit(result):
                state["project"]["revision"] += 1
                if request_id: state["requests"][request_id] = {"method": method, "fingerprint": fingerprint, "result": result, "completed_at": now()}
                self._write_json(self.state_path, state)
            yield state, None, commit

    @staticmethod
    def item(state, collection, identity):
        value = next((v for v in state[collection] if v["id"] == identity), None)
        require(value is not None, "The selected saved record does not exist", "NETCDF_MISSING")
        return value

    def source_path(self, source):
        path = self.object_path(source["sha256"])
        require(path.stat().st_size == source["bytes"] and digest_file(path) == source["sha256"], "The original NetCDF source changed", "NETCDF_SOURCE_CHANGED")
        return path

    def invoke(self, method, params=None):
        p = params or {}
        require(isinstance(p, dict), "Operation input must be an object")
        if method == "binding": return self.binding()
        state = self.state()
        if method == "overview": return {k: state[k] for k in ["schema", "project", "sources", "selections", "runs", "reviews"]}
        if method in ["sources", "selections", "runs", "reviews"]: return {"items": state[method], "total": len(state[method])}
        if method in ["source", "selection", "run.get"]: return self.item(state, {"source": "sources", "selection": "selections", "run.get": "runs"}[method], p.get("id"))
        if method in ["variables", "variable", "preview"]:
            source = self.item(state, "sources", p.get("source_id"))
            variables = source["catalog"]["variables"]
            if method == "variables":
                q = str(p.get("query", "")).casefold(); matches = [v for v in variables if q in (v["path"] + " " + canonical(v["cf"])).casefold()]
                offset, limit = self.page(p); end = min(len(matches), offset + limit)
                return {"items": matches[offset:end], "total": len(matches), "next_offset": end if end < len(matches) else None}
            var = next((v for v in variables if v["path"] == p.get("path")), None)
            require(var is not None, "Select an original variable path", "NETCDF_MISSING")
            if method == "variable": return var
            with NATIVE_LOCK, Dataset(self.source_path(source), "r") as ds:
                native = native_variable(ds, p["path"]); normalized, _ = selection_for(native, p.get("slices")); offset, limit = self.page(p)
                items = list(native_rows(native, normalized["slices"], bool(p.get("decode_cf", False)), offset, limit))
                end = min(normalized["cells"], offset + len(items))
                return {"variable": var, "selection": normalized, "items": items, "total": normalized["cells"], "next_offset": end if end < normalized["cells"] else None}
        if method == "import": return self.import_source(p)
        if method == "selection.save": return self.save_selection(p)
        if method == "run": return self.run_selection(p)
        if method == "review.save": return self.save_review(p)
        if method in ["object.describe", "object.read"]:
            path = self.object_path(p.get("sha256")); size = path.stat().st_size
            if method == "object.describe": return {"sha256": p["sha256"], "bytes": size}
            offset = p.get("offset", 0); limit = p.get("limit", 262144)
            require(isinstance(offset, int) and offset >= 0 and isinstance(limit, int) and 0 < limit <= 4 * 1024 * 1024, "Invalid object read range")
            with open(path, "rb") as stream: stream.seek(offset); data = stream.read(limit)
            end = offset + len(data)
            return {"sha256": p["sha256"], "offset": offset, "total": size, "base64": base64.b64encode(data).decode(), "next_offset": end if end < size else None}
        if method == "report": return next(f for f in self.item(state, "runs", p.get("run_id"))["files"] if f["name"] == "report.html")
        if method == "export": return self.export(p.get("output"))
        if method == "receive": return self.receive(p.get("path"), p.get("destination"), p.get("expected_sha"))
        raise WorkspaceError("NETCDF_INVALID", "Unknown native NetCDF operation: " + str(method))

    @staticmethod
    def page(p):
        offset, limit = p.get("offset", 0), p.get("limit", 100)
        require(isinstance(offset, int) and offset >= 0 and isinstance(limit, int) and 0 < limit <= 10000, "Use a valid page offset and size")
        return offset, limit

    def import_source(self, p):
        with self.mutation("import", p) as (state, cached, commit):
            if cached is not None: return cached
            file = self.put_file(p.get("path"), p.get("name"), "application/x-netcdf")
            if p.get("expected_sha") is not None: require(file["sha256"] == p["expected_sha"], "The selected host source digest changed", "NETCDF_SOURCE_CHANGED")
            try: catalog = inspect(self.object_path(file["sha256"]))
            except (OSError, RuntimeError) as error: raise WorkspaceError("NETCDF_INVALID", "The original file could not be opened as native NetCDF: " + str(error))
            source = {"id": "source-" + uuid.uuid4().hex, **file, "reference": str(p.get("reference", "")), "imported_at": now(), "catalog": catalog}
            state["sources"].append(source); commit(source); return source

    def save_selection(self, p):
        with self.mutation("selection.save", p) as (state, cached, commit):
            if cached is not None: return cached
            source = self.item(state, "sources", p.get("source_id")); choices = p.get("variables")
            require(isinstance(choices, list) and choices and all(isinstance(v, dict) and isinstance(v.get("path"), str) for v in choices), "Select one or more original variables")
            require(len({v["path"] for v in choices}) == len(choices), "Each original variable is selected once")
            include = bool(p.get("include_coordinates", True))
            with Dataset(self.source_path(source), "r") as ds:
                prepared = prepared_variables(ds, choices, include)
                for item in prepared:
                    var = native_variable(ds, item["path"]); normalized, _ = selection_for(var, item["slices"])
                    require(all(count > 0 or dimension.isunlimited() for dimension, count in zip(var.get_dims(), normalized["shape"])), "A saved native fixed dimension requires a non-empty window")
            selection = {"id": "selection-" + uuid.uuid4().hex, "title": str(p.get("title") or "Scientific selection"), "source_id": source["id"], "source_sha256": source["sha256"], "variables": prepared,
                         "decode_cf": bool(p.get("decode_cf", False)), "include_coordinates": include, "created_at": now()}
            state["selections"].append(selection); commit(selection); return selection

    def run_selection(self, p):
        with self.mutation("run", p) as (state, cached, commit):
            if cached is not None: return cached
            selection = self.item(state, "selections", p.get("selection_id")); source = self.item(state, "sources", selection["source_id"])
            require(selection["source_sha256"] == source["sha256"], "The selected original source identity changed", "NETCDF_SOURCE_CHANGED")
            run_id = "run-" + (hashlib.sha256(str(p["request_id"]).encode()).hexdigest()[:32] if p.get("request_id") else uuid.uuid4().hex)
            work = self.directory / "working" / run_id; work.mkdir(parents=True, mode=0o700, exist_ok=True)
            result = {"id": run_id, "title": selection["title"], "selection_id": selection["id"], "source_id": source["id"], "source_sha256": source["sha256"], "created_at": now(), "cells": 0, "variables": [], "files": [], "status": "complete"}
            with Dataset(self.source_path(source), "r") as ds:
                create_native_subset(ds, selection["variables"], work / "selection.nc")
                with open(work / "values.jsonl", "w", encoding="utf-8") as js, open(work / "values.csv", "w", encoding="utf-8", newline="") as cs:
                    writer = csv.writer(cs); writer.writerow(["variable", "original_index", "raw_value", "decoded_value", "calendar_value"])
                    for item in selection["variables"]:
                        var = native_variable(ds, item["path"]); normalized, _ = selection_for(var, item["slices"])
                        result["variables"].append({**descriptor(var), "role": item["role"], "selection": normalized})
                        for row in native_rows(var, item["slices"], selection["decode_cf"]):
                            record = {"variable": item["path"], **row}; js.write(canonical(record) + "\n")
                            writer.writerow([csv_text(item["path"]), canonical(row["index"]), csv_text(row["raw"]), csv_text(row.get("decoded")), csv_text(row.get("calendar_value"))])
                        result["cells"] += normalized["cells"]
            for filename, mime in [("selection.nc", "application/x-netcdf"), ("values.jsonl", "application/x-ndjson"), ("values.csv", "text/csv")]: result["files"].append(self.put_file(work / filename, filename, mime))
            manifest = {"schema": "stellar-forge.netcdf-result.v1", "result": result, "selection": selection, "original": {k: source[k] for k in ["id", "name", "sha256", "bytes", "reference"]}, "catalog": source["catalog"]}
            rows = "".join("<tr><td>" + html.escape(v["path"]) + "</td><td>" + html.escape(v["dtype"]) + "</td><td>" + html.escape(str(v["selection"]["shape"])) + "</td><td>" + str(v["selection"]["cells"]) + "</td><td>" + html.escape(v["role"]) + "</td></tr>" for v in result["variables"])
            document = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + html.escape(selection["title"]) + '</title><style>body{font:15px system-ui;color:#181818;background:#fff;max-width:1100px;margin:40px auto;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:9px;text-align:left}pre{white-space:pre-wrap;word-break:break-word}small{color:#555}@media print{body{margin:0}}</style><h1>' + html.escape(selection["title"]) + '</h1><p>Original source: ' + html.escape(source["name"]) + '</p><p>' + f'{result["cells"]:,}' + ' complete selected and accompanying values. Native NetCDF retains the original types and attributes; JSONL and CSV retain every original index. Decoded values are additional context.</p><table><thead><tr><th>Variable</th><th>Native type</th><th>Selected shape</th><th>Values</th><th>Selection role</th></tr></thead><tbody>' + rows + '</tbody></table><h2>Source reference</h2><p>' + html.escape(source["reference"]) + '</p><details><summary>Original identity and selection</summary><pre>' + html.escape(json.dumps(manifest, ensure_ascii=False, indent=2)) + '</pre></details></html>'
            (work / "report.html").write_text(document, encoding="utf-8"); result["files"].append(self.put_file(work / "report.html", "report.html", "text/html"))
            # The manifest identifies every other result file. Its own digest
            # is held by the original workspace result, avoiding a circular hash.
            self._write_json(work / "manifest.json", manifest); result["files"].append(self.put_file(work / "manifest.json", "manifest.json", "application/json"))
            state["runs"].append(result); commit(result); shutil.rmtree(work); return result

    def save_review(self, p):
        with self.mutation("review.save", p) as (state, cached, commit):
            if cached is not None: return cached
            self.item(state, "runs", p.get("run_id")); require(p.get("decision") in ["accepted", "needs-work", "observed", "excluded"], "Choose an explicit review disposition")
            require(isinstance(p.get("notes"), str) and p["notes"].strip(), "Retain a reason for the review decision")
            review = {"id": "review-" + uuid.uuid4().hex, "run_id": p["run_id"], "decision": p["decision"], "reviewer": str(p.get("reviewer", "")), "notes": p["notes"], "created_at": now()}
            state["reviews"].append(review); commit(review); return review

    def export(self, output=None):
        with NATIVE_LOCK, open(self.directory / ".writer.lock", "a+b") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX); state = self.state()
            temp = self.directory / ("transfer-" + uuid.uuid4().hex + ".zip")
            inventory = []
            with zipfile.ZipFile(temp, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                state_bytes = canonical(state).encode(); archive.writestr("project/workspace.json", state_bytes)
                inventory.append({"path": "project/workspace.json", "sha256": hashlib.sha256(state_bytes).hexdigest(), "bytes": len(state_bytes)})
                objects = {v["sha256"] for v in state["sources"]} | {f["sha256"] for run in state["runs"] for f in run["files"]}
                for sha in sorted(objects):
                    path = self.object_path(sha); require(digest_file(path) == sha, "A project object changed", "NETCDF_SOURCE_CHANGED")
                    name = "project/objects/" + sha; archive.write(path, name); inventory.append({"path": name, "sha256": sha, "bytes": path.stat().st_size})
                for path in sorted(SOURCE_ROOT.rglob("*")):
                    if not path.is_file() or path.is_symlink() or any(part.startswith(".") or part in ["__pycache__", "node_modules"] for part in path.relative_to(SOURCE_ROOT).parts): continue
                    if path.name != "LICENSE" and path.suffix not in [".py", ".mjs", ".mts", ".ts", ".js", ".html", ".css", ".md", ".txt", ".json"]: continue
                    name = "application/" + path.relative_to(SOURCE_ROOT).as_posix(); archive.write(path, name)
                    inventory.append({"path": name, "sha256": digest_file(path), "bytes": path.stat().st_size})
                archive.writestr("transfer.json", canonical({"schema": "stellar-forge.netcdf-transfer.v1", "project_id": state["project"]["id"], "members": inventory}))
            descriptor = self.put_file(temp, "NetCDF_Complete_Workspace.zip", "application/zip")
            if output:
                target = pathlib.Path(output).expanduser().resolve(); target.parent.mkdir(parents=True, exist_ok=True)
                require(not target.exists(), "Export output already exists; choose another filename", "NETCDF_RECEIVE_CONFLICT")
                shutil.copyfile(temp, target); descriptor["path"] = str(target)
            temp.unlink(); return descriptor

    @staticmethod
    def receive(archive_path, destination, expected_sha):
        path, target = pathlib.Path(archive_path).resolve(), pathlib.Path(destination).expanduser().resolve()
        require(isinstance(expected_sha, str) and SHA.fullmatch(expected_sha), "Receiving requires the original full archive SHA-256")
        require(path.is_file() and digest_file(path) == expected_sha, "The complete received archive digest differs", "NETCDF_SOURCE_CHANGED")
        if target.exists():
            receipt = target / "receiving.json"
            require(receipt.is_file() and json.loads(receipt.read_text())["archive_sha256"] == expected_sha, "Receiving destination already belongs to another project", "NETCDF_RECEIVE_CONFLICT")
            Workspace.verify_received(target)
            return {"directory": str(target), "binding": Workspace(target).binding()}
        target.parent.mkdir(parents=True, exist_ok=True); stage = target.with_name("." + target.name + "." + expected_sha[:16] + ".receiving")
        stage.mkdir(mode=0o700, exist_ok=True)
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist(); require(len(names) == len(set(names)), "Duplicate archive members")
            transfer = json.loads(archive.read("transfer.json")); require(transfer.get("schema") == "stellar-forge.netcdf-transfer.v1", "Unknown NetCDF transfer schema")
            members = transfer.get("members"); require(isinstance(members, list), "Transfer inventory is missing")
            require(set(names) == {v["path"] for v in members} | {"transfer.json"}, "Transfer inventory differs from the complete archive")
            require(len(members) == len({v["path"] for v in members}), "Duplicate inventory member")
            for member in members:
                name = member["path"]; pure = pathlib.PurePosixPath(name)
                require(not pure.is_absolute() and ".." not in pure.parts and pure.parts[0] in ["project", "application"] and "\\" not in name, "Unsafe transfer member")
                info = archive.getinfo(name); require((info.external_attr >> 16) & 0o170000 != 0o120000, "Transfer symlinks are rejected")
                relative = pure.relative_to("project") if pure.parts[0] == "project" else pure
                out = stage.joinpath(*relative.parts); out.parent.mkdir(parents=True, exist_ok=True)
                if out.exists() and out.stat().st_size == member["bytes"] and digest_file(out) == member["sha256"]: continue
                temp = out.with_name(out.name + ".partial"); h, length = hashlib.sha256(), 0
                with archive.open(info) as original, open(temp, "wb") as writer:
                    for chunk in iter(lambda: original.read(1024 * 1024), b""):
                        writer.write(chunk); h.update(chunk); length += len(chunk)
                    writer.flush(); os.fsync(writer.fileno())
                require(h.hexdigest() == member["sha256"] and length == member["bytes"], "A complete transfer member changed", "NETCDF_SOURCE_CHANGED")
                os.chmod(temp, 0o600); os.replace(temp, out)
            state = json.loads((stage / "workspace.json").read_text()); require(state.get("schema") == SCHEMA and state["project"]["id"] == transfer["project_id"], "Received project identity changed")
            Workspace._write_json(stage / "receiving.json", {"schema": "stellar-forge.netcdf-receiving.v1", "archive_sha256": expected_sha, "received_at": now(), "transfer": transfer})
            Workspace.verify_received(stage); os.rename(stage, target)
        return {"directory": str(target), "binding": Workspace(target).binding()}

    @staticmethod
    def verify_received(directory):
        workspace = Workspace(directory); state = workspace.state()
        for source in state["sources"]: workspace.source_path(source)
        for run in state["runs"]:
            for file in run["files"]:
                path = workspace.object_path(file["sha256"])
                require(path.stat().st_size == file["bytes"] and digest_file(path) == file["sha256"], "A received result changed", "NETCDF_SOURCE_CHANGED")
        return True
