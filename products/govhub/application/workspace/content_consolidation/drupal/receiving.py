"""Original HTTP receiving for native Drupal UUIDs, files, and selected routes."""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from pathlib import Path
from urllib import error, parse, request

import native_adapter as base


def _url(value):
    parts = parse.urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password:
        raise ValueError("Receiving requires an original HTTP(S) URL without embedded credentials.")
    return value


def _origin(value):
    url = parse.urlsplit(value)
    return url.scheme.lower(), url.hostname.lower(), url.port or (443 if url.scheme == "https" else 80)


def _headers(config, target_uri, url, accept):
    headers = {"Accept": accept, "User-Agent": "GovHub-Content-Receiving/1.0"}
    if _origin(url) != _origin(target_uri):
        return headers
    for field, name, prefix in (("jsonapi_bearer_env", "Authorization", "Bearer "),
                                ("jsonapi_cookie_env", "Cookie", "")):
        reference = config.get(field)
        if reference:
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", reference):
                raise ValueError("Configure the name of the existing private receiving environment variable.")
            value = os.environ.get(reference)
            if not value or "\r" in value or "\n" in value:
                raise ValueError("The configured private receiving environment variable is unavailable or invalid: " + reference)
            headers[name] = prefix + value
    return headers


class Redirects(request.HTTPRedirectHandler):
    def __init__(self):
        self.chain = []

    def redirect_request(self, original, fp, code, message, headers, newurl):
        _url(newurl)
        self.chain.append({"status": code, "from": original.full_url, "to": newurl})
        result = super().redirect_request(original, fp, code, message, headers, newurl)
        if result and _origin(original.full_url) != _origin(newurl):
            for key in ("Authorization", "Cookie"):
                result.remove_header(key)
        return result


def fetch(session, config, label, url, *, accept="application/vnd.api+json", max_bytes=16777216):
    url = _url(url)
    output = session.out / "receiving"
    output.mkdir(exist_ok=True)
    record_path = output / (label + ".response.json")
    body_path = output / (label + ".body")
    redirect = Redirects()
    started = base._now()
    status, final_url, response_headers, failure, count = None, url, {}, None, 0
    digest = hashlib.sha256()
    temporary = body_path.with_name(body_path.name + ".partial")
    try:
        session.check()
        client = request.build_opener(redirect)
        req = request.Request(url, headers=_headers(config, session.p["uri"], url, accept), method="GET")
        try:
            response = client.open(req, timeout=min(30, session.p["timeout_seconds"]))
        except error.HTTPError as actual:
            response = actual
        with response:
            status, final_url = response.code, response.geturl()
            response_headers = {key.lower(): value for key, value in response.headers.items()
                                if key.lower() in {"content-type", "content-length", "etag", "last-modified", "location", "date", "content-language"}}
            with temporary.open("wb") as stream:
                while True:
                    session.check()
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    if count + len(chunk) > max_bytes:
                        raise ValueError("This original receiving body exceeds its selected byte limit.")
                    stream.write(chunk)
                    digest.update(chunk)
                    count += len(chunk)
                stream.flush()
                os.fsync(stream.fileno())
        os.replace(temporary, body_path)
    except base.NativeCancelled:
        raise
    except Exception as exc:
        failure = {"class": type(exc).__name__, "message": str(exc)}
    result = {"schema": "govhub.content-http-response.v1", "method": "GET", "url": url,
              "status": status, "final_url": final_url, "redirects": redirect.chain, "headers": response_headers,
              "started_at": started, "finished_at": base._now(), "error": failure}
    if body_path.is_file() and failure is None:
        result["body"] = {"path": str(body_path), "sha256": digest.hexdigest(), "bytes": count}
        session.add(body_path, "native_http_body", requested_url=url, status=status, content_type=response_headers.get("content-type"))
    elif temporary.is_file():
        result["partial_body"] = base._file(temporary, "incomplete_http_body")
        session.add(temporary, "incomplete_http_body", requested_url=url, status=status)
    base._atomic(record_path, result)
    session.add(record_path, "native_http_response")
    return result


