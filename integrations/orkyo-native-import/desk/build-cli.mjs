import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildOrkyoDesk} from './build.mjs';
import {moduleSources} from '../host/export.mjs';
const out=process.argv[2];if(!out)throw Error('Usage: node desk/build-cli.mjs NEW_OUTPUT.html');
const html=buildOrkyoDesk(await moduleSources());await writeFile(out,html,{flag:'wx',mode:0o600});console.log(JSON.stringify({output:resolve(out),bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')}));
