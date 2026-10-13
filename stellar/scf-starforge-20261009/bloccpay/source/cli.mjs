#!/usr/bin/env node
// MIT. Direct CLI for the same durable Bloccpay workspace and native requests.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pipeline, finished } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { openBloccpayWorkspace } from './lib/workspace.mjs';
import {
  retainBloccpayRuntime, verifyBloccpayRuntime, restoreBloccpayRuntime,
} from './lib/runtime.mjs';
import {
  inspectBloccpayDelivery, receiveBloccpayDelivery,
} from './lib/receiving.mjs';
import { streamBloccpayDelivery, unpackBloccpayDelivery } from './lib/archive.mjs';
import { readJSON, jsonBytes, need, publicError } from './lib/files.mjs';
import { startBloccpayServer } from './server.mjs';

export function parseArguments(argv) {
  const [command = 'help', ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    need(key?.startsWith('--') && rest[index + 1] !== undefined, 'ARGUMENT_REQUIRED');
    need(!Object.hasOwn(flags, key.slice(2)), 'DUPLICATE_ARGUMENT');
    flags[key.slice(2)] = rest[index + 1];
  }
  return { command, flags };
}

const HELP = [
  'Bloccpay operations — original SDP, Horizon and Bridge requests and complete receiving',
  '',
  'node cli.mjs serve --directory /private/workspace --configuration /private/config.json',
  'node cli.mjs worker --directory /private/workspace --configuration /private/config.json',
  'node cli.mjs import-payroll --directory /private/workspace --configuration /private/config.json --source /private/payroll.csv --programme-version ID --request-id UUID --format csv',
  'node cli.mjs describe --directory /private/workspace --configuration /private/config.json',
  'node cli.mjs command --directory /private/workspace --configuration /private/config.json --request /private/request.json',
  'node cli.mjs list --directory /private/workspace --table operations [--cursor CURSOR]',
  'node cli.mjs item --directory /private/workspace --table sources --id ID',
  'node cli.mjs file --directory /private/workspace --id ID --destination /private/original.bin [--private true]',
  'node cli.mjs runtime-retain --destination /private/runtime [--node /selected/node]',
  'node cli.mjs runtime-verify --directory /private/runtime [--manifest-sha256 HASH]',
  'node cli.mjs runtime-restore --source /package/runtime/source --destination /private/runtime --manifest-sha256 HASH',
  'node cli.mjs package-inspect --source /private/package --manifest-sha256 HASH',
  'node cli.mjs package-receive --source /private/package --destination /private/received --request-id UUID',
  'node cli.mjs archive --source /private/package --destination /private/package.tar.gz',
  'node cli.mjs unpack --source /private/package.tar.gz --destination /private/unpacked',
  '',
  'Request JSON is {requestId,expectedRevision?,method,args}. Provider API keys stay in private configuration.',
  'The browser operator bearer is in configuration.operatorToken or workspace/operator-token.private.json.',
  '',
].join('\n');

