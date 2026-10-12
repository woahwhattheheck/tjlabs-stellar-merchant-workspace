# Complete managed preparation and pipeline receiving

This receiver operates the unchanged PREP12 customer project through the installed data preparation product. It continues the native SQL engine, saved source files, recipe editions, complete result files and review histories. The same Applications listener serves the source preparation workspace and pipeline editor, the typed JavaScript clients, and all 40 preparation merchant tools.

The original project contains three sources and 120,012 input rows. Its orders source has 120,000 rows, including integer identifiers outside the safe JavaScript number range. The original reviewed closed-order SQL and the independent open-order edit each produce six complete result rows. The receiver compares every result column and row to the corresponding original preparation result.

## Original case and selected source

Use the original Starforge_Data_Preparation_2026-10-12.zip from the PREP12 work order:

- Original package: 1,143,288 bytes; SHA-256 38b52c9837c81177d691127e07587894de7ae52bd6ef74013b02a18578814577.
- Inner demonstration/project.zip: 671,360 bytes; SHA-256 8fbdb47b26da8c5742f573a28dd603635a661e99122807a41c04276871d03779.
- Original Slack case: https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791829516730339.
- Product repository: https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace.

Keep receiving.py, receiving.mjs, receiving-source.json and this guide together. The source manifest records the immutable source commit and the byte length, SHA-256 and Git blob identity of every complete selected file. It also records the exact receiving driver. Select those full files from that commit in SOURCE_ROOT; the receiver checks them and freezes a complete copy before starting the customer operation.

The source selection includes the original pipeline engine, delivery and receiving modules, private managed listener, both original browser applications, typed clients, all merchant tools, Applications provider, and original seller dataset loader. It preserves the source preparation engine and the original pipeline owner’s execution, stage reuse and received-project contracts.

## Run the complete original project

Requirements are Linux, Python 3.11 or later, Node 22 or later, Playwright, and an already installed Chromium executable. Use the complete prepared browser runtime. Pass its actual executable path and the actual Playwright module path; the receiver does not install another browser.

Choose an owned private parent directory with mode 0700. For a first operation, the receiving directory must be new. In the following invocation, replace the absolute paths and select SOURCE_COMMIT from the adjacent receiving-source.json:

~~~bash
python3 /ABSOLUTE/SOURCE_ROOT/products/data-preparation/receiving.py \
  --source-root /ABSOLUTE/SOURCE_ROOT \
  --source-commit SOURCE_COMMIT \
  --package /ABSOLUTE/Starforge_Data_Preparation_2026-10-12.zip \
  --directory /ABSOLUTE/PRIVATE/preparation-customer \
  --node /ABSOLUTE/node \
  --playwright-module /ABSOLUTE/node_modules/playwright \
  --chromium /ABSOLUTE/chromium
~~~

Add --save-helper /ABSOLUTE/helpers/library_upload.py when the maintained delivery runtime is available. Keep its original sibling files library_hosted_apps.py, library_file_transfer.py, native_library_delivery.py and native_library_requests.py beside it. The receiver saves the complete closed customer archive and the full receiving result through those existing helpers.

Each invocation gets its own receiving-attempts/<id>/ directory. The original operator, preparation customer and received pipeline customer remain in the same operation directory. A single operation lock excludes a concurrent invocation against that case.

## Continue an interrupted original operation

Use the same original package and the same existing receiving directory with --continue:

~~~bash
python3 /ABSOLUTE/SOURCE_ROOT/products/data-preparation/receiving.py \
  --source-root /ABSOLUTE/SOURCE_ROOT \
  --source-commit SOURCE_COMMIT \
  --package /ABSOLUTE/Starforge_Data_Preparation_2026-10-12.zip \
  --directory /ABSOLUTE/PRIVATE/preparation-customer \
  --continue \
  --node /ABSOLUTE/node \
  --playwright-module /ABSOLUTE/node_modules/playwright \
  --chromium /ABSOLUTE/chromium \
  --save-helper /ABSOLUTE/helpers/library_upload.py
~~~

The continuation verifies the exact original inputs and manifest in that directory. managed-receiving-progress.json retains the operation ID, original managed recipe and run, customer recipe and run, pipeline ID, original and customer execution IDs, and complete export request identities. Committed recipe editions and results are read back before creating anything further. A lost create response is reconciled against the complete saved recipe and result records. Interrupted native SQL attempts continue through the original rerun command, preserving their previousRun chain and every interrupted result record. Stable pipeline request keys reuse their original executions.

