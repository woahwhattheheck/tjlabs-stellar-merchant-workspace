#!/usr/bin/env node
// MIT. Complete original Research edition, customer continuation and native paid delivery.
import { resolve, join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { privateDirectory, readPrivateJson, atomicJson, withPrivateLock } from '../../routescan/quota.mjs';
import { readBytes, writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { Buyer } from '../../../sf88-operator-buyer-cli/node/index.mjs';
import { readFredProject, exportFredProject, receiveFredProject } from '../project.mjs';
import { readFredWorkspaceLaunch } from '../launch.mjs';
import { runResearchAction, readResearchSource } from './project.mjs';
import { need, clone, canonical, sha, digest, catalogue } from './model.mjs';
import { RESEARCH_PACKAGE } from './commerce-model.mjs';
import { createResearchEditionDelivery, encodeResearchEditionDelivery, decodeResearchEditionDelivery,
  receiveResearchEditionDelivery, readResearchEditionReceiving, retainResearchDeliveryBytes } from './delivery.mjs';
import { publishResearchEdition, getResearchPublication } from './commerce.mjs';
import { startResearchMerchant } from './merchant.mjs';
import { prepareResearchPurchase, executeResearchPurchase, recoverResearchPurchase,
  receiveResearchPurchase, readResearchPurchaseReceiving, exportResearchPurchaseReceiving,
  exportResearchCustomerState } from './purchase.mjs';

const SCHEMA='stellar-forge.research-commerce-journey.v1';
const RESULT='stellar-forge.research-commerce-result.v1';
const FULL_LIMIT=480*1024*1024;
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const now=()=>new Date().toISOString();
async function optionalJson(path,limit=16*1024*1024) {
  try{return await readPrivateJson(path,limit);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function retain(path,bytes) {
  try{await writeBytes(path,bytes,{exclusive:true});}
  catch(error){if(error.code!=='EEXIST')throw error;
    need((await readBytes(path,Math.max(1,bytes.length))).equals(bytes),'The original course output changed: '+path);}
  return {path,bytes:bytes.length,sha256:sha(bytes)};
}
async function retainedOrCreate(path,produce,limit=FULL_LIMIT) {
  let bytes;
  try{bytes=await readBytes(path,limit);}
  catch(error){if(error.code!=='ENOENT')throw error;bytes=await produce();await retain(path,bytes);}
  return bytes;
}
const operationId=(operation,name)=>'research-'+digest({operation,name}).slice(0,48);
function selected(state,productId,editionId) {
  const product=catalogue(state).products.find(row=>row.id===productId);
  const edition=product?.editions.find(row=>row.id===editionId);
  need(edition,'Select the actual issued Research edition from the original project.');
  return {product,edition,definition:product.versions.find(row=>row.id===edition.definitionId).definition};
}
function verifyOriginalGraph(received,source,productId,editionId) {
  const a=selected(source,productId,editionId),b=selected(received,productId,editionId);
  need(canonical(a.edition)===canonical(b.edition) && canonical(a.definition)===canonical(b.definition),
    'The receiving project changed the selected original Research product.');
  for(const binding of a.edition.sources) {
    const originalSource=source.research.sources.find(row=>row.id===binding.snapshotId);
    const receivedSource=received.research.sources.find(row=>row.id===binding.snapshotId);
    const originalReview=source.research.reviews.find(row=>row.id===binding.reviewId);
    const receivedReview=received.research.reviews.find(row=>row.id===binding.reviewId);
    need(canonical(originalSource)===canonical(receivedSource)&&canonical(originalReview)===canonical(receivedReview),
      'The receiving project changed an original source or accepted review.');
    const originalDefinition=source.research.entries.find(row=>row.id===binding.entryId).versions.find(row=>row.id===binding.definitionId);
    const receivedDefinition=received.research.entries.find(row=>row.id===binding.entryId).versions.find(row=>row.id===binding.definitionId);
    need(canonical(originalDefinition)===canonical(receivedDefinition),
      'The receiving project changed an original source definition.');
  }
}
export async function runResearchCommerceJourney({directory,projectDirectory,productId,editionId,
  operation='FRED-PAID-RESEARCH-9B2C-20261013',buyerConfig=null,paymentFile=null,
  origin=null,path='/research-products',facilitator=null,allowLocalFacilitator=false,
  merchantPort=null,acceptIndex=0,browserCourse=null,browserConfig=null}={}) {
  need(isAbsolute(directory??'')&&isAbsolute(projectDirectory??''),
    'Use the original economic project and one absolute retained course directory.');
  directory=await privateDirectory(resolve(directory));projectDirectory=resolve(projectDirectory);
  need(directory!==projectDirectory&&!projectDirectory.startsWith(directory+'/')&&!directory.startsWith(projectDirectory+'/'),
    'Keep the programme directory separate from its original economic project.');
  const original=await readFredProject(projectDirectory),pick=selected(original,productId,editionId);
  const paidValues=[buyerConfig,paymentFile,origin,facilitator,merchantPort];
  const paid=paidValues.some(value=>value!==null);
  need(!paid||paidValues.every(value=>value!==null),
    'Supply the complete original Buyer, payment, origin, facilitator and fixed merchant-port selection.');
  need(Number.isSafeInteger(acceptIndex)&&acceptIndex>=0,'Select the original payment alternative.');
  let launch=null,payment=null,paymentBytes=null;
  if(paid) {
    need(isAbsolute(buyerConfig)&&isAbsolute(paymentFile)&&Number.isInteger(merchantPort)&&merchantPort>0&&merchantPort<=65535,
      'Use the installed Buyer/payment files and existing public proxy port.');
    paymentBytes=await readBytes(resolve(paymentFile),65536);payment=JSON.parse(paymentBytes.toString('utf8'));
    need(payment.network==='stellar:testnet','Use the existing installation’s Stellar testnet selection.');
    launch=await readFredWorkspaceLaunch({directory:projectDirectory,buyerConfig:resolve(buyerConfig),
      facilitator,allowLocalFacilitator,merchantPort});
    need(launch.buyerSettings&&launch.binding.buyerConfig,'Use the actual configured native Buyer.');
  }
  need(browserCourse===null?browserConfig===null:browserConfig&&typeof browserConfig==='object'&&!Array.isArray(browserConfig),
    'Select the original browser course and its complete installed browser configuration together.');
  need(browserCourse===null||isAbsolute(browserCourse),'Use the complete installed browser-course module path.');
  if(browserConfig) {
    for(const field of ['playwrightModule','chromium'])need(isAbsolute(browserConfig[field]??''),
      'Use the installed original '+field+' path.');
    for(const field of ['node','pdftoppm'])if(browserConfig[field]!==undefined)need(isAbsolute(browserConfig[field]),
      'Use the installed original '+field+' path.');
  }
  const sourceIds=[...new Set(pick.edition.sources.map(row=>row.snapshotId))];
  const identity={operation,projectDirectory,projectId:original.id,productId,editionId,
    editionSha256:digest(pick.edition),sourceIds,paid,
    ...(paid?{origin,path,paymentSha256:sha(paymentBytes),bindingSha256:launch.binding.sha256,
      buyerSettingsSha256:launch.binding.buyerConfig.settingsSha256,merchantPort,acceptIndex}:{}),
    browserCourse:browserCourse===null?null:'stellar-forge.research-commerce-browser.v1',
    browserConfig:browserConfig===null?null:clone(browserConfig)};
  return withPrivateLock(directory,'journey.lock',async()=>{
    const prior=await optionalJson(join(directory,'journey.json'));
    const originalIdentity=prior?clone(prior.identity):null;
    if(originalIdentity&&isAbsolute(originalIdentity.browserCourse??''))
      originalIdentity.browserCourse='stellar-forge.research-commerce-browser.v1';
    need(!prior||prior.schema===SCHEMA&&canonical(originalIdentity)===canonical(identity),
      'Continue this course with its original source, edition, native bindings and destinations.');
    const journal=prior??{schema:SCHEMA,identity,startedAt:now(),status:'running',steps:[],requests:{},files:[]};
    const save=()=>atomicJson(directory,'journey.json',journal);
    const track=async(path,bytes)=>{
      const value=await retain(path,bytes),existing=journal.files.find(row=>row.path===path);
      if(existing)need(canonical(existing)===canonical(value),'The original saved course file changed.');
      else journal.files.push(value);
      await save();return value;
    };
    const step=async(name,work)=>{
      const previous=journal.steps.find(row=>row.name===name&&row.completedAt);
      if(previous)return previous.result;
      const attempt={name,startedAt:now()};
      journal.active=attempt;await save();
      const result=await work();
      journal.steps.push({...attempt,completedAt:now(),result});
      journal.active=null;await save();
      console.log(JSON.stringify({event:'research_commerce_step',name,result}));
      return result;
    };
    const request=async(name,root,action,fields)=>{
      let value=journal.requests[name];
      if(!value) {
        const state=await readFredProject(root);
        value={action,id:operationId(operation,name),expectedRevision:state.revision,...fields};
        journal.requests[name]=value;await save();
        await track(join(directory,'request-'+name+'.json'),jsonBytes(value));
      }
      need(value.action===action&&value.id===operationId(operation,name),
        'The retained Research course request changed.');
      return value;
    };
    if(journal.status==='completed') {
      for(const f of journal.files) {
        const bytes=await readBytes(f.path,Math.max(1,f.bytes));
        need(bytes.length===f.bytes&&sha(bytes)===f.sha256,'A completed Research course file changed: '+f.path);
      }
      return journal.result;
    }
    // Source repair is an explicit executable edition of this same retained business case.
    // Keep complete original/current source bytes while preserving accepted steps and inputs.
    const nativeSourceBytes=await readFile(new URL(import.meta.url));
    const browserSourceBytes=browserCourse===null?null:await readFile(resolve(browserCourse));
    const sourceSelection={nativePath:new URL(import.meta.url).href,nativeSha256:sha(nativeSourceBytes),
      browserPath:browserCourse===null?null:resolve(browserCourse),
      browserSha256:browserSourceBytes===null?null:sha(browserSourceBytes)};
    const sourceEditionId=digest(sourceSelection);
    const sourceRoot=await privateDirectory(join(directory,'source-editions',sourceEditionId));
    await track(join(sourceRoot,'commerce-journey.mjs'),nativeSourceBytes);
    if(browserSourceBytes)await track(join(sourceRoot,'commerce-browser.mjs'),browserSourceBytes);
    journal.sourceEditions??=[];
    if(!journal.sourceEditions.some(row=>row.id===sourceEditionId))
      journal.sourceEditions.push({id:sourceEditionId,...sourceSelection,receivedAt:now()});
    journal.status='running';delete journal.error;await save();
    let seller=null;
    try {
      const packagePath=join(directory,RESEARCH_PACKAGE);
      const packageResult=await step('original-issued-package',async()=>{
        const bytes=await retainedOrCreate(packagePath,async()=>{
          const sources=[];for(const id of sourceIds)sources.push(await readResearchSource(projectDirectory,id));
          return encodeResearchEditionDelivery(createResearchEditionDelivery({state:original,sources,productId,editionId,
            note:'Complete original issued product selected for customer receiving.'}));
        });
        const checked=decodeResearchEditionDelivery(bytes);
        need(checked.delivery.sourceProjectId===original.id&&checked.delivery.editionId===editionId,
          'The course package lost its original economic project and edition.');
        const file=await track(packagePath,bytes);
        await retainResearchDeliveryBytes(directory,bytes);
        return {...file,deliverySha256:checked.delivery.deliverySha256,manifestSha256:checked.delivery.manifestSha256,
          productId,editionId,sources:sourceIds.length,files:checked.files.length};
      });
      const packageBytes=await readBytes(packagePath,packageResult.bytes);
      const customer=await step('independent-customer-receiving',async()=>{
        const receiving=await receiveResearchEditionDelivery({directory:join(directory,'customer'),bytes:packageBytes});
        need(isAbsolute(receiving.projectDirectory??''),'The customer receiver must return its actual economic project directory.');
        const state=await readFredProject(receiving.projectDirectory);
        verifyOriginalGraph(state,original,productId,editionId);
        for(const id of sourceIds)need(canonical(await readResearchSource(receiving.projectDirectory,id))===
          canonical(await readResearchSource(projectDirectory,id)),'An independently received original source changed.');
        const reread=await readResearchEditionReceiving(join(directory,'customer'));
        need(reread.bytes.equals(packageBytes),'The customer receiver changed the purchased package bytes.');
        return receiving;
      });
      const edited=await step('customer-product-continuation',async()=>{
        const state=await readFredProject(customer.projectDirectory),current=selected(state,productId,editionId);
        const definition=clone(current.definition);
        definition.notes='Customer receiving programme '+operation+
          ': this working definition continues the retained original edition in the independently received project. '+
          'The complete earlier notes remain in the retained original product definition and issued edition.';
        const saved=await request('customer-product-save',customer.projectDirectory,'research-product-save',{definition});
        await runResearchAction({directory:customer.projectDirectory,request:saved});
        const issue=await request('customer-product-issue',customer.projectDirectory,'research-product-issue',
          {productId,issuedBy:'Native customer receiving programme',note:'Following working edition for '+operation});
        const issued=await runResearchAction({directory:customer.projectDirectory,request:issue});
        const after=await readFredProject(customer.projectDirectory);
        verifyOriginalGraph(after,original,productId,editionId);
        need(issued.edition.id!==editionId&&after.research.products.find(row=>row.id===productId)
          .editions.some(row=>row.id===issued.edition.id),'Retain the original and following customer editions together.');
        return {projectId:after.id,projectDirectory:customer.projectDirectory,originalEditionId:editionId,
          followingEditionId:issued.edition.id,revision:after.revision};
      });
      const restored=await step('whole-customer-project-transfer',async()=>{
        const file=join(directory,'complete-customer-project.json');
        const bytes=await retainedOrCreate(file,async()=>jsonBytes(await exportFredProject({directory:customer.projectDirectory})));
        const bundle=JSON.parse(bytes.toString('utf8'));
        need(bundle.schema==='stellar-forge.fred-project-bundle.v8',
          'The complete customer project must retain its original received paid-package extension.');
        await track(file,bytes);
        const target=join(directory,'restored-customer-project');
        const receipt=await receiveFredProject({directory:target,bundle});
        const exported=await exportFredProject({directory:target});
        need(canonical(exported)===canonical(bundle),'The complete Research customer project changed through independent restore.');
        await track(join(directory,'restored-complete-customer-project.json'),jsonBytes(exported));
        const state=await readFredProject(target);verifyOriginalGraph(state,original,productId,editionId);
        need(state.research.products.find(row=>row.id===productId).editions.some(row=>row.id===edited.followingEditionId),
          'The restored project lost the customer’s continued work.');
        return {directory:target,receipt,bundleSha256:bundle.bundleSha256,followingEditionId:edited.followingEditionId};
      });
      let financial=null;
      if(paid) {
        await track(join(directory,'public-payment.json'),paymentBytes);
        const publication=await step('native-publication',async()=>{
          const req=await request('publish',projectDirectory,'research-publish',
            {productId,editionId,note:'Complete original issued product selected for customer receiving.',origin,path,payment});
          return publishResearchEdition({directory:projectDirectory,...req});
        });
        const merchant=await getResearchPublication(projectDirectory,publication.publicationId);
        need(merchant.deliveryBytes.equals(packageBytes),'The paid publication differs from the original complete selected package.');
        seller=await startResearchMerchant({directory:merchant.directory,port:merchantPort,facilitator,allowLocalFacilitator});
        const buyer=new Buyer(launch.buyerSettings);
        const intentId=operationId(operation,'purchase-complete-edition');
        const purchase=await step('original-buyer-preparation',async()=>{
          const value=await prepareResearchPurchase({directory:merchant.directory,intentId,acceptIndex});
          await track(join(directory,'original-prepared-purchase.json'),jsonBytes(value));
          return value;
        });
        await step('native-purchase-and-recovery',async()=>{
          const delivered=await executeResearchPurchase({directory:merchant.directory,buyer,purchase});
          need(delivered.state==='DELIVERED'&&delivered.result,'Continue the actual original Buyer result until complete.');
          const recovered=await recoverResearchPurchase({directory:merchant.directory,buyer,intentId});
          need(recovered.state==='DELIVERED'&&recovered.sha256===delivered.sha256&&recovered.bytes===delivered.bytes,
            'The same native Buyer intent recovered another original result.');
          const bytes=await recovered.result.bytes({limit:recovered.bytes});
          need(bytes.equals(packageBytes),'The paid native response changed the selected complete Research package.');
          await track(join(directory,'native-paid-'+RESEARCH_PACKAGE),bytes);
          return {intentId,publicationId:merchant.plan.publicationId,bytes:bytes.length,sha256:sha(bytes),
            nativeConfigSha256:recovered.result.record.configSha256};
        });
        const receiving=await step('paid-customer-receiving',async()=>{
          const value=await receiveResearchPurchase({directory:merchant.directory,buyer,intentId,
            receivingDirectory:join(directory,'paid-customer')});
          const opened=await readResearchPurchaseReceiving({directory:merchant.directory,intentId});
          need(opened.bytes.equals(packageBytes),'The original paid receiving changed its complete package.');
          const target=await privateDirectory(join(directory,'paid-customer-downloads')),files=[];
          for(const file of merchant.plan.downloads) {
            const download=await exportResearchPurchaseReceiving({directory:merchant.directory,intentId,file:file.path});
            need(download.bytes.length===file.bytes&&sha(download.bytes)===file.sha256,
              'The received customer download differs from the original advertised file: '+file.path);
            files.push(await track(join(target,file.path),download.bytes));
          }
          return {receiving:value,files};
        });
        financial=await step('publication-and-customer-project-handover',async()=>{
          const unstartedId=operationId(operation,'retained-unstarted-purchase');
          const unstarted=await prepareResearchPurchase({directory:merchant.directory,intentId:unstartedId,acceptIndex});
          const archivePath=join(directory,'complete-merchant-project.json');
          const bytes=await retainedOrCreate(archivePath,async()=>jsonBytes(await exportFredProject({directory:projectDirectory})));
          await track(archivePath,bytes);
          const bundle=JSON.parse(bytes.toString('utf8')),target=join(directory,'restored-merchant-project');
          const before=bundle.researchCommerce?.publications.find(row=>row.id===merchant.plan.publicationId)?.customer;
          need(before?.requests.some(row=>row.purchase.intentId===intentId)&&
            before.requests.some(row=>row.purchase.intentId===unstartedId),
            'The original whole-project handover must contain both retained customer requests.');
          const receipt=await receiveFredProject({directory:target,bundle});
          const next=await getResearchPublication(target,merchant.plan.publicationId);
          need(canonical(await exportResearchCustomerState(next.directory))===canonical(before),
            'The transferred merchant lost its original customer requests or receiving choices.');
          const recovered=await recoverResearchPurchase({directory:next.directory,buyer,intentId});
          const prepared=await recoverResearchPurchase({directory:next.directory,buyer,intentId:unstartedId});
          need(recovered.state==='DELIVERED'&&prepared.state==='PREPARED_NOT_STARTED',
            'The restored project must reopen the same paid and unstarted original Buyer intents.');
          const reexport=await exportFredProject({directory:target});
          need(canonical(reexport)===canonical(bundle),'The restored merchant project changed its original full handover.');
          await track(join(directory,'restored-complete-merchant-project.json'),jsonBytes(reexport));
          return {publicationId:merchant.plan.publicationId,intentId,receiving,receipt,directory:target,
            originalCustomerStateSha256:digest(before),unstartedIntentId:unstarted.intentId,
            bundleSha256:bundle.bundleSha256};
        });
      }
      let rendered=null;
      if(browserCourse!==null) {
        await seller?.close?.();seller=null;
        need(isAbsolute(browserCourse),'Use the complete installed browser-course module path.');
        const module=await import(pathToFileURL(resolve(browserCourse)).href);
        need(typeof module.runResearchCommerceBrowserCourse==='function',
          'Use the original complete Research commerce browser course.');
        rendered=await step('actual-browser-and-attachments',()=>module.runResearchCommerceBrowserCourse({
          directory,projectDirectory,customer,restored,financial,identity,journal:clone(journal),
          browserConfig:clone(browserConfig),
          launchOptions:{buyerConfig:paid?resolve(buyerConfig):null,facilitator,allowLocalFacilitator,merchantPort}}));
      }
      const originalProject=await step('complete-original-project-after-browser',async()=>{
        const file=join(directory,'complete-original-project.json');
        const bytes=await retainedOrCreate(file,async()=>jsonBytes(await exportFredProject({directory:projectDirectory})));
        const bundle=JSON.parse(bytes.toString('utf8'));
        need(bundle.state.id===original.id,'The final complete project must retain the original producer identity.');
        const saved=await track(file,bytes);
        return {...saved,projectId:bundle.state.id,revision:bundle.state.revision,bundleSha256:bundle.bundleSha256};
      });
      journal.result={schema:RESULT,operation,originalProjectId:original.id,originalProject,productId,editionId,
        package:packageResult,customer,edited,restored,financial,rendered,files:clone(journal.files),
        sourceEditions:clone(journal.sourceEditions),
        startedAt:journal.startedAt,completedAt:now(),runtime:{node:process.version,platform:process.platform}};
      journal.status='completed';journal.completedAt=journal.result.completedAt;
      await save();await atomicJson(directory,'result.json',journal.result);
      return journal.result;
    } catch(error) {
      journal.status='interrupted';journal.error={code:error.code??'RESEARCH_COMMERCE_INTERRUPTED',
        message:error.message,at:now()};await save();throw error;
    } finally {await seller?.close?.().catch(()=>{});}
  });
}
async function main(args=process.argv.slice(2)) {
  const flags={},values=new Set(['directory','project','product','edition','operation','buyer-config','payment',
    'origin','path','facilitator','merchant-port','accept-index','browser-course','browser-config']);
  for(let index=0;index<args.length;index++) {
    const arg=args[index];need(/^--[a-z-]+$/.test(arg),'Use the original Research course options.');
    const name=arg.slice(2);need(flags[name]===undefined,'Use each Research option once.');
    if(name==='allow-local-facilitator'){flags[name]=true;continue;}
    need(values.has(name)&&args[index+1]&&!args[index+1].startsWith('--'),'Supply the complete option value.');
    flags[name]=args[++index];
  }
  const result=await runResearchCommerceJourney({directory:flags.directory,projectDirectory:flags.project,
    productId:flags.product,editionId:flags.edition,operation:flags.operation??'FRED-PAID-RESEARCH-9B2C-20261013',
    buyerConfig:flags['buyer-config']??null,paymentFile:flags.payment??null,origin:flags.origin??null,
    path:flags.path??'/research-products',facilitator:flags.facilitator??null,
    allowLocalFacilitator:Boolean(flags['allow-local-facilitator']),
    merchantPort:flags['merchant-port']===undefined?null:Number(flags['merchant-port']),
    acceptIndex:Number(flags['accept-index']??0),browserCourse:flags['browser-course']??null,
    browserConfig:flags['browser-config']?await readPrivateJson(resolve(flags['browser-config']),65536):null});
  console.log(JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{console.error(JSON.stringify({code:error.code??'RESEARCH_COMMERCE_INTERRUPTED',
    message:error.message}));process.exitCode=1;});
