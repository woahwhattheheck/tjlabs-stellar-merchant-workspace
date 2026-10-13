"""Make-up operations on the existing authenticated family loopback server."""
from workspace import atomic, sha
from makeup import MakeupWorkspace

def get(root, path, query):
    model = MakeupWorkspace(root)
    try:
        if path == "/api/makeup/state":
            return model.state()
        if path == "/api/makeup/view":
            revision = int(query["revision"]) if "revision" in query else None
            return model.view(query["id"], revision)
        if path == "/api/makeup/history":
            return model.history(query["id"])
        if path == "/api/makeup/request":
            return model.request(query["id"])
        raise ValueError("Unknown make-up route")
    finally:
        model.close()

def post(root, path, body):
    import json
    model = MakeupWorkspace(root)
    try:
        if path == "/api/makeup/receive":
            return model.receive(body)
        data = json.loads(body)
        if path == "/api/makeup/preview":
            return model.preview(data)
        if path == "/api/makeup/save":
            return model.save(data)
        if path == "/api/makeup/compare":
            return model.compare(data["id"], data["before"], data["after"])
        if path == "/api/makeup/export":
            payload = model.export(data["id"], data.get("revision"))
            digest = sha(payload)
            atomic(root / "exports" / digest, payload)
            return {"filename": "Family_Makeup_Complete.zip", "bytes": len(payload),
                    "sha256": digest, "url": "/download/" + digest}
        raise ValueError("Unknown make-up route")
    finally:
        model.close()
