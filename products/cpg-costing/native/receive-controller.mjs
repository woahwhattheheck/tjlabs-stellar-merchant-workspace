#!/usr/bin/env node
// MIT. Explicit controller adapters; actual rendered receiving is in INSTALLED_RECEIVING.md.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {moduleSources} from '../host/export.mjs';
import {codec} from '../runtime.mjs';
import {buildCostingDesk} from '../operator/build.mjs';
import {runOperatorCourse} from '../commissioning/controller-course.mjs';
if(!process.argv[2])throw Error('Choose an unused output directory');
const output=resolve(process.argv[2]);await mkdir(output,{mode:0o700});
const result=await runOperatorCourse({files:await moduleSources(),codec,build:buildCostingDesk});
await writeFile(join(output,'Costing_Working.json'),result.working,{flag:'wx',mode:0o600});
delete result.working;result.nativeRuntime=process.version;
await writeFile(join(output,'Controller_Receiving.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
process.stdout.write(JSON.stringify(result,null,2)+'\n');
