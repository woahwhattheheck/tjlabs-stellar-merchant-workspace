#!/usr/bin/env node
// MIT — Existing library state, complete content research, no extra service required.
import {openLibrary} from '../library.mjs';
import {openContentSearch} from './engine.mjs';
import {serveContentSearch} from './server.mjs';
import {saveReport} from './reports.mjs';
const HELP=`Resource research — Node 22.16 or newer
  node content-search/cli.mjs serve --state /private/library [--port 0]
  node content-search/cli.mjs index --state /private/library
  node content-search/cli.mjs search --state /private/library --q "annual revenue" [--mode all|any] [--all]
  node content-search/cli.mjs passages --state /private/library --q revenue --resourceId ID [--all]
  node content-search/cli.mjs export --state /private/library --q revenue --format html --out findings.html
  node content-search/cli.mjs status --state /private/library
  node content-search/cli.mjs saved --state /private/library
  node content-search/cli.mjs save --state /private/library --q revenue --name "Revenue review" --operationId OP
  node content-search/cli.mjs delete --state /private/library --id ID --expectedRevision N --operationId OP
Use the original resource-library CLI to initialize and scan a library first.
Saved-query edits require --id and --expectedRevision. --all emits complete newline-delimited results.
`;
const args=process.argv.slice(2),command=args.shift(),options={};
try{
  if(!command||command==='help'){process.stdout.write(HELP);process.exitCode=0;}
  else{
    while(args.length){const k=args.shift();if(!/^--[A-Za-z][A-Za-z0-9]*$/.test(k))throw new Error('Expected a named option');options[k.slice(2)]=k==='--all'?true:args.shift();if(options[k.slice(2)]===undefined)throw new Error('Option value required');}
    const valid=new Set(['state','port','q','mode','build','resourceId','offset','limit','all','format','out','id','name','operationId','expectedRevision']);for(const key of Object.keys(options))if(!valid.has(key))throw new Error('Unknown option: '+key);
    if(!options.state)throw new Error('--state is required');
    for(const k of ['port','offset','limit','expectedRevision'])if(options[k]!==undefined)options[k]=Number(options[k]);
    const library=await openLibrary({state:options.state});let search,host;
    const controller=new AbortController(),stop=()=>controller.abort(new Error('INTERRUPTED'));process.once('SIGINT',stop);process.once('SIGTERM',stop);
    const print=v=>process.stdout.write(JSON.stringify(v)+'\n');
    try{
      if(command==='serve'){
        host=await serveContentSearch(library,{port:options.port??0});print({url:host.url});
        if(!controller.signal.aborted)await new Promise(resolve=>controller.signal.addEventListener('abort',resolve,{once:true}));
      }else{
        search=await openContentSearch(library);
        if(command==='index')print(await search.index({signal:controller.signal}));
        else if(command==='status')print(search.status());
        else if(command==='search'||command==='passages'){
          let offset=options.offset??0,build=options.build;
          do{const page=search[command]({...options,offset,build});build=page.build;if(options.all)for(const item of page.items)print(item);else print(page);offset=page.nextOffset;}while(options.all&&offset!==null);
        }else if(command==='export'){if(!options.out)throw new Error('--out is required');print(await saveReport(search,options.out,{...options,signal:controller.signal}));}
        else if(command==='saved')print(search.listSaved());else if(command==='save')print(search.saveQuery(options));else if(command==='delete')print(search.deleteQuery(options));
        else throw new Error('Unknown command. Use help.');
      }
    }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);await host?.close();search?.close();await library.close();}
  }
}catch(e){process.stderr.write((e.code??e.message??'RESEARCH_FAILED')+'\n');process.exitCode=1;}
