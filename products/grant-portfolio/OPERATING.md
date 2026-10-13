# Operate the complete grant portfolio application

Use this workflow for the standalone `grant-portfolio` selection in
`woahwhattheheck/tjlabs-stellar-merchant-workspace`. The same saved application carries
source reconciliation, programme delivery, applications and awards, staff operations,
Dataverse deployment and continuing support. Select the current source once, then work
through the original workspace and its complete revision history.

The maintained source authority is
[`source-files.json`](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/source-files.json).
Installation checks every declared member against the selected package manifest. Use
that actual roster for the chosen release; a historical file count does not describe a
later edition. The product keeps the original workspace identity and operator-edited
input handles when it reopens.

## 1. Build the selected source and install its runtime

Choose the complete source commit and use the original distribution builder:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref ORIGINAL_COMMIT \
  --selection grant-portfolio --out /absolute/grant-portfolio-release --offline
~~~

Use the archive path and SHA-256 returned by that build. The builder's original Git
reader resolves static dependencies and includes the source-owned native support files.
If required Git objects are absent, finish their existing acquisition and repeat the
same build directory and source commit. The build and runtime retain their acquisition,
profile and materialization records.

Prepare and install with the original runtime commands:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /srv/starforge/runtimes/grant-portfolio \
  --archive /absolute/grant-portfolio-release/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /srv/starforge/runtimes/grant-portfolio --offline

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /srv/starforge/runtimes/grant-portfolio --load --source
~~~

An offline install uses the operator's existing dependency cache. Use the original
installer's cache and acquisition options for the selected host. Continue until its
actual inspection reports **READY**.

The selected runtime enables the original MCP feature and operator host requirements.
The native portfolio application runs on Linux with Node 22.16 or later, Python 3.11 or
later, SQLite and the existing `flock` process lease. Installed receiving also uses
Linux `/proc`, `os.pidfd_open` and `signal.pidfd_send_signal` to resume the exact
owned console process after interruption. Choose a Python environment
containing the original publisher dependencies in [requirements.txt](requirements.txt):

~~~sh
python3 -m venv /srv/starforge/python/grants
/srv/starforge/python/grants/bin/python -m pip install \
  -r products/grant-portfolio/requirements.txt
~~~

The Comic Relief spreadsheet converter uses its own environment and its
[original converter requirements](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/examples/comic-relief/converter-requirements.txt).
Its conversion run prepares the full native publisher packets before product receiving.

## 2. Prepare a new product or attach a received workspace

Use an existing private parent directory and absolute real paths:

~~~sh
starforge grant-portfolio-workspace prepare \
  --runtime /srv/starforge/runtimes/grant-portfolio \
  --directory /srv/starforge/products/grant-portfolio \
  --python /srv/starforge/python/grants/bin/python \
  --title "Grant portfolio reconciliation"
~~~

This creates the native workspace under the product directory and records the selected
runtime, installed source, Python environment and workspace identity. A repeated command
with the same arguments reopens that preparation and preserves configured packet handles.

To prepare a product around an already received original workspace, use a new private
product directory and select the native workspace explicitly:

~~~sh
starforge grant-portfolio-workspace prepare \
  --runtime /srv/starforge/runtimes/grant-portfolio \
  --directory /srv/starforge/products/customer-portfolio \
  --python /srv/starforge/python/grants/bin/python \
  --workspace /srv/starforge/customer/native-portfolio \
  --title "Customer grant portfolio"
~~~

Preparation produces:

| File or directory | Purpose |
| --- | --- |
| `product.json` | Selected runtime, interpreter, native workspace and interface paths. |
| `PREPARATION.json` and `PREPARED.json` | The original preparation input and completed workspace binding. |
| `application-settings.json` | Workspace, Python, private connection-file path and automatic loopback port. |
| `grant-portfolios.json` | The original merchant workspace alias and declared complete packet handles. |
| `merchant-options.json` | Original provider initializer input for this product. |
| `merchant-overlay.json` | The connection reference for an existing merchant configuration. |
| `workspace/` | Native SQLite workspace, source objects, review history and exports for a newly prepared product. |
| `console.json` | Private live connection announcement created and removed by the original console. |

The files and workspace remain private to the operator. Preserve this directory together
with its selected runtime for reopening. A portable customer handoff uses the native
export workflow below.

## 3. Open the console or launch it through Applications

~~~sh
starforge grant-portfolio-workspace open \
  --directory /srv/starforge/products/grant-portfolio --port 0
