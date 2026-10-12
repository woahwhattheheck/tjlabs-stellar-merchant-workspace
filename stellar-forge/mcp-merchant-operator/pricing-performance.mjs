// MIT. Performance uses the original Pricing model, pending lifecycle and file reader.
import {constants} from 'node:fs';
import {mkdir,open,link,unlink,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {privateSupportDirectory,writePrivate,failure} from './host-files.mjs';
import {PERFORMANCE_MCP_OPERATIONS} from './catalog/pricing-performance.mjs';
const operationByName=new Map(Object.entries(PERFORMANCE_MCP_OPERATIONS).map(([operation,name])=>[name,operation]));
const HASH=/^[a-f0-9]{64}$/;
const FILES=['source.json','review.json','review.html','usage.csv'];
const MAX_FILE=64*1024*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const fail=(code,message)=>failure('PRICING_PERFORMANCE_'+code,message);

export class MerchantPricingPerformance {
  #settings;#model;#files;#workspace;#exports;#manifests=new Map();
  constructor({settings,model,files}){
    this.#settings=settings;this.#model=model;this.#files=files;
    this.#exports=join(settings.directory,'performance-exports');
  }
  async #native(){
    this.#workspace??=(async()=>{
      const [{openPerformanceWorkspace},{openTariffWorkspace}]=await Promise.all([
        import('../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/performance/workspace.mjs'),
        import('../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/tariffs/workspace.mjs')]);
      const model=this.#model(),tariffs=await openTariffWorkspace({model,directory:this.#settings.directory});
      return openPerformanceWorkspace({model,tariffs,directory:this.#settings.directory});
    })();
    try{return await this.#workspace;}catch(error){this.#workspace=null;throw error;}
  }
  async #directory(path){
    await mkdir(path,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
    await privateSupportDirectory(path);
    if(await realpath(path)!==path)throw fail('EXPORT_PATH_CHANGED','Keep complete performance files in the original private workspace.');
  }
  async #read(path){
    const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    try{
      const info=await handle.stat();
      if(!info.isFile()||info.size>MAX_FILE||process.platform!=='win32'&&(info.mode&0o077))
        throw fail('FILE_CHANGED','The retained performance file changed type, size or permissions.');
      const bytes=await handle.readFile();
      if(bytes.length>MAX_FILE)throw fail('FILE_TOO_LARGE','The retained performance export exceeds its file limit.');
      return bytes;
    }finally{await handle.close();}
  }
  async #retain(path,bytes){
    try{
      const before=await this.#read(path);
      if(!before.equals(bytes))throw fail('FILE_CHANGED','The complete original performance export differs from its retained bytes.');
      return;
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const pending=join(this.#exports,'.'+randomUUID()+'.pending');
    try{
      await writePrivate(pending,bytes);
      try{await link(pending,path);}
      catch(error){
        if(error.code!=='EEXIST')throw error;
        if(!(await this.#read(path)).equals(bytes))throw fail('FILE_CHANGED','A concurrent performance export saved different original bytes.');
      }
      const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}
    }finally{await unlink(pending).catch(()=>{});}
  }
  async #manifest(performanceId){
    const previous=this.#manifests.get(performanceId);if(previous)return previous;
    const workspace=await this.#native(),source=await workspace.capture(performanceId);
    const {renderPerformanceReview,performanceCsv}=await import('../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/performance/model.mjs');
    await this.#directory(this.#exports);
    const root=join(this.#exports,source.id);await this.#directory(root);
    const output={'source.json':encode(source),'review.json':encode(source.record.review),
      'review.html':Buffer.from(renderPerformanceReview(source.record.review,{label:source.record.label})),
      'usage.csv':performanceCsv(source.record.review)},files={};
    for(const name of FILES){
      const bytes=output[name];
      if(bytes.length>MAX_FILE)throw fail('FILE_TOO_LARGE','The complete performance export exceeds its native file limit.');
      await this.#retain(join(root,name),bytes);files[name]={bytes:bytes.length,sha256:sha(bytes)};
    }
    const manifest={schema:'stellar-forge.merchant-performance-files.v1',performanceId,sourceId:source.id,
      performanceSha256:source.record.review.performanceSha256,files};
    const bytes=encode(manifest);await this.#retain(join(root,'manifest.json'),bytes);
    const result={root,bytes,manifest,manifestFile:{name:'manifest.json',bytes:bytes.length,sha256:sha(bytes)},
      record:source.record};
    this.#manifests.set(performanceId,result);
    while(this.#manifests.size>8)this.#manifests.delete(this.#manifests.keys().next().value);
    return result;
  }
  async #capture(args){
    const value=await this.#manifest(args.performanceId);
    return {performanceId:args.performanceId,sourceId:value.manifest.sourceId,record:value.record,
      manifest:value.manifest,manifestFile:value.manifestFile,fileReads:this.#files.status(args.workspace)};
  }
  async #download(args){
    if(!HASH.test(args.expectedManifestSha256??'')||!['manifest.json',...FILES].includes(args.file))
      throw fail('MANIFEST_REQUIRED','Select one complete file from the inspected performance manifest.');
    const result=await this.#files.read({scope:args.workspace,kind:'pricing-performance',
      key:JSON.stringify(['performance',args.performanceId,args.file,args.expectedManifestSha256]),
      directory:this.#settings.directory,readId:args.readId,offset:args.offset,limit:args.limit,
      expectedSha256:args.expectedSha256,
      load:async()=>{
        const original=await this.#manifest(args.performanceId);
        if(original.manifestFile.sha256!==args.expectedManifestSha256)
          throw fail('MANIFEST_CHANGED','The complete performance manifest differs from the inspected digest.');
        if(args.file==='manifest.json')return {name:args.file,bytes:original.bytes};
        const metadata=original.manifest.files[args.file],handle=await open(join(original.root,args.file),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
        try{
          const info=await handle.stat();
          if(!info.isFile()||info.size!==metadata.bytes||process.platform!=='win32'&&(info.mode&0o077))
            throw fail('FILE_CHANGED','The retained complete performance file changed type, size or permissions.');
          return {readonlyFileHandle:handle,name:args.file,bytes:metadata.bytes,sha256:metadata.sha256,
            type:args.file.endsWith('.html')?'text/html':args.file.endsWith('.csv')?'text/csv':'application/json'};
        }catch(error){await handle.close();throw error;}
      }});
    return {performanceId:args.performanceId,manifestSha256:args.expectedManifestSha256,...result};
  }
  async call(name,args){
    const operation=operationByName.get(name),workspace=await this.#native(),{workspace:alias,...input}=args;
    switch(operation){
      case 'state':return workspace.state();
      case 'sources':return workspace.sources(input);
      case 'source':return workspace.source(input.version);
      case 'servicePeriods':return workspace.servicePeriods(input);
      case 'captureServicePeriod':return workspace.captureServicePeriod(input);
      case 'preview':return workspace.preview(input.inputs);
      case 'save':return workspace.save(input);
      case 'list':return workspace.list(input);
      case 'load':return workspace.load(input.performanceId);
      case 'capture':return this.#capture(args);
      case 'download':return this.#download(args);
      case 'inspect':return workspace.inspect(input.source);
      case 'receive':return workspace.receive(input.source);
      case 'proposal':return workspace.proposal(input);
      case 'saveProposal':return workspace.saveProposal(input);
      case 'commitProposal':return workspace.commitProposal(input);
      default:throw failure('TOOL_NOT_FOUND','Unknown original Pricing performance operation.');
    }
  }
}
