"""Generate Zarr V3 test data using zarr-python 3.x.

This script creates a V3 store with arrays covering various data types,
compression codecs, chunk layouts, and fill values. The output is used by
pizzarr's V3 interop vignette to demonstrate cross-implementation reading.

Requires: zarr >= 3.0, numpy
"""

import shutil
import numpy as np
import zarr
from zarr.codecs import GzipCodec, ZstdCodec, BloscCodec

out = "zarr_python_v3.zarr"
shutil.rmtree(out, ignore_errors=True)

root = zarr.open_group(out, mode="w", zarr_format=3)

# --- Scalar data types with different compressors ---
root.create_array(
    "int32_1d", shape=(6,), chunks=(3,), dtype="int32",
    compressors=(GzipCodec(),), filters=None,
)
root["int32_1d"][:] = [10, 20, 30, 40, 50, 60]

root.create_array(
    "float64_1d", shape=(5,), chunks=(5,), dtype="float64",
    compressors=(ZstdCodec(),), filters=None,
)
root["float64_1d"][:] = [1.1, 2.2, 3.3, 4.4, 5.5]

root.create_array(
    "bool_1d", shape=(4,), chunks=(4,), dtype="bool",
    compressors=None, filters=None,
)
root["bool_1d"][:] = [True, False, True, False]

root.create_array(
    "uint8_1d", shape=(4,), chunks=(2,), dtype="uint8",
    compressors=None, filters=None,
)
root["uint8_1d"][:] = [0, 127, 128, 255]

root.create_array(
    "float32_1d", shape=(4,), chunks=(4,), dtype="float32",
    compressors=(BloscCodec(cname="lz4"),), filters=None,
)
root["float32_1d"][:] = [-1.5, 0.0, 1.5, 3.14]

# --- Multi-dimensional ---
root.create_array(
    "int16_2d", shape=(4, 3), chunks=(2, 3), dtype="int16",
    compressors=(GzipCodec(),), filters=None,
)
root["int16_2d"][:] = np.arange(12, dtype="int16").reshape(4, 3)

root.create_array(
    "float64_3d", shape=(2, 3, 4), chunks=(2, 3, 4), dtype="float64",
    compressors=(ZstdCodec(),), filters=None,
)
root["float64_3d"][:] = np.arange(24, dtype="float64").reshape(2, 3, 4)

# --- Fill value demonstration ---
root.create_array(
    "with_fill", shape=(6,), chunks=(3,), dtype="float64",
    fill_value=-9999.0,
    compressors=None, filters=None,
)
root["with_fill"][0:3] = [1.0, 2.0, 3.0]
# indices 3-5 left as fill value

# --- Chunked with ragged edges ---
root.create_array(
    "ragged_2d", shape=(5, 7), chunks=(3, 4), dtype="int32",
    compressors=(GzipCodec(),), filters=None,
)
root["ragged_2d"][:] = np.arange(35, dtype="int32").reshape(5, 7)

# --- Group with attributes ---
sub = root.create_group("var_group", attributes={
    "description": "Group with multiple variables",
    "source": "zarr-python 3.x test generation",
})

sub.create_array(
    "temperature", shape=(3, 4), chunks=(3, 4), dtype="float32",
    attributes={"units": "K", "long_name": "Temperature"},
    compressors=(ZstdCodec(),), filters=None,
)
sub["temperature"][:] = np.array([
    [280.1, 281.2, 282.3, 283.4],
    [284.5, 285.6, 286.7, 287.8],
    [288.9, 290.0, 291.1, 292.2],
], dtype="float32")

sub.create_array(
    "pressure", shape=(3, 4), chunks=(3, 4), dtype="float64",
    attributes={"units": "Pa", "long_name": "Pressure"},
    compressors=(GzipCodec(),), filters=None,
)
sub["pressure"][:] = [
    [101325.0, 101320.0, 101315.0, 101310.0],
    [101305.0, 101300.0, 101295.0, 101290.0],
    [101285.0, 101280.0, 101275.0, 101270.0],
]

# --- Root-level attributes ---
root.attrs["generator"] = "zarr-python"
root.attrs["zarr_python_version"] = zarr.__version__
root.attrs["description"] = "V3 test data for pizzarr interop testing"

print(f"Created {out} with zarr-python {zarr.__version__}")
print(f"Arrays: {list(root.keys())}")
print(f"Sub-group 'var_group' arrays: {list(sub.keys())}")
