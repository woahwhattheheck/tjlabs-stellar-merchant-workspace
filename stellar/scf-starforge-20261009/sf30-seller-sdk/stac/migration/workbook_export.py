# SPDX-License-Identifier: MIT
"""Export the complete saved mapping workbook with the installed Python runtime."""
from __future__ import annotations
import base64
import hashlib
import io
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from .native import files, need
from . import workbook as reader

SCHEMA = "starforge.gis-migration-mapping-workbook-export.v1"
BUNDLE_SCHEMA = "starforge.gis-migration-mapping-workbook-bundle.v1"
SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"
XLSX_NAME = "GIS-Mapping-Register.xlsx"
FIRST = reader.FIRST
TEXT_LIMIT = reader.TEXT_LIMIT
MAX_XML_MEMBER = 64 * 1024 * 1024
MAX_XML_TOTAL = 128 * 1024 * 1024
MAX_BUNDLE = 40 * 1024 * 1024
ESCAPE = re.compile(r"_x[0-9a-fA-F]{4}_")
COUNT = re.compile(r"^(0|[1-9][0-9]{0,14})$")

def _text(value):
    return reader._text(value)

def _units(value):
    return len(value.encode("utf-16-le", errors="surrogatepass")) // 2

def _excel_text(value):
    # Escape literal OOXML escape tokens before encoding XML-illegal characters.
    value = ESCAPE.sub(lambda match: "_x005F_" + match[0][1:], value)
    output = []
    for char in value:
        code = ord(char)
        if code < 32 and code not in (9, 10, 13) or 0xD800 <= code <= 0xDFFF or code in (0xFFFE, 0xFFFF):
            output.append("_x%04X_" % code)
        elif code == 13:
            # XML line-ending normalization must not discard an original CR.
            output.append("_x000D_")
        else:
            output.append(char)
    return "".join(output)

def _xml(element):
    return ET.tostring(element, encoding="utf-8", xml_declaration=True)

def _element(parent, tag, **attributes):
    return ET.SubElement(parent, tag, {key: str(value) for key, value in attributes.items()})

def _column(index):
    return reader._column(index)

def _count(value):
    text = _text(value)
    return int(text) if COUNT.fullmatch(text) else text

def _cell(row, address, value, style=1, *, formula=None, numeric=False):
    attributes = {"r": address, "s": str(style)}
    if formula is not None:
        if not numeric:
            attributes["t"] = "str"
        cell = ET.SubElement(row, "c", attributes)
        ET.SubElement(cell, "f").text = formula
        ET.SubElement(cell, "v").text = str(value)
    elif type(value) is int:
        cell = ET.SubElement(row, "c", attributes)
        ET.SubElement(cell, "v").text = str(value)
    else:
        attributes["t"] = "inlineStr"
        cell = ET.SubElement(row, "c", attributes)
        node = ET.SubElement(ET.SubElement(cell, "is"), "t", {XML_SPACE: "preserve"})
        node.text = _excel_text(_text(value))
    return cell

