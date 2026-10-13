"""MIT. HILA routes on the original private loopback operator server."""
from __future__ import annotations
import os
from pathlib import Path
import shutil
from urllib.parse import parse_qs, unquote

from server import OperatorServer, Handler
from hila_workspace import InputError, META_LIMIT, strict_json
from hila_questionnaire import MAX_FORM
from hila_source import MAX_BYTES
from hila_portable import MAX_ARCHIVE, open_output
from hila_rules import template, validate_rules

HERE = Path(__file__).resolve().parent


class HilaHandler(Handler):
    server_version = "SF30-HILA"

    def _get(self):
        target = self._gate(api=False)
        if target.path == "/api/launch":
            self._gate()
            return self._json(self.server.launch_record)
        if not target.path.startswith("/api/hila/"):
            return super()._get()
        self._gate()
        query = parse_qs(target.query, keep_blank_values=True)
        if any(len(values) != 1 for values in query.values()):
            raise InputError("Repeated query parameters are not accepted")
        q = {key: values[0] for key, values in query.items()}
        ws = self.server.workspace
        route = target.path[len("/api/hila/"):]
        revision = int(q["revision"]) if q.get("revision") else None
        if route == "questionnaire":
            result = ws.questionnaire(q["id"])
        elif route == "acquisition":
            result = ws.acquisition(q["id"])
        elif route == "mapping":
            result = ws.mapping(q["questionnaire"], q["source"])
        elif route == "rules-template":
            result = template(ws.questionnaire(q["questionnaire"]))
        elif route == "editions":
            result = ws.editions()
        elif route == "edition":
            result = ws.edition(q["id"])
        elif route == "rows":
            result = ws.respondent_page(q["edition"], int(q.get("offset", "0")), int(q.get("limit", "50")))
        elif route == "reviews":
            result = ws.reviews()
        elif route == "review":
            result = ws.review(q["id"], revision)
        elif route == "history":
            result = ws.history(q["id"])
        elif route == "request":
            result = ws.request(q["id"])
        elif route == "report":
            if q.get("public", "0") not in {"0", "1"}:
                raise InputError("Select the private report or approved aggregate release explicitly")
            result = ws.report(q["id"], revision, public=q.get("public") == "1")
        elif route in {"export", "html"}:
            with ws.mutex, ws.scratch() as temp:
                if route == "html":
                    from hila_html import write_html
                    view = ws.review(q["id"], revision)
                    report = ws.report(q["id"], view["revision"])
                    form = ws.questionnaire(ws.edition(view["editions"][0])["questionnaire"])
                    path = write_html(view, report, form, temp / "hila-private-report.html")
                    self._download(path, path.name, "text/html; charset=utf-8")
                    return
                kind = q.get("kind", "workspace")
                path = temp / ("hila-" + kind + ".zip")
                if kind == "workspace":
                    ws.export_review(q["id"], path, revision)
                elif kind in {"report", "public"}:
                    ws.write_report(q["id"], path, revision, public=kind == "public")
                else:
                    raise InputError("Export kind must be workspace, report or public")
                self._download(path, path.name, "application/zip")
                return
        else:
            return self._json({"error": "Unknown HILA operation"}, 404)
        self._json(result)

    def _post(self):
        target = self._gate()
        ws = self.server.workspace
        if target.path == "/api/source":
            name = unquote(self.headers.get("X-HILA-Name", "responses.csv"))
            label = unquote(self.headers.get("X-HILA-Label", name))
            return self._json(ws.add_source(self._body(MAX_BYTES), label, name), 201)
        if target.path == "/api/import":
            with ws.mutex, ws.scratch() as temp:
                path = temp / "input.zip"
                with open_output(path) as out:
                    shutil.copyfileobj(self._body(MAX_ARCHIVE), out, 65536)
                return self._json(ws.import_packet(path), 201)
        if target.path == "/api/hila/questionnaire":
            framed = self.headers.get("X-HILA-Provenance-Bytes")
            if framed is not None:
                if self.headers.get("X-HILA-Provenance") is not None or not framed.isdecimal() or not 1 <= int(framed) <= 262144:
                    raise InputError("Questionnaire frame requires one bounded complete provenance length")
                reader = self._body(MAX_FORM + 262144)
                provenance = strict_json(reader.read(int(framed)))
                return self._json(ws.add_questionnaire(reader, provenance), 201)
            raw = self.headers.get("X-HILA-Provenance")
            if raw is None:
                raise InputError("Questionnaire upload requires its complete original provenance")
            provenance = strict_json(unquote(raw))
            return self._json(ws.add_questionnaire(self._body(MAX_FORM), provenance), 201)
        if not target.path.startswith("/api/hila/"):
            return super()._post()
        body = strict_json(self._body(META_LIMIT).read())
        if not isinstance(body, dict):
            raise InputError("Expected a complete HILA operation object")
        if target.path == "/api/hila/edition":
            result = ws.save_edition(body)
        elif target.path == "/api/hila/review":
            result = ws.save_review(body)
        elif target.path == "/api/hila/rules":
            result = validate_rules(body["rules"], ws.questionnaire(body["questionnaire"]))
        else:
            return self._json({"error": "Unknown HILA operation"}, 404)
        self._json(result, 201)


class HilaServer(OperatorServer):
    def __init__(self, workspace, port=0, binding=None):
        super().__init__(workspace, port, assets_directory=HERE / "public", handler_class=HilaHandler)

        from hila_managed import startup, inspect_binding
        self.launch_record = startup(self, binding or inspect_binding(workspace.root))
