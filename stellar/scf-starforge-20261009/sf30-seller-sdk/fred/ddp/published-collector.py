"""Retain complete first-party FRED publications for one original DDP plan."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
import argparse
import csv
import hashlib
import io
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request

UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.table = self.row = self.cell = None
        self.metadata, self.rows = [], []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == 'table':
            self.table = 'observations' if attributes.get('id') == 'data-table-observations' else 'metadata'
        if self.table and tag == 'tr':
            self.row = []
        if self.row is not None and tag in ('th', 'td'):
            self.cell = []
        if self.cell is not None and tag == 'br':
            self.cell.append('\n')

    def handle_endtag(self, tag):
        if tag in ('th', 'td') and self.cell is not None:
            self.row.append(''.join(self.cell).strip())
            self.cell = None
        if tag == 'tr' and self.row is not None:
            (self.rows if self.table == 'observations' else self.metadata).append(self.row)
            self.row = None
        if tag == 'table':
            self.table = None

    def handle_data(self, text):
        if self.cell is not None:
            self.cell.append(text)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic_json(path, value):
    temporary = path.with_name(path.name + '.part')
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


class Collector:
    def __init__(self, workspace, output, interval):
        self.root, self.output, self.interval = workspace, output, interval
        self.throttle, self.next_request = threading.Lock(), 0.0

    def member(self, path):
        relative = Path(path)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Retain original source members inside the workspace.')
        member = (self.root / relative).resolve()
        member.relative_to(self.root)
        return member

    def fetch(self, url, path):
        with self.throttle:
            delay = max(0, self.next_request - time.monotonic())
            if delay:
                time.sleep(delay)
            self.next_request = time.monotonic() + self.interval
        request = urllib.request.Request(url, headers={
            'User-Agent': UA, 'Accept': 'text/csv,text/html,*/*;q=0.8'})
        with urllib.request.urlopen(request, timeout=45) as response:
            final = urllib.parse.urlsplit(response.url)
            if response.status != 200 or final.scheme != 'https' or final.hostname != 'fred.stlouisfed.org':
                raise ValueError('Receive a successful complete first-party FRED transport.')
            data = response.read()
            path.write_bytes(data)
            return {'url': url, 'finalUrl': response.url, 'status': 200,
                'retrievedAt': datetime.now(timezone.utc).isoformat(),
                'headers': {k.lower(): v for k, v in response.headers.items() if k.lower() in
                    ('content-type', 'content-length', 'date', 'etag', 'last-modified', 'cache-control')},
                'path': str(path.relative_to(self.root)), 'bytes': len(data), 'sha256': digest(data)}, data

    def collect(self, series_id):
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}', series_id):
            raise ValueError('Use the original mapped FRED series ID.')
        directory = self.output / series_id
        directory.mkdir(parents=True, exist_ok=True)
        saved = directory / 'capture.json'
        if saved.exists():
            previous = json.loads(saved.read_text(encoding='utf-8'))
            if previous['seriesId'] != series_id or len(previous['files']) != 2:
                raise ValueError('The retained original capture belongs to another source.')
            for source in previous['files']:
                body = self.member(source['path']).read_bytes()
                if len(body) != source['bytes'] or digest(body) != source['sha256']:
                    raise ValueError('A completed original source has changed: ' + series_id)
            return previous
        metadata_url = 'https://fred.stlouisfed.org/data/' + urllib.parse.quote(series_id, safe='')
        descriptor, html = self.fetch(metadata_url, directory / 'metadata.html')
        parser = TableParser()
        parser.feed(html.decode('utf-8'))
        fields = dict(row for row in parser.metadata if len(row) == 2)
        if fields.get('Series ID') != series_id:
            raise ValueError('Original metadata series differs: ' + series_id)
        date_range = re.fullmatch(r'(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})', fields.get('Date Range', ''))
        if not date_range:
            raise ValueError('Original metadata date coverage missing: ' + series_id)
        query = urllib.parse.urlencode({'id': series_id, 'cosd': date_range[1], 'coed': date_range[2]})
        observation_url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?' + query
        values_descriptor, csv_bytes = self.fetch(observation_url, directory / 'observations.csv')
        rows = list(csv.reader(io.StringIO(csv_bytes.decode('utf-8'), newline='')))
        if not rows or rows[0] != ['observation_date', series_id] or len(rows) < 2:
            raise ValueError('Original complete CSV header changed: ' + series_id)
        if rows[1][0] != date_range[1] or rows[-1][0] != date_range[2]:
            raise ValueError('Complete CSV coverage differs from metadata: ' + series_id)
        previous = None
        for row in rows[1:]:
            if len(row) != 2 or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', row[0]) or (previous and row[0] <= previous):
                raise ValueError('Original CSV date/cell order changed: ' + series_id)
            if row[1] not in ('', '.') and not re.fullmatch(r'[+-]?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?', row[1]):
                raise ValueError('Original CSV value requires explicit interpretation: ' + series_id)
            previous = row[0]
        core = {'schema': 'stellar-forge.fred-ddp-current-publication.v1', 'seriesId': series_id,
            'basis': 'CURRENT_PUBLICATION_RETRIEVAL', 'metadata': fields, 'files': [descriptor, values_descriptor],
            'observationCount': len(rows) - 1, 'missingCount': sum(row[1] in ('', '.') for row in rows[1:]),
            'firstDate': rows[1][0], 'lastDate': rows[-1][0],
            'metadataPageObservationCount': sum(len(row) == 2 and re.fullmatch(r'\d{4}-\d{2}-\d{2}', row[0]) is not None for row in parser.rows)}
        core['id'] = 'fred-current-publication-' + digest(json.dumps(core, sort_keys=True, separators=(',', ':')).encode())
        atomic_json(saved, core)
        return core


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path('published-targets'))
    parser.add_argument('--workers', type=int, choices=(1, 2), default=2)
    parser.add_argument('--min-interval', type=float, default=0.60)
    args = parser.parse_args()
    if args.min_interval < 0.60:
        parser.error('Keep first-party request spacing at least 0.60 seconds.')
    workspace = args.workspace.resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    output = (workspace / args.output).resolve()
    output.relative_to(workspace)
    output.mkdir(parents=True, exist_ok=True)
    plan = json.loads((workspace / args.plan).read_text(encoding='utf-8'))
    if plan.get('schema') != 'stellar-forge.fred-ddp-migration-plan.v1' or not plan['summary']['ready']:
        raise ValueError('Collect the complete mapped target population of a ready original plan.')
    ids = sorted({series['fredSeriesId'] for series in plan['series'] if series['mappingStatus'] == 'MAPPED'})
    collector = Collector(workspace, output, args.min_interval)
    manifest_path = output / 'manifest.json'
    if manifest_path.exists():
        retained = json.loads(manifest_path.read_text(encoding='utf-8'))
        if retained.get('errors') == []:
            if (retained.get('planId'), retained.get('packageId'), retained.get('crosswalkId')) != (
                    plan['id'], plan['packageId'], plan['crosswalkId']):
                raise ValueError('This completed intake belongs to another source edition; choose a new intake directory.')
            if sorted(capture['seriesId'] for capture in retained['captures']) != ids:
                raise ValueError('The completed original target inventory changed.')
            for capture in retained['captures']:
                if collector.collect(capture['seriesId']) != capture:
                    raise ValueError('A completed original target capture changed.')
            print(json.dumps({'finished': len(ids), 'errors': 0,
                'observations': retained['observationCount'], 'reused': True}), flush=True)
            return
    results, errors = [], []
    with ThreadPoolExecutor(max_workers=args.workers) as workers:
        pending = {workers.submit(collector.collect, series_id): series_id for series_id in ids}
        for job in as_completed(pending):
            series_id = pending[job]
            try:
                capture = job.result()
                results.append(capture)
                print(json.dumps({'series': series_id, 'rows': capture['observationCount'],
                    'complete': len(results), 'of': len(ids)}), flush=True)
            except Exception as error:
                errors.append({'seriesId': series_id, 'errorType': type(error).__name__, 'message': str(error)})
                print(json.dumps({'series': series_id, 'error': str(error)}), flush=True)
            atomic_json(output / 'intake-progress.json', {'seriesCount': len(ids), 'captures': results, 'errors': errors})
    manifest = {'schema': 'stellar-forge.fred-ddp-current-publication-set.v1', 'planId': plan['id'],
        'packageId': plan['packageId'], 'crosswalkId': plan['crosswalkId'], 'basis': 'CURRENT_PUBLICATION_RETRIEVAL',
        'seriesCount': len(ids), 'captures': sorted(results, key=lambda capture: capture['seriesId']), 'errors': errors,
        'observationCount': sum(capture['observationCount'] for capture in results),
        'finishedAt': datetime.now(timezone.utc).isoformat()}
    atomic_json(output / 'manifest.json', manifest)
    print(json.dumps({'finished': len(results), 'errors': len(errors), 'observations': manifest['observationCount']}), flush=True)
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
