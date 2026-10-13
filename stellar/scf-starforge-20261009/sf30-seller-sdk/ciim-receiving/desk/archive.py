#!/usr/bin/env python3
"""MIT. Private ZIP receiving/handback transport using Python's original zipfile.
No source code, runtime, XML parser or transform is executed from an archive.
"""
import sys, os, stat, json, hashlib, pathlib, zipfile, uuid

MAX_ARCHIVE = 512 * 1024 * 1024
MAX_MEMBER = 512 * 1024 * 1024
MAX_EXPANDED = 2 * 1024 * 1024 * 1024
MAX_MEMBERS = 20000

def fail(code, message):
    raise ValueError(code + ': ' + message)

def path_name(value):
    if not isinstance(value, str) or not value or len(value) > 2048 or '\x00' in value or '\\' in value or value.startswith('/'):
        fail('ARCHIVE_PATH', 'Use an exact relative POSIX member name')
    pieces = value.split('/')
    if any(not p or p in ('.', '..') for p in pieces):
        fail('ARCHIVE_PATH', value)
    value.encode('utf-8', 'strict')
    return value

def private_dir(path):
    path = pathlib.Path(path)
    if not path.is_absolute() or str(path.resolve()) != str(path):
        fail('PRIVATE_DIRECTORY_REQUIRED', str(path))
    s = path.lstat()
    if not stat.S_ISDIR(s.st_mode) or s.st_mode & 0o077:
        fail('PRIVATE_DIRECTORY_REQUIRED', str(path))
    return path

