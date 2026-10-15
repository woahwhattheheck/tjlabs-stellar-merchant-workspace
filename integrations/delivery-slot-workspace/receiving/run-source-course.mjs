import fs from "node:fs/promises";
import {createArchiveCodec} from "../vendor/archive-codec.mjs";
import {createDeliverySlotCore} from "../delivery-slot-core.mjs";
import {receiveDeliverySlotSource} from "./source-course.mjs";
const codec=createArchiveCodec(),core=createDeliverySlotCore({codec}),result=receiveDeliverySlotSource({core,codec});
if(process.argv[2])await fs.writeFile(process.argv[2],JSON.stringify(result,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({schema:result.schema,checks:result.checks},null,2));
