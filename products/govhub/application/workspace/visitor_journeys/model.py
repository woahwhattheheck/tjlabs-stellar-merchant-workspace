"""Reviewed visitor goals and observations from the original page or search source."""
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit, parse_qsl, urlencode
import hashlib
import json
import re
import unicodedata

FORMAT = "govhub-visitor-journeys/1"
MAX_PAGES = 300
MAX_PAGE_BYTES = 8 * 1024 * 1024


def fail(code, message, status=422):
    from govhub import GovHubError
    raise GovHubError(code, message, status)


def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else packed(value).encode()).hexdigest()


def string(value, name, limit=4000, required=True):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        fail("VISITOR_INPUT", name + " must be " + ("a nonempty " if required else "a ") + "text value.")
    return value.strip()


def identifier(value, name="Identifier"):
    value = string(value, name, 120)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", value):
        fail("VISITOR_IDENTIFIER", name + " uses letters, numbers, dots, hyphens and underscores.")
    return value


def url(value, base=None, keep_fragment=False):
    value = string(value, "URL", 8000)
    result = urlsplit(urljoin(base, value) if base else value)
    if result.scheme not in {"http", "https"} or not result.hostname or result.username or result.password:
        fail("VISITOR_URL", "Use an HTTP or HTTPS URL without embedded credentials.")
    try:
        port = result.port
    except ValueError:
        fail("VISITOR_URL", "The URL has an invalid port.")
    if any(ord(c) < 32 for c in value):
        fail("VISITOR_URL", "URL control characters are not accepted.")
    host = result.hostname.encode("idna").decode().lower()
    if ":" in host:
        host = "[" + host + "]"
    authority = host + (":" + str(port) if port and port != (443 if result.scheme == "https" else 80) else "")
    return urlunsplit((result.scheme.lower(), authority, result.path or "/", result.query, result.fragment if keep_fragment else ""))


def origin(value):
    parsed = urlsplit(url(value))
    return parsed.scheme + "://" + parsed.netloc


def profile(value):
    if not isinstance(value, dict):
        fail("VISITOR_PROJECT", "Supply the project and its original site URL.")
    base = url(value.get("base_url"))
    origins = value.get("allowed_origins", [origin(base)])
    if not isinstance(origins, list) or not 1 <= len(origins) <= 20:
        fail("VISITOR_ORIGINS", "Declare one to twenty site origins for this capture.")
    origins = sorted(set(origin(item) for item in origins))
    if origin(base) not in origins:
        fail("VISITOR_ORIGINS", "Include the original site origin in the capture scope.")
    timeout = value.get("timeout_seconds", 30)
    if isinstance(timeout, bool) or not isinstance(timeout, int) or not 1 <= timeout <= 120:
        fail("VISITOR_TIMEOUT", "Use a request timeout from one to 120 seconds.")
    maximum = value.get("max_page_bytes", 2 * 1024 * 1024)
    if isinstance(maximum, bool) or not isinstance(maximum, int) or not 1024 <= maximum <= MAX_PAGE_BYTES:
        fail("VISITOR_BYTES", "Page size must be from 1 KiB to 8 MiB.")
    auth = value.get("header_environment", {})
    if not isinstance(auth, dict) or len(auth) > 20:
        fail("VISITOR_AUTH", "Map an exact source origin to header environment names.")
    headers = {}
    for site, mapping in auth.items():
        site = origin(site)
        if site not in origins or not isinstance(mapping, dict):
            fail("VISITOR_AUTH", "Header configuration must name a declared source origin.")
        headers[site] = {}
        for name, variable in mapping.items():
            if not re.fullmatch(r"[A-Za-z0-9-]{1,80}", name) or name.lower() in {"host", "content-length", "connection", "transfer-encoding"}:
                fail("VISITOR_AUTH", "Choose a normal request header.")
            if not isinstance(variable, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]{0,119}", variable):
                fail("VISITOR_AUTH", "Retain environment variable names, with values supplied only at execution.")
            headers[site][name] = variable
    result_class = string(value.get("search_result_class", ""), "Search result container class", 120, False)
    if result_class and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", result_class):
        fail("VISITOR_SEARCH_CLASS", "Use one original CSS class for the search result container.")
    return {"label": string(value.get("label"), "Project name", 240), "base_url": base,
            "search_result_class": result_class,
            "allowed_origins": origins, "timeout_seconds": timeout,
            "max_page_bytes": maximum, "header_environment": headers,
            "source_reference": string(value.get("source_reference", base), "Source reference", 8000),
            "notes": string(value.get("notes", ""), "Notes", 12000, False)}


