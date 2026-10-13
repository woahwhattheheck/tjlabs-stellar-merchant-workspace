#!/usr/bin/env python3
"""Retain real Federal Register inputs and build the original GovHub receiving case.

Uses Python's standard library. Capture is read-only against the public publisher.
Native writes remain with examples/native_receiving.py and the configured worker.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import date, datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import uuid

API = "https://www.federalregister.gov/api/v1"
USAGE = "https://www.federalregister.gov/reader-aids/developer-resources/rest-api"
CAPTURE_SCHEMA = "govhub.federal-register.capture.v1"
CASE_SCHEMA = "govhub.content-consolidation.receiving-case.v1"
ALLOWED_HOSTS = {"www.federalregister.gov", "federalregister.gov", "www.govinfo.gov", "govinfo.gov"}
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")
PDF_ID = re.compile(r"^[A-Za-z0-9_-]+$")
MIGRATION = re.compile(r"^govhub_[a-z0-9_]{1,39}$")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def file_identity(path):
    sha, size = hashlib.sha256(), 0
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            sha.update(chunk)
            size += len(chunk)
    return sha.hexdigest(), size


def read_json(path):
    path = Path(path)
    require(path.is_file() and not path.is_symlink(), "Select a complete ordinary JSON file: " + str(path))
    return json.loads(path.read_bytes())


def atomic_json(path, value):
    path = Path(path)
    require(not path.is_symlink(), "A capture record cannot be a symbolic link.")
    temporary = path.parent / ("." + path.name + "-" + uuid.uuid4().hex)
    try:
        with temporary.open("x", encoding="utf-8") as output:
            output.write(packed(value) + "\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        temporary.unlink(missing_ok=True)


def public_url(url, *, api=False):
    parsed = urlsplit(url)
    require(parsed.scheme == "https" and parsed.hostname in ALLOWED_HOSTS
            and parsed.port in (None, 443) and not parsed.username and not parsed.password
            and not parsed.fragment, "Select an original HTTPS Federal Register or govinfo URL.")
    if api:
        require(parsed.hostname in {"www.federalregister.gov", "federalregister.gov"}
                and parsed.path.startswith("/api/v1/"), "The next page must stay in the original Federal Register API.")
    return url


class PublisherRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        public_url(newurl)
        return super().redirect_request(request, fp, code, message, headers, newurl)


class Capture:
    def __init__(self, root, relative, identity, parameters):
        self.root = Path(root)
        require(self.root.is_absolute() and self.root.is_dir() and not self.root.is_symlink(),
                "Choose an existing absolute ordinary source root.")
        self.root = self.root.resolve()
        member = PurePosixPath(relative)
        require(str(member) not in {"", "."} and not member.is_absolute()
                and ".." not in member.parts and "\\" not in relative,
                "Choose an ordinary relative capture directory inside the source root.")
        self.directory = self.root
        for component in member.parts:
            self.directory /= component
            require(not self.directory.is_symlink(), "The capture directory cannot traverse symbolic links.")
            self.directory.mkdir(mode=0o700, exist_ok=True)
        require(NAME.fullmatch(identity), "Use a stable capture ID of at most 80 letters, digits, underscores or hyphens.")
        self.lock = os.open(self.directory / "capture.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            os.close(self.lock)
            raise
        self.path = self.directory / "capture-state.json"
        binding = {"schema": CAPTURE_SCHEMA, "id": identity, "parameters": parameters}
        if self.path.exists():
            self.state = read_json(self.path)
            require(all(self.state.get(key) == value for key, value in binding.items()),
                    "This capture directory already belongs to different input selection. Use its original parameters to resume.")
        else:
            self.state = dict(binding, started_at=now(), resources={}, status="CAPTURING")
            atomic_json(self.path, self.state)
        self.opener = build_opener(PublisherRedirect())
        self.parameters = parameters

    def close(self):
        os.close(self.lock)

    def fetch(self, name, url, kind):
        require(NAME.fullmatch(name), "Each source resource needs a stable name.")
        public_url(url, api=kind == "json")
        old = self.state["resources"].get(name)
        if old:
            require(old["request_url"] == url and old["kind"] == kind, "A retained resource cannot change its source URL.")
            path = self.root / old["path"]
            require(path.is_file() and not path.is_symlink()
                    and file_identity(path) == (old["sha256"], old["bytes"]),
                    "Restore the retained original source bytes before continuing this capture: " + old["path"])
            return old
        total = sum(item["bytes"] for item in self.state["resources"].values())
        remaining = self.parameters["max_total_bytes"] - total
        limit = min(remaining, 128 * 1024 * 1024 if kind == "pdf" else 32 * 1024 * 1024)
        require(limit > 0, "The selected source acquisition exceeds its explicit byte budget.")
        objects = self.directory / "objects"
        require(not objects.is_symlink(), "The original source objects directory cannot be a symbolic link.")
        objects.mkdir(mode=0o700, exist_ok=True)
        temporary = objects / (".download-" + name + "-" + uuid.uuid4().hex)
        accept = {"json": "application/json", "pdf": "application/pdf", "html": "text/html"}[kind]
        request = Request(url, headers={"User-Agent": "Commons-FederalRegister-Receiving/1.0",
                                       "Accept": accept, "Accept-Encoding": "identity"})
        started = now()
        try:
            with self.opener.open(request, timeout=45) as response:
                public_url(response.url, api=kind == "json")
                require(response.status == 200, "The original publisher returned HTTP " + str(response.status))
                require(response.headers.get("Content-Encoding", "identity").lower() in {"", "identity"},
                        "The publisher returned an unexpected compressed transfer; retain the identity representation.")
                declared = response.headers.get("Content-Length")
                if declared is not None:
                    require(declared.isdecimal() and int(declared) <= limit,
                            "The publisher's declared source size exceeds this selected acquisition.")
                digest, size, prefix = hashlib.sha256(), 0, b""
                with temporary.open("xb") as output:
                    while True:
                        chunk = response.read(min(1024 * 1024, limit - size + 1))
                        if not chunk:
                            break
                        size += len(chunk)
                        require(size <= limit, "The complete source exceeds this selected acquisition's byte budget.")
                        digest.update(chunk)
                        if len(prefix) < 8:
                            prefix = (prefix + chunk)[:8]
                        output.write(chunk)
                    output.flush()
                    os.fsync(output.fileno())
                if declared is not None:
                    require(size == int(declared), "The publisher response ended before its declared complete byte count.")
                require(size > 0, "The publisher returned an empty original resource.")
                if kind == "pdf":
                    require(prefix.startswith(b"%PDF-"), "The document's published PDF URL did not return original PDF bytes.")
                sha = digest.hexdigest()
                destination = objects / (sha + "." + kind)
                if destination.exists():
                    require(not destination.is_symlink() and file_identity(destination) == (sha, size),
                            "The retained content-addressed original object has changed.")
                    temporary.unlink()
                else:
                    os.replace(temporary, destination)
                record = {"name": name, "kind": kind, "path": destination.relative_to(self.root).as_posix(),
                          "request_url": url, "final_url": response.url, "started_at": started,
                          "observed_at": now(), "status": response.status, "sha256": sha, "bytes": size,
                          "headers": {key: response.headers[key] for key in
                                      ("Content-Type", "ETag", "Last-Modified", "Date", "Content-Length")
                                      if key in response.headers}}
            self.state["resources"][name] = record
            atomic_json(self.path, self.state)
            print(packed({"resource": name, "bytes": size, "sha256": sha}), file=sys.stderr, flush=True)
            return record
        except HTTPError as error:
            raise RuntimeError("Publisher HTTP " + str(error.code) + " for " + url
                               + "; Retry-After=" + str(error.headers.get("Retry-After", ""))) from error
        finally:
            temporary.unlink(missing_ok=True)

    def json(self, record):
        return read_json(self.root / record["path"])

    def run(self):
        usage = self.fetch("publisher_usage", USAGE, "html")
        agencies_file = self.fetch("agency_roster", API + "/agencies.json", "json")
        agencies = self.json(agencies_file)
        require(isinstance(agencies, list) and agencies, "The original agencies response must be its complete nonempty array.")
        agency_ids = set()
        for agency in agencies:
            value = agency.get("id") if isinstance(agency, dict) else None
            require(isinstance(value, int) and not isinstance(value, bool) and value >= 0,
                    "Every original agency must retain its numeric ID for explicit decimal encoding.")
            require(value not in agency_ids, "The original agency roster contains a duplicate agency ID.")
            agency_ids.add(value)
        selected_date = self.parameters["publication_date"]
        discovery = None
        if not selected_date:
            discovery = self.fetch("latest_document_discovery", API + "/documents.json?per_page=1&order=newest", "json")
            rows = self.json(discovery).get("results", [])
            require(rows and isinstance(rows[0], dict), "The publisher returned no document from which to select a publication day.")
            selected_date = rows[0].get("publication_date")
        require(isinstance(selected_date, str) and date.fromisoformat(selected_date).isoformat() == selected_date,
                "Retain the publisher's exact ISO publication date.")
        query = urlencode({"conditions[publication_date][is]": selected_date, "per_page": 1000, "order": "oldest"})
        url, pages, documents, seen_urls, declared, total_pages = API + "/documents.json?" + query, [], [], set(), None, None
        while url:
            public_url(url, api=True)
            require(url not in seen_urls, "The original document pagination contains a repeated URL.")
            require(parse_qs(urlsplit(url).query).get("conditions[publication_date][is]") == [selected_date],
                    "Every page must retain this exact publication-day selection.")
            seen_urls.add(url)
            record = self.fetch("document_page_" + str(len(pages) + 1).zfill(4), url, "json")
            body = self.json(record)
            require(isinstance(body, dict) and isinstance(body.get("results"), list),
                    "Each original document page must retain its complete results array.")
            count = body.get("count")
            require(isinstance(count, int) and not isinstance(count, bool) and count >= 0,
                    "Every original document page must retain its declared result count.")
            if declared is None:
                declared, total_pages = count, body.get("total_pages")
                require(count <= 2000, "This publication-day query exceeds the publisher's 2,000-result pagination window.")
            require(count == declared and body.get("total_pages") == total_pages,
                    "The original result count changed between pages. Retain this acquisition and capture a fresh complete edition.")
            for document in body["results"]:
                require(isinstance(document, dict) and document.get("publication_date") == selected_date,
                        "Every retained document must belong to the exact selected publication day.")
            documents.extend(body["results"])
            pages.append(record)
            supplied = body.get("next_page_url")
            require(supplied is None or isinstance(supplied, str), "The publisher returned an unsupported next-page representation.")
            url = urljoin(record["final_url"], supplied) if supplied else None
        require(len(documents) == declared and documents,
                "The retained terminal page and declared document count must match a complete nonempty publication day.")
        if isinstance(total_pages, int):
            require(len(pages) == total_pages, "The retained number of original pages differs from total_pages.")
        numbers, unresolved = set(), []
        for document in documents:
            number = document.get("document_number")
            require(isinstance(number, str) and PDF_ID.fullmatch(number) and number not in numbers,
                    "Every original document number must be a distinct complete publisher identifier.")
            numbers.add(number)
            require(isinstance(document.get("title"), str) and document["title"],
                    "Each native document needs its complete original title.")
            require(isinstance(document.get("agencies"), list), "Retain each document's original ordered agency array.")
            for index, agency in enumerate(document["agencies"]):
                require(isinstance(agency, dict), "Each original agency reference must be an object.")
                identity = agency.get("id")
                if not isinstance(identity, int) or isinstance(identity, bool) or identity not in agency_ids:
                    unresolved.append({"document_number": number, "index": index, "reference": agency})
        available = [row for row in documents if isinstance(row.get("pdf_url"), str) and row["pdf_url"]]
        requested = self.parameters["pdf_count"]
        require(requested >= 1 and available, "Select at least one actual publisher-linked PDF for native media receiving.")
        selected = available[:requested]
        media = []
        for document in selected:
            number = document["document_number"]
            record = self.fetch("official_pdf_" + number, document["pdf_url"], "pdf")
            media.append(dict(record, document_number=number, source_title=document["title"]))
        result = {"schema": CAPTURE_SCHEMA, "id": self.state["id"], "status": "COMPLETE",
                  "started_at": self.state["started_at"], "completed_at": now(), "publication_date": selected_date,
                  "selection": {"agency_roster": "complete", "documents": "complete publication day",
                                "pdf_selection": "first available original PDF links in the retained document order",
                                "pdf_requested": requested, "pdf_available": len(available), "pdf_selected": len(media)},
                  "usage": usage, "agencies": {"file": agencies_file, "count": len(agencies)},
                  "documents": {"pages": pages, "count": declared, "total_pages": len(pages),
                                "terminal_next_page_url": None, "discovery": discovery},
                  "media": media, "unresolved_agency_references": unresolved,
                  "source_notes": ["JSON retains the publisher's informational rendition.",
                                   "Selected PDFs are the original files linked by those exact published records.",
                                   "Agency IDs use explicit decimal encoding; document numbers remain exact strings.",
                                   "No NARA or OFR logos or seals are reproduced by the receiving interface."]}
        atomic_json(self.directory / "capture.json", result)
        self.state.update(status="COMPLETE", completed_at=result["completed_at"])
        atomic_json(self.path, self.state)
        return {"capture": str(self.directory / "capture.json"), "publication_date": selected_date,
                "agencies": len(agencies), "documents": declared, "pages": len(pages),
                "pdfs": len(media), "unresolved_agency_references": len(unresolved)}


def original_rows(root, capture):
    require(capture.get("schema") == CAPTURE_SCHEMA and capture.get("status") == "COMPLETE",
            "Select a complete original capture.")
    records = [capture["usage"], capture["agencies"]["file"], *capture["documents"]["pages"], *capture["media"]]
    if capture["documents"].get("discovery"):
        records.append(capture["documents"]["discovery"])
    for item in records:
        relative = PurePosixPath(item["path"])
        require(not relative.is_absolute() and ".." not in relative.parts, "Original inputs must remain inside the source root.")
        path = root / relative
        require(path.is_file() and not path.is_symlink()
                and file_identity(path) == (item["sha256"], item["bytes"]),
                "The selected capture needs its complete unchanged original file: " + item["path"])
    agencies = read_json(root / capture["agencies"]["file"]["path"])
    documents = [row for page in capture["documents"]["pages"] for row in read_json(root / page["path"])["results"]]
    require(len(agencies) == capture["agencies"]["count"] and len(documents) == capture["documents"]["count"],
            "The capture's declared original record counts changed.")
    return agencies, documents, records


def default(value):
    return {"plugin": "default_value", "default_value": value}


def lookup(migration, source, *, required=False, message="The original relationship has no imported native target."):
    step = {"plugin": "migration_lookup", "migration": migration, "source": source, "no_stub": True}
    return [step, {"plugin": "skip_on_empty", "method": "row", "message": message}] if required else step


def native_mapping(capture, documents, prefix, base_url, *, enriched, route_count):
    ids = {kind: prefix + "_" + kind for kind in ("agencies", "files", "media", "documents", "aliases")}
    copies = capture["media"]
    selected_keys = [[item["document_number"]] for item in copies]
    alias_keys = [[item["document_number"]] for item in documents[:route_count]]
    migration = lambda kind, feed, entity, process, **extra: {
        "id": ids[kind], "label": "Federal Register " + kind, "edition_name": feed,
        "source_ids": ["source_id"], "destination": {"plugin": "entity:" + entity, "validate": True},
        "process": process, "process_order": list(process), "existing_target_policy": "CREATE_ONLY",
        "removal_policy": "RETAIN_TARGET", **extra}
    agencies = migration("agencies", "agencies", "taxonomy_term", {
        "vid": default("fr_agencies"), "name": "name", "field_fr_agency_id": "source_id", "langcode": default("en")
    }, projection={"name": "name"}, required_source_fields=["name"], receiving={"fields": ["name", "field_fr_agency_id"]})
    agencies["destination"]["default_bundle"] = "fr_agencies"
    files = migration("files", "documents", "file", {
        "_prefix": default("public://federal-register/"), "_suffix": default(".pdf"),
        "_destination": {"plugin": "concat", "source": ["@_prefix", "source_id", "@_suffix"]},
        "filename": {"plugin": "concat", "source": ["source_id", "@_suffix"]},
        "uri": {"plugin": "file_copy", "source": ["_govhub_source_path", "@_destination"],
                "move": False, "file_exists": "replace"},
        "filemime": default("application/pdf"), "status": default(1)
    }, projection={"document_number": "document_number"}, selected_keys=selected_keys,
        file_bindings=[{"source_ids": [item["document_number"]], "file_name": item["name"]} for item in copies],
        receiving={"fields": ["filename", "filemime", "uri"]})
    media = migration("media", "documents", "media", {
        "bundle": default("fr_pdf"), "name": "source_id",
        "field_fr_pdf_file/target_id": lookup(ids["files"], "source_id", required=True,
            message="The selected official PDF must finish its native file migration."),
        "field_fr_pdf_file/display": default(1), "status": default(1), "langcode": default("en")
    }, projection={"document_number": "document_number"}, selected_keys=selected_keys,
        migration_dependencies={"required": [ids["files"]], "optional": []},
        receiving={"fields": ["name", "field_fr_pdf_file"]})
    media["destination"]["default_bundle"] = "fr_pdf"
    process = {
        "type": default("fr_document"), "title": "source_id",
        "field_fr_document_number": "source_id",
        "field_fr_title/value": "title", "field_fr_title/format": default("plain_text"),
        "body/value": [{"plugin": "get", "source": "abstract"}, {"plugin": "default_value", "default_value": "", "strict": True}], "body/format": default("plain_text"),
        "field_fr_publication_date/value": "publication_date",
        "field_fr_agencies": {"plugin": "sub_process", "source": "agencies",
            "process": {"target_id": [
                {"plugin": "skip_on_empty", "source": "id", "method": "row",
                 "message": "The publisher did not assign this original agency label a normalized ID."},
                {"plugin": "migration_lookup", "migration": ids["agencies"], "no_stub": True},
                {"plugin": "skip_on_empty", "method": "row",
                 "message": "The original agency ID has no native map in the retained roster."}]}},
        "field_fr_pdf/target_id": lookup(ids["media"], "source_id"),
        "field_fr_source_url/uri": "html_url", "field_fr_source_url/title": default("Federal Register source"),
        "status": default(1), "langcode": default("en")
    }
    if enriched:
        process["field_fr_document_type"] = "type"
    document_map = migration("documents", "documents", "node", process,
        required_source_fields=["title", "publication_date", "html_url"],
        migration_dependencies={"required": [ids["agencies"], ids["media"]], "optional": []},
        receiving={"fields": ["title", "field_fr_document_number", "field_fr_title", "body",
            "field_fr_publication_date", "field_fr_agencies", "field_fr_pdf", "field_fr_source_url"]
            + (["field_fr_document_type"] if enriched else [])})
    document_map["destination"]["default_bundle"] = "fr_document"
    aliases = migration("aliases", "documents", "path_alias", {
        "_node": lookup(ids["documents"], "source_id", required=True,
            message="The selected document must finish its native node migration before its alias is created."),
        "_node_prefix": default("/node/"), "_alias_prefix": default("/federal-register/"),
        "path": {"plugin": "concat", "source": ["@_node_prefix", "@_node"]},
        "alias": {"plugin": "concat", "source": ["@_alias_prefix", "source_id"]},
        "langcode": default("en"), "status": default(1)
    }, projection={"document_number": "document_number"}, selected_keys=alias_keys,
        migration_dependencies={"required": [ids["documents"]], "optional": []},
        receiving={"fields": ["path", "alias", "langcode"]})
    return {"migrations": [agencies, files, media, document_map, aliases],
            "files": [{"file_name": item["name"], "relative_path": "official-pdfs/" + item["document_number"] + ".pdf",
                       "media_type": "application/pdf", "source_url": item["request_url"],
                       "license": "Publisher-linked official Federal Register PDF. Reuse information: " + USAGE}
                      for item in copies],
            "routes": [{"migration_id": ids["aliases"], "source_ids": keys,
                        "old_url": base_url + "/federal-register/" + keys[0],
                        "new_url": base_url + "/federal-register/" + keys[0]}
                       for keys in alias_keys]}


def stage(capture, rows, resources, prefix, base_url, identity, *, previous=None, enriched=False, route_count=250, row_limit=100):
    files = [{"name": record["name"], "path": record["path"], "sha256": record["sha256"], "bytes": record["bytes"],
              "source_label": "Federal Register original " + record["name"], "category": "Extract"}
             for record in resources]
    def feed(name, source_id, record_keys, originals, expected, pointer="", encoding="string"):
        return {"name": name, "source_id": source_id, "label": "Federal Register " + name + " · " + capture["publication_date"],
                "observed_at": max(item["observed_at"] for item in originals), "format": "JSON",
                "record_keys": record_keys, "key_encoding": encoding, "records_pointer": pointer,
                "source_url": originals[0]["request_url"], "source_owner": "Office of the Federal Register / National Archives",
                "license_reference": USAGE, "expected_records": expected,
                "retention_instruction": "Keep every original response, page URL, complete record and selected PDF in the editable handover.",
                "files": [{"file": item["name"], "request_url": item["request_url"]} for item in originals]}
    result = {"id": identity, "label": {"initial": "Original public source import",
              "enrichment": "Retained source refresh and document-type enrichment",
              "restored": "Restore the selected migration-owned document"}[identity],
              "content_row_limit": row_limit, "files": files,
              "feeds": [feed("agencies", "federal-register-agencies", ["id"], [capture["agencies"]["file"]],
                             capture["agencies"]["count"], encoding="decimal"),
                        feed("documents", "federal-register-documents-" + capture["publication_date"], ["document_number"],
                             capture["documents"]["pages"], capture["documents"]["count"], pointer="/results")],
              "mapping": native_mapping(capture, rows, prefix, base_url, enriched=enriched, route_count=route_count),
              "operation_reason": "Import this exact reviewed Federal Register edition through its original native maps."}
    if previous:
        result["previous_stage"] = previous
    return result


def build_case(args):
    root = Path(args.source_root).resolve()
    first, refresh = read_json(args.capture), read_json(args.refresh_capture)
    require(first["id"] != refresh["id"] and first["publication_date"] == refresh["publication_date"],
            "Choose two independently observed captures of the same complete publication day.")
    require(refresh["started_at"] > first["started_at"], "The refresh capture must have a later actual source observation.")
    a, docs_a, resources_a = original_rows(root, first)
    b, docs_b, resources_b = original_rows(root, refresh)
    require(MIGRATION.fullmatch(args.migration_prefix), "Choose a stable govhub_ migration prefix with room for the native suffixes.")
    require(NAME.fullmatch(args.case_id), "Select the original receiving case ID.")
    require(isinstance(args.row_limit, int) and args.row_limit >= 0, "The original row limit must be a nonnegative integer.")
    require(args.route_count >= 1, "Select at least one original document route for receiving.")
    base = urlsplit(args.base_url)
    require(base.scheme in {"http", "https"} and base.hostname and not base.username and not base.password
            and not base.query and not base.fragment, "Select the actual configured Drupal base URL.")
    base_url = args.base_url.rstrip("/")
    family = read_json(args.family)
    limits = family.setdefault("limits", {"migrations": 5, "records": 1000, "files": 250,
                                         "file_bytes": 2 * 1024 * 1024 * 1024, "routes": 250})
    for capture, agencies, documents in ((first, a, docs_a), (refresh, b, docs_b)):
        counts = {"migrations": 5, "records": len(agencies) + len(documents) + min(len(documents), args.route_count)
                  + 2 * len(capture["media"]), "files": len(capture["media"]),
                  "file_bytes": sum(item["bytes"] for item in capture["media"]),
                  "routes": min(len(documents), args.route_count)}
        require(all(limits.get(key) is None or value <= limits[key] for key, value in counts.items()),
                "The complete capture exceeds this family's selected native scope: " + packed(counts))
    stages = [stage(first, docs_a, resources_a, args.migration_prefix, base_url, "initial",
                    route_count=args.route_count, row_limit=args.row_limit),
              stage(refresh, docs_b, resources_b, args.migration_prefix, base_url, "enrichment",
                    previous="initial", enriched=True, route_count=args.route_count, row_limit=args.row_limit),
              stage(refresh, docs_b, resources_b, args.migration_prefix, base_url, "restored",
                    previous="enrichment", enriched=True, route_count=args.route_count, row_limit=args.row_limit)]
    selected = refresh["media"][0]["document_number"]
    kinds = ["documents", "media", "files"]
    if selected in {row["document_number"] for row in docs_b[:args.route_count]}:
        kinds.insert(0, "aliases")
    rollback = [{"migration_id": args.migration_prefix + "_" + kind, "source_ids": [selected]} for kind in kinds]
    result = {"schema": CASE_SCHEMA, "id": args.case_id, "family": family, "stages": stages,
              "source_capture_ids": [first["id"], refresh["id"]], "publication_date": first["publication_date"],
              "rollback_selection": rollback,
              "mapping_change": "The enrichment maps the publisher's original document type into field_fr_document_type. All original source records and native IDs remain intact.",
              "title_policy": "The node title is the exact document number. field_fr_title retains and displays the complete original title without a 255-character truncation.",
              "relationship_notes": {"initial_unresolved": first["unresolved_agency_references"],
                                     "refresh_unresolved": refresh["unresolved_agency_references"],
                                     "handling": "Normalized agency IDs map in original order. Unnormalized source agency labels remain in the complete retained source and capture."}}
    output = Path(args.output)
    require(output.is_absolute() and output.parent.is_dir(), "Choose an absolute case output with an existing parent directory.")
    if output.exists():
        require(read_json(output) == result, "The original receiving case already exists with different selected inputs.")
    else:
        atomic_json(output, result)
    selection_path = output.with_name(output.stem + "-rollback-selection.json")
    if selection_path.exists():
        require(read_json(selection_path) == rollback, "The original rollback selection already exists with different identities.")
    else:
        atomic_json(selection_path, rollback)
    return {"case": str(output), "case_sha256": hashlib.sha256(packed(result).encode()).hexdigest(),
            "rollback_selection": str(selection_path), "publication_date": first["publication_date"],
            "native_migrations": 5, "stages": [item["id"] for item in stages],
            "source_counts": {"initial": len(a) + len(docs_a), "refresh": len(b) + len(docs_b)}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    capture = sub.add_parser("capture", help="Retain a complete public source edition; repeat the same command to resume.")
    capture.add_argument("--source-root", required=True)
    capture.add_argument("--directory", required=True)
    capture.add_argument("--capture-id", required=True)
    capture.add_argument("--publication-date")
    capture.add_argument("--pdf-count", type=int, default=5)
    capture.add_argument("--max-total-bytes", type=int, default=2 * 1024 * 1024 * 1024)
    build = sub.add_parser("build-case", help="Bind two actual captures to the original reviewed native receiving caller.")
    build.add_argument("--source-root", required=True)
    build.add_argument("--capture", required=True)
    build.add_argument("--refresh-capture", required=True)
    build.add_argument("--family", required=True)
    build.add_argument("--base-url", required=True)
    build.add_argument("--output", required=True)
    build.add_argument("--case-id", default="govhub-federal-register-20261012")
    build.add_argument("--migration-prefix", default="govhub_fr_govhub")
    build.add_argument("--route-count", type=int, default=250)
    build.add_argument("--row-limit", type=int, default=100)
    args = parser.parse_args()
    os.umask(0o077)
    job = None
    try:
        if args.command == "capture":
            require(1 <= args.pdf_count <= 250 and args.max_total_bytes > 0,
                    "Select between 1 and 250 original PDFs and a positive source byte budget.")
            parameters = {"publication_date": args.publication_date, "pdf_count": args.pdf_count,
                          "max_total_bytes": args.max_total_bytes}
            job = Capture(args.source_root, args.directory, args.capture_id, parameters)
            result = job.run()
        else:
            result = build_case(args)
        print(packed(result))
        return 0
    except Exception as error:
        print(packed({"error": type(error).__name__, "message": str(error)}), file=sys.stderr)
        return 2
    finally:
        if job:
            job.close()


if __name__ == "__main__":
    raise SystemExit(main())
