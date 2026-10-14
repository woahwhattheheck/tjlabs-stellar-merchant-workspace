# Input contract for a CRM migration rehearsal
Agree the following for each customer before receiving real data.

| Area | Required definition |
| --- | --- |
| Population | Portal/system, object types, inclusion/exclusion filters, extraction cut-off and timezone, complete export pagination, archived/deleted-record policy |
| Original identity | Distinct source IDs and filenames, export operator/time, unchanged CSV bytes |
| Contact/company/deal identity | Legacy ID, observed HubSpot Record ID and explicit crosswalk, or a documented shared unique key with explicit normalization |
| Fields | Source column, target column, exact comparison type, blank policy, uniqueness, stage/pipeline enum dictionaries, decimal scale and currency columns |
| Associations | Directed from/to objects; source relationship name; target category/type ID from the actual portal; configured single-primary types; explained exclusions |
| Target observation | Independently exported actual target records and associations after the rehearsal import, with the same declared population |
| Review | Named delivery lead, accountable correction owner, approved exception reasons and decision scope |
| Rehearsal editions | New source IDs for corrected files and new configuration/run IDs; prior editions stay intact |

Contacts may be matched through an explicit Record ID crosswalk even when email changes. A crosswalk is not inferred from row position. Import identifiers and duplicate behavior depend on the actual HubSpot import recipe. Verify that recipe alongside the offline comparison.

Association labels are display text. Custom type IDs differ by portal and association direction. HubSpot-defined contact-to-company Primary is type 1, while company-to-contact is a different direction; the saved contract must represent the actual source and target direction. Default unlabeled links may coexist with a primary/custom relationship, so any exclusion is explicit and counted.

Complete target exports include all rows in the agreed scope, including unexpected records. The comparison identifies additional target rows rather than silently dropping them. All currency values use explicit codes and exact decimal rules; no currency conversion is inferred.

The browser import expects UTF-8 CSV with a comma delimiter, distinct nonempty column headings and consistent row widths. Quote commas, double quotes and multiline cells according to CSV conventions. The maintained parser retains physical line references.
