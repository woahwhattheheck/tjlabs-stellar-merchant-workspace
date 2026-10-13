# Project Portfolio

Project Portfolio keeps an original Microsoft Project portfolio, its companion data,
reviewed changes, actual target responses and completed reporting deliveries in one
portable workspace. It opens the maintained MPXJ operator and archive application
through the installed Starforge application, command line, typed JavaScript client
and merchant agent.

The complete original implementation is included under source/. Its source
identity, exact file sizes, hashes, engine version and upstream attribution are
recorded in SOURCE_ADOPTION.json. The installed interfaces use those original
engines and saved operation records.

## What the product delivers

| Work | Retained result |
| --- | --- |
| Project intake | Original MPP, MPT or MSPDI bytes, native typed fields, MPXJ JSON, calendars, dependencies, assignments and enterprise companions |
| Source review | Exact field mappings, corrections, unresolved findings and new native editions |
| Migration | Prepared MSPDI or Project Operations plans, reviewed native requests, actual operation details, target captures and accepted comparisons |
| Portfolio reporting | Named cohorts of original editions, reviewed field coverage and measures, SQLite tables, complete CSV files, Power Query, SQL and readable reports |
| Customer receiving | Complete source and workspace archives, original request recovery, full-file downloads and saved receiving records |
| Managed operation | Applications Review, Save, Start, Open, Stop and reopen, using the existing application lifecycle |

Read [OPERATING.md](OPERATING.md) for the complete customer workflow and
[RECEIVING.md](RECEIVING.md) for installation, native receiving and source selection.

## Requirements

Use Node.js 22 or later, Python 3.12 or later, and the Java runtime supported by
MPXJ 16.10.0. Install the original requirements into the Python environment selected
for this product:

~~~sh
/absolute/python-environment/bin/python -m pip install -r /absolute/product/source/requirements.txt
PROJECT_PORTFOLIO_PYTHON=/absolute/python-environment/bin/python project-portfolio source runtime
~~~

The runtime command reports the actual Python packages, MPXJ version, JVM and JAR
identities. The selected Python executable may belong to a virtual environment;
its original invocation path is preserved.

## Open a workspace

Choose a private workspace in an existing parent directory. The examples use the
installed command. From a source checkout, invoke node with the complete path to
products/project-portfolio/cli.mjs followed by the same arguments.

~~~sh
project-portfolio init --workspace /absolute/projects/portfolio --python /absolute/python-environment/bin/python
project-portfolio serve --workspace /absolute/projects/portfolio --python /absolute/python-environment/bin/python --port 0
~~~

Open the local URL printed by the running application. The application displays
the original project operator and reporting panels. Its private host connection is
kept in the adjacent portfolio-project-portfolio-host directory. That directory
contains the current local entry and the stable connection.json used by the client.

For target operations, supply the existing private target configuration:

~~~sh
project-portfolio serve --workspace /absolute/projects/portfolio --python /absolute/python-environment/bin/python --profiles /absolute/private/target-profiles.json --port 0
~~~

Stop the foreground command normally. The original operator stops accepting work,
retains its saved requests, drains accepted operations and records its closed
instance. Opening the same workspace creates a fresh local connection to its
existing source, reviews and requests.

## Applications

The project-portfolio distribution contribution registers **Project Portfolio**
with the maintained Applications workspace. Select the original private project
directory, Python environment, optional target profiles and port. Review and save
that selection, then use the existing Review Start, Start, Open and Stop controls.

Preparation selects the complete original source, application interfaces, Python
executable and private target configuration. Startup reads the actual process
identity and original workspace response before recording the local application
URL. The stable client connection remains beside the original workspace.

## Command line and typed client

~~~sh
project-portfolio help
project-portfolio status --connection /absolute/projects/portfolio-project-portfolio-host/connection.json
project-portfolio list --connection /absolute/projects/portfolio-project-portfolio-host/connection.json --collection editions
~~~

The complete typed client is exported as ./products/project-portfolio/client:

~~~js
import {ProjectPortfolioClient, newProjectPortfolioRequestId} from
  '/absolute/product/client.mjs';

const client = new ProjectPortfolioClient({
  connectionFile: '/absolute/projects/portfolio-project-portfolio-host/connection.json'
});
try {
  const uploaded = await client.uploadFile('/absolute/source/Engineering.mpp');
  const requestId = newProjectPortfolioRequestId();
  await client.action(requestId, 'intake', {
    source: uploaded,
    label: 'Engineering'
  });
  const result = await client.waitRequest(requestId);
  console.log(result);
} finally {
  await client.close();
}
~~~

Save the request ID before dispatch. Read or resume that same request after an
interrupted reply. The client does not replace the native operation journal.

## Agent operation

Declare original source and handover files in a private JSON object. Each key is a
host file alias; each value supplies its label and absolute path. An optional
sha256 pins a previously inspected file.

~~~json
{
  "engineering": {
    "label": "Engineering original project",
    "path": "/absolute/source/Engineering.mpp"
  }
}
~~~

Then configure the merchant profile against the running original application:

~~~sh
project-portfolio merchant-init --dir /absolute/private/portfolio-agent --connection /absolute/projects/portfolio-project-portfolio-host/connection.json --files /absolute/private/project-files.json
~~~

The command returns the original merchant configuration path. Open it using the
maintained merchant-mcp or merchant-mcp-stdio command and its existing transport
configuration. The configured project-portfolio-workspaces provider exposes all
22 native actions, saved records, source and companion fields, reporting queries,
complete downloads and resumable export readers.

Large responses are retained in full. Read the returned manifest and continue the
original export_file operation until nextOffset is null. Use the returned exact
manifest and file hashes for each continuation.

## Native period reporting

Reporting cohorts can include an optional `timephased` profile with named periods
and work, cost or material series. The original MPXJ engine reads the saved
project editions and calculates the selected values using their actual assignment
and baseline calendars. Saved reviews retain the complete native inputs and
values; publication, SQL queries and receiving use that same capture.

Use the [native period profile](source/archive/examples/timephased-profile.json)
and [reporting guide](source/archive/README.md) to select fields, units, calendars
and valid native cost intervals. The browser, typed client and merchant
`archive_save`, `archive_review` and `archive_publish` actions use the same
original reporting workflow.

## Source and operating references

- [Original source and native runtime](source/README.md)
- [Migration operator and target workflow](source/operator/README.md)
- [Portfolio reporting and full receiving](source/archive/README.md)
- [Exact source adoption](SOURCE_ADOPTION.json)
- [Original MPXJ license](source/third_party/mpxj/LICENSE)
