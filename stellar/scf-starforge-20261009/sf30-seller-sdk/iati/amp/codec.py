"""MIT. Exact native JSON, bounded inputs and stable AMP source identities."""
from __future__ import annotations
from decimal import Decimal, InvalidOperation
import hashlib
import json
import math
import re
from iati_source import InputError

MAX_JSON = 64 * 1024 * 1024
SHA = re.compile(r"[0-9a-f]{64}\Z")
REQUEST = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,159}\Z")


def text(value, name, maximum=16000, empty=False):
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()):
        raise InputError(f"{name} must contain {'0' if empty else '1'}–{maximum} characters")
    return value if empty else value.strip()


def integer(value, name, minimum=1, maximum=2**63 - 1):
    if type(value) is not int or not minimum <= value <= maximum:
        raise InputError(f"{name} must be an integer from {minimum} to {maximum}")
    return value


def identity(value):
    if not isinstance(value, str) or not SHA.fullmatch(value):
        raise InputError("Select an exact retained SHA-256 identity")
    return value


def request_id(value):
    if not isinstance(value, str) or not REQUEST.fullmatch(value):
        raise InputError("Use a complete operation request ID")
    return value


def fields(value, required=(), optional=()):
    if not isinstance(value, dict) or not set(required) <= set(value) or set(value) - set(required) - set(optional):
        raise InputError("The complete AMP object has missing or unknown fields")


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise InputError("Duplicate native JSON field: " + key)
        result[key] = value
    return result


def loads(raw):
    if isinstance(raw, str):
        raw = raw.encode("utf-8")
    if not isinstance(raw, bytes) or len(raw) > MAX_JSON:
        raise InputError("Receive the complete native JSON within 64 MiB")
    try:
        value = json.loads(raw.decode("utf-8-sig"), parse_float=Decimal,
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError("non-finite")),
                           object_pairs_hook=_pairs)
    except (UnicodeError, ValueError, RecursionError) as error:
        raise InputError("Receive valid complete UTF-8 JSON with finite numbers") from error
    _depth(value)
    return value


def _depth(value, depth=0):
    if depth > 96:
        raise InputError("Native JSON nesting exceeds 96 levels")
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise InputError("JSON object keys must be strings")
            _depth(item, depth + 1)
    elif isinstance(value, list):
        for item in value:
            _depth(item, depth + 1)


def decimal(value, name="Amount"):
    if isinstance(value, bool) or value is None or isinstance(value, (dict, list, float)):
        raise InputError(name + " must retain its exact decimal text or native JSON number")
    try:
        result = value if isinstance(value, Decimal) else Decimal(str(value))
    except InvalidOperation as error:
        raise InputError(name + " is not a decimal amount") from error
    if not result.is_finite() or len(result.as_tuple().digits) > 1024 or abs(result.as_tuple().exponent) > 1024:
        raise InputError(name + " exceeds the supported finite decimal range")
    return result


def decimal_text(value):
    result = format(decimal(value), "f")
    return result if "." not in result else result.rstrip("0").rstrip(".") or "0"


def dumps(value):
    """Emit Decimal as a JSON number; never round through Python or browser float."""
    def encode(item, depth=0):
        if depth > 96:
            raise InputError("Native JSON nesting exceeds 96 levels")
        if item is None:
            return "null"
        if item is True:
            return "true"
        if item is False:
            return "false"
        if type(item) is int:
            return str(item)
        if isinstance(item, Decimal):
            return decimal_text(item)
        if isinstance(item, float):
            if not math.isfinite(item):
                raise InputError("Non-finite native number")
            raise InputError("Native numbers must be parsed with the exact AMP JSON decoder")
        if isinstance(item, str):
            return json.dumps(item, ensure_ascii=False)
        if isinstance(item, list):
            return "[" + ",".join(encode(v, depth + 1) for v in item) + "]"
        if isinstance(item, dict):
            if any(not isinstance(k, str) for k in item):
                raise InputError("JSON object keys must be strings")
            return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + encode(item[k], depth + 1)
                                  for k in sorted(item)) + "}"
        raise InputError("Unsupported native JSON value")
    result = encode(value)
    if len(result.encode("utf-8")) > MAX_JSON:
        raise InputError("Complete native JSON exceeds 64 MiB")
    return result


def encode(value):
    return dumps(value).encode("utf-8")


def digest(raw):
    if isinstance(raw, str):
        raw = raw.encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def fingerprint(value):
    return digest(encode(value))


def normal(value):
    """Operator/SQLite projection: native number text remains exact and explicit."""
    if isinstance(value, Decimal):
        return decimal_text(value)
    if isinstance(value, list):
        return [normal(v) for v in value]
    if isinstance(value, dict):
        return {k: normal(v) for k, v in value.items()}
    return value
