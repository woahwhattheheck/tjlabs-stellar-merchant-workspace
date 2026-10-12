# Baserow data in a Rails application

Turn an existing Baserow shared grid or table into a reviewed customer edition,
receive its complete rows and original files, and import it into a Rails
application with a full change preview, one database transaction, edition history
and a portable application handoff.

The source browser, dataset publisher, customer receiver, managed Ruby environment
and Rails operator are the maintained implementations. This product installs them
together. The private runtime retains the selected interpreter, exact lock,
dependency cache, full application database and files through receiving.

## Start with the work you have

| Starting point | Open | Complete result |
| --- | --- | --- |
| An existing Baserow grid or table | **Applications → Baserow source authoring**, or **starforge baserow-rails workspace** | Complete native observations, exact field projection, saved source versions and the original publisher |
| A published Baserow candidate | **starforge baserow-rails customer prepare** | Original selected rows, page chain, source identities and all applicable attachment bytes |
| A customer packet | **starforge baserow-rails receive** | Ruby delivery that reopens and copies without its original publisher |
| An existing finalized SF100 room | **starforge baserow-rails dataset** | The original direct Ruby dataset receiver and exact provider/query identity |
| A received dataset and an existing Rails application | [Rails application setup](../../stellar/scf-starforge-20261009/sf30-seller-sdk/developer/ruby-client/examples/rails_dataset/operator/README.md) | Authenticated source selection, complete previews, background imports, history and file receiving |
| An original native delivery, published Baserow source or existing customer output | **Applications → Ruby customer commissioning**, or **starforge ruby-customer-workspace serve** | Reviewed original source, retained customer/registration UUIDs, complete Rails commissioning, result receiving and same-directory continuation |
| A selected host Ruby executable | **Applications → Ruby environments**, or **starforge ruby-runtime serve** | Private Bundler installation, exact lock, full logs and resumable customer operations |
| A commissioned application directory | **Applications → Received Rails application**, or **starforge ruby-runtime launch** | The original Rails operator over its own managed database, source, previews and history |
| A completed original Baserow source journey | **starforge baserow-rails commission** | Copied client, customer and closed application, followed by independent reopening |

Read the [operating guide](OPERATING.md) for the source, publisher, customer and
application workflow. The [installation and receiving guide](RECEIVING.md)
contains the complete selected build, runtime setup and original-source
continuation.

## Use the product

From this repository:

~~~sh
node products/baserow-rails/cli.mjs --help
node products/baserow-rails/cli.mjs workspace init \
  --directory /absolute/private/baserow-project
node products/baserow-rails/cli.mjs workspace serve \
  --directory /absolute/private/baserow-project --port 0
~~~

An initialized source can import a retained capture without live credentials.
For live access, select the actual private connection file described in the
operating guide.

The installed command is:

~~~sh
starforge baserow-rails --help
~~~

Build this complete source product with the original distribution builder:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref HEAD --selection baserow-rails \
  --out /absolute/private/baserow-release
~~~

The build receipt retains the exact resolved commit, selection, archive and
complete source manifest. Keep the archive and its SHA-256 together.

## What travels with the edition

A Baserow customer edition includes the original API server and selected grid or
table, filters and field ordering, captured field definitions, public aliases and
encoding/null decisions, exact published run and candidate, every selected
native dataset page, complete JSONL/CSV/review files and the original selected
attachments. File references retain their row, provider field, file index and
customer column alias.

The Rails importer binds the original logical source/query and configured target
scope to its stream. It compares every row, retains source values and applied
target state, and commits the selected edition and receipt in the same database
transaction. The operator keeps the received source used for each preview.
A complete application handoff contains that source, mapping, database, previews,
receipts and history; its receiving program checks the actual current target
values after reopening.

## Maintained source

This standalone edition incorporates the complete original source from:

- [Typed dataset and transactional Rails integration, PR1952](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/1952).
- [Direct finalized-dataset receiving and portable application, PR2019](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2019).
- [Baserow customer files and complete Rails operator, PR2088](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2088).
- [Managed Ruby environments and complete Rails application receiving, PR2188](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2188).
- [Original-source customer commissioning workspace, PR2230](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2230).
- [Original Superset and Directus native customer identity, PR2187](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2187).

The source-specific [Baserow guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/baserow/README.md),
[customer API](../../stellar/scf-starforge-20261009/sf30-seller-sdk/baserow/customer/README.md),
[transactional importer](../../stellar/scf-starforge-20261009/sf30-seller-sdk/developer/ruby-client/examples/rails_dataset/README.md)
and [operator integration](../../stellar/scf-starforge-20261009/sf30-seller-sdk/developer/ruby-client/examples/rails_dataset/operator/README.md)
remain in their original source directories. The [managed Ruby guide](../../stellar/scf-starforge-20261009/distribution/ruby-runtime/README.md)
and [environment desk](../../stellar/scf-starforge-20261009/distribution/ruby-runtime/workspace/README.md)
cover installation, operation, complete export and offline receiving.

The [customer commissioning desk](../../stellar/scf-starforge-20261009/distribution/ruby-runtime/customer/README.md)
connects original native or Baserow source review, existing customer adoption,
full original worker output, exact application registration and complete result
receiving. Its existing-runtime controls cover private installation, live Rails,
stopped export and offline receiving in the same operating directory.
