#!/usr/bin/env python3
"""MIT. Verified Linux releases and stopped-service administration for the publisher.

No service is installed or started implicitly. Business data is handled by the
original workspace/export/receive implementation, under its original kernel lock.
"""
from __future__ import annotations
import argparse, base64, contextlib, ctypes, fcntl, gzip, hashlib, io, json, os
import pathlib, pwd, re, select, shutil, stat, subprocess, sys, tarfile, time, uuid
from datetime import datetime, timezone

INVENTORY='products/datagouv/application-files.json'
APP_SCHEMA='stellar-forge.datagouv-application-files.v1'
RELEASE_SCHEMA='datagouv.linux-release/v1'
STATE_SCHEMA='datagouv.linux-installation/v1'
OP_SCHEMA='datagouv.linux-administration-operation/v1'
PORTABLE_SCHEMA='stellar-forge.datagouv-portable-workspace.v1'
ENTRY='start-publisher.mjs'
SOURCE_LIMIT=256*1024*1024
FILE_LIMIT=32*1024*1024
ARCHIVE_LIMIT=768*1024*1024
HEX=re.compile(r'^[0-9a-f]{64}$')
ID=re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$')
ENV=re.compile(r'^[A-Z][A-Z0-9_]{0,95}$')
HERE=pathlib.Path(__file__).resolve().parent
ADMIN_FD=None

class AdminError(RuntimeError):
    def __init__(self,code,message):
        super().__init__(message)
        self.code=code

def require(value,message,code='ADMINISTRATION'):
    if not value:
        raise AdminError(code,message)

def now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')

def encoded(value):
    return (json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()

def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def identity(info):
    return (info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns,info.st_ctime_ns)

def absolute(value,existing=False):
    require(isinstance(value,(str,pathlib.Path)),'An absolute path is required')
    path=pathlib.Path(value)
    require(path.is_absolute() and str(path)!='/' and str(path)==os.path.normpath(str(path)),'Use a normalized absolute path')
    require(not any(ord(c)<32 for c in str(path)),'Control characters are not allowed in paths')
    require(path.resolve(strict=False)==path,'Managed paths must not contain symlinks')
    if existing:
        require(path.exists(),'The selected original path is missing: '+str(path))
    return path

def relative(value):
    require(isinstance(value,str) and value and '\\' not in value and '\0' not in value,'Invalid release path')
    path=pathlib.PurePosixPath(value)
    require(not path.is_absolute() and str(path)==value and all(x not in ('','..','.') and not x.startswith('.') for x in path.parts),'Release paths must be ordinary relative source paths')
    return path

def regular(path,maximum=FILE_LIMIT):
    path=absolute(path,True)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_size<=maximum,'Expected a bounded regular file: '+str(path))
        with os.fdopen(os.dup(fd),'rb') as stream:
            raw=stream.read(maximum+1)
        after=os.fstat(fd)
        require(identity(before)==identity(after) and len(raw)==before.st_size,'Selected original file changed during read')
        return raw
    finally:
        os.close(fd)

def file_pin(path,maximum=ARCHIVE_LIMIT):
    path=absolute(path,True)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_size<=maximum,'Expected a bounded regular file')
        h=hashlib.sha256(); length=0
        while True:
            raw=os.read(fd,1024*1024)
            if not raw:
                break
            length+=len(raw); h.update(raw)
        require(identity(before)==identity(os.fstat(fd)) and length==before.st_size,'Selected file changed during hashing')
        return {'bytes':length,'sha256':h.hexdigest()}
    finally:
        os.close(fd)

def read_json(path,maximum=4*1024*1024):
    return json.loads(regular(path,maximum))

def sync_dir(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def mkdir(path,mode=0o755,uid=None,gid=None):
    path=absolute(path)
    try:
        path.mkdir(mode=mode)
        if uid is not None:
            os.chown(path,uid,gid)
        os.chmod(path,mode); sync_dir(path.parent)
    except FileExistsError:
        info=path.lstat()
        require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode),'An existing managed directory is not ordinary')
        require(stat.S_IMODE(info.st_mode)==mode,'Existing managed directory permissions differ: '+str(path))
        if uid is not None:
            require(info.st_uid==uid and info.st_gid==gid,'Existing directory ownership differs: '+str(path))
    return path

def parents(path,root,mode=0o755):
    relative_path=path.parent.relative_to(root)
    current=root
    for part in relative_path.parts:
        current=current/part; mkdir(current,mode)
    return path

def publish(path,raw,mode=0o600):
    path=absolute(path)
    if path.exists():
        require(regular(path,max(len(raw),1))==raw,'Existing immutable output differs: '+str(path),'ORIGINAL_OUTPUT_DIFFERS')
        require(stat.S_IMODE(path.stat().st_mode)==mode,'Existing immutable output permissions differ: '+str(path))
        return
    temporary=path.parent/('.pending-'+str(uuid.uuid4()))
    fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    try:
        os.fchmod(fd,mode)
        with os.fdopen(os.dup(fd),'wb') as stream:
            stream.write(raw);stream.flush();os.fsync(stream.fileno())
    finally:
        os.close(fd)
    try:
        os.link(temporary,path,follow_symlinks=False)
    except FileExistsError:
        require(regular(path,max(len(raw),1))==raw,'Immutable output was concurrently replaced')
    temporary.unlink();sync_dir(path.parent)

def atomic(path,value,mode=0o600):
    raw=encoded(value);temporary=path.parent/('.pending-'+str(uuid.uuid4()))
    publish(temporary,raw,mode)
    if path.exists():
        info=path.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_uid==os.geteuid(),'Unexpected mutable control file')
    os.replace(temporary,path);sync_dir(path.parent)

def source_inventory(application):
    raw=regular(application/INVENTORY,1024*1024); inventory=json.loads(raw)
    require(inventory.get('schema')==APP_SCHEMA and inventory.get('entrypoint')==ENTRY,'Select the complete native application inventory')
    names=inventory.get('files')
    require(isinstance(names,list) and 1<=len(names)<=512 and len(set(names))==len(names),'Invalid or duplicate application inventory')
    require(ENTRY in names and INVENTORY in names,'The original entrypoint and complete inventory are required')
    for name in names:
        relative(name)
    return names

