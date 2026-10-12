// MIT. Pure commissioning contracts; native engines load only in selected workers.
export const COMMISSIONING_SCHEMA='stellar-forge.sensorthings-commissioning.v1';
export const LIMITS=Object.freeze({sourceBytes:256*1024*1024,rows:250000,entities:50000,page:500,portableBytes:2*1024*1024*1024,responseBytes:64*1024*1024});
export const NATIVE_SOURCE=Object.freeze({repository:'FraunhoferIOSB/FROST-Python-Client',commit:'9f41f7794725fced63fcb07e6b33dbc1f897f2bc',version:'1.1.53',license:'LGPL-3.0-or-later',entry:'frost_sta_client.service.sensorthingsservice.SensorThingsService.execute'});
export const COMMISSIONING_ACTIONS=Object.freeze({
 'commissioning.project.create':['label','description'],
 'commissioning.source.edition':['projectId','editionId','label'],
 'commissioning.source.file':['projectId','filename','expectedSha256','expectedBytes','label','sourceUrl','license','format'],
 'commissioning.target.save':['projectId','label','serviceUrl','authorizationEnv','allowLoopback','requestTimeoutMs','maxResponseBytes'],
 'commissioning.target.inspect':['projectId','targetId','entities'],
 'commissioning.mapping.save':['projectId','sourceId','targetId','label','configuration'],
 'commissioning.plan.prepare':['projectId','mappingId'],
 'commissioning.plan.review':['projectId','planId','decision','actor','note','acknowledgeIssues'],
 'commissioning.run.start':['projectId','planId','reviewId','confirmServiceUrl','acknowledgeWrite'],
 'commissioning.run.resume':['projectId','jobId','confirmServiceUrl','acknowledgeWrite'],
 'commissioning.run.cancel':['projectId','jobId'],
 'commissioning.run.reconcile':['projectId','jobId'],
 'commissioning.run.resolve':['projectId','jobId','stepId','decision','targetIdJson','actor','note'],
 'commissioning.run.verify':['projectId','jobId'],
 'commissioning.rollback.prepare':['projectId','jobId'],
 'commissioning.review.record':['projectId','jobId','decision','actor','note'],
 'commissioning.handoff.prepare':['projectId','label'],
 'commissioning.handoff.receive':['filename','expectedSha256','expectedBytes']
});
export const COMMISSIONING_READS=Object.freeze(['overview','project','source','rows','plan','job','fileRecord']);
export const COMMISSIONING_MEANING=Object.freeze({
 source:'Original source bytes and numeric lexemes, explicit null, missing fields and time roles remain distinct.',
 target:'Only a selected target profile and accepted immutable plan authorize native writes.',
 recovery:'A started write without a retained response awaits reconciliation. An explicit same-job resolution is required before another write.',
 verification:'Comparison reports selected source-to-target fields and exact response identity; it does not infer station uptime or scientific validity.',
 native:NATIVE_SOURCE,
 portable:'Full selected project history, source/plan versions and native journals; pending received jobs need an explicit local binding.'
});
export function commissioningSchema(){return {schema:COMMISSIONING_SCHEMA,actions:COMMISSIONING_ACTIONS,reads:COMMISSIONING_READS,limits:LIMITS,meaning:COMMISSIONING_MEANING};}
