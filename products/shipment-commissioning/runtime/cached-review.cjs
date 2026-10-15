'use strict';
// Complete-content cache of actual original journal validation. Each new trusted successor
// comes only from the original immutable apply function after its prior journal validates.
const original=require('./shipment-review.cjs');
const valid=new Map();let bytes=0;const LIMIT=32*1024*1024;
function remember(text){if(valid.has(text)){const cost=valid.get(text);valid.delete(text);valid.set(text,cost);return;}const cost=text.length*2;if(cost>LIMIT)return;while(valid.size&&(bytes+cost>LIMIT||valid.size>=256)){const key=valid.keys().next().value;bytes-=valid.get(key);valid.delete(key);}valid.set(text,cost);bytes+=cost;}
function validate(workspace,options={}){if(options.replay===false)return original.validate(workspace,options);const text=JSON.stringify(workspace);if(!valid.has(text))original.validate(workspace);remember(text);return workspace;}
function apply(workspace,command){validate(workspace);const next=original.apply(workspace,command);remember(JSON.stringify(next));return next;}
function exportFiles(workspace){validate(workspace);return original.exportFiles(workspace,{replay:false});}
module.exports={...original,validate,apply,exportFiles};
