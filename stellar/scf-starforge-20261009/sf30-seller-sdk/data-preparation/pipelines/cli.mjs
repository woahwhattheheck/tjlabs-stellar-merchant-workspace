#!/usr/bin/env node
/** MIT. Original-distribution command for the native pipeline CLI. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const child=spawn(process.env.STARFORGE_PYTHON||'python3',[fileURLToPath(new URL('./cli.py',import.meta.url)),...process.argv.slice(2)],{stdio:'inherit',shell:false});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
