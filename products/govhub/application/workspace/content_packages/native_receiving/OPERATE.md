# Operate the complete GovHub commissioning Content Packages receiving case

This operation uses the maintained GovHub application and the installed original
Drupal 11 / Content Packages 1.3.1 interfaces. It creates the explicitly authored
PILOT content on two independently owned receiving sites, then carries the actual
native archives, editorial decisions, import recovery and editable customer
backup through one GovHub workspace.

The commissioning operation identity is `GOVHUB-CONTENT-PACKAGES-COMMISSIONING-V1`. Its authored content is an isolated receiving exercise. Select two dedicated authorized sites; do not use a customer production site for the deliberate import interruption.

## Installed source and selected sites

Use a complete installed Drupal 11 project and its actual PHP/Drush entrypoints. Retain its Composer lock and successful installer receipt. Each dedicated site needs the original Content Packages release and its declared dependencies, including league/commonmark:^2.8 and league/html-to-markdown:^5.1; resolve these through that site's native Composer graph.

The exact original module archive is `content_packages-1.3.1.tar.gz`,
150,351 bytes, SHA-256
`94b7eb054cfeb53029a6ccb26898d7e8b7599e273eb4365171892852455b993c`.
Both sites need the original node, text, file, taxonomy, language and
content_translation modules, plus Content Packages. The seed creates its own
`govhub_commissioning_page` content type, `govhub_commissioning_topics` vocabulary, fields and Spanish
language through the actual Drupal API.

Install the two `govhub_receiving_boundary` files from this directory as one
ordinary custom Drupal module. Enable that module **only on the selected
destination**, before producing any preview. Its installed configuration then
belongs to every native target fingerprint.

That hook consumes one exact operation/site/root marker and exits during the
original root entity's presave event. It is inert without the operation's private
environment variable. This gives the existing importer a real Drupal shutdown
before its root SQL transaction commits.

## Retain the original profile handoff

Create one private JSON file from the actual installed sites:

~~~json
{
  "schema": "govhub.commissioning.native-sites.v1",
  "operation": "GOVHUB-CONTENT-PACKAGES-COMMISSIONING-V1",
  "source": {
    "site_uuid": "ACTUAL_SOURCE_SITE_UUID",
    "profile": {
      "source_kind": "drush",
      "environment_id": "ACTUAL_OWNED_SOURCE_ID",
      "site_root": "/absolute/installed/source/document-root",
      "drush_path": "/absolute/installed/vendor/drush/drush/drush.php",
      "php_path": "/absolute/original/php-wrapper",
      "uri": "http://actual-source-host",
      "timeout_seconds": 900,
      "max_artifact_bytes": 67108864
    }
  },
  "destination": {
    "site_uuid": "ACTUAL_DESTINATION_SITE_UUID",
    "profile": {
      "source_kind": "drush",
      "environment_id": "ACTUAL_OWNED_DESTINATION_ID",
      "site_root": "/absolute/installed/destination/document-root",
      "drush_path": "/absolute/installed/vendor/drush/drush/drush.php",
      "php_path": "/absolute/original/php-wrapper",
      "uri": "http://actual-destination-host",
      "timeout_seconds": 900,
      "max_artifact_bytes": 67108864
    }
  }
}
~~~

Run in the original materializer's actual execution environment. If its installed
paths live in a private /dev namespace, continue through that retained controller;
a separate process namespace may not expose those same paths. Preserve completed
source and customer outputs on the agreed persistent receiving path before that
controller closes.

Keep the original absolute roots and actual UUIDs. The operator retains this
handoff and refuses another site identity on a repeated invocation. The source
intake directory must be separate from the private workspace, and neither may
contain the other.

Place all five files from this directory together. Keep the password in the
original private process environment named by `--password-env`; the operation
and exported source contain its reference, never its value. A new workspace gets
the selected local administrator. An existing workspace uses its existing account.

## Run the actual native content operation

After the original materializer reports both installed sites, execute:

~~~bash
PYTHONDONTWRITEBYTECODE=1 python3 /absolute/native-receiving/operate-native.py \
  --application-root /absolute/govhub-operations \
  --profiles /absolute/private/native-sites.json \
  --workspace /absolute/private/govhub_commissioning-workspace \
  --source-root /absolute/private/govhub_commissioning-original-input \
  --out /absolute/private/govhub_commissioning-operation \
  --username govhub_commissioning-engineer \
  --password-env GOVHUB_PASSWORD \
  --phase native
