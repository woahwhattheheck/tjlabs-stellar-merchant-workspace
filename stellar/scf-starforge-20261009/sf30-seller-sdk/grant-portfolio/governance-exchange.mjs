// MIT. Node hashing for the original shared governance exchange.
import {createHash} from 'node:crypto';
import {createGovernanceExchange,inspectGovernanceSource,GOVERNANCE_IMPORT_SCHEMA,GOVERNANCE_COLLECTIONS} from './governance-exchange-core.mjs';
const exchange=createGovernanceExchange({sha256:bytes=>createHash('sha256').update(bytes).digest('hex')});
export {inspectGovernanceSource,GOVERNANCE_IMPORT_SCHEMA,GOVERNANCE_COLLECTIONS};
export const prepareGovernanceImport=(portfolio,input,source)=>exchange.prepare(portfolio,input,source);
export const verifyGovernanceImportPlan=(portfolio,plan,source)=>exchange.verify(portfolio,plan,source);
export const reopenGovernanceImportPlan=(client,plan,source,options)=>exchange.reopen(client,plan,source,options);
export const submitGovernanceImport=(client,plan,source,options)=>exchange.submit(client,plan,source,options);
export const exportGovernanceRecords=(portfolio,options)=>exchange.exportRecords(portfolio,options);