~~~

Open the complete local link printed by the native console. Closing the original process
retains the workspace and releases its writer.

For the managed Applications workflow, attach the READY runtime to the existing Runtime
workspace:

~~~sh
starforge runtime-workspace attach \
  --workspace /srv/starforge/operator \
  --runtime /srv/starforge/runtimes/grant-portfolio \
  --label "Grant portfolio"

starforge runtime-workspace serve \
  --workspace /srv/starforge/operator --port 8465
~~~

Create that Runtime workspace with its original `init --workspace` command first
when setting up a new operator. In its browser, select **Applications → Grant portfolio
reconciliation**. Use the saved product's workspace and Python paths and the private
connection-file path from `application-settings.json`. Review, save, connect
the installed release and start the application. Its original observer authenticates
the live console and verifies the reviewed source and workspace before offering **Open**.

Use the existing **Stop** and **Reopen** actions for the managed application. For a new
source release, prepare its runtime and review the same native workspace in Applications
again so the managed source selection follows the reviewed upgrade.

Inspect the prepared product with:

~~~sh
starforge grant-portfolio-workspace status \
  --directory /srv/starforge/products/grant-portfolio
~~~

Status reads the live typed client when the console owns the workspace and uses the native
saved-state command when it is closed. If a process died with its connection file retained,
status reports RECOVERABLE. Open the same product or review/start it in Applications. The
native launcher acquires the original workspace lease, retires that workspace's stopped
connection and atomically publishes its new complete launch.

## 4. Choose the current operating workflow

All of the following work belongs to the same selected portfolio and saved application.
A programme can begin before external publisher data is received. Its later source
intake joins the existing programme instead of creating another operational store.

| Work | Original entry and maintained guide |
| --- | --- |
| Receive and reconcile publisher editions | **Source editions**, then the portfolio's original entity, link, decision and financial tables; [source operations](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/OPERATIONS.md). |
| Plan and deliver a programme | **Programme delivery**; [programme guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/PROGRAMME.md). |
| Run a funding round and administer awards | **Applications and awards**; [awards guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/AWARDS.md). |
| Operate accountable staff decisions | The existing staff workflow and its selected authority; [staff operations](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/STAFF_OPERATIONS.md). |
| Configure and deliver the selected Dataverse application | The original native specification, target profile and saved deployment actions; [Dataverse receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/DATAVERSE_RECEIVING.md). |
| Continue implementation support and corrections | The joined original support application; [support guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/SUPPORT.md). |

Use the selected portfolio revision when reading historical work. A record's own
revision, the programme or awards revision and the portfolio revision serve distinct
purposes; preserve the exact returned identities in the next saved operation.

### Source editions and reconciliation

Open **Source editions**, upload each complete native IATI or 360Giving packet, and retain
its standard, publisher, edition label, authoritative URL, observation time, license and
coverage. The original packet and its complete native records become an immutable source
edition.

Create a portfolio from the selected source IDs. Work through **Entities**, **Candidates**,
**Links**, **Decisions** and **Financial**. Review the original source references and save
the relationship, disposition, reviewer and rationale. Keep records whose programmes or
dates lie outside another publisher edition visible as coverage-only or unmatched.

The seven tables remain pinned to the selected portfolio revision. Page through all rows
for a complete table, and open entity detail to read its original source and financial
records. Amounts remain exact decimal text. Financial groups distinguish source, kind,
currency, type, date and reporting period.

Receive a following edition as another complete source. Select the replacement in a new
portfolio revision, inspect **Changes**, and review decisions whose source references have
changed. Earlier revisions and their source references remain available.

The [native operator guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/OPERATIONS.md)
contains the complete field definitions, decision forms and later-edition workflow.

### Programme delivery

Select **Start a programme**, save the name, code, owner and reporting date, then add
its project hierarchy, shared partners, grants and documents. The original registers
carry workplan dependencies, results and observations, risks, issues and actions,
reports and closure. Upload complete evidence through the existing document workflow
and select its actual record in the relevant project or grant.

For a project or grant with external financial evidence, use **Original source records**
to select the exact received source entity. A replacement edition remains a reviewed
portfolio change. Source bindings show whether the original is current, changed or
outside the selected editions; the application preserves the original reference until
that review occurs.

Record result values as decimal text with their original units, reporting periods and
dimensions. Correct an observation through its existing record. Overlapping periods,
missing values and ambiguous latest observations remain visible in the programme
position. Submit donor reports and record closure only with the intended contributing
editions: those actions retain an immutable dated position, including the selected
original financial basis and supporting documents.

