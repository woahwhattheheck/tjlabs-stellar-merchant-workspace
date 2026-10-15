import {readFile} from "node:fs/promises";
import * as codec from "../operator/codec.mjs";
import {createCostingAPI} from "../costing/core.mjs";
import {createSessionAPI} from "../operator/session.mjs";
import {runOperatorCourse} from "../operator/receive-course.mjs";
const api=createCostingAPI({encode:codec.utf8Encode,decode:codec.utf8Decode,sha256:x=>codec.sha256Bytes(typeof x==="string"?codec.utf8Encode(x):x),toBase64:codec.toBase64,fromBase64:codec.fromBase64});
const text=await readFile(new URL("../examples/authored-workspace.json",import.meta.url),"utf8");
const result=runOperatorCourse(api,createSessionAPI,codec,text);
delete result.working;result.runtime="Native Node.js production APIs; authored source only";console.log(JSON.stringify(result,null,2));
