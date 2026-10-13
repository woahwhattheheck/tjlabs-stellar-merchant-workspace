"""Exact reviewer-role paths for the original complete publisher source."""
import base64
import hashlib
from pathlib import PurePosixPath

DIST = "stellar-forge/developer-site/dist/"
DATA = DIST + "grant-data/"
ROLE_NAMES = {"application": "application.md", "source-index": "source-index.json",
              "budget": "budget.csv", "product-and-finance": "product-and-finance.md"}
PATH_SCHEMA = "stellar-forge.reviewer-carrier-paths.v1"
_DEFAULT = object()

# Original canonical UTF-8/base64 decoder retained from the current publisher.
def source_bytes(row):
    content = row["content"]
    if not isinstance(content, str):
        raise ValueError("Retain a complete encoded source string: " + row["path"])
    encoding = row.get("encoding", "utf-8")
    if encoding in (None, "utf-8"):
        return content.encode("utf-8")
    if encoding == "base64":
        body = base64.b64decode(content, validate=True)
        if base64.b64encode(body).decode("ascii") != content:
            raise ValueError("Retain canonical complete base64 source: " + row["path"])
        return body
    raise ValueError("Select UTF-8 or base64 source encoding: " + row["path"])


def reviewer_paths(value=_DEFAULT):
    """Keep logical package names distinct from explicitly selected source paths."""
    paths = ({role: DATA + name for role, name in ROLE_NAMES.items()}
             if value is _DEFAULT else value)
    if not isinstance(paths, dict) or set(paths) != set(ROLE_NAMES):
        raise ValueError("Select one complete carrier path for each of the four reviewer roles.")
    result = {}
    for role in ROLE_NAMES:
        value = paths[role]
        if not isinstance(value, str):
            raise ValueError("Select a source-relative reviewer path: " + role)
        path = PurePosixPath(value)
        if (not value.startswith(DATA) or value == DATA or
                "\\" in value or "\0" in value or path.is_absolute() or
                ".." in path.parts or str(path) != value):
            raise ValueError("Select an exact reviewer path under the original grant-data directory.")
        result[role] = value
    if len(set(result.values())) != len(result):
        raise ValueError("Select a distinct original carrier file for each reviewer role.")
    return result


def read_path_selection(value):
    if (not isinstance(value, dict) or set(value) != {"schema", "roles"} or
            value.get("schema") != PATH_SCHEMA):
        raise ValueError("Select the complete explicit reviewer-carrier-paths document.")
    return reviewer_paths(value["roles"])


def reviewer_members(packet):
    received = packet.get("received", {})
    files = received.get("bundle", {}).get("body", {}).get("files", [])
    if (len(files) != 4 or {row.get("role") for row in files} != set(ROLE_NAMES)):
        raise ValueError("Select all four complete files in the original reviewer source package.")
    objects = {}
    for stored in received.get("objects", []):
        if stored["sha256"] in objects:
            raise ValueError("Retain each complete reviewer source object once.")
        objects[stored["sha256"]] = stored
    result = []
    for row in files:
        if row["name"] != ROLE_NAMES[row["role"]]:
            raise ValueError("Retain the original logical reviewer package file names.")
        stored = objects[row["sha256"]]
        body = base64.b64decode(stored["base64"], validate=True)
        if (len(body) != row["bytes"] or len(body) != stored["bytes"] or
                hashlib.sha256(body).hexdigest() != row["sha256"]):
            raise ValueError("The complete selected reviewer object differs: " + row["name"])
        result.append((row, body))
    return result


def verify_reviewer_paths(packet, bodies, selection=None):
    paths = reviewer_paths() if selection is None else reviewer_paths(selection)
    for row, body in reviewer_members(packet):
        path = paths[row["role"]]
        if path not in bodies or bodies[path] != body:
            raise ValueError("The publisher source and selected reviewer package differ: " + path)
    return paths
