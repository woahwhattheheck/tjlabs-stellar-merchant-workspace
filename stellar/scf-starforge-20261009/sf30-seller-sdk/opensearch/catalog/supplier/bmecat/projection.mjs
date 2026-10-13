// MIT. Explicit BMEcat-to-existing supplier projection. No recipient evaluation.
import { supplierProductTemplate } from '../profile.mjs';
import { BMECAT_NS, bmecatFailure, xmlChildren, xmlText, xmlAttribute, xmlFields } from './parser.mjs';
const clone = x => JSON.parse(JSON.stringify(x));
const pointer = x => x.replaceAll('~','~0').replaceAll('/','~1');
const fail = (code,message) => { throw bmecatFailure(code,message); };
export const BMECAT_PRODUCT_SCHEMA = 'stellar-forge.bmecat-product.v1';
export const BMECAT_DOCUMENT_SCHEMA = 'stellar-forge.bmecat-document.v1';
const TRANSACTION_MODES = Object.freeze({T_NEW_CATALOG:['full'],T_UPDATE_PRODUCTS:['delta'],
  T_UPDATE_PRICES:[],T_NEW_PRODUCTDATA:[]});
function mappingContext(header) {
  const mapped=[],used=new Set(),issues=[],inheritance=[];
  const issue=(node,message)=>issues.push({path:node?.path??'/BMECAT',message});
  const many=(n,name)=>xmlChildren(n,name);
  const one=(n,name)=>{const values=many(n,name);if(values.length>1){issue(n,'Repeated '+name+' is retained in the original tree; no single target value was selected.');return null;}return values[0]??null;};
  const follow=(n,...names)=>names.reduce((v,name)=>one(v,name),n);
  const value=(n,target,transformation)=>{
    if(!n)return '';
    if(n.children.some(c=>typeof c==='object')){issue(n,'Element content is not a scalar; the original tree is retained.');return '';}
    const path=n.path+'/text()',s=xmlText(n);used.add(path);mapped.push({sourcePath:path,targetPath:target,sourceValue:s,...(transformation?{transformation}:{})});return s;
  };
  const attr=(n,name,target)=>{
    const a=n?.attributes.find(a=>a.namespace===''&&a.name===name);if(!a)return '';
    const path=n.path+'/@'+a.qualifiedName;used.add(path);mapped.push({sourcePath:path,targetPath:target,sourceValue:a.value});return a.value;
  };
  const catalogue=one(header,'CATALOG'),languages=many(catalogue,'LANGUAGE'),defaults=languages.filter(n=>xmlAttribute(n,'default')==='true');
  // ETIM's retained XSD uses the lexical literals true|false, not a guessed locale.
  const defaultLanguage=defaults.length===1?value(defaults[0],'/profile/defaultLanguage'):'';
  if(defaults.length!==1)issue(catalogue,'One explicit original default language is needed before inheriting untranslated language fields.');
  else attr(defaults[0],'default','/profile/defaultLanguage');
  const language=(n,target)=>{
    const explicit=attr(n,'lang',target);
    if(explicit)return explicit;
    if(!defaultLanguage){issue(n,'The source supplies no unambiguous language for this value.');return '';}
    inheritance.push({sourcePath:n?.path??null,targetPath:target,language:defaultLanguage,languageOrigin:'CATALOG/LANGUAGE[@default=true]'});
    return defaultLanguage;
  };
  const multilingual=(nodes,target)=>{
    const result=Object.create(null),groups=new Map();
    for(const n of nodes){const code=language(n,target+'/{language}');if(!code)continue;if(!groups.has(code))groups.set(code,[]);groups.get(code).push(n);}
    for(const [code,ns]of groups){if(ns.length!==1){issue(ns[0],'Repeated source language values are retained without overwriting a target slot.');continue;}result[code]=value(ns[0],target.includes('{language}')?target.replace('{language}',pointer(code)):target+'/'+pointer(code));}
    return result;
  };
  const boolean=(n,target)=>{
    if(!n)return undefined;const raw=xmlText(n);
    if(!['true','false'].includes(raw)){issue(n,'Original value is outside the retained XSD true|false literals; no boolean was invented.');return undefined;}
    return value(n,target,'ETIM XML boolean lexical value to JSON boolean')==='true';
  };
  return {mapped,used,issues,inheritance,issue,many,one,follow,value,attr,language,multilingual,boolean,catalogue,languages,defaultLanguage};
}
function headerProjection(header,receipt,ctx) {
  const {one,many,follow,value,attr,multilingual,catalogue:c,languages,defaultLanguage}=ctx;
  const source=receipt.sha256 ? 'sha256:'+receipt.sha256 : 'original-retained-bmecat';
  const versions=receipt.etimVersions??[];
  const profile={schema:'stellar-forge.supplier-profile.v1',id:'bmecat-'+(receipt.sha256??'unsealed').slice(0,48),
    targets:['bmecat-5.0'],languages:languages.map((n,i)=>value(n,'/profile/languages/'+i)),defaultLanguage,
    countries:many(c,'TERRITORY').map((n,i)=>value(n,'/profile/countries/'+i)),
    etim:{version:versions.length===1?versions[0]:'',classes:[],source},
    envelope:{transaction:receipt.transaction.name,catalogId:value(one(c,'CATALOG_ID'),'/profile/envelope/catalogId'),
      catalogVersion:value(one(c,'CATALOG_VERSION'),'/profile/envelope/catalogVersion'),
      catalogName:multilingual(many(c,'CATALOG_NAME'),'/profile/envelope/catalogName'),generationDate:'',
      buyer:{},supplier:{},currency:value(one(c,'CURRENCY'),'/profile/envelope/currency'),
      mimeRoot:multilingual(many(c,'MIME_ROOT'),'/profile/envelope/mimeRoot'),
      previousVersion:null,receiverAccepted:false,subsetAgreed:false},
    conversions:{allowExactUnitConversion:false,allowNetOrderBasisConversion:false},localRules:[]};
  const env=profile.envelope,dates=many(c,'DATETIME').filter(n=>xmlAttribute(n,'type')==='generation_date');
  if(dates.length===1){attr(dates[0],'type','/profile/envelope/generationDate');env.generationDate=value(one(dates[0],'DATE'),'/profile/envelope/generationDate');}
  else if(dates.length>1)ctx.issue(c,'Multiple original generation dates remain unresolved.');
  const prev=receipt.transaction.attributes.find(a=>a.name==='prev_version'&&a.namespace==='');
  if(prev)env.previousVersion=prev.value;
  for(const [name,key]of [['BUYER','buyer'],['SUPPLIER','supplier']]){
    const n=one(header,name),base='/profile/envelope/'+key;
    const party={name:value(one(n,name+'_NAME'),base+'/name'),ids:many(n,name+'_ID').map((z,i)=>({
      type:attr(z,'type',base+'/ids/'+i+'/type'),value:value(z,base+'/ids/'+i+'/value')}))};
    const address=one(n,'ADDRESS');
    if(name==='SUPPLIER'&&address){
      party.address=Object.fromEntries([['CONTACT','contact'],['STREET','street'],['ZIP','zip'],['CITY','city'],['COUNTRY','country'],['VAT_ID','vatId'],['EMAIL','email'],['URL','url']].map(([xml,k])=>[k,value(one(address,xml),base+'/address/'+k)]));
      attr(address,'type',base+'/address (supplier address context)');
    }env[key]=party;
  }
  value(follow(header,'USER_DEFINED_EXTENSIONS','UDX.EDXF.VERSION'),'/profile/targets/0 (EDXF version)');
  return profile;
}
export function bmecatDocumentMetadata(receipt) {
  const ctx=mappingContext(receipt.header),sourceProfile=headerProjection(receipt.header,receipt,ctx);
  return {schema:BMECAT_DOCUMENT_SCHEMA,bytes:receipt.bytes,sha256:receipt.sha256,productCount:receipt.productCount,
    transaction:clone(receipt.transaction),root:clone(receipt.root),header:clone(receipt.header),
    etimVersions:[...(receipt.etimVersions??[])],sourceProfile,catalogModes:[...TRANSACTION_MODES[receipt.transaction.name]],
    projectionIssues:ctx.issues,conformance:receipt.conformance};
}
export function assertBMEcatCatalogMode(metadata,mode) {
  if(metadata?.schema!==BMECAT_DOCUMENT_SCHEMA||!Object.hasOwn(TRANSACTION_MODES,metadata.transaction?.name))fail('METADATA','Use the completed original BMEcat source metadata.');
  if(!TRANSACTION_MODES[metadata.transaction.name].includes(mode))
    fail('TRANSACTION_MODE',metadata.transaction.name+' is retained as its original source; it cannot be applied as '+mode+
      '. Full material replacement is only available for T_NEW_CATALOG, and explicit delta for T_UPDATE_PRODUCTS. Price and product-data-only files require a separately reviewed merge.');
  return true;
}
export function bmecatInputProfile(metadata=null) {
  const keys=Object.keys(supplierProductTemplate()).filter(k=>!['category','segment','applicability'].includes(k));
  return {catalogMapping:{schema:'stellar-forge.material-catalog-mapping.v1',
    fields:{materialId:'materialId',title:'title',description:'description',partNumber:'partNumber',manufacturer:'manufacturer',unit:'unit'},
    references:[],attributes:{supplier:'supplier',bmecat:'bmecat'},identifierPolicy:'exact',unitAliases:{},
    delta:{operation:'/bmecat/mode',upsertValues:['new','update'],deleteValues:['delete']}},
    supplierBindings:Object.fromEntries(keys.map(k=>['/'+pointer(k),'/attributes/supplier/'+pointer(k)])),
    sourceProfile:metadata?.sourceProfile?clone(metadata.sourceProfile):null,
    supplierProfile:metadata?.sourceProfile?clone(metadata.sourceProfile):null,transactionModes:clone(TRANSACTION_MODES),
    note:'Select the original document header profile after upload and review it. Original dates, lexical prices, feature values, units, language inheritance and unprojected fields remain source-bound. No classifications, image contents, recipient agreements or commercial currency are inferred.'};
}
export function projectBMEcatProduct(event,receipt) {
  const ctx=mappingContext(receipt.header),profile=headerProjection(receipt.header,receipt,ctx);
  const {one,many,follow,value,attr,language,multilingual,boolean,issue}=ctx,n=event.product;
  const p=supplierProductTemplate();delete p.category;delete p.segment;delete p.applicability;p.descriptions=Object.create(null);
  const base='/supplier',d=one(n,'PRODUCT_DETAILS'),u=one(n,'USER_DEFINED_EXTENSIONS');
  p.supplierProductId=value(one(n,'SUPPLIER_PID'),base+'/supplierProductId');
  if(!p.supplierProductId)fail('PRODUCT_ID','Original supplier identifier cannot be empty.');
  for(const [xml,key]of [['MANUFACTURER_PID','manufacturerProductId'],['MANUFACTURER_NAME','manufacturerName'],['MANUFACTURER_TYPE_DESCR','manufacturerTypeDescription'],['SUPPLIER_ALT_PID','alternativeSupplierId']])
    p[key]=value(one(d,xml),base+'/'+key);
  const gtins=many(d,'INTERNATIONAL_PID').filter(z=>xmlAttribute(z,'type')==='gtin');
  if(gtins.length===1){p.productGtin=value(gtins[0],base+'/productGtin');attr(gtins[0],'type',base+'/productGtin (GTIN context)');}
  else if(gtins.length>1)issue(d,'Multiple original GTINs remain in the tree; no single productGtin was selected.');
  for(const [parent,xml,key]of [[d,'DESCRIPTION_SHORT','short'],[d,'DESCRIPTION_LONG','long'],[u,'UDX.EDXF.DESCRIPTION_VERY_SHORT','veryShort']]){
    const byLanguage=multilingual(many(parent,xml),base+'/descriptions/{language}/'+key);
    for(const [code,text]of Object.entries(byLanguage)){
      if(!Object.hasOwn(p.descriptions,code))p.descriptions[code]={veryShort:'',short:'',long:'',titleProposal:''};
      p.descriptions[code][key]=text;
    }
  }
  p.brand=value(one(u,'UDX.EDXF.BRAND_NAME'),base+'/brand');
  for(const [xml,key]of [['UDX.EDXF.PRODUCT_SERIES','series'],['UDX.EDXF.PRODUCT_VARIATION','types']])
    p[key]=many(u,xml).map((z,i)=>({language:language(z,base+'/'+key+'/'+i+'/language'),value:value(z,base+'/'+key+'/'+i+'/value')}));
  p.expiresAt=value(one(u,'UDX.EDXF.EXPIRATION_DATE'),base+'/expiresAt');
  for(const [outer,inner,key]of [['UDX.EDXF.COUNTRY_BRANCH_NUMBERS','UDX.EDXF.COUNTRY_BRANCH_NUMBER','branchNumbers'],['UDX.EDXF.COUNTRY_BRANCH_SUPPLIER_IDS','UDX.EDXF.COUNTRY_BRANCH_SUPPLIER_ID','branchSupplierIds']])
    p[key]=many(one(u,outer),inner).map((z,i)=>({country:attr(z,'country',base+'/'+key+'/'+i+'/country'),
      type:attr(z,'type',base+'/'+key+'/'+i+'/type'),value:value(z,base+'/'+key+'/'+i+'/value')}));
  const etim=many(n,'PRODUCT_FEATURES').filter(fs=>xmlText(one(fs,'REFERENCE_FEATURE_SYSTEM_NAME')).startsWith('ETIM-'));
  if(etim.length===1){
    const fs=etim[0];
    p.classification.etim={version:value(one(fs,'REFERENCE_FEATURE_SYSTEM_NAME'),base+'/classification/etim/version'),
      classId:value(one(fs,'REFERENCE_FEATURE_GROUP_ID'),base+'/classification/etim/classId'),
      features:many(fs,'FEATURE').map((f,i)=>{
        const target=base+'/classification/etim/features/'+i,details=many(f,'FVALUE_DETAILS');
        return {code:value(one(f,'FNAME'),target+'/code'),values:many(f,'FVALUE').map((v,j)=>value(v,target+'/values/'+j)),
          details:details.length===1?value(details[0],target+'/details'):details.length?multilingual(details,target+'/details'):'',
          unit:value(one(f,'FUNIT'),target+'/unit')};
      })};
  }else if(etim.length>1)issue(n,'Multiple ETIM feature systems remain in the original source; select one explicitly before recipient projection.');
  p.customsTariff=value(follow(n,'PRODUCT_LOGISTIC_DETAILS','CUSTOMS_TARIFF_NUMBER','CUSTOMS_NUMBER'),base+'/customsTariff');
  for(const [key,xml]of [['supplier','UDX.EDXF.DISCOUNT_GROUP_SUPPLIER'],['manufacturer','UDX.EDXF.DISCOUNT_GROUP_MANUFACTURER']])
    p.discountGroup[key]=value(follow(u,'UDX.EDXF.DISCOUNT_GROUP',xml),base+'/discountGroup/'+key);
  const order=one(n,'PRODUCT_ORDER_DETAILS');
  p.order=Object.fromEntries([['ORDER_UNIT','unit'],['CONTENT_UNIT','contentUnit'],['NO_CU_PER_OU','contentUnitsPerOrderUnit'],
    ['PRICE_QUANTITY','priceQuantity'],['QUANTITY_MIN','minimum'],['QUANTITY_INTERVAL','interval']].map(([xml,key])=>[key,value(one(order,xml),base+'/order/'+key)]));
  p.prices=[];
  for(const pd of many(n,'PRODUCT_PRICE_DETAILS')){
    for(const z of many(pd,'PRODUCT_PRICE')){
      const target=base+'/prices/'+p.prices.length,price={type:attr(z,'price_type',target+'/type')};
      for(const [xml,key]of [['PRICE_AMOUNT','amount'],['PRICE_CURRENCY','currency'],['TAX','tax'],['PRICE_FACTOR','priceFactor'],['LOWER_BOUND','lowerBound']])
        price[key]=value(one(z,xml),target+'/'+key);
      price.territories=many(z,'TERRITORY').map((v,i)=>value(v,target+'/territories/'+i));
      for(const [key,type]of [['validFrom','valid_start_date'],['validTo','valid_end_date']]){
        const dates=many(pd,'DATETIME').filter(v=>xmlAttribute(v,'type')===type);
        price[key]=dates.length===1?value(one(dates[0],'DATE'),target+'/'+key):'';
        if(dates.length===1)attr(dates[0],'type',target+'/'+key);
        else if(dates.length>1)issue(pd,'Repeated original price-validity dates remain unresolved.');
      }
      const daily=boolean(one(pd,'DAILY_PRICE'),target+'/dailyPrice');if(daily!==undefined)price.dailyPrice=daily;
      const pb=one(pd,'PRICE_BASE');if(pb)price.priceBase={unit:value(one(pb,'PRICE_UNIT'),target+'/priceBase/unit'),factor:value(one(pb,'PRICE_UNIT_FACTOR'),target+'/priceBase/factor')};
      p.prices.push(price);
    }
  }
  const net=one(u,'UDX.EDXF.PRODUCT_LOGISTIC_DETAILS');p.net.basis=net?'order_unit':'';
  const measures=[['volume','MTQ'],['weight','KGM'],['length','MTR'],['width','MTR'],['depth','MTR'],['diameter','MTR']];
  for(const [key,unit]of measures){const z=one(net,'UDX.EDXF.NET'+key.toUpperCase());p.net[key]={value:value(z,base+'/net/'+key+'/value'),unit:z?unit:''};}
  p.packaging=many(one(u,'UDX.EDXF.PACKING_UNITS'),'UDX.EDXF.PACKING_UNIT').map((z,i)=>{
    const target=base+'/packaging/'+i,pack={supplierProductId:'',gtin:value(one(z,'UDX.EDXF.GTIN'),target+'/gtin'),
      code:value(one(z,'UDX.EDXF.PACKING_UNIT_CODE'),target+'/code'),name:multilingual(many(z,'UDX.EDXF.PACKING_UNIT_NAME'),target+'/name'),
      min:value(one(z,'UDX.EDXF.QUANTITY_MIN'),target+'/min'),max:value(one(z,'UDX.EDXF.QUANTITY_MAX'),target+'/max'),
      parts:value(one(z,'UDX.EDXF.PACKING_PARTS'),target+'/parts')};
    const b=boolean(one(z,'UDX.EDXF.PACKAGE_BREAK'),target+'/breakable');if(b!==undefined)pack.breakable=b;
    for(const [key,unit]of measures){const measure=one(z,'UDX.EDXF.'+key.toUpperCase());pack[key]={value:value(measure,target+'/'+key+'/value'),unit:measure?unit:''};}return pack;
  });
  const delivery=one(d,'DELIVERY_TIME');p.deliveryTime={value:value(delivery,base+'/deliveryTime/value'),basis:delivery?'working_days':''};
  for(const [key,xml]of [['businessMonths','UDX.EDXF.WARRANTY_BUSINESS'],['consumerMonths','UDX.EDXF.WARRANTY_CONSUMER']])
    p.warranty[key]=value(follow(u,'UDX.EDXF.WARRANTY',xml),base+'/warranty/'+key);
  p.assets=many(one(u,'UDX.EDXF.MIME_INFO'),'UDX.EDXF.MIME').map((z,i)=>{
    const target=base+'/assets/'+i,asset={};
    for(const [xml,key]of [['MIME_SOURCE','source'],['MIME_CODE','code'],['MIME_FILENAME','filename'],['MIME_DESIGNATION','designation'],
      ['MIME_ALT','alt'],['MIME_ISSUE_DATE','issuedAt'],['MIME_EXPIRY_DATE','expiresAt'],['MIME_ORDER','order']])
      asset[key]=value(one(z,'UDX.EDXF.'+xml),target+'/'+key);
    asset.language=language(one(z,'UDX.EDXF.MIME_SOURCE'),target+'/language');
    // Original relative MIME_SOURCE remains relative, separate from MIME_ROOT.
    // Transport/file availability and image metadata are not inferred.
    asset.delivery=/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/.test(asset.source)?'':'file';
    if(!asset.delivery)issue(z,'The source asset locator needs an explicit recipient delivery selection; its link purpose and accessibility are not inferred.');
    asset.media={width:'',height:'',ppi:'',colorMode:'',sizeBytes:'',occupiedAreaPercent:'',
      hasWatermark:null,embeddedTextContrast:'',background:'',accessible:null,captionsToggleable:null};return asset;
  });
  p.relations=many(n,'PRODUCT_REFERENCE').map((z,i)=>{
    const target=base+'/relations/'+i,r={type:attr(z,'type',target+'/type'),quantity:attr(z,'quantity',target+'/quantity')};
    for(const [xml,key]of [['PROD_ID_TO','targetSupplierProductId'],['CATALOG_ID','catalogId'],['CATALOG_VERSION','catalogVersion']])
      r[key]=value(one(z,xml),target+'/'+key);
    const descriptions=many(z,'REFERENCE_DESCR');r.description=descriptions.length?multilingual(descriptions,target+'/description'):'';return r;
  });
  const rootFields=receipt.root.attributes.filter(a=>a.namespace!=='http://www.w3.org/2000/xmlns/').map(a=>({path:'/BMECAT/@'+a.qualifiedName,namespace:a.namespace,value:a.value,kind:'attribute'}));
  for(const f of rootFields){ctx.used.add(f.path);ctx.mapped.push({sourcePath:f.path,targetPath:'/bmecat/root/attributes',sourceValue:f.value});}
  const fields=[...rootFields,...xmlFields(receipt.header),...xmlFields(n)],unmapped=fields.filter(f=>!ctx.used.has(f.path));
  const descriptions=p.descriptions[profile.defaultLanguage]??Object.values(p.descriptions)[0];
  return {ordinal:event.ordinal,record:{materialId:p.supplierProductId,title:descriptions?.short||p.supplierProductId,
    description:descriptions?.long||descriptions?.short||p.supplierProductId,partNumber:p.manufacturerProductId,
    manufacturer:p.manufacturerName,unit:p.order.unit,supplier:p,
    bmecat:{schema:BMECAT_PRODUCT_SCHEMA,mode:event.mode,modeOrigin:event.modeOrigin,transaction:clone(receipt.transaction),
      source:{document:{bytes:receipt.bytes,sha256:receipt.sha256},path:n.path,ordinal:event.ordinal},
      root:clone(receipt.root),header:receipt.header,product:n,
      mapping:{sourceFields:fields.length,mappedUniqueSourceFields:ctx.used.size,fieldMappings:ctx.mapped,unmappedSourceFields:unmapped,
        languageInheritance:ctx.inheritance,issues:ctx.issues,
        semanticMappings:[{field:'net',basis:'one original ORDER_UNIT; fixed ETIM SI units',units:Object.fromEntries(measures)},
          {field:'deliveryTime',basis:'working days according to ETIM5.0'}, {field:'asset.delivery',basis:'file transport placeholder from existing supplier template; asset bytes unverified'}]}}}};
}
