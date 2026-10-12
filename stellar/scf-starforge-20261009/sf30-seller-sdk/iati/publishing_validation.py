"""MIT. Offline validation against unchanged, attributed IATI 2.03 source schemas."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit
from xml.parsers import expat
from iati_source import InputError
from xml_source import parser

HERE = Path(__file__).resolve().parent
MAX_SOURCE = 32 * 1024 * 1024

def _digest(raw):
    return hashlib.sha256(raw).hexdigest()

def validate_source(raw):
    if not isinstance(raw, bytes) or not raw or len(raw) > MAX_SOURCE:
        raise InputError("Validate one complete publisher source within 32 MiB")
    # Retain the original parser's DTD/entity and large-token protections.
    selected = parser()
    try:
        selected.Parse(raw, True)
    except InputError:
        raise
    except expat.ExpatError as error:
        return {"schema": "stellar-forge.iati-schema-validation.v1", "state": "INVALID",
                "sourceSha256": _digest(raw), "sourceBytes": len(raw),
                "stage": "XML_PARSE", "errors": [{"line": error.lineno, "column": error.offset,
                "message": expat.ErrorString(error.code)}]}
    index_raw = (HERE / "publishing-schema-source.json").read_bytes()
    index = json.loads(index_raw)
    originals = {}
    for name, record in index["files"].items():
        if Path(name).name != name:
            raise InputError("The retained schema source uses an unsupported path")
        path = HERE / "publishing-schema" / name
        if path.is_symlink() or path.resolve().parent != (HERE / "publishing-schema").resolve():
            raise InputError("The selected schema source is aliased")
        body = path.read_bytes()
        if len(body) != record["bytes"] or _digest(body) != record["sha256"]:
            raise InputError("An installed original IATI schema or licence differs")
        originals[name] = body
    common = {"schema": "stellar-forge.iati-schema-validation.v1",
              "sourceSha256": _digest(raw), "sourceBytes": len(raw),
              "schemaManifestSha256": _digest(index_raw), "standardVersion": "2.03",
              "schemaSource": index["ref"], "license": index["license"]}
    try:
        from lxml import etree
    except ImportError:
        return {**common, "state": "UNAVAILABLE", "stage": "SCHEMA_RUNTIME",
                "errors": [], "message": "Install lxml in the selected Python environment to run the original XSD validation."}
    class RetainedResolver(etree.Resolver):
        def resolve(self, url, public_id, context):
            name = Path(urlsplit(url).path).name
            if name not in {"iati-activities-schema.xsd", "iati-common.xsd", "xml.xsd"}:
                raise InputError("The original schema requested an unretained include")
            return self.resolve_string(originals[name], context, base_url=name)
    source_parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False,
                                    recover=False, huge_tree=False)
    schema_parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False,
                                    recover=False, huge_tree=False)
    schema_parser.resolvers.add(RetainedResolver())
    try:
        schema_document = etree.fromstring(originals[index["entry"]], parser=schema_parser,
                                            base_url=index["entry"])
        schema = etree.XMLSchema(schema_document)
    except (etree.XMLSyntaxError, etree.XMLSchemaParseError) as error:
        raise InputError("The unchanged original IATI schema could not be loaded: " + str(error)) from error
    try:
        document = etree.fromstring(raw, parser=source_parser)
    except etree.XMLSyntaxError as error:
        return {**common, "state": "INVALID", "stage": "XML_PARSE",
                "errors": [{"line": x.line, "column": x.column, "message": x.message,
                            "domain": x.domain_name, "type": x.type_name} for x in error.error_log]}
    valid = schema.validate(document)
    errors = [{"line": x.line, "column": x.column, "message": x.message,
               "domain": x.domain_name, "type": x.type_name, "level": x.level_name}
              for x in schema.error_log]
    return {**common, "state": "VALID" if valid else "INVALID", "stage": "IATI_XSD",
            "engine": {"name": "lxml/libxml2", "lxml": etree.LXML_VERSION,
                       "libxml2": etree.LIBXML_VERSION},
            "errors": errors, "reportedErrorCount": len(errors),
            "semantics": "The complete supplied document was checked against the retained official XSD. Codelist semantics, publication access and PWYF assessment are separate reviews."}
