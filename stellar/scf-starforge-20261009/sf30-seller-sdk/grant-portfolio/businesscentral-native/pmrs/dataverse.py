"""Observed Dataverse schema, exact field conversion and record preconditions."""
import datetime as dt
import re
import urllib.parse
from decimal import Decimal, localcontext
from .canonical import (decode, decimal, decimal_text, digest, guid, identifier, now,
                        stable_text, ui_value)
from .connection import parsed, query, scope_url
from .errors import PMRSError, require

BASE_ATTRIBUTES = ("LogicalName", "MetadataId", "AttributeType", "AttributeTypeName", "AttributeOf",
                   "IsValidForRead", "IsValidForCreate", "IsValidForUpdate", "RequiredLevel", "SourceType")
TYPE_QUERIES = {
    "String": ("StringAttributeMetadata", "MaxLength"),
    "Memo": ("MemoAttributeMetadata", "MaxLength"),
    "Decimal": ("DecimalAttributeMetadata", "Precision,MinValue,MaxValue"),
    "Money": ("MoneyAttributeMetadata", "Precision,PrecisionSource,MinValue,MaxValue"),
    "Integer": ("IntegerAttributeMetadata", "MinValue,MaxValue"),
    "BigInt": ("BigIntAttributeMetadata", "MinValue,MaxValue"),
    "DateTime": ("DateTimeAttributeMetadata", "Format,DateTimeBehavior"),
    "Picklist": ("PicklistAttributeMetadata", "DefaultFormValue"),
    "Lookup": ("LookupAttributeMetadata", "Targets"),
}
SUPPORTED_TYPES = set(TYPE_QUERIES) | {"Boolean", "Uniqueidentifier"}

def native_name(value):
    require(isinstance(value, str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,127}", value),
            "NATIVE_NAME", "Use the exact observed native schema name.")
    return value

def attribute_type(attribute):
    typed = attribute.get("AttributeTypeName")
    if isinstance(typed, dict) and isinstance(typed.get("Value"), str):
        return typed["Value"].removesuffix("Type")
    return attribute.get("AttributeType")

def required_level(attribute):
    value = attribute.get("RequiredLevel")
    return value.get("Value") if isinstance(value, dict) else None

def logical_read_name(attribute):
    name = identifier(attribute["LogicalName"])
    return "_" + name + "_value" if attribute_type(attribute) == "Lookup" else name

def etag(value):
    tag = value.get("@odata.etag") if isinstance(value, dict) else None
    require(isinstance(tag, str) and 0 < len(tag) <= 512 and re.fullmatch(r'(?:W/)?"[^"\r\n]+"' , tag),
            "TARGET_ETAG", "An actual native record ETag is required.")
    return tag

class NativeReads:
    """Each named observation is retained before its dependent review step."""
    def __init__(self, store, http, progress, save, *, reuse=True):
        self.store, self.http, self.progress, self.save, self.reuse = store, http, progress, save, reuse
        progress.setdefault("reads", {})

    def get(self, name, url, *, allow_not_found=False):
        observations = self.progress["reads"]
        retained = observations.get(name) if self.reuse else None
        if retained is not None and not (200 <= retained["status"] < 300 or allow_not_found and retained["status"] == 404):
            self.progress.setdefault("read_failures", []).append({"name": name, **retained})
            retained = None
        if retained is not None:
            require(retained["url"] == url, "NATIVE_READ_CHANGED", "A retained observation belongs to a different native URL.")
            response = {"url": url, "status": retained["status"], "headers": retained["headers"],
                        "body": self.store.get_bytes(retained["object"], limit=8 * 1024 * 1024)}
        else:
            started = now(); response = self.http.get(url)
            retained = {"url": url, "status": response["status"], "headers": response["headers"],
                        "object": self.store.put_bytes(response["body"]), "started_at": started, "completed_at": now()}
            observations[name] = retained; self.save()
        return parsed(response, allow_not_found=allow_not_found)

    def pages(self, name, url):
        rows, seen, index = [], set(), 0
        while url:
            scope_url(url, self.http.roots)
            require(url not in seen and index < 1000, "METADATA_PAGE_LOOP", "Native metadata pagination repeated or exceeded its limit.")
            seen.add(url)
            body = self.get(name + ":" + str(index), url)
            require(isinstance(body, dict) and isinstance(body.get("value"), list),
                    "METADATA_COLLECTION", "The provider did not return a complete metadata collection.")
            rows.extend(body["value"])
            require(len(rows) <= 10000, "METADATA_LIMIT", "Selected metadata exceeds 10,000 records.")
            link = body.get("@odata.nextLink")
            require(link is None or isinstance(link, str), "METADATA_NEXT_LINK", "Invalid native metadata continuation.")
            url = urllib.parse.urljoin(url, link) if link else None
            index += 1
        return rows