def _styles():
    root = ET.Element("styleSheet", {"xmlns": SHEET_NS})
    fonts = _element(root, "fonts", count=4)
    for size, bold, color in ((10, False, "FF202020"), (10, True, "FF202020"),
                              (16, True, "FF202020"), (10, False, "FF505050")):
        font = _element(fonts, "font")
        _element(font, "sz", val=size)
        _element(font, "color", rgb=color)
        _element(font, "name", val="Arial")
        _element(font, "family", val=2)
        if bold:
            _element(font, "b")
    fills = _element(root, "fills", count=5)
    for kind, color in (("none", None), ("gray125", None), ("solid", "FFF4F4F4"),
                        ("solid", "FFFFFFFF"), ("solid", "FFE6E6E6")):
        pattern = _element(_element(fills, "fill"), "patternFill", patternType=kind)
        if color:
            _element(pattern, "fgColor", rgb=color)
            _element(pattern, "bgColor", indexed=64)
    borders = _element(root, "borders", count=2)
    for bottom in (False, True):
        border = _element(borders, "border")
        for side in ("left", "right", "top", "bottom", "diagonal"):
            node = _element(border, side, **({"style": "thin"} if bottom and side == "bottom" else {}))
            if bottom and side == "bottom":
                _element(node, "color", rgb="FF909090")
    base = _element(root, "cellStyleXfs", count=1)
    _element(base, "xf", numFmtId=0, fontId=0, fillId=0, borderId=0)
    definitions = (
        (0, 0, 0, 0, None),  # 0 default
        (0, 2, 0, 49, None), # 1 original source text
        (0, 3, 0, 49, None), # 2 editable choice
        (1, 4, 1, 49, None), # 3 table heading
        (2, 0, 0, 49, None), # 4 page title
        (3, 0, 0, 49, None), # 5 instructions
        (0, 2, 0, 3, "right"), # 6 exact small source count
        (0, 2, 0, 49, None), # 7 computed text
        (0, 2, 0, 3, "right"), # 8 computed count
        (1, 0, 0, 49, None), # 9 overview label
        (0, 0, 0, 49, None), # 10 overview value
    )
    formats = _element(root, "cellXfs", count=len(definitions))
    for index, (font, fill, border, number, alignment) in enumerate(definitions):
        item = _element(formats, "xf", numFmtId=number, fontId=font, fillId=fill,
                        borderId=border, xfId=0, applyAlignment=1, applyNumberFormat=1,
                        applyFont=1, applyFill=1, applyBorder=1)
        _element(item, "alignment", vertical="top", wrapText=1,
                 **({"horizontal": alignment} if alignment else {}))
        if index == 2:
            item.set("applyProtection", "1")
            _element(item, "protection", locked=0)
    styles = _element(root, "cellStyles", count=1)
    _element(styles, "cellStyle", name="Normal", xfId=0, builtinId=0)
    dxfs = _element(root, "dxfs", count=1)
    dxf = _element(dxfs, "dxf")
    _element(_element(dxf, "font"), "b")
    fill = _element(_element(dxf, "fill"), "patternFill", patternType="solid")
    _element(fill, "fgColor", rgb="FFDCDCDC")
    _element(fill, "bgColor", indexed=64)
    _element(root, "tableStyles", count=0, defaultTableStyle="TableStyleLight1",
             defaultPivotStyle="PivotStyleLight16")
    return _xml(root)

def _worksheet(widths, end):
    need(FIRST - 1 <= end <= 1048576, "MAPPING_WORKBOOK_EXPORT_ROW_LIMIT")
    root = ET.Element("worksheet", {"xmlns": SHEET_NS, "xmlns:r": REL_NS})
    _element(root, "dimension", ref="A1:" + _column(len(widths)) + str(end))
    view = _element(_element(root, "sheetViews"), "sheetView", workbookViewId=0,
                    showGridLines=0)
    _element(view, "pane", xSplit=2, ySplit=FIRST - 1, topLeftCell="C8",
             activePane="bottomRight", state="frozen")
    _element(view, "selection", pane="bottomRight", activeCell="C8", sqref="C8")
    _element(root, "sheetFormatPr", defaultRowHeight=30)
    columns = _element(root, "cols")
    for index, width in enumerate(widths, 1):
        _element(columns, "col", min=index, max=index, width=width, customWidth=1)
    data = _element(root, "sheetData")
    return root, data

def _heading(data, title, note):
    _cell(_element(data, "row", r=1, ht=28, customHeight=1), "A1", title, 4)
    _cell(_element(data, "row", r=3, ht=30, customHeight=1), "A3", note, 5)

def _merges(root, references):
    cells = _element(root, "mergeCells", count=len(references))
    for reference in references:
        _element(cells, "mergeCell", ref=reference)

def _relationships(entries):
    root = ET.Element("Relationships", {"xmlns": PACKAGE_REL_NS})
    for identity, kind, target in entries:
        _element(root, "Relationship", Id=identity, Type=REL_NS + "/" + kind, Target=target)
    return _xml(root)

def _table_part(identity, title, columns, end):
    reference = "A7:" + _column(len(columns)) + str(end)
    root = ET.Element("table", {"xmlns": SHEET_NS, "id": str(identity),
                               "name": title, "displayName": title, "ref": reference,
                               "totalsRowShown": "0"})
    _element(root, "autoFilter", ref=reference)
    fields = _element(root, "tableColumns", count=len(columns))
    for index, column in enumerate(columns, 1):
        _element(fields, "tableColumn", id=index, name=column["label"])
    _element(root, "tableStyleInfo", name="TableStyleLight1", showFirstColumn=0,
             showLastColumn=0, showRowStripes=0, showColumnStripes=0)
    return _xml(root)

