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

Place these two complete modules in the same Python delivery directory as the
merged installers and their source packets:

- continue_review_customer.py
- review_continuation_receiving.py
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

Run one command using the actual paths retained by the native customer owner:

    python continue_review_customer.py \
      --customer-zip /absolute/accepted/Starforge_Complete_Resource_Review_Application.zip \
      --work-dir /absolute/original-customer-operation/continuations/customer-90ed \
      --programme /absolute/original-customer-operation/receiving-programme.json \
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
the supplied Playwright module root. It performs no package installation.

## Capture the original receiving command once

receiving-programme.json is a transport of the original B41A browser runner,
argument array and exact output selection. Fill it from that retained source and
invocation. Keep every source file needed by the original runner in source_files
with its actual absolute path, byte length and SHA-256.

The accepted result is
commons.scf-complete-receiving.v2, operation
SCF-REVIEW-RETURNS-COMPOSITION-B41A-20261012. Its browser member has schema
commons.scf-complete-customer-browser.v1. The wrapper accepts the complete result
or that original browser result. It reads the same twelve customer views and
original conflict/apply/export, independent receive/edit/reopen and incoming
return steps. The two current source overlays travel through the installed
customer selected in the original command.

Programme fields:

| Field | Meaning |
| --- | --- |
| schema | commons.scf-original-customer-programme.v1 |
| operation_id | SCF-REVIEW-RETURNS-COMPOSITION-B41A-20261012 |
| source_files | Complete original runner source rows: path, bytes, sha256 |
| argv | Actual original argument array; passed directly without a shell |
| cwd | Original runner's required working directory |
| result | Complete original receiving result JSON path |
| screenshots_directory | Directory containing the original twelve view files |
| portable_reports | Complete current JSON and HTML report paths, plus CSV when selected |
| outputs | Additional original receiving files; each has archive name and source path |

Paths in argv, cwd and output fields may use these exact tokens:

| Token | Actual continuation input |
| --- | --- |
| @@CUSTOMER@@ | The complete installed customer-review directory |
| @@SOURCE@@ | Its full repository-relative source root |
| @@PYTHON_SOURCE@@ | Its selected Python source directory |
| @@WORK@@ | The receiving directory inside this same continuation |
| @@PYTHON@@ | Actual current Python executable |
| @@NODE@@ | Selected existing Node executable |
| @@CHROMIUM@@ | Selected existing Chrome executable |
| @@PLAYWRIGHT_ROOT@@ | Selected existing Node module directory |
| @@OPERATION@@ | Original B41A operation |
| @@CONTINUATION@@ | This source/build/receiving continuation identity |

The original command must explicitly select the installed customer path. Returned
results, reports, captures and operating files stay under @@WORK@@. The runner
source itself can remain at its original retained path. This preserves the
accepted working customer state while giving the current installed source and
outputs a distinct, exact selection. Keep the native runner's original request
and continuation behavior; use its existing receiving state inputs where its
actual command requires them.

Capture that runner and invocation from B41A's retained native delivery. The saved
8,104-byte receiving JSON identifies its original outputs and installed runtime;
the captured command must come from the original receiver source and invocation.
Keep that receiving source attached to the original customer operation.

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
