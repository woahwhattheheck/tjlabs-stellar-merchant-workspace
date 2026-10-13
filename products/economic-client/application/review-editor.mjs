// SPDX-License-Identifier: MIT
import {readFileSync} from 'node:fs';
import {createReviewModel} from './review-core.mjs';
import {bootCustomerReview} from './public/customer-review.mjs';

const css=readFileSync(new URL('./public/customer-review.css',import.meta.url),'utf8');
const escapeText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scriptJson=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');

/** Return the complete portable customer document. The browser validates every
 * original file/source and saved edition before enabling its review controls. */
export function renderCustomerReview(document) {
  if(!document||document.schema!=='tjl.economic-client-review.v1'||!document.package)
    throw new Error('Select the complete original customer review document');
  const title=document.package.label||'Economic briefing review';
  const modelSource=createReviewModel.toString(),appSource=bootCustomerReview.toString();
  if(/<\/script/i.test(modelSource+appSource)||/<\/style/i.test(css))
    throw new Error('The maintained inline application source contains a closing element');
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="referrer" content="no-referrer"><title>'+escapeText(title)+' — customer review</title>'+
    '<style id="review-style">'+css+'</style></head><body>'+
    '<main id="review-root"><div class="shell"><div class="panel"><h1>Opening your briefing</h1>'+
    '<p>Checking the complete report, sources and saved review editions.</p></div></div></main>'+
    '<noscript>This complete offline review requires JavaScript. All original files remain embedded in this document.</noscript>'+
    '<script id="review-document" type="application/json">'+scriptJson(document)+'</script>'+
    '<script id="review-runtime">('+appSource+')({root:document.getElementById("review-root"),'+
    'createReviewModel:('+modelSource+'),initialDocument:JSON.parse(document.getElementById("review-document").textContent)});</script>'+
    '</body></html>\n';
}
