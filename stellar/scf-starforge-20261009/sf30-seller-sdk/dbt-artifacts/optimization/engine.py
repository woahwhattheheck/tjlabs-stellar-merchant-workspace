"""Run optimization over original dbt artifacts and original review transactions. MIT.

No warehouse calls. Numerical values remain decimal strings at API boundaries.
Plans are ordinary versioned Project reviews, so the original project exporter,
receiver, request journal, and optimistic-concurrency writer stay authoritative.
"""
from __future__ import annotations
from collections import Counter, defaultdict, deque, OrderedDict
from datetime import datetime, timezone, date
from decimal import Decimal, InvalidOperation, localcontext
import csv
import html
import io
import json
from pathlib import Path
import sys
from typing import Any
from functools import wraps

PARENT = Path(__file__).resolve().parents[1]
if str(PARENT) not in sys.path:
    sys.path.insert(0, str(PARENT))
from dbt_core import Project, Number, parse_json, literal
from dbt_store import ProjectError, require, json_bytes, identity, text, hash_id, regular_open
from operations import invoke as original_invoke

SCHEMA = "stellar-forge.dbt-run-optimization.v1"
PLAN_SCHEMA = "stellar-forge.dbt-optimization-plan.v1"
PREFIX = "optimization/"
ACTION_STATES = {"planned": "investigate", "in-progress": "investigate", "implemented": "correction-proposed", "measured": "accepted", "deferred": "excluded"}
READ_ACTIONS = {"inventory", "profile", "compare", "plans", "plan", "node"}


def exact_arithmetic(method):
    """Retain the admitted decimal precision through complete-population arithmetic."""
    @wraps(method)
    def execute(*args, **kwargs):
        with localcontext() as context:
            context.prec = 4096
            return method(*args, **kwargs)
    return execute


