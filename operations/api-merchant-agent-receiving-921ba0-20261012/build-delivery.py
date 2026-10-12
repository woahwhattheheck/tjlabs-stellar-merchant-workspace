import os,sys,json,hashlib,stat,tempfile,zipfile,html,datetime,re
from pathlib import Path

CASE=Path('/dev/shm/921ba0-api-merchant-native')
AGENT=Path('/dev/shm/921ba0-api-merchant-agent-native')
ORIGINAL=Path('/dev/shm/921ba0-api-native-20261011')
SOURCE=Path(os.environ['SCF_MERCHANT_AGENT_SOURCE'])
WORKSPACE='17284006-d724-4d0b-be69-d6fe586a8e8a'
COMMIT='68faef31c6b0bd94ac99715f53144aa5512c0672'
ORDER='api-pass-native-chain-921ba0'
REQUEST='api-application-analyze-921ba0-20261011'
MERCHANT_SHA='080706ff21d2ab8cea344b5152c3110760a3408744db928605b55e5fa4ee3a8f'
RESPONSE_SHA='9f1b3366668ce42810926ce0537a773b7696941762f9016b43a9f6532714ab0e'
BACKUP_SHA='942cd0e195bfab6659d9faaf6217b6e35bdbeec385c6e33b1dcc74e056c2c743'
METADATA_SHA='43c1fc20f4deac518f945197df1da6de545a277bb8b84de88493b59e1b6c1cc6'
PREFIX='stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace'
REPO='https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace'
BASE=REPO+'/blob/'+COMMIT+'/'
entries={}

def need(condition,code):
    if not condition: raise RuntimeError(code)

def sha(body): return hashlib.sha256(body).hexdigest()

def read(path,maximum=64*1024*1024):
    path=Path(path)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_uid==os.getuid() and info.st_size<=maximum,'DELIVERY_SOURCE_FILE_INVALID')
        body=stream.read(maximum+1)
        need(len(body)<=maximum and len(body)==info.st_size,'DELIVERY_SOURCE_FILE_CHANGED')
        after=os.fstat(stream.fileno())
        need((after.st_size,after.st_mtime_ns)==(info.st_size,info.st_mtime_ns),'DELIVERY_SOURCE_FILE_CHANGED')
        return body

def parse(body): return json.loads(body.decode('utf-8'))

def add(name,body):
    need(isinstance(name,str) and not name.startswith('/') and '\\' not in name and
         all(part not in ('','.','..') for part in name.split('/')),'DELIVERY_MEMBER_PATH_INVALID')
    need(name not in entries,'DELIVERY_MEMBER_DUPLICATE')
    entries[name]=body.encode('utf-8') if isinstance(body,str) else body

def pretty(value): return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8')

merchant_bytes=read(CASE/'result.json')
merchant=parse(merchant_bytes)
agent_bytes=read(AGENT/'result.json')
agent=parse(agent_bytes)
journal=parse(read(AGENT/'journey.json'))
need(sha(merchant_bytes)==MERCHANT_SHA and merchant['status']=='PASS' and len(merchant['phases'])==10 and
     merchant['workspaceId']==WORKSPACE,'ORIGINAL_MERCHANT_COMPLETION_REQUIRED')
need(agent['status']=='PASS' and len(agent['phases'])==8 and agent['workspaceId']==WORKSPACE and
     agent['sourceCommit']==COMMIT and agent['originalResultSha256']==MERCHANT_SHA and
     agent['originalOrderReference']==ORDER and agent['originalRequestId']==REQUEST,'ORIGINAL_AGENT_COMPLETION_REQUIRED')
need(journal['status']=='PASS' and journal['id']==agent['id'] and isinstance(journal.get('endpoint'),str),
     'ORIGINAL_AGENT_JOURNAL_CHANGED')
need(agent['usage']=={'allowanceUnits':8,'consumedUnits':2,'reservedUnits':0,'availableUnits':6},
     'ORIGINAL_ALLOWANCE_CHANGED')
need(agent['originalExecution']['attempts']==1 and agent['originalExecution']['bytes']==279 and
     agent['originalExecution']['sha256']==RESPONSE_SHA,'ORIGINAL_EXECUTION_CHANGED')