def source_manifest(application,source_ref):
    application=absolute(application,True)
    require(isinstance(source_ref,str) and 0<len(source_ref)<=256 and not any(ord(c)<32 for c in source_ref),'Record the selected source revision')
    names=source_inventory(application);entries=[];total=0
    for name in sorted(names):
        pin=file_pin(application.joinpath(*relative(name).parts),FILE_LIMIT)
        total+=pin['bytes'];require(total<=SOURCE_LIMIT,'Application source exceeds 256 MiB')
        entries.append({'path':name,**pin})
    body={'schema':RELEASE_SCHEMA,'source_ref':source_ref,'entrypoint':ENTRY,'files':entries}
    return {**body,'release_id':digest(canonical(body))}

def validate_manifest(value):
    require(isinstance(value,dict) and value.get('schema')==RELEASE_SCHEMA and value.get('entrypoint')==ENTRY,'Invalid release manifest')
    rid=value.get('release_id');body={k:v for k,v in value.items() if k!='release_id'}
    require(isinstance(rid,str) and HEX.fullmatch(rid) and digest(canonical(body))==rid,'Release identity differs')
    entries=value.get('files');require(isinstance(entries,list) and 1<=len(entries)<=512,'Invalid complete release selection')
    seen=set();total=0
    for entry in entries:
        require(isinstance(entry,dict) and set(entry)=={'path','bytes','sha256'},'Invalid release member declaration')
        name=str(relative(entry['path']));require(name not in seen,'Repeated release member');seen.add(name)
        require(type(entry['bytes']) is int and 0<=entry['bytes']<=FILE_LIMIT and HEX.fullmatch(entry['sha256'] or ''),'Invalid release member size/hash')
        total+=entry['bytes'];require(total<=SOURCE_LIMIT,'Complete source exceeds its limit')
    require(ENTRY in seen and INVENTORY in seen,'Incomplete release selection')
    return value

def pack(args):
    application=absolute(args.source,True);output=absolute(args.output)
    manifest=source_manifest(application,args.source_ref);raw_manifest=encoded(manifest)
    require(output.parent.is_dir(),'Create the selected output parent first')
    temp=output.parent/('.release-'+str(uuid.uuid4())+'.tar.gz')
    with open(temp,'xb') as file:
        os.chmod(temp,0o600)
        with gzip.GzipFile(filename='',fileobj=file,mode='wb',mtime=0) as compressed:
            with tarfile.open(fileobj=compressed,mode='w',format=tarfile.PAX_FORMAT) as archive:
                records=[('release.json',raw_manifest)]
                for entry in manifest['files']:
                    raw=regular(application/entry['path'])
                    require(len(raw)==entry['bytes'] and digest(raw)==entry['sha256'],'Source changed after release selection')
                    records.append(('application/'+entry['path'],raw))
                for name,raw in records:
                    info=tarfile.TarInfo(name);info.size=len(raw);info.mode=0o444;info.uid=0;info.gid=0;info.mtime=0
                    archive.addfile(info,io.BytesIO(raw))
        file.flush();os.fsync(file.fileno())
    selected=file_pin(temp)
    try:
        os.link(temp,output,follow_symlinks=False)
    except FileExistsError:
        require(file_pin(output)==selected,'A different original release already occupies the output')
    temp.unlink();sync_dir(output.parent)
    return {'schema':'datagouv.linux-release-package/v1','path':str(output),'release_id':manifest['release_id'],'source_ref':manifest['source_ref'],'files':len(manifest['files']),**selected}

class Bundle:
    def __init__(self,path,expected):
        require(HEX.fullmatch(expected or ''),'Supply the exact selected release SHA-256')
        self.path=absolute(path,True);self.fd=os.open(self.path,os.O_RDONLY|os.O_NOFOLLOW)
        self.before=os.fstat(self.fd);self.stream=None;self.archive=None;self.members={}
        try:
            require(stat.S_ISREG(self.before.st_mode) and self.before.st_size<=ARCHIVE_LIMIT,'Expected a bounded regular release archive')
            selected=hashlib.sha256()
            while True:
                block=os.read(self.fd,1024*1024)
                if not block:
                    break
                selected.update(block)
            require(identity(self.before)==identity(os.fstat(self.fd)) and selected.hexdigest()==expected,'The selected release archive changed')
            os.lseek(self.fd,0,os.SEEK_SET)
            self.stream=os.fdopen(os.dup(self.fd),'rb')
            self.archive=tarfile.open(fileobj=self.stream,mode='r:gz')
            total_size=0
            for item in self.archive:
                total_size+=item.size
                require(total_size<=SOURCE_LIMIT+4*1024*1024,'Release archive exceeds its complete source bound')
                require(len(self.members)<513 and item.isfile() and not item.issym() and not item.islnk(),'Only bounded regular source files are accepted')
                require(item.name not in self.members and item.size<=FILE_LIMIT,'Repeated or oversized release member')
                require(item.name=='release.json' or item.name.startswith('application/'),'Unexpected release root')
                relative(item.name);self.members[item.name]=item
            require('release.json' in self.members,'Release manifest is missing')
            self.manifest=validate_manifest(json.loads(self.read('release.json')))
            expected_names={'release.json'}|{'application/'+x['path'] for x in self.manifest['files']}
            require(set(self.members)==expected_names,'The release archive is incomplete or contains undeclared files')
            for entry in self.manifest['files']:
                raw=self.read('application/'+entry['path'])
                require(len(raw)==entry['bytes'] and digest(raw)==entry['sha256'],'Release member identity differs')
            inv=json.loads(self.read('application/'+INVENTORY))
            require(inv.get('schema')==APP_SCHEMA and inv.get('entrypoint')==ENTRY and len(inv.get('files',[]))==len(self.manifest['files']) and set(inv['files'])=={x['path'] for x in self.manifest['files']},'Release and native inventory disagree')
        except Exception:
            self.close(check=False);raise
    def read(self,name):
        member=self.members[name]
        with self.archive.extractfile(member) as source:
            raw=source.read(member.size+1)
        require(len(raw)==member.size,'Release member is incomplete')
        return raw
    def close(self,check=True):
        if getattr(self,'fd',None) is not None:
            changed=identity(self.before)!=identity(os.fstat(self.fd))
            try:
                if self.archive is not None:
                    self.archive.close()
                if self.stream is not None:
                    self.stream.close()
            finally:
                os.close(self.fd);self.fd=None
            if check:
                require(not changed,'Release archive changed while selected')
    def __enter__(self):
        return self
    def __exit__(self,kind,*unused):
        self.close(check=kind is None)