def number(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        return None
    try:
        if len(str(value)) > 2048:
            return None
        out = Decimal(str(value))
        return out if out.is_finite() and out >= 0 and abs(out.adjusted()) <= 1000 and out.as_tuple().exponent >= -1000 else None
    except (InvalidOperation, ValueError):
        return None


def ds(value: Decimal | int | None) -> str | None:
    if value is None:
        return None
    with localcontext() as context:
        context.prec = max(50, len(str(value)) + 20)
        result = format(Decimal(value), "f")
    if "." in result:
        result = result.rstrip("0").rstrip(".")
    return "0" if result in ("-0", "") else result


def ratio(a, b):
    if a is None or b is None or not b:
        return None
    with localcontext() as context:
        context.prec = 38
        return ds(a / b)


def timestamp(value):
    """Return exact UTC microseconds, rejecting timezone-less source timestamps."""
    if not isinstance(value, str) or isinstance(value, Number):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            return None
        delta = dt.astimezone(timezone.utc) - datetime(1970, 1, 1, tzinfo=timezone.utc)
        return (delta.days * 86400 + delta.seconds) * 1_000_000 + delta.microseconds
    except (ValueError, OverflowError):
        return None


def seconds(microseconds):
    return ds(Decimal(microseconds) / Decimal(1_000_000))


def intervals_union(items):
    merged = []
    for start, end in sorted(items):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged


def interval_total(items):
    return sum(b - a for a, b in intervals_union(items))


def _selection(value):
    require(isinstance(value, dict) and set(value) == {"edition", "run"}, "RUN_SELECTION_REQUIRED", "Select one edition and one of its run-results artifacts.")
    return {"edition": hash_id(value["edition"]), "run": hash_id(value["run"])}


def _plain(value):
    """Source numbers stay strings, including adapter-specific large integers."""
    if isinstance(value, dict):
        return {key: _plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_plain(item) for item in value]
    if isinstance(value, Number):
        return str(value)
    return value


class RunOptimization:
    def __init__(self, project: Project):
        self.project = project
        self._cache = OrderedDict()

    def inventory(self):
        artifacts = {item["id"]: item for item in self.project.artifacts()}
        editions = []
        for edition in self.project.editions():
            runs = []
            for aid in edition["runs"]:
                artifact = artifacts[aid]
                runs.append({"id": aid, "name": artifact["name"], "metadata": artifact["metadata"], "observations": artifact["node_count"]})
            editions.append({"id": edition["id"], "title": edition["title"], "created_at": edition["created_at"], "manifest": edition["manifest"], "runs": runs})
        return {"schema": SCHEMA, "project": self.project.info, "editions": editions, "plans": self.plans()}

    def _source(self, digest):
        self.project.verify_object(digest)
        with regular_open(self.project.object_path(digest)) as src:
            return parse_json(src.read())

    @exact_arithmetic
    def profile(self, selection):
        selected = _selection(selection)
        key = (selected["edition"], selected["run"])
        if key in self._cache:
            self.project.verify_object(selected["run"])
            self.project.verify_object(self._cache[key]["source"]["manifest_sha256"])
            self._cache.move_to_end(key)
            return self._cache[key]
        edition = self.project.edition(selected["edition"])
        require(selected["run"] in edition["runs"], "RUN_NOT_IN_EDITION")
        artifact = self.project.artifact(selected["run"])
        require(artifact["supported"] and artifact["kind"] == "run-results", "RUN_RESULTS_REQUIRED")
        source = self._source(selected["run"])
        manifest = self._source(edition["manifest"])
        node_map = {}
        for section in ("nodes", "sources", "exposures", "metrics", "semantic_models", "saved_queries", "unit_tests"):
            node_map.update(manifest.get(section) or {})
        # Macro edges are source dependencies, not timed run prerequisites.
        parents = {uid: set((node.get("depends_on") or {}).get("nodes") or []) for uid, node in node_map.items()}
        warnings = []
        metadata = _plain(source.get("metadata") or {})
        args = _plain(source.get("args") or {})
        manifest_metadata = manifest.get("metadata") or {}
        if metadata.get("invocation_id") != manifest_metadata.get("invocation_id") or not metadata.get("invocation_id"):
            warnings.append("Manifest and run have distinct or unreported invocation IDs; their explicit edition association is retained.")
        rows, execute_intervals, thread_intervals = [], [], defaultdict(list)
        counts = Counter(item.get("unique_id") for item in source.get("results", []))
        statuses = Counter()
        total = Decimal(0)
        invalid_times = 0
        for ordinal, result in enumerate(source.get("results", [])):
            uid = result["unique_id"]
            node = node_map.get(uid) or {}
            duration = number(result.get("execution_time"))
            # Values from imported source must be JSON numbers, not quoted text.
            if result.get("execution_time") is not None and not isinstance(result["execution_time"], Number):
                duration = None
            if duration is None:
                invalid_times += 1
            else:
                total += duration
            statuses[result.get("status", "unreported")] += 1
            by_stage = defaultdict(list)
            raw_stages = []
            timing_warnings = []
            for stage in result.get("timing") or []:
                start, end = timestamp(stage.get("started_at")), timestamp(stage.get("completed_at"))
                name = str(stage.get("name", "unreported"))
                valid = start is not None and end is not None and end >= start
                raw_stages.append({"name": name, "started_at": stage.get("started_at"), "completed_at": stage.get("completed_at"), "seconds": seconds(end-start) if valid else None})
                if not valid:
                    timing_warnings.append("An incomplete, reversed, or timezone-less stage has no calculated duration.")
                    continue
                by_stage[name].append((start, end))
            thread = result.get("thread_id") or "unreported"
            for start, end in intervals_union(by_stage.get("execute", [])):
                execute_intervals.append((start, end, ordinal, thread))
                thread_intervals[thread].append((start, end))
            stages = {name: seconds(interval_total(items)) for name, items in by_stage.items()}
            row = {"ordinal": ordinal, "uid": uid, "name": node.get("name") or uid, "resource_type": node.get("resource_type") or "unmatched",
                   "path": node.get("original_file_path") or node.get("path") or "", "package": node.get("package_name") or "",
                   "materialization": (node.get("config") or {}).get("materialized"), "status": result.get("status"), "thread": thread,
                   "execution_seconds": ds(duration), "compile_seconds": stages.get("compile"), "execute_seconds": stages.get("execute"),
                   "stages": raw_stages, "adapter_response": _plain(result.get("adapter_response") or {}),
                   "definition_sha256": identity(_plain({k: node[k] for k in ("raw_code", "raw_sql", "config", "depends_on", "checksum") if k in node})) if node else None,
                   "source_present": bool(node), "duplicate_observation": counts[uid] > 1, "dependencies": sorted(parents.get(uid, set())), "warnings": timing_warnings}
            rows.append(row)
        if invalid_times:
            warnings.append(f"{invalid_times} observations have missing or invalid execution_time; their durations remain unreported.")
        duplicate_ids = sorted(uid for uid, count in counts.items() if count > 1)
        if duplicate_ids:
            warnings.append("Repeated unique_id observations remain separate; they are excluded from one-to-one timing comparison and weighted paths.")
        elapsed = number(source.get("elapsed_time")) if isinstance(source.get("elapsed_time"), Number) else None
        if elapsed is None:
            warnings.append("Invocation elapsed_time is missing or invalid.")
        path_result = self._dependency_path(rows, parents)
        if path_result["cycle_or_downstream"]:
            warnings.append("The observed graph contains a cycle; no longest dependency-path value is returned.")
        events = defaultdict(int)
        for start, end, _, _ in execute_intervals:
            if end > start:
                events[start] += 1
                events[end] -= 1
        active, previous, histogram = 0, None, Counter()
        for at, delta in sorted(events.items()):
            if previous is not None and at > previous:
                histogram[active] += at - previous
            active += delta
            previous = at
        execution_span = max(events) - min(events) if events else None
        busy = sum(micros for depth, micros in histogram.items() if depth > 0)
        work = sum(depth * micros for depth, micros in histogram.items())
        for thread, items in thread_intervals.items():
            if sum(b-a for a,b in items) > interval_total(items):
                warnings.append(f"Reported thread {thread} contains overlapping execute intervals; inspect its original source timings.")
        threads = [{"name": name, "execute_active_seconds": seconds(interval_total(items)), "execute_intervals": len(items)} for name, items in sorted(thread_intervals.items())]
        out = {"schema": SCHEMA, "selection": selected, "edition_title": edition["title"], "artifact_name": artifact["name"],
               "source": {"run_sha256": selected["run"], "manifest_sha256": edition["manifest"], "metadata": metadata, "args": args,
                          "generated_at": metadata.get("generated_at"), "command": args.get("which") or args.get("rpc_method")},
               "summary": {"observations": len(rows), "unique_resources": len(counts), "manifest_resources": len(node_map),
                           "manifest_without_observation": len(set(node_map)-set(counts)), "unmatched_observations": sum(not row["source_present"] for row in rows),
                           "valid_execution_times": len(rows)-invalid_times, "invocation_elapsed_seconds": ds(elapsed),
                           "summed_node_seconds": ds(total) if len(rows)>invalid_times else None, "status_counts": dict(sorted(statuses.items())),
                           "execute_span_seconds": seconds(execution_span) if execution_span is not None else None,
                           "execute_active_seconds": seconds(busy) if events else None,
                           "mean_execute_concurrency": ratio(Decimal(work), Decimal(execution_span)) if execution_span else None,
                           "peak_execute_concurrency": max((depth for depth, micros in histogram.items() if micros > 0), default=None)},
               "timing_concurrency": [{"active_observations": depth, "seconds": seconds(micros)} for depth, micros in sorted(histogram.items())],
               "threads": threads, "weighted_dependency_path": path_result, "duplicate_ids": duplicate_ids, "warnings": warnings,
               "rows": sorted(rows, key=lambda row: (-(number(row["execution_seconds"]) or Decimal(0)), row["uid"], row["ordinal"]))}
        self._cache[key] = out
        # Bound retained work by serialized size as well as entry count. A large
        # one-shot profile remains complete but is not kept for the next request.
        while len(self._cache) > 4 or sum(len(json_bytes(item)) for item in self._cache.values()) > 24 * 1024**2:
            self._cache.popitem(last=False)
        return out

    @staticmethod
    def _dependency_path(rows, parents):
        timed = {row["uid"]: number(row["execution_seconds"]) for row in rows if not row["duplicate_observation"] and row["source_present"] and row["execution_seconds"] is not None}
        incoming = {uid: set(parents.get(uid, set())) & timed.keys() for uid in timed}
        unresolved = sorted({parent for uid in timed for parent in parents.get(uid, set()) if parent not in timed})
        children = defaultdict(set)
        degree = {}
        for child, values in incoming.items():
            degree[child] = len(values)
            for parent in values:
                children[parent].add(child)
        queue = deque(sorted(uid for uid, count in degree.items() if not count))
        distance, previous, order = {}, {}, []
        while queue:
            uid = queue.popleft()
            options = incoming[uid]
            parent = max(options, key=lambda key: (distance[key], key)) if options else None
            distance[uid] = timed[uid] + (distance[parent] if parent else Decimal(0))
            previous[uid] = parent
            order.append(uid)
            for child in sorted(children[uid]):
                degree[child] -= 1
                if degree[child] == 0:
                    queue.append(child)
        cycle = sorted(set(timed) - set(order))
        path, weighted = [], None
        if not cycle and distance:
            last = max(distance, key=lambda key: (distance[key], key))
            weighted = distance[last]
            while last is not None:
                path.append(last)
                last = previous[last]
            path.reverse()
        return {"seconds": ds(weighted), "resources": path, "timed_resources": len(timed), "unobserved_dependencies": unresolved,
                "cycle_or_downstream": cycle, "interpretation": "Longest dependency path weighted by selected node execution_time, not observed wall-clock critical path. Only uniquely observed, timed manifest nodes participate."}

    @exact_arithmetic
    def compare(self, before, after):
        left, right = self.profile(before), self.profile(after)
        a = {row["uid"]: row for row in left["rows"] if not row["duplicate_observation"]}
        b = {row["uid"]: row for row in right["rows"] if not row["duplicate_observation"]}
        all_ids = {row["uid"] for row in left["rows"] + right["rows"]}
        duplicate = set(left["duplicate_ids"]) | set(right["duplicate_ids"])
        rows, notes = [], []
        total_before, total_after = Decimal(0), Decimal(0)
        eligible = 0
        statuses_comparable = {"success", "pass", "warn"}
        for uid in sorted(all_ids):
            previous, current = a.get(uid), b.get(uid)
            p = number(previous["execution_seconds"]) if previous else None
            c = number(current["execution_seconds"]) if current else None
            match = "paired" if previous and current else "only-before" if previous else "only-after"
            if uid in duplicate:
                match = "ambiguous-repeated-id"
            timing_delta = c-p if match == "paired" and p is not None and c is not None else None
            comparable = bool(timing_delta is not None and previous["status"] == current["status"] and previous["status"] in statuses_comparable and previous["source_present"] and current["source_present"])
            if comparable:
                total_before += p
                total_after += c
                eligible += 1
            item = {"uid": uid, "name": (current or previous or {}).get("name", uid), "match": match,
                    "before_seconds": ds(p), "after_seconds": ds(c), "delta_seconds": ds(timing_delta),
                    "percent_change": ratio(timing_delta * 100, p) if timing_delta is not None else None,
                    "before_status": previous["status"] if previous else None, "after_status": current["status"] if current else None,
                    "definition_changed": previous["definition_sha256"] != current["definition_sha256"] if previous and current else None,
                    "same_status_observed_pair": comparable, "before": previous, "after": current}
            rows.append(item)
        if left["selection"]["run"] == right["selection"]["run"]:
            notes.append("Both selections refer to the same retained run artifact.")
        if set(a) != set(b) or duplicate:
            notes.append("Observed populations differ or contain repeated IDs. Invocation elapsed-time difference is shown separately from paired resource timing.")
        largs, rargs = left["source"]["args"], right["source"]["args"]
        context_changes = {key: {"before": largs.get(key), "after": rargs.get(key)} for key in sorted(set(largs)|set(rargs)) if largs.get(key) != rargs.get(key)}
        if context_changes:
            notes.append("Invocation arguments differ; inspect the full context changes before attributing timing differences.")
        if left["source"]["metadata"].get("dbt_version") != right["source"]["metadata"].get("dbt_version"):
            notes.append("dbt versions differ between selected sources.")
        elapsed_a, elapsed_b = number(left["summary"]["invocation_elapsed_seconds"]), number(right["summary"]["invocation_elapsed_seconds"])
        return {"schema": SCHEMA, "before": left, "after": right, "context_changes": context_changes,
                "summary": {"paired_same_status_resources": eligible, "paired_before_seconds": ds(total_before) if eligible else None,
                            "paired_after_seconds": ds(total_after) if eligible else None, "paired_delta_seconds": ds(total_after-total_before) if eligible else None,
                            "invocation_delta_seconds": ds(elapsed_b-elapsed_a) if elapsed_a is not None and elapsed_b is not None else None,
                            "only_before": sum(row["match"] == "only-before" for row in rows), "only_after": sum(row["match"] == "only-after" for row in rows),
                            "ambiguous_resources": len(duplicate)},
                "warnings": notes, "rows": sorted(rows, key=lambda row: (row["delta_seconds"] is None, -abs(Decimal(row["delta_seconds"] or "0")), row["uid"]))}

    def plan_payload(self, value):
        require(isinstance(value, dict) and set(value) <= {"name", "reviewer", "objective", "before", "after", "actions", "expected_revision", "request_id"}, "INVALID_PLAN")
        name = text(value.get("name"), "plan_name", 110)
        before = _selection(value.get("before"))
        after = _selection(value["after"]) if value.get("after") else None
        base = self.profile(before)
        current = self.profile(after) if after else base
        # Plan only measured source resources; unmatched output identities remain
        # inspectable in profiles but cannot become a native resource review.
        allowed = {row["uid"] for row in base["rows"] + current["rows"] if row["source_present"]}
        actions = value.get("actions")
        require(isinstance(actions, list) and actions, "PLAN_ACTIONS_REQUIRED")
        decisions, selection = {}, []
        for action in actions:
            require(isinstance(action, dict) and set(action) <= {"schema", "uid", "owner", "due", "state", "change", "expected_reduction_seconds", "notes"}, "INVALID_PLAN_ACTION")
            require("schema" not in action or action["schema"] == PLAN_SCHEMA, "INVALID_PLAN_ACTION_SCHEMA")
            uid = text(action.get("uid"), "unique_id", 2048)
            require(uid in allowed and uid not in decisions, "INVALID_PLAN_RESOURCE", "Select each observed manifest resource once.")
            state = action.get("state", "planned")
            require(state in ACTION_STATES, "INVALID_PLAN_STATE")
            due = action.get("due") or None
            if due:
                require(isinstance(due, str) and date.fromisoformat(due).isoformat() == due, "INVALID_DUE_DATE")
            expected = action.get("expected_reduction_seconds")
            require(expected in (None, "") or number(expected) is not None, "INVALID_EXPECTED_REDUCTION")
            item = {"schema": PLAN_SCHEMA, "uid": uid, "owner": text(action.get("owner", ""), "owner", 256, True),
                    "due": due, "state": state, "change": text(action.get("change"), "change", 8192),
                    "expected_reduction_seconds": None if expected in (None, "") else ds(number(expected)),
                    "notes": text(action.get("notes", ""), "notes", 8192, True)}
            selection.append(uid)
            decisions[uid] = {"status": ACTION_STATES[state], "note": json_bytes(item).decode().strip()}
        header = {"schema": PLAN_SCHEMA, "name": name, "objective": text(value.get("objective", ""), "objective", 8192, True),
                  "before": before, "after": after, "method": "Original run observations and explicit operator proposals; estimated reduction is an unexecuted hypothesis."}
        payload = {"name": PREFIX+name, "edition": current["selection"]["edition"], "baseline": base["selection"]["edition"],
                   "selection": selection, "decisions": decisions, "reviewer": text(value.get("reviewer"), "reviewer", 128),
                   "note": json_bytes(header).decode().strip(), "expected_revision": value.get("expected_revision", 0)}
        if "request_id" in value:
            payload["request_id"] = value["request_id"]
        return payload

    @staticmethod
    def _decode_review(review):
        try:
            header = json.loads(review["note"])
        except (ValueError, TypeError):
            return None
        if not isinstance(header, dict) or header.get("schema") != PLAN_SCHEMA:
            return None
        require(review["name"] == PREFIX+header["name"], "PLAN_NAME_CHANGED")
        require(review["baseline"] == header["before"]["edition"] and review["edition"] == (header.get("after") or header["before"])["edition"], "PLAN_SOURCE_CHANGED")
        actions = []
        for uid in review["selection"]:
            decision = review["decisions"][uid]
            item = json.loads(decision["note"])
            require(item.get("schema") == PLAN_SCHEMA and item["uid"] == uid and ACTION_STATES.get(item["state"]) == decision["status"], "PLAN_ACTION_CHANGED")
            actions.append({key: value for key, value in item.items() if key != "schema"})
        return {**header, "id": review["id"], "revision": review["revision"], "previous": review["previous"], "created_at": review["created_at"], "reviewer": review["reviewer"], "actions": actions}

    def plans(self, name=None):
        reviews = self.project.reviews(PREFIX+name if name else None)
        return [item for review in reviews if review["name"].startswith(PREFIX) and (item := self._decode_review(review))]

    def plan(self, id):
        item = self._decode_review(self.project.review(id))
        require(item is not None, "OPTIMIZATION_PLAN_REQUIRED")
        return item

    def save(self, value):
        payload = self.plan_payload(value)
        require("request_id" in payload, "REQUEST_ID_REQUIRED")
        return self._decode_review(self.project.save_review(**payload))

    def report(self, *, format="html", selection=None, before=None, after=None, plan=None):
        require(format in ("html", "json", "csv"), "UNKNOWN_REPORT_FORMAT")
        if plan:
            saved = self.plan(plan)
            data = self.compare(saved["before"], saved["after"]) if saved["after"] else self.profile(saved["before"])
            data = {**data, "plan": saved}
        elif before is not None and after is not None:
            data = self.compare(before, after)
        else:
            data = self.profile(selection)
        body, mime = render_report(data, format)
        file = self.project.put_bytes(body, "run-optimization."+format)
        return {**file, "mime": mime, "format": format, "schema": SCHEMA}

    def call(self, action, value=None):
        value = value or {}
        require(isinstance(value, dict), "OBJECT_INPUT_REQUIRED")
        if action == "inventory":
            require(not value, "UNKNOWN_INPUT")
            return self.inventory()
        if action == "profile":
            return self.profile(value)
        if action == "compare":
            require(set(value) == {"before", "after"}, "PAIR_REQUIRED")
            return self.compare(**value)
        if action == "plans":
            require(set(value) <= {"name"}, "UNKNOWN_INPUT")
            return self.plans(**value)
        if action == "plan":
            require(set(value) == {"id"}, "UNKNOWN_INPUT")
            return self.plan(**value)
        if action == "save":
            return self.save(value)
        if action == "report":
            return self.report(**value)
        if action == "node":
            require(set(value) == {"edition", "uid"}, "UNKNOWN_INPUT")
            return self.project.node(value["edition"], value["uid"])
        if action in ("object.describe", "object.read", "export", "receive", "binding"):
            return original_invoke(self.project, action, value)
        raise ProjectError("UNKNOWN_OPTIMIZATION_ACTION")


def render_report(data, format):
    compared = "before" in data
    rows = data["rows"]
    if format == "json":
        return json_bytes(data), "application/json"
    fields = ["uid", "name", "match", "before_seconds", "after_seconds", "delta_seconds", "percent_change", "before_status", "after_status", "definition_changed", "same_status_observed_pair"] if compared else ["uid", "name", "resource_type", "path", "materialization", "status", "thread", "execution_seconds", "compile_seconds", "execute_seconds", "source_present", "duplicate_observation"]
    plans = {action["uid"]: action for action in data.get("plan", {}).get("actions", [])}
    if plans:
        fields += ["plan_owner", "plan_due", "plan_state", "plan_change", "expected_reduction_seconds", "plan_notes"]
    flat = []
    for row in rows:
        item = {key: row.get(key) for key in fields}
        if row["uid"] in plans:
            action = plans[row["uid"]]
            item.update({"plan_"+key: action.get(key) for key in ("owner", "due", "state", "change", "notes")})
            item["expected_reduction_seconds"] = action.get("expected_reduction_seconds")
        flat.append(item)
    if format == "csv":
        stream = io.StringIO(newline="")
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for item in flat:
            writer.writerow({key: ("'"+value if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")) and not key.endswith("seconds") and key != "percent_change" else value) for key, value in item.items()})
        return stream.getvalue().encode("utf-8"), "text/csv; charset=utf-8"
    esc = lambda value: html.escape("Unreported" if value is None else str(value))
    def table(items, selected_fields):
        return '<div class="table"><table><thead><tr>'+''.join('<th>'+esc(key.replace('_', ' ').title())+'</th>' for key in selected_fields)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+esc(item.get(key))+'</td>' for key in selected_fields)+'</tr>' for item in items)+'</tbody></table></div>'
    title = data.get("plan", {}).get("name") or "Run timing comparison" if compared else data.get("plan", {}).get("name") or data["edition_title"]
    parts = ['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#242424;background:#fff;margin:36px auto;padding:0 24px;max-width:1400px}h1{font-size:28px}h2{margin-top:34px}p{max-width:90ch}.table{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #d8d8d8;text-align:left;padding:9px;vertical-align:top;overflow-wrap:anywhere}th{background:#f2f2f2}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f6f6;padding:16px}.small{font-size:13px;color:#555}@media print{body{margin:0}th{display:table-header-group}.table{overflow:visible}tr{break-inside:avoid}}</style><body><p class="small">STARFORGE / DBT RUN OPTIMIZATION</p><h1>'+esc(title)+'</h1>']
    if "plan" in data:
        plan = data["plan"]
        parts.append('<p>'+esc(plan["objective"])+'</p><p>Revision '+str(plan["revision"])+'. Prepared by '+esc(plan["reviewer"])+'.</p>')
    parts.append('<h2>Timing measures</h2>'+table([data["summary"]], list(data["summary"])))
    parts.append('<p>Invocation elapsed time and the sum of node execution times measure different things. Node times can overlap. A paired difference is an observed change, not a causal estimate or a forecast.</p>')
    for warning in data.get("warnings", []):
        parts.append('<p>'+esc(warning)+'</p>')
    profiles = [data["before"], data["after"]] if compared else [data]
    for label, profile in zip((["Before", "After"] if compared else ["Selected run"]), profiles):
        parts.append('<h2>'+label+': '+esc(profile["edition_title"])+'</h2><p>'+esc(profile["source"]["command"] or "Command unreported")+' · '+esc(profile["source"]["generated_at"] or "Date unreported")+'</p>')
        parts.append('<p>Weighted dependency path: '+esc(profile["weighted_dependency_path"]["seconds"])+ ' seconds. '+esc(profile["weighted_dependency_path"]["interpretation"])+'</p>')
        if profile["weighted_dependency_path"]["resources"]:
            parts.append('<p>'+esc(' → '.join(profile["weighted_dependency_path"]["resources"]))+'</p>')
        parts.append(table(profile["threads"], ["name", "execute_active_seconds", "execute_intervals"]))
        parts.extend('<p>'+esc(item)+'</p>' for item in profile["warnings"])
    if plans:
        parts.append('<h2>Saved improvement actions</h2>'+table(list(plans.values()), ["uid", "owner", "due", "state", "change", "expected_reduction_seconds", "notes"]))
    parts.append('<h2>Complete resource population</h2>'+table(flat, fields))
    parts.append('<h2>Selected source identities and context</h2><pre>'+esc(json.dumps([{"selection": profile["selection"], "source": profile["source"], "weighted_dependency_path": profile["weighted_dependency_path"], "summary": profile["summary"]} for profile in profiles], ensure_ascii=False, indent=2))+'</pre>')
    parts.append('<p class="small">Original manifests and run artifacts, plan revisions, and editable reviews travel in the complete native project ZIP. Estimated reductions are operator proposals until a follow-up run is selected and interpreted.</p></body></html>')
    return '\n'.join(parts).encode('utf-8'), 'text/html; charset=utf-8'
