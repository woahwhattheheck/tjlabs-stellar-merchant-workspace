# Continue the complete SCF customer delivery

This entrypoint applies the merged journal UI and customer command changes to the
accepted complete review application, builds its installed customer package, runs
the original customer receiving programme, and saves the resulting application,
full source, complete reports and browser views.

It continues operation
SCF-REVIEW-RETURNS-COMPOSITION-B41A-20261012. Use the original native owner and
admitted runtime when invoking it. The Water source-workspace programme has its
own operation, source selection, native admission and installed product.

## Run in the original customer runtime

Use the complete continuation from the merged Python delivery directory, together
with both previously merged installers and their source packets:

- continue_review_customer.py
- review_continuation_receiving.py
- native_review_journey.mjs
- native_review_sources.mjs
- apply_review_continuation.py
- native-patches/customer-journal-continuation.json
- apply_review_entrypoints.py
- native-patches/customer-review-entrypoints.json

The first installer and packet are in merchant merge
ee93378c6557bfe859624af0c8ec6e36409b8c20. The second installer and packet are in
merchant merge 5d5a90f73e0ece6e11fda6678ee18da1bd0a5569, authored source
ba3045363ed9e2839463f6f971c9c75fa8bfe88c. The entrypoint checks every complete
installer and packet against these exact versions.

Use the accepted Starforge_Complete_Resource_Review_Application.zip:
4,513,584 bytes, SHA-256
68d20e9923d9a05b15c48f1b109a0b72c9777b4b97a987e411b76b2393ee0aa1.
Its existing durable file is libfile_656b196547a88191b0c24e3bd85b34e4,
also posted as F0C8LKVLEKG.

Retain the original receiving state and outputs in
SF88-Joined-Review-Retained-Outputs-2026-10-12.zip, posted as F0C8S84QWAY:
1,180,242 bytes, SHA-256
424053e0883e2fd6380b82def0b93e205fd8924a09bdacca66dc2ef27efb680d.
This accepted archive carries 120 members, including OUTPUTS.json and the
original incoming-browser, final return, Python-review and HTTP receiving inputs.
The command preserves every ordinary member under retained-outputs/ and binds the
archive and extracted member identities before invoking the customer journey.

Run one command using the actual paths retained by the native customer owner:

    python continue_review_customer.py \
      --customer-zip /absolute/accepted/Starforge_Complete_Resource_Review_Application.zip \
      --retained-outputs-zip /absolute/accepted/SF88-Joined-Review-Retained-Outputs-2026-10-12.zip \
      --work-dir /absolute/original-customer-operation/continuations/customer-90ed \
      --node /absolute/existing/node \
      --chromium /absolute/existing/chrome-headless-shell \
      --playwright-root /absolute/existing/node_modules \
      --library-host /absolute/existing/commons/host \
      --library-helpers /absolute/existing/library/helpers

The examples above are argument positions. Resolve them from the existing native
runtime before execution. The accepted customer receiving used Python 3.12.14,
Node 24.19.0 and Chrome 130.0.6723.116. The actual Chrome path in its saved result
was /workspace/scratch/bc0850d7ba23/browser-runtime/chrome-headless-shell.
The entrypoint checks the supplied executable paths and actual versions and uses
the supplied node_modules containing playwright or playwright-core. The selected
package identity is retained. It performs no package installation.

## Maintained customer receiving journey

The entrypoint selects the adjacent native_review_journey.mjs automatically,
records the complete source identities of that runner and native_review_sources.mjs,
and writes receiving-programme.json inside
this same working directory before dispatch. Its argument array selects the
installed full customer source, receiving directory, actual Chrome executable and
existing Playwright module root. No separate programme file needs to be assembled
for this maintained continuation.

The journey uses the selected native resource and Python receiving APIs with the
original retained review exports and immutable graphs. It keeps the original
comparison, journal-plan and incoming-return identities and records original
inputs and completed native operations in the receiving directory. Resuming uses
those same saved operations and receiving states.

Original SQLite files and their configuration are retained unchanged. A copied
library.sqlite still points at its original configured roots; the continuation
does not pretend that copying the database relocates those roots. Complete
portable exports are received through the native importer into current working
states. When an original source snapshot is required, the journey retains the
archived source identity and uses that saved snapshot.

The accepted result has schema commons.scf-complete-receiving.v2 for operation
SCF-REVIEW-RETURNS-COMPOSITION-B41A-20261012, with browser schema
commons.scf-complete-customer-browser.v1. The wrapper accepts either the complete
result or that browser result. It retains the same twelve desktop and phone views
and the original conflict/apply/export, independent receive/edit/reopen and
incoming-return steps. The current journal UI and customer command overlays are
exercised from the installed source.

The invoked process receives SCF_CUSTOMER_PYTHON,
SCF_CUSTOMER_RETAINED_OUTPUTS and SCF_CUSTOMER_ACCEPTED with the actual Python,
immutable original outputs and accepted customer paths. Current mutable receiving
state, reports and captures stay under the receiving directory. Original inputs
remain available for the same-request recovery.

