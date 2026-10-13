#!/usr/bin/env python3
"""Receive the exact completed HPD customer archive for the original commissioning job."""
import argparse, hashlib, io, json, os, pathlib, stat, tempfile, zipfile
from urllib.parse import urlsplit

ARCHIVE_SHA = "277f15432c25c8a3f554280ce52d2c101076b0b4dc75268af1f8decda8f14c33"
ARCHIVE_BYTES = 722634
MANIFEST_SHA = "fc4cb47a2e47795dbf026f734cfa7c493b4f141315a4f4fa63c165325e944322"
SESSION = "socrata-hpd-queens-paid-customer-1fb3-20261011"
CUSTOMER = "a3618289-2faa-4634-9ab6-f063995229ed"
SNAPSHOT = "11e07ef6b87c34cbf38dd975b8fbe44e2de22d50d273315736080162983c72ea"
PAGES = [
    (23970, "634374a493ae506b4ad4ed28cc37d5c24690057d5a0f3e9833b78b75a3502218", 100),
    (11875, "0fe2d6ced0a0f981d58769f067febc2cdf829e22f8da6d26e68200584fd33e1c", 44),
]
EVIDENCE = [
    "4ddccdd88060675888d08c9f252310d190970465a94053efb4cd44b726a032bc",
    "babdd60f7e41efe2e827d47dd2ac1b43d43fadb29fba164e31e23815d2bfee71",
]
def require(ok, message):
    if not ok:
        raise ValueError(message)
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
def private(path, create=False):
    if create:
        if not path.parent.exists():
            private(path.parent, True)
        path.mkdir(mode=0o700, exist_ok=True)
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and not path.is_symlink()
            and path.resolve() == path and info.st_uid == os.getuid()
            and info.st_mode & 0o077 == 0, "Use a canonical private directory owned by this operator.")
