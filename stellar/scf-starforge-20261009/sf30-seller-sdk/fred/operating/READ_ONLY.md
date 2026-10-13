# Read a complete FRED handover in an installed application

The fixed reader is `inspect-fred-operating.mjs`, beside the original operating archive implementation. It reads the entire original compressed archive, every member and the source/package/project/plan documents. It does not extract an application, start a project, write a project revision or execute files from the incoming archive.

Use the installed Node22.16 or later and its complete declared source closure:
```sh
node inspect-fred-operating.mjs --archive /absolute/original-handover.tar.gz --sha256 ORIGINAL_ARCHIVE_SHA256 --out /absolute/private-result/inspection.json
```
On Windows, pass ordinary absolute Windows paths as separate subprocess arguments. The parent directory must already be the consumer's owned private temporary directory. The output is created exclusively. An existing file is preserved. The reader keeps the original source artifact and every publication archive in their original whole incoming archive.

## Returned data

The complete output schema is `stellar-forge.fred-operating-archive-readonly.v1`. It retains the original archive descriptor, complete source descriptor and its file identity, original HANDOVER and source-package MANIFEST, complete editable Operating Plan or null, and the actual ordered member descriptors including HANDOVER.json. Each original source and project ID remains unchanged.

The standard-output receipt is `stellar-forge.fred-operating-inspection-receipt.v1`, with `archive` and `result:{bytes,sha256}`. Verify the full result bytes against this receipt before using the parsed model. The receipt contains no host path. Full diagnostic errors remain on stderr. The CLI emits no partial success and removes only its own incomplete create-only output.

The CLI preserves LDA's existing32MiB complete parsed-source limit. Its native library reader retains the original4GiB source/archive family and480MiB original project capacity. LDA's FileCollections source and portable limits remain separate; do not truncate an archive, an inventory, a plan or the reader output to make an oversized input fit.

## Original semantics and read-only portability

The extraction and read-only paths share one USTAR/gzip parser. The original canonical archive is consumed once. A valid package with a different relative project-artifact path uses a second read of the same fully hash-bound archive for that declared project, preserving the existing source-package inspector's accepted paths.

Both check original header sums, safe regular-file member paths, exact first manifest and complete member inventory, body lengths and SHA256, zero padding/terminator, total/member capacities, the complete compressed identity and original open-file stability.

Read-only inspection shares the source-document validator used by the maintained native source-package inspector. It recomputes the original versioned bundle hash, complete operation-prefix history and original source descriptor, preserves complete inventory/evidence/publication views, checks publication archive identities and the original Research v7/v8 and Research-commerce extensions, and validates the carried Operating Plan against the original source. The maintained whole-project receiver remains the route for restoring and operating an editable native project.

Its input handle requires an ordinary stable file with the declared whole identity. It does not use Linux flock, private-mode checks, directory fsync or interrupted writer-link repair on the selected input. Those existing writer/receiver semantics remain in the native extraction path. The fixed installed support files are selected by the application; incoming archives cannot replace the reader or choose an executable.

## Receiving into LDA

Retain the original archive as one FileCollections source. Invoke this exact installed CLI with separate arguments and the existing configured Node or PATH Node. Keep complete stdout/stderr and verify the receipt/result before passing the returned source model into the existing attributed Research review, Search and ordered Work Brief path. Store the original result once, with its original project/source IDs; keep local review notes in the existing LDA journal. Colleague return carries the complete original archive and all existing review history.

The actual native/browser FRED course remains FRED-CUSTOMER-OPERATING-PLANS-E2747-20261013. Its original macro/Research inputs and saved project/plan histories are preserved. Source review of this reader is separate from that course's execution result.
