// Independent source-preserving hardware revision review. No native CAD or PLM mutation.
export const INPUT_SCHEMA="tjlabs.hardware-review-input.v1";
export function blankInput(){return {schema:INPUT_SCHEMA,scope:{productId:"",revision:"",owner:""},netlist:{sourceId:"",format:"kicadxml"},componentPartField:"MPN",bom:{sourceId:"",format:"csv",arrayPointer:"",mapping:{partNumber:"child_part_number",quantity:"qty",unit:"uom",references:"refdes",notes:"notes"},referenceSeparator:",",defaultUnit:"each",quantityBasis:"per-assembly"},firmware:{sourceId:"",format:"json",arrayPointer:"/pins",mapping:{id:"/id",componentRef:"/componentRef",pin:"/pin",expectedNet:"/expectedNet",connection:"/connection",symbol:"/symbol",notes:"/notes"}},requiredDisciplines:["EE","FW","MFG"]};}
export const FIELD_SPEC={scope:["productId","revision","owner"],netlist:["sourceId","format"],bom:["sourceId","format","arrayPointer","mapping","referenceSeparator","defaultUnit","quantityBasis"],bomMapping:["partNumber","quantity","unit","references","notes"],firmwareMapping:["id","componentRef","pin","expectedNet","connection","symbol","notes"],proposal:["name","baseEditionId","candidateEditionId","preparedBy","reason"],review:["proposalId","discipline","decision","reviewer","note"]};
export function createHardwareReviewAPI(runtime){
 const {sha256,encode,decode,toBase64,fromBase64}=runtime;
 if([sha256,encode,decode,toBase64,fromBase64].some(f=>typeof f!=="function"))throw Error("Complete hashing/UTF8/Base64 runtime required");
 const SCHEMA="tjlabs.hardware-review-workspace.v1",ENGINE="hardware-review-1.0.0",clone=x=>JSON.parse(JSON.stringify(x)),need=(v,m)=>{if(!v)throw Error(m);};
 function canonical(x){if(x===null||typeof x!=="object"){need(x===null||["string","boolean","number"].includes(typeof x),"JSON values only");if(typeof x==="number")need(Number.isFinite(x),"Finite JSON numbers only");return JSON.stringify(x);}if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";}
 const hash=x=>sha256(typeof x==="string"?x:canonical(x)),unique=a=>[...new Set(a)];
 const trusted=new WeakSet(),inspectionCache=new WeakMap(),retainedSize=new WeakMap();
 function deepFreeze(x){if(x&&typeof x==="object"&&!Object.isFrozen(x)){for(const v of Object.values(x))deepFreeze(v);Object.freeze(x);}return x;}
 function trust(w){deepFreeze(w);trusted.add(w);return w;}
 function text(v,label){need(typeof v==="string"&&v.length>0&&v.length<=4096,label+" must be nonempty text");return v;}
 function int(v,label,min=0,max=Number.MAX_SAFE_INTEGER){need(Number.isSafeInteger(v)&&v>=min&&v<=max,label+" must be an integer in range");return v;}
 function gcd(a,b){a=a<0n?-a:a;b=b<0n?-b:b;while(b){const c=a%b;a=b;b=c;}return a||1n;}
 function Q(n,d=1n){need(d!==0n,"Zero denominator");if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};}
 const Z=Q(0n),ONE=Q(1n),add=(a,b)=>Q(a.n*b.d+b.n*a.d,a.d*b.d),sub=(a,b)=>Q(a.n*b.d-b.n*a.d,a.d*b.d),mul=(a,b)=>Q(a.n*b.n,a.d*b.d),div=(a,b)=>Q(a.n*b.d,a.d*b.n),abs=a=>Q(a.n<0n?-a.n:a.n,a.d),cmp=(a,b)=>a.n*b.d<b.n*a.d?-1:a.n*b.d>b.n*a.d?1:0;
 function decimal(v,label){need(typeof v==="string"&&v.length<=128&&/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v),label+" must be an exact decimal string");let [m,e="0"]=v.toLowerCase().split("e");const exponent=Number(e);need(Number.isSafeInteger(exponent)&&Math.abs(exponent)<=48,"Decimal exponent out of bounds");let sign=1n;if(m[0]==="-"){sign=-1n;m=m.slice(1);}else if(m[0]==="+")m=m.slice(1);let [a,b=""]=m.split(".");need((a+b).length<=60&&b.length<=48,"Decimal precision limit");const power=exponent-b.length;return power>=0?Q(sign*BigInt(a+b)*10n**BigInt(power)):Q(sign*BigInt(a+b),10n**BigInt(-power));}
 function fmt(q,places=9){const n=q.n<0n?-q.n:q.n,scale=10n**BigInt(places);let v=n*scale/q.d;if(n*scale%q.d*2n>=q.d)v++;let s=v.toString().padStart(places+1,"0");if(places)s=s.slice(0,-places)+"."+s.slice(-places);s=s.replace(/(\.\d*?)0+$/,"$1").replace(/\.$/,"");return(q.n<0n&&v!==0n?"-":"")+s;}
 const output=q=>q?{value:fmt(q),exact:{numerator:q.n.toString(),denominator:q.d.toString()}}:null;
 const restore=q=>Q(BigInt(q.exact.numerator),BigInt(q.exact.denominator));

