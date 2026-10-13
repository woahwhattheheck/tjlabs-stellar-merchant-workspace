#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Complete original-file receiving through the installed profile and collection commands.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isAbsolute,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runBankProfileCli} from './profile-cli.mjs';
import {runBankCollectionCli} from './collection-cli.mjs';
const need=(condition,message)=>{if(!condition)throw new Error(message);};
const hash=value=>createHash('sha256').update(value).digest('hex');
const options={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];need(['--workspace-id','--out'].includes(key)&&value&&!Object.hasOwn(options,key),'Supply --workspace-id WORKSPACE_SHA256 --out /absolute/new-directory.');options[key]=value;}
need(Object.keys(options).length===2&&/^[a-f0-9]{64}$/.test(options['--workspace-id']),'Use the original receiving accounting workspace identity.');
const root=options['--out'];need(isAbsolute(root)&&resolve(root)===root&&root!=='/','Use a new absolute private output directory.');
await mkdir(root,{mode:0o700});
const files=[],phases=[];
async function keep(name,value){const path=join(root,name),bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');await writeFile(path,bytes,{flag:'wx',mode:0o600});files.push({path,bytes:bytes.length,sha256:hash(bytes)});return path;}
async function read(path){return JSON.parse(await readFile(path,'utf8'));}
async function command(name,args){let output='';await runBankProfileCli(args,{stdout:{write:value=>{output+=value;}}});const result=JSON.parse(output);phases.push({name,result});if(result.output)files.push(result.output);return result;}
const originalDirectory=join(root,'complete-original-delivery');
const originalResult=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('./BUNDESBANK_RECEIVE.mjs',import.meta.url)),'--workspace-id',options['--workspace-id'],'--out',originalDirectory],{encoding:'utf8',maxBuffer:16000000}));
phases.push({name:'Complete original Bundesbank delivery',result:originalResult});
const collection=await read(originalResult.collectionPath),selected=collection.items.filter(item=>item.included);
need(collection.items.length===22&&selected.length===2,'Retain all22 original files and both actual camt.053 statements.');
const mappingPath=await keep('original-recurring-mapping.json',selected[0].mapping);
const initialPath=join(root,'profile-library-v1.json'),currentPath=join(root,'profile-library-v2.json');
const first=await command('Save original source profile',['create','--workspace',options['--workspace-id'],'--mapping',mappingPath,'--name','Bundesbank original .08 exports','--actor','Receiving operator','--reason','Original unqualified .08 bank exports with distinct source-entry identity.','--out',initialPath]);
await command('Retain complete named revision',['revise','--library',initialPath,'--profile',first.profileId,'--expected-version','1','--mapping',mappingPath,'--name','Bundesbank EBICS and SWIFT original .08 exports','--actor','Receiving operator','--reason','Name the two original delivery families explicitly while retaining the reviewed source interpretation.','--out',currentPath]);
await command('Inspect complete history',['inspect','--library',currentPath,'--out',join(root,'complete-profile-history.json')]);
const reviewPath=join(root,'selected-originals-profile-review.json');
await command('Review both original statements',['review','--library',currentPath,'--profile',first.profileId,'--version','2','--input',originalResult.collectionPath,'--items',selected.map(item=>item.id).join(','),'--out',reviewPath]);
const revisedCollectionPath=join(root,'reviewed-original-collection.json');
await command('Apply the exact reviewed interpretation',['apply','--library',currentPath,'--input',originalResult.collectionPath,'--review',reviewPath,'--out',revisedCollectionPath]);
const revised=await read(revisedCollectionPath);
need(revised.items.every((item,index)=>item.file.dataBase64===collection.items[index].file.dataBase64&&item.id===collection.items[index].id&&item.included===collection.items[index].included&&item.note===collection.items[index].note),'Applying the reviewed profile must retain every original byte, item identity and operator decision.');
const sourceReviewPath=join(root,'current-complete-source-review.json');let reviewOutput='';
await runBankCollectionCli(['inspect','--input',revisedCollectionPath,'--out',sourceReviewPath],{stdout:{write:value=>{reviewOutput+=value;}}});
const sourceReviewResult=JSON.parse(reviewOutput);phases.push({name:'Inspect the complete original sources',result:sourceReviewResult});files.push(sourceReviewResult.output);
const oldReview=await read(originalResult.reviewPath),newReview=await read(sourceReviewPath);
need(newReview.items.length===22&&sourceReviewResult.reviewed===2&&sourceReviewResult.sourceReview===0,'Both selected original statements must remain readable.');
for(const row of newReview.items.filter(item=>item.status==='REVIEWED')){
 const original=oldReview.items.find(item=>item.id===row.id);
 need(original&&JSON.stringify(original.preview)===JSON.stringify(row.preview),'The saved profile must preserve the original complete source preview.');
}
const destinationWorkspace=options['--workspace-id'],destinationInitial=join(root,'receiving-library-initial.json');
await command('Prepare independent receiving library',['create','--workspace',destinationWorkspace,'--mapping',mappingPath,'--name','Receiving operator source mapping','--actor','Receiving operator','--reason','Same original merchant workspace, independent receiving operator library.','--out',destinationInitial]);
const receivedPath=join(root,'received-complete-library.json');
const received=await command('Receive every original version',['receive','--library',destinationInitial,'--source',currentPath,'--out',receivedPath]);
const repeated=await command('Reopen the same original edition',['receive','--library',receivedPath,'--source',currentPath,'--out',join(root,'received-again-complete-library.json')]);
const sent=await read(currentPath),destination=await read(receivedPath),copied=destination.profiles.find(profile=>profile.origin?.profileId===first.profileId);
need(received.received===1&&repeated.received===0&&copied&&JSON.stringify(copied.versions)===JSON.stringify(sent.profiles[0].versions),'Receive the complete unchanged version history once.');
const result={schema:'stellar-forge.bank-source-profile-receiving.v1',completed:true,node:process.version,workspaceId:options['--workspace-id'],receivingWorkspaceId:destinationWorkspace,originalFiles:22,selectedOriginalStatements:2,versions:2,profileId:first.profileId,receivedProfileId:copied.id,originalCollectionPath:originalResult.collectionPath,revisedCollectionPath,phases,files};
await keep('RECEIVING_RESULT.json',result);process.stdout.write(JSON.stringify(result)+'\n');
