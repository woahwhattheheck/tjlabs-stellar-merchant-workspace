#!/usr/bin/env node
import {runCommand} from './stellar/scf-starforge-20261009/sf30-seller-sdk/datagouv/cli.mjs';
try{const result=await runCommand();if(result!==null)process.stdout.write(JSON.stringify(result,null,2)+'\n');}catch(error){process.stderr.write(JSON.stringify({error:error.code??'PUBLISHER_OPERATION',message:error.message})+'\n');process.exitCode=1;}
