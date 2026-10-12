#!/usr/bin/env python3
"""Prepare complete revenue source records from the original CanadaBuys acquisition."""
import argparse, csv, hashlib, importlib.util, json, os, re, sys, zipfile
from pathlib import Path
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
OPERATION = "SCF-CANADABUYS-PROCUREMENT-9FCD-20261012"
TENDER_KEYS = {
    "reference_number": "referenceNumber-numeroReference",
    "solicitation_number": "solicitationNumber-numeroSollicitation",
    "title": "title-titre-eng",
    "closing_date_raw": "tenderClosingDate-appelOffresDateCloture",
    "issuer": "contractingEntityName-nomEntitContractante-eng",
    "notice_url": "noticeURL-URLavis-eng",
}
AWARD_KEYS = {
    "reference_number": "referenceNumber-numeroReference",
    "solicitation_number": "solicitationNumber-numeroSollicitation",
    "contract_number": "contractNumber-numeroContrat",
    "amendment": "amendmentNumber-numeroModification",
    "title": "title-titre-eng",
    "supplier": "supplierLegalName-nomLegalFournisseur-eng",
    "issuer": "contractingEntityName-nomEntitContractante-eng",
    "award_date_raw": "contractAwardDate-dateAttributionContrat",
    "end_date_raw": "contractEndDate-dateFinContrat",
    "award_status": "awardStatus-attributionStatut-eng",
    "currency_raw": "contractCurrency-contratMonnaie",
    "contract_amount_raw": "contractAmount-montantContrat",
    "total_contract_value_raw": "totalContractValue-valeurTotaleContrat",
    "instrument_type": "instrumentType-typeInstrument-eng",
}
# These are transparent discovery terms applied to actual source text. Every match
# retains its original field/value and all columns of the original record.
PATTERNS = {
    "software": r"\b(?:software|logiciels?|SaaS|ERP|CRM|SAP|ServiceNow|Salesforce|Drupal|WordPress|Microsoft Dynamics|SharePoint|Azure|Power BI|Moodle|Totara|D2L|Brightspace|LMS|LXP)\b",
    "data": r"\b(?:databases?|data (?:migration|integration|management|analytics|warehouse|platform|governance|conversion)|bases? de donn[eé]es|(?:migration|int[eé]gration|gestion|gouvernance|analyse) des? donn[eé]es)\b",
    "application": r"\b(?:application (?:development|management|maintenance|monitoring|modernization|performance)|(?:d[eé]veloppement|gestion|maintenance|modernisation|performance) des? applications?)\b",
    "digital": r"\b(?:information technology|information systems?|IT (?:services?|consulting)|informatics|informatique|digital transformation|transformation num[eé]rique|cloud (?:services?|computing|platform)|infonuagique|observability|observabilit[eé])\b",
    "integration": r"\b(?:systems? integration|int[eé]gration de syst[eè]mes?|business intelligence|intelligence d'affaires|learning (?:management|experience) (?:system|platform)|web (?:development|application)|websites?|sites? web|enterprise (?:resource|content|data)|gestion de contenu)\b",
}
MATCH_FIELDS = [
    "title-titre-eng", "title-titre-fra",
    "gsinDescription-nibsDescription-eng", "gsinDescription-nibsDescription-fra",
    "unspscDescription-eng", "unspscDescription-fra",
    "awardDescription-descriptionAttribution-eng", "awardDescription-descriptionAttribution-fra",
    "tenderDescription-descriptionAppelOffres-eng", "tenderDescription-descriptionAppelOffres-fra",
]

def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def dump(path, value):
    with path.open("x", encoding="utf-8", newline="\n") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write("\n")

def iter_records(path):
    csv.field_size_limit(min(sys.maxsize, 2**63 - 1))
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, strict=True)
        headers = next(reader)
        if len(headers) != len(set(headers)):
            raise ValueError("Repeated source columns")
        record = 0
        for values in reader:
            if not values:
                continue
            record += 1
            if len(values) != len(headers):
                raise ValueError("Source column mismatch at record " + str(record))
            yield record, headers, dict(zip(headers, values))

def matches(values):
    found = []
    for field in MATCH_FIELDS:
        value = values.get(field, "")
        for category, pattern in PATTERNS.items():
            match = re.search(pattern, value, re.I)
            if match:
                found.append({"category": category, "field": field,
                              "matched_text": match.group(0), "start": match.start()})
    return found

def source_ref(capture, record):
    return {"source_url": capture["requested_url"],
            "csv_sha256": capture["csv"]["sha256"], "record_number": record}