Open **Project QA pack** for the selected project's issued checklist and retained
evidence. Use the joined staff workflow for accountable clearance and approval.
The programme guide defines each register, its source scope and its current limits.

### Applications, awards and complete CSV intake

Create or select the programme/project, applicant partners and supporting documents,
then open **Applications and awards**. Save a funding round using the actual approved
criteria, dates, responsible people and scoring method. Publish its reviewed edition
before recording applications against it.

Work through the original application, eligibility and diligence, assessor disclosure
and clearance, assessment, panel decision, agreement, claim and monitoring registers.
Use the actual required authority and programme rules for each attributed decision.
A recorded amount retains its currency and financial meaning; the original financial
reconciliation selects exact source rows and their digests.

To receive an application spreadsheet, open **Import application CSV**:

1. Select the complete UTF-8 CSV, its original filename, the published round, recording
   actor and draft or submitted status.
2. Map the actual reference, title, legal name and partner-key columns. Add the project,
   requested amount/currency, profile fields, submission date and published criterion
   answers required by this input.
3. Match partner and project keys to existing programme records. Review the stable
   application identities, including any exact saved draft selected for update.
4. Review and download the complete mapped plan, then save that same import. The
   original CSV document and applications commit through one saved portfolio action.

The browser retains the operation ID before dispatch and checks the uploaded document's
bytes and hash. Original source, round edition and portfolio snapshot stay attached to
the import. An interrupted request continues under the same saved operation. Published
or submitted records use **Create following edition** for changed content; earlier
editions remain readable.

Use JSON or CSV exchange for the selected application records. The complete portfolio
handoff is the customer delivery for all source packets, evidence, registers and
revision history. Spreadsheet-safe CSV presentation is recorded separately from its
original structured values.

### Staff, deployment and support

The current staff profile supports project initiation, formulation, QA and correction
on the existing native project record. Review the actual source layout, target project
and app, role GUIDs, action/clearance policy and complete installation inputs. Its
project form retains source and financial context beside evidence editions, staff
state and immutable command history.

A submitted QA pack freezes its actual source, staff state, policy and evidence.
Record each discipline's actual clearance, the chair decision and any later condition
or correction through the original native command. The form uses its existing Xrm
identity. An interrupted command keeps its original UUID and exact expected versions;
read that operation before continuing. The staff guide contains the signed-plugin
build, native composition and the complete selected three-project/Flagship programme.

The current staff and Support profiles carry the issued SPC project process and
service terms. Select them when that process and obligation match the commissioned
implementation. A different customer's agreed process or correction period needs its
explicit source adaptation; changing a label does not change the implemented policy.

A Dataverse delivery begins with its complete specification and the actual target
profile. Save and inspect the original preflight and compiled plan, then apply the
reviewed operations, selected settings, app publication and role configuration through
that same saved native journal. Continue an interrupted native job with its original
request rather than constructing another import or publication action.

Use the selected programme's representative operating cases and real role arrangement
during deployment. The native delivery preserves managed and unmanaged packages,
actual source/target results, original definitions, configurations and unresolved
operations alongside the editable portfolio.

Open **Support** at `/support/` with the same private console connection. Receive the
original defect report, assign its component and owner, record acknowledgement,
agree workaround/correction timing, select the actual staff correction, validate its
completed target installation, then close or reopen that same case. Reports can enter
before triage, calendar selection or final acceptance is complete.

The current SPC profile retains twelve months of defect support from actual final
acceptance, with the issued one/two-business-day acknowledgement targets. Select the
actual service timezone, weekdays, non-working dates, service interval and reviewed
counting rule. Its clock begins at the report's original receipt. Record actual
acknowledgement and acceptance correspondence in the original case; those actions
retain the existing communication.

**Prepare handover** selects the complete native delivery for the reviewed portfolio.
It carries the contract and every revision, each report cycle and case revision,
later native installation/correction histories, supporting objects and a readable
handover. **Receive handover** adopts those original records with the nested native
application in the same workspace transaction. Its received release/correction
selectors continue to work after reopening. Follow the maintained staff, Dataverse
and support guides for their exact payloads and operating sequence.

## 5. Connect the original merchant tools

Edit only the packet-handle collection in `grant-portfolios.json` to declare
complete input files for agent use. A handle names its absolute file path, optional exact
SHA-256 and label. The saved alias `portfolio`, workspace ID and connection-file
path bind this product to its console.

