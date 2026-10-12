// MIT. Funding-report drafts, publication and exact receiving in AwardWorkspace.
import {canonical,sha,now,plain,id,integer} from '../core.mjs';
import {demand,transactionCsv} from '../transactions/core.mjs';
import {createFundingReport,inspectFundingReport,encodeFundingDelivery,decodeFundingDelivery,fundingReportHTML,fundingDeliveryFiles,reportContent} from './core.mjs';
export const FUNDING_REPORT_TABLES=Object.freeze(['award_funding_reports','award_funding_report_receipts','award_funding_report_merchants']);
const schema=[
'CREATE TABLE IF NOT EXISTS award_funding_reports(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,status TEXT NOT NULL,parent_id TEXT,capture_id TEXT,review_revision INTEGER,review_sha256 TEXT,operation_key TEXT UNIQUE,input_sha256 TEXT,summary TEXT NOT NULL,packet TEXT NOT NULL,asset BLOB NOT NULL,asset_sha256 TEXT NOT NULL);',
'CREATE TABLE IF NOT EXISTS award_funding_report_receipts(id TEXT PRIMARY KEY,report_id TEXT NOT NULL REFERENCES award_funding_reports(id),at TEXT NOT NULL,asset BLOB NOT NULL,metadata TEXT NOT NULL);',
'CREATE TABLE IF NOT EXISTS award_funding_report_merchants(id TEXT PRIMARY KEY,report_id TEXT NOT NULL REFERENCES award_funding_reports(id),created_at TEXT NOT NULL,input_sha256 TEXT NOT NULL,config TEXT NOT NULL,result TEXT NOT NULL);',
].join('\n');
const read=row=>row?{...row,summary:JSON.parse(row.summary),packet:JSON.parse(row.packet),asset:Buffer.from(row.asset)}:null;
const fields=(value,names)=>demand(plain(value)&&Object.keys(value).every(k=>names.includes(k)),'FUNDING_REPORT_OPTIONS_INVALID');
const noPrivateReportFields=packet=>!Object.hasOwn(packet,'review')&&!Object.hasOwn(packet,'reviews');

