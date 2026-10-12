# GTFS Schedule merchant

Operate a complete transit feed as a reviewed data product. The GTFS Schedule
merchant retains the publisher's original ZIP, creates exact service-date
editions, compares changes, publishes a complete dataset and keeps the source,
merchant and receiving history together.

The browser, terminal and merchant MCP provider operate the same private
workspace. **Applications → GTFS Schedule merchant** starts its original command,
checks the saved workspace identity against the live listener and retains the
normal managed Stop and reopen controls.

## Complete a customer task

A transit operator, planning consultant or downstream application can select
the actual agencies, routes and service dates needed for a recurring timetable
or service-analysis task. The edition includes the complete original tables
chosen by the operator and three explicitly defined schedule resources:
scheduled trips, scheduled stop calls and non-exact frequency windows.

The product preserves the original agency timezone and service date, including
times after midnight. Calendar exceptions and exact-frequency departures use the
source's actual rules. Unscheduled headway service keeps its original windows.
The operator can inspect every retained source row and use the original
publisher to select an exact resource, review its columns and publish its full
candidate.

| Work | Original result |
| --- | --- |
| Retain a feed | Complete original ZIP, every member, table inspection and source hashes |
| Save a service edition | Original source tables, exact dated schedule resources, saved selection and complete Frictionless capture |
| Review a change | Full keyed additions, removals and changes, plus the original before/after identities |
| Record a decision | Named reviewer, selected edition or comparison, verdict and explanation |
| Publish | Original plan, extraction, complete candidate, explicit review and dataset version |
| Offer the dataset | Original SF82 seller package, explicit native payment terms, source and dataset binding |
| Deliver useful output | Complete selected buyer result or complete retained merchant files with original byte identities |
| Transfer the workspace | Complete archive, verified receiving, relocated publisher paths and reopened histories |

A recurring customer task names its input, useful output, service-date selection,
publication cadence, receiving application and budget. The customer's approved
payment unit remains the original request or purchase. Multiple pages needed to
finish one task remain attached to that task and its aggregate spending cap.

## Install the selected product

The source-owned recipe is
[gtfs-schedule.json](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/selections/gtfs-schedule.json).
Use the original pinned builder and runtime installer:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --ref FULL_SELECTED_COMMIT \
  --selection gtfs-schedule \
  --out /absolute/private/gtfs-release
~~~

The build receipt identifies the complete archive and its SHA-256. Prepare that
exact archive in a new private runtime:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/private/gtfs-runtime \
  --archive /absolute/private/gtfs-release/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/private/gtfs-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/private/gtfs-runtime --load --source
~~~

The [complete operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/gtfs-schedule/OPERATING.md) continues through runtime attachment,
managed Start, feed import, edition and plan review, merchant configuration,
native buyer receiving, full export, cold receiving and subsequent updates.

Use Linux with an installed Node 24 release, Python 3.11 or later with timezone
data, and util-linux flock. The original dataset workspace uses Node's SQLite
interface; complete archive receiving uses Linux create-only atomic rename.
The original runtime profile installs the pinned payment, schema and MCP
dependencies. GTFS parsing uses Python's standard library and the retained
original source engine.

## Open and keep one workspace

From the installed command, initialize a private workspace and open its browser:

~~~sh
starforge gtfs init \
  --workspace /absolute/private/transit \
  --title "Transit schedule"

starforge gtfs serve \
  --workspace /absolute/private/transit \
  --port 0
~~~

When operating through a prepared runtime, prefix those arguments with
~~~sh
starforge runtime-install run --dir /absolute/private/gtfs-runtime --
~~~
and append the desired original command after the final separator.

Save the workspace UUID and retain its complete directory. Managed Applications
can create a new workspace or reopen this same directory. A separately launched
CLI, managed Application or MCP process acquires the original native workspace
lease; close that owner before another process opens it.

The product's limits are explicit: a complete feed ZIP up to 16 MiB, expansion
up to 128 MiB, at most 64 publication resources, and the original publisher's
1,000,000-row and 64-column ceiling per resource. A derived schedule selection
covers at most 367 inclusive service dates. Choose the complete period and
routes that fit the agreed task. The original ZIP and unselected members remain
retained.

## Interfaces and source

The selected package registers fourteen native commands, including gtfs,
frictionless, merchant-providers, releases, the merchant MCP transports,
buyer/dataset acquisition and runtime management. Its thirty-one exports include
the original GTFS source, saved model, browser, merchant adapter and tool catalog.
The configured merchant provider is gtfs-workspaces; the managed application is
gtfs-schedule.

| Contract | Source |
| --- | --- |
| Input, service dates, saved requests and complete command reference | [Original GTFS guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/gtfs/README.md) |
| Browser, CLI, SDK and immutable saved model | [GTFS source](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/main/stellar/scf-starforge-20261009/sf30-seller-sdk/gtfs/) |
| Original publisher plans and review | [Publisher catalog](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar-forge/mcp-merchant-operator/catalog/publisher.mjs) |
| Managed source selection and installation | [Source selections](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md) |
| Complete archive and receiving | [Original archive implementation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/gtfs/archive.py) |

The fifteen GTFS implementation files are carried intact from public source
PR 1982, merged at
[d60d878e9c7c042c58b26b9ec5aaee8e99ffd5a0](https://github.com/woahwhattheheck/public-commons-sprint-2026/commit/d60d878e9c7c042c58b26b9ec5aaee8e99ffd5a0).
This standalone adoption adds its complete product recipe and operating entry
and carries the same publisher file-helper import that allows the source-owned
GTFS provider to load. Current compatible runtime, release, buyer and source
implementations retain their repository ownership.

Each installed archive records its actual selected commit, source recipe and
complete file identities. Preserve that archive, its runtime profile and the
workspace export when handing the product to another operator.

Copyright TokenJunkieLabs. MIT; original source and applicable third-party
license notices remain with the complete package.
