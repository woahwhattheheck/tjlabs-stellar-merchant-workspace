# Receive the actual publisher review in a browser

This companion operates the complete original `receive_export_review.py` programme in its existing case. It uses an installed Playwright module and Chromium executable, the actual local operation directory, the real native preview, and the complete named decisions already selected for this review.

## Original sequence

1. Run the existing programme with its actual configuration and original IATI source to prepare both genuine XML editions and financial catalogs.
2. Supply the actual mapping with `--mapping`. Retain the returned mapping SHA and complete native previews. A reviewer inspects these previews and supplies the named review decisions for the actual editions.
3. Start an existing loopback HTTP server rooted at the operation directory. Select the installed runtime in a private configuration. Run this companion in `review` mode. It opens the real undecided form at desktop and phone widths, enters the supplied named decisions, exports the actual browser download, and checks the complete downloaded JSON against that original input.
4. Pass the returned browser `review.json` to the original programme's `--review` mode. This performs both native preview/review validations before either financial save, then the original saved history, complete exports, independent receiving and cold reopen.
5. Run the companion in `handover` mode in a different output directory. It downloads and verifies every complete file in the actual 21-file handover, opens the delivery page, renders both original edition reports and the independent receiver's report at desktop and phone widths, and opens the retained original preview from its real delivery link.

Use the actual supplied reviewer identity and decision. For an internal engineering demonstration, record the engineering operator and that purpose explicitly. The companion never creates a client decision from an issue code or selects approval automatically.

## Configuration and command

```json
{
  "mode": "review",
  "root": "/absolute/original/operation",
  "origin": "http://127.0.0.1:actual-port/",
  "outputDirectory": "/absolute/original/operation/browser/review",
  "reviewInput": "/absolute/actual-named-decisions.json",
  "playwrightModule": "/absolute/existing/playwright-wrapper.mjs",
  "chromium": "/absolute/existing/chromium"
}
```

```sh
node open_review_course.mjs /absolute/private-browser-configuration.json
```

For the second mode use `"mode": "handover"`, select `browser/handover` as the output, and omit `reviewInput`. The same root contains the original `delivery/HANDOVER.json`. Use a real selected port and existing loopback server. The runtime's original environment, native library path and font configuration are inherited unchanged. Preserve the original runtime wrapper's actual arguments when the installed binary requires them.

## Source and case continuity

Each output directory retains `binding.json`, binding the complete companion source, actual mode, original root and complete decision input or handover manifest. A changed input or source requires its own explicitly selected output directory; the original result remains available. Progress and result files are atomically published. The browser closes in the same invocation before the final receiving result is declared closed.

The `review` result contains the actual downloaded decisions and screenshots of the undecided and completed form. The `handover` result contains exact downloaded file descriptors and desktop/phone page observations. Viewport screenshots preserve a readable view without generating an unbounded image for a large financial report; the complete report bytes are separately received and checked.

The complete original programme is [receive_export_review.py](receive_export_review.py), and [README.md](README.md) explains its three-stage source-to-handover workflow. This companion receives that same original case. Whole-source review is complete; actual application/browser completion belongs to the original runtime result. Follow the producer's rendered-output instruction in the guide and open/look at actual screenshots, reports, downloads and reopened package before presenting them.

The browser comparison follows the native review normalization: actor and note are trimmed, unique acknowledgment IDs are compared in sorted order, and every other preview/definition field remains exact. The actual downloaded decision JSON is retained unchanged and is the input to the original programme.
