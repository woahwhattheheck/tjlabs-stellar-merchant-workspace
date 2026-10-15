# Native receiving and host integration

## Offline receiving
Use Node 22.13 or later on the received full source. No Filio key or network is required for these commands. The complete source manifest is source-manifest.json.

```sh
node native/build-desk.mjs --out /absolute/new-browser-delivery
node tools/import-host.mjs example --out /absolute/new-authored-course
node tools/import-host.mjs receive --working /absolute/working.json --out /absolute/new-reopened-delivery
node tools/import-host.mjs apply --working /absolute/working.json --request /absolute/request.json --out /absolute/new-edition
```

The example command runs the unchanged original twenty-operation source-to-host course, the complete independent host-identity review, and the actual bridge with authored in-memory host hooks. It writes the original working state, reports, exact originals, both additional whole courses and the complete application source. Source and output manifests verify every member. This is authored evidence, not a live SDK result.

The receiver accepts the core export or the exact browser carrier through the same operator session module. The complete received input is retained at received/working-original.json, including unfinished browser drafts. A domain operation writes a new core working edition; it does not discard the previous received browser carrier or modify its drafts in place.

An optional --selection SELECTION.json selects one saved reconciliation or comparison:
```json
{"comparisonId":"comparison-1"}
```
Omitting selection produces the complete overview and retains every source/record.

Publication is create-only. Use a new output directory or repeat the identical command to resume the same plan. Its sibling .import-host-state directory binds every output byte/hash. Interrupted files use same-directory staging and create-only hard links; exact existing finals are accepted, conflicting originals remain intact. Do not change or delete the owner directory to reuse an unrelated destination.

## Installed host bridge
src/host-bridge.js exports createImportHostBridge({core,codec}). It has no built-in endpoints, credentials or Filio SDK prop assumptions.

captureCallback({rows,scope,externalImportId,sourceId,importId,label,name,note}) serializes the actual callback and returns exact source.add/import.capture inputs. It cannot recover precision already lost in JavaScript Number before serialization.

captureWebhook({rawBody,headers,verifyWebhook,...captureFields}) requires the installed provider verifier. The verifier must validate the original raw body and actual published signing contract, then return {verified:true,reference}. No header or signing algorithm is guessed. Reject unverified data before using it as authenticated ingress.

executeBatch({workspace,batchId,batchSha256,attemptId,providerReference,host,journal,clock}) checks the exact still-current reviewed plan and invokes installed host hooks:
- host.writeRow({idempotencyKey,binding,action,targetId,key,fields,sourceRef}) returns {status,targetId,error,...originalResponse}. Fields are typed original nodes, not rounded numbers. The host owns authorization, schema-specific conversion and its actual transaction/idempotency mechanism.
- host.readRecords({scope,ids}) returns {records:[{id,valuesText}]}. valuesText is the complete actual host JSON object serialization. No whole-database coverage is inferred.
- journal.claim({key,binding}) atomically returns claimed, settled with retained outcome, or inflight. The binding includes exact workspace, batch hash, scope and source row.
- journal.settle({key,binding,outcome}) durably records the original outcome.

The installed journal must be durable and atomic across all server workers. The authored course's in-memory journal demonstrates the protocol only. A claimed row with no terminal outcome remains uncertain and is not automatically written again. A known settled outcome replays without another host write. Retain the result's originalOutcomes and journal record privately; a failed journal settlement is reported uncertain even if the host response said accepted. Readback failure remains explicit and never creates a fake empty success.

The returned receiptText and readbackText enter the same ordinary source/receipt reconciliation workflow. A separate integration must wire the selected released React SDK and actual host hooks after the selected version, credentials, webhook signature and persistence policies are confirmed. No customer host access or execution is claimed by this package.

## Corrected native semantics
JSON object member ordering does not change typed value equality; array order and number/string distinctions remain meaningful. Original JSON text and numeric tokens remain retained. Two active originals accepted to one host record are divergent with COLLAPSED_HOST_IDENTITY, including create/update collisions. Explicitly skipping duplicate occurrences can leave one active unique key; the original duplicate observation stays visible. Named acceptance never changes these observed outcomes.
