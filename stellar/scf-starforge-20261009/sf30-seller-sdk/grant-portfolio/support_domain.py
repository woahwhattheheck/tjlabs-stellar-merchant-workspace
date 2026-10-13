"""MIT. Defect support terms, business calendars, and retained case transitions."""
from __future__ import annotations

import calendar as month_calendar
import copy
import datetime as dt
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from domain import InputError, canonical, digest, identifier, operation, require, sha, shape, short

SCHEMA = "tjlabs.pmrs.defect-support/v1"
UTC = dt.timezone.utc
OPEN_STATES = ("received", "triaged", "acknowledged", "planned", "in-correction", "ready-for-review")
SEVERITIES = ("critical", "other")
CLASSIFICATIONS = ("investigating", "delivered-defect", "new-functionality",
                   "material-enhancement", "new-integration", "changed-requirement",
                   "third-party-change", "not-reproduced")
SOURCE_FIELDS = ("kind", "label", "verification", "uri", "sha256", "sourceId",
                 "entityKey", "editionId", "row", "note", "object")
CALENDAR_MODES = ("working-time", "next-business-day-close")


def clone(value):
    return copy.deepcopy(value)


def timestamp(value, label="Timestamp"):
    short(value, label, 100)
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise InputError(label + " needs an ISO timestamp with its timezone") from error
    require(parsed.tzinfo is not None and parsed.utcoffset() is not None,
            label + " needs its original timezone")
    return parsed


def instant(value):
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def date_value(value, label="Date"):
    require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value),
            label + " needs YYYY-MM-DD")
    try:
        return dt.date.fromisoformat(value)
    except ValueError as error:
        raise InputError(label + " is invalid") from error


def evidence(value, *, required=False):
    require(isinstance(value, list) and len(value) <= 100, "Retain a list of original source references")
    result = []
    for item in value:
        shape(item, SOURCE_FIELDS, ("kind", "label", "verification"))
        out = clone(item)
        for key in ("kind", "label", "verification"):
            short(out[key], "Source " + key, 1000)
        for key in ("uri", "sourceId", "entityKey", "editionId", "note"):
            if key in out:
                short(out[key], "Source " + key, 8000)
        if "sha256" in out:
            sha(out["sha256"])
        if "object" in out:
            sha(out["object"])
        if "row" in out:
            require(type(out["row"]) is int and out["row"] >= 0, "Source row must be a nonnegative integer")
        result.append(out)
    require(not required or result, "Retain the actual supporting record or correspondence")
    return result


def record_ref(value):
    shape(value, ("recordId", "recordSha256"), ("recordId", "recordSha256"))
    operation(value["recordId"]), sha(value["recordSha256"])
    return clone(value)


def portfolio_ref(value):
    shape(value, ("id", "revision", "snapshot"), ("id", "revision", "snapshot"))
    identifier(value["id"]), sha(value["snapshot"])
    require(type(value["revision"]) is int and value["revision"] > 0, "Select the actual portfolio revision")
    return clone(value)


def calendar_spec(value):
    if value is None:
        return None
    shape(value, ("name", "timeZone", "weekdays", "holidays", "opens", "closes",
                  "counting", "state", "agreedAt", "sourceRefs"),
          ("name", "timeZone", "weekdays", "holidays", "opens", "closes", "counting", "state", "sourceRefs"))
    result = clone(value)
    short(value["name"], "Calendar name", 200)
    try:
        ZoneInfo(value["timeZone"])
    except (ZoneInfoNotFoundError, ValueError, TypeError) as error:
        raise InputError("Select an installed IANA service timezone") from error
    days = value["weekdays"]
    require(isinstance(days, list) and days and all(type(x) is int and 0 <= x <= 6 for x in days)
            and days == sorted(set(days)), "Use ordered unique weekdays, Monday 0 through Sunday 6")
    require(isinstance(value["holidays"], list) and len(value["holidays"]) <= 2000
            and value["holidays"] == sorted(set(value["holidays"])), "Retain ordered unique non-working dates")
    for date in value["holidays"]:
        date_value(date, "Non-working date")
    for key in ("opens", "closes"):
        require(isinstance(value[key], str) and re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value[key]),
                "Use local opening and closing times as HH:MM")
    require(value["opens"] < value["closes"], "One service day must open before it closes")
    require(value["counting"] in CALENDAR_MODES, "Select the agreed business-day counting rule")
    require(value["state"] in ("proposed", "agreed"), "Select proposed or agreed calendar status")
    result["sourceRefs"] = evidence(value["sourceRefs"], required=value["state"] == "agreed")
    if value["state"] == "agreed":
        timestamp(value.get("agreedAt"), "Calendar agreement")
    elif "agreedAt" in value:
        require(value["agreedAt"] is None, "A proposed calendar has no actual agreement time")
    return result


def _working_date(day, spec):
    return day.weekday() in spec["weekdays"] and day.isoformat() not in spec["holidays"]


