#!/usr/bin/env python3
"""Reproduce the completed C12 renewal-to-financial workflow from its immutable source capsule.

Python 3.11+, Node 22+ and tar are required. No package installation or GitHub Actions.
The original CaseStore, financial workspace and logs are kept in one private /dev directory.
--receiver-json accepts only a caller-created, authorized Slack upload target; its URL is
excluded from captured artifacts. Finalize that Slack file through the ordinary connector.
A confirmed upload produces compact stdout; all original artifact bytes remain in the packet.
"""
import argparse,base64,concurrent.futures,gzip,hashlib,io,json,os,pathlib,shutil,subprocess,tarfile,tempfile,time,traceback,urllib.request
config=json.loads(r'''{"capsule":{"gitBlob":"035b85723d5f960eed288552c89985d0cffcbdf7","bytes":3058962,"sha256":"5d114d21e78f56980ba5c70005aa56b9ccb5b2dfe5eeef26315b6592d6696838","files":187,"sourceBytes":2966743,"url":"https://raw.githubusercontent.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/613febd13bc3de1815efc5f5b25245b7123f1936/stellar/scf-starforge-20261009/native-transfer/service-renewals-financial-c12.json","commit":"613febd13bc3de1815efc5f5b25245b7123f1936"},"financialSourceCommit":"6399b750a5b9e1c8a32e9678f2dcbe8714bc6a4f","sourceProvenance":{"producerCommit":"b20421214cd04671705a02e1a66db7b6b09e4c35","mergedProductCommit":"ce86b54a7b9d9baeb80e66ef169ad7d8460f89b9","currentDependencyCommit":"ce86b54a7b9d9baeb80e66ef169ad7d8460f89b9","financialCommit":"6399b750a5b9e1c8a32e9678f2dcbe8714bc6a4f","capsuleCommit":"613febd13bc3de1815efc5f5b25245b7123f1936","capsuleGitBlob":"035b85723d5f960eed288552c89985d0cffcbdf7","perFileManifest":"artifacts/source-receipt.json"},"slackReceiver":null}''')
parser=argparse.ArgumentParser(description='Run the pinned original renewal and financial workflow in one private process.')
parser.add_argument('--receiver-json',type=pathlib.Path,help='JSON with the authorized Slack upload fileId, url and exact bytes.')
parser.add_argument('--packet-file',type=pathlib.Path,help='Optional new file for the complete result packet.')
parser.add_argument('--full-stdout',action='store_true',help='Emit the full packet even after a successful Slack upload.')
args=parser.parse_args()
if args.receiver_json:
    receiver=json.loads(args.receiver_json.read_text(encoding='utf-8'))
    if not isinstance(receiver.get('fileId'),str) or not receiver['fileId']:
        parser.error('receiver-json needs the original Slack fileId')
    if not isinstance(receiver.get('url'),str) or not receiver['url'].startswith('https://'):
        parser.error('receiver-json needs the exact HTTPS upload URL')
    if not isinstance(receiver.get('bytes'),int) or isinstance(receiver['bytes'],bool) or receiver['bytes']<1:
        parser.error('receiver-json needs the exact reserved file byte count')
    config['slackReceiver']=receiver
capsule_url=config['capsule']['url']
expected_capsule_sha=config['capsule']['sha256']
expected_capsule_bytes=config['capsule']['bytes']
manifest={'operation':'C12-8E54-SERVICE-RENEWAL-NATIVE-01','refs':['109e960a357a1680dd9d857bd96f5e238febdc97','b20421214cd04671705a02e1a66db7b6b09e4c35']}
os.umask(0o077)
started=time.time()
root=pathlib.Path(tempfile.mkdtemp(prefix='c12-renewals-native-',dir='/dev'))
source=root/'source'
cases=root/'cases'
artifacts=root/'artifacts'
for directory in (source,cases,artifacts):
    directory.mkdir(mode=0o700)
capsule_raw=b''
native_runtime=None
def progress(event,**fields):
    print('C12_NATIVE_PROGRESS '+json.dumps({'event':event,**fields},separators=(',',':')),flush=True)