selection_bytes=read(SOURCE/'SOURCE-SELECTION.json')
selection=parse(selection_bytes)
need(sha(selection_bytes)==agent['sourceSelection']['sha256'] and selection['sourceCommit']==COMMIT and
     len(selection['files'])==agent['sourceSelection']['files']==674,'ORIGINAL_SOURCE_SELECTION_CHANGED')

add('native-operation/merchant.json',merchant_bytes)
add('native-operation/agent.json',agent_bytes)
add('source/selected-source.json',selection_bytes)
input_bytes=read(ORIGINAL/'application-input.json')
need(parse(input_bytes)=={'values':[2,4,6,8],'window':2},'ORIGINAL_APPLICATION_INPUT_CHANGED')
response_bytes=read(CASE/'received/original-response.bin')
need(len(response_bytes)==279 and sha(response_bytes)==RESPONSE_SHA,'ORIGINAL_APPLICATION_RESULT_CHANGED')
add('analysis-input.json',input_bytes)
add('analysis-result.json',response_bytes)

descriptions=[]
for label in ('backup','usage','execution'):
    selected=agent['exports'][label]
    directory=Path(selected['directory'])
    need(directory==AGENT/'received'/label and directory.resolve()==directory,'ORIGINAL_RECEIVING_PATH_CHANGED')
    manifest_bytes=read(directory/'manifest.json',1024*1024)
    need(sha(manifest_bytes)==selected['manifestSha256'],'ORIGINAL_EXPORT_MANIFEST_CHANGED')
    manifest=parse(manifest_bytes)
    need(manifest.get('schema')=='stellar-forge.sf101.api-merchant-export.v1' and
         manifest.get('id',manifest.get('exportId'))==selected['exportId'] and manifest['kind']==selected['kind'],
         'ORIGINAL_EXPORT_IDENTITY_CHANGED')
    actual={item['name']:(item['bytes'],item['sha256']) for item in manifest['files']}
    selected_members={item['name']:(item['bytes'],item['sha256']) for item in selected['files']}
    need(len(actual)==len(manifest['files']) and actual==selected_members,'ORIGINAL_EXPORT_MEMBERS_CHANGED')
    checkpoint_bytes=read(directory/'download-state/checkpoint.json',1024*1024)
    checkpoint=parse(checkpoint_bytes)
    suffix='#api-merchant-workspace=original-paid-api&workspace-id='+WORKSPACE
    need(checkpoint['exportId']==selected['exportId'] and checkpoint['manifestSha256']==selected['manifestSha256'] and
         checkpoint['endpoint']==journal['endpoint']+suffix,'ORIGINAL_DOWNLOAD_BINDING_CHANGED')
    add('downloads/'+label+'/manifest.json',manifest_bytes)
    add('downloads/'+label+'/download-state/checkpoint.json',checkpoint_bytes)
    retained_manifest=read(directory/'download-state/manifest.json',1024*1024)
    need(retained_manifest==manifest_bytes,'ORIGINAL_RETAINED_MANIFEST_CHANGED')
    add('downloads/'+label+'/download-state/manifest.json',retained_manifest)
    for name,(size,digest) in actual.items():
        need(isinstance(name,str) and '/' not in name and '\\' not in name and name not in ('','.','..'),
             'ORIGINAL_EXPORT_FILENAME_INVALID')
        complete=checkpoint['files'].get(name)
        need(complete and complete['complete'] is True and complete['bytes']==size and complete['sha256']==digest,
             'ORIGINAL_DOWNLOAD_INCOMPLETE')
        body=read(directory/name)
        need(len(body)==size and sha(body)==digest,'ORIGINAL_DOWNLOADED_MEMBER_CHANGED')
        add('downloads/'+label+'/'+name,body)
    descriptions.append({'label':label,'directory':'downloads/'+label,'exportId':selected['exportId'],
                         'manifestSha256':selected['manifestSha256'],'kind':selected['kind'],'files':selected['files']})
need(sha(entries['downloads/backup/application-backup.zip'])==BACKUP_SHA and
     sha(entries['downloads/backup/backup.json'])==METADATA_SHA,'ORIGINAL_BACKUP_CHANGED')
backup_record=parse(entries['downloads/backup/backup.json'])
links={'repository':REPO,'sourceCommit':COMMIT,'mergedProduct':REPO+'/pull/24',
       'installedSource':BASE+'README.md','operatorGuide':BASE+PREFIX+'/README.md',
       'agentGuide':BASE+PREFIX+'/AGENT_OPERATING.md',
       'typedClient':BASE+'stellar-forge/mcp-merchant-operator/api-merchant-client.mjs'}
