# SCF grant delivery calendar receiving

Continue **SCF-GRANT-DELIVERY-CALENDAR-9125-20261012** with the original 7E4E case **operation-6ee58b0295754b83b492112f68ab9c4c**, version **36**.

This driver operates the original native Operations classes and browser application. It receives the retained case, preserves all saved forecasts and portfolios, creates an explicit WALKTHROUGH from the same immutable plan, and retains the whole three-tranche calendar operation. It uses the original Decimal calculator payout amounts and original cost IDs. The walkthrough includes the three payment-derived completion clocks, the final payment, complete/partial/undated assignments, an issuer-confirmed extension, and a prepared/submitted tranche completion form.

The browser opens the original retained case and walkthrough, uses agenda and month, follows the original completion clock, exports the full ICS/CSV/JSON while an owner filter is selected, opens desktop and phone layouts, and reopens the same saved case in a fresh browser session. The package includes the original and operated cases, native workspace SQLite backup, calendar downloads, saved assignments, prepared completion, and screenshots.

## Existing native host command

Use **calendar_receiving.py** from this directory. Select the complete maintained Merchant checkout at **e16268737dbeb1852861c30c3838e9118511973e**, or the calendar author's integrated successor, and use the original case archive:

```sh
python3 calendar_receiving.py \
  --source /absolute/path/to/tjlabs-stellar-merchant-workspace \
  --source-commit e16268737dbeb1852861c30c3838e9118511973e \
  --archive /workspace/scratch/7e4e0e593bdf/scf-grant-native/SCF_Grant_Operating_Case_with_Payment_Delays_20261012.zip \
  --output /dev/scf-calendar-cedar-8047 \
  --chromium /workspace/scratch/5403360e55a4/fleet-lightweight/shared/swarm/toolchains/browser/chromium-153.0.0/chromium
```

The installed Node and Playwright paths come from **CODEX_PRIMARY_RUNTIME_NODE** and **CODEX_PRIMARY_RUNTIME_NODE_MODULES**. If needed, pass existing paths using **--node** and **--playwright**. The source selection uses the application's complete original **BOOT_FILES** list.

Original case SHA-256: **c9205af40840c324222b47fc53b4dc83c2f55891c54b50b3a4b77e8af3266275**, 616,940 bytes.

The output's native-inputs.json retains each original versioned command before it is dispatched. An interruption resumes the same payload and native request ID. A completed native preparation is reused while browser receiving continues. The final result is **receiving-package.zip** and **package-result.json**. Publish those outputs in the original calendar thread:
https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791834666890649

## Integration finding carried into receiving

The calendar now carries its reviewed date, receipt, prepared form and work-package identity into Completion. The receiving session applies the linked selection after its pending native request finishes, preserves assignment and form drafts, and opens the selected work package. Use the composed source revision for receiving and pass its exact commit in --source-commit.


## Driver source

The complete receiving command and browser operation are in `calendar_receiving.py` (29635 bytes; SHA-256 `ca0c9d62b808a89575636c438c377e37ffae9b586e196e77bdf0619d588da006`). This source package is ready for a native receiving host. Running it produces the operated case, screenshots and complete calendar package described above. Publish `package-result.json` and `receiving-package.zip` from the accepting host in the original operation thread.

