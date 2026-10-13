"""One bounded public HTTP(S) document observation, using Python's standard library.

fetch_document(url, destination, limits=None) returns a JSON-safe receipt.
Only the body is published at destination; no receipt, replay state or request
ledger is written here. The caller reserves its observation before calling and
owns receipt persistence. An interrupted call must not be silently refetched.

COMPLETE means the entire HTTP message body was captured, including a non-2xx
response. It does not establish document relevance or a full representation:
status 206 and Content-Range remain explicit response evidence. Content-Encoding
is not decoded. HTTP transfer framing (for example chunk markers) is decoded by
http.client. TRUNCATED/FAILED body hashes identify retained prefixes only.

All DNS answers must be public unicast. A connection uses an approved numeric
address directly, without a second DNS lookup; TLS still verifies the URL host.
Each redirect receives the same checks. Proxies, authentication, cookies,
referers, HTTPS downgrades, crawling and automatic HTTP retries are absent.
DNS resolution has a bounded caller wait and at most four outstanding daemon
resolver calls; an operating-system resolver cannot be forcibly cancelled.
Socket reads enforce the remaining whole-observation deadline, including
status/header/chunk metadata. Informational responses are bounded and retained
separately from the final response; protocol upgrades are refused. HTTPS bodies
delimited by connection close require a valid TLS closure alert. A slow local
filesystem is not a network timeout.

Source contracts: https://docs.python.org/3/library/http.client.html
https://docs.python.org/3/library/socket.html
https://docs.python.org/3/library/ssl.html
https://docs.python.org/3/library/ipaddress.html
https://www.rfc-editor.org/rfc/rfc9112.html#section-6.3
https://www.rfc-editor.org/rfc/rfc9112.html#section-9.8
"""
from __future__ import annotations

import datetime as dt
import hashlib
import http.client
import io
import ipaddress
import math
import os
from pathlib import Path
import queue
import re
import socket
import ssl
import stat
import threading
import time
from urllib.parse import quote, urljoin, urlsplit
import uuid

__all__ = ["fetch_document"]

_SCHEMA = "iati-public-document-fetch/1"
_DEFAULTS = {"maxBytes": 16 * 1024 * 1024, "timeoutSeconds": 60,
             "connectTimeoutSeconds": 10, "maxRedirects": 5}
_REDIRECTS = frozenset((301, 302, 303, 307, 308))
_HEADERS = frozenset(("content-type", "content-length", "content-encoding",
                      "content-range", "content-disposition", "etag",
                      "last-modified", "date", "location", "retry-after",
                      "cache-control", "transfer-encoding"))
_DNS_SLOTS = threading.BoundedSemaphore(4)
_V4_SPECIAL = tuple(ipaddress.ip_network(n) for n in (
    "192.0.0.0/24", "192.88.99.0/24", "198.18.0.0/15"))
_V6_PUBLIC = ipaddress.ip_network("2000::/3")
_V6_SPECIAL = tuple(ipaddress.ip_network(n) for n in (
    "2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20"))
_LABEL = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\Z")
_PERCENT = re.compile(r"%(?![0-9a-fA-F]{2})")


class _Failure(Exception):
    def __init__(self, code, message, state="FAILED"):
        super().__init__(message)
        self.code, self.state = code, state


class _StorageFailure(Exception):
    def __init__(self, error):
        self.error = error


def _now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _limits(value):
    if value is None:
        value = {}
    if not isinstance(value, dict) or set(value) - set(_DEFAULTS):
        raise ValueError("Unknown document acquisition limits")
    result = {**_DEFAULTS, **value}
    for name, maximum in (("maxBytes", 64 * 1024 * 1024), ("maxRedirects", 10)):
        number = result[name]
        minimum = 0 if name == "maxRedirects" else 1
        if type(number) is not int or not minimum <= number <= maximum:
            raise ValueError(f"{name} must be an integer in {minimum}..{maximum}")
    for name, maximum in (("timeoutSeconds", 120), ("connectTimeoutSeconds", 30)):
        number = result[name]
        if type(number) not in (int, float) or not math.isfinite(number) or not 1 <= number <= maximum:
            raise ValueError(f"{name} must be a finite number in 1..{maximum}")
    return result