### Retained original programme override

An existing native owner with a captured original command can still select it
with --programme /absolute/path/receiving-programme.json. Keep all its source
files and their identities, actual argument array, working directory and complete
output selection in that file. This uses the same original operation, lock and
receiving result contract.

| Field | Meaning |
| --- | --- |
| schema | commons.scf-original-customer-programme.v1 |
| operation_id | SCF-REVIEW-RETURNS-COMPOSITION-B41A-20261012 |
| source_files | Complete runner source rows: path, bytes, sha256 |
| argv | Actual argument array; passed directly without a shell |
| cwd | Runner's required working directory |
| result | Complete receiving result JSON path |
| screenshots_directory | Directory containing the original twelve view files |
| portable_reports | Complete current JSON and HTML report paths, plus CSV when selected |
| outputs | Additional receiving files, each with archive name and source path |
| output_directories | Explicit native output directories; every ordinary file is retained under its selected archive prefix |

Paths in argv, cwd and output fields may use these exact tokens:

| Token | Actual continuation input |
| --- | --- |
| @@CUSTOMER@@ | The complete installed customer-review directory |
| @@SOURCE@@ | Its full repository-relative source root |
| @@PYTHON_SOURCE@@ | Its selected Python source directory |
| @@RETAINED_OUTPUTS@@ | Complete immutable original receiving state and outputs |
| @@ACCEPTED_CUSTOMER@@ | Complete immutable original accepted customer and reports |
| @@WORK@@ | The receiving directory inside this same continuation |
| @@PYTHON@@ | Actual current Python executable |
| @@NODE@@ | Selected existing Node executable |
| @@CHROMIUM@@ | Selected existing Chrome executable |
| @@PLAYWRIGHT_ROOT@@ | Selected existing Node module directory |
| @@OPERATION@@ | Original B41A operation |
| @@CONTINUATION@@ | This source/build/receiving continuation identity |

The default selection includes journey-journal.json, every retained input, the
complete closed native states, the four complete JSON/HTML report pairs, the
incoming accepted download and any original CSV exports. The completed-output
check captures this whole selection before it adopts a completed receiving run.

The command must explicitly select the installed customer. Results, reports,
captures and operating outputs stay under @@WORK@@. Keep the native programme's
same-request recovery and original state inputs.

## Source and restart behavior

The command reads the full accepted customer PACKAGE.json and derives the
repository-relative selection from every source/ member. The manifest's 1,191
delivered members include generated customer documents and portable reviews.
The 46-file resource composition is one part of the full source.

The command creates immutable accepted-customer files and a separate
composed-source tree. It carries the original portable report bytes, wheel when
present, and example-data setting into the existing builder.

Ordered selections are retained in selections/:

1. 00-accepted.json records every original selected source file.
2. 10-journal-ui.json is written by the existing PR685 installer.
3. 20-customer-entrypoints.json is written by the existing PR835 installer.

After the entrypoint phase begins, a restart does not pass its changed Python
files back through the earlier UI installer. Each original installer already
accepts its own exact partially applied postimages. The final source selection
includes all four new Python/Node helpers and the actual accepted PR364 variants.

The original builder creates Review_Customer_Installed_Input.zip. The command
reopens every member, extracts installed/customer-review, and runs its original
integrity verifier. The original browser programme then receives this installed
customer source.

receiving-started.json binds the original argv and installed source before
dispatch. A child inherits the continuation lock. receiving-completed.json
binds the actual result, captures and portable reports. If the child completed
before the parent's response was saved, the wrapper adopts the complete selected
result, captures, portable reports and operating outputs in place. A missing final
file or a recorded nonzero process exit returns to the original command's
retry/repair path. The same captured command and original work directory remain. It never launches the Water operation or a separate native lease.

An incomplete provider save resumes delivery/helper-state and delivery/provider
through the existing native_library_delivery workflow. Every artifact remains
at the same path and identity; an already saved file keeps its returned provider
request and file identity. A resumed save does not rebuild the customer package
or rerun completed customer decisions.

## Complete deliverables

The delivery/ directory contains:

- Starforge_Complete_Resource_Review_Application.zip: current source, launcher,
  original reports and complete current report exports.
- Starforge_Complete_Customer_Source.zip: every selected source file and SOURCE.json.
- Starforge_Complete_Review_Browser_Views.zip: the original twelve desktop/phone
  views, complete receiving result and selected operating outputs.
- reports/: exact portable JSON, HTML and CSV selections. A changed current report
  with an original filename receives a Current_ prefix; original bytes remain.
- Starforge_Complete_Customer_Continuation.json: customer, source, view, report,
  runtime and receiving identities.
- START_HERE.md: human operating guide.
- library-result.json: saved native file identities for every selected artifact.

The entrypoint prints the completed customer/source/view/report files and actual
saved file identities. Return that result to the existing B41A integration thread,
together with the current customer file and readable report links.
