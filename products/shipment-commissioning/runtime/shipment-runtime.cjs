'use strict';
const core=require('./cached-review.cjs'),codec=require('./archive-codec.cjs'),zipper=require('./crm-zip.cjs').createCrmZip();
module.exports={core,codec,zipper};