class Dataverse:
    def __init__(self, http, reads):
        require(http.public["kind"] == "dataverse", "CONNECTION_KIND", "Select the original Dataverse connection.")
        self.http, self.reads = http, reads
        self.base = http.public["url"]
        self.entities = {}

    def identity(self):
        result = self.reads.get("identity", self.base + "WhoAmI")
        require(isinstance(result, dict) and guid(result.get("OrganizationId")) == self.http.public["organization_id"],
                "TARGET_ORGANIZATION", "The native target is not the reviewed Dataverse organization.")
        guid(result.get("UserId")); guid(result.get("BusinessUnitId"))
        return result

    def entity(self, logical_name):
        logical_name = identifier(logical_name)
        if logical_name in self.entities: return self.entities[logical_name]
        path = self.base + "EntityDefinitions(LogicalName='" + logical_name + "')"
        entity = self.reads.get("entity:" + logical_name, query(path, {"$select":
            "LogicalName,EntitySetName,PrimaryIdAttribute,IsOptimisticConcurrencyEnabled,MetadataId"}))
        require(isinstance(entity, dict) and entity.get("LogicalName") == logical_name,
                "TARGET_ENTITY", "Native metadata returned a different target table.")
        native_name(entity.get("EntitySetName")); identifier(entity.get("PrimaryIdAttribute")); guid(entity.get("MetadataId"))
        attributes = self.reads.pages("attributes:" + logical_name, query(path + "/Attributes", {"$select": ",".join(BASE_ATTRIBUTES)}))
        keyed = {}
        for attribute in attributes:
            key = identifier(attribute.get("LogicalName"))
            require(key not in keyed, "ATTRIBUTE_DUPLICATE", "Native target metadata repeats an attribute.")
            guid(attribute.get("MetadataId")); keyed[key] = attribute
        relationships = self.reads.pages("relationships:" + logical_name, query(path + "/ManyToOneRelationships", {"$select":
            "MetadataId,ReferencingAttribute,ReferencedEntity,ReferencedAttribute,ReferencingEntityNavigationPropertyName"}))
        result = {"entity": entity, "attributes": keyed, "details": {}, "relationships": relationships}
        self.entities[logical_name] = result
        return result

    def attribute(self, metadata, name):
        name = identifier(name)
        require(name in metadata["attributes"], "TARGET_ATTRIBUTE", "The selected column is absent from native metadata.", attribute=name)
        attribute = dict(metadata["attributes"][name])
        kind = attribute_type(attribute)
        require(kind in SUPPORTED_TYPES, "TARGET_ATTRIBUTE_TYPE",
                "This column type needs its native specialized workflow.", attribute=name, native_type=kind)
        if kind in TYPE_QUERIES and name not in metadata["details"]:
            cast, fields = TYPE_QUERIES[kind]
            logical = metadata["entity"]["LogicalName"]
            path = self.base + "EntityDefinitions(LogicalName='" + logical + "')/Attributes(LogicalName='" + name + "')/Microsoft.Dynamics.CRM." + cast
            query_fields = {"$select": "LogicalName,MetadataId," + fields}
            if kind == "Picklist": query_fields["$expand"] = "OptionSet"
            detail = self.reads.get("attribute:" + logical + ":" + name, query(path, query_fields))
            require(detail.get("LogicalName") == name and detail.get("MetadataId") == attribute["MetadataId"],
                    "ATTRIBUTE_CHANGED", "Native column metadata changed while constructing the review.")
            metadata["details"][name] = detail
        attribute.update(metadata["details"].get(name, {}))
        return attribute

    def relationship(self, metadata, name, target):
        target = identifier(target)
        rows = [r for r in metadata["relationships"] if r.get("ReferencingAttribute") == name
                and r.get("ReferencedEntity") == target]
        require(len(rows) == 1, "LOOKUP_RELATIONSHIP", "The selected native lookup relationship is not unique.",
                attribute=name, target=target)
        navigation = native_name(rows[0].get("ReferencingEntityNavigationPropertyName"))
        return navigation, rows[0]

    def record_url(self, metadata, record_id, fields):
        record_id = guid(record_id)
        selected = sorted(set(fields) | {metadata["entity"]["PrimaryIdAttribute"]})
        require(all(native_name(k) for k in selected), "TARGET_FIELDS", "Invalid native read column.")
        return query(self.base + metadata["entity"]["EntitySetName"] + "(" + record_id + ")",
                     {"$select": ",".join(selected)})

    def read_record(self, metadata, record_id, fields, *, name):
        result = self.reads.get(name, self.record_url(metadata, record_id, fields), allow_not_found=True)
        if result is not None:
            require(guid(result.get(metadata["entity"]["PrimaryIdAttribute"])) == guid(record_id),
                    "TARGET_RECORD_ID", "The native provider returned a different record.")
            etag(result)
        return result

    def currency(self, currency_id):
        currency_id = guid(currency_id)
        row = self.reads.get("currency:" + currency_id, query(self.base + "transactioncurrencies(" + currency_id + ")",
                             {"$select": "transactioncurrencyid,isocurrencycode,currencyprecision,currencyname"}))
        require(guid(row.get("transactioncurrencyid")) == currency_id
                and isinstance(row.get("isocurrencycode"), str) and row["isocurrencycode"].strip(),
                "TARGET_CURRENCY", "Native currency identity is missing.")
        precision = row.get("currencyprecision")
        require(type(precision) is int and 0 <= precision <= 28, "TARGET_PRECISION", "Native currency precision is unavailable.")
        return row

    def pricing_precision(self):
        organization_id = self.http.public["organization_id"]
        result = self.reads.get("organization-pricing", query(self.base + "organizations(" + organization_id + ")",
                               {"$select": "organizationid,pricingdecimalprecision"}))
        require(guid(result.get("organizationid")) == organization_id, "TARGET_ORGANIZATION", "Organization pricing identity changed.")
        precision = result.get("pricingdecimalprecision")
        require(type(precision) is int and 0 <= precision <= 28, "TARGET_PRECISION", "Organization pricing precision is unavailable.")
        return precision

