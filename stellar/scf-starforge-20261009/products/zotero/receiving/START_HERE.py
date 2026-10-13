"""Receive the complete original OSF/Zotero/Research handover with its pinned SDK."""
from pathlib import Path, PurePosixPath
import argparse, gzip, hashlib, json, lzma, os, signal, subprocess, tarfile

ROOT = Path(__file__).resolve().parent
PREFIX = Path('stellar/scf-starforge-20261009')

def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True, help='Absolute private receiving directory')
    parser.add_argument('--node', default='node', help='Node.js 22.16 or later executable')
    parser.add_argument('--serve', action='store_true', help='Open the received original Research and Zotero operator')
    args = parser.parse_args()
    directory = Path(args.directory)
    if not directory.is_absolute() or directory.resolve() != directory:
        parser.error('--directory must be an absolute normalized path')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    edition = json.loads((ROOT / 'HANDOVER.json').read_text())
    archive = ROOT / edition['sdk']['file']
    if archive.stat().st_size != edition['sdk']['bytes'] or sha256(archive) != edition['sdk']['sha256']:
        raise RuntimeError('The complete selected SDK archive changed')
    software = directory / ('software-' + edition['sdk']['sourceCommit'][:12])
    receipt = software / 'original-sdk.json'
    if not receipt.exists():
        software.mkdir(mode=0o700, exist_ok=True)
        with tarfile.open(archive, 'r:gz') as source:
            for member in source.getmembers():
                parts = PurePosixPath(member.name).parts
                if not parts or parts[0] != 'package' or any(part in ('', '.', '..') for part in parts) or not (member.isfile() or member.isdir()):
                    raise RuntimeError('Unexpected SDK archive member')
            source.extractall(software, filter='data')
        receipt.write_text(json.dumps(edition['sdk'], indent=2) + '\n')
        os.chmod(receipt, 0o600)
    elif json.loads(receipt.read_text()) != edition['sdk']:
        raise RuntimeError('This software directory belongs to another SDK edition')
    package = software / 'package'
    manifest = json.loads((package / 'manifest.json').read_text())
    if manifest['sourceCommit'] != edition['sdk']['sourceCommit'] or manifest['sourceSelection']['id'] != 'zotero-research':
        raise RuntimeError('Original selected SDK identity changed')
    packet = directory / 'original-complete-workspace.json'
    expected = edition['workspace']
    if not packet.exists():
        compressed_path = ROOT / expected['file']
        if compressed_path.stat().st_size != expected['compressedBytes'] or sha256(compressed_path) != expected['compressedSha256']:
            raise RuntimeError('The retained compressed workspace bytes changed')
        temporary = directory / 'original-complete-workspace.pending'
        digest, count = hashlib.sha256(), 0
        opener = lzma.open if expected['file'].endswith('.xz') else gzip.open
        with opener(compressed_path, 'rb') as compressed, temporary.open('wb') as output:
            os.chmod(temporary, 0o600)
            for block in iter(lambda: compressed.read(1024 * 1024), b''):
                count += len(block)
                if count > expected['bytes']:
                    raise RuntimeError('The original workspace exceeded its exact retained length')
                digest.update(block)
                output.write(block)
            output.flush()
            os.fsync(output.fileno())
        if count != expected['bytes'] or digest.hexdigest() != expected['sha256']:
            raise RuntimeError('The original full workspace bytes changed')
        temporary.replace(packet)
    elif packet.stat().st_size != expected['bytes'] or sha256(packet) != expected['sha256']:
        raise RuntimeError('The saved packet belongs to a different workspace edition')
    zotero = package / 'source' / PREFIX / 'sf30-seller-sdk/zotero/cli.mjs'
    workspace = directory / 'workspace'
    subprocess.run([args.node, '--max-old-space-size=4096', str(zotero), 'receive', '--state', str(workspace),
                    '--file', str(packet), '--request-id', edition['receivingRequestId']], check=True)
    if args.serve:
        server = package / 'source' / PREFIX / 'sf88-operator-buyer-cli/research-dossiers/server.mjs'
        child = subprocess.Popen([args.node, '--max-old-space-size=4096', str(server), '--dir', str(workspace / 'research'),
                                  '--zotero-state', str(workspace), '--port', '0', '--connection-file', str(directory / 'operator-connection.json')])
        def forward(signum, frame):
            if child.poll() is None:
                child.send_signal(signum)
        signal.signal(signal.SIGTERM, forward)
        signal.signal(signal.SIGINT, forward)
        status = child.wait()
        if status != 0:
            raise subprocess.CalledProcessError(status, child.args)
    else:
        print(json.dumps({'status': 'READY', 'workspace': str(workspace), 'sourceCommit': edition['sdk']['sourceCommit'],
                          'dossierId': expected['dossierId'], 'dossierRevision': expected['dossierRevision']}))

if __name__ == '__main__':
    main()
