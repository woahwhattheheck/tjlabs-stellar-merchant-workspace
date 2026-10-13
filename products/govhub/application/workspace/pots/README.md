# POTS delivery in the GovHub operator application

The POTS delivery area connects the original CircleCI run, deployed Pantheon
environment, content transition and recovery work in one saved project. It uses
the existing GovHub database, source store, operating queue and handover. The
project retains complete run editions; an interrupted receiving continues from
its original files. The original POTS deployment and CircleCI approvals continue
in their existing pipeline.

## Installed operating journey

1. Open the existing application and choose **POTS delivery**. Select the actual
   CircleCI project UUID, Pantheon site UUID, deployment environment and existing
   environment record. Retain the agreed scope, owner and recovery instruction.
2. Install the postdeployment capture described in CAPTURE.md in the consuming
   project's original pipeline. It runs with that job's installed POTS, PHP and
   Terminus. Use --all-workflows to include all available native site workflow
   pages, and select original workflow UUIDs when they belong to this delivery.
   Store its whole output directory as native CircleCI artifacts.
3. Receive the selected original CircleCI run with the collector below. The
   collector keeps the authenticated native API responses, all workflow pages,
   every job and artifact, and stdout/stderr for every returned execution step.
4. In the saved project, choose **Receive a run** and select the completed
   directory. The browser handles files up to128 MiB each. Use the installed
   streaming receiving command for larger artifacts.
5. Open **Deployment**, **Jobs**, **Output** and **Artifacts**. Review the observed
   target, completed commands, source files and actual native job outcome.
   Source revisions appear in four explicit columns: triggering Git event,
   CI source, actual checkout and Pantheon deployed code.
6. Connect the project's existing content consolidation and native recovery
   operations. Their actual target and current state remain visible. Record the
   operating review against its exact received edition.
7. Create a complete handover. It includes every selected project version and
   run, all original source bytes, the linked content families and native
   operations, CSV indexes, HTML review and receiving instructions. Create the
   application's full private workspace backup for editable recovery.
8. Open that backup in a second process with the same application, open the
   project, compare its original editions, inspect retained output, reopen
   linked work and produce another source-inclusive handover.

## Native CircleCI receiving

Requires Python3.11 or newer on the receiving host and the original authorized
CircleCI Cloud API token in a private environment variable. The token value is
used only for the native requests. The receiving output and artifact URLs are
private; deliver them through the selected workspace and project handover.

Run these commands from the installed workspace source directory. Use actual
IDs returned by the native account discovery, and use an original receiving
directory for an interrupted operation.

~~~sh
python3 -m pots.collector --output /ABS/CIRCLE-ACCOUNT discover
python3 -m pots.collector --output /ABS/CIRCLE-PROJECTS discover --org-id ORIGINAL-ORG-UUID
python3 -m pots.collector --output /ABS/CIRCLE-RUNS discover --project-id ORIGINAL-PROJECT-UUID
python3 -m pots.collector --output /ABS/RUN-RECEIVING receive --project-id ORIGINAL-PROJECT-UUID --run-id ORIGINAL-RUN-UUID
~~~

CIRCLE_TOKEN is the default environment-variable name. Select another existing
name with the global --token-env option. The collector's default allowances are
1 GiB per file and8 GiB of original file content. Change --max-file-bytes and
--max-total-bytes for the actual project artifact sizes. --timeout sets the
native network timeout. --omit-logs is an explicit reduced receiving option;
the saved edition and application show that choice.

The collector calls the current CircleCI V3 API using Bearer authorization.
The V3 entity envelope is data/attributes/references. Paged collections preserve
opaque page.next values and receive through the terminal null. The native jobs
and artifacts endpoints are unpaged collections in the current schema.
Artifacts retain their original job, parallel execution and path. Each native
stdout/stderr stream retains its original execution and step number.

A receiving directory holds receiving-intent.json, receiving-state.json,
manifest.json and content-addressed objects. Original file content is retained
once by SHA256. Native requests, returned metadata and artifact file references
point to those same bytes. A private process lock prevents simultaneous
writers. Atomic publication, streaming file retention and request identity
allow the same collector to resume its original operation after interruption.

The collector rereads the original run and workflow collection at the end.
If the workflow population changed during receiving, that edition retains the
observation and calls for a new current edition. A received run is a sequence
of native observations, with their actual times; the collector cannot freeze
an independently running CI system.

