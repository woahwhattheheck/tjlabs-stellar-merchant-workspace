'use strict';
const core=require('./shipment-review.cjs'),codec=require('./archive-codec.cjs'),zipper=require('./crm-zip.cjs').createCrmZip();
module.exports={core,codec,zipper};
