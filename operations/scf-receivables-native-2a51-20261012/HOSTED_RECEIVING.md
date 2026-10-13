# Original receivables native receiving on a standard public runner

Operation: `SCF-RECEIVABLES-NATIVE-2A51-20261012`.

This route executes the existing original payment and MerchantAccounting programmes at source commit `94ad1dd33fd1616303d52faa8b1cd98745c6cfc5`. It uses the complete original receiver and source/dependency capsules. The first run preserved those exact inputs and passed the payment programme. The completed MCP continuation retained the original programme and accounting engine, applied the exact maintained startup repairs described below, and passed the complete original lifecycle.


## Completed original receiving

The original payment and MCP programmes have both completed successfully:

| Programme | Actual run | Native result |
|---|---|---|
| Payment request, original Stellar proof/alias handling and owner reopening | [38343867655](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/actions/runs/38343867655) | Exit 0; seven complete workflows |
| Authenticated MerchantAccounting HTTP lifecycle, original source recovery and complete customer files | [38359117638](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/actions/runs/38359117638) | Exit 0; eight complete workflows |

The corrected MCP run completed at **2026-10-13 06:51:55 UTC** on the standard public Ubuntu runner, Node 22.23.3 and Python 3.12.3. It exercised the original SF74 quote/response import after configured aliases changed; editable invoice review and issuance; SEP-7 wallet instructions, canonical RPC NOT_FOUND observation, retained proof and cancellation; a preliminary USD 70.00 receipt corrected to USD 75.00 with USD 25.00 credit; complete SHA-pinned invoice/credit/quote/wallet/proof/customer-tar reads; original error projection and interrupted download recovery; and close/reopen of the same original owner. The USD 100.00 invoice finished with **USD 75.00 paid, USD 25.00 credited and USD 0.00 due**.

All twelve emitted output files were reconstructed from the original job log chunks and checked against their full byte count and SHA-256. Their complete original bodies are retained in [results/run-38359117638.json](results/run-38359117638.json), also Git result capsule `2e7e07d3e453d5778fb866c200b8139dfe197b6e`. The earlier payment outputs remain in [results/run-38343867655.json](results/run-38343867655.json). Runtime dependency inventories and the actual generated MCP lock are included with each run.

The successful continuation used source correction `bbc06b338f4ee7b51640ec0e241b05d39e71cee8`, offline receiver `4ea4c09fde74c471ce7e497d5bcfb69c0cc3c842`, hosted helper `1d13d8b14c451ca8ef78f987b6ee9382e000dfce`, and workflow blob `098406f9a30e7f1e84477bf20c9b62da51361f1b`. The original programme hashes, source/dependency capsule identities and exact three corrected leaf identities appear in the native receiving outputs.

After completion, the original repository policy was restored to `enabled:false` and workflow `382795854` to `disabled_manually`. Both writes returned 204 and both independent provider readbacks returned 200 with those saved states. Existing completed results can be reused for this exact original receiving scope; the installed-product and durable-customer continuations retain their own source and operation records below.

## Source and execution

| Input | Original Git blob |
|---|---|
| Hosted acquisition and log delivery | `cc48ce53c31819842d7adde9d63808fdea93e60e` |
| Original three-file receiver capsule | `122d0b322fe86967ca145b61f7054d4d2614c8ce` |
| Original 116-file source capsule | `7fcaec7a66deb03c5d9fed00f193138218d8c323` |
| Original 603-file dependency capsule | `0907e1444c7418266e128db60b3e94a02496d34f` |
| Original sf88 package manifest | `038f1824d7e2703b449fe50a5446b988d8f3bc3f` |
| Original sf88 package lock | `320cee72638cf1d4bc0fc1e48c4fe9b8547dc223` |
| Original MCP package manifest | `25c40f788e9be3ac932b3337bbce02bf7c37e64f` |

