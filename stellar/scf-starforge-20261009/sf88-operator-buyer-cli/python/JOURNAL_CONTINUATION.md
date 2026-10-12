# Continue a complete customer review

This integration carries the ten original browser, report and guide files from the
complete SCF review application into the existing customer source selection. The
reviewer can open a particular returned journal, continue in its comparison, save
the next decision and export the complete accepted review.

## Customer behavior

- Comparison links carry the exact comparison and originating return identities.
  Explicit links select their own case even when a different case was last saved.
- Incoming and returned-review lists open in the selected comparison. A visible
  control returns to all comparisons.
- An applied incoming return offers the accepted complete journal download.
  Received and applied journals link back to the comparison where further decisions
  belong, and receiving a new case clears the previous plan's visible history.
- The decision editor distinguishes retained edits, a pending save, saved decisions
  and a target without a saved decision. Late responses from an older selection
  cannot replace the active editor. Failed loads release the recovery controls.
- Journal intake keeps one operation identity and one active upload through its
  complete asynchronous receiving flow. A plan without a returned decision cannot
  offer that missing decision as a resolution.
- HTML reports lead with concise review and reconciliation summaries. Complete
  source values, journal revisions, plans, receipts and provenance remain in
  expandable sections. The report supplies expand/collapse controls and opens the
  complete record for printing.

The existing comparison engine, reconciliation writers, API routes and portable
JSON/CSV exporters supply the behavior underneath these screens.

## Apply to the current composed source

Use the source selection that produced the complete B41A customer application.
The source carrier is [SCF Complete Resource Review Application and Source](https://tokenjunkielabs.slack.com/docs/T0BRETUB5TK/F0C8G24M1DZ)
in the [original integration thread](https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791749128752199).
Its complete source packet contains 46 files and has SHA-256
`d564d9c307af7b9c742e75325ad0096d166acd623326c5b273dea5a3e266e70e`.
The larger customer source selection also includes its original Python and native
runtime dependencies.

The repository's `native-patches/customer-journal-continuation.json` contains all
ten complete replacement files with their original and resulting Git blob identities.
Run the installer and builder from this delivery checkout's Python directory.
The separate `--checkout` argument names B41A's retained composed source root:

```sh
cd /absolute/delivery-checkout/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python
python apply_review_continuation.py \
  --checkout /absolute/current-composed-source \
  --source-manifest /absolute/current-source-selection.json \
  --out-manifest /absolute/continued-source-selection.json
```

The installer validates the exact overlay, all ten original file identities and
every unchanged selected source before applying. It checks again before replacement,
writes complete files, reads back the result and creates the new explicit selection.
The selection contains the same source paths as its input. A different concurrent
edit is reported with its exact path; compose that edit with this source before
trying again. If the process stops during application, rerun the same command and
input selection. Files already at this exact resulting content are accepted.

Use this source selection with the existing builder and retain the original portable
reviews selected for the customer delivery:

```sh
python build_review_customer.py \
  --checkout /absolute/current-composed-source \
  --source-manifest /absolute/continued-source-selection.json \
  --review /absolute/complete-review.json \
  --review /absolute/complete-review.html \
  --review /absolute/complete-review.csv \
  --out /absolute/continued-customer-review.zip
```

Keep any wheel and example-data options from the original build when they apply.
The builder reads every archive member against the resulting package manifest
before publishing the new archive.

## Native receiving and publication

The existing complete receiving record is `Starforge_Complete_Receiving_Result.json`
(completed 2026-10-12 at 20:06:45 UTC). It records the original native receiving and
editing flow, independent workspace reopening, exports and browser views at 1440
and 390 pixels. Reuse that accepted programme.

For this continuation, open a saved journal return after another comparison was
last selected, follow its comparison link, save a subsequent decision and export
the complete accepted review. Reopen the received case and its original return
link in the independent workspace. Check the compact report at desktop and phone
widths and print the complete record. Preserve the resulting customer archive,
portable reports and visible browser captures together, and return their links
to the original integration thread.

Operation: `SCF-JOURNAL-CONTINUATION-90ED-20261012`.
