# NetCDF scientific data operations

Retain an original scientific file, inspect its native variables and coordinate
metadata, save an explicit multidimensional selection, review complete native
results, and hand the entire editable workspace to another operator.

The browser, command line, retained-process Node client and Merchant tools use
one saved workspace. The product complements the original HDF5 array application
with NetCDF dimensions, coordinate-variable relationships, declared CF units and
calendars, native packing/masks, and portable selected NetCDF output.

## Install and open

Python 3.11+ and Node 22+ are the selected baseline. The native Python dependency
selection is `netCDF4 1.7.4`, `numpy 2.3.5` and `cftime 1.6.6`. Install them in a
private environment and keep that Python executable with the application:

```sh
python3 -m venv /absolute/private/netcdf-runtime
/absolute/private/netcdf-runtime/bin/python -m pip install -r requirements.txt
/absolute/private/netcdf-runtime/bin/python cli.py --workspace /absolute/private/study create --title 'Scientific source review'
/absolute/private/netcdf-runtime/bin/python cli.py --workspace /absolute/private/study serve --port 0 --receive-root /absolute/private/received
```

Open the actual loopback URL printed by the original server. Read the printed
private `tokenFile` locally and enter its key in the connection form. The URL
contains no credential. After connection, the browser keeps an HTTP-only session
for that original application. Keep both the source workspace and project
transfers private when the files belong to a customer.

In an installed merchant, use `starforge netcdf` with the same original workspace
and selected Python. **Applications → NetCDF scientific data** selects an
initialized or received project through the existing lifecycle.

## Receive the original source

Choose a complete NetCDF file in **Sources**, add its original publisher
reference and import. Its unchanged bytes are retained under SHA-256. A repeated
intended request uses the same request ID and original input; a new intended
source import has a new identity. Files are opened by the selected native NetCDF
library rather than an invented format parser.

```sh
/absolute/private/netcdf-runtime/bin/python cli.py --workspace /absolute/private/study invoke import --json '{"path":"/absolute/original/measurement.nc","reference":"https://original-publisher.example/measurement","request_id":"measurement-intake"}'
```

Each source catalog includes every original group, dimension and variable,
dimension scope and unlimited status, native type, shape and all original
attributes. CF context retains the declared coordinates, grid mapping, bounds,
ancillary variables, formula terms, units, calendar, standard name, axis and cell
metadata. The original source remains downloadable in full.

## Select and operate

1. Open a source and search its complete variable inventory. Open a variable to
   inspect its original shape, dimensions, metadata and paged native values.
2. Choose half-open index slices for each original dimension. For example,
   `start=5, stop=25, step=2` selects original indexes 5, 7, …, 23. Omitted
   dimensions retain their entire original length. Indexes are never rewritten
   as measured coordinates or a new observation time.
3. Add one or more variables to a named selection. Variables sharing one native
   dimension use the same index slice. Separate intended windows belong in
   separate saved selections. Accompanying original coordinate and referenced
   variables are included by default; their source scope and metadata remain.
4. Run the saved selection. The whole population streams into immutable result
   files. Large array export reads native blocks instead of loading one complete
   selected cube into application memory.
5. Inspect the complete result, download the original-format subset and reports,
   then save an explicit review decision and reason. New reviews preserve the
   previous decisions. A supplied expected revision rejects a stale write.

The five complete result files are:

| File | Meaning |
| --- | --- |
| `selection.nc` | Native NetCDF subset, original types, group/dimension scopes, values and metadata |
| `values.jsonl` | Every selected and accompanying value with its original multidimensional index and exact typed raw value |
| `values.csv` | Full indexed population with raw, optional decoded and calendar-context cells |
| `manifest.json` | Complete source identity, selection, original catalog and result-file identities |
| `report.html` | Printable whole-selection report with every selected variable and complete original context |

Raw values are authoritative in each result. Wide integers retain decimal text
in explicitly tagged JSON, bytes retain base64, compound fields retain their
native structure, and variable-length arrays retain all their elements. Non-finite
floating values have explicit tags. The native NetCDF output retains these as
their original native types. Enum declarations, packing attributes and fill
values accompany the original data.

**Decode CF values** adds the selected library's mask/scale interpretation beside
each raw value. It does not alter the native output. Supported time units and
calendars add explicit calendar context. A calendar or unit unsupported by this
selected runtime retains its original numeric value and reports that status;
it is not silently converted to Gregorian time. The source's declared
`Conventions` attribute remains its original statement rather than a new
conformance certification.

Formula-leading display strings in CSV are neutralized for spreadsheet opening;
the exact strings remain in original NetCDF and typed JSONL. Preview pages are
explicit views of the complete selection, and exported populations are complete.

## Complete customer handover

**Handover → Export project** produces a complete private ZIP: all original
source bytes, catalogs, selections, results, reviews and operation requests,
plus the whole editable application source and requirements. Browser keys,
native host caches and transient working files are excluded.

```sh
/absolute/private/netcdf-runtime/bin/python cli.py --workspace /absolute/private/study invoke export --json '{"output":"/absolute/private/NetCDF_Complete_Workspace.zip"}'
/absolute/private/netcdf-runtime/bin/python cli.py --workspace /absolute/private/received-study receive /absolute/private/NetCDF_Complete_Workspace.zip --expected-sha THE_RETURNED_SHA256
/absolute/private/netcdf-runtime/bin/python /absolute/private/received-study/application/cli.py --workspace /absolute/private/received-study serve --port 0
```

The receiver checks the complete archive and every member before publishing the
destination. Receiving resumes verified staging members after interruption,
requires a new destination, and recognizes a repeated completed receive under
the original full digest. The receiving directory preserves the original
project identity, and its reviews and selections are independently editable.
The browser's **Receive project** uses the selected receiving parent and returns
the actual directory and opening command.

## Typed client and agent operation

`client.mjs` and `client.d.mts` expose the same native methods through one retained
Python process. Read `API.md` for complete operation inputs and response types.
Read object pages through EOF and verify the full SHA-256 after reconstruction.
Private Merchant connection inputs bind original host files to aliases and exact
digests. The provider selects aliases, not arbitrary agent-supplied filesystem
paths. Its writes retain the original request and revision identities.

## Original scientific receiving example

The native customer programme uses the first-party MHKiT Nortek Signature1000
tidal ADCP example, originally published at
`MHKiT-Software/MHKiT-Python` commit
`6bad8fe4f2bd8a9bff66fb9607ed0900f09d0258`, member
`examples/data/dolfyn/test_data/Sig1000_tidal.nc`. Its complete 221,593 bytes have
SHA-256 `29caba56ca1d95c150ce09f770fe24a378a8f56568a971dd2dfde1bd95abcf1f`.
The publisher's original example and BSD-3-Clause rights remain attached to that
source operation. This data is an original published measurement example, not
new measurements produced by the workspace.

The complete programme imports its 50 variables, selects original velocity
indexes and coordinates, produces native and full indexed reports, repeats an
original completed request, exports the whole project, receives it into another
directory and edits the received review independently. A separate native API
type exercise covers wide integers, native fill/packing, compound, enum,
variable-length arrays and inherited dimensions; those API fixtures are labeled
as native format exercises.

Primary format references: [netCDF4 Python API](https://unidata.github.io/netcdf4-python/),
[CF conventions](https://cfconventions.org/), and the
[original MHKiT ADCP example](https://mhkit-software.github.io/MHKiT/adcp_example.html).
