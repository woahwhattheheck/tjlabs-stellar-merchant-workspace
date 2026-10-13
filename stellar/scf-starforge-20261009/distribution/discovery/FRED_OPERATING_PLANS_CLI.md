# Economic Operating Plans from original FRED projects

The installed `fred-economic-editions` selection includes `starforge fred-operating-plan`, the existing Command Finder and the original economic workspace. The command prepares a complete customer procedure from retained project evidence and receives that same source into another operator's workspace.

## Keep one original source operation

Create a private request JSON for `capture` with the existing project directory, an isolated output directory and an explicit retained `capturedAt`. Optional `publicationIds` selects the original completed current-publication editions; omit it or use null for the native default. Preserve the exact request across interruption.

```sh
starforge fred-operating-plan capture --request capture-request.json --out captured-source.json
```

Native `captureFredOperatingSource` retains the complete original project bundle, exact source descriptor, source manifest and selected original publication files. Its returned `sourceFile` is the exact expected-source descriptor for subsequent inspection and receiving. The command writes the complete native source result, excluding only `reused` and `projectReceipt`, which are replay observations. The returned JavaScript value keeps those observations. The output receipt identifies the source, project and exact receipt file bytes.

Inspect the package with a request containing `directory` and that complete `expectedSource`:

```sh
starforge fred-operating-plan inspect-package --request inspect-request.json --out inspected-source.json
```

This checks the complete source package through its original native inspector. Use the returned compact `source` for procedure creation and pure MCP tools; native inspection remains responsible for original full file bytes.

## Create an editable customer procedure

The creation request contains `source`, the complete actual `catalog`, a stable `id` and explicit `savedAt`. Optional fields are `title`, `customer`, `owner`, `period`, `registrations` and `argvByPhase`. Registrations map phase names to actual catalog IDs. Retained argument arrays belong to those exact selected registrations.

```sh
starforge fred-operating-plan create --request create-request.json --out original-plan.json
```

The ten economic phases are sources, acquisition, review, recurring, releases, migration, historical, publications, customer and handover. Their original operations remain available through the economic workspace. Creating a plan records the selected procedure and its input/source history.

The plan is the existing generic OperatingPlan, with every revision retained. Continue customer edits in the existing Operating Plans editor or typed model. The catalog comparison keeps the exact original registration and reports a changed or missing current entry.

```sh
starforge fred-operating-plan compare --plan original-plan.json --catalog current-catalog.json --out comparison.json
```

## Record returned work

A record request contains the retained `source`, `stepId`, `status`, `result:{summary,evidenceIds}`, explicit `savedAt` and optional `owner`. Use the exact step ID from the saved plan and the source's original evidence IDs. The pure economic model binds reviewed results to the selected original project and operation lineage.

```sh
starforge fred-operating-plan record --plan original-plan.json --request result-request.json --out continued-plan.json
```

Retain the entire returned plan and the complete accompanying source. A historical selected view remains a view of the original whole document; a new result continues against its current history.

## Receive complete source and plan

A receiving request contains `sourceDirectory`, `destination`, the exact `expectedSource`, and optionally the complete `plan`. Native receiving reopens the original project under `destination/project-workspace`, preserves the original bundle and selected publication archives, and attaches those existing completed editions through the original API.

```sh
starforge fred-operating-plan receive-source --request receive-request.json --out received-source.json
```

The same source package and request continue an interrupted operation. The native receiver validates existing destination bytes and the original source identity. The `receiptFile` and publication receipts retain the original binding; the stable CLI output excludes dynamic `projectReceipt` observations.

For plan-only receiving, the generic receiver preserves a later existing head when incoming content is an identical prefix, extends matching longer history and rejects divergent shared revisions. Supply the complete original documents.

```sh
starforge fred-operating-plan receive --plan incoming-plan.json --existing current-plan.json --out received-plan.json
starforge fred-operating-plan show --plan received-plan.json --format html --out customer-plan.html
starforge fred-operating-plan show --plan received-plan.json --format markdown --out customer-plan.md
starforge fred-operating-plan show --plan received-plan.json --format json --out customer-plan.json
```

`--revision N` selects a readable historical HTML/Markdown view. JSON always contains the complete editable history. The selected revision must exist even when JSON is requested.

## Files and replay

CLI request and plan documents allow 32 MiB each. Native source packages allow 4 GiB total, original project bundles 480 MiB, and descriptor/manifest files 32 MiB. Large source bytes stay in the native source package; MCP input contains the compact descriptor and complete plan/catalog JSON. Original per-family project validators keep their existing schema limits and source semantics.

Output files use the existing create-only writer. An identical complete file is acknowledged with its original hash; different existing bytes remain preserved and require a distinct output path. Parent directories must already exist. Keep original IDs, timestamps, expected source descriptors, requests and output filenames for replay. Native cancellation is the caller's AbortSignal; it is not a JSON request field.

## Typed entrypoints

- `@tokenjunkielabs/starforge-merchant/operator/fred/operating-plan`: original economic pure model.
- `@tokenjunkielabs/starforge-merchant/operator/fred/operating-source`: native source capture, inspection and receiving.
- `@tokenjunkielabs/starforge-merchant/operator/fred/operating-client`: typed local pure client and the exact MCP request dispatcher.
- `@tokenjunkielabs/starforge-merchant/operator/fred/operating-cli`: installed parser and main entrypoint.

The native source receiver owns project and publication persistence. Pure client calls return complete JSON values for the caller's existing persistence.