def stage_original(item):
    relative=pathlib.PurePosixPath(item['path'])
    if relative.is_absolute() or '..' in relative.parts:
        raise RuntimeError('Source path must stay inside the private operation')
    data=item['content'].encode('utf-8')
    if len(data)!=item['bytes']:
        raise RuntimeError('Original source length differs: '+str(relative))
    actual=hashlib.sha1(('blob '+str(len(data))+'\0').encode('ascii')+data).hexdigest()
    if actual!=item['gitBlob']:
        raise RuntimeError('Original Git blob differs: '+str(relative)+' received '+actual)
    target=source/str(relative)
    target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    with target.open('xb') as handle:
        handle.write(data)
    return {'path':str(relative),'gitBlob':actual,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'sourceRef':item.get('sourceRef')}
def packed(name,data,media_type):
    compressed=gzip.compress(data,compresslevel=9,mtime=0)
    return {'name':name,'mediaType':media_type,'encoding':'gzip+base64',
        'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
        'gzipBytes':len(compressed),'gzipSha256':hashlib.sha256(compressed).hexdigest(),
        'data':base64.b64encode(compressed).decode('ascii')}
def tar_bytes(directory,archive_name):
    memory=io.BytesIO()
    with tarfile.open(fileobj=memory,mode='w',format=tarfile.PAX_FORMAT) as archive:
        archive.add(directory,arcname=archive_name,recursive=True)
    return memory.getvalue()
verified=[]
failure=None
node_started=False
node_code=None
node_stdout=b''
node_stderr=b''
node_result=None
sample=artifacts/'accepted-service-renewal-handover.json'
result_file=artifacts/'native-result.json'
caller=artifacts/'run-original-renewal.mjs'
financial_root=root/'financial-continuation'
financial_result_file=artifacts/'financial-continuation-result.json'
financial_result=None
node_source=r"""import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [sf74Directory,casesDirectory,sampleFile,resultFile,sourceRoot,operationDirectory,financialResultFile,financialSourceCommit]=process.argv.slice(2);
console.log('C12_NODE_RUNTIME '+JSON.stringify({node:process.version,pid:process.pid,casesDirectory}));
try {
  const sf74Url=pathToFileURL(sf74Directory+'/');
  const {openCaseStore}=await import(new URL('case-store.mjs',sf74Url));
  const {serializeWorkspace}=await import(new URL('workspace-file.mjs',sf74Url));
  const {commercialWorkspaceId}=await import(new URL('case-commercial.mjs',sf74Url));
  const {runServiceRenewalsExercise}=await import(new URL('service-renewals-journey.mjs',sf74Url));
  const caseStore=await openCaseStore(casesDirectory),caseId=randomUUID();
  const workspaceId=commercialWorkspaceId(casesDirectory);
  await caseStore.save({id:caseId,expectedRevision:null,metadata:{},
    workspaceText:await serializeWorkspace({name:'Isolated renewal native journey'})});
  const result=await runServiceRenewalsExercise({caseStore,caseId,casesDirectory,workspaceId});
  await writeFile(sampleFile,JSON.stringify(result.acceptedHandover,null,2)+'\n',{flag:'wx',mode:0o600});
  const full={operation:'C12-8E54-SERVICE-RENEWAL-NATIVE-01',
    sourceCommit:'b20421214cd04671705a02e1a66db7b6b09e4c35',
    node:process.version,pid:process.pid,casesDirectory,workspaceId,...result};
  await writeFile(resultFile,JSON.stringify(full,null,2)+'\n',{flag:'wx',mode:0o600});
  const {acceptedHandover,...summary}=full;
  console.log('C12_PRODUCER_RESULT '+JSON.stringify(summary));
  const {runAcceptedRenewalFinancial}=await import(pathToFileURL(join(sourceRoot,'experiments/accepted-renewal-financial-84df-20261012/accepted-renewal-financial.mjs')));
  const financial=await runAcceptedRenewalFinancial({
    sourceRoot,operationRoot:join(operationDirectory,'financial-continuation'),
    handoverPath:sampleFile,caseDirectory:casesDirectory,producerResultPath:resultFile,
    sourceCommit:financialSourceCommit
  });
  if(financial?.result!=='complete')throw new Error('Financial continuation did not return a complete result');
  await writeFile(financialResultFile,JSON.stringify(financial,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('C12_FINANCIAL_RESULT '+JSON.stringify(financial));
} catch(error) {
  console.error(error?.stack??String(error));
  console.error(JSON.stringify({code:error?.code??null,status:error?.status??null,
    cause:error?.cause?.message??null}));
  process.exitCode=1;
}
"""
caller.write_text(node_source,encoding='utf-8')
progress('source-start',files=config['capsule']['files'],bytes=config['capsule']['sourceBytes'],directory=str(root),pythonPid=os.getpid())
try:
    with urllib.request.urlopen(capsule_url,timeout=35) as response:
        capsule_raw=response.read(expected_capsule_bytes+1)
    if len(capsule_raw)!=expected_capsule_bytes or hashlib.sha256(capsule_raw).hexdigest()!=expected_capsule_sha:
        raise RuntimeError('The immutable source capsule differs from its declared bytes or SHA256')
    capsule=json.loads(capsule_raw.decode('utf-8'))
    rows=capsule['files']
    expected_files=config['capsule']['files']
    expected_source_bytes=config['capsule']['sourceBytes']
    if len(rows)!=expected_files or len({row['path'] for row in rows})!=expected_files or sum(row['bytes'] for row in rows)!=expected_source_bytes:
        raise RuntimeError('The complete combined source capsule differs from its declared file count or bytes')
    (artifacts/'combined-source-provenance.json').write_text(json.dumps(config['sourceProvenance'],indent=2)+'\n',encoding='utf-8')
    for row in rows:
        verified.append(stage_original(row))
    verified.sort(key=lambda row:row['path'])
    (artifacts/'source-receipt.json').write_text(json.dumps(verified,indent=2)+'\n',encoding='utf-8')
    (artifacts/'source-capsule-reference.json').write_text(json.dumps({'url':capsule_url,'bytes':len(capsule_raw),'sha256':expected_capsule_sha},indent=2)+'\n',encoding='utf-8')
    progress('source-verified',files=len(verified),bytes=sum(row['bytes'] for row in verified))
    node=os.environ.get('CODEX_PRIMARY_RUNTIME_NODE') or shutil.which('node')
    if not node or not os.path.isfile(node) or not os.access(node,os.X_OK):
        raise RuntimeError('No callable Node runtime in this admitted process')
    sf74=source/'stellar/scf-starforge-20261009/sf74-merchant-support-console'
    progress('node-start',sourceFiles=len(verified),executable=node)
    node_started=True
    completed=subprocess.run([node,str(caller),str(sf74),str(cases),str(sample),str(result_file),str(source),str(root),str(financial_result_file),config['financialSourceCommit']],
        cwd=str(source),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=240,check=False)
    node_code=completed.returncode
    node_stdout=completed.stdout
    node_stderr=completed.stderr
    for line in node_stdout.decode('utf-8','replace').splitlines():
        if line.startswith('C12_NODE_RUNTIME '):
            native_runtime=json.loads(line[len('C12_NODE_RUNTIME '):])
    if result_file.exists():
        node_result=json.loads(result_file.read_text(encoding='utf-8'))
    if financial_result_file.exists():
        financial_result=json.loads(financial_result_file.read_text(encoding='utf-8'))
    progress('node-finished',exitCode=node_code,stdoutBytes=len(node_stdout),stderrBytes=len(node_stderr))
