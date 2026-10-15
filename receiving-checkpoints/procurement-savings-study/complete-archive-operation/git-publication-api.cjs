'use strict';
module.exports = function createGitPublicationApi(tools,un,repository,initialHead,initialTree){
 const trees=new Map([[initialHead,initialTree]]);
 async function api(url){const r=un(await tools.mcp__codex_apps__github_fetch({url}));if(typeof r.content!=='string')throw Error('Missing Git read response');return JSON.parse(r.content);}
 function sha(r,operation){if(!/^[a-f0-9]{40}$/.test(r?.sha))throw Error(operation+' failed: '+JSON.stringify(r));return r.sha;}
 return {
 async getHead(branch){return (await api('https://api.github.com/repos/'+repository+'/git/ref/heads/'+branch)).object.sha;},
 async treeOf(commit){if(trees.has(commit))return trees.get(commit);const t=(await api('https://api.github.com/repos/'+repository+'/git/commits/'+commit)).tree.sha;trees.set(commit,t);return t;},
 async createBlob(text){return sha(un(await tools.mcp__codex_apps__github_create_blob({repository_full_name:repository,content:text,encoding:'utf-8'})),'Create blob');},
 async createTree(base,entries){return sha(un(await tools.mcp__codex_apps__github_create_tree({repository_full_name:repository,base_tree_sha:base,tree_elements:entries})),'Create tree');},
 async createCommit(parent,tree,message){const next=sha(un(await tools.mcp__codex_apps__github_create_commit({repository_full_name:repository,parent_sha:parent,tree_sha:tree,message})),'Create commit');trees.set(next,tree);return next;},
 async updateRef(branch,expected,next){const r=un(await tools.mcp__codex_apps__github_update_ref({repository_full_name:repository,branch_name:branch,expected_sha:expected,sha:next,force:false}));if(r.success!==true)throw Error('Ref update not acknowledged: '+JSON.stringify(r));return true;}
 };
};
