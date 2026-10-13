# Tome operating workshare: complete browser receiving

This programme opens the two actual workspaces created by the original GovHub/Tome native receiver. It uses the installed GovHub application, its existing private account, original HTTP server and complete static-release views. The native A/B content, both Tome captures, reviews, releases, predecessor rollback and handover remain the selected operating input.

## Whole operating sequence

First finish the original native receiver supplied with the complete application:

`workspace/static_releases/examples/run_tome_release.py`

Keep its exact operation directory. The browser programme reads these existing files directly:

| Original retained input | Use |
| --- | --- |
| `delivery/GovHub-Tome-Native-Result.json` | Completed source, target, A/B edition, release and full handover identities |
| `results/comparison-a-full.json` and `comparison-b-full.json` | The actual two comparison IDs and complete source records |
| `operator-credentials.json` | Original account, kept private during local sign-in |
| Application `APPLICATION_SOURCE.json` | Same selected source commit and manifest digest recorded by native receiving |
| Native result `workspace` and `receiving_workspace` | Original and independently received GovHub workspaces |
| Operation `inputs/` | Original supplied source directory passed to the existing server |

The programme starts the original `workspace/server.py` for each workspace in sequence, uses its returned local URL, signs into the real browser and closes the original server before opening the next workspace. It uses the existing service lease and worker lifecycle.

It opens the release workspace and selected target, receives every page of both actual output inventories and complete path comparisons, and compares displayed paths with the original native rows. It uses the real search/change controls, opens the retained native capture/stage/publish/rollback records, downloads an exact generated file from each edition and the complete original handover ZIP through the browser. The same views are inspected at desktop1366px and mobile390px, then the independently received workspace follows the same sequence. Original target, edition, comparison and release identities are checked after inspection.

The three native downloads per workspace retain the source file ID, received name, exact byte count and SHA-256. Browser observations, page/service failures, original full page responses and screenshots are saved beside the completed result.

## Exact command

Use Node22 or later, the existing Python3.11+ interpreter and an already installed Playwright/Chromium pair. Keep the browser phase in the same living execution context as the private native operation so its original workspace, target files and account remain available.

```sh
node /absolute/receiving/run_tome_browser_receiving.mjs \
  --application /absolute/application/govhub-operations \
  --operation-directory /absolute/original/govhub-tome-operation \
  --output-directory /absolute/original/govhub-tome-operation/browser-receiving \
  --temporary-directory /absolute/owned/browser-temporary-parent \
  --python /absolute/original/python3 \
  --playwright-module /absolute/existing/node_modules/playwright \
  --chromium /absolute/existing/chromium
```

`--single-process` is available for the already-equipped cloud browser when that runtime uses it. `--no-images` retains the complete textual/native observations and all downloads without screenshots. Existing font and shared-library environment settings are inherited. The programme places Playwright/Chromium temporary files under the explicit owned temporary parent and restores the previous process setting afterward.

The original server's actual CLI receives the complete original paths:

```sh
python3 -B -u APPLICATION/workspace/server.py \
  --workspace EXACT_NATIVE_WORKSPACE \
  --source-root ORIGINAL_OPERATION/inputs \
  --assessment-core APPLICATION/workspace/vendor/assessment-core \
  --port 0
```

The server supplies its selected local port in its native startup JSON. The programme waits for this original startup response and retains stdout/stderr; it does not reconstruct a competing server.

## Reopen and continue

The selected native receiver must already be COMPLETE. The browser phase verifies its actual manifest binding before it opens either server. A completed browser result can be reopened from the same output directory when its original native result, application selection, programme and all retained output files still match.

If a browser phase fails, its full returned result includes the actual native route, observed view and error. Correct the concrete source or runtime issue, preserve that result and its original complete native operation, and run a following browser output edition. The original A/B source generation is not part of this browser programme. The application's unchanged native receiver remains the place to recover a real interrupted capture or release.

## Complete output

The top-level result is:

`GovHub-Tome-Browser-Receiving.json`

It identifies the exact native result, application manifest, selected programme source and both completed browser runs. Each original/receiving directory contains:

- `tome-browser-original.json` or `tome-browser-receiving.json`, with every operated view, all native output/comparison pages and retained operation results;
- exact editionA/editionB generated-file downloads and the complete original static handover ZIP;
- desktop/mobile target images and a mobile handover image when images are enabled;
- original GovHub server startup/error logs.

The top-level file map records the exact bytes and SHA-256 of every browser output. Keep this whole directory with the full original native operating delivery, application source package and Tome archive. Keep private commissioning accounts and editable workspaces in their selected receiving custody.

## Import into an existing browser operation

The complete source also exports:

```js
import { inspectTomeBrowser } from './run_tome_browser_receiving.mjs';

const observed = await inspectTomeBrowser({
  context,                            // the actual existing Playwright context
  baseUrl: originalServerUrl,
  credentials: {name, password},      // original private GovHub account
  completed: originalNativeResult,
  planIds: [originalComparisonA, originalComparisonB],
  outputDirectory: absoluteOutput,
  label: 'original',
  visual: true,
});
```

This entrypoint owns its page and leaves the supplied context and original server with their caller. It uses the existing `/api/govhub/` actions and standard prepared-file downloads. The supplied page and server remain with their original caller.

## Source composition

Use the complete selected application and its source manifest from the native result. Keep the browser source identity in the final native/browser package.

The original `NativeDrupalSite` helper already resolves Drush inside the same verified dedicated Composer project, checks both lock hashes, records the actual executable and installs that site's root. Select the actual dedicated runtime manifest together with that site's own Drush. Keep the same verified project and its current-relative native launcher together.
