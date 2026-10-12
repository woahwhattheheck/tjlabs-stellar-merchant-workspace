#!/usr/bin/env node
// MIT. Original stellar-expert installed operator entrypoint.
import {pathToFileURL} from 'node:url';
import {main as command} from './command.mjs';
export const main=args=>command('stellar-expert',args);
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{
 process.stderr.write(JSON.stringify({error:error.code??'PRODUCT_OPERATION_FAILED',message:error.message,cleanupErrors:error.cleanupErrors})+'\n');process.exitCode=1;
});
