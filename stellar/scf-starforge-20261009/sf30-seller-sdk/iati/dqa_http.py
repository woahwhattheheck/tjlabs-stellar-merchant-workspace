"""MIT. DQA routes on the original authenticated IATI operator carrier."""
from pathlib import Path
import shutil
from dqa import InputError, MAX_BODY, MAX_PACKET, object_input, page_values
from workspace import load_json

PREFIX = "/api/iati/dqa/"
FILE_KINDS = {"response", "request", "configuration-before", "configuration-after"}


def positive(value, name, minimum=1, default=None):
    if value is None:
        return default
    if not isinstance(value, str) or not value.isdecimal() or str(int(value)) != value or int(value) < minimum:
        raise InputError("Select a complete nonnegative integer for " + name)
    return int(value)


def selection(q, allowed, required=()):
    object_input(q, allowed, required)
    return q


def original_file(dqa, ident, kind):
    row = dqa.assessment(ident)
    if kind == "response":
        return row["response"]["body"]
    if kind == "request":
        return row["request"]
    if kind in {"configuration-before", "configuration-after"}:
        return row["configurationBefore" if kind.endswith("before") else "configurationAfter"]["file"]
    raise InputError("Select response, request, configuration-before or configuration-after")


def get(handler, path, q):
    if not path.startswith(PREFIX):
        return False
    ws, dqa = handler.server.workspace, handler.server.workspace.dqa
    route = path[len(PREFIX):]
    if route in {"providers", "assessments", "cases"}:
        selection(q, ())
        handler._json({route: getattr(dqa, route)()})
    elif route == "operations":
        selection(q, {"offset", "limit"})
        handler._json(page_values(dqa.operations(), positive(q.get("offset"), "offset", 0, 0),
                                  positive(q.get("limit"), "limit", 1, 50)))
    elif route in {"assessment", "case", "history", "comparison", "findings"}:
        key = "case" if route == "history" else "id"
        extras = {"revision"} if route == "case" else {"offset", "limit", "status", "search"} if route == "findings" else {"offset", "limit"} if route == "comparison" else set()
        selection(q, {key} | extras, {key})
        if route == "assessment":
            result = dqa.assessment(q[key])
        elif route == "case":
            result = dqa.case(q[key], positive(q.get("revision"), "revision"))
        elif route == "history":
            result = {"history": dqa.history(q[key])}
        else:
            args = [q[key], positive(q.get("offset"), "offset", 0, 0), positive(q.get("limit"), "limit", 1, 50)]
            result = dqa.findings(*args, q.get("status", ""), q.get("search", "")) if route == "findings" else dqa.comparison(*args)
        handler._json(result)
    elif route == "file":
        selection(q, {"assessment", "kind"}, {"assessment", "kind"})
        with ws.mutex:
            item = original_file(dqa, q["assessment"], q["kind"])
            handler._download(dqa.blob_path(item), "dqa-" + q["kind"] + "-" + item["sha256"] + ".json", item["contentType"])
    elif route == "export":
        selection(q, {"case", "revision"}, {"case"})
        with ws.mutex, ws.scratch() as temp:
            destination = temp / "iati-dqa-customer.zip"
            dqa.export_case(q["case"], destination, positive(q.get("revision"), "revision"))
            handler._download(destination, destination.name, "application/zip")
    else:
        handler._json({"error": "Unknown IATI DQA route"}, 404)
    return True


def post(handler, path):
    if not path.startswith(PREFIX):
        return False
    ws, dqa = handler.server.workspace, handler.server.workspace.dqa
    route = path[len(PREFIX):]
    if route == "receive":
        with ws.mutex, ws.scratch() as temp:
            packet = temp / "iati-dqa-customer.zip"
            with packet.open("xb") as out:
                packet.chmod(0o600)
                shutil.copyfileobj(handler._body(MAX_PACKET), out, 65536)
            handler._json(dqa.receive(packet), 201)
        return True
    body = load_json(handler._body(MAX_BODY).read())
    if route == "provider":
        result = dqa.save_provider(body)
    elif route == "capture":
        result = dqa.capture(body)
    elif route == "case":
        result = dqa.save_case(body)
    elif route == "compare":
        object_input(body, {"before", "after"}, {"before", "after"})
        result = dqa.compare(body["before"], body["after"])
    else:
        handler._json({"error": "Unknown IATI DQA action"}, 404)
        return True
    handler._json(result, 201)
    return True