def _row_key(value):
    return value.get("migration_id"), tuple(value.get("source_ids") or [])


def _same_place(left, right, *, query=True):
    a, b = parse.urlsplit(left), parse.urlsplit(right)
    return (_origin(left) == _origin(right)
            and parse.unquote(a.path or "/") == parse.unquote(b.path or "/")
            and (not query or a.query == b.query))


def _native_path_url(uri, path):
    if (not isinstance(path, str) or not path.startswith("/") or path.startswith("//")
            or parse.urlsplit(path).query or parse.urlsplit(path).fragment):
        raise ValueError("The original native alias and canonical path must be ordinary site paths.")
    site = parse.urlsplit(uri)
    root = parse.urlunsplit((site.scheme, site.netloc, site.path.rstrip("/") + "/", "", ""))
    return _url(parse.urljoin(root, parse.quote(path.lstrip("/"), safe="/:@-._~!$&'()*+,;=%")))


def _alias_snapshot(target, observation=None):
    if (not target or target.get("exists") is not True or not target.get("uuid")
            or not target.get("destination_ids")):
        raise ValueError("The selected native alias has no retained existing UUID.")
    fields = target.get("native_fields") or {}
    def field(name, fallback):
        values = fields.get(name)
        if isinstance(values, list) and len(values) == 1 and isinstance(values[0], dict):
            return values[0].get("value")
        return (observation or {}).get(fallback)
    return {key: target.get(key) for key in
            ("migration_id", "source_ids", "destination_ids", "uuid", "langcode")} | {
                "alias": field("alias", "native_alias"), "path": field("path", "native_path")}


