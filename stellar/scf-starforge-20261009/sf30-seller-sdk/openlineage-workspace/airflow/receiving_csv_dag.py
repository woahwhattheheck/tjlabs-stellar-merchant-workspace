"""Original CSV settlement DAG used by the Airflow commissioning receiver.

The installed Apache provider extracts these operators' native metadata and
emits its own DAG/task events. Both operations perform actual file processing.
"""
from __future__ import annotations

import csv
import datetime as dt
from decimal import Decimal
import hashlib
import io
import json
import os
from pathlib import Path
import re
import socket
import tempfile

try:
    from airflow.sdk import DAG
except ImportError:
    from airflow import DAG
from airflow.providers.common.compat.sdk import BaseOperator

DAG_ID = "commons_csv_settlement"
OPERATION_ROOT = Path(os.environ["COMMONS_AIRFLOW_RECEIVING_ROOT"]).resolve(strict=True)
WORKING = OPERATION_ROOT / "working"


def native_json(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def replace_output(path, value):
    """Publish a complete output of this actual task."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix="." + target.name + "-", dir=target.parent)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(native_json(value))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
        parent = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class CsvSettlementOperator(BaseOperator):
    """Normalize source invoices or aggregate their exact integer-cent values."""

    def __init__(self, *, input_path, output_path, operation, **kwargs):
        super().__init__(**kwargs)
        self.input_path = str(input_path)
        self.output_path = str(output_path)
        self.operation = operation

    def execute(self, context):
        raw = Path(self.input_path).read_bytes()
        edition = context["dag_run"].conf["edition"]
        if self.operation == "normalize":
            reader = csv.DictReader(io.StringIO(raw.decode("utf-8", "strict"), newline=""))
            if reader.fieldnames != ["invoice_id", "customer", "currency", "amount"]:
                raise ValueError("Original invoice CSV fields differ")
            documents, identifiers = [], set()
            for row in reader:
                if set(row) != set(reader.fieldnames) or any(value is None for value in row.values()):
                    raise ValueError("Incomplete invoice CSV row")
                invoice_id = row["invoice_id"].strip()
                customer, currency = row["customer"].strip(), row["currency"].strip()
                if not invoice_id or invoice_id in identifiers or not customer:
                    raise ValueError("Each invoice requires its unique original ID and customer")
                if not re.fullmatch(r"[A-Z]{3}", currency):
                    raise ValueError("Each invoice requires its original three-letter currency")
                if not re.fullmatch(r"-?\d+\.\d{2}", row["amount"]):
                    raise ValueError("Each amount requires an exact two-decimal source value")
                identifiers.add(invoice_id)
                documents.append({"invoiceId": invoice_id, "customer": customer,
                                  "currency": currency, "amountCents": int(Decimal(row["amount"]) * 100)})
            if not documents:
                raise ValueError("Original invoice rows are required")
            output = {"schema": "commons.airflow.csv-normalized.v1", "edition": edition,
                      "sourceSha256": hashlib.sha256(raw).hexdigest(), "sourceBytes": len(raw),
                      "documents": documents}
        elif self.operation == "aggregate":
            source = json.loads(raw)
            if source.get("schema") != "commons.airflow.csv-normalized.v1" or source.get("edition") != edition:
                raise ValueError("Aggregate the original normalized edition")
            groups, totals = {}, {}
            for document in source["documents"]:
                cents = document["amountCents"]
                if isinstance(cents, bool) or not isinstance(cents, int):
                    raise ValueError("Normalized amounts must retain exact integer cents")
                key = document["customer"], document["currency"]
                entry = groups.setdefault(key, {"customer": key[0], "currency": key[1],
                                                "documentCount": 0, "amountCents": 0})
                entry["documentCount"] += 1
                entry["amountCents"] += cents
                totals[key[1]] = totals.get(key[1], 0) + cents
            output = {"schema": "commons.airflow.csv-settlement.v1", "edition": edition,
                      "sourceSha256": hashlib.sha256(raw).hexdigest(), "sourceBytes": len(raw),
                      "documentCount": len(source["documents"]), "customerCount": len(groups),
                      "totalsByCurrency": totals,
                      "customers": [groups[key] for key in sorted(groups)]}
        else:
            raise ValueError("Unknown original CSV processing operation")
        replace_output(self.output_path, output)
        self.log.info("Processed original %s edition into %s", edition, self.output_path)
        return {"edition": edition, "output": self.output_path,
                "outputSha256": hashlib.sha256(Path(self.output_path).read_bytes()).hexdigest()}

    def get_openlineage_facets_on_start(self):
        # Metadata objects only: the installed provider owns all event emission.
        from openlineage.client.event_v2 import Dataset
        from airflow.providers.openlineage.extractors import OperatorLineage
        namespace = "file://" + socket.gethostname()
        return OperatorLineage(
            inputs=[Dataset(namespace=namespace, name=self.input_path)],
            outputs=[Dataset(namespace=namespace, name=self.output_path)],
        )

    def get_openlineage_facets_on_complete(self, task_instance):
        return self.get_openlineage_facets_on_start()

    def get_openlineage_facets_on_failure(self, task_instance):
        return self.get_openlineage_facets_on_start()


with DAG(
    dag_id=DAG_ID,
    schedule=None,
    start_date=dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc),
    catchup=False,
    max_active_runs=1,
    default_args={"retries": 0},
    tags=["commissioning", "openlineage"],
) as dag:
    normalize_invoices = CsvSettlementOperator(
        task_id="normalize_invoices", operation="normalize",
        input_path=WORKING / "invoices.csv", output_path=WORKING / "normalized.json",
    )
    settle_customers = CsvSettlementOperator(
        task_id="settle_customers", operation="aggregate",
        input_path=WORKING / "normalized.json", output_path=WORKING / "settlements.json",
    )
    normalize_invoices >> settle_customers
