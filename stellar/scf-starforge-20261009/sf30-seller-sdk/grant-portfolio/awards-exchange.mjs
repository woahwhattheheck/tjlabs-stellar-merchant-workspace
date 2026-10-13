// MIT. Native hashing and saved delivery over the shared application exchange rules.
import {createHash} from 'node:crypto';
import {GRANT_PORTFOLIO_MAX_ACTION_BYTES} from './client.mjs';
import {parseAwardCsvText,originalAwardCsvBytes,prepareAwardCsvImportStructure,encodeAwardApplications} from './awards-exchange-core.mjs';
export {parseAwardCsvText};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const need=(condition,message)=>{if(!condition)throw Object.assign(new Error(message),{code:'GRANT_AWARDS_EXCHANGE'});};
/** All IDs and column meanings come from the caller. The original synchronous API is retained. */
export function prepareAwardCsvImport(portfolio,input){
  const csv=originalAwardCsvBytes(input.csv);
  const plan=prepareAwardCsvImportStructure(portfolio,{...input,csv},sha(csv));
  const actionBytes=Buffer.from(JSON.stringify(plan.action),'utf8');
  need(actionBytes.length<=GRANT_PORTFOLIO_MAX_ACTION_BYTES,'The complete mapped action exceeds the original request limit.');
  return {...plan,actionSha256:sha(actionBytes)};
}
/** Retain the plan and operation ID. Reuse this exact plan on interrupted delivery. */
export async function submitAwardCsvImport(client,plan,csv,options={}){
  need(plain(plan)&&plan.schema==='stellar-forge.awards-csv-import-plan.v1'&&plain(plan.source)&&/^[0-9a-f]{64}$/.test(plan.source.sha256||''),
    'Use the complete original prepared CSV import.');
  need(plain(plan.action)&&plan.action.action==='portfolio.save'&&plain(plan.action.payload)&&
    plan.action.payload.id===plan.portfolio?.id&&plan.action.payload.expectedPortfolioRevision===plan.portfolio?.revision&&
    plan.actionSha256===sha(Buffer.from(JSON.stringify(plan.action),'utf8')),
    'The original reviewed import action changed. Prepare and retain its complete replacement explicitly.');
  const bytes=originalAwardCsvBytes(csv);
  need(bytes.length===plan.source.bytes&&sha(bytes)===plan.source.sha256,'The complete original CSV differs from the reviewed import plan.');
  const uploaded=await client.uploadProgrammeDocument({body:bytes,bytes:bytes.length,sha256:plan.source.sha256},options);
  need(uploaded.sha256===plan.source.sha256&&uploaded.bytes===plan.source.bytes,'The complete original CSV upload changed.');
  return client.action(plan.action,options);
}
/** Full JSON retains the original records; spreadsheet-safe CSV is the default CSV export. */
export function exportAwardApplications(portfolio,options={}){
  const file=encodeAwardApplications(portfolio,options),bytes=Buffer.from(file.bytes);
  return {...file,bytes,sha256:sha(bytes)};
}
