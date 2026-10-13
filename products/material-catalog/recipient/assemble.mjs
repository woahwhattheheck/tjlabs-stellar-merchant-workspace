// MIT. Pure assembly shared by the file builder and connected source receiving.
export function assembleRecipient(sources,payload=null){
 const names=['sha256.mjs','core.mjs','workspace.mjs','reader.html'];
 for(const name of names)if(typeof sources[name]!=='string')throw new Error('Missing complete reader source: '+name);
 const withoutModules=source=>source.replace(/^import .*;\r?\n/gm,'').replace(/\bexport (?=(?:const|let|class|function|async function)\b)/g,'');
 const script=names.slice(0,3).map(name=>withoutModules(sources[name])).join('\n')+'\nmount(document);\n';
 let html=sources['reader.html'].replace('<html lang="en">','<html lang="en" data-standalone="true">');
 if(!html.includes('<script type="module" id="catalog-application">'))throw new Error('Original reader application marker missing.');
 html=html.replace(/<script type="module" id="catalog-application">[\s\S]*?<\/script>/,()=>'<script type="module" id="catalog-application">\n'+script.replace(/<\/script/gi,'<\\/script')+'</script>');
 if(payload!==null){
  if(typeof payload.name!=='string'||typeof payload.base64!=='string'||!/^[a-f0-9]{64}$/.test(payload.sha256))throw new Error('Invalid original bundle payload.');
  const encoded=JSON.stringify(payload).replaceAll('<','\\u003c');
  html=html.replace('<script id="catalog-payload" type="application/json"></script>',()=>'<script id="catalog-payload" type="application/json">'+encoded+'</script>');
 }
 return html;
}
