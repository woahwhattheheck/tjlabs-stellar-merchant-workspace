"""MIT. Original IATI organisation XSD and codelist custody; offline libxml2 validation."""
from __future__ import annotations
import json
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET
from xml.parsers import expat
from xml_source import parser
from iati_source import InputError
from workspace import digest, load_json
from publishing_xml import MAX_EDIT_SOURCE

HERE = Path(__file__).resolve().parent

def support_source():
    index_raw = (HERE / "support-manifest.json").read_bytes()
    index = load_json(index_raw)
    bodies = {}
    root = HERE / "support"
    for row in index["files"]:
        name = row["path"]
        if not isinstance(name, str) or name.startswith("/") or any(x in {"", ".", ".."} for x in name.split("/")):
            raise InputError("Invalid original organisation dependency path")
        path = root / name
        if path.is_symlink() or path.resolve() != root.resolve() / name:
            raise InputError("An installed original organisation dependency is aliased")
        body = path.read_bytes()
        if len(body) != row["bytes"] or digest(body) != row["sha256"]:
            raise InputError("An installed organisation schema, codelist or licence changed: " + name)
        bodies[name] = body
    return index_raw, index, bodies

def definition():
    index_raw, index, bodies = support_source()
    methodology_raw = (HERE / "methodology.json").read_bytes()
    return {"schemaManifestSha256": digest(index_raw), "schema": index,
            "methodologySha256": digest(methodology_raw), "methodology": load_json(methodology_raw),
            "attribution": "IATI Standard (http://iatistandard.org/)",
            "licenceNotice": "Original software and data licences are retained separately; external codelist descriptions keep their upstream provenance."}

def code_lists():
    _, _, bodies = support_source()
    result = {}
    for name, body in bodies.items():
        if not name.startswith("codelists/") or "/xml/" not in name or not name.endswith(".xml"):
            continue
        # These are exact hash-checked original source assets, not caller XML.
        root = ET.fromstring(body)
        if root.tag != "codelist":
            continue
        code_name = root.get("name")
        entries = {}
        for item in root.findall("./codelist-items/codelist-item"):
            code = item.findtext("code")
            if code is not None:
                entries[code] = {"code": code, "status": item.get("status"),
                    "names": [n.text or "" for n in item.findall("./name/narrative")],
                    "category": item.findtext("category")}
        result[code_name] = {"name": code_name, "complete": root.get("complete") == "1",
                            "source": name, "sha256": digest(body), "entries": entries}
    return result

def validate_source(raw):
    if not isinstance(raw, bytes) or not raw or len(raw) > MAX_EDIT_SOURCE:
        raise InputError("Validate complete organisation XML within 32 MiB")
    guarded = parser()
    try:
        guarded.Parse(raw, True)
    except expat.ExpatError as error:
        return {"schema": "stellar-forge.iati-organisation-validation.v1", "state": "INVALID",
            "sourceSha256": digest(raw), "sourceBytes": len(raw), "stage": "XML_PARSE",
            "errors": [{"line": error.lineno, "column": error.offset, "message": str(error)}]}
    index_raw, index, bodies = support_source()
    common = {"schema": "stellar-forge.iati-organisation-validation.v1", "sourceSha256": digest(raw),
              "sourceBytes": len(raw), "standardVersion": "2.03", "schemaManifestSha256": digest(index_raw),
              "schemaSource": index["source"], "entry": "iati-organisations-schema.xsd"}
    try:
        from lxml import etree
    except ImportError:
        return {**common, "state": "UNAVAILABLE", "stage": "SCHEMA_RUNTIME", "errors": [],
                "message": "Use the selected original Python runtime with lxml for complete XSD validation."}
    originals = {Path(k).name: v for k, v in bodies.items() if k.startswith("schema/")}
    class RetainedResolver(etree.Resolver):
        def resolve(self, url, public_id, context):
            name = Path(urlsplit(url).path).name
            if name not in {"iati-organisations-schema.xsd", "iati-common.xsd", "xml.xsd"}:
                raise InputError("The original organisation schema requested an unretained dependency")
            return self.resolve_string(originals[name], context, base_url=name)
    schema_parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False,
                                    recover=False, huge_tree=False)
    schema_parser.resolvers.add(RetainedResolver())
    source_parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False,
                                    recover=False, huge_tree=False)
    try:
        schema = etree.XMLSchema(etree.fromstring(originals["iati-organisations-schema.xsd"],
            parser=schema_parser, base_url="iati-organisations-schema.xsd"))
    except (etree.XMLSyntaxError, etree.XMLSchemaParseError) as error:
        raise InputError("The retained original organisation XSD could not be loaded: " + str(error)) from error
    try:
        source = etree.fromstring(raw, parser=source_parser)
        valid = schema.validate(source)
        errors = [{"line": e.line, "column": e.column, "message": e.message,
                   "domain": e.domain_name, "type": e.type_name, "level": e.level_name} for e in schema.error_log]
    except etree.XMLSyntaxError as error:
        valid = False
        errors = [{"line": e.line, "column": e.column, "message": e.message} for e in error.error_log]
    return {**common, "state": "VALID" if valid else "INVALID", "stage": "IATI_XSD",
            "engine": {"name": "lxml/libxml2", "lxml": list(etree.LXML_VERSION), "libxml2": list(etree.LIBXML_VERSION)},
            "errors": errors, "reportedErrorCount": len(errors),
            "semantics": "Complete XML was checked against the original organisation XSD. Codelists, budget interpretation, document access and methodology evidence are separate."}
