// MIT. Host-owned credential references; all SeaTable reads use the original provider.
import { fault, object } from '../../postgres/publisher/files.mjs';
import { binding, restOptions, only, identifier } from '../declaration.mjs';

const KEYS = ['label','server','tokenEnv','tokenKind','allowHttp','pageSize','maxPageBytes',
  'maxCaptureBytes','maxPages','maxRows','timeoutMs','requestIntervalMs'];
const PROBE_BASE = '00000000-0000-4000-8000-000000000001';
export function normalizeConnections(value = {}) {
  if (!object(value) || Object.keys(value).length > 32) throw fault('SEATABLE_CONNECTIONS_INVALID');
  return Object.fromEntries(Object.entries(value).map(([alias, input]) => {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(alias) || ['constructor','prototype','__proto__'].includes(alias))
      throw fault('SEATABLE_CONNECTION_ALIAS_INVALID');
    only(input, KEYS, 'SEATABLE_HOST_CONNECTION_INVALID');
    const label = input.label ?? alias;
    if (typeof label !== 'string' || !label.trim() || label.length > 128 || /[\u0000-\u001f]/.test(label))
      throw fault('SEATABLE_CONNECTION_LABEL_INVALID');
    const { label: ignored, server, ...options } = input;
    const config = { schema:'stellar-forge.seatable-source.v1', apiVersion:'v2', server,
      baseId:PROBE_BASE, tableId:'connection', viewId:null, where:null,
      sourceOrder:[{field:'_id',direction:'asc'}], connection:{kind:'rest',...options}, queries:{} };
    const selected = binding(config);
    restOptions(config);
    return [alias, {label:label.trim(),server:selected.server,...options}];
  }));
}
export function selectConnection(connections, alias) {
  if (typeof alias !== 'string' || !Object.hasOwn(connections, alias))
    throw fault('SEATABLE_CONNECTION_NOT_DECLARED', 'Choose a read connection declared by this host.');
  const {label,server,...options} = connections[alias];
  return {server,connection:{kind:'rest',...options}};
}
export function connectionViews(connections, environment) {
  return Object.entries(connections).map(([alias,input]) => ({
    alias,label:input.label,server:input.server,tokenKind:input.tokenKind ?? 'api',
    state:typeof environment[input.tokenEnv] === 'string' && environment[input.tokenEnv].length ? 'configured' : 'missing',
  }));
}
export function discoveryConfig(connections, input) {
  only(input,['connectionAlias','baseId','tableId','viewId','where'],'SEATABLE_DISCOVERY_INPUT_INVALID');
  const selected = selectConnection(connections,input.connectionAlias);
  const viewId = input.viewId || null;
  const config = {schema:'stellar-forge.seatable-source.v1',...selected,apiVersion:'v2',
    baseId:input.baseId,tableId:identifier(input.tableId,'TABLE_ID'),viewId,
    where:input.where ?? null,sourceOrder:viewId ? [] : [{field:'_id',direction:'asc'}],queries:{}};
  // The original binding rejects a filter/order on native views and validates
  // the declarative SQL filter, source IDs, origin and bounded read options.
  binding(config); restOptions(config);
  return config;
}
