import fs from "node:fs/promises";
import path from "node:path";
import {createArchiveCodec} from "../vendor/archive-codec.mjs";
import {createFieldFilingCore} from "../field-filing-core.mjs";
import {runFieldFilingCourse} from "../field-filing-course.mjs";
const out=process.argv[2];if(!out)throw Error("Usage: node receiving/run-source-course.mjs NEW_DIRECTORY");
const result=await runFieldFilingCourse(createFieldFilingCore({codec:createArchiveCodec()}));await fs.mkdir(out);await fs.writeFile(path.join(out,"source-result.json"),JSON.stringify(result,null,2)+"\n",{flag:"wx"});console.log(out);