def write_tenders(source, capture, out):
    index = out / "open-tenders-index.tsv"
    full = out / "open-tenders-complete.jsonl"
    selected = out / "open-tenders-software-data.jsonl"
    candidates = []
    apm = []
    requested_originals = []
    requested_numbers = {34, 35, 550, 900, 851}
    expected_tender_sha = "c1f2273a6b7cc2d6da4c3d9d17baf5d4dce1ee49f3e11644cd568e683e473a21"
    if capture["csv"]["sha256"] != expected_tender_sha:
        raise ValueError("Requested tender record numbers require the retained 12 October source edition")
    count = 0
    with index.open("x", encoding="utf-8", newline="") as ix, \
         full.open("x", encoding="utf-8", newline="\n") as all_rows, \
         selected.open("x", encoding="utf-8", newline="\n") as selected_rows:
        writer = csv.DictWriter(ix, fieldnames=["record_number", *TENDER_KEYS], delimiter="\t")
        writer.writeheader()
        for record, headers, values in iter_records(source):
            count += 1
            writer.writerow({"record_number": record, **{key: values.get(field, "") for key, field in TENDER_KEYS.items()}})
            row = {"source": source_ref(capture, record), "values": values}
            if record in requested_numbers:
                requested_originals.append(row)
            all_rows.write(json.dumps(row, ensure_ascii=False) + "\n")
            found = matches(values)
            if found:
                selected_rows.write(json.dumps({**row, "discovery_matches": found}, ensure_ascii=False) + "\n")
                candidates.append(record)
            if ("35133" in values.get("solicitationNumber-numeroSollicitation", "") or
                "BPM026762" in values.get("referenceNumber-numeroReference", "")):
                apm.append(row)
    if count != capture["csv"]["records"]:
        raise ValueError("Tender index is not the complete selected source")
    if {r["source"]["record_number"] for r in requested_originals} != requested_numbers:
        raise ValueError("A requested original tender record is missing")
    dump(out / "requested-five-complete-tender-records.json", requested_originals)
    with (out / "requested-five-complete-tender-records.csv").open("x", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(requested_originals[0]["values"]))
        writer.writeheader()
        writer.writerows(r["values"] for r in requested_originals)
    dump(out / "apm2-complete-original-tender-records.json", apm)
    return {"records": count, "columns": capture["csv"]["column_count"],
            "software_data_candidates": len(candidates), "candidate_record_numbers": candidates,
            "apm2_record_numbers": [r["source"]["record_number"] for r in apm],
            "requested_originals": [{"record_number": r["source"]["record_number"], **{k:r["values"].get(v,"") for k,v in TENDER_KEYS.items()}} for r in requested_originals],
            "index": index.name, "all_original_records": full.name,
            "candidate_original_records": selected.name}

def write_awards(source, capture, out):
    full = out / "awards-software-data-complete.csv"
    selected = out / "awards-software-data-complete.jsonl"
    index = out / "awards-software-data-index.tsv"
    selected_ids = []
    count = 0
    supplier_counts = {}
    with full.open("x", encoding="utf-8", newline="") as full_csv, \
         selected.open("x", encoding="utf-8", newline="\n") as jsonl, \
         index.open("x", encoding="utf-8", newline="") as ix:
        full_writer = None
        index_writer = csv.DictWriter(ix, fieldnames=["record_number", *AWARD_KEYS, "discovery_categories"], delimiter="\t")
        index_writer.writeheader()
        for record, headers, values in iter_records(source):
            count += 1
            if full_writer is None:
                full_writer = csv.DictWriter(full_csv, fieldnames=headers)
                full_writer.writeheader()
            found = matches(values)
            if not found:
                continue
            selected_ids.append(record)
            full_writer.writerow(values)
            jsonl.write(json.dumps({"source": source_ref(capture, record), "values": values,
                                   "discovery_matches": found}, ensure_ascii=False) + "\n")
            categories = sorted({r["category"] for r in found})
            index_writer.writerow({"record_number": record,
                **{key: values.get(field, "") for key, field in AWARD_KEYS.items()},
                "discovery_categories": ", ".join(categories)})
            supplier = values.get(AWARD_KEYS["supplier"], "")
            supplier_counts[supplier] = supplier_counts.get(supplier, 0) + 1
    if count != capture["csv"]["records"]:
        raise ValueError("Award selection did not read the complete source")
    return {"source_records": count, "original_columns": capture["csv"]["column_count"],
            "selected_records": len(selected_ids), "selected_record_numbers": selected_ids,
            "supplier_record_counts": supplier_counts,
            "all_original_selected_columns": full.name, "selected_original_records": selected.name,
            "index": index.name}