add('source/links.json',pretty(links))
add('exports.json',pretty({'schema':'stellar-forge.sf101.api-merchant-complete-delivery-exports.v1',
    'workspace':'original-paid-api','workspaceId':WORKSPACE,'endpoint':journal['endpoint'],'exports':descriptions}))

guide=r'''# Paid API merchant: complete operating delivery

This delivery contains the original paid application result, the complete encrypted application backup and its restoration metadata, complete usage and execution exports, and the agent client's retained download manifests and checkpoints. The merchant browser and native service completed ten stages. Its registered agent provider and typed client then completed eight further stages using the same merchant workspace, payment, order, API request, and native execution.

Open `START_HERE.html` for the local entry page. Open `analysis-result.json` for the exact result. The files under `downloads/` are complete native exports and can be received or reopened independently of the running console.

## The completed application

The original numeric-series input was `{"values":[2,4,6,8],"window":2}`. The application returned four rows, a sum of 20, a mean and median of 5, and rolling means of 2, 3, 5, and 7. The output is the same 279-byte result throughout purchase, replay, application relocation, merchant adoption, and agent receiving.

| Original identity | Retained value |
| --- | --- |
| Merchant workspace | `@WORKSPACE@` |
| Paid order | `@ORDER@` |
| API request | `@REQUEST@` |
| Original native execution | `@EXECUTION@` |
| Application execution attempts | 1 |
| Purchased / consumed / reserved / available units | 8 / 2 / 0 / 6 |
| Exact response SHA-256 | `@RESPONSE_SHA@` |
| Source commit | `@COMMIT@` |

The original payment is a Stellar TESTNET payment. The native order and its finalized event retain the original payment identity. Reopening the saved request retrieves its retained result.

The merchant restored the original application and its original SF98 outbox, including the retained event and delivery files. It reassigned the paid order only after matching the captured native state. A later pending order, `api-merchant-post-capture-921ba0-20261012`, remained attached to its existing offer because it was created after the backup cutoff.

## Delivery contents

| Path | Use |
| --- | --- |
| `analysis-input.json` / `analysis-result.json` | Exact original application input and 279-byte output. |
| `downloads/backup/application-backup.zip` | Complete encrypted application backup, original source/data closure, merchant state, and SF98 outbox. |
| `downloads/backup/backup.json` | Exact metadata required by the installed full restoration command. Keep it with the ZIP. |
| `downloads/usage/` | Complete native allowance and call-accounting export. |
| `downloads/execution/` | Complete original execution and immutable result export. |
| `exports.json` | The actual export IDs, endpoint, manifest hashes, and member names. |
| `native-operation/merchant.json` / `agent.json` | Full actual ten-stage and eight-stage operation results. |
| `source/selected-source.json` | All 674 selected source leaves and their original Git identities. |
| `source/links.json` | Pinned source, installed entry, operator guide, and typed agent client. |
| `package.manifest.json` / `SHA256SUMS` | Byte lengths and SHA-256 digests for the complete delivery. |

Every received export includes its original `manifest.json`, `download-state/manifest.json`, and completed `download-state/checkpoint.json`. Keep each directory intact when using the installed client's offline reopen operation. File permissions in the archive retain private directories and files.

## Open the existing merchant workspace

Use the maintained `starforge` installation described in the [pinned installation guide](@INSTALL_URL@). The exact merchant and agent source used for this delivery is commit `@COMMIT@`; the [operator guide](@OPERATOR_URL@) and [agent guide](@AGENT_URL@) describe its complete commands and application integration.

On the original machine, the workspace configuration remains:

```text
/dev/shm/921ba0-api-merchant-native/configuration.json
```

Inspect the selected original source and workspace, then start its one persistent console:

```sh
starforge api-merchant-workspace inspect-launch \
  --config /dev/shm/921ba0-api-merchant-native/configuration.json

starforge api-merchant-workspace serve \
  --config /dev/shm/921ba0-api-merchant-native/configuration.json \
  --port 0
```

Open the private browser URL printed by that original process. The operator screen includes offers, orders, API allowance and calls, application executions, saved operations, native service start/drain, exports, encrypted capture, and restoration. All views and commands use that same workspace owner.

Its private launch record is:

```text
/dev/shm/921ba0-api-merchant-native/workspace/api-merchant-launch.json
```

Use the existing launch for native command-line views:

```sh
merchant_launch=/dev/shm/921ba0-api-merchant-native/workspace/api-merchant-launch.json

starforge api-merchant-workspace view --launch "$merchant_launch"

starforge api-merchant-workspace order \
  --launch "$merchant_launch" \
  --reference @ORDER@ --limit 50

starforge api-merchant-workspace operation \
  --launch "$merchant_launch" \
  --id 6d02d7fe-6016-4e8e-a2e3-b9c0bdb7c24c
```

For a new operator action, retain its full request, operation UUID, and expected workspace revision before sending it. If a response is lost, inspect that same operation UUID. An original operation in `ATTENTION` can continue with its saved request hash through `resume`; the original saved body and identity remain its authority. The installed CLI waits for that same operation by default. The screen's saved actions retain the corresponding request and its result.

The private workspace owns its access capability, original customer claim, backup passphrase, and agent token. They remain in the original private runtime and are loaded there when an operation needs them.

## Use the registered agent provider

The original source-owned provider is `api-merchant-workspaces`. Its 33 tools use the prefix `merchant_api_console_` and control the same running merchant console. The installed typed client covers the full inventory, offer/order lifecycle, native service management, access and call recovery, complete exports, and restoration.

The completed native receiving used alias `original-paid-api` and workspace `@WORKSPACE@`. Its declared original source/receiving selections and registration remain:

```text
/dev/shm/921ba0-api-merchant-agent-native/connection.json
/dev/shm/921ba0-api-merchant-agent-native/setup.json
```

Inspect or reopen that exact registration through the maintained provider interface:

```sh
starforge merchant-providers inspect api-merchant-workspaces

starforge merchant-providers init api-merchant-workspaces \
  --options /dev/shm/921ba0-api-merchant-agent-native/setup.json
```

Use the configuration returned by the initializer with the original merchant MCP command and token environment. The [complete agent guide](@AGENT_URL@) includes the host launch, declaration schema, typed methods, and all native operation forms. This delivery's agent endpoint is recorded in `exports.json`; use that identity for the completed download directories.

The continuation enumerated the actual registered tools, read all six inventories, reopened the original paid-adoption operation, started and drained the original native application, and retrieved the same saved API result. It retained the export requests, replayed a saved export action, stopped the client after a durable 4,096-byte backup prefix, and resumed that same download after host and console shutdown. It then reopened all complete export directories offline.

## Reopen the received files offline

The public typed client is exported from the installed package:

```js
import { reopenApiMerchantExportDownload }
  from '@tokenjunkielabs/starforge-merchant/merchant/api-merchant-workspace/client';
```

For the backup, select the unpacked delivery directory and use the original endpoint and manifest identity in `exports.json`:

```js
const result = await reopenApiMerchantExportDownload({
  directory: '/ABSOLUTE/DELIVERY/downloads/backup',
  workspace: 'original-paid-api',
  workspaceId: '@WORKSPACE@',
  endpoint: '@ENDPOINT@',
  expectedManifestSha256: '@BACKUP_MANIFEST@'
});
console.log(result.state, result.files, result.bytes);
```

Use the equivalent `downloads/usage` or `downloads/execution` directory and its own manifest hash from `exports.json` to reopen those exports. Offline reopening verifies the original endpoint, workspace, export identity, completed checkpoint, and every received member. This works after the console and MCP host have closed.

The original client also supports interrupted downloads through `downloadExport`. Reuse the same directory, export ID, endpoint, and expected manifest hash so the saved prefix and checkpoint continue together.

## Restore the complete application backup

The original encrypted backup is 144,771 bytes and has SHA-256:

```text
@BACKUP_SHA@
```

Its companion `backup.json` has SHA-256:

```text
@METADATA_SHA@
```

Place the ZIP and metadata in a private directory. Extract the ZIP to a private destination and locate the resulting `bundle/` directory. Supply the original backup passphrase through the selected environment variable in the original operator session. On the original machine its retained value belongs to `backupPassphrase` in `/dev/shm/921ba0-api-merchant-native/private.json`.

Run the installed full receiving command:

```sh
starforge api-merchant-workspace restore-bundle \
  --bundle /ABSOLUTE/EXTRACTED/bundle \
  --metadata /ABSOLUTE/DELIVERY/downloads/backup/backup.json \
  --out /ABSOLUTE/NEW_PRIVATE_RUNTIME \
  --pass-env SCF_MERCHANT_BACKUP_921BA0 \
  --expected-metadata-sha256 @METADATA_SHA@
```

Keep `backup.json` with this operation: the command uses it to receive the full merchant sidecar and bind the restored original SF98 outbox and checkout. It verifies the selected metadata and encrypted bundle, restores the original application through its native recovery engine, and returns the relocated application profile, original identity hashes, and checkout path. Repeating it against the same already complete destination reopens that exact restoration.

The complete original receiving was already performed at:

```text
/dev/shm/921ba0-api-merchant-native/downloaded-runtime
```

Its captured profile SHA-256 remains:

```text
2b5802530285885b7870792157247f5c1732c48811765219f55d04e72d3e22e9
```

Use the returned application profile path for the original application commands:

```sh
starforge api-application inspect \
  --config /ABSOLUTE/RETURNED/application.json \
  --order @ORDER@ \
  --request-id @REQUEST@ \
  --offline

starforge api-application serve \
  --config /ABSOLUTE/RETURNED/application.json
```

The native recovery engine preserves the original application/source/payment/request identities while relocating physical source, state, and data paths. The backup receives the application and merchant data; the original browser's separate operation journal remains in its existing workspace. To adopt a restored application into another merchant console, follow the maintained operator guide using the returned exact profile and checkout paths.

## Source and completed operation

The maintained complete product is [PR24](@PR_URL@), source `@COMMIT@`. The browser/native merchant operation completed at `@MERCHANT_COMPLETED@`; the agent continuation completed at `@AGENT_COMPLETED@`. Their full original result objects are included under `native-operation/`.

The original browser/native result file has SHA-256 `@MERCHANT_SHA@`. The agent continuation preserves that file exactly. `source/selected-source.json` names every selected source leaf used by the receiving process. The full maintained source is available through the pinned Git links, with the installed product's complete operator and agent guides.
'''
replacements={'WORKSPACE':WORKSPACE,'ORDER':ORDER,'REQUEST':REQUEST,'EXECUTION':agent['originalExecution']['id'],
 'RESPONSE_SHA':RESPONSE_SHA,'COMMIT':COMMIT,'INSTALL_URL':links['installedSource'],
 'OPERATOR_URL':links['operatorGuide'],'AGENT_URL':links['agentGuide'],'ENDPOINT':journal['endpoint'],
 'BACKUP_MANIFEST':agent['exports']['backup']['manifestSha256'],'BACKUP_SHA':BACKUP_SHA,'METADATA_SHA':METADATA_SHA,
 'PR_URL':links['mergedProduct'],'MERCHANT_COMPLETED':merchant['completedAt'],'AGENT_COMPLETED':agent['completedAt'],
 'MERCHANT_SHA':MERCHANT_SHA}
