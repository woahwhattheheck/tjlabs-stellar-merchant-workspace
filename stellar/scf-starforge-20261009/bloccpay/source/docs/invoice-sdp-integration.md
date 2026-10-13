# SDP invoice desk and the company transaction service

The invoice SDP desk delegates its three provider mutation families to the existing Bloccpay operations workspace: create a disbursement, upload its original instructions, and change its status. The company SQLite database remains the transaction owner. The adapter invokes the same operation.prepare and operation.dispatch commands used by the company desk, preserving its authenticated capability checks, economic evidence, delivery configuration, private exchange files, response recovery and complete receiving package.

## Select the existing workspace

Use Node24 and the existing company source/runtime. The module examples/invoice-sdp-adapter.mjs exports openTransactions for the invoice desk's adapterModule setting. Set BLOCCPAY_SDP_ADAPTER_CONFIG to an absolute private JSON file following examples/invoice-sdp-adapter.configuration.json. That file and its configurationFile must be regular files with owner-only permissions. They remain outside exported source and workspaces.

Select the existing workspaceDirectory, expectedWorkspaceId, connectionAlias and programmeVersionId. Startup requires its existing workspace.sqlite and exact workspace identity. It opens that database; it does not create a replacement account or transaction ledger. The original programme must match the configured provider environment, source wallet and asset, and must include the selected connection. The invoice desk's scope must match the same provider origin, tenant, source wallet and network.

The invoice SDP desk still uses its existing named connection for provider reads. Keep that connection and the company connection on the same original account. Select the original creator or approver connection as appropriate for the action. The company dispatch code independently verifies the authenticated provider capabilities for its selected actor.

A private invoice desk entry selects the absolute examples/invoice-sdp-adapter.mjs module in this original company source tree. Its normal programmeId/programmeVersion remain invoice programme identifiers; the adapter configuration's programmeVersionId is the exact existing company programme record. Both scopes are checked before admission.

## Evidence and wire requests

The adapter uses original company resource versions. Unless explicit IDs are selected in evidence, it selects the newest matching authenticated capabilities, disbursement, receiver wallet and asset versions from the same connection and provider scope. It never obtains authority from a hypothetical role or user query. A deployment may call createSDPCompanyTransactions directly with selectEvidence to choose its actual retained records.

For an instruction upload, the complete CSV must match an original company instructions record, its programme, payroll, wallet version and disbursement version. The two producers put the same CSV columns in a different order. The adapter therefore parses both complete files, requires the exact same header set and unique payment IDs, and compares every cell without normalizing amounts, contacts, IDs, memos or verification values. It sends the existing company fileId. Both original byte digests, sizes and the exact-byte comparison remain in sdpSDKInstructions evidence; the complete SDK bytes remain in sdpSDKIntent. Run the company desk's existing payroll import/instruction preparation if that record is absent. A changed amount or recipient never passes this comparison.

For direct wallet-address registration, native SDP selects an enabled user-managed receiver wallet itself. The adapter selects an observed enabled user-managed wallet as evidence, while the create body omits wallet_id and verification_field as required by the pinned provider handler. The company validator applies that same native branch. Later instruction creation and upload bind the actual wallet returned with the provider disbursement.

The SDK descriptor is an intent. Its full descriptor and digest are retained inside the original operation evidence as sdpSDKIntent. The company producer freezes the actual native request, including its original JSON and multipart encoding. Observations contain both identities: requestSHA256 binds the SDK intent; companyOperation.requestSHA256, nativeRequestSHA256 and nativeRequest identify the actual company wire request. The original provider response, source, attempt and private exchange file are linked in companyOperation.

## Replay and recovery

An SDK operation identity maps deterministically to one original company prepare request and one dispatch request. A changed descriptor under that identity fails. Completed, rejected, canceled and uncertain operations return their retained original outcome before another provider read or write. A retained DISPATCHING operation is recovered by the same company command, which retains its exchange or records uncertainty without sending again.

A fresh prepared operation performs the SDK's current-provider comparison before the original company dispatch. The company then applies its own delivery and financial checks. An SDK source-save failure can be retried: the company returns the same original exchange and the invoice journal retains it. Provider errors and incomplete responses remain reviewable in the company operation and the invoice observation.

Use the company operation.reconcile command to inspect an uncertain operation's actual native resource. Preserve its original operation identity. Status pause/resume intents already include their complete reviewed predecessor in the SDK identity, so a later reviewed transition has its own action while an identical retry reuses the original.

## Signed events

The SDK retains the original X-SDP-Timestamp and X-SDP-Signature headers alongside exact raw bytes. The company endpoint rechecks those bytes against its selected endpoint secret and scope. Event identity, original payload and required resource readback selection are committed through the existing SQLite event writer. Repeated identity and body return the original record; a changed body under that identity is a conflict.

The adapter resumes webhook.project with the same event request identity. Resource reads use the original operation.prepare/operation.dispatch path before projection. SDP event metadata never supplies invented balances or complete payment records. The exact company webhook source, provider readback and projected versions travel in its normal receiving package.

## Ownership and shutdown

createSDPCompanyTransactions borrows an already open company workspace and drains accepted adapter calls in close. The example module owns the SQLite connection it opens and closes it after that drain. Failed startup exposes the same close function if cleanup needs retry; the invoice host retains that original owner. The adapter never closes a borrowed invoice workspace.

Source: company lib/workspace.mjs, lib/native.mjs, lib/validation.mjs and the pinned SDP provider catalogue. Invoice integration: SDPClient.executeMutation and createSDPWorkspace transactions in the existing invoice settlement application.

The direct-address create behavior follows the retained original disbursement handler at backend commit4330f131e8a2638a10767ec8db50a98f22672a61. Its `createNewDisbursement` selects enabled user-managed wallets; the original `internal/data/wallets.go` record exposes `enabled` and `user_managed` (Git blob a7efc9c0ad4310d2f2be13216989a8df0409e4ff).
