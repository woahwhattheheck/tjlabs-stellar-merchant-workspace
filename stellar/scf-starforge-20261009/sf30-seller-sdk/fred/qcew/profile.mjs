// MIT. Reusable, immutable QCEW county report production profiles.
import { createHash } from 'node:crypto';
import { QCEW_PROFILE, need, plain, clone, canonical, text, areaCode, period } from './model.mjs';
export const BAY_AREA = Object.freeze(['06001','06013','06041','06055','06075','06081','06085','06095','06097']);
export const INDUSTRIES = Object.freeze([
  ['10','All covered industries'],['1011','Natural resources and mining'],['1012','Construction'],
  ['1013','Manufacturing'],['1021','Trade, transportation and utilities'],['1022','Information'],
  ['1023','Financial activities'],['1024','Professional and business services'],
  ['1025','Education and health services'],['1026','Leisure and hospitality'],
  ['1027','Other services'],['1028','Public administration'],['1029','Unclassified']
].map(([code,label]) => Object.freeze({code,label})));
export const definitionHash = value => createHash('sha256').update(canonical(value)).digest('hex');
function oneOf(value, choices, label) { need(choices.includes(value), label + ' is not supported.'); return value; }
function year(value, label) { need(Number.isInteger(value) && value >= 1990 && value <= 2100, label + ' must be a NAICS archive year.'); return value; }
function slug(value, label) { need(typeof value === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(value), label + ' is invalid.'); return value; }
function region(input) {
  need(plain(input), 'Supply each named region and its original area codes.');
  const areas = input.areas?.map(areaCode);
  need(Array.isArray(areas) && areas.length >= 1 && areas.length <= 60 && new Set(areas).size === areas.length,
    'A region must contain distinct original areas.');
  if (areas.length > 1) {
    need(!areas.includes('US000'), 'A national total cannot be added to a component region.');
    for (const state of areas.filter(area => area.endsWith('000')))
      need(!areas.some(area => area !== state && area.startsWith(state.slice(0,2))),
        'A state and its counties overlap in the same region.');
  }
  return { id: slug(input.id, 'Region ID'), label: text(input.label, 'Region label', 120), areas: [...areas].sort() };
}
const supersectors = new Set(INDUSTRIES.filter(entry => entry.code !== '10').map(entry => entry.code));
const sectors = new Set(['11','21','22','23','31-33','42','44-45','48-49','51','52','53','54','55','56','61','62','71','72','81','92','99']);
const detailedPrefixes = new Set([...sectors].flatMap(code => code.includes('-') ?
  Array.from({length:Number(code.slice(3))-Number(code.slice(0,2))+1},(_,index)=>String(Number(code.slice(0,2))+index)) : [code]));
