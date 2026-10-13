// MIT. Namespace-aware streaming XML extraction; no external entity retrieval.
import { need } from '../model.mjs';
const XML='http://www.w3.org/XML/1998/namespace';
const XMLNS='http://www.w3.org/2000/xmlns/';
const EMPTY_ATTRIBUTE_LOCATIONS=Object.freeze(Object.create(null));
const namePattern=/^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?$/;
function entityText(value) {
  need(!value.includes('<'),'An XML attribute contains an unescaped less-than character.');
  return decode(value);
}
function decode(value) {
  let position=0,result='';
  for(;;) {
    const start=value.indexOf('&',position);
    if(start<0){result+=value.slice(position);break;}
    result+=value.slice(position,start);
    const end=value.indexOf(';',start+1);need(end>=0,'The original XML has an incomplete entity.');
    const entity=value.slice(start+1,end);
    const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    if(Object.hasOwn(named,entity))result+=named[entity];
    else {
      need(/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity),'Only original XML character entities are supported.');
      const code=entity[1]==='x'?Number.parseInt(entity.slice(2),16):Number.parseInt(entity.slice(1),10);
      need(Number.isSafeInteger(code)&&(code===9||code===10||code===13||code>=32&&code<=0x10ffff&&
        !(code>=0xd800&&code<=0xdfff)&&code!==0xfffe&&code!==0xffff),'Invalid original XML character entity.');
      result+=String.fromCodePoint(code);
    }
    position=end+1;
  }
  return result;
}
function parts(name) { need(namePattern.test(name),'Invalid original XML qualified name.');const [a,b]=name.split(':');return b?[a,b]:['',a]; }
function expanded(name,ns,attribute=false) {
  const [prefix,localName]=parts(name);
  need(prefix===''||Object.hasOwn(ns,prefix),'An original XML namespace prefix is not declared.');
  return {name,localName,namespaceURI:prefix?ns[prefix]:attribute?'':ns['']||''};
}
export function scanFredDdpXml(text,handlers={}, {maxElements=5000000,maxDepth=64,maxAttributes=256,retainAttributeLocations=true,signal}={}) {
  need(typeof text==='string'&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text),'Invalid original XML text.');
  const stack=[];let i=text.charCodeAt(0)===0xfeff?1:0,count=0,rootCount=0,rootEnded=false,declaredRoot=null;
  const emitText=(value,start,end,cdata=false)=>{
    const normalized=cdata?value:decode(value);
    if(stack.length)handlers.text?.(normalized,{start,end},stack.at(-1),stack);
    else need(normalized.trim()==='','Unexpected original XML text outside its document element.');
  };
  while(i<text.length){
    if((count&1023)===0)signal?.throwIfAborted();
    if(text[i]!=='<'){const next=text.indexOf('<',i),end=next<0?text.length:next;emitText(text.slice(i,end),i,end);i=end;continue;}
    if(text.startsWith('<!--',i)){
      const end=text.indexOf('-->',i+4);need(end>=0&&!text.slice(i+4,end).includes('--'),'Invalid original XML comment.');i=end+3;continue;
    }
    if(text.startsWith('<![CDATA[',i)){
      need(stack.length>0,'XML CDATA must occur inside an original element.');const end=text.indexOf(']]>',i+9);
      need(end>=0,'Incomplete original XML CDATA.');emitText(text.slice(i+9,end),i,end+3,true);i=end+3;continue;
    }
    if(text.startsWith('<?',i)){
      const end=text.indexOf('?>',i+2);need(end>=0,'Incomplete original XML processing instruction.');
      const declaration=text.slice(i+2,end);
      if(/^xml(?:\s|$)/i.test(declaration)){
        need(i<=1&&/^xml\s/.test(declaration),'The original XML declaration must precede the document.');
        const encoding=/encoding\s*=\s*["']([^"']+)["']/.exec(declaration)?.[1];
        need(!encoding||/^utf-?8$/i.test(encoding),'This XML capture requires its declared supported UTF-8 encoding.');
      }
      i=end+2;continue;
    }
    if(text.startsWith('<!DOCTYPE',i)){
      // The original Board structure file names its root without an external
      // identifier or entity subset. Retain that declaration as an exact root
      // constraint; never load a DTD or expand declared entities.
      const end=text.indexOf('>',i+9);need(end>=0,'Incomplete original XML document type.');
      const declaration=text.slice(i,end+1),match=/^<!DOCTYPE\s+([A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?)\s*>$/.exec(declaration);
      need(match&&rootCount===0&&stack.length===0&&declaredRoot===null,'Only a single original bare document type before its root is supported.');
      declaredRoot=match[1];i=end+1;continue;
    }
    need(!text.startsWith('<!',i),'External declarations and DTD entities are outside the original Board XML profile.');
    const start=i++;
    if(text[i]==='/'){
      i++;const end=text.indexOf('>',i);need(end>=0,'Incomplete original XML closing element.');
      const name=text.slice(i,end).trim();need(namePattern.test(name)&&stack.length&&stack.at(-1).name===name,'Original XML elements are not properly nested.');
      const node=stack.at(-1);node.location.end=end+1;handlers.end?.(node,stack);stack.pop();if(!stack.length)rootEnded=true;i=end+1;continue;
    }
    const nameStart=i;while(i<text.length&&!/[\s/>]/.test(text[i]))i++;
    const name=text.slice(nameStart,i);parts(name);const rawAttributes=Object.create(null),attributeLocations=retainAttributeLocations?Object.create(null):EMPTY_ATTRIBUTE_LOCATIONS;
    let selfClosing=false,closed=false,attributeCount=0;
    while(i<text.length){
      const spacing=i;while(i<text.length&&/\s/.test(text[i]))i++;
      if(text[i]==='>'){i++;closed=true;break;}
      if(text[i]==='/'&&text[i+1]==='>'){i+=2;selfClosing=true;closed=true;break;}
      need(i>spacing,'Original XML attributes require separating whitespace.');
      const attributeStart=i;while(i<text.length&&!/[\s=/>]/.test(text[i]))i++;
      const attributeName=text.slice(attributeStart,i);parts(attributeName);
      need(!Object.hasOwn(rawAttributes,attributeName),'An original XML attribute occurs more than once.');
      while(i<text.length&&/\s/.test(text[i]))i++;need(text[i++]==='=','An original XML attribute needs its value.');
      while(i<text.length&&/\s/.test(text[i]))i++;const quote=text[i++];need(quote==='"'||quote==="'",'Original XML attribute values must be quoted.');
      const valueStart=i,end=text.indexOf(quote,i);need(end>=0,'Incomplete original XML attribute.');
      rawAttributes[attributeName]=entityText(text.slice(valueStart,end).replace(/\r\n?/g,'\n').replace(/[\n\t]/g,' '));
      if(retainAttributeLocations)attributeLocations[attributeName]={start:attributeStart,end:end+1};i=end+1;
      need(++attributeCount<=maxAttributes,'The original XML exceeds its attribute capacity.');
    }
    need(closed,'The original XML ends inside an element.');
    const parentNamespaces=stack.at(-1)?.namespaces||Object.assign(Object.create(null),{xml:XML,xmlns:XMLNS});
    const declarations=Object.entries(rawAttributes).filter(([key])=>key==='xmlns'||key.startsWith('xmlns:'));
    const ns=declarations.length?Object.assign(Object.create(null),parentNamespaces):parentNamespaces;
    for(const [key,value] of declarations){
      if(key==='xmlns'){need(value!==XMLNS&&value!==XML,'Invalid default XML namespace.');ns['']=value;}
      else if(key.startsWith('xmlns:')){
        const prefix=key.slice(6);need(prefix!=='xmlns'&&value!==XMLNS&&value!==''&&
          (prefix==='xml'?value===XML:value!==XML),'Invalid original XML namespace declaration.');ns[prefix]=value;
      }
    }
    const node={...expanded(name,ns),attributes:rawAttributes,attributeLocations,namespaces:ns,location:{start,end:i}};
    const attributeKeys=new Set();
    for(const key of Object.keys(rawAttributes)){
      if(key==='xmlns'||key.startsWith('xmlns:'))continue;
      const attribute=expanded(key,ns,true),identity=attribute.namespaceURI+'\u0000'+attribute.localName;
      need(!attributeKeys.has(identity),'Original XML expanded attribute names must be unique.');attributeKeys.add(identity);
    }
    need(stack.length<maxDepth&&++count<=maxElements,'The original XML exceeds its document capacity.');
    if(!stack.length){need(!rootEnded&&++rootCount===1,'Receive one complete original XML document.');
      need(declaredRoot===null||name===declaredRoot,'The original XML document type must name its root.');}
    stack.push(node);handlers.start?.(node,stack);
    if(selfClosing){handlers.end?.(node,stack);stack.pop();if(!stack.length)rootEnded=true;}
  }
  need(stack.length===0&&rootCount===1&&rootEnded,'The original XML document is incomplete.');
  return {elements:count,characters:text.length};
}
