# Contractor pilot programme and fixed customer editions

This operator turns a complete ten-company research programme into a working prospect desk and exact customer deliveries. The Redform case uses five free profiles and five distinct additional profiles for a one-time US$20 offer. The source accepts a complete programme or an already saved workspace; the company's private records stay with that input.

## Open and use

Open `Contractor_Pilot_Desk.html` in a browser. It is self-contained and makes no network request. The links in profiles open their original public websites when selected.

Use Search and Group to review a company. Each record shows its public contact, observed service facts, current-tool qualifications, suggested opening, questions and proposed administrative comparison. Edit stage, next review, contact issue and notes. Expand the property-workflow comparison to retain the responsible operator, selected job/source records, actual product account and the review outcomes.

The 17 comparison fields follow a completed property job and original report. They do not calculate an inspection result or regulatory schedule. A contractor reviews its original technical findings. Record observed events with an ID, actual timestamp including UTC offset, source reference, recorder and note. Reusing an observation ID appends a correction while retaining the earlier entry. The summary counts the latest revision per observation ID; a manually edited stage does not silently create an event.

## Save and recover

Save in browser retains the complete proposed copy before replacing the saved head. It also keeps the earlier saved body. If another window changed the saved head, the attempted copy remains in Recovery copies and the current window stays editable. Restore saved reads the complete head; opening another file retains unsaved work before adopting the candidate.

Export full workspace carries all ten profiles, unfinished comparison/observation drafts, all observations, internal buyer briefs and every prepared customer edition. Export working CSV/report carries the current internal review. These are internal outputs. Use the selected customer-edition exports for a buyer.

Recovery export opens an independent retained body without replacing the current head. When browser storage is unavailable or full, download the current complete workspace and confirm that download before replacing it. Closing with unsaved work or an active file operation asks the browser to warn.

## Prepare the exact five the customer is offered

Select First five or Additional five, provide a new edition ID and recorder, then choose Prepare complete edition. The operation snapshots:

- the exact five profile IDs, their full research and source links;
- the current complete internal buyer brief and its identity;
- the exact public commercial terms;
- the complete JSON, CSV and readable HTML output bodies and their identities.

Choose a retained edition to export those same bodies in any of the three formats. The customer JSON contains the brief ID and digest, selected profiles and public terms; private correspondence/evidence states and internal working notes remain in the workspace. CSV rows carry edition and brief identities. The readable report names its edition and brief.

Preparing an edition records preparation. Send and payment outcomes remain the original correspondence/provider records. The Redform introduction is a separate body-only email containing five free profiles; retain its actual sent body with that case.

## Respond to an actual changed request

Export internal brief and edit it as a successor. Give it a new `brief_id` and set `parent_brief_id` to the current ID. Retain the same `case_id`. The brief uses the existing `tjlabs.revenue-buyer-brief.v1` contract and adds:

- `selection.free_family_ids`: five current profile IDs in their delivery order;
- `selection.prepared_follow_on_family_ids`: the five distinct additional IDs;
- `customer_terms`: the exact `firstDelivery`, `followOn` and `replacement` statements.

The selected groups must match the current programme. A changed segment requires an updated research programme and successor brief; importing the complete updated workspace preserves earlier briefs and editions. The operator rejects changed membership that contradicts the brief.

Opening a successor brief updates current public terms atomically. A changed commercial amount also requires changed customer-facing offer wording. Earlier editions retain their original brief, terms, profiles and output bytes. Prepare a new customer edition only after selecting the revised goods.

Keep a buyer's actual accepted scope, paid status and delivered selection separate from a proposal. A favorable human reply routes to Bryce in the original Slack case with the exact correspondence and one prepared answer; internal production continues.

## Native build and complete handover

With Node available, run:

```sh
node build.mjs complete-programme-or-workspace.json NEW_DIRECTORY
```

The output directory must be new. The command receives the exact original JSON bytes, validates the programme/workspace, and writes:

- the self-contained desk;
- complete workspace, working CSV and working report;
- all retained customer editions in JSON, CSV and HTML;
- an edition index;
- the unchanged input and build manifest.

The build does not send messages, create accounts or call product APIs. Source functions are also callable directly: `create`, `reopen`, `prepareDelivery`, `delivery` and `reviseBrief`. All imports keep full saved bodies. A changed customer output, mismatched terms, duplicate edition or broken brief lineage is rejected before adoption.

## Source and current receiving

The prospect operator derives from the maintained VesselOne programme's edit/save/recovery workflow. Its domain-specific fields have been replaced with the property/report comparison, and fixed buyer-brief delivery editions have been added. Original source bodies remain in the private complete source bank. The archive codec is the existing retained dependency.

The production JavaScript course executed the actual core and builder in V8 against all ten researched profiles: full reopen, successor terms with old-output preservation, private-data exclusion, altered-output rejection, independent term drift, wrong-parent rejection and changed-cohort rejection. The producing runtime has no filesystem, Node process or browser. Native build and rendered desktop/narrow receiving continue in the existing equipped operation with the exact complete source, rather than being described as already run.

Before presenting the application or its HTML reports to a buyer, open and use the exact outgoing artifact, inspect desktop and narrow layouts, and open its selected downloads. Follow the complete owner instruction in `AGENTS.md`. The first contact uses the separately inspected ordinary email body.