def compress_original(root, name, capture, out):
    original = root / capture["csv"]["path"]
    archive = out / ("canadabuys-" + name + "-complete.zip")
    with zipfile.ZipFile(archive, "x", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        z.write(original, name + ".csv")
        z.writestr("source-receiving.json", json.dumps({
            "schema": "commons.canadabuys.complete-original-source.v1",
            "operation_id": OPERATION, "source": name, "capture": capture,
        }, ensure_ascii=False, indent=2) + "\n")
    with zipfile.ZipFile(archive) as z:
        h = hashlib.sha256()
        with z.open(name + ".csv") as f:
            for block in iter(lambda: f.read(1024 * 1024), b""):
                h.update(block)
        if h.hexdigest() != capture["csv"]["sha256"]:
            raise ValueError("The complete archive source differs")
    return {"path": archive.name, "bytes": archive.stat().st_size, "sha256": sha(archive)}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-directory", required=True)
    parser.add_argument("--output-directory", required=True)
    args = parser.parse_args()
    os.umask(0o077)
    root = Path(args.source_directory).absolute()
    out = Path(args.output_directory).absolute()
    if root.resolve() != root or out.resolve() != out:
        raise ValueError("Use ordinary absolute source and output paths")
    out.mkdir(mode=0o700)
    state = json.loads((root / "source-receiving.json").read_text(encoding="utf-8"))
    if state.get("operation_id") != OPERATION:
        raise ValueError("Select the original CanadaBuys source operation")
    captures = {name: state["sources"][name] for name in ("open-tenders", "awards")}
    for name, capture in captures.items():
        original = root / capture["csv"]["path"]
        if original.stat().st_size != capture["csv"]["bytes"] or sha(original) != capture["csv"]["sha256"]:
            raise ValueError("The complete original source differs: " + name)
    report = {"schema": "commons.canadabuys.revenue-source-delivery.v1", "operation_id": OPERATION,
              "prepared_at": datetime.now(timezone.utc).isoformat(),
              "source_receiving": state, "selection_patterns": PATTERNS, "selection_fields": MATCH_FIELDS}
    report["tenders"] = write_tenders(root / captures["open-tenders"]["csv"]["path"], captures["open-tenders"], out)
    report["awards"] = write_awards(root / captures["awards"]["csv"]["path"], captures["awards"], out)
    report["archives"] = [compress_original(root, name, capture, out) for name, capture in captures.items()]
    dump(out / "revenue-source-result.json", report)
    readme = f"""# Complete CanadaBuys procurement source

The delivery contains all {report['tenders']['records']} original open tender records and
the complete {report['awards']['source_records']}-record award source. The source CSVs remain
byte-for-byte inside their named ZIP files. All derived values retain their original strings.

## Files

- requested-five-complete-tender-records.json and .csv: all 67 fields of original records 34, 35, 550, 900 and 851, selected from the same source edition.
- open-tenders-index.tsv: all tender records, with source record number, reference and solicitation, English title, raw closing date, issuer and notice URL.
- open-tenders-complete.jsonl: all {report['tenders']['records']} records with all 67 source fields and original source identities.
- open-tenders-software-data.jsonl: {report['tenders']['software_data_candidates']} text-matched discovery candidates, complete original records and exact matching fields.
- awards-software-data-complete.csv: {report['awards']['selected_records']} selected award records with all 80 original columns.
- awards-software-data-complete.jsonl: those complete award records, each original record number, source identity and exact discovery match.
- awards-software-data-index.tsv: navigable award and supplier index. Contract amount and cumulative value remain distinct original strings.
- apm2-complete-original-tender-records.json: the complete original APM2 row or rows selected by their original solicitation/reference.
- revenue-source-result.json: the full source capture, exact selection expressions, counts and selected original record numbers.
- canadabuys-open-tenders-complete.zip and canadabuys-awards-complete.zip: complete unchanged source CSV and source capture.

The source's original record number counts CSV records after the header, including quoted multiline descriptions.
A text match is a way to locate records for the existing procurement qualification workflow.
Award amendments and repeated solicitations remain distinct; no amounts are summed and no supplier is assumed eligible.
The full source is provided so another selection can be made without downloading it again.

The original sources are published by Public Services and Procurement Canada through CanadaBuys:
https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv
https://canadabuys.canada.ca/opendata/pub/awardNoticeComplete-avisAttributionComplet.csv

Source attribution and terms: Open Government Licence - Canada,
https://open.canada.ca/en/open-government-licence-canada .

To regenerate these indexes from the delivered original acquisition, run:
python3 prepare-revenue-source.py --source-directory /absolute/original/source --output-directory /absolute/new/output
"""
    (out / "README.md").write_text(readme, encoding="utf-8")
    inventory = [{"path": str(path.relative_to(out)), "bytes": path.stat().st_size, "sha256": sha(path)}
                 for path in sorted(out.rglob("*")) if path.is_file()]
    dump(out / "delivery-files.json", inventory)
    print(json.dumps({"status": "COMPLETE", "operation_id": OPERATION, "output": str(out),
                      "tenders": report["tenders"], "awards": {k:v for k,v in report["awards"].items()
                           if k not in ("selected_record_numbers", "supplier_record_counts")},
                      "archives": report["archives"]}, ensure_ascii=False), flush=True)

if __name__ == "__main__":
    main()
