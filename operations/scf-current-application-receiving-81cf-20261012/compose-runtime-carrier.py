#!/usr/bin/env python3
"""Apply maintained receiving runtime files to a complete original SCF carrier."""
import argparse
import ast
import base64
import hashlib
import json
from pathlib import Path
import struct

RUNTIME_FILES = (
    "receive_current.py", "receive_review.py", "receive-pty.py",
    "scf_native_process.py", "README.md", "compose-runtime-carrier.py",
    "receive-prepared-review.mjs",
)


def sha256(body):
    return hashlib.sha256(body).hexdigest()


def git_blob(body):
    return hashlib.sha1(b"blob " + str(len(body)).encode("ascii") + b"\0" + body).hexdigest()


def decode_lzw(body, expected_size):
    if len(body) % 2:
        raise ValueError("The original LZW16 carrier has an incomplete code")
    table = [bytes([number]) for number in range(256)] + [None]
    previous = b""
    output = bytearray()
    for (code,) in struct.iter_unpack(">H", body):
        if code == 256:
            table = [bytes([number]) for number in range(256)] + [None]
            previous = b""
            continue
        if code < len(table):
            entry = table[code]
        elif code == len(table) and previous:
            entry = previous + previous[:1]
        else:
            raise ValueError("Invalid original LZW16 code")
        if entry is None:
            raise ValueError("Invalid original LZW16 entry")
        output.extend(entry)
        if len(output) > expected_size:
            raise ValueError("The decoded carrier exceeds its original packet length")
        if previous:
            table.append(previous + entry[:1])
        previous = entry
    if len(output) != expected_size:
        raise ValueError("The original complete packet length differs")
    return bytes(output)


def encode_lzw(body):
    output = bytearray()
    dictionary = {}
    next_code, previous = 257, None

    def emit(code):
        output.extend(struct.pack(">H", code))

    emit(256)
    for byte in body:
        if previous is None:
            previous = byte
            continue
        key = (previous, byte)
        code = dictionary.get(key)
        if code is not None:
            previous = code
            continue
        emit(previous)
        if next_code <= 65535:
            dictionary[key] = next_code
            next_code += 1
        else:
            emit(256)
            dictionary = {}
            next_code = 257
        previous = byte
    if previous is not None:
        emit(previous)
    return bytes(output)


def compose(carrier_bytes, runtime_directory):
    carrier = json.loads(carrier_bytes)
    if carrier.get("schema") != "stellar-forge.current-receiving-carrier.v1":
        raise ValueError("Select the complete original receiving carrier")
    encoded = carrier["payload"].encode("ascii")
    if len(encoded) != carrier["encodedBytes"] or sha256(encoded) != carrier["encodedSha256"]:
        raise ValueError("The complete original encoded source differs")
    original = decode_lzw(base64.b64decode(encoded, validate=True), carrier["packetBytes"])
    if sha256(original) != carrier["packetSha256"]:
        raise ValueError("The complete original decoded source differs")
    packet = json.loads(original)
    if packet.get("schema") != "stellar-forge.complete-current-receiving-source.v1":
        raise ValueError("Select the original complete current application packet")
    if packet.get("operationId") != carrier["operationId"]:
        raise ValueError("Keep the same original receiving operation")
    if packet.get("sourceCommit") != carrier["sourceCommit"]:
        raise ValueError("Keep the selected application source")

    original_runtime = packet["runtime"]
    paths = [row["path"] for row in original_runtime]
    if len(paths) != len(set(paths)):
        raise ValueError("The original runtime has duplicate paths")
    replacements = {}
    for name in RUNTIME_FILES:
        body = (Path(runtime_directory) / name).read_bytes()
        content = body.decode("utf-8")
        if name.endswith(".py"):
            ast.parse(content, filename=name)
        replacements[name] = {
            "path": name, "encoding": "utf-8", "content": content,
            "bytes": len(body), "sha256": sha256(body), "git_blob": git_blob(body),
        }
    runtime = [replacements.pop(row["path"], row) for row in original_runtime]
    runtime.extend(replacements.values())
    packet["runtime"] = runtime
    current = json.dumps(packet, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    payload = base64.b64encode(encode_lzw(current)).decode("ascii")
    if decode_lzw(base64.b64decode(payload), len(current)) != current:
        raise ValueError("The complete composed carrier did not reopen")
    result = dict(carrier)
    result.update({
        "runtimeFiles": len(runtime), "packetBytes": len(current),
        "packetSha256": sha256(current), "encodedBytes": len(payload),
        "encodedSha256": sha256(payload.encode("ascii")), "payload": payload,
        "runtimePredecessor": {
            "packetSha256": carrier["packetSha256"],
            "carrierGitBlob": git_blob(carrier_bytes),
        },
    })
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--carrier", type=Path, required=True)
    parser.add_argument("--runtime-directory", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = compose(args.carrier.read_bytes(), args.runtime_directory)
    body = (json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    with args.output.open("xb") as out:
        args.output.chmod(0o600)
        out.write(body)
    print(json.dumps({
        "path": str(args.output), "bytes": len(body), "sha256": sha256(body),
        "operationId": result["operationId"], "sourceCommit": result["sourceCommit"],
        "sourceFiles": result["sourceFiles"], "runtimeFiles": result["runtimeFiles"],
        "packetBytes": result["packetBytes"], "packetSha256": result["packetSha256"],
        "encodedBytes": result["encodedBytes"], "encodedSha256": result["encodedSha256"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
