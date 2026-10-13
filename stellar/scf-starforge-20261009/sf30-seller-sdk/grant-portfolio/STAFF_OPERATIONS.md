# Project staff application and native receiving

This application adds the reviewed project initiation, formulation, QA and correction workflow to the existing grant portfolio and native project record. The original portfolio supplies the source entities and financial editions. The existing Dataverse ALM engine owns deployment, native solution export/import and portable receiving. The existing defect Support workflow links the retained native corrections and validated installed releases.

The application source is complete. Source composition, a successful compiler build, an accepted native import, an executed staff programme and customer UAT acceptance are separate results. Record each only when its actual operation has returned. A source-only handover does not establish a tenant deployment.

## What staff can do

The project form displays its original source and financial context beside the current staff state. It retains the source JSON and exact number text; an absent original value remains absent. Staff can inspect and download the complete original context, follow immutable history and retrieve all five history members for a command.

The native actions cover initialization, evidence editions, the data-management decision, validation minutes, the pursue/park/drop decision, QA submission, each discipline clearance, chair decision, withdrawal, condition resolution, correction opening and resolution, design reopening, reviewed financial edition and the corporate-approval reference. The workflow distinguishes IDEA, FORMULATION, QA_SUBMITTED, APPRAISED and CLOSED_PIPELINE.

The reviewed policy contains the complete 23-step initiation register and seven individual QA clearances. Optional budget/lessons inputs and the conditional data-management plan remain distinguishable from required evidence. The HR ticket and corporate approval are external references. A soft-pipeline record does not create a Business Central record. This staff application makes no Business Central posting, FX conversion, HR transaction or inferred financial verification.

A submitted QA pack freezes the actual source, staff state, policy and evidence editions used by its clearances. A later source or design change must be reviewed through the existing reopen/withdraw rules. A clearance records the actual initiating user; the final chair decision does not silently supply every discipline's clearance.

## Original source and target selection

Start with an actual received portfolio revision. Retain its exact id, positive revision and snapshot SHA-256. Select each source entity using its complete sourceId, entityKey and sha256 from the existing detail API. The entity hash is the original domain writer's hash of entity.original, not a new JSON interpretation.

The target project table and app must already be explicitly represented in the base solution specification. The installation profile names the actual original table, primary name, source JSON field, optional financial JSON field and two additive staff fields. It contains three distinct RFC 6901 pointers inside that original source JSON for the portfolio id, revision and snapshot. These are actual source-layout choices; there is no guessed tenant table or identity column.

A target preflight must retain the actual table metadata and complete Attributes array. Composition checks the real PrimaryIdAttribute, PrimaryNameAttribute, MetadataId and ObjectTypeCode, and requires optimistic concurrency. Form/view composition uses those actual values. Existing source/name/financial fields must have supported readable string or memo metadata. Protected state/phase fields cannot replace the original source, finance, name, owner or system identity columns.

Use the original profile action to save the target's environment URL, organization identity and named token environment reference locally. Credentials are read only at the selected native request. Received profile evidence is not a locally admitted credential binding: save the explicit local profile before another target call after receiving.

## Review the installation policy

staff_spec.installation_template returns a complete editable draft. Empty native roles, unresolved component keys and draft review status are intentional. The draft cannot deploy.

Complete these selections before composition:

- The original project and app component keys, actual field names and source pointers.
- The actual native user-role/root-role GUIDs for each staff role label.
- The exact role labels permitted for all fifteen actions and all seven clearances.
- Accepted step overrides, with the actual review actor, time, reason and source references.
- Every business role ID and the original app-role association.
- Each actually supported native SDK message/filter needed by the guards.
- Source-bound update policies for any existing definition that will be changed.

The reviewed status is accepted-for-selected-environment. A profile label is not proof of a user's effective access. Native reads and updates still enforce the initiating user's actual privileges.

### App-role scope and internal custody

The two fixed organization-owned internal tables retain original commands and immutable history. They are not direct business-user tables. Dataverse SQL/TDS does not execute Retrieve/RetrieveMultiple plugins, so API guards alone cannot protect those bytes.

The composed role constraints prohibit Create, Read, Write, Delete, Append, AppendTo, Assign and Share for the selected business roles on both internal tables. The native compiler/runtime uses the real table Privileges and complete selected role privilege responses, checks proposed grants and stops on a conflict. It preserves existing grants; it does not silently remove them.

