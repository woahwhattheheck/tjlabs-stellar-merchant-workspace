export function createOrkyoWorkbookNativeReader(original){
 const changes=[
 [/^import type .*;\n/gm,"",2],[/^export type SheetCell = .*;\n/gm,"",1],[/^export interface \w+ \{[\s\S]*?^\}\n/gm,"",5],
 ["function text(cell: SheetCell): string","function text(cell)",1],["function number(cell: SheetCell): number | null","function number(cell)",1],
 ["export function cellToIsoDate(cell: SheetCell): string | null","function cellToIsoDate(cell)",1],["function isBlank(cells: SheetCell[]): boolean","function isBlank(cells)",1],
 ["export function parseTemplateWorkbook(sheets: SheetData[]): ParsedWorkbook","function parseTemplateWorkbook(sheets)",1],["const errors: ImportRowError[] = [];","const errors = [];",1],
 ["const workstations: WorkstationRow[] = [];","const workstations = [];",1],["const jobs: JobRow[] = [];","const jobs = [];",1],["new Set<string>()","new Set()",1],
 ["export function workstationToCreateSpace(\n  row: WorkstationRow,\n  siteId: string,\n  resourceTypeKey: string,\n): CreateResourceRequest","function workstationToCreateSpace(row, siteId, resourceTypeKey)",1],
 ["function weekdayCount(startIso: string, endIso: string): number","function weekdayCount(startIso, endIso)",1],
 ["export function jobToCreateRequest(\n  job: JobRow,\n  codeToResourceId: Map<string, string>,\n  siteId: string,\n): CreateRequestRequest","function jobToCreateRequest(job, codeToResourceId, siteId)",1]];
 let code=original;for(const [a,b,n]of changes){const count=typeof a==="string"?code.split(a).length-1:[...code.matchAll(a)].length;if(count!==n)throw Error("Native source signature changed: "+String(a));code=code.replace(a,b);}
 return Function(code+"\nreturn {parseTemplateWorkbook,workstationToCreateSpace,jobToCreateRequest,cellToIsoDate,weekdayCount};")();
}
