#!/usr/bin/env python3
"""Continue the original SF88 BLS session and its complete source receiver."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import stat
import sys

HERE = Path(__file__).resolve().parent
CONSUMER = HERE.parent / "consumer"
sys.path.insert(0, str(CONSUMER))
from bls_delivery import BlsDeliveryError, receive_acquisition
from vitality_import import load_original_vitality, reopen_received


def connection_file(path):
    source = Path(path).resolve(strict=True)
    info = source.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > 262144:
        raise BlsDeliveryError("BLS_NATIVE_PRIVATE_CONNECTION_REQUIRED")
    with source.open("r", encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict) or not isinstance(value.get("customer"), dict):
        raise BlsDeliveryError("BLS_NATIVE_CUSTOMER_REQUIRED")
    return value["customer"]


def original_acquisition(selected):
    checkout = Path(selected["checkout"]).resolve(strict=True)
    python = checkout / "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python"
    if not python.is_dir():
        raise BlsDeliveryError("ORIGINAL_SF88_CHECKOUT_REQUIRED")
    sys.path.insert(0, str(python))
    from stellar_forge_buyer import datasets
    if Path(datasets.__file__).resolve() != python / "stellar_forge_buyer/datasets.py":
        raise BlsDeliveryError("ORIGINAL_SF88_CHECKOUT_REQUIRED")
    return datasets.DatasetAcquisition(checkout=checkout, session=selected["session"],
        node=selected.get("node"), timeout=selected.get("timeout", 360))


def continue_customer(selected, capture_id, mode):
    acquisition = original_acquisition(selected)
    continued = None
    if selected.get("continue_acquisition") is True:
        continued = acquisition.run()
    received = receive_acquisition(acquisition, selected["delivery"], selected["sources"],
                                   expected_capture_id=capture_id)
    result = {"schema": "stellar-forge.bls-native-customer.v1",
              "received": received.summary()}
    if continued is not None:
        result["acquisition"] = continued
    if mode == "vitality":
        value = selected.get("vitality")
        if not isinstance(value, dict):
            raise BlsDeliveryError("BLS_NATIVE_VITALITY_REQUIRED")
        original = load_original_vitality(value["source"])
        result["vitality"] = reopen_received(received, original, value["workspace"],
            value["operator"], catalog=value.get("catalog"), only=value.get("only"))
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--connection", required=True)
    parser.add_argument("--capture-id", required=True)
    parser.add_argument("--mode", choices=("sources", "vitality"), required=True)
    args = parser.parse_args(argv)
    try:
        result = continue_customer(connection_file(args.connection), args.capture_id, args.mode)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
        return 0
    except Exception as error:
        print(json.dumps({"error": getattr(error, "code", type(error).__name__),
                          "message": str(error), "details": getattr(error, "details", None)},
                         ensure_ascii=False, default=str), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
