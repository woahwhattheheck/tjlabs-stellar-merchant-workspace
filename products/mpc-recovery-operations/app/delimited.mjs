export function parseDelimited(text,delimiter=',') {
 if(typeof text!=='string')throw Error('Choose a text file.');
 if(![',','\t',';'].includes(delimiter))throw Error('Choose comma, tab or semicolon.');
 text=text.replace(/^\uFEFF/,'');
 const rows=[];let row=[],cell='',quoted=false,closed=false,line=1,start=1;
 const field=()=>{row.push(cell);cell='';closed=false;};
 const finish=()=>{field();if(row.some(x=>x!==''))rows.push({line:start,values:row});row=[];start=line+1;};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else{cell+=c;if(c==='\n')line++;}continue;}
  if(c==='"'){if(cell||closed)throw Error('Unexpected quote at line '+line);quoted=true;continue;}
  if(c===delimiter){field();continue;}
  if(c==='\n'||c==='\r'){finish();if(c==='\r'&&text[i+1]==='\n')i++;line++;start=line;continue;}
  if(closed)throw Error('Unexpected text after closing quote at line '+line);
  cell+=c;
 }
 if(quoted)throw Error('Unclosed quoted value starting before line '+line);
 if(cell||row.length||closed)finish();
 if(!rows.length)throw Error('The file is empty.');
 const headers=rows.shift().values;
 if(headers.some(x=>!x.trim()))throw Error('Every column needs a header.');
 if(new Set(headers).size!==headers.length)throw Error('Column names must be unique.');
 const records=rows.map(r=>{
  if(r.values.length!==headers.length)throw Error('Line '+r.line+' has '+r.values.length+' values for '+headers.length+' columns.');
  return {line:r.line,values:Object.fromEntries(headers.map((h,i)=>[h,r.values[i]]))};
 });
 return {headers,records};
}
export function utcTimestamp(value,offset='') {
 if(typeof value!=='string'||!value.trim())throw Error('A timestamp is required.');
 let s=value.trim().replace(' ','T');
 if(!/(?:Z|[+-]\d{2}:\d{2})$/i.test(s)){
  if(!/^(Z|[+-]\d{2}:\d{2})$/.test(offset))throw Error('Timestamp has no timezone. Select its actual UTC offset.');
  s+=offset;
 }
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(s))throw Error('Use an ISO timestamp with a UTC offset.');
 const match=s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/),parts=match.slice(1).map(x=>Number(x||0));
 const check=new Date(Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4],parts[5]));
 if(check.getUTCFullYear()!==parts[0]||check.getUTCMonth()+1!==parts[1]||check.getUTCDate()!==parts[2]||parts[3]>23||parts[4]>59||parts[5]>59)throw Error('Timestamp contains an invalid calendar date or time.');
 const offsetMatch=s.match(/([+-])(\d{2}):(\d{2})$/);if(offsetMatch&&(Number(offsetMatch[2])>14||Number(offsetMatch[3])>59||Number(offsetMatch[2])===14&&Number(offsetMatch[3])!==0))throw Error('UTC offset is outside the supported range.');
 const n=Date.parse(s);if(!Number.isFinite(n))throw Error('Invalid timestamp.');
 return new Date(n).toISOString();
}
export function mapRecords(parsed,config) {
 if(!config||!Array.isArray(config.fields))throw Error('An explicit field mapping is required.');
 return parsed.records.map(({line,values})=>{
  const output={};
  for(const field of config.fields){
   let value=field.column?values[field.column]:field.constant;
   if(field.column&&!Object.prototype.hasOwnProperty.call(values,field.column))throw Error('Mapped column is missing: '+field.column);
   if(value===undefined||value===null||value===''){if(field.required)throw Error('Line '+line+': '+field.name+' is required.');continue;}
   try{
    if(field.type==='number'){const n=Number(value);if(!Number.isFinite(n)||n<0)throw Error('Use a nonnegative finite number.');value=n;}
    else if(field.type==='boolean'){const map=config.booleanValues||{'true':true,'false':false};if(!Object.prototype.hasOwnProperty.call(map,String(value)))throw Error('Define the true/false value mapping.');value=map[String(value)];}
    else if(field.type==='timestamp')value=utcTimestamp(String(value),config.utcOffset||'');
    else if(field.type==='enum'){const map=field.values||{};if(!Object.prototype.hasOwnProperty.call(map,String(value)))throw Error('Define the mapping for '+JSON.stringify(value)+'.');value=map[String(value)];}
    else if(field.type==='list')value=String(value).split(field.separator||'|').map(x=>x.trim()).filter(Boolean);
    else value=String(value);
   }catch(e){throw Error('Line '+line+', '+field.name+': '+e.message);}
   output[field.name]=value;
  }
  return {line,payload:output,raw:values};
 });
}
export function exportDelimited(records,headers,delimiter=',') {
 const escape=value=>{const text=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);return '"'+text.replace(/"/g,'""')+'"';};
 return [headers.map(escape).join(delimiter),...records.map(row=>headers.map(k=>escape(row[k])).join(delimiter))].join('\r\n')+'\r\n';
}
