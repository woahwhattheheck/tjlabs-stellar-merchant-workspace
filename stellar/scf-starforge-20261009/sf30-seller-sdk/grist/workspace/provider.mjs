// MIT. Host-declared Grist connection references; credentials never enter browser input.
import { fault, object } from '../../postgres/publisher/files.mjs';
import { binding, restOptions, only, identifier, documentId } from '../declaration.mjs';
const KEYS=['label','server','tokenEnv','allowAnonymous','allowHttp','maxPageBytes','maxCaptureBytes','maxRows','timeoutMs','requestIntervalMs'];
export function normalizeConnections(value={}) {
  if(!object(value)||Object.keys(value).length>32)throw fault('GRIST_CONNECTIONS_INVALID');
  return Object.fromEntries(Object.entries(value).map(([alias,input])=>{
    if(!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(alias)||['constructor','prototype','__proto__'].includes(alias))throw fault('GRIST_CONNECTION_ALIAS_INVALID');
    only(input,KEYS,'GRIST_HOST_CONNECTION_INVALID');
    const label=input.label??alias;
    if(typeof label!=='string'||!label.trim()||label.length>128||/[\u0000-\u001f]/.test(label))throw fault('GRIST_CONNECTION_LABEL_INVALID');
    const{label:ignored,server,...options}=input;
    const config={schema:'stellar-forge.grist-source.v1',apiVersion:'unversioned',server,docId:'connection',tableId:'Table1',
      filter:null,sourceOrder:[{field:'id',direction:'asc'}],connection:{kind:'rest',...options},queries:{}};
    const selected=binding(config);restOptions(config);
    return[alias,{label:label.trim(),server:selected.server,...options}];
  }));
}
export function selectConnection(connections,alias) {
  if(typeof alias!=='string'||!Object.hasOwn(connections,alias))throw fault('GRIST_CONNECTION_NOT_DECLARED');
  const{label,server,...options}=connections[alias];return{server,connection:{kind:'rest',...options}};
}
export function connectionViews(connections,environment) {
  return Object.entries(connections).map(([alias,input])=>({alias,label:input.label,server:input.server,
    authorization:input.allowAnonymous?'anonymous':'bearer',
    state:input.allowAnonymous||typeof environment[input.tokenEnv]==='string'&&environment[input.tokenEnv].length?'configured':'missing'}));
}
export function discoveryConfig(connections,input) {
  only(input,['connectionAlias','docId','tableId','filter'],'GRIST_DISCOVERY_INPUT_INVALID');
  const selected=selectConnection(connections,input.connectionAlias);
  const config={schema:'stellar-forge.grist-source.v1',...selected,apiVersion:'unversioned',docId:documentId(input.docId),
    tableId:identifier(input.tableId,'TABLE_ID'),filter:input.filter??null,sourceOrder:[{field:'id',direction:'asc'}],queries:{}};
  binding(config);restOptions(config);return config;
}
