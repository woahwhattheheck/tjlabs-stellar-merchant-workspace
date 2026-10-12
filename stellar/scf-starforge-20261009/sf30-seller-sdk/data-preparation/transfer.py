"""MIT. Complete project receiving and original SF30 dataset handover."""
from __future__ import annotations
import csv
import hashlib
import html
import json
import os
import re
import shutil
import sqlite3
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

from preparation import (Workspace, VERSION, PreparationError, atomic_json, digest,
                         dumps, ident, key, name, now, parse_json, title, _columns)

ARCHIVE = VERSION+'.archive'


def _published(path: Path, destination: Path):
    destination = destination.resolve()
    destination.parent.mkdir(parents=True,exist_ok=True)
    # A hard link supplies a create-only publication: concurrent receiving cannot
    # replace an existing user file. Temporary files live on the same filesystem.
    os.link(path,destination)
    return destination


def export_workspace(workspace: Workspace, destination: str | Path):
    destination = Path(destination).resolve()
    if destination.exists(): raise PreparationError('Archive destination already exists')
    destination.parent.mkdir(parents=True,exist_ok=True)
    with workspace.mutation():
        state = workspace.state()
        # Recovery must be an explicit operation; pending jobs can be transported.
        if any(r['status']=='RUNNING' for r in state['runs']):
            raise PreparationError('Recover the interrupted run before exporting this workspace')
        entries = {}
        for src in state['sources']:
            path = workspace.root/'originals'/src['sha256']
            if digest(path)!=src['sha256']: raise PreparationError('A retained input has changed')
            entries['originals/'+src['sha256']] = path
        for run in state['runs']:
            if run['status']!='COMPLETE': continue
            for filename in ('result.csv','result.jsonl','schema.json'):
                path = workspace.result_file(run['id'],filename)
                entries[f'runs/{run["id"]}/{filename}'] = path
        manifest = {'schema':ARCHIVE,'createdAt':now(),'workspace':state,
                    'members':{n:{'bytes':p.stat().st_size,'sha256':digest(p)} for n,p in sorted(entries.items())}}
        fd,tmpname = tempfile.mkstemp(dir=destination.parent,prefix='.preparation-export-')
        os.close(fd); tmp = Path(tmpname)
        try:
            with zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as out:
                out.writestr('manifest.json',dumps(manifest)+'\n')
                for member,path in sorted(entries.items()): out.write(path,member)
            with tmp.open('rb') as f: os.fsync(f.fileno())
            _published(tmp,destination)
        finally:
            tmp.unlink(missing_ok=True)
    return {'path':str(destination),'bytes':destination.stat().st_size,'sha256':digest(destination),
            'sources':len(state['sources']),'recipes':len(state['recipes']),'runs':len(state['runs'])}


def _member_allowed(member):
    return bool(re.fullmatch(r'originals/[a-f0-9]{64}|runs/r_[a-f0-9]{32}/(?:result\.csv|result\.jsonl|schema\.json)',member))


