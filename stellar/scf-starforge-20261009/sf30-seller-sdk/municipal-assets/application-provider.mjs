// MIT. Source-owned application adapter; the original runtime owns its lifecycle.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectMerchantRuntime } from '../../sf46-release/runtime-package.mjs';
import { APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup } from '../../distribution/runtime-workspace/application-provider.mjs';
import { SOURCE, absolute, need, sha, observeStartup } from './managed.mjs';

export default {
  schema:APPLICATION_PROVIDER_SCHEMA,id:'municipal-assets',order:1010,
  catalog({common,field}) {
    return [{
      id:'municipal-assets',command:'municipal-assets',terminal:false,
      title:'Municipal asset migration and target receiving',
      requiredSource:SOURCE+'/native/managed.py',
      description:'Open the original inventory/GIS project, review mappings and repairs, refresh complete public sources, receive Maximo target results and export the full editable handover.',
      fields:[
        field('workspaceDirectory','Initialized municipal workspace','path',true,
          'The original or independently restored directory containing workspace.sqlite3 and its private operator password. Run municipal-assets adopt once.'),
        field('pythonExecutable','Installed Python 3.11+ executable','path',true,
          'Select the actual local Python with standard SQLite. No downloaded dependencies are required.'),
        ...common,
      ],
    }];
  },
  async prepare(type,settings,{inputPath,selectedExecutable,runtimeDirectory}) {
    const directory=absolute(settings.workspaceDirectory);
    const runtime=await inspectMerchantRuntime(absolute(runtimeDirectory),{load:false});
    const root=join(runtime.sourceRoot,SOURCE);
    const native=await import(pathToFileURL(join(root,'managed.mjs')).href);
    need(typeof native.inspectWorkspace==='function'&&typeof native.inspectSource==='function',
      'Select the complete municipal asset application.');
    const python=await selectedExecutable(settings.pythonExecutable);
    const inspected=await native.inspectWorkspace(python.executable,directory,{root});
    const inputs=[await inputPath(directory,'directory',false,true),...python.inputs];
    inputs.push(await inputPath(inspected.passwordFile,'file',false,true));
    const manifest=await inputPath(inspected.source.manifestPath,'file');
    need(manifest.sha256===inspected.source.sha256,'The source manifest changed during review.');
    inputs.push(manifest);
    for(const row of inspected.source.files){
      const file=await inputPath(row.absolutePath,'file');
      need(file.sha256===row.sha256,'The selected original source changed: '+row.path);
      inputs.push(file);
    }
    // Mutable SQLite bytes and project revisions stay under the original engine.
    // Native launch rechecks the stable setting plus the exact physical database.
    return {
      args:['--python',python.executable,'managed','--workspace',directory,
        '--binding-sha256',inspected.bindingSha256,'--source-sha256',inspected.source.sha256],
      inputs,createDirectories:[],
      resourceKey:sha(Buffer.from(JSON.stringify({family:'municipal-assets',directory}))),
    };
  },
  matchRequest(request){return !request.pythonCommand&&request.command==='municipal-assets';},
  createObserver(request,directory,context){
    return observeApplicationStartup(request,directory,text=>{
      if(!text.startsWith('{"schema":"stellar-forge.municipal-asset-startup.v1",'))return null;
      return ()=>observeStartup(request,text);
    },{lineLimit:32768});
  },
};
