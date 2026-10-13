# Dedicated Drupal target to complete native receiving

The complete command prepares a dedicated Drupal site, imports and enriches the
retained Federal Register editions, exercises their selected rollback and
restoration, and delivers an independently editable GovHub workspace. Its final
browser opens the actual saved sources, mappings, native operations and
comparisons at desktop and mobile widths, then downloads the successor handover.

Use the current complete GovHub application. The source distribution opens as
`govhub-operations/`, with the application in `workspace/`, its original
assessment engine in `workspace/vendor/assessment-core/`, and the unchanged
cutover engine at `cutover.py`. The existing
[application builder](../build_application.py) includes this source with the
other GovHub operations.

## Select the installed runtime and retained inputs

The maintained public-dependency collector and offline installer supply the
original installed Composer project and its `NATIVE_RUNTIME.json`. Select a
**dedicated pristine project** for this native site. The setup reads that
receipt, checks the original and materialized Composer locks, and uses its exact
PHP and Drush entrypoints.

| Selection | Required original input |
|---|---|
| Runtime receipt | Successful original installer result with project, PHP, Drush, version results and both lock hashes. |
| Drupal root | Existing original core and router inside that selected project, usually its `web/` directory. |
| Setup/receiving directory | A separate private directory for credentials, command records, original GovHub workspace and customer delivery. |
| Source archive | The complete retained two-capture archive and its SHA-256, or an existing absolute extracted source directory. |
| Browser | The installed Node/Playwright runtime and its actual Chromium executable when the host requires one. |
| Operating instructions | The selected target identity, owner, authorization reference, mapping review, native execution and recipient continuation note. |

Keep the runtime project separate from the setup directory. For example, use
`/private/govhub-drupal/` for the installed project and
`/private/govhub-receiving/` for the operation. This leaves the private account
inputs outside the original native project capture.

The supplied Federal Register source package is
`Federal_Register_Receiving_Inputs_20261012.zip`, 2,942,388 bytes, SHA-256
`2caa3cc4a7e0449403e939c59ecc57cfade705d377ae039a09583d9b218c4f21`.
Its two independently observed capture records preserve the original publication
date, complete agency/document responses, request metadata and all five selected
full PDFs. The [original case builder](sources/federal_register.py) reads the
actual records, derives the scope and keeps their source IDs and ordered keys.
The complete supplied case selects 473 agencies, 103 documents, five files,
five media entities and 103 native alias records.

For a different captured publication day, select that original complete archive,
its own digest and matching capture files. Keep each publication's source
observations and mappings together.

## Run the complete workflow

Start with [the complete specification](examples/federal_register_native.json).
Replace its absolute paths and operating instructions with the selected local
runtime, original inputs and receiving target. Keep the same specification and
operation directory for every continuation.

~~~sh
cd /absolute/govhub-operations/workspace
python3 content_consolidation/examples/run_native_federal_register.py \
  --spec /private/govhub-native.json
~~~

The specification uses schema `govhub.federal-register.native-run.v1`:

~~~json
{
  "schema": "govhub.federal-register.native-run.v1",
  "directory": "/private/govhub-receiving",
  "runtime_manifest": "/private/govhub-drupal/NATIVE_RUNTIME.json",
  "site_root": "/private/govhub-drupal/web",
  "input_archive": "/private/inputs/Federal_Register_Receiving_Inputs_20261012.zip",
  "input_sha256": "2caa3cc4a7e0449403e939c59ecc57cfade705d377ae039a09583d9b218c4f21",
  "name": "Federal Register content consolidation",
  "site_name": "Federal Register native receiving",
  "site_mail": "selected-operator@example.invalid",
  "environment_id": "govhub-federal-register-local",
  "owner": "Selected receiving operator",
  "authorization_reference": "Dedicated local target selected for this content receiving operation.",
  "review_reason": "Review the complete retained sources, native fields, references and selected receiving routes.",
  "native_reason": "Execute and continue this original reviewed source case on the selected dedicated target.",
  "recipient_note": "The receiving operator retains both source observations and the selected next editorial instruction.",
  "case_id": "govhub-federal-register-20261012",
  "migration_prefix": "govhub_fr_govhub",
  "row_limit": 100,
  "route_count": 250,
  "timeout_seconds": 600,
  "visual": true
}
~~~

When using already extracted input, replace `input_archive` and
`input_sha256` with `source_root`. The default capture paths are
`federal-register/initial/capture.json` and
`federal-register/refresh/capture.json` inside that root.
`capture` and `refresh_capture` may explicitly name their actual absolute
paths within the selected source root.

Optional fields include `node`, `chromium_executable`,
`browser_timeout_seconds`, `assessment_core`,
`max_artifact_bytes` and the initial loopback `port`. The host's existing
Playwright dependency path and browser library environment remain in effect.
A zero port selects an available port on first use; its saved URI is retained on
continuation because the original content mappings bind their receiving origin.

An optional `accounts` path selects a private original operator/reviewer/admin
JSON file. Otherwise the command creates dedicated application accounts in its
private operation directory and authenticates them through the original GovHub
password and role implementation. Existing selected accounts are authenticated
in place.

## What the command completes

The command joins the existing engines in their original order:

