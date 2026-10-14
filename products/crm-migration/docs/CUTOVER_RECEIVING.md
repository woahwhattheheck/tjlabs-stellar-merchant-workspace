# Receiving the complete working product

## Browser

1. Extract the complete source handover to a private working directory.
2. Open Cutover_Desk.html in a current browser.
3. Enter your operator name. Review the authored example in Plans and Packets.
4. Save a workspace, reopen it and check that the original plan, decisions and observations remain.
5. Download the whole ZIP; inspect the original CSVs, readable plans and ordered packet.
6. Start a new workspace or copy the example configuration after retaining your own original exports.

The offline file has no external dependencies. Ordinary mappings and decisions use forms. The separate CRM_Migration_Desk.html remains available for source-to-target acceptance rehearsals.

## Native

Run the commands in README.md. The verify command executes the actual source course and focused receiving checks. An apply command takes a complete operation object with id, actor, at, expected_revision, kind and payload. Workspace mutation holds an exclusive adjacent lock, re-reads the current bytes, writes a private temporary file, fsyncs and renames. Exact operation retries preserve idempotency; changed retries are rejected.

Export writes a complete identity plan before member files. Repeating the same export in the same directory checks exact member bytes; a different existing member is rejected. Keep interrupted output and rerun the same plan. Physical paths are required; symlink outputs are refused.

## Complete source carrier

The source carrier schema is crm-cutover.source-carrier.v1 with codec gzip+base64, decoded byte count and SHA256. native/receive-source.cjs verifies the complete decoded source and every member before materialization. Use a new absolute directory or the original matching receiving plan.

```sh
node native/receive-source.cjs CRM_Cutover_Complete_Source.gzip.json /absolute/new/cutover-workspace
```

## Receiving status

The production modules, complete authored course, replay, exact-decimal handling, named conflict decisions, late-edit reversal refusal and all ZIP members were exercised in V8 in this session. Node filesystem and rendered-browser receiving remain operations to run on an equipped host. Inspect ordinary controls at desktop and narrow widths and confirm Save/Open, branch adoption and ZIP downloads against the included source course.
