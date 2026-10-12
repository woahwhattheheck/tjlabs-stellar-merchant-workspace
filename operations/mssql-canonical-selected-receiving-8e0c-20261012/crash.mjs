import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [root,kind,sourceFile,stateDirectory,id,manifestSha256]=process.argv.slice(2);
const original=fs.promises.link;
fs.promises.link=async(from,to)=>{
 await original(from,to);
 if(kind==='identity'&&to===join(stateDirectory,'operator','workspace.json')||
    kind==='export-result'&&to===join(stateDirectory,'operator','results',id+'.json')){
  fs.writeSync(1,'MSSQL_ORIGINAL_PUBLICATION_LINKED\n');process.kill(process.pid,'SIGKILL');
 }
};
syncBuiltinESMExports();
const P='stellar/scf-starforge-20261009/sf30-seller-sdk/mssql/';
if(kind==='identity'){
 const module=await import(pathToFileURL(join(root,P+'workspace/operator-store.mjs')).href);
 await module.initializeMssqlOperator({sourceFile,stateDirectory});
}else{
 const module=await import(pathToFileURL(join(root,P+'workspace/operator.mjs')).href);
 const operator=await module.createMssqlOperator({sourceFile,stateDirectory});
 try{await operator.exportSource({releaseId:'catalog_example',manifestSha256,kind:'customer',operationId:id});}
 finally{await operator.close();}
}
throw Error('Original publication boundary was not reached');
