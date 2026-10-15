/* Copyright TokenJunkieLabs. Exact source-native brewery onboarding reconciliation. */
function createBreweryCore(){
"use strict";
  const fail=message=>{throw Error(message)},bytes=value=>value instanceof Uint8Array?value:Uint8Array.from(value);
  function utf8Encode(text) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
      let c = text.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const low = text.charCodeAt(++i);
        if (!(low >= 0xdc00 && low <= 0xdfff)) fail("unpaired UTF-16 surrogate");
        c = 0x10000 + ((c - 0xd800) << 10) + low - 0xdc00;
      } else if (c >= 0xdc00 && c <= 0xdfff) fail("unpaired UTF-16 surrogate");
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >>> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >>> 12), 0x80 | ((c >>> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >>> 18), 0x80 | ((c >>> 12) & 63), 0x80 | ((c >>> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
  }
  const shaK = Uint32Array.from([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);
  const rotate = (x, n) => (x >>> n) | (x << (32 - n));
  function sha256(input) {
    const a = typeof input === "string" ? utf8Encode(input) : bytes(input);
    const n = a.length, padded = new Uint8Array(Math.ceil((n + 9) / 64) * 64);
    padded.set(a); padded[n] = 128;
    const high = Math.floor(n / 0x20000000), low = (n * 8) >>> 0;
    for (let i = 0; i < 4; i++) {
      padded[padded.length - 8 + i] = (high >>> (24 - i * 8)) & 255;
      padded[padded.length - 4 + i] = (low >>> (24 - i * 8)) & 255;
    }
    const h = Uint32Array.from([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
      for (let i = 0; i < 16; i++) {
        const p = offset + i * 4;
        w[i] = ((padded[p] << 24) | (padded[p + 1] << 16) | (padded[p + 2] << 8) | padded[p + 3]) >>> 0;
      }
      for (let i = 16; i < 64; i++) {
        const x = w[i - 15], y = w[i - 2];
        w[i] = ((rotate(x,7) ^ rotate(x,18) ^ (x >>> 3)) + w[i - 16] +
                (rotate(y,17) ^ rotate(y,19) ^ (y >>> 10)) + w[i - 7]) >>> 0;
      }
      let [v0,v1,v2,v3,v4,v5,v6,v7] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (v7 + (rotate(v4,6) ^ rotate(v4,11) ^ rotate(v4,25)) +
                    ((v4 & v5) ^ (~v4 & v6)) + shaK[i] + w[i]) >>> 0;
        const t2 = ((rotate(v0,2) ^ rotate(v0,13) ^ rotate(v0,22)) +
                    ((v0 & v1) ^ (v0 & v2) ^ (v1 & v2))) >>> 0;
        v7=v6;v6=v5;v5=v4;v4=(v3+t1)>>>0;v3=v2;v2=v1;v1=v0;v0=(t1+t2)>>>0;
      }
      for (const [i,v] of [v0,v1,v2,v3,v4,v5,v6,v7].entries()) h[i] = (h[i] + v) >>> 0;
    }
    return Array.from(h, v => v.toString(16).padStart(8,"0")).join("");
  }

const SCHEMA="tjlabs.brewery-reconciliation.v1";
const columns={
 items:["item_id","name","kind","base_unit"],
 aliases:["source_system","source_item_id","item_id"],
 opening:["row_id","item_id","lot_id","location","quantity","unit"],
 movements:["event_id","source_system","source_item_id","lot_id","location","occurred_at","quantity","unit"],
 target:["row_id","item_id","lot_id","location","quantity","unit"],
 recipes:["recipe_id","version","ingredient_item_id","quantity","unit","target_yield","target_unit"],
 accounts:["account_id","name"],
 orders:["line_id","account_id","item_id","quantity","unit","status"]
};
const required=["items","aliases","opening","movements","target"],optional=["recipes","accounts","orders"];
const clone=v=>JSON.parse(JSON.stringify(v)),own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const object=(v,label)=>{if(!v||typeof v!=="object"||Array.isArray(v))throw Error(label+" must be an object");return v};
const text=(v,label,nonempty=false)=>{if(typeof v!=="string"||(nonempty&&!v.trim()))throw Error(label+" must be "+(nonempty?"a nonempty ":"a ")+"string");return v};
function canonical(v){if(v===null||typeof v==="string"||typeof v==="boolean")return JSON.stringify(v);if(typeof v==="number"&&Number.isFinite(v))return JSON.stringify(v);if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";if(v&&typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";throw Error("Nonportable value")}
const digest=v=>sha256(typeof v==="string"?v:canonical(v));
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function gcd(a,b){a=a<0n?-a:a;b=b<0n?-b:b;while(b){const t=a%b;a=b;b=t}return a||1n}
function rat(n,d=1n){if(d===0n)throw Error("Zero denominator");if(d<0n){n=-n;d=-d}const g=gcd(n,d);return {n:n/g,d:d/g}}
const add=(a,b)=>rat(a.n*b.d+b.n*a.d,a.d*b.d),sub=(a,b)=>rat(a.n*b.d-b.n*a.d,a.d*b.d),mul=(a,b)=>rat(a.n*b.n,a.d*b.d),div=(a,b)=>rat(a.n*b.d,a.d*b.n),eq=(a,b)=>a.n===b.n&&a.d===b.d,zero=()=>rat(0n);
function decimal(v,label="Quantity"){
 if(typeof v!=="string"||!/^[-+]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v))throw Error(label+" must be a decimal string without separators or exponent");
 const negative=v[0]==="-",body=v.replace(/^[-+]/,""),[whole,fraction=""]=body.split(".");
 if(fraction.length>18||whole.length>30)throw Error(label+" exceeds the explicit 30-digit/18-decimal precision contract");
 return rat((negative?-1n:1n)*BigInt(whole+fraction),10n**BigInt(fraction.length));
}
function quantity(q){
 const exact={numerator:q.n.toString(),denominator:q.d.toString()};let d=q.d,a=0,b=0;while(d%2n===0n){d/=2n;a++}while(d%5n===0n){d/=5n;b++}
 if(d!==1n)return {...exact,display:q.n+"/"+q.d};
 const places=Math.max(a,b),sign=q.n<0n?"-":"",n=q.n<0n?-q.n:q.n,scale=10n**BigInt(places),digits=(n*scale/q.d).toString().padStart(places+1,"0");
 let display=places?digits.slice(0,-places)+"."+digits.slice(-places):digits;display=display.replace(/(\.\d*?)0+$/,"$1").replace(/\.$/,"");
 return {...exact,display:sign+display};
}
const units={
 g:{dimension:"mass",factor:"1"},kg:{dimension:"mass",factor:"1000"},mg:{dimension:"mass",factor:"0.001"},
 oz:{dimension:"mass",factor:"28.349523125"},lb:{dimension:"mass",factor:"453.59237"},
 ml:{dimension:"volume",factor:"1"},L:{dimension:"volume",factor:"1000"},
 us_fl_oz:{dimension:"volume",factor:"29.5735295625"},us_gal:{dimension:"volume",factor:"3785.411784"},
 us_beer_bbl:{dimension:"volume",factor:"117347.765304"},
 each:{dimension:"count",factor:"1"},ea:{dimension:"count",factor:"1"},count:{dimension:"count",factor:"1"}
};
function unit(name){if(typeof name!=="string"||!own(units,name))throw Error("Unknown explicit unit "+String(name));return units[name]}
function convert(value,from,to,label="Quantity"){
 const a=unit(from),b=unit(to);if(a.dimension!==b.dimension)throw Error(label+" crosses incompatible "+a.dimension+"/"+b.dimension+" units");
 const q=decimal(value,label);if(a.dimension==="count"&&q.d!==1n)throw Error(label+" count quantities must be integral");
 return div(mul(q,decimal(a.factor)),decimal(b.factor));
}
function timestamp(value,label){
 text(value,label,true);const m=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/);
 if(!m)throw Error(label+" requires ISO date/time with explicit UTC offset, seconds, and up to nine fractional digits");
 const y=+m[1],mo=+m[2],day=+m[3],h=+m[4],mi=+m[5],s=+m[6];if(y<1000||mo<1||mo>12||day<1||h>23||mi>59||s>59)throw Error("Invalid "+label);
 const utc=Date.UTC(y,mo-1,day,h,mi,s),check=new Date(utc);if(check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==day)throw Error("Invalid calendar date in "+label);
 let offset=0;if(m[8]!=="Z"){const oh=+m[8].slice(1,3),om=+m[8].slice(4,6);if(oh>14||om>59||(oh===14&&om!==0))throw Error("Invalid offset in "+label);offset=(oh*60+om)*(m[8][0]==="-"?-1:1)}
 return BigInt(utc-offset*60000)*1000000n+BigInt((m[7]||"").padEnd(9,"0")||"0");
}
function settings(value){
 object(value,"Settings");const openingAt=text(value.openingAt,"Opening timestamp",true),cutoffAt=text(value.cutoffAt,"Cutoff timestamp",true),a=timestamp(openingAt,"Opening timestamp"),b=timestamp(cutoffAt,"Cutoff timestamp");
 if(b<a)throw Error("Cutoff precedes opening");return {openingAt,cutoffAt,openingEpochNanoseconds:a.toString(),cutoffEpochNanoseconds:b.toString(),window:"openingAt < movement.occurred_at <= cutoffAt"};
}
function parseCSV(original,header,label){
 text(original,label);let s=original.charCodeAt(0)===0xfeff?original.slice(1):original,rows=[],row=[],cell="",quoted=false,closed=false,started=false;
 for(let i=0;i<s.length;i++){const c=s[i];if(quoted){if(c==='"'){if(s[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue}if(closed&&c!==","&&c!=="\r"&&c!=="\n")throw Error(label+": characters after closing quote");if(c==='"'){if(cell||started||closed)throw Error(label+": invalid quote");quoted=true;started=true}else if(c===","){row.push(cell);cell="";closed=false;started=false}else if(c==="\r"||c==="\n"){if(c==="\r"&&s[i+1]==="\n")i++;row.push(cell);rows.push(row);row=[];cell="";closed=false;started=false}else{cell+=c;started=true}}
 if(quoted)throw Error(label+": unterminated quote");if(cell||row.length||started||closed){row.push(cell);rows.push(row)}
 if(!rows.length)throw Error(label+": required header");const names=rows.shift();if(names.some(x=>!x)||new Set(names).size!==names.length)throw Error(label+": blank or duplicate header");
 for(const k of header)if(!names.includes(k))throw Error(label+": missing column "+k);if(rows.length>100000)throw Error(label+": more than 100,000 rows; provide an explicit narrower source period");
 return rows.map((cells,i)=>{if(cells.length!==names.length)throw Error(label+": row "+(i+2)+" column count differs");const out=Object.create(null);names.forEach((k,j)=>out[k]=cells[j]);return out});
}
function source(value,label){object(value,label);const name=text(value.name,label+".name",true),body=text(value.text,label+".text");return {name,text:body,bytes:utf8Encode(body).length,sha256:sha256(body)}}
function verifySource(v,label){const s=source(v,label);if(v.bytes!==s.bytes||v.sha256!==s.sha256)throw Error(label+" original bytes differ");return s}
function dedupe(rows,key,label,duplicates){
 const map=new Map,out=[];
 rows.forEach((r,index)=>{const id=key(r);if(map.has(id)){const before=map.get(id);if(canonical(before.row)!==canonical(r))throw Error(label+": conflicting duplicate identity "+id);duplicates.push({table:label,key:id,firstSourceRow:before.index+2,duplicateSourceRow:index+2,disposition:"identical row counted once"});}else{map.set(id,{row:r,index});out.push(r)}});return out;
}
function buildEdition(payload){
 object(payload,"Edition");for(const k of ["id","label"])text(payload[k],"Edition "+k,true);text(payload.notes,"Edition notes");
 const config=settings(payload.settings),sources=Object.create(null),tables=Object.create(null),duplicates=[];
 object(payload.sources,"Edition sources");
 for(const k of Object.keys(payload.sources))if(!own(columns,k))throw Error("Unknown source table "+k);
 for(const k of required)if(!payload.sources[k])throw Error("Missing complete "+k+" source");
 for(const k of Object.keys(columns)){if(payload.sources[k]){sources[k]=verifySource(payload.sources[k],k);tables[k]=parseCSV(sources[k].text,columns[k],k)}else tables[k]=[]}
 const keys={items:r=>text(r.item_id,"item_id",true),aliases:r=>JSON.stringify([text(r.source_system,"source_system",true),text(r.source_item_id,"source_item_id",true)]),opening:r=>text(r.row_id,"opening.row_id",true),movements:r=>JSON.stringify([text(r.source_system,"source_system",true),text(r.event_id,"event_id",true)]),target:r=>text(r.row_id,"target.row_id",true),recipes:r=>JSON.stringify([text(r.recipe_id,"recipe_id",true),text(r.version,"recipe version",true),text(r.ingredient_item_id,"ingredient_item_id",true)]),accounts:r=>text(r.account_id,"account_id",true),orders:r=>text(r.line_id,"line_id",true)};
 for(const k of Object.keys(columns))tables[k]=dedupe(tables[k],keys[k],k,duplicates);
 const itemMap=new Map;
 for(const r of tables.items){for(const k of ["name","kind"])text(r[k],"Item "+k,true);unit(r.base_unit);itemMap.set(r.item_id,r)}
 const aliasMap=new Map;for(const r of tables.aliases){if(!itemMap.has(r.item_id))throw Error("Alias refers to unknown item "+r.item_id);aliasMap.set(JSON.stringify([r.source_system,r.source_item_id]),r.item_id)}
 const bucketKey=r=>JSON.stringify([r.item_id,r.lot_id,r.location]);
 for(const k of ["opening","target"]){const seen=new Set;for(const r of tables[k]){
  const item=itemMap.get(r.item_id);if(!item)throw Error(k+" refers to unknown item "+r.item_id);
  text(r.location,k+".location",true);text(r.lot_id,k+".lot_id");const q=convert(r.quantity,r.unit,item.base_unit,k+" "+r.row_id);
  if(q.n<0n)throw Error(k+" observed/opening balance cannot be negative");
  const key=bucketKey(r);if(seen.has(key))throw Error(k+": multiple independent balances for the same item/lot/location; consolidate a documented balance or use distinct actual locations");seen.add(key);
 }}
 for(const r of tables.movements){
  text(r.location,"Movement location",true);text(r.lot_id,"Movement lot");timestamp(r.occurred_at,"Movement timestamp");
  const itemId=aliasMap.get(JSON.stringify([r.source_system,r.source_item_id]));if(!itemId)throw Error("No explicit alias for "+r.source_system+"/"+r.source_item_id);
  const item=itemMap.get(itemId);convert(r.quantity,r.unit,item.base_unit,"Movement "+r.event_id);
 }
 const recipeGroups=new Map;
 for(const r of tables.recipes){
  const item=itemMap.get(r.ingredient_item_id);if(!item)throw Error("Recipe refers to unknown item "+r.ingredient_item_id);
  const amount=convert(r.quantity,r.unit,item.base_unit,"Recipe ingredient");if(amount.n<=0n)throw Error("Recipe ingredient quantity must be positive");
  const yieldUnit=unit(r.target_unit),yieldAmount=convert(r.target_yield,r.target_unit,r.target_unit,"Recipe target yield");if(yieldAmount.n<=0n)throw Error("Recipe target yield must be positive");
  const key=JSON.stringify([r.recipe_id,r.version]),normalized=mul(yieldAmount,decimal(yieldUnit.factor)),prior=recipeGroups.get(key);
  if(prior&&(prior.dimension!==yieldUnit.dimension||!eq(prior.quantity,normalized)))throw Error("Recipe version has conflicting target yield");
  recipeGroups.set(key,{dimension:yieldUnit.dimension,quantity:normalized});
 }
 const accountMap=new Map(tables.accounts.map(r=>{text(r.name,"Account name",true);return [r.account_id,r]}));
 for(const r of tables.orders){if(!accountMap.has(r.account_id))throw Error("Order refers to unknown account "+r.account_id);const item=itemMap.get(r.item_id);if(!item)throw Error("Order refers to unknown item "+r.item_id);const amount=convert(r.quantity,r.unit,item.base_unit,"Order "+r.line_id);if(amount.n<0n)throw Error("Order quantity cannot be negative");text(r.status,"Order status",true)}
 const sourceSha256=digest({settings:config,sources:Object.fromEntries(Object.entries(sources).map(([k,s])=>[k,s.sha256]))});
 return {id:payload.id,label:payload.label,notes:payload.notes,settings:config,sources,tables,duplicates,sourceSha256,itemMap,aliasMap};
}
function analysis(edition){
 const buckets=new Map,ledger=[],exceptions=[],openingNs=BigInt(edition.settings.openingEpochNanoseconds),cutoffNs=BigInt(edition.settings.cutoffEpochNanoseconds);
 const get=(itemId,lotId,location)=>{const key=JSON.stringify([itemId,lotId,location]);if(!buckets.has(key)){const item=edition.itemMap.get(itemId);buckets.set(key,{id:"bucket-"+digest(key).slice(0,24),key,itemId,itemName:item.name,kind:item.kind,lotId,location,baseUnit:item.base_unit,opening:null,target:null,movement:zero(),openingRows:[],targetRows:[],movementIds:[]})}return buckets.get(key)};
 for(const r of edition.tables.opening){const b=get(r.item_id,r.lot_id,r.location);b.opening=convert(r.quantity,r.unit,b.baseUnit);b.openingRows.push(r.row_id)}
 for(const r of edition.tables.target){const b=get(r.item_id,r.lot_id,r.location);b.target=convert(r.quantity,r.unit,b.baseUnit);b.targetRows.push(r.row_id)}
 for(const r of edition.tables.movements){
  const itemId=edition.aliasMap.get(JSON.stringify([r.source_system,r.source_item_id])),item=edition.itemMap.get(itemId),at=timestamp(r.occurred_at,"Movement timestamp"),included=at>openingNs&&at<=cutoffNs,amount=convert(r.quantity,r.unit,item.base_unit);
  const record={eventId:r.event_id,sourceSystem:r.source_system,sourceItemId:r.source_item_id,itemId,lotId:r.lot_id,location:r.location,occurredAt:r.occurred_at,epochNanoseconds:at.toString(),originalQuantity:r.quantity,originalUnit:r.unit,baseUnit:item.base_unit,quantity:quantity(amount),included,windowDisposition:included?"included":at<=openingNs?"at-or-before-opening":"after-cutoff"};
  ledger.push(record);if(included){const b=get(itemId,r.lot_id,r.location);b.movement=add(b.movement,amount);b.movementIds.push(JSON.stringify([r.source_system,r.event_id]))}
 }
 const rows=[];
 const exception=(type,b,message)=>{const identity={sourceSha256:edition.sourceSha256,type,bucketId:b.id};exceptions.push({id:"exception-"+digest(identity).slice(0,24),type,bucketId:b.id,itemId:b.itemId,lotId:b.lotId,location:b.location,message,sourceSha256:edition.sourceSha256})};
 for(const b of buckets.values()){
  const firstException=exceptions.length;
  const expected=add(b.opening||zero(),b.movement),delta=b.target===null?null:sub(b.target,expected);
  if(b.opening===null)exception("missing-opening",b,"No opening balance was observed for this bucket. Zero is an explicit arithmetic baseline only; confirm the missing opening source in a corrected edition.");
  if(b.target===null)exception("missing-target",b,"No independent target count exists for this bucket.");
  if(expected.n<0n)exception("negative-expected",b,"Opening plus included signed movements yields negative expected stock.");
  if(delta&&delta.n!==0n)exception("quantity-difference",b,"Independent target minus expected source balance is nonzero.");
  const ids=exceptions.slice(firstException).map(e=>e.id);
  rows.push({id:b.id,itemId:b.itemId,itemName:b.itemName,kind:b.kind,lotId:b.lotId,location:b.location,baseUnit:b.baseUnit,opening:b.opening===null?null:quantity(b.opening),movements:quantity(b.movement),expected:quantity(expected),target:b.target===null?null:quantity(b.target),delta:delta===null?null:quantity(delta),openingPresent:b.opening!==null,targetPresent:b.target!==null,openingRows:b.openingRows,targetRows:b.targetRows,movementIds:b.movementIds,exceptionIds:ids,status:ids.length?"attention":"balanced"});
 }
 const recipeMap=new Map;
 for(const r of edition.tables.recipes){const key=JSON.stringify([r.recipe_id,r.version]),item=edition.itemMap.get(r.ingredient_item_id);if(!recipeMap.has(key))recipeMap.set(key,{recipeId:r.recipe_id,version:r.version,targetYield:r.target_yield,targetUnit:r.target_unit,ingredients:[]});recipeMap.get(key).ingredients.push({itemId:r.ingredient_item_id,itemName:item.name,originalQuantity:r.quantity,originalUnit:r.unit,baseUnit:item.base_unit,quantity:quantity(convert(r.quantity,r.unit,item.base_unit))})}
 const accountLookup=new Map(edition.tables.accounts.map(a=>[a.account_id,a]));
 const orders=edition.tables.orders.map(r=>{const item=edition.itemMap.get(r.item_id),account=accountLookup.get(r.account_id);return {lineId:r.line_id,accountId:r.account_id,accountName:account.name,itemId:r.item_id,itemName:item.name,originalQuantity:r.quantity,originalUnit:r.unit,baseUnit:item.base_unit,quantity:quantity(convert(r.quantity,r.unit,item.base_unit)),status:r.status,inventoryTreatment:"retained order reference; no inventory subtraction"}});
 return {schema:"tjlabs.brewery-analysis.v1",editionId:edition.id,label:edition.label,sourceSha256:edition.sourceSha256,settings:clone(edition.settings),buckets:rows,movements:ledger,exceptions,duplicates:clone(edition.duplicates),recipes:[...recipeMap.values()],accounts:clone(edition.tables.accounts),orders,counts:{items:edition.tables.items.length,buckets:rows.length,balancedBuckets:rows.filter(r=>r.status==="balanced").length,attentionBuckets:rows.filter(r=>r.status==="attention").length,exceptions:exceptions.length,movements:ledger.length,includedMovements:ledger.filter(r=>r.included).length,excludedMovements:ledger.filter(r=>!r.included).length,identicalDuplicates:edition.duplicates.length,recipeVersions:recipeMap.size,accounts:edition.tables.accounts.length,orderLines:orders.length}};
}
function create(v){object(v,"Workspace");text(v.id,"Workspace id",true);text(v.label,"Workspace label",true);return {schema:SCHEMA,id:v.id,label:v.label,revision:0,head:digest({schema:SCHEMA,id:v.id,label:v.label}),commands:[]}}
function reviewRecord(state,p){
 object(p,"Review");for(const k of ["id","editionId","exceptionId","disposition","reviewer","reason","sourceSha256"])text(p[k],"Review "+k,true);
 if(!["investigate","accept-difference","source-correction-needed"].includes(p.disposition))throw Error("Unknown review disposition");
 const edition=state.editions.get(p.editionId);if(!edition)throw Error("Unknown review edition");const found=analysis(edition).exceptions.find(e=>e.id===p.exceptionId);if(!found||p.sourceSha256!==edition.sourceSha256)throw Error("Review exception/source identity differs");
 const key=JSON.stringify([p.editionId,p.exceptionId]),prev=state.currentReviews.get(key)||null;if(p.previousReviewId!==(prev?prev.id:null))throw Error("Review correction predecessor differs");
 if(p.evidence!==null)verifySource(p.evidence,"Review evidence");state.reviews.push(clone(p));state.currentReviews.set(key,clone(p));
}
function replay(value){
 const w=clone(value);object(w,"Workspace");if(w.schema!==SCHEMA)throw Error("Unknown brewery workspace schema");text(w.id,"Workspace id",true);text(w.label,"Workspace label",true);
 if(!Array.isArray(w.commands)||w.commands.length>10000||w.revision!==w.commands.length)throw Error("Invalid retained operation count/revision");
 const state={workspace:w,editions:new Map,reviews:[],currentReviews:new Map};let previous=digest({schema:w.schema,id:w.id,label:w.label});const ids=new Set;
 for(const [i,c]of w.commands.entries()){
  object(c,"Command");text(c.id,"Command id",true);if(ids.has(c.id))throw Error("Duplicate command id");ids.add(c.id);
  if(c.sequence!==i+1||c.previous!==previous||c.sha256!==digest({id:c.id,sequence:c.sequence,type:c.type,payload:c.payload,previous:c.previous}))throw Error("Retained operation identity differs");
  if(c.type==="receive"){const e=buildEdition(c.payload);if(state.editions.has(e.id))throw Error("Duplicate edition id");state.editions.set(e.id,e)}
  else if(c.type==="review"){if(c.payload.id!=="review-"+(state.reviews.length+1))throw Error("Review sequence differs");reviewRecord(state,c.payload)}
  else throw Error("Unknown operation type");previous=c.sha256;
 }
 if(w.head!==previous)throw Error("Workspace head differs");return state;
}
function reopen(v){return replay(typeof v==="string"?JSON.parse(v):v).workspace}
function append(w,type,payload,request){
 const state=replay(w),current=state.workspace;if(request.expectedRevision!==undefined&&request.expectedRevision!==current.revision)throw Error("Workspace changed since action preparation");
 const command={id:request.commandId||"command-"+(current.revision+1),sequence:current.revision+1,type,payload,previous:current.head};command.sha256=digest(command);
 const next={...current,revision:current.revision+1,head:command.sha256,commands:[...current.commands,command]};replay(next);return next;
}
function receive(w,p){
 object(p,"Receive request");object(p.sources,"Sources");const sources=Object.create(null);
 for(const [k,s]of Object.entries(p.sources)){if(!own(columns,k))throw Error("Unknown source table "+k);if(s!==null&&s!==undefined)sources[k]=source(s,k)}
 const payload={id:text(p.id,"Edition id",true),label:text(p.label,"Edition label",true),settings:settings(p.settings),sources,notes:text(p.notes??"","Edition notes")};return append(w,"receive",payload,p);
}
function analyse(w,id){
 const state=replay(w),e=state.editions.get(id);if(!e)throw Error("Unknown edition");const result=analysis(e);
 result.exceptions=result.exceptions.map(ex=>{const key=JSON.stringify([id,ex.id]);return {...ex,review:clone(state.currentReviews.get(key)||null),reviewHistory:state.reviews.filter(r=>r.editionId===id&&r.exceptionId===ex.id)}});
 result.counts.reviewedExceptions=result.exceptions.filter(e=>e.review).length;result.counts.unreviewedExceptions=result.exceptions.filter(e=>!e.review).length;return result;
}
function review(w,p){
 object(p,"Review request");const state=replay(w),edition=state.editions.get(p.editionId);if(!edition)throw Error("Unknown edition");const ex=analysis(edition).exceptions.find(e=>e.id===p.exceptionId);if(!ex)throw Error("Unknown exception");
 const prior=state.currentReviews.get(JSON.stringify([p.editionId,p.exceptionId]))||null;
 return append(w,"review",{id:"review-"+(state.reviews.length+1),editionId:p.editionId,exceptionId:p.exceptionId,disposition:p.disposition,reviewer:text(p.reviewer,"Reviewer",true),reason:text(p.reason,"Review reason",true),evidence:p.evidence?source(p.evidence,"Evidence"):null,sourceSha256:edition.sourceSha256,previousReviewId:prior?prior.id:null},p);
}
function editions(w){return [...replay(w).editions.values()].map(e=>({id:e.id,label:e.label,notes:e.notes,settings:clone(e.settings),sourceSha256:e.sourceSha256,sources:clone(e.sources),tables:clone(e.tables),duplicates:clone(e.duplicates)}))}
function encodeCSV(headers,rows){const cell=v=>{const s=String(v??"");return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};return [headers,...rows.map(r=>headers.map(k=>r[k]))].map(r=>r.map(cell).join(",")).join("\r\n")+"\r\n"}
function csv(w,id,kind="buckets"){
 const a=analyse(w,id),q=v=>v?v.display:"";
 if(kind==="buckets")return encodeCSV(["bucket_id","item_id","name","kind","lot_id","location","base_unit","opening","movement","expected","target","delta","opening_present","target_present","status","exception_ids"],a.buckets.map(b=>({bucket_id:b.id,item_id:b.itemId,name:b.itemName,kind:b.kind,lot_id:b.lotId,location:b.location,base_unit:b.baseUnit,opening:q(b.opening),movement:q(b.movements),expected:q(b.expected),target:q(b.target),delta:q(b.delta),opening_present:b.openingPresent,target_present:b.targetPresent,status:b.status,exception_ids:JSON.stringify(b.exceptionIds)})));
 if(kind==="movements")return encodeCSV(["sourceSystem","eventId","sourceItemId","itemId","lotId","location","occurredAt","originalQuantity","originalUnit","baseUnit","quantity","included","windowDisposition"],a.movements.map(r=>({...r,quantity:q(r.quantity)})));
 if(kind==="exceptions")return encodeCSV(["id","type","bucketId","itemId","lotId","location","message","sourceSha256","disposition","reviewer","reason"],a.exceptions.map(e=>({...e,disposition:e.review?.disposition||"",reviewer:e.review?.reviewer||"",reason:e.review?.reason||""})));
 if(kind==="reviews")return encodeCSV(["id","editionId","exceptionId","disposition","reviewer","reason","sourceSha256","previousReviewId","evidence"],a.exceptions.flatMap(e=>e.reviewHistory).map(r=>({...r,evidence:r.evidence?JSON.stringify(r.evidence):""})));
 if(kind==="duplicates")return encodeCSV(["table","key","firstSourceRow","duplicateSourceRow","disposition"],a.duplicates);
 if(kind==="orders")return encodeCSV(["lineId","accountId","accountName","itemId","itemName","originalQuantity","originalUnit","baseUnit","quantity","status","inventoryTreatment"],a.orders.map(r=>({...r,quantity:q(r.quantity)})));
 if(kind==="recipes")return encodeCSV(["recipeId","version","targetYield","targetUnit","itemId","itemName","originalQuantity","originalUnit","baseUnit","quantity"],a.recipes.flatMap(r=>r.ingredients.map(i=>({...r,...i,quantity:q(i.quantity)}))));
 if(kind==="accounts")return encodeCSV(columns.accounts,a.accounts);
 throw Error("Unknown CSV kind");
}
function report(w,id){
 const workspace=reopen(w),e=editions(workspace).find(e=>e.id===id),a=analyse(workspace,id),q=v=>v?v.display:"not observed";
 const table=(heads,rows)=>'<table><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join("")+'</tr>').join("")+'</tbody></table>';
 const download=(name,type,body)=>'<a download="'+esc(name)+'" href="data:'+type+';charset=utf-8,'+encodeURIComponent(body)+'">'+esc(name)+'</a>';
 const links=[download("brewery-workspace.json","application/json",JSON.stringify(workspace,null,2)),...["buckets","movements","exceptions","reviews","duplicates","recipes","accounts","orders"].map(k=>download(k+".csv","text/csv",csv(workspace,id,k)))].join(" · ");
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(e.label)+' — inventory reconciliation</title><style>body{font:15px system-ui;color:#202020;background:#fafafa;margin:32px;line-height:1.5}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #bbb;text-align:left;padding:8px;vertical-align:top}th{background:#eee}pre{white-space:pre-wrap;overflow-wrap:anywhere}details{margin:18px 0}a{color:inherit}h1,h2{font-weight:600}</style><h1>'+esc(workspace.label)+' / '+esc(e.label)+'</h1><p>'+esc(e.notes)+'</p><p>Opening: '+esc(e.settings.openingAt)+'; cutoff: '+esc(e.settings.cutoffAt)+'. Include movements strictly after opening and through cutoff. Delta = independent target − (opening + included signed movements). All quantities stay in each item’s exact base unit.</p><p>Source identity: '+esc(e.sourceSha256)+'</p><p>'+links+'</p><h2>Inventory reconciliation</h2>'+table(["Item / lot / location","Unit","Opening","Movements","Expected","Target","Delta","Status"],a.buckets.map(b=>[b.itemName+" / "+b.lotId+" / "+b.location,b.baseUnit,q(b.opening),q(b.movements),q(b.expected),q(b.target),q(b.delta),b.status]))+'<h2>Exceptions and current review</h2>'+table(["Exception","Bucket","Meaning","Disposition"],a.exceptions.map(ex=>[ex.type,ex.itemId+" / "+ex.lotId+" / "+ex.location,ex.message,ex.review?ex.review.disposition+" — "+ex.review.reviewer+": "+ex.review.reason:"Unreviewed"]))+'<p>A review records the operator’s decision. It does not change the numeric source balance or remove an exception. Corrected source counts and mappings enter as a new edition.</p><h2>Movement window and original references</h2>'+table(["System / event","Item / lot / location","Timestamp","Original quantity","Base quantity","Window"],a.movements.map(m=>[m.sourceSystem+" / "+m.eventId,m.itemId+" / "+m.lotId+" / "+m.location,m.occurredAt,m.originalQuantity+" "+m.originalUnit,q(m.quantity)+" "+m.baseUnit,m.windowDisposition]))+'<h2>Recipe, account and order continuity</h2><p>Recipe definitions and order statuses are retained for migration comparison. Recipes and orders do not generate inventory movements.</p><pre>'+esc(JSON.stringify({recipes:a.recipes,accounts:a.accounts,orders:a.orders},null,2))+'</pre><h2>Complete review and duplicate history</h2><pre>'+esc(JSON.stringify({exceptions:a.exceptions,duplicates:a.duplicates},null,2))+'</pre><h2>Original sources</h2>'+Object.entries(e.sources).map(([k,s])=>'<details><summary>'+esc(k+" — "+s.name+" — "+s.bytes+" bytes")+'</summary><p>SHA-256 '+esc(s.sha256)+'</p>'+download(s.name,"text/csv",s.text)+'<pre>'+esc(s.text)+'</pre></details>').join("")+'</html>';
}
const sampleSources=()=>clone({"settings":{"openingAt":"2026-10-15T00:00:00-04:00","cutoffAt":"2026-10-15T12:00:00-04:00"},"sources":{"items":{"name":"authored-items.csv","text":"item_id,name,kind,base_unit\r\nMALT,Pale malt,ingredient,kg\r\nHOPS,Cascade hops,ingredient,g\r\nBEER,IPA bulk,finished-beer,L\r\nKEG-HALF,IPA half-barrel keg SKU,packaged-beer,each\r\nCASE-12,IPA twelve-can case SKU,packaged-beer,each\r\nCANS,Empty cans,packaging,each\r\nWHEAT,Wheat malt,ingredient,kg\r\n"},"aliases":{"name":"authored-aliases.csv","text":"source_system,source_item_id,item_id\r\nerp,MALT,MALT\r\nerp,HOPS,HOPS\r\nerp,HOPSNEW,HOPS\r\nerp,WHEAT,WHEAT\r\nerp,BEER,BEER\r\npos,DRAFTIPA,BEER\r\nwholesale,KEGHALF,KEG-HALF\r\nwholesale,CASE12,CASE-12\r\n"},"opening":{"name":"authored-opening.csv","text":"﻿row_id,item_id,lot_id,location,quantity,unit\r\no-m,MALT,malt-1,grain,100,kg\r\no-h,HOPS,hop-1,cold,5000,g\r\no-b,BEER,brew-17,tank,200,L\r\no-k,KEG-HALF,brew-17,packaged,10,each\r\no-c,CASE-12,brew-17,packaged,20,each\r\no-e,CANS,can-1,dry,100,each\r\no-w,WHEAT,wheat-1,grain,5,kg\r\n"},"movements":{"name":"authored-movements.csv","text":"event_id,source_system,source_item_id,lot_id,location,occurred_at,quantity,unit\r\nm-receipt,erp,MALT,malt-1,grain,2026-10-15T05:00:00Z,25,kg\r\nm-brew,erp,MALT,malt-1,grain,2026-10-15T06:00:00Z,-10,kg\r\nh-receipt,erp,HOPS,hop-1,cold,2026-10-15T05:00:00Z,1,lb\r\nh-brew,erp,HOPS,hop-1,cold,2026-10-15T06:00:00Z,-953.59237,g\r\nbefore,pos,DRAFTIPA,brew-17,tank,2026-10-15T04:00:00Z,-999,L\r\nbeer-receipt,erp,BEER,brew-17,tank,2026-10-15T04:00:00.000000001Z,10,L\r\ntap-draw,pos,DRAFTIPA,brew-17,tank,2026-10-15T11:00:00Z,-30,L\r\ntap-draw,pos,DRAFTIPA,brew-17,tank,2026-10-15T11:00:00Z,-30,L\r\nsample-gallon,pos,DRAFTIPA,brew-17,tank,2026-10-15T12:00:00Z,-1,us_gal\r\nat-cutoff,pos,DRAFTIPA,brew-17,tank,2026-10-15T16:00:00Z,-1,L\r\nafter,pos,DRAFTIPA,brew-17,tank,2026-10-15T16:00:00.000000001Z,-100,L\r\nwh-keg,wholesale,KEGHALF,brew-17,packaged,2026-10-15T13:00:00Z,-3,each\r\nwh-case,wholesale,CASE12,brew-17,packaged,2026-10-15T13:00:00Z,-2,each\r\nw-brew,erp,WHEAT,wheat-1,grain,2026-10-15T07:00:00Z,-6,kg\r\nnew-hops,erp,HOPSNEW,hop-new,cold,2026-10-15T08:00:00Z,100,g\r\n"},"target":{"name":"authored-target.csv","text":"row_id,item_id,lot_id,location,quantity,unit\r\nt-m,MALT,malt-1,grain,115,kg\r\nt-h,HOPS,hop-1,cold,4500,g\r\nt-b,BEER,brew-17,tank,174,L\r\nt-k,KEG-HALF,brew-17,packaged,7,each\r\nt-c,CASE-12,brew-17,packaged,18,each\r\nt-w,WHEAT,wheat-1,grain,0,kg\r\nt-hnew,HOPS,hop-new,cold,100,g\r\n"},"recipes":{"name":"authored-recipes.csv","text":"recipe_id,version,ingredient_item_id,quantity,unit,target_yield,target_unit\r\nIPA,1,MALT,20,kg,100,L\r\nIPA,1,HOPS,100,g,100,L\r\nIPA,2,MALT,22,kg,100,L\r\nIPA,2,HOPS,110,g,100,L\r\n"},"accounts":{"name":"authored-accounts.csv","text":"account_id,name\r\nACCT-1,Authored local wholesale account\r\n"},"orders":{"name":"authored-orders.csv","text":"line_id,account_id,item_id,quantity,unit,status\r\nORDER-1-L1,ACCT-1,KEG-HALF,2,each,open\r\nORDER-2-L1,ACCT-1,CASE-12,1,each,cancelled\r\n"}},"notes":"AUTHORED EXAMPLE. Quantities illustrate opening-to-cutoff inventory reconciliation. Source count basis: one declared item/lot/location opening balance and one independent target count. Movement source systems are authoritative for the specified event IDs."});
return {sampleSources,schema:SCHEMA,columns:clone(columns),required:required.slice(),optional:optional.slice(),units:clone(units),create,reopen,receive,editions,analyse,review,csv,report,parseCSV,encodeCSV,sha256,digest,convert:(v,a,b)=>quantity(convert(v,a,b)),timestamp:(v)=>timestamp(v,"Timestamp").toString()};

}
