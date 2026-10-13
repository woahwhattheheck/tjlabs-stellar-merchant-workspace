// MIT. Configure the original Jobs merchant for complete commissioned preparation pipelines.
import { constants } from 'node:fs';
import { mkdir, open, realpath, lstat, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { compileJobMerchant } from '../../jobs/config.mjs';

export function pipelineJobConfiguration({ publicOrigin, payment, application =
  fileURLToPath(new URL('./application.mjs', import.meta.url)), timeoutMs = 600000,
  inputStorageBytes = 536870912 } = {}) {
  if (typeof application !== 'string' || !isAbsolute(application))
    throw new TypeError('Select the absolute installed pipeline application module');
  const config = {
    schema: 'stellar-forge.paid-jobs.v1', application, publicOrigin,
    serviceName: 'Saved SQL Pipeline Execution', environment: ['SF30_PREPARATION_PYTHON', 'SF30_JOB_TEMP'],
    workerCount: 1, maxPending: 128, maxJobs: 10000, memoryLimitMb: 512,
    inputFileStorage: { maxBytes: inputStorageBytes, maxUploads: 4096 },
    functions: {
      executePipeline: {
        path: '/preparation-pipeline',
        description: 'Execute a selected saved SQL pipeline and exact original source editions; receive its complete report, results and independently editable project.',
        inputSchema: { type: 'object', properties: {
          reportName: { type: 'string', minLength: 1, maxLength: 120 },
          selectionSha256: { type: 'string', pattern: '^[a-f0-9]{64}$', minLength: 64, maxLength: 64 },
        }, required: ['reportName', 'selectionSha256'], additionalProperties: false },
        example: { reportName: 'Approved pipeline edition', selectionSha256: '0'.repeat(64) },
        inputFiles: { slots: {
          project: { required: true, description: 'Complete original exported pipeline project selected before checkout.',
            mediaTypes: ['application/zip'], maxBytes: 29360128 },
          selection: { required: true, description: 'Complete reviewed saved pipeline, parameters and source-edition selection.',
            mediaTypes: ['application/json'], maxBytes: 1048576 },
        }, maxTotalBytes: 30408704 },
        payment, timeoutMs, maxInputBytes: 262144, maxOutputBytes: 67108864,
        output: { format: 'package', filename: 'pipeline-execution.zip', files: {
          report: { filename: 'pipeline-report.html', contentType: 'text/html; charset=utf-8', maxBytes: 2097152 },
          project: { filename: 'pipeline-project.zip', contentType: 'application/zip', maxBytes: 29360128 },
          execution: { filename: 'pipeline-execution.json', contentType: 'application/json; charset=utf-8', maxBytes: 2097152 },
          results: { filename: 'pipeline-results.zip', contentType: 'application/zip', maxBytes: 29360128, required: false },
        } },
      },
    },
    intake: { enabled: true, functions: ['executePipeline'] },
  };
  // Validate the exact native offer, input-file policy and package budgets before publication.
  compileJobMerchant(config);
  return config;
}

export async function writePipelineJobConfiguration({ directory, python, ...options } = {}) {
  if (typeof directory !== 'string' || !isAbsolute(directory) ||
      typeof python !== 'string' || !isAbsolute(python))
    throw new TypeError('Select absolute private merchant directory and Python executable');
  const interpreter = await realpath(python), pythonInfo = await lstat(interpreter);
  if (!pythonInfo.isFile() || !(pythonInfo.mode & 0o111))
    throw new TypeError('Select the installed executable Python 3.11 or newer');
  const config = pipelineJobConfiguration(options);
  const application = await realpath(config.application);
  if (!(await lstat(application)).isFile()) throw new TypeError('Select the complete installed application');
  config.application = application;
  await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
  const parent = await realpath(dirname(directory));
  const target = join(parent, resolve(directory).split('/').at(-1));
  if (target === parent) throw new TypeError('Select a new private merchant directory');
  const temporary = join(parent, '.pipeline-merchant-' + randomUUID());
  await mkdir(temporary, { mode: 0o700 });
  let reserved = false, published = false;
  const write = async (name, value) => {
    const file = await open(join(temporary, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL |
      constants.O_NOFOLLOW, 0o600);
    try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); }
    finally { await file.close(); }
  };
  try {
    await write('merchant.json', config);
    await write('runtime.json', { schema: 'stellar-forge.preparation-pipeline-job-runtime.v1',
      environment: { SF30_PREPARATION_PYTHON: interpreter },
      configuration: 'merchant.json', application });
    await mkdir(target, { mode: 0o700 }); reserved = true;
    await rename(temporary, target); published = true;
    const parentHandle = await open(parent, constants.O_RDONLY | constants.O_DIRECTORY);
    try { await parentHandle.sync(); } finally { await parentHandle.close(); }
    return { directory: target, configuration: join(target, 'merchant.json'),
      runtime: join(target, 'runtime.json'), application,
      environment: { SF30_PREPARATION_PYTHON: interpreter }, functionId: 'executePipeline' };
  } finally {
    await rm(temporary, { recursive: true, force: true });
    if (reserved && !published) await rmdir(target);
  }
}
