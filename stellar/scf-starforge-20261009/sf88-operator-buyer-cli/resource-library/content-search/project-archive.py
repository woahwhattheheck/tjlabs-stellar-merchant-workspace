#!/usr/bin/env python3
"""Research project snapshots and create-only, fully verified tar.gz receiving.

No network, shell, third-party modules or archive-supplied executable code.
"""
from __future__ import annotations
import argparse, hashlib, json, os, shutil, signal, sqlite3, stat, sys, tarfile, tempfile
from pathlib import Path, PurePosixPath
from contextlib import closing
SCHEMA = 'stellar-forge.resource-research-project.v1'
SOURCE = 'stellar-forge.resource-research-source.v1'
CHUNK = 1024 * 1024

def fail(message: str) -> None:
    raise ValueError(message)

def digest(path: Path) -> tuple[int, str]:
    h = hashlib.sha256(); total = 0
    with path.open('rb') as f:
        for block in iter(lambda: f.read(CHUNK), b''):
            h.update(block); total += len(block)
    return total, h.hexdigest()

def regular(path: Path) -> None:
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or path.resolve() != path.absolute():
        fail('PROJECT_REGULAR_FILE_REQUIRED')

def safe_name(name: str) -> str:
    bits = name.split('/')
    if not name or '\\' in name or '\x00' in name or any(x in ('', '.', '..') for x in bits) or name.startswith('/') or ':' in bits[0]:
        fail('PROJECT_MEMBER_PATH_INVALID')
    if str(PurePosixPath(name)) != name:
        fail('PROJECT_MEMBER_PATH_INVALID')
    return name

def write_json(path: Path, value: object) -> None:
    with path.open('x', encoding='utf-8') as f:
        os.chmod(path, 0o600)
        json.dump(value, f, ensure_ascii=False, separators=(',', ':'))
        f.flush(); os.fsync(f.fileno())

def snapshot(state: Path, out: Path) -> dict:
    """Acquire both native writer locks, then backup through separate readers.

    Lock order is always library then search. Readers remain available in WAL.
    All writers either precede or follow these two backups; no raw WAL copying.
    """
    names = ('library.sqlite', 'content-search.sqlite')
    locks = []
    try:
        for name in names:
            src = state / name; regular(src)
            con = sqlite3.connect(src, timeout=5)
            con.execute('PRAGMA trusted_schema=OFF')
            con.execute('BEGIN IMMEDIATE'); locks.append(con)
        for name in names:
            target = out / name
            if target.exists(): fail('PROJECT_SNAPSHOT_DESTINATION_EXISTS')
            with closing(sqlite3.connect(f'{(state / name).as_uri()}?mode=ro', uri=True, timeout=5)) as src:
                with closing(sqlite3.connect(target)) as dst:
                    src.backup(dst)
                    # Backup pages are committed before converting this private copy.
                    # DELETE mode makes the two databases self-contained; no WAL/SHM
                    # files may become archive members or escape a backup boundary.
                    dst.execute('PRAGMA wal_checkpoint(TRUNCATE)')
                    dst.execute('PRAGMA journal_mode=DELETE')
            os.chmod(target, 0o600)
    finally:
        for con in reversed(locks):
            con.rollback(); con.close()
    return {'snapshots': list(names)}

