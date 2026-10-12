#!/usr/bin/env python3
"""MIT. Native CLI and newline-delimited automation interface."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from preparation import Workspace, PreparationError, parse_json, dumps
from transfer import export_workspace, receive_workspace, merchant_delivery, result_report


def dispatch(ws: Workspace, operation: str, arguments: dict):
    if not isinstance(arguments,dict): raise PreparationError('Arguments must be a JSON object')
    operations = {
        'state':ws.state,'import':ws.import_file,'source-page':ws.source_page,
        'recipe':ws.save_recipe,'enqueue':ws.enqueue,'execute':ws.execute,
        'rerun':ws.rerun,'cancel':ws.cancel,'recover':ws.recover,'result-page':ws.result_page,
        'review':ws.review,
        'export':lambda **kw:export_workspace(ws,**kw),
        'merchant':lambda **kw:merchant_delivery(ws,**kw),
        'report':lambda **kw:result_report(ws,**kw),
    }
    if operation not in operations: raise PreparationError('Unknown operation: '+operation)
    return operations[operation](**arguments)


def main():
    parser=argparse.ArgumentParser(description='Retain, join, transform and deliver tabular source editions.')
    parser.add_argument('--workspace',required=True,help='Saved workspace directory or new receiving destination')
    commands=parser.add_subparsers(dest='command',required=True)
    init=commands.add_parser('init'); init.add_argument('--label',default='Data preparation')
    commands.add_parser('state'); commands.add_parser('recover'); commands.add_parser('rpc')
    imp=commands.add_parser('import'); imp.add_argument('file'); imp.add_argument('--alias',required=True); imp.add_argument('--format',choices=['csv','jsonl'],default='csv'); imp.add_argument('--label'); imp.add_argument('--null-token')
    recipe=commands.add_parser('recipe'); recipe.add_argument('--label',required=True); recipe.add_argument('--sql-file',required=True); recipe.add_argument('--bindings',required=True,help='JSON object mapping query alias to retained source ID'); recipe.add_argument('--parameters',default='{}'); recipe.add_argument('--id'); recipe.add_argument('--expected-revision',type=int,default=0); recipe.add_argument('--note',default='')
    run=commands.add_parser('run'); run.add_argument('recipe_id'); run.add_argument('--revision',type=int)
    rerun=commands.add_parser('rerun'); rerun.add_argument('run_id')
    cancel=commands.add_parser('cancel'); cancel.add_argument('run_id')
    review=commands.add_parser('review'); review.add_argument('run_id'); review.add_argument('--decision',choices=['accept','revise','withdraw'],required=True); review.add_argument('--reviewer',required=True); review.add_argument('--note',default=''); review.add_argument('--expected-revision',type=int,default=0)
    for operation in ('source-page','result-page'):
        sub=commands.add_parser(operation); sub.add_argument('id'); sub.add_argument('--offset',type=int,default=0); sub.add_argument('--limit',type=int,default=100)
    out=commands.add_parser('export'); out.add_argument('destination')
    rec=commands.add_parser('receive'); rec.add_argument('archive'); rec.add_argument('--max-bytes',type=int,default=20*1024**3)
    for operation in ('merchant','report'):
        sub=commands.add_parser(operation); sub.add_argument('run_id'); sub.add_argument('destination')
    serve=commands.add_parser('serve'); serve.add_argument('--port',type=int,default=8769)
    args=parser.parse_args(); command=args.command
    if command=='init': return Workspace(args.workspace,create=True,label=args.label).state()
    if command=='receive': return receive_workspace(args.archive,args.workspace,max_bytes=args.max_bytes)
    ws=Workspace(args.workspace)
    if command=='serve':
        from server import serve
        serve(ws,args.port); return None
    if command=='rpc':
        # A single native process can handle repeated calls. Responses are one
        # complete JSON line; large artifacts are returned as paths, not previews.
        for line in sys.stdin:
            request_id=None
            try:
                request=parse_json(line); request_id=request.get('id')
                value=dispatch(ws,request['operation'],request.get('arguments',{}))
                print(dumps({'id':request_id,'ok':True,'result':value}),flush=True)
            except Exception as exc:
                print(dumps({'id':request_id,'ok':False,'error':str(exc)}),flush=True)
        return None
    if command=='state': return ws.state()
    if command=='recover': return ws.recover()
    if command=='import': return ws.import_file(args.file,args.alias,args.format,label=args.label,null_token=args.null_token)
    if command=='recipe': return ws.save_recipe(args.label,Path(args.sql_file).read_text(encoding='utf-8'),parse_json(args.bindings),parse_json(args.parameters),id=args.id,expected_revision=args.expected_revision,note=args.note)
    if command=='run': return ws.execute(ws.enqueue(args.recipe_id,args.revision)['id'])
    if command=='rerun': return ws.execute(ws.rerun(args.run_id)['id'])
    if command=='cancel': return ws.cancel(args.run_id)
    if command=='source-page': return ws.source_page(args.id,args.offset,args.limit)
    if command=='result-page': return ws.result_page(args.id,args.offset,args.limit)
    if command=='review': return ws.review(args.run_id,args.decision,args.reviewer,args.note,expected_revision=args.expected_revision)
    if command=='export': return export_workspace(ws,args.destination)
    if command=='merchant': return merchant_delivery(ws,args.run_id,args.destination)
    if command=='report': return result_report(ws,args.run_id,args.destination)
    raise PreparationError('Unknown command')


if __name__=='__main__':
    try:
        result=main()
        if result is not None:
            print(dumps(result))
            if isinstance(result,dict) and result.get('status') in {'FAILED','CANCELLED','INTERRUPTED'}: sys.exit(2)
    except (PreparationError,ValueError,OSError,KeyError,TypeError) as exc:
        print(dumps({'error':str(exc)}),file=sys.stderr); sys.exit(1)
