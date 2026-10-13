#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Receive the complete retained Bundesbank delivery through the maintained collection commands.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,join,isAbsolute} from 'node:path';
import {runBankCollectionCli} from './collection-cli.mjs';
import {readBankStatementSource} from './source.mjs';
import {receiveCollection,sourceInputForItem} from './public/source-collection-model.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const requireValue=(yes,message)=>{if(!yes)throw new Error(message);};
const flags={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];requireValue(['--workspace-id','--out'].includes(key)&&value&&!Object.hasOwn(flags,key),'Use --workspace-id ORIGINAL_UUID --out /absolute/new-directory');flags[key]=value;}
requireValue(Object.keys(flags).length===2&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(flags['--workspace-id']),'Supply the receiving workspace UUID.');
requireValue(isAbsolute(flags['--out'])&&resolve(flags['--out'])===flags['--out']&&flags['--out']!=='/','Choose a new absolute output directory.');
const root=flags['--out'],raw=await readFile(new URL('./BUNDESBANK_ORIGINALS.json',import.meta.url));
requireValue(hash(raw)==='15d9affd621121c16bb900a169eb359b1abf1377cffeb9bd301361b85efb8ee3','The retained original delivery changed; select its complete maintained source edition.');
const packet=JSON.parse(raw);
requireValue(packet.schema==='stellar-forge.bank-issued-originals.v1'&&packet.archives.length===2&&packet.files.length===22,'Receive the complete two-archive,22-file original delivery.');
await mkdir(root,{mode:0o700});await mkdir(join(root,'archives'),{mode:0o700});await mkdir(join(root,'originals'),{mode:0o700});await mkdir(join(root,'reports'),{mode:0o700});
const retained=[],manifest={workspaceId:flags['--workspace-id'],name:'Bundesbank EBICS and SWIFT original delivery',files:[]};
async function keep(directory,item){requireValue(typeof item.name==='string'&&item.name!=='.'&&item.name!=='..'&&!/[/\\\\]/.test(item.name),'Keep the original safe basename.');const bytes=Buffer.from(item.dataBase64,'base64');requireValue(bytes.toString('base64')===item.dataBase64&&bytes.length===item.bytes&&hash(bytes)===item.sha256,'Original byte identity changed: '+item.name);const path=join(root,directory,item.name);await writeFile(path,bytes,{flag:'wx',mode:0o600});retained.push({path,bytes:bytes.length,sha256:hash(bytes)});return path;}
for(const archive of packet.archives)await keep('archives',archive);
for(const item of packet.files){const path=await keep('originals',item);manifest.files.push({path,mapping:item.mapping,included:item.included,note:item.note});}
const manifestPath=join(root,'original-files.json'),collectionPath=join(root,'collection.json'),reviewPath=join(root,'review.json');
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
const quiet={write(){}};
await runBankCollectionCli(['prepare','--manifest',manifestPath,'--out',collectionPath],{stdout:quiet});
await runBankCollectionCli(['inspect','--input',collectionPath,'--out',reviewPath],{stdout:quiet});
await runBankCollectionCli(['extract','--input',collectionPath,'--out',join(root,'complete-extraction')],{stdout:quiet});
const collection=JSON.parse(await readFile(collectionPath,'utf8')),review=JSON.parse(await readFile(reviewPath,'utf8'));
requireValue(review.complete&&review.items.length===22&&review.items.filter(item=>item.status==='EXCLUDED').length===20&&review.items.filter(item=>item.status==='REVIEWED').length===2,'The complete original collection did not retain its22file interpretation.');
const statements=[];
for(const item of collection.items){const extracted=await readFile(join(root,'complete-extraction',item.id,'original',item.file.name));requireValue(hash(extracted)===item.file.sha256&&extracted.length===item.file.bytes,'Extracted original changed.');if(!item.included)continue;
 const report=readBankStatementSource(sourceInputForItem(item)),statement=report.statements[0];
 requireValue(report.statements.length===1&&statement.rows.length===11&&statement.camt.detailCount===11&&statement.summary.invalidPostedCount===0,'The complete issued statement entries changed.');
 requireValue(statement.rows.every(row=>row.eligible&&row.providerKey===null),'Each selected original cash entry must remain separate.');
 requireValue(statement.rows[2].providerId===statement.rows[3].providerId&&statement.rows[2].amount==='-20000'&&statement.rows[3].amount==='-15','Retain the original cheque and separate fee.');
 requireValue(statement.camt.balanceCheck.status==='MATCH'&&statement.summary.currencyTotals[0].credit==='475015'&&statement.summary.currencyTotals[0].debit==='475015','The original exact cash totals changed.');
 requireValue(statement.period.from===null&&statement.period.until===null,'Original reporting coverage was not supplied.');
 const complete={...report,bytes:{encoding:'base64',dataBase64:Buffer.from(report.bytes).toString('base64')}};
 const reportPath=join(root,'reports',item.file.name+'.json');await writeFile(reportPath,JSON.stringify(complete,null,2)+'\n',{flag:'wx',mode:0o600});
 statements.push({file:report.file,statementId:statement.camt.statementId,entries:statement.rows.length,details:statement.camt.detailCount,summary:statement.summary,profile:report.camt.profile,reportPath,pagination:statement.camt.pagination,period:statement.period,closingIssues:statement.balances.closing.flatMap(row=>row.issues.map(issue=>issue.code))});
}
const received=await receiveCollection(collection,{id:randomUUID(),workspaceId:flags['--workspace-id']});
requireValue(received.items.every((item,index)=>item.file.dataBase64===collection.items[index].file.dataBase64&&JSON.stringify(item.mapping)===JSON.stringify(collection.items[index].mapping)&&item.included===collection.items[index].included&&item.note===collection.items[index].note),'Complete collection receiving changed an original or interpretation.');
await writeFile(join(root,'received-collection.json'),JSON.stringify(received),{flag:'wx',mode:0o600});
const result={schema:'stellar-forge.bundesbank-original-receiving.v1',operation:packet.operation,completed:true,node:process.version,workspaceId:flags['--workspace-id'],collectionId:collection.id,originalSourceSha256:hash(raw),retained,statements,files:22,reviewedStatements:2,retainedOtherReports:20,receivedCollectionId:received.id,collectionPath,reviewPath};
await writeFile(join(root,'RECEIVING_RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
process.stdout.write(JSON.stringify(result)+'\n');
