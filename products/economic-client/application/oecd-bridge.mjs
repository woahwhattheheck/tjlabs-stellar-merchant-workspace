// SPDX-License-Identifier: MIT
import { pathToFileURL } from 'node:url';
import { resolve, isAbsolute, join } from 'node:path';
import { ordinary, text, clone, now } from './io.mjs';

export async function withOecd(config, callback) {
  if (!config || !isAbsolute(config.client_module) || !isAbsolute(config.project_directory))
    throw new Error('Select the installed original OECD client module and saved project directory');
  await ordinary(config.client_module);
  const module = await import(pathToFileURL(config.client_module).href);
  if (typeof module.launchOecd !== 'function') throw new Error('The installed module has no original OECD launch binding');
  let create=false;
  try { await ordinary(join(config.project_directory,'oecd-project.json')); }
  catch(error){if(error.code!=='ENOENT')throw error;create=config.create===true;}
  const launched = await module.launchOecd({projectDirectory:resolve(config.project_directory),
    create, pythonCommand:config.python || 'python3',env:{...process.env,SF30_XML_NODE:process.execPath}});
  try { return await callback(launched.client); }
  finally { await launched.close(); }
}
export async function acquireOecdEdition(config, briefingId) {
  text(briefingId,'saved OECD briefing identity',64);
  return withOecd(config,async client=>{
    const briefing = await client.briefing(briefingId);
    const files=[];
    for(const name of ['briefing.html','briefing.json','observations.csv','SOURCE_RIGHTS.json','SOURCE_RIGHTS.md']) {
      const response=await client.reportFile(briefingId,name);
      files.push({name,content_type:response.contentType,body:response.body});
    }
    const archive=await client.exportProject(briefingId);
    files.push({name:'oecd-project.zip',content_type:archive.contentType,body:archive.body});
    const dataset=await client.exportDataset(briefingId);
    const rows=await client.sourceRows(briefingId);
    files.push({name:'original-source-rows.json',content_type:'application/json',body:Buffer.from(JSON.stringify(rows,null,2)+'\n')});
    files.push({name:'native-dataset.json',content_type:'application/json',body:Buffer.from(JSON.stringify(dataset,null,2)+'\n')});
    return {kind:'original-oecd-project',label:briefing.title || briefing.request?.title || 'OECD leading-indicator briefing',
      briefing_id:briefingId,briefing:clone(briefing),acquired_at:now(),files};
  });
}
