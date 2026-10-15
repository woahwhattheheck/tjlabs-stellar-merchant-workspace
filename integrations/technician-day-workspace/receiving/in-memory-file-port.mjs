export function createReceivingMemoryFS(codec){
 const files=new Map(),directories=new Set(["/"]),normalize=p=>{const parts=[];for(const s of p.split("/")){if(!s||s===".")continue;if(s==="..")parts.pop();else parts.push(s);}return "/"+parts.join("/");};
 const path={resolve:(...p)=>normalize(p.join("/")),join:(...p)=>normalize(p.join("/")),dirname:p=>normalize(p.slice(0,p.lastIndexOf("/"))||"/"),basename:p=>p.slice(p.lastIndexOf("/")+1)};
 const fs={async mkdir(p,options){p=normalize(p);if(directories.has(p)){if(options?.recursive)return;throw Error("EEXIST "+p);}if(!options?.recursive&&!directories.has(path.dirname(p)))throw Error("ENOENT parent "+p);const segments=p.split("/").filter(Boolean);for(let i=1;i<=segments.length;i++)directories.add("/"+segments.slice(0,i).join("/"));},
 async writeFile(p,b,options){p=normalize(p);if(options?.flag==="wx"&&files.has(p))throw Error("EEXIST "+p);if(!directories.has(path.dirname(p)))throw Error("ENOENT parent "+p);files.set(p,typeof b==="string"?codec.utf8Encode(b):new Uint8Array(b));},
 async readFile(p){p=normalize(p);if(!files.has(p))throw Error("ENOENT "+p);return new Uint8Array(files.get(p));}};
 return {fs,path,files};
}
