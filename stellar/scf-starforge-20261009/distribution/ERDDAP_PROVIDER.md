# ERDDAP source and provider selection

Selection ID: `erddap-provider`.

This recipe packages the complete maintained ERDDAP grid/table source workflow, original dataset editions, provider-intake profile/review, versioned merchant, original customer receiving, configured agent tools and runtime installer.

Its complete generated package README is `products/erddap-provider/OPERATING.md`. That guide includes installation, private operator startup, actual reference source, live requests, mapping and native query, profile/save conflict recovery, review/ready exports, independent receiving, merchant publication, buyer accounting and same-workspace native/browser operation.

## Selected implementation

The product's original ERDDAP and provider implementation comes from shared source PR2036, merge `3585e7620cc8e8c6f7fed24a5eb031415195c078`, with the unchanged exact execution source `00acbcddd9a5646f3006b46a6e87d8f17d452162`. This standalone adoption preserves those full authored files and uses the maintained source selector, collector, package builder and runtime installer.

The `erddap` contribution supplies two commands, five SDK exports, one application provider and one merchant provider. The selected recipe preserves the original buyer/merchant/runtime dependencies and explicitly includes the three original XML native-engine files needed by the Python workspace.

## Original scientific reference

The included `sf30-seller-sdk/erddap/delivery/captures/ndbc-46042-june-2023.erddap.zip` retains the complete original 144-row NDBC station 46042 capture on 1 June 2023. It is 76,522 bytes with SHA256 `e52246a67df21d4acf58749e9b08ec76f32cc9d36f9d0595ed4f6040c4c48540`. All five original response files and their actual receipt remain intact.

Use the reference through the normal source-import operator or the original `delivery/provider-native-receive.py`. The helper's saved profile keeps the actual appointed-scientist question visible and exports the full working review. Ready mode is determined by the same provider review; no provider facts are filled merely for a demonstration.

The three-day coastal source is a separate owner's selection and is not implicitly substituted for this one-day reference.

## Build and install

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-source --ref FULL_SELECTED_COMMIT \
  --selection erddap-provider --out /absolute/erddap-package
```

Use the original `distribution/RUNTIME_INSTALL.md` procedure with that returned package and selected manifest. Preserve the source commit, actual archive digest and installed identity. The same package contains the complete original operating/receiving entrypoints; it does not require a separate provider service or a second source engine.
