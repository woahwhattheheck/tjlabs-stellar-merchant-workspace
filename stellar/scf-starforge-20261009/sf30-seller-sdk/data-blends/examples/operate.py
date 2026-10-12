"""Create and deliver a complete constructed order-allocation workspace.

Run with --orders 1000000 for an opt-in disk-backed capacity workload. No external
services are called. The destination must be new; originals and results remain.
"""
from __future__ import annotations
import argparse
import csv
import json
from pathlib import Path
import shutil
import sys
import time
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine import Workspace, digest

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--orders', type=int, default=12)
    args = parser.parse_args()
    if args.orders < 1:
        parser.error('--orders must be positive')
    root = args.directory.absolute()
    root.mkdir(mode=0o700, parents=False, exist_ok=False)
    inputs = root / 'inputs'; inputs.mkdir(mode=0o700)
    delivery = root / 'delivery'; delivery.mkdir(mode=0o700)
    customer_count = min(10000, max(4, args.orders // 10))
    regions = 32
    started = time.monotonic()
    with (inputs / 'orders.csv').open('w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f); writer.writerow(['order_id', 'customer_id', 'amount'])
        for i in range(args.orders):
            writer.writerow([str(9007199254740993 + i), f'{i % customer_count:06d}', f'{i % 1000}.{i % 100:02d}'])
    with (inputs / 'customers.csv').open('w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f); writer.writerow(['customer_id', 'name', 'region'])
        for i in range(customer_count):
            writer.writerow([f'{i:06d}', f'Example customer {i + 1}', f'{i % regions:02d}'])
            if i % 100 == 0:
                writer.writerow([f'{i:06d}', f'Example receiving team {i + 1}', f'{i % regions:02d}'])
    with (inputs / 'regions.csv').open('w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f); writer.writerow(['region', 'team'])
        writer.writerows([[f'{i:02d}', f'Regional team {i + 1}'] for i in range(regions)])
    workspace = Workspace.create(root / 'workspace', 'Example order allocation')
    sources = {}
    for name in ['orders', 'customers', 'regions']:
        path = inputs / (name + '.csv')
        sources[name] = workspace.import_csv(str(path), name.capitalize(), str(uuid.uuid4()), expected_sha256=digest(path), source_reference='Constructed order-allocation example')
    spec = {
        'name': 'Order allocation with customer and regional teams',
        'base': {'source': sources['orders']['id'], 'as': 'orders'},
        'joins': [
            {'source': sources['customers']['id'], 'as': 'customers', 'kind': 'left',
             'on': [{'leftAlias': 'orders', 'leftColumn': 'customer_id', 'rightColumn': 'customer_id'}],
             'cardinality': 'many-to-many', 'emptyKeys': 'unmatched'},
            {'source': sources['regions']['id'], 'as': 'regions', 'kind': 'left',
             'on': [{'leftAlias': 'customers', 'leftColumn': 'region', 'rightColumn': 'region'}],
             'cardinality': 'many-to-one', 'emptyKeys': 'unmatched'}],
        'columns': [
            {'source': 'orders', 'column': 'order_id', 'name': 'order_id'},
            {'source': 'orders', 'column': 'amount', 'name': 'amount'},
            {'source': 'customers', 'column': 'name', 'name': 'customer_name'},
            {'source': 'regions', 'column': 'team', 'name': 'regional_team'}]}
    recipe = workspace.save_recipe(spec, str(uuid.uuid4()))
    retained = time.monotonic()
    operation = str(uuid.uuid4())
    (root / 'run-operation.json').write_text(json.dumps({'request': operation, 'recipe': recipe['id'], 'version': recipe['version']}, indent=2))
    edition = workspace.run(recipe['id'], recipe['version'], operation)
    joined = time.monotonic()
    workspace.review(edition['id'], 'accepted', 'Constructed example: duplicate customer matches are intentionally retained.', 'Example operator', 0, str(uuid.uuid4()))
    customer = workspace.export(edition['id'], 'customer', str(uuid.uuid4()))
    shutil.copyfile(workspace.locate_export(customer['id']), delivery / 'order-allocation.zip')
    backup = workspace.backup(str(uuid.uuid4()))
    shutil.copyfile(workspace.locate_export(backup['id']), delivery / 'private-workspace.zip')
    receiving = Workspace.receive(delivery / 'private-workspace.zip', root / 'received-workspace', backup['sha256'])
    result = {'inputRows': sum(v['rows'] for v in sources.values()), 'resultRows': edition['rows'],
              'sourceSeconds': round(retained - started, 3), 'joinSeconds': round(joined - retained, 3),
              'totalSeconds': round(time.monotonic() - started, 3), 'customer': customer,
              'workspace': str(workspace.root), 'receivedWorkspace': str(receiving.root), 'edition': edition['id'],
              'customerFile': str(delivery / 'order-allocation.zip'), 'privateBackup': str(delivery / 'private-workspace.zip')}
    (root / 'example.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    main()
