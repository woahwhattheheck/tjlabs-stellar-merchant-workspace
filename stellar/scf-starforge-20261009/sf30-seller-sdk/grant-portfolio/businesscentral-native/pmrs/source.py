"""Complete company-scoped BC page capture with original raw-byte checkpoints."""
import urllib.parse
from .canonical import date, digest, full_sha, guid, now, stable_text, ui_value
from .connection import parsed, query, scope_url
from .errors import PMRSError, require

PAGE_BYTES = 8 * 1024 * 1024
CAPTURE_BYTES = 512 * 1024 * 1024
CAPTURE_ROWS = 250000
CUSTOM_RESOURCES = ("projects", "projectTasks", "projectPlanningLines", "projectLedgerEntries",
                    "projectDefaultDimensions", "projectTaskDimensions", "dimensionSetEntries")
STANDARD_RESOURCES = ("generalLedgerSetup", "generalLedgerEntries")
KEYS = {"projects": ("number",), "projectTasks": ("projectNumber", "number"),
        "projectPlanningLines": ("projectNumber", "taskNumber", "lineNumber"),
        "projectLedgerEntries": ("entryNumber",), "dimensionSetEntries": ("dimensionSetId", "dimensionCode"),
        "projectDefaultDimensions": ("sourceTableId", "projectNumber", "dimensionCode"),
        "projectTaskDimensions": ("projectNumber", "taskNumber", "dimensionCode"),
        "generalLedgerEntries": ("entryNumber",), "generalLedgerSetup": ("id",)}

def literal(value):
    return "'" + stable_text(value, 100).replace("'", "''") + "'"

def selection(profile):
    require(isinstance(profile, dict), "CAPTURE_PROFILE", "A source selection is required.")
    require(set(profile) <= {"projects", "from", "to", "include_gl", "label"},
            "CAPTURE_PROFILE", "Unknown source selection field.")
    projects = profile.get("projects")
    require(isinstance(projects, list) and 1 <= len(projects) <= 200
            and all(isinstance(x, str) and 0 < len(x) <= 20 for x in projects)
            and len(set(projects)) == len(projects),
            "PROJECT_SELECTION", "Select 1–200 exact native project numbers without duplicates.")
    result = {"projects": sorted(projects), "include_gl": profile.get("include_gl", True),
              "label": stable_text(profile.get("label", "Business Central source"), 256)}
    require(type(result["include_gl"]) is bool, "CAPTURE_PROFILE", "include_gl must be a boolean.")
    for field in ("from", "to"):
        if profile.get(field) is not None: result[field] = date(profile[field])
    require(("from" in result) == ("to" in result), "CAPTURE_PERIOD", "Supply both source period dates or neither.")
    if "from" in result: require(result["from"] <= result["to"], "CAPTURE_PERIOD", "Source period is reversed.")
    return result

def _part(key, resource, url, *, singleton=False):
    return {"key": key, "resource": resource, "url": url, "singleton": singleton,
            "pages": [], "done": False}

def _batches(values, size=50):
    values = list(values)
    return [values[i:i + size] for i in range(0, len(values), size)]

def _native_integer(value, field):
    require(not isinstance(value, bool) and (type(value) is int or isinstance(value, str) and value.isdigit()),
            "SOURCE_INTEGER", "Native integer identity is invalid.", field=field)
    return int(value)

def retained_rows(store, parts, resource):
    for part in parts:
        if part["resource"] != resource: continue
        require(part["done"], "SOURCE_INCOMPLETE", "A selected source collection is not complete.", resource=resource)
        for page_index, page in enumerate(part["pages"]):
            value = store.get_json(page["object"], limit=PAGE_BYTES)
            rows = [value] if part["singleton"] else value.get("value")
            require(isinstance(rows, list) and len(rows) == page["rows"],
                    "SOURCE_PAGE_CHANGED", "Retained page cardinality changed.")
            for row_index, row in enumerate(rows):
                require(isinstance(row, dict), "SOURCE_ROW", "Native source row is not an object.")
                yield {"native": ui_value(row), "source": {
                    "part": part["key"], "page": page_index, "row": row_index,
                    "sha256": page["object"]["sha256"], "url": page["url"],
                    "captured_at": page["completed_at"]}}

