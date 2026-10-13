#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=name=>readFile(new URL('./'+name,import.meta.url),'utf8');
const [engine,project,workspace,ui]=await Promise.all(['maritime-analysis.mjs','maritime-project-analysis.mjs','maritime-project-workspace.mjs','maritime-project-workbench.js'].map(read));
const target=new URL('./maritime-workbench.html',import.meta.url);
let html=await readFile(target,'utf8');
const plain=source=>source.replace(/^import .*;\n/gm,'').replace(/^export \{[^\n]+\};\n/gm,'').replace(/^export /gm,'');
const sections={
 'MARITIME ENGINE':plain(engine),
 'PROJECT ENGINE':'const PROJECT_ANALYSIS=(()=>{\n'+plain(project)+'\nreturn {validateProject,analyzeProject,projectRowsCSV,projectHTML};\n})();',
 'PROJECT WORKSPACE':'const PROJECT_WORKSPACE=(()=>{\nconst {validateProject,analyzeProject,projectRowsCSV,projectHTML}=PROJECT_ANALYSIS;\n'+plain(workspace)+'\nreturn {analyzeWorkspaceEntries,saveProjectWorkspace,receiveProjectWorkspace,browserProjectReport,projectRowsCSV};\n})();',
 'PROJECT UI':ui
};
for(const [name,body]of Object.entries(sections)){
 const boundary=new RegExp('// BEGIN '+name+'\\n[\\s\\S]*?\\n// END '+name);
 if(!boundary.test(html))throw new Error('Workbench source boundaries missing: '+name);
 if(/<\/script/i.test(body))throw new Error('Unexpected HTML script boundary in source '+name);
 html=html.replace(boundary,()=>'// BEGIN '+name+'\n'+body+'\n// END '+name);
}
const sha=text=>createHash('sha256').update(text).digest('hex');
html=html.replace(/const ENGINE_ID='[a-f0-9]{64}';/,()=>"const ENGINE_ID='"+sha(engine)+"';")
 .replace(/const PROJECT_ENGINE_ID='[a-f0-9]{64}';/,()=>"const PROJECT_ENGINE_ID='"+sha(project)+"';");
await writeFile(target,html);
process.stdout.write('Updated the complete offline workbench from its exact period, project, workspace and UI sources. Open and operate this outgoing version before delivery.\n');
