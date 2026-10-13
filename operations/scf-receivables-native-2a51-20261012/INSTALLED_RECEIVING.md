# Continue the original receivables programme from its installed source

Operation: `SCF-RECEIVABLES-NATIVE-2A51-20261012`.

The original run [38343867655](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/actions/runs/38343867655), job 115120706940, completed on 13 October 2026. Its original payment programme passed. The MCP programme stopped during module admission, before its accounting workflow: the frozen source at `94ad1dd33fd1616303d52faa8b1cd98745c6cfc5` contained object-valued Grist commands and export paths without the required package prefix.

The maintained source already corrected both Grist and SeaTable registrations in [3d3876cb960f24ae2d796103c8003416b3008b51](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/commit/3d3876cb960f24ae2d796103c8003416b3008b51). The historical hosted acquisition remains bound to the old capsules. Replacing one declaration inside that frozen receiving directory would mix its source identity and leave its full ambient provider closure unexamined.

This continuation uses the maintained **merchant-receivables selected archive**. Its complete installed manifest owns the declarations, source selection and provider modules before either unchanged original programme is imported. It preserves the failed edition and its complete output records as the predecessor. It does not change the historical hosted receiver or workflow.


## Accepted predecessor and current retained customer continuation

The original payment seven-workflow result and corrected original MCP eight-workflow result are complete. The latter ran successfully as [38359117638](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/actions/runs/38359117638); its full twelve-file output is retained in results/run-38359117638.json. Repository and workflow disabled states were independently read back after execution.

For the complete current customer case, selected release and independent operator handover, use [INSTALLED_CUSTOMER_HANDOVER.md](INSTALLED_CUSTOMER_HANDOVER.md). It adds explicit --mode admission to this existing installed continuation, preserving the original default programme mode. Admission verifies the selected archive/provider/commands and returns installed-release.json without replaying the accepted historical programmes. The same retained-customer operation then continues through the source-owned Xero/customer handover programme.

## Original programmes

`programs/original-programs.json` identifies both complete, byte-for-byte original programmes from capsule `7fcaec7a66deb03c5d9fed00f193138218d8c323`. Their lengths, SHA-256 values and Git blob identities are checked before they are copied beside the selected installed source.

The payment programme exercises the official Stellar SDK and original payment verifier against controlled RPC observations, including fee-bump alias and reopen behavior. The MCP programme exercises the authenticated local HTTP transport, original invoice/quote/payment-request/receipt/credit writers, complete retained downloads, original lost-reply recovery and workspace close/reopen. These programmes do not make a new chain purchase. A result is native execution evidence only when the actual receiver returns its phase output.

## Prepare the actual current source

The existing receiving owner should use one complete current merchant checkout that contains this continuation, preserving peer changes. Record its exact 40-character commit. Use an isolated checkout if the existing working directory has changes. The maintained builder reads Git objects for the selected commit; it should be invoked from that same selected checkout.

Use existing Node 22.16 or later, Python 3.11 or later, Git, npm and Linux `flock`. The original installed Stellar SDK and MCP dependency directories remain operator inputs. This continuation installs no dependency and receives no source-acquisition token.

Build the original selected package:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /ABSOLUTE/SELECTED_CHECKOUT \
  --ref EXACT_40_CHARACTER_COMMIT \
  --selection merchant-receivables \
  --out /ABSOLUTE/PRIVATE/ORIGINAL_OPERATION/selected-package \
  --offline
```

Retain the complete builder report, archive and manifest. Read the actual `archive` path and `sha256` from its successful returned JSON; do not infer the archive filename. The offline option requires that all selected Git source objects are already present. If the original build was interrupted, the maintained builder's same-output `--resume` handles its own retained state.

## Run the same operation

From the complete checkout, invoke:

```sh
node operations/scf-receivables-native-2a51-20261012/continue-installed.mjs \
  --archive /ABSOLUTE/ACTUAL_RETURNED_ARCHIVE.tgz \
  --sha256 ACTUAL_RETURNED_ARCHIVE_SHA256 \
  --source-ref EXACT_40_CHARACTER_COMMIT \
  --out /ABSOLUTE/PRIVATE/ORIGINAL_OPERATION/installed-continuation \
  --sdk-profile /ABSOLUTE/EXISTING_STELLAR_DEPENDENCIES/package.json \
  --sdk-node-modules /ABSOLUTE/EXISTING_STELLAR_DEPENDENCIES/node_modules \
  --mcp-node-modules /ABSOLUTE/EXISTING_MCP_DEPENDENCIES/node_modules \
  --python /ABSOLUTE/EXISTING_PYTHON
```

All uppercase paths are explicit operator selections. The output parent must already exist at its actual absolute path. Source archive and dependency directories stay outside that private output. The optional Stellar node_modules argument defaults to the directory beside its selected existing package.json. The original programmes use those dependencies without an npm install, source-token inheritance or a signer replacement.

Reconcile any actual active receiving owner before launch. Use one retained output path for this continuation. Linux flock protects its execution; an overlapping call cannot admit another programme. The original operation identity is unchanged.

The receiving sequence is:

1. Pin the archive, selected source commit, predecessor, unchanged programmes and original dependency locations in identity.json.
2. Use the maintained runtime-unpack.py to verify the archive and every member before extraction. Confirm the complete selected manifest and all source hashes.
3. Retain the two original programmes beside that source and bind the existing dependency directories.
4. In a separate Node process, load the original distribution specification and actual provider registry from that installed source. Confirm its exact source commit, merchant-receivables selection, all declared provider IDs and original input hashes.
5. Execute the original payment programme and then the original MCP programme. Preserve each complete stdout, stderr, exit code and native result document. Stop after a failed phase.
6. Write receiving-result.json identifying the selected archive, manifest, source, predecessor and every returned phase.

The programme files are additional receiving inputs with their own original hashes; they are not falsely added to the package's source manifest. Reopening validates the unchanged package files and allows only those receiving files, the two native result files and the two original dependency links.

## Continue after interruption

Repeat the **same command and same paths**. A completed phase is read from its retained result and is not executed again. The source archive, exact commit and original dependency binding must match identity.json. A changed source requires an explicitly selected corrected continuation under this same receiving owner, preserving the earlier complete output.

If a started.json has no result.json, the command returns RECEIVING_OUTCOME_UNKNOWN. Reconcile that original admitted process and its actual output before another launch. The command deliberately does not infer failure from a missing response or automatically launch another accounting programme. Preserve the original directory for the owner's recovery.

A completed failed phase remains failed on replay; retain its full result for source correction. Do not edit an old successful or failed phase into a pass. No hosted compute dispatch, Actions enable, policy write or new purchase is part of this command.

## Return complete native evidence

Return these original files with the actual accepting host, selected commit and execution time:

- identity.json and unpack.json;
- the original successful builder report, selected manifest and archive SHA;
- phases/installed-provider-admission/result.json;
- phases/PAYMENT_CHECK.mjs/result.json;
- phases/MCP_RECEIVABLES_CHECK.mjs/result.json, if admitted;
- package/source/PAYMENT_CHECK_RESULT.json and MCP_RECEIVABLES_CHECK_RESULT.json when produced;
- receiving-result.json.

Preserve all twelve original failed-run files separately. The historical payment pass is not relabeled as live chain settlement, and source inspection is not reported as a completed installed/native run. Repository policy restoration remains with its original owner.
