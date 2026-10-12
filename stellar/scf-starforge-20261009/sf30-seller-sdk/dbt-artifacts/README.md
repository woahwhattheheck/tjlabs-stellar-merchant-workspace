# dbt project operations

A private, portable project workspace for original dbt artifacts. It connects model and source definitions, catalog observations, run/freshness outcomes, lineage, edition comparisons, saved review and complete result files. The dependency-free Python engine is shared by the browser, native CLI and Node client. The optional PostgreSQL bridge continues the maintained Starforge publisher instead of introducing another query, payment or publication engine.

## Start with original files

Python 3.10+ on Linux is the supported native baseline. Node 22+ runs the installed command, typed client and Merchant Workspace provider. The core does not require dbt, a warehouse, a network connection or third-party Python packages. Keep the workspace and its transfers private: original artifacts may contain compiled SQL, relation names and customer metadata.

```sh
DBT=stellar/scf-starforge-20261009/sf30-seller-sdk/dbt-artifacts
python3 "$DBT/cli.py" --project /absolute/private/project create --title 'Warehouse review'
python3 "$DBT/cli.py" --project /absolute/private/project import \
  /absolute/dbt/target/manifest.json /absolute/dbt/target/catalog.json \
  /absolute/dbt/target/run_results.json
python3 "$DBT/cli.py" --project /absolute/private/project serve --port 0
```

The final command prints the actual loopback URL, project binding, server instance and private `tokenFile` path. Open the URL on that host, read the private key locally and enter it in the browser's connection form. The key is not put in a URL or printed by the server. The browser's HTTP-only session persists for that local session. An existing key can be selected with `--token-file`; POSIX group/world-readable key files are rejected.

In **Artifacts**, import complete files and explicitly select a manifest, optional catalog, and the run/freshness artifacts belonging in an edition. Preserve each dbt command's output before a subsequent command overwrites `target`. Distinct invocations remain visible; selecting them together does not rewrite their timestamps or imply one execution.

Supported projections are manifest v8–v12, catalog v1, run-results v5–v6, sources v3 and freshness v0. Other versions remain complete opaque originals for export rather than silently being interpreted as a known schema. Parsing is a schema-aware projection, not a substitute for validating an artifact against its complete upstream JSON Schema. The official schemas are at https://schemas.getdbt.com/ and artifact semantics at https://docs.getdbt.com/reference/artifacts/dbt-artifacts.

Resource keys preserve dbt `unique_id`. Original JSON numbers are retained losslessly in source text, including integers beyond JavaScript's safe range. Null graph maps and catalog records whose `unique_id` is null are handled without substituting invented identifiers. Freshness v0 source and model observations keep their original statuses. A model absent from selected run results has no selected outcome; it is not automatically successful.

## Work through an edition

The resource desk supports paged search, resource-kind filtering, raw and compiled SQL, macro source, catalog columns, all selected outcomes and result attachments. **Lineage** follows original dependency IDs in both directions. A missing referenced body remains identifiable.

Choose a baseline and current edition in **Changes**. Comparison separates definition, compiled SQL, catalog, outcome and lineage changes. Affected resources are computed over both old and new graphs, including the downstream effect of a removed dependency. The affected set is structural impact, not an assertion that every resource's output changed.

Save a named review with selection, decisions, reviewer and notes. Proposed SQL is retained as an annotation. Reopening a review keeps its original revision; a concurrent change raises `REVIEW_CONFLICT` instead of overwriting another operator. Removed baseline resources remain selectable and appear in complete reports with `presence=removed` and their baseline outcomes.

Complete JSON, CSV and print-ready HTML reports include every resource, not the visible page. CSV neutralizes formula-leading display cells; the exact original strings remain available in JSON and source files. Browser **Operations** retains each write, its stable ID, input and completion. Interrupted work can resume under that same ID. Uploads use digest-checked chunks and durable offsets, and reject changed duplicate chunks.

## Complete editable handover

**Export project** produces a complete ZIP with all original artifacts, every edition and review revision, request history, and bound result/query/provenance files. It excludes the native SQLite index, browser keys, HTTP job state and host paths outside the project. The receiver checks every member and rebuilds its own index from original bytes.

```sh
python3 "$DBT/cli.py" --project /absolute/private/project invoke export \
  --json '{"output":"/absolute/private/project-export.zip"}'
python3 "$DBT/cli.py" receive /absolute/private/project-export.zip \
  --destination /absolute/private/new-project --expected-sha THE_RETURNED_SHA256
python3 "$DBT/cli.py" --project /absolute/private/new-project serve --port 0
```

Use the returned SHA-256, not a guessed digest. Destination publication is create-only. Repeating the same completed receive returns that project; a conflicting destination is not overwritten. Receiving can resume a verified staging directory after interruption. The new workspace retains original identities and supports further review edits independently of the sending directory.

The browser can receive a ZIP under its selected `--receive-root`, start the received project as an owned child application and offer its editable link. Parent and received projects have separate session-cookie names even though their preserved project UUIDs match. Closing the owner drains accepted operations and closes its child applications.

## Native and typed integration

