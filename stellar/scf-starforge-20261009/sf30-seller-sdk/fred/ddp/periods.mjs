// MIT. Explicit observation-period alignment and exact decimal scaling.
import { date,need } from '../model.mjs';
export function fredDdpFrequencyKind(value){
  const text=String(value??'').trim().toLocaleLowerCase('en-US');
  if(['sa','semiannual','semi-annual','semiannually','half-yearly'].includes(text)||/semi.?annual|half.?year/.test(text))return 'SA';
  if(['bw','biweekly'].includes(text)||/bi.?week/.test(text))return 'BW';
  if(['d','daily','business daily','business day'].includes(text)||/^daily\b/.test(text))return 'D';
  if(['w','weekly'].includes(text)||/^weekly\b/.test(text))return 'W';
  if(['m','monthly'].includes(text)||/^monthly\b/.test(text))return 'M';
  if(['q','quarterly'].includes(text)||/^quarterly\b/.test(text))return 'Q';
  if(['a','annual','annually','yearly'].includes(text)||/^annual\b/.test(text))return 'A';
  return null;
}
const pad=number=>String(number).padStart(2,'0');
const lastDay=(year,month)=>new Date(Date.UTC(year,month,0)).getUTCDate();
function span(year,month,months=1){
  need(Number.isSafeInteger(year)&&year>=1776&&year<=9999&&Number.isSafeInteger(month)&&month>=1&&month<=12,'Unsupported original observation period.');
  const final=month+months-1;need(final<=12,'Invalid original calendar period.');
  return {start:date(String(year).padStart(4,'0')+'-'+pad(month)+'-01'),end:date(String(year).padStart(4,'0')+'-'+pad(final)+'-'+pad(lastDay(year,final)))};
}
export function readFredDdpPeriod(value){
  need(typeof value==='string','Retain the original observation period.');
  let match;
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)){const actual=date(value);return {start:actual,end:actual};}
  if((match=/^(\d{4})-(\d{2})$/.exec(value)))return span(Number(match[1]),Number(match[2]));
  if((match=/^(\d{4})-?[Qq]([1-4])$/.exec(value)))return span(Number(match[1]),(Number(match[2])-1)*3+1,3);
  if((match=/^(\d{4})-?[HhSs]([12])$/.exec(value)))return span(Number(match[1]),(Number(match[2])-1)*6+1,6);
  if((match=/^(\d{4})$/.exec(value)))return span(Number(match[1]),1,12);
  need(false,'This original observation period needs its explicit supported calendar representation.');
}
export const FRED_DDP_PERIOD_RULES=Object.freeze(['exact','month','quarter','semiannual','year']);
export function normalizeFredDdpPeriod(value,rule='exact'){
  need(FRED_DDP_PERIOD_RULES.includes(rule),'Choose a supported explicit original period rule.');
  const original=readFredDdpPeriod(value),year=Number(original.start.slice(0,4)),month=Number(original.start.slice(5,7));
  const period=rule==='month'?span(year,month):rule==='quarter'?span(year,Math.floor((month-1)/3)*3+1,3):
    rule==='semiannual'?span(year,month<=6?1:7,6):rule==='year'?span(year,1,12):original;
  return {period:value,key:period.start,start:period.start,end:period.end,originalStart:original.start,originalEnd:original.end};
}
export function inferredFredDdpPeriodRule(frequency){
  const kind=fredDdpFrequencyKind(frequency?.label)||fredDdpFrequencyKind(frequency?.code);
  return {M:'month',Q:'quarter',SA:'semiannual',A:'year'}[kind]||'exact';
}
function decimal(value){
  if(typeof value!=='string'||value.length>2048)return null;
  const match=/^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,4}))?$/.exec(value);if(!match)return null;
  const exponent=Number(match[4]||0),fraction=match[3]||'';if(Math.abs(exponent)>1000||fraction.length>1000)return null;
  let integer=BigInt((match[1]==='-'?'-':'')+match[2]+fraction),scale=fraction.length-exponent;
  if(scale<0){integer*=10n**BigInt(-scale);scale=0;}return {integer,scale};
}
function formatted({integer,scale}){
  if(integer===0n)return '0';const negative=integer<0n,digits=(negative?-integer:integer).toString().padStart(scale+1,'0');
  let result=scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits;
  if(result.includes('.'))result=result.replace(/0+$/,'').replace(/\.$/,'');
  return (negative?'-':'')+result;
}
export function normalizeFredDdpScale(value='1'){
  const result=decimal(value);need(result&&result.integer>0n&&value.length<=128,'Choose a positive exact decimal conversion factor.');
  return formatted(result);
}
export function exactFredDdpScaledValue(value,scale='1'){
  const number=decimal(value),factor=decimal(scale);if(!number||!factor)return null;
  return formatted({integer:number.integer*factor.integer,scale:number.scale+factor.scale});
}
export function fredDdpObservationMissing(value){return decimal(value)===null;}