1. Verify the selected installed runtime and bind the dedicated site directory.
2. Run original Drush `site:install minimal` against that site's SQLite database,
   retaining the original native command record and private Drush configuration.
3. Prepare the dedicated native receiving account through Drupal's User/State
   APIs and read back its real UID, UUID and installed site identity.
4. Install the original GovHub content module and provision the Federal Register
   bundles, exact fields, JSON:API resources and native reader role.
5. Authenticate that account through Drupal's original login route and supply
   the resulting cookie to the existing native receiving adapter.
6. Configure the original GovHub staff, environment and native profile through
   the application's existing authenticated methods.
7. Use the original source builder and
   [complete case receiver](examples/federal_register_receiving.py) for the
   initial import, retained target capture, document-type enrichment, selected
   rollback and restoration.
8. Continue every native row-boundary checkpoint under its same operation ID.
9. Create the full original workspace backup, authenticate an independent
   recipient, compare native/source identities, edit the continuation note and
   export the successor handover.
10. Open that saved recipient through the original local server and
    [existing receiving browser](web/receiving_browser.mjs), then verify its
    downloaded handover against the original export's complete bytes and hash.

The native PHP server runs only while this context is active. It uses Drupal's
original router, with a local wrapper that keeps private and configuration files
out of static serving. The actual target database, installed source, accounts and
native command journals remain available for the next invocation.

## Continue the saved operation

Repeat the same command with the same specification and directory. The setup
retains the original target, runtime locks, credentials, URI and native command
inputs. Original completed commands reopen from their exact saved results.

If a native command's final reply was interrupted after its owned process was
reaped, the setup can read the same database and private account identities and
retain a distinct native reconciliation result. It preserves the original
command's recorded state. An original process whose completion is still
unresolved continues through the existing native command reconciliation path.

During migration, the existing case receiver resumes the original map and
row checkpoint. After native receiving is complete, a later invocation reopens
that completed result and the independent customer workspace before continuing
the browser phase. A completed browser result and matching original handover
download are reused.

The command returns exit code 0 only after the full native and browser receiving
result is complete. Exit code 3 returns the original pending native operation;
other failures retain their concrete command, source or browser output for the
same continuation.

## Receiving output

| Path under the selected operation directory | Retained result |
|---|---|
| `native-site/site-ready.json` | Actual native site, Drupal/PHP/runtime and receiving account identities. |
| `native-site/native-setup/` | Original Drush command/state records and complete private output. |
| `case.json` | The exact source-bound initial, enrichment and restoration case. |
| `workspace/` | Original GovHub workspace with its complete sources and operations. |
| `receipts/` | Existing case's mapping, review, plan, operation and receiving records. |
| `received/handover/` | Original full source-inclusive handover. |
| `received/editable-workspace/` | Independently reopened full private workspace. |
| `received/recipient-handover/` | Recipient's successor source-inclusive handover. |
| `browser/` | Actual desktop/mobile views, selected screenshots and verified downloaded ZIP. |
| `complete-result.json` | Joined source, native operation, receiving and browser result. |

Private native and application account files live separately in the selected
operation directory. Use the original account-management interface when
preparing access for another operator. The editable workspace and native command
records retain their normal private operational content.

## Reuse the same site helper in another native GovHub product

The site helper is [examples/native_site.py](examples/native_site.py), with
required sibling [prepare_native_site.php](examples/prepare_native_site.php).
It imports the existing native adapter and receiving utilities from the complete
GovHub application.

~~~python
from content_consolidation.examples.native_site import NativeDrupalSite

with NativeDrupalSite(
    runtime_manifest="/private/selected-project/NATIVE_RUNTIME.json",
    directory="/private/selected-operation/native-site",
    site_root="/private/selected-project/web",
    environment_id="selected-native-environment",
    site_name="Selected native application",
    site_mail="selected-operator@example.invalid",
) as site:
    ready = site.prepare()
    original_profile = site.profile
    original_command_session = site.session

    # Enable and use the selected product's original modules and commands here.
    # Its own schema/role setup grants the intended reader permissions.
    with site.authenticated_profile() as receiving_profile:
        # Pass this exact profile to the original native receiver.
        ...
~~~

`prepare()` returns schema `govhub.native-site-ready.v1` with the actual
site UUID, native environment/root/URI, receiver UID/name/UUID, native profile and
installed runtime identities. The original `site.session` is available for
the product's existing Drush commands. `site.root`, `site.project`,
`site.uri`, `site.binding` and `site.credentials_path` retain their
selected local identities.

`authenticated_profile()` supplies `jsonapi_cookie_env` as an environment
reference for the original receiver. Its cookie value exists only inside the
active context and is restored/removed when that context closes.

### Maintained native contracts

- [Original Drupal/Drush adapter and command recovery](../native_adapter.py)
- [Original native content installation](drupal/install.py)
- [Original Federal Register schema](sources/provision_federal_register.php)
- [Original complete receiving workflow](RECEIVING_WORKFLOW.md)
- [Drush site installation](https://www.drush.org/13.x/commands/site_install/)
- [Drush private configuration](https://www.drush.org/13.x/using-drush-configuration/)
- [Drupal's original JSON login route](https://www.drupal.org/node/2720655)
