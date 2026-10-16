import {mkdir,mkdtemp,rename,rm,stat,writeFile} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,relative,resolve} from 'node:path';

const need=(condition,message)=>{if(!condition)throw new Error(message);};

/** Publish a complete new directory, never a partially written destination. */
export async function publishNewExportDirectory(directory,files,manifest){
  const destination=resolve(directory),parent=dirname(destination);
  await mkdir(parent,{recursive:true,mode:0o700});
  try{await stat(destination);throw new Error('The selected output directory already exists.');}
  catch(error){if(error?.code!=='ENOENT')throw error;}
  const staging=await mkdtemp(join(parent,'.'+basename(destination)+'.staging-'));
  let published=false;
  try{
    const entries=[...files,['manifest.json',JSON.stringify(manifest,null,2)+'\n']];
    for(const[name,text]of entries){
      const target=resolve(staging,name),inside=relative(staging,target);
      need(inside&&!inside.startsWith('..')&&!isAbsolute(inside),'Keep every export file inside its selected directory.');
      await mkdir(dirname(target),{recursive:true,mode:0o700});
      const bytes=typeof text==='string'?Buffer.from(text,'utf8'):Buffer.from(text);
      await writeFile(target,bytes,{flag:'wx',mode:0o600});
    }
    try{await stat(destination);throw new Error('The selected output directory already exists.');}
    catch(error){if(error?.code!=='ENOENT')throw error;}
    await rename(staging,destination);
    published=true;
  }finally{
    if(!published)await rm(staging,{recursive:true,force:true});
  }
  return destination;
}
