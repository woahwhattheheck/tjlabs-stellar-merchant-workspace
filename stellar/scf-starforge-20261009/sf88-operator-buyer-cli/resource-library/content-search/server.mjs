// MIT — Adds a research desk to the original authenticated library server.
import {readFile} from 'node:fs/promises';
import {readingExchangeExtension} from '../reading-exchange/server.mjs';
import {serveLibrary} from '../server.mjs';
import {openContentSearch} from './engine.mjs';
import {reportDownload} from './reports.mjs';
import {projectDownload} from './project.mjs';
import {requireValue} from '../files.mjs';
export async function contentSearchExtension(search){
  let work=null,lastJob=null,closing=false;
  const reading=await readingExchangeExtension(search);
  const additionalAssets=await Promise.all([['/research','index.html','text/html'],['/research.js','app.js','text/javascript'],['/research.css','style.css','text/css']].map(async([route,file,type])=>({route,type,bytes:await readFile(new URL(file,import.meta.url))})));
  const page=additionalAssets.find(asset=>asset.route==='/research');
  page.bytes=Buffer.from(page.bytes.toString('utf8').replace('</head>','<link rel="stylesheet" href="/research-project.css"><script type="module" src="/research-project.js"></script></head>'));
  for(const [route,file,type]of [['/research-project.js','project-ui.mjs','text/javascript'],['/research-project.css','project.css','text/css']])additionalAssets.push({route,type,bytes:await readFile(new URL(file,import.meta.url))});
  additionalAssets.push(...reading.additionalAssets);
  const authenticatedRoute=async(context)=>{
    if(await reading.authenticatedRoute(context))return true;
    const {request,url,send,body,registerDownload}=context;
    const prefix='/api/content-search';if(!url.pathname.startsWith(prefix+'/'))return false;
    requireValue(!closing,'SEARCH_CLOSING',503);const action=url.pathname.slice(prefix.length),method=request.method;
    const values=()=>{const out={};for(const key of ['q','mode','build','resourceId'])if(url.searchParams.has(key))out[key]=url.searchParams.get(key);for(const key of ['offset','limit','ordinal'])if(url.searchParams.has(key))out[key]=Number(url.searchParams.get(key));return out;};
    if(action==='/status'&&method==='GET')send({...search.status(),job:lastJob});
    else if(action==='/index'&&method==='POST'){
      await body();requireValue(!work,'INDEX_ALREADY_RUNNING',409);lastJob={state:'RUNNING'};
      // The server owns this operation, not the short-lived start request.
      work=search.index().then(result=>{lastJob={state:'COMPLETE',result};},e=>{lastJob={state:search.status().last?.state??'FAILED',error:e.code??'INDEX_FAILED'};}).finally(()=>{work=null;});
      send({...search.status(),job:lastJob},202);
    }else if(action==='/cancel'&&method==='POST'){await body();send(search.cancel());}
    else if(action==='/search'&&method==='GET')send(search.search(values()));
    else if(action==='/passages'&&method==='GET')send(search.passages(values()));
    else if(action==='/page'&&method==='GET')send(search.page(values()));
    else if(action==='/saved'&&method==='GET')send({items:search.listSaved()});
    else if(action==='/saved'&&method==='PUT')send(search.saveQuery(await body()));
    else if(action==='/saved'&&method==='DELETE')send(search.deleteQuery(await body()));
    else if(action==='/project'&&method==='POST'){await body();send(await registerDownload(signal=>projectDownload(search,{},signal)));}
    else if(action==='/export'&&method==='POST'){const options=await body();send(await registerDownload(signal=>reportDownload(search,options,signal)));}
    else requireValue(false,'RESEARCH_ROUTE_NOT_FOUND',404);
    return true;
  };
  return {additionalAssets,authenticatedRoute,async close(){closing=true;await reading.close();search.cancel();if(work)await work;}};
}
export async function serveContentSearch(library,options={}){
  const search=await openContentSearch(library);let extension,host;
  try{extension=await contentSearchExtension(search);host=await serveLibrary(library,{...options,
    additionalAssets:[...(options.additionalAssets??[]),...extension.additionalAssets],
    authenticatedRoute:[...(typeof options.authenticatedRoute==='function'?[options.authenticatedRoute]:options.authenticatedRoute??[]),extension.authenticatedRoute]});}
  catch(e){await extension?.close();search.close();throw e;}
  let closed;
  return {...host,url:host.origin+'/research#'+host.token,search,close(){return closed??=(async()=>{await extension.close();await host.close();search.close();})();}};
}
