// Native finance commands use the already opened original configured owners.
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, digest, canonical } from './model.mjs';
import { putOriginal } from './delivery.mjs';
import { readMerchantConfig } from '../../../../stellar-forge/mcp-merchant-operator/config.mjs';
import { prepareRozoFinancePlan, runRozoFinance } from './native-finance.mjs';
import { prepareFinanceAmendmentPlan } from './finance-amendment-native.mjs';
import { originalJSON, retainFinance, financeChild } from './finance-native-support.mjs';
const need=(flags,key)=>{assert(typeof flags[key]==='string'&&flags[key].length,'FINANCE_CLI','Supply '+key);return flags[key];};
export async function financeCommand(command,service,flags){
  if(command==='finance-plan'||command==='finance-amendment-plan'){
    const directory=resolve(need(flags,'--directory'));mkdirSync(directory,{recursive:true,mode:0o700});
    const report={reportId:need(flags,'--report-id'),expectedReportSha256:need(flags,'--report-sha256'),
      ...(flags['--report-version']?{reportVersion:Number(flags['--report-version'])}:{})};
    const source=originalJSON(resolve(need(flags,'--source-details')));
    const options={report,actor:need(flags,'--actor'),source,...(flags['--operation-id']?{operationId:flags['--operation-id']}:{})};
    const value=command==='finance-amendment-plan'?await prepareFinanceAmendmentPlan(service,{...options,
      previousDirectory:resolve(need(flags,'--previous-finance-directory')),
      purchaseSelection:flags['--purchase-selection']?originalJSON(resolve(flags['--purchase-selection'])):null}):prepareRozoFinancePlan(service,options);
    const native=await service.finance.state();
    assert(native.accounting?.sourceMode==='merchant','FINANCE_CLI_OWNER','Select the original configured merchant Accounting owner.');
    value.plan.accounting.binding=native.accounting.binding;
    const planFile=join(directory,'finance-plan-draft.json'),sourceFile=join(directory,value.source.name);
    putOriginal(planFile,Buffer.from(canonical(value.plan)+'\n'));putOriginal(sourceFile,value.sourceBytes);
    retainFinance(join(directory,'finance-plan-context.json'),{schema:'stellar-forge.rozo-finance-plan-context.v1',
      workspace:service.workspace.meta(),accounting:native.accounting,buyer:native.buyer,
      movements:value.movements,source:{...value.source,path:sourceFile},...(value.context?{amendment:value.context}:{})});
    return {state:'REVIEW_REQUIRED',planFile,source:{...value.source,path:sourceFile},
      contextFile:join(directory,'finance-plan-context.json'),operationId:value.plan.operationId};
  }
  assert(command==='native-finance','FINANCE_CLI','Select finance-plan or native-finance.');
  const merchantConfig=resolve(need(flags,'--merchant-config')),config=await readMerchantConfig(merchantConfig);
  const alias=need(flags,'--accounting'),definition=config.accounting?.workspaces?.[alias];
  assert(definition?.recovery?.backupRoot,'FINANCE_CLI_RECOVERY','Configure the original Accounting recovery backupRoot/stateRoot before its full receiving.');
  const plan=originalJSON(resolve(need(flags,'--plan')));
  assert(plan.accounting?.binding?.alias===alias&&(plan.buyer?.binding?.alias??null)===(flags['--buyer']??null),
    'FINANCE_CLI_BINDING','The reviewed plan must select exactly these original configured aliases.');
  return runRozoFinance({service,directory:resolve(need(flags,'--directory')),plan,
    backupRoot:definition.recovery.backupRoot,passEnv:definition.recovery.passEnv,
    merchantConfig,accountingAlias:alias,previousFinanceDirectory:flags['--previous-finance-directory']?resolve(flags['--previous-finance-directory']):undefined,maintenanceContinuation:flags['--maintenance-continuation']?originalJSON(resolve(flags['--maintenance-continuation'])):null,python:flags['--python']??process.env.ROZO_PYTHON??'python3',
    chromium:need(flags,'--chromium'),playwrightModule:need(flags,'--playwright-module'),
    onProgress:value=>process.stderr.write(JSON.stringify(value)+'\n')});
}
export async function receiveFinanceCommand(flags){
  const python=flags['--python']??process.env.ROZO_PYTHON??'python3',directory=resolve(need(flags,'--directory'));
  const archive=resolve(need(flags,'--archive')),sha256=need(flags,'--sha256');
  const archiveTool=fileURLToPath(new URL('./finance-archive.py',import.meta.url));
  const received=await financeChild(python,['-B',archiveTool,'receive','--archive',archive,'--directory',directory,'--sha256',sha256]);
  assert(received.code===0,'FINANCE_PACKAGE_RECEIVE','The exact complete finance package was not received.',500,{stderr:received.stderr});
  const {receiveRozoFinance}=await import('./finance-receiving.mjs');
  return receiveRozoFinance({directory,receiver:resolve(need(flags,'--receiver')),python,
    merchantConfig:flags['--merchant-config']?resolve(flags['--merchant-config']):undefined,
    accountingAlias:flags['--accounting']});
}
