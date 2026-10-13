"""Compile reviewed source projections to native Drupal migration definitions."""
from copy import deepcopy
import re
from pathlib import PurePosixPath
from urllib.parse import urlsplit

from govhub import GovHubError, digest, packed, text
from .model import MISSING, at, issue

ID = re.compile(r"^govhub_[a-z0-9_]{1,49}$")
FIELD = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def ordered_migrations(migrations):
    by_id = {item["id"]: item for item in migrations}
    result, visiting, visited = [], set(), set()
    def visit(identity):
        if identity in visiting:
            raise GovHubError("MIGRATION_CYCLE", "Native migration dependencies contain a cycle at " + identity + ".")
        if identity in visited:
            return
        if identity not in by_id:
            raise GovHubError("MIGRATION_DEPENDENCY", "The complete plan must include native dependency " + identity + ".")
        visiting.add(identity)
        dependencies = by_id[identity].get("migration_dependencies", {})
        for key in ("required", "optional"):
            for parent in dependencies.get(key, []):
                if key == "required" or parent in by_id:
                    visit(parent)
        visiting.remove(identity)
        visited.add(identity)
        result.append(by_id[identity])
    for identity in by_id:
        visit(identity)
    return result


NATIVE_PROCESS_PLUGINS = {
    "get", "default_value", "concat", "extract", "static_map", "skip_on_empty",
    "migration_lookup", "sub_process", "file_copy", "format_date", "explode",
    "flatten", "urlencode", "null_coalesce",
}


def process_steps(value):
    return value if isinstance(value, list) else [value]


def copies_original_file(process):
    return any(isinstance(step, dict) and step.get("plugin") == "file_copy"
               for value in process.values() for step in process_steps(value))


def validate_process(value, ids, location="process", *, destination_plugin="", nested=False):
    problems = []
    if isinstance(value, list):
        if not value:
            problems.append(issue("NATIVE_PROCESS", "A native process pipeline must contain a source property or process step.", property=location))
        for n, part in enumerate(value):
            problems.extend(validate_process(part, ids, location + "/" + str(n),
                destination_plugin=destination_plugin, nested=nested))
    elif isinstance(value, dict):
        plugin = value.get("plugin")
        if not isinstance(plugin, str) or plugin not in NATIVE_PROCESS_PLUGINS:
            problems.append(issue("NATIVE_PROCESS_PLUGIN", "Select a supported installed Drupal core process plugin.", property=location, plugin=plugin))
        if plugin == "migration_lookup":
            selected = value.get("migration", [])
            selected = [selected] if isinstance(selected, str) else selected
            if not isinstance(selected, list) or not selected or any(not isinstance(x, str) or x not in ids for x in selected):
                problems.append(issue("LOOKUP_MIGRATION", "A relationship lookup must select declared native migrations.", property=location))
            if value.get("no_stub") is not True:
                problems.append(issue("LOOKUP_STUB", "Set no_stub: true and explicitly handle missing relationships in the native pipeline.", property=location))
        if plugin == "sub_process":
            inner = value.get("process", {})
            if not isinstance(inner, dict):
                problems.append(issue("NATIVE_PROCESS", "A sub_process needs its native destination-property mapping.", property=location))
            else:
                for field, definition in inner.items():
                    problems.extend(validate_process(definition, ids, location + "/" + str(field),
                        destination_plugin=destination_plugin, nested=True))
        if plugin == "file_copy":
            if nested or destination_plugin != "entity:file":
                problems.append(issue("MEDIA_COPY_LOCATION", "Copy original bytes in a separately bound entity:file migration at the top process level; map multi-value media through migration_lookup.", property=location))
            source = value.get("source")
            if not isinstance(source, list) or len(source) != 2 or source[0] != "_govhub_source_path" or not isinstance(source[1], str):
                problems.append(issue("MEDIA_COPY_SOURCE", "file_copy must select [_govhub_source_path, destination source property] from this row's reviewed original-file binding.", property=location))
            if value.get("move"):
                problems.append(issue("MEDIA_COPY_MOVE", "Retain original source files and select move: false.", property=location))
            if value.get("file_exists") not in ("use existing", "replace"):
                problems.append(issue("MEDIA_COPY_EXISTING", "Select the native file_copy policy use existing or replace.", property=location))
    elif not isinstance(value, str):
        problems.append(issue("NATIVE_PROCESS", "A mapped field needs a native source-property string or process plugin definition.", property=location))
    return problems


