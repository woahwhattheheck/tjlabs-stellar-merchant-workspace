#!/usr/bin/env node
// MIT. Pass original commands to the complete maintained municipal application.
import { realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { runNative } from './managed.mjs';
const help = `Municipal asset and work-order workspace
  starforge municipal-assets --python /absolute/python COMMAND [original arguments]

Commands:
  init DIRECTORY                  Create the original private SQLite workspace
  adopt DIRECTORY                 Add its stable managed identity once
  inspect DIRECTORY               Read the same workspace/source identity
  serve DIRECTORY [--port 0]      Open its original authenticated operator
  backup DIRECTORY OUTPUT.zip    Save its complete editable native backup
  restore BACKUP.zip DIRECTORY   Receive in a new private directory
  handover DIRECTORY --output FILE.zip --operation ID
                                  Save stopped workspace and all source sidecars
  receive HANDOVER.zip DIRECTORY Receive it completely in a new private directory
  capture DIRECTORY CAPTURE ...  Import the complete original City source
  refresh DIRECTORY ...          Refresh the existing project and mappings
  refresh-resume DIRECTORY ...   Continue its saved original source operation
  refresh-status DIRECTORY ...   Read that project's actual saved operations
  maximo [original arguments]     Collect target, prepare load, receive results
  package --output FILE.zip      Save the complete original application source
  demo DIRECTORY                 Explicitly load labelled development records

After init or restore, run adopt once before Applications Review/Save.
For native command arguments use COMMAND --help (maximo --help).
Applications owns managed Review/Save/Start/Open/Stop and its exact retained args.
Private captures, credentials, databases and exports stay outside the package.
`;
export async function main(args=process.argv.slice(2)) {
  if(!args.length||['help','--help','-h'].includes(args[0])){console.log(help);return;}
  if(args[0]!=='--python'||args.length<3)throw new Error(help);
  const [,python,...nativeArgs]=args;
  const result=await runNative(python,nativeArgs);
  process.exitCode=result.code??(result.signal==='SIGINT'?130:143);
}
if(process.argv[1]&&await realpath(resolve(process.argv[1])).then(path=>pathToFileURL(path).href===import.meta.url,()=>false))
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
