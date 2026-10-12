// MIT. Original WordPress connection and merchant release-store setup.
import {mkdtemp,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {readPrivate} from '../files.mjs';
import {readWordPressConfiguration} from './connection.mjs';
import {privateExportDirectory,writeImmutable} from './exports.mjs';
import {need,text,exact,decode,encode,digest,identity} from './contracts.mjs';

export async function initializeWordPressMerchant(options={}){
  exact(options,['directory','connection','name'],['directory','connection']);
  const root=resolve(text(options.directory,'Private merchant directory',4096)),
    connection=resolve(text(options.connection,'Original WordPress connection',4096)),
    name=text(options.name??'Starforge WordPress workspaces','Merchant name');
  const selected=await readWordPressConfiguration(connection);
  await privateExportDirectory(root);
  const names=await readdir(root),intentFile=join(root,'wordpress-merchant-setup.json');
  need(!names.length||names.includes('wordpress-merchant-setup.json'),
    'WORDPRESS_MERCHANT_SETUP_DIRECTORY_IN_USE','Select an empty directory or this original WordPress merchant setup.');
  const stableWorkspaces=Object.fromEntries(Object.entries(selected.workspaces).map(([alias,binding])=>{
    const {workspaceId,workspaceIdentity,selectionSha256,...declared}=binding;
    return [alias,declared];
  }));
  const intent={schema:'stellar-forge.wordpress-merchant-setup.v1',connection,name,
    connectionSha256:digest(await readPrivate(connection,1024*1024)),
    selectionSha256:identity({workspaces:stableWorkspaces,buyerWorkspaces:selected.buyerWorkspaces,receivers:selected.receivers})};
  await writeImmutable(intentFile,encode(intent));
  const native=await import('../../../sf82-seller-pilot/releases.mjs'),
    selectionFile=join(root,'wordpress-release-store.json');
  let release;
  try{release=decode(await readPrivate(selectionFile,65536));}
  catch(error){
    if(error.code!=='ENOENT')throw error;
    const candidates=await privateExportDirectory(join(root,'release-candidates')),
      stage=await mkdtemp(join(candidates,'native-'));
    await native.initReleaseStore(join(stage,'store'));
    const proposal={schema:'stellar-forge.wordpress-release-selection.v1',
      directory:'./release-candidates/'+stage.split('/').at(-1)+'/store',setupSha256:digest(encode(intent))};
    // The existing immutable writer permits only the exact selected bytes.
    // A concurrent completed selection is read and verified below.
    try{await writeImmutable(selectionFile,encode(proposal));}
    catch(error){if(error.code!=='WORDPRESS_MERCHANT_RETAINED_CHANGED')throw error;}
    release=decode(await readPrivate(selectionFile,65536));
  }
  need(release.schema==='stellar-forge.wordpress-release-selection.v1' &&
    release.setupSha256===digest(encode(intent)) &&
    /^\.\/release-candidates\/native-[A-Za-z0-9]+\/store$/.test(release.directory??''),
    'WORDPRESS_MERCHANT_SETUP_CHANGED','Use the original completed release-store selection.');
  await native.readReleaseState(resolve(root,release.directory));
  await privateExportDirectory(join(root,'customer-exports'));
  const {CONFIG_SCHEMA,readMerchantConfig}=await import('../../../../../stellar-forge/mcp-merchant-operator/config.mjs');
  const config={schema:CONFIG_SCHEMA,name,releaseStore:release.directory,exportsDirectory:'./customer-exports',
    sources:{},wordpressConnection:connection},configuration=join(root,'merchant-mcp.json');
  await writeImmutable(configuration,encode(config));await readMerchantConfig(configuration);
  return {schema:CONFIG_SCHEMA,state:'INITIALIZED',configuration,source:'original-wordpress-workspace',
    workspaces:Object.keys(selected.workspaces),buyerWorkspaces:Object.keys(selected.buyerWorkspaces),
    receivers:Object.keys(selected.receivers)};
}