The preparation phase is preserved when complete, including its full downloads and customer edit. The subsequent pipeline phase resumes the same operation. Each invocation freezes its own selected source and records its own process outcome, so an improved source selection can continue the retained case without replacing its inputs or workspaces.

Keep the operation at its existing canonical path when using --continue. For a customer receiving the finished work at another location, use the full project archive through the product’s normal receiving command.

## Complete customer journey

The receiver performs the following connected workflow.

1. **Receive and attach.** Receive the complete original project, start its existing managed application through the Applications provider, and attach the typed client and declared merchant workspace. Read the beginning and end of the original 120,000-row orders source and reselect the unchanged source file through the managed import path.
2. **Prepare and review.** Save the managed closed-order recipe, run it through the original engine, compare every result row and column with the original retained closed-order result, and append its review. Preserve every original source, recipe edition, result and review.
3. **Use the preparation browser and delivery tools.** Open Inputs, Recipes, Results and Handover on desktop and phone. Download the complete project through the browser. Retain the full project, seller dataset, report and original JSON Lines result through the merchant file tools. Interrupt the project read by detaching the merchant connection and finish the same complete file after reconnecting. Reopen the managed application and read the retained work.
4. **Make the preparation customer edit.** Receive the complete managed project into its independent customer workspace. Run the original SQL with the original open-order parameters. Save the full six-row result and export the complete edited project.
5. **Execute the saved pipeline.** Derive a pipeline from the original recipe, save edition 1 under the retained pipeline ID, and execute it under a stable request key. Use the original stage engine and compare all six result rows and columns with the original preparation output, including complete paged typed-client iteration. Review that native stage result.
6. **Use the pipeline browser and complete exports.** Open Pipelines, Inputs, Runs, Compare and Handover on desktop and phone. Download the full pipeline project from the browser. Retain its full project, selected results, report, seller dataset and original result through the 19 pipeline merchant tools and the existing whole-file delivery facility.
7. **Receive and edit the pipeline customer.** Receive the full pipeline project under a stable request key. Reopen its private managed listener through the original received-project operation. Preserve edition 1 and its execution, save edition 2 with the original open-order parameters, and run the complete customer edition. Compare every row with the independent preparation customer result and retain the customer review. Inspect the actual editor and execution comparison on desktop and phone.
8. **Close and reopen.** Export the complete customer pipeline project. Close the parent Applications owner and verify that its received-project listener also closes. Independently launch that received customer workspace again and read the same saved editions, native results and complete customer output.

The resulting files include the complete original source/project packages, closed operator and customer workspaces, source selections, both kinds of original project archive, complete seller datasets, selected pipeline outputs, reports, and the actual browser captures. The receiving JSON records the actual IDs and counts for that operation.

## Open a delivered pipeline project

A complete pipeline project contains manifest.json, pipelines.json and preparation.zip. Keep those together. The native receiver validates and restores the original source files, saved SQL, complete result files, reviews and pipeline histories.

~~~bash
python3 SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation/pipelines/cli.py \
  --workspace /ABSOLUTE/PRIVATE/new-customer receive FULL_PIPELINE_PROJECT.zip

node SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation/managed.mjs \
  --workspace /ABSOLUTE/PRIVATE/new-customer --port 0
~~~

Open the private link printed by that managed listener. Source preparation and the pipeline editor share the same private Applications lifetime. Merchant clients attach through the current preparation-connection.json and verify the workspace and instance. The listener removes that connection file when it stops; the complete saved work remains available for reopening.

## Process outcome and complete delivery

The native entry records its inner process identity and the actual outer process group/session before loading the operation. The Python controller retires only the process group it created. If the identity record is interrupted, the fallback drains that same inner group. Result reading and process cleanup are retained in the invocation’s outcome.

A completed result requires the actual receiving process to exit successfully, a recorded namespace, a drained owned process group, and the complete customer output checks. The default overall receiving lifetime is 600 seconds and can be set with --timeout-seconds. An interruption preserves the actual completed phases and closed native workspaces in that invocation’s checkpoint.

For completed work, the receiver checks all four preparation project archives and all four pipeline project archives, all original file identities in the three customer/operator workspaces, every selected pipeline result file, and both complete seller datasets using the existing native seller dataset loader. files.json records each delivered regular file and every preserved empty directory. All browser views are retained for visual review.

The customer archive includes each invocation’s selected source, receiver, process result, complete downloads and views. Applications observer directories and delivery-provider journals stay with the private operation. Open the final receiving JSON and START_HERE.md for the exact delivered paths and actual results.
