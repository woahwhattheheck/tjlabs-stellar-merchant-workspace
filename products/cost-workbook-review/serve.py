"""Local browser and CLI for the complete original workbook review."""
from __future__ import annotations
import argparse, base64, http.server, json, pathlib, sys, urllib.parse
from workbook_review import Workspace, ReviewError, canonical, identity, require, summaries, MAX_WORKBOOK, SOURCE_FILES

SOURCE = pathlib.Path(__file__).resolve().parent

def page():
    return b'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workbook edition review</title><link rel="stylesheet" href="/style.css"><body><main id="app"></main><script src="/ui.js" defer></script></body></html>'

def view(state):
    return {**state, "summary": summaries(state)}

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "WorkbookReview/1"
    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

    def respond(self, status, data, content_type="application/json; charset=utf-8", filename=None):
        if not isinstance(data, bytes):
            data = canonical(data)
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        if filename:
            self.send_header("Content-Disposition", 'attachment; filename="' + filename + '"')
        self.end_headers()
        self.wfile.write(data)

    def validate_origin(self):
        expected = {"127.0.0.1:" + str(self.server.server_port), "localhost:" + str(self.server.server_port)}
        require(self.headers.get("Host") in expected, "Use the local review URL printed by the server")
        origin = self.headers.get("Origin")
        require(not origin or origin in {"http://" + host for host in expected}, "Open the review in its own local browser tab")
        require(self.headers.get("Sec-Fetch-Site") not in ("cross-site",), "Cross-site requests are not accepted")

    def read_json(self):
        require(self.headers.get("Content-Type", "").split(";")[0] == "application/json", "Send application/json")
        length = int(self.headers.get("Content-Length", "0"))
        require(0 < length <= MAX_WORKBOOK * 3 + 2000000, "Request is too large or missing")
        data = self.rfile.read(length)
        require(len(data) == length, "Incomplete request")
        return json.loads(data)

    def do_GET(self):
        try:
            self.validate_origin()
            url = urllib.parse.urlsplit(self.path)
            path = url.path
            if path == "/":
                return self.respond(200, page(), "text/html; charset=utf-8")
            if path in ("/ui.js", "/style.css"):
                return self.respond(200, (SOURCE / path[1:]).read_bytes(),
                                    "text/javascript; charset=utf-8" if path.endswith(".js") else "text/css; charset=utf-8")
            if path == "/api/cases":
                return self.respond(200, {"cases": self.server.workspace.list()})
            bits = path.strip("/").split("/")
            if len(bits) >= 3 and bits[:2] == ["api", "cases"]:
                case_id = bits[2]
                state = self.server.workspace.read(case_id)
                if len(bits) == 3:
                    return self.respond(200, view(state))
                if len(bits) == 4 and bits[3] == "export":
                    packet, manifest = self.server.workspace.export(case_id, SOURCE)
                    return self.respond(200, packet, "application/zip", "Workbook_Review_" + case_id[:12] + "_r" + str(state["revision"]) + ".zip")
                if len(bits) == 5 and bits[3] == "original" and bits[4] in ("before", "after"):
                    side = bits[4]
                    data = (self.server.workspace.case_path(case_id) / "originals" / (side + ".xlsx")).read_bytes()
                    require(identity(data) == {k: state["report"][side][k] for k in ("bytes", "sha256")}, "Original workbook changed")
                    return self.respond(200, data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", side + ".xlsx")
                if len(bits) == 4 and bits[3] == "cells":
                    query = urllib.parse.parse_qs(url.query)
                    return self.respond(200, self.server.workspace.inspect(case_id, query.get("side", ["after"])[0],
                                        query.get("sheet", [""])[0], int(query.get("start", ["0"])[0]), 250))
            self.respond(404, {"error": "Review route not found"})
        except (ReviewError, ValueError, KeyError, TypeError, FileNotFoundError) as exc:
            self.respond(400, {"error": str(exc)})
        except BrokenPipeError:
            return

    def do_POST(self):
        try:
            self.validate_origin()
            raw = self.read_json()
            path = urllib.parse.urlsplit(self.path).path
            if path == "/api/cases":
                require(set(raw) == {"title", "before", "after", "mapping"}, "New review needs title, two originals and mapping")
                def original(side):
                    item = raw[side]
                    require(isinstance(item, dict) and set(item) == {"filename", "base64"}, "Original requires filename and base64")
                    return base64.b64decode(item["base64"], validate=True), item["filename"]
                a, an = original("before")
                b, bn = original("after")
                return self.respond(201, view(self.server.workspace.create(raw["title"], a, an, b, bn, raw["mapping"])))
            bits = path.strip("/").split("/")
            if len(bits) == 4 and bits[:2] == ["api", "cases"] and bits[3] == "review":
                result = self.server.workspace.review(bits[2], raw)
                result["case"] = view(result["case"])
                return self.respond(200, result)
            if path == "/api/receive":
                require(set(raw) == {"base64"}, "Receiving needs the complete original packet")
                return self.respond(200, self.server.workspace.receive(base64.b64decode(raw["base64"], validate=True), SOURCE))
            self.respond(404, {"error": "Review route not found"})
        except (ReviewError, ValueError, KeyError, TypeError, FileNotFoundError) as exc:
            self.respond(400, {"error": str(exc)})
        except BrokenPipeError:
            return

def main():
    parser = argparse.ArgumentParser(description="Review and hand over two original cost workbooks")
    sub = parser.add_subparsers(dest="command", required=True)
    serving = sub.add_parser("serve")
    serving.add_argument("--workspace", required=True)
    serving.add_argument("--port", type=int, default=8865)
    create = sub.add_parser("create")
    create.add_argument("--workspace", required=True)
    create.add_argument("--title", required=True)
    create.add_argument("--before", required=True)
    create.add_argument("--after", required=True)
    create.add_argument("--mapping", help="Actual consultant-selected sheet pairs and named original cells, JSON")
    for command in ("show", "review", "export"):
        child = sub.add_parser(command)
        child.add_argument("--workspace", required=True)
        child.add_argument("--case", required=True)
        if command == "review":
            child.add_argument("--decisions", required=True, help="Full original review request JSON")
        if command == "export":
            child.add_argument("--output", required=True)
    receiving = sub.add_parser("receive")
    receiving.add_argument("--workspace", required=True)
    receiving.add_argument("--packet", required=True)
    listed = sub.add_parser("list")
    listed.add_argument("--workspace", required=True)
    args = parser.parse_args()
    work = Workspace(args.workspace)
    if args.command == "serve":
        require(1024 <= args.port <= 65535, "Choose a local unprivileged port")
        server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
        server.workspace = work
        print(json.dumps({"url": "http://127.0.0.1:" + str(args.port), "workspace": str(work.root)}), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
        return
    if args.command == "create":
        before, after = pathlib.Path(args.before), pathlib.Path(args.after)
        mapping = json.loads(pathlib.Path(args.mapping).read_bytes()) if args.mapping else {}
        result = view(work.create(args.title, before.read_bytes(), before.name, after.read_bytes(), after.name, mapping))
    elif args.command == "list":
        result = work.list()
    elif args.command == "show":
        result = view(work.read(args.case))
    elif args.command == "review":
        result = work.review(args.case, json.loads(pathlib.Path(args.decisions).read_bytes()))
    elif args.command == "export":
        data, manifest = work.export(args.case, SOURCE)
        output = pathlib.Path(args.output)
        require(not output.exists(), "Choose a new retained output path")
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("xb") as stream:
            stream.write(data)
            stream.flush()
            import os
            os.fsync(stream.fileno())
        result = {"state": "EXPORTED", "file": str(output.resolve()), **identity(data), "manifest": manifest}
    else:
        result = work.receive(pathlib.Path(args.packet).read_bytes(), SOURCE)
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    try:
        main()
    except (ReviewError, OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        raise SystemExit(1)