def pack(root: Path, output: Path) -> dict:
    if output.exists(): fail('PROJECT_DESTINATION_EXISTS')
    entries = []
    for file in sorted(root.rglob('*')):
        if file.is_dir(): continue
        regular(file)
        name = safe_name(file.relative_to(root).as_posix())
        if name == 'PROJECT.json': fail('PROJECT_MANIFEST_RESERVED')
        size, sha = digest(file)
        entries.append({'path': name, 'bytes': size, 'sha256': sha})
    source = json.loads((root / 'project-source.json').read_text())
    manifest = {'schema': SCHEMA, 'projectId': source['projectId'],
                'resources': len(source['resources']), 'members': entries,
                'originalConfig': source['originalConfig'], 'originalScan': source['originalScan']}
    data = json.dumps(manifest, ensure_ascii=False, separators=(',', ':')).encode()
    fd, temporary = tempfile.mkstemp(prefix='.research-export-', dir=output.parent)
    try:
        with os.fdopen(fd, 'wb') as raw:
            with tarfile.open(fileobj=raw, mode='w:gz', format=tarfile.PAX_FORMAT) as tf:
                import io
                member = tarfile.TarInfo('PROJECT.json'); member.size = len(data); member.mode = 0o600
                tf.addfile(member, io.BytesIO(data))
                for entry in entries:
                    file = root / entry['path']; regular(file)
                    info = tf.gettarinfo(str(file), entry['path']); info.uid = info.gid = 0
                    info.uname = info.gname = ''; info.mode = 0o600; info.mtime = 0
                    with file.open('rb') as src: tf.addfile(info, src)
            raw.flush(); os.fsync(raw.fileno())
        # Exclusive hard-link publication prevents replacing an existing archive.
        os.link(temporary, output)
        size, sha = digest(output)
        return {'path': str(output), 'bytes': size, 'sha256': sha,
                'projectId': source['projectId'], 'members': len(entries), 'resources': len(source['resources'])}
    finally:
        Path(temporary).unlink(missing_ok=True)

def inspect_archive(archive: Path, output: Path | None, max_bytes: int) -> dict:
    regular(archive)
    if output is not None and (output.exists() or output.is_symlink()): fail('PROJECT_DESTINATION_EXISTS')
    if output is not None and not output.parent.is_dir(): fail('PROJECT_PARENT_REQUIRED')
    stage = Path(tempfile.mkdtemp(prefix='.research-receive-', dir=output.parent)) if output else None
    try:
        with tarfile.open(archive, 'r|gz') as tf:
            head = tf.next()
            if head is None or head.name != 'PROJECT.json' or not head.isfile() or head.size > 32 * CHUNK:
                fail('PROJECT_MANIFEST_REQUIRED')
            data = tf.extractfile(head).read(); manifest = json.loads(data)
            if manifest.get('schema') != SCHEMA or not isinstance(manifest.get('members'), list): fail('PROJECT_SCHEMA_INVALID')
            expected = {}; declared = 0
            for entry in manifest['members']:
                name = safe_name(entry['path']); size = entry['bytes']; sha = entry['sha256']
                if name in expected or name == 'PROJECT.json' or type(size) is not int or size < 0 or not isinstance(sha, str) or len(sha) != 64 or any(c not in '0123456789abcdef' for c in sha): fail('PROJECT_MEMBER_INVALID')
                hand = name.split('/')
                handover = len(hand) == 3 and hand[0] == 'reading-handovers' and len(hand[1]) == 64 and all(c in '0123456789abcdef' for c in hand[1]) and hand[2] in ('sources.tar', 'handover.json', 'reading-handover.zip')
                if name not in ('library.sqlite', 'content-search.sqlite', 'project-source.json') and not (name.startswith('files/') and len(name) == 70 and name[6:] == sha) and not handover: fail('PROJECT_MEMBER_NOT_SUPPORTED')
                expected[name] = entry; declared += size
                if declared > max_bytes: fail('PROJECT_SIZE_LIMIT_EXCEEDED')
            if not {'library.sqlite','content-search.sqlite','project-source.json'}.issubset(expected): fail('PROJECT_STORES_REQUIRED')
            if len(expected) > 100000: fail('PROJECT_MEMBER_LIMIT_EXCEEDED')
            seen = set()
            while (member := tf.next()) is not None:
                name = safe_name(member.name)
                if not member.isfile() or member.issym() or member.islnk() or name not in expected or name in seen or member.size != expected[name]['bytes']:
                    fail('PROJECT_ARCHIVE_MEMBER_INVALID')
                seen.add(name); hasher = hashlib.sha256(); count = 0
                target = stage / name if stage else None
                if target: target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                writer = target.open('xb') if target else None
                try:
                    if target: os.chmod(target, 0o600)
                    src = tf.extractfile(member)
                    for block in iter(lambda: src.read(CHUNK), b''):
                        count += len(block)
                        if count > expected[name]['bytes']: fail('PROJECT_MEMBER_SIZE_CHANGED')
                        hasher.update(block)
                        if writer: writer.write(block)
                    if count != expected[name]['bytes'] or hasher.hexdigest() != expected[name]['sha256']: fail('PROJECT_MEMBER_DIGEST_MISMATCH')
                    if writer: writer.flush(); os.fsync(writer.fileno())
                finally:
                    if writer: writer.close()
            if seen != set(expected): fail('PROJECT_ARCHIVE_INCOMPLETE')
        result = {'schema': SCHEMA, 'projectId': manifest['projectId'], 'members': len(seen),
                  'bytes': declared, 'resources': manifest['resources']}
        if stage:
            rebind(stage, output, manifest)
            size, sha = digest(archive)
            write_json(stage / 'RECEIVED.json', {**result, 'archive': {'name': archive.name, 'bytes': size, 'sha256': sha}})
            publish_directory(stage, output)
            result['path'] = str(output)
        return result
    finally:
        if stage: shutil.rmtree(stage, ignore_errors=True)

