#!/usr/bin/env node
// MIT. CLI and durable JSON-lines mode use the same native writer as the browser.
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { RecordMasteringClient } from './client.mjs';
import { serveWorkspace } from './server.mjs';
import { createFile } from './portable.mjs';
function args(argv) { const positional = [], options = {}; for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
        const key = argv[i].slice(2);
        if (Object.hasOwn(options, key) || !argv[i + 1] || argv[i + 1].startsWith('--'))
            throw Error('Missing or repeated option: ' + argv[i]);
        options[key] = argv[++i];
    }
    else
        positional.push(argv[i]);
} return { positional, options }; }
export async function main(argv = process.argv.slice(2)) {
    const { positional, options: o } = args(argv), command = positional[0] ?? 'help';
    const print = value => process.stdout.write(JSON.stringify(value) + '\n');
    if (command === 'help') {
        console.log('Record mastering — Node 22.16+\n\ncreate --workspace DIR --title TITLE\ninspect --workspace DIR --file source.csv\ninvoke ACTION --workspace DIR --input request.json\nimport --workspace DIR --file source.csv --input request.json\nserve --workspace DIR [--port 0]\nstdio --workspace DIR\nexport --workspace DIR --output workspace.mastering.gz\nreceive --file workspace.mastering.gz --workspace NEW_DIR [--sha256 HASH]\ndeliver --workspace DIR --edition ID --output master-delivery.gz\nunpack-delivery --file master-delivery.gz --output NEW_DIR\n\nMutations carry expectedRevision and requestId. For invoke/import, --input - reads a JSON request from stdin.');
        return;
    }
    if (command === 'receive') {
        print(await RecordMasteringClient.receiveFile(o.file,o.workspace,{expectedSha256:o.sha256}));
        return;
    }
    if (command === 'unpack-delivery') {
        print(RecordMasteringClient.unpackDelivery(o.file, o.output, o.sha256));
        return;
    }
    if (!o.workspace)
        throw Error('--workspace is required');
    const client = new RecordMasteringClient({ directory: o.workspace, create: command === 'create', title: o.title });
    if (command === 'serve') {
        const service = await serveWorkspace(client.workspace, { port: Number(o.port ?? 0), expectedBindingSha256: o['expected-binding-sha256'] });
        // The session URL is private startup output, never part of a customer delivery.
        print(service.ready);
        let closing = false;
        const stop = async () => { if (closing)
            return; closing = true; await service.close(); client.close(); };
        process.once('SIGINT', () => void stop());
        process.once('SIGTERM', () => void stop());
        return service;
    }
    try {
        const input = () => JSON.parse(readFileSync(o.input === '-' ? 0 : o.input, 'utf8'));
        if (command === 'create')
            print(client.invoke('status'));
        else if (command === 'inspect')
            print(client.inspect(o.file));
        else if (command === 'invoke')
            print(client.invoke(positional[1], o.input ? input() : {}));
        else if (command === 'import')
            print(client.import(o.file, input()));
        else if (command === 'export')
            print(client.export(o.output));
        else if (command === 'deliver')
            print(client.deliver(o.edition, o.output));
        else if (command === 'stdio') {
            for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
                let request;
                try {
                    request = JSON.parse(line);
                    print({ id: request.id, result: client.invoke(request.action, request.input ?? {}) });
                }
                catch (error) {
                    print({ ...(request && Object.hasOwn(request, 'id') ? { id: request.id } : {}), error: { code: error.code ?? 'OPERATION_FAILED', message: error.message } });
                }
            }
        }
        else
            throw Error('Unknown command. Run help for available commands.');
    }
    finally {
        client.close();
    }
}
let entryUrl;
try {
    if (process.argv[1])
        entryUrl = pathToFileURL(realpathSync(process.argv[1])).href;
}
catch { }
if (import.meta.url === entryUrl)
    main().catch(error => { process.stderr.write(JSON.stringify({ error: error.code ?? 'COMMAND_FAILED', message: error.message }) + '\n'); process.exitCode = 1; });