except subprocess.TimeoutExpired as error:
    node_code=124
    node_stdout=error.stdout or b''
    node_stderr=error.stderr or b''
    failure={'type':'TimeoutExpired','message':str(error)}
except Exception as error:
    failure={'type':type(error).__name__,'message':str(error),'traceback':traceback.format_exc()}
finally:
    capture_warnings=[]
    if node_result is None and result_file.exists():
        try:
            node_result=json.loads(result_file.read_text(encoding='utf-8'))
        except Exception as error:
            capture_warnings.append({'file':result_file.name,'error':str(error)})
    if financial_result is None and financial_result_file.exists():
        try:
            financial_result=json.loads(financial_result_file.read_text(encoding='utf-8'))
        except Exception as error:
            capture_warnings.append({'file':financial_result_file.name,'error':str(error)})
    (artifacts/'node.stdout').write_bytes(node_stdout)
    (artifacts/'node.stderr').write_bytes(node_stderr)
    status='COMPLETE' if node_code==0 and sample.exists() and node_result is not None and financial_result is not None and financial_result.get('result')=='complete' else 'FAILED'
    summary={key:value for key,value in (node_result or {}).items() if key!='acceptedHandover'}
    case_files=[]
    for path in sorted(cases.rglob('*')):
        if path.is_file():
            data=path.read_bytes()
            case_files.append({'path':str(path.relative_to(cases)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    packet={'schema':'c12-service-renewal-native-result.v1','operation':manifest['operation'],
        'sourceCommit':manifest['refs'][1],'sourceCapsuleSha256':expected_capsule_sha,
        'sourceCapsuleBytes':len(capsule_raw),'sourceCapsuleUrl':capsule_url,'sourceProvenance':config['sourceProvenance'],
        'status':status,'sourceFilesVerified':len(verified),'sourceBytesVerified':sum(row['bytes'] for row in verified),
        'nodeStarted':node_started,'nodeExitCode':node_code,'elapsedSeconds':round(time.time()-started,3),
        'pythonPid':os.getpid(),'casesDirectory':str(cases),'nodeRuntime':native_runtime,
        'stdoutText':node_stdout.decode('utf-8','replace'),'stderrText':node_stderr.decode('utf-8','replace'),
        'result':summary,'financialResult':financial_result,'failure':failure,'captureWarnings':capture_warnings,'caseFiles':case_files,
        'stdout':packed('node.stdout',node_stdout,'application/octet-stream'),
        'stderr':packed('node.stderr',node_stderr,'application/octet-stream')}
    if sample.exists():
        packet['acceptedHandover']=packed(sample.name,sample.read_bytes(),'application/json')
    (artifacts/'operation-summary.json').write_text(json.dumps({key:value for key,value in packet.items() if key not in ('stdout','stderr','acceptedHandover')},indent=2)+'\n',encoding='utf-8')
    archive_memory=io.BytesIO()
    with tarfile.open(fileobj=archive_memory,mode='w',format=tarfile.PAX_FORMAT) as archive:
        archive.add(cases,arcname='cases',recursive=True)
        archive.add(artifacts,arcname='artifacts',recursive=True)
        if financial_root.exists():
            archive.add(financial_root,arcname='financial-continuation',recursive=True)
    packet['caseStoreArchive']=packed('service-renewal-financial-native-C12-8E54.tar',archive_memory.getvalue(),'application/x-tar')
    packet['caseStoreArchive']['contains']=['cases/','artifacts/']+(['financial-continuation/'] if financial_root.exists() else [])
    receiver=config.get('slackReceiver')
    if receiver:
        try:
            packet['artifactReceiver']={'fileId':receiver['fileId'],'fileBytes':receiver['bytes'],'format':'utf8-json-with-trailing-whitespace'}
            receiver_json=json.dumps(packet,separators=(',',':')).encode('utf-8')
            if len(receiver_json)>=receiver['bytes']:
                raise RuntimeError('The complete artifact packet exceeds the reserved Slack file length')
            receiver_bytes=receiver_json+b'\n'+b' '*(receiver['bytes']-len(receiver_json)-1)
            if len(receiver_bytes)!=receiver['bytes']:
                raise RuntimeError('The reserved Slack file length does not match the actual JSON bytes')
            request=urllib.request.Request(receiver['url'],data=receiver_bytes,headers={'Content-Type':'application/json','Content-Length':str(len(receiver_bytes))},method='POST')
            with urllib.request.urlopen(request,timeout=25) as response:
                response_bytes=response.read(4096)
                response_status=response.status
            packet['slackUploadReceipt']={'fileId':receiver['fileId'],'httpStatus':response_status,'bytes':len(receiver_bytes),'sha256':hashlib.sha256(receiver_bytes).hexdigest(),'jsonBytes':len(receiver_json),'response':response_bytes.decode('utf-8','replace')}
        except Exception as error:
            packet['slackUploadFailure']={'type':type(error).__name__,'message':str(error)}
    complete_packet=json.dumps(packet,separators=(',',':'))
    packet_path=args.packet_file or (root/'native-packet.json')
    try:
        with packet_path.open('x',encoding='utf-8') as handle:
            handle.write(complete_packet+'\n')
    except Exception as error:
        packet['packetFileFailure']={'type':type(error).__name__,'message':str(error)}
    else:
        packet['packetPath']=str(packet_path)
    output=packet
    if packet.get('slackUploadReceipt',{}).get('httpStatus')==200 and not args.full_stdout:
        output={key:value for key,value in packet.items()}
        for key in ('stdout','stderr','acceptedHandover','caseStoreArchive'):
            if key in output:
                output[key]={name:value for name,value in output[key].items() if name!='data'}
        output['artifactPayloadSource']={'provider':'slack','fileId':config['slackReceiver']['fileId']}
    print('C12_NATIVE_RESULT '+json.dumps(output,separators=(',',':')),flush=True)
