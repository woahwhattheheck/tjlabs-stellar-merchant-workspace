// MIT. Compose the pinned complete package using its maintained source-owned declarations.
// Callers supply the unchanged Acorn parser and byte/hash codecs; no network or filesystem is used.
function composeSelectedPackage(packet, closure, codecs) {
  const { acorn, utf8, utf8Text, sha256, gitHash } = codecs;
  const commit = '09a13eab2f6cd302ca4d6b1ad2222dc09154aa8d';
  const prefix = 'stellar/scf-starforge-20261009/distribution/';
  if(sha256(JSON.stringify(closure)) !== '3d8e1f941dfd16692fecc4bc4fdf666c54f96725c2adebbf730c767b8cf5aa52')
    throw Error('The original complete source selection closure has changed');
  if (packet.metadata?.source?.commit !== commit || packet.metadata?.tree?.truncated)
    throw Error('The complete original Git source is required');
  if (closure.selected.length !== 889 || closure.missing.length || closure.errors.length || closure.missingManifests.length)
    throw Error('The complete selected source closure is required');
  const tree = packet.metadata.tree.tree.filter(x => x.type === 'blob').map(x => ({...x, blob:x.sha}));
  const byPath = new Map(tree.map(x => [x.path,x]));
  const retained = new Map();
  class Bytes extends Uint8Array { toString(encoding='utf8') {
    if (!['utf8','utf-8'].includes(encoding)) throw Error('Unsupported source encoding'); return utf8Text(this);
  }}
  const Buffer = {from(value) { return new Bytes(typeof value === 'string' ? utf8(value) : value); }};
  for (const file of packet.files) {
    if (retained.has(file.path)) throw Error('Duplicate retained source: '+file.path);
    const entry = byPath.get(file.path), bytes = Buffer.from(file.content);
    if (!entry || entry.blob !== file.sha || bytes.length !== file.bytes || gitHash(file.content) !== entry.blob)
      throw Error('Original Git source differs: '+file.path);
    retained.set(file.path, bytes);
  }
  if(retained.size !== 890) throw Error('Expected all 889 selected files and the original license');
  const selected = closure.selected.map(item => {
    const entry = byPath.get(item.path);
    if(!entry || entry.blob !== item.sha || entry.mode !== item.mode || !retained.has(item.path))
      throw Error('Selected source differs: '+item.path);
    return entry;
  });
  if(new Set(selected.map(x=>x.path)).size !== selected.length) throw Error('Duplicate selected path');
  const selectedPathsSet = new Set(selected.map(x=>x.path));
  for(const path of retained.keys()) if(path !== 'LICENSE' && !selectedPathsSet.has(path))
    throw Error('Retained source is outside the selection: '+path);
  const source = name => retained.get(prefix+name)?.toString('utf8') ?? (()=>{throw Error('Missing maintained source: '+name)})();
  // Remove module wiring only. Every selected declaration/function body remains byte-for-byte original.
  const loadModule = (content, imports, cutoff) => {
    const ast=acorn.parse(content,{ecmaVersion:'latest',sourceType:'module'});
    const exported=[], pieces=[];
    for(const node of ast.body) {
      if(cutoff && node.start>=content.indexOf(cutoff)) break;
      if(node.type==='ImportDeclaration') continue;
      if(node.type==='VariableDeclaration' && node.declarations.some(d=>d.id.name==='ownRoot')) continue;
      if(node.type==='ExportNamedDeclaration') {
        if(!node.declaration) throw Error('Unexpected original re-export');
        const declaration=node.declaration;
        if(declaration.id)exported.push(declaration.id.name);
        else for(const d of declaration.declarations)exported.push(d.id.name);
        pieces.push(content.slice(declaration.start,declaration.end));
      } else pieces.push(content.slice(node.start,node.end));
    }
    return new Function(...Object.keys(imports),pieces.join('\n')+'\nreturn {'+exported.join(',')+'};')(...Object.values(imports));
  };
  const createHash = algorithm => {
    if(algorithm !== 'sha256') throw Error('Unsupported source digest');
    let bytes;
    return {update(value){bytes=value;return this;},digest(encoding){if(encoding!=='hex')throw Error('Unsupported digest encoding');return sha256(bytes);}};
  };
  const productModule=loadModule(source('product-package.mjs'),{});
  const selectionModule=loadModule(source('source-selection.mjs'),{...productModule,
    TextDecoder:class {decode(value){return utf8Text(value);}}});
  const specificationModule=loadModule(source('specification.mjs'),{
    createHash,...productModule,...selectionModule
  },'async function originalBytes');
  const {sourceSelectionPath,validateSourceSelection,selectedContributionPaths}=selectionModule;
  const {distributionPath,contributionPaths,composeDistribution}=specificationModule;
  const recipePath=sourceSelectionPath('openlineage-operations');
  const recipeEntry=byPath.get(recipePath),recipeBytes=retained.get(recipePath);
  const recipe=validateSourceSelection(JSON.parse(recipeBytes),recipePath);
  const contributionFiles=selectedContributionPaths(contributionPaths(tree.map(x=>x.path)),recipe);
  const specificationPaths=[distributionPath,...contributionFiles,recipePath];
  const initial=new Map([...specificationPaths,'LICENSE'].map(path=>[path,retained.get(path)]));
  if([...initial.values()].some(x=>!x))throw Error('An original declaration is missing');
  const distribution=composeDistribution({base:JSON.parse(initial.get(distributionPath)),
    contributions:contributionFiles.map(path=>({path,data:JSON.parse(initial.get(path))})),selection:recipe});
  const spec=distribution.spec,product=productModule.productPackageMetadata(spec.product);
  const runtimeSource=source('runtime-profile.mjs');
  const runtimeAst=acorn.parse(runtimeSource,{ecmaVersion:'latest',sourceType:'module'});
  const names=new Set(['plain','version','compare','runtimeNodeRequirement']);
  const runtimePieces=[];
  for(const node of runtimeAst.body) {
    const d=node.type==='ExportNamedDeclaration'?node.declaration:node;
    if(d?.id && names.has(d.id.name) || d?.type==='VariableDeclaration' && d.declarations.some(x=>names.has(x.id.name)))
      runtimePieces.push(runtimeSource.slice(d.start,d.end));
  }
  const runtimeNodeRequirement=new Function(runtimePieces.join('\n')+'\nreturn runtimeNodeRequirement;')();
  const sources=new Map(selected.map(x=>[x.path,retained.get(x.path)]));
  const sourceFormats=spec.sourceFormats??{},dataSources=new Set(Object.keys(sourceFormats));
  for(const [path,format]of Object.entries(sourceFormats))
    selectionModule.parseOriginalSourceData(path,format,sources.get(path));
  const totalBytes=[...sources.values()].reduce((n,x)=>n+x.length,0);
  if(totalBytes!==closure.sourceBytes)throw Error('Original source byte count differs');
  const buildSource=source('build.mjs');
  const start=buildSource.indexOf('const runtimeDependencies = Object.create(null)');
  const end=buildSource.indexOf('const operation = await openDistributionBuild',start);
  if(start<0||end<start)throw Error('Maintained package composition boundary changed');
  const originalComposition=buildSource.slice(start,end);
  const context={spec,product,commit,recipe,recipePath,recipeEntry,recipeBytes,distribution,
    specificationPaths,byPath,initial,selected,sources,totalBytes,sourceFormats,dataSources,
    Buffer,runtimeNodeRequirement,digest:sha256,json:value=>JSON.stringify(value,null,2)+'\n',
    MAX_SOURCE_BYTES:128*1024*1024,MAX_SOURCE_FILE_BYTES:4*1024*1024};
  const result=new Function(...Object.keys(context),originalComposition+
    '\nreturn {manifest,metadata,files,packageBytes};')(...Object.values(context));
  if(result.manifest.files.length!==889 || result.files.length!==893)throw Error('Incomplete package inventory');
  return {...result, sourceCommit:commit, compositionSource:{
    builder:byPath.get(prefix+'build.mjs').blob,
    specification:byPath.get(prefix+'specification.mjs').blob,
    sourceSelection:byPath.get(prefix+'source-selection.mjs').blob,
    productPackage:byPath.get(prefix+'product-package.mjs').blob,
    runtimeProfile:byPath.get(prefix+'runtime-profile.mjs').blob,
    staticClosure:closure.parser
  }};
}
if(typeof module==='object')module.exports={composeSelectedPackage};
