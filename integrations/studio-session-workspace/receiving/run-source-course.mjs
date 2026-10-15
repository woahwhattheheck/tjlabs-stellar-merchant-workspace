import {createArchiveCodec} from "../vendor/archive-codec.mjs";
import {createStudioSessionCore} from "../studio-session-core.mjs";
import {receiveStudioSessionCore} from "./source-course.mjs";
const result=receiveStudioSessionCore(createStudioSessionCore({codec:createArchiveCodec()}));console.log(JSON.stringify(result,null,2));
