# Publishing playbooks

This is the editorial operating arm of the existing GovHub application.
A publishing owner can turn the actual Drupal content model into editable
field instructions, named responsibilities and visitor tasks; preserve each
edition and editorial decision; receive a release or restore against the same
original native environment; and deliver the full operating history.

The work uses GovHub's existing database, original source store, staff accounts,
visitor journey service, native operation queue and complete handover. It adds
no separate account system or worker. The application navigation places
**Publishing playbooks** beside **Content consolidation**.

## Capture the installed Drupal site

Use the selected environment's existing installed Drupal and Drush. Keep the
complete application source and the private native receiving output separate.
The capture reads native content type and field definitions, editing form
components, roles and permissions, relevant content moderation workflows,
selected native content UUIDs/routes and the original configuration JSON.

Write a private request JSON with the actual original environment identifier:

~~~json
{
  "environment_ref": "YOUR_SAVED_ENVIRONMENT_ID",
  "output_path": "/absolute/private/source-root/editorial/baseline.json",
  "bundle_ids": null,
  "entity_ids": null
}
~~~

Omitting bundle_ids, or setting it to null, selects every installed node content
type. Supplying a list selects those exact native type machine names.
Omitting entity_ids, or setting it to null, captures every node in the selected
types. An empty entity_ids list intentionally captures no node rows. An
explicit list must name actual IDs in the selected types. The command fixes
the selected node IDs before loading every record, in native batches of 100.

Run through the original profile, with its real URI:

~~~bash
GOVHUB_EDITORIAL_REQUEST=/absolute/private/editorial-request.json \
  /absolute/existing/vendor/bin/drush \
  --root=/absolute/existing/drupal/web \
  --uri=https://THE_SELECTED_ENVIRONMENT \
  php:script /absolute/application/workspace/editorial_playbook/native/inventory.php
~~~

Keep the same request and output path after interruption. If the complete
output already exists and the request matches, the command reopens it.
A new observation uses a new output and request. Output publication is
create-only and the retained JSON includes the original request hash.

A Drush default URI is not a substitute for the selected site's configured
URI: that address becomes the visitor project source. Configuration is read
before and after the capture so a concurrent configuration change asks the
operator to repeat the capture before publishing its output.

The native command returns the saved output path, bytes and SHA-256. Retain
that complete JSON in **Original sources**, then select it in **Publishing
playbooks**. Files remain private to the existing workspace.

## Author the complete publishing workflow

1. Choose the existing native environment and its retained inventory.
2. Set the publishing owner and prepare the editable playbook.
3. Review the proposed content types, actual native editor roles and selected
   field instructions. Set each content type's responsible publisher and the
   source behind its instructions.
4. Rewrite the proposed visitor task wording around the actual reader goal.
   Every task keeps its content type, owner, original route and optional
   captured content UUID.
5. Select the original cutover cohorts and content mapping IDs when this
   edition participates in those operating arms.
6. Save the complete edition. Later saves preserve all previous editions.

Preparing from inventory proposes wording; saving and reviewing is an
explicit editorial operation. A captured Drupal label supplies an initial
field description or task title, not a claim that a particular publisher has
approved it. The native permission list is available beside each content type
so the owner can assign the appropriate roles.

**Create visitor journeys** sends the entire selected task population through
the original visitor project and set operations. Sets are grouped according to
the existing 150-journey native service contract. Every task remains included
and bound to the exact returned set version. Earlier sets and captures remain
available in Visitor journeys.

The operation saves its original intent before creating the project, then
reuses stable original request keys for each set and the resulting playbook
edition. Reopening the same request resumes those records after interruption.

Review the final linked edition with **Accept** or **Return** and a reason.
The review belongs to the displayed immutable edition. Changing field
instructions, task responsibilities or visitor bindings creates a new edition
with its own editorial review.

## Revise the native inventory in the same playbook