def cohort(value, project):
    if not isinstance(value, dict):
        fail("VISITOR_SET", "Supply a named set of visitor journeys.")
    journeys = value.get("journeys")
    if not isinstance(journeys, list) or not 1 <= len(journeys) <= 150:
        fail("VISITOR_SET", "Use one to 150 reviewed visitor journeys.")
    output, seen, pages = [], set(), set()
    for journey in journeys:
        if not isinstance(journey, dict):
            fail("VISITOR_JOURNEY", "Each journey must be an object.")
        jid = identifier(journey.get("id"), "Journey identifier")
        if jid in seen:
            fail("VISITOR_JOURNEY", "Each journey identifier occurs once.")
        seen.add(jid)
        steps = journey.get("steps")
        if not isinstance(steps, list) or not 1 <= len(steps) <= 20:
            fail("VISITOR_STEPS", "Each journey has one to twenty explicit page or search steps.")
        items, step_ids = [], set()
        for step in steps:
            sid = identifier(step.get("id"), "Step identifier")
            if sid in step_ids:
                fail("VISITOR_STEPS", "Each step identifier occurs once within its journey.")
            step_ids.add(sid)
            target = url(step.get("url"), project["base_url"])
            if origin(target) not in project["allowed_origins"]:
                fail("VISITOR_SCOPE", "Step URLs stay within the configured site origins; external handoffs are expected links.")
            pages.add(target)
            expected = step.get("expect", {})
            if not isinstance(expected, dict):
                fail("VISITOR_EXPECTATION", "Step expectations must be an object.")
            extra = set(expected) - {"status", "title", "heading", "text", "links", "form", "min_results", "result_links", "max_redirects", "language"}
            if extra:
                fail("VISITOR_EXPECTATION", "Unknown expectation fields: " + ", ".join(sorted(extra)))
            clean = {}
            if "status" in expected:
                codes = expected["status"]
                if isinstance(codes, int) and not isinstance(codes, bool):
                    codes = [codes]
                if not isinstance(codes, list) or not codes or any(isinstance(c, bool) or not isinstance(c, int) or not 100 <= c <= 599 for c in codes):
                    fail("VISITOR_STATUS", "Expected status is a response code or list of codes.")
                clean["status"] = sorted(set(codes))
            for key in ("title", "heading", "text", "language"):
                if key in expected:
                    clean[key] = string(expected[key], "Expected " + key, 8000)
            for key in ("links", "result_links"):
                if key not in expected:
                    continue
                values = expected[key]
                if not isinstance(values, list) or len(values) > 100:
                    fail("VISITOR_LINKS", "Use at most 100 expected links per step.")
                links = []
                for item in values:
                    if not isinstance(item, dict) or not (item.get("url") or item.get("label") or item.get("origin")):
                        fail("VISITOR_LINKS", "An expected link names a destination, origin or visible label.")
                    link = {}
                    for name in ("url", "origin", "label"):
                        if name in item:
                            link[name] = (url(item[name], project["base_url"], keep_fragment=True) if name == "url" else origin(item[name]) if name == "origin" else string(item[name], "Link label", 1000))
                    if "max_rank" in item:
                        rank = item["max_rank"]
                        if isinstance(rank, bool) or not isinstance(rank, int) or not 1 <= rank <= 1000:
                            fail("VISITOR_RANK", "Maximum result rank is one to 1000.")
                        link["max_rank"] = rank
                    links.append(link)
                clean[key] = links
            if "form" in expected:
                form = expected["form"]
                if not isinstance(form, dict) or not isinstance(form.get("field"), str):
                    fail("VISITOR_FORM", "A form expectation identifies its original input field.")
                clean["form"] = {"field": string(form["field"], "Form field", 240),
                                 "method": string(form.get("method", "get"), "Form method", 10).lower()}
                if "action" in form:
                    clean["form"]["action"] = url(form["action"], project["base_url"])
            for key, maximum in (("min_results", 10000), ("max_redirects", 15)):
                if key in expected:
                    n = expected[key]
                    if isinstance(n, bool) or not isinstance(n, int) or not 0 <= n <= maximum:
                        fail("VISITOR_EXPECTATION", key + " is outside its supported range.")
                    clean[key] = n
            if not clean:
                fail("VISITOR_EXPECTATION", "Retain at least one expected visitor outcome for every step.")
            items.append({"id": sid, "url": target, "label": string(step.get("label", sid), "Step label", 300),
                          "expect": clean, "note": string(step.get("note", ""), "Step note", 4000, False)})
        output.append({"id": jid, "name": string(journey.get("name"), "Journey name", 300),
                       "goal": string(journey.get("goal"), "Visitor goal", 4000),
                       "audience": string(journey.get("audience", ""), "Audience", 1000, False),
                       "steps": items})
    if len(pages) > MAX_PAGES:
        fail("VISITOR_PAGES", "A capture contains at most 300 distinct source URLs.")
    return {"label": string(value.get("label"), "Journey set name", 300), "journeys": output,
            "notes": string(value.get("notes", ""), "Set notes", 12000, False),
            "source_reference": string(value.get("source_reference", project["source_reference"]), "Set source", 8000)}