def checked_file(path):
    path = pathlib.Path(path)
    if not path.is_absolute() or str(path.resolve()) != str(path):
        fail('REGULAR_FILE_REQUIRED', str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    f = os.fdopen(fd, 'rb')
    s = os.fstat(fd)
    if not stat.S_ISREG(s.st_mode) or s.st_nlink != 1:
        f.close()
        fail('REGULAR_FILE_REQUIRED', str(path))
    return f, s

def stream(reader, writer, expected, maximum=MAX_MEMBER):
    h = hashlib.sha256()
    size = 0
    while True:
        block = reader.read(65536)
        if not block:
            break
        size += len(block)
        if size > maximum or size > expected:
            fail('ARCHIVE_MEMBER_LIMIT', 'A member exceeded its declared size')
        h.update(block)
        writer.write(block)
    if size != expected:
        fail('ARCHIVE_MEMBER_SIZE', 'A member differs from its declared size')
    return size, h.hexdigest()

def unchanged(f, before):
    after = os.fstat(f.fileno())
    if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
        fail('SOURCE_CHANGED_DURING_READ', 'A source file changed')

def unpack(request):
    destination = private_dir(request['destination'])
    if any(destination.iterdir()):
        fail('EXTRACTION_DIRECTORY_NOT_EMPTY', str(destination))
    file, before = checked_file(request['file'])
    if before.st_size > MAX_ARCHIVE:
        file.close()
        fail('ARCHIVE_LIMIT', 'The input exceeds the 512 MiB archive limit')
    inventory = []
    total = 0
    seen = set()
    try:
        with zipfile.ZipFile(file, 'r') as archive:
            infos = archive.infolist()
            if len(infos) > MAX_MEMBERS:
                fail('ARCHIVE_MEMBER_LIMIT', 'Too many members')
            # Validate the complete central directory before creating any member.
            kinds = {}
            for info in infos:
                if info.orig_filename != info.filename or info.flag_bits & 1:
                    fail('ARCHIVE_MEMBER', 'Encrypted or truncated member names are not accepted')
                isdir = info.is_dir()
                name = path_name(info.filename[:-1] if isdir else info.filename)
                if name in seen:
                    fail('ARCHIVE_DUPLICATE', name)
                seen.add(name)
                mode = info.external_attr >> 16
                kind = stat.S_IFMT(mode)
                if kind not in (0, stat.S_IFDIR if isdir else stat.S_IFREG):
                    fail('ARCHIVE_SPECIAL_MEMBER', name)
                if info.file_size < 0 or info.file_size > MAX_MEMBER:
                    fail('ARCHIVE_MEMBER_LIMIT', name)
                total += info.file_size
                if total > MAX_EXPANDED:
                    fail('ARCHIVE_EXPANDED_LIMIT', 'The full input exceeds 2 GiB')
                kinds[name] = isdir
            for name, isdir in kinds.items():
                parent = pathlib.PurePosixPath(name).parent
                while str(parent) != '.':
                    if str(parent) in kinds and not kinds[str(parent)]:
                        fail('ARCHIVE_PATH_COLLISION', name)
                    parent = parent.parent
            for info in infos:
                isdir = info.is_dir()
                name = path_name(info.filename[:-1] if isdir else info.filename)
                target = destination.joinpath(*name.split('/'))
                if isdir:
                    target.mkdir(mode=0o700, parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                with archive.open(info, 'r') as reader:
                    with open(target, 'xb') as writer:
                        os.chmod(target, 0o600)
                        size, sha = stream(reader, writer, info.file_size)
                        writer.flush()
                        os.fsync(writer.fileno())
                inventory.append({'file':name, 'bytes':size, 'sha256':sha})
            unchanged(file, before)
        for directory in sorted({str(destination)} | {str((destination / i['file']).parent) for i in inventory}, reverse=True):
            fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
    finally:
        file.close()
    return {'status':'complete', 'members':inventory, 'expandedBytes':total}

def pack(request):
    output = pathlib.Path(request['output'])
    private_dir(output.parent)
    names = set()
    members = request['files']
    if not isinstance(members, list) or len(members) >= MAX_MEMBERS:
        fail('ARCHIVE_MEMBER_LIMIT', 'Too many output members')
    total = 0
    for item in members:
        name = path_name(item['path'])
        if name == 'desk-package.json' or name in names:
            fail('ARCHIVE_DUPLICATE', name)
        names.add(name)
        if not isinstance(item['bytes'], int) or isinstance(item['bytes'], bool) or not 0 <= item['bytes'] <= MAX_MEMBER:
            fail('ARCHIVE_MEMBER_LIMIT', name)
        if not isinstance(item['sha256'], str) or len(item['sha256']) != 64:
            fail('ARCHIVE_DESCRIPTOR', name)
        total += item['bytes']
        if total > MAX_EXPANDED:
            fail('ARCHIVE_EXPANDED_LIMIT', 'The full output exceeds 2 GiB')
    temporary = output.parent / ('.desk-zip-' + uuid.uuid4().hex + '.pending')
    inventory = []
    try:
        with open(temporary, 'xb') as writer:
            os.chmod(temporary, 0o600)
            with zipfile.ZipFile(writer, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
                for item in sorted(members, key=lambda x:x['path']):
                    info = zipfile.ZipInfo(item['path'], date_time=(1980,1,1,0,0,0))
                    info.external_attr = 0o100600 << 16
                    info.compress_type = zipfile.ZIP_DEFLATED
                    reader, before = checked_file(item['file'])
                    try:
                        if before.st_size != item['bytes']:
                            fail('SOURCE_CHANGED_DURING_READ', item['path'])
                        with archive.open(info, 'w', force_zip64=True) as out:
                            size, sha = stream(reader, out, item['bytes'])
                        unchanged(reader, before)
                        if sha != item['sha256']:
                            fail('SOURCE_CHANGED_DURING_READ', item['path'])
                    finally:
                        reader.close()
                    inventory.append({'file':item['path'], 'bytes':size, 'sha256':sha})
                manifest = dict(request['manifest'])
                manifest['members'] = inventory
                body = (json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(',',':')) + '\n').encode('utf-8')
                info = zipfile.ZipInfo('desk-package.json', date_time=(1980,1,1,0,0,0))
                info.external_attr = 0o100600 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, body)
            writer.flush()
            os.fsync(writer.fileno())
        size = temporary.stat().st_size
        if size > MAX_ARCHIVE:
            fail('ARCHIVE_LIMIT', 'The complete output exceeds 512 MiB')
        h = hashlib.sha256()
        with open(temporary, 'rb') as reader:
            for block in iter(lambda:reader.read(65536), b''):
                h.update(block)
        sha = h.hexdigest()
        try:
            os.link(temporary, output)
        except FileExistsError:
            reader, before = checked_file(output)
            try:
                existing = hashlib.sha256()
                for block in iter(lambda:reader.read(65536), b''):
                    existing.update(block)
                unchanged(reader, before)
                if before.st_size != size or existing.hexdigest() != sha:
                    fail('EXPORT_ALREADY_EXISTS', 'The existing complete export differs')
            finally:
                reader.close()
        fd = os.open(output.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
        return {'status':'complete', 'file':str(output), 'bytes':size, 'sha256':sha, 'members':len(inventory)+1}
    finally:
        temporary.unlink(missing_ok=True)

def main():
    # pathlib's parents=True uses the process umask for intermediate directories.
    # This isolated archive process creates only private operator files.
    os.umask(0o077)
    raw = sys.stdin.buffer.read(8 * 1024 * 1024 + 1)
    if len(raw) > 8 * 1024 * 1024:
        fail('ARCHIVE_REQUEST_LIMIT', 'Request exceeds 8 MiB')
    request = json.loads(raw.decode('utf-8'))
    if request.get('command') == 'unpack':
        result = unpack(request)
    elif request.get('command') == 'pack':
        result = pack(request)
    else:
        fail('ARCHIVE_COMMAND', 'Choose pack or unpack')
    print(json.dumps(result, ensure_ascii=False, separators=(',',':')))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        text = str(error)
        prefix = text.split(':',1)[0]
        code = prefix if prefix and all(c.isupper() or c == '_' for c in prefix) else 'ARCHIVE_TRANSPORT'
        print(json.dumps({'error':{'code':code,'message':text}}), file=sys.stderr)
        sys.exit(1)