export async function runBloccpayCLI(argv = process.argv.slice(2)) {
  const { command, flags } = parseArguments(argv);
  if (command === 'help') { process.stdout.write(HELP); return; }
  const configuration = flags.configuration ? await readJSON(path.resolve(flags.configuration)) : {};
  if (command === 'serve') {
    const server = await startBloccpayServer({
      directory: path.resolve(flags.directory), configuration,
      host: flags.host ?? '127.0.0.1', port: Number(flags.port ?? 8781),
      runtimeDirectory: flags.runtime ?? configuration.runtimeDirectory,
      expectedManifestSha256: flags['runtime-sha256'] ?? configuration.expectedManifestSha256,
      token: process.env.BLOCCPAY_OPERATOR_TOKEN,
    });
    process.stdout.write('BLOCCPAY_OPERATIONS_READY ' + JSON.stringify(server.startup) + '\n');
    for (const event of ['SIGTERM', 'SIGINT']) process.once(event, () => server.close());
    return server;
  }
  let result;
  if(command==='worker') {
    const {startBloccpayWorker}=await import('./worker.mjs');
    const worker=await startBloccpayWorker({
      directory:path.resolve(flags.directory),configuration,
      pollSeconds:Number(flags['poll-seconds']??15),maxPages:Number(flags['max-pages']??100),
      onResult:value=>process.stdout.write(JSON.stringify(value)+'\n'),
    });
    for(const event of ['SIGTERM','SIGINT'])process.once(event,()=>worker.close());
    await worker.done;return worker;
  }
  if (command === 'runtime-retain') {
    result = await retainBloccpayRuntime({
      directory: path.resolve(flags.destination),
      nodeExecutable: flags.node ?? process.execPath,
      licenseFiles: configuration.runtimeLicenseFiles ?? [],
    });
  } else if (command === 'runtime-verify') {
    result = await verifyBloccpayRuntime({
      directory: path.resolve(flags.directory), expectedManifestSha256: flags['manifest-sha256'],
    });
  } else if (command === 'runtime-restore') {
    result = await restoreBloccpayRuntime({
      sourceDirectory: path.resolve(flags.source), destination: path.resolve(flags.destination),
      expectedManifestSha256: flags['manifest-sha256'],
    });
  } else if (command === 'package-inspect') {
    result = await inspectBloccpayDelivery({
      sourceDirectory: path.resolve(flags.source), expectedManifestSha256: flags['manifest-sha256'],
    });
  } else if (command === 'package-receive') {
    need(flags['request-id'], 'REQUEST_ID_REQUIRED');
    result = await receiveBloccpayDelivery({
      sourceDirectory: path.resolve(flags.source), destination: path.resolve(flags.destination),
      requestId: flags['request-id'], expectedManifestSha256: flags['manifest-sha256'],
    });
  } else if (command === 'archive') {
    let source = null, output = null, archiveError = null;
    try {
      source = await streamBloccpayDelivery({
        sourceDirectory: path.resolve(flags.source), expectedManifestSha256: flags['manifest-sha256'],
      });
      output = createWriteStream(path.resolve(flags.destination), { flags: 'wx', mode: 0o600 });
      await pipeline(source, output);
    } catch (error) { archiveError = error; }
    finally {
      for (const stream of [source, output].filter(Boolean)) {
        stream.destroy();
        try { await finished(stream, { cleanup: true }); } catch (error) { archiveError ??= error; }
      }
      if (source) try { await source.completion; } catch (error) { archiveError ??= error; }
    }
    if (archiveError) throw archiveError;
    result = { file: path.resolve(flags.destination) };
  } else if (command === 'unpack') {
    result = await unpackBloccpayDelivery({
      input: createReadStream(path.resolve(flags.source)),
      destination: path.resolve(flags.destination),
      expectedManifestSha256: flags['manifest-sha256'],
    });
  } else {
    const workspace = await openBloccpayWorkspace({
      directory: path.resolve(flags.directory), connections: configuration.connections ?? {},
      name: configuration.name,
      sourceDirectory: configuration.sourceDirectory,
      runtimeDirectory: flags.runtime ?? configuration.runtimeDirectory,
      expectedManifestSha256: flags['runtime-sha256'] ?? configuration.expectedManifestSha256,
    });
    try {
      if(command==='import-payroll' || command==='import-source' || command==='file-retain') {
        need(flags.source && flags['request-id'],'ORIGINAL_FILE_AND_REQUEST_ID_REQUIRED');
        const body=await fs.readFile(path.resolve(flags.source));
        const descriptor=await workspace.retainFile(body,{
          filename:path.basename(flags.source),contentType:flags['content-type'] ??
            (flags.format==='csv'?'text/csv':'application/json'),private:true,
        });
        if(command==='file-retain') result={file:descriptor};
        else {
          const args=command==='import-payroll' ? {
            programmeVersionId:flags['programme-version'],fileId:descriptor.id,
            format:flags.format ?? 'csv',recordsPath:flags['records-path'] ?? '',
          } : {
            connectionAlias:flags.connection,action:flags.action,fileId:descriptor.id,
            input:flags.input ? await readJSON(path.resolve(flags.input)) : {},
            status:Number(flags.status??200),bodyComplete:flags.complete!=='false',
          };
          result=await workspace.command({requestId:flags['request-id'],
            method:command==='import-payroll'?'payroll.import':'source.import',args});
        }
      } else if (command === 'describe') result = workspace.describe();
      else if (command === 'list') result = workspace.list({
        table: flags.table, cursor: flags.cursor, limit: Number(flags.limit ?? 100),
      });
      else if (command === 'item') result = workspace.item(flags.table, flags.id);
      else if (command === 'command') {
        need(flags.request, 'REQUEST_FILE_REQUIRED');
        result = await workspace.command(await readJSON(path.resolve(flags.request)));
      } else if (command === 'file') {
        need(flags.destination, 'DESTINATION_REQUIRED');
        const privateRead = flags.private === 'true';
        const body = await workspace.fileBytes(flags.id, { private: privateRead });
        await fs.writeFile(path.resolve(flags.destination), body, { flag: 'wx', mode: 0o600 });
        result = { file: path.resolve(flags.destination), descriptor: workspace.file(flags.id, { private: privateRead }) };
      } else need(false, 'UNKNOWN_COMMAND');
    } finally { await workspace.close(); }
  }
  if (result?.manifest && result?.nodeExecutable) {
    const { manifest, ...descriptor } = result;
    result = descriptor;
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runBloccpayCLI().catch(error => {
    process.stderr.write(JSON.stringify({ error: publicError(error) }) + '\n');
    process.exitCode = 1;
  });
}
