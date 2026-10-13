"""Assigned review preparation and complete-file custody in the original workspace."""
import base64, re
from pathlib import Path
from .common import *
from . import review_exchange

def _descriptor(raw,name,media):
    return {"sha256":sha(raw),"bytes":len(raw),"name":name,"mediaType":media}

def _file_bytes(item):
    require(isinstance(item,dict) and isinstance(item.get("base64"),str),"REVIEW_FILE","Complete original file bytes are required.")
    try:raw=base64.b64decode(item["base64"],validate=True)
    except Exception:fail("REVIEW_FILE","Original file encoding is invalid.")
    require(base64.b64encode(raw).decode("ascii")==item["base64"] and len(raw)==item["bytes"] and sha(raw)==item["sha256"],"REVIEW_FILE","Original file identity differs.")
    return raw

def render_copy(source_root,initial):
    root=Path(source_root)/"public"
    template=read_regular(root/"reviewer-copy.html").decode("utf-8")
    values={"__PROPERTY_REVIEW_CSS__":read_regular(root/"reviewer-copy.css").decode("utf-8"),
            "__PROPERTY_REVIEW_JS__":read_regular(root/"reviewer-copy.js").decode("utf-8"),
            "__PROPERTY_REVIEW_RETURN__":canonical(initial).decode("utf-8").replace("<","\\u003c")}
    require(all(template.count(token)==1 for token in values),"REVIEW_TEMPLATE","The complete installed reviewer template differs.")
    # One substitution over the original template: carried text can contain literal tokens.
    raw=re.sub(r"__PROPERTY_REVIEW_(?:CSS|JS|RETURN)__",lambda match:values[match.group(0)],template).encode("utf-8")
    require(len(raw)<=MAX_BLOB,"REVIEW_CAPACITY","Complete reviewer HTML exceeds 64 MiB. Select a smaller complete assignment.")
    return raw

def _response(value):
    require(len(canonical(value))<=MAX_BLOB,"REVIEW_CAPACITY","The complete review response exceeds 64 MiB; original files remain retained and no values were truncated.")
    return value

def _current(workspace,expected_revision):
    current=workspace.current()
    require(type(expected_revision)is int and expected_revision==current["revision"],"REVISION_CONFLICT","The selected workspace changed. Keep the original draft and review its current revision.")
    return current

def prepare_issue(workspace,command,expected_revision,source_root):
    with workspace.lock:
        current=_current(workspace,expected_revision)
        prepared=review_exchange.prepare_issue(current["state"],command,workspace.read_blob)
        raw=prepared["raw"];initial=review_exchange.initial_return(raw);html=render_copy(source_root,initial)
        issued=prepared["issued"];html_descriptor=_descriptor(html,"Property_Continuity_Reviewer.html","text/html")
        files=[raw,html]+[_file_bytes(item) for item in prepared["document"]["files"]]
        workspace.put_blobs(files)
        compact={**command,"body":{"id":command["body"]["id"],"issued":issued,"html":html_descriptor}}
        return {"expectedRevision":expected_revision,"command":compact,"issued":issued,"html":html_descriptor,
                "workspaceId":current["state"]["id"],"workspaceDirectory":str(workspace.directory)}

def prepare_return(workspace,raw,descriptor,expected_revision):
    require(isinstance(raw,bytes) and len(raw)<=MAX_BLOB,"REVIEW_CAPACITY","Complete returned JSON or HTML exceeds 64 MiB.")
    require(descriptor.get("sha256")==sha(raw) and descriptor.get("bytes")==len(raw),"REVIEW_FILE","Select the exact complete returned file.")
    with workspace.lock:
        current=_current(workspace,expected_revision)
        def read_blob(key):return raw if key==descriptor["sha256"] else workspace.read_blob(key)
        prepared=review_exchange.prepare_return(current["state"],descriptor,read_blob)
        files=[raw]+[_file_bytes(item) for item in prepared["files"]]
        preview=_response({**prepared,"files":[{key:value for key,value in item.items() if key!="base64"} for item in prepared["files"]],
                "expectedRevision":expected_revision,"workspaceId":current["state"]["id"],"workspaceDirectory":str(workspace.directory)})
        workspace.put_blobs(files)
        return preview

def view(workspace,exchange_id=None):
    with workspace.lock:
        current=workspace.current()
        return _response({"workspaceRevision":current["revision"],"view":review_exchange.view(current["state"],workspace.read_blob,exchange_id)})

def compare(workspace,return_id,edition_id,adoption_id=None):
    with workspace.lock:
        current=workspace.current()
        return _response({**review_exchange.compare(current["state"],return_id,edition_id,workspace.read_blob,adoption_id=adoption_id),
                "workspaceRevision":current["revision"]})
