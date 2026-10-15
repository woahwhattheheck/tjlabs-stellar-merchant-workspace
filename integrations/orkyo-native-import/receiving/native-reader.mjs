function createOrkyoNativeImportReader(originals){
 const util=originals["frontend/src/lib/utils/import-export.ts"];
 const handlers=originals["frontend/src/lib/utils/export-handlers.ts"];
 if(typeof util!=="string"||typeof handlers!=="string")throw Error("Both complete original TypeScript files required");
 const exact=(text,old,next)=>{if(text.split(old).length!==2)throw Error("Pinned source signature changed: "+old);return text.replace(old,next)};
 let csv=util.slice(util.indexOf("export function csvToArray"),util.indexOf("/**\n * Trigger browser download"));
 csv=exact(csv,"export function csvToArray<T = Record<string, string>>(\n  csv: string,\n  headers?: string[]\n): T[]","function csvToArray(csv, headers)");
 csv=exact(csv,"const obj: Record<string, string> = {};","const obj = {};");
 csv=exact(csv,"return obj as T;","return obj;");
 csv=exact(csv,"function parseCSV(csv: string): string[][]","function parseCSV(csv)");
 csv=exact(csv,"const records: string[][] = [];","const records = [];");
 csv=exact(csv,"let record: string[] = [];","let record = [];");
 let req=handlers.slice(handlers.indexOf("export async function importRequests"),handlers.indexOf("// ============================================================================\n// CONFLICTS EXPORT"));
 req=exact(req,"export async function importRequests(file: File, format: ImportFormat): Promise<CreateRequestRequest[]>","async function importRequests(file, format)");
 let resource=handlers.slice(handlers.indexOf("export async function importResources"),handlers.indexOf("// ============================================================================\n// REQUESTS EXPORT/IMPORT"));
 resource=exact(resource,"export async function importResources(\n  file: File,\n  format: ImportFormat,\n  typeKey: string,\n  customFieldTypes: Record<string, CustomFieldDataType> = {},\n): Promise<ResourceImportRow[]>","async function importResources(file, format, typeKey, customFieldTypes={})");
 resource=exact(resource,"const rows: Record<string, unknown>[] =","const rows =");
 resource=exact(resource,"const cell = (value: unknown): string =>","const cell = (value) =>");
 resource=exact(resource,"const customFields: Record<string, CustomFieldValue> = {};","const customFields = {};");
 resource=exact(resource,"const request: CreateResourceRequest = {","const request = {");
 resource=exact(resource,"cell(row.geometry_type) as GeometryType","cell(row.geometry_type)");
 resource=exact(resource,"JSON.parse(cell(row.properties)) as Record<string, unknown>","JSON.parse(cell(row.properties))");
 let coerce=handlers.slice(handlers.indexOf("function coerceToDeclaredType"),handlers.indexOf("/** A parsed import row"));
 coerce=exact(coerce,"function coerceToDeclaredType(value: string, dataType: CustomFieldDataType | undefined): CustomFieldValue","function coerceToDeclaredType(value, dataType)");
 const constants="const NEUTRALISED = /^'[=+\\-@\\t\\r]/;\nconst REQUEST_STATUSES=['new','in_progress','done','cancelled','deferred'];\nconst DURATION_UNITS=['years','months','weeks','days','hours','minutes'];\n";
 const executable=constants+csv+"\n"+coerce+"\n"+resource+"\n"+req+"\nreturn {csvToArray,importResources,importRequests};";
 return {api:Function(executable)(),executable,transformation:"Pinned function extraction and explicit TypeScript type erasure; full originals retained. No native payload statement is rewritten."};
}

export {createOrkyoNativeImportReader};
