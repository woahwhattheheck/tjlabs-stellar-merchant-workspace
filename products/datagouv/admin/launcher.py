#!/usr/bin/env python3
"""MIT. Small installed service launcher: no credential configuration or daemon."""
import fcntl, hashlib, json, os, pathlib, stat, sys

def require(value, message):
    if not value:
        raise RuntimeError(message)

def regular(path, maximum=1024*1024):
    path=pathlib.Path(path)
    require(path.resolve()==path.absolute(), 'A managed path contains a symlink')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_size<=maximum, 'Invalid managed file')
        with os.fdopen(os.dup(fd),'rb') as stream:
            raw=stream.read(maximum+1)
        after=os.fstat(fd)
        require((before.st_ino,before.st_dev,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_ino,after.st_dev,after.st_size,after.st_mtime_ns,after.st_ctime_ns) and len(raw)==before.st_size,'Managed file changed')
        return raw
    finally:
        os.close(fd)

def main():
    require(sys.platform=='linux' and len(sys.argv)==2,'Use launcher.py /absolute/managed/root on Linux')
    root=pathlib.Path(sys.argv[1])
    require(root.is_absolute() and root.resolve()==root and str(root)!='/', 'Use the exact managed root')
    control=root/'control'
    owner=json.loads(regular(control/'owner.json'))
    for path in (root,control,control/'state.json',control/'owner.json'):
        for parent in path.parents:
            if parent==root:
                break
            parent_info=parent.stat()
            require(parent_info.st_uid==owner['administrator_uid'] and not parent_info.st_mode&0o022,'Release directory permissions changed')
        info=path.lstat()
        require(info.st_uid==owner['administrator_uid'] and not info.st_mode&0o022,'Managed control is writable by another account')
    lock=os.open(control/'admin.lock',os.O_RDONLY|os.O_NOFOLLOW)
    require(stat.S_ISREG(os.fstat(lock).st_mode) and os.fstat(lock).st_nlink==1 and os.fstat(lock).st_uid==owner['administrator_uid'] and not os.fstat(lock).st_mode&0o022,'Invalid original administration lock')
    fcntl.flock(lock,fcntl.LOCK_SH|fcntl.LOCK_NB)
    state=json.loads(regular(control/'state.json'))
    require(state['schema']=='datagouv.linux-installation/v1','Unsupported installation state')
    active=state['active']; runtime=state['runtime']
    require(os.geteuid()==runtime['uid'] and os.getegid()==runtime['gid'],'Run as the selected service account')
    require(runtime['uid']!=0,'The system service must use an unprivileged account')
    release=root/'releases'/active['release']
    manifest_raw=regular(release/'release.json',4*1024*1024)
    require(hashlib.sha256(manifest_raw).hexdigest()==active['manifest_sha256'],'Selected release manifest changed')
    manifest=json.loads(manifest_raw)
    require(manifest['release_id']==active['release'],'Selected release identity changed')
    application=release/'application'
    for entry in manifest['files']:
        relative=pathlib.PurePosixPath(entry['path'])
        require(not relative.is_absolute() and '..' not in relative.parts and str(relative)==entry['path'],'Invalid release member')
        path=application.joinpath(*relative.parts)
        info=path.lstat()
        require(info.st_uid==owner['administrator_uid'] and not info.st_mode&0o022,'Release source is writable by another account')
        raw=regular(path,32*1024*1024)
        require(len(raw)==entry['bytes'] and hashlib.sha256(raw).hexdigest()==entry['sha256'],'Installed source changed: '+entry['path'])
    workspace=pathlib.Path(active['workspace'])
    require(workspace.resolve()==workspace and workspace.is_dir() and workspace.stat().st_uid==runtime['uid'] and not workspace.stat().st_mode&0o077,'Workspace must remain private and directly addressed')
    node=pathlib.Path(runtime['node'])
    require(node.resolve()==node and node.is_file() and os.access(node,os.X_OK),'Selected Node runtime changed')
    require(hashlib.sha256(regular(node,256*1024*1024)).hexdigest()==runtime['node_sha256'],'Selected Node runtime bytes changed; stage a runtime update')
    os.set_inheritable(lock,True)
    os.umask(0o077)
    os.chdir(application)
    # Deliberate allowlist. No provider token, Node injection option or environment file.
    environment={'PATH':str(node.parent)+':/usr/bin:/bin','LANG':'C.UTF-8'}
    argv=[str(node),str(application/'start-publisher.mjs'),'serve','--directory',str(workspace),'--source-root',str(application),'--port',str(runtime['port'])]
    os.execve(str(node),argv,environment)

if __name__=='__main__':
    try:
        main()
    except BlockingIOError:
        sys.stderr.write('Administration owns this installation; service start was not admitted.\n')
        raise SystemExit(75)
    except Exception as error:
        sys.stderr.write('Publisher service start failed: '+str(error)+'\n')
        raise SystemExit(1)
