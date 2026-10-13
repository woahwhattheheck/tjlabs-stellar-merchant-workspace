# GovHub site operations

GovHub is a local multi-site operating workspace for source capture, review, migration, release, recovery and complete project receiving. It retains original inputs, native commands and provider operations, editable decisions, reports and full workspace backups. All provider actions require the operator's existing selected account, environment and authorization.

Start with [START_HERE.md](START_HERE.md) and the [workspace guide](workspace/README.md). The enclosing [installed product guide](../README.md) explains the public source selection and Applications entry.

The complete source includes Drupal/Drush, Lagoon, Pantheon/Terminus, Skpr, Tugboat and Upsun providers; native POTS/CircleCI source capture; content consolidation and packages; editorial planning; visitor journeys; Tome static release/recovery; and the DNN maintenance desk. Their existing source, operation and receiving semantics are preserved.

## Reconcile supplied cutover exports

Python 3.10 or later runs the original cutover auditor using the standard library:

~~~sh
python3 cutover.py --before /private/incumbent.csv --after /private/candidate.csv --out /private/evidence --min-agencies 4
~~~

Choose the minimum cohort from the actual authorized inventory. Required columns are agency_id, canonical_url, export_sha256, backup_sha256, route_count and observed_http_status. Missing agencies, duplicates, invalid inputs, changed digests, route or URL drift and non-2xx responses remain visible. The optional approvals CSV binds each approved change to exact before/after values, a reviewer and a reason. An approval does not waive missing agencies or failed HTTP observations.

The supplied *.example.csv files are illustrative commissioning inputs. Real receiving requires original site exports, a native recovery exercise and the operator's reviewed acceptance criteria. The source application alone is not a security, accessibility or platform-compliance attestation.

## Source and private project custody

The application source has an Apache-2.0 license; included original provider contracts and third-party files retain their own notices. Public source excludes private customer cases, account values and editable runtime workspaces. Source packaging rejects case-assets/. Private project backups deliberately retain their original accounts, inputs and operation history and must stay in the selected private receiving custody.
