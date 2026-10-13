#!/usr/bin/env node
// MIT. Pure original-source validation for native Accounting and Buyer intake.
import { inspectRozoFinanceSource } from './finance-source.mjs';
import { rozoFinanceMovements } from './finance-projection.mjs';
import { digest } from './model.mjs';
const chunks=[];let length=0;
try{
  for await(const chunk of process.stdin){
    length+=chunk.length;if(length>64*1024*1024)throw Object.assign(new Error('Retain a complete ROZO source up to 64 MiB.'),{code:'ROZO_SOURCE_LIMIT'});
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks),checked=inspectRozoFinanceSource(raw),facts=rozoFinanceMovements(checked.source);
  process.stdout.write(JSON.stringify({schema:'stellar-forge.rozo-finance-inspection.v1',
    sourceBytes:raw.length,sourceSha256:digest(raw),sourceIdentitySha256:checked.sha256,
    sourceId:checked.sourceId,workspaceId:checked.workspaceId,originId:checked.originId,
    profileId:checked.profileId,reportId:checked.reportId,reportSha256:checked.reportSha256,
    reportVersion:checked.reportVersion,reportWorkspaceRevision:checked.reportWorkspaceRevision,
    reportCreatedAt:checked.source.report.value.createdAt,reportPeriod:checked.source.report.value.period,
    profile:checked.source.profile.value,movements:facts.movements,
    originalFiles:checked.source.reportFiles,interpretation:checked.source.interpretation})+'\n');
}catch(error){process.stderr.write(JSON.stringify({code:error.code??'ROZO_SOURCE_INVALID',message:error.message})+'\n');process.exitCode=1;}