def publish(path, raw):
    private(path.parent)
    if path.exists():
        require(not path.is_symlink() and path.read_bytes() == raw,
                "A retained intake file has different original bytes: " + str(path))
        return
    fd, temp = tempfile.mkstemp(prefix=".hpd-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temp, path)
        except FileExistsError:
            require(not path.is_symlink() and path.read_bytes() == raw,
                    "A concurrent intake changed the original file.")
        d = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(d)
        finally:
            os.close(d)
    finally:
        os.unlink(temp)
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=pathlib.Path, required=True)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args()
    out = args.out.absolute()
    require(out == out.resolve(), "Select a canonical intake output path.")
    private(out, True)
    raw = args.archive.read_bytes()
    require(len(raw) == ARCHIVE_BYTES and sha(raw) == ARCHIVE_SHA,
            "Select the original completed 144-row customer ZIP.")
    publish(out / "original-completed-customer.zip", raw)
    source = out / "original"
    private(source, True)
    inventory, by_hash, documents = [], {}, []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        seen, total = set(), 0
        for member in archive.infolist():
            name = member.filename
            path = pathlib.PurePosixPath(name)
            require(name and "\\" not in name and not path.is_absolute()
                    and all(x not in ("", ".", "..") for x in path.parts)
                    and name not in seen, "An archive member has an unsafe or duplicated name.")
            seen.add(name)
            mode = member.external_attr >> 16
            require(not stat.S_ISLNK(mode), "Archive symbolic links are not source files.")
            if member.is_dir():
                private(source.joinpath(*path.parts), True)
                continue
            require(member.file_size <= 64 * 1024 * 1024, "An original member exceeds the intake file limit.")
            total += member.file_size
            require(total <= 256 * 1024 * 1024, "The original ZIP exceeds its complete intake limit.")
            body = archive.read(member)
            target = source.joinpath(*path.parts)
            private(target.parent, True)
            publish(target, body)
            row = {"name": name, "path": str(target), "bytes": len(body), "sha256": sha(body)}
            inventory.append(row)
            by_hash.setdefault(row["sha256"], []).append(row)
            if name.lower().endswith(".json"):
                try:
                    value = json.loads(body)
                except (UnicodeDecodeError, json.JSONDecodeError):
                    continue
                if isinstance(value, dict):
                    documents.append((row, value))
    def original(digest):
        found = by_hash.get(digest, [])
        require(found, "The complete original archive is missing expected source " + digest)
        return sorted(found, key=lambda row: row["name"])[0]
    manifest_ref = original(MANIFEST_SHA)
    manifest = json.loads(pathlib.Path(manifest_ref["path"]).read_bytes())
    require(manifest.get("schema") == "stellar-forge.sf88.dataset-acquisition.v1"
            and manifest.get("status") == "COMPLETE"
            and manifest.get("sessionId") == SESSION
            and manifest.get("snapshot") == SNAPSHOT
            and manifest.get("completedPages") == 2 and manifest.get("acquiredRows") == 144
            and manifest.get("totalRows") == 144
            and len(manifest.get("pages", [])) == 2, "The original acquisition identity or complete audience changed.")
    baseline = out / "baseline"
    private(baseline, True)
    pages, page_documents = [], []
    for index, (size, digest, count) in enumerate(PAGES):
        member = original(digest)
        require(member["bytes"] == size, "The original body length changed.")
        body = pathlib.Path(member["path"]).read_bytes()
        doc = json.loads(body)
        saved = manifest["pages"][index]
        require(saved.get("index") == index + 1 and saved.get("sha256") == digest
                and saved.get("bytes") == size and saved.get("returned") == count
                and saved.get("snapshot") == SNAPSHOT
                and saved.get("evidenceSha256") == EVIDENCE[index],
                "A page is not the original acquisition's selected body/evidence pair.")
        url = saved.get("requestUrl", "")
        parsed = urlsplit(url)
        require(parsed.scheme == "https" and parsed.netloc == "merchant.routescan39da.scf.test"
                and parsed.path == "/hpd-queens" and not parsed.fragment,
                "Keep the exact original HPD origin, route and query.")
        require(doc.get("dataset", {}).get("snapshot") == SNAPSHOT
                and doc.get("page", {}).get("returned") == count
                and doc.get("page", {}).get("total") == 144,
                "The original page snapshot or row count differs.")
        destination = baseline / ("page-" + str(index + 1) + ".json")
        publish(destination, body)
        evidence_ref = original(EVIDENCE[index])
        evidence = json.loads(pathlib.Path(evidence_ref["path"]).read_bytes())
        require(evidence.get("schema") == "scf82.checkout-evidence.v1"
                and evidence.get("intentId") == saved.get("intentId"),
                "The retained evidence belongs to another buyer attempt.")
        pages.append({"id": "page-" + str(index + 1), "index": index + 1,
                      "url": url, "method": "GET", "original_intent_id": saved["intentId"],
                      "output": {"path": str(destination), "bytes": size, "sha256": digest},
                      "rows": count, "original_member": member,
                      "evidence": evidence_ref})
        page_documents.append(doc)
    require(page_documents[1]["page"].get("nextCursor") is None,
            "The retained second page is not terminal.")
    definitions = [(row, value) for row, value in documents
                   if isinstance(value.get("config"), dict)
                   and value["config"].get("operation", {}).get("intentId") == SESSION
                   and value.get("configurationSha256") == manifest.get("configurationSha256")]
    unique = {}
    for row, value in definitions:
        key = json.dumps(value["config"], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        unique.setdefault(key, (row, value))
    require(len(unique) == 1, "Select the one original saved acquisition configuration.")
    definition_ref, definition = next(iter(unique.values()))
    template_path = out / "original-buyer-template.json"
    publish(template_path, encode(definition["config"]))
    deliveries = [(row, value) for row, value in documents
                  if value.get("schema") == "stellar-forge.buyer-delivery-manifest.v1"
                  and value.get("dataset", {}).get("snapshot") == SNAPSHOT
                  and value.get("dataset", {}).get("rows") == 144]
    require(deliveries, "The complete customer data-room manifest is required.")
    delivery_ref, delivery = sorted(deliveries, key=lambda pair: pair[0]["name"])[0]
    outputs = {}
    for name, expected in delivery.get("outputs", {}).items():
        member = original(expected.get("sha256"))
        require(member["bytes"] == expected.get("bytes"), "A complete customer output length differs.")
        outputs[name] = member
    require("dataset.csv" in outputs and "dataset.jsonl" in outputs,
            "Retain both original complete customer formats.")
    schema = {"schema": "commons.hpd-customer-output-contract.v1", "snapshot": SNAPSHOT,
              "dataset": page_documents[0]["dataset"], "fields": page_documents[0]["fields"],
              "filters": page_documents[0].get("filters"),
              "original_query_signature": delivery["dataset"].get("originalQuerySignature"),
              "pages": [{"id": x["id"], "rows": x["rows"], "url": x["url"],
                         "body_sha256": x["output"]["sha256"]} for x in pages],
              "grain": "One original building-in-project source record.",
              "whole_customer_rows": 144, "original_source_rows": 1342}
    publish(out / "output-schema.json", encode(schema))
    scope = ("# Queens HPD preservation customer edition\n\n"
             "This commissioning keeps the original 1,342-record Queens HPD source edition and the complete "
             "144-record preservation selection. Its grain is one building-in-project record. Repeated project "
             "and building identifiers remain separate source records; aggregate only under the retained reading guide.\n\n"
             "Original customer: " + CUSTOMER + "\n\nOriginal acquisition: " + SESSION +
             "\n\nSnapshot: " + SNAPSHOT + "\n\n"
             "Use both unchanged request URLs and bodies in output-schema.json: 100 rows followed by 44 rows, "
             "with the original final null cursor. Source fields, scalar types, projection, filter, ordering and "
             "null behavior come from that original dataset contract. The full source, CSV, JSONL, original "
             "payment records and reading material remain in original/.\n")
    publish(out / "source-scope.md", scope.encode())
    acceptance = ("# Receiving the complete Queens HPD customer task\n\n"
                  "The receiving operator opens both original page outputs and the complete 144-row CSV/JSONL "
                  "in the original Socrata/SF88 customer workflow. For each selected facilitator, retain both "
                  "new original buyer attempts, exact approved request/query, actual transfer and complete "
                  "returned file. Compare whole file identities and the unchanged snapshot, projection and "
                  "100 + 44 page continuity. Record the actual receiving decision and time after inspecting "
                  "the complete customer output.\n\n"
                  "The historical two paid pages remain the accepted baseline. Their attempts and transfers "
                  "stay attached to the original acquisition. The paired commissioning uses its own retained "
                  "provider/page commands and records the actual later buyer outcomes in that same source lineage.\n")
    publish(out / "acceptance.md", acceptance.encode())
    result = {"schema": "commons.hpd-original-commissioning-intake.v1",
              "archive": {"path": str(out / "original-completed-customer.zip"),
                          "bytes": len(raw), "sha256": ARCHIVE_SHA},
              "original_customer_id": CUSTOMER, "original_session_id": SESSION, "snapshot": SNAPSHOT,
              "manifest": manifest_ref, "definition": definition_ref, "pages": pages,
              "buyer_template": str(template_path), "customer_delivery": delivery_ref,
              "customer_outputs": outputs, "scope_file": str(out / "source-scope.md"),
              "schema_file": str(out / "output-schema.json"), "acceptance_file": str(out / "acceptance.md"),
              "original_inventory": inventory}
    publish(out / "hpd-source-intake.json", encode(result))
    print(json.dumps({"state": "ORIGINAL_SOURCE_RECEIVED", "intake": str(out / "hpd-source-intake.json"),
                      "intake_sha256": sha(encode(result)), "original_customer_id": CUSTOMER,
                      "session_id": SESSION, "snapshot": SNAPSHOT, "pages": len(pages), "rows": 144,
                      "archive_members": len(inventory)}, separators=(",", ":")))
if __name__ == "__main__":
    main()