def _wall(day, hhmm, zone, *, closing=False):
    hour, minute = map(int, hhmm.split(":"))
    naive = dt.datetime.combine(day, dt.time(hour, minute))
    candidates = []
    for fold in (0, 1):
        aware = naive.replace(tzinfo=zone, fold=fold)
        if aware.astimezone(UTC).astimezone(zone).replace(tzinfo=None) == naive:
            candidates.append(aware.astimezone(UTC))
    require(candidates, "The service calendar selects a nonexistent local clock time on " + day.isoformat(),
            "CALENDAR_LOCAL_TIME", 409)
    return max(candidates) if closing else min(candidates)


def acknowledgement_due(received_at, severity, spec):
    """Return a disclosed calculation; an unagreed calendar never becomes a contractual clock."""
    received = timestamp(received_at, "Original report receipt")
    require(severity in SEVERITIES, "Select critical or other defect severity")
    days = 1 if severity == "critical" else 2
    if spec is None:
        return {"state": "calendar-not-selected", "businessDays": days, "receivedAt": received_at,
                "dueAt": None, "calendarSha256": None, "calendar": None}
    spec = calendar_spec(spec)
    zone = ZoneInfo(spec["timeZone"])
    day = received.astimezone(zone).date()
    result = {"state": "contractual" if spec["state"] == "agreed" else "planning",
              "businessDays": days, "receivedAt": received_at,
              "calendarSha256": digest(spec), "calendar": clone(spec)}
    if spec["counting"] == "next-business-day-close":
        remaining = days
        for _ in range(4000):
            day += dt.timedelta(days=1)
            if _working_date(day, spec):
                remaining -= 1
                if remaining == 0:
                    result["dueAt"] = instant(_wall(day, spec["closes"], zone, closing=True))
                    return result
    else:
        opens = sum(int(x) * scale for x, scale in zip(spec["opens"].split(":"), (60, 1)))
        closes = sum(int(x) * scale for x, scale in zip(spec["closes"].split(":"), (60, 1)))
        remaining = dt.timedelta(minutes=(closes - opens) * days)
        cursor = received.astimezone(UTC)
        for _ in range(4000):
            if _working_date(day, spec):
                opening = _wall(day, spec["opens"], zone)
                closing = _wall(day, spec["closes"], zone, closing=True)
                cursor = max(cursor, opening)
                if cursor < closing:
                    available = closing - cursor
                    if remaining <= available:
                        result["dueAt"] = instant(cursor + remaining)
                        return result
                    remaining -= available
            day += dt.timedelta(days=1)
    raise InputError("The selected calendar has no service time in its calculation horizon", "CALENDAR_HORIZON", 409)


def add_months(value, count=12):
    parsed = timestamp(value)
    month = parsed.year * 12 + parsed.month - 1 + count
    year, month = divmod(month, 12)
    month += 1
    day = min(parsed.day, month_calendar.monthrange(year, month)[1])
    return parsed.replace(year=year, month=month, day=day)


def entitlement(contract, received_at):
    accepted = contract.get("acceptance")
    if not accepted:
        return {"state": "acceptance-not-recorded", "covered": None, "acceptance": None}
    at = timestamp(received_at)
    start, end = timestamp(accepted["acceptedAt"]), timestamp(accepted["supportEndsAt"])
    status = "before-acceptance" if at < start else "within-term" if at < end else "after-term"
    return {"state": status, "covered": status == "within-term", "acceptance": clone(accepted)}


def clock_status(issue, as_of):
    cycle = issue["cycles"][-1]
    clock, ack = cycle["acknowledgementClock"], cycle.get("acknowledgement")
    due = clock.get("dueAt")
    result = {"state": clock["state"], "dueAt": due, "acknowledgedAt": ack["at"] if ack else None,
              "businessDays": clock["businessDays"], "late": None, "asOf": as_of}
    if due is not None:
        target = timestamp(ack["at"] if ack else as_of)
        result["late"] = target > timestamp(due)
        result["state"] = ("acknowledged-late" if result["late"] else "acknowledged-on-time") if ack else (
            "overdue" if result["late"] else "awaiting-acknowledgement")
        if clock["state"] != "contractual":
            result["state"] = "planning-" + result["state"]
    elif ack:
        result["state"] = "acknowledged-calendar-not-selected"
    earlier = []
    for review in cycle.get("clockReviews", []):
        previous = review["before"]
        if previous.get("dueAt") is not None:
            observed = min(timestamp(ack["at"]), timestamp(review["at"])) if ack else timestamp(review["at"])
            earlier.append({"dueAt": previous["dueAt"], "reviewedAt": review["at"],
                            "state": previous["state"], "lateAtReview": observed > timestamp(previous["dueAt"])})
    result["earlierDeadlines"] = earlier
    result["previousContractualDeadlineMissed"] = any(
        value["state"] == "contractual" and value["lateAtReview"] for value in earlier)
    return result


