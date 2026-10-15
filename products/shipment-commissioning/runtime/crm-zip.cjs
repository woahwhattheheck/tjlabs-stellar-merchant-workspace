'use strict';
const portable=require('./connected_zip.cjs');
function createCrmZip(){return{zip:files=>portable.packStoredZip(Object.entries(files).map(([name,data])=>({name,data,mode:0o600})),{maxBytes:536870912,maxEntries:65535}),read:data=>portable.readStoredZip(data,{maxBytes:536870912,maxEntries:65535})};}
module.exports={createCrmZip};
