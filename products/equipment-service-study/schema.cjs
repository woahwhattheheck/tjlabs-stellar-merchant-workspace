'use strict';
const Base=require('./base-schema.cjs'),Commerce=require('./service-commerce.cjs');
for(const key of Object.keys(Commerce.FIELDS))if(Base.FIELDS[key])throw Error('Record family collision: '+key);
const FIELDS={...Base.FIELDS,...Commerce.FIELDS},IDS={...Base.IDS,...Commerce.IDS};
module.exports={FIELDS,IDS,KINDS:Object.keys(FIELDS)};
