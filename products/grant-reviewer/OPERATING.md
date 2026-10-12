# Review a retained grant purchase and hand it over

Open the original public purchase as an operating reviewer workspace. Review its
source and terms, read both complete native results, export a closed Buyer view,
and receive that packet under another operator's private workspace.

This workflow uses the retained purchase. The original transaction, quote
identities, seller outcomes and source documents remain part of that packet.
Opening, reading, exporting and receiving it do not dispatch another payment
or refresh the source data.

## Open the reviewer

Use the [maintained runtime installation](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
with the native Stellar packages, the `mcp` feature and operator support.
Retain its selected source archive, complete lock and READY installation.

In **Applications**, select **Grant purchase reviewer**. Choose that runtime
and a private workbench directory beneath an existing private parent. Leave
Packet and SHA-256 empty to select the bundled original purchase in the
workbench, or supply the exact receiving packet and displayed digest.

Choose **Review**, **Save**, **Connect** and **Start**, then **Open**.
The saved application binds the workbench, selected packet and runtime.
Applications opens only the current workbench instance.

The installed command opens the same product directly:

~~~sh
starforge grant-demo workbench --dir /srv/starforge/state/grant-review --port 0
~~~

For a source checkout, replace `starforge grant-demo` with
`node stellar/scf_2026/presentation/reviewer/cli.mjs`.
Keep the private parent directory under the operator's control. Structured
startup output contains the listening address and instance identity; open
through Applications or read the original local
`workbench-connection.json` for this instance's private access code.
The browser clears the entered code and URL fragment after connecting.

## Review the original source and read the complete result

1. Open **Packet intake** and choose **Review bundled purchase**, or upload the
   complete exported JSON packet. The workbench retains its exact bytes and
   checks its original documents, native result representation and SHA-256.
2. Open **Source and query**. Review the retained source, original query,
   selected terms and complete source-document downloads.
3. Choose **Receive this packet**. The original receiving engine restores the
   native quote records and full result files into this selection's private
   directory.
4. Choose **Open original Buyer**, then open **Buyer results**.
5. Select each quote and choose **Read complete saved result**. The original
   Buyer client reads every retained range and checks the complete byte count
   and digest before presenting or downloading the result.

The bundled NYC HPD purchase contains 100 building-in-project rows and
14 columns in its original 53,468-byte MCP result. Its retained truncation flag
remains true. The source vintage and exact query are shown with that result;
these are historical project events rather than a current housing listing.

The primary quote retains its confirmed seller status and matched transfer.
The earlier indeterminate quote remains separately visible with its original
failed observation and complete 4,733-byte error result. Read each original
record in its own history.

**Open original console** uses that Buyer's existing private-code form.
Retrieve and copy its current code through authenticated local access.
Keep it out of exported packets and shared project metadata.

## Export a closed Buyer and receive it elsewhere

Choose **Handover → Close Buyer and export packet**. The workbench waits for
the whole original Buyer to close, drain its work and release the writer lease.
The export then includes the complete native quote transitions and results
from that closed view.

Download the packet and retain its displayed SHA-256 with it. Give the receiving
operator the complete packet. Their new Applications review selects that
original file and digest, a new private workbench directory and their own
reviewed runtime.

The direct command uses the same receiving path:

~~~sh
starforge grant-demo workbench --dir /srv/starforge/state/received-review \
  --packet /srv/starforge/received/original-review.json \
  --sha256 ORIGINAL_EXPORTED_SHA256 --port 0
~~~

The receiving operator reviews and receives the packet, opens the native Buyer
and reads the full original results. Their private access code and workbench
are new; the original quote identities and result bytes remain the same.
**Review receiving copy** provides this same handover locally and labels that
selection as a local copy.

## Continue after closing or interruption

Use **Reopen this received packet** to start the original Buyer after a closed
export. In Applications, **Stop** drains the managed workbench and its Buyer;
the next reviewed Start reopens the same retained workspace.

Keep the workbench directory and its original action IDs. A lost response can
continue the same action with the same selected inputs. An already published
export is recovered by its original identity before current mutable Buyer
history is read. A completed Open receipt shows its historical outcome
separately from the current live Buyer.

A prepared managed start retains its original request ID before child dispatch.
Reopen the same Applications controller and recover that request. Do not
substitute a new workbench or repeat the original purchase.

The [complete reviewer operating guide](../../stellar/scf_2026/presentation/reviewer/WORKBENCH.md)
covers the original command, private access, receiving decisions and managed
continuation. Its full receiving carrier can extend the same already completed
direct journal with an actual matching READY runtime; it keeps the original
run, skips completed direct phases and preserves the earlier result.


## Operate the same review from a merchant or application client

The [merchant provider and typed client](../../stellar/scf_2026/presentation/reviewer/merchant/README.md)
connect these same workbenches to the existing merchant MCP host. Select the
full toolkit or a reviewed product selection containing both `merchant-mcp`
and the `merchant-grant-reviewer` contribution.

Save the original and receiving directories under named aliases in a private
`stellar-forge.grant-reviewer-merchant-connection.v1` JSON file. An alias with
`allowStart: false` borrows the workbench already opened by Applications;
`allowStart: true` permits an explicit start of that same original workbench.
The complete guide supplies the exact connection fields and source-file pins.

~~~sh
starforge merchant-grant-reviewer init --directory /srv/starforge/reviewer-merchant \
  --connection /srv/starforge/private/reviewer-connections.json
starforge merchant-mcp serve --config /srv/starforge/reviewer-merchant/merchant-mcp.json \
  --port 3211 --token-env MCP_ACCESS_TOKEN
~~~

The twenty `merchant_grant_reviewer_` operations provide source review and
receiving, current Buyer lifecycle, original quote/history/result reading,
complete document retrieval, closed-view export and full-file receiving.
The typed `@tokenjunkielabs/starforge-merchant/grant/reviewer-merchant` client
uses the same contracts; its CLI supports calls, local-file review, inspection,
interrupted-download continuation and local cold reopening.

Retain the request UUID with each action. After a lost reply, inspect or repeat
that original action with the same input. An exported file keeps its complete
manifest, original workbench identity, byte count and SHA-256 as the merchant
host restarts. The receiver resumes the original saved download directory and
checks every file before reopening it.

Merchant shutdown releases its readers and its own workbenches. An
Applications-owned workbench remains with that original owner. The private
Buyer code stays in its original host connection.

This standalone edition includes the complete source from
[public PR1984](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/1984),
merge `ddde47d69aac27cae5021a17bc6b3d15d43fc884`. The complete
[merchant receiving continuation](../../stellar/scf_2026/presentation/reviewer/merchant/RECEIVING.mjs)
extends the same original closed reviewer operation and both saved result files.
Its new twelve-phase run is pending runtime admission; the completed original
fourteen-phase browser outcome and original payment count remain unchanged.
