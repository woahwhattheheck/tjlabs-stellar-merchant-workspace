# Receive the installed customer workspace and a second operator

The selected customer release includes the original customer case tools, the complete Xero cash and commissioning workflow, and a retained handover to an independent operator. The customer’s accounting directory, original source files, invoice and credit documents, returned files, prepared requests and encrypted checkpoint stay together after receiving.

This continues operation **SCF-RECEIVABLES-NATIVE-2A51-20261012**. Its original payment programme passed seven workflows in run38343867655. The corrected original MCP programme passed eight workflows in run38359117638. Their full outputs and final disabled controls are retained under results/ and HOSTED_RECEIVING.md. The current installed-customer continuation uses those accepted predecessor results and runs the existing current customer workflow.

## What the recipient receives

The maintained merchant-commissioning-collections selection supplies the complete source and package registrations for:

| Installed command | Original work |
| --- | --- |
| starforge customer-case | Create, inspect and capture a dated original customer case; prepare, execute and reconcile original customer actions; retain an encrypted checkpoint |
| starforge customer-case-followup | Inspect or continue the same saved follow-up and complete its original case delivery |
| starforge customer-case-serve | Reopen the retained original customer workspace on its original loopback endpoint |
| starforge customer-xero-handover | Prepare and receive the complete original customer account and selected Xero cycles through the existing encrypted recovery engine |
| starforge receivables-xero | Original Xero document handovers, returns and immutable cash commissioning |
| starforge commissioning-collections | Original workshare source, customer/milestone matching, reviews, immutable captures and private handover |
| starforge merchant-accounting-receivables | Original authenticated agent access to the customer’s accounting records |
| starforge merchant-accounting-commissioning | Original authenticated agent access to retained commissioning source and captures |

Use each command’s --help for its unchanged argument contract. The selected package name is recorded in its package.json. Its original reusable modules are exported at /merchant/customer-case, /merchant/customer-case/followup, /merchant/customer-case/server and /merchant/customer-case/xero-handover beneath that package name. For example, the default package exports @tokenjunkielabs/starforge-merchant/merchant/customer-case.

The ordinary merchant-receivables selection also includes the retained customer case commands. The complete second-operator Xero/commissioning receiving sequence selects merchant-commissioning-collections so its actual source, browser assets, native commands and agent providers are present together.

## Select original source and existing dependencies

Use one complete checkout at the exact intended 40-character Git commit. The maintained distribution builder reads its selected payload directly from Git. The receiving command also verifies the local builder and operation sources against that same commit before executing them.

The receiving host needs Linux, Git, flock, Python and Node22.16 or later. Supply the original installed Stellar SDK profile/package.json and its node_modules, plus the original installed MCP node_modules. The command uses those existing dependencies at their original module locations. It records their selected paths and the profile SHA256.

Configure the original STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE through the existing private secret channel before launching. The original accounting backup engine accepts16–65536UTF-8bytes. The receiver passes that variable directly to the native programme and records no secret value. Preserve it separately so the independent recipient can verify and restore the retained encrypted backup.

Keep the checkout, dependency directories and private operation directory separate. The operation directory’s parent must already exist at its actual absolute path; the receiving command creates an owner-private directory beneath it.

## Complete current receiving command

From the exact selected checkout:

~~~sh
node operations/scf-receivables-native-2a51-20261012/receive-installed-customer.mjs \
  --repo /ABSOLUTE/EXACT_CHECKOUT \
  --ref EXACT_40_CHARACTER_COMMIT \
  --out /ABSOLUTE/PRIVATE/CUSTOMER_OPERATION \
  --sdk-profile /ABSOLUTE/EXISTING_SDK/package.json \
  --sdk-node-modules /ABSOLUTE/EXISTING_SDK/node_modules \
  --mcp-node-modules /ABSOLUTE/EXISTING_MCP/node_modules \
  --python /ABSOLUTE/EXISTING_PYTHON \
  --offline
~~~

The offline option tells the original Git builder to use the already available source objects. Without it, the builder retains its original source-acquisition behavior. Source acquisition is performed by that maintained builder against the exact selected commit.

The command completes three phases under one original flock:

1. **Selected build.** The maintained builder creates the original archive and manifest. The receiver checks the returned source commit, selection, complete archive checksum and package receipt.
2. **Installed admission.** The existing installed continuation unpacks that archive through the maintained runtime-unpack.py, checks every manifest member, binds existing runtime dependencies and imports the actual selected provider registry. It executes the installed customer case, follow-up and reopen help commands, then imports their original exported modules.
3. **Independent customer handover.** The exact installed programs/XERO_CUSTOMER_CASE.mjs consumes the retained installed-release.json. It runs the existing complete cash workflow with retained output, captures the original customer case, retains and verifies its encrypted checkpoint, and receives that same account for an independent operator. The native handover programme records its source and receiver directories, original customer/workspace identities, full file comparisons and subsequent reviewed work.

Each phase retains its full stdout.log, stderr.log and result.json. It reports the actual child PID when admission succeeds. A completed phase is read from its original result on the next invocation; it is not launched again.

The installed financial source remains the archive’s manifest-owned source. A selected archive with changed member bytes, another source commit or a different provider selection is refused. The two prior payment/MCP programmes remain separate accepted predecessors.

## Supply the retained programme’s next cash review

The controlled original customer programme has a complete saved second-cycle continuation. To choose a different continuation of that same retained programme account, supply its own saved package ID and complete native cash selection in a private JSON file:

~~~json
{
  "packageId": "ORIGINAL_PACKAGE_UUID",
  "selection": {
    "asOf": "2026-10-13",
    "label": "Independent operator receiving review",
    "baselineCycleId": "ORIGINAL_SAVED_CYCLE_UUID",
    "importIds": ["ORIGINAL_RETURN_IMPORT_UUID"],
    "sourceBindings": [],
    "matches": []
  }
}
~~~

Use IDs from this programme’s retained account and the complete sourceBindings/matches returned by its existing cash review. An empty array is an explicit selection; it does not ask the receiver to infer matches. The original compiler preserves any resulting differences and findings.

Add --continuation /ABSOLUTE/PRIVATE/CONTINUATION.json to the same receiving command. Before execution it retains the exact bytes as continuation.json and binds their SHA256 into the operation identity. A changed review requires a new explicitly selected receiving operation directory; the already retained decision remains unchanged.

For an actual existing customer account, use the installed starforge customer-xero-handover prepare/receive commands and reusable module with that account’s complete private selection and receiver JSON. The named XERO_CUSTOMER_CASE receiving programme creates its own controlled account. See starforge customer-xero-handover --help and [the native Xero handover guide](XERO_CUSTOMER_HANDOVER.md) for the actual-account schemas, and DURABLE_CUSTOMER_CASE.md for continuing customer actions.

## Admit a release separately

An existing equipped recipient can admit a previously built selected archive without running the customer programme:

~~~sh
node operations/scf-receivables-native-2a51-20261012/continue-installed.mjs \
  --archive /PRIVATE/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --source-ref EXACT_40_CHARACTER_COMMIT \
  --out /PRIVATE/INSTALLED_CUSTOMER_RELEASE \
  --mode admission \
  --selection merchant-commissioning-collections \
  --sdk-profile /EXISTING_SDK/package.json \
  --mcp-node-modules /EXISTING_MCP/node_modules
~~~

The original default of continue-installed.mjs remains original-programmes for older retained operations. Select admission explicitly for the new customer workflow.

A successful admission retains installed-release.json with:

- the exact archive path, bytes and SHA256;
- sourceCommit and sourceSelection;
- actual installed packageDirectory and repository-shaped sourceRoot;
- original manifest path and SHA256;
- package name and source-file count;
- selected SDK/MCP paths and original SDK profile SHA256;
- the complete provider/installed-command admission result.

The recipient runs the same installed native programme with:

~~~sh
node /INSTALLED/source/operations/scf-receivables-native-2a51-20261012/programs/XERO_CUSTOMER_CASE.mjs \
  --release /PRIVATE/INSTALLED_CUSTOMER_RELEASE/installed-release.json \
  --out /PRIVATE/CUSTOMER_HANDOVER
~~~

This binds actual customer receiving to one complete installed release. Keep the original release descriptor and programme output together.

## Resume the original operation