def release(root,release_id,manifest_sha=None):
    require(HEX.fullmatch(release_id or ''),'Select an original release ID')
    folder=root/'releases'/release_id;raw=regular(folder/'release.json',4*1024*1024)
    if manifest_sha:
        require(digest(raw)==manifest_sha,'The installed release manifest changed')
    manifest=validate_manifest(json.loads(raw))
    require(manifest['release_id']==release_id,'Release directory identity differs')
    application=folder/'application'
    for entry in manifest['files']:
        pin=file_pin(application/entry['path'],FILE_LIMIT)
        require(pin=={'bytes':entry['bytes'],'sha256':entry['sha256']},'Installed source changed: '+entry['path'])
    require(set(source_inventory(application))=={x['path'] for x in manifest['files']},'Installed inventory differs')
    return {'release':release_id,'manifest_sha256':digest(raw),'source_ref':manifest['source_ref'],'application':str(application)}

def stage(root,bundle,operation_id):
    manifest=bundle.manifest;rid=manifest['release_id'];target=root/'releases'/rid
    if target.exists():
        return release(root,rid)
    stage_path=root/'staging'/('release-'+operation_id)
    mkdir(stage_path);mkdir(stage_path/'application')
    for entry in manifest['files']:
        path=stage_path/'application'/entry['path'];parents(path,stage_path/'application')
        raw=bundle.read('application/'+entry['path']);publish(path,raw,0o444)
    publish(stage_path/'release.json',encoded(manifest),0o444)
    if target.exists():
        return release(root,rid)
    os.rename(stage_path,target);sync_dir(target.parent)
    return release(root,rid)

def user_identity(name):
    user=pwd.getpwnam(name) if name else pwd.getpwuid(os.geteuid())
    require(os.geteuid()==0 or user.pw_uid==os.geteuid(),'Only root can select another service user')
    return {'user':user.pw_name,'uid':user.pw_uid,'gid':user.pw_gid}

def child_options(runtime,provider_env=None):
    environment={'PATH':str(pathlib.Path(runtime['node']).parent)+':/usr/bin:/bin','LANG':'C.UTF-8','PYTHONDONTWRITEBYTECODE':'1'}
    if provider_env:
        require(ENV.fullmatch(provider_env or ''),'Use a credential environment variable name')
        secret=os.environ.get(provider_env)
        require(isinstance(secret,str) and secret and '\0' not in secret and '\r' not in secret and '\n' not in secret,'The selected provider environment input is unavailable')
        environment[provider_env]=secret
    options={'env':environment,'cwd':'/','umask':0o077,'pass_fds':(ADMIN_FD,) if ADMIN_FD is not None else ()}
    if os.geteuid()==0:
        options.update(user=runtime['uid'],group=runtime['gid'],extra_groups=[])
    else:
        require(os.geteuid()==runtime['uid'] and os.getegid()==runtime['gid'],'Run as the selected account or its administrator')
    return options

def runtime_probe(node,user,port):
    node=absolute(pathlib.Path(node).resolve(),True)
    require(os.access(node,os.X_OK),'The selected Node executable is unavailable')
    require(type(port) is int and 1024<=port<=65535,'Select an unprivileged fixed loopback port')
    runtime={**user,'node':str(node),'node_sha256':file_pin(node,256*1024*1024)['sha256'],'python':str(pathlib.Path(sys.executable).resolve()),'port':port}
    result=subprocess.run([str(node),'--input-type=module','-e',"import {DatabaseSync} from 'node:sqlite';if(Number(process.versions.node.split('.')[0])<24)process.exit(2);process.stdout.write(JSON.stringify({node:process.versions.node,sqlite:typeof DatabaseSync}));"],capture_output=True,text=True,timeout=30,**child_options(runtime))
    require(result.returncode==0,'Node 24+ with node:sqlite is required')
    version=json.loads(result.stdout);require(version['sqlite']=='function','Native SQLite support is missing')
    flock=shutil.which('flock',path=child_options(runtime)['env']['PATH']);require(flock,'The original util-linux flock command is required')
    runtime['node_version']=version['node'];runtime['flock']=str(pathlib.Path(flock).resolve())
    return runtime

def managed(root,create=False):
    root=absolute(root)
    if create:
        require(root.parent.is_dir(),'Create the administrator-owned parent directory first')
        mkdir(root,0o755,os.geteuid(),os.getegid());mkdir(root/'control',0o755,os.geteuid(),os.getegid())
        owner={'schema':'datagouv.linux-owner/v1','root':str(root),'administrator_uid':os.geteuid(),'administrator_gid':os.getegid()}
        publish(root/'control'/'owner.json',encoded(owner),0o644)
        publish(root/'control'/'admin.lock',b'',0o644)
        for name in ('releases','staging','instances','backups','bin'):
            mkdir(root/name,0o755,os.geteuid(),os.getegid())
        mkdir(root/'control'/'operations',0o700,os.geteuid(),os.getegid())
    owner=read_json(root/'control'/'owner.json')
    require(owner.get('schema')=='datagouv.linux-owner/v1' and owner.get('root')==str(root),'Choose the original managed installation')
    require(owner['administrator_uid']==os.geteuid(),'Run this command as the installation administrator')
    for path in (root,root/'control'):
        info=path.stat();require(info.st_uid==os.geteuid() and not info.st_mode&0o022,'Managed root/control ownership changed')
    return root

@contextlib.contextmanager
def administration(root,shared=False):
    global ADMIN_FD
    previous_fd=ADMIN_FD
    path=root/'control'/'admin.lock';fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        info=os.fstat(fd);require(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_uid==os.geteuid() and not info.st_mode&0o022,'Original administration lock changed')
        try:
            fcntl.flock(fd,(fcntl.LOCK_SH if shared else fcntl.LOCK_EX)|fcntl.LOCK_NB)
        except BlockingIOError:
            raise AdminError('SERVICE_OR_ADMIN_ACTIVE','Stop the original system service or finish its existing administration command first')
        ADMIN_FD=fd
        yield
    finally:
        ADMIN_FD=previous_fd
        os.close(fd)

