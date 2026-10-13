# Complete installed grant portfolio receiving

Receive the selected complete application into the original customer workflow. The
maintained source roster is
[`source-files.json`](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/source-files.json);
the installed product checks every declared member against its selected runtime
manifest. Preserve the complete returned source selection when a following release
adds programme, award, staff, deployment or support files.

## Select the original operating course

Use the existing course for the customer work being delivered. Each one uses the
original portfolio workspace, saved operation identities and full native source;
their actual inputs and resulting workspace IDs remain part of that delivery.

| Course | Original maintained source and task |
| --- | --- |
| Publisher reconciliation and installed console recovery | The Comic Relief source intake and installed product journey below. It receives original editions, reviews the portfolio, delivers two received customer workspaces and reopens the same console after interruption. |
| Programme delivery | [Programme receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/examples/spc/PROGRAMME_RECEIVING.md), its original input and maintained driver. It carries programme records, source bindings, documents, corrections, submitted reports, archive, complete export, receive and historical reopening. |
| Applications and awards | [Awards receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/examples/awards/AWARDS_RECEIVING.md), its original input and maintained driver. Use the actual selected funding process and complete recorded application-to-monitoring course. |
| Staff and native deployment | [Staff operations](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/STAFF_OPERATIONS.md) and [Dataverse receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/DATAVERSE_RECEIVING.md). Keep selected identity/policy, target configuration, managed/unmanaged solution exports and actual native results together. |
| Continuing support | [Support](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/SUPPORT.md). Continue the original implementation, retained corrections and complete related handover. |

For a commissioned implementation, select the applicable original courses with the
same receiving owner and actual customer inputs. Retain already completed stages and
their output files when a later course joins the same project. A source release,
an admitted native operation and its completed result are separate saved items; use
the actual returned result to identify what the recipient can open and continue.

The Comic Relief workflow below remains the original publisher/installed-product
course. Its source-only tables and customer inputs stay intact as the broader
application grows.

## Select the original publisher inputs

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

## Preserve the complete application history

A portfolio export enumerates each retained revision's actual table list. Source-only
revisions keep their original tables; programme and award revisions add their own
registers, positions and calculation rows. Original uploaded document bytes remain
available throughout history, including replaced and archived editions.

Receive the complete portfolio with its original receiver before preparing the received
native workspace as an installed product. Retain the resulting native workspace ID,
portfolio ID, revision and snapshot returned by that operation. Use those actual
recipient values for a following edit and onward export.

Application CSV/JSON exchange is useful for the selected application records, while
the original complete portfolio archive carries the source packets, uploaded evidence
and complete register history. For a CSV intake, preserve the original uploaded CSV,
explicit mapping, selected round edition and stable application/partner/project IDs
alongside the saved import. The original browser intake and portable exchange use the
same full saved portfolio action.

For native deployments, select the complete Dataverse delivery. It retains the related
portfolio, managed and unmanaged solution packages, actual target observations and
original native requests/results. Its receiving action reconstructs those histories
through the ordinary Workspace. A support handover can carry that original native
archive together with the continuing implementation's support work.

## Continue a retained operation

Use the same input files, source selection, directory and original operation ID to
continue a saved receiving course. Read its original request and retained phase outputs
before restarting an unfinished step. Keep pending or uncertain provider operations
associated with their original native identities.

When the source release changes, follow [Operating → Upgrade the application around
the same workspace](OPERATING.md#8-upgrade-the-application-around-the-same-workspace).
A new installed source selection does not require a new customer case. Close the
owned console, select the reviewed release and reopen the same saved workspace through
the original managed Applications flow or a newly prepared standalone product.

Give the receiving operator the complete source/release selection, original source
files and their descriptors, actual resulting workspace and portfolio identities, the
saved operation results, and the editable full handover. The recipient can then read
historical records, perform its next ordinary work and export that continued history.