export class AwardFundingReports {
  constructor(workspace){this.w=workspace;this.db=workspace.db;this.db.exec(schema);}
  record(reportId){const row=read(this.db.prepare('SELECT * FROM award_funding_reports WHERE id=?').get(id(reportId)));demand(row,'FUNDING_REPORT_NOT_FOUND',undefined,404);return row;}
  view(row){const value=typeof row.summary==='string'?JSON.parse(row.summary):row.summary;return {...value,status:row.status,createdAt:row.created_at,bytes:row.asset?.length??row.asset_bytes,assetSha256:row.asset_sha256,parentId:row.parent_id,operationId:row.operation_key,
    receipts:this.db.prepare('SELECT id,at,metadata FROM award_funding_report_receipts WHERE report_id=? ORDER BY at,id').all(row.id).map(r=>({id:r.id,at:r.at,...JSON.parse(r.metadata)}))};}
  state(){return {reports:this.db.prepare('SELECT id,created_at,status,parent_id,operation_key,summary,asset_sha256,length(asset) AS asset_bytes FROM award_funding_reports ORDER BY created_at DESC,id').all().map(r=>this.view(r)),
    merchants:this.db.prepare('SELECT id,report_id,created_at,result FROM award_funding_report_merchants ORDER BY created_at DESC,id').all().map(r=>({id:r.id,reportId:r.report_id,createdAt:r.created_at,...JSON.parse(r.result)}))};}
  get(reportId){const row=this.db.prepare('SELECT id,created_at,status,parent_id,operation_key,summary,asset_sha256,length(asset) AS asset_bytes FROM award_funding_reports WHERE id=?').get(id(reportId));demand(row,'FUNDING_REPORT_NOT_FOUND',undefined,404);return this.view(row);}
  draft(reportId){const row=this.record(reportId);return {...this.view(row),content:row.packet.content,reviewReference:row.packet.reviewReference};}
  checkReview(row) {
    if(!row.capture_id)return;
    const current=this.w.transactions.summary(row.capture_id).review;
    demand(current&&current.revision===row.review_revision&&sha(current.data)===row.review_sha256,'FUNDING_REPORT_REVIEW_CHANGED','The original workshare assessment changed. Prepare a new report draft from the current review.',409);
  }
  prepare(input) {
    fields(input,['operationId','captureId','beforeCaptureId','sourceReportId','expectedReviewRevision','content']);
    id(input.operationId,'Report operation identity');
    const content=reportContent(input.content),inputDigest=sha({...input,content}),prior=this.db.prepare('SELECT id,input_sha256 FROM award_funding_reports WHERE operation_key=?').get(input.operationId);
    if(prior){demand(prior.input_sha256===inputDigest,'FUNDING_REPORT_OPERATION_CONFLICT',undefined,409);return {...this.get(prior.id),replayed:true};}
    demand(Boolean(input.captureId)!==Boolean(input.sourceReportId),'FUNDING_REPORT_SOURCE_SELECTION_REQUIRED','Choose a completed local capture or an original saved report.');
    let source,reviewReference=null,reviewSha256=null,reviewRevision=null,parentId=null,previousReportSha256=null;
    if(input.sourceReportId) {
      demand(input.beforeCaptureId===undefined&&input.expectedReviewRevision===undefined,'FUNDING_REPORT_RECEIVED_SOURCE_OPTIONS_INVALID');
      const original=this.record(input.sourceReportId);
      source=original.packet.source;reviewReference=original.packet.reviewReference;parentId=original.id;previousReportSha256=original.packet.sha256;
    } else {
      integer(input.expectedReviewRevision,'Original assessment revision',1,1000000000);
      const selected=this.w.transactions.summary(input.captureId),review=selected.review;
      demand(selected.capture.status==='complete'&&review&&review.revision===input.expectedReviewRevision,'FUNDING_REPORT_CURRENT_REVIEW_REQUIRED','Select the completed capture and its saved assessment revision.',409);
      reviewSha256=sha(review.data);reviewRevision=review.revision;
      const after=this.w.transactions.export(input.captureId,{includeReview:false}),before=input.beforeCaptureId?this.w.transactions.export(input.beforeCaptureId,{includeReview:false}):null;
      const editionIds=[...new Set([after.awardEditionId,...(before?[before.awardEditionId]:[])])];
      source={editions:editionIds.map(eid=>this.w.exportEdition(eid,{includeSourceBytes:true,includeReviews:false})),after,before};
      demand(noPrivateReportFields(after)&&(!before||noPrivateReportFields(before)),'FUNDING_REPORT_PRIVATE_REVIEW_INCLUDED');
      reviewReference={captureId:after.captureId,revision:reviewRevision,sourceFingerprint:after.coverage.fingerprint};
    }
    const packet=createFundingReport({source,content,reviewReference,previousReportSha256}),encoded=encodeFundingDelivery(packet),reportId=encoded.report.id;
    return this.w.tx(()=>{
      const again=this.db.prepare('SELECT id,input_sha256 FROM award_funding_reports WHERE operation_key=?').get(input.operationId);
      if(again){demand(again.input_sha256===inputDigest,'FUNDING_REPORT_OPERATION_CONFLICT',undefined,409);return {...this.get(again.id),replayed:true};}
      const record={id:reportId,capture_id:input.captureId??null,review_revision:reviewRevision,review_sha256:reviewSha256};
      this.checkReview(record);
      this.db.prepare('INSERT INTO award_funding_reports VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(reportId,now(),'draft',parentId,record.capture_id,reviewRevision,reviewSha256,input.operationId,inputDigest,canonical(encoded.report),canonical(packet),encoded.bytes,encoded.sha256);
      this.w.operation('funding_report_prepared',reportId,{sourceCaptureId:source.after.captureId,sourceFingerprint:source.after.coverage.fingerprint,sourceReviewRevision:reviewReference?.revision??null,reportSha256:packet.sha256,assetSha256:encoded.sha256});
      return {...this.get(reportId),replayed:false};
    });
  }
  publish({reportId,expectedSha256}) {
    return this.w.tx(()=>{
      const row=this.record(reportId);demand(row.packet.sha256===expectedSha256,'FUNDING_REPORT_REVIEW_MISMATCH','Review the exact complete report before publication.',409);
      if(row.status==='published')return {...this.view(row),replayed:true};
      demand(['draft','received'].includes(row.status),'FUNDING_REPORT_STATE_INVALID',undefined,409);
      this.checkReview(row);inspectFundingReport(row.packet);
      this.db.prepare('UPDATE award_funding_reports SET status=? WHERE id=?').run('published',row.id);
      this.w.operation('funding_report_published',row.id,{reportSha256:row.packet.sha256,assetSha256:row.asset_sha256});
      return {...this.get(row.id),replayed:false};
    });
  }
  receive(bytes,{expectedSha256,receipt={kind:'original_file'}}={}) {
    fields(receipt,['kind','intentId','inboxId','configSha256','sourceSha256','buyerStatus','httpStatus','paymentTerms','url','method']);
    demand(['original_file','original_buyer_response'].includes(receipt.kind),'FUNDING_REPORT_RECEIPT_INVALID');
    const checked=decodeFundingDelivery(bytes,{expectedSha256}),reportId=checked.report.id;
    const metadata={...receipt,bytes:checked.bytes,sha256:checked.sha256},deliveryId='FD-'+sha(metadata);
    return this.w.tx(()=>{
      const existing=this.db.prepare('SELECT id,packet FROM award_funding_reports WHERE id=?').get(reportId);
      if(existing)demand(canonical(JSON.parse(existing.packet))===canonical(checked.packet),'FUNDING_REPORT_ID_CONFLICT',undefined,409);
      else this.db.prepare('INSERT INTO award_funding_reports VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(reportId,now(),'received',null,null,null,null,null,null,canonical(checked.report),canonical(checked.packet),Buffer.from(bytes),checked.sha256);
      const prior=this.db.prepare('SELECT metadata FROM award_funding_report_receipts WHERE id=?').get(deliveryId);
      if(prior)demand(canonical(JSON.parse(prior.metadata))===canonical(metadata),'FUNDING_REPORT_BUYER_RECEIPT_CONFLICT',undefined,409);
      else this.db.prepare('INSERT INTO award_funding_report_receipts VALUES(?,?,?,?,?)').run(deliveryId,reportId,now(),Buffer.from(bytes),canonical(metadata));
      if(!prior)this.w.operation('funding_report_received',reportId,{deliveryId,assetSha256:checked.sha256,reportSha256:checked.packet.sha256,sourceCaptureId:checked.packet.source.after.captureId,...(receipt.intentId?{intentId:receipt.intentId}:{})});
      return {...this.get(reportId),deliveryId,receipt:metadata,replayed:!!prior};
    });
  }
  export(reportId,{kind='delivery',deliveryId}={}) {
    const row=this.record(reportId);
    if(kind==='delivery'){
      if(deliveryId){const delivery=this.db.prepare('SELECT report_id,asset FROM award_funding_report_receipts WHERE id=?').get(id(deliveryId));demand(delivery?.report_id===row.id,'FUNDING_REPORT_DELIVERY_NOT_FOUND',undefined,404);return Buffer.from(delivery.asset);}
      return row.asset;
    }
    demand(deliveryId===undefined,'FUNDING_REPORT_DELIVERY_OPTION_INVALID');
    if(kind==='json')return row.packet;
    if(kind==='html')return fundingReportHTML(row.packet);
    if(kind==='files')return fundingDeliveryFiles(row.packet);
    if(kind==='csv')return transactionCsv(row.packet.source.after.rows,{spreadsheet:true});
    throw Object.assign(new Error('Choose delivery, json, html, csv or files.'),{code:'FUNDING_REPORT_EXPORT_KIND_INVALID'});
  }
  verifyRestored() {
    for(const record of this.db.prepare('SELECT * FROM award_funding_reports').all()){
      const row=read(record),checked=decodeFundingDelivery(row.asset,{expectedSha256:row.asset_sha256});
      demand(checked.report.id===row.id&&canonical(checked.packet)===canonical(row.packet)&&canonical(checked.report)===canonical(row.summary),'FUNDING_REPORT_BACKUP_CHANGED');
      demand(['draft','published','received'].includes(row.status),'FUNDING_REPORT_BACKUP_STATE_INVALID');
      if(row.capture_id){
        const c=this.w.transactions.capture(row.capture_id);
        demand(c.fingerprint===row.packet.source.after.coverage.fingerprint&&c.award_edition_id===row.packet.source.after.awardEditionId,'FUNDING_REPORT_BACKUP_SOURCE_CHANGED');
        const review=this.db.prepare('SELECT data FROM award_tx_review_history WHERE capture_id=? AND revision=?').get(row.capture_id,row.review_revision);
        demand(review&&sha(JSON.parse(review.data))===row.review_sha256,'FUNDING_REPORT_BACKUP_REVIEW_CHANGED');
      }
    }
    for(const row of this.db.prepare('SELECT * FROM award_funding_report_receipts').all()){
      const metadata=JSON.parse(row.metadata),checked=decodeFundingDelivery(row.asset,{expectedSha256:metadata.sha256});
      demand(row.id==='FD-'+sha(metadata)&&row.report_id===checked.report.id&&metadata.bytes===checked.bytes,'FUNDING_REPORT_BACKUP_RECEIPT_CHANGED');
    }
    for(const row of this.db.prepare('SELECT * FROM award_funding_report_merchants').all()){
      const report=this.record(row.report_id),config=JSON.parse(row.config),result=JSON.parse(row.result);
      demand(plain(config)&&plain(result)&&Array.isArray(result.attempts)&&['preparing','interrupted','ready'].includes(result.status),'FUNDING_REPORT_BACKUP_MERCHANT_INVALID');
      demand(row.input_sha256===sha(config)&&row.id==='FM-'+sha(config).slice(0,48)&&config.reportId===report.id&&config.reportSha256===report.packet.sha256&&config.assetSha256===report.asset_sha256,'FUNDING_REPORT_BACKUP_MERCHANT_BINDING_CHANGED');
      if(result.status==='ready')demand(result.reportSha256===report.packet.sha256&&result.assetSha256===report.asset_sha256&&result.bytes===report.asset.length,'FUNDING_REPORT_BACKUP_MERCHANT_ASSET_CHANGED');
      const restored={...result,owner:null,status:result.status==='preparing'?'interrupted':result.status,
        attempts:result.attempts.map(attempt=>{demand(plain(attempt)&&typeof attempt.directory==='string'&&['preparing','interrupted','ready'].includes(attempt.status),'FUNDING_REPORT_BACKUP_MERCHANT_ATTEMPT_INVALID');return attempt.status==='preparing'?{...attempt,status:'interrupted',interruption:'Workspace restored before original preparation completed.'}:attempt;})};
      this.db.prepare('UPDATE award_funding_report_merchants SET result=? WHERE id=?').run(canonical(restored),row.id);
    }
  }
}
