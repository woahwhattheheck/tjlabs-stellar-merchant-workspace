// SPDX-License-Identifier: MIT
// Read-only adapter to the original complete Airflow source and Installation.
import {readFileSync} from 'node:fs';
import {readProfile} from '../../sf49_data_commissioning/installation-workorders/profiles.mjs';
import {inspectAirflowInstallation,readAirflowInstallationMember,airflowInstallationTemplate,prepareAirflowInstallation,MAX_HANDOVER_BYTES} from '../../sf49_data_commissioning/installation-workorders/airflow-installation-core.mjs';
function bytes(value,maximum,label){
 if(typeof value!=='string'||value.length>4*Math.ceil(maximum/3))throw new Error('Use the complete original base64 '+label+' within its source limit.');
 const raw=Buffer.from(value,'base64');
 if(raw.length>maximum||raw.toString('base64')!==value)throw new Error('The original '+label+' encoding or size differs.');
 return raw;
}
try {
 const input=JSON.parse(readFileSync(0,'utf8'));
 const raw=bytes(input.sourceBase64,MAX_HANDOVER_BYTES,'Airflow handover');
 let result;
 if(input.action==='inspect')result=inspectAirflowInstallation(raw);
 else if(input.action==='member')result=readAirflowInstallationMember(raw,{path:input.path,offset:input.offset,limit:input.limit});
 else if(input.action==='template')result=airflowInstallationTemplate({raw,seed:input.seed,caseValue:input.caseValue,profile:readProfile('airflow-commissioning').value});
 else if(input.action==='prepare')result=prepareAirflowInstallation({raw,seed:input.seed,caseValue:input.caseValue,profile:readProfile('airflow-commissioning').value,bindings:input.bindings,selectionRaw:bytes(input.cohortBase64,8*1024*1024,'cohort selection'),cohortSourceId:input.cohortSourceId});
 else throw new Error('Select an original Airflow source operation.');
 process.stdout.write(JSON.stringify({ok:true,result}));
} catch(error) {
 process.stdout.write(JSON.stringify({ok:false,error:{code:'AIRFLOW_SOURCE_INPUT',message:error.message}}));process.exitCode=1;
}