def normal(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(value))).strip().casefold()


class Page(HTMLParser):
    """Parse document source without executing third-party page scripts."""
    def __init__(self, base, result_class=""):
        super().__init__(convert_charrefs=True)
        self.base = base
        self.result_class = result_class
        self.stack = []
        self.texts = []
        self.title = []
        self.headings = []
        self.links = []
        self.forms = []
        self.images = []
        self.language = ""
        self.viewport = ""
        self.heading = None
        self.link = None
        self.form = None

    def handle_starttag(self, tag, pairs):
        attrs = dict(pairs)
        hidden = tag in {"script", "style", "template", "noscript"} or "hidden" in attrs or attrs.get("aria-hidden") == "true"
        result_context = any(x["result"] for x in self.stack)
        classes = attrs.get("class", "").casefold()
        result_context = result_context or tag == "article" and "search" in classes or "search-result" in classes or "views-row" in classes or bool(self.result_class and self.result_class in classes.split())
        self.stack.append({"tag": tag, "hidden": hidden, "result": bool(result_context)})
        if tag == "html":
            self.language = attrs.get("lang", "")
        if tag == "meta" and attrs.get("name", "").casefold() == "viewport":
            self.viewport = attrs.get("content", "")
        if tag == "base" and attrs.get("href"):
            try:
                self.base = url(attrs["href"], self.base)
            except Exception:
                pass
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self.heading = {"level": int(tag[1]), "text": []}
        if tag == "a" and attrs.get("href") and not any(x["hidden"] for x in self.stack):
            self.link = {"href": urljoin(self.base, attrs["href"]), "text": [], "aria_label": attrs.get("aria-label", ""),
                         "result": bool(result_context and self.heading), "rel": attrs.get("rel", ""), "target": attrs.get("target", "")}
        if tag == "form":
            self.form = {"action": urljoin(self.base, attrs.get("action", self.base)), "method": attrs.get("method", "get").lower(), "fields": []}
            self.forms.append(self.form)
        if self.form is not None and tag in {"input", "button", "textarea", "select"}:
            self.form["fields"].append({key: attrs.get(key, "") for key in ("name", "type", "value", "aria-label")})
        if tag == "img":
            self.images.append({"src": urljoin(self.base, attrs.get("src", "")), "alt": attrs.get("alt"),
                                "decorative": attrs.get("role") == "presentation" or attrs.get("alt") == ""})
        if tag in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.pop()

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack and self.stack[-1]["tag"] == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        if self.heading and tag == "h" + str(self.heading["level"]):
            self.headings.append({"level": self.heading["level"], "text": " ".join(self.heading["text"]).strip()})
            self.heading = None
        if tag == "a" and self.link:
            self.link["label"] = " ".join(self.link.pop("text")).strip() or self.link.pop("aria_label", "")
            self.link.pop("aria_label", None)
            if urlsplit(self.link["href"]).scheme in {"http", "https"}:
                self.links.append(self.link)
            self.link = None
        if tag == "form":
            self.form = None
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]["tag"] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if any(item["hidden"] for item in self.stack):
            return
        data = re.sub(r"\s+", " ", data).strip()
        if not data:
            return
        self.texts.append(data)
        if any(item["tag"] == "title" for item in self.stack):
            self.title.append(data)
        if self.heading:
            self.heading["text"].append(data)
        if self.link:
            self.link["text"].append(data)

    def result(self):
        return {"format": "html-source", "title": " ".join(self.title), "headings": self.headings,
                "text": " ".join(self.texts), "links": self.links, "forms": self.forms,
                "language": self.language, "viewport": self.viewport,
                "images": {"total": len(self.images), "missing_alt": sum(x["alt"] is None for x in self.images),
                           "decorative": sum(x["decorative"] for x in self.images)},
                "results": [item for item in self.links if item["result"]]}


