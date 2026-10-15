#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runManagedOwnerClosureCourse} from './managed-owner-closure-course.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const products=['migration-acceptance','clickhouse-acceptance-workbench','collaborative-documents','hive-routing-workbench','replication-workbench'];
const paths=[...products.map(p=>'products/'+p+'/receiving.mjs'),'stellar/scf-starforge-20261009/distribution/runtime-workspace/applications-core.mjs'];
const files=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await readFile(resolve(root,p),'utf8')])));
try{
 const result=await runManagedOwnerClosureCourse(files,{
  utf8Encode:s=>Buffer.from(s,'utf8'),
  sha256:bytes=>createHash('sha256').update(bytes).digest('hex')
 });
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){process.stderr.write(String(error.stack??error)+'\n');process.exit(1);}
