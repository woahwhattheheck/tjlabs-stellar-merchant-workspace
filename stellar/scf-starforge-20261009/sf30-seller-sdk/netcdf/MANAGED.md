# NetCDF client and installed operation

Use the saved scientific workspace from the native CLI, a Node application, the Merchant tools or Applications. All interfaces retain the original project, complete source bytes, explicit selections, immutable result files and review history.

## Select the native runtime

The delivered `requirements.txt` pins the native Python dependencies. Install it into the institution's selected Python environment and retain that environment with the installation. Select that existing executable with `STARFORGE_PYTHON` or the installed command's `--python` option:

```sh
python3 -m venv /srv/netcdf-runtime
/srv/netcdf-runtime/bin/python -m pip install -r /srv/netcdf/application/requirements.txt
starforge netcdf --python /srv/netcdf-runtime/bin/python \
  --workspace /srv/private/scientific-project create --title "Scientific data operations"
starforge netcdf --python /srv/netcdf-runtime/bin/python \
  --workspace /srv/private/scientific-project serve --port 0 \
  --receive-root /srv/private/received-scientific-projects
```

The native listener prints the original workspace binding, its local address and the private browser-key filename. Open the local address, enter that key into the connection form, and keep the key in private institutional custody. The browser session uses an HTTP-only cookie; the address contains no key.

## Use the persistent Node client

The installed import is `@tokenjunkielabs/starforge-merchant/seller/netcdf`. The delivered project's own `client.mjs` and adjacent declarations expose the same interface when reopening a received project independently.

```js
import {NetCDFWorkspaceClient} from
  '@tokenjunkielabs/starforge-merchant/seller/netcdf';

const client = new NetCDFWorkspaceClient({
  directory: '/srv/private/scientific-project',
  python: '/srv/netcdf-runtime/bin/python',
});
try {
  const source = await client.importFile('/srv/private/inputs/original.nc', {
    name: 'original.nc',
    reference: 'Original institution file and source edition',
    expected_sha: '<complete original SHA-256>',
    request_id: 'institution-original-source-1',
  });
  for await (const variable of client.allVariables(source.id)) {
    console.log(variable.path, variable.dtype, variable.shape);
  }
  const state = await client.overview();
  const selection = await client.saveSelection({
    title: 'Reviewed original time selection',
    source_id: source.id,
    variables: [{path: '/velocity', slices: {time: {start: 5, stop: 25, step: 2}}}],
    include_coordinates: true,
    decode_cf: true,
    expected_revision: state.project.revision,
    request_id: 'institution-selection-1',
  });
  const result = await client.run(selection.id, {
    request_id: 'institution-result-1',
  });
  for (const file of result.files) {
    await client.copyObject(file.sha256, '/srv/private/delivery/' + file.name);
  }
} finally {
  await client.close();
}
```

Use the original variable and dimension names discovered from the complete file. Bounds are half-open and steps are positive. Omitted dimensions select their complete original lengths. The client uses one retained Python process for all requests; closing drains the original submitted operations. A source change or conflicting operation identity produces an explicit error.

Raw values remain native JSON, including explicit integer, non-finite float, bytes, missing-value and compound tags. Enumerated values keep their original numeric code and the variable descriptor's original enum dictionary. Variable-length arrays remain arrays. Selecting `decode_cf` adds decoded context beside the raw values. The client preserves these values without coercing tagged integers to JavaScript numbers.

`allVariables` and `previewRows` follow the explicit original pages through the whole selected population. `objectChunks` retains the SHA, exact offset, total and next offset for complete byte receiving. `copyObject` receives through EOF, checks the whole digest and creates the final destination only after the complete verification. An existing exact completed file reopens safely; differing bytes keep their existing destination.

## Export and independently edit a project

```js
const project = await client.exportProject();
await client.copyObject(project.sha256, '/srv/private/NetCDF_Complete_Project.zip');
const received = await client.receiveProject(
  '/srv/private/NetCDF_Complete_Project.zip',
  '/srv/private/independent-customer',
  project.sha256,
);
```

The native archive includes every original source, saved selection, result file, review and original request, plus the complete editable scientific application and its pinned requirements. Receiving verifies the complete archive and member inventory into a new directory. The received project keeps its original project ID and gets its own directory binding. Open its `application/cli.py` with `--workspace` pointing to that received directory. Save a new selection there to continue independently while retaining the earlier source and review history.

## Configure the Merchant tools

Keep the configuration file private, readable only by its operator. The source-owned configuration schema is `stellar-forge.netcdf-connections.v1`:

```json
{
  "schema": "stellar-forge.netcdf-connections.v1",
  "workspaces": {
    "adcp": {
      "label": "Institution scientific workspace",
      "directory": "/srv/private/scientific-project",
      "python": "/srv/netcdf-runtime/bin/python",
      "inputs": {
        "original": {
          "path": "/srv/private/inputs/original.nc",
          "sha256": "<complete original SHA-256>",
          "reference": "Original institution source and edition"
        }
      },
      "exportsDirectory": "/srv/private/scientific-delivery",
      "receiveRoot": "/srv/private/received-scientific-projects"
    }
  }
}
```

Bind this file as the original Merchant host's `netcdfWorkspaceConnection` input. Optional `project_id` and `sha256` fields pin the workspace's native binding. Paths can be relative to the configuration file. Input aliases bind complete original files and hashes; the tools select those aliases rather than arbitrary host paths.

The provider supplies ten tools: workspace discovery, native querying, complete source import, selection saving, native result materialization, review, complete report selection, original-project export, independent project receiving and full file reading. Source indexes and collection queries retain explicit pagination. Select `source` to read the complete original catalog or `variables` to continue its complete variable population.

The same export ID reopens its original verified completed archive. Its private receipt is retained before byte receiving, so the original export can continue after a lost reply without selecting a different project edition. Disconnecting the Merchant host drains the attached native clients; the saved project and source history remain available.

## Open through Applications

Choose **NetCDF scientific data**, select the existing private scientific workspace, its native Python executable and the receiving parent, then use the existing Review, Save and Start controls. The original application provider binds the project and directory before launch. Its startup reader verifies the actual local listener's public binding and instance identity. Open the resulting local address and connect with the existing private browser key.

Applications retains the original managed operation and source provider. The scientific listener uses its original serve command and normal stop lifecycle. After reopening the same saved project, source, selection, result and review identities remain available.

## Complete original receiving programme

The source's `RECEIVING.py` operates the published MHKiT Signature1000 ADCP example through the actual persistent Node client, complete native results, independent editable receiving, all ten Merchant tools and the Applications startup reader. Its source and reference are pinned in that programme. Run it on the selected Linux/Python/Node host with the complete original sample:

```sh
/srv/netcdf-runtime/bin/python application/RECEIVING.py \
  --input /srv/private/inputs/Sig1000_tidal.nc \
  --directory /srv/private/original-netcdf-customer-programme
```

Retain that same directory after interruption. Its original input, requests, results, full source and customer project archives remain joined. The final native validation compares every selected velocity value and native type against the complete original file, preserves coordinate metadata, checks every JSONL/CSV row, and verifies every member of both complete project archives.

The original operated edition has 50 source variables, 1,120 velocity values and 1,162 total values with coordinates. Its independent customer narrows the saved index selection to 42 total values, retains the original accepted edition, exports its complete editable project, and reopens that project independently.
