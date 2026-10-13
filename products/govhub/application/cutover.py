#!/usr/bin/env python3
"""Read-only evidence reconciliation for multi-site web-hosting handovers.

Requires exported observations from the real incumbent and candidate platforms.
Does not crawl, change infrastructure, or assert regulatory compliance.
"""
import argparse
import csv
import hashlib
import html
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

FIELDS = ('agency_id', 'canonical_url', 'export_sha256', 'backup_sha256', 'route_count', 'observed_http_status')
COMPARE = ('canonical_url', 'export_sha256', 'backup_sha256', 'route_count')
SHA256 = re.compile(r'^[0-9a-fA-F]{64}$')


def sha_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as fd:
        for block in iter(lambda: fd.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def read_manifest(path):
    seen = {}
    with Path(path).open('r', encoding='utf-8-sig', newline='') as fd:
        reader = csv.DictReader(fd)
        if not reader.fieldnames or any(f not in reader.fieldnames for f in FIELDS):
            raise ValueError(f'{path}: CSV must contain {", ".join(FIELDS)}')
        for row_num, row in enumerate(reader, start=2):
            if any(row.get(f) is None for f in FIELDS):
                raise ValueError(f'{path}:{row_num}: incomplete row')
            row = {f: row[f].strip() for f in FIELDS}
            key = row['agency_id']
            if not key or key in seen or any(ch in key for ch in '\r\n\x00'):
                raise ValueError(f'{path}:{row_num}: blank, duplicate or invalid agency_id {key!r}')
            parsed = urlsplit(row['canonical_url'])
            if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError(f'{path}:{row_num}: canonical_url requires public https host')
            for digest_field in ('export_sha256', 'backup_sha256'):
                if not SHA256.fullmatch(row[digest_field]):
                    raise ValueError(f'{path}:{row_num}: invalid {digest_field}')
                row[digest_field] = row[digest_field].lower()
            try:
                routes = int(row['route_count'])
                status = int(row['observed_http_status'])
            except ValueError as e:
                raise ValueError(f'{path}:{row_num}: route_count and observed_http_status must be integers') from e
            if routes < 0 or not 100 <= status <= 599:
                raise ValueError(f'{path}:{row_num}: invalid route count or HTTP status')
            row['route_count'] = routes
            row['observed_http_status'] = status
            seen[key] = row
    if not seen:
        raise ValueError(f'{path}: no observation rows')
    return seen


def read_approvals(path):
    if not path:
        return {}
    items = {}
    columns = ('agency_id', 'field', 'before', 'after', 'reason', 'approved_by')
    with Path(path).open('r', encoding='utf-8-sig', newline='') as fd:
        reader = csv.DictReader(fd)
        if not reader.fieldnames or any(f not in reader.fieldnames for f in columns):
            raise ValueError(f'{path}: approvals require {", ".join(columns)}')
        for row_num, row in enumerate(reader, start=2):
            row = {key: (row.get(key) or '').strip() for key in columns}
            ident = (row['agency_id'], row['field'])
            if row['field'] not in COMPARE or not row['reason'] or not row['approved_by'] or not row['agency_id'] or ident in items:
                raise ValueError(f'{path}:{row_num}: invalid or duplicate signed approval')
            items[ident] = row
    return items


def audit(before, after, approvals, min_agencies):
    checks = []
    used = set()
    for agency_id in sorted(set(before) | set(after)):
        old = before.get(agency_id)
        new = after.get(agency_id)
        if old is None or new is None:
            checks.append({'agency_id': agency_id, 'field': 'agency_presence', 'before': 'present' if old else 'missing', 'after': 'present' if new else 'missing', 'result': 'FAIL', 'reason': 'Unpaired site; do not silently add/drop an agency'})
            continue
        for field in COMPARE:
            a, b = str(old[field]), str(new[field])
            if a == b:
                continue
            key = (agency_id, field)
            approval = approvals.get(key)
            if approval and approval['before'] == a and approval['after'] == b:
                checks.append({'agency_id': agency_id, 'field': field, 'before': a, 'after': b, 'result': 'APPROVED_CHANGE', 'reason': approval['reason'], 'approved_by': approval['approved_by']})
                used.add(key)
            else:
                checks.append({'agency_id': agency_id, 'field': field, 'before': a, 'after': b, 'result': 'FAIL', 'reason': 'Unapproved change from baseline'})
        if not 200 <= new['observed_http_status'] <= 299:
            checks.append({'agency_id': agency_id, 'field': 'observed_http_status', 'before': str(old['observed_http_status']), 'after': str(new['observed_http_status']), 'result': 'FAIL', 'reason': 'Candidate observation is not HTTP 2xx'})
    if len(before) < min_agencies:
        checks.append({'agency_id': '*', 'field': 'baseline_coverage', 'before': str(len(before)), 'after': str(min_agencies), 'result': 'FAIL', 'reason': 'Baseline covers fewer sites than required'})
    unused = sorted(set(approvals) - used)
    for agency_id, field in unused:
        checks.append({'agency_id': agency_id, 'field': field, 'before': approvals[(agency_id, field)]['before'], 'after': approvals[(agency_id, field)]['after'], 'result': 'INVALID_APPROVAL', 'reason': 'Approval is stale or does not match an observed change'})
    failed = sum(x['result'] in ('FAIL', 'INVALID_APPROVAL') for x in checks)
    return {'status': 'PASS' if failed == 0 else 'FAIL', 'baseline_sites': len(before), 'candidate_sites': len(after), 'matched_sites': len(set(before) & set(after)), 'approved_changes': sum(x['result'] == 'APPROVED_CHANGE' for x in checks), 'blocking_issues': failed, 'checks': checks}


def atomic_write(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, prefix='.cutover-', delete=False) as fd:
        temp = fd.name
        fd.write(content)
        fd.flush()
        os.fsync(fd.fileno())
    os.replace(temp, path)


def render_html(report):
    def esc(x):
        return html.escape(str(x), quote=True)
    rows = ''.join('<tr><td>' + esc(x['agency_id']) + '</td><td>' + esc(x['field']) + '</td><td class="wrap">' + esc(x['before']) + '</td><td class="wrap">' + esc(x['after']) + '</td><td><strong>' + esc(x['result']) + '</strong></td><td>' + esc(x.get('reason', '')) + '</td></tr>' for x in report['summary']['checks'])
    if not rows:
        rows = '<tr><td colspan="6">No differences or failures in supplied manifests.</td></tr>'
    summary = report['summary']
    return '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GovHub Multi-site Cutover Evidence</title><style>:root{font-family:system-ui, sans-serif;color-scheme:light}body{max-width:1180px;margin:36px auto;padding:0 22px;color:#172230;background:#fafbfc}h1{letter-spacing:-.03em}.lede{max-width:770px;color:#485768}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:28px 0}.metric{background:white;border:1px solid #dfe5ea;padding:17px;border-radius:12px}.metric b{display:block;font-size:26px;margin-top:6px}.muted{color:#64748b}table{border-collapse:collapse;width:100%;background:white}th,td{border-bottom:1px solid #e5e9ef;padding:11px;text-align:left;vertical-align:top;font-size:13px}th{background:#eaf0f4}td.wrap{overflow-wrap:anywhere;max-width:260px}.foot{font-size:13px;color:#64748b;margin-top:22px}</style></head><body><p class="muted">READ-ONLY ACCEPTANCE EVIDENCE · ORIGINAL OPERATOR EXPORTS</p><h1>Multi-site cutover reconciliation</h1><p class="lede">Strict comparisons of separately supplied baseline and candidate agency manifests. No live endpoint is contacted; no hosting, uptime, accessibility, or regulatory certification is implied.</p><div class="metrics"><div class="metric">Decision<b>''' + esc(summary['status']) + '''</b></div><div class="metric">Baseline sites<b>''' + esc(summary['baseline_sites']) + '''</b></div><div class="metric">Matched sites<b>''' + esc(summary['matched_sites']) + '''</b></div><div class="metric">Blocking issues<b>''' + esc(summary['blocking_issues']) + '''</b></div><div class="metric">Approved changes<b>''' + esc(summary['approved_changes']) + '''</b></div></div><h2>Difference ledger</h2><table><thead><tr><th>Agency</th><th>Field</th><th>Baseline</th><th>Candidate</th><th>Disposition</th><th>Reason</th></tr></thead><tbody>''' + rows + '''</tbody></table><p class="foot">Manifest SHA-256: baseline ''' + esc(report['inputs']['baseline_sha256']) + ''', candidate ''' + esc(report['inputs']['candidate_sha256']) + '''. Generated ''' + esc(report['generated_at']) + '''. Full structured ledger: report.json.</p></body></html>'''


def main():
    p = argparse.ArgumentParser(description='Source-exported multi-site cutover acceptance, offline only')
    p.add_argument('--before', required=True, help='Baseline export CSV')
    p.add_argument('--after', required=True, help='Candidate export CSV')
    p.add_argument('--approvals', help='Optional exact field change approvals CSV')
    p.add_argument('--out', required=True, help='Output directory for report.json/report.html')
    p.add_argument('--min-agencies', type=int, default=1, help='Minimum number of baseline agencies, default 1')
    args = p.parse_args()
    if args.min_agencies < 1:
        p.error('--min-agencies must be >= 1')
    try:
        old, new = read_manifest(args.before), read_manifest(args.after)
        approvals = read_approvals(args.approvals)
        summary = audit(old, new, approvals, args.min_agencies)
        report = {'tool': 'multi-site-cutover-evidence/1.0', 'generated_at': datetime.now(timezone.utc).isoformat(), 'inputs': {'baseline_sha256': sha_file(args.before), 'candidate_sha256': sha_file(args.after), 'approvals_sha256': sha_file(args.approvals) if args.approvals else None}, 'summary': summary, 'limits': ['Operator-supplied exported evidence only', 'No network probes or customer access', 'Not a security, hosting, or regulatory compliance certification']}
        atomic_write(Path(args.out) / 'report.json', json.dumps(report, indent=2, ensure_ascii=False) + '\n')
        atomic_write(Path(args.out) / 'report.html', render_html(report))
        print(json.dumps({k: summary[k] for k in ('status', 'baseline_sites', 'matched_sites', 'blocking_issues', 'approved_changes')}))
        return 2 if summary['blocking_issues'] else 0
    except (OSError, ValueError, UnicodeError) as exc:
        print(f'INPUT_ERROR: {exc}', file=sys.stderr)
        return 3


if __name__ == '__main__':
    sys.exit(main())
