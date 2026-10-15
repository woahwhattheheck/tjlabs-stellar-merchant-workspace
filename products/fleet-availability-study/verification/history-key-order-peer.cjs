'use strict';
const Core=require('../core.cjs'),Session=require('../session.cjs');
function run(){const study=Core.empty('Retained study identity'),session=Session.create(study),next=Core.clone(study);next.notes='Later successor';const selected=Session.checkpoint(session,next,'Retain original'),restored=Session.historyStudy(selected,selected.history[0]);return{pass:Core.digest(study)===Core.digest(restored),before:Core.digest(study),after:Core.digest(restored),before_keys:Object.keys(study),after_keys:Object.keys(restored)};}
module.exports={run};
