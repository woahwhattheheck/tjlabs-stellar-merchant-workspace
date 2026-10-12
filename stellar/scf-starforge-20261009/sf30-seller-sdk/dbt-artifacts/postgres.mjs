// MIT. dbt context around the maintained PostgreSQL publisher, never another writer.
import {join,resolve} from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DbtProjectClient,ensure} from './client.mjs';
const digest=text=>createHash('sha256').update(text).digest('hex');
const runId=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export class DbtPostgresProject{
  static async open({project,python,publisherDirectory,sourceFile,targetDirectory,create=false,seller=null,resource=null}={}){
    ensure(typeof project==='string'&&typeof publisherDirectory==='string','DBT_PUBLISHER_BINDING_REQUIRED');
    const {openPostgresPublisher}=await import('../postgres/publisher/model.mjs');
    const native=await openPostgresPublisher({directory:resolve(publisherDirectory),create,
      ...(sourceFile?{sourceFile:resolve(sourceFile)}:{}),...(targetDirectory?{targetDirectory:resolve(targetDirectory)}:{}),seller,resource});
    const value=new DbtPostgresProject();value.publisher=native;value.client=new DbtProjectClient({directory:project,python});return value;
  }
  async call(action,input={}){
    const p=this.publisher;
    switch(action){
      case 'status':return p.status(input);
      case 'source':return p.source();
      case 'plan.save':return p.savePlan(input);
      case 'plan':return p.plan(input.id);
      case 'run':return p.run(input.id);
      case 'extract':return p.startExtraction(input.plan,{id:input.id}).completion;
      case 'inspect':return p.inspect(input.id,input.query);
      case 'review':return p.review(input.id,input.review);
      case 'publish':return p.publish(input.id,input.reviewId);
      case 'recover':return p.recover(input.id);
      case 'buyer.offer':return p.buyerOffer(input.id,input.query);
      case 'buyer.prepare':return p.prepareBuyer(input.id,input);
      case 'bind':{
        ensure(runId.test(input.id)&&typeof input.edition==='string'&&typeof input.uid==='string'&&typeof input.request_id==='string','DBT_CONTEXT_REQUIRED');
        const original=p.run(input.id),plan=p.plan(original.plan),candidate=await p.candidate(input.id);
        ensure(input.expectedQueryHash===plan.data.queryHash,'DBT_QUERY_SELECTION_CHANGED','Select the original reviewed publisher query hash.');
        const node=await this.client.node(input.edition,input.uid);
        const directory=join(this.client.directory,'native-bindings',input.id);await mkdir(directory,{recursive:true,mode:0o700});
        const query=Buffer.from(plan.data.sourceQuery.sql,'utf8'),provenance=Buffer.from(JSON.stringify({
          schema:'stellar-forge.dbt-postgres-result-binding.v1',edition:input.edition,uid:input.uid,manifest:node.artifact,
          publisherRun:input.id,publisherPlan:original.plan,sourceHash:plan.data.sourceHash,queryHash:plan.data.queryHash,
          planDigest:plan.data.digest,queryInput:plan.data.input,candidate:candidate.manifest,
          interpretation:'Explicit operator-selected context for this original publisher extraction.'}));
        const persist=async(name,body)=>{const path=join(directory,name+'-'+digest(body));try{await writeFile(path,body,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;ensure((await readFile(path)).equals(body),'DBT_BINDING_CHANGED');}return path;};
        return this.client.bindResult({edition:input.edition,uid:input.uid,
          file:join(p.directory,'runs',input.id,'data.csv'),expected_sha:candidate.manifest.csvHash,
          query_file:await persist('query.sql',query),provenance_file:await persist('provenance.json',provenance),
          source_kind:'original-postgresql-publisher',original_request_id:input.id,request_id:input.request_id});
      }
      default:throw Object.assign(Error('Unknown original publisher continuation.'),{code:'DBT_POSTGRES_ACTION_UNKNOWN'});
    }
  }
  async close(){try{await this.publisher.close();}finally{await this.client.close();}}
}
