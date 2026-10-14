// MIT. Complete original CSV byte and record semantics, shared unchanged.
export const AWARD_CSV_MAX_SOURCE_BYTES=64*1024*1024;
export const AWARD_CSV_MAX_ROWS=25000;
const need=(condition,message)=>{if(!condition)throw Object.assign(new Error(message),{code:'GRANT_AWARDS_EXCHANGE'});};
export function originalAwardCsvBytes(value){
  need(value instanceof Uint8Array&&value.byteLength>0&&value.byteLength<=AWARD_CSV_MAX_SOURCE_BYTES,
    'Select the complete application CSV, from one byte to 64 MiB.');
  return new Uint8Array(value);
}
/** RFC 4180 quoting, exact string cells, UTF-8 text and explicit header identities. */
export function parseAwardCsvText(input){
  need(typeof input==='string'&&!input.includes('\0'),'Use complete CSV text without NUL characters.');
  const text=input.charCodeAt(0)===0xfeff?input.slice(1):input;
  let field='',row=[],quoted=false,closed=false;const rows=[];
  const cell=()=>{row.push(field);field='';closed=false;need(row.length<=1000,'The original CSV exceeds 1,000 columns.');};
  const line=()=>{cell();rows.push(row);row=[];need(rows.length<=AWARD_CSV_MAX_ROWS+1,'One complete original source supports at most 25,000 application rows.');};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}
      else field+=c;
      continue;
    }
    if(c===','){cell();continue;}
    if(c==='\r'||c==='\n'){line();if(c==='\r'&&text[i+1]==='\n')i++;continue;}
    need(!closed,'Unexpected data after a complete quoted CSV cell.');
    if(c==='"'){need(field==='','A quote inside a CSV cell must use complete CSV quoting.');quoted=true;}
    else field+=c;
  }
  need(!quoted,'The original CSV ends inside a quoted cell.');
  if(field!==''||row.length||closed)line();
  need(rows.length>1,'Supply one header row and at least one complete application.');
  const headers=rows.shift();
  need(rows.length<=2000||headers.length<=50,'Sources over 2,000 application rows support at most 50 original columns.');
  need(headers.every(h=>h.trim())&&new Set(headers).size===headers.length,'CSV headers must be nonempty and distinct.');
  need(rows.every(r=>r.length===headers.length),'Every original CSV record must have exactly the declared columns.');
  return {headers,rows:rows.map(values=>Object.fromEntries(headers.map((key,i)=>[key,values[i]])))};
}
