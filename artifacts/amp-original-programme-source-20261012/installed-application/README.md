# Complete IATI / AMP console source — installed receiving edition

This source edition contains 258 complete files (5,714,573 bytes) from merchant commit `ae8f91441a0037efefb563ad8999389838a0a35b`, including the AMP destination update merged in PR 578, the current Results and Organisation functionality, both original binary source inputs, and every file in the 167-entry managed source binding. The original IATI programme source edition remains in the adjacent `application/` directory.

## Receive the source

Keep `source-capsule.json` and all three `amp-complete-installed-source.zip.partNNN` files together. Concatenate the parts in numeric order and verify the complete ZIP before extracting it:

```sh
cat amp-complete-installed-source.zip.part001 amp-complete-installed-source.zip.part002 amp-complete-installed-source.zip.part003 > amp-complete-installed-source-20261012.zip
sha256sum amp-complete-installed-source-20261012.zip
python3 -m zipfile -e amp-complete-installed-source-20261012.zip /absolute/new/amp-source
```

Expected ZIP: **1,903,148 bytes**; SHA-256 `d91031aca029033c8ee4aec7342b92fb5af1dc64c6d121bcacd407bf4f926138`. The capsule retains each part's identity and every original file's byte length, SHA-256 and Git blob. The ZIP retains the full repository paths.

The standalone console and receiving programme are in `stellar/scf-starforge-20261009/sf30-seller-sdk/iati/`. Read `AMP.md`, `receiving/AMP.md` and `examples/amp-haiti/PROGRAMME.md`, then use the actual selected programme with the existing private case directory:

```sh
python3 receiving/amp.py --manifest /absolute/selected-programme.json --case-directory /absolute/private/original-amp-case
```

For the managed Merchant/Applications host, use the complete maintained repository at the same commit. The capsule includes the IATI integration postimages alongside the standalone console's complete original source; the full repository supplies the host's other application and provider modules.

## Installed destination receiving

The original operation is `DEVELOPMENT-GATEWAY-AMP-COMMISSIONING-20261012`; its programme uses actual AMP session/layout, the complete field dictionary and possible-value responses, and the selected full projects. Preserve the returned native project and financial-row IDs through receiving, a following edition and the private portable handover.

The full destination update preserves collection traversal even when an update's financial values remain unchanged. Activity-group metadata is descended through its original dictionary, and the actual persisted version must be a nonnegative integer that does not regress. `amp/DESTINATION_UPSTREAM.json` identifies all 32 original source references and the complete composed module.

The repository's original licence notices remain at their original paths. Original FCDO XML and the independently authored source examples retain their own provenance and notices.
