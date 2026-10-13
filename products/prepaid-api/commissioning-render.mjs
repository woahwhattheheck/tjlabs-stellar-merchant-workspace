// MIT. Full self-contained source-backed commissioning document.
import {validateCommission} from './commissioning-core.mjs';
const safe=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export function renderCommissioning({state,sources}){
 validateCommission(state);
 for(const name of ['commissioning-hash.mjs','commissioning-core.mjs','commissioning-browser.mjs','commissioning-shell.html','commissioning.css'])if(typeof sources[name]!=='string')throw Error('Missing complete source '+name);
 const hash=sources['commissioning-hash.mjs'].replace(/^export \{.*\};\s*$/m,'');
 const core=sources['commissioning-core.mjs'].replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const names=[...sources['commissioning-core.mjs'].matchAll(/^export (?:function|const) ([A-Za-z0-9_]+)/gm)].map(x=>x[1]);
 const browser=sources['commissioning-browser.mjs'].replace(/^import \* as Core .*;\n/m,'const Core=window.PrepaidCommission;\n').replace(/^import \{sha256\} .*;\n/m,'const sha256=Core.sha256;\n');
 const script='window.PrepaidCommission=(function(){\n'+hash+'\n'+core+'\nreturn {'+names.join(',')+',sha256};})();\n(function(){\n'+browser+'\n})();';
 return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>Prepaid API commissioning</title><style>'+sources['commissioning.css']+'</style></head><body><main id="desk">'+sources['commissioning-shell.html']+'</main><template id="desk-shell">'+sources['commissioning-shell.html']+'</template><script type="application/json" id="commission-data">'+safe(state)+'</script><script type="application/json" id="commission-sources">'+safe(sources)+'</script><script>'+script.replace(/<\/script/gi,'<\\/script')+'</script></body></html>\n';
}
