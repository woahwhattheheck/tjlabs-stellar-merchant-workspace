function readOrkyoXlsx(bytes,UZIP){
const zip=UZIP.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),decoder=new TextDecoder("utf-8",{fatal:true});
const xml=path=>{if(!zip[path])throw Error("Workbook member missing: "+path);const d=new DOMParser().parseFromString(decoder.decode(zip[path]),"application/xml");if(d.getElementsByTagName("parsererror").length)throw Error("Invalid workbook XML: "+path);return d};
const els=(n,tag)=>Array.from(n.getElementsByTagNameNS("*",tag)),attr=(n,k)=>n.getAttribute(k),text=(n,tag)=>els(n,tag).map(x=>x.textContent||"").join("");
const book=xml("xl/workbook.xml"),rels=xml("xl/_rels/workbook.xml.rels"),relationships=new Map(els(rels,"Relationship").map(x=>[attr(x,"Id"),attr(x,"Target")]));
const shared=zip["xl/sharedStrings.xml"]?els(xml("xl/sharedStrings.xml"),"si").map(x=>text(x,"t")):[];
const notices=[],sheets=[];
for(const sh of els(book,"sheet")){
 const id=sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id")||attr(sh,"r:id"),target=relationships.get(id);if(!target)throw Error("Workbook sheet relationship missing");
 let path=target.startsWith("/")?target.slice(1):"xl/"+target;const stack=[];for(const p of path.split("/")){if(p===".."){if(!stack.length)throw Error("Workbook path escapes archive");stack.pop()}else if(p!==".")stack.push(p)}path=stack.join("/");
 const rows=[];for(const r of els(xml(path),"row")){
  const ri=Number(attr(r,"r"));if(!Number.isInteger(ri)||ri<1||ri>1048576)throw Error("Invalid worksheet row");while(rows.length<ri)rows.push([]);const cells=rows[ri-1];
  for(const cell of els(r,"c")){
   const ref=attr(cell,"r")||"",m=ref.match(/^([A-Z]+)([0-9]+)$/);if(!m||Number(m[2])!==ri)throw Error("Invalid worksheet cell address");let ci=0;for(const ch of m[1])ci=ci*26+ch.charCodeAt(0)-64;ci--;if(ci>=16384)throw Error("Worksheet column limit");while(cells.length<=ci)cells.push(null);
   const t=attr(cell,"t"),v=text(cell,"v"),formula=els(cell,"f");
   if(formula.length){if(!els(cell,"v").length)throw Error("Formula cell has no cached value: "+ref);notices.push({sheet:attr(sh,"name"),cell:ref,formula:formula[0].textContent,cached:v})}
   let value;if(t==="inlineStr")value=text(cell,"t");else if(t==="s"){const ix=Number(v);if(!Number.isInteger(ix)||ix<0||ix>=shared.length)throw Error("Shared string index missing");value=shared[ix]}else if(t==="b")value=v==="1";else if(t==="str"||t==="d")value=v;else if(t==="e")throw Error("Workbook error value in "+ref+": "+v);else if(v==="")value=null;else {value=Number(v);if(!Number.isFinite(value))throw Error("Invalid numeric workbook value in "+ref)}
   cells[ci]=value;
  }
 }
 sheets.push({name:attr(sh,"name"),rows});
}
return {sheets,notices,memberNames:Object.keys(zip),basis:"Original XLSX retained. Standard shared/inline strings and cached formula values are decoded; original formulas remain in the binary source."};
}