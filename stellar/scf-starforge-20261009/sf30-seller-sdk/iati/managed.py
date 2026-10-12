"""MIT. Retained IATI workspace identity and managed original console startup."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
import stat
import sys

from iati_workspace import InputError, json_bytes, load_json

SCHEMA = "stellar-forge.iati-managed-binding.v1"
STARTUP = "stellar-forge.iati-workspace-launch.v1"
SOURCE = Path(__file__).resolve().parents[1]
SOURCE_FILES = (
    "iati/iati_source.py",
    "iati/iati_workspace.py",
    "iati/server.py",
    "iati/cli.py",
    "iati/cli.mjs",
    "iati/managed.py",
    "iati/public/index.html",
    "iati/public/app.js",
    "iati/public/style.css",
    "iati/dqa.py",
    "iati/dqa_http.py",
    "iati/dqa_cli.py",
    "iati/public/dqa.js",
    "iati/public/dqa.css",
    "iati/PUBLISHING.md",
    "iati/PUBLISHING_SOURCES.md",
    "iati/publishing.py",
    "iati/publishing_xml.py",
    "iati/publishing_validation.py",
    "iati/publishing_http.py",
    "iati/publishing_cli.py",
    "iati/public/publishing.js",
    "iati/public/publishing.css",
    "iati/publishing-methodology.json",
    "iati/publishing-schema-source.json",
    "iati/publishing-schema/iati-activities-schema.xsd",
    "iati/publishing-schema/iati-common.xsd",
    "iati/publishing-schema/xml.xsd",
    "iati/publishing-schema/LICENSE",
    "iati/publishing-schema/IATI-LICENSE.rst",
    "iati/client.d.mts",
    "iati/client.mjs",
    "iati/organisation/GUIDE.md",
    "iati/organisation/__init__.py",
    "iati/organisation/assessment.py",
    "iati/organisation/methodology.json",
    "iati/organisation/portable.py",
    "iati/organisation/support-manifest.json",
    "iati/organisation/support/RESEARCH-NOTICE.md",
    "iati/organisation/support/codelists/core/LICENSE",
    "iati/organisation/support/codelists/core/README.rst",
    "iati/organisation/support/codelists/core/codelist.xsd",
    "iati/organisation/support/codelists/core/mapping.xml",
    "iati/organisation/support/codelists/core/xml.xsd",
    "iati/organisation/support/codelists/core/xml/BudgetStatus.xml",
    "iati/organisation/support/codelists/core/xml/DocumentCategory.xml",
    "iati/organisation/support/codelists/nonembedded/LICENSE",
    "iati/organisation/support/codelists/nonembedded/README.md",
    "iati/organisation/support/codelists/nonembedded/xml/Country.xml",
    "iati/organisation/support/codelists/nonembedded/xml/Currency.xml",
    "iati/organisation/support/codelists/nonembedded/xml/DocumentCategory-category.xml",
    "iati/organisation/support/codelists/nonembedded/xml/FileFormat.xml",
    "iati/organisation/support/codelists/nonembedded/xml/Language.xml",
    "iati/organisation/support/codelists/nonembedded/xml/OrganisationType.xml",
    "iati/organisation/support/codelists/nonembedded/xml/Region.xml",
    "iati/organisation/support/codelists/nonembedded/xml/RegionVocabulary.xml",
    "iati/organisation/support/codelists/nonembedded/xml/Version.xml",
    "iati/organisation/support/licences/IATI-Guidance-license.rst",
    "iati/organisation/support/methodology/METHODOLOGY-SOURCES.md",
    "iati/organisation/support/methodology/fcdo-2023-profile.json",
    "iati/organisation/support/methodology/pwyf-2026-profile.json",
    "iati/organisation/support/organisation-codelist-map.json",
    "iati/organisation/support/schema/LICENSE",
    "iati/organisation/support/schema/README.rst",
    "iati/organisation/support/schema/iati-common.xsd",
    "iati/organisation/support/schema/iati-organisations-schema.xsd",
    "iati/organisation/support/schema/xml.xsd",
    "iati/organisation/support/source-manifest.json",
    "iati/organisation/validation.py",
    "iati/organisation/workspace.py",
    "iati/organisation/xml.py",
    "iati/organisation_cli.py",
    "iati/organisation_client.d.mts",
    "iati/organisation_http.py",
    "iati/public/organisation.css",
    "iati/public/organisation.js",
    "iati/REFRESH.md",
    "iati/refresh.py",
    "iati/refresh_packet.py",
    "iati/refresh_cli.py",
    "iati/refresh_http.py",
    "iati/public/refresh.js",
    "iati/public/refresh.css",
    "xml/xml_source.py",
    "xml/workspace.py",
    "xml/server.py",
    "xml/native.mjs",
    "dataset-handler.mjs",
    "iati/results/__init__.py",
    "iati/results/model.py",
    "iati/results/workspace.py",
    "iati/results/report.py",
    "iati/results/transfer.py",
    "iati/results/http.py",
    "iati/results/cli.py",
    "iati/results/ui/app.js",
    "iati/results/ui/style.css",
    "iati/RESULTS.md",
    "iati/results/receiving.py",
    "iati/results/receiving_console.py",
    "iati/results/browser_receiving.mjs",
    "iati/results/PROGRAMME.md",
    "iati/results/programme_browser.mjs",
    "iati/results/commissioning.py",
    "iati/results/commissioning.schema.json",
    "iati/results/COMMISSIONING.md",
    "iati/results/examples/commissioning_integration.py",
    "iati/ORGANISATION_RECONCILIATION.md",
    "iati/RECONCILIATION_RECEIVING.md",
    "iati/organisation_reconciliation.py",
    "iati/organisation_reconciliation_cli.py",
    "iati/organisation_reconciliation_client.d.mts",
    "iati/organisation_reconciliation_client.mjs",
    "iati/organisation_reconciliation_http.py",
    "iati/organisation_reconciliation_mcp.mjs",
    "iati/public/organisation_reconciliation.css",
    "iati/public/organisation_reconciliation_ui.mjs",
    "iati/reconciliation_receiving.py",
    "iati/results/examples/snv-sp2194/RECEIVING.md",
    "iati/results/examples/snv-sp2194/SNV_SP2194_DPortal_Source_20261012.zip",
    "iati/results/examples/snv-sp2194/THIRD_PARTY_NOTICES.md",
    "iati/results/examples/snv-sp2194/prepare_snv.py",
    "iati/AMP.md",
    "iati/amp/__init__.py",
    "iati/amp/batch.py",
    "iati/amp/codec.py",
    "iati/amp/domain.py",
    "iati/amp/native.py",
    "iati/amp/portable.py",
    "iati/amp/upstream-manifest.json",
    "iati/amp/upstream/LICENSE",
    "iati/amp/upstream/NOTICE.md",
    "iati/amp/upstream/amp/Dockerfile",
    "iati/amp/upstream/amp/src/main/java/org/digijava/kernel/ampapi/endpoints/activity/ActivityEPConstants.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/kernel/ampapi/endpoints/activity/InterchangeEndpoints.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/kernel/ampapi/endpoints/activity/ProjectList.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/kernel/ampapi/endpoints/activity/dto/ActivitySummary.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/kernel/ampapi/endpoints/activity/field/APIField.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/kernel/ampapi/endpoints/common/JsonApiResponse.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/kernel/ampapi/endpoints/errors/ApiErrorResponse.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/kernel/ampapi/endpoints/security/ApiAuthentication.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/kernel/ampapi/endpoints/security/Security.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/kernel/ampapi/endpoints/security/SecurityService.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/kernel/ampapi/endpoints/security/dto/AuthenticationRequest.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/kernel/ampapi/endpoints/security/dto/LayoutInformation.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/kernel/ampapi/endpoints/security/dto/UserSessionInformation.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/module/aim/action/dataimporter/model/Funding.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/module/aim/action/dataimporter/model/Transaction.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/module/aim/action/dataimporter/util/ImporterConstants.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/module/aim/action/dataimporter/util/ImporterUtil.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/module/aim/annotations/interchange/ActivityFieldsConstants.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/module/aim/dbentity/AmpFunding.java",
    "iati/amp/upstream/amp/src/main/java/org/digijava/module/aim/dbentity/AmpFundingDetail.java",
    "iati/amp/upstream/docs/IMPORTER_QUICK_GUIDE.md",
    "iati/amp/workspace.py",
    "iati/amp_cli.py",
    "iati/amp_client.d.mts",
    "iati/amp_http.py",
    "iati/public/amp.css",
    "iati/public/amp.js",
    "iati/receiving/AMP.md",
    "iati/receiving/amp.py",
    "iati/examples/amp-haiti/PROGRAMME.md",
    "iati/examples/amp-haiti/selection.json",
    "iati/amp/destination.py",
    "iati/amp/DESTINATION.md",
    "iati/amp/DESTINATION_UPSTREAM.json",
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def regular(path, *, private=False, limit=None):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or limit is not None and info.st_size > limit:
        raise InputError("Choose an original regular IATI workspace or source file: " + str(path))
    if private and os.name == "posix" and (info.st_uid != os.getuid() or info.st_mode & 0o077):
        raise InputError("IATI workspace metadata must remain private and operator-owned")
    return info


def source_digest(path):
    info = regular(path, limit=4 * 1024 * 1024)
    value = hashlib.sha256()
    with path.open("rb") as handle:
        opened = os.fstat(handle.fileno())
        if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
            raise InputError("Original IATI source changed while opening")
        for data in iter(lambda: handle.read(65536), b""):
            value.update(data)
        after = os.fstat(handle.fileno())
    if (after.st_size, after.st_mtime_ns, after.st_ctime_ns) != (
            info.st_size, info.st_mtime_ns, info.st_ctime_ns):
        raise InputError("Original IATI source changed while reading")
    return value.hexdigest()


def inspect_binding(directory):
    """Read saved identity without acquiring the original SQLite writer."""
    raw = Path(directory).expanduser().absolute()
    root = raw.resolve(strict=True)
    if raw != root or root.is_symlink():
        raise InputError("Choose the original absolute IATI workspace without path aliases")
    info = root.stat()
    if not stat.S_ISDIR(info.st_mode) or os.name == "posix" and (
            info.st_uid != os.getuid() or info.st_mode & 0o077):
        raise InputError("Choose the original private, operator-owned IATI workspace")
    marker = root / "workspace.json"
    marker_info = regular(marker, private=True, limit=4096)
    data = marker.read_bytes()
    if load_json(data) != {"schema": "stellar-forge.iati-workspace.v1"}:
        raise InputError("Choose a workspace initialized or received by the original IATI command")
    database = regular(root / "workspace.sqlite", private=True)
    for name in ("sources", "plans", "builds", "comparisons", "tmp"):
        item = root / name
        if item.is_symlink() or not item.is_dir():
            raise InputError("Original IATI storage directory is missing: " + name)
    if sys.version_info < (3, 11):
        raise InputError("The original IATI workspace requires Python 3.11 or newer")
    value = {
        "schema": SCHEMA, "workspace": str(root), "sourceRoot": str(SOURCE),
        "workspaceIdentity": {
            "device": str(info.st_dev), "inode": str(info.st_ino),
            "markerDevice": str(marker_info.st_dev), "markerInode": str(marker_info.st_ino),
            "markerSha256": digest(data),
            "databaseDevice": str(database.st_dev), "databaseInode": str(database.st_ino),
        },
        "python": {
            "executable": str(Path(sys.executable).absolute()), "prefix": sys.prefix,
            "basePrefix": sys.base_prefix, "implementation": sys.implementation.name,
            "version": list(sys.version_info[:3]),
        },
        "source": {name: source_digest(SOURCE / name) for name in SOURCE_FILES},
    }
    # Managed adoption copies the same source into its retained release.
    # Saved source rows and edition records remain mutable in the original database.
    bound = {key: item for key, item in value.items() if key != "sourceRoot"}
    return value | {"sha256": digest(json_bytes(bound))}


def require_binding(directory, expected):
    value = inspect_binding(directory)
    if expected is not None and (
            not isinstance(expected, str) or len(expected) != 64
            or any(char not in "0123456789abcdef" for char in expected)
            or expected != value["sha256"]):
        raise InputError("The selected IATI workspace, Python or original source changed; review this application again")
    return value


def startup(server, binding, connection_file=None):
    value = {
        "schema": STARTUP, "status": "IATI_WORKSPACE_READY",
        "workspace": binding["workspace"], "bindingSha256": binding["sha256"],
        "sourceRoot": binding["sourceRoot"], "python": binding["python"],
        "pid": os.getpid(), "console": server.url,
    }
    if connection_file is not None:
        value["connectionFile"] = connection_file
    return value
