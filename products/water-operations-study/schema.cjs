'use strict';
const B=require('./base-schema.cjs'),L=require('./lab-schema.cjs');
const FIELDS={...B.FIELDS,...L.FIELDS},IDS={...B.IDS,...L.IDS};module.exports={FIELDS,IDS,KINDS:Object.keys(FIELDS)};
