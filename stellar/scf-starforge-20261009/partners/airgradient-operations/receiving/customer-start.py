"""Receive the complete retained AirGradient customer installation and open its original operator."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import signal
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent
PRODUCT = Path('stellar/scf-starforge-20261009/partners/airgradient-operations')


def identity(path):
    digest, size = hashlib.sha256(), 0
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            size += len(block)
            digest.update(block)
    return size, digest.hexdigest()


def check(path, record):
    if path.is_symlink() or not path.is_file() or identity(path) != (record['bytes'], record['sha256']):
        raise ValueError('Keep the complete included customer file unchanged: ' + str(path.name))


def unpack(edition, directory):
    record = edition['sourceSdk']
    archive = ROOT / record['file']
    check(archive, record)
    target = directory / ('software-' + record['sourceCommit'][:12])
    stage = None
    try:
        if not target.exists():
            stage = Path(tempfile.mkdtemp(prefix='software-preparing-', dir=directory))
            with tarfile.open(archive, 'r:gz') as source:
                members = source.getmembers()
                if any(not (member.isfile() or member.isdir()) or
                       not (member.name == 'package' or member.name.startswith('package/')) or
                       '..' in Path(member.name).parts for member in members):
                    raise ValueError('Use the complete regular source SDK archive')
                source.extractall(stage, filter='data')
        selected = stage or target
        manifest = json.loads((selected / 'package/manifest.json').read_text())
        if manifest['sourceCommit'] != record['sourceCommit'] or manifest.get('sourceSelection', {}).get('id') != 'airgradient-customer':
            raise ValueError('The selected AirGradient source edition changed')
        if len(manifest['files']) != record['sourceFiles']:
            raise ValueError('The complete included source inventory changed')
        for item in manifest['files']:
            check(selected / 'package' / item['packagePath'], item)
        for path, digest in manifest['packageFiles'].items():
            body = selected / 'package' / path
            if body.is_symlink() or identity(body)[1] != digest:
                raise ValueError('The included package metadata changed: ' + path)
        if stage:
            stage.rename(target)
            stage = None
        return target / 'package/source'
    finally:
        if stage:
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True, type=Path, help='Canonical absolute private customer directory')
    parser.add_argument('--node', default='node', help='Node.js executable with node:sqlite')
    parser.add_argument('--serve', action='store_true', help='Open the original populated customer operator')
    args = parser.parse_args()
    if not args.directory.is_absolute() or args.directory.resolve() != args.directory:
        parser.error('Choose a canonical absolute customer directory')
    edition = json.loads((ROOT / 'CUSTOMER_EDITION.json').read_text())
    for record in edition['packets']:
        check(ROOT / record['file'], record)
    args.directory.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(args.directory, 0o700)
    # A downloaded ZIP uses public file modes; the original CLI requires private inputs.
    private_input = args.directory / 'receiving-inputs'
    private_input.mkdir(mode=0o700, exist_ok=True)
    os.chmod(private_input, 0o700)
    selected_source = unpack(edition, args.directory)
    cli = selected_source / PRODUCT / 'cli.mjs'
    workspace = args.directory / 'workspace'
    command = [args.node, '--max-old-space-size=384', '--max-semi-space-size=8', str(cli)]

    def run(arguments):
        process = subprocess.run(command + arguments, capture_output=True, text=True)
        if process.returncode:
            raise RuntimeError(process.stderr.strip() or 'Original AirGradient command failed')
        return json.loads(process.stdout)

    initial = run(['init', '--workspace', str(workspace)])
    receipts = []
    for record in edition['packets']:
        path = private_input / Path(record['file']).name
        if path.exists():
            check(path, record)
        else:
            shutil.copyfile(ROOT / record['file'], path)
        os.chmod(path, 0o600)
        receipt = run(['receive', '--workspace', str(workspace), '--input', str(path)])
        if receipt['reportId'] != record['reportId'] or receipt['reportSha256'] != record['reportSha256']:
            raise ValueError('The original received report changed')
        receipts.append(receipt)
    if initial['currentProject'] is None:
        run(['project-select', '--workspace', str(workspace), '--project', receipts[-1]['projectId']])
    state = run(['status', '--workspace', str(workspace)])
    reports = {record['id']: record['sha256'] for record in state['reports']}
    for record in edition['reports']:
        if reports.get(record['id']) != record['sha256']:
            raise ValueError('The complete frozen customer history changed')
    original_sources = [record for record in state['sourceSets']
                        if record['packetSha256'] == edition['originalSource']['sha256']]
    if len(original_sources) != 1:
        raise ValueError('The original complete source collection changed')
    print(json.dumps({'status': 'READY', 'workspaceId': state['workspaceId'], 'directory': str(workspace),
                      'reports': len(state['reports']), 'sourceFiles': original_sources[0]['files'],
                      'receiving': [record['id'] for record in receipts]}, separators=(',', ':')), flush=True)
    if not args.serve:
        return
    child = subprocess.Popen(command + ['serve', '--workspace', str(workspace), '--port', '0'])

    def forward(signum, frame):
        if child.poll() is None:
            child.send_signal(signum)

    signal.signal(signal.SIGTERM, forward)
    signal.signal(signal.SIGINT, forward)
    code = child.wait()
    if code:
        raise subprocess.CalledProcessError(code, child.args)


if __name__ == '__main__':
    main()
