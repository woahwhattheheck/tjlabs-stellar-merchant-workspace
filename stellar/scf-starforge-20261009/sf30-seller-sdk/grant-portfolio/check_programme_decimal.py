#!/usr/bin/env python3
"""Check the exact programme arithmetic using the selected complete source."""
from __future__ import annotations

import argparse
import copy
from decimal import Decimal, DecimalException, ROUND_FLOOR, localcontext
import hashlib
import itertools
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source_directory", type=Path)
args = parser.parse_args()
source = args.source_directory.resolve()
sys.path.insert(0, str(source))
import programme
from domain import InputError

checks = []
with localcontext() as hostile:
    # Arithmetic must remain correct and leave this unrelated context intact.
    hostile.prec = 2
    hostile.Emin = -2
    hostile.Emax = 2
    hostile.rounding = ROUND_FLOOR
    hostile.clamp = 1
    before_context = str(hostile)

    original = ["1E+600", "1", "-1E+600"]
    for value in original:
        assert programme.normalize(value, "decimal", "Observed result") == value
    assert programme.normalize("1E+2", "percent", "Progress") == "1E+2"
    checks.append("original scientific-notation strings retained")

    for values in itertools.permutations(original):
        assert Decimal(programme.programme_exact_sum(values)) == Decimal(1)
    checks.append("six cancellation orders retain exactly one")

    expanded = programme.programme_exact_sum(["1E+600", "1"])
    assert len(expanded) > 128
    assert programme.programme_exact_variance(expanded, "1E+600") == "1"
    checks.append("variance retains low digit in a generated 601-digit actual")

    digits = "9" * 128
    assert programme.programme_exact_sum([digits] * 1000) == str(int(digits) * 1000)
    assert programme.programme_exact_sum(["1E+600", "1E+600"]) == "2E+600"
    assert programme.programme_exact_sum(["0.000", "0E+600"]) == "0.000"
    checks.append("sum carry, scientific quantum and zero significance retained")

    def metadata(number):
        return {"id": "00000000-0000-4000-8000-" + str(number).zfill(12),
                "revision": 1, "sha256": format(number, "064x"), "archived": False}

    indicator = {**metadata(1), "nodeId": metadata(2)["id"], "grantId": None,
                 "title": "Original exact result", "unit": "units", "resultLevel": "output",
                 "aggregation": "sum", "direction": "increase", "baseline": [],
                 "targets": [{"date": "2026-01-03", "value": "1",
                              "dimensions": {}, "documentIds": []}]}
    observations = [
        {**metadata(10 + index), "indicatorId": indicator["id"], "value": value,
         "periodStart": "2026-01-0" + str(index + 1),
         "periodEnd": "2026-01-0" + str(index + 1),
         "dimensions": {}, "status": "reported"}
        for index, value in enumerate(original)
    ]
    model = {"settings": {"asOf": "2026-01-03"},
             "records": {name: [] for name in programme.COLLECTIONS}}
    model["records"]["indicators"] = [indicator]
    model["records"]["observations"] = observations
    original_model = copy.deepcopy(model)
    result = programme.indicator_results(model)
    assert len(result) == 1 and result[0]["actual"] == "1" and result[0]["variance"] == "0"
    assert result[0]["observationIds"] == [row["id"] for row in observations]
    assert model == original_model
    checks.append("actual dated indicator projection keeps all original contributing records")

    def rejected(call):
        try:
            call()
        except InputError as error:
            assert error.code == "PROGRAMME_DECIMAL_RANGE"
            return
        raise AssertionError("Unsupported exact arithmetic was accepted")

    rejected(lambda: programme.normalize("1E+1000000", "decimal", "Observed result"))
    rejected(lambda: programme.programme_exact_sum(["1E+8192", "1"]))
    unsupported = copy.deepcopy(model)
    unsupported["records"]["observations"][0]["value"] = "1E+8192"
    rejected(lambda: programme.indicator_results(unsupported))
    checks.append("unsupported exponent and complete projection span fail as original InputError")

    with localcontext() as guard:
        programme.programme_decimal_context(guard, 1)
        try:
            guard.add(Decimal("1"), Decimal("0.01"))
        except DecimalException:
            pass
        else:
            raise AssertionError("The exact context silently rounded a low-order digit")
    assert str(hostile) == before_context
    checks.append("native decimal trap is active and caller context is unchanged")

module_bytes = Path(programme.__file__).read_bytes()
print(json.dumps({
    "schema": "stellar-forge.programme-exact-decimal-receiving.v1",
    "state": "COMPLETE",
    "source": str(Path(programme.__file__).resolve()),
    "sourceSha256": hashlib.sha256(module_bytes).hexdigest(),
    "checks": checks,
    "cancellation": {"original": original, "actual": result[0]["actual"],
                     "variance": result[0]["variance"],
                     "observationRefs": result[0]["observationRefs"]},
    "writes": 0
}, sort_keys=True))