def _table_sheet(title, note, columns, matrix, *, formulas=None, table_id=None):
    end = max(FIRST - 1, FIRST + len(matrix) - 1)
    need(len(matrix) * len(columns) <= 2000000, "MAPPING_WORKBOOK_EXPORT_CELL_LIMIT", title)
    root, data = _worksheet([column["width"] for column in columns], end)
    _heading(data, title, note)
    header = _element(data, "row", r=FIRST - 1, ht=38, customHeight=1)
    for index, column in enumerate(columns, 1):
        _cell(header, _column(index) + str(FIRST - 1), column["label"], 3)
    for offset, values in enumerate(matrix):
        number = FIRST + offset
        row = _element(data, "row", r=number, ht=30, customHeight=1)
        need(len(values) == len(columns), "MAPPING_WORKBOOK_EXPORT_COLUMNS", title)
        for index, (column, value) in enumerate(zip(columns, values), 1):
            address = _column(index) + str(number)
            if formulas and index == len(columns):
                _cell(row, address, "As exported", 7, formula=formulas[offset])
            else:
                style = 2 if column.get("edit") else 6 if column.get("count") else 1
                _cell(row, address, value, style)
    last = _column(len(columns))
    _merges(root, ["A1:" + last + "2", "A3:" + last + "4"])
    if formulas and matrix:
        formatting = _element(root, "conditionalFormatting", sqref=last + "8:" + last + str(end))
        rule = _element(formatting, "cfRule", type="expression", dxfId=0, priority=1)
        _element(rule, "formula").text = last + '8="Proposed edit"'
    if matrix and table_id is not None:
        parts = _element(root, "tableParts", count=1)
        _element(parts, "tablePart", **{"r:id": "rIdTable"})
    return _xml(root), end

def _chunks(value):
    start, used = 0, 0
    for index, char in enumerate(value):
        units = 2 if ord(char) > 0xFFFF else 1
        if used + units > TEXT_LIMIT:
            yield value[start:index]
            start, used = index, 0
        used += units
    if start < len(value):
        yield value[start:]

def _originals(register):
    need(isinstance(register.get("originals"), dict), "MAPPING_WORKBOOK_ORIGINAL_FILES_REQUIRED")
    for name in ("plan", "source_review", "capture_manifest", "source_inspection"):
        need(name in register["originals"], "MAPPING_WORKBOOK_ORIGINAL_FILE_REQUIRED", name)
    result = []
    for name, item in register["originals"].items():
        need(re.fullmatch(r"[a-z][a-z0-9_]*", name) is not None,
             "MAPPING_WORKBOOK_ORIGINAL_FILE_NAME", name)
        descriptor = files.descriptor(item["descriptor"])
        raw = reader._raw(item["content_base64"], "original " + name)
        need(len(raw) == descriptor["bytes"] and hashlib.sha256(raw).hexdigest() == descriptor["sha256"],
             "MAPPING_WORKBOOK_ORIGINAL_FILE_CHANGED", name)
        suffix = Path(descriptor["path"]).suffix
        filename = "originals/" + name + (suffix if re.fullmatch(r"\.[a-zA-Z0-9]{1,10}", suffix) else ".bin")
        result.append({"key": name, "filename": filename, "bytes": raw, "descriptor": descriptor})
    return result

