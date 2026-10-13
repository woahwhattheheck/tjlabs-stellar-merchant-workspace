#!/usr/bin/env node
// MIT. Private operator HTTP and original provider webhook intake.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomBytes } from 'node:crypto';
import {
  need, hash, directory, readJSON, jsonBytes, confined, safeEqual,
  publicError, writeStream,
} from './lib/files.mjs';
import { openBloccpayWorkspace, BLOCCPAY_METHODS } from './lib/workspace.mjs';
import { streamBloccpayDelivery, unpackBloccpayDelivery } from './lib/archive.mjs';
import {createBridgeIntake} from './lib/bridge-intake.mjs';
import {BRIDGE_ASSETS,routeBridgeIntake} from './lib/bridge-http.mjs';

const SOURCE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = new Map([
  ...BRIDGE_ASSETS,
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/journal.mjs', ['journal.mjs', 'text/javascript; charset=utf-8']],
  ['/sha256.mjs', ['sha256.mjs', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/sdp-events', ['sdp-events.html', 'text/html; charset=utf-8']],
  ['/sdp-events.html', ['sdp-events.html', 'text/html; charset=utf-8']],
  ['/sdp-events.mjs', ['sdp-events.mjs', 'text/javascript; charset=utf-8']],
  ['/sdp-events.css', ['sdp-events.css', 'text/css; charset=utf-8']],
]);

async function readBody(request, maximumBytes = 1024 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    need(bytes <= maximumBytes, 'REQUEST_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, bytes);
}

function send(response, status, value) {
  const bytes = jsonBytes(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': bytes.length, 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(bytes);
}

function statusFor(error) {
  if (['AUTHORIZATION_REQUIRED'].includes(error.code)) return 401;
  if (['WORKSPACE_ID_MISMATCH', 'ORIGIN_NOT_ALLOWED'].includes(error.code)) return 403;
  if (['RECORD_NOT_FOUND', 'FILE_NOT_AVAILABLE', 'ROUTE_NOT_FOUND'].includes(error.code)) return 404;
  if (['REVISION_CONFLICT', 'REQUEST_ID_CONFLICT', 'OPERATION_BUSY',
    'PROVIDER_DISPATCH_DISABLED', 'LEASE_UNAVAILABLE'].includes(error.code)) return 409;
  if (['REQUEST_TOO_LARGE', 'UPLOAD_TOO_LARGE'].includes(error.code)) return 413;
  return error.code ? 400 : 500;
}

export async function startBloccpayServer({
  directory: workspaceDirectory,
  configuration = {},
  configurationFile,
  host = '127.0.0.1',
  port = 8781,
  token,
  sourceDirectory = SOURCE_DIRECTORY,
  runtimeDirectory,
  expectedManifestSha256,
  signal,
} = {}) {
  if (configurationFile) {
    configuration = { ...await readJSON(configurationFile), ...configuration };
  }
  token = token ?? configuration.operatorToken;
  const retainedTokenSelected = !token;
  const tokenFile = path.join(workspaceDirectory, 'operator-token.private.json');
  if (!token) {
    await directory(workspaceDirectory);
    let saved = await readJSON(tokenFile, true);
    if (!saved) {
      saved = { token: randomBytes(32).toString('base64url') };
      const { writeExact } = await import('./lib/files.mjs');
      await writeExact(tokenFile, jsonBytes(saved));
    }
    token = saved.token;
  }
  need(typeof token === 'string' && token.length >= 24, 'OPERATOR_TOKEN_REQUIRED');
  const workspace = await openBloccpayWorkspace({
    directory: workspaceDirectory, connections: configuration.connections ?? {},
    name: configuration.name, sourceDirectory,
    runtimeDirectory: runtimeDirectory ?? configuration.runtimeDirectory,
    expectedManifestSha256: expectedManifestSha256 ?? configuration.expectedManifestSha256,
  });
  const aborter = new AbortController();
  const inFlight = new Set(),sockets=new Set(),socketClosures=new Map();
  let closing=false,closed=false,initial,origin,startup,webhookProjection;
  let server=null,bridgeIntake=null,worker=null,workerError=null;
  let closePromise=null,stopPromise=null,serverClosed=false,workerClosed=false;
  let intakeClosed=false,workspaceClosed=false,firstCloseError=null,started=false;

  function inspect() {
    return {closing,closed,serverClosed,workerClosed,intakeClosed,workspaceClosed,
      admittedRequests:inFlight.size,sockets:sockets.size,
      error:firstCloseError ? publicError(firstCloseError) : null};
  }
  function stopServer() {
    if(serverClosed)return Promise.resolve();
    if(!server){serverClosed=true;return Promise.resolve();}
    if(stopPromise)return stopPromise;
    const attempt=new Promise((resolve,reject)=>{
      server.close(error=>{
        if(error&&error.code!=='ERR_SERVER_NOT_RUNNING'){reject(error);return;}
        serverClosed=true;resolve();
      });
    });
    stopPromise=attempt;
    attempt.catch(()=>{if(stopPromise===attempt)stopPromise=null;});
    return attempt;
  }
  function close() {
    closing=true;
    aborter.abort('server-closing');
    if(closed)return Promise.resolve({state:'CLOSED'});
    if(closePromise)return closePromise;
    const attempt=(async()=>{
      let first=null;
      // Stop the listener and abort its exact accepted sockets before waiting
      // for body readers. A partial upload must not deadlock the original drain.
      const stopped=stopServer();
      stopped.catch(()=>{});
      try {server?.closeIdleConnections?.();server?.closeAllConnections?.();}
      catch(error){first ??= error;}
      for(const socket of [...sockets]) {
        try {socket.destroy();}catch(error){first ??= error;}
      }
      if(!workerClosed) {
        try {if(worker)await worker.close();workerClosed=true;}
        catch(error){first ??= error;}
      }
      while(inFlight.size)await Promise.allSettled([...inFlight]);
      try {await stopped;}catch(error){first ??= error;}
      while(socketClosures.size)await Promise.allSettled([...socketClosures.values()]);
      // A failed worker cleanup still owns this borrowed workspace. Likewise a
      // failed intake close cannot release the original SQLite owner underneath it.
      if(workerClosed&&serverClosed&&inFlight.size===0) {
        if(!intakeClosed) {
          try {if(bridgeIntake)await bridgeIntake.close();intakeClosed=true;}
          catch(error){first ??= error;}
        }
        if(intakeClosed&&!workspaceClosed) {
          try {await workspace.close();workspaceClosed=true;}
          catch(error){first ??= error;}
        }
      }
      if(first)throw first;
      need(workerClosed&&serverClosed&&intakeClosed&&workspaceClosed&&sockets.size===0,'SERVER_CLOSE_INCOMPLETE');
      signal?.removeEventListener('abort',onAbort);
      closed=true;
      return {state:'CLOSED'};
    })();
    closePromise=attempt;
    attempt.catch(error=>{
      firstCloseError ??= error;
      if(closePromise===attempt)closePromise=null;
    });
    return attempt;
  }
  function onAbort() {
    close().catch(error=>{firstCloseError ??= error;});
  }

  function authorized(request) {
    const value = request.headers.authorization;
    need(typeof value === 'string' && value.startsWith('Bearer ') &&
      safeEqual(value.slice(7), token), 'AUTHORIZATION_REQUIRED');
  }

  function mutation(request) {
    need(request.headers['x-bloccpay-workspace-id'] === initial &&
      workspace.describe().workspace.id === initial, 'WORKSPACE_ID_MISMATCH');
    if (request.headers.origin) {
      const allowed = new Set([origin, ...(configuration.operatorOrigins ?? [])]);
      need(allowed.has(request.headers.origin), 'ORIGIN_NOT_ALLOWED');
    }
  }

  async function projectQueuedWebhook(id) {
    if(!webhookProjection?.enabled||closing)return;
    try {
      await workspace.command({
        requestId: 'project-webhook:' + id,
        method: 'webhook.reconcile', args: { webhookId: id }, signal: aborter.signal,
      });
    } catch {
      // Its original request and failure remain visible for operator reconciliation.
    }
  }

  async function route(request, response) {
    const url = new URL(request.url, origin ?? 'http://127.0.0.1');
    if (request.method === 'POST' && url.pathname.startsWith('/webhooks/provider/')) {
      const segments = url.pathname.split('/').slice(3);
      need(segments.length === 2 && segments.every(Boolean), 'ROUTE_NOT_FOUND');
      const [connectionAlias, subscriptionId] = segments.map(decodeURIComponent);
      const body = await readBody(request, configuration.webhookMaximumBytes ?? 16 * 1024 * 1024);
      const result = await workspace.webhook({
        connectionAlias, subscriptionId, body,
        headers: Object.fromEntries(Object.entries(request.headers)
          .filter(([key]) => !['authorization', 'cookie'].includes(key))),
      });
      send(response, result.accepted ? 200 : 401, result);
      if (result.accepted && webhookProjection.enabled) {
        const work = projectQueuedWebhook(result.id);
        inFlight.add(work);
        work.finally(() => inFlight.delete(work));
      }
      return;
    }
    if (request.method === 'GET' && ASSETS.has(url.pathname)) {
      const [filename, contentType] = ASSETS.get(url.pathname);
      const file = await confined(path.join(sourceDirectory, 'web'), filename);
      const stat = await fs.stat(file);
      response.writeHead(200, {
        'content-type': contentType, 'content-length': stat.size,
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-src blob:; base-uri 'none'; frame-ancestors 'none'",
      });
      await pipeline(createReadStream(file), response);
      return;
    }
    authorized(request);
    if(await routeBridgeIntake({request,response,url,intake:bridgeIntake,mutation,signal:aborter.signal}))return;
    if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
      send(response, 200, {
        ...workspace.describe(),
        operator:{origin,directory:workspaceDirectory,sourceDirectory,webhookProjection,
          collections:{enabled:configuration.collections?.enabled===true,
            selected:configuration.collections?.enabled===true,
            pollSeconds:configuration.collections?.pollSeconds??15,
            maxPages:configuration.collections?.maxPages??100,
            active:Boolean(worker)&&!closing&&!workerError,error:workerError}},
      });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/list') {
      const query = Object.fromEntries(url.searchParams);
      if (query.limit !== undefined) query.limit = Number(query.limit);
      send(response, 200, workspace.list(query));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/item') {
      send(response, 200, workspace.item(url.searchParams.get('table'), url.searchParams.get('id')));
      return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/file/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/file/'.length));
      const descriptor = workspace.file(id);
      const body = await workspace.fileBytes(id);
      response.writeHead(200, {
        'content-type': descriptor.contentType, 'content-length': body.length,
        'content-disposition': 'inline; filename="' + descriptor.filename.replace(/["\\\r\n]/g, '_') + '"',
        'x-content-sha256': descriptor.sha256,
        'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      });
      response.end(body);
      return;
    }
    if (request.method === 'GET' && /^\/api\/exports\/[^/]+\/archive$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const selected = workspace.privateItem('exports', id);
      const output = await streamBloccpayDelivery({
        sourceDirectory: selected.directory,
        expectedManifestSha256: selected.manifestSha256,
        signal: aborter.signal,
      });
      let archiveError = null;
      try {
        response.writeHead(200, {
          'content-type': 'application/gzip',
          'content-disposition': 'attachment; filename="bloccpay-' + hash(id).slice(0, 16) + '.tar.gz"',
          'x-bloccpay-manifest-sha256': selected.manifestSha256,
          'cache-control': 'no-store',
        });
        await pipeline(output, response, { signal: aborter.signal });
      } catch (error) { archiveError = error; }
      finally {
        output.destroy();
        try { await output.completion; } catch (error) { archiveError ??= error; }
      }
      if (archiveError) throw archiveError;
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/command') {
      mutation(request);
      const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBody(request)));
      need(BLOCCPAY_METHODS.some(method => method.name === body.method), 'UNKNOWN_METHOD');
      send(response, 200, await workspace.command({ ...body, signal: aborter.signal }));
      return;
    }
    if (request.method === 'POST' && ['/api/source-import','/api/files/upload'].includes(url.pathname)) {
      mutation(request);
      const args = JSON.parse(url.searchParams.get('args') ?? '{}');
      need(typeof args.requestId === 'string' && args.requestId, 'REQUEST_ID_REQUIRED');
      const expected = request.headers['x-content-sha256'];
      need(typeof expected === 'string' && /^[a-f0-9]{64}$/.test(expected),
        'ORIGINAL_UPLOAD_HASH_REQUIRED');
      const relative = 'incoming/uploads/' + hash(args.requestId) + '/' + expected;
      const uploaded = await writeStream(workspaceDirectory, relative, request, {
        expectedSha256: expected, maximumBytes: configuration.maximumUploadBytes ?? 64 * 1024 * 1024,
        signal: aborter.signal,
      });
      const original = await fs.readFile(await confined(workspaceDirectory, uploaded.path));
      const descriptor = await workspace.retainFile(original, {
        filename: args.filename ?? 'original-provider-source.json',
        contentType: request.headers['content-type'] ?? 'application/json', private: true,
      });
      if (url.pathname === '/api/files/upload') {
        send(response,200,await workspace.command({
          requestId:args.requestId,expectedRevision:args.expectedRevision,
          method:'file.retain',args:{fileId:descriptor.id},signal:aborter.signal,
        }));
        return;
      }
      const {requestId,expectedRevision,filename,method='source.import',...selection}=args;
      need(['source.import','payroll.import'].includes(method),'INVALID_UPLOAD_METHOD');
      send(response, 200, await workspace.command({
        requestId, expectedRevision, method,
        args: { ...selection, fileId: descriptor.id }, signal: aborter.signal,
      }));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/packages/unpack') {
      mutation(request);
      const requestId = url.searchParams.get('requestId');
      need(requestId, 'REQUEST_ID_REQUIRED');
      const queryHash = url.searchParams.get('manifestSha256');
      const headerHash = request.headers['x-bloccpay-manifest-sha256'];
      need(!queryHash || !headerHash || queryHash === headerHash, 'DELIVERY_MANIFEST_MISMATCH');
      const expected = headerHash ?? queryHash;
      if (expected) need(/^[a-f0-9]{64}$/.test(expected), 'INVALID_MANIFEST_HASH');
      const destination = path.join(workspaceDirectory, 'incoming/packages', hash(requestId));
      send(response, 200, await unpackBloccpayDelivery({
        input: request, destination, expectedManifestSha256: expected,
        signal: aborter.signal,
      }));
      return;
    }
    throw Object.assign(new Error('Route not found.'), { code: 'ROUTE_NOT_FOUND' });
  }

  try {
    bridgeIntake=createBridgeIntake({workspace});
    const initialWorkspace=workspace.describe().workspace;
    initial=initialWorkspace.id;
    const projectionSelected=configuration.webhookProjection?.enabled;
    need(projectionSelected===undefined||typeof projectionSelected==='boolean','WEBHOOK_PROJECTION_SELECTION_REQUIRED');
    webhookProjection=Object.freeze({enabled:projectionSelected??!Boolean(initialWorkspace.receivedFrom),
      explicit:projectionSelected!==undefined,receivedWorkspace:Boolean(initialWorkspace.receivedFrom)});
    signal?.throwIfAborted();
    server=http.createServer((request,response)=>{
      if(closing){send(response,503,{error:{code:'SERVER_DRAINING'}});request.destroy();return;}
      const work=route(request,response).catch(error=>{
        try {
          if(!response.headersSent)send(response,statusFor(error),{error:publicError(error)});
          else response.destroy(error);
        } finally {if(!request.complete)request.destroy();}
      });
      inFlight.add(work);
      work.then(()=>inFlight.delete(work),()=>inFlight.delete(work));
    });
    server.on('connection',socket=>{
      sockets.add(socket);
      const settled=new Promise(resolve=>socket.once('close',()=>{
        sockets.delete(socket);socketClosures.delete(socket);resolve();
      }));
      socketClosures.set(socket,settled);
      if(closing)socket.destroy();
    });
    server.on('error',error=>{
      firstCloseError ??= error;
      if(started)onAbort();
    });
    server.requestTimeout=0;
    server.headersTimeout=60000;
    await new Promise((resolve,reject)=>{
      const failed=error=>{server.removeListener('listening',listened);reject(error);};
      const listened=()=>{server.removeListener('error',failed);resolve();};
      server.once('error',failed);
      server.once('listening',listened);
      try {server.listen(port,host);}
      catch(error){server.removeListener('error',failed);server.removeListener('listening',listened);reject(error);}
    });
    const address=server.address();
    origin='http://'+(host.includes(':')?'['+host+']':host)+':'+address.port;
    startup={
      schema:'bloccpay.operations-startup.v1',workspaceId:initial,webhookProjection,
      directory:workspaceDirectory,sourceDirectory,origin,port:address.port,
      operatorTokenFile:retainedTokenSelected?tokenFile:null,
      runtimeDirectory:runtimeDirectory??configuration.runtimeDirectory??null,
      expectedManifestSha256:expectedManifestSha256??configuration.expectedManifestSha256??null,
    };
    signal?.throwIfAborted();
    const queued=webhookProjection.enabled?workspace.privateList('webhooks').filter(row=>row.status==='RETAINED'&&row.verified):[];
    for(const row of queued) {
      const work=projectQueuedWebhook(row.id);
      inFlight.add(work);
      work.then(()=>inFlight.delete(work),()=>inFlight.delete(work));
    }
    if(configuration.collections?.enabled===true) {
      const {startBloccpayWorker}=await import('./worker.mjs');
      worker=await startBloccpayWorker({workspace,configuration,signal:aborter.signal,
        pollSeconds:configuration.collections.pollSeconds??15,
        maxPages:configuration.collections.maxPages??100});
      worker.done.catch(error=>{workerError=publicError(error);});
    }
    started=true;
    signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted){await close();signal.throwIfAborted();}
    return {startup,token,server,workspace,worker,close,inspect};
  } catch(originalError) {
    let error=originalError;
    try {await close();}
    catch(cleanupError) {
      // The original startup error remains primary; non-Error abort reasons are
      // retained as cause while the caller gets this exact owner's close handle.
      if(!error||(typeof error!=='object'&&typeof error!=='function'))
        error=new Error('Application startup failed.',{cause:originalError});
      error.close=close;error.closeError=cleanupError;error.application={close,inspect};
    }
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const values = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    need(process.argv[index]?.startsWith('--') && process.argv[index + 1], 'ARGUMENT_REQUIRED');
    values[process.argv[index].slice(2)] = process.argv[index + 1];
  }
  let selected=null,draining=null;
  const controller=new AbortController();
  async function drain(close) {
    if(draining)return draining;
    draining=(async()=>{
      let first=null;
      for(;;) {
        try {await close();break;}
        catch(error) {
          if(!first){first=error;process.exitCode=1;console.error(JSON.stringify(publicError(error)));}
          await new Promise(resolve=>setTimeout(resolve,200));
        }
      }
    })();
    return draining;
  }
  const stopping=()=>{
    controller.abort('operator-stop');
    if(selected)void drain(selected.close);
  };
  for(const name of ['SIGTERM','SIGINT'])process.on(name,stopping);
  try {
    selected=await startBloccpayServer({
      directory:values.directory,configurationFile:values.configuration,
      host:values.host??'127.0.0.1',port:Number(values.port??8781),
      runtimeDirectory:values.runtime,expectedManifestSha256:values['runtime-sha256'],
      token:process.env.BLOCCPAY_OPERATOR_TOKEN,signal:controller.signal,
    });
    // Tokens stay in private configuration or the caller's in-memory return value.
    process.stdout.write('BLOCCPAY_OPERATIONS_READY '+JSON.stringify(selected.startup)+'\n');
    if(controller.signal.aborted)await drain(selected.close);
  } catch(error) {
    if(selected)await drain(selected.close);
    else if(error.close)await drain(error.close);
    throw error;
  }
}
