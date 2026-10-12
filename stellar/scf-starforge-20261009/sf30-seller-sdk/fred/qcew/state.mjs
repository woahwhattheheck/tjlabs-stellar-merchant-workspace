// MIT. QCEW inventories belong to the original FRED project and its transaction journal.
import { need, plain, clone, canonical, period } from './model.mjs';
import { validateQcewProfile } from './profile.mjs';
export const QCEW_STATE='stellar-forge.fred-qcew-project.v1';
export const QCEW_EXTENSION='stellar-forge.fred-qcew-extension.v1';
const hash=/^[a-f0-9]{64}$/;
function inventory(values,label) {
  need(Array.isArray(values)&&values.length<=1000&&new Set(values.map(item=>item?.id)).size===values.length,
    'The retained QCEW '+label+' inventory is invalid.');
}
export function validateQcewState(state) {
  if(state.qcew===undefined)return null;
  const value=state.qcew;
  need(plain(value)&&value.schema===QCEW_STATE,'The retained QCEW project extension is invalid.');
  inventory(value.captures,'source');inventory(value.profiles,'profile');inventory(value.editions,'edition');
  for(const source of value.captures) need(hash.test(source.id)&&source.captureSha256===source.id&&plain(source.summary),
    'The retained original QCEW source pointer changed.');
  for(const profile of value.profiles) validateQcewProfile(profile);
  const earlier=new Set();
  for(const edition of value.editions) {
    need(hash.test(edition.id)&&hash.test(edition.reportId)&&hash.test(edition.manifestSha256)&&
      value.captures.some(item=>item.id===edition.captureSha256)&&value.profiles.some(item=>item.id===edition.profileId)&&
      state.captures.some(item=>item.id===edition.cpiCaptureSha256),
      'A QCEW edition lost its original source or saved profile.');
    period(edition.period);
    need(['["html"]','["html","pdf"]'].includes(JSON.stringify(edition.formats)), 'The saved edition output formats are invalid.');
    need(edition.previousEditionId===null||earlier.has(edition.previousEditionId),'The QCEW successor refers to an absent or later edition.');
    need(typeof edition.createdAt==='string'&&Number.isFinite(Date.parse(edition.createdAt)),'The edition creation time is invalid.');
    earlier.add(edition.id);
  }
  for(const [field,items] of [['selectedCapture',value.captures],['selectedProfile',value.profiles],['selectedEdition',value.editions]])
    need(value[field]===null||items.some(item=>item.id===value[field]),'The selected QCEW '+field+' is not retained.');
  return value;
}
export function qcewStatePresent(state) {
  const value=validateQcewState(state);
  return Boolean(value&&(value.captures.length||value.profiles.length||value.editions.length));
}
export function mutableQcewState(state) {
  if(state.qcew===undefined) state.qcew={schema:QCEW_STATE,captures:[],profiles:[],editions:[],
    selectedCapture:null,selectedProfile:null,selectedEdition:null};
  validateQcewState(state);
  return state.qcew;
}
export function qcewProjectSummary(state) {
  const value=validateQcewState(state);
  return value?clone(value):{schema:QCEW_STATE,captures:[],profiles:[],editions:[],selectedCapture:null,selectedProfile:null,selectedEdition:null};
}