Repeat the exact original command, paths, source and dependencies. The operation identity and completed phase output hashes must match. Each successful phase is reused, and its complete result remains available.

If started.json exists without result.json, reconcile the actual original child process and its retained log files before another launch. The receiver reports CUSTOMER_OUTCOME_UNKNOWN with the exact phase directory. A disappeared response does not choose another customer, generate another request ID or infer whether native accounting work committed.

A failed completed phase retains its real exit code and full output. Correct the concrete source issue, preserve the failed edition, and select the corrected source under a new operation directory. Native customer actions continue through their existing request IDs and original provider journal.

The independent customer programme’s own RETENTION.json records startup, source and recipient paths and native completion. Retain incomplete handovers and their original accounting recovery records; the original prepare/reconcile interfaces expose what actually committed.

## Complete private handover

Retain the entire private operation directory, the original selected archive, dependency installation identities and separately delivered backup secret. The useful entry points are:

| Path | Contents |
| --- | --- |
| identity.json | Exact source, selected product, dependency binding and optional continuation bytes |
| release-build/ | Original builder state, complete source manifest and selected archive |
| installed/installed-release.json | Verified release and installed source identity |
| installed/package/ | Full original installed product |
| phases/ | Every admitted phase’s complete stdout, stderr and actual result |
| customer-handover/RETENTION.json | Original source/recipient account, case, backup and receiving paths |
| customer-handover/XERO_CUSTOMER_CASE_RESULT.json | Native full customer and independent-operator result |
| customer-receiving-result.json | Complete native result joined to the selected release and log identities |

The customer case’s standalone invoice/account reports can be selected for the customer. The complete private operation, accounting snapshot, backup and staff records belong to the internal operator handover. Preserve the original backup directory and passphrase through their existing custody.

After receiving, use starforge customer-case-serve with the retained handover to reopen the same account, then starforge customer-case to inspect current state, continue original prepared requests and capture the next dated edition. The account remains the original editable customer workspace.

## Same free public fixture receiver

The existing manual workflow has an explicit installed-customer-fixture choice. That mode uses the public repository’s standard ubuntu-24.04 worker and the exact workflow source commit. It acquires that complete original Git commit, installs the source-owned dependency profiles, builds the selected release and runs the complete command above.

The hosted mode accepts no live account or --continuation input. It runs the original programme’s controlled customer scenario with the declared fixture passphrase SCF-XERO-CUSTOMER-RECEIVING-FIXTURE-20261013. This value is part of the receiving input so the retained fixture backup remains independently restorable. Actual account commands continue to require their own private secret.

All account, source, receiver, checkpoint, prepared-request and result bytes are retained in retained-customer-workspace.tar.gz, with retained-customer-files.json mapping every member’s bytes and SHA256. The complete selected source archive is included once; duplicate extracted package files are represented by that original archive and its manifest. The actual native result, dependency profiles/locks and full phase logs are returned through numbered SHA-bound log chunks.

The manual workflow has no cache or artifact upload and uses the existing same-operation concurrency group. Its receiving owner enables only that original repository/workflow for one requested job, retains the actual output, then restores both disabled states and reads them back. A source publication alone does not dispatch the programme.

Select receiving_mode=installed-customer-fixture explicitly. original-mcp preserves the historical frozen continuation for its retained operation; the accepted original7+8 result is already complete.

## Recover the complete original hosted output

Download the complete log for the receiving job, then use the retained decoder:

```bash
python3 operations/scf-receivables-native-2a51-20261012/recover-hosted-customer.py \
  --logs /private/receiving-job.log \
  --out /private/recovered-customer
```

The decoder requires every numbered chunk and the exact original byte count and SHA256 before it publishes a file. It writes a private, create-only directory and a `LOG_RECOVERY.json` receipt bound to the complete input log. The recovered `retained-customer-workspace.tar.gz` contains the actual controlled source and receiving accounts, encrypted accounting backup, private requests and phase logs; `retained-customer-files.json` lists every original member. The complete selected release archive is retained inside that package. Keep the original log with the recovery receipt.

The selected customer contribution explicitly includes the original SF101 `recover.mjs` engine. Accounting invokes that engine by a retained URL, so its original source must travel with the release even though it is not a static ESM dependency.