function industry(input) {
  need(plain(input) && typeof input.code === 'string', 'Supply the original industry code.');
  const kind = input.kind ?? (input.code === '10' ? 'total' : supersectors.has(input.code) ? 'supersector' :
    sectors.has(input.code) ? 'sector' : 'industry');
  oneOf(kind, ['total','supersector','sector','industry'], 'Industry aggregation');
  need(kind === 'total' ? input.code === '10' : kind === 'supersector' ? supersectors.has(input.code) :
    kind === 'sector' ? sectors.has(input.code) : /^[0-9]{3,6}$/.test(input.code) && detailedPrefixes.has(input.code.slice(0,2)),
    'Use BLS total10, an original supersector, a complete NAICS sector code, or an explicit three- to six-digit NAICS industry. The code must match its aggregation kind.');
  const ownerships = input.ownerships ?? (kind === 'total' ? ['0'] : ['1','2','3','5']);
  need(Array.isArray(ownerships) && ownerships.length >= 1 && ownerships.every(value => ['0','1','2','3','5','8','9'].includes(value)) &&
    new Set(ownerships).size === ownerships.length, 'Choose distinct original ownership codes.');
  if (ownerships.includes('0') || ownerships.includes('9')) need(ownerships.length === 1, 'A total ownership cannot be summed with its components.');
  if (ownerships.includes('8')) need(!ownerships.some(value => ['1','2','3'].includes(value)), 'Government total and government components overlap.');
  return { code: input.code, label: text(input.label, 'Industry label', 140), kind, ownerships: [...ownerships].sort() };
}
export function normalizeQcewProfile(input) {
  need(plain(input), 'Supply the county report production profile.');
  const regions = input.regions?.map(region), industries = (input.industries ?? INDUSTRIES).map(industry);
  need(Array.isArray(regions) && regions.length >= 2 && regions.length <= 4 && new Set(regions.map(item => item.id)).size === regions.length,
    'Choose one focus region and one to three comparators.');
  const focus = input.focus ?? regions[0].id;
  need(regions.some(item => item.id === focus), 'The focus region must be configured.');
  need(industries.length >= 2 && industries.length <= 13 && new Set(industries.map(item => item.code)).size === industries.length &&
    industries.filter(item => item.kind === 'total').length === 1, 'Choose one total and at most twelve distinct industry rows.');
  const history = input.history ?? {}, price = input.price ?? {}, publisher = input.publisher ?? {};
  const base = price.base ?? { policy: 'report_period' };
  oneOf(base.policy, ['report_period','fixed'], 'Constant-dollar base policy');
  const historyStart = year(history.startYear ?? 1990, 'First history year');
  const tableYears = [...new Set((history.tableYears ?? [1990,2001,2004,2007,2019]).map(value => year(value, 'Historical table year')))].sort((a,b)=>a-b);
  need(tableYears.length <= 12 && tableYears.every(value => value >= historyStart), 'Historical table years must lie in the configured history.');
  const chartCodes = history.chartIndustries ?? 'highest_current_wage';
  need(chartCodes === 'highest_current_wage' || Array.isArray(chartCodes) && chartCodes.length <= 5 &&
    new Set(chartCodes).size === chartCodes.length && chartCodes.every(code => industries.some(item => item.code === code && item.kind !== 'total')),
    'Choose up to five retained industries or the five highest current wages.');
  const sponsor = publisher.sponsor === undefined || publisher.sponsor === null ? null : {
    name: text(publisher.sponsor.name, 'Sponsor name', 160),
    line: text(publisher.sponsor.line ?? 'Prepared with support from', 'Sponsor treatment', 240),
    ...(publisher.sponsor.url ? { url: publicUrl(publisher.sponsor.url) } : {})
  };
  const definition = {
    name: text(input.name, 'Profile name', 160), title: text(input.title ?? 'County wage report', 'Report family title', 200),
    regions, focus, industries,
    employment: oneOf(input.employment ?? 'quarter_mean', ['quarter_mean','month3'], 'Employment display convention'),
    wageMethod: oneOf(input.wageMethod ?? 'from_totals', ['from_totals','published_weighted'], 'Average weekly wage convention'),
    coverage: oneOf(input.coverage ?? 'complete', ['complete','disclosed_components'], 'Regional disclosure convention'),
    baseline: { year: year(input.baseline?.year ?? 2019, 'Comparison baseline'), quarter: oneOf(input.baseline?.quarter ?? 'same_quarter', ['same_quarter',1,2,3,4], 'Comparison quarter') },
    history: { startYear: historyStart, tableYears, sameQuarterOnly: true, chartIndustries: clone(chartCodes) },
    price: {
      dollars: oneOf(price.dollars ?? 'constant', ['constant','nominal'], 'Dollar convention'),
      seriesId: text(price.seriesId ?? 'CPIAUCSL', 'Price index series', 50),
      quarterly: oneOf(price.quarterly ?? 'quarter_end', ['quarter_end','quarter_mean'], 'Quarterly price index convention'),
      base: base.policy === 'fixed' ? { policy:'fixed', period:period(base.period) } : { policy:'report_period' }
    },
    publisher: { name: text(publisher.name ?? 'TJLabs report production', 'Publisher name', 160),
      contact: publisher.contact ? text(publisher.contact, 'Publisher contact', 240) : '',
      methodologyOwner: text(publisher.methodologyOwner ?? 'Report operator', 'Methodology owner', 160), sponsor },
    decimals: { employment: 0, wage: 1, ratio: 2, percent: 1 },
    operatorNotes: typeof input.operatorNotes === 'string' ? input.operatorNotes.trim().slice(0,4000) : ''
  };
  need(/^[A-Za-z0-9_]{1,50}$/.test(definition.price.seriesId), 'Use an exact FRED price-index series ID.');
  return definition;
}
function publicUrl(value) {
  const parsed = new URL(value);
  need(parsed.protocol === 'https:' && !parsed.username && !parsed.password && value.length <= 1000, 'Use a public HTTPS sponsor URL.');
  return parsed.href;
}
export function createQcewProfile(input) {
  const definition = normalizeQcewProfile(input);
  return { schema: QCEW_PROFILE, id: definitionHash({schema:QCEW_PROFILE,definition}), definition };
}
export function validateQcewProfile(profile) {
  need(profile?.schema === QCEW_PROFILE && typeof profile.id === 'string', 'The retained report profile is invalid.');
  const normalized = createQcewProfile(profile.definition);
  need(normalized.id === profile.id && canonical(normalized.definition) === canonical(profile.definition),
    'The retained report profile changed.');
  return clone(profile);
}
export function profilePeriods(profile, reportPeriod) {
  const definition = validateQcewProfile(profile).definition, current = period(reportPeriod);
  need(current.year >= definition.history.startYear && definition.baseline.year <= current.year, 'The report period precedes its configured history or baseline.');
  const baseline = {year:definition.baseline.year,quarter:definition.baseline.quarter === 'same_quarter' ? current.quarter : definition.baseline.quarter};
  need(baseline.year * 4 + baseline.quarter <= current.year * 4 + current.quarter, 'The comparison baseline follows the report period.');
  const history = Array.from({length:current.year-definition.history.startYear+1}, (_,i)=>({year:definition.history.startYear+i,quarter:current.quarter}));
  const table = [...new Set([...definition.history.tableYears.filter(value=>value<=current.year),current.year])].sort((a,b)=>a-b).map(year=>({year,quarter:current.quarter}));
  const priceBase = definition.price.base.policy === 'fixed' ? definition.price.base.period : current;
  return { current, baseline, history, table, priceBase };
}
export function qcewAggregation(area, entry, ownership) {
  areaCode(area);
  const level = area === 'US000' ? 10 : area.endsWith('000') ? 50 : 70;
  if(entry.kind === 'total') {
    if(ownership === '0')return String(level);
    if(ownership === '8' && area === 'US000')return '95';
    if(ownership === '8' && level === 50)return '96';
    if(ownership === '9' && area === 'US000')return '94';
    need(['1','2','3','5'].includes(ownership), 'Resolve the requested ownership into its original source components.');
    return String(level + 1);
  }
  need(['1','2','3','5'].includes(ownership), 'Resolve a non-total ownership aggregate into disjoint original components.');
  const offset = entry.kind === 'supersector' ? 3 : entry.kind === 'sector' ? 4 :
    entry.kind === 'industry' && /^[0-9]{3,6}$/.test(entry.code) ? entry.code.length + 2 : null;
  need(offset !== null, 'The original industry aggregation is invalid.');
  return String(level + offset);
}
export function qcewSourceComponents(area, entry) {
  areaCode(area);
  const result=[];
  for(const requested of entry.ownerships) {
    let ownerships=[requested],availableFromYear=1990;
    if(requested === '0' && entry.kind !== 'total') {
      ownerships=['1','2','3','5'];availableFromYear=1995;
    } else if(requested === '8' && !(entry.kind === 'total' && (area === 'US000' || area.endsWith('000')))) {
      ownerships=['1','2','3'];
    } else if(requested === '9' && !(entry.kind === 'total' && area === 'US000')) {
      ownerships=['2','3','5'];availableFromYear=1995;
    }
    for(const ownership of ownerships) result.push({
      ownership,aggregation:qcewAggregation(area,entry,ownership),availableFromYear
    });
  }
  // International-government ownership4 has no published NAICS records in
  // 1990–1994 and joins private5 from1995. A reconstructed all/UI aggregate
  // cannot omit it and assert complete historical coverage.
  need(new Set(result.map(item=>item.ownership+'|'+item.aggregation)).size===result.length,
    'The requested original ownership components overlap.');
  return result;
}
export function defaultSanFranciscoProfile() {
  return createQcewProfile({
    name:'San Francisco county wages', title:'County wage report',
    focus:'san_francisco', regions:[
      {id:'san_francisco',label:'San Francisco County',areas:['06075']},
      {id:'bay_area',label:'Nine-county Bay Area',areas:BAY_AREA},
      {id:'california',label:'California',areas:['06000']},
      {id:'united_states',label:'United States',areas:['US000']}
    ],
    baseline:{year:2019,quarter:'same_quarter'},
    price:{dollars:'constant',seriesId:'CPIAUCSL',quarterly:'quarter_end',base:{policy:'report_period'}},
    operatorNotes:'The source report’s comparator and baseline labels are retained as explicit production settings. This profile uses same-quarter 2019 comparison, the named nine-county Bay Area, original quarterly mean employment and exact BLS wage totals. CPI is the retained seasonally adjusted monthly CPIAUCSL, sampled at quarter end; missing original observations remain unavailable.'
  });
}
