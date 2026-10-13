# Lightdash operating plans in Applications

The installed Lightdash product has two explicit Applications choices. **Lightdash commissioning** opens the original source workspace, browser and authenticated Merchant MCP. **Lightdash operating plans** opens the procedure editor through that already-running project's MCP. Both choices refer to the same prepared private project.

Use this guide with the product's operating-plan guide, README and RECEIVING.md. The procedure editor belongs to the same selected product source and original Applications runner; it does not create another commissioning workspace, service account or managed runtime.

## Choose the application for the work

| Application choice | Command | What the process owns | What Stop closes |
| --- | --- | --- | --- |
| Lightdash commissioning | `lightdash-project serve --project ABSOLUTE_PROJECT_DIRECTORY` | The original project, authoring host and authenticated MCP, including its original workspace lifetime | The original host after accepted work drains |
| Lightdash operating plans | `lightdash-operating-plan serve --project ABSOLUTE_PROJECT_DIRECTORY` | One loopback procedure-editor HTTP listener and one authenticated client of that original MCP | That editor's accepted HTTP work and borrowed client |

Start the commissioning application first. Keep it running while the procedure editor is in use. Close the procedure editor before stopping the commissioning application. Closing the editor leaves the original commissioning application available to its other authorized clients.

Preparing or starting the editor does not dispatch a dbt, warehouse or Lightdash commissioning command. Procedure edits, reviews and later explicitly selected execution retain the original procedure and request identities through the source-owned operating-plan tools.

## Required original state

Select an existing project prepared by `lightdash-project prepare`. Its `project.json` identifies the installed runtime, complete original application, private commissioning workspace, declared source inputs and authenticated connection. The original project's `session.json` must describe an OPEN host. That host has its own instance ID and authoring instance ID.

The editor requires the installed release that belongs to this project. Applications checks the project file, original workspace identity, selected installation manifest and complete executed source. The entire operating-plan source must be present in the original product manifest; copying only the browser or CLI is insufficient.

Keep the project and its credential files private. The token remains in its existing file. Neither an Applications setting nor a startup announcement includes the bearer token. The MCP endpoint is a loopback address; possessing its URL alone is not authorization.

## Open the editor through the existing Applications interface

1. Open the original Runtime Workspace that holds the selected Lightdash runtime.
2. Select **Lightdash commissioning**, choose the prepared project directory, review its original prepared request and Start. Use the returned Open action after that application's startup completes.
3. Select **Lightdash operating plans** and choose the same project directory.
4. Review this editor's prepared request. It binds the exact project, workspace, installation manifest and currently OPEN host instance. Accept and Start through the same Applications workflow.
5. Open the editor at the actual returned loopback URL. The Applications result also retains the original authenticated MCP endpoint as a link.
6. Use the editor's complete procedure workflow. Its persisted procedure records and request IDs remain in the existing original workspace. Consult the operating-plan guide for the supported actions and review rules.

An editor Start has its own original Applications request/run UUID. Keep that ID when a response is lost. Reconcile the same run through the original Applications history and recovery controls; do not create another run to guess whether the first one started.

The loopback port is assigned by the actual listener. A previous URL is not a readiness receipt. Open the address returned for the current Start.

## Preparation and startup identity

The editor uses a separate Applications resource key:

```js
objectDigest({family: 'lightdash-operating-plan', directory: absoluteProjectDirectory})
```

It deliberately does not claim the commissioning application's project/workspace resource keys. This permits the original host and its borrowed editor to coexist, while the managed runner still prevents a second editor run claiming that same resource.

The prepared command retains these exact source-owned flags:

```text
serve --project ABSOLUTE_PROJECT_DIRECTORY
  --expected-project-sha256 PROJECT_FILE_SHA256
  --expected-workspace-id ORIGINAL_WORKSPACE_UUID
  --expected-workspace-identity ORIGINAL_FIXED_IDENTITY_SHA256
  --expected-manifest-sha256 INSTALLED_MANIFEST_SHA256
  --expected-host-instance-id ORIGINAL_OPEN_HOST_UUID
  --expected-authoring-instance-id ORIGINAL_AUTHORING_UUID
  --startup-json
```

