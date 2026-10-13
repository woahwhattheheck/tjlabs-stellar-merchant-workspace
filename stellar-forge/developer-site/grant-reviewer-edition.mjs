// MIT. A dated working edition in the existing four-file submission source format.
import {makeSource,parseAnswers} from './dist/grant-submission-core.mjs';
import {contentHash,gitBlob,createSourceBundle,createReviewerSourcePackage} from './dist/grant-handover-source.mjs';

const REPOSITORY='woahwhattheheck/tjlabs-stellar-merchant-workspace';
const PREFIX='stellar-forge/developer-site/dist/grant-data/';
const encoder=new TextEncoder();
const metadata=async text=>{const bytes=encoder.encode(text);return {bytes:bytes.length,sha256:await contentHash(bytes),git_blob:await gitBlob(bytes)};};

/** Validate the complete original edition before composing a separately selected working source. */
export async function composeReviewerWorkingEdition({
  application,originalApplication,indexText,budgetText,companionText,sourceCommit,
  receivedAt=new Date().toISOString(),
}={}){
  for(const [name,value] of Object.entries({application,originalApplication,indexText,budgetText,companionText}))
    if(typeof value!=='string')throw new Error('Supply complete UTF-8 '+name+'.');
  if(!/^[a-f0-9]{40}$/.test(sourceCommit||''))throw new Error('Select the exact original source commit.');
  if(!Number.isFinite(Date.parse(receivedAt)))throw new Error('Retain the source composition timestamp.');
  parseAnswers(application);
  const original=JSON.parse(indexText),originalUrl='https://github.com/'+REPOSITORY+'/blob/'+sourceCommit+'/'+PREFIX;
  const oldSource=makeSource({markdown:originalApplication,index:original,url:originalUrl+'application.md',receivedAt});
  const budgetBytes=encoder.encode(budgetText),companionBytes=encoder.encode(companionText);
  // Reuse the maintained original byte/hash checks for both source roles.
  await createSourceBundle(oldSource,{indexBytes:encoder.encode(indexText),budgetBytes,companionBytes,receivedAt});
  const index=JSON.parse(JSON.stringify(original)),applicationMeta=await metadata(application);
  index.application={path:'application-reviewer.md',...applicationMeta};
  index.narrative_source={
    basis:'Concise working edition of the complete current nine-answer application; prospective financial and delivery commitments preserved.',
    operation:'SCF-REVIEWER-CONCISE-SOURCE-20261013-BC3D',authored_at:receivedAt,
    source_repository:REPOSITORY,source_commit:sourceCommit,
    original_application:{path:PREFIX+'application.md',...await metadata(originalApplication),markdown:originalApplication},
    original_source_index:{path:PREFIX+'source-index.json',...await metadata(indexText)},
    retained_canonical_narrative:original.narrative_source??null,
    official_requirements:{
      reviewed_at:'2026-10-13',
      criteria:'https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/submission-criteria',
      open_track:'https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/open-track',
      budget:'https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines',
      rules:'https://stellar.gitbook.io/scf-handbook/scf-awards/official-rules-for-submissions',
      round:'https://communityfund.stellar.org/awards/recxrSMYwAl8vcglg',
      full_submission_date:'2026-11-08',
      field_limits:'Apply only the actual issuer fields and limits when the invitation/form is available.',
    },
  };
  const workingUrl='https://github.com/'+REPOSITORY+'/blob/main/'+PREFIX;
  if(index.submission_workspace){
    index.submission_workspace.application_route='/grant-data/application-reviewer.md';
    index.submission_workspace.source_index_route='/grant-data/reviewer-working-index.json';
    index.submission_workspace.application_sha256=applicationMeta.sha256;
    index.submission_workspace.application_git_blob=applicationMeta.git_blob;
    index.submission_workspace.source_choice='Explicit dated working edition; the original manuscript remains a separate selectable source.';
  }
  const newIndex=JSON.stringify(index,null,2)+'\n';
  const source=makeSource({markdown:application,index,url:workingUrl+'application-reviewer.md',receivedAt});
  const received={source,...await createSourceBundle(source,{
    indexBytes:encoder.encode(newIndex),budgetBytes,companionBytes,receivedAt,
    urls:{application:source.url,'source-index':workingUrl+'reviewer-working-index.json',
      budget:originalUrl+'budget.csv','product-and-finance':originalUrl+'product-and-finance.md'},
  })};
  return {application,index:newIndex,package:await createReviewerSourcePackage(received,{exportedAt:receivedAt}),
    sourceCommit,applicationMeta,bundleId:received.bundle.id};
}

const HELP=`Compose a complete optional reviewer working edition.

node stellar-forge/developer-site/grant-reviewer-edition.mjs \\
  --application /absolute/edited-nine-answers.md \\
  --source-root /absolute/original/dist/grant-data \\
  --source-commit ORIGINAL_40_CHARACTER_COMMIT \\
  --out /absolute/new-reviewer-edition

The original directory supplies application.md, source-index.json, budget.csv and
product-and-finance.md. All original identities are verified before writing.
The new directory contains application-reviewer.md, reviewer-working-index.json
and reviewer-working-source.json. Open the complete JSON with Source editions
in the existing submission workspace; compare before receiving its answers.
Publish all three files together through the maintained browser asset manifest.
`;

async function main(argv){
  if(argv.length===1&&['--help','-h'].includes(argv[0])){process.stdout.write(HELP);return;}
  const allowed=new Set(['--application','--source-root','--source-commit','--out']),args={};
  for(let i=0;i<argv.length;i+=2){
    const key=argv[i],value=argv[i+1];
    if(!allowed.has(key)||value===undefined||value.startsWith('--')||args[key]!==undefined)
      throw new Error('Use each complete documented option once. Run --help for usage.');
    args[key]=value;
  }
  if([...allowed].some(key=>!args[key]))throw new Error('Supply all four documented options. Run --help for usage.');
  const fs=await import('node:fs/promises'),path=await import('node:path');
  const sourceRoot=path.resolve(args['--source-root']),out=path.resolve(args['--out']);
  const read=async file=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await fs.readFile(file));
  const [application,originalApplication,indexText,budgetText,companionText]=await Promise.all([
    read(path.resolve(args['--application'])),...['application.md','source-index.json','budget.csv','product-and-finance.md'].map(name=>read(path.join(sourceRoot,name))),
  ]);
  const result=await composeReviewerWorkingEdition({application,originalApplication,indexText,budgetText,companionText,sourceCommit:args['--source-commit']});
  await fs.mkdir(out,{mode:0o700});
  // Exclusive output keeps an earlier complete edition intact.
  for(const [name,body] of [['application-reviewer.md',result.application],['reviewer-working-index.json',result.index],['reviewer-working-source.json',result.package]])
    await fs.writeFile(path.join(out,name),body,{encoding:'utf8',flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({directory:out,sourceCommit:result.sourceCommit,application:result.applicationMeta,bundleId:result.bundleId})+'\n');
}

if(typeof process!=='undefined'&&process.argv[1]){
  const {pathToFileURL}=await import('node:url');
  if(import.meta.url===pathToFileURL(process.argv[1]).href)
    main(process.argv.slice(2)).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
}
