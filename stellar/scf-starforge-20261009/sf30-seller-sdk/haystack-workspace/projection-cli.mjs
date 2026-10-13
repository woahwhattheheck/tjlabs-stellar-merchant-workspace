import {resolve} from "node:path";
// MIT. Projection convenience commands use the original CLI target, request and receipt journal.
export const projectionHelp = `
Native Haystack projection
  projections          [--page --offset N --limit N]
  projection           --projection-id UUID [--version-id SHA]
  projection-preview   --file COMPLETE_PROFILE_ARGS.json
  projection-create    --file COMPLETE_CREATE_ARGS.json
  projection-save      --file COMPLETE_SAVE_ARGS.json
  projection-review    --projection-id UUID --head-id SHA --decision ready|changes
                       --author TEXT --note TEXT|--note-file FILE
  projection-publish   --projection-id UUID --head-id SHA --author TEXT
                       --note TEXT|--note-file FILE [--no-select]
  projection-compare   --projection-id UUID --before SHA --after SHA
                       [--page --offset N --limit N]
  projection-grid      --projection-id UUID [--version-id SHA] [--out FILE]
  projection-lineage   --projection-id UUID [--version-id SHA] --format json|csv
                       [--out FILE]
  projection-report    --projection-id UUID [--version-id SHA] --format json|html
                       [--out FILE]
  projection-return-preview --projection-id UUID [--version-id SHA] --file GRID.json
                            --bindings ARRAY.json [--consumer-reference TEXT]
  projection-return-apply --projection-id UUID --head-id SHA --file GRID.json
                          --bindings ARRAY.json --decisions ARRAY.json --return-sha SHA
                          --consumer-reference TEXT --author TEXT --note TEXT|--note-file FILE

Each profile explicitly selects semantic model entities, source columns and typed
conversions. Publish imports a reviewed saved version into this same workspace's
original native source ledger. It makes no station connection. The original
request/replay path and --expected-revision apply to every mutation.
`;
export function projectionCommandOptions(mutationFlags,pageFlags){
 return {
  "projection-return-preview":["projection-id","version-id","file","bindings","consumer-reference"],
  "projection-return-apply":[...mutationFlags,"projection-id","head-id","file","bindings","decisions","return-sha","consumer-reference","author","note","note-file"],
  projections:pageFlags,projection:["projection-id","version-id"],
  "projection-preview":["file"],"projection-create":[...mutationFlags,"file"],
  "projection-save":[...mutationFlags,"file"],
  "projection-review":[...mutationFlags,"projection-id","head-id","decision","author","note","note-file"],
  "projection-publish":[...mutationFlags,"projection-id","head-id","author","note","note-file","no-select"],
  "projection-compare":[...pageFlags,"projection-id","before","after"],
  "projection-grid":[...mutationFlags,"projection-id","version-id"],
  "projection-lineage":[...mutationFlags,"projection-id","version-id","format"],
  "projection-report":[...mutationFlags,"projection-id","version-id","format"]
 };
}
export async function runProjectionCommand(command,flags,target,h){
 const {required,one,clean,optionalNote,semanticInput,revisionArgs,allPages,output,performMutation,deliveryToFile,readJson,plainRead}=h;
 if(command==="projections")return output(await allPages(target,"projection.list",await revisionArgs(target,flags),flags),flags);
 if(command==="projection")return output(await target.request("projection.read",await revisionArgs(target,flags,clean({
  projectionId:required(flags,"projection-id"),versionId:one(flags,"version-id")}))),flags);
 if(command==="projection-preview")return output(await target.request("projection.preview",
  await revisionArgs(target,flags,await semanticInput(required(flags,"file")))),flags);
 async function incoming(){const path=resolve(required(flags,"file")),raw=await plainRead(path,32*1024*1024);return{
  projectionId:required(flags,"projection-id"),name:path.split(/[\\/]/).pop(),base64:raw.toString("base64"),
  bindings:await readJson(required(flags,"bindings")),consumerReference:one(flags,"consumer-reference","")};}
 if(command==="projection-return-preview")return output(await target.request("projection.return.preview",await revisionArgs(target,flags,{
  ...await incoming(),...clean({versionId:one(flags,"version-id")})})),flags);
 if(command==="projection-compare")return output(await allPages(target,"projection.compare",await revisionArgs(target,flags,{
  projectionId:required(flags,"projection-id"),beforeVersionId:required(flags,"before"),afterVersionId:required(flags,"after")}),flags),flags);
 let action,fields;
 if(command==="projection-return-apply"){
  action="projection.return.apply";fields={...await incoming(),expectedHeadId:required(flags,"head-id"),expectedReturnSha256:required(flags,"return-sha"),
   decisions:await readJson(required(flags,"decisions")),consumerReference:required(flags,"consumer-reference"),author:required(flags,"author"),note:await optionalNote(flags)};
 }else if(command==="projection-create"||command==="projection-save"){
  action=command==="projection-create"?"projection.create":"projection.save";
  fields=await semanticInput(required(flags,"file"));
 }else if(command==="projection-review"||command==="projection-publish"){
  action=command==="projection-review"?"projection.review":"projection.publish";
  fields={projectionId:required(flags,"projection-id"),expectedHeadId:required(flags,"head-id"),
   author:required(flags,"author"),note:await optionalNote(flags)};
  if(command==="projection-review")fields.decision=required(flags,"decision");else fields.select=!flags["no-select"];
 }else{
  const kind={"projection-grid":"projection-grid","projection-lineage":"projection-lineage","projection-report":"projection-report"}[command];
  if(!kind)throw new Error("Choose a declared projection command.");
  const format=kind==="projection-grid"?"json":one(flags,"format","json");
  if(!(kind==="projection-lineage"?["json","csv"]:kind==="projection-report"?["json","html"]:["json"]).includes(format))
   throw new Error("Choose a supported format for this complete projection delivery.");
  action="delivery.prepare";fields=clean({kind,projectionId:required(flags,"projection-id"),versionId:one(flags,"version-id"),format});
 }
 const result=await performMutation(target,action,fields,flags);
 return action==="delivery.prepare"?deliveryToFile(target,result,flags):output(result,flags);
}