def state(root,optional=False):
    path=root/'control'/'state.json'
    if optional and not path.exists():
        return None
    value=read_json(path)
    require(value.get('schema')==STATE_SCHEMA and type(value.get('revision')) is int and value['revision']>=0,'Invalid original installation state')
    return value

def install_controller(root):
    for name,source in (('launcher.py',HERE/'launcher.py'),('workspace-bridge.mjs',HERE/'workspace-bridge.mjs')):
        publish(root/'bin'/name,regular(source),0o444)
    return {'launcher_sha256':file_pin(root/'bin'/'launcher.py')['sha256'],'bridge_sha256':file_pin(root/'bin'/'workspace-bridge.mjs')['sha256']}

class Operation:
    def __init__(self,root,operation_id,kind,input_value,before):
        require(ID.fullmatch(operation_id or ''),'Use one original administration operation ID')
        self.root=root;self.id=operation_id;self.folder=root/'control'/'operations'/operation_id
        mkdir(self.folder,0o700,os.geteuid(),os.getegid());self.path=self.folder/'operation.json'
        selection={'kind':kind,'input':input_value};self.input_hash=digest(canonical(selection))
        if self.path.exists():
            self.value=read_json(self.path)
            require(self.value.get('schema')==OP_SCHEMA and self.value.get('id')==operation_id and self.value.get('input_sha256')==self.input_hash,'This operation ID belongs to different original input')
        else:
            self.value={'schema':OP_SCHEMA,'id':operation_id,'kind':kind,'input':input_value,'input_sha256':self.input_hash,'created_at':now(),'before':before,'stages':{},'history':[]}
            self.save('PREPARED')
    def save(self,event):
        self.value['history'].append({'at':now(),'event':event});atomic(self.path,self.value)
    def put(self,key,value):
        old=self.value['stages'].get(key)
        require(old is None or old==value,'A retained operation stage differs: '+key)
        if old is None:
            self.value['stages'][key]=value;self.save(key.upper())
        return value
    def complete(self,result):
        if self.value.get('result') is None:
            self.value['result']=result;self.value['completed_at']=now();self.save('COMPLETED')
        return {'operation':self.id,'reused':False,**self.value['result']}
    def replay(self):
        return {'operation':self.id,'reused':True,**self.value['result']}