function sourceBody(s){let b;try{b=fromBase64(s.content_base64);}catch{throw Error("Invalid original Base64");}need(toBase64(b)===s.content_base64,"Noncanonical original Base64");need(b.length===s.bytes,"Original byte count mismatch");return b;}
  function sourceText(s){const b=sourceBody(s);need(sha256(b)===s.bodySha256,"Original source digest mismatch");const t=decode(b);need(toBase64(encode(t))===s.content_base64,"Source is not exact UTF-8 text; original opaque bytes remain retained");return t;}
  function refKey(r){return canonical(r);}
  function pointer(x,p){need(typeof p==="string"&&(p===""||p[0]==="/"),"JSON pointer must be empty or start /");for(const s of p===""?[]:p.slice(1).split("/").map(v=>v.replace(/~1/g,"/").replace(/~0/g,"~"))){need(x!==null&&typeof x==="object"&&Object.prototype.hasOwnProperty.call(x,s),"Missing pointer "+p);x=x[s];}return x;}
  // JSON numeric tokens are retained as strings; duplicate members are rejected instead of overwritten.
  function losslessJSON(s,preserveNumbers=true){let i=0;const ws=()=>{while(/[ \t\r\n]/.test(s[i]||"")&&i<s.length)i++;};function str(){const a=i++;let esc=false;while(i<s.length){const c=s[i++];if(c==='"'&&!esc)return JSON.parse(s.slice(a,i));if(c==="\\"&&!esc)esc=true;else esc=false;}throw Error("Unclosed JSON string");}function read(){ws();const c=s[i];if(c==='"')return str();if(c==="{"){i++;const o={};ws();if(s[i]==="}"){i++;return o;}while(true){ws();need(s[i]==='"',"Expected object key");const k=str();need(!Object.prototype.hasOwnProperty.call(o,k),"Duplicate JSON member "+k);ws();need(s[i++]===":","Expected colon");Object.defineProperty(o,k,{value:read(),enumerable:true,writable:true,configurable:true});ws();if(s[i]==="}"){i++;return o;}need(s[i++]===",","Expected comma");}}if(c==="["){i++;const a=[];ws();if(s[i]==="]"){i++;return a;}while(true){a.push(read());ws();if(s[i]==="]"){i++;return a;}need(s[i++]===",","Expected comma");}}for(const [lit,v]of[["true",true],["false",false],["null",null]])if(s.slice(i,i+lit.length)===lit){i+=lit.length;return v;}const m=s.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);need(m,"Invalid JSON token");i+=m[0].length;return preserveNumbers?m[0]:JSON.parse(m[0]);}const v=read();ws();need(i===s.length,"Trailing JSON content");return v;}
  function csv(s,delimiter){const rows=[],row=[];let field="",i=0,quoted=false,closed=false;function end(){row.push(field);field="";closed=false;}function line(){end();rows.push(row.splice(0));}while(i<s.length){const c=s[i++];if(quoted){if(c==='"'){if(s[i]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}if(closed&&c!==delimiter&&c!=="\r"&&c!=="\n")throw Error("Text after closing CSV quote");if(c==='"'){need(field===""&&!closed,"Quote inside unquoted CSV field");quoted=true;}else if(c===delimiter)end();else if(c==="\r"||c==="\n"){if(c==="\r"&&s[i]==="\n")i++;line();}else field+=c;}need(!quoted,"Unclosed CSV quote");if(field!==""||row.length||closed)line();return rows;}
  function inspectSource(w,sourceId,options={}){if(!trusted.has(w))w=validateWorkspace(w);const s=w.sources.find(x=>x.id===sourceId);need(s,"Source not found");let t=sourceText(s);if(t[0]==="\uFEFF")t=t.slice(1);const format=options.format||"csv",findings=[];let rows,columns;if(format==="json"){const body=losslessJSON(t),a=pointer(body,options.arrayPointer||"");need(Array.isArray(a),"Selected JSON pointer is not an array");rows=a.map((v,i)=>{need(v&&typeof v==="object"&&!Array.isArray(v),"JSON table row must be an object");return {rowId:hash({sourceId,record:i+1}),index:i+1,values:v,sourceRef:{sourceId,format,record:i+1,pointer:(options.arrayPointer||"")+"/"+i}};});columns=unique(rows.flatMap(x=>Object.keys(x.values)));}else{need(format==="csv"||format==="tsv","Unsupported table format");const a=csv(t,format==="tsv"?"\t":",");need(a.length,"Empty delimited source");columns=a.shift();need(columns.every(x=>x.length)&&new Set(columns).size===columns.length,"Headers must be nonempty and unique");rows=a.map((v,i)=>{need(v.length===columns.length,"Row "+(i+2)+" has "+v.length+" columns; expected "+columns.length);return {rowId:hash({sourceId,record:i+2}),index:i+2,values:Object.fromEntries(columns.map((k,j)=>[k,v[j]])),sourceRef:{sourceId,format,record:i+2}};});}need(rows.length<=50000,"Maximum 50,000 rows per source table");return {sourceId,format,columns,rows,findings,numericPolicy:"JSON numbers retain their original lexical value as text."};}
  function mapRows(w,sourceId,options){const t=inspectSource(w,sourceId,options),mapping=options.mapping||{};need(Object.keys(mapping).length,"Provide explicit output-field to source-column/pointer mappings");const rows=t.rows.map(r=>{const o={};for(const [key,sel]of Object.entries(mapping)){text(key,"Mapped field");let v;if(t.format==="json")v=pointer(r.values,sel);else{need(Object.prototype.hasOwnProperty.call(r.values,sel),"Unknown source column "+sel);v=r.values[sel];}need(v===null||["string","boolean"].includes(typeof v),"Mapped values must be scalar text/boolean/null");Object.defineProperty(o,key,{value:v,enumerable:true,writable:true,configurable:true});}o.sourceRefs=[r.sourceRef];return o;});return {rows,findings:t.findings,sourceId};}
  

 function parseXML(s){
  let i=0,count=0;const roots=[],stack=[];
  const validChar=n=>n===9||n===10||n===13||(n>=32&&n<=0xd7ff)||(n>=0xe000&&n<=0xfffd)||(n>=0x10000&&n<=0x10ffff);
  for(const c of s)need(validChar(c.codePointAt(0)),"Invalid XML character");
  function entities(t){return t.replace(/&([^;]*);/g,(whole,e)=>{if(e==="amp")return "&";if(e==="lt")return "<";if(e==="gt")return ">";if(e==="quot")return '"';if(e==="apos")return "'";if(/^#(?:x[0-9a-fA-F]+|[0-9]+)$/.test(e)){const n=e[1]==="x"?parseInt(e.slice(2),16):Number(e.slice(1));need(validChar(n),"Invalid numeric XML entity");return String.fromCodePoint(n);}throw Error("Unsupported XML entity "+whole);});}
  function decodeText(t){need(!/&(?!amp;|lt;|gt;|quot;|apos;|#(?:x[0-9a-fA-F]+|[0-9]+);)/.test(t),"Invalid or unknown XML entity");return entities(t);}
  const space=()=>{while(i<s.length&&/[ \t\r\n]/.test(s[i]))i++;};
  function name(){const m=s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_.:-]*/);need(m,"Invalid XML name");i+=m[0].length;return m[0];}
  function addText(t,decoded=true){if(!stack.length){need(!t.trim(),"Text outside XML root");return;}t=t.replace(/\r\n?/g,"\n");stack[stack.length-1].text+=decoded?decodeText(t):t;}
  while(i<s.length){
   if(s[i]!=="<"){const j=s.indexOf("<",i),end=j<0?s.length:j;const t=s.slice(i,end);need(!t.includes("]]>"),"CDATA terminator outside CDATA");addText(t);i=end;continue;}
   if(s.startsWith("<!--",i)){const j=s.indexOf("-->",i+4);need(j>=0&&!s.slice(i+4,j).includes("--"),"Invalid XML comment");i=j+3;continue;}
   if(s.startsWith("<![CDATA[",i)){const j=s.indexOf("]]>",i+9);need(j>=0&&stack.length,"Invalid XML CDATA");addText(s.slice(i+9,j),false);i=j+3;continue;}
   if(s.startsWith("<?",i)){const j=s.indexOf("?>",i+2);need(j>=0,"Unclosed XML processing instruction");const body=s.slice(i+2,j);if(/^xml\b/i.test(body)){need(i===0||i===1&&s[0]==="\uFEFF","XML declaration must be first");need(!/encoding\s*=\s*["'](?!utf-8["'])/i.test(body),"Only UTF-8 XML is admitted");}i=j+2;continue;}
   need(!s.startsWith("<!",i),"DTD and external/custom entities are not admitted");
   if(s.startsWith("</",i)){i+=2;const n=name();space();need(s[i++]===">","Invalid XML closing tag");const node=stack.pop();need(node&&node.name===n,"Mismatched XML closing tag "+n);node.end=i;continue;}
   const start=i++;const n=name(),attrs=Object.create(null);let self=false;while(true){const before=i;space();if(s.startsWith("/>",i)){i+=2;self=true;break;}if(s[i]===">"){i++;break;}need(i>before,"XML attributes require whitespace");const a=name();need(!Object.prototype.hasOwnProperty.call(attrs,a),"Duplicate XML attribute "+a);space();need(s[i++]==="=","Missing XML attribute equals");space();const q=s[i++];need(q==='"'||q==="'","XML attribute must be quoted");const j=s.indexOf(q,i);need(j>=0,"Unclosed XML attribute");const v=s.slice(i,j);need(!v.includes("<"),"Raw < in XML attribute");attrs[a]=decodeText(v.replace(/\r\n/g,"\n").replace(/[\t\r\n]/g," "));i=j+1;}
   const parent=stack[stack.length-1],siblings=parent?parent.children:roots;const node={name:n,attrs,children:[],text:"",start,end:self?i:null,path:(parent?parent.path:"")+"/"+n+"["+(siblings.filter(x=>x.name===n).length+1)+"]"};siblings.push(node);count++;need(count<=200000,"XML node limit exceeded");if(!self){stack.push(node);need(stack.length<=64,"XML depth limit exceeded");}
  }
  need(!stack.length&&roots.length===1,"XML must contain one closed root");return roots[0];
 }
 function parseNetlist(w,sourceId){
  if(!trusted.has(w))w=validateWorkspace(w);const src=w.sources.find(x=>x.id===sourceId);need(src,"Netlist original missing");
  let t=sourceText(src);const bomOffset=t[0]==="\uFEFF"?1:0;if(bomOffset)t=t.slice(1);
  const root=parseXML(t);need(root.name==="export"&&["D","E"].includes(root.attrs.version),"Selected netlist must be KiCad XML export version D or E");
  const findings=[];const issue=(code,message,ref)=>findings.push({code,severity:"error",message,sourceRefs:ref?[ref]:[]});
  const ref=n=>({sourceId,format:"kicadxml",path:n.path,charStart:n.start+bomOffset,charEnd:n.end+bomOffset});
  function kids(n,k){return n.children.filter(c=>c.name===k);}
  function one(n,k,required=false){const a=kids(n,k);if(a.length>1)issue("DUPLICATE_XML_ELEMENT","Repeated "+k+" element is ambiguous",ref(n));if(required&&!a.length)issue("MISSING_XML_ELEMENT","Required "+k+" element missing",ref(n));return a[0]||null;}
  const txt=(n,k)=>{const a=one(n,k);return a?a.text:"";};
  const section=k=>one(root,k,true);
  const design=section("design"),comps=section("components"),libs=one(root,"libparts"),netsSection=section("nets");
  const libraries=one(root,"libraries");
  const libparts=(libs?kids(libs,"libpart"):[]).map(n=>({lib:n.attrs.lib||"",part:n.attrs.part||"",description:txt(n,"description"),pins:(one(n,"pins")?.children||[]).filter(x=>x.name==="pin").map(p=>({number:p.attrs.num||"",name:p.attrs.name||"",type:p.attrs.type||"",sourceRefs:[ref(p)]})),sourceRefs:[ref(n)]}));
  const components=(comps?kids(comps,"comp"):[]).map(n=>{
   const sheet=one(n,"sheetpath"),lib=one(n,"libsource"),stamp=one(n,"tstamps")||one(n,"tstamp");const stamps=(stamp?.text||"").trim().split(/\s+/).filter(Boolean);
   const fields=(one(n,"fields")?.children||[]).filter(x=>x.name==="field").map(f=>({name:f.attrs.name||"",value:f.text,sourceRefs:[ref(f)]}));
   const properties=kids(n,"property").map(p=>({name:p.attrs.name||"",value:p.attrs.value??null,sourceRefs:[ref(p)]}));
   const reference=n.attrs.ref||"",path=sheet?.attrs.tstamps||"",identity=path&&stamps.length?canonical([path,[...stamps].sort()]):"reference:"+reference;
   if(!reference)issue("EMPTY_REFERENCE","Component reference is empty",ref(n));
   if(new Set(stamps).size!==stamps.length)issue("DUPLICATE_UNIT_UUID","Component repeats a unit timestamp",ref(n));
   const duplicateFields=fields.filter((f,i)=>fields.findIndex(a=>a.name===f.name)!==i);if(duplicateFields.length)issue("DUPLICATE_COMPONENT_FIELD","Component repeats named fields",ref(n));
   return {id:hash({identity}),identity,identityBasis:path&&stamps.length?"sheetpath-and-unit-uuids":"reference-fallback",reference,value:txt(n,"value"),footprint:txt(n,"footprint"),datasheet:txt(n,"datasheet"),description:txt(n,"description"),sheetPath:path,sheetNames:sheet?.attrs.names||"",unitUuids:stamps,library:{lib:lib?.attrs.lib||"",part:lib?.attrs.part||""},fields,properties,dnp:properties.some(p=>p.name==="dnp"),excludeFromBom:properties.some(p=>p.name==="exclude_from_bom"),excludeFromBoard:properties.some(p=>p.name==="exclude_from_board"),sourceRefs:[ref(n)]};
  });
  const nets=(netsSection?kids(netsSection,"net"):[]).map(n=>({code:n.attrs.code||"",name:n.attrs.name||"",netClass:n.attrs.class||"",nodes:kids(n,"node").map(x=>({reference:x.attrs.ref||"",pin:x.attrs.pin||"",pinFunction:x.attrs.pinfunction||"",pinType:x.attrs.pintype||"",sourceRefs:[ref(x)]})),sourceRefs:[ref(n)]}));
  return {format:"kicadxml",exportVersion:root.attrs.version,design:design?{source:txt(design,"source"),date:txt(design,"date"),tool:txt(design,"tool"),sourceRefs:[ref(design)]}:null,components,libparts,nets,libraries:libraries?libraries.children.filter(x=>x.name==="library").map(n=>({logical:n.attrs.logical||"",uri:txt(n,"uri"),sourceRefs:[ref(n)]})):[],findings};
 }

 function analyse(input,w){
  if(!trusted.has(w))w=validateWorkspace(w);
  const findings=[],addFinding=(severity,code,message,sourceRefs=[],context={})=>findings.push({severity,code,message,sourceRefs:clone(sourceRefs),context:clone(context)});
  const error=(code,message,refs=[],context={})=>addFinding("error",code,message,refs,context),warn=(code,message,refs=[],context={})=>addFinding("warning",code,message,refs,context);
  const scope=clone(input?.scope||{});let netlist=null,bomRows=[],firmwareRows=[],components=[],pins=[],bom=[],firmware=[];
  try{need(input?.schema===INPUT_SCHEMA,"Unsupported input schema");text(scope.productId,"Product");text(scope.revision,"Revision");text(scope.owner,"Source owner");need(input.netlist?.format==="kicadxml","Select KiCad XML D/E explicitly");text(input.componentPartField,"Component part-number field");need(Array.isArray(input.requiredDisciplines)&&input.requiredDisciplines.length&&input.requiredDisciplines.every(v=>["EE","FW","MFG"].includes(v)),"Select required EE/FW/MFG review disciplines");need(new Set(input.requiredDisciplines).size===input.requiredDisciplines.length,"Repeated review discipline");}catch(e){error("INPUT_CONFIGURATION",e.message);}
  try{netlist=parseNetlist(w,input.netlist.sourceId);findings.push(...netlist.findings);components=netlist.components;}catch(e){error("NETLIST_SOURCE",e.message);}
  function mapped(config,kind){
   try{need(config&&typeof config==="object","Source selection required");const t=inspectSource(w,config.sourceId,{format:config.format,arrayPointer:config.arrayPointer||""});return t.rows.map(r=>{const values={};let valid=true;for(const[k,sel]of Object.entries(config.mapping||{})){if(sel===""||sel===null)continue;try{let v;if(t.format==="json")v=pointer(r.values,sel);else{need(Object.prototype.hasOwnProperty.call(r.values,sel),"Missing column "+sel);v=r.values[sel];}need(v===null||["string","boolean"].includes(typeof v),"Mapped field "+k+" must be scalar");values[k]=v;}catch(e){valid=false;error(kind+"_MAPPING",e.message,[r.sourceRef],{field:k});}}return {id:r.rowId,record:r.index,values,rawValues:r.values,valid,sourceRefs:[r.sourceRef]};});}catch(e){error(kind+"_SOURCE",e.message);return [];}
  }
  bomRows=mapped(input?.bom,"BOM");firmwareRows=mapped(input?.firmware,"FIRMWARE");
  const byRef=new Map(),byIdentity=new Map(),libByKey=new Map();
  function group(map,key,value){if(!map.has(key))map.set(key,[]);map.get(key).push(value);}
  for(const l of netlist?.libparts||[])group(libByKey,canonical([l.lib,l.part]),l);
  for(const c of components){group(byRef,c.reference,c);group(byIdentity,c.identity,c);if(c.identityBasis==="reference-fallback")warn("REFERENCE_IDENTITY","No complete sheetpath/unit identity; comparisons use exact reference only",c.sourceRefs,{reference:c.reference});
   const fs=c.fields.filter(f=>f.name===input.componentPartField);c.partNumber=fs.length===1?fs[0].value:"";c.assemblyIncluded=!c.dnp&&!c.excludeFromBom;
   if(c.assemblyIncluded&&!c.partNumber)error("COMPONENT_PART_NUMBER","Included component lacks one selected part-number field",c.sourceRefs,{reference:c.reference,field:input.componentPartField});
  }
  for(const [k,a]of byRef)if(a.length>1)error("DUPLICATE_REFERENCE","Reference designator is ambiguous",a.flatMap(x=>x.sourceRefs),{reference:k,count:a.length});
  for(const [k,a]of byIdentity)if(a.length>1)error("DUPLICATE_COMPONENT_IDENTITY","Sheetpath/unit identity is ambiguous",a.flatMap(x=>x.sourceRefs),{identity:k,count:a.length});
  for(const [k,a]of libByKey)if(a.length>1)error("DUPLICATE_LIBRARY_PART","Library-part definition is ambiguous",a.flatMap(x=>x.sourceRefs),{library:k});
  const netCodes=new Map(),physical=new Map();
  for(const net of netlist?.nets||[]){
   group(netCodes,net.code,net);if(!net.code)error("EMPTY_NET_CODE","Net code is empty",net.sourceRefs);
   for(const node of net.nodes){const cc=byRef.get(node.reference)||[],component=cc.length===1?cc[0]:null;
    if(!component)error("UNKNOWN_NET_REFERENCE","Net node does not identify one component",node.sourceRefs,{reference:node.reference,pin:node.pin});
    if(!node.pin)error("EMPTY_PIN","Net node pin string is empty",node.sourceRefs,{reference:node.reference});
    const pin={id:hash({source:node.sourceRefs[0]}),componentId:component?.id||null,componentIdentity:component?.identity||null,reference:node.reference,pin:node.pin,netCode:net.code,netName:net.name,netClass:net.netClass,pinFunction:node.pinFunction,pinType:node.pinType,sourceRefs:[...node.sourceRefs,...net.sourceRefs]};
    pins.push(pin);if(component&&node.pin)group(physical,canonical([component.identity,node.pin]),pin);
    if(component){const ll=libByKey.get(canonical([component.library.lib,component.library.part]))||[];if(ll.length===1&&ll[0].pins.length&&!ll[0].pins.some(p=>p.number===node.pin))error("UNKNOWN_LIBRARY_PIN","Net references a pin absent from the selected library part",pin.sourceRefs,{reference:node.reference,pin:node.pin});}
   }
  }
  for(const [code,ns]of netCodes)if(ns.length>1)error("DUPLICATE_NET_CODE","Net code repeats within this export",ns.flatMap(x=>x.sourceRefs),{code});
  for(const [key,ps]of physical)if(ps.length>1)error(new Set(ps.map(p=>p.netCode)).size>1?"PIN_MULTIPLE_NETS":"DUPLICATE_NET_NODE","Physical pin occurs more than once in connectivity",ps.flatMap(x=>x.sourceRefs),{pinKey:key,count:ps.length});
  const quantityBasis=input?.bom?.quantityBasis;if(quantityBasis!=="per-assembly")error("BOM_QUANTITY_BASIS","BOM quantities must explicitly represent one assembly");
  const expectedByPart=new Map();for(const c of components)if(c.assemblyIncluded&&c.partNumber)group(expectedByPart,c.partNumber,c);
  const seenRefs=new Map(),bomByPart=new Map();
  for(const row of bomRows){const v=row.values,refs=row.sourceRefs;let q=null,valid=row.valid;
   try{text(v.partNumber,"BOM part number");q=decimal(v.quantity,"BOM quantity");need(cmp(q,Z)>0,"BOM quantity must be greater than zero");}catch(e){valid=false;error("BOM_VALUE",e.message,refs,{record:row.record});}
   const unit=v.unit===null||v.unit===undefined||v.unit===""?input.bom.defaultUnit:v.unit;
   if(unit!=="each"){valid=false;error("BOM_UNIT","Reference-count reconciliation requires explicit unit each; other units remain original and need a separately agreed rule",refs,{unit:unit??null});}
   let references=[];try{need(typeof input.bom.referenceSeparator==="string"&&input.bom.referenceSeparator.length===1,"Declare one literal reference separator");if(v.references!==undefined&&v.references!==null&&v.references!==""){need(typeof v.references==="string","BOM references must be text");references=v.references.split(input.bom.referenceSeparator).map(x=>x.trim());need(references.every(Boolean),"Empty reference in BOM list");need(new Set(references).size===references.length,"Repeated reference within BOM row");}}catch(e){valid=false;error("BOM_REFERENCES",e.message,refs);}
   for(const reference of references){group(seenRefs,reference,row);const cs=byRef.get(reference)||[];if(cs.length!==1){valid=false;error("BOM_UNKNOWN_REFERENCE","BOM reference does not identify one component",refs,{reference});continue;}const c=cs[0];if(c.partNumber!==v.partNumber)error("BOM_PART_MISMATCH","BOM part number differs from selected component field",[...refs,...c.sourceRefs],{reference,bomPart:v.partNumber??null,componentPart:c.partNumber});if(!c.assemblyIncluded)error("BOM_EXCLUDED_REFERENCE","BOM includes a DNP or excluded-from-BOM component",[...refs,...c.sourceRefs],{reference,dnp:c.dnp,excludeFromBom:c.excludeFromBom});}
   if(q&&references.length&&cmp(q,Q(BigInt(references.length)))!==0)error("BOM_REFERENCE_QUANTITY","Declared quantity differs from the explicit reference count",refs,{references:references.length,quantity:output(q)});
   const result={id:row.id,partNumber:typeof v.partNumber==="string"?v.partNumber:"",quantity:q?output(q):null,unit:typeof unit==="string"?unit:"",references,notes:typeof v.notes==="string"?v.notes:"",valid,sourceRefs:refs,original:clone(row)};
   bom.push(result);if(result.partNumber)group(bomByPart,result.partNumber,result);
  }
  for(const [r,rows]of seenRefs)if(rows.length>1)error("BOM_REFERENCE_REUSED","Component is allocated to multiple BOM rows",rows.flatMap(x=>x.sourceRefs),{reference:r,count:rows.length});
  const bomReconciliation=[];
  for(const part of unique([...expectedByPart.keys(),...bomByPart.keys()])){
   const cs=expectedByPart.get(part)||[],bs=bomByPart.get(part)||[],sum=bs.filter(x=>x.quantity&&x.unit==="each").reduce((n,x)=>add(n,restore(x.quantity)),Z),complete=bs.every(x=>x.valid&&x.quantity&&x.unit==="each");
   if(!bs.length&&cs.length)error("BOM_PART_MISSING","Included schematic part is absent from BOM",cs.flatMap(x=>x.sourceRefs),{partNumber:part,expected:cs.length});
   if(bs.length&&!cs.length)error("BOM_PART_EXTRA","BOM part has no included schematic component",bs.flatMap(x=>x.sourceRefs),{partNumber:part});
   if(complete&&cmp(sum,Q(BigInt(cs.length)))!==0)error("BOM_TOTAL_QUANTITY","Per-assembly BOM quantity differs from included schematic components",bs.flatMap(x=>x.sourceRefs),{partNumber:part,expected:cs.length,actual:output(sum)});
   if(bs.some(x=>x.references.length)&&cs.some(c=>!bs.some(b=>b.references.includes(c.reference))))error("BOM_REFERENCE_COVERAGE","Partial reference lists omit included components",bs.flatMap(x=>x.sourceRefs),{partNumber:part,missing:cs.filter(c=>!bs.some(b=>b.references.includes(c.reference))).map(c=>c.reference)});
   bomReconciliation.push({partNumber:part,expectedQuantity:cs.length,declaredQuantity:output(sum),complete,componentIds:cs.map(c=>c.id),references:cs.map(c=>c.reference),rowIds:bs.map(x=>x.id)});
  }
  const firmwareIds=new Map();
  for(const row of firmwareRows){const v=row.values;let valid=row.valid;try{text(v.id,"Firmware contract id");text(v.componentRef,"Firmware component reference");text(v.pin,"Firmware pin string");text(v.symbol,"Firmware symbol");need(["net","unconnected"].includes(v.connection),"Firmware connection must be net or unconnected");if(v.connection==="net")text(v.expectedNet,"Expected net");}catch(e){valid=false;error("FIRMWARE_VALUE",e.message,row.sourceRefs);}
   const cs=byRef.get(v.componentRef)||[],c=cs.length===1?cs[0]:null,ps=c?(physical.get(canonical([c.identity,v.pin]))||[]):[];
   if(!c){valid=false;error("FIRMWARE_UNKNOWN_REFERENCE","Firmware contract does not identify one schematic component",row.sourceRefs,{reference:v.componentRef??null});}
   if(ps.length>1){valid=false;error("FIRMWARE_AMBIGUOUS_PIN","Firmware contract targets ambiguous connectivity",row.sourceRefs,{reference:v.componentRef,pin:v.pin});}
   if(c){const ll=libByKey.get(canonical([c.library.lib,c.library.part]))||[];if(ll.length!==1||!ll[0].pins.length){if(v.connection==="unconnected"){valid=false;error("FIRMWARE_PIN_INVENTORY_UNKNOWN","An unconnected declaration requires the selected library pin inventory to establish pin existence",row.sourceRefs,{reference:v.componentRef,pin:v.pin});}else warn("FIRMWARE_PIN_INVENTORY_UNKNOWN","Library pin inventory is unavailable; selected connectivity supplies the pin occurrence only",row.sourceRefs,{reference:v.componentRef,pin:v.pin});}else if(!ll[0].pins.some(p=>p.number===v.pin)){valid=false;error("FIRMWARE_UNKNOWN_PIN","Firmware pin is absent from the selected library definition",row.sourceRefs,{reference:v.componentRef,pin:v.pin});}}
   const actualNet=ps.length===1?ps[0].netName:null;
   const matches=valid&&(v.connection==="unconnected"?ps.length===0:ps.length===1&&actualNet===v.expectedNet);
   if(valid&&!matches)error("FIRMWARE_NET_MISMATCH","Declared firmware contract differs from schematic connectivity",[...row.sourceRefs,...ps.flatMap(p=>p.sourceRefs)],{reference:v.componentRef,pin:v.pin,connection:v.connection,expectedNet:v.expectedNet??null,actualNet});
   const result={id:typeof v.id==="string"?v.id:row.id,componentId:c?.id||null,reference:typeof v.componentRef==="string"?v.componentRef:"",pin:typeof v.pin==="string"?v.pin:"",symbol:typeof v.symbol==="string"?v.symbol:"",connection:typeof v.connection==="string"?v.connection:"",expectedNet:typeof v.expectedNet==="string"?v.expectedNet:"",actualNet,notes:typeof v.notes==="string"?v.notes:"",valid,matches,sourceRefs:row.sourceRefs,original:clone(row)};
   firmware.push(result);group(firmwareIds,result.id,result);
  }
  for(const [id,rows]of firmwareIds)if(rows.length>1)error("DUPLICATE_FIRMWARE_ID","Firmware contract id repeats",rows.flatMap(x=>x.sourceRefs),{id});
  if(!firmwareRows.length)warn("NO_FIRMWARE_ROWS","No selected firmware contract rows; coverage is empty");
  const summary={componentCount:components.length,includedComponentCount:components.filter(c=>c.assemblyIncluded).length,dnpCount:components.filter(c=>c.dnp).length,excludedFromBomCount:components.filter(c=>c.excludeFromBom).length,unitUuidCount:components.reduce((n,c)=>n+c.unitUuids.length,0),netCount:netlist?.nets.length||0,connectionCount:pins.length,bomRowCount:bom.length,firmwareContractCount:firmware.length,firmwareMatchedCount:firmware.filter(x=>x.matches).length,errorCount:findings.filter(x=>x.severity==="error").length,warningCount:findings.filter(x=>x.severity==="warning").length};
  need(components.length<=10000&&pins.length<=50000,"Selected hardware graph exceeds admission limits");
  return clone({schema:"tjlabs.hardware-review-report.v1",scope,netlist,components,pins,bom,firmware,bomReconciliation,findings,summary,requiredDisciplines:input?.requiredDisciplines||[],interpretation:"Source-level revision and declared-contract reconciliation only. Exact original component values and units remain text. This is not ERC/DRC, arbitrary firmware compilation, mechanical-fit verification, regulatory approval or production release."});
 }
function commitment(w){return {schema:w.schema,engine:w.engine,initial:w.initial,sources:w.sources.map(s=>({id:s.id,name:s.name,mediaType:s.mediaType,bytes:s.bytes,bodySha256:s.bodySha256})),editions:w.editions.map(e=>({id:e.id,name:e.name,parentEditionId:e.parentEditionId,preparedBy:e.preparedBy,note:e.note,createdAt:e.createdAt,inputSha256:e.inputSha256,reportSha256:e.reportSha256})),proposals:w.proposals.map(p=>({id:p.id,name:p.name,baseEditionId:p.baseEditionId,candidateEditionId:p.candidateEditionId,preparedBy:p.preparedBy,reason:p.reason,createdAt:p.createdAt,comparisonSha256:p.comparisonSha256})),reviews:w.reviews,operations:w.operations.map(o=>({id:o.id,kind:o.kind,at:o.at,previousRoot:o.previousRoot,payloadSha256:o.payloadSha256}))};}
 function memberSize(x){if(retainedSize.has(x))return retainedSize.get(x);const n=encode(JSON.stringify(x)).length;retainedSize.set(x,n);return n;}
 function createWorkspace({title="Hardware revision workspace",createdAt,id}={}){text(title,"title");text(createdAt,"createdAt");const w={schema:SCHEMA,engine:ENGINE,initial:{title,createdAt,id:id||hash({title,createdAt}).slice(0,24)},sources:[],editions:[],proposals:[],reviews:[],operations:[]};w.rootSha256=hash(commitment(w));return trust(w);}
  function prepare(w,kind,payload,meta){need(w?.schema===SCHEMA&&w.engine===ENGINE,"Unsupported workspace");need(meta&&typeof meta==="object","Operation metadata required");text(meta.operationId,"operationId");text(meta.at,"at");need(canonical(clone(payload))===canonical(payload),"Operation payload must contain only JSON values");if(!trusted.has(w))w=validateWorkspace(w);const old=w.operations.find(x=>x.id===meta.operationId);if(old){need(old.kind===kind&&canonical(old.payload)===canonical(payload)&&old.at===meta.at&&old.previousRoot===meta.expectedRoot,"Operation ID replay differs");return {replay:true,w};}need(meta.expectedRoot===w.rootSha256,"Workspace changed; preview and save again");return {replay:false,source:w,w:{...w,sources:[...w.sources],editions:[...w.editions],proposals:[...w.proposals],reviews:[...w.reviews],operations:[...w.operations]}};}
  function finish(w,kind,payload,meta){w.operations.push({id:meta.operationId,kind,at:meta.at,previousRoot:meta.expectedRoot,payload:clone(payload),payloadSha256:hash(payload)});w.rootSha256=hash(commitment(w));const retained=[...w.sources,...w.editions,...w.proposals,...w.reviews,...w.operations].reduce((n,x)=>n+memberSize(x),0);need(retained+16384<=128*1024*1024,"Complete workspace exceeds 128 MiB; retain a separate workspace");return trust(w);}
  function addSource(w,payload,meta){const p=prepare(w,"add-source",payload,meta);text(payload.name,"Source name");need(typeof payload.mediaType==="string","Source mediaType required");const bytes=fromBase64(payload.content_base64);need(toBase64(bytes)===payload.content_base64,"Original Base64 must be canonical");need(bytes.length<=20*1024*1024,"Source exceeds 20 MiB");const bodySha256=sha256(bytes),id=hash({name:payload.name,mediaType:payload.mediaType,bytes:bytes.length,bodySha256});if(p.replay)return {workspace:p.w,sourceId:id};if(!p.w.sources.some(s=>s.id===id)){need(p.w.sources.reduce((n,s)=>n+s.bytes,0)+bytes.length<=64*1024*1024,"Workspace originals exceed 64 MiB");p.w.sources.push({id,name:payload.name,mediaType:payload.mediaType,bytes:bytes.length,bodySha256,content_base64:payload.content_base64});}return {workspace:finish(p.w,"add-source",payload,meta),sourceId:id};}
  function readSource(w,id){const s=w.sources.find(x=>x.id===id);need(s,"Original source not found");const b=sourceBody(s);need(sha256(b)===s.bodySha256,"Original digest mismatch");return clone(s);}
  function saveEdition(w,payload,meta){const p=prepare(w,"save-edition",payload,meta);text(payload.name,"Edition name");const id=hash({operationId:meta.operationId,payload});if(p.replay){const e=p.w.editions.find(x=>x.id===id);return {workspace:p.w,editionId:id,report:clone(e.report)};}if(payload.parentEditionId)need(p.w.editions.some(e=>e.id===payload.parentEditionId),"Parent edition missing");if(payload.preparedBy)text(payload.preparedBy,"Prepared by");if(payload.note)text(payload.note,"Edition note");const report=analyse(payload.input,p.source);p.w.editions.push({id,name:payload.name,parentEditionId:payload.parentEditionId||null,preparedBy:payload.preparedBy||"",note:payload.note||"",createdAt:meta.at,input:clone(payload.input),inputSha256:hash(payload.input),report,reportSha256:hash(report)});return {workspace:finish(p.w,"save-edition",payload,meta),editionId:id,report:clone(report)};}

 function compare(w,leftId,rightId){
  if(!trusted.has(w))w=validateWorkspace(w);const l=w.editions.find(e=>e.id===leftId),r=w.editions.find(e=>e.id===rightId);need(l&&r,"Both frozen editions required");
  const reasons=[];if(l.report.scope.productId!==r.report.scope.productId)reasons.push("Different declared product");
  if(l.report.summary.errorCount||r.report.summary.errorCount)reasons.push("Unresolved source or mapping errors in selected editions");
  const changes=[];
  function rows(kind,left,right,key,shape,disciplines){
   const a=new Map(),b=new Map();for(const x of left){const k=key(x);if(!a.has(k))a.set(k,[]);a.get(k).push(x);}for(const x of right){const k=key(x);if(!b.has(k))b.set(k,[]);b.get(k).push(x);}
   for(const k of unique([...a.keys(),...b.keys()]).sort()){
    const aa=a.get(k)||[],bb=b.get(k)||[],av=aa.map(shape),bv=bb.map(shape);
    if(canonical(av)===canonical(bv))continue;
    const c={kind,key:k,change:!aa.length?"added":!bb.length?"removed":"changed",ambiguous:aa.length>1||bb.length>1,disciplines,left:av,right:bv,leftSourceRefs:aa.flatMap(x=>x.sourceRefs||[]),rightSourceRefs:bb.flatMap(x=>x.sourceRefs||[])};
    changes.push({id:hash(c),...c});
   }
  }
  const component=c=>({reference:c.reference,value:c.value,footprint:c.footprint,datasheet:c.datasheet,description:c.description,partNumber:c.partNumber,library:c.library,dnp:c.dnp,excludeFromBom:c.excludeFromBom,excludeFromBoard:c.excludeFromBoard,sheetPath:c.sheetPath,unitUuids:[...c.unitUuids].sort(),fields:c.fields.map(f=>({name:f.name,value:f.value})).sort((a,b)=>(canonical(a)<canonical(b)?-1:canonical(a)>canonical(b)?1:0)),properties:c.properties.map(p=>({name:p.name,value:p.value})).sort((a,b)=>(canonical(a)<canonical(b)?-1:canonical(a)>canonical(b)?1:0))});
  rows("component",l.report.components,r.report.components,c=>c.identity,component,["EE","MFG"]);
  function pinRows(report){
   const peer=new Map();for(const p of report.pins){if(!peer.has(p.netCode))peer.set(p.netCode,[]);peer.get(p.netCode).push(canonical([p.componentIdentity||"unresolved:"+p.reference,p.pin]));}
   return report.pins.map(p=>({...p,peers:[...peer.get(p.netCode)].sort()}));
  }
  rows("connectivity",pinRows(l.report),pinRows(r.report),p=>canonical([p.componentIdentity||"unresolved:"+p.reference,p.pin]),p=>({netName:p.netName,netClass:p.netClass,pinFunction:p.pinFunction,pinType:p.pinType,peers:p.peers}),["EE","FW"]);
  function bomGroups(report){return report.bomReconciliation.map(x=>({...x,rows:report.bom.filter(b=>b.partNumber===x.partNumber),sourceRefs:report.bom.filter(b=>b.partNumber===x.partNumber).flatMap(b=>b.sourceRefs)}));}
  rows("bom",bomGroups(l.report),bomGroups(r.report),b=>b.partNumber,b=>({expectedQuantity:b.expectedQuantity,declaredQuantity:b.declaredQuantity,complete:b.complete,rows:b.rows.map(x=>({quantity:x.quantity,unit:x.unit,references:[...x.references].sort(),notes:x.notes})).sort((a,b)=>(canonical(a)<canonical(b)?-1:canonical(a)>canonical(b)?1:0))}),["MFG"]);
  rows("firmware-contract",l.report.firmware,r.report.firmware,f=>f.id,f=>({reference:f.reference,pin:f.pin,symbol:f.symbol,connection:f.connection,expectedNet:f.expectedNet,actualNet:f.actualNet,valid:f.valid,matches:f.matches,notes:f.notes}),["FW","EE"]);
  return {schema:"tjlabs.hardware-comparison.v1",leftEditionId:leftId,rightEditionId:rightId,leftName:l.name,rightName:r.name,leftInputSha256:l.inputSha256,rightInputSha256:r.inputSha256,leftReportSha256:l.reportSha256,rightReportSha256:r.reportSha256,comparable:!reasons.length,reasons,changes,summary:{changeCount:changes.length,added:changes.filter(c=>c.change==="added").length,removed:changes.filter(c=>c.change==="removed").length,changed:changes.filter(c=>c.change==="changed").length,ambiguous:changes.filter(c=>c.ambiguous).length},leftScope:clone(l.report.scope),rightScope:clone(r.report.scope),interpretation:"Complete source-level differences. Local net code renumbering alone is ignored; named net and exact endpoint connectivity remain compared. A declared firmware contract is not arbitrary firmware execution or compilation."};
 }
 function propose(w,payload,meta){
  const p=prepare(w,"propose",payload,meta);text(payload.name,"Proposal name");text(payload.preparedBy,"Prepared by");text(payload.reason,"Proposal reason");const id=hash({operationId:meta.operationId,payload});if(p.replay)return {workspace:p.w,proposalId:id,proposal:clone(p.w.proposals.find(x=>x.id===id))};
  need(payload.baseEditionId!==payload.candidateEditionId,"Choose two distinct editions");const comparison=compare(p.source,payload.baseEditionId,payload.candidateEditionId);
  const proposal={id,name:payload.name,baseEditionId:payload.baseEditionId,candidateEditionId:payload.candidateEditionId,preparedBy:payload.preparedBy,reason:payload.reason,createdAt:meta.at,comparison,comparisonSha256:hash(comparison)};
  p.w.proposals.push(proposal);return {workspace:finish(p.w,"propose",payload,meta),proposalId:id,proposal:clone(proposal)};
 }
 function review(w,payload,meta){
  const p=prepare(w,"review",payload,meta),proposal=p.w.proposals.find(x=>x.id===payload.proposalId);need(proposal,"Review proposal missing");need(payload.comparisonSha256===proposal.comparisonSha256,"Review must bind the exact complete comparison");
  need(["approved","needs-work"].includes(payload.decision),"Invalid review decision");need(["EE","FW","MFG"].includes(payload.discipline),"Invalid review discipline");text(payload.reviewer,"Reviewer");text(payload.note,"Reviewer note");
  if(p.replay)return p.w;p.w.reviews.push({id:hash({operationId:meta.operationId,payload}),...clone(payload),at:meta.at});return finish(p.w,"review",payload,meta);
 }
 function proposalStatus(w,proposalId){
  if(!trusted.has(w))w=validateWorkspace(w);const p=w.proposals.find(x=>x.id===proposalId);need(p,"Proposal missing");const e=w.editions.find(x=>x.id===p.candidateEditionId),required=unique(e.report.requiredDisciplines),reviews=w.reviews.filter(x=>x.proposalId===proposalId),latest=required.map(d=>({discipline:d,review:[...reviews].reverse().find(r=>r.discipline===d)||null}));
  const blocking=[...p.comparison.reasons];if(!required.length)blocking.push("No required discipline set");if(p.comparison.changes.some(c=>c.ambiguous))blocking.push("Ambiguous change identities");for(const x of latest)if(x.review?.decision!=="approved")blocking.push("Latest "+x.discipline+" review is not approved");
  return {proposalId,comparisonSha256:p.comparisonSha256,status:blocking.length?"NEEDS_REVIEW":"REVIEW_COMPLETE",blocking,requiredDisciplines:required,latestReviews:clone(latest),allReviews:clone(reviews),authority:"This status concerns this exact source review package only; native source application, electrical/physical checks and production release remain with the owning engineers."};
 }
 function handoff(w,proposalId){
  if(!trusted.has(w))w=validateWorkspace(w);const p=w.proposals.find(x=>x.id===proposalId);need(p,"Proposal missing");const base=w.editions.find(e=>e.id===p.baseEditionId),candidate=w.editions.find(e=>e.id===p.candidateEditionId);
  return {schema:"tjlabs.hardware-review-handoff.v1",engine:ENGINE,workspaceRoot:w.rootSha256,proposal:clone(p),status:proposalStatus(w,proposalId),base:clone(base),candidate:clone(candidate),originals:w.sources.map(s=>readSource(w,s.id)),nativeApplication:"NOT_APPLIED",instruction:"Use the exact reviewed candidate sources with the owning engineering workflow. This package does not write CAD/PLM or assert physical safety."};
 }
 function exportWorkspace(w){w=validateWorkspace(w);const content=JSON.stringify(w)+"\n";need(encode(content).length<=128*1024*1024,"Complete workspace exceeds128MiB");return {filename:"Hardware_Review_Workspace.json",content,sha256:hash(content)};}
 function validateWorkspace(w){
  if(trusted.has(w))return w;need(w?.schema===SCHEMA&&w.engine===ENGINE,"Unsupported workspace");let replay=createWorkspace(w.initial);
  for(const op of w.operations){const m={operationId:op.id,at:op.at,expectedRoot:op.previousRoot};if(op.kind==="add-source")replay=addSource(replay,op.payload,m).workspace;else if(op.kind==="save-edition")replay=saveEdition(replay,op.payload,m).workspace;else if(op.kind==="propose")replay=propose(replay,op.payload,m).workspace;else if(op.kind==="review")replay=review(replay,op.payload,m);else throw Error("Unknown retained operation");}
  need(canonical(replay)===canonical(w),"Workspace does not reproduce exact originals, editions, proposals and reviews");return replay;
 }
 function importWorkspace(content){need(typeof content==="string"&&encode(content).length<=128*1024*1024,"Complete workspace exceeds128MiB");return validateWorkspace(losslessJSON(content,false));}
 return {engine:ENGINE,fields:FIELD_SPEC,blankInput,parseJSON:s=>losslessJSON(s,false),createWorkspace,addSource,readSource,inspectSource,parseNetlist,analyse,saveEdition,compare,propose,review,proposalStatus,handoff,exportWorkspace,importWorkspace,validateWorkspace,canonical};
}