def _validate_complete(store, parts, profile, connection=None):
    counts, total_bytes = {}, 0
    if connection is not None:
        require(connection.get("kind") == "businesscentral", "SOURCE_CONNECTION", "Source edition is not Business Central.")
        roots = [connection["standard_url"], connection["projects_url"]]
        for part in parts:
            scope_url(part["url"], roots)
            require(part["resource"] in ("company",) + STANDARD_RESOURCES + CUSTOM_RESOURCES,
                    "SOURCE_RESOURCE", "The source edition contains an unsupported collection.")
            seen = set()
            for index, page in enumerate(part["pages"]):
                scope_url(page["url"], roots)
                require(page["url"] not in seen and page["status"] == 200,
                        "SOURCE_PAGE_CHANGED", "Source page status or continuation identity is invalid.")
                require(page["url"] == (part["url"] if index == 0 else part["pages"][index - 1]["next_link"]),
                        "SOURCE_PAGE_CHANGED", "The retained source page chain differs.")
                seen.add(page["url"])
                if page["next_link"]: scope_url(page["next_link"], roots)
            require(part["done"] and part["pages"] and part["pages"][-1]["next_link"] is None,
                    "SOURCE_INCOMPLETE", "The retained collection has no completed final page.")
    for resource in ("company",) + STANDARD_RESOURCES + CUSTOM_RESOURCES:
        ids, business = set(), set()
        count = 0
        for wrapper in retained_rows(store, parts, resource):
            row = wrapper["native"]
            native_id = guid(row.get("id"))
            require(native_id not in ids, "SOURCE_DUPLICATE_ID", "Native pages repeat a source row.",
                    resource=resource, native_id=native_id)
            ids.add(native_id)
            fields = KEYS.get(resource, ("id",))
            require(all(field in row for field in fields), "SOURCE_CONTRACT",
                    "Native source does not expose the selected API contract.", resource=resource)
            key = digest([row[field] for field in fields])
            require(key not in business, "SOURCE_DUPLICATE_KEY",
                    "Native pages repeat a business identity.", resource=resource)
            business.add(key); count += 1
        counts[resource] = count
    require(counts["company"] == 1 and counts["generalLedgerSetup"] == 1,
            "SOURCE_SETUP", "Exactly one selected company and ledger setup are required.")
    if connection is not None:
        company = next(retained_rows(store, parts, "company"))["native"]
        require(guid(company["id"]) == connection["company_id"], "COMPANY_CHANGED", "The source company differs from its selected account.")
    project_numbers = {x["native"]["number"] for x in retained_rows(store, parts, "projects")}
    require(project_numbers == set(profile["projects"]), "SOURCE_PROJECTS",
            "Every selected project must be returned exactly once.",
            missing=sorted(set(profile["projects"]) - project_numbers),
            unexpected=sorted(project_numbers - set(profile["projects"])))
    for part in parts:
        for page in part["pages"]: total_bytes += page["object"]["bytes"]
    require(sum(counts.values()) <= CAPTURE_ROWS and total_bytes <= CAPTURE_BYTES,
            "SOURCE_LIMIT", "Complete selected capture exceeds its explicit limits.")
    return counts, total_bytes

