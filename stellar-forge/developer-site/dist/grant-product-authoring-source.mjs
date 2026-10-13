// MIT. Original reviewer source receiving and complete composer-file downloads.
import {productAuthoringContext,previewProductSources,productDeclarationFiles,
  verifyProductSourceImports,MAX_PRODUCT_FILE_BYTES} from './grant-product-authoring-core.mjs';
import {fileBytes,contentHash,reviewerSourceFromDraft} from './grant-handover-source.mjs';
const encoder=new TextEncoder();
const decode=value=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(value);
const need=(value,message)=>{if(!value)throw new Error(message);};

export async function readProductAuthoringContext(draft,bundleId){
  const received=await reviewerSourceFromDraft(draft,bundleId);
  const descriptor=role=>received.bundle.body.files.find(file=>file.role===role);
  const indexFile=descriptor('source-index'),companionFile=descriptor('product-and-finance');
  const indexText=decode(fileBytes(draft,indexFile.sha256));
  const markdown=decode(fileBytes(draft,companionFile.sha256));
  const context=productAuthoringContext(JSON.parse(indexText.replace(/^\uFEFF/,'')),markdown);
  return {...context,bundleId,receivedAt:received.bundle.body.receivedAt,
    applicationSha256:received.bundle.body.applicationSha256,
    sourceIndex:{...indexFile},companion:{...companionFile}};
}
export async function readProductRegistrationFile(file,{receivedAt=new Date().toISOString()}={}){
  need(file&&Number.isSafeInteger(file.size)&&file.size<=MAX_PRODUCT_FILE_BYTES,
    'Choose a complete JSON registration within the existing 16 MiB draft allowance.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  need(bytes.length===file.size,'The selected registration did not finish reading.');
  return {name:file.name,text:decode(bytes),sha256:await contentHash(bytes),bytes:bytes.length,receivedAt};
}

// Store-only ZIP: declaration JSON remains exact UTF-8 and uses the standard
// directory format understood by ordinary unzip tools and the existing composer.
const CRC_TABLE=Uint32Array.from({length:256},(_,index)=>{
  let value=index;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;
});
function crc32(bytes){let value=0xffffffff;for(const byte of bytes)value=CRC_TABLE[(value^byte)&255]^(value>>>8);return(value^0xffffffff)>>>0;}
export function productFilesZip(files){
  need(Array.isArray(files)&&files.length>0&&files.length<=65535,'Select complete declaration files.');
  const seen=new Set(),rows=[];
  let offset=0,directoryBytes=0;
  for(const file of files){
    need(typeof file.path==='string'&&file.path&&!file.path.startsWith('/')&&!/[\\\u0000-\u001f]/.test(file.path)&&
      !file.path.split('/').some(part=>!part||part==='.'||part==='..')&&!seen.has(file.path),
      'Keep distinct relative filenames in the declaration download.');
    seen.add(file.path);
    const name=encoder.encode(file.path),body=typeof file.content==='string'?encoder.encode(file.content):file.content;
    need(body instanceof Uint8Array&&name.length<=65535,'Retain complete file bytes and a supported filename.');
    const size=body.length;
    need(size<0xffffffff&&offset+30+name.length+size<0xffffffff,'This download exceeds the standard ZIP size.');
    rows.push({name,body,size,crc:crc32(body),offset});
    offset+=30+name.length+size;directoryBytes+=46+name.length;
  }
  need(offset+directoryBytes+22<0xffffffff,'This download exceeds the standard ZIP size.');
  const result=new Uint8Array(offset+directoryBytes+22),view=new DataView(result.buffer);
  const word=(at,value)=>view.setUint16(at,value,true),long=(at,value)=>view.setUint32(at,value>>>0,true);
  for(const row of rows){
    const at=row.offset;long(at,0x04034b50);word(at+4,20);word(at+6,0x0800);
    word(at+8,0);word(at+10,0);word(at+12,33);long(at+14,row.crc);
    long(at+18,row.size);long(at+22,row.size);word(at+26,row.name.length);word(at+28,0);
    result.set(row.name,at+30);result.set(row.body,at+30+row.name.length);
  }
  let at=offset;
  for(const row of rows){
    long(at,0x02014b50);word(at+4,20);word(at+6,20);word(at+8,0x0800);
    word(at+10,0);word(at+12,0);word(at+14,33);long(at+16,row.crc);
    long(at+20,row.size);long(at+24,row.size);word(at+28,row.name.length);
    word(at+30,0);word(at+32,0);word(at+34,0);word(at+36,0);long(at+38,0);long(at+42,row.offset);
    result.set(row.name,at+46);at+=46+row.name.length;
  }
  long(at,0x06054b50);word(at+4,0);word(at+6,0);word(at+8,rows.length);word(at+10,rows.length);
  long(at+12,directoryBytes);long(at+16,offset);word(at+20,0);
  return result;
}
/** Receive one complete author selection for both the on-screen preview and ZIP. */
export async function prepareProductDeclarationPreview(draft){
  const selection=draft.productSourceAuthoring?.selection;
  need(selection?.bundleId,'Select the original reviewer source edition for this author project.');
  const bundleId=selection.bundleId;
  const registrations=JSON.parse(JSON.stringify(selection.registrations));
  await verifyProductSourceImports(draft,contentHash);
  const selected=await readProductAuthoringContext(draft,bundleId);
  const preview=previewProductSources(selected,registrations);
  const declarations=productDeclarationFiles(registrations);
  const declarationFiles=await Promise.all(declarations.map(async file=>{
    const bytes=encoder.encode(file.content);
    return {path:file.path,bytes:bytes.length,sha256:await contentHash(bytes)};
  }));
  const chapterCoverage={
    schema:'stellar-forge.grant-product-chapter-coverage.v1',
    basis:{bundleId:selected.bundleId,receivedAt:selected.receivedAt,
      applicationSha256:selected.applicationSha256,
      companion:{...selected.companion},sourceIndex:{...selected.sourceIndex}},
    declarationFiles,
    products:preview.chapterSelection.coverage,
    chapters:preview.chapterSelection.chapters,
    counts:{products:preview.counts.products,presentProducts:preview.counts.selectedProducts,
      absentProducts:preview.counts.absentProducts,presentChapters:preview.counts.selectedChapters,
      absentChapters:preview.counts.absentChapters,sharedChapters:preview.counts.sharedChapters},
  };
  return {selected,preview,declarations,chapterCoverage};
}
export async function exportProductDeclarations(draft){
  const {selected,preview,declarations,chapterCoverage}=await prepareProductDeclarationPreview(draft);
  const guide=[
    '# Product source declarations',
    '',
    'These complete JSON files are read by the maintained Stellar Forge grant composer.',
    '',
    '## Use the declarations',
    '',
    'Extract this ZIP and select its grant-products directory alongside the complete current',
    'reviewer distribution and canonical manuscript:',
    '',
    '~~~sh',
    'node stellar-forge/developer-site/grant-compose.mjs \\',
    '  --directory stellar-forge/developer-site/dist \\',
    '  --manuscript /absolute/path/to/current-canonical.md \\',
    '  --product-registrations-directory /absolute/path/to/extracted/grant-products',
    '~~~',
    '',
    'The directory option selects the complete declaration set. Include the installed',
    'product declarations that should remain active in this set. For an additional product',
    'with a new ID, --product-registration appends its file to the installed defaults.',
    'For an edited existing product, use the selected directory with one file per product.',
    '',
    'The composer selects original immutable source links from that manuscript, binds each',
    'received declaration file, and produces the existing four reviewer outputs.',
    '',
    '## Selected authoring source',
    '',
    'Reviewer bundle: '+selected.bundleId,
    'Application SHA-256: '+selected.applicationSha256,
    'Companion SHA-256: '+selected.companion.sha256,
    'Source-index SHA-256: '+selected.sourceIndex.sha256,
    '',
    'source-index-preview.json is the complete source index computed against this retained',
    'companion. The current canonical manuscript controls the final composed edition.',
    '',
    'product-chapter-coverage.json binds that same complete reviewer edition and every',
    'exported declaration file by bytes and SHA-256. It reports every product heading,',
    'including absent chapters, and retains each present chapter Markdown once with all',
    'of its product IDs. Shared chapters keep separate source ownership. This is coverage',
    'of the selected retained edition; it does not read or certify a newer canonical.',
    '',
    'Present products: '+chapterCoverage.counts.presentProducts+' / '+chapterCoverage.counts.products,
    'Present unique chapters: '+chapterCoverage.counts.presentChapters,
    'Shared chapters: '+chapterCoverage.counts.sharedChapters,
    'Absent products: '+chapterCoverage.counts.absentProducts+' across '+chapterCoverage.counts.absentChapters+' headings',
    '',
    'A registered H2 can stay in its original manuscript location. Receive the later',
    'complete four-file reviewer edition to preview chapters added by a later composition.',
    '',
    '## Included products',
    '',
    ...preview.products.map(product=>'- '+product.id+' — '+product.heading.replace(/^## /,'')+
      (product.chapterPresent?'':' (chapter absent from the selected source edition)')),
    '',
    'Keep the full author-project JSON from the submission workspace to reopen all original',
    'reviewer files, imported registrations, working declarations and saved draft versions.',
    '',
  ].join('\n');
  const files=[...declarations.map(({path,content})=>({path,content})),
    {path:'source-index-preview.json',content:JSON.stringify(preview.index,null,2)+'\n'},
    {path:'product-chapter-coverage.json',content:JSON.stringify(chapterCoverage,null,2)+'\n'},
    {path:'README.md',content:guide}];
  return {files,preview,chapterCoverage,bytes:productFilesZip(files),name:'scf-product-source-declarations.zip'};
}
