'use strict';
module.exports=function gitAdapter(tools,un,repository){
 const sha=x=>{const r=un(x);if(r.error||r.error_code||r.ok===false)throw Error(JSON.stringify(r));const s=r.sha||r.object?.sha||r.data?.sha||r.data?.object?.sha;if(!/^[a-f0-9]{40}$/.test(s||''))throw Error('Missing acknowledged Git SHA');return s;};
 const read=async path=>{const r=un(await tools.mcp__codex_apps__403_solution_fixed_github_read({path}));if(!r.ok||r.status!==200)throw Error('Git read '+r.status+' '+path);return r.data;};
 return {
 getHead:async branch=>(await read('/repos/'+repository+'/git/ref/heads/'+branch)).object.sha,
 treeOf:async commit=>(await read('/repos/'+repository+'/git/commits/'+commit)).tree.sha,
 createBlob:async text=>sha(await tools.mcp__codex_apps__github_create_blob({repository_full_name:repository,content:text,encoding:'utf-8'})),
 createTree:async (base,entries)=>sha(await tools.mcp__codex_apps__github_create_tree({repository_full_name:repository,base_tree_sha:base,tree_elements:entries})),
 createCommit:async (parent,tree,message)=>sha(await tools.mcp__codex_apps__github_create_commit({repository_full_name:repository,parent_sha:parent,tree_sha:tree,message})),
 updateRef:async (branch,expectedHead,nextHead)=>{const r=un(await tools.mcp__codex_apps__github_update_ref({repository_full_name:repository,branch_name:branch,expected_sha:expectedHead,sha:nextHead,force:false}));if(r.error||r.error_code||r.ok===false)throw Error(JSON.stringify(r));const actual=(await read('/repos/'+repository+'/git/ref/heads/'+branch)).object.sha;if(actual!==nextHead)throw Error('Git lease not acknowledged');return true;},
 readBlob:async blob=>{const r=un(await tools.mcp__codex_apps__github_fetch_blob({repository_full_name:repository,blob_sha:blob}));if(typeof r.content!=='string')throw Error('Missing acknowledged blob '+blob);return r.content;}
 };
};
