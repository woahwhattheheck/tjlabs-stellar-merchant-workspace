"""Package a complete retained Zotero/Research edition with its original selected SDK."""
from pathlib import Path, PurePosixPath
import argparse
import gzip
import hashlib
import json
import lzma
import os
import shutil
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parent
REPORTS = (
    'OSF_Evidence_Map.html', 'OSF_Collection_Inventory.csv',
    'OSF_Collection_Inventory.json', 'OSF_Research_Dossier.html',
    'OSF_Research_Dossier.md',
)


def digest(path):
    value = hashlib.sha256()
    count = 0
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
            count += len(block)
    return count, value.hexdigest()


def require_bytes(path, expected):
    if not path.is_file() or path.is_symlink():
        raise ValueError(f'Expected an original regular file: {path}')
    if digest(path) != (expected['bytes'], expected['sha256']):
        raise ValueError(f'Original bytes changed: {path}')


def compressed_digest(path, expected):
    opener = lzma.open if path.suffix == '.xz' else gzip.open
    value = hashlib.sha256()
    count = 0
    with opener(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            count += len(block)
            if count > expected['bytes']:
                raise ValueError('Compressed packet exceeded its original exact length')
            value.update(block)
    if (count, value.hexdigest()) != (expected['bytes'], expected['sha256']):
        raise ValueError('Compressed packet differs from the complete original edition')


def inspect_sdk(path, expected):
    require_bytes(path, expected)
    with tarfile.open(path, 'r:gz') as archive:
        for member in archive.getmembers():
            parts = PurePosixPath(member.name).parts
            if not parts or parts[0] != 'package' or '..' in parts or not (member.isfile() or member.isdir()):
                raise ValueError('Unexpected original SDK archive member')
        stream = archive.extractfile('package/manifest.json')
        if stream is None:
            raise ValueError('Original SDK manifest is absent')
        manifest = json.load(stream)
        if (manifest['sourceCommit'], manifest['sourceSelection']['id'], len(manifest['files'])) != (
            expected['sourceCommit'], expected['selection'], expected['files']
        ):
            raise ValueError('Selected SDK source identity changed')


def copy_text_directory(source, destination):
    paths = sorted(source.rglob('*'))
    if not any(path.is_file() for path in paths):
        raise ValueError('Completed operation outcomes are absent')
    for path in paths:
        if path.is_symlink():
            raise ValueError(f'Operation outcomes contain a symbolic link: {path}')
        if not path.is_file():
            continue
        if path.suffix.lower() not in {'.json', '.csv', '.md', '.txt', '.html'}:
            raise ValueError(f'Expected a text operation outcome: {path}')
        target = destination / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--edition', type=Path, required=True, help='Retained HANDOVER.json')
    parser.add_argument('--sdk', type=Path, required=True, help='Exact selected SDK tarball')
    parser.add_argument('--workspace', type=Path, required=True, help='Complete original native export')
    parser.add_argument('--reports', type=Path, required=True, help='Complete customer report directory')
    parser.add_argument('--operation', type=Path, required=True, help='Completed text operation outcomes')
    parser.add_argument('--compressed', type=Path, help='Reuse an existing lossless .xz or .gz packet')
    parser.add_argument('--guide', type=Path, default=ROOT / 'START_HERE.md')
    parser.add_argument('--directory', type=Path, required=True, help='New complete handover directory')
    parser.add_argument('--archive', type=Path, required=True, help='New final ZIP path')
    args = parser.parse_args()
    edition = json.loads(args.edition.read_text())
    if edition['schema'] != 'tjlabs.osf-zotero-research-customer.v1':
        parser.error('Unsupported original customer edition')
    if args.directory.exists() or args.archive.exists():
        parser.error('Use new output paths; retained deliveries are not overwritten')
    inspect_sdk(args.sdk, edition['sdk'])
    require_bytes(args.workspace, edition['workspace'])
    for name in REPORTS:
        path = args.reports / name
        if not path.is_file() or path.is_symlink():
            parser.error(f'Complete original report is absent: {name}')
    if args.compressed:
        if args.compressed.suffix not in {'.xz', '.gz'} or args.compressed.is_symlink():
            parser.error('Expected an original lossless XZ or gzip packet')
        compressed_digest(args.compressed, edition['workspace'])
    args.directory.mkdir(parents=True, mode=0o700)
    shutil.copyfile(args.sdk, args.directory / 'Original_Zotero_Research_SDK.tgz')
    edition['sdk']['file'] = 'Original_Zotero_Research_SDK.tgz'
    extension = args.compressed.suffix if args.compressed else '.xz'
    compressed = args.directory / ('Complete_Original_Workspace.json' + extension)
    if args.compressed:
        shutil.copyfile(args.compressed, compressed)
    else:
        filters = [{'id': lzma.FILTER_LZMA2, 'dict_size': 128 * 1024 * 1024,
                    'mode': lzma.MODE_NORMAL, 'nice_len': 128, 'mf': lzma.MF_BT4, 'depth': 64}]
        with args.workspace.open('rb') as source, lzma.open(compressed, 'wb', filters=filters, check=lzma.CHECK_CRC64) as target:
            shutil.copyfileobj(source, target, 1024 * 1024)
        compressed_digest(compressed, edition['workspace'])
    count, sha = digest(compressed)
    edition['workspace'].update(file=compressed.name, compressedBytes=count, compressedSha256=sha)
    (args.directory / 'HANDOVER.json').write_text(json.dumps(edition, indent=2) + '\n')
    shutil.copyfile(ROOT / 'START_HERE.py', args.directory / 'START_HERE.py')
    shutil.copyfile(ROOT / 'build-handover.py', args.directory / 'build-handover.py')
    shutil.copyfile(ROOT / 'HANDOVER.md', args.directory / 'HANDOVER.md')
    guide = args.guide.read_text().replace('Complete_Original_Workspace.json.gz', compressed.name).replace('Complete_Original_Workspace.json.xz', compressed.name)
    (args.directory / 'START_HERE.md').write_text(guide)
    (args.directory / 'reports').mkdir()
    for name in REPORTS:
        shutil.copyfile(args.reports / name, args.directory / 'reports' / name)
    copy_text_directory(args.operation, args.directory / 'operation')
    files = []
    for path in sorted(args.directory.rglob('*')):
        if path.is_file():
            count, sha = digest(path)
            files.append({'path': path.relative_to(args.directory).as_posix(), 'bytes': count, 'sha256': sha})
    (args.directory / 'FILES.json').write_text(json.dumps(files, indent=2) + '\n')
    args.archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.archive, 'w') as archive:
        for path in sorted(args.directory.rglob('*')):
            if not path.is_file():
                continue
            info = zipfile.ZipInfo(path.relative_to(args.directory).as_posix(), (2026, 10, 13, 0, 0, 0))
            info.external_attr = 0o600 << 16
            info.compress_type = zipfile.ZIP_STORED if path.suffix in {'.xz', '.gz', '.tgz'} else zipfile.ZIP_DEFLATED
            with path.open('rb') as source, archive.open(info, 'w', force_zip64=True) as output:
                shutil.copyfileobj(source, output, 1024 * 1024)
    count, sha = digest(args.archive)
    print(json.dumps({'status': 'COMPLETE', 'archive': str(args.archive.resolve()), 'bytes': count,
                      'sha256': sha, 'members': len(files) + 1, 'sourceCommit': edition['sdk']['sourceCommit'],
                      'workspaceSHA256': edition['workspace']['sha256']}))


if __name__ == '__main__':
    main()
