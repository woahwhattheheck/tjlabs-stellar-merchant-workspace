// SPDX-License-Identifier: MIT
import { join } from 'node:path';
import { createReviewModel } from './review-core.mjs';
import { renderCustomerReview } from './review-editor.mjs';
import { identity, canonical, clone, sha, key, text, blob, readBlob, sourceFile } from './io.mjs';

const model=createReviewModel({sha256:bytes=>sha(bytes),decodeBase64:value=>Buffer.from(value,'base64'),encodeUtf8:value=>Buffer.from(value,'utf8')});
const encoded=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const mime=name=>name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.csv')?'text/csv; charset=utf-8':
  name.endsWith('.md')?'text/markdown; charset=utf-8':name.endsWith('.zip')?'application/zip':name.endsWith('.json')?'application/json':'application/octet-stream';

export function reviewObjects(state){
  return [
    ...Object.values(state.review_packages||{}).flatMap(p=>Object.values(p.files)),
    ...Object.values(state.review_returns||{}).map(r=>r.document),
    ...Object.values(state.review_resolutions||{}).map(r=>r.document)
  ];
}
export async function verifyReviews(directory,state){
  const packages=state.review_packages||{},returns=state.review_returns||{},resolutions=state.review_resolutions||{};
  for(const [id,row]of Object.entries(packages)){
    if(row.id!==id||!row.files?.['review.json'])throw new Error('Unknown retained review package');
    const doc=JSON.parse((await readBlob(directory,row.files['review.json'])).toString('utf8'));
    await model.validateDocument(doc);
    if(doc.package.id!==id||doc.package.project_id!==state.project_id||doc.package.briefing_id!==row.briefing_id||
      doc.review_id!==row.review_id||canonical(doc.package.report)!==canonical(state.briefings[row.briefing_id]?.report))
      throw new Error('The retained review and original briefing differ');
    for(const file of Object.values(row.files))await readBlob(directory,file);
  }
  for(const [id,row]of Object.entries(returns)){
    const doc=JSON.parse((await readBlob(directory,row.document)).toString('utf8'));
    await model.validateDocument(doc);
    if(id!==row.id||identity(doc)!==id||!packages[doc.package.id]||doc.review_id!==packages[doc.package.id].review_id||
      row.package_id!==doc.package.id||row.edition_id!==doc.editions.at(-1)?.id||model.summary(doc).unsaved)
      throw new Error('A saved customer return differs from its original package');
  }
  for(const [id,row]of Object.entries(resolutions)){
    const result=JSON.parse((await readBlob(directory,row.document)).toString('utf8'));
    if(row.id!==id||identity(result)!==id||!returns[result.return_id]||result.project_id!==state.project_id)
      throw new Error('The retained review resolution differs');
  }
}
export function createCustomerReviews({directory,getState,perform,readSource}){
  const state=()=>{
    const current=getState();
    current.review_packages||={};current.review_returns||={};current.review_resolutions||={};
    return current;
  };
  function selectedPackage(id){const row=state().review_packages[key(id)];if(!row)throw new Error('Unknown original review package');return row;}
  async function originalDocument(id){
    const row=selectedPackage(id),doc=JSON.parse((await readBlob(directory,row.files['review.json'])).toString('utf8'));
    await model.validateDocument(doc);return doc;
  }
  async function returnedDocument(id){
    const row=state().review_returns[key(id)];if(!row)throw new Error('Unknown retained customer return');
    const doc=JSON.parse((await readBlob(directory,row.document)).toString('utf8'));
    await model.validateDocument(doc);return {row,doc};
  }
  function currentField(draft,doc,decision){
    const proposal=decision.decision.proposal;
    if(!proposal)return {exists:false,value:null,reason:'This decision has no editorial proposal'};
    if(decision.kind==='briefing')return {exists:!!draft,value:draft?.[proposal.field]??'',path:{kind:'briefing',field:proposal.field}};
    if(decision.kind!=='series')return {exists:false,value:null,reason:'This original target has no editable editorial text'};
    const original=doc.package.report.series.find(s=>s.series_id===decision.series_id);
    const matches=(draft?.series||[]).filter(s=>s.capture_id===original.capture_id&&s.series_id===original.series_id);
    if(matches.length!==1)return {exists:false,value:null,reason:'The current draft does not contain this exact captured series edition'};
    return {exists:true,value:matches[0][proposal.field]??'',path:{kind:'series',capture_id:original.capture_id,series_id:original.series_id,field:proposal.field}};
  }
  async function comparison(returnId){
    const {row,doc}=await returnedDocument(returnId),review=model.preview(doc),s=state();
    const decisions=review.decisions.map(decision=>{
      const current=currentField(s.draft,doc,decision),proposal=decision.decision.proposal??null;
      const before=proposal?decision.fields.find(f=>f.key===proposal.field).value:null;
      return {...decision,proposal,current,original_value:before,
        current_sha256:identity({target_id:decision.target_id,current}),
        conflict:!!proposal&&(!current.exists||canonical(current.value)!==canonical(before))};
    });
    const value={return_id:row.id,package_id:row.package_id,edition_id:row.edition_id,project_id:s.project_id,
      project_revision:s.revision,review,decisions};
    return {...value,comparison_sha256:identity(value)};
  }
  return {
    list(){
      const s=state();
      return {packages:Object.values(s.review_packages),returns:Object.values(s.review_returns),resolutions:Object.values(s.review_resolutions)};
    },
    create:(operationId,input)=>perform(operationId,'review-create',input,async operation=>{
      const s=state(),prior=Object.values(s.review_packages).find(p=>p.operation_id===operationId);
      if(prior)return prior;
      const saved=s.briefings[key(input.briefing_id)];
      if(!saved)throw new Error('Select a complete saved briefing edition');
      text(input.recipient,'intended reviewer',1000);text(input.label,'review label',1000);
      const files=[];
      async function add(name,object,contentType){
        const bytes=await readBlob(directory,object);
        files.push({name,bytes:bytes.length,sha256:sha(bytes),content_base64:bytes.toString('base64'),content_type:contentType||mime(name)});
      }
      for(const [name,object]of Object.entries(saved.files))await add('report/'+name,object,mime(name));
      for(const companion of saved.report.companions)for(const [name,object]of Object.entries(companion.files))
        await add('companions/'+companion.id+'/'+name,object,object.content_type);
      const sources=[],seen=new Set();
      for(const capture of Object.values(saved.report.sources))for(const metadata of capture.sources){
        if(seen.has(metadata.id))continue;seen.add(metadata.id);
        const original=await readSource(metadata.id);
        if(canonical(original.source)!==canonical(metadata))throw new Error('The saved report source identity differs from the retained native response');
        sources.push({source:original.source,raw_text:original.raw_text,number_lexemes:original.number_lexemes,type_tags:original.type_tags});
        if(original.source.wire_body){
          const object=original.source.wire_body,body=await sourceFile(join(directory,'econdata'),object.path);
          if(body.length!==object.bytes||sha(body)!==object.sha256)throw new Error('The original source wire body differs');
          files.push({name:'sources/'+metadata.id+'/wire.bin',bytes:body.length,sha256:sha(body),
            content_base64:body.toString('base64'),content_type:'application/octet-stream'});
        }
      }
      const pkg={schema:'tjl.economic-client-review-package.v1',project_id:s.project_id,briefing_id:saved.id,
        created_at:operation.started_at,recipient:input.recipient,label:input.label,report:clone(saved.report),files,sources};
      pkg.id=identity(pkg);
      const doc={schema:'tjl.economic-client-review.v1',package:pkg,review_id:operationId,editions:[],
        draft:{reviewer:input.recipient,notes:'',decisions:{}}};
      await model.validateDocument(doc);
      const html=renderCustomerReview(doc);
      const retained={
        'review.html':{...await blob(directory,html),content_type:'text/html; charset=utf-8'},
        'review.json':{...await blob(directory,encoded(doc)),content_type:'application/json'}
      };
      const row={id:pkg.id,operation_id:operationId,project_id:s.project_id,briefing_id:saved.id,review_id:operationId,
        recipient:input.recipient,label:input.label,created_at:operation.started_at,files:retained};
      s.review_packages[pkg.id]=row;return row;
    }),
    async file(packageId,name){
      const row=selectedPackage(packageId),object=row.files[name];
      if(!object)throw new Error('Unknown original customer review download');
      return {body:await readBlob(directory,object),identity:object,content_type:object.content_type};
    },
    document:originalDocument,
    receive:(operationId,body)=>perform(operationId,'review-receive',{sha256:sha(body),bytes:body.length},async operation=>{
      if(body.length>512*1024*1024)throw new Error('The complete review return exceeds 512 MiB');
      const retained=await blob(directory,body);
      const doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));await model.validateDocument(doc);
      const original=await originalDocument(doc.package.id);
      if(canonical(original.package)!==canonical(doc.package)||original.review_id!==doc.review_id)
        throw new Error('Receive the original customer package and review identity into its analyst project');
      const summary=model.summary(doc);
      if(!doc.editions.length||summary.unsaved)throw new Error('Ask the customer to save the complete revision and export Return JSON; unfinished working drafts remain in their original file');
      const s=state(),id=identity(doc),prior=s.review_returns[id];
      if(prior)return prior;
      const row={id,operation_id:operationId,project_id:s.project_id,package_id:doc.package.id,review_id:doc.review_id,
        edition_id:summary.edition_id,summary,received_at:operation.started_at,document:retained};
      s.review_returns[id]=row;return row;
    }),
    preview:comparison,
    returned:async returnId=>{const {doc}=await returnedDocument(returnId);return doc;},
    async returnFile(returnId){
      const {row}=await returnedDocument(returnId);
      return {body:await readBlob(directory,row.document),identity:row.document,content_type:'application/json'};
    },
    resolve:(operationId,input)=>perform(operationId,'review-resolve',input,async operation=>{
      const s=state(),prior=Object.values(s.review_resolutions).find(r=>r.operation_id===operationId);
      if(prior)return prior;
      if(input.expected_revision!==s.revision)throw new Error('Refresh the current analyst draft before resolving a customer return');
      const view=await comparison(input.return_id);
      if(input.comparison_sha256!==view.comparison_sha256)throw new Error('The customer return or current draft changed; review the complete comparison again');
      if(!Array.isArray(input.decisions)||!input.decisions.length)throw new Error('Choose explicit dispositions for the selected customer decisions');
      const next=clone(s.draft),selected=new Set(),resolutions=[];
      for(const choice of input.decisions){
        if(!choice||selected.has(choice.target_id))throw new Error('Resolve each original target once in this operation');
        selected.add(choice.target_id);
        const item=view.decisions.find(d=>d.target_id===choice.target_id);
        if(!item||item.current_sha256!==choice.current_sha256)throw new Error('The original decision or current editorial value changed');
        if(!['take_proposal','acknowledge','defer','reject'].includes(choice.action))throw new Error('Choose a documented customer disposition');
        if(typeof choice.reason!=='string'||choice.reason.length>200000||choice.reason.includes('\0'))throw new Error('Use plain disposition notes');
        if(choice.action==='take_proposal'){
          if(!item.proposal||!item.current.exists||!next)throw new Error('This original target is absent from the current draft or has no editorial proposal');
          if(item.conflict&&choice.confirm_conflict!==true)throw new Error('Explicitly confirm replacing this changed current editorial value');
          const path=item.current.path;
          if(path.kind==='briefing')next[path.field]=item.proposal.value;
          else{
            const series=next.series.find(row=>row.capture_id===path.capture_id&&row.series_id===path.series_id);
            series[path.field]=item.proposal.value;
          }
        }
        resolutions.push({target_id:item.target_id,action:choice.action,reason:choice.reason,
          current_sha256:item.current_sha256,original_value:item.original_value,current:item.current,
          proposal:item.proposal,conflict:item.conflict,confirmed_conflict:choice.confirm_conflict===true});
      }
      const outcome={schema:'tjl.economic-client-review-resolution.v1',project_id:s.project_id,operation_id:operationId,
        return_id:view.return_id,package_id:view.package_id,edition_id:view.edition_id,created_at:operation.started_at,
        before_revision:s.revision,after_revision:s.revision+1,comparison_sha256:view.comparison_sha256,
        before_draft:clone(s.draft),after_draft:next,decisions:resolutions};
      const document=await blob(directory,encoded(outcome)),id=identity(outcome);
      const row={id,operation_id:operationId,return_id:view.return_id,package_id:view.package_id,created_at:operation.started_at,
        revision:outcome.after_revision,decisions:resolutions,document};
      s.draft=next;s.revision=outcome.after_revision;s.review_resolutions[id]=row;
      return row;
    })
  };
}
