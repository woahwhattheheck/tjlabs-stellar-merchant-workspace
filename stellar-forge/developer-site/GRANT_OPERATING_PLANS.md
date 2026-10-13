# Customer operating procedures from native SF47 plans

Use the selected native work packages to prepare a customer procedure that the
receiving operator can edit and carry forward. The procedure keeps the work,
expected completion result, price, hours, relative window, tranche and complete
original package fields. It can also retain a chosen Command finder registration
with its original source and runtime declarations.

The installed **grant-reviewer** product includes this workflow, Command finder
and Operating plans. Its source remains in the existing application, planning
and distribution components.

## Prepare the procedure in the saved submission

1. Open the existing application with `starforge grant-application --port 8787`
   and choose **Prepare submission**. Reopen the team's complete saved draft.
2. In **Planning**, receive the complete SF47 ZIP or saved plan JSON. Select the
   native file and revision. The existing planning update workflow compares a
   later revision with the saved review before applying it.
3. Select the original packages this procedure covers. In **Customer operating
   procedure**, enter its title, customer or installation, operating owner,
   useful result and receiving instructions.
4. To attach an original command, export the receiving toolkit's full catalog
   as described below. Open **Attach original toolkit registrations**, load that
   file, find the command or other registration, and select it for each package.
   Each selection keeps the original registration, source records and declared
   runtime groups with the work.
5. Choose **Create operating plan from selected work packages**. The complete
   editable JSON downloads immediately. A copy is retained in this planning
   review's **Prepared customer procedures**. Save the submission draft to keep
   that selection and all its prepared copies.
6. Open Operating plans, choose **Import complete plan**, and select the
   downloaded JSON. Assign detailed work, exact command arguments, actual due
   dates and recorded results, then **Save revision**.

The grant-side saved history retains the preparation exactly as created. Work
continued in Operating plans has its own ordered revisions. Download that full
JSON again to transfer the later procedure to another operator.

Prepared customer procedures expose the same complete JSON and standalone HTML
and Markdown handovers. Downloading a retained preparation reuses its original
plan identity and selected source. Creating another procedure gives it a new
identity.

### Open the receiving Operating plans editor

~~~sh
starforge discover serve --host 127.0.0.1 --port 8846
~~~

Open `http://127.0.0.1:8846/operating-plan.html`. Reuse that listener address for
the same browser's saved plans. The complete JSON carries all saved revisions to
a different computer, browser or listener origin.

A command selected for a package begins with its registered help arguments.
The operator enters the actual command arguments and inputs while preparing the
detailed work. Command finder can compare a saved selection with the current
toolkit without replacing the historical source.

## Export the complete toolkit catalog

From the package that will perform the customer's work:

~~~sh
starforge discover plan catalog --out /absolute/customer/toolkit-catalog.json
~~~

For a selected product in a source checkout, the same action accepts
`--source-root /absolute/checkout --selection PRODUCT`. The Operating plans
browser also offers **Toolkit catalog JSON**.

This catalog includes every registration, the full original source table,
package identity and runtime feature declarations. It travels with the
receiving toolkit. The ordinary filtered search export remains useful for
reading matching results; the complete catalog is the selection input here.

Loading a catalog only makes its registrations available for selection. The
chosen snapshots stay in the complete saved submission. The session's uploaded
catalog can be loaded again when another registration is needed.

## Prepare the same output from the command line

A complete saved submission uses its selected native file, revision, work
packages and entered procedure fields:

~~~sh
starforge grant-operating-plan \
  --file /absolute/customer/submission-draft.json \
  --customer "Receiving merchant" \
  --title "Merchant installation and operating handover" \
  --out /absolute/customer/operating-plan.json
~~~

Use the complete original native SF47 ZIP directly when a submission draft is
not part of the operation:

~~~sh
starforge grant-operating-plan \
  --file /absolute/customer/native-planning.zip \
  --revision 1 \
  --customer "Receiving merchant" \
  --out /absolute/customer/native-operating-plan.json
~~~

A saved plan exported by the native SF47 `show --part all` command is also
accepted. The original native receiver verifies the complete bytes, revision
content and original scenario calculation identities before creating the
procedure.

Useful options:

| Option | Behavior |
| --- | --- |
| `--source-sha SHA256` | Select an exact retained native file inside a complete submission. |
| `--revision N` | Select an original saved revision. A different revision starts its own selection. |
| repeated `--package ID` | Use exactly these original package IDs. Their native tranche order is retained. |
| `--catalog FILE` with repeated `--bind PACKAGE-ID=REGISTRATION-ID` | Bind an explicitly selected original catalog registration to a selected package. |
| `--title`, `--customer`, `--owner`, `--purpose`, `--receiving`, `--notes` | Set the procedure's entered operating fields. |
| `--format json` | Complete editable Operating plans JSON, the default. |
| `--format html` or `markdown` | Complete readable procedure for the receiving operator. |
| `--format preparation` | Native source identities, selected package totals and the complete operating plan. |
| `--id ID` | Set an explicit new operating-plan identity when a caller owns it. |

Every output uses a new filename and the shared create-only writer. Keep the
resulting plan and original source file together. Run `starforge
grant-operating-plan --help` for the installed options.

## Keep the native plan and operating work connected

The prepared plan records the native filename, byte count, file SHA-256, plan
identity, revision, saved content digest, scenario source and calculation
digests, exact package IDs and original selected totals. Each step contains the
full native cost row and its tranche's deliverable, measure and submission day.

Dates remain the original relative work windows from award-acceptance day zero.
Enter an actual due date in the operating editor when the deployment schedule
is known. The original native source continues to own its planning, grant,
budget, payment and calendar calculations.

For the checked-in current application candidate, select the six-package
revision with **$38,000**, **400 prospective hours** and **150 project days**.
Its package identities are:

| Native package | Tranche | Relative days | Hours | Prospective USD |
| --- | ---: | --- | ---: | ---: |
| `T1-merchant-resource-integration` | 1 | 1–30 | 80 | 7,600 |
| `T1-merchant-authority-handover` | 1 | 1–30 | 40 | 3,800 |
| `T2-provider-and-ledger-deployment` | 2 | 31–90 | 70 | 6,650 |
| `T2-deployed-threat-response` | 2 | 31–90 | 50 | 4,750 |
| `T3-mainnet-merchant-rollout` | 3 | 91–150 | 90 | 8,550 |
| `T3-production-recovery-and-handover` | 3 | 91–150 | 70 | 6,650 |

These rows come from the maintained
[`sf10_current_candidate.json`](../../stellar/scf_2026/sf47_budget_model/sf10_current_candidate.json).
A retained alternative carries its own original amounts and scope. The
procedure preserves the chosen revision's values.

## Typed composition

`@tokenjunkielabs/starforge-merchant/grant/operating-plan` exports the pure
bridge and its types. Supply the complete native source already received by
the original SF47 model and its selected planning review:

~~~js
import { prepareGrantOperatingPlan } from '@tokenjunkielabs/starforge-merchant/grant/operating-plan';

const prepared = prepareGrantOperatingPlan(nativeSource, planningReview, {
  id: crypto.randomUUID(),
});
~~~

`prepared.plan` is the ordinary
`@tokenjunkielabs/starforge-merchant/operator/operating-plans` document.
`prepared.source`, `packageIds` and `totals` keep the native preparation basis.
Use `newGrantOperatingSelection` for entered fields and bindings, and
`snapshotRegistration` from Operating plans to select an actual catalog item.

The installed command-line composition is available through
`@tokenjunkielabs/starforge-merchant/grant/operating-plan/cli`.