The role scope covers all staff policy role IDs plus explicit business_role_ids. Every selected AND retained existing app role must appear in that scope or in administrative_role_exclusions. Each administrative exclusion carries an actual role_id, reviewer, reason and source_refs. An exclusion cannot overlap a business role or name a role absent from the actual app selection/association. The complete original association is hash-bound. Administrative exclusions explicitly avoid claiming to deny effective access to a platform administrator.

All original project reads and writes run under the initiating native user's service. A separate fixed-table custody service is used only after that user's access to the original project has been checked. It is limited to these two internal tables, checks each row's original project binding and only appends inside the original synchronous command transaction.

## Build the complete signed plugin

The plugin targets .NET Framework 4.8 and references Microsoft.CrmSdk.CoreAssemblies 9.0.2.60 plus Microsoft.NETFramework.ReferenceAssemblies.net48 1.0.3. Use the installed dotnet SDK and an installed .NET 8–10 runtime for the small PE metadata inspector. The runtime inspector does not execute the plugin.

The signing key is a real locally selected private key. Keep it outside the source and build directories; do not put its bytes in the source repository, solution resources, receiving archive or logs. The builder records its hash to bind the same interrupted build. It does not generate a key implicitly.

Run:

~~~sh
python3 staff_build.py build \
  --source-root /absolute/original/grant-portfolio \
  --destination /absolute/new-build \
  --signing-key /absolute/private/plugin.snk \
  --version 1.0.0.0
~~~

Use --resume only with the same complete source/key/version/tool intent. The original command intents, stdout, stderr, return codes and failed prefixes remain. Once package locks exist, restoration uses locked mode. The builder retains actual NuGet archives, source, lock files, build logs, DLL and inspection result; it does not fabricate package hashes.

The resulting build.json must report COMPLETE. Verification checks all retained members, the actual assembly name/version/public-key token, its strong-name signature marker and public plugin classes, and permitted references. The DLL must be below 16 MiB. Core SDK assemblies are supplied by the native Dataverse server and are not uploaded beside this signed plugin.

~~~sh
python3 staff_build.py verify --directory /absolute/new-build
~~~

A successful local compiler/PE inspection is build evidence. Native registration and runtime execution remain separate.

## Compose and deploy through the existing ALM operation

Create the draft profile from real source layout:

~~~sh
python3 staff_tool.py installation-template \
  --project /private/actual-project-binding.json \
  --source-refs /private/source-references.json \
  --out /private/staff-installation.json
~~~

After reviewing that profile and retaining the original target snapshot:

~~~sh
python3 staff_tool.py compose \
  --base /private/base-solution-spec.json \
  --installation /private/staff-installation.json \
  --snapshot /private/original-target-snapshot.json \
  --build-root /absolute/new-build \
  --source-root /absolute/original/grant-portfolio \
  --out /private/complete-staff-composition.json
~~~

The result contains spec, policy and complete source identities. Upload the spec value through the original Dataverse specification action. Keep the complete composition result as source evidence.

Composition adds the signed assembly, three plugin types, actual native message/filter references, guards, internal metadata, synchronous Custom APIs, policy, browser resources, project form/view and original app membership. It includes exact source files, original package/lock/build resources and original metadata provenance. It does not invent a DLL identity before a real build.

The dependency order is essential:

1. Resolve actual message/filter identities on the existing original project table.
2. Install its guards before creating protected project columns.
3. Create the two internal tables, their guards and complete fields.
4. Register the native command/read APIs and all Request/Response definitions.
5. Add the complete web resources/form/view to the original app.
6. Verify native privilege constraints, membership, validation and publication through the maintained ALM executor.

New-table SDK filters are resolved after the table exists. Native references are read-only and never masquerade as created solution components. Existing definitions require the retained original body hash and explicit merge-selected review. Metadata updates follow the actual full native metadata contract, including preserved labels.

The two APIs are tjl_PMRSStaffCommand and tjl_PMRSStaffRead. Their parameter and result are complete JSON strings, named Request and Response. Native command execution is synchronous stage 30 and requires the actual transaction. The command, its original user and expected row/state/source/policy versions are retained atomically with the project update and five history members.

Use the existing dataverse.preflight, dataverse.plan and dataverse.apply actions. The original admitted request and native journal own all provider requests. A local FAILED state after interruption never means an import or update is safe to repost.

## Staff form and command recovery

