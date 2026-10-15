import {readFile,writeFile} from "node:fs/promises";
import {buildFleet} from "./src/build-fleet.mjs";
const paths=["src/fleet.template.html","src/fleet.css","src/archive-codec.mjs","src/fleet-core.mjs","src/fleet-storage.mjs","src/fleet-app.js","data/authored-example.json"];
const files=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await readFile(new URL(p,import.meta.url),"utf8")])));
const html=buildFleet(files);await writeFile(new URL("fleet-desk.html",import.meta.url),html);console.log(JSON.stringify({file:"fleet-desk.html",bytes:Buffer.byteLength(html)}));