def _remaining(deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise _Failure("TIMEOUT", "The whole document observation deadline expired")
    return remaining


def _url(value):
    if not isinstance(value, str) or not value or len(value.encode("utf-8")) > 16384:
        raise ValueError("A nonempty HTTP(S) URL of at most 16384 UTF-8 bytes is required")
    if any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value) or "\\" in value:
        raise ValueError("The published URL contains literal whitespace, controls or a backslash")
    if _PERCENT.search(value):
        raise ValueError("The URL contains an incomplete percent escape")
    try:
        parts = urlsplit(value)
        if parts.scheme not in ("http", "https") or not parts.netloc or not parts.hostname:
            raise ValueError("Only absolute HTTP(S) document URLs are supported")
        if parts.username is not None or parts.password is not None or "@" in parts.netloc:
            raise ValueError("URL credentials are not supported")
        host = parts.hostname
        if "%" in host:
            raise ValueError("Scoped or percent-encoded host addresses are not supported")
        port = parts.port if parts.port is not None else (443 if parts.scheme == "https" else 80)
        if not 1 <= port <= 65535:
            raise ValueError("The URL port is invalid")
    except (ValueError, UnicodeError) as exc:
        raise ValueError(str(exc)) from exc
    try:
        address = ipaddress.ip_address(host)
        host = str(address)
    except ValueError:
        try:
            host = (host[:-1] if host.endswith(".") else host).encode("idna").decode("ascii").lower()
        except UnicodeError as exc:
            raise ValueError("The URL hostname is invalid") from exc
        if len(host) > 253 or "." not in host or any(not _LABEL.fullmatch(p) for p in host.split(".")):
            raise ValueError("An absolute public DNS hostname or literal IP address is required")
        if host.endswith((".localhost", ".local", ".internal", ".home.arpa", ".invalid", ".test", ".example", ".onion")):
            raise _Failure("NON_PUBLIC_HOST", "The URL names a non-public hostname", "REFUSED")
    authority = f"[{host}]" if ":" in host else host
    if port != (443 if parts.scheme == "https" else 80):
        authority += f":{port}"
    path = quote(parts.path or "/", safe="/!$&'()*+,-.:;=@_%~")
    query = quote(parts.query, safe="/?!$&'()*+,-.:;=@_%~")
    has_query = "?" in value.split("#", 1)[0]
    target = path + ("?" + query if has_query else "")
    return {"url": value, "scheme": parts.scheme, "host": host, "port": port,
            "authority": authority, "target": target,
            "requestUrl": f"{parts.scheme}://{authority}{target}"}


def _public(address):
    ip = ipaddress.ip_address(address)
    if (not ip.is_global or ip.is_multicast or ip.is_loopback or ip.is_link_local
            or ip.is_reserved or ip.is_unspecified):
        return False
    if ip.version == 4:
        return not any(ip in network for network in _V4_SPECIAL)
    # Conservatively exclude translation/tunnelling and special-purpose ranges.
    # These explicit guards also keep the policy consistent on Python 3.12.
    return (ip in _V6_PUBLIC and ip.ipv4_mapped is None
            and not any(ip in network for network in _V6_SPECIAL))


