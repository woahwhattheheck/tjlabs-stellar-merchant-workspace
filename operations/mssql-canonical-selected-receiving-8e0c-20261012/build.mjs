import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [root,repository,ref,output]=process.argv.slice(2);
try {
 const {buildDistribution}=await import(pathToFileURL(join(root,'stellar/scf-starforge-20261009/distribution/build.mjs')).href);
 const result=await buildDistribution({repository,ref,output,selection:'mssql',offline:true,
  onProgress:event=>{if(['selected','packaged','source-needed'].includes(event.phase))process.stderr.write(JSON.stringify(event)+'\n');}});
 process.stdout.write('MSSQL_SELECTED_BUILD='+JSON.stringify({ok:true,result})+'\n');
} catch(error) {
 process.stdout.write('MSSQL_SELECTED_BUILD='+JSON.stringify({ok:false,error:error.code??error.name,message:error.message,
  missingObjects:error.missingObjects??null,url:error.url??null,stack:error.stack})+'\n'); process.exitCode=1;
}