def compile_mapping(family, mapping, editions, retained_files):
    selected = mapping.get("migrations")
    if not isinstance(selected, list) or not selected:
        raise GovHubError("CONTENT_MAPPING", "Add the selected source-to-Drupal migrations.")
    ids = [item.get("id") for item in selected if isinstance(item, dict)]
    if len(ids) != len(selected) or any(not isinstance(i, str) or not ID.fullmatch(i) for i in ids) or len(set(ids)) != len(ids):
        raise GovHubError("MIGRATION_ID", "Use distinct stable native migration IDs beginning with govhub_ and containing at most 56 lowercase letters, digits, or underscores.")
    problems, migrations, lineage, source_refs, seen_uuids = [], [], [], {}, {}
    policies = set()
    for entry in selected:
        identity = entry["id"]
        edition = editions.get(entry.get("edition_id"))
        if not edition or edition["family_id"] != family["id"]:
            raise GovHubError("MAPPING_EDITION", "Choose a retained original source edition from this consolidation.")
        for file in edition["files"]:
            source_refs[file["id"]] = {"file_id": file["id"], "sha256": file["sha256"], "bytes": file["bytes"], "observed_at": edition["observed_at"], "label": edition["label"]}
        destination = deepcopy(entry.get("destination", {}))
        if not isinstance(destination, dict) or not re.fullmatch(r"entity:[a-z][a-z0-9_]*", destination.get("plugin", "")):
            raise GovHubError("CONTENT_DESTINATION", "Select the installed Drupal content-entity destination, for example entity:node.")
        if destination.get("default_bundle") and not FIELD.fullmatch(destination["default_bundle"]):
            raise GovHubError("CONTENT_BUNDLE", "Select the exact native machine name for the content bundle.")
        process = deepcopy(entry.get("process", {}))
        if not isinstance(process, dict) or not process:
            raise GovHubError("CONTENT_PROCESS", "Map the selected fields using Drupal's original process definitions.")
        process_order = entry.get("process_order", list(process))
        if not isinstance(process_order, list) or len(process_order) != len(process) or set(process_order) != set(process):
            raise GovHubError("PROCESS_ORDER", "Retain each native destination property once in its original processing order.")
        for field, definition in process.items():
            problems.extend(dict(p, migration_id=identity) for p in validate_process(definition, set(ids), field, destination_plugin=destination["plugin"]))
        policy = entry.get("existing_target_policy", "CREATE_ONLY")
        if policy not in {"CREATE_ONLY", "REVIEWED_FIELD_UPDATE", "REUSE_SELECTED"}:
            raise GovHubError("CONTENT_UPDATE_POLICY", "Select the existing-target policy for each native migration.")
        policies.add(policy)
        if policy == "REUSE_SELECTED":
            destination["overwrite_properties"] = []
        if policy == "REVIEWED_FIELD_UPDATE" and not destination.get("overwrite_properties"):
            problems.append(issue("UPDATE_FIELDS", "Name the exact native destination fields that may update existing target records.", migration_id=identity))
        removal = entry.get("removal_policy", "RETAIN_TARGET")
        if removal != "RETAIN_TARGET":
            problems.append(issue("REMOVAL_INSTRUCTION", "Source refresh retains missing target rows. Use a separately reviewed native rollback for selected migration-owned records.", migration_id=identity))
        projection = entry.get("projection", {})
        if not isinstance(projection, dict) or any(not isinstance(k, str) or not FIELD.fullmatch(k) or not isinstance(v, str) for k, v in projection.items()):
            raise GovHubError("CONTENT_PROJECTION", "Map native source-property names to original literal fields or JSON pointers.")
        key_names = entry.get("source_ids") or ["source_id" if len(edition["record_keys"]) == 1 else "source_id_" + str(i + 1) for i in range(len(edition["record_keys"]))]
        if not isinstance(key_names, list) or len(key_names) != len(edition["record_keys"]) or len(set(key_names)) != len(key_names) or any(not isinstance(k, str) or not FIELD.fullmatch(k) for k in key_names):
            raise GovHubError("CONTENT_SOURCE_IDS", "Name one native source ID property for each original key field, in the same order.")
        choose = entry.get("selected_keys")
        if choose is not None and (not isinstance(choose, list) or any(not isinstance(k, list) or len(k) != len(key_names) or any(not isinstance(v, str) for v in k) for k in choose)):
            raise GovHubError("CONTENT_SELECTION", "Select complete original source-key arrays, preserving their order and exact strings.")
        chosen = {packed(v) for v in choose} if choose is not None else None
        for problem in edition["issues"]:
            # An explicit subset can leave other retained source rows for a
            # later mapping. Whole-feed completeness issues still apply.
            if chosen is not None:
                if "keys" in problem and packed(problem["keys"]) not in chosen:
                    continue
                if "row" in problem:
                    row = edition["rows"][problem["row"] - 1]
                    if packed(row["keys"]) not in chosen:
                        continue
            problems.append(dict(problem, migration_id=identity, edition_id=edition["id"]))
        selected_bindings = entry.get("file_bindings", [])
        if not isinstance(selected_bindings, list):
            raise GovHubError("CONTENT_FILE_BINDINGS", "Map original source-key arrays to retained original file IDs.")
        bound_files = {}
        for binding in selected_bindings:
            if not isinstance(binding, dict):
                raise GovHubError("CONTENT_FILE_BINDINGS", "Each file binding selects original source_ids and one retained file_id.")
            source_ids = binding.get("source_ids")
            file_id = binding.get("file_id")
            if not isinstance(source_ids, list) or len(source_ids) != len(key_names) or any(not isinstance(v, str) or not v for v in source_ids) or not isinstance(file_id, str) or not file_id:
                raise GovHubError("CONTENT_FILE_BINDINGS", "Retain each complete original source-key array and one actual retained file ID.")
            key = packed(source_ids)
            if key in bound_files:
                raise GovHubError("CONTENT_FILE_BINDINGS", "Each original source-key array has one reviewed file binding.")
            bound_files[key] = file_id
            if file_id not in retained_files:
                problems.append(issue("MEDIA_BINDING", "Retain this original media file before reviewing the mapping.", migration_id=identity, keys=source_ids, file_id=file_id))
        copies_file = copies_original_file(process)
        rows, found = [], set()
        for original in edition["rows"]:
            source_key = packed(original["keys"])
            if chosen is not None and source_key not in chosen:
                continue
            found.add(source_key)
            if not original["keys"]:
                continue
            row = deepcopy(original["data"]) if not projection else {}
            for field, path in projection.items():
                value = at(original["data"], path)
                if value is MISSING:
                    problems.append(issue("SOURCE_PROPERTY", "The selected source property is absent from this original row.", migration_id=identity, keys=original["keys"], property=path))
                else:
                    row[field] = deepcopy(value)
            for name, value in zip(key_names, original["keys"]):
                row[name] = value
            if source_key in bound_files:
                if row.get("_govhub_file_id") and row["_govhub_file_id"] != bound_files[source_key]:
                    problems.append(issue("MEDIA_BINDING_CONFLICT", "The projected source row and reviewed binding select different retained media files.", migration_id=identity, keys=original["keys"]))
                row["_govhub_file_id"] = bound_files[source_key]
            if "_govhub_source_path" in row or "_govhub_file_sha256" in row:
                problems.append(issue("MEDIA_RUNTIME_PROPERTY", "Native source paths and hashes come from the verified retained-file binding. Exclude runtime helper properties from the source projection.", migration_id=identity, keys=original["keys"]))
            if copies_file and (not isinstance(row.get("_govhub_file_id"), str) or not row.get("_govhub_file_id")):
                problems.append(issue("MEDIA_ROW_BINDING", "Every selected file-copy row needs its reviewed retained-file binding.", migration_id=identity, keys=original["keys"]))
            for required in entry.get("required_source_fields", []):
                value = at(row, required)
                if value is MISSING or value is None or value == "" or value == []:
                    problems.append(issue("REQUIRED_SOURCE", "Supply the required source value before migration.", migration_id=identity, keys=original["keys"], property=required))
            if row.get("_govhub_file_id") and (not isinstance(row["_govhub_file_id"], str) or row["_govhub_file_id"] not in retained_files):
                problems.append(issue("MEDIA_BINDING", "The selected media row needs its complete retained original file.", migration_id=identity, keys=original["keys"], file_id=row["_govhub_file_id"]))
            uuid_source = process.get("uuid")
            uuid_value = at(row, uuid_source) if isinstance(uuid_source, str) else MISSING
            if uuid_value is not MISSING and uuid_value:
                target = (destination["plugin"], str(uuid_value), str(row.get("langcode", "")))
                if target in seen_uuids:
                    problems.append(issue("DUPLICATE_TARGET_UUID", "Two selected source records map to the same target UUID and language.", migration_id=identity, keys=original["keys"], previous=seen_uuids[target]))
                seen_uuids[target] = {"migration_id": identity, "keys": original["keys"]}
            rows.append(row)
            lineage.append({"migration_id": identity, "source_ids": original["keys"], "edition_id": edition["id"], "file_id": original["file_id"], "source_row": original["source_row"], "original_row_sha256": original["row_sha256"], **{k: original[k] for k in ("source_line_start", "source_line_end") if k in original}})
        for absent in sorted(set(bound_files) - found):
            problems.append(issue("MEDIA_BINDING_SOURCE", "The reviewed media binding must select a source key included in this migration.", migration_id=identity, keys=absent, file_id=bound_files[absent]))
        if chosen is not None:
            for absent in sorted(chosen - found):
                problems.append(issue("SELECTED_KEY_MISSING", "The selected original key is missing from this source edition.", migration_id=identity, keys=absent))
        migration = {"id": identity, "label": text(entry.get("label", identity), 500, True), "source": {"id_order": key_names, "ids": {name: {"type": "string"} for name in key_names}, "fields": {name: name for name in sorted({key for row in rows for key in row})}, "rows": rows}, "process": process, "process_order": process_order, "destination": destination, "existing_target_policy": policy, "migration_dependencies": deepcopy(entry.get("migration_dependencies", {"required": [], "optional": []})), "receiving": deepcopy(entry.get("receiving") or {"fields": list(dict.fromkeys(field.split("/")[0] for field in process if not field.startswith("_")))})}
        if not migration["receiving"].get("fields"):
            migration["receiving"]["fields"] = list(dict.fromkeys(field.split("/")[0] for field in process if not field.startswith("_")))
        migrations.append(migration)
    migrations = ordered_migrations(migrations)
    files, file_ids, paths = [], set(), set()
    for binding in mapping.get("files", []):
        item = retained_files.get(binding.get("file_id"))
        if not item:
            raise GovHubError("CONTENT_FILE", "Select an original retained media or source file.")
        relative = text(binding.get("relative_path", item["filename"]), 2000, True)
        path = PurePosixPath(relative)
        if path.is_absolute() or ".." in path.parts or "\\" in relative or relative in paths or item["id"] in file_ids:
            raise GovHubError("CONTENT_FILE_PATH", "Each selected file needs one unique relative delivery path without traversal.")
        file_ids.add(item["id"]); paths.add(relative)
        files.append({"file_id": item["id"], "sha256": item["sha256"], "bytes": item["bytes"], "relative_path": relative, "media_type": text(binding.get("media_type", ""), 500), "license": text(binding.get("license", ""), 8000), "source_url": text(binding.get("source_url", ""), 4000)})
    for migration in migrations:
        for row in migration["source"]["rows"]:
            if row.get("_govhub_file_id") and (not isinstance(row["_govhub_file_id"], str) or row["_govhub_file_id"] not in file_ids):
                problems.append(issue("MEDIA_FILE_SELECTION", "Include this row's original bytes in the plan's selected files.", migration_id=migration["id"], file_id=row["_govhub_file_id"]))
    routes = deepcopy(mapping.get("routes", []))
    for route in routes:
        if route.get("migration_id") not in ids or not isinstance(route.get("source_ids"), list) or any(not isinstance(v, str) for v in route["source_ids"]):
            raise GovHubError("CONTENT_ROUTE", "Each selected route must identify its original migration and source keys.")
        for name in ("old_url", "new_url"):
            parsed = urlsplit(route.get(name, ""))
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
                raise GovHubError("CONTENT_ROUTE", "Retain the complete original HTTP route and selected canonical URL.")
    scope = family.get("limits", {})
    counts = {"migrations": len(migrations), "records": sum(len(m["source"]["rows"]) for m in migrations), "files": len(files), "file_bytes": sum(f["bytes"] for f in files), "routes": len(routes)}
    for name, total in counts.items():
        if scope.get(name) is not None and total > scope[name]:
            problems.append(issue("SELECTED_SCOPE", "The selected content exceeds this consolidation's agreed " + name + " scope.", selected=total, agreed=scope[name]))
    fingerprint = digest(packed({"migrations": migrations, "files": files, "routes": routes}))
    return {"migrations": migrations, "source_refs": list(source_refs.values()), "files": files, "routes": routes, "lineage": lineage, "issues": problems, "counts": counts, "definition_sha256": fingerprint, "allow_existing_updates": "REVIEWED_FIELD_UPDATE" in policies}
