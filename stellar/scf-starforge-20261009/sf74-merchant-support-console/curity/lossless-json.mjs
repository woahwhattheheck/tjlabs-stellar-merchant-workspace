/**
 * Lossless JSON and exact RFC3339 utilities for the Curity source companion.
 * Numeric tokens never pass through a JavaScript Number.
 */
export class SourceSyntaxError extends Error {
  constructor(message, offset=0) { super(message); this.name='SourceSyntaxError'; this.offset=offset; }
}
export function parseLossless(text, {maxDepth=128}={}) {
  if (typeof text!=='string') throw new TypeError('JSON text required');
  let at=0;
  const fail=m=>{throw new SourceSyntaxError(m,at);};
  const ws=()=>{while(at<text.length && /[ \t\r\n]/.test(text[at])) at++;};
  function string() {
    const start=at++;
    while(at<text.length) {
      const c=text.charCodeAt(at++);
      if(c===34) {const raw=text.slice(start,at);try{return {kind:'string',value:JSON.parse(raw),raw};}catch{fail('Invalid JSON string');}}
      if(c<32) fail('Unescaped JSON control character');
      if(c===92) {const e=text[at++];if(e==='u'){if(!/^[0-9a-fA-F]{4}$/.test(text.slice(at,at+4)))fail('Invalid Unicode escape');at+=4;}else if(!e||!'"\\/bfnrt'.includes(e))fail('Invalid string escape');}
    }
    fail('Unterminated JSON string');
  }
  function value(depth) {
    if(depth>maxDepth) fail('JSON nesting exceeds selected limit');
    ws();const start=at,c=text[at];
    if(c==='"') return string();
    if(c==='{') {
      at++;ws();const members=[],keys=new Set();
      if(text[at]==='}') {at++;return {kind:'object',members};}
      while(true) {
        ws();if(text[at]!=='"')fail('Object member name required');
        const key=string().value;if(keys.has(key))fail('Duplicate object member: '+key);keys.add(key);
        ws();if(text[at++]!==':')fail('Colon required');
        members.push([key,value(depth+1)]);ws();
        const delimiter=text[at++];if(delimiter==='}')break;if(delimiter!==',')fail('Object delimiter required');
      }
      return {kind:'object',members};
    }
    if(c==='[') {
      at++;ws();const items=[];if(text[at]===']'){at++;return {kind:'array',items};}
      while(true){items.push(value(depth+1));ws();const d=text[at++];if(d===']')break;if(d!==',')fail('Array delimiter required');}
      return {kind:'array',items};
    }
    for(const [literal,result] of [['true',true],['false',false],['null',null]]) {
      if(text.startsWith(literal,at)){at+=literal.length;return {kind:literal==='null'?'null':'boolean',value:result};}
    }
    const match=/-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;match.lastIndex=at;
    const m=match.exec(text);if(m){at+=m[0].length;return {kind:'number',lexeme:m[0]};}
    at=start;fail('JSON value required');
  }
  const result=value(0);ws();if(at!==text.length)fail('Trailing JSON content');return result;
}
export function atPath(node,path) {
  if(!Array.isArray(path)||path.some(p=>typeof p!=='string'&&!Number.isSafeInteger(p)))throw new TypeError('Explicit property path required');
  for(const key of path) {
    if(node?.kind==='object'&&typeof key==='string') node=node.members.find(([name])=>name===key)?.[1];
    else if(node?.kind==='array'&&Number.isSafeInteger(key)&&key>=0)node=node.items[key];
    else return undefined;
  }
  return node;
}
export function canonicalLossless(node) {
  if(!node)throw new TypeError('Lossless node required');
  switch(node.kind) {
    case 'null':return 'null';
    case 'boolean':return node.value?'true':'false';
    case 'string':return JSON.stringify(node.value);
    case 'number':return node.lexeme;
    case 'array':return '['+node.items.map(canonicalLossless).join(',')+']';
    case 'object':return '{'+[...node.members].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonicalLossless(v)).join(',')+'}';
    default:throw new TypeError('Unknown lossless node');
  }
}
export function fieldValue(node) {
  if(node===undefined)return {present:false};
  if(node.kind==='number')return {present:true,type:'number',lexeme:node.lexeme};
  if(node.kind==='object'||node.kind==='array')return {present:true,type:node.kind,json:canonicalLossless(node)};
  return {present:true,type:node.kind,value:node.value};
}
export function exactInstant(literal) {
  if(typeof literal!=='string')throw new SourceSyntaxError('Event instant must be a string');
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(literal);
  if(!m)throw new SourceSyntaxError('Select an explicit RFC3339 event instant with timezone');
  const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number);
  const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59)throw new SourceSyntaxError('Invalid calendar instant or unsupported leap second');
  if(m[8]==='-00:00')throw new SourceSyntaxError('Unknown local offset cannot define event-time order');
  if(m[8]!=='Z'&&(Number(m[8].slice(1,3))>23||Number(m[8].slice(4))>59))throw new SourceSyntaxError('Invalid timezone offset');
  const base=m.slice(1,7).map((x,i)=>i===0?x:x).join('');
  const milliseconds=Date.parse(m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5]+':'+m[6]+m[8]);
  if(!Number.isFinite(milliseconds)||milliseconds%1000)throw new SourceSyntaxError('Invalid calendar instant');
  return {literal,epochSecond:String(milliseconds/1000),fraction:m[7]||'',offset:m[8]};
}
export function compareInstants(a,b) {
  a=typeof a==='string'?exactInstant(a):a;b=typeof b==='string'?exactInstant(b):b;
  const x=BigInt(a.epochSecond),y=BigInt(b.epochSecond);if(x!==y)return x<y?-1:1;
  const n=Math.max(a.fraction.length,b.fraction.length),af=a.fraction.padEnd(n,'0'),bf=b.fraction.padEnd(n,'0');return af<bf?-1:af>bf?1:0;
}
/** Strict selected Curity text layout; ambiguous attributes remain source findings. */
export function parseCurityMessage(text) {
  if(typeof text!=='string')throw new SourceSyntaxError('Selected audit message is not text');
  const head=/^([A-Za-z0-9_.:-]+) \[([^\s\]"]+)/.exec(text);
  if(!head)throw new SourceSyntaxError('Curity event type and ID prefix required');
  let at=head[0].length;const values=new Map([['type',head[1]],['id',head[2]]]);
  while(true){
    if(text[at]===']'){at++;break;}
    if(text[at++]!==' ')throw new SourceSyntaxError('Ambiguous audit attribute delimiter',at);
    const key=/^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(text.slice(at));if(!key)throw new SourceSyntaxError('Audit attribute name required',at);
    at+=key[0].length;if(text.slice(at,at+2)!=='="')throw new SourceSyntaxError('Quoted audit attribute required',at);at+=2;
    let value='',closed=false;
    while(at<text.length){const c=text[at++];if(c==='"'){closed=true;break;}if(c==='\\'){const escaped=text[at++];if(escaped!=='"'&&escaped!=='\\')throw new SourceSyntaxError('Unselected audit escape grammar',at);value+=escaped;}else value+=c;}
    if(!closed||values.has(key[0]))throw new SourceSyntaxError('Unterminated or repeated audit attribute',at);
    values.set(key[0],value);
  }
  if(text[at]===' ')at++;else if(at<text.length)throw new SourceSyntaxError('Audit message delimiter required',at);
  if(values.has('message'))throw new SourceSyntaxError('Duplicate audit message field',at);
  values.set('message',text.slice(at));
  return {kind:'object',members:[...values].map(([k,value])=>[k,{kind:'string',value,raw:JSON.stringify(value)}])};
}
