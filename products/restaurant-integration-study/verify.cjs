'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function main(){
 const raw=fs.readFileSync(path.join(__dirname,'SOURCE_MANIFEST.json'),'utf8'),manifest=JSON.parse(raw);
 for(const item of manifest.files){const bytes=fs.readFileSync(path.join(__dirname,item.path));if(bytes.length!==item.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Source identity mismatch: '+item.path);}
 const model=await require('./examples/build-course.cjs').run(),client=await require('./examples/client-course.cjs').run();
 const result={schema:'restaurant.portable-course/v1',source_members:manifest.files.length,execution:'Actual maintained source with authored injected HTTP responses',model:model.checks,client:client.checks};
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(require.main===module)main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
module.exports={main};
