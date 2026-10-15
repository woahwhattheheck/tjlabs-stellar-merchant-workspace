function gitArchiveAPI(un,repo){
 const value=x=>{const r=un(x);return typeof r?.content==='string'?JSON.parse(r.content):r;};
 const sha=(x,what)=>{const r=value(x);if(!/^[a-f0-9]{40}$/.test(r?.sha||''))throw Error(what+' returned '+JSON.stringify(r).slice(0,1000));return r.sha;};
 return {
  getHead:async branch=>{const r=value(await tools.mcp__codex_apps__github_fetch({url:'https://api.github.com/repos/'+repo+'/git/ref/heads/'+branch}));if(!r.object?.sha)throw Error('Missing actual Git head');return r.object.sha;},
  treeOf:async head=>{const r=value(await tools.mcp__codex_apps__github_fetch({url:'https://api.github.com/repos/'+repo+'/git/commits/'+head}));if(!r.tree?.sha)throw Error('Missing Git tree');return r.tree.sha;},
  createBlob:async content=>sha(await tools.mcp__codex_apps__github_create_blob({repository_full_name:repo,content,encoding:'utf-8'}),'Archive blob'),
  createTree:async(base_tree_sha,tree_elements)=>sha(await tools.mcp__codex_apps__github_create_tree({repository_full_name:repo,base_tree_sha,tree_elements}),'Archive tree'),
  createCommit:async(parent_sha,tree_sha,message)=>sha(await tools.mcp__codex_apps__github_create_commit({repository_full_name:repo,parent_sha,tree_sha,message}),'Archive commit'),
  updateRef:async(branch_name,expected_sha,next)=>{const r=value(await tools.mcp__codex_apps__github_update_ref({repository_full_name:repo,branch_name,expected_sha,sha:next,force:false}));return r.success===true;}
 };
}