Initialize the source-owned provider using the prepared input:

~~~sh
starforge merchant-providers inspect grant-portfolios

starforge merchant-providers init grant-portfolios \
  --options /srv/starforge/products/grant-portfolio/merchant-options.json
~~~

The initializer returns the created `merchant-mcp.json` path. Use that
configuration with the installed **merchant-mcp**, **merchant-mcp-stdio** or
**merchant-mcp-client-config** command and its original transport setup. An existing
merchant can use the connection reference from `merchant-overlay.json`.

Agents operate the same saved console through `merchant_grant_portfolio_` tools:
select the workspace, read its schema and state, upload a declared native packet, save
source/portfolio/review actions, page exact revisions, export and receive the complete
customer file. Retain the original operation ID and expected revisions through a lost
reply. Read the existing request and explicitly continue its retained operation.

The original console owns the database writer; the merchant owns its retained downloads
and exports. The [client guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/CLIENTS.md)
defines the exact tool payloads, typed client and source-owned provider configuration.

## 6. Deliver and reopen a complete portfolio

From the selected portfolio revision choose **Export complete portfolio**. The handoff
contains all earlier revisions, each revision's actual table family, original source
packets, review decisions, programme and award history, referenced document objects,
origin-bound requests and the complete maintained native runtime closure. The selected
source roster determines the files carried with that edition. Earlier source-only
revisions retain their original seven-table layout; later programme and award revisions
retain their own complete derived tables.

The equivalent saved CLI operation is available when the console is closed:

~~~sh
starforge grant-portfolio-workspace native \
  --directory /srv/starforge/products/grant-portfolio -- \
  export --portfolio-id ORIGINAL_PORTFOLIO_UUID --revision ORIGINAL_REVISION \
  --operation-id ORIGINAL_EXPORT_OPERATION \
  --out /absolute/private/Grant_Portfolio_Complete.zip
~~~

Repeat the same export operation and destination to reopen its identical completed file.
Use **Source editions → Receive a complete portfolio** in a new original workspace,
or the original `grant-portfolio-receive` merchant receiving command. The recipient
can continue review, export the combined history again, stop and reopen that workspace.

[Installed receiving](RECEIVING.md) exercises this entire path with the original Comic
Relief publisher inputs and two independent received customer workspaces.

## 7. Select the complete customer handover

Choose the original delivery that matches the work actually performed:

| Delivery | Contents and continuation |
| --- | --- |
| Complete portfolio | Source editions, review and record histories, programme/award tables, documents and maintained source; receive into an ordinary portfolio workspace and continue editing. |
| Native Dataverse delivery | Complete portfolio plus selected native managed/unmanaged solution exports, settings, target observations and original request/result histories; receive through the original Dataverse delivery action. |
| Support delivery | The implementation's retained support records and related complete native handover; receive through the original support course. |

A received historical target profile remains part of that history. Select the
recipient's actual local profile before an authorized target operation. Archive
receiving reconstructs saved work and preserves its native results; the later operating
task selects any new tenant action explicitly.

After receiving, open the recipient's actual returned portfolio revision, inspect its
source and documents, make the agreed ordinary continuation, close the owned console
and reopen that same workspace. Use the recipient's returned IDs for onward work.
Repeat an interrupted original receiving operation under its saved ID so completed
receiving and later recipient edits remain intact.

[Installed receiving](RECEIVING.md) links the original source, programme, award and
deployment receiving courses. Preserve the completed course's full files and returned
workspace identities when delivering it to another operator.

## 8. Upgrade the application around the same workspace

A prepared product records one exact installed runtime and native source selection.
Build and prepare the selected following release in its own runtime directory.
Retain the original product directory and its selected source so that its prior
preparation remains understandable.

For managed use, review the new installed source against the same native workspace in
the original Runtime workspace's **Applications** flow. Use its **Stop** and reviewed
start/reopen operations to change the selected running source.

For a standalone product, close the owned console and prepare a new private product
directory with the following runtime and the same absolute native `--workspace` path.
The original `prepare` command above supports that explicit existing-workspace binding.
Keep the original product's packet-handle input files when configuring the new
product's handles. Its status and open commands inspect the newly selected source and
the retained native identity.

The source roster is verified dynamically for the selected release. Changing files
inside an already prepared runtime is not the upgrade operation. Keep the actual
release archive and source selection with the received customer handover.
