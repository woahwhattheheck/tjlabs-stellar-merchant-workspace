// MIT. Private Geoapify merchant setup through the original provider initializer.
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {CONFIG_SCHEMA,readMerchantConfig} from './config.mjs';
import {exact,line,writePrivate} from './host-files.mjs';
import {readGeoapifyWorkspaceConfiguration} from './geoapify-workspace.mjs';
function hostPath(value,label) {
 if(typeof value!=='string'||!value||value.length>4096||/[\x00-\x1f\x7f]/.test(value))
  throw Object.assign(new Error(label+' must be a nonempty host path.'),{code:'CONFIGURATION_ERROR'});
 return value;
}
export async function initializeGeoapifyWorkspaceMerchant(options) {
  exact(options,['directory','connection','name'],['directory','connection']);
  const root=resolve(hostPath(options.directory,'Merchant directory'));
  const connection=resolve(hostPath(options.connection,'Private Geoapify connection'));
  const name=line(options.name??'Starforge Geoapify operator','Merchant name');
  const selected=await readGeoapifyWorkspaceConfiguration(connection);
  await mkdir(root,{mode:0o700});
  await (await import('../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs')).initReleaseStore(join(root,'releases'));
  await mkdir(join(root,'customer-exports'),{mode:0o700});
  const configuration=join(root,'merchant-mcp.json');
  await writePrivate(configuration,{schema:CONFIG_SCHEMA,name,releaseStore:'./releases',
    exportsDirectory:'./customer-exports',sources:{},geoapifyWorkspaceConnection:connection});
  await readMerchantConfig(configuration);
  return {schema:CONFIG_SCHEMA,configuration,state:'INITIALIZED',geoapifyWorkspacesConfigured:true,
    workspaces:Object.entries(selected.workspaces).map(([workspace,item])=>({workspace,label:item.label})),
    authoring:'OPENED_BY_MERCHANT_GEOAPIFY_OPEN'};
}
