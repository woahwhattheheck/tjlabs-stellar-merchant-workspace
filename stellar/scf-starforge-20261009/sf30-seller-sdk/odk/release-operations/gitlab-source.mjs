// MIT. Read-only original GitLab receiving through trusted server profiles.
import {fault} from '../../odata/state.mjs';
const need=(ok,message,status=400)=>{if(!ok)throw fault('RELEASE_GITLAB_SOURCE',message,status);};
const positive=(value,label)=>{const text=String(value??'');need(/^[1-9][0-9]*$/.test(text)&&Number.isSafeInteger(Number(text)),'Select the exact '+label+'.');return text;};
const ids=(values,label)=>{need(Array.isArray(values??[]),'Select '+label+' IDs.');return [...new Set((values??[]).map(v=>positive(v,label)))];};
const tokenName=/^[A-Za-z_][A-Za-z0-9_]*$/;
export function createGitLabReleaseSource({connections=[],fetchImpl=globalThis.fetch}={}){
  need(Array.isArray(connections),'Configure trusted GitLab connections on the original server.');
  const profiles=new Map();
  for(const input of connections){
    need(input&&typeof input.id==='string'&&input.id.trim()&&!profiles.has(input.id),'Use distinct configured GitLab connection IDs.');
    const url=new URL(input.url);
    need(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash,'Configure an exact HTTPS GitLab base without credentials/query.');
    need(typeof input.tokenEnv==='string'&&tokenName.test(input.tokenEnv),'Configure the GitLab credential environment alias on the server.');
    const base=url.href.replace(/\/+$/,'');
    profiles.set(input.id,{id:input.id,name:String(input.name||input.id),url:base,tokenEnv:input.tokenEnv,
      projectIds:input.projectIds===undefined?null:ids(input.projectIds,'configured project')});
  }
  function profile(id){const value=profiles.get(id);need(value,'Choose a server-configured GitLab connection.');return value;}
  function normalize(input){
    const p=profile(input.connectionId),projectId=positive(input.projectId,'project ID');
    need(!p.projectIds||p.projectIds.includes(projectId),'This project is outside the configured connection selection.',403);
    return {id:input.id,name:input.name,connectionId:p.id,projectId,pipelineId:positive(input.pipelineId,'pipeline ID'),
      jobIds:ids(input.jobIds,'job'),deploymentIds:ids(input.deploymentIds,'deployment'),artifactJobIds:ids(input.artifactJobIds,'artifact job')};
  }
  function descriptors(input){
    const s=normalize(input),selected=ids([...s.jobIds,...s.artifactJobIds],'job');
    return [{key:'project',kind:'project',id:s.projectId},{key:'pipeline',kind:'pipeline',id:s.pipelineId},
      {key:'pipeline-jobs:1',kind:'pipeline-jobs',id:s.pipelineId,page:1},
      ...selected.map(id=>({key:'job:'+id,kind:'job',id})),
      ...s.deploymentIds.map(id=>({key:'deployment:'+id,kind:'deployment',id})),
      ...s.artifactJobIds.map(id=>({key:'artifact:'+id,kind:'artifact',id}))];
  }
  async function read(input,descriptor,{signal}={}){
    const s=normalize(input),p=profile(s.connectionId),project='/api/v4/projects/'+encodeURIComponent(s.projectId);
    let suffix;
    if(descriptor.kind==='project')suffix=project;
    else if(descriptor.kind==='pipeline')suffix=project+'/pipelines/'+positive(descriptor.id,'pipeline');
    else if(descriptor.kind==='pipeline-jobs')suffix=project+'/pipelines/'+s.pipelineId+'/jobs';
    else if(descriptor.kind==='job')suffix=project+'/jobs/'+positive(descriptor.id,'job');
    else if(descriptor.kind==='deployment')suffix=project+'/deployments/'+positive(descriptor.id,'deployment');
    else if(descriptor.kind==='artifact')suffix=project+'/jobs/'+positive(descriptor.id,'job')+'/artifacts';
    else throw fault('RELEASE_GITLAB_SOURCE','Choose an original supported GET resource.');
    const url=new URL(p.url+suffix);
    if(descriptor.kind==='pipeline-jobs'){
      need(Number.isSafeInteger(descriptor.page)&&descriptor.page>0,'Keep the original jobs page.');
      url.searchParams.set('include_retried','true');url.searchParams.set('per_page','100');url.searchParams.set('page',String(descriptor.page));
    }
    const token=process.env[p.tokenEnv];need(typeof token==='string'&&token,'The configured GitLab credential is unavailable in this server process.',503);
    let response;
    try{response=await fetchImpl(url,{method:'GET',headers:{'PRIVATE-TOKEN':token,Accept:descriptor.kind==='artifact'?'application/octet-stream':'application/json'},redirect:'error',signal});}
    catch(error){throw fault('RELEASE_GITLAB_TRANSPORT',error.name==='AbortError'?'The original GET was paused.':'The configured original GitLab GET did not return a complete response; redirects are not followed.',502);}
    const headers={};
    for(const name of ['content-type','content-length','etag','last-modified','x-request-id','retry-after','ratelimit-reset','ratelimit-remaining','x-next-page','x-page','x-per-page','x-total-pages','x-total']){
      const value=response.headers.get(name);if(value!==null)headers[name]=value;
    }
    let nextPage=null;
    if(descriptor.kind==='pipeline-jobs'&&response.ok){
      const next=headers['x-next-page'];
      if(next!==undefined&&next!==''){need(/^[1-9][0-9]*$/.test(next)&&Number(next)>descriptor.page,'GitLab returned a repeated or invalid jobs page.',502);nextPage=Number(next);}
      else if(next===undefined){
        const link=response.headers.get('link');
        const match=link?.split(',').find(v=>/;\s*rel="?next"?/.test(v));
        if(match){
          const raw=/<([^>]+)>/.exec(match)?.[1];need(raw,'GitLab returned an invalid jobs continuation.',502);
          const target=new URL(raw,url);
          need(target.origin===url.origin&&target.pathname===url.pathname&&!target.username&&!target.password&&!target.hash,
            'The original jobs continuation changed provider or path.',502);
          const allowed=new Set(['page','per_page','include_retried']);
          need([...target.searchParams.keys()].every(k=>allowed.has(k))&&target.searchParams.get('include_retried')==='true',
            'The original jobs continuation changed its selection.',502);
          const page=target.searchParams.get('page');
          need(/^[1-9][0-9]*$/.test(page??'')&&Number(page)>descriptor.page,'GitLab repeated a jobs continuation.',502);nextPage=Number(page);
        }
      }
    }
    const retry=response.headers.get('retry-after');let retryAt=null;
    if(retry){const milliseconds=/^\d+$/.test(retry)?Date.now()+Number(retry)*1000:Date.parse(retry);if(Number.isFinite(milliseconds))retryAt=new Date(milliseconds).toISOString();}
    return {response,receipt:{method:'GET',url:url.href,status:response.status,headers,observedAt:new Date().toISOString(),nextPage,retryAt}};
  }
  function decode(input,descriptor,value){
    const s=normalize(input);const same=(a,b)=>String(a)===String(b);
    if(descriptor.kind==='project'){
      need(value&&same(value.id,s.projectId),'The actual GitLab project differs.',502);
      return {projectId:String(value.id),name:value.name,pathWithNamespace:value.path_with_namespace,webUrl:value.web_url};
    }
    if(descriptor.kind==='pipeline'){
      need(value&&same(value.id,s.pipelineId)&&same(value.project_id,s.projectId)&&typeof value.sha==='string','The actual GitLab pipeline differs.',502);
      return {projectId:s.projectId,pipelineId:String(value.id),commit:value.sha,ref:value.ref,status:value.status,createdAt:value.created_at,updatedAt:value.updated_at,webUrl:value.web_url};
    }
    if(descriptor.kind==='pipeline-jobs'){
      need(Array.isArray(value),'GitLab did not return the complete jobs array.',502);
      return {jobs:value.map(job=>{
        need(job&&job.id&&same(job.pipeline?.id,s.pipelineId)&&same(job.pipeline?.project_id,s.projectId),'An original job belongs to a different pipeline/project.',502);
        return {jobId:String(job.id),name:job.name,stage:job.stage,status:job.status,commit:job.commit?.id,pipelineId:String(job.pipeline.id),projectId:s.projectId,retried:job.retried??null};
      })};
    }
    if(descriptor.kind==='job'){
      need(value&&same(value.id,descriptor.id)&&same(value.pipeline?.id,s.pipelineId)&&same(value.pipeline?.project_id,s.projectId),'The selected job belongs to a different original pipeline/project.',502);
      return {jobId:String(value.id),projectId:s.projectId,pipelineId:String(value.pipeline.id),commit:value.commit?.id??value.pipeline.sha,status:value.status,
        name:value.name,stage:value.stage,startedAt:value.started_at,finishedAt:value.finished_at,artifacts:value.artifacts??[],artifactsFile:value.artifacts_file??null,artifactsExpireAt:value.artifacts_expire_at??null,webUrl:value.web_url};
    }
    if(descriptor.kind==='deployment'){
      need(value&&same(value.id,descriptor.id)&&value.environment?.id&&typeof value.sha==='string','The original deployment identity is incomplete.',502);
      need(!value.deployable?.pipeline?.project_id||same(value.deployable.pipeline.project_id,s.projectId),'The deployment belongs to another project.',502);
      return {deploymentId:String(value.id),projectId:s.projectId,environmentId:String(value.environment.id),environmentName:value.environment.name,
        environmentUrl:value.environment.external_url??null,commit:value.sha,status:value.status,jobId:value.deployable?.id?String(value.deployable.id):null,
        pipelineId:value.deployable?.pipeline?.id?String(value.deployable.pipeline.id):null,createdAt:value.created_at,updatedAt:value.updated_at};
    }
    return {projectId:s.projectId,pipelineId:s.pipelineId,jobId:String(descriptor.id),origin:'gitlab-api-job-artifact'};
  }
  return {normalize,descriptors,read,decode,connections:()=>[...profiles.values()].map(({tokenEnv,...p})=>p)};
}
