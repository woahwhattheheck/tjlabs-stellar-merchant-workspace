// MIT. Declarative MCP metadata; the native installation loads only when selected.
const workspace = {type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$'};
const uuid = {type: 'string', pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'};
const digest = {type: 'string', pattern: '^[a-f0-9]{64}$'};
const identifier = {type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'};
const nativeRequest = {type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'};
const decimal = {anyOf: [{type: 'string', pattern: '^[1-9][0-9]{0,18}$'},
  {type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER}]};
const read = {readOnly: true, idempotent: true};
const selected = {workspace};
const named = {workspace, requestId: uuid};
const page = {limit: {type: 'integer', minimum: 1, maximum: 200}};
const event = {type: 'object', description: 'Complete original Tasker event. Preserve a large version as a decimal string.'};
export function taskerWorkspaceTools(tool) {
  return [
    tool('merchant_tasker_status', 'Inspect the original Tasker installation, source identity, database path and selected Python.',
      selected, ['workspace'], read),
    tool('merchant_tasker_prepare', 'Prepare the complete original Tasker application at the host-selected private directory and configuration. Retain the request UUID across interruption.',
      named, ['workspace', 'requestId'], {idempotent: true}),
    tool('merchant_tasker_adopt_source', 'Adopt the complete host-selected original source edition in the same installation. Review its current identity first; keep the request UUID.',
      named, ['workspace', 'requestId'], {idempotent: true}),
    tool('merchant_tasker_snapshot', 'Export the complete original application, configuration and SQLite database to the configured transfer directory, using this UUID as the archive filename.',
      named, ['workspace', 'requestId'], {idempotent: true}),
    tool('merchant_tasker_receive', 'Independently receive the complete host-selected original archive into this alias’s selected directory.',
      named, ['workspace', 'requestId'], {idempotent: true}),
    tool('merchant_tasker_configuration', 'Read the whole original configuration and its current revision. Credentials are environment-reference names and presence booleans.',
      selected, ['workspace'], read),
    tool('merchant_tasker_save_configuration', 'Save the whole original configuration at its exact current revision. Retain the request UUID; an exact retry recovers its committed result.',
      {...named, revision: digest, configuration: {type: 'object'}},
      ['workspace', 'requestId', 'revision', 'configuration'], {idempotent: true}),
    tool('merchant_tasker_queue_status', 'Read the original queue summary, route circuits and recent deliveries.',
      {...selected, tenant: identifier, ...page}, ['workspace'], read),
    tool('merchant_tasker_queue', 'Page the original deliveries with complete filtered counts. Keep filters and follow next_before_id; delivery IDs are exact decimal strings.',
      {...selected, tenant: identifier, status: identifier, routeId: identifier, jobId: identifier, beforeId: decimal, ...page},
      ['workspace'], read),
    tool('merchant_tasker_delivery', 'Read one complete original delivery before resolving an uncertain send.',
      {...selected, deliveryId: decimal}, ['workspace', 'deliveryId'], read),
    tool('merchant_tasker_job_history', 'Read the original job’s retained event versions with exact decimal version cursors.',
      {...selected, tenant: identifier, jobId: identifier, beforeVersion: decimal, ...page},
      ['workspace', 'tenant', 'jobId'], read),
    tool('merchant_tasker_receive_event', 'Validate and enqueue the complete original event under its tenant and source version rules. This does not execute a Slack send; the original worker handles eligible deliveries.',
      {...named, tenant: identifier, event, ttlSeconds: {type: 'integer', minimum: 60, maximum: 604800}},
      ['workspace', 'requestId', 'tenant', 'event'], {idempotent: true}),
    tool('merchant_tasker_render_event', 'Render the same original event and selected routes without enqueuing it.',
      {...selected, tenant: identifier, event}, ['workspace', 'tenant', 'event'], read),
    tool('merchant_tasker_resolve_delivery', 'Resolve the selected original uncertain delivery with its real sent, retry or cancelled outcome and operator note.',
      {...named, deliveryId: decimal, outcome: {type: 'string', enum: ['sent', 'retry', 'cancelled']},
        note: {type: 'string', minLength: 1, maxLength: 300}},
      ['workspace', 'requestId', 'deliveryId', 'outcome', 'note'], {idempotent: true, destructive: true}),
    tool('merchant_tasker_resume_route', 'Resume the original paused route after reviewing its circuit and delivery state.',
      {...named, routeId: identifier}, ['workspace', 'requestId', 'routeId'], {idempotent: true}),
    tool('merchant_tasker_request', 'Recover a named operation from the same original SQLite database after an interrupted reply.',
      {...selected, requestId: nativeRequest, originInstallationId: uuid}, ['workspace', 'requestId'], read),
    tool('merchant_tasker_commands', 'Describe the selected original operator, ingress and worker commands. Secrets remain environment references; use Applications to launch and supervise them.',
      {...selected, roles: {type: 'array', minItems: 1, maxItems: 3, uniqueItems: true,
        items: {type: 'string', enum: ['operator', 'ingress', 'worker']}},
        operatorPort: {type: 'integer', minimum: 0, maximum: 65535},
        ingressPort: {type: 'integer', minimum: 1, maximum: 65535},
        workerInterval: {type: 'number', minimum: 0.1, maximum: 60}},
      ['workspace'], read),
  ];
}
