# Operating Project Portfolio

## 1. Keep the original project and its companions

Open the same private project workspace for subsequent work. Upload each complete
project file through the browser, client or configured agent file alias. Preserve
the returned filename, byte count and SHA-256 as the source descriptor. Intake
retains the actual original bytes and opens them with MPXJ 16.10.0.

The original profile controls format detection, raw timephased input, parse error
handling, charset and source locale/timezone provenance. Enterprise CSV, TSV,
JSON and JSONL companions retain their complete source rows. Their roles and
reader profiles belong to the saved intake request. The original source guide
documents duplicate CSV headings, native values, lookup tables and companion
field definitions.

Save the 64-character request ID before submitting an operator action. An intake
uses these original arguments:

~~~js
const source = await client.uploadFile('/absolute/source/Engineering.mpp');
const companion = await client.uploadFile('/absolute/source/enterprise-fields.csv');
await client.action(requestId, 'intake', {
  source, label: 'Engineering',
  companions: [{
    source: companion,
    label: 'Enterprise fields',
    profile: {format:'csv', role:'enterprise_fields', encoding:'utf-8-sig', delimiter:','}
  }]
});
~~~

Read the resulting original edition ID. Page every required task, resource,
assignment, dependency or calendar family. The client edition method accepts the
original family, offset and limit; sourceFieldCatalogue returns the retained
native definitions. Companion readers retain their original ordinal and row
offset. Returned cursors and offsets select continuation within that source.

## 2. Review source changes

Use source_review with the original edition_id, target_profile, mappings,
decisions and corrections. Read the complete saved review and address its actual
findings. Apply that review through source_apply with its review_id and a new
stable request ID. The resulting edition keeps its source and correction history.

A source review and a migration review have different native meanings. Source
reviews govern the captured project and editable native edition. Migration reviews
bind a prepared target plan, its current revision and the named receiving decision.
Both remain in the same workspace.

For an editable file delivery, mspdi_export writes the selected native edition with
the original MPXJ writer. Use the complete returned download descriptor to retrieve
all bytes. Select the explicit native writer profile when the receiving application
requires different supported options.

## 3. Prepare and deliver the target

The existing private profile selects the actual target. The shipped example is in
source/operator/examples/target-profiles.json. Keep credentials and local host
configuration outside the portable workspace.

| Action | Original selection |
| --- | --- |
| probe | profile_id |
| prepare | edition_id, profile_id, returned probe_sha256 where required, and explicit mappings/export profile |
| review | deployment_id, current expected_revision, reviewer, note and accepted findings |
| continue | deployment_id and the exact saved review_sha256 |
| capture_target | deployment_id and its current expected_revision |
| receive_target_file | deployment_id, expected_revision and the returned original source upload |
| accept | deployment_id, expected_revision, comparison_sha256, reviewer, note and explicit exceptions |
| handover | The accepted deployment_id |

Read the current deployment before supplying its revision. The original native
operator persists each call before dispatch and retains returned or recovered
provider details. After an interrupted connection, read that deployment and its
saved request. Resume the same request or continue its same reviewed native plan.

Use adopt_detail for the original unresolved row invocation when its actual
provider detail has been retrieved and reviewed. Its saved call key, native detail
ID, detail hash and operator note bind the observation. Use the original pause and
abandon_set controls for their explicit native purposes. A cancellation of the
local client wait only closes that wait.

Receive the actual target capture or returned file and read its complete
comparison. Acceptance records the reviewing operator and any retained differences.
The handover includes the intended and received schedule, actual target evidence,
accepted comparison and editable result.

## 4. Publish a reporting portfolio

Save a named cohort with archive_save. Each member selects its original project
key and edition ID. The profile selects native reporting columns, row grain,
metric fields, units and currency interpretation. The original archive guide
documents the full definition; source/archive/examples/cohort.json supplies a
complete example.

Review the current cohort with archive_review. Its saved review includes source
membership, selected field coverage, relationship findings, row counts, table
hashes and measure contributions. Read it before publishing.

Publish through archive_publish with exactly:

~~~js
{
  cohort_id: cohort.id,
  expected_revision: cohort.revision,
  review_sha256: cohort.review_sha256,
  reviewer: 'Receiving operator',
  note: 'Reviewed the selected editions, reporting fields and retained findings.'
}
~~~

The original archive publishes the complete relational database, CSV tables,
dictionary, Power Query, SQL, report and source closure. Its totals retain their
source contributions. Use archiveFields and archiveTable to inspect original
definitions and actual pages.

archiveQuery reads SQL against a selected publication. archive_query_export
retains every result row as a downloadable original CSV. Its arguments are exactly
cohort_id, publication_id, sql and parameters. A preview limit applies to the
preview; the export action retains the complete query result.

## 5. Download and receive all files

For a returned blob:

~~~js
await client.download({
  sha256: artifact.sha256,
  expectedSha256: artifact.sha256,
  expectedBytes: artifact.bytes,
  name: artifact.filename
}, '/absolute/customer/portfolio.csv');
~~~

For the complete original workspace:

~~~js
await client.action(requestId, 'archive', {});
const saved = await client.waitRequest(requestId);
await client.download({
  requestId,
  expectedSha256: saved.result.archive.sha256,
  expectedBytes: saved.result.archive.bytes
}, '/absolute/customer/workspace.zip');
~~~

Each transfer streams the complete selected file, verifies its original length and
SHA-256, syncs it and preserves an existing identical result. Files larger than
in-memory JSON limits remain available through saveResponse and complete downloads.

The original source CLI restores a whole workspace:

~~~sh
project-portfolio source receive --archive /absolute/customer/workspace.zip --destination /absolute/customer/received-portfolio
~~~

A published reporting delivery has its own native archive workflow. Upload that
complete package with the archive option, run archive_inspect, read the returned
manifest and review, then use archive_receive with source, manifest_sha256,
reviewer and note. The receiver checks and restores the native source closure,
relational tables, reviewed definition and artifacts.

## 6. Continue through an agent or after restart

The agent configuration selects named workspaces and original host file aliases.
MCP arguments select those names, saved IDs and native action arguments. The
current private connection supplies the local authorization for that same
workspace each time a client opens it.

A large original result returns an export manifest. Select a listed file and
repeat exportId, expectedManifestSha256 and expectedSha256 on every file read.
Continue at nextOffset with the returned readId. At EOF, nextOffset is null and
the original reader closes. Release an unfinished read before leaving it. After a
reader release or merchant restart, reopen the same retained file at its verified
offset and original hash.

Use requestStatus to read saved state without materializing a large native result.
Use request or a complete file response for the result itself. waitRequest can
return saved state with includeResult:false. Client close and cancelWait drain
their own network operations; subsequent clients continue from the original
workspace records.

In Applications, use the original Stop and Start lifecycle. The application
selection includes its source, selected Python and private target profile bytes.
A new start records a fresh process instance and local URL. The existing workspace
identity, editions, source reviews, target requests and retained exports continue
through that connection.
