// SPDX-License-Identifier: MIT
import {createCaptureDesk,receiveCaptureDesk,digestDeskText,captureDeskLimits,exportCaptureDesk} from './capture-desk-core.mjs';
export const captureDeskSourceFiles=['blockrun-projections.mjs','blockrun-projections.d.mts','blockrun-example.json','capture-desk-core.mjs','capture-desk-core.d.mts','capture-desk-browser.mjs','capture-desk.css','capture-desk-shell.html','capture-desk-html.mjs','capture-desk-build.mjs','CAPTURE_DESK.md'];
const escapeData=s=>s.replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
function originalBody(s){return s.replace(/^export /gm,'');}
function localBody(s){return originalBody(s.replace(/^import[^\n]+\n/gm,''));}
export function renderCaptureDeskHTML({files,input=null,id='blockrun-example-921ba0-20261013',at='2026-10-13T03:30:00.000Z'}){
 for(const name of captureDeskSourceFiles)if(typeof files[name]!=='string')throw Error('Missing complete source: '+name);
 if(digestDeskText(files['blockrun-projections.mjs'])!==captureDeskLimits().source.projectionSha256)throw Error('Original projection source changed');
 let state;if(input===null)state=createCaptureDesk({raw:files['blockrun-example.json'],filename:'blockrun-example.json',evidence:'AUTHORED_EXAMPLE',id,title:'BlockRun capture review — authored example',at});
 else {const value=JSON.parse(input);state=value.schema==='tjlabs.blockrun-capture-desk-package.v1'?receiveCaptureDesk(input):createCaptureDesk({raw:input,filename:'original-capture.json',evidence:'OPERATOR_CAPTURE',id,title:'BlockRun capture review',at});}
 const seed=exportCaptureDesk(state);
 const source={schema:'tjlabs.blockrun-capture-desk-source.v1',files:captureDeskSourceFiles.map(path=>({path,sha256:digestDeskText(files[path]),content:files[path]}))};
 const projection=originalBody(files['blockrun-projections.mjs']),core=localBody(files['capture-desk-core.mjs']),browser=originalBody(files['capture-desk-browser.mjs']);
 const js='const Projection=(()=>{\n'+projection+'\nreturn {projectBlockrunUsageCapture};})();\nconst Desk=(()=>{const {projectBlockrunUsageCapture}=Projection;\n'+core+'\nreturn {canonicalDesk,digestDeskText,captureDeskLimits,validateCaptureDesk,createCaptureDesk,appendDeskCapture,saveDeskReview,renameCaptureDesk,describeCaptureDesk,compareDeskCaptures,exportCaptureDesk,receiveCaptureDesk,deskRowsCsv};})();\n(()=>{\n'+browser+'\nbootCaptureDesk(Desk);})();';
 const shell=files['capture-desk-shell.html'];
 return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; base-uri \'none\'; form-action \'none\'; object-src \'none\'"><title>BlockRun Capture Desk</title><style>'+files['capture-desk.css']+'</style></head><body><div id="desk">'+shell+'</div><template id="desk-shell">'+shell+'</template><script type="application/json" id="desk-seed">'+escapeData(JSON.stringify(seed))+'</script><script type="application/json" id="desk-source">'+escapeData(JSON.stringify(source))+'</script><script>'+js.replaceAll('</script','<\\/script')+'</script></body></html>\n';
}
