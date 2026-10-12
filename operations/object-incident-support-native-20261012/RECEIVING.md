# Original Object monitoring and Support receiving

This directory carries the native customer receiving for the ObjectSession integration merged in [PR 284](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/284), at commit f7200d52fdc5722619d0cf708041ee46db447e7f.

## Complete workflow

The selected application uses the existing SF93 watcher and SF74 Support server. The receiving reads the original saved 267-byte Object session, registers its complete selection, observes a fresh successful poll, and then reviews an explicit 266-byte workload limit against that same source. The resulting incident retains the actual native read failure.

The operator acknowledges the original incident, prepares and saves a Support case with its complete captured files, and reopens the same save. Restoring the reviewed 1,024-byte registration retires the old incident as CONFIGURATION_CHANGED. A fresh complete observation is attached as the following case version; it does not relabel the old registration as recovered.

The final native handover is imported into a fresh original Support process with an empty incident-source profile. That receiver opens and reviews all retained before/after files without opening the buyer directory. The native customer checks the original session inventory again after completion.

The journey never purchases an Object, executes a payment finalization, enables notifications, or changes the saved buyer session. The original application remains the producer of observations, incidents, cases and portable handovers.

## Receiving files

A completed package contains:

- source/: the complete selected 734-file application source closure, together with the applicable original license files.
- source-metadata.json: the full original Git tree and signed commit text. The maintained git-object-receiving.py validates that source and materializes the selected paths.
- native/customer.mjs: the native customer driver used for this receiving.
- receiving/deliverables/: original portable Support handovers, HTML documents and native reports.
- receiving/result.json and receiving/independent-receiving-result.json: actual saved customer outcomes.
- MANIFEST.json: the exact member sizes, SHA-256 values and original Git identities.

Private request journals, source-account receipts, logs, configuration files and browser captures are excluded. The complete native state remains in the original private operator directory.

## Source and installation

The selected commit is f7200d52fdc5722619d0cf708041ee46db447e7f, whose Git root tree is 34f7cb8f8bee55951a444b9059a43a329f5daa6c. The source receiving validates the original signed commit, all Git trees, every selected source blob and the final materialized files. The source carriers contain unchanged original Git bytes and enter the maintained Git receiver; they are transport inputs.

This saved Object → watcher → Support path uses Node built-ins plus the original Python SQLite bridge. The source includes the complete Support application and its selected module/assets closure. Broader merchant integrations retain their own existing dependency and connection requirements.

For normal operator use, follow the original application documentation in:

- source/stellar/scf-starforge-20261009/sf93-seller-support-bundle/OBJECT_MONITORING.md
- source/stellar/scf-starforge-20261009/sf93-seller-support-bundle/INCIDENT_OPERATIONS.md
- source/stellar/scf-starforge-20261009/sf74-merchant-support-console/INCIDENT_SOURCES.md

The customer driver is bound to this original saved session. It is not a general instruction to repeat the bounded-limit incident against other customer data. Native outcome files, when present, are the authority for what actually completed.

## Original native operation

The selected native operation is SCF-OBJECT-MONITORING-SUPPORT-CUSTOMER-20261012-33E6. Its launcher uses the existing cloud-job Workspace prepare → saved plan → reopen → foreground start, with the complete reviewed memory and filesystem declarations.

Only the admitted command receives the full source, starts the original application processes and makes the final package. All temporary /dev storage is counted in memory and kept within that one context. The package is copied durably into the original persistent project before the unchanged upload workflow runs. Private outgoing tool requests and their complete replies are recorded before the workflow advances; an uncertain save is not replayed.

The receiver requires exactly one returned upload result matching the original package path and create purpose. It records delivery as complete only when that item succeeded and returned the actual file identities; a failed or uncertain save preserves the completed native package and its private original exchange for reconciliation. NATIVE_COMPLETE records the application journey, separately from file availability.

Source reads retain append-only attempts bound to the same operation, configuration and selected commit. A source-only interruption can therefore preserve the first provider response and reopen the original immutable inputs without overwriting an earlier observation. Native customer and upload dispatches keep their separate no-replay guards.

If execution is interrupted, inspect the existing operation and saved results first. Preserve its native request, plan, source selection and session. A previous child, source request, package or upload dispatch is not permission to create another customer invocation.
