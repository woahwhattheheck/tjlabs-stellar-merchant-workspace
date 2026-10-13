"""MIT. Humanitarian routes on the original private loopback operator server."""
from __future__ import annotations
import os
from pathlib import Path
import shutil
from urllib.parse import parse_qs, unquote

from humanitarian_workspace import InputError, MAX_SOURCE, MAX_ARCHIVE, MAX_REQUEST, strict_json
from server import OperatorServer, Handler

HERE = Path(__file__).resolve().parent


def single_query(target):
    query = parse_qs(target.query, keep_blank_values=True)
    if any(len(values) != 1 for values in query.values()):
        raise InputError("Repeated query parameters are not accepted")
    return {key: values[0] for key, values in query.items()}


class HumanitarianHandler(Handler):
    server_version = "SF30-Humanitarian"

    def _get(self):
        target = self._gate(api=False)
        if target.path == "/api/launch":
            self._gate()
            return self._json(self.server.launch_record)
        if not target.path.startswith("/api/humanitarian/"):
            return super()._get()
        self._gate()
        query = single_query(target)
        ws = self.server.workspace
        route = target.path[len("/api/humanitarian/"):]
        revision = int(query["revision"]) if query.get("revision") else None
        if route == "state":
            result = ws.state()
        elif route == "source":
            result = ws.source(query["id"])
        elif route == "source-table":
            result = ws.table_rows(query["source"], query.get("table", "data"),
                                   int(query.get("offset", "0")), int(query.get("limit", "8"))
        elif route == "reference":
            result = ws.reference(query["id"])
        elif route == "mapping":
            result = ws.mapping(query["id"])
        elif route == "alias":
            result = ws.alias(query["id"])
        elif route == "reviews":
            result = ws.reviews()
        elif route == "review":
            result = ws.review(query["id"], revision)
        elif route == "history":
            result = ws.history(query["id"])
        elif route == "request":
            # A read-only lookup is the original pre-dispatch reconciliation route.
            # An absent request may be sent with its retained complete body and UUID.
            try:
                result = ws.request(query["id"])
            except InputError as error:
                if str(error) != "Unknown completed request":
                    raise
                return self._json({"error": str(error), "requestNotFound": True}, 404)
        elif route == "report":
            result = ws.report(query["id"], revision)
        elif route == "rows":
            if query.get("issues", "0") not in {"0", "1"}:
                raise InputError("Choose all rows or rows with issues explicitly")
            result = ws.rows(
                query["id"], revision, int(query.get("edition", "0")),
                int(query.get("offset", "0")), int(query.get("limit", "50")),
                query.get("issues") == "1",
            )
        elif route == "output-rows":
            result = ws.output_rows(query["id"], revision, int(query.get("edition", "0")),
                                    query.get("output"), int(query.get("offset", "0")),
                                    int(query.get("limit", "50")))
        elif route == "comparison-rows":
            result = ws.comparison_rows(query["id"], revision, int(query.get("offset", "0")),
                                        int(query.get("limit", "50")))
        elif route == "export":
            kind = query.get("kind", "workspace")
            if kind not in {"workspace", "report"}:
                raise InputError("Export kind must be workspace or report")
            with ws.mutex, ws.scratch() as temporary:
                path = temporary / ("humanitarian-" + kind + ".zip")
                if kind == "workspace":
                    ws.export_review(query["id"], path, revision)
                else:
                    ws.write_report(query["id"], path, revision)
                self._download(path, path.name, "application/zip")
            return
        else:
            return self._json({"error": "Unknown humanitarian operation"}, 404)
        self._json(result)

    def _post(self):
        target = self._gate()
        ws = self.server.workspace
        if target.path == "/api/source":
            name = unquote(self.headers.get("X-Humanitarian-Name", "table.csv"))
            label = unquote(self.headers.get("X-Humanitarian-Label", name))
            return self._json(ws.add_source(self._body(MAX_SOURCE), label, name), 201)
        if target.path == "/api/import":
            with ws.mutex, ws.scratch() as temporary:
                path = temporary / "complete-input.zip"
                with path.open("xb") as stream:
                    os.fchmod(stream.fileno(), 0o600)
                    shutil.copyfileobj(self._body(MAX_ARCHIVE), stream, 65536)
                    stream.flush()
                    os.fsync(stream.fileno())
                return self._json(ws.receive_review(path), 201)
        if not target.path.startswith("/api/humanitarian/"):
            return super()._post()
        body = strict_json(self._body(MAX_REQUEST).read())
        if not isinstance(body, dict):
            raise InputError("Expected a complete humanitarian operation object")
        methods = {
            "/api/humanitarian/reference": ws.save_reference,
            "/api/humanitarian/mapping": ws.save_mapping,
            "/api/humanitarian/alias": ws.save_alias,
            "/api/humanitarian/review": ws.save_review,
        }
        method = methods.get(target.path)
        if method is None:
            return self._json({"error": "Unknown humanitarian operation"}, 404)
        self._json(method(body), 201)


class HumanitarianServer(OperatorServer):
    def __init__(self, workspace, port=0, binding=None):
        super().__init__(
            workspace, port, assets_directory=HERE / "public",
            handler_class=HumanitarianHandler,
        )
        from humanitarian_managed import startup, inspect_binding
        self.launch_record = startup(self, binding or inspect_binding(workspace.root))
