"""Read retained survey tables through the original CSV and XLSX readers."""
from __future__ import annotations

from contextlib import AbstractContextManager
from functools import lru_cache
import csv
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import stat
import sys

from model import SDK, clone, fail, hash_id, integer, text

MAX_BYTES = 64 * 1024 * 1024
MAX_ROWS = 250000
MAX_COLUMNS = 256
MAX_CELL = 1024 * 1024


@lru_cache(maxsize=1)
def workbook_reader():
    path = SDK / "dataset-refresh" / "workbook" / "reader.py"
    spec = importlib.util.spec_from_file_location("study_original_workbook_reader", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def letter(number):
    result = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def options(value):
    value = clone(value or {})
    allowed = {"kind", "encoding", "delimiter", "quotechar", "escapechar", "doublequote",
               "sheet", "header_row", "start_row", "end_row", "first_column", "last_column"}
    if set(value) - allowed:
        fail("PROPERTY_TABLE_READER_FIELDS", fields=sorted(set(value) - allowed))
    kind = value.get("kind")
    if kind not in ("csv", "xlsx"):
        fail("PROPERTY_TABLE_KIND_REQUIRED")
    result = {"kind": kind, "header_row": integer(value.get("header_row", 1), "header_row", 0, 1048576),
              "start_row": integer(value.get("start_row", 2), "start_row", 1, 1048576),
              "end_row": None if value.get("end_row") is None else integer(value["end_row"], "end_row", 1, 1048576),
              "first_column": integer(value.get("first_column", 1), "first_column", 1, 16384),
              "last_column": None if value.get("last_column") is None else integer(value["last_column"], "last_column", 1, 16384)}
    if result["header_row"] and result["start_row"] <= result["header_row"]:
        fail("PROPERTY_DATA_OVERLAPS_HEADER")
    if result["end_row"] is not None and result["end_row"] < result["start_row"]:
        fail("PROPERTY_TABLE_ROW_RANGE")
    if result["last_column"] is not None and not 0 <= result["last_column"] - result["first_column"] < MAX_COLUMNS:
        fail("PROPERTY_TABLE_COLUMN_RANGE", maximum=MAX_COLUMNS)
    if kind == "csv":
        if value.get("sheet"):
            fail("PROPERTY_CSV_HAS_NO_SHEET")
        encoding = value.get("encoding", "utf-8-sig")
        if encoding not in ("utf-8", "utf-8-sig", "utf-16", "cp1252"):
            fail("PROPERTY_CSV_ENCODING")
        delimiter, quotechar = value.get("delimiter", ","), value.get("quotechar", '"')
        for name, char in (("delimiter", delimiter), ("quotechar", quotechar)):
            if not isinstance(char, str) or len(char) != 1 or char in "\r\n\0":
                fail("PROPERTY_CSV_DIALECT", field=name)
        escape = value.get("escapechar")
        if escape is not None and (not isinstance(escape, str) or len(escape) != 1 or escape in "\r\n\0"):
            fail("PROPERTY_CSV_DIALECT", field="escapechar")
        if type(value.get("doublequote", True)) is not bool or delimiter == quotechar:
            fail("PROPERTY_CSV_DIALECT")
        result.update(encoding=encoding, delimiter=delimiter, quotechar=quotechar,
                      escapechar=escape, doublequote=value.get("doublequote", True))
    else:
        result["sheet"] = text(value["sheet"], "sheet", maximum=300) if value.get("sheet") else None
    return result


class Rows(AbstractContextManager):
    """Hold and verify the same original descriptor across the complete read."""
    def __init__(self, service, document_id, reader):
        self.service, self.document_id, self.options = service, hash_id(document_id), options(reader)
        self.document = service.document(document_id)
        if len(self.document["files"]) != 1:
            fail("PROPERTY_SINGLE_TABLE_MEMBER_REQUIRED")
        self.member = self.document["files"][0]
        self.path = service.w.directory / "property-documents" / document_id / self.member["path"]
        expected_suffix = ".xlsx" if self.options["kind"] == "xlsx" else (".csv", ".txt")
        if (self.options["kind"] == "xlsx" and self.path.suffix != expected_suffix or
                self.options["kind"] == "csv" and self.path.suffix not in expected_suffix):
            fail("PROPERTY_TABLE_EXTENSION_MISMATCH")
        self.stream = None
        self.workbook = None

    def __enter__(self):
        fd = os.open(self.path, os.O_RDONLY | os.O_NOFOLLOW)
        self.stream = os.fdopen(fd, "rb")
        self.before = os.fstat(fd)
        try:
            if (not stat.S_ISREG(self.before.st_mode) or self.before.st_nlink != 1 or
                    self.before.st_mode & 0o077 or not 0 < self.before.st_size <= MAX_BYTES):
                fail("PROPERTY_TABLE_PRIVATE_FILE_REQUIRED", maximum_bytes=MAX_BYTES)
            digest = hashlib.sha256()
            while part := self.stream.read(65536):
                digest.update(part)
            if digest.hexdigest() != self.member["sha256"] or self.before.st_size != self.member["bytes"]:
                fail("PROPERTY_TABLE_SOURCE_CHANGED")
            self.stream.seek(0)
            if self.options["kind"] == "xlsx":
                original = workbook_reader()
                self.workbook = original.Workbook(self.stream, self.member)
                self.options["sheet"] = self.options["sheet"] or self.workbook.sheets[0]["name"]
                self.sheet = self.workbook.sheet(self.options["sheet"])
                descriptor = self.sheet["metadata"]
                bounds = self.sheet["bounds"] or (1, 1, 1, 1)
                last = self.options["last_column"] or bounds[2]
                self.metadata = {"parser": original.PARSER, "epoch": self.workbook.epoch,
                                 "calculation_properties": self.workbook.calculation,
                                 "external_relationships": self.workbook.external,
                                 "worksheets": self.workbook.sheets, "worksheet": descriptor}
                self.final_row = self.options["end_row"] or bounds[3]
            else:
                last = self.options["last_column"]
                self.metadata = {"parser": "python.csv", "encoding": self.options["encoding"],
                                 "dialect": {k: self.options[k] for k in ("delimiter", "quotechar", "escapechar", "doublequote")}}
                header, sample = [], []
                for number, values, _, _ in self.csv_rows():
                    if number == self.options["header_row"]:
                        header = values
                    if number >= self.options["start_row"]:
                        sample = values
                        break
                last = last or max(len(header), len(sample), self.options["first_column"])
                self.csv_header = header
                self.final_row = self.options["end_row"]
            self.first_column, self.last_column = self.options["first_column"], last
            if not 0 <= last - self.first_column < MAX_COLUMNS:
                fail("PROPERTY_TABLE_COLUMN_RANGE", maximum=MAX_COLUMNS)
            self.metadata.update(document_id=self.document_id, document_key=self.document["key"],
                                 original=self.member, reader=self.options,
                                 columns=self.columns())
            return self
        except BaseException:
            self.__exit__(*sys.exc_info())
            raise

    def __exit__(self, exc_type, exc, tb):
        if self.stream is not None:
            after = os.fstat(self.stream.fileno())
            if self.workbook is not None:
                self.workbook.zip.close()
            self.stream.close()
            self.stream = None
            if exc is None and (self.before.st_size, self.before.st_mtime_ns, self.before.st_ctime_ns) != (
                    after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                fail("PROPERTY_TABLE_CHANGED_DURING_READ")
        return False

    def csv_rows(self):
        self.stream.seek(0)
        wrapper = io.TextIOWrapper(self.stream, encoding=self.options["encoding"], errors="strict", newline="")
        csv.field_size_limit(MAX_CELL)
        reader = csv.reader(wrapper, strict=True, **{k: self.options[k] for k in ("delimiter", "quotechar", "escapechar", "doublequote")})
        previous = 0
        try:
            for number, values in enumerate(reader, 1):
                if number > MAX_ROWS or len(values) > 16384:
                    fail("PROPERTY_TABLE_CAPACITY", rows=number)
                yield number, values, previous + 1, reader.line_num
                previous = reader.line_num
        except (csv.Error, UnicodeError) as error:
            fail("PROPERTY_CSV_READ_FAILED", physical_line=reader.line_num, message=str(error))
        finally:
            wrapper.detach()

    def cell(self, column, row):
        original = workbook_reader()
        cell = clone(self.sheet["cells"].get((column, row), original.blank_cell(column, row, row in self.sheet["hidden"])))
        cell["column_index"] = column
        cell["hidden_column"] = any(x["hidden"] and x["min"] <= column <= x["max"] for x in self.sheet["metadata"]["columnRanges"])
        cell["merged_ranges"] = [x["range"] for x in self.sheet["merged"] if
                                 x["bounds"][0] <= column <= x["bounds"][2] and x["bounds"][1] <= row <= x["bounds"][3]]
        return cell

    def columns(self):
        result = []
        header_row = self.options["header_row"]
        for col in range(self.first_column, self.last_column + 1):
            if self.workbook:
                header = self.cell(col, header_row) if header_row else None
                value = header.get("value") if header else None
            else:
                value = self.csv_header[col - 1] if header_row and col <= len(self.csv_header) else None
                header = {"cell": letter(col) + str(header_row), "raw": value, "value": value} if header_row else None
            result.append({"column": col, "label": letter(col), "header": value, "header_cell": header})
        return result

    def rows(self):
        start, end = self.options["start_row"], self.final_row
        if self.workbook:
            if max(0, end - start + 1) > MAX_ROWS:
                fail("PROPERTY_TABLE_CAPACITY", maximum_rows=MAX_ROWS)
            for row in range(start, end + 1):
                cells = [self.cell(col, row) for col in range(self.first_column, self.last_column + 1)]
                yield {"row": row, "sheet": self.options["sheet"], "hidden": row in self.sheet["hidden"],
                       "blank": all(x.get("value") in (None, "") and x.get("formula") is None for x in cells), "cells": cells}
        else:
            for number, values, first_line, last_line in self.csv_rows():
                if number < start:
                    continue
                if end is not None and number > end:
                    break
                cells = [{"cell": letter(col) + str(number), "column_index": col, "column": letter(col),
                          "row": number, "type": "string" if col <= len(values) else "blank",
                          "value": values[col - 1] if col <= len(values) else None,
                          "raw": values[col - 1] if col <= len(values) else None, "present": col <= len(values),
                          "formula": None, "cachedPresent": False}
                         for col in range(self.first_column, self.last_column + 1)]
                yield {"row": number, "physical_line_start": first_line, "physical_line_end": last_line,
                       "hidden": False, "blank": not values or all(x == "" for x in values),
                       "source_columns": len(values), "cells": cells}


def inspect(service, document_id, reader, offset=0, limit=30):
    offset, limit = integer(offset, "offset", 0, MAX_ROWS), integer(limit, "limit", 1, 100)
    selected, total = [], 0
    with Rows(service, document_id, reader) as source:
        metadata = clone(source.metadata)
        for index, row in enumerate(source.rows()):
            total += 1
            if offset <= index < offset + limit:
                selected.append(row)
    return {"schema": "stellar-forge.property-table-inspection.v1", "source": metadata,
            "offset": offset, "limit": limit, "total_rows": total,
            "next_offset": offset + len(selected) if offset + len(selected) < total else None, "rows": selected}