def amount_value(attribute, value, *, currency=None, pricing_precision=None):
    number = decimal(value, field=attribute["LogicalName"])
    kind = attribute_type(attribute)
    if kind in {"Integer", "BigInt"}:
        require(number == number.to_integral_value(), "TARGET_INTEGER", "The native integer column cannot retain a fractional amount.")
        number = int(number)
    else:
        precision = attribute.get("Precision")
        if kind == "Money":
            source = attribute.get("PrecisionSource")
            require(type(source) is int and source in {0, 1, 2}, "TARGET_PRECISION", "Native Money precision source is unavailable.")
            if source == 1: precision = pricing_precision
            elif source == 2: precision = None if currency is None else currency.get("currencyprecision")
        require(type(precision) is int and 0 <= precision <= 28, "TARGET_PRECISION", "Native precision is unavailable.")
        with localcontext() as context:
            context.prec = 512
            require(number.quantize(Decimal(1).scaleb(-precision)) == number, "TARGET_ROUNDING_REQUIRED",
                    "The exact source amount does not fit the observed native precision; no rounding was performed.",
                    attribute=attribute["LogicalName"], value=decimal_text(number), precision=precision)
    for name, comparison in (("MinValue", lambda a, b: a >= b), ("MaxValue", lambda a, b: a <= b)):
        if attribute.get(name) is not None:
            require(comparison(Decimal(number), decimal(attribute[name])), "TARGET_VALUE_RANGE",
                    "The exact source value is outside the observed native range.", attribute=attribute["LogicalName"])
    return number

