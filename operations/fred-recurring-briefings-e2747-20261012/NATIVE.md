# Recurring FRED briefing: complete native operation

Operation: SCF-FRED-RECURRING-BRIEFINGS-E2747-20261012

This source delivery contains the complete recurring-briefing implementation, its original analyst source and reports, the private browser and HTTP joins, and the installed CLI, typed client and MCP integration. The native journey imports the retained three-series macro capture, saves a calendar-2025 review, saves a twelve-month template, creates its next reviewed briefing from the same complete source, downloads all three successor formats, exports the project, receives it in a fresh private directory and reopens the same complete report files.

## Source and runtime

The final FRED project module is Git blob `8ee1b1c6d54ff711a42328869c1bb71764017057`. Root source tree is `a0c012db646ac1f8d5454672c557bb91d14c4cde`; the final installed client and MCP tree is `16462058c35acdb784f398f5dc5c03031ec83f0b`. The original shared private-record improvement is adopted from public PR2268, merge `c597e6e3d7a8c6cce074663a264854bbf6ddf661`, using its complete `primitives.mjs`, `config.mjs` and `quota.mjs` sources. Its quota change is exactly the import of those original primitives; the private directory, record and lock implementations retain their original bodies.

Each delivered file retains its own exact Git blob identity, UTF-8 byte count and SHA-256.

Use the accepted owner's existing Node 22.16-or-newer Linux runtime and util-linux `flock`. The original project module owns its private directories, atomic records and file locks. The source directory and receiving work directory must be absolute owned paths.

## Run the complete journey

Save the complete source members with their canonical paths under SOURCE_DIRECTORY. Run the original runner with the accepted Node executable:

```sh
NODE_EXECUTABLE SOURCE_DIRECTORY/operations/fred-recurring-briefings-e2747-20261012/native-journey.mjs \
  --project-module SOURCE_DIRECTORY/stellar/scf-starforge-20261009/sf30-seller-sdk/fred/project.mjs \
  --expected-project-blob 8ee1b1c6d54ff711a42328869c1bb71764017057 \
  --capture SOURCE_DIRECTORY/stellar/scf-starforge-20261009/sf30-seller-sdk/fred/examples/briefing-20261012/macro-source.capture.json \
  --briefing SOURCE_DIRECTORY/stellar/scf-starforge-20261009/sf30-seller-sdk/fred/examples/macro-briefing.json \
  --review SOURCE_DIRECTORY/stellar/scf-starforge-20261009/sf30-seller-sdk/fred/examples/briefing-20261012/review.json \
  --work PRIVATE_WORK_DIRECTORY
```

Replace NODE_EXECUTABLE, SOURCE_DIRECTORY and PRIVATE_WORK_DIRECTORY with the one accepted runtime's actual absolute paths. The runner keeps four fixed operation IDs under this same project journal. Continuing the same work directory reuses those existing import, review, template and successor operations.

## Exact retained source and reporting windows

The original macro capture has Git blob `820d20e54f23f7d6c7c1f63e2598169aca411469` and capture identity `4c7fc88552da69b9448054334bad10b72afee056ed93bcd2fb741d698dde042c`. It contains 2,219 original observations: 956 CPIAUCSL, 318 GDP and 945 UNRATE records. Its retained source selection keeps the original as-of date 2026-10-12.

The first review covers 2025-01-01 through 2025-12-31. The template uses `{months:12,anchor:"latest_all",lagMonths:0}`. GDP's latest retained date label, 2026-04-01, is the earliest of the three selected series' latest dates, so the automatic successor window is 2025-05-01 through 2026-04-30. The quarterly observation retains its original April-1 period label and source frequency.

Each window contains 28 observations: twelve CPIAUCSL, twelve UNRATE and four GDP. Both monthly series retain their original missing-value marker at 2025-10-01. With the original previous-period and year-earlier comparisons, the source yields 20 NEW_PERIOD comparison rows, 20 LEFT_WINDOW rows and 36 UNCHANGED rows. The complete downloads include the comparison rows and source metadata; the project owns the saved review and report lineage.

## Complete outputs

The private work directory contains the original project, its independent received project and the outputs directory. Preserve the complete `outputs/native-result.json`, `outputs/recurring-project-bundle.json`, `outputs/successor.html`, `outputs/successor.csv` and `outputs/successor.json`.

The native result records the actual Node executable, source identities, project and successor IDs, reviewed report lineage, original source date, export identity, received revision and byte identities for each complete original and reopened download. Return those files and the receiving directory to the same operation thread so the final product delivery includes the actual saved successor and independently reopened project.
