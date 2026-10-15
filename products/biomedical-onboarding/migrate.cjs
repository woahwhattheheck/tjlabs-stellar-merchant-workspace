'use strict';
const Core=require('./core.cjs'),M=require('./session.cjs'),Old=require('./prior-first-edition/core.cjs'),OldM=require('./prior-first-edition/session.cjs');
function study(old){Old.validate(old);const w=Core.clone(old);w.schema=Core.SCHEMA;w.documents=[];w.document_links=[];
 for(const side of ['source','returned'])w.config.selection[side]=Object.fromEntries(Core.KINDS.map(k=>[k,w.config.selection[side][k]||'']));
 for(const e of w.extracts)e.mapping=Object.fromEntries(Core.FIELDS[e.kind].map(k=>[k,e.mapping[k]||'']));
 for(const o of w.originals)o.captured_at=new Date(o.captured_at).toISOString();for(const r of w.reviews)r.at=new Date(r.at).toISOString();
 return Core.validate(w);
}
function simpleSession(old){OldM.validate(old);let s=M.create(study(old.study));s.id=old.id;s.revision=old.revision;s.drafts=Core.clone(old.drafts);s.selection=Core.clone(old.selection);s.view=['study','intake','selection','crosswalks','documents','compare','reviews','recovery'].includes(old.view)?old.view:'recovery';
 // Retain every prior study as a normal restorable edition; the exact prior full envelope is also kept as a document.
 for(const h of old.history)s=M.retainStudy(s,study(OldM.historyStudy(old,h)),h.reason,h.at);
 return M.validate(s);
}
function migrate(input,originalText,filename='prior-v1.json',at=new Date().toISOString()){
 let s;if(input.schema===Old.SCHEMA)s=M.create(study(input));
 else if(input.schema===OldM.SCHEMA){OldM.validate(input);s=simpleSession(input);for(const b of input.backups)s=M.retain(s,simpleSession(OldM.branchSession(input,b)),b.reason+' [migrated v1 branch]');}
 else throw Error('Expected first-edition onboarding study or session');
 const bytes=require('./zip.cjs').utf(originalText),w=Core.addDocument(s.study,{name:filename,media_type:'application/json',bytes,at,notes:'Exact original v1 envelope retained before explicit migration. New record kinds remain unselected and new fields remain unobserved. Historic v1 review hashes remain historical.'});
 s=M.checkpoint(s,w,'Explicit v1 → v2 migration; exact original retained');s.view='recovery';return M.validate(s);
}
module.exports={study,migrate};
