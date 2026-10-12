#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { runOriginalPython, isCommandEntry } from './python-command.mjs';

export async function main(args = process.argv.slice(2)) {
  const code = await runOriginalPython('workspace', args);
  process.exitCode = code;
  return code;
}
if (await isCommandEntry(import.meta.url)) main().catch(error => {
  process.stderr.write(JSON.stringify({ error: error.code ?? 'A2A_ANALYSIS_WORKSPACE_ERROR',
    message: error.message }) + '\n');
  process.exitCode = 1;
});