class Workspace:
    """A stdin/stdout child, not a server. Its original native lock stays held."""
    def __init__(self,root,selected,runtime):
        application=selected['application'];directory=absolute(selected['workspace'],True)
        current=state(root,optional=True)
        if current:
            require(file_pin(root/'bin'/'workspace-bridge.mjs')['sha256']==current['controller']['bridge_sha256'],'Installed native administration bridge changed')
        require(file_pin(runtime['node'],256*1024*1024)['sha256']==runtime['node_sha256'],'Selected Node runtime bytes changed')
        info=directory.stat()
        require(info.st_uid==runtime['uid'] and stat.S_IMODE(info.st_mode)==0o700,'The selected workspace must be owned by its service account with mode0700')
        self.child=subprocess.Popen([runtime['node'],str(root/'bin'/'workspace-bridge.mjs'),application,str(directory)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1,**child_options(runtime))
        try:
            self.summary=self.response()['summary']
        except Exception:
            self.close();raise
    def response(self,timeout=360):
        ready,_,_=select.select([self.child.stdout],[],[],timeout)
        require(ready,'Original native workspace command is still unconfirmed; retain this operation','NATIVE_RESPONSE_UNKNOWN')
        line=self.child.stdout.readline(4*1024*1024+1)
        if not line:
            error=self.child.stderr.read(4096) if self.child.poll() is not None else ''
            raise AdminError('NATIVE_WORKSPACE_FAILED','The original workspace could not be opened or continued: '+error.strip())
        require(len(line)<=4*1024*1024,'Native administration response exceeds its bound')
        value=json.loads(line);require(value.get('ok') is True,value.get('message','Native administration operation failed'),value.get('error','NATIVE_WORKSPACE'))
        return value
    def call(self,action,**values):
        self.child.stdin.write(json.dumps({'action':action,**values})+'\n');self.child.stdin.flush()
        return self.response()
    def close(self):
        if self.child.poll() is None:
            try:
                self.child.stdin.close()
                self.child.wait(timeout=30)
            except subprocess.TimeoutExpired:
                self.child.terminate()
                try:
                    self.child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    self.child.kill();self.child.wait()
        self.child.stdout.close();self.child.stderr.close()
    def __enter__(self):
        return self
    def __exit__(self,*unused):
        self.close()

def active_source(root,current):
    active=current['active'];selected=release(root,active['release'],active['manifest_sha256'])
    selected.update(workspace=active['workspace'],workspace_id=active['workspace_id'])
    return selected

def check_revision(current,expected):
    require(type(expected) is int and current['revision']==expected,'The installation changed; inspect its actual current revision','INSTALLATION_CHANGED')

def pending_activation(root,op):
    current=state(root,optional=True)
    if current and current.get('last_operation')==op.id:
        wanted=op.value['stages'].get('activation')
        require(wanted and current==wanted,'Original activation state differs')
        selected=active_source(root,current)
        with Workspace(root,selected,current['runtime']) as workspace:
            require(workspace.summary['workspace']['id']==current['active']['workspace_id'],'Activated original workspace identity differs')
        return op.complete({'state':current,'backup':op.value['stages'].get('backup'),'restored_from':op.value['stages'].get('restored_from')})
    return None

def activate(root,op,next_state):
    old=state(root,optional=True);before=op.value['before']
    require(old==before,'The installation changed before the original activation','INSTALLATION_CHANGED')
    op.put('activation',next_state)
    atomic(root/'control'/'state.json',next_state,0o644)
    require(state(root)==next_state,'Original activation readback differs')
    return op.complete({'state':next_state,'backup':op.value['stages'].get('backup'),'restored_from':op.value['stages'].get('restored_from')})

def inspect_archive(file,expected_sha=None):
    file=absolute(file,True);raw=regular(file,ARCHIVE_LIMIT);sha=digest(raw)
    if expected_sha:
        require(HEX.fullmatch(expected_sha) and sha==expected_sha,'The original complete backup changed')
    packet=json.loads(raw)
    require(packet.get('schema')==PORTABLE_SCHEMA and packet.get('complete') is True,'A complete native publisher archive is required')
    entries=packet.get('files');require(isinstance(entries,list) and 0<len(entries)<=20000,'Invalid native archive membership')
    members={};total=0;fingerprint=[]
    for entry in entries:
        name=str(relative(entry.get('path')));require(name.startswith(('workspace/','application/')) and name not in members,'Invalid or repeated native member')
        require(type(entry.get('bytes')) is int and 0<=entry['bytes']<=SOURCE_LIMIT and HEX.fullmatch(entry.get('sha256','')),'Invalid native member identity')
        body=base64.b64decode(entry['contentBase64'],validate=True)
        require(len(body)==entry['bytes'] and digest(body)==entry['sha256'],'A complete backup member changed')
        total+=len(body);require(total<=512*1024*1024,'Native backup exceeds its complete source limit')
        members[name]=entry
        if name.startswith('workspace/'):
            require(not re.search(r'-(wal|shm|journal)$',name),'A live SQLite sidecar cannot be restored')
            fingerprint.append([name,entry['bytes'],entry['sha256']])
    require('workspace/operations.sqlite' in members,'Original workspace database is missing')
    inv_member=members.get('application/'+INVENTORY);require(inv_member,'Original complete application inventory is missing')
    inventory=json.loads(base64.b64decode(inv_member['contentBase64']))
    files=inventory.get('files')
    require(inventory.get('schema')==APP_SCHEMA and isinstance(files,list) and 0<len(files)<=512 and len(set(files))==len(files),'Invalid backup application inventory')
    for name in files:
        relative(name)
    require(ENTRY in files and INVENTORY in files and {'application/'+name for name in files}=={name for name in members if name.startswith('application/')},'The backup application selection is incomplete')
    fingerprint.sort(key=lambda row:row[0])
    raw_fingerprint=json.dumps(fingerprint,ensure_ascii=False,separators=(',',':')).encode()
    return {'path':str(file),'bytes':len(raw),'sha256':sha,'workspaceFingerprint':digest(raw_fingerprint),'workspaceId':packet['workspace']['id'],'selection':packet['selection'],'members':len(entries)}

def backup(root,op,workspace,current):
    folder=root/'backups'/op.id
    runtime=current['runtime']
    mkdir(folder,0o700,runtime['uid'],runtime['gid'])
    target=folder/'publisher-workspace.datawork'
    held=workspace.call('fingerprint')
    baseline={k:held[k] for k in ('workspaceFingerprint','workspaceId','selection')}
    require(baseline['workspaceId']==current['active']['workspace_id'],'The selected workspace ID differs')
    op.put('baseline',baseline)
    if target.exists():
        result=inspect_archive(target)
        require(all(result[k]==baseline[k] for k in baseline),'The workspace changed after the retained backup; preserve it and prepare a new operation')
    else:
        op.put('backup_requested',{'path':str(target),'release':current['active']['release'],'baseline':baseline})
        workspace.call('export',output=str(target))
        result=inspect_archive(target)
        require(all(result[k]==baseline[k] for k in baseline),'Original backup readback differs from the locked workspace')
    result={**result,'release':current['active']['release'],'manifest_sha256':current['active']['manifest_sha256'],'runtime':current['runtime'],'created_by_operation':op.id}
    selected=op.put('backup',result)
    publish(folder/'backup.json',encoded(selected),0o600)
    return selected

def native(root,selected,runtime,arguments,timeout=360):
    app=pathlib.Path(selected['application'])
    require(file_pin(runtime['node'],256*1024*1024)['sha256']==runtime['node_sha256'],'The selected Node runtime changed')
    result=subprocess.run([runtime['node'],str(app/ENTRY),*arguments],capture_output=True,text=True,timeout=timeout,**child_options(runtime))
    require(len(result.stdout)<=16*1024*1024 and len(result.stderr)<=1024*1024,'Native output exceeds administration bounds')
    require(result.returncode==0,'Native '+arguments[0]+' failed: '+result.stderr[-4096:].strip(),'NATIVE_COMMAND_FAILED')
    return json.loads(result.stdout)

def receive(root,op,selected,runtime,archive):
    archive=inspect_archive(archive['path'],archive['sha256'])
    attempts=op.value.setdefault('receive_attempts',[])
    if attempts:
        last=attempts[-1];directory=pathlib.Path(last['directory'])
        if (directory/'receiving.json').exists():
            receipt=read_json(directory/'receiving.json')
            require(receipt.get('archiveSha256')==archive['sha256'] and receipt.get('workspaceId')==archive['workspaceId'] and receipt.get('selection')==archive['selection'],'Original native receiving receipt differs')
        else:
            # Every child inherits the administration lock. Reacquiring it proves
            # that an old local receive is no longer executing. Keep all partials.
            if last.get('outcome') not in ('interrupted_retained','failed_retained'):
                last['outcome']='interrupted_retained';last['observed_at']=now();op.save('INCOMPLETE_RECEIVE_RETAINED')
            directory=None
    else:
        directory=None
    if directory is None:
        number=len(attempts)+1
        # The parent belongs to the administrator. The native receive creates its
        # own directory; run it under a private service-owned staging parent.
        container=root/'instances'/(op.id+'-attempt-'+str(number))
        mkdir(container,0o700,runtime['uid'],runtime['gid'])
        directory=container/'received'
        attempts.append({'directory':str(directory),'archive_sha256':archive['sha256'],'requested_at':now(),'outcome':'requested'})
        op.save('RECEIVE_REQUESTED')
        try:
            result=native(root,selected,runtime,['receive','--file',archive['path'],'--directory',str(directory),'--sha256',archive['sha256']])
            require(result['archiveSha256']==archive['sha256'],'Native receive returned a different archive')
        except Exception:
            attempts[-1]['outcome']='failed_retained';attempts[-1]['observed_at']=now();op.save('RECEIVE_FAILED_RETAINED');raise
        attempts[-1]['outcome']='completed';attempts[-1]['observed_at']=now();op.save('RECEIVE_COMPLETED')
    workspace_path=directory/'workspace'
    verify={**selected,'workspace':str(workspace_path)}
    with Workspace(root,verify,runtime) as reopened:
        fingerprint=reopened.call('fingerprint')
        require(fingerprint['workspaceId']==archive['workspaceId'] and fingerprint['selection']==archive['selection'],'Original workspace identity or selection changed during receive')
        require(fingerprint['workspaceFingerprint']==archive['workspaceFingerprint'],'This release changes stored workspace bytes; explicit schema migration is required before activation','SCHEMA_MIGRATION_REQUIRED')
    return {'workspace':str(workspace_path),'workspace_id':archive['workspaceId'],'selection':archive['selection'],'archive_sha256':archive['sha256']}

def directory_identity(path):
    path=absolute(path,True);info=path.lstat()
    require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode),'Expected an ordinary initialized workspace directory')
    return {'device':info.st_dev,'inode':info.st_ino}

