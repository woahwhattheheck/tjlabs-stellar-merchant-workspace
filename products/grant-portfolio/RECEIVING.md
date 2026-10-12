# Complete installed grant portfolio receiving

This runs the original Comic Relief portfolio journey from the READY standalone package,
then prepares both resulting customer workspaces as installed products.

## Select the original inputs

Use the [original source-input recipe](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/examples/comic-relief/SOURCE_INPUTS.md)
and its maintained materializer, preparation and native-input commands. The complete
input set includes the original Comic Relief IATI activity XML; the full 2015–22
international grants spreadsheet; the following 2022–26 international grants workbook;
the original historical/current comparison sources; matching registry and capture
metadata; and the original published licensing information.

The preparation retains the complete downloaded files and observation times. The native
stage uses the original IATI receiver and 360Giving publisher operator to produce three
complete handoff packets. Retain the resulting `prepared.json` and
`native-inputs.json` together with every file they name. The latter records
`nativeReceiving: complete` and the SHA-256 of the selected preparation.

Build and install the `grant-portfolio` source selection using
[Operating](OPERATING.md). Select the native publisher Python environment, an existing
Chromium executable, and the installed Playwright entry used by the original browser run.

## Run the whole installed workflow

~~~sh
starforge grant-portfolio-product-receiving \
  --runtime /srv/starforge/runtimes/grant-portfolio \
  --directory /srv/starforge/receiving/comic-relief \
  --python /srv/starforge/python/grants/bin/python \
  --native-inputs /absolute/original/native-inputs.json \
  --prepared /absolute/original/prepared.json \
  --chromium /absolute/existing/chromium \
  --playwright-module /absolute/existing/playwright/index.mjs
~~~

Use the same receiving directory and arguments to continue an interrupted run. Its
installed input binds the runtime installation, source commit, source manifest, profile,
lockfile, interpreter, native-input file and preparation. The original journey retains its
phase results and original operation inputs. The wrapper runs that same original driver.

| Native phase | Complete work |
| --- | --- |
| Original input and comparison receiving | Read the full retained sources and six original comparison artifacts; preserve the acquisition and conversion results. |
| Three native editions | Receive the full IATI and both 360Giving handoffs, retaining original source coverage and records. |
| First portfolio and review | Save the portfolio and original source-linked relationship and unmatched decisions. |
| Following coverage and edition | Receive and reconcile the distinct coverage/replacement edition and its saved decisions. |
| Desktop and mobile operation | Operate the real console, original revision tables and source detail through the browser. |
| Complete rows and finances | Traverse all seven tables and check exact original financial groups and row identities. |
| Merchant export and repeated receiving | Export the native complete file, retain its merchant manifest and download its original bytes again. |
| Customer import, cold CLI and re-export | Receive the full portfolio, stop the customer console, reopen with the CLI, repeat the same export and compare complete history, source files and financial rows. |
| Second independent customer and close | Receive the re-export in another original workspace, retain the complete foreign history, and close the owned browser, merchant and console processes. |

The installed wrapper then prepares the first and second received native workspaces as
customer products using their real saved workspace IDs. It reads both closed workspaces
through the original native command. On the complete first received customer it starts
the real native console, confirms its saved state through the typed client, kills that
owned Python process, observes the retained connection with the released workspace
lease, and reopens the same customer. The reopened console must preserve the complete
state, replace the stopped launch and remove its connection on a clean close. Repeating
receiving uses the saved recovery result and original customer state.

The console transition also survives the receiving process ending. Before launch it saves
the original command and attempt; the Linux bootstrap records the process identity before
executing the original CLI in that same process. The receiver records kill, reopen and
close intent before each transition. Reopening the same receiving directory resumes that
saved transition and controls the exact original process through Linux `pidfd` interfaces.
The completed native journey and customer preparation are reused.

## Receive the saved result

The completed run writes:

| Path | Retained result |
| --- | --- |
| `installed-input.json` | Exact installed runtime and original input selection. |
| `journey/product-journal.json` | Original native phase state, saved request IDs and progress. |
| `journey/product-result.json` | Complete nine-phase native result and customer/export descriptors. |
| `journey/customer/` | Original merchant receiving manifest, download state and complete customer ZIP. |
| `journey/reexport/` | Original CLI export and customer re-export with preserved history. |
| `customer-product/` | Prepared first customer product bound to the original received workspace. |
| `second-customer-product/` | Prepared second customer product bound to its distinct received workspace. |
| `customer-console-recovery-input.json` | Original complete customer state, workspace and installed source selected for recovery. |
| `customer-console-recovery-journal.json` | Saved recovery identity, original process attempts, readiness and kill/reopen/close progress. |
| `console-recovery/` | Private original launch intents, exact process identities and signal/exit records for each console attempt. |
| `customer-console-recovery.json` | Actual process death, stopped connection, reopened console and complete unchanged customer state. |
| `installed-result.json` | Installed selection, all native phases, both customer product paths and original full-file descriptors. |

Open the first customer using its saved product:

~~~sh
starforge grant-portfolio-workspace open \
  --directory /srv/starforge/receiving/comic-relief/customer-product --port 0
~~~

The customer can inspect every portfolio revision and original source, continue review,
export another complete handoff and reopen through Applications. Read the actual returned
file descriptors and phase results for the run's source, counts and file identities.