def parse_source(data, page_url, content_type="text/html", result_class=""):
    if "json" in content_type:
        value = json.loads(data.decode("utf-8-sig"))
        response = value.get("response", {}) if isinstance(value, dict) else {}
        if not isinstance(response, dict) or not isinstance(response.get("docs"), list):
            fail("VISITOR_SEARCH_SOURCE", "The native JSON response must contain Solr response.docs.")
        docs = response["docs"]
        results = []
        for i, item in enumerate(docs, 1):
            if not isinstance(item, dict):
                fail("VISITOR_SEARCH_SOURCE", "Each native search document must be an object.")
            link = item.get("url", item.get("ss_url", item.get("id", "")))
            if isinstance(link, list):
                link = link[0] if link else ""
            label = item.get("title", item.get("label", item.get("id", "")))
            if isinstance(label, list):
                label = " ".join(str(x) for x in label)
            results.append({"href": str(link), "label": str(label), "rank": i, "native": item, "result": True})
        return {"format": "solr-json", "title": "", "headings": [], "text": "", "links": results, "forms": [],
                "language": "", "viewport": "", "images": {}, "results": results,
                "native": {"responseHeader": value.get("responseHeader"), "numFound": response.get("numFound"),
                           "numFoundExact": response.get("numFoundExact"), "start": response.get("start")}}
    charset = re.search(r"charset\s*=\s*([A-Za-z0-9._-]+)", content_type, re.I)
    encoding = charset.group(1) if charset else "utf-8"
    try:
        source = data.decode(encoding, errors="strict")
    except (LookupError, UnicodeDecodeError):
        source = data.decode("utf-8", errors="replace")
    parser = Page(page_url, result_class)
    parser.feed(source)
    parser.close()
    return parser.result()


def link_matches(item, expected):
    if "label" in expected and normal(expected["label"]) not in normal(item.get("label", "")):
        return False
    try:
        if "url" in expected and url(item.get("href", ""), keep_fragment=True) != expected["url"]:
            return False
        if "origin" in expected and origin(item.get("href", "")) != expected["origin"]:
            return False
    except Exception:
        return False
    return True


