"""Deterministic, complete HTML tables and explicit SVG chart selections."""
from __future__ import annotations

from decimal import Decimal, InvalidOperation, localcontext
from html import escape
import os
from pathlib import Path

from ..duckdb_dataset import _json, _qid, _wire
from ..storage import private_directory, sync_directory
from .contracts import _ROW, fail
from .model import Analytics, fingerprint

_STYLE = """
:root{font:15px/1.5 system-ui,Arial,sans-serif;color:#202020;background:#fff}
body{margin:0 auto;padding:32px;max-width:1480px}h1{font-size:30px;margin:0 0 8px}
h2{font-size:23px;margin:0 0 14px}h3{font-size:17px}a{color:inherit;text-decoration:underline}
header,section,footer{padding:24px 0;border-bottom:1px solid #bdbdbd}
p{max-width:110ch;white-space:pre-wrap}.muted,figcaption{color:#505050}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 20px}dt{font-weight:600}
dd{margin:0;overflow-wrap:anywhere}.scroll{overflow:auto;max-height:75vh;border:1px solid #aaa}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:13px}
th,td{padding:7px 10px;border-bottom:1px solid #d0d0d0;vertical-align:top;text-align:left;overflow-wrap:anywhere}
th{position:sticky;top:0;background:#eee;border-bottom:1px solid #888}
td.null{color:#666;font-style:italic}code,pre{font:12px/1.5 ui-monospace,monospace}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f3f3;padding:16px}
details{margin:16px 0}summary{cursor:pointer;font-weight:600}.chart{width:100%;max-height:550px}
.caption{font-size:13px}.key{display:flex;gap:16px;flex-wrap:wrap;font-size:13px}.swatch{display:inline-block;width:18px;height:10px;border:1px solid #222;margin-right:5px}
@media print{body{padding:0;font-size:11px}.scroll{max-height:none;overflow:visible}th{position:static}
section{break-before:page}section:first-of-type{break-before:auto}details>*,details:not([open])>*{display:block}
table{font-size:9px}tr{break-inside:avoid}a{overflow-wrap:anywhere}.chart{max-height:420px}}
"""


def cell(value):
    if value is None:
        return '<td class="null">NULL</td>'
    value = _wire(value)
    if not isinstance(value, str):
        value = _json(value)
    return "<td>" + escape(value) + "</td>"


def _plain(value):
    value = _wire(value)
    return "NULL" if value is None else value if isinstance(value, str) else _json(value)


def _table_start(columns):
    return '<div class="scroll"><table><thead><tr>' + "".join(
        "<th>" + escape(item["name"]) + "<br><small>" + escape(item["type"]) + "</small></th>"
        for item in columns) + "</tr></thead><tbody>"


def _number(value):
    if value is None or isinstance(value, (bool, dict, list, tuple)):
        return None
    try:
        number = Decimal.from_float(value) if isinstance(value, float) else Decimal(value)
    except (InvalidOperation, ValueError, TypeError):
        return None
    return number if number.is_finite() else None


