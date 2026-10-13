"""Explicit CSV interpretation for retained source inspection and editions.

The original bytes remain in GovHub's source store. This module never sniffs a
dialect, normalizes a header, converts an identifier, or writes source files.
"""
import csv

from govhub import GovHubError


CSV_DEFAULTS = {"delimiter": ",", "quotechar": '"', "escapechar": None, "doublequote": True}


def csv_options(descriptor):
    raw = descriptor.get("csv_options", {})
    if raw is None:
        raw = {}
    if not isinstance(raw, dict) or set(raw) - set(CSV_DEFAULTS):
        raise GovHubError("CONTENT_CSV_OPTIONS", "Choose the CSV delimiter, quote character, escape character and doubled-quote setting.")
    selected = dict(CSV_DEFAULTS, **raw)
    for name in ("delimiter", "quotechar", "escapechar"):
        value = selected[name]
        if name != "delimiter" and value is None:
            continue
        if not isinstance(value, str) or len(value) != 1 or value in "\r\n\0":
            raise GovHubError("CONTENT_CSV_OPTIONS", name + " must be one original character" + (" or null." if name != "delimiter" else "."))
    if not isinstance(selected["doublequote"], bool):
        raise GovHubError("CONTENT_CSV_OPTIONS", "Choose whether the source doubles its quote character.")
    if selected["delimiter"] in {selected["quotechar"], selected["escapechar"]}:
        raise GovHubError("CONTENT_CSV_OPTIONS", "The delimiter must differ from the quote and escape characters.")
    if selected["quotechar"] is not None and selected["quotechar"] == selected["escapechar"]:
        raise GovHubError("CONTENT_CSV_OPTIONS", "Use distinct quote and escape characters; doubled quotes have their own setting.")
    return selected


class CsvSource:
    """One complete UTF-8 CSV reader with exact original headers and line spans."""

    def __init__(self, stream, options):
        self.reader = csv.reader(
            stream, delimiter=options["delimiter"], quotechar=options["quotechar"],
            escapechar=options["escapechar"], doublequote=options["doublequote"],
            quoting=csv.QUOTE_NONE if options["quotechar"] is None else csv.QUOTE_MINIMAL,
            skipinitialspace=False, strict=True,
        )
        try:
            self.headers = next(self.reader)
        except StopIteration as exc:
            raise GovHubError("CONTENT_CSV", "The retained CSV is empty; an original header is required.") from exc
        except (UnicodeError, csv.Error) as exc:
            raise GovHubError("CONTENT_CSV", "Read the original UTF-8 CSV header: " + str(exc)) from exc
        if not self.headers or any(not h for h in self.headers) or len(set(self.headers)) != len(self.headers):
            raise GovHubError("CONTENT_CSV", "Every original CSV header must be nonempty and unique.")
        self.header_line_end = self.reader.line_num

    def __iter__(self):
        ordinal = 0
        while True:
            line_start = self.reader.line_num + 1
            try:
                values = next(self.reader)
            except StopIteration:
                return
            except (UnicodeError, csv.Error) as exc:
                raise GovHubError("CONTENT_CSV", "Read original CSV record " + str(ordinal + 1) + " at line " + str(line_start) + ": " + str(exc)) from exc
            ordinal += 1
            if len(values) != len(self.headers):
                raise GovHubError("CONTENT_CSV", "Original CSV record " + str(ordinal) + " at line " + str(line_start) + " has " + str(len(values)) + " fields; its header has " + str(len(self.headers)) + ". Check the selected delimiter and quoting.")
            yield {
                "source_row": ordinal, "source_line_start": line_start,
                "source_line_end": self.reader.line_num,
                "data": dict(zip(self.headers, values)),
            }


def inspect_csv(stream, options, offset=0, limit=25):
    """Scan the complete selected file while retaining only the requested rows."""
    source = CsvSource(stream, options)
    rows, count = [], 0
    try:
        for row in source:
            if offset <= count < offset + limit:
                rows.append(row)
            count += 1
    except GovHubError as exc:
        return {
            "headers": source.headers, "header_line_end": source.header_line_end,
            "complete": False, "row_count": None, "observed_records": count,
            "rows": rows, "issues": [{"code": exc.code, "message": exc.message}],
        }
    return {
        "headers": source.headers, "header_line_end": source.header_line_end,
        "complete": True, "row_count": count, "observed_records": count,
        "rows": rows, "issues": [],
    }
