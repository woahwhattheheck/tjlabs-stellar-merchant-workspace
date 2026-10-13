"""Exact decimal JSON, stable identities and atomic filesystem publication."""
import datetime as dt
import hashlib
import json
import os
import re
import tempfile
import uuid
from decimal import Decimal, InvalidOperation
from pathlib import Path
from .errors import PMRSError, require

HEX = re.compile(r"^[0-9a-f]{64}$")
NAME = re.compile(r"^[a-z][a-z0-9_]{0,127}$")
MAX_JSON_BYTES = 32 * 1024 * 1024

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")

def decimal(value, *, field="amount", nullable=False):
    if value is None and nullable:
        return None
    require(not isinstance(value, (bool, float)) and isinstance(value, (str, int, Decimal)),
            "DECIMAL_REQUIRED", "Use an exact decimal string or integer.", field=field)
    try:
        result = Decimal(value)
    except (InvalidOperation, ValueError):
        raise PMRSError("DECIMAL_REQUIRED", "Invalid decimal.", details={"field": field})
    require(result.is_finite() and len(result.as_tuple().digits) <= 100
            and abs(result.as_tuple().exponent) <= 100,
            "DECIMAL_RANGE", "Decimal exceeds the supported exact range.", field=field)
    return result

def decimal_text(value):
    return None if value is None else format(value if isinstance(value, Decimal) and value.is_finite() else decimal(value), "f")

def wire(value):
    """JSON numbers remain exact; no binary float is accepted."""
    if value is None: return "null"
    if value is True: return "true"
    if value is False: return "false"
    if isinstance(value, str): return json.dumps(value, ensure_ascii=False)
    if isinstance(value, int): return str(value)
    if isinstance(value, Decimal):
        require(value.is_finite(), "DECIMAL_RANGE", "A JSON decimal must be finite.")
        return format(value, "f")
    if isinstance(value, float): raise PMRSError("FLOAT_NOT_SUPPORTED", "Supply an exact decimal string.")
    if isinstance(value, list): return "[" + ",".join(wire(x) for x in value) + "]"
    if isinstance(value, dict):
        require(all(isinstance(k, str) for k in value), "JSON_KEYS", "JSON object keys must be strings.")
        return "{" + ",".join(wire(k) + ":" + wire(value[k]) for k in sorted(value)) + "}"
    raise PMRSError("JSON_TYPE", "Unsupported JSON value.", details={"type": type(value).__name__})

def encode(value):
    return wire(value).encode("utf-8")

def decode(value, *, limit=MAX_JSON_BYTES):
    require(isinstance(value, (bytes, bytearray)) and len(value) <= limit,
            "JSON_LIMIT", "JSON exceeds its declared receiving limit.", limit=limit)
    def unique(pairs):
        out = {}
        for k, v in pairs:
            require(k not in out, "JSON_DUPLICATE_KEY", "JSON repeats an object key.", key=k)
            out[k] = v
        return out
    try:
        return json.loads(value.decode("utf-8"), parse_float=Decimal,
                          parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)),
                          object_pairs_hook=unique)
    except PMRSError: raise
    except (ValueError, UnicodeError, RecursionError) as error:
        raise PMRSError("JSON_INVALID", "Invalid UTF-8 JSON.") from error

def digest(value):
    return hashlib.sha256(encode(value)).hexdigest()

def sha_bytes(value):
    return hashlib.sha256(value).hexdigest()

def full_sha(value):
    require(isinstance(value, str) and HEX.fullmatch(value), "SHA_REQUIRED", "A full lowercase SHA-256 is required.")
    return value

def request_id(value):
    try: parsed = uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        raise PMRSError("REQUEST_ID", "Use a canonical UUID request identifier.")
    require(str(parsed) == value and parsed.version == 4, "REQUEST_ID", "Use a canonical UUIDv4 request identifier.")
    return value

def guid(value):
    try: parsed = uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        raise PMRSError("NATIVE_ID", "A native GUID is required.")
    require(parsed.int != 0, "NATIVE_ID", "The empty native GUID is not selectable.")
    return str(parsed)

def identifier(value):
    require(isinstance(value, str) and NAME.fullmatch(value), "NATIVE_NAME", "Use an actual native logical name.")
    return value

def stable_text(value, maximum=4096):
    require(isinstance(value, str) and len(value) <= maximum and "\x00" not in value,
            "TEXT_REQUIRED", "Text is missing or too large.", maximum=maximum)
    return value

def date(value):
    require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value),
            "DATE_REQUIRED", "Use an exact calendar date.")
    try: dt.date.fromisoformat(value)
    except ValueError: raise PMRSError("DATE_REQUIRED", "Invalid calendar date.")
    return value

def fsync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try: os.fsync(descriptor)
    finally: os.close(descriptor)

def private_directory(path):
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    require(path.is_dir() and not path.is_symlink(), "DIRECTORY_INVALID", "Expected an owned directory.")
    os.chmod(path, 0o700)
    return path

def regular_file(path):
    path = Path(path)
    require(path.is_file() and not path.is_symlink(), "FILE_INVALID", "Expected a retained regular file.")
    return path

def read_bytes(path, *, limit=MAX_JSON_BYTES):
    path = regular_file(path)
    require(path.stat().st_size <= limit, "FILE_LIMIT", "File exceeds the selected limit.", limit=limit)
    return path.read_bytes()

def atomic(path, data, *, replace=False):
    path = Path(path)
    private_directory(path.parent)
    require(isinstance(data, bytes), "BYTES_REQUIRED", "Atomic publication requires complete bytes.")
    if path.exists():
        regular_file(path)
        if not replace:
            require(path.read_bytes() == data, "IMMUTABLE_MISMATCH",
                    "The retained file has different bytes.", name=path.name)
            return
    descriptor, temporary = tempfile.mkstemp(prefix=".publish-", dir=path.parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        if replace:
            os.replace(temporary, path)
        else:
            try: os.link(temporary, path)
            except FileExistsError:
                require(regular_file(path).read_bytes() == data, "IMMUTABLE_MISMATCH",
                        "A concurrent publication retained different bytes.", name=path.name)
        fsync_directory(path.parent)
    finally:
        try: os.unlink(temporary)
        except FileNotFoundError: pass

def json_file(path, value, *, replace=False):
    data = encode(value) + b"\n"
    require(len(data) <= MAX_JSON_BYTES, "JSON_LIMIT",
            "Retained JSON exceeds 32 MiB; select a smaller operation.")
    atomic(path, data, replace=replace)

def ui_value(value):
    """Decimal strings and large integer strings keep browser rendering lossless."""
    if isinstance(value, Decimal): return format(value, "f")
    if isinstance(value, int) and not isinstance(value, bool) and abs(value) > 9007199254740991:
        return str(value)
    if isinstance(value, dict): return {k: ui_value(v) for k, v in value.items()}
    if isinstance(value, list): return [ui_value(v) for v in value]
    return value