def _chart(page, columns, rows, total):
    names = [item["name"] for item in columns]
    x_index = names.index(page["x"])
    indices = [names.index(name) for name in page["y"]]
    data = [[_number(row[index]) for index in indices] for row in rows]
    all_numbers = [value for row in data for value in row if value is not None]
    yield '<figure><figcaption>' + escape(
        f'{page["kind"].title()} chart: first {len(rows):,} of {total:,} groups in the retained result order. '
        "Every group is included in the table below. NULL and non-finite values leave gaps. "
        "Point labels and the table retain exact values; the chart places them on a common linear scale.") + "</figcaption>"
    if not rows or not all_numbers:
        yield "<p>No finite selected measure values to plot.</p></figure>"
        return
    width, height, left, top, right, bottom = 1100, 480, 100, 25, 24, 105
    plot_width, plot_height = width-left-right, height-top-bottom
    with localcontext() as context:
        context.prec = 4096
        low, high = min([Decimal(0)] + all_numbers), max([Decimal(0)] + all_numbers)
        if high == low:
            high = low + 1
        def y(value):
            return Decimal(top) + (high-value) / (high-low) * plot_height
        def coord(value):
            return format(value, ".2f")
        def tick(value):
            if value == 0:
                return "0"
            return format(value, ".5g")
        count = len(rows)
        step = Decimal(plot_width) / max(count, 1)
        zero = y(Decimal(0))
        yield f'<svg class="chart" viewBox="0 0 {width} {height}" role="img" aria-label="{escape(page["title"], quote=True)}">'
        yield "<title>" + escape(page["title"]) + "</title>"
        for index in range(6):
            value = low + (high-low) * Decimal(index)/5
            yp = coord(y(value))
            yield f'<line x1="{left}" x2="{width-right}" y1="{yp}" y2="{yp}" stroke="#ddd"/>'
            yield f'<text x="{left-8}" y="{coord(y(value)+4)}" text-anchor="end" font-size="11" fill="#333">{escape(tick(value))}</text>'
        yield f'<line x1="{left}" x2="{width-right}" y1="{coord(zero)}" y2="{coord(zero)}" stroke="#444"/>'
        colors = ["#222", "#555", "#777", "#999", "#bbb", "#333", "#666", "#aaa"]
        for series, name in enumerate(page["y"]):
            color = colors[series]
            if page["kind"] == "bar":
                bar_width = step * Decimal("0.84") / len(indices)
                for index, row in enumerate(rows):
                    value = data[index][series]
                    if value is None:
                        continue
                    xp = Decimal(left) + step * index + step * Decimal("0.08") + bar_width * series
                    yp, hp = min(y(value), zero), abs(y(value)-zero)
                    yield f'<rect x="{coord(xp)}" y="{coord(yp)}" width="{coord(max(bar_width-Decimal("0.7"),Decimal("0.15")))}" height="{coord(hp)}" fill="{color}" stroke="#222" stroke-width=".3"><title>' + escape(_plain(row[x_index]) + " · " + name + ": " + _plain(row[indices[series]])) + "</title></rect>"
            else:
                prior = None
                dash = "" if series == 0 else f' stroke-dasharray="{2+series},{1+series%3}"'
                for index, row in enumerate(rows):
                    value = data[index][series]
                    if value is None:
                        prior = None
                        continue
                    xp, yp = Decimal(left) + step * (Decimal(index)+Decimal("0.5")), y(value)
                    if prior:
                        yield f'<line x1="{coord(prior[0])}" y1="{coord(prior[1])}" x2="{coord(xp)}" y2="{coord(yp)}" stroke="{color}" stroke-width="2"{dash}/>'
                    yield f'<circle cx="{coord(xp)}" cy="{coord(yp)}" r="2.5" fill="{color}" stroke="#111"><title>' + escape(_plain(row[x_index]) + " · " + name + ": " + _plain(row[indices[series]])) + "</title></circle>"
                    prior = (xp, yp)
        every = max(1, (count+17)//18)
        for index, row in enumerate(rows):
            if index % every and index != count-1:
                continue
            xp = Decimal(left) + step * (Decimal(index)+Decimal("0.5"))
            full = _plain(row[x_index])
            short = full if len(full) <= 34 else full[:31] + "…"
            yield f'<text x="{coord(xp)}" y="{height-bottom+18}" transform="rotate(35 {coord(xp)} {height-bottom+18})" text-anchor="start" font-size="11"><title>{escape(full)}</title>{escape(short)}</text>'
        yield '</svg><div class="key">'
        for index, name in enumerate(page["y"]):
            yield '<span><i class="swatch" style="background:' + colors[index] + '"></i>' + escape(name) + "</span>"
        yield "</div></figure>"


def chunks(db, report):
    """Yield every source row; rendering never treats a preview as a result."""
    if report.get("renderer") != "industrial-html-svg-v1":
        fail("REPORT_RENDERER_CHANGED")
    definition = report["definition"]
    yield '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(definition["title"]) + "</title><style>" + _STYLE + "</style><body>"
    yield '<header><p class="muted">Analytical workbook · retained edition</p><h1>' + escape(definition["title"]) + "</h1>"
    yield "<p>" + escape(definition.get("description", "")) + "</p><dl>"
    for key, value in (("Author", definition.get("author", "")), ("Workbook revision", report["workbook_revision"]),
                       ("Published", report["created_at"]), ("Report", report["report_id"]),
                       ("Workspace", report["workspace_id"])):
        yield "<dt>" + escape(key) + "</dt><dd>" + escape(str(value)) + "</dd>"
    yield '</dl><nav><a href="report.json">Report definition</a> · <a href="OPERATING.md">Receiving guide</a> · <a href="manifest.json">Complete file manifest</a></nav></header>'
    for index, page in enumerate(definition["pages"], 1):
        yield '<section id="page-' + str(index) + '"><p class="muted">Page ' + str(index) + "</p><h2>" + escape(page["title"]) + "</h2>"
        if page.get("text"):
            yield "<p>" + escape(page["text"]) + "</p>"
        if page["kind"] == "text":
            yield "</section>"
            continue
        key = page["source_kind"] + ":" + page["source_id"]
        source = report["sources"][key]
        column_map = {item["name"]: item for item in source["columns"]}
        selected = [column_map[name] for name in page["columns"]]
        relation = _qid(source["table"])
        select = ",".join(_qid(item["name"]) for item in selected)
        sql = "SELECT " + select + " FROM " + relation + " ORDER BY " + _qid(_ROW)
        prefix = "queries/" + page["source_kind"] + "-" + page["source_id"]
        yield "<p class=\"caption\">" + escape(f'{source["row_count"]:,} retained result rows. Source: {key}.') + '</p><p><a href="' + prefix + '/result.csv">Complete CSV</a> · <a href="' + prefix + '/result.parquet">Typed Parquet</a> · <a href="' + prefix + '/manifest.json">Native schema and source meanings</a></p>'
        if page["kind"] in {"bar", "line"}:
            rows = db.execute(sql + " LIMIT ?", [page["chart_limit"]]).fetchall()
            yield from _chart(page, selected, rows, source["row_count"])
        yield _table_start(selected)
        cursor = db.execute(sql)
        count = 0
        while batch := cursor.fetchmany(1024):
            for row in batch:
                count += 1
                yield "<tr>" + "".join(cell(value) for value in row) + "</tr>"
        if count != source["row_count"]:
            fail("RETAINED_RESULT_CHANGED")
        yield "</tbody></table></div>"
        if source.get("totals"):
            totals = source["totals"]
            yield "<h3>Measures over all selected source rows</h3><p class=\"caption\">" + escape(totals["scope"]) + "</p>"
            yield _table_start(totals["columns"]) + "<tr>" + "".join(cell(value) for value in totals["values"]) + "</tr></tbody></table></div>"
        for title, value in (("Definition and reviewed source rules", source.get("definition")),
                             ("Selected pivot coverage", source.get("pivot_coverage")),
                             ("Edition comparison and change rules", source.get("change_calculation")),
                             ("Original source field meanings", source.get("source_meanings")),
                             ("All retained source and query details", source)):
            if value is not None:
                yield "<details><summary>" + escape(title) + "</summary><pre>" + escape(_json(value)) + "</pre></details>"
        yield "</section>"
    yield "<footer><h2>Source editions and receiving</h2><p>Every original source edition used by this report is included in the package. Native query exports retain the complete CSV, typed Parquet schema and original dictionary meanings. The warehouse snapshot retains editable definitions, result history, source bytes and saved queries.</p><ul>"
    for edition in report["source_editions"]:
        yield '<li><a href="sources/' + edition + '/source-receiving.json">' + escape(edition) + "</a></li>"
    yield "</ul><p>Use the receiving guide to create a separate working warehouse. This report remains the captured workbook edition when newer definitions or source editions are added.</p></footer></body></html>"


def write_report(workspace, report, path):
    """Write a complete report while the original warehouse guard is held."""
    path = Path(path)
    private_directory(path.parent)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    with workspace._guard(), workspace._connection() as db:
        model = Analytics(workspace)
        actual = model._record(db, "reports", report["report_id"])
        if actual != report:
            fail("ORIGINAL_REPORT_CHANGED")
        for source in report["sources"].values():
            if fingerprint(db, source["table"], source["columns"]) != source["fingerprint"]:
                fail("RETAINED_RESULT_CHANGED")
        descriptor = os.open(path, flags, 0o600)
        try:
            with os.fdopen(descriptor, "wb") as output:
                for chunk in chunks(db, report):
                    output.write(chunk.encode("utf-8"))
                output.flush()
                os.fsync(output.fileno())
        except BaseException:
            # The caller owns this new incomplete leaf and its retained request.
            raise
    sync_directory(path.parent)
    return path
