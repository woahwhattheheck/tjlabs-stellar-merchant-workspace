// Apache-2.0. Original publishing source, staff workspace and complete installation operations.
const workspace = {type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$'};
const uuid = {type: 'string', pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'};
const identifier = {type: 'string', minLength: 1, maxLength: 200};
const read = {readOnly: true, idempotent: true};
const selected = {workspace};
const named = {workspace, requestId: uuid};
const actor = {type: 'string', minLength: 1, maxLength: 200};
export function publicationWorkspaceTools(tool) {
  return [
    tool('merchant_publication_status', 'Inspect the selected original publishing application, workspace, source editions and native database.',
      selected, ['workspace'], read),
    tool('merchant_publication_source', 'Read and verify the complete host-selected original application source manifest.',
      selected, ['workspace'], read),
    tool('merchant_publication_prepare', 'Prepare the complete host-selected source and original workspace backup at this private installation directory.',
      {...named, actor}, ['workspace', 'requestId', 'actor'], {idempotent: true}),
    tool('merchant_publication_adopt_source', 'Select a complete original source successor while preserving the existing workspace, editions and prior lifecycle records.',
      named, ['workspace', 'requestId'], {idempotent: true}),
    tool('merchant_publication_snapshot', 'Export every selected source edition, complete original operator handover, native site and lifecycle lineage into one installation ZIP.',
      named, ['workspace', 'requestId'], {idempotent: true}),
    tool('merchant_publication_receive', 'Independently receive the complete host-selected installation ZIP at this exact private directory, retaining the original workspace and source lineage.',
      {...named, actor}, ['workspace', 'requestId', 'actor'], {idempotent: true}),
    tool('merchant_publication_state', 'Read the original staff workspace including source records, revisions, releases, native returns and procurement.',
      selected, ['workspace'], read),
    tool('merchant_publication_record', 'Read the complete original selected source record and its current editable revision.',
      {...selected, recordId: identifier}, ['workspace', 'recordId'], read),
    tool('merchant_publication_history', 'Read every original retained revision for the selected publishing record.',
      {...selected, recordId: identifier}, ['workspace', 'recordId'], read),
    tool('merchant_publication_job', 'Read the existing original source-acquisition or publication job.',
      {...selected, jobId: identifier}, ['workspace', 'jobId'], read),
    tool('merchant_publication_procurement', 'Read the original controlling-document editions, requirements and source assessments.',
      selected, ['workspace'], read),
    tool('merchant_publication_document', 'Read one original retained controlling document and its complete metadata.',
      {...selected, documentId: identifier}, ['workspace', 'documentId'], read),
    tool('merchant_publication_requirement', 'Read one original procurement requirement with its retained revisions and assessment.',
      {...selected, requirementId: identifier}, ['workspace', 'requirementId'], read),
    tool('merchant_publication_native_return', 'Read the original native WordPress return and selected editable-source comparison.',
      {...selected, returnId: identifier}, ['workspace', 'returnId'], read),
    tool('merchant_publication_export', 'Export the original whole workspace, editable operator package, native WordPress tools or procurement review ZIP.',
      {...named, actor, kind: {type: 'string', enum: ['workspace', 'operator', 'native-tools', 'procurement']}},
      ['workspace', 'requestId', 'kind', 'actor'], {idempotent: true}),
    tool('merchant_publication_native_configure', 'Attach the host-selected existing Node, Playground module and exact original WordPress core archive to this installation.',
      named, ['workspace', 'requestId'], {idempotent: true}),
    tool('merchant_publication_request', 'Read a retained lifecycle request and result, including a copied request from its original installation UUID.',
      {...selected, requestId: identifier, originInstallationId: uuid}, ['workspace', 'requestId'], read),
    tool('merchant_publication_commands', 'Describe the actual original staff editor, frozen resident release or native WordPress command. Applications owns service launch and shutdown.',
      {...selected, roles: {type: 'array', minItems: 1, maxItems: 3, uniqueItems: true,
        items: {type: 'string', enum: ['operator', 'resident', 'wordpress']}},
        port: {type: 'integer', minimum: 0, maximum: 65535},
        releaseId: {type: 'string', pattern: '^[a-f0-9]{64}$'}}, ['workspace'], read),
  ];
}
