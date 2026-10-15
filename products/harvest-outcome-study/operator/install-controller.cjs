'use strict';
// Compose the original domain controller with the reviewed installed lifecycle.
// Exact required boundaries refuse a donor with changed composition structure.
module.exports=function installController(original,template){
 const requireAt=(s,needle)=>{const i=s.indexOf(needle);if(i<0)throw Error('Controller boundary missing: '+needle);return i;};
 function region(s,name){const m=new RegExp('^(?:async )?function '+name+'\\(','m').exec(s);if(!m)throw Error('Controller function missing: '+name);const next=/^(?:(?:async )?function |document\.addEventListener|window\.addEventListener|\/\/ IndexedDB|\/\/ Complete original)/gm;next.lastIndex=m.index+m[0].length;return {start:m.index,end:next.exec(s)?.index??s.length};}
 const replaceFunction=(s,name)=>{const a=region(s,name),b=region(template,name);return s.slice(0,a.start)+template.slice(b.start,b.end)+s.slice(a.end);};
 let out=original.slice(0,original.indexOf('\n'))+template.slice(template.indexOf('\n'),requireAt(template,'const $=id'))+original.slice(requireAt(original,'const $=id'));
 let r=region(out,'transaction');out=out.slice(0,r.start)+out.slice(r.end);
 for(const name of ['checkedSaved','readActive','saveExact','persist','enqueueSave','exportSession','recordDraft','retainImport','replace','retainBinary','openFile','adoptLocal'])out=replaceFunction(out,name);
 const a=/^ (?:else )?if\(act==="download-session"\)/m.exec(out),b=requireAt(out,' else if(act==="csv-template")'),c=requireAt(template,' else if(act==="installed-working")'),d=requireAt(template,' else if(act==="csv-template")');
 if(!a||b<a.index)throw Error('Complete export actions changed');
 let block=template.slice(c,d);if(!a[0].includes('else'))block=block.replace(/^ else if/,' if');out=out.slice(0,a.index)+block+out.slice(b);
 for(const action of ['clear-emergency','open-saved']){const re=new RegExp('^ else if\\(act==="'+action+'"\\).*$','m'),line=template.match(re)?.[0];if(!line||!re.test(out))throw Error('Recovery action missing: '+action);out=out.replace(re,()=>line);}
 const click=/^document\.addEventListener\("click".*$/m,clickLine=template.match(click)?.[0];if(!clickLine||!click.test(out))throw Error('Navigation handler changed');out=out.replace(click,()=>clickLine);
 out=out.replace('M.validate(staged);session=staged;','selectInstalled(staged);');
 const originalCall=original.slice(original.lastIndexOf('\n})(')),oldName=original.match(/window\.(\w+Desk)=\{getSession:/)?.[1],templateName=template.match(/window\.(\w+Desk)=\{getSession:/)?.[1];
 if(!originalCall.startsWith('\n})(')||!oldName||!templateName)throw Error('Original controller global changed');
 let tail=template.slice(requireAt(template,'// Complete original'));tail=tail.slice(0,tail.lastIndexOf('\n})('))+originalCall;if(oldName!==templateName)tail=tail.replace('window.'+templateName+'={getSession:','window.'+oldName+'={getSession:');
 out=out.slice(0,requireAt(out,'// IndexedDB'))+tail;return out;
};