def evaluate_step(step, page):
    checks = []
    def check(kind, expected, actual, passed, detail=""):
        checks.append({"kind": kind, "expected": expected, "actual": actual,
                       "status": "PASS" if passed else "FAIL", "detail": detail})
    if not page or page.get("error"):
        return {"step_id": step["id"], "label": step["label"], "url": step["url"], "status": "ERROR",
                "checks": [], "error": page.get("error") if page else {"message": "No original page was captured."},
                "page_sha256": page.get("sha256") if page else None}
    parsed, expected = page["parsed"], step["expect"]
    for kind, wanted in expected.items():
        if kind == "status":
            actual = page.get("status")
            if actual is None:
                checks.append({"kind": kind, "expected": wanted, "actual": None, "status": "UNOBSERVED",
                               "detail": "This supplied original source did not retain its origin HTTP status."})
            else:
                check(kind, wanted, actual, actual in wanted)
        elif kind in {"title", "text", "language"}:
            actual = parsed.get(kind, "")
            match = normal(wanted) in normal(actual) if kind != "language" else normal(wanted) == normal(actual)
            check(kind, wanted, actual if kind != "text" else {"present": match}, match)
        elif kind == "heading":
            actual = [h["text"] for h in parsed.get("headings", [])]
            check(kind, wanted, actual, any(normal(wanted) in normal(h) for h in actual))
        elif kind in {"links", "result_links"}:
            entries = parsed.get("results" if kind == "result_links" else "links", [])
            for wanted_link in wanted:
                matches = [{"rank": i, "href": item["href"], "label": item["label"]} for i, item in enumerate(entries, 1) if link_matches(item, wanted_link)]
                found = any(i["rank"] <= wanted_link.get("max_rank", 1000000) for i in matches)
                check(kind, wanted_link, matches, found, "Rank is among extracted original result links." if kind == "result_links" else "")
        elif kind == "form":
            matches = [form for form in parsed["forms"] if form["method"] == wanted["method"] and
                       any(f["name"] == wanted["field"] for f in form["fields"]) and
                       ("action" not in wanted or url(form["action"]) == wanted["action"])]
            check(kind, wanted, matches, bool(matches))
        elif kind == "min_results":
            check(kind, wanted, len(parsed["results"]), len(parsed["results"]) >= wanted)
        elif kind == "max_redirects":
            redirects = page.get("redirects")
            if redirects is None:
                checks.append({"kind": kind, "expected": wanted, "actual": None, "status": "UNOBSERVED",
                               "detail": "The supplied original source has no retained redirect chain."})
            else:
                check(kind, wanted, len(redirects), len(redirects) <= wanted)
    statuses = {c["status"] for c in checks}
    status = "FAIL" if "FAIL" in statuses else "UNOBSERVED" if "UNOBSERVED" in statuses else "PASS"
    return {"step_id": step["id"], "label": step["label"], "url": step["url"], "status": status,
            "page_sha256": page["sha256"], "checks": checks, "error": None}


def evaluate(cohort_value, pages):
    by_url = {page["url"]: page for page in pages}
    results = []
    for journey in cohort_value["journeys"]:
        steps = [evaluate_step(step, by_url.get(step["url"])) for step in journey["steps"]]
        statuses = {s["status"] for s in steps}
        status = next((x for x in ("ERROR", "FAIL", "UNOBSERVED") if x in statuses), "PASS")
        results.append({"id": journey["id"], "name": journey["name"], "goal": journey["goal"],
                        "status": status, "steps": steps})
    return {"journeys": results, "summary": {key: sum(j["status"] == key for j in results)
                                           for key in ("PASS", "FAIL", "ERROR", "UNOBSERVED")},
            "page_count": len(pages), "journey_count": len(results),
            "check_count": sum(len(s["checks"]) for j in results for s in j["steps"])}