def source_objects(value):
    result = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "object" and isinstance(item, str) and re.fullmatch(r"[0-9a-f]{64}", item):
                result.add(item)
            else:
                result.update(source_objects(item))
    elif isinstance(value, list):
        for item in value:
            result.update(source_objects(item))
    return result


def public_summary(issue, as_of, contract=None):
    cycle = issue["cycles"][-1]
    if contract is not None:
        require(contract["id"] == issue["contractId"], "Select the report's actual service contract")
    assessed = entitlement(contract, cycle["receivedAt"]) if contract is not None else clone(issue["entitlement"])
    return {"id": issue["id"], "revision": issue["revision"], "contractId": issue["contractId"],
            "title": issue["title"], "state": issue["state"], "severity": issue["severity"],
            "classification": issue["classification"], "component": issue["component"],
            "owner": issue["owner"], "receivedAt": cycle["receivedAt"], "updatedAt": issue["updatedAt"],
            "cycle": cycle["number"], "clock": clock_status(issue, as_of),
            "correctionDueAt": cycle.get("plan", {}).get("correctionDueAt") if cycle.get("plan") else None,
            "affectedRelease": issue.get("affectedRelease"), "entitlement": assessed,
            "recordedEntitlement": clone(issue["entitlement"]),
            "entitlementContract": ({"id": contract["id"], "revision": contract["revision"],
                                     "sha256": contract["sha256"]} if contract is not None else None)}


def report_html(contract, issues, events, at):
    import html
    esc = lambda value: html.escape(str(value), quote=True)
    title = esc(contract["label"] + " — defect support")
    rows = []
    for issue in issues:
        summary = public_summary(issue, at, contract)
        cycle = issue["cycles"][-1]
        rows.append("<tr><td>" + esc(issue["title"]) + "</td><td>" + esc(issue["state"]) +
                    "</td><td>" + esc(issue["severity"]) + "</td><td>" + esc(issue["owner"] or "Unassigned") +
                    "</td><td>" + esc(summary["clock"]["dueAt"] or "Calendar not selected") +
                    "</td><td>" + esc(summary["clock"]["state"]) + "</td></tr>")
    details = []
    for issue in issues:
        assessed = entitlement(contract, issue["cycles"][-1]["receivedAt"])
        body = ["<section><h2>" + esc(issue["title"]) + "</h2><p>" + esc(issue["description"]) + "</p>",
                "<p>Coverage at report receipt under selected contract revision " + str(contract["revision"]) +
                ": " + esc(assessed["state"]) + ". Recorded case assessment: " + esc(issue["entitlement"]["state"]) + ".</p>",
                "<p>Issue " + esc(issue["id"]) + " · revision " + str(issue["revision"]) + "</p>"]
        for cycle in issue["cycles"]:
            body.append("<h3>Report cycle " + str(cycle["number"]) + "</h3><dl>")
            for key in ("receivedAt", "reproduction", "acknowledgement", "plan", "workarounds",
                        "correction", "validation", "closure"):
                value = cycle.get(key)
                if value is not None:
                    body.append("<dt>" + esc(key) + "</dt><dd><pre>" +
                                esc(canonical(value).decode() if isinstance(value, (dict, list)) else value) + "</pre></dd>")
            body.append("</dl>")
        body.append("</section>")
        details.append("".join(body))
    return ("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" "
            "content=\"width=device-width,initial-scale=1\"><title>" + title + "</title><style>"
            "body{font:15px system-ui,sans-serif;color:#171717;background:#fff;max-width:1100px;margin:40px auto;padding:0 24px}"
            "h1{font-size:25px}h2{font-size:19px}h3{font-size:16px}table{border-collapse:collapse;width:100%}"
            "th,td{text-align:left;vertical-align:top;padding:9px;border:1px solid #bbb}th{background:#eee}"
            "dt{font-weight:650;margin-top:10px}dd{margin:4px 0 14px}pre{white-space:pre-wrap;overflow-wrap:anywhere;"
            "font:13px ui-monospace,monospace}section{break-inside:avoid;border-top:1px solid #777;margin-top:30px}"
            "@media print{body{margin:0;font-size:11px}h1{font-size:19px}section{break-inside:auto}}"
            "</style><h1>" + title + "</h1><p>Prepared " + esc(at) + ". The editable package retains "
            "the complete contract, reports, every case revision, original actions, deployment records and source.</p>"
            "<p>Warranty: twelve months from recorded final acceptance. A deployment receipt alone does not "
            "establish customer acceptance. Workaround and correction targets follow the recorded agreement.</p>"
            "<table><thead><tr><th>Report</th><th>State</th><th>Severity</th><th>Owner</th>"
            "<th>Acknowledgement due</th><th>Clock</th></tr></thead><tbody>" + "".join(rows) +
            "</tbody></table>" + "".join(details) + "<p>Retained support events: " + str(len(events)) + "</p></html>").encode()
