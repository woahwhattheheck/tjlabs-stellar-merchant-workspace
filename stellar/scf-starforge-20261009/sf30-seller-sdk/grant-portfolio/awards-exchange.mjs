// MIT. Native hashing and saved delivery over the shared application exchange rules.
import {createHash} from 'node:crypto';
import {GRANT_PORTFOLIO_MAX_ACTION_BYTES} from './client.mjs';
import {parseAwardCsvText,originalAwardCsvBytes,prepareAwardCsvImportStructure,encodeAwardApplications} from './awards-exchange-core.mjs';
import {materializeAwardCsvRowReview,verifyAwardCsvRowReview,encodeAwardCsvRowReview} from './awards-import-row-review.mjs';
export {parseAwardCsvText};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const need=(condition,message)=>{if(!condition)throw Object.assign(new Error(message),{code:'GRANT_AWARDS_EXCHANGE'});};
/** All IDs and column meanings come from the caller. The original synchronous API is retained. */
export function prepareAwardCsvImport(portfolio,input){
  need(!input.continuation,'Review and submit a completed-row continuation through its complete session engine.');
  const csv=originalAwardCsvBytes(input.csv);
  if(input.rowReview)verifyAwardCsvRowReview(portfolio,input.rowReview,csv);
  const plan=prepareAwardCsvImportStructure(portfolio,{...input,csv},sha(csv));
  const actionBytes=Buffer.from(JSON.stringify(plan.action),'utf8');
  need(actionBytes.length<=GRANT_PORTFOLIO_MAX_ACTION_BYTES,'The complete mapped action exceeds the original request limit.');
  return {...plan,actionSha256:sha(actionBytes)};
}
/** Retain the plan and operation ID. Reuse this exact plan on interrupted delivery. */
export async function submitAwardCsvImport(client,plan,csv,options={}){
  need(plain(plan)&&['stellar-forge.awards-csv-import-plan.v1','stellar-forge.awards-csv-import-plan.v2'].includes(plan.schema)&&plain(plan.source)&&/^[0-9a-f]{64}$/.test(plan.source.sha256||''),
    'Use the complete original prepared CSV import.');
  need(plain(plan.action)&&plan.action.action==='portfolio.save'&&plain(plan.action.payload)&&
    plan.action.payload.id===plan.portfolio?.id&&plan.action.payload.expectedPortfolioRevision===plan.portfolio?.revision&&
    plan.actionSha256===sha(Buffer.from(JSON.stringify(plan.action),'utf8')),
    'The original reviewed import action changed. Prepare and retain its complete replacement explicitly.');
  const bytes=originalAwardCsvBytes(csv);
  need(bytes.length===plan.source.bytes&&sha(bytes)===plan.source.sha256,'The complete original CSV differs from the reviewed import plan.');
  const {rowReview,...requestOptions}=options;
  if(plan.schema==='stellar-forge.awards-csv-import-plan.v2'){
    need(rowReview&&rowReview.sha256===plan.rowReview?.sha256,'Provide the complete sealed row review for this reviewed import.');
    materializeAwardCsvRowReview(rowReview,bytes);
    const reviewBasis=await client.portfolio(rowReview.portfolio.id,{...requestOptions,revision:rowReview.portfolio.revision});
    verifyAwardCsvRowReview(reviewBasis,rowReview,bytes);
    const historical=await client.portfolio(plan.portfolio.id,{...requestOptions,revision:plan.portfolio.revision});
    const expected=prepareAwardCsvImport(historical,{operationId:plan.action.operationId,csv:bytes,filename:plan.source.filename,
      documentId:plan.documentId,roundId:rowReview.round.id,actor:rowReview.actor,mapping:rowReview.mapping,
      identities:rowReview.identities,status:rowReview.status,rowIndexes:plan.rowIndexes,rowReview,
      reviewDocumentId:plan.rowReview.documentId});
    need(JSON.stringify(canonical(expected))===JSON.stringify(canonical(plan)),'The saved reviewed import differs from its complete original source and decisions.');
    const body=encodeAwardCsvRowReview(rowReview),sha256=sha(body);
    need(plan.rowReview.object.bytes===body.length&&plan.rowReview.object.sha256===sha256,'The complete row-review object changed.');
    const received=await client.uploadProgrammeDocument({body,bytes:body.length,sha256},requestOptions);
    need(received.bytes===body.length&&received.sha256===sha256,'The complete row-review upload changed.');
  }
  const uploaded=await client.uploadProgrammeDocument({body:bytes,bytes:bytes.length,sha256:plan.source.sha256},requestOptions);
  need(uploaded.sha256===plan.source.sha256&&uploaded.bytes===plan.source.bytes,'The complete original CSV upload changed.');
  return client.action(plan.action,requestOptions);
}
/** Full JSON retains the original records; spreadsheet-safe CSV is the default CSV export. */
export function exportAwardApplications(portfolio,options={}){
  const file=encodeAwardApplications(portfolio,options),bytes=Buffer.from(file.bytes);
  return {...file,bytes,sha256:sha(bytes)};
}
