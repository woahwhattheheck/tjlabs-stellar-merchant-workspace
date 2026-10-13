"""Explicit extensions to the one original grant-portfolio dispatcher.

Only the named maintained modules participate. There is no plugin discovery,
arbitrary import, replacement store or externally supplied code path.
"""
from __future__ import annotations
import importlib
from functools import partial

# Other owned product modules are composed here with their actual action lists.
# Admission/commit CAS remains explicit per module; it is not inferred from an
# action name or changed by a caller.
MODULES = (
    {"module": "dataverse_workspace", "http": "dataverse_http", "revision": "admission",
     "actions": (
         "dataverse.spec.save", "dataverse.profile.save", "dataverse.preflight", "dataverse.plan",
         "dataverse.apply", "dataverse.export", "dataverse.import", "dataverse.configure",
         "dataverse.delivery.prepare", "dataverse.delivery.receive",
     )},
    {"module": "staff_native", "revision": "admission",
     "correction_resolver": "resolve_correction", "correction_options": "support_correction_options",
     "actions": ("dataverse.staff.capture",)},
    {"module": "staff_programme", "revision": "admission",
     "actions": ("dataverse.staff.programme",)},
    {"module": "support_workspace", "revision": "commit",
     "actions": ("support.contract.save", "support.contract.acceptance", "support.issue.open", "support.issue.triage", "support.issue.acknowledge", "support.issue.plan", "support.issue.workaround", "support.issue.correction", "support.issue.validate", "support.issue.close", "support.issue.reopen", "support.issue.note", "support.issue.clock-review", "support.delivery.prepare", "support.delivery.receive",)},
)

def extension_actions():
    result = tuple(action for module in MODULES for action in module["actions"])
    if len(result) != len(set(result)):
        raise ValueError("Maintained workspace extensions repeat an action.")
    return result

def _declaration(action):
    return next((item for item in MODULES if action in item["actions"]), None)

def _module(item):
    module = importlib.import_module(item["module"])
    if tuple(module.ACTIONS) != item["actions"]:
        raise ValueError("The installed complete extension action contract changed.")
    return module

def is_extension(action):
    return _declaration(action) is not None

def requires_commit_revision(action):
    item = _declaration(action)
    return item is None or item["revision"] == "commit"

def initialize_extensions(workspace):
    extension_actions()
    for item in MODULES:
        module = _module(item)
        module.initialize(workspace)
        if item.get("correction_resolver") is not None:
            resolver = getattr(module, item["correction_resolver"])
            if not callable(resolver):
                raise ValueError("The maintained native correction resolver is not callable.")
            workspace.support_correction_resolver = partial(resolver, workspace)
        if item.get("correction_options") is not None:
            provider = getattr(module, item["correction_options"])
            if not callable(provider):
                raise ValueError("The maintained native correction provider is not callable.")
            bound = partial(provider, workspace)
            workspace.support_correction_options = bound
            workspace.support_correction_provider = bound

def validate_extension(workspace, value):
    item = _declaration(value["action"])
    if item is None:
        raise ValueError("Select an original maintained workspace extension.")
    return _module(item).validate_action(workspace, value)

def prepare_extension(workspace, request):
    return _module(_declaration(request["action"])).prepare_action(workspace, request)

def commit_extension(workspace, request, prepared):
    return _module(_declaration(request["action"])).commit_action(workspace, request, prepared)

def error_details(error):
    # Native complete exchanges and private source remain in their original
    # extension journal. The ordinary request carries a bounded actionable
    # reference, not a truncated substitute for those complete bytes.
    details = getattr(error, "details", {})
    return {key: details[key] for key in ("result_id", "request_id", "uncertain")
            if key in details and isinstance(details[key], (str, bool))}

def retryable(error):
    selected = getattr(error, "retryable", None)
    if isinstance(selected, bool):
        return selected
    return getattr(error, "code", "") in {
        "NATIVE_RESULT_UNKNOWN", "NATIVE_OPERATION_PENDING", "NATIVE_COMPONENT_READBACK",
        "IMPORT_SOLUTION_READBACK", "NATIVE_REFERENCE_PENDING", "IMPORT_FORMATTED_LOG",
    } or not isinstance(error, ValueError)

def read_http(workspace, path, query):
    for item in MODULES:
        module = importlib.import_module(item.get("http", item["module"]))
        handler = getattr(module, "read_http", None)
        if handler is not None:
            response = handler(workspace, path, query)
            if response is not None:
                return response
    return None

def static_routes():
    routes = {}
    for item in MODULES:
        module = importlib.import_module(item.get("http", item["module"]))
        for path, selected in getattr(module, "static_routes", lambda: {})().items():
            if not isinstance(path, str) or not path.startswith("/") or path in ("/", "/app.js", "/style.css") \
                    or path in routes or not isinstance(selected, (tuple, list)) or len(selected) != 2:
                raise ValueError("The maintained extension has a conflicting static route.")
            filename, media = selected
            if not isinstance(filename, str) or filename.startswith("/") or "\\" in filename \
                    or any(x in ("", ".", "..") for x in filename.split("/")) \
                    or not isinstance(media, str):
                raise ValueError("Use a fixed original extension asset path.")
            routes[path] = (filename, media)
    return routes