def receive_workspace(archive: str | Path, destination: str | Path, *, max_bytes=20*1024**3):
    """Rebuild native tables from original input files, never load foreign SQL.

    Complete original files and result JSONL are hashed before any workspace is
    published. A portable manifest carries saved recipes, history and reviews.
    """
    archive,destination = Path(archive).resolve(),Path(destination).resolve()
    if destination.exists(): raise PreparationError('Receiving requires a new directory')
    destination.parent.mkdir(parents=True,exist_ok=True)
    staging = Path(tempfile.mkdtemp(dir=destination.parent,prefix='.preparation-receive-'))
    try:
        incoming = staging/'incoming'; incoming.mkdir()
        with zipfile.ZipFile(archive) as z:
            names = z.namelist()
            if len(names)!=len(set(names)) or 'manifest.json' not in names:
                raise PreparationError('Archive has duplicate members or lacks its manifest')
            if z.getinfo('manifest.json').file_size>64*1024*1024:
                raise PreparationError('Archive manifest exceeds 64 MiB')
            manifest = parse_json(z.read('manifest.json').decode('utf-8'))
            if manifest.get('schema')!=ARCHIVE or not isinstance(manifest.get('members'),dict):
                raise PreparationError('Unsupported preparation archive')
            members = manifest['members']
            if set(names)!=set(members)|{'manifest.json'} or any(not _member_allowed(n) for n in members):
                raise PreparationError('Archive contains undeclared or unsupported paths')
            if sum(i.file_size for i in z.infolist())>max_bytes:
                raise PreparationError('Archive expanded size exceeds this receiving allowance')
            for member,info in members.items():
                zi = z.getinfo(member)
                if zi.is_dir() or (zi.external_attr>>16)&0o170000 == 0o120000:
                    raise PreparationError('Archive links and directories are not supported')
                if zi.file_size!=info['bytes'] or not re.fullmatch(r'[a-f0-9]{64}',info['sha256']):
                    raise PreparationError('Archive member size or digest is invalid')
                path = incoming/member; path.parent.mkdir(parents=True,exist_ok=True)
                with z.open(member) as src,path.open('xb') as out: shutil.copyfileobj(src,out,1024*1024)
                if digest(path)!=info['sha256']: raise PreparationError(f'Archive member changed: {member}')
        state = manifest['workspace']
        if state.get('schema')!=VERSION: raise PreparationError('Invalid saved workspace')
        native = staging/'workspace'
        ws = Workspace(native,create=True,label=state['label'])
        original_source_ids = set()
        for source in state['sources']:
            sha = source['sha256']
            if not re.fullmatch(r'[a-f0-9]{64}',sha): raise PreparationError('Invalid original digest')
            imported = ws.import_file(incoming/'originals'/sha,source['alias'],source['format'],label=source['label'],null_token=source['nullToken'])
            if imported['id']!=source['id'] or imported['columns']!=source['columns'] or imported['rows']!=source['rows'] or imported['nullCounts']!=source['nullCounts'] or imported['emptyCounts']!=source['emptyCounts']:
                raise PreparationError('Saved input projection does not match its original')
            if source['id'] in original_source_ids: raise PreparationError('Duplicate source identity')
            original_source_ids.add(source['id'])
            with ws.connection() as db: db.execute('UPDATE sources SET body=? WHERE id=?',(dumps(source),source['id']))
        recipe_ids = set()
        for recipe in state['recipes']:
            recipe_id = key(recipe['id']); revision = recipe['revision']
            if not recipe_id.startswith('q_') or type(revision)!=int or revision<1 or (recipe_id,revision) in recipe_ids:
                raise PreparationError('Invalid or duplicate saved recipe edition')
            title(recipe['label'])
            if not isinstance(recipe['sql'],str) or len(recipe['sql'])>100000: raise PreparationError('Invalid recipe SQL')
            if not isinstance(recipe['bindings'],dict) or not recipe['bindings']: raise PreparationError('Invalid recipe bindings')
            for alias,source_id in recipe['bindings'].items():
                name(alias)
                if source_id not in original_source_ids: raise PreparationError('Recipe refers to an absent source')
            if not isinstance(recipe['parameters'],dict): raise PreparationError('Invalid saved parameters')
            with ws.connection() as db: db.execute('INSERT INTO recipes VALUES(?,?,?)',(recipe_id,revision,dumps(recipe)))
            recipe_ids.add((recipe_id,revision))
        run_ids = set()
        for run in state['runs']:
            run_id = key(run['id'])
            if not run_id.startswith('r_') or run_id in run_ids: raise PreparationError('Invalid or duplicate run identity')
            recipe = run['recipe']
            stored = ws.get('recipes',recipe['id'],recipe['revision'])
            if dumps(stored)!=dumps(recipe): raise PreparationError('Run recipe differs from its saved edition')
            if run['status'] not in {'QUEUED','INTERRUPTED','COMPLETE','CANCELLED','FAILED'}:
                raise PreparationError('Unsupported run state in the archive')
            if run['status']=='COMPLETE':
                output = native/'runs'/run_id; output.mkdir()
                for filename in ('result.csv','result.jsonl','schema.json'):
                    source = incoming/'runs'/run_id/filename
                    expected = run['files'][filename]
                    if digest(source)!=expected['sha256'] or source.stat().st_size!=expected['bytes']:
                        raise PreparationError('Run refers to changed result bytes')
                    shutil.copyfile(source,output/filename)
                schema = parse_json((output/'schema.json').read_text())
                columns = _columns(run['columns'])
                if columns!=schema['columns']: raise PreparationError('Result schema mismatch')
                count=0; nulls=[0]*len(columns); empties=[0]*len(columns)
                db=sqlite3.connect(output/'result.sqlite')
                try:
                    db.execute('CREATE TABLE data ('+','.join(ident(c)+' TEXT' for c in columns)+')')
                    insert='INSERT INTO data VALUES ('+','.join('?' for c in columns)+')'
                    with (output/'result.jsonl').open(encoding='utf-8') as rows, (output/'result.csv').open(encoding='utf-8',newline='') as csv_in:
                        csvrows=csv.reader(csv_in,strict=True)
                        if next(csvrows,None)!=columns: raise PreparationError('Result CSV columns differ')
                        batch=[]
                        for line in rows:
                            obj=parse_json(line)
                            if not isinstance(obj,dict) or list(obj)!=columns or any(v is not None and not isinstance(v,str) for v in obj.values()):
                                raise PreparationError('Invalid result JSONL row')
                            row=list(obj.values())
                            if next(csvrows,None)!=['' if v is None else v for v in row]:
                                raise PreparationError('Result CSV and JSONL differ')
                            for n,v in enumerate(row): nulls[n]+=v is None; empties[n]+=v==''
                            batch.append(row); count+=1
                            if len(batch)==1000: db.executemany(insert,batch); batch=[]
                        if batch: db.executemany(insert,batch)
                        if next(csvrows,None) is not None: raise PreparationError('Result CSV has extra rows')
                    db.commit()
                finally: db.close()
                if count!=run['rows'] or count!=schema['rows'] or nulls!=schema['nullCounts'] or empties!=schema['emptyCounts']:
                    raise PreparationError('Result counts differ from its saved schema')
                # Native SQLite indexes are reconstructed, not transported.
                run['files']['result.sqlite']={'bytes':(output/'result.sqlite').stat().st_size,'sha256':digest(output/'result.sqlite')}
            ws._set_run(run); run_ids.add(run_id)
        for review in state['reviews']:
            if review['id'] not in run_ids or type(review['revision'])!=int or review['revision']!=len(review['history']):
                raise PreparationError('Review history does not match a saved run')
            for entry in review['history']:
                if entry['decision'] not in {'accept','revise','withdraw'}: raise PreparationError('Invalid review decision')
                title(entry['reviewer'])
            with ws.connection() as db: db.execute('INSERT INTO reviews VALUES(?,?,?)',(review['id'],review['revision'],dumps(review)))
        atomic_json(native/'workspace.json',{k:state[k] for k in ('schema','label','createdAt')})
        # Directory publication must be create-only, including an empty collision.
        # mkdir reserves the name; rename moves into that private reservation only.
        destination.mkdir(mode=0o700)
        try:
            os.rename(native,destination)
        except BaseException:
            # Remove only our still-empty reservation, never concurrent user data.
            try: destination.rmdir()
            except OSError: pass
            raise
        return {'path':str(destination),'sources':len(original_source_ids),'recipes':len(recipe_ids),'runs':len(run_ids)}
    finally:
        shutil.rmtree(staging,ignore_errors=True)


