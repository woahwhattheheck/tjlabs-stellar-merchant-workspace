import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import crypto from "node:crypto";
import {buildOrkyoDesk} from "./build.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),out=process.argv[2];
if(!out)throw Error("Usage: node desk/build-cli.mjs NEW_OUTPUT.html");
const names=["vendor/archive_codec.mjs","vendor/UZIP.js","adapter/orkyo-import.js","adapter/workbook-native-reader.mjs","adapter/workbook-planner.js","vendor/orkyo-foundation/frontend/src/lib/utils/spreadsheet-import.ts","desk/readiness-core.js","desk/copy-store.js","desk/xlsx-reader.js","desk/operator.js","desk/template.html","desk/style.css","examples/authored-desk-workspace.json"],files=Object.fromEntries(await Promise.all(names.map(async p=>[p,await fs.readFile(path.join(root,p),"utf8")])));
const html=buildOrkyoDesk(files);await fs.writeFile(out,html,{flag:"wx"});console.log(JSON.stringify({output:path.resolve(out),bytes:Buffer.byteLength(html),sha256:crypto.createHash("sha256").update(html).digest("hex")}));
