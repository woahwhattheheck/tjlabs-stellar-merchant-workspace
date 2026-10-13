#!/usr/bin/env python3
"""Normalize the original edition workbook into Ntico's existing five-table API.

Reads the complete acquired XLSX/index and explicit observed worksheet layout.
Uses original bdnb_source validation and create-only publication. No downloads,
database, product admission, scheduler, or new receiving operation is started.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import os
import posixpath
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile
import xml.etree.ElementTree as ET

SCHEMA = "commons.bdnb-dictionary-normalization.v1"
OPERATION = "BDNB-NORD-SOURCES-2769-20261013"
HERE = "products/ntico/bdnb-territory"
ANALYSIS = "stellar/scf-starforge-20261009/sf30-seller-sdk/datasette-analysis"
NATIVE = "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python"
MAPPING = HERE + "/dictionaries/2026-02-a-v0.7.11-official.json"
EDITIONS = {"2025-07-a": ("2025-07.a", "v0.7.10"),
            "2026-02-a": ("2026-02.a", "v0.7.11")}
SHA = re.compile(r"[a-f0-9]{64}")
CELL = re.compile(r"([A-Z]+)([1-9][0-9]*)")
NAME = re.compile(r"[a-z_][a-z_0-9]*")
LIMIT = 64 * 1024 * 1024
TYPE_KEYS = ("type", "max_length", "precision", "scale", "bits")


def need(value, message):
    if not value:
        raise ValueError(message)


def pairs(items):
    result = {}
    for key, value in items:
        need(key not in result, "Duplicate JSON key: " + key)
        result[key] = value
    return result


def parse(raw):
    def invalid(value):
        raise ValueError("Non-finite JSON token: " + value)
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid)


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True,
                       separators=(",", ":")) + "\n").encode("utf-8")


def pin(value):
    need(isinstance(value, dict) and type(value.get("bytes")) is int
         and value["bytes"] >= 0 and isinstance(value.get("sha256"), str)
         and SHA.fullmatch(value["sha256"]), "Use a complete original file identity")
    return {"bytes": value["bytes"], "sha256": value["sha256"]}


def absolute(value):
    need(isinstance(value, str) and Path(value).is_absolute(), "Use an absolute original path")
    path = Path(value)
    need(path.resolve(strict=True) == path, "Use a canonical original path without symlinks")
    return path


def member(root, name):
    need(isinstance(name, str) and name and "\\" not in name, "Invalid relative member")
    relative = PurePosixPath(name)
    need(not relative.is_absolute() and str(relative) == name
         and all(p not in ("", ".", "..") for p in relative.parts), "Unsafe relative member")
    path = root.joinpath(*relative.parts)
    need(path.resolve(strict=True) == path and path.is_relative_to(root),
         "Original member escapes or traverses a symlink")
    return path


def signature(info):
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns


def read(path, maximum=None):
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        need(stat.S_ISREG(before.st_mode), "Original input must be a regular file")
        if maximum is not None:
            need(before.st_size <= maximum, "Complete JSON input exceeds capacity")
        digest, chunks, count = hashlib.sha256(), [], 0
        while block := stream.read(1024 * 1024):
            digest.update(block)
            count += len(block)
            if maximum is not None:
                chunks.append(block)
        need(count == before.st_size and signature(before) ==
             signature(os.fstat(stream.fileno())) == signature(os.stat(path, follow_symlinks=False)),
             "Original input changed during reading")
    return b"".join(chunks) if maximum is not None else None, {
        "bytes": count, "sha256": digest.hexdigest()}


def sql_type(raw, size=None):
    """Translate only explicit observed PostgreSQL type/size, preserving tokens."""
    need(isinstance(raw, str) and raw.strip(), "Missing original SQL type")
    value = re.sub(r"\s+", " ", raw.strip().lower())
    value = value.removeprefix("pg_catalog.")
    match = re.fullmatch(r"(varchar|character varying|character|char)\s*(?:\(\s*(\d+)\s*\))?", value)
    if match:
        length = match[2] or (str(size).strip() if size is not None else "")
        result = {"type": "text"}
        if length:
            need(length.isdigit() and 0 < int(length) <= 10000, "Unsupported varchar length")
            result["max_length"] = int(length)
        return result
    if value == "text":
        return {"type": "text"}
    if value in {"int2", "smallint", "int4", "integer", "int", "int8", "bigint"}:
        return {"type": "integer", "bits": {"int2": 16, "smallint": 16,
                "int4": 32, "integer": 32, "int": 32, "int8": 64, "bigint": 64}[value]}
    if value in {"bool", "boolean"}:
        return {"type": "boolean"}
    if value == "date":
        return {"type": "date"}
    geometry = re.fullmatch(r"geometry(?:\(\s*([a-z]+)\s*(?:,\s*(\d+)\s*)?\))?", value)
    if geometry:
        need(geometry[2] is None or int(geometry[2]) == 2154,
             "Original importer uses EPSG:2154; preserve another CRS for explicit source repair")
        return {"type": "geometry"}
    match = re.fullmatch(r"(?:numeric|decimal)(?:\(\s*(\d+)\s*,\s*(\d+)\s*\))?", value)
    if match:
        precision, scale = match[1], match[2]
        if precision is None and size is not None and str(size).strip():
            dimensions = re.fullmatch(r"(\d+)\s*,\s*(\d+)", str(size).strip())
            need(dimensions is not None, "Numeric size must retain explicit precision,scale")
            precision, scale = dimensions.groups()
        result = {"type": "decimal"}
        if precision is not None:
            need(0 < int(precision) <= 10000 and 0 <= int(scale) <= int(precision),
                 "Invalid original numeric precision/scale")
            result.update(precision=int(precision), scale=int(scale))
        return result
    raise ValueError("Unsupported original SQL type: " + raw)


class Normalizer:
    def __init__(self, path):
        self.path = absolute(path)
        raw, self.input_pin = read(self.path, LIMIT)
        self.input = parse(raw)
        required = {"schema", "checkout", "source_files", "acquisition_root",
                    "edition", "selection", "workbook", "index"}
        need(isinstance(self.input, dict) and required <= set(self.input) <= required |
             {"layouts", "table_semantics"}, "Use the complete normalization input")
        need(self.input["schema"] == SCHEMA + "/input", "Wrong normalization input schema")
        self.edition = self.input["edition"]
        need(self.edition in EDITIONS, "Select one original Nord edition")
        self.checkout = absolute(self.input["checkout"])
        self.root = absolute(self.input["acquisition_root"])
        self.files = {str(self.path): self.input_pin}
        self.source = self.modules()
        self.current = self.verify(member(self.checkout, MAPPING),
                                   self.roster[MAPPING], json_file=True)
        need(self.current.get("edition_binding", {}).get("directory") == "2026-02-a",
             "Keep the complete original current HTML mapping")
        self.names = [t["name"] for t in self.current["tables"]]
        need(len(self.names) == 5 and len(set(self.names)) == 5, "Five original tables required")
        self.defaults = {t["name"]: t for t in self.source.dictionary()[0]["tables"]}
        need(set(self.defaults) == set(self.names), "Original importer table contract changed")
        self.selection, self.workbook, self.index = self.originals()
        self.rows, self.cells = self.workbook_rows()
        self.sheet_titles = self.workbook_titles()

    def verify(self, path, expected, *, json_file=False):
        raw, actual = read(path, LIMIT if json_file else None)
        need(actual == pin(expected), "Whole original file differs: " + str(path))
        previous = self.files.get(str(path))
        need(previous is None or previous == actual, "One retained path changed")
        self.files[str(path)] = actual
        return parse(raw) if json_file else actual

    def modules(self):
        roster = self.input["source_files"]
        need(isinstance(roster, list) and roster, "Supply the exact complete original source roster")
        self.roster = {}
        for item in roster:
            need(isinstance(item, dict) and set(item) == {"path", "bytes", "sha256"}
                 and item["path"] not in self.roster, "Invalid or duplicate source roster member")
            self.verify(member(self.checkout, item["path"]), item)
            self.roster[item["path"]] = item
        required = {HERE + "/normalize_dictionary.py", MAPPING,
                    ANALYSIS + "/bdnb_source.py", ANALYSIS + "/bdnb_dictionary.json"}
        need(required <= set(self.roster), "Include complete normalizer and original importer sources")
        need(Path(__file__).resolve() == self.checkout / HERE / "normalize_dictionary.py",
             "Run the normalizer from the selected complete original checkout")
        for directory in (self.checkout / NATIVE, self.checkout / ANALYSIS):
            sys.path.insert(0, str(directory))
        source = importlib.import_module("bdnb_source")
        need(Path(source.__file__).resolve() == self.checkout / ANALYSIS / "bdnb_source.py",
             "Another checkout supplied the original importer")
        for module in list(sys.modules.values()):
            origin = getattr(module, "__file__", None)
            if origin:
                location = Path(origin).resolve()
                if location.is_relative_to(self.checkout):
                    need(str(location.relative_to(self.checkout)) in self.roster,
                         "Loaded original dependency is absent from complete source roster: " + str(location))
        return source

    def originals(self):
        chosen = self.input["selection"]
        selection_path = member(self.root, self.edition + "/selection.json")
        need(chosen.get("path") == str(selection_path), "Retain original acquisition selection path")
        selection = self.verify(selection_path, chosen, json_file=True)
        millesime, version = EDITIONS[self.edition]
        url = ("https://open-data.s3.fr-par.scw.cloud/bdnb_millesime_" + self.edition +
               "/millesime_" + self.edition + "_doc/documentation.xlsx")
        need(selection.get("directory") == self.edition and selection.get("millesime") == millesime
             and selection.get("version") == version and selection.get("dictionary_url") == url,
             "Original catalogue selection belongs to another edition")
        original = self.input["workbook"]
        workbook_path = absolute(original["path"])
        need(workbook_path.is_relative_to(self.root / self.edition),
             "Keep the matching edition's actual original workbook")
        workbook_pin = self.verify(workbook_path, original)
        if self.edition == "2026-02-a":
            binding = self.current["edition_binding"]
            need(workbook_pin == {"bytes": binding["workbook_bytes"],
                                  "sha256": binding["workbook_sha256"]},
                 "Current workbook differs from retained publisher identity")
        index_path = member(self.root, self.edition + "/dictionary-members.json")
        need(self.input["index"].get("path") == str(index_path),
             "Use acquisition's complete original workbook index")
        index = self.verify(index_path, self.input["index"], json_file=True)
        need(index.get("original") == {
            "path": str(workbook_path.relative_to(self.root)), **workbook_pin},
             "Index belongs to another complete workbook")
        need(isinstance(index.get("members"), list) and index["members"],
             "Keep the full original XLSX member inventory")
        names = [item.get("path") for item in index["members"]]
        need(len(names) == len(set(names)) and "[Content_Types].xml" in names
             and "xl/workbook.xml" in names, "Original XLSX inventory differs")
        return selection, {"path": str(workbook_path), **workbook_pin}, index

    def workbook_rows(self):
        sheets = self.index.get("worksheets")
        need(isinstance(sheets, list) and sheets, "Keep every original worksheet")
        inventory = {x["path"] for x in self.index["members"]}
        rows, cells = {}, {}
        for sheet in sheets:
            name = sheet.get("member")
            need(isinstance(name, str) and name in inventory and name not in rows
                 and re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name),
                 "Invalid or repeated original worksheet member")
            rows[name] = {}
            need(isinstance(sheet.get("rows"), list), "Missing complete worksheet rows")
            for row in sheet["rows"]:
                number = row.get("row")
                need(isinstance(number, str) and number.isdigit() and int(number) > 0
                     and int(number) not in rows[name], "Invalid or repeated worksheet row")
                by_column = {}
                for cell in row.get("cells", []):
                    reference = cell.get("reference")
                    match = CELL.fullmatch(reference or "")
                    need(match and int(match[2]) == int(number) and match[1] not in by_column
                         and isinstance(cell.get("value"), str)
                         and (cell.get("formula") is None or isinstance(cell["formula"], str)),
                         "Invalid original cell reference/value/formula")
                    by_column[match[1]] = cell
                    cells[(name, reference)] = cell
                rows[name][int(number)] = by_column
        need(set(rows) == {x for x in inventory if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", x)},
             "Workbook index omitted an actual worksheet")
        return rows, cells

    def workbook_titles(self):
        """Read actual original sheet names/relationships, without evaluating cells."""
        ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
              "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
              "p": "http://schemas.openxmlformats.org/package/2006/relationships"}
        with zipfile.ZipFile(self.workbook["path"]) as archive:
            def xml(name):
                info = archive.getinfo(name)
                need(info.file_size <= 8 * 1024 * 1024, "Workbook metadata exceeds capacity")
                return ET.fromstring(archive.read(info))
            workbook = xml("xl/workbook.xml")
            relationships = xml("xl/_rels/workbook.xml.rels")
            targets = {}
            for rel in relationships.findall("p:Relationship", ns):
                if not rel.get("Type", "").endswith("/worksheet"):
                    continue
                need(rel.get("TargetMode") != "External", "Original worksheet is external")
                raw_target = rel.get("Target", "")
                target = (raw_target.lstrip("/") if raw_target.startswith("/")
                          else posixpath.normpath("xl/" + raw_target))
                need(target in self.rows, "Original sheet relationship differs from full cell index")
                identifier = rel.get("Id")
                need(identifier and identifier not in targets, "Duplicate original sheet relationship")
                targets[identifier] = target
            titles = {}
            for sheet in workbook.findall("s:sheets/s:sheet", ns):
                identifier = sheet.get("{" + ns["r"] + "}id")
                # Non-worksheet chart/dialog sheets are retained in XLSX inventory.
                if identifier not in targets:
                    continue
                member_name = targets[identifier]
                need(member_name not in titles and sheet.get("name"), "Duplicate original sheet title")
                titles[member_name] = sheet.get("name")
            need(set(titles) == set(self.rows), "An indexed worksheet lacks its original title")
            return titles

    def inspect(self):
        """Give the original receiver full candidate rows without guessing layout."""
        known_fields = {f["name"] for t in self.current["tables"] for f in t["fields"]}
        sheets = []
        for name, rows in self.rows.items():
            candidates = []
            for number, columns in rows.items():
                matched = [cell["reference"] for cell in columns.values()
                           if cell["value"] in set(self.names) | known_fields]
                if matched:
                    candidates.append({"row": number, "matched_references": matched,
                                       "cells": list(columns.values())})
            sheets.append({"member": name, "title": self.sheet_titles[name], "row_count": len(rows),
                           "first_rows": [{"row": number, "cells": list(cols.values())}
                                          for number, cols in list(rows.items())[:12]],
                           "candidate_rows": candidates})
        return {"schema": SCHEMA + "/inspection", "operation_id": OPERATION,
                "edition": self.edition, "workbook": self.workbook,
                "index": self.input["index"], "worksheets": sheets,
                "current_field_names_are_search_hints": True,
                "layout": "Select actual table/field/type/nullability columns from these original cells."}

    def cell(self, member_name, row, column, *, optional=False):
        if column is None and optional:
            return None
        need(isinstance(column, str) and re.fullmatch(r"[A-Z]+", column),
             "Use an explicit observed worksheet column")
        value = self.rows[member_name][row].get(column)
        if value is None and optional:
            return None
        need(value is not None and value["formula"] is None,
             "Schema value is missing or has an unevaluated formula")
        return value

    def normalize(self):
        layouts = self.input.get("layouts")
        need(isinstance(layouts, list) and layouts, "Select observed whole-table worksheet layouts")
        tables = {name: [] for name in self.names}
        used = set()
        for layout in layouts:
            allowed = {"member", "first_row", "last_row", "table_column", "table_name",
                       "field_column", "sql_type_column", "size_column",
                       "nullable_column", "nullable_values", "description_column"}
            need(isinstance(layout, dict) and set(layout) <= allowed
                 and {"member", "first_row", "last_row", "field_column"} <= set(layout),
                 "Invalid original worksheet layout")
            name = layout["member"]
            first, last = layout["first_row"], layout["last_row"]
            need(name in self.rows and type(first) is int and type(last) is int
                 and 0 < first <= last, "Select actual complete worksheet row bounds")
            need(("table_column" in layout) != ("table_name" in layout),
                 "Select table-name column or one explicit whole-table worksheet")
            if "table_name" in layout:
                need(layout["table_name"] in tables, "Unknown explicit table")
                # The fixed table must be named somewhere in this original worksheet.
                need(self.sheet_titles[name] == layout["table_name"] or
                     any(c["value"] == layout["table_name"] and c["formula"] is None
                         for row in self.rows[name].values() for c in row.values()),
                     "Explicit table name is absent from original worksheet")
            if self.edition == "2025-07-a":
                need(layout.get("sql_type_column") and layout.get("nullable_column"),
                     "Historical fields/types/nullability must come from their own workbook")
            nulls = layout.get("nullable_values")
            if layout.get("nullable_column"):
                need(isinstance(nulls, dict) and set(nulls) == {"true", "false"}
                     and all(isinstance(nulls[k], list) and nulls[k] for k in nulls)
                     and all(isinstance(x, str) for k in nulls for x in nulls[k])
                     and not set(nulls["true"]) & set(nulls["false"]),
                     "Declare the actual distinct workbook nullable tokens")
            for number, row in self.rows[name].items():
                if not first <= number <= last:
                    continue
                if "table_column" in layout:
                    table_cell = self.cell(name, number, layout["table_column"], optional=True)
                    if table_cell is None or table_cell["value"] not in tables:
                        continue
                    table_name = table_cell["value"]
                else:
                    table_name, table_cell = layout["table_name"], None
                field_cell = self.cell(name, number, layout["field_column"])
                field_name = field_cell["value"]
                need(NAME.fullmatch(field_name), "Select actual schema rows, excluding headers")
                need((name, number) not in used, "One original row was selected twice")
                used.add((name, number))
                original = {f["name"]: f for f in self.current["tables"][
                    self.names.index(table_name)]["fields"]}
                need(self.edition != "2026-02-a" or field_name in original,
                     "Current workbook has a field absent from this exact HTML snapshot")
                record = {"name": field_name}
                evidence = [field_cell] + ([table_cell] if table_cell is not None else [])
                type_cell = self.cell(name, number, layout.get("sql_type_column"), optional=True)
                size_cell = self.cell(name, number, layout.get("size_column"), optional=True)
                if type_cell is not None:
                    record.update(sql_type(type_cell["value"], size_cell["value"] if size_cell else None))
                    record["publisher_sql_type"] = type_cell["value"]
                    evidence += [type_cell] + ([size_cell] if size_cell else [])
                else:
                    need(self.edition == "2026-02-a", "Missing historical SQL type")
                nullable_cell = self.cell(name, number, layout.get("nullable_column"), optional=True)
                if nullable_cell is not None:
                    value = nullable_cell["value"]
                    need(value in nulls["true"] + nulls["false"], "Unmapped actual nullable token")
                    record["nullable"] = value in nulls["true"]
                    evidence.append(nullable_cell)
                else:
                    need(self.edition == "2026-02-a", "Missing historical nullability")
                description = self.cell(name, number, layout.get("description_column"), optional=True)
                if description is not None:
                    need(len(description["value"]) <= 12000, "Workbook description exceeds original API")
                    record["description"] = description["value"]
                    evidence.append(description)
                if self.edition == "2026-02-a":
                    expected = original[field_name]
                    for key in (*TYPE_KEYS, "nullable"):
                        if key in record:
                            need(record[key] == expected.get(key),
                                 "Workbook and captured current HTML differ: " + table_name + "." + field_name + "/" + key)
                    merged = dict(expected)
                    merged.update(record)
                    record = merged
                record.setdefault("description", "")
                record["workbook_evidence"] = {"member": name, "sheet_title": self.sheet_titles[name], "row": number,
                    "cells": evidence, "workbook_sha256": self.workbook["sha256"],
                    "index_sha256": self.input["index"]["sha256"]}
                tables[table_name].append(record)
        output = []
        for name in self.names:
            fields = tables[name]
            names = [field["name"] for field in fields]
            need(fields and len(names) == len(set(names)), "Missing or duplicated table fields: " + name)
            keys = self.defaults[name]["primary_key"]
            need(set(keys) <= set(names), "Original importer primary-key columns missing")
            if name == "rel_batiment_groupe_adresse":
                need(not {"lien_valide", "classe"} & set(names),
                     "Official 2025 removal also applies to current edition")
            if self.edition == "2026-02-a":
                table = json.loads(json.dumps(next(t for t in self.current["tables"] if t["name"] == name)))
                need(set(names) == {f["name"] for f in table["fields"]},
                     "Current workbook crosscheck must cover all official table fields")
            else:
                table = {"name": name, "primary_key": keys,
                    "primary_key_basis": "Original importer identity contract, retained without a new SQL constraint claim",
                    "source": {"url": self.selection["dictionary_url"],
                        "publisher_structure": EDITIONS[self.edition][1],
                        "publisher_edition": EDITIONS[self.edition][0],
                        "representation": "Complete original edition XLSX cell index"}}
            table["fields"] = fields
            table["source"]["workbook_sha256"] = self.workbook["sha256"]
            output.append(table)
        dictionary = {"schema": "stellar-forge.bdnb-dictionary.v1",
            "id": "bdnb-" + self.edition + "-" + self.workbook["sha256"][:16],
            "title": "BDNB " + EDITIONS[self.edition][0] + " original five-table dictionary",
            "tables": output, "edition_binding": {"directory": self.edition,
                "millesime": EDITIONS[self.edition][0], "structure_version": EDITIONS[self.edition][1],
                "workbook": self.workbook, "index": self.input["index"]},
            "normalization": {"input": {"path": str(self.path), **self.input_pin},
                "layouts": layouts, "selected_rows": [{"member": m, "row": r} for m, r in sorted(used)],
                "sql_nullability_does_not_select_csv_null_tokens": True,
                "csv_geometry_encoding_is_separate": True}}
        self.source.source_dictionary({"structure_version": EDITIONS[self.edition][1],
                                       "dictionary": dictionary})
        semantics = self.input.get("table_semantics")
        if semantics is not None:
            need(isinstance(semantics, dict) and semantics and set(semantics) <= set(self.names),
                 "Select semantics for actual received tables only")
            for table, value in semantics.items():
                need(isinstance(value, dict) and set(value) ==
                     {"null_values", "geometry_encoding", "extra_fields", "provenance"}
                     and isinstance(value["null_values"], list) and len(value["null_values"]) <= 32
                     and all(isinstance(x, str) for x in value["null_values"])
                     and value["geometry_encoding"] in {"wkt", "ewkb-hex", "geojson-text", "opaque"}
                     and isinstance(value["extra_fields"], list)
                     and isinstance(value["provenance"], dict) and value["provenance"],
                     "Keep explicit source-bound original CSV interpretation")
        return dictionary, semantics

    def recheck(self):
        for path, expected in self.files.items():
            _, actual = read(Path(path))
            need(actual == expected, "Input changed before complete output publication: " + path)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--inspect", action="store_true",
                        help="Publish original cell candidates before selecting actual worksheet layout")
    args = parser.parse_args(argv)
    normalizer = Normalizer(args.input)
    output = Path(args.output)
    need(output.is_absolute() and output.resolve() == output, "Use a canonical private output path")
    source = normalizer.source
    if args.inspect:
        normalizer.recheck()
        path = output / "workbook-inspection.json"
        result_pin = source.publish(path, encoded(normalizer.inspect()))
        print(json.dumps({"schema": SCHEMA + "/result", "state": "WORKBOOK_INSPECTED",
                          "operation_id": OPERATION, "file": {"path": str(path), **result_pin}}), flush=True)
        return
    dictionary, semantics = normalizer.normalize()
    normalizer.recheck()
    dictionary_path = output / (normalizer.edition + "-dictionary.json")
    identity = source.publish(dictionary_path, encoded(dictionary))
    binding = {"path": str(dictionary_path), **identity,
               "workbook_sha256": normalizer.workbook["sha256"],
               "provenance": {"schema": SCHEMA, "workbook": normalizer.workbook,
                   "index": normalizer.input["index"], "selection": normalizer.input["selection"],
                   "normalization_input": {"path": str(normalizer.path), **normalizer.input_pin},
                   "html_source_mapping": {"path": MAPPING, **pin(normalizer.roster[MAPPING])}
                       if normalizer.edition == "2026-02-a" else None}}
    result = {"schema": SCHEMA + "/result", "operation_id": OPERATION,
              "state": "COMPLETE_DICTIONARY_NORMALIZATION", "edition": normalizer.edition,
              "dictionary": binding, "table_semantics": semantics,
              "source_files": normalizer.input["source_files"],
              "verified_original_files": [{"path": path, **p} for path, p in sorted(normalizer.files.items())]}
    result_path = output / (normalizer.edition + "-dictionary-binding.json")
    result_pin = source.publish(result_path, encoded(result))
    print(json.dumps({"schema": SCHEMA + "/published", "operation_id": OPERATION,
                      "state": result["state"], "result": {"path": str(result_path), **result_pin},
                      "dictionary": binding}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
