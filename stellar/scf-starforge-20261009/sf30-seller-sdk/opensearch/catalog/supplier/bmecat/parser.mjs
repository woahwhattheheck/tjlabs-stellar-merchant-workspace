// MIT. Bounded XML 1.0/Namespaces reader for the original ETIM BMEcat source.
// Raw document bytes remain in the catalogue source; parsed values follow XML
// line-ending/entity/attribute normalization, without numeric coercion.
export const BMECAT_NS = 'https://www.etim-international.com/bmecat/50';
const XML = 'http://www.w3.org/XML/1998/namespace', XMLNS = 'http://www.w3.org/2000/xmlns/';
export const BMECAT_LIMITS = Object.freeze({ documentBytes: 8 * 1024 ** 3,
  tokenCharacters: 2 * 1024 ** 2, groupCharacters: 8 * 1024 ** 2,
  groupNodes: 65536, depth: 64, attributes: 128, nameCharacters: 512, products: 10000000 });
export function bmecatFailure(code, message) { const e = new Error(message); e.code = 'SUPPLIER_BMECAT_' + code; e.status = 400; return e; }
const fail = (code, message) => { throw bmecatFailure(code, message); };
export function bmecatLimits(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !Object.hasOwn(BMECAT_LIMITS,k)))
    fail('LIMITS', 'Use only the declared XML resource limits.');
  return Object.fromEntries(Object.entries(BMECAT_LIMITS).map(([k,max]) => {
    const n = input[k] ?? max;
    if (!Number.isSafeInteger(n) || n < 1 || n > max) fail('LIMITS', 'Limits can only reduce the declared XML bounds.');
    return [k,n];
  }));
}
const NAME = /^[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}][A-Z_a-z0-9.\-\u00B7\u0300-\u036F\u203F-\u2040\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}]*$/u;
const space = x => /^[\x20\t\r\n]*$/.test(x);
function validChars(s) {
  for (const ch of s) {
    const n = ch.codePointAt(0);
    if (!(n === 9 || n === 10 || n === 13 || n >= 32 && n <= 0xD7FF || n >= 0xE000 && n <= 0xFFFD || n >= 0x10000 && n <= 0x10FFFF))
      fail('CHARACTER', 'The XML source contains a character outside XML 1.0.');
  }
}
function decode(s, attribute = false) {
  validChars(s);
  s = s.replace(/\r\n?/g, '\n');
  if (attribute) s = s.replace(/[\t\n]/g, ' ');
  return s.replace(/&([^;]*);|&/g, (token, key) => {
    if (key === undefined) fail('ENTITY', 'The original XML has an incomplete entity reference.');
    if (Object.hasOwn({amp:1,lt:1,gt:1,quot:1,apos:1},key)) return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[key];
    let n;
    if (/^#x[0-9A-Fa-f]+$/.test(key)) n = Number.parseInt(key.slice(2),16);
    else if (/^#[0-9]+$/.test(key)) n = Number(key.slice(1));
    else fail('ENTITY', 'Only XML predefined entities and numeric references are supported; no external declarations are fetched.');
    if (!Number.isSafeInteger(n) || n > 0x10FFFF) fail('ENTITY','Invalid numeric XML character reference.');
    const value = String.fromCodePoint(n); validChars(value); return value;
  });
}
export function xmlChildren(node, name) { return (node?.children ?? []).filter(n => typeof n === 'object' && n.namespace === BMECAT_NS && n.name === name); }
export function xmlText(node) { return (node?.children ?? []).filter(n => typeof n === 'string').join(''); }
export function xmlAttribute(node,name,namespace='') { return node?.attributes.find(a => a.name === name && a.namespace === namespace)?.value; }
export function xmlFields(node) {
  const rows = [];
  function walk(n) {
    for (const a of n.attributes) if (a.namespace !== XMLNS)
      rows.push({path:n.path + '/@' + a.qualifiedName,namespace:a.namespace,value:a.value,kind:'attribute'});
    const elements = n.children.filter(c => typeof c === 'object'), text = xmlText(n);
    if (!elements.length || !space(text)) rows.push({path:n.path+'/text()',namespace:n.namespace,value:text,kind:'text'});
    for (const child of elements) walk(child);
  }
  walk(node); return rows;
}
/** Feed decoded UTF-8 chunks, then end(). Product events are provisional until
 * the complete event; the catalogue bridge stages every event until verified EOF. */
export function createBMEcatParser({limits: supplied = {}, onEvent} = {}) {
  const limits = bmecatLimits(supplied);
  if (typeof onEvent !== 'function') fail('CALLBACK', 'Supply the original XML event receiver.');
  let buffer = '', stack = [], ended = false, failed = false, offset = 0, root = null, header = null,
    transaction = null, productCount = 0, rootClosed = false, declarationSeen = false, etimVersions = new Set(),
    capture = null, captureCharacters = 0, captureNodes = 0, captureTreeCharacters = 0;
  const transactions = new Set(['T_NEW_CATALOG','T_UPDATE_PRODUCTS','T_UPDATE_PRICES','T_NEW_PRODUCTDATA']);
  const qualified = (s) => {
    if (s.length > limits.nameCharacters) fail('NAME_LIMIT','An XML name exceeds the selected bound.');
    const parts = s.split(':');
    if (parts.length > 2 || parts.some(p => !NAME.test(p))) fail('NAME','Invalid XML qualified name.');
    return {prefix:parts.length===2?parts[0]:'',name:parts.at(-1)};
  };
  const take = n => { if(n>limits.tokenCharacters)fail('TOKEN_LIMIT','An XML token exceeds its selected bound.'); const s=buffer.slice(0,n);buffer=buffer.slice(n);offset+=n;if(capture){captureCharacters+=n;if(captureCharacters>limits.groupCharacters)fail('GROUP_LIMIT','An original XML header/product exceeds its bound.');}return s; };
  function text(raw, cdata = false) {
    if(!stack.length){validChars(raw);if(cdata||!space(raw))fail('ROOT_TEXT','Only literal XML whitespace, comments and processing instructions are allowed outside the root.');return;}
    if (!cdata && raw.includes(']]>')) fail('TEXT','CDATA closing delimiter outside CDATA.');
    const value = cdata ? (validChars(raw),raw.replace(/\r\n?/g,'\n')) : decode(raw);
    if (!stack.length) { if (!space(value)) fail('ROOT_TEXT','Text outside the XML root.'); return; }
    if (!capture) { if (!space(value)) fail('CONTAINER_TEXT','Unexpected text directly in the BMEcat transaction.'); return; }
    const node = stack.at(-1).node;
    captureTreeCharacters+=value.length;if(captureTreeCharacters>limits.groupCharacters)fail('TREE_LIMIT','Parsed XML content exceeds its bounded representation.');
    if (typeof node.children.at(-1) === 'string') node.children[node.children.length-1] += value;
    else node.children.push(value);
  }
  function close(qname) {
    if (!stack.length || stack.at(-1).qname !== qname) fail('CLOSE','An XML closing tag differs from its opening tag.');
    const entry = stack.pop(), node = entry.node;
    if (capture && stack.length === capture.depth - 1) {
      if (capture.kind === 'header') { header=node; onEvent({type:'header',header:node}); }
      else {
        const ids=xmlChildren(node,'SUPPLIER_PID');
        if(ids.length!==1||xmlText(ids[0]).length===0||ids[0].children.some(x=>typeof x==='object'))
          fail('PRODUCT_ID','Each original product requires one nonempty supplier identifier.');
        const explicit=xmlAttribute(node,'mode');
        const mode=explicit ?? (transaction.name==='T_UPDATE_PRICES'?'update':transaction.name==='T_UPDATE_PRODUCTS'?null:'new');
        const allowed=transaction.name==='T_UPDATE_PRODUCTS'?['new','update','delete']:transaction.name==='T_UPDATE_PRICES'?['update']:['new'];
        if(!allowed.includes(mode))fail('PRODUCT_MODE','The original product mode does not fit its transaction.');
        for(const fs of xmlChildren(node,'PRODUCT_FEATURES'))for(const v of xmlChildren(fs,'REFERENCE_FEATURE_SYSTEM_NAME')){const name=xmlText(v);if(name.startsWith('ETIM-'))etimVersions.add(name);if(etimVersions.size>1024)fail('VERSION_LIMIT','Too many distinct classification versions.');}
        onEvent({type:'product',ordinal:++productCount,product:node,mode,modeOrigin:explicit===undefined?'XSD default':'explicit attribute'});
        if(productCount>limits.products)fail('PRODUCT_LIMIT','The original XML product count exceeds the selected bound.');
      }
      capture=null;captureCharacters=0;captureNodes=0;captureTreeCharacters=0;
    }
    if (!stack.length) rootClosed=true;
  }
  function start(raw) {
    let inside=raw.slice(1,-1), empty=false;
    if(inside.endsWith('/')){empty=true;inside=inside.slice(0,-1);}
    let i=0;
    const readName=()=>{const begin=i;while(i<inside.length&&!/[\x20\t\r\n=]/.test(inside[i]))i++;const q=inside.slice(begin,i);qualified(q);return q;};
    const qname=readName(), q=qualified(qname), attrs=[];
    while(i<inside.length) {
      if(!/[\x20\t\r\n]/.test(inside[i]))fail('ATTRIBUTE','Separate XML attributes with whitespace.');
      while(/[\x20\t\r\n]/.test(inside[i]??'')&&i<inside.length)i++;
      if(i===inside.length)break;
      const name=readName();while(/[\x20\t\r\n]/.test(inside[i]??'')&&i<inside.length)i++;
      if(inside[i++]!=='=')fail('ATTRIBUTE','XML attribute requires =.');
      while(/[\x20\t\r\n]/.test(inside[i]??'')&&i<inside.length)i++;
      const quote=inside[i++];if(quote!=='"'&&quote!=="'")fail('ATTRIBUTE','XML attribute requires a quoted value.');
      const end=inside.indexOf(quote,i);if(end<0)fail('ATTRIBUTE','Unclosed XML attribute.');
      const original=inside.slice(i,end);if(original.includes('<'))fail('ATTRIBUTE','Literal < in XML attribute.');
      attrs.push({qualifiedName:name,...qualified(name),value:decode(original,true)});i=end+1;
      if(attrs.length>limits.attributes)fail('ATTRIBUTE_LIMIT','Too many attributes on one XML element.');
    }
    if(new Set(attrs.map(a=>a.qualifiedName)).size!==attrs.length)fail('DUPLICATE_ATTRIBUTE','Duplicate XML attribute name.');
    const parent=stack.at(-1), namespaces=new Map(parent?.namespaces??[['xml',XML]]);
    for(const a of attrs) if(a.qualifiedName==='xmlns'||a.prefix==='xmlns'){
      const key=a.qualifiedName==='xmlns'?'':a.name,value=a.value;
      if(key==='xmlns'||value===XMLNS||key==='xml'&&value!==XML||key!=='xml'&&value===XML||key!==''&&value==='')
        fail('NAMESPACE','Invalid reserved or empty XML namespace binding.');
      namespaces.set(key,value);
    }
    if(q.prefix==='xmlns'||q.prefix&&!namespaces.has(q.prefix))fail('NAMESPACE','The element uses an undeclared namespace prefix.');
    const namespace=namespaces.get(q.prefix)??'';
    for(const a of attrs){
      a.namespace=a.qualifiedName==='xmlns'||a.prefix==='xmlns'?XMLNS:a.prefix?(namespaces.get(a.prefix)??null):'';
      if(a.namespace===null)fail('NAMESPACE','The attribute uses an undeclared namespace prefix.');
    }
    if(new Set(attrs.map(a=>a.namespace+'\0'+a.name)).size!==attrs.length)fail('DUPLICATE_ATTRIBUTE','Duplicate expanded XML attribute name.');
    if(stack.length>=limits.depth)fail('DEPTH','Original XML is too deeply nested.');
    const identity=namespace+'\0'+q.name, occurrence=parent?(parent.counts.set(identity,(parent.counts.get(identity)??0)+1),parent.counts.get(identity)):1;
    const node={name:q.name,namespace,qualifiedName:qname,path:parent?parent.node.path+'/'+(namespace===BMECAT_NS?q.name:'{'+namespace+'}'+q.name)+'['+occurrence+']':'/'+q.name,attributes:attrs,children:[]};
    if(!parent){
      if(root||rootClosed||q.name!=='BMECAT'||namespace!==BMECAT_NS||xmlAttribute(node,'version')!=='2005')
        fail('ROOT','Choose one BMEcat2005 document in the ETIM5.0 namespace.');
      root=node;
    } else if(stack.length===1) {
      if(namespace!==BMECAT_NS)fail('TRANSACTION','Unexpected namespace directly in BMEcat.');
      if(q.name==='HEADER'){
        if(header||transaction)fail('HEADER','Require exactly one header before the transaction.');
        capture={kind:'header',depth:2};captureCharacters=raw.length;captureNodes=0;captureTreeCharacters=0;
      } else if(transactions.has(q.name)){
        if(!header||transaction)fail('TRANSACTION','Require one completed header and one BMEcat transaction.');
        transaction={name:q.name,path:node.path,attributes:attrs};
        if(q.name==='T_UPDATE_PRODUCTS'||q.name==='T_UPDATE_PRICES'){
          const prev=xmlAttribute(node,'prev_version');if(typeof prev!=='string'||!/^[+-]?\d+$/.test(prev))fail('PREVIOUS_VERSION','An update transaction requires its original integer prev_version.');
        }
      } else fail('TRANSACTION','Unsupported child of BMEcat.');
    } else if(stack.length===2 && parent.node.name!=='HEADER'){
      if(namespace!==BMECAT_NS||q.name!=='PRODUCT')fail('PRODUCT','The transaction must contain original PRODUCT elements.');
      capture={kind:'product',depth:3};captureCharacters=raw.length;captureNodes=0;captureTreeCharacters=0;
    }
    if(capture){captureTreeCharacters+=node.path.length+node.name.length+node.namespace.length+node.qualifiedName.length+JSON.stringify(node.attributes).length+64;if(captureTreeCharacters>limits.groupCharacters)fail('TREE_LIMIT','Parsed XML nodes exceed their bounded representation.');captureNodes++;if(captureNodes>limits.groupNodes)fail('NODE_LIMIT','An original header/product contains too many nodes.');}
    if(parent&&capture&&stack.length>=capture.depth)parent.node.children.push(node);
    stack.push({qname,node,namespaces,counts:new Map()});if(empty)close(qname);
  }
  function pump(final=false) {
    while(buffer.length){
      if(buffer[0]!=='<'){
        let end=buffer.indexOf('<');
        if(end<0){
          if(!final){
            end=buffer.length;const amp=buffer.lastIndexOf('&');if(amp>=0&&buffer.indexOf(';',amp)<0)end=amp;
            if(end&&buffer[end-1]==='\r')end--;
            // Retain a possible closing delimiter across a text chunk boundary.
            while(end>0&&buffer[end-1]===']'&&buffer.length-end<2)end--;
            if(!end){if(buffer.length>limits.tokenCharacters)fail('TOKEN_LIMIT','Oversized XML text token.');return;}
          }else end=buffer.length;
        }
        text(take(end));continue;
      }
      if(buffer.startsWith('<!--')){
        const end=buffer.indexOf('-->',4);if(end<0){if(final)fail('COMMENT','Unclosed XML comment.');break;}
        const token=take(end+3),body=token.slice(4,-3);validChars(body);if(body.includes('--')||body.endsWith('-'))fail('COMMENT','Invalid XML comment.');continue;
      }
      if(buffer.startsWith('<![CDATA[')){
        if(!capture)fail('CDATA','CDATA is allowed only inside a retained header/product.');
        const end=buffer.indexOf(']]>',9);if(end<0){if(final)fail('CDATA','Unclosed CDATA.');break;}
        const token=take(end+3);text(token.slice(9,-3),true);continue;
      }
      if(buffer.startsWith('<?')){
        const end=buffer.indexOf('?>',2);if(end<0){if(final)fail('PI','Unclosed XML processing instruction.');break;}
        const position=offset,token=take(end+2),body=token.slice(2,-2);
        const match=/^([^\x20\t\r\n]+)([\s\S]*)$/.exec(body);if(!match)fail('PI','Invalid processing instruction.');
        const q=qualified(match[1]);validChars(body);
        if(q.name.toLowerCase()==='xml'&&!q.prefix){
          if(match[1]!=='xml'||position!==0||declarationSeen||root)fail('DECLARATION','XML declaration must occur once at the original beginning.');
          if(!/^xml[\x20\t\r\n]+version[\x20\t\r\n]*=[\x20\t\r\n]*(['"])1\.0\1(?:[\x20\t\r\n]+encoding[\x20\t\r\n]*=[\x20\t\r\n]*(['"])[Uu][Tt][Ff]-8\2)?(?:[\x20\t\r\n]+standalone[\x20\t\r\n]*=[\x20\t\r\n]*(['"])(?:yes|no)\3)?[\x20\t\r\n]*$/.test(body))
            fail('DECLARATION','Use XML1.0 with UTF-8 encoding.');
          declarationSeen=true;
        }else if(match[2]&&!/^[\x20\t\r\n]/.test(match[2]))fail('PI','Invalid processing instruction separator.');
        continue;
      }
      if(buffer.startsWith('<!')){
        if(!final&&['<!--','<![CDATA['].some(x=>x.startsWith(buffer)))break;
        fail('DECLARATION','DTD, ENTITY, and other external declarations are not accepted or fetched.');
      }
      let quote=null,end=-1;
      for(let i=1;i<buffer.length;i++){const c=buffer[i];if(quote){if(c===quote)quote=null;}else if(c==='"'||c==="'")quote=c;else if(c==='>'){end=i;break;}else if(c==='<')fail('TAG','Literal < inside an XML tag.');}
      if(end<0){if(final)fail('TAG','Unclosed XML tag.');break;}
      const token=take(end+1);
      if(token.startsWith('</')){const name=token.slice(2,-1).replace(/[\x20\t\r\n]+$/,'');qualified(name);close(name);}
      else start(token);
    }
    if(buffer.length>limits.tokenCharacters)fail('TOKEN_LIMIT','An XML token exceeds its selected bound.');
  }
  return {
    write(chunk){if(ended||failed)fail('STATE','The parser has ended.');if(typeof chunk!=='string')fail('UTF8','Feed decoded UTF-8 text.');try{buffer+=chunk;pump();}catch(e){failed=true;throw e;}},
    end(){if(ended||failed)fail('STATE','The parser has ended.');try{pump(true);if(stack.length||!rootClosed||!header||!transaction||!productCount)fail('EOF','The original XML is incomplete or contains no products.');
      const versions=xmlChildren(xmlChildren(header,'USER_DEFINED_EXTENSIONS')[0],'UDX.EDXF.VERSION');
      if(versions.length!==1||xmlText(versions[0])!=='5.0')fail('EDXF_VERSION','Require the original ETIM5.0 header version.');
      ended=true;const receipt={type:'complete',root:{name:root.name,namespace:root.namespace,attributes:root.attributes},header,transaction,productCount,etimVersions:[...etimVersions].sort(),
        conformance:'XML1.0 structure and ETIM transaction envelope; full XSD/profile acceptance is separate'};
      onEvent(receipt);return receipt;
    }catch(e){failed=true;throw e;}}
  };
}
