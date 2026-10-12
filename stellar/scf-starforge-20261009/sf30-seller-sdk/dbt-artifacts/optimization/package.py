#!/usr/bin/env python3
"""Build a create-only, dependency-free npm source package from this dbt project. MIT."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys


def build(destination: Path, npm: str = 'npm'):
    source = Path(__file__).resolve().parents[1]
    destination = destination.absolute()
    destination.mkdir(parents=True, exist_ok=False)
    package = destination / 'package'
    package.mkdir()
    # The package carries the complete authored dbt directory, not a new engine.
    # Private project stores, caches and generated archives are never source.
    allowed = {'.py', '.mjs', '.mts', '.js', '.css', '.html', '.md'}
    entries = []
    for file in sorted(source.rglob('*')):
        relative = file.relative_to(source)
        if any(part.startswith('.') or part in ('__pycache__', 'node_modules', 'objects', 'http', 'exports', 'received') for part in relative.parts):
            continue
        if file.is_symlink():
            raise ValueError(f'Source symlink is not supported: {relative}')
        if not file.is_file() or (file.suffix not in allowed and file.name != 'LICENSE'):
            continue
        data = file.read_bytes()
        target = package / 'dbt' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        target.chmod(0o755 if relative.as_posix() in ('cli.mjs', 'optimization/cli.mjs') else 0o644)
        entries.append({'path': 'dbt/'+relative.as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    required = ['dbt_core.py', 'dbt_store.py', 'dbt_http.py', 'dbt_portable.py', 'operations.py', 'cli.py', 'cli.mjs', 'client.mjs', 'optimization/engine.py', 'optimization/cli.py', 'optimization/cli.mjs', 'optimization/client.mjs', 'optimization/ui/index.html', 'optimization/ui/app.js', 'optimization/ui/style.css']
    for path in required:
        if not (package / 'dbt' / path).is_file():
            raise ValueError(f'Original source is missing: {path}')
    metadata = {'name': '@tokenjunkielabs/dbt-run-optimization', 'version': '0.1.0', 'description': 'Retained dbt run timing, saved improvement plans and complete editable project handover', 'type': 'module', 'license': 'MIT', 'engines': {'node': '>=22.16'}, 'bin': {'dbt-optimize': 'dbt/optimization/cli.mjs', 'dbt-project': 'dbt/cli.mjs'}, 'exports': {'.': {'types': './dbt/optimization/client.d.mts', 'import': './dbt/optimization/client.mjs'}, './mcp': './dbt/optimization/mcp.mjs', './project': './dbt/client.mjs'}, 'files': ['dbt', 'SOURCE.json', 'README.md', 'LICENSE']}
    (package/'package.json').write_text(json.dumps(metadata, indent=2)+'\n')
    (package/'SOURCE.json').write_text(json.dumps({'schema':'starforge.dbt-optimization-package-source.v1', 'files':entries}, indent=2)+'\n')
    shutil.copyfile(source/'optimization/README.md', package/'README.md')
    shutil.copyfile(source/'LICENSE', package/'LICENSE')
    process = subprocess.run([npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', str(destination)], cwd=package, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    result = json.loads(process.stdout)[0]
    archive = destination/result['filename']
    data = archive.read_bytes()
    output = {'path':str(archive),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'source_files':len(entries),'source_bytes':sum(item['bytes'] for item in entries)}
    (destination/'package-result.json').write_text(json.dumps(output,indent=2)+'\n')
    return output


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination',type=Path,required=True)
    parser.add_argument('--npm',default='npm')
    args=parser.parse_args()
    print(json.dumps(build(args.destination,args.npm)))

if __name__ == '__main__':
    main()
