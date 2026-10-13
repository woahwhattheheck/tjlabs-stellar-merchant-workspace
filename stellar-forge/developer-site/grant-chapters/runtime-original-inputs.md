### Original application files from device to restored workspace

#### The operator brings the real source into the installed application

A customer often opens the installed Runtime from a different desktop or a phone. The source file is on that device, while the application runs on the customer's Linux host. The Applications file shelf bridges that ordinary working step: select the complete original file, save it in the existing workspace, then choose the application setting that should use it. The normal application review shows the selected path and source before the operator saves the configuration.

The same workflow covers a grant scenario, an operating plan, a source manifest or another file that an installed application already accepts. Its provider remains responsible for interpreting and validating the selected file. Existing absolute host paths remain available for large files, folders, executable paths and other existing inputs.

#### Keep an original and an editable working copy

Each original upload retains its complete name, length, chunk identities and assembled SHA-256. Transfer uses the maintained resumable input engine with 1 MiB chunks and a 16 MiB whole-file allowance. Reselecting the same file continues its original upload after a lost connection or browser restart. The file shelf lists retained originals and incomplete transfers; downloads return the complete original bytes.

Preparing a file for a particular application creates a separately named working copy in the same workspace. The selection records the original upload, application kind, exact setting and original request ID before publishing the copy. Reopening an interrupted preparation continues that request. Replaying a completed selection keeps later application edits instead of replacing them with the uploaded original.

The customer therefore retains both sources needed for continuing work: the exact supplied original and the application's current working file. The operator can see when those bytes differ, reopen the existing working copy, or deliberately prepare a separate copy for another task.

#### Follow one customer task

1. Open **Applications → Original input files** in the installed Runtime, select the whole original file from the device and save it.
2. Choose the intended application and its current ready runtime. Beside the appropriate file setting, select **Use saved file**.
3. Choose the retained original and prepare a working copy, or select an existing matching working copy.
4. Complete the application's ordinary review and save. The selected application's existing start control then operates that saved configuration.
5. Continue work in the original application. The initial upload remains available when the application changes its working file.
6. Download the complete original for another operator, or carry the whole workspace through its existing backup and receiving workflow.

Desktop and phone controls use the same retained workspace, capability and request identities. A workspace switch cancels stale presentation updates and restores the newly selected workspace's file controls. Browser storage retains an unfinished selection request, while the server's file and preparation records remain available after the browser is closed.

#### Continue through the command line and SDK

The installed Runtime command exposes file listing, complete local-file import, upload inspection, explicit working-copy preparation, selection reopening and complete original export. The typed input interface carries those same records for an integrating application. CLI and browser use the same upload engine and working-selection API.

A receiving operator selects an output path for a complete original download. Export creates that destination once; it verifies the original source before streaming its full contents. File intake and setting selection leave application startup with the customer's existing reviewed lifecycle.

#### Receive the whole working workspace

The existing complete Runtime backup includes uploaded originals, incomplete upload chunks, selection intentions and completion records, and edited working files. Its original-path restore retains the paths stored in saved application settings. Binding review reopens the restored workspace through the same Runtime receiving controls.

The complete native receiving programme follows one selected original grant scenario through partial upload, cold reopen, browser completion, separate working-file selection, normal application save, full CLI download and complete workspace backup/restoration. It compares the restored original bytes, current working-file bytes, original selection request and saved application revision. Per-invocation outputs retain the operating journal and desktop/phone screenshots. Its actual host output joins the current Runtime receiver as that equipped operator runs the saved course.

This capability supports customer commissioning and continuing operation within the existing funded work packages. It supplies the original-file handling needed to use an installed application from an ordinary customer device and to hand the same complete working state to the next operator.

#### Complete maintained source

- [Complete original application files and continuing customer workflow](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/18434e93edd99b5bd0ed7bdf19628112c17e483d/stellar/scf-starforge-20261009/distribution/runtime-workspace/APPLICATION_INPUTS.md)
- [Retained original uploads, editable working copies and interruption recovery](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/18434e93edd99b5bd0ed7bdf19628112c17e483d/stellar/scf-starforge-20261009/distribution/runtime-workspace/application-inputs.mjs)
- [Desktop and phone original-file selection in installed Applications](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/18434e93edd99b5bd0ed7bdf19628112c17e483d/stellar/scf-starforge-20261009/distribution/runtime-workspace/public/application-inputs.mjs)
- [Complete source import, working selection and original export command](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/18434e93edd99b5bd0ed7bdf19628112c17e483d/stellar/scf-starforge-20261009/distribution/runtime-workspace/application-inputs-cli.mjs)
- [Typed original input library and working-selection interface](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/18434e93edd99b5bd0ed7bdf19628112c17e483d/stellar/scf-starforge-20261009/distribution/runtime-workspace/application-inputs.d.mts)
- [Complete original-file contribution and installed source dependencies](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/18434e93edd99b5bd0ed7bdf19628112c17e483d/stellar/scf-starforge-20261009/distribution/contributions/runtime-application-inputs.json)
- [Original file, browser save, complete workspace backup and cold receiving course](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/18434e93edd99b5bd0ed7bdf19628112c17e483d/stellar/scf-starforge-20261009/distribution/runtime-workspace/receiving/APPLICATION_INPUTS_RECEIVE.mjs)