The complete original model-driven form loads tjl_/pmrs/staff/staff.html through its authored form script. It uses the existing Xrm context and native Web API. It does not introduce another identity session.

The browser freezes the exact command UUID, selected project, actor-visible context and expected versions before submission. It keeps that original pending intent under the actual organization/entity/record scope. On an uncertain response, read the same operation identity first. An existing command is reusable only when its exact request and original actor match.

The native API checks for that original command before applying new policy/revision checks. A same-command replay returns its retained receipt; it does not apply the action again. A different payload or actor under the same ID is an explicit conflict.

A stale pending browser intent is not silently discarded. When a new context proves the expected row version has advanced and the original operation lookup remains absent, the browser retains the original request and both read observations as an obsolete expected revision before permitting a freshly reviewed action. That observation is not a claim that the old operation was cancelled or never executed.

## Complete pilot: three CCS projects and one Flagship

dataverse.staff.programme performs actual selected work against existing native records. It creates no tutorial project, fabricated user or synthetic source. Its private reviewed JSON object uses schema tjlabs.pmrs.staff-programme/v1 and contains:

| Member | Actual required meaning |
|---|---|
| id, title | One original programme UUID and useful operator title |
| policy_sha256 | Exact reviewed native policy |
| actors | Stable local labels bound to actual native UserId values |
| projects | At least three distinct CCS original source/native records |
| project.source | Original sourceId, entityKey and sha256 |
| project.initial | Observed row_version, state_version, source_sha256 and state_sha256 |
| project.steps | Complete ordered actual actions, factual payloads, selected actor, expected phase and purpose |
| flagship | Separate existing Climate Change Flagship source and native aggregate |
| flagship.members | Complete reviewed original member list including all selected CCS projects |
| review | Actual reviewer, time, rationale and source references |

The CCS and Flagship labels are explicit reviewed classifications. They do not claim a source field proves a classification unless the selected source actually does.

Each project names the real native table/record ID and the actual RFC 6901 pointer to its original source reference. The native context must match the complete selected portfolio identity, source entity, policy and expected initial state. The programme independently retains and verifies the complete original Workspace detail for every selected project, Flagship and aggregate member.

The Flagship binds its actual entity set, GUID key, source JSON field, portfolio/reference/member pointers and expected original source-text hash. The programme reads the existing aggregate before and after the work. Both original responses and full ordered membership remain. It does not calculate an invented financial aggregate or modify the Flagship source.

Every actual actor has an explicitly locally saved native profile. WhoAmI must return that user's selected GUID and the same organization. The individual native action checks remain authoritative. One operator profile does not stand in for seven absent discipline clearances.

The programmer does not fill missing business evidence. Author factual step payloads from the retained source and actual operator decisions. For precise numbers, retain the original JSON text; do not round it through a JavaScript Number.

Validate the whole original file:

~~~sh
python3 staff_tool.py programme-validate --file /private/reviewed-staff-programme.json
~~~

Upload it through the original workspace:

~~~sh
python3 cli.py --workspace /private/original-workspace upload \
  --file /private/reviewed-staff-programme.json
~~~

Use the returned actual object SHA in one complete action file:

~~~json
{
  "operationId": "original-staff-programme-operation",
  "action": "dataverse.staff.programme",
  "expectedRevision": 42,
  "payload": {
    "actor": "actual receiving operator",
    "portfolio": {
      "id": "actual saved portfolio id",
      "revision": 3,
      "snapshot": "actual 64-character saved snapshot hash"
    },
    "programmeObject": "actual uploaded original SHA-256",
    "profileIds": {
      "reviewer": "actual locally saved profile record"
    }
  }
}
~~~

This is a field illustration, not runnable evidence. Replace all illustrative identities and the revision with the actual current values. Keep the same operationId and original file after admission.

~~~sh
python3 cli.py --workspace /private/original-workspace action --file /private/staff-action.json
python3 cli.py --workspace /private/original-workspace request --id original-staff-programme-operation
python3 cli.py --workspace /private/original-workspace resume --id original-staff-programme-operation
~~~

The installed grant-portfolio command forwards to this same original CLI. staff-client.mjs supplies runStaffProgramme, captureStaffHistory and resumeStaffOperation helpers over the existing authenticated client; no additional network client or workspace exists.

### Interrupted programme behavior

Each command UUID is derived from the original programme UUID plus project/step key. The complete first observed context and exact command text are frozen in the original journal before HTTP. Each dispatch is separately retained under that logical command.

On explicit continuation:

