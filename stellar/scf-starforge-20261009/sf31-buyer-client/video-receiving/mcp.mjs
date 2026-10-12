// MIT. Register video tools on the existing x402engine MCP server and payment singleton.
import { join } from 'node:path';
import { privateDirectory } from '../../sf88-operator-buyer-cli/node/store.mjs';
import { openX402VideoMcpWorkspace, VideoMcpError } from './mcp-workspace.mjs';
import { startX402VideoOperator } from './operator.mjs';

const text = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const safeError = error => error instanceof VideoMcpError ? error.toJSON() : {
  error: /^[A-Z][A-Z0-9_]{0,119}$/.test(error?.code ?? '') ? error.code : 'VIDEO_MCP_OPERATION_FAILED' };

/** The original host supplies its zod instance and getRequestFetch closure. */
export function registerX402VideoTools(server, { z, ...options } = {}) {
  if (typeof server?.tool !== 'function' || !z || typeof options.getRequestFetch !== 'function')
    throw new TypeError('VIDEO_ORIGINAL_MCP_HOST_REQUIRED');
  let opening;
  const operators = new Map(), active = new Set();
  let closed = false, closing;
  const lifecycle = new AbortController();
  const workspace = () => {
    if (closed) return Promise.reject(new VideoMcpError('VIDEO_MCP_CLOSED'));
    opening ??= openX402VideoMcpWorkspace(options).catch(error => { opening = undefined; throw error; });
    return opening;
  };
  const key = () => z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)
    .describe('Stable local operation key. Reuse it for this same original video throughout creation, receiving and recovery.');
  const path = () => z.string().min(1).describe('Absolute local path on this MCP server.');
  const wrap = operation => async (input, extra) => {
    if (closed) return { ...text({ error: 'VIDEO_MCP_CLOSED' }), isError: true };
    const signal = AbortSignal.any([lifecycle.signal, ...(extra?.signal ? [extra.signal] : [])]);
    const running = (async () => {
      try { return text(await operation(await workspace(), input, signal)); }
      catch (error) { return { ...text(safeError(error)), isError: true }; }
    })();
    active.add(running);
    try { return await running; } finally { active.delete(running); }
  };
  server.tool('generate_video',
    'Create one x402engine video through this server’s existing capped USDC payment fetch. Uses the original Base/Solana configuration and X402_MAX_PAYMENT_USD. Returns the saved acceptance and operation key; receive_video completes the original job. Repeating an operation key reopens it and never submits a second creation request.',
    { operation_key: key(), model: z.enum(['seedance-2.5', 'minimax-h3']),
      prompt: z.string().min(1).refine(value => Buffer.byteLength(value, 'utf8') <= 2000,
        'The provider accepts at most 2000 UTF-8 prompt bytes.') },
    wrap((store, input, signal) => store.create({
      operationKey: input.operation_key, model: input.model, prompt: input.prompt, signal })));
  server.tool('list_video_jobs',
    'List this MCP server’s retained video operations. Follow nextCursor until complete to read every operation.',
    { cursor: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      limit: z.number().int().min(1).max(200).default(50) },
    wrap((store, input) => store.list(input)));
  server.tool('video_status',
    'Inspect a retained video and, when refresh is true, save one unpaid provider status response when its persisted five-second interval permits. A previously completed creation response is adopted on refresh.',
    { operation_key: key(), refresh: z.boolean().default(true) },
    wrap((store, input, signal) => input.refresh ?
      store.status(input.operation_key, { signal }) : store.inspect(input.operation_key)));
  server.tool('receive_video',
    'Receive the original job’s full video into a verified private file, resuming its saved state. Preserves every status response and interrupted media attempt. Optional output writes a create-only complete file copy.',
    { operation_key: key(), deadline_ms: z.number().int().min(1).max(86400000).default(1800000),
      output: path().optional() },
    wrap((store, input, signal) => store.receive(input.operation_key, {
      signal, deadlineMs: input.deadline_ms, output: input.output })));
  server.tool('video_result',
    'Verify a completed local video and return its exact local path, size, content type and SHA-256. This is an offline read.',
    { operation_key: key() },
    wrap(async (store, input) => {
      const result = await store.result(input.operation_key);
      return { operationKey: input.operation_key, result: { ...result._metadata() } };
    }));
  server.tool('recover_video_acceptance',
    'Attach the complete original accepted JSON document recovered from the original creation request to its existing operation. This records the exact document and its source reference, then continues that job without another paid creation.',
    { operation_key: key(), acceptance_file: path(),
      source_reference: z.string().min(1).refine(value => Buffer.byteLength(value, 'utf8') <= 4096)
        .describe('Original request/log/receipt reference establishing which accepted job this document belongs to.') },
    wrap((store, input) => store.recoverAcceptance({ operationKey: input.operation_key,
      acceptanceFile: input.acceptance_file, sourceReference: input.source_reference })));
  server.tool('export_video_workspace',
    'Export the complete original request, creation response, status history, interrupted attempts and received video with a full file manifest. Reusing the same destination resumes that exact source revision.',
    { operation_key: key(), destination: path() },
    wrap(async (store, input) => ({ operationKey: input.operation_key,
      export: await store.exportWorkspace(input.operation_key, input.destination) })));
  server.tool('open_video_workspace',
    'Open and verify every file in a complete portable video handover. A received video can be used offline.',
    { directory: path() },
    wrap((store, input) => store.openExport(input.directory)));
  server.tool('open_video_operator',
    'Open an original video job or a complete transferred export in a private local browser operator with playback, status, receiving, pause, full download and archive export. Supply exactly one source. The returned URL includes its private session entry token.',
    { operation_key: key().optional(), export_directory: path().optional() },
    wrap(async (store, input) => {
      if (Boolean(input.operation_key) === Boolean(input.export_directory))
        throw new VideoMcpError('VIDEO_ONE_OPERATOR_SOURCE_REQUIRED');
      const source = input.export_directory ? await store.openExport(input.export_directory) : null;
      const directory = source?.workspaceDirectory ?? await store.workspacePath(input.operation_key);
      const identity = directory;
      let pending = operators.get(identity);
      if (!pending) {
        pending = (async () => {
          const exportsDirectory = join(store.directory, 'exports');
          await privateDirectory(exportsDirectory);
          return startX402VideoOperator({ directory, exportsDirectory,
            fetchImpl: options.receivingFetch, transport: options.transport, port: 0 });
        })().catch(error => { operators.delete(identity); throw error; });
        operators.set(identity, pending);
      }
      const operator = await pending;
      return { operationKey: source?.operationKey ?? input.operation_key,
        workspaceDirectory: directory, url: operator.url, origin: operator.origin };
    }));
  if (typeof server.resource === 'function') server.resource('video-jobs', 'x402engine://video-jobs', async uri => {
    const page = await (await workspace()).list({ limit: 50 });
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(page, null, 2) }] };
  });
  const registration = Object.freeze({
    workspace,
    close() {
      closing ??= (async () => {
      closed = true; lifecycle.abort(new VideoMcpError('VIDEO_MCP_CLOSED'));
      await Promise.allSettled([...active]);
      const opened = await Promise.allSettled([...operators.values()]);
      operators.clear();
      await Promise.allSettled(opened.filter(item => item.status === 'fulfilled').map(item => item.value.close()));
      })();
      return closing;
    },
  });
  // McpServer exposes the underlying protocol server, also used by its standard
  // transport lifecycle. Preserve an existing host callback while closing receivers.
  if (server.server) {
    const onclose = server.server.onclose;
    server.server.onclose = () => {
      try { onclose?.call(server.server); } finally { void registration.close().catch(() => {}); }
    };
  }
  return registration;
}