Native429 results retain their returned Retry-After deadline. Reopen the same
receiving operation after that deadline. The original response body and request
remain available. Other unsuccessful native responses likewise retain their
original receiving state for diagnosis and continuation.

## Stream the received files into the original workspace

First create the saved POTS project using the application. Use its saved
operating project ID below; this is distinct from the native CircleCI UUID.

~~~sh
python3 -m pots.receive --workspace /ABS/WORKSPACE --source-root /ABS/SOURCES --assessment-core /ABS/APPLICATION/workspace/vendor/assessment-core --username ORIGINAL-OPERATOR --password-env ORIGINAL-WORKSPACE-PASSWORD-ENV --project-id SAVED-POTS-PROJECT-ID --receiving-dir /ABS/RUN-RECEIVING --request-key ORIGINAL-RECEIVING-KEY
~~~

The command authenticates the existing workspace operator, retains the original
manifest and every listed file, and calls the same receiving action as the
browser. Large files stream through the existing content-addressed store.
Previously retained matching originals are reopened; the complete manifest is
received as one run edition. An identical manifest in the same project reopens
its existing edition.

The application checks the actual retained file lengths and hashes, the
original native GET requests and response envelopes, project/run/workflow/job
references, complete paged and unpaged collections, artifact identity, and the
native execution/step source of every selected output stream. It reopens the
capture's original command-output bytes and compares them with its projection.
The operator can inspect the original files in the application.

## Correct source and deployment semantics

CircleCI V3 runs.references.event.attributes.vcs.revision identifies the
triggering Git event. GitHub App pipelines can use different configured
checkout and configuration sources. CIRCLE_SHA1, the actual git rev-parse HEAD
result and Pantheon's generated code-log commit therefore have separate
meanings. The application retains their differences for the operating review.

The deployment capture retains the original consuming .circleci configuration,
selected overrides and the installed POTS source/license closure. It observes
the nominated target after the original deployment command. A live or test
deployment is named explicitly even when the setup script's TERMINUS_ENV still
refers to dev. The operator's selected project and actual native site/environment
are compared directly.

The source POTS deployment scripts create a database backup before live
deployment. A complete project recovery can additionally need code and files
archives. Connect the selected native backup/download/restore operations in the
project so the actual recovery set and its outcomes travel with the handover.

workflow:list defaults to the selected native site's latest100 workflows in the
supported original Terminus implementation. --all-workflows reads all available
native pages. The capture labels the selected scope.
Use its explicit --workflow-id selections to retain the actual original
workflow status and operations. The application preserves those selections.

## API joins

All actions use the existing /api/govhub/pots/... dispatcher. A mutating action
uses the original request_key convention.

| Action | Result |
|---|---|
| projects.list | Current saved scopes and latest run/review summaries |
| projects.save | Create or revise a project; existing native target stays attached |
| projects.get | Scope versions, all received editions, linked work and reviews |
| receive | Receive the original manifest_file_id and full path-to-file-ID map |
| runs.get | Complete original run edition and selected-target assessment |
| runs.compare | Native job, deployment-context and artifact changes |
| links.save | Attach existing operation_ids and content_family_ids with their context |
| reviews.save | Retain a named operator decision and the exact edition's observations |
| files.preview | Read the first256 KiB of a selected original file; full download stays available |

exports.create accepts pots_project_ids alongside existing plan_ids,
content_family_ids and visitor_edition_ids. Linked content families are included
in full. Existing native recovery operations keep their original IDs, history,
outputs and resume state. The full workspace backup already includes the same
database objects, source bytes, accounts and operation journals.

## Primary sources and licensing

- CircleCI V3 reference: https://circleci.com/docs/api/v3
- CircleCI V3 developer guide: https://circleci.com/docs/guides/toolkit/api-v3-developers-guide/
- Current original OpenAPI: https://circleci.com/fullopenapi.json
- CircleCI environment variables: https://circleci.com/docs/reference/variables/
- Original POTS repository: https://github.com/fourkitchens/pots
- Reviewed POTS source: bf496b2a63aef5bef3d6f60701889244c030b22a

The POTS integration files are original Commons application code under the
project's Apache2.0 license. The original POTS package remains GPL3.0-or-later;
the captured source closure retains its own original license and identity.
The original Terminus binary and its source remain under their original MIT
license. Install the pipeline capture through CAPTURE.md and retain those
third-party license files in any supplied source handover.
