// MIT. Portable XML reader for retained OOXML parts; no external entities or network.
export function createOrkyoXMLParser(){
 const xmlNS='http://www.w3.org/XML/1998/namespace',name=/^[A-Za-z_][A-Za-z0-9_.:-]*/;
 const valid=n=>n===9||n===10||n===13||n>=32&&n<=0xd7ff||n>=0xe000&&n<=0xfffd||n>=0x10000&&n<=0x10ffff;
 function entities(text){return text.replace(/&([^;]*);|&/g,(all,body)=>{if(body===undefined)throw Error('Unterminated XML entity');const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(Object.hasOwn(named,body))return named[body];let n;if(/^#x[0-9a-f]+$/i.test(body))n=parseInt(body.slice(2),16);else if(/^#[0-9]+$/.test(body))n=Number(body.slice(1));else throw Error('Unsupported XML entity');if(!valid(n))throw Error('Invalid XML character');return String.fromCodePoint(n);});}
 class Node{
  constructor(tag,attrs,namespaces){this.tagName=tag;this.localName=tag.split(':').at(-1);this.attrs=attrs;this.namespaces=namespaces;this.children=[];}
  get textContent(){return this.children.map(x=>typeof x==='string'?x:x.textContent).join('');}
  getAttribute(k){return Object.hasOwn(this.attrs,k)?this.attrs[k]:null;}
  getAttributeNS(ns,local){for(const [key,value]of Object.entries(this.attrs)){const parts=key.split(':');if(parts.length===2&&parts[1]===local&&this.namespaces[parts[0]]===ns)return value;}return null;}
  getElementsByTagNameNS(ns,local){const out=[];const visit=n=>{for(const c of n.children)if(typeof c!=='string'){const prefix=c.tagName.includes(':')?c.tagName.split(':')[0]:'';if((local==='*'||c.localName===local)&&(ns==='*'||(c.namespaces[prefix]||'')===ns))out.push(c);visit(c);}};visit(this);return out;}
  getElementsByTagName(tag){const all=this.getElementsByTagNameNS('*','*');return tag==='*'?all:all.filter(n=>n.tagName===tag);}
 }
 return class OrkyoXMLParser{
  parseFromString(raw){
   if(typeof raw!=='string'||raw.length>64*1024*1024)throw Error('OOXML part exceeds complete reader capacity');
   const text=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'),doc=new Node('#document',{}, {xml:xmlNS}),stack=[doc];let i=0,roots=0;
   const addText=(s,raw=false)=>{if(!s)return;const value=raw?s:entities(s);if(stack.length===1&&value.trim())throw Error('XML text outside document element');for(const c of value)if(!valid(c.codePointAt(0)))throw Error('Invalid XML character');stack.at(-1).children.push(value);};
   while(i<text.length){
    if(text[i]!=='<'){const next=text.indexOf('<',i),end=next<0?text.length:next;addText(text.slice(i,end));i=end;continue;}
    if(text.startsWith('<!--',i)){const end=text.indexOf('-->',i+4);if(end<0||text.slice(i+4,end).includes('--'))throw Error('Malformed XML comment');i=end+3;continue;}
    if(text.startsWith('<![CDATA[',i)){const end=text.indexOf(']]>',i+9);if(end<0||stack.length===1)throw Error('Malformed XML CDATA');addText(text.slice(i+9,end),true);i=end+3;continue;}
    if(text.startsWith('<?',i)){const end=text.indexOf('?>',i+2);if(end<0)throw Error('Malformed XML instruction');i=end+2;continue;}
    if(text.startsWith('<!',i))throw Error('OOXML reader does not expand document declarations or external entities');
    let end=i+1,quote='';for(;end<text.length;end++){const c=text[end];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}
    if(end===text.length||quote)throw Error('Incomplete XML element');let tag=text.slice(i+1,end);i=end+1;
    if(tag.startsWith('/')){const close=tag.slice(1).trim();if(stack.length===1||stack.at(-1).tagName!==close)throw Error('Mismatched XML end element');stack.pop();continue;}
    const self=/\/\s*$/.test(tag);if(self)tag=tag.replace(/\/\s*$/,'');const match=tag.match(name);if(!match)throw Error('Invalid OOXML element name');const tagName=match[0],attrs=Object.create(null);let rest=tag.slice(tagName.length);
    while(rest.length){if(!/^\s/.test(rest))throw Error('XML attributes need separation');rest=rest.trimStart();if(!rest)break;const m=rest.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(["'])/);if(!m)throw Error('Malformed XML attribute');const finish=rest.indexOf(m[2],m[0].length);if(finish<0)throw Error('Incomplete XML attribute');const value=rest.slice(m[0].length,finish);if(value.includes('<')||Object.hasOwn(attrs,m[1]))throw Error('Invalid or repeated XML attribute');attrs[m[1]]=entities(value.replace(/[\t\n]/g,' '));rest=rest.slice(finish+1);}
    const namespaces={...stack.at(-1).namespaces};for(const [k,v]of Object.entries(attrs)){if(k==='xmlns')namespaces['']=v;else if(k.startsWith('xmlns:'))namespaces[k.slice(6)]=v;}
    if(tagName.includes(':')&&!namespaces[tagName.split(':')[0]])throw Error('Unbound XML namespace');
    const node=new Node(tagName,attrs,namespaces);if(stack.length===1&&++roots>1)throw Error('Multiple XML document elements');stack.at(-1).children.push(node);
    if(!self){stack.push(node);if(stack.length>256)throw Error('OOXML nesting exceeds reader capacity');}
   }
   if(stack.length!==1||roots!==1)throw Error('Incomplete XML document');return doc;
  }
 };
}
