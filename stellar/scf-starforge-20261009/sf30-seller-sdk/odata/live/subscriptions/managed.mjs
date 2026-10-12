// MIT. Bind the original private subscription connection to an OData launch.
import {readSubscriptionConnection} from './operator.mjs';
import {need,HASH} from './files.mjs';

/** Read the original connection once; retain a small identity beside its full configuration. */
export async function odataSubscriptionSelection(connection,{expectedSha256}={}){
  need(typeof connection==='string'&&connection.length>0&&!connection.includes('\0'),
    'CONNECTION','Select the original private subscription connection file.',400);
  need(expectedSha256===undefined||(typeof expectedSha256==='string'&&HASH.test(expectedSha256)),
    'CONNECTION_IDENTITY','Select the original connection SHA256.',400);
  const configuration=await readSubscriptionConnection(connection);
  const identity=Object.freeze({schema:configuration.schema,...configuration.source});
  need(expectedSha256===undefined||identity.sha256===expectedSha256,
    'CONNECTION_CHANGED','The subscription connection changed. Review the selected connection before starting it.');
  return {configuration,identity};
}