def merchant_delivery(workspace: Workspace, run_id, destination: str | Path, *, label=None):
    """Export a portable dataset configuration for the ORIGINAL SF30 handler.

    All source values remain strings. Null-bearing columns receive explicit
    boolean companion columns, preserving SQL NULL and empty text distinctly.
    Mapping also gives arbitrary SQL column labels legal merchant field names.
    """
    run=workspace.get('runs',run_id)
    if run['status']!='COMPLETE': raise PreparationError('Choose a complete result edition')
    destination=Path(destination).resolve()
    if destination.exists(): raise PreparationError('Delivery destination already exists')
    schema=parse_json(workspace.result_file(run_id,'schema.json').read_text())
    fields=[]; used=set(); columns={}
    for n,original in enumerate(run['columns']):
        stem=re.sub(r'[^A-Za-z0-9_]','_',original)[:38]
        if not stem or not stem[0].isalpha() or not stem.isascii(): stem='field_'+str(n+1)
        try: name(stem)
        except PreparationError: stem='field_'+str(n+1)
        field=stem; suffix=1
        while field.lower() in used or (field+'_is_null').lower() in used:
            suffix+=1; field=stem[:34]+'_'+str(suffix)
        used.add(field.lower())
        nullfield=field+'_is_null' if schema['nullCounts'][n] else None
        if nullfield: used.add(nullfield.lower())
        fields.append({'source':original,'field':field,'nullField':nullfield})
        columns[field]={'type':'string','nullable':False}
        if nullfield: columns[nullfield]={'type':'boolean','nullable':False}
    if len(columns)>64:
        raise PreparationError('This result exceeds the original merchant limit of 64 exposed fields including null indicators; select a narrower delivery recipe')
    if run['rows']>1000000:
        raise PreparationError('This result exceeds the original merchant one-million-row limit; use partitioned delivery recipes. Full workspace and result exports remain available')
    destination.parent.mkdir(parents=True,exist_ok=True)
    temporary=Path(tempfile.mkdtemp(dir=destination.parent,prefix='.preparation-dataset-'))
    try:
        csvpath=temporary/'dataset.csv'
        max_cell=max(5,*(len(c) for c in columns))
        with workspace.result_file(run_id,'result.jsonl').open(encoding='utf-8') as src,csvpath.open('w',encoding='utf-8',newline='') as out:
            writer=csv.writer(out,lineterminator='\n'); writer.writerow(columns)
            for line in src:
                obj=parse_json(line); row=[]
                for field in fields:
                    value=obj[field['source']]
                    row.append('' if value is None else value); max_cell=max(max_cell,len(row[-1].encode("utf-16-le"))//2)
                    if field['nullField']: row.append('true' if value is None else 'false')
                writer.writerow(row)
        if max_cell>1024*1024: raise PreparationError('A result cell exceeds the original merchant one-million UTF-16-unit limit; retain the full result or select a transformed delivery')
        if csvpath.stat().st_size>256*1024*1024: raise PreparationError('Result exceeds the original merchant 256 MiB CSV limit; use partitioned delivery recipes')
        config={'schema':'stellar-forge.csv-dataset.v1','file':'dataset.csv','name':title(label or run['label']),
                'columns':columns,'filters':[],'sorts':[],'ranges':[],'maxRows':max(1,run['rows']),
                'maxBytes':max(1,csvpath.stat().st_size),'maxCellChars':max_cell,'defaultLimit':50,'maxLimit':250}
        atomic_json(temporary/'dataset.json',config)
        atomic_json(temporary/'mapping.json',{'schema':VERSION+'.merchant-mapping','fields':fields,'run':run['id'],
                    'sourceResultSha256':run['files']['result.jsonl']['sha256'],
                    'nullSemantics':'When nullField is true, the source value was SQL NULL; otherwise the text field is exact, including empty text.'})
        (temporary/'README.md').write_text('# Prepared dataset\n\nThis directory feeds the existing Stellar Forge CSV dataset service.\n\n'
            'Inspect it with `node dataset-cli.mjs --dataset /absolute/path/dataset.json`.\n'
            'The dataset file is resolved relative to its configuration. Keep both files together.\n\n'
            'All value fields are strings, including large identifiers and exact decimal amounts. '
            'For each nullable source column, mapping.json names a boolean null indicator. '
            'A true indicator means SQL NULL; false preserves the exact text value, including an empty string. '
            'No payment terms are included. Use the existing seller configuration workflow to select them.\n',encoding='utf-8')
        destination.mkdir(mode=0o700)
        try:
            os.rename(temporary,destination)
        except BaseException:
            try: destination.rmdir()
            except OSError: pass
            raise
        return {'path':str(destination),'rows':run['rows'],'fields':fields,'configuration':str(destination/'dataset.json')}
    finally: shutil.rmtree(temporary,ignore_errors=True)


def result_report(workspace: Workspace,run_id,destination):
    """Full downloadable rows are separate from the readable operational report."""
    run=workspace.get('runs',run_id)
    recipe=run['recipe']; review=next((r for r in workspace.records('reviews') if r['id']==run_id),None)
    esc=lambda v:html.escape(str(v))
    sources=[workspace.get('sources',id) for id in recipe['bindings'].values()]
    source_rows=''.join('<tr><td>'+esc(s['label'])+'</td><td>'+esc(s['alias'])+'</td><td>'+str(s['rows'])+'</td><td>'+esc(s['format'].upper())+'</td></tr>' for s in sources)
    history=''.join('<p><strong>'+esc(e['decision'].capitalize())+'</strong> · '+esc(e['reviewer'])+'<br>'+esc(e['note'])+'</p>' for e in (review or {}).get('history',[])) or '<p>No review has been recorded.</p>'
    document=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(run['label'])}</title>