for key,value in replacements.items(): guide=guide.replace('@'+key+'@',str(value))
need(not re.search(r'@[A-Z_]+@',guide),'DELIVERY_GUIDE_VALUE_MISSING')
add('OPERATING_GUIDE.md',guide)
e=html.escape
rows=''.join('<tr><th>'+e(k)+'</th><td>'+e(str(v))+'</td></tr>' for k,v in [
 ('Workspace',WORKSPACE),('Paid order',ORDER),('API request',REQUEST),('Original execution attempts',1),
 ('Purchased / consumed / reserved / available','8 / 2 / 0 / 6'),('Source',COMMIT)])
export_rows=''.join('<tr><th>'+e(x['label'].title())+'</th><td><a href="'+e(x['directory'])+'/manifest.json">Native manifest</a></td><td>'+
                   ''.join('<a href="'+e(x['directory']+'/'+f['name'])+'">'+e(f['name'])+'</a><br>' for f in x['files'])+
                   '</td></tr>' for x in descriptions)
landing='''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Paid API merchant — operating delivery</title>
<style>html{color-scheme:light}body{margin:0;background:#f4f4f4;color:#1d1d1d;font:16px/1.55 system-ui,sans-serif}main{max-width:1040px;margin:0 auto;padding:42px 26px 70px}h1{font-size:34px;line-height:1.2;margin:8px 0 20px}h2{font-size:23px;margin:34px 0 14px}p{max-width:86ch}a{color:#181818;text-underline-offset:3px}header{border-bottom:2px solid #222;padding-bottom:22px}.kicker{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#555}.lead{font-size:19px}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0}.actions a{border:1px solid #444;padding:10px 15px;background:#fff;text-decoration:none;font-weight:600}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:24px 0}.metric{border:1px solid #b8b8b8;background:#fff;padding:16px}.metric strong{display:block;font-size:28px}.metric span{font-size:14px;color:#444}table{border-collapse:collapse;width:100%;background:#fff;margin:15px 0}th,td{border:1px solid #bbb;text-align:left;padding:10px 12px;vertical-align:top;overflow-wrap:anywhere}th{font-weight:600}code{font:13px ui-monospace,monospace;overflow-wrap:anywhere}.note{border-left:3px solid #555;background:#ececec;padding:14px 18px}li{margin:8px 0}footer{border-top:1px solid #aaa;padding-top:18px;margin-top:38px;font-size:14px;color:#444}@media(max-width:600px){main{padding:25px 16px}h1{font-size:29px}table{font-size:14px}}</style></head><body><main>
<header><div class="kicker">Stellar merchant workspace · complete operating delivery</div>
<h1>Paid application, retained results, complete recovery</h1>
<p class="lead">The original paid API application is available through the merchant console and its registered agent client. This delivery includes its complete received backups and exports, plus the commands to reopen the workspace and restore the application.</p>
<div class="actions"><a href="OPERATING_GUIDE.md">Open operating guide</a><a href="analysis-result.json">Open exact application result</a><a href="downloads/backup/application-backup.zip">Encrypted application backup</a><a href="downloads/backup/backup.json">Required backup metadata</a></div></header>
<div class="metrics"><div class="metric"><strong>1</strong><span>Original execution attempt</span></div><div class="metric"><strong>279 bytes</strong><span>Same retained application result</span></div><div class="metric"><strong>6 of 8</strong><span>Purchased units still available</span></div><div class="metric"><strong>33</strong><span>Registered agent tools</span></div></div>
<h2>What the application returned</h2><p>The original input contains the values 2, 4, 6, and 8 with a rolling window of two. The result has sum 20, mean and median 5, and rolling means 2, 3, 5, and 7.</p>
<table><thead><tr><th>Index</th><th>Value</th><th>Window mean</th></tr></thead><tbody><tr><td>0</td><td>2</td><td>2</td></tr><tr><td>1</td><td>4</td><td>3</td></tr><tr><td>2</td><td>6</td><td>5</td></tr><tr><td>3</td><td>8</td><td>7</td></tr></tbody></table>
<h2>Original operating identity</h2><table><tbody>'''+rows+'''</tbody></table>
<h2>Complete received files</h2><table><thead><tr><th>Export</th><th>Identity</th><th>Files</th></tr></thead><tbody>'''+export_rows+'''</tbody></table>
<p>Each export directory includes the original native manifest and completed download checkpoint. The client verified every file after console shutdown and reopened the complete directories offline.</p>
<h2>Operate and recover</h2><ol><li>Use the operating guide to inspect and start the existing merchant workspace from its original private configuration.</li><li>Use the original order and request identity to inspect or reopen the retained application result.</li><li>Keep <code>application-backup.zip</code> with <code>backup.json</code>. The installed <code>restore-bundle</code> command receives the encrypted application, merchant state, original source/data closure, and SF98 outbox.</li><li>Use <code>exports.json</code> and the completed client checkpoints to reopen the same backup, usage, and execution files offline.</li></ol>
<div class="note">The original payment is on Stellar TESTNET. Its paid order retains eight purchased units, two consumed units, zero reserved units, and six available units. Original private credentials and the backup passphrase stay in their original runtime.</div>
<h2>Source and operating records</h2><p><a href="source/links.json">Pinned source links</a> · <a href="source/selected-source.json">Complete selected source list</a> · <a href="exports.json">Export identities</a> · <a href="package.manifest.json">Delivery file manifest</a> · <a href="SHA256SUMS">SHA-256 file list</a></p>
<p><a href="native-operation/merchant.json">Original ten-stage merchant result</a> · <a href="native-operation/agent.json">Original eight-stage agent result</a></p>
<footer>Merchant completion: '''+e(merchant['completedAt'])+'''<br>Agent continuation: '''+e(agent['completedAt'])+'''<br>Maintained source: <a href="'''+e(links['mergedProduct'])+'''">PR24</a></footer>
</main></body></html>
'''
add('START_HERE.html',landing)

