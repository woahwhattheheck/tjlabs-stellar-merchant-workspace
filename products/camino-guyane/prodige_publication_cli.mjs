#!/usr/bin/env node
import {readFile, mkdir, lstat, realpath, open, link, unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {inspectSpecification, prepareEdition, prepareRequests, reconcilePublished} from './prodige_publication.mjs';

const identify = content => ({bytes:Buffer.byteLength(content,'utf8'),sha256:createHash('sha256').update(content,'utf8').digest('hex')});
const json = value => JSON.stringify(value,null,2)+'\n';
const [command,...args]=process.argv.slice(2);
const flags={};
for(let i=0;i<args.length;i+=2) {
  if(!args[i]?.startsWith('--')||!args[i+1]||flags[args[i].slice(2)])
    throw new Error('Use unique --input, --spec, --edition, --pages and --out file arguments.');
  flags[args[i].slice(2)]=args[i+1];
}
const allowed={
  inspect:['spec','out'],prepare:['input','out'],
  plan:['spec','edition','input','out'],reconcile:['input','pages','out']
};
if(!own(allowed,command)||Object.keys(flags).some(k=>!allowed[command].includes(k))||
   allowed[command].some(k=>!flags[k]))
  throw new Error('Commands: inspect --spec FILE --out DIR; prepare --input FILE --out DIR; plan --spec FILE --edition FILE --input TARGET --out DIR; reconcile --input PLAN --pages FILE --out DIR.');
function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
async function body(filename){
  const selected=path.resolve(filename), stat=await lstat(selected);
  if(!stat.isFile()||stat.isSymbolicLink()||await realpath(selected)!==selected)
    throw new Error('Use an existing ordinary source file at its real absolute path: '+selected);
  return {selected,raw:await readFile(selected,'utf8')};
}
async function publish(directory, files){
  const root=path.resolve(directory);
  await mkdir(root,{recursive:true,mode:0o700});
  const stat=await lstat(root);
  if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(root)!==root)
    throw new Error('Output must be an owned directory at its canonical path.');
  const contents={
    ...files,
    'source/prodige_publication.mjs':await readFile(new URL('./prodige_publication.mjs',import.meta.url),'utf8'),
    'source/prodige_publication_cli.mjs':await readFile(fileURLToPath(import.meta.url),'utf8')
  };
  const manifest={schema:'commons.prodige-publication-files.v1',command,
    files:Object.entries(contents).map(([name,content])=>({path:name,...identify(content)}))};
  contents['manifest.json']=json(manifest);
  for(const [relative,content] of Object.entries(contents)){
    if(path.isAbsolute(relative)||relative.split('/').some(x=>!x||x==='..'||x==='.'))
      throw new Error('Invalid output member.');
    const target=path.join(root,relative);
    await mkdir(path.dirname(target),{recursive:true,mode:0o700});
    if(await realpath(path.dirname(target))!==path.dirname(target)) throw new Error('Output parent is not canonical.');
    let existing;
    try {existing=await lstat(target);} catch(e){if(e.code!=='ENOENT')throw e;}
    if(existing){
      if(!existing.isFile()||existing.isSymbolicLink()||(await readFile(target,'utf8'))!==content)
        throw new Error('Existing output differs; preserve that edition and use its own selected successor directory: '+target);
      continue;
    }
    const temp=path.join(path.dirname(target),'.publication-'+randomUUID());
    const f=await open(temp,'wx',0o600);
    try {await f.writeFile(content,'utf8');await f.sync();}finally{await f.close();}
    try {await link(temp,target);} catch(e) {
      if(e.code!=='EEXIST'||(await readFile(target,'utf8'))!==content)throw e;
    } finally {await unlink(temp).catch(()=>{});}
    const d=await open(path.dirname(target),'r');try{await d.sync();}finally{await d.close();}
  }
  console.log(json({state:'COMPLETE',command,directory:root,manifest,...identify(contents['manifest.json'])}));
}
try{
  if(command==='inspect'){
    const spec=await body(flags.spec);
    const document=JSON.parse(spec.raw);
    await publish(flags.out,{'instance-specification.json':spec.raw,
      'contract.json':json({...inspectSpecification(document),source:identify(spec.raw)})});
  } else if(command==='prepare'){
    const config=await body(flags.input), input=JSON.parse(config.raw);
    if(typeof input.source?.path!=='string')throw new Error('source.path must select the complete original exported JSON file.');
    const original=await body(path.resolve(path.dirname(config.selected),input.source.path));
    const edition=prepareEdition({...input,source:{...input.source,raw:original.raw}},{identify});
    await publish(flags.out,{'original-export.json':original.raw,'publication-input.json':config.raw,
      'edition.json':json(edition),'attributes.csv':edition.csv,'features.geojson':json(edition.geojson)});
  } else if(command==='plan'){
    const specification=await body(flags.spec), edition=await body(flags.edition), target=await body(flags.input);
    const plan=prepareRequests(specification.raw,JSON.parse(edition.raw),JSON.parse(target.raw),{identify});
    const files={'instance-specification.json':specification.raw,'original-edition.json':edition.raw,
      'target-selection.json':target.raw,'request-plan.json':json(plan)};
    for(const request of plan.requests)files['requests/'+String(request.index).padStart(6,'0')+'.json']=json(request);
    await publish(flags.out,files);
  } else {
    const plan=await body(flags.input),pages=await body(flags.pages), originalPages=JSON.parse(pages.raw);
    const result=reconcilePublished(JSON.parse(plan.raw),originalPages,{identify});
    const safePages=originalPages.map((p,index)=>({url:p.url,status:p.status,file:p.file,rawBody:p.rawBody,headers:result.pages[index].headers}));
    await publish(flags.out,{'request-plan.json':plan.raw,'readback-pages.json':json(safePages),'reconciliation.json':json(result)});
    if(result.state!=='CONFIRMED')process.exitCode=2;
  }
}catch(error){
  console.error(json({state:'FAILED',command,code:error.code||'PUBLICATION_ERROR',message:error.message,detail:error.detail||null}));
  process.exitCode=1;
}
