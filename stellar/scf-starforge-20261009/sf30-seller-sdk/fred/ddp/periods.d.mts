export type FredDdpPeriodRule='exact'|'month'|'quarter'|'semiannual'|'year';
export const FRED_DDP_PERIOD_RULES:readonly FredDdpPeriodRule[];
export function fredDdpFrequencyKind(value:unknown):'D'|'W'|'BW'|'M'|'Q'|'SA'|'A'|null;
export function readFredDdpPeriod(value:string):{start:string;end:string};
export function normalizeFredDdpPeriod(value:string,rule?:FredDdpPeriodRule):{
  period:string;key:string;start:string;end:string;originalStart:string;originalEnd:string;
};
export function inferredFredDdpPeriodRule(value:{code?:string|null;label?:string|null}):FredDdpPeriodRule;
export function normalizeFredDdpScale(value?:string):string;
export function exactFredDdpScaledValue(value:string,scale?:string):string|null;
export function fredDdpObservationMissing(value:unknown):boolean;
