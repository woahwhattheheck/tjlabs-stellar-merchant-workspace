# Standalone ObjectSession recovery through the native MCP operator

This operator entry exposes the existing SF88 `ObjectSessionRecovery` API and SF101 encrypted recovery engine. It lets an agent review a complete host-selected free Object session, save an encrypted backup, verify the saved backup, restore the original canonical root, and inspect or explicitly continue the same saved recovery request.

The source must already be a native standalone session with all three allocation limits at zero and no SF36 ledger. Native inspection verifies the complete original inbox, configuration history, policy, signer module, evidence, assemblies, and prior session lease history. This workflow never acquires data, initializes a ledger, removes a source directory, or starts a restored session. Managed or paid sessions keep their existing workspace recovery path.

## Host registration

Use the same installed native MCP workspace and original operator runtime. The host, outside the tool conversation, creates a private profile JSON:

```json
{
  "schema": "stellar-forge.mcp-native-object-recovery-profile.v1",
  "name": "original-free-object",
  "label": "Original free data receiving",
  "directory": "/private/object-state/sessions/original",
  "stateRoot": "/private/object-state",
  "include": [],
  "bundle": "/private/object-backups/original-001",
  "passphraseEnv": "SF88_BACKUP_PASSPHRASE",
  "kinds": ["snapshot", "verify", "restore"]
}
```

These are illustrative absolute paths; use the actual original canonical paths. The session must be below stateRoot. All native dependencies and explicit includes must be inside that root. Keep the native MCP workspace, its managed buyer workspace, and the backup directory outside it. The backup parent must already exist. The same process environment used by the original native runtime supplies the named passphrase and required cryptography runtime. Do not put the passphrase value in the registration, tool input, log, or source repository.

Register the exact file through the maintained CLI:

```sh
node stellar-forge/mcp-paid-agent/native-workspace-cli.mjs object-recovery-register \
  --dir /private/existing-native-mcp \
  --description /private/original-free-object.profile.json
```

Registration performs a full original native inspection and retains the complete observed session/configuration binding and result. The alias is immutable: reopening an identical registration returns it; a different declaration cannot overwrite it. A later backup edition uses another alias and output location.

A separately received encrypted bundle can be registered with kinds `["verify", "restore"]` and a required `expectedRecordSha256`. Registration then verifies the complete bundle through the same native SDK, including its authenticated original session and canonical root. An existing source directory is not required for this registration. The authenticated canonical paths remain authoritative; the operator cannot redirect a restore through a tool argument.

## Tool conversation

Use the existing `sf43_discover_review_and_pay` tool with `action: "object-recovery"`. Local recovery does not authorize a payment. The normal original MCP transport authentication, host registration and shutdown behavior apply.

1. Call `objectRecoveryOperation: "profiles"`. Keep the returned alias and profile SHA256.
2. Call `inspect` with `objectRecoveryProfile` and `objectRecoveryProfileSha256`. Review the native session identity, zero-cap checkpoint, absent-ledger status and complete relative file list. Use `offset` and `limit` to receive all files. Every page is a fresh complete native inspection; if its review SHA changes, restart the review instead of mixing pages.
3. Stop the source's actual writers through their original owner. Submit `snapshot` with a fresh UUIDv4 `objectRecoveryRequestId` and `objectRecoveryInput: {expectedReviewSha256, quiesced: true}`. The native BACKUP lease and exact reviewed source check remain decisive. The tool's assertion does not stop another writer.
4. Keep the returned native record SHA256. Submit `verify` under its own UUID with `objectRecoveryInput: {expectedRecordSha256}`.
5. When restoring is actually intended, submit `restore` with the same record SHA and a separate UUID. The caller performs a complete native verification against the registered original session before invoking restore. The native engine only publishes at the original canonical root and applies its existing absent/empty destination and same-backup marker rules. The caller has no delete or force option.
6. Use the original ObjectSession interface to inspect or explicitly continue the received session. A subsequent explicit restore request for the same record invokes the engine's same-backup reopening and retains later native state. A repeated call using the original completed request ID returns its recorded result instead of claiming a fresh observation.

For example, a snapshot tool request has this shape:

```json
{
  "action": "object-recovery",
  "objectRecoveryOperation": "snapshot",
  "objectRecoveryProfile": "original-free-object",
  "objectRecoveryProfileSha256": "<actual profile SHA256>",
  "objectRecoveryRequestId": "<fresh UUIDv4>",
  "objectRecoveryInput": {
    "expectedReviewSha256": "<actual complete native review SHA256>",
    "quiesced": true
  }
}
```

The result deliberately keeps `completionReported`, `ok`, native publication/reopen errors, and native process exit facts separate. `COMPLETED` requires both a clean SDK result and no caller identity error. `PUBLISHED_WITH_ERRORS` means the native engine reported publication but did not report a clean completed lifecycle. Reopen and inspect that original request before choosing a following action.

## Lost response and explicit continuation

Every operation saves its exact immutable request before invoking the native SDK. Each native attempt has a separate durable attempt record and returned result. A process loss can leave a request in `PREPARED` or `RECONCILIATION_REQUIRED`; it cannot silently dispatch again when a model repeats its original input.

Use `show` to read the selected request and `history` for a complete paginated list. The public result includes the exact request hash, original inputs, latest attempt ID, native completion and clean-exit facts. History and show report retained observations; they do not revalidate live source state.

To continue deliberately, call `continue` with the original profile and request ID and:

```json
{
  "expectedRequestSha256": "<actual immutable request SHA256>",
  "afterAttempt": "<actual last attempt UUID, or null for PREPARED with no attempt>"
}
```

This consumes the selected prior attempt. Repeating that continuation after a following attempt exists only returns the retained later outcome. Snapshot continuation uses the original engine's matching published-bundle recognition; restore continuation uses its matching native restoration marker. Verification is a fresh original read. The complete saved request always supplies the native arguments. Changed profile, review, record or request identities are rejected. The operator never derives a new request from current source state.

`cancel` addresses only the exact request currently owned by this host. It aborts that original SDK command and awaits its bounded child cleanup before returning. It does not signal another host, delete a published backup, clear a native lease by guessing, or erase retained attempts. Closing the host rejects new work, aborts its owned commands, and drains tracked work before release.

## Files and independent receiving

The encrypted bundle is written in full at the registered host location by SF101. Preserve every original bundle member, its record SHA, the complete private profile and this operator's `object-recovery` journal when handing it to the receiving host. Use the existing SF101 bundle transfer/export workflow or the host's normal complete-file delivery. Model-facing results use aliases and native identities; arbitrary filesystem downloads are not accepted.

The private operator journal contains original full native results and canonical paths. It is operator data, not a public report. Its flat, atomically published request and result files avoid an empty operation directory becoming unrecoverable after a first-write failure. The original initialization lock serializes registry and operation changes across processes. Original native session and restore leases remain the authority for source effects.

## Integration

`openNativeWorkspace()` now provides `registerObjectRecovery(profile)` and routes only the new `object-recovery` action to this caller. The original object acquisition actions, dataset/collection/analysis workflows, buyer approvals and ledger remain unchanged. The SF43 schema advertises all recovery fields; model calls cannot provide local paths, runtime binaries, passphrase values or alternate source definitions. The original native CLI can perform the same calls from a private JSON input using its existing `call` command.

This is a caller and durable operator workflow over the completed recovery engine. It does not implement another archive format or recovery engine.