~~~

The retained controller lock covers this complete operation. It owns only the
same GovHub worker and the Drush commands started for these selected sites.
There is no browser in this phase.

The source graph has a bilingual community-services root, a referenced
preparation guide, a taxonomy term and an original text attachment. The selected
destination begins with the same root UUID and a published English page.

The operator completes these original application actions:

1. Seed both owned sites through Drupal; retain the source script and its result.
2. Export the first complete source graph, preview its archive and record Return
   with the required editorial correction.
3. Correct the original source hours in both languages and the attachment, add
   accessibility guidance, and export a separate corrected edition.
4. Compare both exact native previews, retaining changed and added package rows,
   then approve the corrected candidate.
5. Apply that reviewed edition. The destination hook exits during the actual
   original entity save. The maintained early guard rolls back the unfinished
   root transaction before Drupal's shutdown commit handler.
6. Read the same original import: no committed receipt may exist, and a fresh
   native preview must retain the identical reviewed destination and target.
7. Resume that **same import ID** through the maintained operation continuation,
   then read its committed receipt and actual destination again.
8. Replay the original application request and confirm that it returns the same
   import ID. Verify the preserved English publication, newly received Spanish
   draft, linked graph identities and corrected attachment bytes.

Every completed action uses its saved original request. The environment-profile
action additionally reads its committed native profile if its reply was lost.
Original source retention also reconciles a previously committed immutable file.
The first and corrected exports retain separate native archives.

The operation finishes with `operator-native-result.json`, containing the
family, editions, comparison, review, original import, receiving read,
publication state and real shutdown/recovery records. Its native commands and
complete output remain in the original GovHub workspace. The worker closes
before the controller returns.

If an operation stops on a source or runtime error, read
`operator-progress.json`, `original-operation-followup.json` and the selected
native command's retained stdout/stderr. Correct that actual source or installed
dependency, reconcile any still-owned native process and continue this same
operation directory. Preserve its request keys, archive editions and original
import. Reopening a completed operation reads the saved result.

## Receive the same case through the editor

The selected receiving operator owns the same-workspace UI journey. Once the native worker and
controller close, use the maintained application server:

~~~bash
PYTHONDONTWRITEBYTECODE=1 python3 /absolute/govhub-operations/workspace/server.py \
  --workspace /absolute/private/govhub_commissioning-workspace \
  --source-root /absolute/private/govhub_commissioning-original-input \
  --port 0
~~~

Open the actual address printed by that server and sign in to the retained local
account. The Content Packages view must open the same saved family, both editions,
returned and approved reviews, exact comparison and recovered original import.
Inspect the original source, changes, English/Spanish publication and attachment.
The native receipt and same-ID receiving read are already present.

Use one existing installed browser for desktop and mobile receiving. Use the selected host's existing browser allocation. Preserve the actual browser result with this operation and close its
browser and application server before the final private backup.

## Deliver and reopen the complete customer workspace

Build the whole selected GovHub source with its maintained
`workspace/build_application.py`, retaining the original source lock and full ZIP
SHA. The application must match every selected source member in that package.
Keep the original Content Packages release archive beside the operation.

Run the same command with `--phase receive` and these additional inputs:

~~~bash
  --application-zip /absolute/GovHub_Content_Packages_Application.zip \
  --application-sha256 EXACT_COMPLETE_APPLICATION_SHA256 \
  --module-archive /absolute/content_packages-1.3.1.tar.gz
~~~

This calls the maintained `content_packages.receiving.receive` function. It reads
the existing native imports, creates the source-inclusive handover, builds a full
private workspace backup, reopens the original application against that backup,
and packages the complete application and original module with the workshare.
The operation then repeats that same receiving call and requires the identical
completed result.

The final `GovHub_Content_Packages_Receiving.zip` includes the editable native
workspace and its original source files, corrected archive and attachment,
reviews, comparison, applied import, native receiving records and complete
operating guide. The original Python source/seed/hook and actual seed and
shutdown records are also retained through the same immutable source intake.

The backup receiver preserves every incomplete attempt outside the final
content and resumes a completed original backup across its publication boundary.
Keep the complete final ZIP and actual size/SHA with the original GovHub commissioning case.
The receiving engineer opens the packaged application and copied private
workspace with the retained account, reviews the source and continues the same
editable workshare.