These flags are produced by Applications preparation. Do not copy old values onto a different host or edit a retained request after Start. The CLI validates the selected identities before creating the listener.

Successful managed startup emits a compact JSON line with schema `stellar-forge.lightdash-operating-plan-startup.v1`, status `LIGHTDASH_OPERATING_PLAN_READY`, phase `OPEN` and `nativeDispatch:false`. It includes the actual editor instance ID, original host/authoring IDs, project/workspace/source identities, browser URL, original MCP URL and process ID.

Before emitting the line, the CLI retains the identical announcement in the private file:

```text
PROJECT/operating-sessions/EDITOR_INSTANCE_UUID.json
```

The observer derives this filename from the validated editor UUID. It accepts no arbitrary receipt path from stdout. It verifies that receipt, the original OPEN session, the fixed workspace identity and the complete selected/executed source before returning a browser URL. No startup record alone proves completion of a commissioning procedure or provider operation.

The original commissioning startup schema and request preparation remain unchanged.

## Stop, interrupted startup and reopen

Use Stop on the editor's own original Applications run. The CLI closes admission, drains accepted HTTP requests and closes the borrowed MCP client before ending. Its per-instance receipt then becomes CLOSED. The commissioning project's `session.json` and host lifetime remain owned by that original process.

When startup is interrupted, use the original run's history and recovery. A returned run ID, a printed URL or a leftover OPEN receipt is not proof that its process has closed. The original Applications runner's terminal/process reconciliation remains the authority for retiring the run and releasing its resource.

For a later editor session, prepare a new Start against the actual current OPEN host. A commissioning host that stopped and reopened has a new host/authoring instance. The old editor request must fail its identity check; the editor does not silently attach to a replacement host.

Every editor instance has its own receipt. Closing an older instance cannot overwrite the receipt for a newer direct or managed editor. These files describe process lifetimes; they do not replace the original procedure/request history.

## Direct installed command

An authorized local operator can run the same installed command against an already-open project:

```sh
node /ABSOLUTE_SELECTED_SOURCE/stellar/scf-starforge-20261009/distribution/cli.mjs lightdash-operating-plan serve --project /ABSOLUTE_PRIVATE_PROJECT
```

Use the actual selected source and project paths. The default is a loopback listener on an assigned port. The optional `--port N` selects a local port. Ctrl-C or SIGTERM follows the same HTTP/client drain. The original project's credentials and session stay in its private directory.

The ordinary command's JSON output is a locator for this running editor. The managed `--startup-json` contract is stricter and is generated by Applications preparation; use the normal Applications workflow for managed Start/Open/Stop/recovery.

## Resolve a refused launch

| Observed condition | Continue the existing work |
| --- | --- |
| Original session is absent or CLOSED | Start the existing commissioning application and select its same project again. |
| Original host or authoring instance changed after preparation | Reconcile any existing editor run, then prepare a new editor request for the actual OPEN host. |
| Project, workspace or installation identity changed | Review the original project's source/installation change. Do not alter the retained request to force it through. |
| Selected source differs from executed source | Run the complete installed product selected by the prepared project. Preserve the old operation while correcting the installation/source selection. |
| Editor receipt is missing or differs from the announcement | Retain the original run and its output; use its original startup failure/recovery result. Do not treat an unverified URL as an accepted managed application. |
| Stop or process outcome is unresolved | Keep the same run/resource and use the maintained Applications recovery. Do not start a competing editor or stop the commissioning host merely to clear a receipt. |
| HTTP/client drain reports failure | Preserve that exact child and its original lifecycle records until the managed runner confirms closure. |

## Whole delivery and operating status

A complete delivery contains the existing Lightdash project/application source, operating-plan modules and browser assets, both Applications descriptors, this guide and the original receiving instructions. Product selection and contribution registration stay in the same maintained `lightdash-commissioning` source cohort.

The original installed receiving programme remains the native execution owner. This Applications integration adds the procedure editor's managed launch and borrowed-host binding. Source publication or parsing is not a claim that the new editor has completed a native/browser receiving journey. Record that result only when the existing receiving operation actually returns it.
