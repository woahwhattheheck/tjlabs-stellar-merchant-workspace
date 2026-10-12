#!/usr/bin/env python3
"""Run and retain the complete original MHKiT scientific customer programme. MIT."""
from __future__ import annotations
import argparse, csv, hashlib, json, os, pathlib, shutil, subprocess, sys, zipfile
import numpy as np
from netCDF4 import Dataset

ORIGINAL_SHA = "29caba56ca1d95c150ce09f770fe24a378a8f56568a971dd2dfde1bd95abcf1f"
ORIGINAL_BYTES = 221593
REFERENCE = "https://github.com/MHKiT-Software/MHKiT-Python/blob/6bad8fe4f2bd8a9bff66fb9607ed0900f09d0258/examples/data/dolfyn/test_data/Sig1000_tidal.nc"
OPERATION = "NETCDF-MHKIT-CUSTOMER-609F-20261012"

def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b""): h.update(data)
    return h.hexdigest()

def validate_original_results(source, result_directory, expected_shape, expected_indices, expected_cells):
    with Dataset(source, "r") as original, Dataset(result_directory / "selection.nc", "r") as received:
        original.set_auto_maskandscale(False); received.set_auto_maskandscale(False)
        expected = original["/vel"][tuple(slice(*value) for value in expected_indices)]
        actual = received["/vel"][:]
        assert actual.shape == expected_shape and expected.shape == expected_shape
        np.testing.assert_array_equal(actual, expected)
        assert actual.dtype == expected.dtype
        for name in ["dir", "range", "time"]:
            variable = original[name]; assert set(received[name].ncattrs()) == set(variable.ncattrs())
            for attribute in variable.ncattrs(): np.testing.assert_array_equal(received[name].getncattr(attribute), variable.getncattr(attribute))
        rows = [json.loads(line) for line in (result_directory / "values.jsonl").read_text().splitlines()]
        assert len(rows) == expected_cells
        with open(result_directory / "values.csv", newline="") as stream: csv_rows = list(csv.DictReader(stream))
        assert len(csv_rows) == expected_cells
        primary = [row for row in rows if row["variable"] == "/vel"]
        assert len(primary) == int(np.prod(expected_shape))
        for row in primary:
            scalar = original["/vel"][tuple(row["index"])].item()
            encoded = row["raw"]
            if isinstance(encoded, dict) and encoded.get("kind") == "float":
                assert np.isnan(scalar) if encoded["value"] == "NaN" else np.isinf(scalar)
            else: assert encoded == scalar
        return {"shape": list(actual.shape), "dtype": str(actual.dtype), "complete_values": len(rows), "native_values_compared": len(primary)}

def main():
    parser = argparse.ArgumentParser(description="Operate the original published MHKiT ADCP source through complete native scientific receiving")
    parser.add_argument("--input", required=True); parser.add_argument("--directory", required=True)
    parser.add_argument("--workspace"); parser.add_argument("--node", default=shutil.which("node") or "node")
    args = parser.parse_args(); root = pathlib.Path(__file__).resolve().parent
    source = pathlib.Path(args.input).resolve(); directory = pathlib.Path(args.directory).resolve()
    assert source.is_file() and source.stat().st_size == ORIGINAL_BYTES and digest(source) == ORIGINAL_SHA
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    workspace = pathlib.Path(args.workspace).resolve() if args.workspace else directory / "project"
    if not (workspace / "workspace.json").is_file():
        subprocess.run([sys.executable, "-B", str(root / "cli.py"), "--workspace", str(workspace), "create", "--title", "Original MHKiT ADCP scientific customer programme"], check=True, stdout=subprocess.DEVNULL)
    value = {"operation_id": OPERATION, "directory": str(directory), "workspace": str(workspace), "python": sys.executable,
             "source": str(root), "input_file": str(source), "input_sha256": ORIGINAL_SHA, "reference": REFERENCE}
    input_path = directory / "operating-input.json"
    if input_path.exists(): assert json.loads(input_path.read_text()) == value, "Retain the same original operating input"
    else:
        with open(input_path, "x") as stream: os.chmod(input_path, 0o600); json.dump(value, stream, indent=2)
    with open(directory / "native-programme.log", "a", encoding="utf-8") as log:
        child = subprocess.Popen([args.node, str(root / "RECEIVING.mjs"), str(input_path)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in child.stdout: log.write(line); log.flush(); print(line, end="", flush=True)
        status = child.wait()
    if status: raise RuntimeError("The retained original Node programme returned " + str(status) + "; continue its same operating directory")
    result = json.loads((directory / "customer-result.json").read_text()); assert result["state"] == "complete"
    native = validate_original_results(source, directory / "native-result", (4, 28, 10), [(0, 4, 1), (0, 28, 1), (5, 25, 2)], 1162)
    customer = validate_original_results(source, directory / "customer-result", (2, 4, 4), [(0, 2, 1), (2, 14, 3), (0, 8, 2)], 42)
    archives = []
    for name in ["NetCDF_Original_Project.zip", "NetCDF_Customer_Edited_Project.zip"]:
        path = directory / name
        with zipfile.ZipFile(path) as archive:
            manifest = json.loads(archive.read("transfer.json")); assert manifest["project_id"] == result["binding"]["project_id"]
            assert set(archive.namelist()) == {item["path"] for item in manifest["members"]} | {"transfer.json"}
            for item in manifest["members"]:
                data = archive.read(item["path"]); assert len(data) == item["bytes"] and hashlib.sha256(data).hexdigest() == item["sha256"]
            assert "application/cli.py" in archive.namelist() and "application/requirements.txt" in archive.namelist()
            archives.append({"name": name, "sha256": digest(path), "bytes": path.stat().st_size, "members": len(archive.namelist())})
    complete = {"schema": "stellar-forge.netcdf-native-receiving.v1", "operation_id": OPERATION, "state": "complete",
                "source": {"reference": REFERENCE, "sha256": ORIGINAL_SHA, "bytes": ORIGINAL_BYTES}, "summary": result["summary"],
                "native_verification": native, "customer_verification": customer, "archives": archives,
                "original_workspace": str(workspace), "receiving_directory": str(directory),
                "runtime": {"python": sys.executable, "numpy": np.__version__, "node": subprocess.check_output([args.node, "--version"], text=True).strip()}}
    output = directory / "complete-result.json"
    output.write_text(json.dumps(complete, indent=2)); os.chmod(output, 0o600)
    print(json.dumps({"state": "complete", "result": str(output), "summary": complete["summary"]}), flush=True)
    return 0

if __name__ == "__main__": sys.exit(main())