- Completed steps are fully verified and reused with their original history and readback.
- An existing native operation must match the frozen request and actual actor.
- An absent lookup is retained as an observation, not proof of cancellation.
- A RESERVED or not-dispatched transport can continue its original request.
- An unknown dispatched request is not silently repeated in the same invocation.
- A later explicit continuation may repeat only the same exact transactional command, after retaining the original operation lookup and confirming the original expected row/state/source. Native uniqueness, actor binding and optimistic concurrency prevent a second business mutation.
- A complete non-success native command return stops for operator correction. Its original status/body/history remain; a changed payload requires a new reviewed programme identity.
- External project changes or a changed source/policy stop the chain. They are not silently incorporated into a previously reviewed pilot.

The complete result retains every selected source detail, each actual command attempt, original request/return or unknown state, actor identity/metadata, before/after context, five immutable history members and Flagship source observations.

## Native correction and Support linkage

dataverse.staff.capture is a read-only action for a completed original command. It selects the actual native project, commandOperationId and historyStateVersion and retains the complete operation plus before, after, sources, policy and receipt. It performs no staff write.

resolve_correction resolves only an actual retained correction.open or correction.resolve history. The exact pointer is:

~~~text
correctionId, operationId, projectRecordId, stateVersion, historySha256
~~~

historySha256 is the complete after-member hash. A later unrelated project command is not substituted for the actual correction action. Equivalent captures can be reused; disagreement between target/portfolio/history is an explicit ambiguity.

support_correction_options provides paginated actual open/resolved pointers for the original Support UI. It reads retained evidence only. Support stores the checked pointer and resolution evidence rather than a second correction journal. Close-as-corrected also requires the actual completed target import/validation receipt. Import success is not customer acceptance.

The twelve-month support workflow and its reviewed service calendar stay with the original Support implementation. Staff code does not set undisclosed service hours, substitute calendar days for business days or cap covered defects using an internal workload reserve.

## Complete export, independent receiving and later edits

Use the existing ALM delivery operation to assemble the selected original portfolio archive, both actual managed and unmanaged solution exports, original specification/resources, exact target metadata and HTTP evidence, staff captures/programme, Support records and complete application source.

The portable verifier must call:

~~~python
verify_capture(record["value"], record["portfolio"])
verify_programme(record["value"], record["portfolio"])
~~~

The second argument is the wrapper's exact saved portfolio binding. Omitting it would leave an avoidable wrapper/source mismatch.

These functions perform no network requests. They reconstruct native read selections, exact JSON tokens/hashes, actor/source/state bindings, the ordered programme, all command/history/readback relationships and actual Flagship membership. Whole receiving still verifies the original portfolio source archive and every application/resource member through the existing receiver.

Receive into a new directory with the original receiving operation. Imported native evidence is historical; it does not reinstall the solution or replay commands. Save explicit local target profiles before any new native action. Reopen the original portfolio, select actual correction/release references and create a later original revision through the maintained application. Retain the first complete delivery and its exact source identities.

For an offline check of a retained full result or its record wrapper:

~~~sh
python3 staff_tool.py programme-verify \
  --file /private/actual-staff-programme-record.json \
  --portfolio /private/actual-portfolio-binding.json
~~~

A complete operator programme establishes its actual native actions and observations. Customer UAT signatures, a production go-live, the accepted support calendar and any official financial-system posting require their own real evidence.

## Source and validation boundaries

The source includes the native plugin, strict JSON writer, full form/browser UI, metadata/specification composer, signed build/inspection path, native history receiver, original-journal pilot programme, source-only CLI and typed client.

Current source publication is not a compiled-DLL or tenant-runtime claim. Preserve real compiler/native/import/programme outputs when they become available; do not replace missing outputs with fixtures. The complete original source and package bytes make the work reproducible without rewriting its earlier evidence.

Primary implementation contracts:

- Microsoft supported customizations and .NET Framework targets: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/supported-customizations
- Dataverse dependent assemblies and packaging: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/build-and-package
- Original SDK package: https://www.nuget.org/packages/Microsoft.CrmSdk.CoreAssemblies/9.0.2.60
- Dataverse SQL/TDS behavior: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/dataverse-sql-query
- CreateOrganizationService caller context: https://learn.microsoft.com/en-us/dotnet/api/microsoft.xrm.sdk.iorganizationservicefactory.createorganizationservice
- Native Custom API developer contract: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/custom-api