def publish_directory(stage: Path, output: Path) -> None:
    # Publish a complete directory atomically and never replace any destination.
    if sys.platform.startswith('linux'):
        import ctypes
        libc = ctypes.CDLL(None, use_errno=True)
        operation = getattr(libc, 'renameat2', None)
        if operation is None: fail('PROJECT_ATOMIC_RENAME_UNAVAILABLE')
        operation.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
        operation.restype = ctypes.c_int
        if operation(-100, os.fsencode(stage), -100, os.fsencode(output), 1) != 0:
            error = ctypes.get_errno()
            raise OSError(error, os.strerror(error))
    elif os.name == 'nt':
        os.rename(stage, output)  # Windows rename refuses an existing target.
    else:
        fail('PROJECT_ATOMIC_RENAME_UNAVAILABLE')


def rebind(stage: Path, final: Path, manifest: dict) -> None:
    source = json.loads((stage / 'project-source.json').read_text())
    if source.get('schema') != SOURCE or source.get('projectId') != manifest['projectId'] or not isinstance(source.get('resources'), list): fail('PROJECT_SOURCE_INVALID')
    if len(source['resources']) > 10000: fail('PROJECT_RESOURCE_LIMIT_EXCEEDED')
    for record in source['resources']:
        rid = record.get('id', '')
        if not isinstance(rid, str) or len(rid) != 64 or any(c not in '0123456789abcdef' for c in rid): fail('PROJECT_IDENTITY_INVALID')
    current = {x['id']: x for x in source['resources']}
    file_entries = {x['path']: x for x in manifest['members']}
    if len(current) != len(source['resources']) or len(current) != manifest['resources']: fail('PROJECT_RESOURCE_COUNT_INVALID')
    def bind(record: dict) -> dict:
        value = dict(record)
        if value.get('deliveryStatus') == 'SAVED':
            sha = value.get('sha256', '')
            if len(sha) != 64 or any(x not in '0123456789abcdef' for x in sha): fail('PROJECT_RESOURCE_DIGEST_INVALID')
            entry = file_entries.get('files/' + sha)
            if entry is None or value.get('bytes') != entry['bytes']: fail('PROJECT_ORIGINAL_FILE_REQUIRED')
            value['path'] = str(final / 'files' / sha)
        return value
    for name in ('library.sqlite', 'content-search.sqlite'):
        with closing(sqlite3.connect(stage / name)) as db, db:
            db.execute('PRAGMA trusted_schema=OFF')
            if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok': fail('PROJECT_DATABASE_INVALID')
            if name == 'library.sqlite':
                raw = db.execute("SELECT value FROM settings WHERE key='config'").fetchone()
                config = json.loads(raw[0])
                config.update(kind='research-project', source=str(final / 'project-source.json'), roots=[str(final / 'files')])
                db.execute("UPDATE settings SET value=? WHERE key='config'", (json.dumps(config),))
                generation = json.loads(db.execute("SELECT value FROM settings WHERE key='scan'").fetchone()[0])['generation']
                # An in-flight scan is derived partial state, not the selected edition.
                db.execute('DELETE FROM records WHERE generation<>?', (generation,))
                db.execute('DELETE FROM search WHERE generation<>?', (generation,))
                rows = db.execute('SELECT generation,id,metadata FROM records').fetchall()
                ids = set()
                for generation, rid, value in rows:
                    record = json.loads(value)
                    if rid != record.get('id') or rid not in current: fail('PROJECT_RESOURCE_IDENTITY_MISMATCH')
                    ids.add(rid)
                    db.execute('UPDATE records SET metadata=? WHERE generation=? AND id=?', (json.dumps(bind(record)), generation, rid))
                if ids != set(current): fail('PROJECT_RESOURCE_SET_MISMATCH')
                db.execute('DELETE FROM scan_lease')
                if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='resource_collections'").fetchone():
                    for rid, rev, value in db.execute('SELECT id,revision,content FROM resource_collections').fetchall():
                        collection = json.loads(value); collection['members'] = [bind(x) for x in collection['members']]
                        db.execute('UPDATE resource_collections SET content=? WHERE id=? AND revision=?', (json.dumps(collection), rid, rev))
            else:
                for build, document, value in db.execute('SELECT build,document,resource FROM members').fetchall():
                    db.execute('UPDATE members SET resource=? WHERE build=? AND document=?', (json.dumps(bind(json.loads(value))), build, document))
                db.execute('DELETE FROM lease')
                if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='reading_handover_operations'").fetchone():
                    for operation, state, result in db.execute('SELECT id,state,result FROM reading_handover_operations').fetchall():
                        if state == 'PREPARING': fail('PROJECT_HANDOVER_PREPARATION_ACTIVE')
                        if state == 'COMPLETE':
                            result = json.loads(result)
                            directory = 'reading-handovers/' + hashlib.sha256(operation.encode()).hexdigest() + '/'
                            for name in ('sources.tar','handover.json','reading-handover.zip'):
                                if directory + name not in file_entries: fail('PROJECT_COMPLETED_HANDOVER_REQUIRED')
                            received = file_entries[directory + 'reading-handover.zip']
                            if received['sha256'] != result['sha256'] or received['bytes'] != result['bytes']: fail('PROJECT_HANDOVER_RESULT_MISMATCH')
                    db.execute("UPDATE reading_handover_operations SET owner=NULL WHERE state<>'COMPLETE'")
                db.execute("UPDATE builds SET state='INTERRUPTED',error='PROJECT_RECEIVED_DURING_INDEXING' WHERE state='RUNNING'")
    (stage / 'files').mkdir(exist_ok=True, mode=0o700)

def main() -> None:
    ap = argparse.ArgumentParser(); ap.add_argument('command', choices=('snapshot','pack','inspect','receive'))
    ap.add_argument('--state', type=Path); ap.add_argument('--root', type=Path); ap.add_argument('--out', type=Path)
    ap.add_argument('--archive', type=Path); ap.add_argument('--maximum-bytes', type=int, default=1024**4)
    a = ap.parse_args()
    if a.maximum_bytes < 1: fail('PROJECT_SIZE_LIMIT_INVALID')
    if a.command == 'snapshot': result = snapshot(a.state.resolve(), a.out.resolve())
    elif a.command == 'pack': result = pack(a.root.resolve(), a.out.absolute())
    else: result = inspect_archive(a.archive.absolute(), a.out.absolute() if a.command == 'receive' else None, a.maximum_bytes)
    print(json.dumps(result, separators=(',', ':')))

if __name__ == '__main__':
    def interrupted(signum, frame):
        raise InterruptedError('PROJECT_INTERRUPTED')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try: main()
    except Exception as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr); sys.exit(1)