The installed contribution provides `starforge dbt-project`. Its arguments mirror `cli.py`; `--python` selects an executable without shell interpolation. `client.mjs` and adjacent `client.d.mts` expose the same project, rather than a second state format.

```js
import {DbtProjectClient} from './client.mjs';
const project = new DbtProjectClient({directory: '/absolute/private/project'});
try {
  const manifest = await project.import('/absolute/dbt/target/manifest.json');
  const edition = await project.createEdition({
    title: 'Reviewed build', manifest: manifest.id, request_id: 'build-20261012'
  });
  for (let offset = 0; offset !== null;) {
    const page = await project.nodes(edition.id, {offset, limit: 500});
    for (const resource of page.items) console.log(resource.uid);
    offset = page.next_offset;
  }
  const report = await project.report(edition.id, {format: 'json'});
  await project.copyObject(report.sha256, '/absolute/private/complete-report.json');
} finally { await project.close(); }
```

`invoke` also exposes `binding`, `artifact`, `edition`, `node`, `lineage`, `compare`, `reviews`, `review`, `object.describe` and `object.read`. Complete files should use `copyObject` or offset reads through EOF. `object.read` returns base64, total length and `next_offset`; verify the full returned digest after assembly. Native response ceilings fail explicitly rather than truncating a resource body. `source_json`, catalog source text and outcome source text preserve original numeric lexemes.

The maintained Applications catalog loads `application-provider.mjs` as `dbt-projects`. It selects the original initialized project and Python executable, pins the project binding, and accepts a startup only after checking the live original owner. The source-owned contribution and selection are `distribution/contributions/dbt-projects.json` and `distribution/selections/dbt-projects.json`. They use the maintained build/lifecycle owners; Python and browser assets are included through their source component. No GitHub Actions workflow is added.

## Merchant Workspace agent tools

Select a private connection file through the provider's `dbtProjectConnection` input. Its schema is `stellar-forge.dbt-project-connections.v1`:

```json
{
  "schema": "stellar-forge.dbt-project-connections.v1",
  "workspaces": {
    "warehouse": {
      "directory": "./project",
      "python": "/usr/bin/python3",
      "exportsDirectory": "./exports",
      "receiveRoot": "./received",
      "inputs": {
        "manifest": {"path": "./target/manifest.json", "sha256": "REPLACE_WITH_ACTUAL_64_HEX_SHA256"}
      }
    }
  }
}
```

Set the file's POSIX mode to 0600. Relative paths resolve against that file. Each input is a host-selected path and exact digest; tool arguments choose an alias, not an arbitrary host pathname. The provider exposes project discovery, read operations, source intake, editions, reviews, result binding, reports, export, receive and complete chunk reads. Writes use stable request IDs; provider shutdown drains admitted work. Returned source text is untrusted project content, never an instruction to the agent.

## Continue the original PostgreSQL publisher

`postgres.mjs` exports `DbtPostgresProject.open`. It opens the maintained `../postgres/publisher/model.mjs` with its existing source and target configuration. Native calls are `status`, `source`, `plan.save`, `plan`, `run`, `extract`, `inspect`, `review`, `publish`, `recover`, `buyer.offer` and `buyer.prepare`. The publisher's original methods, candidate verification, target reviews and Buyer handoff remain authoritative.

```js
import {DbtPostgresProject} from './postgres.mjs';
const original = await DbtPostgresProject.open({
  project: '/absolute/private/dbt-project',
  publisherDirectory: '/absolute/private/existing-postgres-publisher'
});
try {
  const run = await original.call('run', {id: originalRunId});
  const plan = await original.call('plan', {id: run.plan});
  await original.call('bind', {
    id: run.id, edition: selectedEditionId, uid: selectedDbtUniqueId,
    expectedQueryHash: plan.data.queryHash, request_id: 'attach-original-result'
  });
} finally { await original.close(); }
```

The selected run must already have a complete native candidate. `bind` retains its verified original `data.csv`, exact captured query and candidate provenance against the chosen dbt resource. It does not assume the dbt compiled SQL equals the publisher query. The browser/CLI can likewise bind existing complete result, SQL and provenance files from another authorized original query operation. The source kind and request ID remain explicit.

For installed command use, `starforge dbt-project postgres ACTION --config PRIVATE_JSON --input INPUT_JSON` forwards to those same native methods. The private configuration supplies the `DbtPostgresProject.open` options. Database connections and payment behavior are configured and executed by the original publisher/Buyer interfaces, not by artifact intake.

## Reproduce the joined native workflow

```sh
python3 "$DBT/EXERCISE.py" --work /absolute/new-dbt-exercise
```

This single create-only exercise uses clearly authored contract inputs and an actual local SQLite query result. It runs artifact intake, explicit invocations, a changed and removed resource, lineage impact, revision conflicts, all complete report formats, a complete ZIP, deletion of the sending project, independent receiving and a subsequent edit. It retains its own output directory for inspection. Only its own sending-project subdirectory is deleted.

The original dbt-generated target artifact set should be retained separately from this authored exercise. Run browser receiving and the optional original Postgres/Applications integration on an environment authorized and equipped for those interfaces. The implementation's native core has no scheduler or background remote service.
