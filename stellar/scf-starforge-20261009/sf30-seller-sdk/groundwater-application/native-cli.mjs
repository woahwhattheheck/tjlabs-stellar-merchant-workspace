#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {resolve} from 'node:path';
import {readJSON,need} from './source.mjs';
import {runApplicationReceiving} from './native.mjs';
const abort=new AbortController(),stop=()=>abort.abort(new Error('Original application receiving stopped.'));
for(const name of ['SIGINT','SIGTERM'])process.on(name,stop);
try{
 need(process.argv.length===3,'GROUNDWATER_APPLICATION_NATIVE_INPUT','Pass the one complete original native input JSON.');
 const result=await runApplicationReceiving((await readJSON(resolve(process.argv[2]))).value,{signal:abort.signal,
  progress:value=>process.stdout.write(JSON.stringify(value)+'\n')});
 process.stdout.write(JSON.stringify(result)+'\n');
}catch(error){process.stderr.write(JSON.stringify({error:{code:error.code??'GROUNDWATER_APPLICATION_NATIVE_FAILED',message:error.message}})+'\n');process.exitCode=1;}
finally{for(const name of ['SIGINT','SIGTERM'])process.off(name,stop);}