Open **Update from a new native inventory** on the current playbook and choose
the retained inventory from its original environment. **Prepare revised
edition** carries existing field instructions, owners, reader goals and task
responsibilities into an editable proposal. It displays the exact structural
comparison and the proposed changes before saving.

Fields and roles that have disappeared remain in the earlier edition's
history. Newly observed fields and content types receive proposed instructions
for review. A task for the same native content UUID can follow its changed
canonical route. If a selected UUID is absent, the proposal keeps the reader
goal and route and asks the editor to select current content or review the
task as an explicit route task. Newly selected content receives proposed
tasks; content intentionally omitted from the earlier task population is
kept outside that population.

Saving a changed goal, audience, route, content type, UUID or source identity
clears an unchanged earlier visitor binding for that task in the new edition.
The saved result lists these tasks in visitor_relink. Choose **Create visitor
journeys** to bind the revised task population, then review the resulting
edition. Publisher-only changes preserve the existing task binding. Manual
visitor bindings must name a retained journey with the same reader goal,
audience and original task route.

## Receive a release or restore

Use the existing native operation and Visitor journeys interfaces to complete
the selected operation and capture each original visitor set. In Publishing
playbooks, choose BASELINE, CANDIDATE or RESTORED receiving and the new
inventory from that exact saved environment.

The interface supports saving actual progress while editors continue their
work. It records:

- the original native operation IDs, state and observed start/finish times;
- the exact selected cohort edition or mapped-content native plan;
- each content type's editor outcome, observation and original files;
- each selected original visitor edition and its captured journey result;
- the exact before/received changes in selected native fields, permissions,
  moderation workflows and native content routes;
- the reason for any accepted structural change.

The service verifies the bound original set version, reader goal, audience,
and the capture's actual target and task route. Original visitor retargeting
can receive the task on the selected environment; a capture of another site
is retained with a RETURN outcome and an explanation. A changed canonical
route can be matched to the same native content UUID. A selected UUID absent
from the receiving inventory asks for a revised task. The original visitor
result and review remain intact, and an explicit visitor RETURN decision
keeps that task returned. Structural changes retain their before and received
values and editorial decision.

Receiving displays COMPLETE when the selected playbook edition is accepted,
the selected native operations have completed with their actual finish
times, every selected content type has an accepted editor outcome, all named
visitor tasks pass or have an accepted original visitor exception, and all
observed structural changes are accepted. Otherwise the same receiving view
shows the remaining work and keeps the observation as IN_PROGRESS.

Continue the existing original native operations after a provider interruption;
then open the retained history and choose **Continue this observation**.
The form restores the same role, inventory, native operations, visitor editions,
editor outcomes and every selected editor file. Saving appends the next
observation and retains continued_from. Changing the inventory or receiving
role starts a new observation and clears those carried outcomes. The original
native operation identities remain available for continuation.

## Existing CLI and API

Use workspace/cli.py with the original workspace/source paths and staff login.
The CLI accepts the actual password by its existing --password-env option or
--password-stdin. For example:

~~~bash
python3 /absolute/application/workspace/cli.py \
  --workspace /absolute/private/workspace \
  --source-root /absolute/private/source-root \
  --username ORIGINAL_STAFF_USER \
  --password-env ORIGINAL_PASSWORD_VARIABLE \
  call playbook.definitions.prepare --input /absolute/private/prepare.json
~~~

The password option names the private environment variable; its value stays
outside request files and handovers. The existing application login and
authorization govern every playbook operation.

| Operation | Complete input |
| --- | --- |
| sources.retain | path, category Evidence, source_label |
| playbook.definitions.prepare | environment_id, inventory_file_id, label, owner for a new playbook; add exact current version_id to prepare its revised native inventory |
| playbook.definitions.save | playbook_id, inventory_file_id, definition, expected_revision, change_note, request_key |
| playbook.definitions.get | playbook_id, or exact version_id |
| playbook.visitors.link | version_id, request_key |
| playbook.reviews.save | version_id, version_sha256, expected_revision, decision, reason, request_key |
| playbook.inventories.compare | version_id, inventory_file_id |
| playbook.receiving.save | version_id, expected_revision, role, inventory_file_id, operation_ids, visitor_edition_ids, editor_decisions, accept_changes, change_reason, reason, request_key; optional continued_from |
| playbook.exports.create | playbook_version_ids, name, include_sources, request_key |
| playbook.snapshot | empty object |

