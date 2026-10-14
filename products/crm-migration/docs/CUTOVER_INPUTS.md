# Cutover input contract

Select one source system and one destination portal for the agreed population. Each object has four separately retained CSV editions:

| Role | Meaning |
|---|---|
| Source at rehearsal | The original source population used for the baseline |
| Source at cutover | A fresh complete source population for the same agreed scope |
| Target at rehearsal | The observed destination population at baseline |
| Target before cutover | A fresh observed destination population before changes |
| Crosswalk | One source ID to one actual destination record ID |

Crosswalk entries must resolve uniquely in the source/target baseline or current selection. A baseline source record without a target identity is an input issue. Newly added source records may lack a target ID and produce a creation proposal. Newly created target IDs enter the post-change crosswalk before reconciliation. Source and target IDs are exact text; preserve leading zeroes.

## Fields

Select actual source headers and destination internal property names. Supported comparisons are exact text, trimmed text, lowercased trimmed text, exact decimal, YYYY-MM-DD date and explicitly mapped enum. Decimal calculations use integer minor units with a declared scale; they do not pass through binary floating-point. Enum maps must provide reversible target values. Empty source values become explicit clear proposals when chosen; property-clearing semantics must be implemented through the platform's supported update mechanism.

A difference already present at rehearsal is a baseline mismatch requiring a decision; it is not assumed to be an approved transform. A concurrent source/target change to different canonical values also requires a decision.

## Relationships

Each directed object pair has one family with four distinct CSV editions. Source rows contain source endpoint IDs and a declared relation label. Destination rows contain actual target IDs, association category and the actual direction-specific type ID. Retrieve custom labels from the intended portal; never reuse a reverse-direction ID.

Duplicate identifiers, ambiguous crosswalks, unknown relationship types, duplicate relationships and missing endpoints are visible input issues. A packet requires correction of those issues. If a removed source record also removes a relationship, that removal requires its own explicit decision. At most one company may remain for a relation marked primaryCompany.

## Complete population and time

All four exports must represent the same agreed population. A filtered export is not a deletion log. Retain extraction timestamps, timezone, query/filter and owner in the engagement input manifest. The application retains input content and row references; it cannot infer records omitted by an upstream filter.

The target-before snapshot is a proposal basis. The platform operator must recheck the affected IDs and values immediately before execution. Changes made after the snapshot require refreshed observations and a new plan or explicit conflict resolution.
