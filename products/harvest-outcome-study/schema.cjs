'use strict';
const Base=require('./base-schema.cjs'),Harvest=require('./harvest-schema.cjs');const FIELDS={...Base.FIELDS,...Harvest.FIELDS},IDS={...Base.IDS,...Harvest.IDS};module.exports={FIELDS,IDS,KINDS:Object.keys(FIELDS)};
