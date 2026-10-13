"""Shared content-package input shapes; Drupal owns content interpretation."""
from copy import deepcopy
import re

SCHEMA = "govhub.content-packages/v1"
NATIVE_REQUEST = "govhub.content-packages.native-request.v1"
NATIVE_RESULT = "govhub.content-packages.native-result.v1"
PREVIEW_SCHEMA = "govhub.content-packages.preview.v1"
TYPES = {
    "PACKAGE_EXPORT": "export",
    "PACKAGE_PREVIEW": "preview",
    "PACKAGE_IMPORT": "import",
    "PACKAGE_STATUS": "status",
}
READ_TYPES = frozenset(TYPES) - {"PACKAGE_IMPORT"}
SHA256 = re.compile(r"^[0-9a-f]{64}$")
UUID = re.compile(r"^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")
ENTITY_TYPE = re.compile(r"^[a-z][a-z0-9_]*$")


def selection(value):
    """One native archive contains one explicit root and its dependency graph."""
    if not isinstance(value, list) or len(value) != 1 or not isinstance(value[0], dict):
        raise ValueError("Select one original Drupal entity type and UUID; the native exporter includes its whole dependency graph.")
    item = value[0]
    entity_type, uuid = item.get("entity_type"), item.get("uuid")
    if not isinstance(entity_type, str) or not ENTITY_TYPE.fullmatch(entity_type):
        raise ValueError("Use the original Drupal entity type machine name.")
    if not isinstance(uuid, str) or not UUID.fullmatch(uuid):
        raise ValueError("Use the original complete Drupal entity UUID.")
    return [{"entity_type": entity_type, "uuid": uuid.lower()}]


def options(value):
    value = deepcopy(value or {})
    if not isinstance(value, dict):
        raise ValueError("Supply the native package options as a JSON object.")
    unknown = set(value) - {"package_type", "max_depth", "unpublished"}
    if unknown:
        raise ValueError("Unknown native package options: " + ", ".join(sorted(unknown)))
    package_type = value.get("package_type", "content_entity")
    if not isinstance(package_type, str) or not ENTITY_TYPE.fullmatch(package_type):
        raise ValueError("Select the installed native package type machine name.")
    depth = value.get("max_depth", 20)
    if isinstance(depth, bool) or not isinstance(depth, int) or depth < 0:
        raise ValueError("The native graph depth must be a nonnegative integer.")
    unpublished = value.get("unpublished", True)
    if not isinstance(unpublished, bool):
        raise ValueError("unpublished must be a boolean.")
    return {"package_type": package_type, "max_depth": depth, "unpublished": unpublished}


def original_result(value, operation_id, action):
    if not isinstance(value, dict) or value.get("schema") != NATIVE_RESULT:
        raise ValueError("The native bridge must return its complete content-package result.")
    if value.get("operation_id") != operation_id or value.get("action") != action:
        raise ValueError("The native result belongs to a different original operation.")
    return value


def preview(value, archive_sha256):
    if not isinstance(value, dict) or value.get("schema") != PREVIEW_SCHEMA:
        raise ValueError("Select the complete native content-package preview.")
    if value.get("archive_sha256") != archive_sha256:
        raise ValueError("The native preview belongs to different archive bytes.")
    for field in ("target_sha256", "before_sha256"):
        if not isinstance(value.get(field), str) or not SHA256.fullmatch(value[field]):
            raise ValueError("The native preview must retain its exact " + field + ".")
    if not isinstance(value.get("packages"), list) or not isinstance(value.get("assets"), list):
        raise ValueError("The native preview must retain every selected package and asset.")
    if not isinstance(value.get("issues"), list):
        raise ValueError("The native preview must retain its original module validation outcome.")
    return value