definitions.prepare returns the complete editable definition; preserve that
shape when saving. The source_commit field accepts the full selected 40-character
commit when one is available. expected_revision starts at 0 for a new playbook
and must equal the current revision for a change. A receiving or review
expected_revision is the current count of that edition's original observations
or reviews. Reuse the same request_key and unchanged payload after a retry.

Each editor_decisions entry is:
~~~json
{
  "bundle": "ACTUAL_CONTENT_TYPE",
  "decision": "ACCEPT",
  "reason": "THE_EDITOR_OBSERVATION",
  "file_ids": ["ORIGINAL_RECEIVING_FILE_ID"]
}
~~~

RETURN and PENDING are supported. Both the browser form and command consumer
retain multiple original files per editor. continued_from names an original
observation of this same playbook edition, inventory and role; its saved
outcomes are supplied explicitly in the new request.

## Handover and editable recovery

Create the complete handover either from a publishing playbook or from the
global Handover view. The global view can combine playbooks with the original
cohorts, content consolidations, visitor editions and POTS projects.

The existing export journal retains its immutable capture before generating
files. The same original request recovers the export after interruption.
The complete archive includes the original GovHub handover plus:

- publishing-playbooks.json: selected editions, all earlier editions and
  their editorial and receiving history, exact native bindings and source IDs;
- publishing-playbooks.html: a readable publishing and receiving report;
- publishing-cohort-inventories.csv, when cohorts are bound: the actual selected
  baseline and candidate rows, with their original plan revision and snapshot;
- editor-field-instructions.csv: content fields, instructions and owners;
- visitor-task-responsibilities.csv: complete task, route and publisher table;
- editor-receiving-decisions.csv: actual editor outcomes and source files;
- PUBLISHING_PLAYBOOK.md: the recipient's receiving instructions.

The original combined report includes the publishing arm. All selected native
operation events, observations, generated native files and editorial inventory
files are joined into the existing source-inclusive manifest and ZIP.

Every cohort binding in the selected playbook history is resolved by its
original plan_version object. publishing-playbooks.json retains those exact
versions, approval history, audits and reviews in cohort_plans. The archive
carries their snapshots, original capture/backup sources and operating history.
A later edit to a current cohort does not replace those pinned editions.
Explicit cohort selections in the global Handover view retain their current
cohort selection alongside the publishing history.

Content mappings removed from a later playbook still bring their original
family, mapping and native history into that playbook's delivery. The complete
visitor history is read through successive original 100-edition batches and
assembled into the same immutable export intent.

For a complete editable transfer, stop the existing worker cleanly and use the
existing workspace.backup operation or CLI backup command. Preserve the full
application source and original source-root paths/relocation contract alongside
that backup. Reopen it with the same application and original staff account,
then open the selected publishing edition, original native operation, content
family and visitor capture. Save the next edition or receiving observation
inside that reopened workspace.

## Source references

The application design draws on the public pattern described in Velir's
Mass.gov case study: a common Drupal publishing framework, explicit content
guidance and improved reader navigation.
https://www.velir.com/work/case-studies/mass-gov

Current Drupal APIs used by the capture are documented in the Drupal11 API:
https://api.drupal.org/api/drupal/core%21lib%21Drupal%21Core%21Entity%21EntityFieldManager.php/function/EntityFieldManager%3A%3AgetFieldDefinitions/11.x
https://api.drupal.org/api/drupal/core%21lib%21Drupal%21Core%21Entity%21EntityDisplayBase.php/function/EntityDisplayBase%3A%3AgetComponent/11.x

The installed site's native configuration, selected content and original
operating records supply the actual project inventory.