def rename_new_directory(source,target):
    source=absolute(source,True);target=absolute(target)
    libc=ctypes.CDLL(None,use_errno=True)
    call=getattr(libc,'renameat2',None)
    require(call is not None,'This Linux host must provide renameat2 for create-only workspace publication','RENAME_NOREPLACE_UNAVAILABLE')
    call.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]
    call.restype=ctypes.c_int
    if call(-100,os.fsencode(source),-100,os.fsencode(target),1)!=0:
        code=ctypes.get_errno()
        raise OSError(code,os.strerror(code),str(target))
    sync_dir(source.parent);sync_dir(target.parent)

def initialize_workspace(root,op,selected,runtime,target,title):
    """Native initialization is staged; partial attempts never occupy the selected target."""
    parent=target.parent
    require(parent.is_dir(),'The selected new workspace parent is unavailable')
    parent_info=parent.stat()
    require(parent_info.st_uid==runtime['uid'] and parent_info.st_gid==runtime['gid'] and stat.S_IMODE(parent_info.st_mode)==0o700,'The new workspace parent must be private and owned by its selected service account')
    op.put('initialize_requested',{'workspace':str(target),'title':title})
    ready=op.value['stages'].get('initialization_ready')
    if ready is None:
        require(not target.exists(),'The selected initialize target already exists without a sealed original staging result; preserve it for an explicit decision','INITIALIZATION_TARGET_UNCONFIRMED')
        attempts=op.value.setdefault('initialize_attempts',[])
        attempt=attempts[-1] if attempts else None
        if attempt is not None and attempt.get('outcome')!='completed':
            if pathlib.Path(attempt['container']).exists():
                if attempt.get('outcome')!='interrupted_retained':
                    attempt['outcome']='interrupted_retained';attempt['observed_at']=now();op.save('INCOMPLETE_INITIALIZATION_RETAINED')
                attempt=None
            else:
                require(attempt.get('outcome')=='requested','A previously selected initialization directory disappeared; preserve the original operation')
        if attempt is None:
            number=len(attempts)+1
            container=parent/('publisher-init-'+op.id+'-'+op.input_hash[:12]+'-'+str(number))
            require(not container.exists(),'A new initialization staging path already exists')
            attempt={'container':str(container),'directory':str(container/'workspace'),'requested_at':now(),'outcome':'requested'}
            attempts.append(attempt);op.save('INITIALIZATION_REQUESTED')
        container=absolute(attempt['container']);directory=absolute(attempt['directory'])
        if attempt.get('outcome')!='completed':
            mkdir(container,0o700,runtime['uid'],runtime['gid'])
            try:
                result=native(root,selected,runtime,['init','--directory',str(directory),'--title',title])
                summary={'workspace':result['workspace'],'selection':result['selection'],'captures':len(result['captures']),'publications':len(result['publications']),'providerOperations':len(result['providerOperations'])}
                require(summary['captures']==0 and summary['publications']==0 and summary['providerOperations']==0,'Native initialization returned a populated workspace')
                attempt['outcome']='completed';attempt['summary']=summary;attempt['observed_at']=now();op.save('INITIALIZATION_COMPLETED')
            except Exception:
                attempt['outcome']='failed_retained';attempt['observed_at']=now();op.save('INITIALIZATION_FAILED_RETAINED');raise
        with Workspace(root,{**selected,'workspace':str(directory)},runtime) as opened:
            require(opened.summary==attempt['summary'],'The completed staged initialization changed')
            fingerprint=opened.call('fingerprint')
            ready={'directory':str(directory),'target':str(target),'identity':directory_identity(directory),'summary':opened.summary,
                   'baseline':{k:fingerprint[k] for k in ('workspaceFingerprint','workspaceId','selection')}}
            op.put('initialization_ready',ready)
    require(ready['target']==str(target),'The original initialization target differs')
    directory=absolute(ready['directory'])
    candidate=target if target.exists() else directory
    require(directory_identity(candidate)==ready['identity'],'Original initialization directory identity changed; preserve both paths')
    with Workspace(root,{**selected,'workspace':str(candidate)},runtime) as opened:
        fingerprint=opened.call('fingerprint')
        require(opened.summary==ready['summary'] and all(fingerprint[k]==ready['baseline'][k] for k in ready['baseline']),'The sealed original initialization changed before publication')
    if candidate==directory:
        op.put('initialization_publish_requested',{'directory':str(directory),'target':str(target),'identity':ready['identity']})
        rename_new_directory(directory,target)
    require(directory_identity(target)==ready['identity'],'Published initialization directory differs')
    with Workspace(root,{**selected,'workspace':str(target)},runtime) as opened:
        fingerprint=opened.call('fingerprint')
        require(opened.summary==ready['summary'] and all(fingerprint[k]==ready['baseline'][k] for k in ready['baseline']),'Published initialization readback differs')
    op.put('initialization_published',{'workspace':str(target),'workspace_id':ready['baseline']['workspaceId'],'identity':ready['identity']})
    return target

