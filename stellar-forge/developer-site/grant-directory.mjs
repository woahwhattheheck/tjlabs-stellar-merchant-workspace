// MIT. Receive the complete Directory chapter into the existing SCF manuscript.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const PARENT='## Referral implementation: source changes, returned outcomes and complete receiving';
const HEADING='### Service-directory commissioning and referral destinations';
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(value,message)=>{if(!value)throw new Error(message);};
function outline(value){
  const result=[];let offset=0,fence=null;
  for(const line of value.split('\n')){
    const marker=line.match(/^ {0,3}(\x60{3,}|~{3,})(.*)$/);
    if(fence){if(marker&&marker[1][0]===fence.character&&marker[1].length>=fence.length&&!marker[2].trim())fence=null;}
    else if(marker)fence={character:marker[1][0],length:marker[1].length};
    else{const match=line.match(/^(#{1,3})[ \t]+(.+?)\s*$/);if(match)result.push({heading:match[1]+' '+match[2],level:match[1].length,start:offset});}
    offset+=line.length+1;
  }
  need(!fence,'Close the original manuscript source fence before receiving its Directory chapter.');
  return result;
}
export function receiveDirectoryGrantChapter(manuscript,chapter,{expectedSha256}={}){
  need(typeof manuscript==='string'&&typeof chapter==='string','Receive both complete original UTF-8 source documents.');
  need(!manuscript.includes('\r'),'Use the complete native LF manuscript; do not normalize unrelated chapter bytes.');
  need(chapter.startsWith(HEADING+'\n')&&chapter.endsWith('\n'),'Receive the complete original Directory H3 chapter.');
  const authored=outline(chapter);
  need(authored.length===1&&authored[0].heading===HEADING,'The product contribution owns only the existing Directory subsection.');
  const headings=outline(manuscript),matches=headings.filter(row=>row.heading===HEADING);
  need(matches.length===1,'Select the one existing Directory subsection; retain missing or duplicate source for reconciliation.');
  const start=matches[0].start,prior=headings.filter(row=>row.start<start&&row.level<=2).at(-1);
  need(prior?.heading===PARENT,'Keep Directory inside the existing Referral implementation chapter.');
  const end=headings.find(row=>row.start>start&&row.level<=3)?.start??manuscript.length;
  const before=manuscript.slice(start,end),after=chapter.trimEnd()+'\n\n';
  const reused=before===after;
  need(reused||(typeof expectedSha256==='string'&&/^[a-f0-9]{64}$/.test(expectedSha256)&&hash(before)===expectedSha256),
    'The current complete Directory subsection differs from the selected preimage; review the current owner source before receiving.');
  return {markdown:manuscript.slice(0,start)+after+manuscript.slice(end),
    receipt:{schema:'stellar-forge.directory-grant-chapter-receiving.v1',parentHeading:PARENT,heading:HEADING,
      before:{bytes:Buffer.byteLength(before),sha256:hash(before)},after:{bytes:Buffer.byteLength(after),sha256:hash(after)},
      prefixSha256:hash(manuscript.slice(0,start)),suffixSha256:hash(manuscript.slice(end)),reused}};
}
export async function runDirectoryGrantReceiving(argv=process.argv.slice(2)){
  const options={};for(let i=0;i<argv.length;i+=2){need(['--manuscript','--chapter','--expected-directory-sha256','--out','--receipt'].includes(argv[i])&&argv[i+1]&&!Object.hasOwn(options,argv[i]),'Supply each complete source receiving argument once.');options[argv[i]]=argv[i+1];}
  for(const key of ['--manuscript','--chapter','--expected-directory-sha256','--out','--receipt'])need(options[key],'Supply '+key+'.');
  const result=receiveDirectoryGrantChapter(await readFile(resolve(options['--manuscript']),'utf8'),await readFile(resolve(options['--chapter']),'utf8'),{expectedSha256:options['--expected-directory-sha256']});
  await writeFile(resolve(options['--out']),result.markdown,{flag:'wx',mode:0o600});
  await writeFile(resolve(options['--receipt']),JSON.stringify(result.receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  return result.receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runDirectoryGrantReceiving().then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
}
