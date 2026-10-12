#!/usr/bin/env python3
# MIT. Receive the complete original merchant agent source and continue its saved operation.
import argparse,hashlib,json,os,signal,stat,subprocess,sys,tempfile
from pathlib import Path

COMMIT='68faef31c6b0bd94ac99715f53144aa5512c0672'
INPUTS='0c1df5bf8c20b8b534060d67399d9b0a9b751bc7'
DRIVER='d541bb3490172b5654c6a20d7c9d631e123cd179'
PACKAGE='02ebbcc02d348837c7449cbb0c29dbc2a16f2d71'
WORKSPACE='17284006-d724-4d0b-be69-d6fe586a8e8a'

def need(value,code):
    if not value: raise RuntimeError(code)

def blob(body):
    return hashlib.sha1(b'blob '+str(len(body)).encode()+b'\0'+body).hexdigest()

def read_exact(path,expected,maximum):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as stream:
        before=os.fstat(stream.fileno())
        need(stat.S_ISREG(before.st_mode) and before.st_size<=maximum,'RECEIVING_SOURCE_FILE_INVALID')
        body=stream.read(maximum+1)
        after=os.fstat(stream.fileno())
        need(len(body)==before.st_size and len(body)<=maximum and
             (before.st_size,before.st_mtime_ns)==(after.st_size,after.st_mtime_ns) and
             blob(body)==expected,'RECEIVING_SOURCE_FILE_CHANGED')
        return body

def report(value):
    print(json.dumps(value),flush=True)

def main():
    parser=argparse.ArgumentParser(description='Continue the original paid merchant through its complete agent client and delivery.')
    parser.add_argument('--inputs',required=True,type=Path)
    parser.add_argument('--driver',required=True,type=Path)
    parser.add_argument('--package-builder',required=True,type=Path)
    args=parser.parse_args()
    inputs=read_exact(args.inputs,INPUTS,8*1024*1024)
    driver=read_exact(args.driver,DRIVER,128*1024)
    package=read_exact(args.package_builder,PACKAGE,128*1024)
    compile(package.decode('utf-8'),'<original-merchant-delivery>','exec')
    packet=json.loads(inputs)
    need(packet.get('schema')=='stellar-forge.sf101.api-merchant-agent-receiving-inputs.v1' and
         packet.get('sourceCommit')==COMMIT,'RECEIVING_SOURCE_SELECTION_CHANGED')
    selection=packet['selection']
    need(selection['sourceCommit']==COMMIT and len(selection['files'])==len(packet['files'])==671,
         'RECEIVING_SOURCE_INVENTORY_CHANGED')
    files={item['path']:item for item in packet['files']}
    selected={item['path']:item for item in selection['files']}
    need(len(files)==len(selected)==671 and set(files)==set(selected),'RECEIVING_SOURCE_INVENTORY_CHANGED')
    for name,item in files.items():
        need(isinstance(name,str) and not name.startswith('/') and '\\' not in name and
             all(part not in ('','.','..') for part in name.split('/')),'RECEIVING_SOURCE_PATH_INVALID')
        expected=selected[name]
        need(item['gitBlob']==expected['gitBlob'] and item['mode']==expected['mode'] and
             item['mode'] in ('100644','100755') and blob(item['content'].encode('utf-8'))==expected['gitBlob'],
             'RECEIVING_SOURCE_BLOB_CHANGED')
    for path in ('/dev/shm/921ba0-api-native-20261011',
                 '/dev/shm/921ba0-api-merchant-source',
                 '/dev/shm/921ba0-api-merchant-native'):
        need(Path(path).is_dir(),'ORIGINAL_MERCHANT_RUNTIME_REQUIRED')

    previous_umask=os.umask(0o077)
    source=Path(tempfile.mkdtemp(prefix='921ba0-api-merchant-agent-',dir='/dev'))
    active=None
    requested_signal=None
    original_handlers={}
    def relay(signum,frame):
        nonlocal requested_signal
        requested_signal=signum
        if active is not None and active.poll() is None:
            try: active.send_signal(signum)
            except ProcessLookupError: pass
    for sig in (signal.SIGINT,signal.SIGTERM):
        original_handlers[sig]=signal.signal(sig,relay)
    def run(command,env):
        nonlocal active
        need(requested_signal is None,'ORIGINAL_RECEIVING_STOP_REQUESTED')
        active=subprocess.Popen(command,env=env,stdin=subprocess.DEVNULL)
        if requested_signal is not None and active.poll() is None:
            try: active.send_signal(requested_signal)
            except ProcessLookupError: pass
        try: return active.wait()
        finally:
            if active.poll() is None: active.wait()
            active=None
    try:
        for name,item in files.items():
            need(requested_signal is None,'ORIGINAL_RECEIVING_STOP_REQUESTED')
            target=source/name;target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
            fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,
                       0o700 if item['mode']=='100755' else 0o600)
            with os.fdopen(fd,'wb') as stream:
                stream.write(item['content'].encode('utf-8'));stream.flush();os.fsync(stream.fileno())
        selection_path=source/'SOURCE-SELECTION.json'
        selection_path.write_text(json.dumps(selection,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        modules=Path('/workspace/scratch/9345d3fc660b/native-runtime/node_modules')
        if modules.is_dir(): (source/'node_modules').symlink_to(modules,target_is_directory=True)
        driver_path=source/'merchant-agent-native-journey.mjs'
        driver_path.write_bytes(driver)
        env=dict(os.environ)
        env.update({'SCF_MERCHANT_AGENT_SOURCE':str(source),
                    'NODE_OPTIONS':'--preserve-symlinks --preserve-symlinks-main',
                    'NODE_PATH':'/workspace/scratch/2d589b11f06d/scf-oauth-deps/node_modules',
                    'PYTHONDONTWRITEBYTECODE':'1'})
        report({'state':'ORIGINAL_SOURCE_READY','sourceCommit':COMMIT,'files':671,
                'workspaceId':WORKSPACE,'source':str(source)})
        exitcode=run(['node',str(driver_path),'--resume'],env)
        report({'state':'ORIGINAL_AGENT_PROCESS_EXITED','exitCode':exitcode})
        if exitcode: return exitcode

        retired=0
        for name in files:
            target=source/name;retired+=target.stat().st_size;target.unlink()
        driver_path.unlink()
        report({'state':'ORIGINAL_DELIVERY_BUILDING','retiredSourceBytes':retired})
        exitcode=run(['python3','-c',package.decode('utf-8')],env)
        report({'state':'ORIGINAL_DELIVERY_PROCESS_EXITED','exitCode':exitcode})
        return exitcode
    finally:
        if active is not None and active.poll() is None: active.wait()
        for sig,handler in original_handlers.items(): signal.signal(sig,handler)
        os.umask(previous_umask)

if __name__=='__main__':
    try: sys.exit(main())
    except Exception as error:
        code=str(error)
        if not code or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_' for c in code):
            code='ORIGINAL_MERCHANT_RECEIVING_FAILED'
        print(json.dumps({'status':'ATTENTION','code':code}),file=sys.stderr,flush=True)
        sys.exit(1)