def install(args):
    root=managed(args.root,True)
    with administration(root):
        current=state(root,optional=True)
        user=user_identity(args.user)
        node=str(pathlib.Path(args.node).resolve())
        workspace_path=absolute(args.workspace)
        body={'release_sha256':args.sha256,'release_file':str(absolute(args.release,True)),'workspace':str(workspace_path),'initialize':args.initialize,'title':args.title if args.initialize else None,'node':node,'user':user,'port':args.port}
        op=Operation(root,args.operation_id,'install',body,None)
        if op.value.get('result'):
            return op.replay()
        completed=pending_activation(root,op)
        if completed:
            return completed
        require(current is None,'This installation already exists; use update or restore')
        controller=install_controller(root)
        runtime=op.value['stages'].get('runtime')
        if runtime is None:
            runtime=runtime_probe(node,user,args.port);op.put('runtime',runtime)
        else:
            require(file_pin(node,256*1024*1024)['sha256']==runtime['node_sha256'],'The retained runtime input changed')
        with Bundle(args.release,args.sha256) as bundle:
            selected=stage(root,bundle,op.id);op.put('release',selected)
        if args.initialize:
            workspace_path=initialize_workspace(root,op,selected,runtime,workspace_path,args.title)
        else:
            require(workspace_path.exists(),'Choose the existing customer workspace or explicitly initialize a new one')
        selected['workspace']=str(workspace_path)
        with Workspace(root,selected,runtime) as opened:
            summary=opened.summary
            if args.initialize:
                require(summary['captures']==0 and summary['publications']==0 and summary['providerOperations']==0,'The original new workspace changed before installation')
            op.put('workspace',summary)
            active={k:selected[k] for k in ('release','manifest_sha256','workspace')}
            active['workspace_id']=summary['workspace']['id']
            next_state={'schema':STATE_SCHEMA,'revision':0,'installed_at':now(),'runtime':runtime,'controller':controller,'active':active,'last_operation':op.id}
            previous=op.value['stages'].get('activation')
            if previous:
                next_state=previous
            return activate(root,op,next_state)

def maintain(args):
    root=managed(args.root)
    with administration(root):
        current=state(root)
        body={'expected_revision':args.expected_revision}
        if args.command=='update':
            body.update(release_file=str(absolute(args.release,True)),release_sha256=args.sha256,node=str(pathlib.Path(args.node).resolve()) if args.node else None)
        if args.command in ('restore','rollback'):
            body['backup_operation']=args.backup_operation
        op=Operation(root,args.operation_id,args.command,body,current)
        if op.value.get('result'):
            return op.replay()
        completed=pending_activation(root,op)
        if completed:
            return completed
        require(current==op.value['before'],'The original administration baseline changed')
        check_revision(current,args.expected_revision)
        original=active_source(root,current);runtime=current['runtime']
        with Workspace(root,original,runtime) as held:
            saved=backup(root,op,held,current)
            if args.command=='backup':
                return op.complete({'backup':saved,'state_revision':current['revision'],'workspace_id':saved['workspaceId']})
            if args.command=='update':
                with Bundle(args.release,args.sha256) as bundle:
                    selected=stage(root,bundle,op.id);op.put('release',selected)
                desired_runtime=runtime
                if args.node:
                    desired_runtime=runtime_probe(args.node,{k:runtime[k] for k in ('user','uid','gid')},runtime['port'])
                desired_runtime=op.put('next_runtime',desired_runtime)
                restore_source=saved
            else:
                require(ID.fullmatch(args.backup_operation or ''),'Choose the original backup operation ID')
                backup_path=root/'backups'/args.backup_operation/'backup.json'
                restore_source=read_json(backup_path)
                authority=read_json(root/'control'/'operations'/args.backup_operation/'operation.json')
                require(authority.get('schema')==OP_SCHEMA and authority.get('id')==args.backup_operation and authority.get('stages',{}).get('backup')==restore_source,'Backup receipt differs from its original administrator-held operation')
                require(restore_source.get('created_by_operation')==args.backup_operation,'Original backup operation differs')
                original_archive=inspect_archive(restore_source['path'],restore_source['sha256'])
                require(original_archive['workspaceId']==current['active']['workspace_id'],'Restore the same original workspace; use customer receiving for a different workspace')
                for key in ('bytes','sha256','workspaceFingerprint','workspaceId','selection'):
                    require(original_archive[key]==restore_source[key],'Original backup receipt differs')
                selected=release(root,restore_source['release'],restore_source['manifest_sha256'])
                desired_runtime=restore_source['runtime']
                require(file_pin(desired_runtime['node'],256*1024*1024)['sha256']==desired_runtime['node_sha256'],'Restore the exact retained Node runtime before selecting this backup')
                op.put('restored_from',restore_source)
            received=receive(root,op,selected,desired_runtime,restore_source)
            active={k:selected[k] for k in ('release','manifest_sha256')}
            active.update(workspace=received['workspace'],workspace_id=received['workspace_id'])
            next_state={**current,'revision':current['revision']+1,'runtime':desired_runtime,'active':active,'last_operation':op.id,'updated_at':now()}
            previous=op.value['stages'].get('activation')
            if previous:
                next_state=previous
            return activate(root,op,next_state)

def inspect(args):
    root=managed(args.root)
    with administration(root,shared=True):
        current=state(root);selected=active_source(root,current)
        result={'schema':'datagouv.linux-status/v1','root':str(root),'state':current,'source_files_verified':True,'application':selected['application']}
        if args.workspace:
            # The original native lock detects an open service or direct CLI.
            with Workspace(root,selected,current['runtime']) as opened:
                result['workspace']=opened.summary
        if args.operation_id:
            require(ID.fullmatch(args.operation_id),'Choose an original administration operation')
            operation=read_json(root/'control'/'operations'/args.operation_id/'operation.json')
            result['operation']={k:operation.get(k) for k in ('id','kind','created_at','completed_at','result','history','receive_attempts','initialize_attempts')}
        return result

def operational_command(args):
    root=managed(args.root)
    with administration(root):
        current=state(root);selected=active_source(root,current)
        arguments=list(args.arguments)
        if arguments and arguments[0]=='--':
            arguments.pop(0)
        require(arguments,'Choose an original publisher CLI command')
        allowed={'status','history','import','plan','extract','retry-extraction','inspect','review','publish','select','compare','decide','recover','query','download','portal-prepare','portal-draft','portal-review','portal-publish','portal-reconcile','portal-inspect','portal-access','portal-locate'}
        command=arguments[0];require(command in allowed,'Use the native customer receiver, managed backup, or service command for that action')
        require(not any(x in ('--directory','--source-root','--token-env') or x.startswith(('--directory=','--source-root=','--token-env=')) for x in arguments),'The managed directory/source and credential name cannot be overridden')
        if args.provider_env:
            require(command.startswith('portal-'),'Provider credentials are only accepted by an explicit portal CLI operation')
            arguments.extend(['--token-env',args.provider_env])
        arguments.extend(['--directory',selected['workspace']])
        require(file_pin(current['runtime']['node'],256*1024*1024)['sha256']==current['runtime']['node_sha256'],'Selected Node runtime changed')
        # Native request files retain their own original UUIDs/operation IDs.
        # Arguments, inputs and provider output are never copied into admin logs.
        result=subprocess.run([current['runtime']['node'],str(pathlib.Path(selected['application'])/ENTRY),*arguments],**child_options(current['runtime'],args.provider_env))
        return {'schema':'datagouv.linux-native-command/v1','command':command,'exit_code':result.returncode,'workspace_id':current['active']['workspace_id']}

