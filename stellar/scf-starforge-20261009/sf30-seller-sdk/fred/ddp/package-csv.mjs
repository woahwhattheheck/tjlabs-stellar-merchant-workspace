// MIT. Original DDP CSV packages in columns, rows or sequential lists.
import { canonical,clone,need,plain } from '../model.mjs';
import { readFredDdpCsv } from './csv.mjs';
const KEYS=['title','frequency','unit','multiplier','currency','seasonalAdjustment'];
const isPeriod=value=>/^(?:\d{4}(?:-\d{2}(?:-\d{2})?|-[Qq][1-4]|-[Hh][12])?|\d{4}[Qq][1-4])$/.test(value);
const integer=(value,label)=>{need(Number.isSafeInteger(value)&&value>=1,label+' must be a positive original row or column number.');return value;};
const text=(value,label)=>{need(typeof value==='string'&&value.length>0&&value.length<=1024&&value===value.trim()&&!/[\u0000-\u001f\u007f]/.test(value),'Invalid original '+label+'.');return value;};
function mapping(value,kind){
  if(value===undefined)return {};
  need(plain(value)&&Object.keys(value).every(key=>KEYS.includes(key)),'Invalid original CSV metadata '+kind+'.');
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,integer(item,'Metadata '+kind)]));
}
export function normalizeFredDdpCsvLayout(input){
  if(input===null||input===undefined)return null;
  need(plain(input)&&['columns','rows','lists'].includes(input.layout),'Choose the original CSV columns, rows or lists layout.');
  if(input.layout==='columns'){
    const allowed=['layout','headerRow','dataStartRow','dataEndRow','periodColumn','seriesColumns','metadataRows'];
    need(Object.keys(input).every(key=>allowed.includes(key)),'Unknown original column-layout field.');
    const out={layout:'columns',headerRow:integer(input.headerRow,'Header row'),dataStartRow:integer(input.dataStartRow,'Data start row'),
      dataEndRow:input.dataEndRow===undefined||input.dataEndRow===null?null:integer(input.dataEndRow,'Data end row'),
      periodColumn:integer(input.periodColumn??1,'Period column'),seriesColumns:input.seriesColumns??null,metadataRows:mapping(input.metadataRows,'row')};
    need(out.dataStartRow>out.headerRow&&(out.dataEndRow===null||out.dataEndRow>=out.dataStartRow),'Invalid original CSV data interval.');
    if(out.seriesColumns!==null){need(Array.isArray(out.seriesColumns)&&out.seriesColumns.length>0&&new Set(out.seriesColumns).size===out.seriesColumns.length,'Select unique original series columns.');out.seriesColumns=out.seriesColumns.map(n=>integer(n,'Series column'));need(!out.seriesColumns.includes(out.periodColumn),'A period column cannot also contain a series.');}
    return out;
  }
  if(input.layout==='rows'){
    const allowed=['layout','headerRow','dataStartRow','dataEndRow','seriesColumn','periodColumns','metadataColumns'];
    need(Object.keys(input).every(key=>allowed.includes(key)),'Unknown original row-layout field.');
    const out={layout:'rows',headerRow:integer(input.headerRow,'Period header row'),dataStartRow:integer(input.dataStartRow,'Data start row'),
      dataEndRow:input.dataEndRow===undefined||input.dataEndRow===null?null:integer(input.dataEndRow,'Data end row'),
      seriesColumn:integer(input.seriesColumn??1,'Series column'),periodColumns:input.periodColumns??null,metadataColumns:mapping(input.metadataColumns,'column')};
    need(out.dataStartRow>out.headerRow&&(out.dataEndRow===null||out.dataEndRow>=out.dataStartRow),'Invalid original CSV data interval.');
    if(out.periodColumns!==null){need(Array.isArray(out.periodColumns)&&out.periodColumns.length>0&&new Set(out.periodColumns).size===out.periodColumns.length,'Select unique original period columns.');out.periodColumns=out.periodColumns.map(n=>integer(n,'Period column'));need(!out.periodColumns.includes(out.seriesColumn),'A series column cannot also contain a period.');}
    return out;
  }
  need(Object.keys(input).every(key=>['layout','blocks'].includes(key))&&Array.isArray(input.blocks)&&input.blocks.length>0&&input.blocks.length<=100000,'Supply the original sequential CSV blocks.');
  const blocks=input.blocks.map(block=>{
    need(plain(block)&&Object.keys(block).every(key=>['seriesCell','dataStartRow','dataEndRow','periodColumn','valueColumn','metadataCells'].includes(key)),'Unknown original list-block field.');
    const cell=value=>{need(plain(value)&&Object.keys(value).every(key=>['row','column'].includes(key)),'Retain the original cell location.');return {row:integer(value.row,'Cell row'),column:integer(value.column,'Cell column')};};
    const metadataCells={};need(block.metadataCells===undefined||plain(block.metadataCells),'Invalid original metadata cells.');
    for(const [key,value] of Object.entries(block.metadataCells||{})){need(KEYS.includes(key),'Unknown original series metadata field.');metadataCells[key]=cell(value);}
    const out={seriesCell:cell(block.seriesCell),dataStartRow:integer(block.dataStartRow,'Data start row'),dataEndRow:integer(block.dataEndRow,'Data end row'),
      periodColumn:integer(block.periodColumn??1,'Period column'),valueColumn:integer(block.valueColumn??2,'Value column'),metadataCells};
    need(out.dataEndRow>=out.dataStartRow&&out.periodColumn!==out.valueColumn,'Invalid original list-block extent.');return out;
  });
  const intervals=blocks.map(b=>[b.dataStartRow,b.dataEndRow]).sort((a,b)=>a[0]-b[0]);
  for(let i=1;i<intervals.length;i++)need(intervals[i][0]>intervals[i-1][1],'Original list observation blocks must not overlap.');
  return {layout:'lists',blocks};
}
function inferredMetadata(records,from,to,labelColumn=0){
  const names=new Map([['series description','title'],['description','title'],['frequency','frequency'],['unit','unit'],['units','unit'],
    ['multiplier','multiplier'],['unit multiplier','multiplier'],['currency','currency'],['seasonal adjustment','seasonalAdjustment']]);
  const result={};
  for(const row of records.slice(from,to)){
    const label=(row.cells[labelColumn]||'').trim().toLocaleLowerCase('en-US').replace(/:\s*$/,'');
    const key=names.get(label);if(key){need(!Object.hasOwn(result,key),'An original CSV label is repeated; select its explicit metadata row.');result[key]=row.row;}
  }
  return result;
}
function automaticLayout(records){
  const headers=records.filter(row=>{
    const first=(row.cells[0]||'').trim().toLocaleLowerCase('en-US').replace(/\s+/g,' ');
    return ['time period','date','dates',''].includes(first)&&row.cells.length>=2&&row.cells.slice(1).some(Boolean);
  });
  const dateHeader=headers.find(row=>row.cells.slice(1).filter(Boolean).every(isPeriod));
  if(dateHeader)return {layout:'rows',headerRow:dateHeader.row,dataStartRow:dateHeader.row+1,dataEndRow:null,seriesColumn:1,
    periodColumns:dateHeader.cells.flatMap((value,index)=>index>0&&isPeriod(value)?[index+1]:[]),metadataColumns:{}};
  const seriesHeaders=headers.filter(row=>row.cells.slice(1).filter(Boolean).every(value=>!isPeriod(value))&&
    records[row.row]&&isPeriod(records[row.row].cells[0]||''));
  if(seriesHeaders.length===1){
    const row=seriesHeaders[0];return {layout:'columns',headerRow:row.row,dataStartRow:row.row+1,dataEndRow:null,periodColumn:1,
      seriesColumns:row.cells.flatMap((value,index)=>index>0&&value!==''?[index+1]:[]),metadataRows:inferredMetadata(records,0,row.row-1)};
  }
  if(seriesHeaders.length>1&&seriesHeaders.every(row=>row.cells.length===2)){
    const blocks=seriesHeaders.map((row,index)=>{
      let end=row.row+1;while(end<=records.length&&isPeriod(records[end-1]?.cells[0]||''))end++;
      const prior=index===0?0:seriesHeaders[index-1].row;
      const metadataRows=inferredMetadata(records,prior,row.row-1);
      return {seriesCell:{row:row.row,column:2},dataStartRow:row.row+1,dataEndRow:end-1,periodColumn:1,valueColumn:2,
        metadataCells:Object.fromEntries(Object.entries(metadataRows).map(([key,number])=>[key,{row:number,column:2}]))};
    });return {layout:'lists',blocks};
  }
  need(false,'Select the original CSV layout and source cell locations for this package.');
}
export function readFredDdpCsvPackage(textInput,{release,filename,csvLayout=null}){
  const parsed=readFredDdpCsv(textInput),records=parsed.records;
  need(records.length>=2,'Receive the complete original CSV package.');
  const layout=normalizeFredDdpCsvLayout(csvLayout||automaticLayout(records)),series=[],used=new Set();
  const row=number=>{const item=records[number-1];need(item,'The CSV layout references a missing original row.');return item;};
  const cell=(r,c)=>{const item=row(r);need(c<=item.cells.length,'The CSV layout references a missing original column.');return item.cells[c-1];};
  const descriptor=(value)=>({code:value||null,label:value||null});
  const add=(boardSeriesId,metadata,original,location)=>{
    const item={release,boardSeriesId:text(boardSeriesId,'Board series ID'),datasetId:release,
      title:metadata.title||boardSeriesId,frequency:descriptor(metadata.frequency),unit:descriptor(metadata.unit),
      multiplier:descriptor(metadata.multiplier),currency:descriptor(metadata.currency),seasonalAdjustment:descriptor(metadata.seasonalAdjustment),
      annotations:Object.entries(metadata).map(([type,text])=>({type,text})),original,location,observations:[]};series.push(item);return item;
  };
  const observe=(item,period,value,r,c)=>{
    text(period,'observation period');need(typeof value==='string'&&value.length<=1024,'Invalid original CSV observation value.');
    const identity=r+':'+c;need(!used.has(identity),'An original CSV observation cell is selected twice.');used.add(identity);
    item.observations.push({index:item.observations.length,period,value,status:null,
      original:{row:r,column:c,period,value},location:{filename,...clone(row(r).location),row:r,column:c}});
  };
  if(layout.layout==='columns'){
    const header=row(layout.headerRow),columns=layout.seriesColumns||header.cells.map((_,index)=>index+1).filter(n=>n!==layout.periodColumn);
    const selected=columns.map(column=>{
      const metadata=Object.fromEntries(Object.entries(layout.metadataRows).map(([key,number])=>[key,cell(number,column)]));
      return {column,item:add(cell(layout.headerRow,column),metadata,{headerRow:layout.headerRow,column,headerCell:cell(layout.headerRow,column),metadataRows:clone(layout.metadataRows)},
        {filename,...clone(header.location),row:header.row,column})};
    });
    const end=layout.dataEndRow??records.length;
    for(let number=layout.dataStartRow;number<=end;number++){
      const record=row(number);if(record.cells.every(value=>value===''))continue;
      const period=cell(number,layout.periodColumn);
      for(const {column,item} of selected)observe(item,period,cell(number,column),number,column);
    }
  }else if(layout.layout==='rows'){
    const header=row(layout.headerRow),columns=layout.periodColumns||header.cells.map((value,index)=>({value,column:index+1})).filter(v=>v.column!==layout.seriesColumn&&isPeriod(v.value)).map(v=>v.column);
    need(columns.length>0,'The original row layout needs period columns.');
    const end=layout.dataEndRow??records.length;
    for(let number=layout.dataStartRow;number<=end;number++){
      const record=row(number);if(record.cells.every(value=>value===''))continue;
      const metadata=Object.fromEntries(Object.entries(layout.metadataColumns).map(([key,column])=>[key,cell(number,column)]));
      const item=add(cell(number,layout.seriesColumn),metadata,{row:number,periodHeaderRow:layout.headerRow,seriesCell:cell(number,layout.seriesColumn),metadataColumns:clone(layout.metadataColumns)},
        {filename,...clone(record.location),row:number,column:layout.seriesColumn});
      for(const column of columns)observe(item,cell(layout.headerRow,column),cell(number,column),number,column);
    }
  }else{
    for(const block of layout.blocks){
      const metadata=Object.fromEntries(Object.entries(block.metadataCells).map(([key,where])=>[key,cell(where.row,where.column)]));
      const at=block.seriesCell,record=row(at.row),item=add(cell(at.row,at.column),metadata,{block:clone(block),seriesCell:cell(at.row,at.column)},
        {filename,...clone(record.location),row:at.row,column:at.column});
      for(let number=block.dataStartRow;number<=block.dataEndRow;number++)observe(item,cell(number,block.periodColumn),cell(number,block.valueColumn),number,block.valueColumn);
    }
  }
  need(series.length>0,'The original CSV layout contains no series.');
  const headerRows=new Set();
  if(layout.layout==='lists'){for(const block of layout.blocks){headerRows.add(block.seriesCell.row);for(const where of Object.values(block.metadataCells))headerRows.add(where.row);}}
  else {for(let number=1;number<layout.dataStartRow;number++)headerRows.add(number);}
  return {header:{layout,records:[...headerRows].sort((a,b)=>a-b).map(number=>clone(row(number)))},series,layout};
}