def _specifications(register, plan):
    layout = files.parse_json(Path(__file__).with_name("workbook_layout.json").read_bytes())
    need(layout.get("schema") == "starforge.gis-migration-workbook-layout.v1"
         and layout.get("firstDataRow") == FIRST and layout.get("textLimit") == TEXT_LIMIT,
         "MAPPING_WORKBOOK_LAYOUT_REQUIRED")
    names = {row["layer_id"]: row["source_name"] for row in register["layers"]}
    choices = {name: (rows, columns) for name, rows, _, columns in reader._specifications(register, plan)}
    output = []
    seen = set()
    for item in layout["sheets"]:
        name = item["name"]
        need(name not in seen, "MAPPING_WORKBOOK_LAYOUT_SHEET", name)
        seen.add(name)
        rows = register
        for key in item["section"].split("."):
            rows = rows[key]
        need(isinstance(rows, list), "MAPPING_WORKBOOK_REGISTER_SECTION", name)
        if item.get("unique"):
            distinct, selected = set(), []
            for row in rows:
                identity = row[item["unique"]]
                if identity not in distinct:
                    distinct.add(identity)
                    selected.append(row)
            rows = selected
        if item.get("sourceLayerName"):
            rows = [{"source_layer": names.get(row.get("layer_id"), row.get("layer_id", "")), **row} for row in rows]
        columns = item["columns"]
        if name in choices:
            expected_rows, expected_columns = choices[name]
            need(files.canonical(rows) == files.canonical(expected_rows)
                 and [(column["key"], column["label"], bool(column.get("edit"))) for column in columns]
                 == [(key, label, tail is not None) for key, label, tail, _ in expected_columns],
                 "MAPPING_WORKBOOK_LAYOUT_RETURN_CONTRACT", name)
        output.append({**item, "rows": rows})
    need(set(choices) <= seen and len(output) == 11, "MAPPING_WORKBOOK_LAYOUT_COMPLETE")
    return output

def _zip(members, limit):
    need(len(members) == len({name for name, _ in members}), "MAPPING_WORKBOOK_EXPORT_MEMBERS")
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6,
                         allowZip64=False) as archive:
        for name, raw in members:
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100600 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, raw, compresslevel=6)
            need(output.tell() <= limit, "MAPPING_WORKBOOK_EXPORT_SIZE")
    value = output.getvalue()
    need(len(value) <= limit, "MAPPING_WORKBOOK_EXPORT_SIZE")
    return value

def _overview(register, digest, counts, changed_ranges):
    root, data = _worksheet([16] * 8, 30)
    _heading(data, "GIS migration mapping register",
             "Review the exported source and choices, record agreed edits, then save and review the next plan in the original migration workspace.")
    latest = register["review"]["latest"]
    rows = [
        ("Plan", register["title"]),
        ("Exported review", latest["outcome"] if latest else "No saved review"),
        ("Source constraints", "Valid in original full-source review" if register["review"]["source_constraints_valid"]
         else "Source issues retained in original review"),
        ("Workbook choices", "As exported"), ("Proposed edits", 0),
        ("Original source features", _count(register["review"]["features"])),
        ("Source issues", _count(register["review"]["source_issues"])),
        ("Mapped fields", counts["Field mapping"]["rows"]),
        ("Source layers", counts["Layers"]["rows"]),
        ("Ordered project selections", counts["Project layers"]["rows"]),
        ("Pending source decisions", counts["Decisions"]["rows"]),
        ("Latest original review time", latest.get("at", "") if latest else ""),
        ("Original review ID", latest.get("id", "") if latest else ""),
        ("Saved workspace", register["workspace"]["id"]),
        ("Saved plan ID", register["plan_id"]),
        ("Source capture ID", register["capture_id"]),
        ("Source register SHA-256", digest),
        ("Source file", "Mapping-Register.json"),
        ("Complete original inputs", "originals/ — exact plan, audit, source inspection, capture manifest and declared imported inputs"),
        ("Review route", "Return the reviewed XLSX with its original register in Mapping; load the complete proposal, save the plan and record its normal review."),
        ("Long values", "Text details retains every part above the cell limit. The original register retains complete JSON and exact decimal values."),
        ("Workbook baseline", "Original choices is the exported comparison baseline. Proposed edits retain the exported review identity until the next plan is saved and reviewed."),
        ("Number handling", "Counts up to 15 decimal digits are numeric. Larger counts, IDs, hashes, dates and native numeric lexemes retain exact text."),
    ]
    formulas = {
        FIRST + 3: ('IF(C12=0,"As exported","Contains proposed edits")', "As exported", False),
        FIRST + 4: ("+".join('COUNTIF(' + value + ',"Proposed edit")' for value in changed_ranges) or "0", 0, True),
    }
    for row, name in ((15, "Field mapping"), (16, "Layers"), (17, "Project layers"), (18, "Decisions")):
        count = counts[name]
        formula = "COUNTA('" + name + "'!A8:A" + str(count["end"]) + ")" if count["rows"] else "0"
        formulas[row] = (formula, count["rows"], True)
    merges = ["A1:H2", "A3:H4"]
    for offset, (label, value) in enumerate(rows):
        number = FIRST + offset
        row = _element(data, "row", r=number, ht=48 if offset >= 18 else 32, customHeight=1)
        _cell(row, "A" + str(number), label, 9)
        if number in formulas:
            formula, cached, numeric = formulas[number]
            _cell(row, "C" + str(number), cached, 8 if numeric else 7, formula=formula, numeric=numeric)
        else:
            _cell(row, "C" + str(number), value, 6 if type(value) is int else 10)
        merges.extend(["A" + str(number) + ":B" + str(number), "C" + str(number) + ":H" + str(number)])
    _merges(root, merges)
    return _xml(root)