def unit_text(root,current,name):
    require(ID.fullmatch(name) and not name.endswith('.service'),'Use a simple service name without a suffix')
    runtime=current['runtime'];require(runtime['uid']!=0,'Select an unprivileged service account before generating a system unit')
    values=[str(root),runtime['python'],runtime['node'],current['active']['workspace']]
    require(all(re.fullmatch(r'/[A-Za-z0-9_./-]+',v) for v in values),'System units require these installation/runtime paths to contain only letters, digits, slash, dot, underscore and hyphen')
    require(all(not v.startswith(('/home/','/root/','/run/user/')) for v in values),'Place a system installation and runtime outside home directories')
    controller=current['controller']
    require(file_pin(root/'bin'/'launcher.py')['sha256']==controller['launcher_sha256'],'Installed service launcher changed')
    return '\n'.join([
        '# Generated by the Data.gouv publisher administrator. No credential files.',
        '[Unit]','Description=Data.gouv publisher operations','After=network.target',
        'StartLimitIntervalSec=120','StartLimitBurst=3','',
        '[Service]','Type=simple','User='+str(runtime['uid']),'Group='+str(runtime['gid']),
        'WorkingDirectory='+str(root),'ExecStart='+runtime['python']+' '+str(root/'bin'/'launcher.py')+' '+str(root),
        'UMask=0077','Restart=on-failure','RestartPreventExitStatus=75','RestartSec=10',
        'KillSignal=SIGTERM','KillMode=control-group','TimeoutStopSec=360',
        'NoNewPrivileges=true','PrivateTmp=true','PrivateDevices=true','ProtectSystem=strict','ProtectHome=true',
        'ProtectKernelTunables=true','ProtectKernelModules=true','ProtectControlGroups=true',
        'RestrictSUIDSGID=true','RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
        'CapabilityBoundingSet=','AmbientCapabilities=',
        'ReadWritePaths='+str(root/'instances')+' '+current['active']['workspace'],
        'StandardOutput=journal','StandardError=journal','SyslogIdentifier='+name,
        '', '[Install]','WantedBy=multi-user.target',''])

def render_unit(args):
    root=managed(args.root)
    with administration(root,shared=True):
        current=state(root);text=unit_text(root,current,args.name)
        if args.output:
            output=absolute(args.output);publish(output,text.encode(),0o644)
            return {'schema':'datagouv.linux-service-unit/v1','path':str(output),'sha256':digest(text.encode()),'state_revision':current['revision'],'installed':False,'started':False}
        sys.stdout.write(text)
        return None

def parser():
    result=argparse.ArgumentParser(description=__doc__)
    commands=result.add_subparsers(dest='command',required=True)
    package=commands.add_parser('pack',help='Package exactly the native application inventory')
    package.add_argument('--source',required=True);package.add_argument('--source-ref',required=True);package.add_argument('--output',required=True)
    install=commands.add_parser('install',help='Install one selected release and existing or explicitly new workspace')
    install.add_argument('--root',required=True);install.add_argument('--operation-id',required=True);install.add_argument('--release',required=True);install.add_argument('--sha256',required=True)
    install.add_argument('--node',required=True);install.add_argument('--user');install.add_argument('--port',type=int,default=8429)
    install.add_argument('--workspace',required=True);install.add_argument('--initialize',action='store_true');install.add_argument('--title',default='Publisher operations')
    for name in ('backup','update','restore','rollback'):
        command=commands.add_parser(name)
        command.add_argument('--root',required=True);command.add_argument('--operation-id',required=True);command.add_argument('--expected-revision',type=int,required=True)
        if name=='update':
            command.add_argument('--release',required=True);command.add_argument('--sha256',required=True);command.add_argument('--node')
        if name in ('restore','rollback'):
            command.add_argument('--backup-operation',required=True)
    status=commands.add_parser('status')
    status.add_argument('--root',required=True);status.add_argument('--workspace',action='store_true');status.add_argument('--operation-id')
    run=commands.add_parser('run',help='Run the original publisher CLI while the service is stopped')
    run.add_argument('--root',required=True);run.add_argument('--provider-env');run.add_argument('arguments',nargs=argparse.REMAINDER)
    unit=commands.add_parser('unit',help='Render an explicit systemd unit without installing or starting it')
    unit.add_argument('--root',required=True);unit.add_argument('--name',default='datagouv-publisher');unit.add_argument('--output')
    return result

def main(argv=None):
    require(sys.platform=='linux' and sys.version_info>=(3,10),'Linux with Python3.10+ is required')
    os.umask(0o077)
    args=parser().parse_args(argv)
    if args.command=='pack':
        value=pack(args)
    elif args.command=='install':
        value=install(args)
    elif args.command in ('backup','update','restore','rollback'):
        value=maintain(args)
    elif args.command=='status':
        value=inspect(args)
    elif args.command=='unit':
        value=render_unit(args)
    else:
        value=operational_command(args)
    if value is not None:
        print(json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2),flush=True)
        return value.get('exit_code',0)
    return 0

if __name__=='__main__':
    try:
        raise SystemExit(main())
    except (AdminError,OSError,ValueError,KeyError,subprocess.SubprocessError) as error:
        print(json.dumps({'error':getattr(error,'code','ADMINISTRATION_FAILED'),'message':str(error),'original_work_preserved':True}),file=sys.stderr,flush=True)
        raise SystemExit(75 if getattr(error,'code','')=='SERVICE_OR_ADMIN_ACTIVE' else 1)
