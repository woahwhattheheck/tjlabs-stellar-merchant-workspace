"""Build the full retained AirGradient customer handover from its completed original operation."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import sqlite3
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parent


def identity(path):
    digest, size = hashlib.sha256(), 0
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            size += len(block)
            digest.update(block)
    return {'bytes': size, 'sha256': digest.hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--operation', required=True, type=Path)
    parser.add_argument('--sdk', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    original = json.loads((args.operation / 'operation-result.json').read_text())
    complete = json.loads((args.operation / 'complete-customer-result.json').read_text())
    if complete['operationId'] != original['operationId'] or complete['measurements']['rowsPerPeriod'] != 60:
        raise ValueError('Use the completed original sixty-measurement customer operation')
    if complete['packetSha256'] != original['source']['packetSha256']:
        raise ValueError('The original source identity changed')
    with tarfile.open(args.sdk, 'r:gz') as sdk:
        members = {member.name: member for member in sdk.getmembers()}
        if any(not (member.isfile() or member.isdir()) or '..' in Path(member.name).parts or
               not (member.name == 'package' or member.name.startswith('package/')) for member in members.values()):
            raise ValueError('Use the complete regular source-selected SDK')
        manifest = json.load(sdk.extractfile('package/manifest.json'))
        if manifest.get('sourceSelection', {}).get('id') != 'airgradient-customer':
            raise ValueError('Use the maintained AirGradient source selection')
        expected = {'package/manifest.json'}
        for record in manifest['files']:
            name = 'package/' + record['packagePath']
            body = sdk.extractfile(name).read()
            if len(body) != record['bytes'] or hashlib.sha256(body).hexdigest() != record['sha256']:
                raise ValueError('An original selected source changed: ' + record['path'])
            expected.add(name)
        for path, digest in manifest['packageFiles'].items():
            name = 'package/' + path
            if hashlib.sha256(sdk.extractfile(name).read()).hexdigest() != digest:
                raise ValueError('An included package body changed: ' + path)
            expected.add(name)
        if expected != {name for name, member in members.items() if member.isfile()}:
            raise ValueError('The full SDK file inventory changed')
    if args.output.exists():
        raise ValueError('Choose a new complete customer handover directory')
    args.output.mkdir(parents=True, mode=0o700)
    output = args.output
    source_record = identity(args.operation / 'original-source.json')
    if source_record != {'bytes': original['source']['packetBytes'], 'sha256': original['source']['packetSha256']}:
        raise ValueError('The complete original source packet changed')
    # The completed native owner is closed before this portable snapshot is built.
    stores = []
    for name in ('producer', 'receiver'):
        directory = args.operation / name
        if any(path.name.endswith(('-wal', '-journal')) for path in directory.iterdir()):
            raise ValueError('Close the original native customer owner before making its handover')
        database = directory / 'airgradient.sqlite'
        connection = sqlite3.connect('file:' + str(database.resolve()) + '?mode=ro&immutable=1', uri=True)
        try:
            if connection.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                raise ValueError('The completed native customer store must reopen intact')
            stores.append({'name': name, **identity(database), 'objects': connection.execute('SELECT count(*) FROM objects').fetchone()[0],
                           'captures': connection.execute('SELECT count(*) FROM captures').fetchone()[0]})
        finally:
            connection.close()
    for path in args.operation.rglob('*'):
        if path.is_symlink():
            raise ValueError('Use the unchanged regular native customer files')
        if not path.is_file() or path.name == 'lease.lock' or path.name.startswith('connection-'):
            continue
        if path.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        target = output / 'operation' / path.relative_to(args.operation)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    sdk_name = args.sdk.name
    shutil.copyfile(args.sdk, output / sdk_name)
    sdk_record = {'file': sdk_name, **identity(args.sdk), 'sourceCommit': manifest['sourceCommit'],
                  'sourceSelection': 'airgradient-customer', 'sourceFiles': len(manifest['files'])}
    reports = []
    for selection in (complete['original'], complete['indoor']):
        for window in ('first', 'later'):
            selected = selection[window]
            reports.append({'id': selected['reportId'], 'sha256': selected['reportSha256'], 'window': window,
                            'rows': len(selected['rows']), 'seriesRows': selected['seriesRows']})
    packets = []
    for selection, name in ((complete['original'], 'continued.airgradient.json'), (complete['indoor'], 'indoor-continued.airgradient.json')):
        selected = selection['continued']
        packet = output / 'operation' / name
        if identity(packet) != {key: selected[key] for key in ('bytes', 'sha256')}:
            raise ValueError('A complete editable customer package changed')
        packets.append({'file': 'operation/' + name, **identity(packet), 'packageId': selected['packageId'],
                        'reportId': selection['later']['reportId'], 'reportSha256': selection['later']['reportSha256']})
    edition = {'schema': 'stellar-forge.airgradient-customer-edition.v1', 'operationId': complete['operationId'],
               'sourceOperationId': complete['sourceOperationId'], 'originalSource': {'file': 'operation/original-source.json', **source_record},
               'sourceSdk': sdk_record, 'packets': packets, 'reports': reports, 'measurements': complete['measurements'], 'nativeStores': stores}
    (output / 'CUSTOMER_EDITION.json').write_text(json.dumps(edition, indent=2) + '\n')
    shutil.copyfile(ROOT / 'customer-start.py', output / 'customer-start.py')
    guide = ROOT.parent / 'CUSTOMER_RECEIVING.md'
    shutil.copyfile(guide, output / 'CUSTOMER_RECEIVING.md')
    (output / 'START_HERE.md').write_text('# AirGradient customer installation\n\n'
        'Open the complete retained customer operator with Python 3.12+ and Node 22.16+ (node:sqlite):\n\n'
        '```sh\npython3 customer-start.py --directory /absolute/private/airgradient-customer --serve\n```\n\n'
        'Use `--node /absolute/path/to/node` when Node is outside PATH. Keep the same receiving directory for later work. '
        'The opening verifies the full source SDK and both complete editable packages, receives all four original reports, '
        'retains the complete forty-one-file source collection and opens the original private customer URL. '
        'Allow 1 GiB of free memory; the launcher uses a 384 MiB Node heap.\n\n'
        'The two thirty-day periods contain all sixty retained indoor/outdoor measurements. '
        'Open CUSTOMER_RECEIVING.md for the original source, report meaning, editable continuation and installed Applications workflow. '
        'The operation directory contains every complete report delivery/ZIP, both native closed workspaces and their full results. '
        'CUSTOMER_EDITION.json and FILES.json give exact source, report and file identities.\n')
    records = [{'path': path.relative_to(output).as_posix(), **identity(path)} for path in sorted(output.rglob('*')) if path.is_file()]
    (output / 'FILES.json').write_text(json.dumps({'schema': 'stellar-forge.airgradient-customer-files.v1', 'files': records}, indent=2) + '\n')
    archive = output.with_suffix('.zip')
    with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zipped:
        for path in sorted(output.rglob('*')):
            if path.is_file():
                zipped.write(path, path.relative_to(output).as_posix())
    with zipfile.ZipFile(archive) as zipped:
        if zipped.testzip() is not None:
            raise ValueError('Complete customer archive failed its original CRC reads')
        members = len(zipped.infolist())
    result = {'schema': 'stellar-forge.airgradient-customer-build.v1', 'archive': str(archive), **identity(archive),
              'members': members, 'sourceCommit': manifest['sourceCommit'], 'sourceFiles': len(manifest['files']), 'operationId': complete['operationId']}
    output.with_suffix('.build.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
