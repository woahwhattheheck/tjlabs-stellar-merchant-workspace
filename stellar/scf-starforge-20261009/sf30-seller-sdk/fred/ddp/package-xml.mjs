// MIT. Read complete original Board compact SDMX and retained structure labels.
import { clone,need } from '../model.mjs';
import { scanFredDdpXml } from './xml.mjs';
const BOARD=/^https?:\/\/www\.federalreserve\.gov\/structure\/compact\//;
const SCHEMA='http://www.w3.org/2001/XMLSchema';
const local=value=>String(value||'').split(':').at(-1);
const attributes=node=>Object.fromEntries(Object.entries(node.attributes).filter(([key])=>key!=='xmlns'&&!key.startsWith('xmlns:')));
const clean=value=>String(value).trim();
const metadataKeys={frequency:'FREQ',unit:'UNIT',multiplier:'UNIT_MULT',currency:'CURRENCY',seasonalAdjustment:'SA'};
const xmlSeriesSources=new WeakMap();
const escapeAttribute=value=>String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function originalSeriesObservations(source,{offset=0,limit=source.extent.count}={}){
  need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=0,'Choose a supported original observation range.');
  const end=Math.min(source.extent.count,offset+limit),rows=[];
  if(offset>=end)return Object.freeze(rows);
  const names=Object.entries(source.namespaces).filter(([key])=>key!=='xml'&&key!=='xmlns');
  const prefix='<ddp-source'+names.map(([key,value])=>' '+(key?'xmlns:'+key:'xmlns')+'="'+escapeAttribute(value)+'"').join('')+'>';
  const ranged=source.directObservations;
  const start=ranged?source.spans[offset*2]:source.start,stop=ranged?source.spans[(end-1)*2+1]:source.end;
  const body=prefix+source.text.slice(start,stop)+'</ddp-source>',adjust=start-prefix.length;
  let seen=ranged?offset:0;
  scanFredDdpXml(body,{start(node){
    if(node.localName!=='Obs'||!BOARD.test(node.namespaceURI))return;
    const index=seen++,a=attributes(node);
    if(index<offset||index>=end)return;
    rows.push(Object.freeze({index,period:a.TIME_PERIOD,value:a.OBS_VALUE??'',status:a.OBS_STATUS??null,
      original:Object.freeze({attributes:Object.freeze(a)}),
      location:Object.freeze({filename:source.filename,start:node.location.start+adjust,end:node.location.end+adjust})}));
  }},{retainAttributeLocations:false});
  need(seen===(ranged?end:source.extent.count)&&rows.length===end-offset,'The retained original observation extent changed.');
  return Object.freeze(rows);
}
export function fredDdpXmlSeriesExtent(series){return xmlSeriesSources.get(series)?.extent??null;}
export function retainFredDdpXmlSeriesSource(original,series){
  const source=xmlSeriesSources.get(original);if(source)xmlSeriesSources.set(series,source);return series;
}
export function pageFredDdpXmlSeriesObservations(series,{offset=0,limit=100}={}){
  const source=xmlSeriesSources.get(series);return source?originalSeriesObservations(source,{offset,limit}):null;
}
function structureCollector(file,catalog){
  const {lists,bindings,references}=catalog;
  let currentList=null,currentCode=null,currentType=null,currentEnum=null,family=null;
    const textBuffers=new Map();
  return {
      start(node,stack){
        const name=node.localName,a=node.attributes;
        if(name==='KeyFamily')family={id:a.id||null,depth:stack.length};
        if(name==='CodeList'||name==='Codelist'){
          need(currentList===null,'Nested original SDMX codelists are unsupported.');
          currentList={id:a.id||a.ID||null,name:null,codes:[],source:{filename:file.name,location:clone(node.location)},original:attributes(node),depth:stack.length};
        }else if(currentList&&name==='Code'){
          currentCode={value:a.value??a.id??null,description:null,original:attributes(node),location:{filename:file.name,...clone(node.location)},depth:stack.length};
          need(typeof currentCode.value==='string','An original structure code has no value.');
        }
        if(name==='Dimension'||name==='Attribute'||name==='TimeDimension'||name==='PrimaryMeasure'){
          const concept=a.concept||a.conceptRef||a.id,codelist=a.codelist||a.codelistRef;
          if(concept&&codelist)bindings.push({concept,codelist,family:family?.id||null,filename:file.name,original:attributes(node)});
        }
        if(node.namespaceURI===SCHEMA&&name==='simpleType')currentType={id:(node.namespaces['']||node.namespaces['targetNamespace']||'')+'#'+(a.name||''),name:a.name||null,codes:[],source:{filename:file.name},depth:stack.length};
        if(currentType&&node.namespaceURI===SCHEMA&&name==='enumeration'){
          currentEnum={value:a.value,description:null,original:attributes(node),location:{filename:file.name,...clone(node.location)},depth:stack.length};
          need(typeof currentEnum.value==='string','An original schema enumeration has no value.');
        }
        if(node.namespaceURI===SCHEMA&&name==='attribute'&&a.name&&a.type){
          const [prefix,typeName]=a.type.includes(':')?a.type.split(':'):['',a.type];
          bindings.push({concept:a.name,codelist:(node.namespaces[prefix]||'')+'#'+typeName,family:null,filename:file.name,original:attributes(node)});
        }
        if(['Description','Name','description','name','documentation'].includes(name))textBuffers.set(node,'');
        if(node.namespaceURI===SCHEMA&&['import','include'].includes(name)&&a.schemaLocation)
          references.push({filename:file.name,kind:name,namespace:a.namespace||null,href:a.schemaLocation});
        for(const [key,value] of Object.entries(a))if(local(key)==='schemaLocation'&&key.includes(':')){
          const parts=value.trim().split(/\s+/);need(parts.length%2===0,'An original XML schemaLocation has unmatched names.');
          for(let i=0;i<parts.length;i+=2)references.push({filename:file.name,kind:'schemaLocation',namespace:parts[i],href:parts[i+1]});
        }
      },
      text(value,where,node,stack){if(textBuffers.size)for(const parent of stack)if(textBuffers.has(parent))textBuffers.set(parent,textBuffers.get(parent)+value);},
      end(node,stack){
        const name=node.localName;
        if(textBuffers.has(node)){
          const value=clean(textBuffers.get(node));textBuffers.delete(node);
          if(value){if(currentEnum)currentEnum.description=currentEnum.description?currentEnum.description+'\n'+value:value;
            else if(currentCode)currentCode.description=currentCode.description?currentCode.description+'\n'+value:value;
            else if(currentList&&currentList.name===null)currentList.name=value;}
        }
        if(currentCode&&stack.length===currentCode.depth&&name==='Code'){currentCode.location.end=node.location.end;delete currentCode.depth;currentList.codes.push(currentCode);currentCode=null;}
        if(currentList&&stack.length===currentList.depth&&(name==='CodeList'||name==='Codelist')){delete currentList.depth;lists.push(currentList);currentList=null;}
        if(currentEnum&&stack.length===currentEnum.depth&&name==='enumeration'){delete currentEnum.depth;currentType.codes.push(currentEnum);currentEnum=null;}
        if(currentType&&stack.length===currentType.depth&&name==='simpleType'){if(currentType.name){currentType.id=currentType.name;delete currentType.depth;lists.push(currentType);}currentType=null;}
        if(family&&stack.length===family.depth&&name==='KeyFamily')family=null;
      }

  };
}
function labelFor(catalog,concept,code,dataset){
  if(code===null||code===undefined)return {code:null,label:null};
  const applicable=catalog.bindings.filter(binding=>binding.concept===concept&&(!binding.family||binding.family===dataset.id||dataset.namespaceURI.endsWith('/'+binding.family)));
  const listIds=new Set(applicable.map(binding=>binding.codelist));
  const lists=catalog.lists.filter(list=>listIds.has(list.id)||[...listIds].some(id=>local(id.split('#').at(-1))===list.id));
  const hits=lists.flatMap(list=>list.codes.filter(item=>item.value===code).map(item=>({listId:list.id,...item})));
  const labels=[...new Set(hits.map(item=>item.description).filter(Boolean))];
  return {code,label:labels.length===1?labels[0]:null,definitions:clone(hits)};
}
export function readFredDdpXmlPackage(files,{release}){
  const catalog={lists:[],bindings:[],references:[]},series=[],documents=[],datasets=[];
  let totalObservations=0;
  for(const file of files){
    if(!file.forceXml&&!/\.(?:xml|xsd)$/i.test(file.name))continue;
    const readData=file.forceXml||/\.xml$/i.test(file.name),structure=structureCollector(file,catalog);
    let dataset=null,current=null,currentExtent=null,currentNamespaces=null,annotation=null,headerDepth=null,document=null;
    const texts=new Map();
    const data={
      start(node,stack){
        if(stack.length===1)document={filename:file.name,namespaceURI:node.namespaceURI,attributes:attributes(node),fields:[],datasets:[]};
        if(node.localName==='Header'&&!current)headerDepth=stack.length;
        if(headerDepth&&stack.length===headerDepth+1)texts.set(node,'');
        if(node.localName==='DataSet'&&BOARD.test(node.namespaceURI)){
          need(dataset===null,'Original Board datasets must not nest.');
          const a=attributes(node);need(typeof a.id==='string'&&a.id.length>0,'An original Board dataset has no ID.');
          dataset={id:a.id,namespaceURI:node.namespaceURI,attributes:a,location:{filename:file.name,...clone(node.location)},depth:stack.length};
          datasets.push(dataset);document.datasets.push({id:a.id,attributes:clone(a),namespaceURI:node.namespaceURI});
        }
        if(node.localName==='Series'&&BOARD.test(node.namespaceURI)){
          need(dataset&&current===null,'An original Board series must belong to one dataset.');
          const a=attributes(node);need(typeof a.SERIES_NAME==='string'&&a.SERIES_NAME.length>0&&a.SERIES_NAME.length<=512,'An original Board series needs its exact SERIES_NAME.');
          current={release,boardSeriesId:a.SERIES_NAME,datasetId:dataset.id,title:a.SERIES_NAME,annotations:[],
            original:{attributes:a,namespaceURI:node.namespaceURI,datasetAttributes:clone(dataset.attributes)},
            location:{filename:file.name,...clone(node.location)},depth:stack.length};
          currentExtent={count:0,firstPeriod:null,lastPeriod:null,minPeriod:null,maxPeriod:null,spans:[],directObservations:true};
          currentNamespaces=Object.assign({},node.namespaces);
          for(const [key,concept] of Object.entries(metadataKeys))current[key]={code:a[concept]??null,label:null};
        }
        if(node.localName==='Annotation'&&current){need(annotation===null,'Original series annotations must not nest.');annotation={type:'',text:'',original:attributes(node),location:{filename:file.name,...clone(node.location)},depth:stack.length};}
        if(annotation&&['AnnotationType','AnnotationText'].includes(node.localName))texts.set(node,'');
        if(node.localName==='Obs'&&BOARD.test(node.namespaceURI)){
          need(current,'An original Board observation must belong to a series.');
          const a=attributes(node);need(typeof a.TIME_PERIOD==='string'&&a.TIME_PERIOD.length>0&&a.TIME_PERIOD.length<=100,'An original observation needs its TIME_PERIOD.');
          need(a.OBS_VALUE===undefined||typeof a.OBS_VALUE==='string'&&a.OBS_VALUE.length<=1024,'Invalid original Board observation value.');
          const period=a.TIME_PERIOD;currentExtent.count++;
          currentExtent.firstPeriod??=period;currentExtent.lastPeriod=period;
          if(currentExtent.minPeriod===null||period<currentExtent.minPeriod)currentExtent.minPeriod=period;
          if(currentExtent.maxPeriod===null||period>currentExtent.maxPeriod)currentExtent.maxPeriod=period;
          node.ddpObservationSpan=currentExtent.spans.length;currentExtent.spans.push(node.location.start,node.location.end);
          if(stack.at(-2)?.localName!=='Series'||!BOARD.test(stack.at(-2)?.namespaceURI||''))currentExtent.directObservations=false;
          need(++totalObservations<=3000000,'This original Board package exceeds its observation capacity.');
        }
      },
      text(value,where,node,stack){if(texts.size)for(const parent of stack)if(texts.has(parent))texts.set(parent,texts.get(parent)+value);},
      end(node,stack){
        if(node.ddpObservationSpan!==undefined)currentExtent.spans[node.ddpObservationSpan+1]=node.location.end;
        if(texts.has(node)){
          const value=clean(texts.get(node));texts.delete(node);
          if(annotation&&node.localName==='AnnotationType')annotation.type=value;
          else if(annotation&&node.localName==='AnnotationText')annotation.text=value;
          else if(headerDepth&&stack.length===headerDepth+1)document.fields.push({name:node.localName,text:value,attributes:attributes(node),location:clone(node.location)});
        }
        if(annotation&&node.localName==='Annotation'&&stack.length===annotation.depth){
          annotation.location.end=node.location.end;delete annotation.depth;current.annotations.push(annotation);annotation=null;
        }
        if(current&&node.localName==='Series'&&stack.length===current.depth){
          const title=current.annotations.find(item=>/^(?:short description|series description|title)$/i.test(item.type))?.text||
            current.annotations.find(item=>/description/i.test(item.type))?.text;
          if(title)current.title=title;
          current.location.end=node.location.end;delete current.depth;
          const {spans,directObservations,...extent}=currentExtent;
          const retained={filename:file.name,text:file.text,start:current.location.start,end:current.location.end,namespaces:currentNamespaces,
            spans:Uint32Array.from(spans),directObservations,extent:Object.freeze(extent)};
          Object.defineProperty(current,'observations',{enumerable:true,get:()=>originalSeriesObservations(retained)});
          xmlSeriesSources.set(current,retained);series.push(current);current=null;currentExtent=null;currentNamespaces=null;
          need(series.length<=100000,'This original Board package exceeds its series capacity.');
        }
        if(dataset&&node.localName==='DataSet'&&stack.length===dataset.depth){dataset.location.end=node.location.end;delete dataset.depth;dataset=null;}
        if(headerDepth&&node.localName==='Header'&&stack.length===headerDepth)headerDepth=null;
        if(stack.length===1&&document)documents.push(document);
      }
    };
    scanFredDdpXml(file.text,{
      start(node,stack){structure.start(node,stack);if(readData)data.start(node,stack);},
      text(value,where,node,stack){structure.text(value,where,node,stack);if(readData)data.text(value,where,node,stack);},
      end(node,stack){structure.end(node,stack);if(readData)data.end(node,stack);}
    },{retainAttributeLocations:false});
  }
  for(const item of series)for(const [key,concept] of Object.entries(metadataKeys))
    item[key]=labelFor(catalog,concept,item.original.attributes[concept]??null,{id:item.datasetId,namespaceURI:item.original.namespaceURI});
  need(series.length>0,'The original package contains no Board compact SDMX series.');
  const names=new Set(files.map(file=>file.name));
  for(const reference of catalog.references){
    let resolved=null;
    if(!/^[a-z][a-z0-9+.-]*:/i.test(reference.href)&&!reference.href.startsWith('/')){
      const directory=reference.filename.split('/').slice(0,-1),parts=[...directory,...reference.href.split('/')],stack=[];
      let safe=true;
      for(const part of parts){if(part==='..'){if(!stack.length){safe=false;break;}stack.pop();}else if(part&&part!=='.')stack.push(part);}
      if(safe)resolved=stack.join('/');
    }
    reference.memberName=resolved;reference.retained=resolved!==null&&names.has(resolved);
  }
  return {header:{documents,datasets:datasets.map(clone),structures:catalog.lists,structureBindings:catalog.bindings,schemaReferences:catalog.references},series};
}