def scalar_value(attribute, value, *, currency=None, pricing_precision=None):
    kind, name = attribute_type(attribute), attribute["LogicalName"]
    if value is None:
        require(required_level(attribute) not in {"SystemRequired", "ApplicationRequired"},
                "TARGET_REQUIRED", "The observed native column is required.", attribute=name)
        require(kind != "Lookup", "LOOKUP_CLEAR_UNSUPPORTED", "Use the native relationship-removal workflow to clear a lookup.")
        return None
    if kind in {"Decimal", "Money", "Integer", "BigInt"}:
        return amount_value(attribute, value, currency=currency, pricing_precision=pricing_precision)
    if kind in {"String", "Memo"}:
        length = attribute.get("MaxLength")
        require(type(length) is int and isinstance(value, str)
                and len(value.encode("utf-16-le")) // 2 <= length,
                "TARGET_TEXT_LENGTH", "Text does not fit the observed native column.", attribute=name, maximum=length)
        return value
    if kind == "Boolean":
        require(type(value) is bool, "TARGET_BOOLEAN", "A native Boolean value is required.", attribute=name)
        return value
    if kind == "Uniqueidentifier": return guid(value)
    if kind == "Picklist":
        options = attribute.get("OptionSet", {}).get("Options")
        require(isinstance(options, list) and type(value) is int
                and value in {x.get("Value") for x in options}, "TARGET_CHOICE",
                "Select an actual native choice value.", attribute=name)
        return value
    if kind == "DateTime":
        require(isinstance(value, str), "TARGET_DATETIME", "Use an explicit ISO date-time with timezone.")
        try: selected = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError: raise PMRSError("TARGET_DATETIME", "Invalid date-time.")
        require(selected.tzinfo is not None and selected.year >= 1753,
                "TARGET_DATETIME", "A supported date-time with an explicit offset is required.")
        behavior = attribute.get("DateTimeBehavior")
        if isinstance(behavior, dict): behavior = behavior.get("Value")
        require(behavior in {"DateOnly", "TimeZoneIndependent", "UserLocal"},
                "TARGET_DATETIME", "Native date-time behavior is unavailable.")
        if behavior in {"DateOnly", "TimeZoneIndependent"}:
            require(selected.utcoffset() == dt.timedelta(0), "TARGET_DATETIME",
                    "Use an explicit +00:00 local-value representation for this native date behavior.")
        if behavior == "DateOnly":
            require(selected.time().replace(tzinfo=None) == dt.time(0, 0),
                    "TARGET_DATETIME", "A native DateOnly value must be midnight.")
        return value
    raise PMRSError("TARGET_VALUE_TYPE", "Use an explicit native lookup selection for this column.", details={"attribute": name})

def equivalent(attribute, actual, expected):
    if actual is None or expected is None: return actual is expected
    kind = attribute_type(attribute)
    try:
        if kind in {"Decimal", "Money", "Integer", "BigInt"}: return decimal(actual) == decimal(expected)
        if kind in {"Lookup", "Uniqueidentifier"}: return guid(actual) == guid(expected)
        if kind == "DateTime":
            return dt.datetime.fromisoformat(actual.replace("Z", "+00:00")) == dt.datetime.fromisoformat(expected.replace("Z", "+00:00"))
        return type(actual) is type(expected) and actual == expected
    except (PMRSError, ValueError, TypeError, AttributeError): return False