def _workbook(register, register_raw, originals):
    plan = files.parse_json(next(item["bytes"] for item in originals if item["key"] == "plan"))
    specs = _specifications(register, plan)
    details, baseline, counts, changed_ranges = [], [], {}, []

    def retained(value, context):
        text = _text(value)
        length = _units(text)
        if length <= TEXT_LIMIT:
            return text
        identity = "text-" + str(len(details) + 1).zfill(6)
        chunks = list(_chunks(text))
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        for index, chunk in enumerate(chunks, 1):
            details.append([identity, context, index, len(chunks), digest, chunk])
        return "Full value: Text details / " + identity + " (" + str(length) + " characters; SHA-256 " + digest + ")"

    tables = []
    for spec in specs:
        columns = spec["columns"]
        edits = [(index, column) for index, column in enumerate(columns) if column.get("edit")]
        displayed = columns + ([{"key": "_change", "label": "Workbook changes", "width": 23}] if edits else [])
        matrix, formulas = [], []
        for offset, row in enumerate(spec["rows"]):
            number = FIRST + offset
            values = [_count(row.get(column["key"])) if column.get("count")
                      else retained(row.get(column["key"]), spec["name"] + " row " + str(number) + " / " + column["label"])
                      for column in columns]
            if edits:
                comparisons = []
                for index, column in edits:
                    base_row = FIRST + len(baseline)
                    baseline.append([spec["name"], number, column["label"], values[index],
                                     row.get("layer_id") or row.get("project_id", "")])
                    comparisons.append("NOT(EXACT(" + _column(index + 1) + str(number)
                                       + ",'Original choices'!$D$" + str(base_row) + "))")
                formulas.append('IF(OR(' + ",".join(comparisons) + '),"Proposed edit","As exported")')
                values.append("As exported")
            matrix.append(values)
        end = max(FIRST - 1, FIRST + len(matrix) - 1)
        counts[spec["name"]] = {"rows": len(matrix), "end": end, "columns": len(displayed)}
        if edits and matrix:
            last = _column(len(displayed))
            changed_ranges.append("'" + spec["name"] + "'!" + last + "8:" + last + str(end))
        tables.append({"name": spec["name"], "title": spec["name"], "note": spec["note"],
                       "columns": displayed, "matrix": matrix, "formulas": formulas})

    def column(label, width, **extra):
        return {"label": label, "width": width, **extra}

    identity = [
        ("Saved workspace", register["workspace"]["id"]), ("Workspace title", register["workspace"]["title"]),
        ("Saved revision", _text(register["workspace"]["revision"])), ("Saved plan", register["plan_id"]),
        ("Plan title", register["title"]), ("Source capture", register["capture_id"]),
        ("Source selection", register["selection_id"]), ("Predecessor plan", register.get("predecessor_plan_id") or ""),
        ("Requested formats", ", ".join(register["formats"])), ("PostGIS schema", register["postgis_schema"]),
        ("Source edition JSON", register["source_edition_json"]), ("Corrected-source changes JSON", register["source_changes_json"]),
        ("Plan note", register["plan_note"]),
    ]
    identity_rows = [[key, retained(value, "Saved plan / " + key)] for key, value in identity]
    original_rows = [[item["key"], item["filename"], item["descriptor"]["path"], len(item["bytes"]),
                      hashlib.sha256(item["bytes"]).hexdigest()] for item in originals]
    tables.extend([
        {"name": "Original choices", "title": "Original exported choices",
         "note": "Preserve this complete source baseline. Workbook change indicators compare the white choice cells against these original values.",
         "columns": [column("Worksheet", 25), column("Workbook row", 17, count=True), column("Choice", 31),
                     column("Original exported value", 88), column("Original object ID", 40)], "matrix": baseline},
        {"name": "Text details", "title": "Complete long text",
         "note": "Concatenate parts in numeric order to recover each complete long value. SHA-256 refers to the full original UTF-8 text.",
         "columns": [column("Text ID", 24), column("Workbook location", 58), column("Part", 10, count=True),
                     column("Parts", 10, count=True), column("Text SHA-256", 70), column("Complete part", 120)], "matrix": details},
        {"name": "Original files", "title": "Exact original files",
         "note": "Every listed original file is included beside the workbook and retains its complete descriptor and bytes in Mapping-Register.json.",
         "columns": [column("Role", 25), column("Delivered file", 43), column("Original path", 76),
                     column("Bytes", 18, count=True), column("SHA-256", 70)], "matrix": original_rows},
        {"name": "Saved plan", "title": "Complete saved-plan context",
         "note": "The original workspace revision, source edition and full saved plan context accompany every mapping worksheet.",
         "columns": [column("Original value", 33), column("Complete retained content", 110)], "matrix": identity_rows},
    ])
    names = ["Overview"] + [item["name"] for item in tables]
    members = [("_rels/.rels", _relationships([("rIdWorkbook", "officeDocument", "xl/workbook.xml")]))]
    content = ET.Element("Types", {"xmlns": CONTENT_NS})
    _element(content, "Default", Extension="rels", ContentType="application/vnd.openxmlformats-package.relationships+xml")
    _element(content, "Default", Extension="xml", ContentType="application/xml")
    _element(content, "Override", PartName="/xl/workbook.xml",
             ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml")
    _element(content, "Override", PartName="/xl/styles.xml",
             ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml")
    workbook = ET.Element("workbook", {"xmlns": SHEET_NS, "xmlns:r": REL_NS})
    _element(workbook, "workbookPr", date1904=0)
    _element(_element(workbook, "bookViews"), "workbookView", activeTab=0)
    sheets = _element(workbook, "sheets")
    relationships = []
    metadata = []
    for index, name in enumerate(names, 1):
        _element(sheets, "sheet", name=name, sheetId=index, **{"r:id": "rIdSheet" + str(index)})
        relationships.append(("rIdSheet" + str(index), "worksheet", "worksheets/sheet" + str(index) + ".xml"))
        _element(content, "Override", PartName="/xl/worksheets/sheet" + str(index) + ".xml",
                 ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml")
        if index == 1:
            sheet_raw = _overview(register, hashlib.sha256(register_raw).hexdigest(), counts, changed_ranges)
            metadata.append({"name": name, "rows": 23})
        else:
            item = tables[index - 2]
            sheet_raw, end = _table_sheet(item["title"], item["note"], item["columns"], item["matrix"],
                                         formulas=item.get("formulas"), table_id=index)
            metadata.append({"name": name, "rows": len(item["matrix"])})
            if item["matrix"]:
                table_name = "MappingTable" + str(index)
                members.append(("xl/tables/table" + str(index) + ".xml",
                                _table_part(index, table_name, item["columns"], end)))
                members.append(("xl/worksheets/_rels/sheet" + str(index) + ".xml.rels",
                                _relationships([("rIdTable", "table", "../tables/table" + str(index) + ".xml")])))
                _element(content, "Override", PartName="/xl/tables/table" + str(index) + ".xml",
                         ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml")
        members.append(("xl/worksheets/sheet" + str(index) + ".xml", sheet_raw))
    _element(workbook, "calcPr", calcId=0, calcMode="auto", fullCalcOnLoad=1, forceFullCalc=1)
    relationships.append(("rIdStyles", "styles", "styles.xml"))
    members.extend([
        ("xl/workbook.xml", _xml(workbook)),
        ("xl/_rels/workbook.xml.rels", _relationships(relationships)),
        ("xl/styles.xml", _styles()),
        ("[Content_Types].xml", _xml(content)),
    ])
    need(all(len(raw) <= MAX_XML_MEMBER for _, raw in members)
         and sum(len(raw) for _, raw in members) <= MAX_XML_TOTAL,
         "MAPPING_WORKBOOK_EXPORT_XML_SIZE")
    limit = min(reader.MAX_FILE, reader.MAX_PAIR - len(register_raw))
    need(limit > 0, "MAPPING_WORKBOOK_EXPORT_PAIR_SIZE")
    return _zip(members, limit), {"sheets": metadata, "longTextParts": len(details),
                                  "sourceChoices": len(baseline), "proposedEdits": 0}

GUIDE = """# GIS migration mapping workbook

Open GIS-Mapping-Register.xlsx and start in Overview. Keep Mapping-Register.json and the complete originals folder with the workbook. This delivery contains the saved plan, capture manifest, source inspection, full source review, every declared original imported input, every mapping row and the original review history.

White cells carry editable choices. Gray cells identify original source records. Use the worksheet filters to find a layer, field, project or decision. Preserve all worksheet names, headings, rows, source cells and Original choices. Restore the original order after sorting before returning the file.

Field mapping contains destination names, conversions, requested types, null handling, Shapefile names and notes. Layers and Coordinates carry the destination table, title, geometry policy and separate source/target coordinate-system choices. Keys retains each ordered composite-key member. Projects contains each complete saved project definition once; Project layers retains its ordered layer-specific options.

Edit a composite-key name, null rule or note on one member to apply it to the complete key. If several members are edited, keep the new choice consistent. Add or remove key members, source fields or project layers through the native Mapping editor.

Workbook changes and Overview update when the spreadsheet application recalculates. Every choice is exported with its original cached state. The native return reader compares the actual choice cells directly with the saved source.

Text details keeps every part of values longer than one spreadsheet cell. The visible pointer includes the complete text length and SHA-256. Preserve that pointer when returning the workbook and use the native Mapping editor for a new long value. Counts with more than 15 decimal digits, original dates, identifiers and JSON retain exact text. Open a cell's full value to read long content.

To return the reviewed workbook, open Mapping → Customer mapping workbook in the same GIS migration workspace. Select this original Mapping-Register.json and the complete edited XLSX, then choose Review workbook changes. Read the proposed changes and load the complete plan into the mapping editor. Make any agreed native editor changes, save the plan, and record its normal review before producing the destination data and QGIS projects.

The saved workspace retains five complete files together: the original register, the edited workbook, the workbook proposal, the final saved plan and the full comparison of workbook/native edits. The complete workspace export carries these with its original source, plans, reviews, native maps and selected application. Independently reopen that whole delivery through the normal Receiving workflow.

MAPPING-WORKBOOK.json describes every delivered member and the original workspace, plan and capture. A new saved revision is exported into a separate complete workbook delivery. Keep the previous delivery for its original review.
"""

def export(workspace, plan_id):
    exported = reader.export(workspace, plan_id)
    register_raw = reader._raw(exported["registerBase64"], "Mapping-Register.json")
    register = files.parse_json(register_raw)
    originals = _originals(register)
    workbook_raw, build = _workbook(register, register_raw, originals)
    members = [
        ("Mapping-Register.json", register_raw),
        (XLSX_NAME, workbook_raw),
        ("Mapping-Workbook-Guide.md", GUIDE.encode("utf-8")),
    ] + [(item["filename"], item["bytes"]) for item in originals]
    manifest = {
        "schema": BUNDLE_SCHEMA,
        "workspaceId": exported["workspaceId"], "workspaceRevision": exported["workspaceRevision"],
        "planId": exported["planId"], "captureId": exported["captureId"], "review": exported["review"],
        "registerFile": "Mapping-Register.json", "workbookFile": XLSX_NAME,
        "register": reader._descriptor(register_raw, "Mapping-Register.json"),
        "build": build,
        "files": [reader._descriptor(raw, name) for name, raw in members],
    }
    members.append(("MAPPING-WORKBOOK.json", files.json_bytes(manifest)))
    bundle = _zip(members, MAX_BUNDLE)
    return {
        "schema": SCHEMA,
        "workspaceId": exported["workspaceId"], "workspaceRevision": exported["workspaceRevision"],
        "planId": exported["planId"], "captureId": exported["captureId"],
        "file": reader._descriptor(bundle, "Mapping-Workbook.zip"),
        "bundleBase64": base64.b64encode(bundle).decode("ascii"),
        "files": [reader._descriptor(raw, name) for name, raw in members],
        "rows": exported["rows"], "review": exported["review"], "build": build,
    }