secrets=[]
for path,names in [(CASE/'private.json',('backupPassphrase',)),
                   (ORIGINAL/'merchant.private.json',('claim','webhook')),
                   (AGENT/'private.json',('token',))]:
    retained=parse(read(path,1024*1024))
    for name in names:
        value=retained.get(name)
        if isinstance(value,str) and len(value)>=8: secrets.append(value.encode('utf-8'))
for body in entries.values():
    need(not any(secret in body for secret in secrets),'DELIVERY_PRIVATE_VALUE_DETECTED')

manifest={'schema':'stellar-forge.sf101.api-merchant-complete-delivery.v1','createdAt':agent['completedAt'],
 'workspaceId':WORKSPACE,'sourceCommit':COMMIT,'merchantStages':10,'agentStages':8,'agentTools':33,
 'originalOrderReference':ORDER,'originalRequestId':REQUEST,'originalMerchantResultSha256':MERCHANT_SHA,
 'agentResultSha256':sha(agent_bytes),'usage':agent['usage'],'originalExecution':agent['originalExecution'],
 'files':[{'path':name,'bytes':len(body),'sha256':sha(body)} for name,body in sorted(entries.items())]}
add('package.manifest.json',pretty(manifest))
add('SHA256SUMS',''.join(sha(body)+'  '+name+'\n' for name,body in sorted(entries.items())))
stamp=datetime.datetime.fromisoformat(agent['completedAt'].replace('Z','+00:00'))
date=(stamp.year,stamp.month,stamp.day,stamp.hour,stamp.minute,stamp.second//2*2)
scratch=Path('/workspace/scratch/921ba0f574ac')
need(scratch.is_dir(),'DELIVERY_WORKSPACE_MISSING')
total=sum(len(body) for body in entries.values())
destinations=[scratch/'stellar-api-merchant-complete.zip',
              Path('/dev/shm/921ba0-api-merchant-complete-delivery.zip')]
destination=next((p for p in destinations if p.exists()),None)
if destination is None:
    for p in destinations:
        fs=os.statvfs(p.parent)
        if fs.f_bavail*fs.f_frsize>=total+262144: destination=p;break
need(destination is not None,'DELIVERY_STORAGE_REQUIRED')
fd,tempname=tempfile.mkstemp(prefix='.921ba0-api-merchant-delivery-',suffix='.zip',dir=destination.parent)
os.close(fd)
try:
    with zipfile.ZipFile(tempname,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,strict_timestamps=True) as archive:
        directories=set()
        for name in entries:
            parent=Path(name).parent
            while str(parent)!='.':
                directories.add(parent.as_posix()+'/');parent=parent.parent
        for name in sorted(directories):
            info=zipfile.ZipInfo(name,date);info.create_system=3
            info.external_attr=(stat.S_IFDIR|0o700)<<16|0x10
            archive.writestr(info,b'')
        for name,body in sorted(entries.items()):
            info=zipfile.ZipInfo(name,date);info.create_system=3
            info.external_attr=(stat.S_IFREG|0o600)<<16;info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,body,compress_type=zipfile.ZIP_DEFLATED,compresslevel=6)
    with open(tempname,'rb') as stream: os.fsync(stream.fileno())
    os.chmod(tempname,0o600)
    built=read(tempname)
    if destination.exists():
        need(read(destination)==built,'DELIVERY_DESTINATION_CHANGED')
    else: os.link(tempname,destination)
    directory_fd=os.open(destination.parent,os.O_RDONLY|os.O_DIRECTORY)
    try: os.fsync(directory_fd)
    finally: os.close(directory_fd)
    need(read(destination)==built,'DELIVERY_PUBLISH_CHANGED')
    print(json.dumps({'schema':manifest['schema'],'state':'COMPLETE','path':str(destination),
       'bytes':len(built),'sha256':sha(built),'files':len(entries),'workspaceId':WORKSPACE,
       'merchantStages':10,'agentStages':8,'agentTools':33}),flush=True)
finally:
    os.unlink(tempname)