def _receive_alias(session, config, native, route, migration, attempt, index):
    """Receive one original alias row through its native identity and real URL."""
    key = _row_key(route)
    observed = next((item for item in native.get("route_observations", [])
                     if item.get("mapping") == route), {})
    target = next((item for item in native.get("targets", []) if _row_key(item) == key), None)
    rollback = next((item for item in native.get("rollback", []) if _row_key(item) == key), None)
    rollback = rollback if native.get("action") == "rollback" else None
    result = {"mapping": route, "matched": False, "observation": "alias_resolution",
              "native_route": observed, "expected_present": not rollback or rollback.get("action") == "PRESERVE"}
    try:
        if migration.get("destination", {}).get("plugin") != "entity:path_alias":
            raise ValueError("The selected route is not bound to its original alias migration.")
        old = _url(parse.urljoin(session.p["uri"].rstrip("/") + "/", route["old_url"]))
        expected = _url(parse.urljoin(session.p["uri"].rstrip("/") + "/", route["new_url"]))
        result["expected_target_url"] = expected
        selected_action = rollback.get("action") if rollback else None
        if rollback:
            result["rollback_action"] = selected_action
            result["native_rollback"] = rollback
            target = rollback.get("before")
        if selected_action in {"ALREADY_UNMAPPED", "REMOVE_FAILED_MAP"} and not target:
            if rollback.get("destination_ids") or observed.get("kind") == "alias":
                raise ValueError("The original unmapped result still contains a mapped alias destination.")
            if selected_action == "ALREADY_UNMAPPED" and rollback.get("native_map_before") is not None:
                raise ValueError("The original already-unmapped result still contains a source map.")
            if _origin(old) != _origin(session.p["uri"]):
                raise ValueError("The selected removed alias URL belongs to another native site.")
            result["observation"] = "alias_unmapped"
        else:
            if not target or _row_key(target) != key or target.get("entity_type") != "path_alias":
                raise ValueError("The selected native alias row is missing from the original result.")
            snapshot = _alias_snapshot(target, observed if not rollback else None)
            for field in migration.get("receiving", {}).get("fields", []):
                if field not in (target.get("native_fields") or {}):
                    raise ValueError("The original native alias field is unavailable: " + field)
            alias_url = _native_path_url(session.p["uri"], snapshot["alias"])
            canonical_url = _native_path_url(session.p["uri"], snapshot["path"])
            result.update(native_alias=snapshot, canonical_url=canonical_url)
            if not _same_place(old, alias_url, query=False):
                raise ValueError("The selected old URL differs from the native alias's original site path.")
            if not any(_same_place(expected, candidate, query=False) for candidate in (alias_url, canonical_url)):
                raise ValueError("The selected target URL differs from the native alias or its canonical path.")
            if route.get("langcode") and route["langcode"] != snapshot["langcode"]:
                raise ValueError("The selected alias language differs from its native row.")
            if rollback:
                after = rollback.get("after")
                if not isinstance(after, dict) or any(after.get(field) != target.get(field)
                    for field in ("migration_id", "source_ids", "destination_ids", "entity_type")):
                    raise ValueError("The original rollback after-state does not identify this same alias row.")
                if selected_action == "DELETE":
                    if after.get("exists") is not False or after.get("entity_exists"):
                        raise ValueError("The selected native rollback did not remove its original alias entity.")
                    result["observation"] = "alias_removed"
                elif selected_action == "PRESERVE":
                    if _alias_snapshot(after) != snapshot:
                        raise ValueError("The selected preserved alias changed its native UUID, path or identity.")
                    result["observation"] = "alias_preserved"
                else:
                    raise ValueError("The original alias rollback has no supported retained outcome.")
            elif (observed.get("kind") != "alias"
                  or any(observed.get(field) != snapshot[value] for field, value in
                         (("native_uuid", "uuid"), ("native_alias", "alias"),
                          ("native_path", "path"), ("native_langcode", "langcode")))):
                raise ValueError("The original alias map and route observation identify different native destinations.")
        response = fetch(session, config, f"pass-{attempt:04d}-alias-{index:05d}", old,
                         accept="text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5")
        result["http"] = response
        if result["expected_present"]:
            allowed = (old, expected, result["canonical_url"])
            matched = (response["status"] == 200 and not response.get("error")
                       and any(_same_place(response["final_url"], value) for value in allowed))
        else:
            matched = (response["status"] in (404, 410) and not response.get("error")
                       and _same_place(response["final_url"], old))
        result["matched"] = matched
        if not matched:
            result["issue"] = ("The original alias did not resolve to its retained native target."
                               if result["expected_present"] else
                               "The selected removed or unmapped alias still resolves, or its original HTTP result is unavailable.")
    except base.NativeCancelled:
        raise
    except (ValueError, TypeError, KeyError) as exc:
        result["issue"] = str(exc)
    result["status"] = "COMPLETE" if result["matched"] else "FAILED"
    return result