The workflow is manual-only and runs only on this repository's public main branch. It uses standard `ubuntu-24.04`, one job, one operation concurrency group, read-only repository contents and a 30-minute job timeout. It uses the image's installed Node >=22.13, Python 3 and flock. The current official image documents Node 22.23.3 and Python 3.12.3; the actual run records the versions it receives.

Preparation fetches exactly the original Git blob objects and verifies each identity before use. The original Stellar dependencies are installed with `npm ci` and their original lock. The original MCP package declares exact direct versions: SDK 1.32.1, x402 2.28.0 and jose 6.2.12. That original directory has no package lock; preparation retains the generated lock and complete installed dependency inventory in job logs. Source acquisition alone receives the read-only GitHub token. Dependency installation and the unchanged original programmes run without that token.

The original receiver materializes 715 tracked files plus four original programme/guide leaves. It runs `PAYMENT_CHECK.mjs` followed by `MCP_RECEIVABLES_CHECK.mjs`, preserves each complete stdout/stderr/exit result and returns failure if either original programme fails.

## Cost and result storage

GitHub documents standard hosted runner use in public repositories as free. Larger runners are charged. Job logs and summaries do not count towards artifact storage. This workflow selects the standard public Ubuntu label and writes its complete result files into logs. It uploads no Actions artifact, creates no Actions cache, publishes no package and snapshots no runner image.

Official references, retrieved 2026-10-13:

- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2404-Readme.md
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow

The workflow file must be present on the default branch before GitHub can dispatch it. Preserve the existing personal zero-dollar/Stop usage operation and other repositories' disabled settings. Enabling this repository is a separate exact policy mutation; it does not require changing an account budget.

## Existing receiving ownership and policy

The existing receiving owner coordinates this same operation. Reconcile any actual accepted local/Muse/equipment result before dispatching. The concurrency group prevents concurrent jobs in this workflow; it does not reconcile a separate native machine.

At the 2026-10-13 02:48–02:50 UTC finance-owner readbacks, the merchant repository was `enabled:false`. Source inspection at approximately 03:05 UTC returned no `.github` or `.github/workflows` directory and the repository run collection returned `total_count:0`. Repository metadata confirmed public visibility, ID 1414985422 and main as default branch. The personal budget owner E465/48DB retains its separate Save/reopen operation; no new budget setting is implied here.

Immediately before the policy change, read the current policy, all workflow pages and queued/in-progress runs. Preserve every unrelated workflow's disabled state. If any unrelated active workflow now exists, inspect its triggers and coordinate its original owner before enabling the repository. Publish this manual workflow, verify its exact default-branch bytes, then enable only this repository for the one original receiving operation. No other repository, budget or retention setting is part of this route.

Dispatch once through:
`POST /repos/woahwhattheheck/tjlabs-stellar-merchant-workspace/actions/workflows/scf-receivables-native-2a51.yml/dispatches`

Body:
```json
{"ref":"main","inputs":{"operation":"SCF-RECEIVABLES-NATIVE-2A51-20261012"}}
```

Record the returned dispatch status and reconcile the resulting run by workflow, exact head, event, actor and dispatch time before any retry. Retain the run/job IDs. After completion, retrieve the decoded job logs, verify the original file records and deliver the exact programme results to the existing receiving thread. Restore the repository's original disabled execution setting after the receiving job finishes; preserve the source workflow for an explicit future continuation.

## Receiving complete result bytes

The job prints source and programme events, then complete retained JSON files. Each file is framed as:

- `SCF_RECEIVING_FILE`: original relative path, byte count, SHA-256, encoding and chunk count.
- `SCF_RECEIVING_CHUNK`: same path, zero-based index and one Base64 segment.
- `SCF_RECEIVING_FILE_END`: same path and SHA-256.

Join all segments for the exact path in index order, decode Base64, and verify both byte count and SHA-256. The result inventory includes the original per-programme stdout/stderr/exit files, source identity, native result files where produced, hosted status and complete dependency preparation receipts. This framing keeps the full original bytes recoverable even when a connector returns job logs in bounded pages.

