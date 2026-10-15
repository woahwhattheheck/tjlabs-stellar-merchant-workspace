'use strict';
// Resume the production complete exporter from its original compact workload.
// Caller persists the returned checkpoint and verifies its retained byte SHA
// before passing it back. Whole inputs and source identity remain immutable.
module.exports=function advance(B,files,bank,{verifiedInputSha256,checkpoint=null,maxGroups=1,maxMilliseconds=25000,finish=false,progress=()=>{}}={}){
 const original=JSON.stringify(bank);if(B.C.hashText(original)!==verifiedInputSha256)throw Error('Complete compact receiving workload differs');
 const R=require('./checkpoint-reader.cjs')(bank),state=R.read(R.field(R.root,'state')),records=R.sequence(R.field(R.root,'records')),editions=R.sequence(R.field(R.root,'editions'));
 const create=Function(B.strip(files['host/export-core.mjs'])+';return createProcurementSavingsStudyExportJob;')();
 const job=create(files,state,records,editions,{codec:B.C,core:B.core,originalSessions:B.M,sessions:B.sessions,buildDesk:B.build,zip:B.zip,observeEntry:progress},{verifiedInputSha256,checkpoint});
 const status=job.run({maxGroups,maxMilliseconds});return{status,checkpoint:job.checkpoint(),bytes:status.done&&finish?job.finish():null};
};
