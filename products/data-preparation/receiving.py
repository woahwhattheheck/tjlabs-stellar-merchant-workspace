#!/usr/bin/env python3
"""MIT. Operate the retained PREP12 project through the complete managed product."""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import zipfile

PACKAGE_SHA = '38b52c9837c81177d691127e07587894de7ae52bd6ef74013b02a18578814577'
PROJECT_SHA = '8fbdb47b26da8c5742f573a28dd603635a661e99122807a41c04276871d03779'
PACKAGE_ROOT = 'Starforge_Data_Preparation_2026-10-12/'
PRODUCT = Path('stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation')
ARCHIVE_SCHEMA = 'stellar-forge.data-preparation.v1.archive'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def write(path, data):
    with path.open('xb') as stream:
        os.chmod(path, 0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())

def private_parent(path):
    if not path.is_absolute() or path.resolve() != path:
        raise ValueError('Use a canonical absolute directory')
    info = path.stat()
    if not path.is_dir() or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ValueError('Use an owned private parent directory with mode 0700')

def verify_project(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(set(names)) != len(names):
            raise ValueError('Duplicate original project member')
        manifest = json.loads(archive.read('manifest.json'))
        if manifest.get('schema') != ARCHIVE_SCHEMA or set(names) != {'manifest.json', *manifest['members']}:
            raise ValueError('The complete original project member map changed')
        for name, expected in manifest['members'].items():
            data = archive.read(name)
            if len(data) != expected['bytes'] or digest(data) != expected['sha256']:
                raise ValueError('Original project member changed: '+name)
        return manifest

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', required=True, type=Path)
    parser.add_argument('--source-commit', required=True, help='Full immutable maintained source commit')
    parser.add_argument('--package', required=True, type=Path,
        help='Unchanged Starforge_Data_Preparation_2026-10-12.zip from the original PREP12 case')
    parser.add_argument('--directory', required=True, type=Path, help='New private receiving directory')
    parser.add_argument('--node', default='node')
    parser.add_argument('--playwright-module', required=True)
    parser.add_argument('--chromium', required=True)
    parser.add_argument('--save-helper', type=Path,
        help='Optional current library_upload.py; saves both complete outputs in one ordered batch')
    args = parser.parse_args()
    source = args.source_root.resolve()
    package = args.package.resolve()
    directory = args.directory
    private_parent(directory.parent)
    package_bytes = package.read_bytes()
    if len(package_bytes) != 1143288 or digest(package_bytes) != PACKAGE_SHA:
        raise ValueError('Use the exact retained original PREP12 package')
    with zipfile.ZipFile(io.BytesIO(package_bytes)) as outer:
        project_bytes = outer.read(PACKAGE_ROOT+'demonstration/project.zip')
    if len(project_bytes) != 671360 or digest(project_bytes) != PROJECT_SHA:
        raise ValueError('The retained original project bytes changed')
    directory.mkdir(mode=0o700)
    for child in ['inputs', 'downloads']:
        (directory/child).mkdir(mode=0o700)
    project_path = directory/'original-project.zip'
    write(project_path, project_bytes)
    original = verify_project(project_path)
    if sum(item['rows'] for item in original['workspace']['sources']) != 120012:
        raise ValueError('The original input project is incomplete')
    with zipfile.ZipFile(project_path) as project:
        orders = next(item for item in original['workspace']['sources'] if item['alias'] == 'orders')
        write(directory/'inputs/orders.csv', project.read('originals/'+orders['sha256']))
    write(directory/'original-manifest.json', json.dumps(original, ensure_ascii=False).encode())
    options = {
        'packageSha256': PACKAGE_SHA, 'projectSha256': PROJECT_SHA, 'sourceCommit': args.source_commit,
        'playwrightModule': args.playwright_module, 'chromiumExecutable': args.chromium,
    }
    write(directory/'receiving-options.json', json.dumps(options).encode())
    environment = dict(os.environ)
    environment['STARFORGE_PYTHON'] = sys.executable
    environment['TMPDIR'] = str(directory)
    driver = Path(__file__).with_suffix('.mjs')
    result = subprocess.run([
        args.node, str(driver), str(source), str(directory), str(directory/'receiving-options.json')
    ], env=environment, timeout=240)
    if result.returncode:
        raise RuntimeError('The original managed customer journey failed; its directory is retained')
    result_path = directory/'receiving-result.json'
    received = json.loads(result_path.read_text())
    for name in ['browser-project.zip', 'project.zip', 'sdk-project.zip', 'customer-edited-project.zip']:
        manifest = verify_project(directory/'downloads'/name)
        expected_runs = 4 if name == 'customer-edited-project.zip' else 3
        if len(manifest['workspace']['runs']) != expected_runs:
            raise ValueError('The complete customer project omitted a retained result')
    for target in ['operator', 'customer']:
        for name, expected in original['members'].items():
            data = (directory/target/name).read_bytes()
            if len(data) != expected['bytes'] or digest(data) != expected['sha256']:
                raise ValueError('The original file history changed in '+target+': '+name)
    merchant = directory/'merchant-dataset'
    merchant.mkdir(mode=0o700)
    with zipfile.ZipFile(directory/'downloads/merchant.zip') as archive:
        if set(archive.namelist()) != {'dataset.csv', 'dataset.json', 'mapping.json', 'README.md'}:
            raise ValueError('Keep the complete original merchant dataset together')
        for name in archive.namelist():
            write(merchant/name, archive.read(name))
    inspected = subprocess.run([
        args.node, str(source/PRODUCT.parent/'dataset-cli.mjs'),
        '--dataset', str(merchant/'dataset.json')
    ], env=environment, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, check=True)
    description = json.loads(inspected.stdout)
    if description['rowCount'] != 6:
        raise ValueError('Original merchant loading did not receive the whole prepared result')
    received['sourceCommit'] = args.source_commit
    received['sourceRepository'] = 'woahwhattheheck/tjlabs-stellar-merchant-workspace'
    received['merchantDataset'] = description
    received['verifiedOriginalFiles'] = len(original['members'])
    received['verifiedCompleteProjectArchives'] = 4
    result_path.write_text(json.dumps(received, indent=2, ensure_ascii=False)+'\n')
    result_path.chmod(0o600)
    title = 'Starforge_Data_Preparation_Managed_2026-10-12'
    report = directory/(title+'_Receiving.json')
    write(report, result_path.read_bytes())
    guide = (
        '# Data preparation: managed customer delivery\n\n'
        'This delivery continues the unchanged original PREP12 demonstration project through its managed product. '
        'The demonstration retains 120,012 authored input rows, original source IDs, both original recipe/result '
        'editions and the original review. The new managed result and independently edited customer result are '
        'included as complete editable project archives.\n\n'
        '## Open the delivered customer project\n\n'
        'Use the installed data-preparation-workspace product. Python 3.11+ and Node 22.16+ on a POSIX host '
        'are required. Set PREPARATION_SOURCE_ROOT to the READY installation source root. From this extracted directory:\n\n'
        '    python3 "$PREPARATION_SOURCE_ROOT/stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation/cli.py" '
        '--workspace /ABSOLUTE/PRIVATE/new-customer receive downloads/customer-edited-project.zip\n'
        '    node "$PREPARATION_SOURCE_ROOT/stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation/managed.mjs" '
        '--workspace /ABSOLUTE/PRIVATE/new-customer --port 0\n\n'
        'Open the private link printed by the actual listener. The original Inputs, Recipes, Results and Handover '
        'sections share the same saved native state with the typed client and merchant adapters.\n\n'
        '## Complete contents\n\n'
        '- downloads/: complete browser project, managed project, independently edited customer project, '
        'merchant dataset ZIP, selected result and readable report.\n'
        '- merchant-dataset/: complete dataset.csv, dataset.json, mapping.json and README for the original SF30 loader.\n'
        '- original-project.zip: exact retained PREP12 project before this continuation.\n'
        '- receiving-result.json: actual native operating result, original IDs, full file hashes and desktop/phone outcomes.\n\n'
        '## Maintained operating source\n\n'
        'The complete product source, installation selection, 21 typed tools and operating guide are maintained at:\n\n'
        'https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/'+args.source_commit+
        '/products/data-preparation\n\n'
        'Use selection data-preparation-workspace to install the complete cumulative merchant runtime. '
        'This customer data delivery remains independently editable with that original runtime.\n'
    )
    write(directory/'START_HERE.md', guide.encode())
    output = directory/(title+'.zip')
    with zipfile.ZipFile(output, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name in ['START_HERE.md', 'receiving-result.json', 'original-project.zip']:
            archive.write(directory/name, name)
        for folder in ['downloads', 'merchant-dataset']:
            for path in sorted((directory/folder).rglob('*')):
                if path.is_file():
                    archive.write(path, path.relative_to(directory))
    output.chmod(0o600)
    final = {
        'schema': 'stellar-forge.data-preparation-managed-delivery.v1',
        'directory': str(directory), 'report': str(report), 'archive': str(output),
        'archiveBytes': output.stat().st_size, 'archiveSha256': digest(output.read_bytes()),
        'originalInputRows': 120012, 'managedCounts': received['managedCounts'],
        'customerCounts': received['customerCounts'], 'merchantRows': description['rowCount'],
    }
    print(json.dumps({'stage': 'COMPLETE_MANAGED_CUSTOMER_DELIVERY', **final}), flush=True)
    if args.save_helper:
        upload = {'uploads': [
            {'local_path': str(report), 'purpose': 'create_library_file', 'library_artifact_type': 'other'},
            {'local_path': str(output), 'purpose': 'create_library_file', 'library_artifact_type': 'other'},
        ]}
        saved = subprocess.run([sys.executable, str(args.save_helper)], input=json.dumps(upload),
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
        print(saved.stdout, end='', flush=True)
        if saved.returncode:
            sys.stderr.write(saved.stderr)
            raise RuntimeError('Complete customer files are retained; their save did not finish')
    return final

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error), 'type': type(error).__name__}), file=sys.stderr)
        raise
