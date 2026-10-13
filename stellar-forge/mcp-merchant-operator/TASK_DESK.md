# Operate an existing InboxTask desk through Merchant

The Merchant bridge connects to the original desk already running through
Applications or the installed buyer-task-desk command. It opens no additional
Inbox, buyer process, task store or receiving destination. The original desk
continues to own native reviews, accepted commands and operation history.

## Connect the original application

Keep the complete launch JSON printed by buyer-task-desk in an owned private
file. When using Applications, select its saved original application-url record
for the buyer-task-desk command instead. Both forms retain the original
instance and operating roots.

For a direct launch, set private file permissions before starting the existing
command. Its stdout is the complete launch JSON; diagnostics go to stderr:

~~~sh
umask 077
starforge buyer-task-desk --runtime /private/original/sf88-operator-buyer-cli \
  --state /private/buyer-state --inbox /private/commerce/inbox \
  --tasks /private/buyer-state/tasks --outputs /private/received \
  --commerce /private/commerce > /private/task-desk-launch.json
~~~

Keep any existing --existing-task/--existing-output pair and --delivery option
from the original operation. The paths above illustrate configuration; use
the original operation's actual directories. Reopening a desk updates the same
selected launch file with its new instance and address.

Create a private connections JSON with every root exactly as reported by that
desk. Optional roots are included whenever the original status includes them:

~~~json
{
  "schema": "stellar-forge.task-desk-connections.v1",
  "desks": {
    "original": {
      "label": "Original buyer tasks",
      "connectionFile": "/private/task-desk-launch.json",
      "roots": {
        "inbox": "/private/commerce/inbox",
        "tasks": "/private/buyer-state/tasks",
        "outputs": "/private/received",
        "commerce": "/private/commerce"
      },
      "maxFileBytes": 268435456
    }
  }
}
~~~

connectionFile may be relative to the connections file. All roots are absolute.
The bridge rereads the original launch and verifies the actual live status on
every new request. Each native HTTP response also carries the same instance header,
which is checked before accepting its metadata or full file. It refuses a changed root, another process occupying the old
port, or a mutation carrying an earlier instance. Status omits the desk's session
token. The token remains inside this original loopback transport.

Add taskDeskConnection to the existing Merchant host configuration:

~~~json
{"taskDeskConnection": "/private/task-desk-connections.json"}
~~~

Retain the host's existing schema, name, releaseStore, sources and private
exportsDirectory. The source-owned buyer-task-desk contribution registers the
provider, installed client export and CLI. Inspect it with:

~~~sh
starforge merchant-providers inspect buyer-task-desk
starforge merchant-task-desk --connection /private/task-desk-connections.json \
  --exports /private/merchant-exports list
starforge merchant-task-desk --connection /private/task-desk-connections.json \
  --exports /private/merchant-exports status --desk original
~~~

The authenticated existing Merchant server advertises the tools only when this
connection is configured. It retains its original authentication and ownership
lifecycle. The bridge requires no independent listener.

## Select and operate the original task

Use merchant_task_desk_jobs to inspect original Inbox jobs. For a settled RPC
recovery, merchant_task_desk_rpc_reads lists the saved read editions;
merchant_task_desk_rpc_inspect verifies the exact readId and responseSha256.
The original uncertain attempt remains separate from those later result bytes.

Read merchant_task_desk_status and retain its instanceId. Preview a task through
merchant_task_desk_preview using the complete original CallerTask fields
(system,id,revision,title,purpose,service) and its selected original intents.
Each selection retains intentId,role and optional sourceEdition,facilitator,
decisionRef,reservationRef. An optional rpcResult selects readId and
responseSha256; the bridge fills commerceDirectory from the host's original
configured root. Remote callers do not select another host directory.

Save the unchanged task and selection with merchant_task_desk_create and the
exact returned expectedPreviewSha256. Its result retains the native task record.
List saved revisions with merchant_task_desk_tasks; reopen one with
merchant_task_desk_inspect using both taskId and expectedTaskSha256. Compare
immutable revisions with merchant_task_desk_compare and both original hashes.

The complete command flow remains native:

1. Review the selected intent with merchant_task_desk_review. Keep its original
   reviewId and complete native review.
2. Explicitly call merchant_task_desk_execute with that reviewId, the same
   instance/task/intent and a caller-retained requestId.
