# Original receivables receiving: complete offline source

This is the continuation of SCF-RECEIVABLES-NATIVE-2A51-20261012 at original commit `94ad1dd33fd1616303d52faa8b1cd98745c6cfc5`, tree `811b11553f07876efaa39fc57c05f2762af098b5`. The original payment and MCP programs are unchanged. The original 116-file capsule is accompanied by 603 unchanged dependency and provider-registration files from that exact tree; the receiving directory contains 715 original tracked files and four original exercise/guide files.

The dependency set includes the original merchant HTTP transport, original accounting host imports, distribution declarations, provider registration modules and their catalog imports. This closes the missing-import gap in the earlier 116-file-only receiver.

## Inputs

Repository: `woahwhattheheck/tjlabs-stellar-merchant-workspace`.

- Original capsule: `7fcaec7a66deb03c5d9fed00f193138218d8c323`, 1,874,163 bytes.
- Original dependency capsule: `0907e1444c7418266e128db60b3e94a02496d34f`, 3,583,591 bytes.
- Every materialized body is checked against its original Git blob SHA. The complete two input objects are also checked against their retained Git SHA and byte count.
- Node 22 or later, Python 3, `flock`, and the existing installed official Stellar SDK are required. No package install or network call occurs inside the receiver.

Acquire both original Git blob JSON objects with the existing authenticated source connection. For a host using its already configured GitHub CLI:

```sh
gh api repos/woahwhattheheck/tjlabs-stellar-merchant-workspace/git/blobs/7fcaec7a66deb03c5d9fed00f193138218d8c323 > original-capsule-object.json
gh api repos/woahwhattheheck/tjlabs-stellar-merchant-workspace/git/blobs/0907e1444c7418266e128db60b3e94a02496d34f > original-dependencies-object.json
python3 receive-capsule.py --capsule-object original-capsule-object.json --dependencies-object original-dependencies-object.json --out /absolute/new/private-receiving-directory --sdk-profile /absolute/existing/package.json --sdk-node-modules /absolute/existing/node_modules --mcp-node-modules /absolute/existing/mcp/node_modules
```

The SDK profile must resolve `@stellar/stellar-sdk/base` through Node's original `createRequire`. Existing SDK and MCP module directories are linked into the materialized original source. The optional `--node` flag selects the actual installed Node executable.

The two complete native programs run sequentially. Each program's complete stdout, stderr and exit code is written immediately to `results/PROGRAM.mjs.json`; `source-received.json` and `receiving-result.json` retain original source identity and the complete result inventory. Return those files to the existing receiving owner immediately after completion. The source programs also retain `PAYMENT_CHECK_RESULT.json` and `MCP_RECEIVABLES_CHECK_RESULT.json` when they pass.

The payment journey uses official SDK-generated transaction/result XDR through the original RPC verifier and real native workspace/HTTP operations. The MCP journey uses the original authenticated transport and whole quote, invoice, settlement, credit, files, recovery and reopen lifecycle. Selected-package installation continues through the maintained selected-product builder as its existing subsequent operation.

## Maintained registration correction after the first actual run

Run 38343867655 passed PAYMENT_CHECK.mjs and failed during MCP provider registration. The continuation receives the original 94ad source plus correction blob `93d2f87ceab7c1ba17dbbc2f2e276c3e977f3aaa`: exact maintained Grist and SeaTable contribution descriptors at `1f44c8a18477bcfbb1b8890f8bd228ba52bb1306`. Original and replacement Git hashes are checked before applying either file. The original programmes and accounting source are unchanged. Use `--correction-object` with that original Git blob response and `--program MCP_RECEIVABLES_CHECK.mjs`. Source/result records retain both the frozen base and explicit correction identities.

The prior complete native results are retained in Git blob `80c16d4ce00247d6675fe3d7b1b9c445011cc27f`.