The existing decoded log tool is `github_fetch_workflow_job_logs({repo_full_name,job_id})`. The original REST job log endpoint is `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs`; follow GitHub's redirect through the established client.

Native failure results are actionable source findings. Continue the original programme against an explicitly corrected source after addressing the concrete failure; keep the same operation and existing receiving owner.

## Actual first result and the maintained correction

[Run 38343867655](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/actions/runs/38343867655) used Node22.23.3, Python3.12.3 and the original Stellar SDK16.3.0. PAYMENT_CHECK.mjs passed its seven complete workflows, including native and issued-asset settlement, retained proofs, testnet separation and owner reopen. MCP_RECEIVABLES_CHECK.mjs stopped during original provider registration: the old Grist and SeaTable contribution command/export shapes differed from the original distribution schema.

Complete original logs and twelve exact result files are retained in Git blob `80c16d4ce00247d6675fe3d7b1b9c445011cc27f`. The repository-disable restoration returned HTTP204 after the job. The first independent policy readback encountered the account core rate limit; the control operation retains that distinction.

The continuation uses correction blob `93d2f87ceab7c1ba17dbbc2f2e276c3e977f3aaa`, sourced from maintained commit `1f44c8a18477bcfbb1b8890f8bd228ba52bb1306`. The two exact postimages are Grist `628fc04f8e1de10cc35c497064fa8cac8438a483` and SeaTable `8c24dca1c4f6333b4c844bd4b8ca06ba3a0b573a`. Both turn command descriptors into native source path strings and add the required ./source/ prefix to exports. The original distribution composer accepted all289 retained contributions and518 commands with these exact repairs. Every source correction records its original and replacement Git hashes.

The corrected receiver capsule is `5dfec853b254e0f67dc489d650b1ec85affa0f43`; its hosted acquisition helper is `005d8ef478d681815eb7e29a48182fd909125df6`. Only the failed original MCP programme is rerun. The accepted payment result remains the first run’s original output. Each new result records the frozen base, explicit correction and unchanged selected programme together.

## Completed original run and installed-source continuation

The original run 38343867655 completed with payment PASS and MCP provider-admission failure against its frozen 94ad source. Preserve that run and its twelve complete output files. The current-source registration correction is already maintained; the frozen capsules above remain historical input.

Use [INSTALLED_RECEIVING.md](./INSTALLED_RECEIVING.md) for the same operation's corrected source continuation. It uses the complete maintained merchant-receivables selected archive and authoritative installed manifest, checks actual provider admission, then runs both original programmes with their unchanged source hashes. Its existing Linux receiver reuses the retained SDK/MCP dependencies and full output/recovery path. This continuation does not dispatch or rerun Actions and leaves original policy restoration with its owner.

## Original private-file helper startup repair

The original MCP command also imported private-file helpers through configuration, which initialized the ambient distribution. The maintained fix from PR1112 imports those same helpers directly from `host-files.mjs`. This continuation applies its exact frozen `94ad` successor `65a06ce7820ac4e436917e3951b0bc64f795b8d8` (CLI blob `bb7cd566159333727c409eb50a4077132662cda5`) alongside the already reviewed Grist and SeaTable descriptors. The current commissioning CLI receives the same direct import. Original private-file permissions, journal semantics, source programmes and the accepted payment result are retained.

Current correction capsule: `bbc06b338f4ee7b51640ec0e241b05d39e71cee8`. Current offline receiver capsule: `4ea4c09fde74c471ce7e497d5bcfb69c0cc3c842`. Current hosted helper: `1d13d8b14c451ca8ef78f987b6ee9382e000dfce`. The one manual continuation still selects only `MCP_RECEIVABLES_CHECK.mjs`; its full original outputs remain in the job logs. The installed-product and durable-customer continuations described above retain their existing ownership and source.