def _resolve(host, port, deadline, hop):
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        family = socket.AF_INET if literal.version == 4 else socket.AF_INET6
        raw = [(family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "",
                (host, port) if family == socket.AF_INET else (host, port, 0, 0))]
    else:
        _remaining(deadline)
        if not _DNS_SLOTS.acquire(blocking=False):
            raise _Failure("DNS_BUSY", "Four earlier operating-system DNS calls are still outstanding")
        received = queue.Queue(maxsize=1)

        def resolve():
            try:
                answer = socket.getaddrinfo(host, port, socket.AF_UNSPEC,
                                            socket.SOCK_STREAM, socket.IPPROTO_TCP)
                received.put((True, answer))
            except Exception as exc:
                received.put((False, exc))
            finally:
                _DNS_SLOTS.release()

        worker = threading.Thread(target=resolve, name="iati-document-dns", daemon=True)
        try:
            worker.start()
        except BaseException:
            _DNS_SLOTS.release()
            raise
        try:
            success, raw = received.get(timeout=_remaining(deadline))
        except queue.Empty as exc:
            raise _Failure("DNS_TIMEOUT", "DNS did not finish before the observation deadline") from exc
        if not success:
            raise _Failure("DNS_ERROR", f"DNS resolution failed: {type(raw).__name__}: {raw}")
    _remaining(deadline)
    if not raw or len(raw) > 64:
        raise _Failure("DNS_ANSWER_LIMIT", "DNS returned no addresses or exceeded 64 address records", "REFUSED")
    chosen, seen = [], set()
    for family, kind, protocol, _canonical, sockaddr in raw:
        if family not in (socket.AF_INET, socket.AF_INET6) or kind != socket.SOCK_STREAM:
            raise _Failure("DNS_ADDRESS_TYPE", "DNS returned an unsupported address type", "REFUSED")
        try:
            address = str(ipaddress.ip_address(sockaddr[0]))
        except ValueError as exc:
            raise _Failure("DNS_ADDRESS_TYPE", "DNS returned an invalid numeric address", "REFUSED") from exc
        if sockaddr[1] != port or (family == socket.AF_INET6 and sockaddr[3] != 0):
            raise _Failure("DNS_ADDRESS_SCOPE", "DNS returned a scoped or mismatched destination", "REFUSED")
        if address not in hop["resolvedAddresses"]:
            hop["resolvedAddresses"].append(address)
        if not _public(address):
            raise _Failure("NON_PUBLIC_ADDRESS", "At least one resolved address is not public unicast", "REFUSED")
        key = (family, address)
        if key not in seen:
            seen.add(key)
            chosen.append((family, address, (address, port) if family == socket.AF_INET else (address, port, 0, 0)))
    if len(chosen) > 16:
        raise _Failure("DNS_ANSWER_LIMIT", "DNS exceeded 16 distinct addresses", "REFUSED")
    return chosen


class _DeadlineRaw(io.RawIOBase):
    def __init__(self, owner):
        super().__init__()
        self.owner = owner

    def readable(self):
        return True

    def readinto(self, target):
        if self.closed:
            raise ValueError("Read from closed document socket")
        self.owner.socket.settimeout(_remaining(self.owner.deadline))
        return self.owner.socket.recv_into(target)

    def fileno(self):
        return self.owner.socket.fileno()

    def close(self):
        if not self.closed:
            try:
                super().close()
            finally:
                self.owner.release()


class _DeadlineSocket:
    """Keep the socket alive for HTTPResponse's file after Connection: close."""
    def __init__(self, raw, deadline):
        self.socket, self.deadline = raw, deadline
        self.references, self.owner_closed = 1, False

    def release(self):
        self.references -= 1
        if self.references == 0:
            self.socket.close()

    def close(self):
        if not self.owner_closed:
            self.owner_closed = True
            self.release()

    def makefile(self, mode):
        if mode != "rb":
            raise ValueError("Only binary document response reads are supported")
        self.references += 1
        return io.BufferedReader(_DeadlineRaw(self), buffer_size=8192)

    def sendall(self, data):
        self.socket.settimeout(_remaining(self.deadline))
        self.socket.sendall(data)

    def fileno(self):
        return self.socket.fileno()


class _MetadataReader:
    """Bound all status/header/chunk/trailer lines without counting body bytes."""
    def __init__(self, original):
        self.original, self.left = original, 65536

    def readline(self, size=-1):
        limit = self.left + 1 if size < 0 else min(size, self.left + 1)
        line = self.original.readline(limit)
        self.left -= len(line)
        if self.left < 0:
            raise _Failure("HTTP_METADATA_LIMIT", "HTTP response metadata exceeded 65536 bytes")
        return line

    def __getattr__(self, name):
        return getattr(self.original, name)