<style>body{{font:16px/1.6 system-ui,sans-serif;margin:0;background:#f4f4f4;color:#202020}}main{{max-width:900px;margin:40px auto;background:white;padding:32px;border:1px solid #ccc}}h1{{font-size:32px;line-height:1.2}}table{{width:100%;border-collapse:collapse}}th,td{{text-align:left;padding:10px;border-bottom:1px solid #ddd}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;background:#eee;padding:16px}}small{{color:#555}}@media(max-width:600px){{main{{margin:0;padding:20px}}table{{font-size:13px}}th,td{{padding:5px}}}}</style>
<main><small>STELLAR FORGE / DATA PREPARATION</small><h1>{esc(run['label'])}</h1><p>{esc(run['status'].capitalize())} · {run['rows']:,} result rows · recipe edition {recipe['revision']}</p>
<h2>Selected inputs</h2><table><thead><tr><th>Source</th><th>Query alias</th><th>Rows</th><th>Format</th></tr></thead><tbody>{source_rows}</tbody></table>
<h2>Transformation</h2><p>{esc(recipe.get('note',''))}</p><pre>{esc(recipe['sql'])}</pre><h3>Named parameters</h3><pre>{esc(dumps(recipe['parameters']))}</pre>
<h2>Review history</h2>{history}<h2>Receiving the data</h2><p>The complete result CSV, exact text/null JSON Lines and column schema are available alongside this report. The project archive retains every original input and saved recipe for independent editing. Source numeric values stay text; decimal functions provide explicit exact arithmetic.</p></main></html>'''
    destination=Path(destination)
    with destination.open('x',encoding='utf-8') as out: out.write(document)
    return {'path':str(destination),'bytes':destination.stat().st_size}
