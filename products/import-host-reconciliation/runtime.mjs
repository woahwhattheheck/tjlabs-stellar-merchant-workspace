// MIT. The installed host and browser use the same complete domain/session model.
import * as codec from './operator/codec.mjs';
import coreModule from './src/import-host-core.js';
import parserModule from './src/source-parsers.js';
import sessionModule from './operator/session.js';
import bridgeModule from './src/host-bridge.js';
export {codec};
export const parsers=parserModule.createSourceParsers();
export const core=coreModule.createImportHostCore({codec,parsers});
export const sessions=sessionModule.createDeskSessionAPI(core,codec,{parse:s=>parsers.losslessJSON(s,false)});
export const bridge=bridgeModule.createImportHostBridge({core,codec});
