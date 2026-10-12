// MIT — Independent project action; the original reading and review controls stay intact.
const aside=document.getElementById('savedSearches');
if(aside&&!document.getElementById('researchProject')){
 const section=document.createElement('section');section.id='researchProject';section.className='researchProject';
 const heading=document.createElement('h2');heading.textContent='Editable project';
 const description=document.createElement('p');description.textContent='Keep original files, retained search editions, saved searches and review history together.';
 const button=document.createElement('button');button.className='wide';button.textContent='Download complete project';button.type='button';
 const help=document.createElement('p');help.textContent='Receive the private .sfrp archive in a fresh folder with the buyer-research-project command. Python 3.10+ is required.';
 const message=document.createElement('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 section.append(heading,description,button,help,message);aside.append(section);
 button.addEventListener('click',async()=>{
  button.disabled=true;message.textContent='Preparing the complete project and its retained original files…';
  try{
   const token=sessionStorage.getItem('resourceResearchToken');
   if(!token)throw new Error('Open the private research URL printed by the server.');
   const response=await fetch('/api/content-search/project',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
   const value=await response.json();
   if(!response.ok)throw new Error(value.error==='PROJECT_HANDOVER_PREPARATION_ACTIVE'?'A reading handover is still preparing. Finish that operation, then export this project.':value.error==='PROJECT_HELPER_FAILED'?'Project preparation failed. Check Python 3.10+ and the server output.':value.error??'Project preparation failed.');
   const url=new URL(value.url,location.origin);if(url.origin!==location.origin)throw new Error('The download must use this private server.');
   const link=document.createElement('a');link.href=url.href;link.download='';section.append(link);link.click();link.remove();
   message.textContent='Complete project prepared. Keep the archive and its source installation private.';
  }catch(error){message.textContent=error.message||'Project preparation failed.';}
  finally{button.disabled=false;}
 });
}