def capture(store, http, operation_id, profile, contract):
    profile = selection(profile)
    request = {"connection": http.public, "profile": profile, "contract": contract}
    operation = store.operation(operation_id, "source-capture", request)
    if operation.get("result"): return store.record(operation["result"]["record_id"], "source")
    with store.work(operation_id):
        operation = store.operation(operation_id, "source-capture", request)
        if operation.get("result"): return store.record(operation["result"]["record_id"], "source")
        progress = operation["progress"]
        if not progress:
            progress = {"started_at": now(), "parts": [
                _part("company", "company", http.public["standard_url"].rstrip("/"), singleton=True),
                _part("setup", "generalLedgerSetup", http.public["standard_url"] + "generalLedgerSetup")],
                "dependent_parts_created": False}
            for resource in CUSTOM_RESOURCES:
                if resource == "dimensionSetEntries": continue
                field = "number" if resource == "projects" else "projectNumber"
                for batch_index, values in enumerate(_batches(profile["projects"])):
                    clauses = ["(" + " or ".join(field + " eq " + literal(v) for v in values) + ")"]
                    period_field = {"projectPlanningLines": "planningDate", "projectLedgerEntries": "postingDate"}.get(resource)
                    if period_field and "from" in profile:
                        clauses += [period_field + " ge " + profile["from"], period_field + " le " + profile["to"]]
                    url = query(http.public["projects_url"] + resource, {"$filter": " and ".join(clauses)})
                    progress["parts"].append(_part(resource + ":" + str(batch_index), resource, url))
            store.update_operation(operation_id, state="RUNNING", progress=progress)
        try:
            while True:
                pending = next((p for p in progress["parts"] if not p["done"]), None)
                if pending is None:
                    if progress["dependent_parts_created"]: break
                    dimensions, ledger_numbers = set(), set()
                    for item in retained_rows(store, progress["parts"], "projectLedgerEntries"):
                        row = item["native"]
                        dim = _native_integer(row.get("dimensionSetId"), "dimensionSetId")
                        if dim: dimensions.add(dim)
                        if row.get("linkedLedgerEntryTypeName") == "G/L Account":
                            number = _native_integer(row.get("linkedLedgerEntryNumber"), "linkedLedgerEntryNumber")
                            if number: ledger_numbers.add(number)
                    for resource, field, values, base in (
                        ("dimensionSetEntries", "dimensionSetId", sorted(dimensions), http.public["projects_url"]),
                        ("generalLedgerEntries", "entryNumber",
                         sorted(ledger_numbers) if profile["include_gl"] else [], http.public["standard_url"])):
                        for batch_index, batch in enumerate(_batches(values)):
                            url = query(base + resource, {"$filter": " or ".join(field + " eq " + str(v) for v in batch)})
                            progress["parts"].append(_part(resource + ":" + str(batch_index), resource, url))
                    progress["dependent_parts_created"] = True
                    store.update_operation(operation_id, state="RUNNING", progress=progress)
                    continue
                pages = pending["pages"]
                url = pages[-1]["next_link"] if pages else pending["url"]
                seen_urls = {page["url"] for page in pages}
                require(url and url not in seen_urls, "SOURCE_PAGE_LOOP", "The provider repeated a continuation URL.")
                scope_url(url, http.roots)
                require(len(pages) < 10000, "SOURCE_PAGE_LIMIT", "Collection exceeds 10,000 provider pages.")
                started = now()
                response = http.get(url)
                value = parsed(response)
                require(isinstance(value, dict), "SOURCE_PAGE", "The provider did not return a JSON object.")
                rows = [value] if pending["singleton"] else value.get("value")
                require(isinstance(rows, list), "SOURCE_PAGE", "A native collection page must contain value[].")
                next_link = value.get("@odata.nextLink")
                if next_link:
                    require(not pending["singleton"] and isinstance(next_link, str),
                            "SOURCE_NEXT_LINK", "Unexpected source continuation.")
                    next_link = urllib.parse.urljoin(url, next_link)
                    scope_url(next_link, http.roots)
                    require(next_link not in seen_urls and next_link != url, "SOURCE_PAGE_LOOP", "Provider continuation repeats a page.")
                if pending["resource"] == "company":
                    require(guid(value.get("id")) == http.public["company_id"], "COMPANY_CHANGED", "Provider returned a different company.")
                descriptor = store.put_bytes(response["body"])
                page = {"url": url, "started_at": started, "completed_at": now(),
                        "status": response["status"], "headers": response["headers"],
                        "object": descriptor, "rows": len(rows), "next_link": next_link}
                pages.append(page); pending["done"] = not bool(next_link)
                total_bytes = sum(p["object"]["bytes"] for part in progress["parts"] for p in part["pages"])
                total_rows = sum(p["rows"] for part in progress["parts"] for p in part["pages"])
                require(total_bytes <= CAPTURE_BYTES and total_rows <= CAPTURE_ROWS,
                        "SOURCE_LIMIT", "Selected capture exceeds 512 MiB or 250,000 rows; choose a smaller source scope.")
                store.update_operation(operation_id, state="RUNNING", progress=progress,
                                       event={"kind": "PAGE_RETAINED", "resource": pending["resource"],
                                              "sha256": descriptor["sha256"], "rows": len(rows)})
            counts, total_bytes = _validate_complete(store, progress["parts"], profile, http.public)
            body = {"schema": "commons.pmrs-source.v1", "label": profile["label"],
                    "connection": http.public, "profile": profile, "contract": contract,
                    "parts": progress["parts"], "counts": counts, "raw_bytes": total_bytes,
                    "capture_started_at": progress["started_at"], "created_at": operation["created_at"],
                    "consistency": "complete_server_pages_over_observed_interval_not_transaction_snapshot"}
            result = store.add_record("source", body)
            store.update_operation(operation_id, state="COMPLETE", progress=progress,
                                   result={"record_id": result["id"]},
                                   event={"kind": "SOURCE_COMPLETE", "record_id": result["id"]})
            return result
        except BaseException as error:
            try:
                store.update_operation(operation_id, state="INTERRUPTED", progress=progress,
                    event={"kind": "SOURCE_INTERRUPTED", "code": getattr(error, "code", type(error).__name__)})
            except Exception: pass
            raise

class Source:
    def __init__(self, store, record_id):
        self.store = store
        self.record = store.record(record_id, "source")
        self.body = self.record["body"]
        require(self.body.get("schema") == "commons.pmrs-source.v1", "SOURCE_SCHEMA", "Unsupported source edition.")
    def rows(self, resource):
        return retained_rows(self.store, self.body["parts"], resource)
    def verify(self):
        self.store.verify_object(self.body["contract"]["object"])
        counts, size = _validate_complete(self.store, self.body["parts"], self.body["profile"], self.body["connection"])
        require(counts == self.body["counts"] and size == self.body["raw_bytes"],
                "SOURCE_CHANGED", "The retained source closure differs from its accepted edition.")
        return {"id": self.record["id"], "counts": counts, "raw_bytes": size}
