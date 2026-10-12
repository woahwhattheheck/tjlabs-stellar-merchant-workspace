# SQL Server installed product receiving

This directory carries the complete original package and installed-operator receiving operation behind the SQL Server product. It operates the maintained SF46 installer, runtime owner, Applications controller, merchant provider, HTTP MCP host, source export and customer receiver.

## Completed source edition

The operation completed on Node 24.19.0 with source commit `daee88e58491a3f123af80175a9b26f1b1da3b41` and the original `mssql` selection. Its recipe is Git blob `13320b2b3c7e88f6374d660c9a8eca2e4d1239a0`, SHA-256 `58bbf0125c6bda51ad8c1b727bb02d5fa8e0f851e9ad45da5f45dbe8f4f6ae20`.

The selected archive contains 792 source files / 9,868,527 source bytes, plus the original package metadata. Its native archive size was 2,653,401 bytes and SHA-256 was `869843956b56932d5300bb61e34039a21b8425dbefefc0ca665425590f0d78fb`. The complete original output, selected dependency declarations, source receipts and result identities are retained in [NATIVE_RESULT.json](NATIVE_RESULT.json).

The completed operation:

- Built and unpacked the selected original source, then inspected and installed it through SF46.
- Resolved the complete native, MCP and SQL Server dependency profile; prepared the existing zero-dependency controller runtime offline.
- Saved, reviewed and started the original SQL Server Application, served its original browser assets, stopped it, and reopened the same workspace through a second application run.
- Loaded the source-owned provider and all 21 SQL Server tools through the actual HTTP MCP host.
- Interrupted the original private publication immediately after its committed hardlink, then reopened the same identity and export result while preserving unrelated uncommitted staging.
- Prepared the original catalog example, exported eleven merchant files and six customer files, resumed the original download from byte 391, and replayed the completed transfer.
- Removed the original sender and incoming source, loaded the generated customer client, and reopened the received release with its original manifest and metadata.

The first source edition at `8d9488f7` exposed four absent original modules during the real selected build. Those modules were already restored by their original authors in the maintained repository. This operation consumed that cumulative source at `daee88e5`; all four receiving scripts below stayed unchanged.

## Run on the selected package

Use the existing Linux host with Node 22.16 or newer, Python 3.11 or newer, Git and util-linux flock. Keep source, archive and all work directories private to the operator. A complete source checkout can build the selected package with the original distribution command:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --ref daee88e58491a3f123af80175a9b26f1b1da3b41 \
  --selection mssql --out /private/mssql-build
~~~

Retain the returned archive and SHA-256, then unpack with the original receiver:

~~~sh
python3 stellar/scf-starforge-20261009/distribution/runtime-unpack.py \
  --archive /private/mssql-build/ACTUAL_ARCHIVE.tgz \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --out /private/mssql-package
~~~

Choose a new private work directory. Temporary native release preparation must use that same writable filesystem:

~~~sh
umask 077
mkdir -m 700 -p /private/mssql-receiving/tmp
export TMPDIR=/private/mssql-receiving/tmp
export TMP=/private/mssql-receiving/tmp
export TEMP=/private/mssql-receiving/tmp

node operations/mssql-canonical-selected-receiving-8e0c-20261012/installed.mjs \
  /private/mssql-package \
  /private/mssql-receiving/work \
  /private/mssql-build/ACTUAL_ARCHIVE.tgz \
  ACTUAL_ARCHIVE_SHA256 \
  daee88e58491a3f123af80175a9b26f1b1da3b41 \
  /absolute/merchant-workspace-checkout/operations/mssql-canonical-selected-receiving-8e0c-20261012/package.mjs \
  /absolute/merchant-workspace-checkout/operations/mssql-canonical-selected-receiving-8e0c-20261012/crash.mjs
~~~

The command retains the complete working installation and receiving directories, prints phase records and the full `MSSQL_SELECTED_RECEIVING` result, and closes the original managed application and MCP session. Run `crash.mjs` only through this operation: it deliberately terminates its own original publication worker at the retained commit boundary. The original database, approved query and native seller receiving operation is documented separately in [the product operating guide](../../products/mssql/OPERATING.md).

## Existing streamed Git source route

The executed source carrier used the original Git-object receiver and complete recursive Git authority. An equipped agent can receive that same source through canonical repository blobs:

| Original input | Git blob |
| --- | --- |
| Whole source/receiving caller | `7591e5c597e0cc76dafe2f8960fad02ebcc4ebc6` |
| Python source receiver and operation owner | `2fd20c34f6087ada0a6150fa9e636dfb8e72708f` |
| Initial complete source frame | `06d0d371bfc2efce887eaba48b1621416b7db375` |

The 4,827,776-byte source frame has SHA-256 `5344c3fdffa5225608e0a8bbb7ed9b491e090ef36048506658a94f5ac924fbfa`. The original builder requested its remaining exact Git objects, bringing the verified source intake to 1,097 files / 11,292,265 bytes. It then ran these same build, installed, package and interrupted-publication programmes against the selected package. Keep the returned process identity until its result is reconciled.

The source and receiving entry points remain owned by the original SQL Server, SF46, Applications and merchant components. Continue native database selection and customer use from that retained product.