3. Inspect merchant_task_desk_operations using that exact operationId. A returned
   HTTP success or accepted operation does not replace the native result.
4. When the original request needs recovery, merchant_task_desk_recover calls
   the existing native recovery for that same intent.
5. merchant_task_desk_receive continues the task's selected original receiving
   destination. A complete moved packet remains available through the read paths.

execute, recover and receive return the original queued/running or terminal
operation record. Their requestId is the native operation ID. A lost reply is
resolved by reading that ID, then explicitly resending the exact original
command if needed. No tool retries a mutation automatically.

After a desk restart, inspect the saved operation using the current connection.
For any newly reviewed command, select the current instance and obtain its own
native review. The old native result and interrupted-operation state stay in
the original task store; the bridge never starts a replacement purchase.

## Receive every original byte

merchant_task_desk_packet verifies the original complete packet and returns its
files, hashes and native outcomes. merchant_task_desk_packet_file selects:

| kind | Original bytes |
| --- | --- |
| response | The complete selected intent response, with its native byte count and hash. |
| archive | The complete packet TAR, including task, receiving plan, report, manifest and all original responses. |

Both require desk,taskId,expectedTaskSha256 and kind. A response also requires
intentId. A first read requires expectedInstanceId; the retained reader returns
readId,file.sha256,file.bytes and a complete base64 range. Continue with the same
selection, readId,expectedSha256 and nextOffset until nextOffset is null.
After expiry or a Merchant restart, select the same original digest and offset
against the reopened original desk.

merchant_task_desk_rpc_file similarly selects the original intent,
sourceReadId and responseSha256. sourceReadId is the original recovery edition;
readId is the temporary complete-file receiving handle. These identities are
kept separate.

The bridge streams the complete original file into one private descriptor,
checks its original length/hash where supplied, and transfers that read-only
descriptor to the existing RetainedFileReads owner. Each returned range is
derived from those complete verified bytes. It never places an entire large
response in a tool message. The host-selected maxFileBytes applies to each full
file; the retained reader's existing four-read limit remains in effect.
Temporary files are unlinked after acquisition; their descriptors close at the
final range, expiry, explicit release or bridge shutdown.

The installed CLI receives the same whole file atomically:

~~~sh
starforge merchant-task-desk --connection /private/task-desk-connections.json \
  --exports /private/merchant-exports download \
  --input /private/original-packet-selection.json \
  --output /private/customer/task-results.tar
~~~

The private input is the complete first packet-file selection. For a saved RPC
response, add kind:"rpc" and use intentId,sourceReadId,responseSha256 with the
original desk and instance. The CLI verifies all ranges and the final full
SHA256, then publishes a complete file without overwriting a different output.
Repeating a completed download accepts only the identical complete bytes.

Extract the complete TAR to use review.html with its original relative response
files. The original packet inspector remains available independently through
starforge buyer-inbox-task packet-inspect --packet DIRECTORY.

## Customer delivery and receiving

The desk's existing Customer delivery tab and typed client retain the complete
task-to-reviewed-delivery path introduced in PR1323. Registered Collections
customer-delivery tools continue to own package preparation, recipient
history, uploads and independent customer receiving. This provider supplies
the original caller-task operating selection and complete packet; it does not
introduce a competing customer-package API.

## Installed JavaScript

Import MerchantTaskDesks and its paired declarations from
@tokenjunkielabs/starforge-merchant/merchant/task-desk, or from the maintained
source module. readTaskDeskConfiguration reads the exact same private host
connection. call(name,args) uses the tool schemas and freezes its input before
asynchronous work. Results contain desk,instanceId,bindingSha256 and the
unchanged native value; errors preserve the original code,status,details,
nativeResult and requestId.

Call close() after the caller finishes. It drains this bridge's accepted
transport calls and temporary reads. The original desk and its already accepted
native commands retain their existing lifetime.

Source entry points:
- task-desk.mjs: original transport owner and complete-file receiving.
- task-desk-connection.mjs: private original launch and live-root binding.
- catalog/task-desk.mjs: the full nineteen-tool metadata.
- providers/task-desk.mjs: original source-owned lazy provider.
- task-desk-cli.mjs: installed command and atomic complete-file export.
- task-desk.d.mts: typed public contract.

The provider and installed caller accept complete request JSON up to the original desk's 4 MiB limit. Individual fields and selection counts retain their declared schema limits.