def receive(session, config, native, plan, attempt):
    items, routes, problems = [], [], []
    cache = {}
    action = native.get("action")
    alias_migrations = {item["id"]: item for item in plan.get("migrations", [])
                        if item.get("destination", {}).get("plugin") == "entity:path_alias"}
    alias_routes = {_row_key(route) for route in plan.get("routes", [])
                    if route.get("migration_id") in alias_migrations}
    targets = list(native.get("targets", [])) if action != "rollback" else []
    if action == "rollback":
        for item in native.get("rollback", []):
            before = item.get("before")
            if before and (before.get("jsonapi", {}).get("available") or before.get("entity_type") == "path_alias"):
                targets.append({**before, "expected_present": item["action"] == "PRESERVE",
                                "rollback_action": item["action"], "after": item.get("after")})
    serial = 0
    network_failed = False
    for target in targets:
        session.check()
        selected = {key: target.get(key) for key in ("migration_id", "source_ids", "destination_ids", "entity_type", "bundle", "uuid", "langcode")}
        if target.get("entity_type") == "path_alias" and _row_key(target) in alias_routes:
            # The original native alias and actual route are received below,
            # independently of the account's JSON:API alias administration access.
            continue
        if not target.get("exists"):
            selected.update(status="FAILED", issue="The native mapped entity or selected translation is missing.")
            items.append(selected)
            problems.append(selected)
            continue
        if target.get("field_errors"):
            problems.append({**selected, "issue": "Selected native fields are unavailable.", "fields": target["field_errors"]})
        api = target.get("jsonapi") or {}
        if not api.get("available"):
            # Alias/redirect entities are received through the selected real route.
            route_bound = any(route.get("migration_id") == target["migration_id"]
                              and route.get("source_ids") == target["source_ids"] for route in plan.get("routes", []))
            if target["entity_type"] in ("path_alias", "redirect") and route_bound:
                selected.update(status="ROUTE_RECEIVING", detail=api.get("reason"))
            else:
                selected.update(status="FAILED", issue=api.get("reason", "The target has no installed JSON:API route."))
                problems.append(selected)
            items.append(selected)
            continue
        if network_failed:
            selected.update(status="PENDING", issue="Receiving stopped after the original target connection failed.")
            items.append(selected)
            problems.append(selected)
            continue
        url = api["url"]
        if url not in cache:
            serial += 1
            cache[url] = fetch(session, config, f"pass-{attempt:04d}-entity-{serial:05d}", url)
        response = cache[url]
        selected["http"] = response
        expected_present = target.get("expected_present", True)
        valid = False
        if not response.get("error") and response["status"] == 200 and response.get("body"):
            try:
                body = json.loads(Path(response["body"]["path"]).read_bytes())
                data = body.get("data")
                identity_matches = isinstance(data, dict) and data.get("id") == api["uuid"] and data.get("type") == api["type"]
                language_field = api.get("langcode_field")
                language_matches = not language_field or (identity_matches and data.get("attributes", {}).get(language_field) == target.get("langcode"))
                valid = expected_present and identity_matches and language_matches
                translation_fallback = (not expected_present and identity_matches and language_field
                                        and target.get("after", {}).get("missing_translation") == target.get("langcode")
                                        and data.get("attributes", {}).get(language_field) != target.get("langcode"))
                if translation_fallback:
                    valid = True
                    selected["translation_outcome"] = "The selected translation is removed; the actual endpoint returns another language."
                if valid:
                    selected["received"] = {"id": data["id"], "type": data["type"],
                                            "attributes": data.get("attributes", {}), "relationships": data.get("relationships", {})}
                    for native_field, public_field in api.get("field_names", {}).items():
                        if public_field not in data.get("attributes", {}) and public_field not in data.get("relationships", {}) and public_field != "id":
                            problems.append({**selected, "issue": "The original JSON:API body omitted the selected field.", "field": native_field, "public_field": public_field})
                            valid = False
                    if expected_present:
                        for native_field, references in target.get("relationships", {}).items():
                            public_field = api.get("field_names", {}).get(native_field)
                            relation = data.get("relationships", {}).get(public_field, {}).get("data")
                            linked = relation if isinstance(relation, list) else [relation] if isinstance(relation, dict) else []
                            received_ids = [item.get("id") for item in linked]
                            expected_ids = [item["uuid"] for item in references]
                            if received_ids != expected_ids:
                                problems.append({**selected, "issue": "The original JSON:API relationship differs from the native referenced UUID order.",
                                                 "field": native_field, "expected_uuids": expected_ids, "received_uuids": received_ids})
                                valid = False
                else:
                    selected["issue"] = "The original JSON:API resource identity differs from the native destination UUID/type."
            except (ValueError, TypeError) as exc:
                selected["issue"] = "The original receiving body is not a JSON:API resource: " + str(exc)
        elif not expected_present and response["status"] in (404, 410) and not response.get("error"):
            valid = True
        selected["status"] = "COMPLETE" if valid else "FAILED"
        if not valid:
            selected.setdefault("issue", "The selected native UUID did not return its expected original JSON:API response.")
            problems.append(selected)
        if response.get("error") and response.get("status") is None:
            network_failed = True
        file = target.get("file")
        if expected_present and file:
            if file.get("source_matches") is False or not file.get("exists"):
                selected["status"] = "FAILED"
                problems.append({**selected, "issue": "Native media bytes differ from the retained original file.", "file": file})
            elif not network_failed:
                file_url = file["url"]
                if file_url not in cache:
                    serial += 1
                    cache[file_url] = fetch(session, config, f"pass-{attempt:04d}-file-{serial:05d}", file_url,
                                            accept="*/*", max_bytes=min(session.p["max_artifact_bytes"], file["bytes"] + 1))
                file_response = cache[file_url]
                matched = file_response["status"] == 200 and not file_response.get("error") and file_response.get("body", {}).get("sha256") == file["sha256"]
                selected["file_receiving"] = {"matched": matched, "http": file_response, "expected_sha256": file["sha256"], "source_file_id": file.get("source_file_id")}
                if not matched:
                    selected["status"] = "FAILED"
                    problems.append({**selected, "issue": "The original HTTP media response differs from the native file bytes."})
        items.append(selected)
    for index, route in enumerate(plan.get("routes", []), 1):
        if route.get("migration_id") in alias_migrations:
            received = _receive_alias(session, config, native, route,
                                      alias_migrations[route["migration_id"]], attempt, index)
            routes.append(received)
            identity = received.get("native_alias") or {
                "migration_id": route.get("migration_id"), "source_ids": route.get("source_ids")}
            items.append({**identity, "entity_type": "path_alias", "status": received["status"],
                          "route_index": index, "observation": received["observation"],
                          "expected_present": received["expected_present"],
                          **({"issue": received["issue"]} if received.get("issue") else {})})
            if not received["matched"]:
                problems.append(received)
            continue
        if action == "rollback":
            continue
        session.check()
        old = _url(parse.urljoin(session.p["uri"].rstrip("/") + "/", route["old_url"]))
        expected = _url(parse.urljoin(session.p["uri"].rstrip("/") + "/", route["new_url"]))
        response = fetch(session, config, f"pass-{attempt:04d}-route-{index:05d}", old, accept="text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5")
        final = parse.urldefrag(response["final_url"])[0]
        native_route = next((item for item in native.get("route_observations", []) if item.get("mapping") == route), {})
        alias_matches = (native_route.get("kind") == "alias" and _origin(old) == _origin(session.p["uri"])
                         and parse.unquote(parse.urlsplit(old).path) == native_route.get("native_alias")
                         and parse.unquote(parse.urlsplit(expected).path) == native_route.get("native_path")
                         and _origin(expected) == _origin(session.p["uri"])
                         and final in (parse.urldefrag(old)[0], parse.urldefrag(expected)[0]))
        matched = response["status"] == 200 and not response.get("error") and (alias_matches or final == parse.urldefrag(expected)[0])
        item = {"mapping": route, "expected_target_url": expected, "matched": matched, "http": response,
                "native_route": native_route, "observation": "alias_resolution" if alias_matches else "http_final_url"}
        routes.append(item)
        if not matched:
            problems.append({"issue": "The selected old URL did not resolve to its exact mapped target.", **item})
    result = {"schema": "govhub.content-consolidation.receiving.v1", "observed_at": base._now(),
              "status": "COMPLETE" if not problems else "FAILED", "items": items, "routes": routes,
              "problems": problems, "counts": {"resources": len(items), "routes": len(routes), "problems": len(problems)}}
    path = session.out / f"receiving-{attempt:04d}.json"
    base._atomic(path, result)
    session.add(path, "content_receiving")
    return result