class _Response(http.client.HTTPResponse):
    def __init__(self, *args, informational=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fp = _MetadataReader(self.fp)
        self.informational = informational if informational is not None else []

    def _read_status(self):
        # HTTPResponse.begin() skips only 100. Consume other informational
        # responses here so 102/103 cannot stand in for the final document.
        while True:
            version, status, reason = super()._read_status()
            if not 100 <= status < 200 or status == 101:
                return version, status, reason
            if len(self.informational) >= 32:
                raise _Failure("HTTP_INFORMATIONAL_LIMIT", "More than 32 informational HTTP responses were received")
            headers = http.client.parse_headers(self.fp)
            self.informational.append({
                "status": status, "reason": reason.strip(), "version": version,
                "receivedAt": _now(),
                "headers": [[k, v] for k, v in headers.items() if k.lower() in _HEADERS]})


def _connection(spec, addresses, deadline, limits, hop):
    last = None
    for family, address, sockaddr in addresses:
        attempt = {"address": address, "startedAt": _now(), "connectedAt": None,
                   "tlsVerified": False, "error": None}
        hop["connectionAttempts"].append(attempt)
        raw = socket.socket(family, socket.SOCK_STREAM, socket.IPPROTO_TCP)
        try:
            raw.settimeout(min(limits["connectTimeoutSeconds"], _remaining(deadline)))
            raw.connect(sockaddr)
            peer = str(ipaddress.ip_address(raw.getpeername()[0]))
            if peer != address or not _public(peer):
                raise _Failure("CONNECTED_ADDRESS_CHANGED", "The connected peer differs from the approved public address", "REFUSED")
            attempt["connectedAt"] = _now()
            if spec["scheme"] == "https":
                context = ssl.create_default_context()
                context.set_alpn_protocols(["http/1.1"])
                raw.settimeout(min(limits["connectTimeoutSeconds"], _remaining(deadline)))
                raw = context.wrap_socket(raw, server_hostname=spec["host"],
                                          suppress_ragged_eofs=False)
                attempt["tlsVerified"] = True
            _remaining(deadline)
            connection = http.client.HTTPConnection(spec["host"], spec["port"])
            connection.auto_open = 0
            connection.response_class = lambda *args, **kwargs: _Response(
                *args, informational=hop["informational"], **kwargs)
            connection.sock = _DeadlineSocket(raw, deadline)
            hop["connectedAddress"] = address
            return connection
        except _Failure as exc:
            attempt["error"] = {"code": exc.code, "message": str(exc)[:512]}
            raw.close()
            raise
        except ssl.SSLError as exc:
            attempt["error"] = {"code": "TLS_ERROR", "message": str(exc)[:512]}
            raw.close()
            raise _Failure("TLS_ERROR", "TLS certificate/hostname verification or handshake failed") from exc
        except OSError as exc:
            last = exc
            attempt["error"] = {"code": "CONNECT_ERROR", "message": str(exc)[:512]}
            raw.close()
    raise _Failure("CONNECT_ERROR", f"No approved address connected: {type(last).__name__}: {last}")


def _framing(response):
    # These responses have no message body regardless of framing headers.
    # In particular a 304 may describe the transfer coding of its representation.
    if response.status in (204, 304) or 100 <= response.status < 200:
        response.chunked, response.chunk_left, response.length = False, None, 0
        return 0
    transfer = response.headers.get_all("Transfer-Encoding", [])
    lengths = response.headers.get_all("Content-Length", [])
    if transfer and lengths:
        raise _Failure("HTTP_FRAMING", "Response contains both Transfer-Encoding and Content-Length")
    if transfer:
        if [v.strip().lower() for raw in transfer for v in raw.split(",")] != ["chunked"]:
            raise _Failure("HTTP_FRAMING", "Only identity or chunked HTTP transfer framing is supported")
        # HTTPResponse.begin() does not strip every legal transfer-field OWS.
        # After validation, make its body reader use the accepted chunk framing.
        response.chunked, response.chunk_left, response.length = True, None, None
    expected = None
    if lengths:
        tokens = [v.strip() for raw in lengths for v in raw.split(",")]
        if (not tokens or any(not re.fullmatch(r"[0-9]{1,20}", v) for v in tokens)
                or len({int(v) for v in tokens}) != 1):
            raise _Failure("HTTP_FRAMING", "Response Content-Length fields are invalid or contradictory")
        expected = int(tokens[0])
        # http.client reads only its first Content-Length. Equivalent duplicate
        # values are safe, but comma-joined values need an explicit exact length.
        response.length = expected
    return expected


def _destination(value):
    path = Path(value)
    if not path.is_absolute() or path.name in ("", ".", "..") or ".." in path.parts:
        raise ValueError("The document destination must be an absolute file path")
    parent = path.parent
    if parent.resolve(strict=True) != parent:
        raise ValueError("The document destination parent must not contain symlinks")
    descriptor = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        try:
            os.stat(path.name, dir_fd=descriptor, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise FileExistsError(f"Document destination already exists: {path}")
        name = ".iati-document-" + uuid.uuid4().hex + ".part"
        output = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=descriptor)
        return path, descriptor, name, output
    except BaseException:
        os.close(descriptor)
        raise


def fetch_document(url, destination, limits=None):
    """Observe one exact selected URL; publish only a newly captured body.

    Invalid argument types/limits/path and filesystem failures raise. Malformed
    URL strings return REFUSED without a request or body. Network, protocol and
    public-network-policy failures return a receipt. A body is present only
    after a terminal response began; incomplete bytes remain an explicit prefix.
    finalUrl/status name the last actual HTTP response, or are null if absent.
    hops additionally retain attempted requests that received no response.
    """
    limits = _limits(limits)
    if not isinstance(url, str):
        raise TypeError("The selected published URL must be a string")
    started, clock = _now(), time.monotonic()
    deadline = clock + limits["timeoutSeconds"]
    receipt = {"schema": _SCHEMA, "requestedUrl": url, "finalUrl": None,
               "startedAt": started, "finishedAt": None, "elapsedSeconds": None,
               "state": "FAILED", "status": None, "hops": [], "body": None,
               "error": None, "limits": dict(limits)}
    # The exact published URL is validated before opening any socket.
    try:
        spec = _url(url)
    except _Failure as exc:
        receipt.update(state=exc.state, error={"code": exc.code, "message": str(exc)})
        receipt.update(finishedAt=_now(), elapsedSeconds=round(time.monotonic() - clock, 6))
        return receipt
    except (ValueError, UnicodeError) as exc:
        receipt.update(state="REFUSED", error={"code": "INVALID_URL", "message": str(exc)[:2048]})
        receipt.update(finishedAt=_now(), elapsedSeconds=round(time.monotonic() - clock, 6))
        return receipt
    path, parent, temporary, output = _destination(destination)
    digest, count, terminal, encoding = hashlib.sha256(), 0, False, None

    def write(data):
        nonlocal count
        try:
            view = memoryview(data)
            while view:
                written = os.write(output, view)
                if written <= 0:
                    raise OSError("Document body write did not advance")
                digest.update(view[:written])
                count += written
                view = view[written:]
        except OSError as exc:
            raise _StorageFailure(exc) from exc

    try:
        try:
            seen = set()
            for redirect in range(limits["maxRedirects"] + 1):
                _remaining(deadline)
                if spec["requestUrl"] in seen:
                    raise _Failure("REDIRECT_LOOP", "The redirect chain revisits an earlier request URL", "REFUSED")
                seen.add(spec["requestUrl"])
                hop = {"url": spec["url"], "requestUrl": spec["requestUrl"],
                       "startedAt": _now(), "receivedAt": None, "status": None,
                       "reason": None, "httpVersion": None, "location": None,
                       "headers": [], "resolvedAddresses": [], "connectedAddress": None,
                       "connectionAttempts": [], "informational": []}
                receipt["hops"].append(hop)
                connection = response = None
                try:
                    addresses = _resolve(spec["host"], spec["port"], deadline, hop)
                    connection = _connection(spec, addresses, deadline, limits, hop)
                    connection.request("GET", spec["target"], headers={
                        "Host": spec["authority"], "Accept": "*/*",
                        "Accept-Encoding": "identity", "User-Agent": "IATI-Document-Evidence/1",
                        "Connection": "close"})
                    response = connection.getresponse()
                    hop.update(receivedAt=_now(), status=response.status, reason=response.reason,
                               httpVersion=response.version,
                               headers=[[k, v] for k, v in response.getheaders() if k.lower() in _HEADERS])
                    receipt.update(finalUrl=spec["url"], status=response.status)
                    if response.status == 101:
                        raise _Failure("HTTP_UPGRADE", "An HTTP protocol upgrade is not a document response", "REFUSED")
                    if response.status in _REDIRECTS:
                        locations = response.headers.get_all("Location", [])
                        if len(locations) != 1 or not locations[0]:
                            raise _Failure("REDIRECT_LOCATION", "Redirect requires one nonempty Location field")
                        hop["location"] = locations[0]
                        if redirect == limits["maxRedirects"]:
                            raise _Failure("REDIRECT_LIMIT", "The selected redirect limit was reached", "REFUSED")
                        try:
                            location = locations[0]
                            if (len(location.encode("utf-8")) > 16384
                                    or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in location)
                                    or "\\" in location):
                                raise ValueError("Location contains whitespace, controls, a backslash or excessive length")
                            following = _url(urljoin(spec["url"], location))
                        except (ValueError, _Failure) as exc:
                            raise _Failure("REDIRECT_REFUSED", f"Redirect target is invalid or non-public: {exc}", "REFUSED") from exc
                        if spec["scheme"] == "https" and following["scheme"] != "https":
                            raise _Failure("HTTPS_DOWNGRADE", "An HTTPS to HTTP redirect is refused", "REFUSED")
                        spec = following
                        continue
                    terminal = True
                    encoding = response.getheader("Content-Encoding")
                    expected = _framing(response)
                    while True:
                        _remaining(deadline)
                        try:
                            piece = response.read1(min(65536, limits["maxBytes"] - count + 1))
                        except http.client.IncompleteRead as exc:
                            # read1 has already returned every body byte. Its
                            # partial value can instead be an incomplete CRLF
                            # between chunks, which is never document content.
                            raise _Failure("INCOMPLETE_BODY", "The response ended inside its declared transfer framing") from exc
                        if not piece:
                            if expected is not None and count != expected:
                                raise _Failure("INCOMPLETE_BODY", "Response ended before the declared Content-Length")
                            receipt["state"] = "COMPLETE"
                            break
                        left = limits["maxBytes"] - count
                        write(piece[:left])
                        if len(piece) > left:
                            receipt.update(state="TRUNCATED", error={
                                "code": "MAX_BYTES", "message": "Response body exceeds the selected byte limit; only its prefix is retained"})
                            break
                    break
                finally:
                    if response is not None:
                        response.close()
                    if connection is not None:
                        connection.close()
        except _StorageFailure as exc:
            raise exc.error
        except _Failure as exc:
            receipt.update(state=exc.state, error={"code": exc.code, "message": str(exc)[:2048]})
        except (TimeoutError, socket.timeout) as exc:
            receipt.update(state="FAILED", error={"code": "TIMEOUT", "message": str(exc)[:512] or "Network timeout"})
        except ssl.SSLError as exc:
            receipt.update(state="FAILED", error={"code": "TLS_ERROR", "message": str(exc)[:512]})
        except (OSError, http.client.HTTPException) as exc:
            receipt.update(state="FAILED", error={"code": "NETWORK_ERROR", "message": f"{type(exc).__name__}: {exc}"[:512]})
        if terminal:
            os.fsync(output)
            before = os.fstat(output)
            if (not stat.S_ISREG(before.st_mode) or before.st_size != count
                    or path.parent.resolve(strict=True) != path.parent
                    or (os.stat(path.parent).st_dev, os.stat(path.parent).st_ino)
                    != (os.fstat(parent).st_dev, os.fstat(parent).st_ino)):
                raise OSError("The document body or selected physical destination changed")
            os.link(temporary, path.name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
            os.fsync(parent)
            published = os.stat(path, follow_symlinks=False)
            if (published.st_dev, published.st_ino, published.st_size) != (before.st_dev, before.st_ino, count):
                raise OSError("The published document path no longer names its exact captured body")
            receipt["body"] = {"path": str(path), "bytes": count,
                               "sha256": digest.hexdigest(), "complete": receipt["state"] == "COMPLETE",
                               "representation": "http-message-body", "contentEncoding": encoding}
        receipt.update(finishedAt=_now(), elapsedSeconds=round(time.monotonic() - clock, 6))
        return receipt
    finally:
        os.close(output)
        try:
            os.unlink(temporary, dir_fd=parent)
        finally:
            os.close(parent)
