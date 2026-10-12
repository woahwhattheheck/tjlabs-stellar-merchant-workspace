// MIT. dbt context over the original native dataset publishers and version writer.
import { mkdir, open, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { DbtProjectClient, ensure } from './client.mjs';

const HASH = /^[a-f0-9]{64}$/;
const RUN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

async function persist(directory, name, body) {
  const path = join(directory, name + '-' + digest(body));
  try { await writeFile(path, body, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await file.stat();
      ensure(stat.isFile() && stat.size === body.length, 'DBT_BINDING_CHANGED');
      ensure((await file.readFile()).equals(body), 'DBT_BINDING_CHANGED');
    } finally { await file.close(); }
  }
  return path;
}

/** A selected original publisher. Source files, SQL execution, candidate custody,
 * review, publication and buyer preparation remain in that native implementation.
 * A dbt binding associates the original result with an explicitly selected node.
 */
export class DbtPublisherProject {
  #pending = new Set();
  #closing = null;
  #closed = false;
  #binding;

  static async open({ project, python, publisherDirectory, sourceFile, targetDirectory,
    create = false, seller = null, resource = null, sourceType = 'postgresql', environment } = {}) {
    ensure(typeof project === 'string' && project && typeof publisherDirectory === 'string' && publisherDirectory,
      'DBT_PUBLISHER_BINDING_REQUIRED');
    ensure(sourceType === 'postgresql' || sourceType === 'sqlite', 'DBT_PUBLISHER_SOURCE_UNSUPPORTED');
    const client = new DbtProjectClient({ directory: project, python });
    let native;
    try {
      const binding = await client.invoke('binding');
      ensure(binding?.schema === 'stellar-forge.dbt-project-binding.v1' &&
        binding.directory === client.directory && HASH.test(binding.sha256 ?? ''), 'DBT_PROJECT_BINDING_CHANGED');
      const openPublisher = sourceType === 'sqlite'
        ? (await import('../sqlite/publisher/model.mjs')).openSqlitePublisher
        : (await import('../postgres/publisher/model.mjs')).openPostgresPublisher;
      native = await openPublisher({ directory: resolve(publisherDirectory), create,
        ...(sourceFile ? { sourceFile: resolve(sourceFile) } : {}),
        ...(targetDirectory ? { targetDirectory: resolve(targetDirectory) } : {}),
        ...(environment === undefined ? {} : { environment }), seller, resource });
      const value = new this();
      value.client = client;
      value.publisher = native;
      value.sourceType = sourceType;
      value.#binding = binding;
      return value;
    } catch (error) {
      try { await native?.close(); } finally { await client.close(); }
      throw error;
    }
  }

  call(action, input = {}) {
    ensure(!this.#closed, 'DBT_PUBLISHER_CLOSED');
    ensure(typeof action === 'string' && record(input), 'DBT_POSTGRES_ACTION_UNKNOWN');
    const operation = this.#operate(action, input);
    this.#pending.add(operation);
    operation.finally(() => this.#pending.delete(operation)).catch(() => {});
    return operation;
  }

  async #operate(action, input) {
    const current = await this.client.invoke('binding');
    ensure(current.sha256 === this.#binding.sha256 && current.projectId === this.#binding.projectId &&
      current.directory === this.#binding.directory, 'DBT_PROJECT_BINDING_CHANGED');
    const p = this.publisher;
    switch (action) {
      case 'status': return p.status(input);
      case 'source': return p.source();
      case 'plan.save': return p.savePlan(input);
      case 'plan': return p.plan(input.id);
      case 'run': return p.run(input.id);
      case 'extract': {
        // An explicit run ID is the recovery key. Repeating it reads its original
        // state; it never repeats a completed or interrupted warehouse query.
        if (input.id !== undefined) {
          ensure(RUN.test(input.id), 'EXTRACTION_ID_INVALID');
          let previous;
          try { previous = p.run(input.id); }
          catch (error) { if (error.code !== 'RUN_NOT_FOUND') throw error; }
          if (previous) {
            ensure(previous.plan === input.plan, 'DBT_EXTRACTION_SELECTION_CHANGED');
            return previous;
          }
        }
        return p.startExtraction(input.plan, { id: input.id }).completion;
      }
      case 'cancel': return p.cancel(input.id);
      case 'inspect': return p.inspect(input.id, input.query);
      case 'review': return p.review(input.id, input.review);
      case 'publish': return p.publish(input.id, input.reviewId);
      case 'recover': return p.recover(input.id);
      case 'buyer.offer': return p.buyerOffer(input.id, input.query);
      case 'buyer.prepare': return p.prepareBuyer(input.id, input);
      case 'bind': return this.#bind(input);
      default: throw Object.assign(new Error('Unknown original publisher continuation.'), { code: 'DBT_POSTGRES_ACTION_UNKNOWN' });
    }
  }

  async #bind(input) {
    ensure(RUN.test(input.id ?? '') && HASH.test(input.edition ?? '') && typeof input.uid === 'string' &&
      typeof input.request_id === 'string' && input.request_id.length > 0, 'DBT_CONTEXT_REQUIRED');
    const p = this.publisher, original = p.run(input.id), plan = p.plan(original.plan);
    ensure(original.data.candidate, 'DBT_EXTRACTION_NOT_COMPLETE');
    ensure(input.expectedQueryHash === plan.data.queryHash, 'DBT_QUERY_SELECTION_CHANGED',
      'Select the original reviewed publisher query hash.');
    const candidate = await p.candidate(input.id);
    ensure(input.expectedCandidateHash === undefined || input.expectedCandidateHash === candidate.manifest.candidateDigest,
      'DBT_CANDIDATE_SELECTION_CHANGED');
    const node = await this.client.node(input.edition, input.uid);
    const directory = join(this.client.directory, 'native-bindings', input.id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const query = Buffer.from(plan.data.sourceQuery.sql, 'utf8');
    const provenance = Buffer.from(JSON.stringify({
      schema: this.sourceType === 'postgresql' ? 'stellar-forge.dbt-postgres-result-binding.v1' : 'stellar-forge.dbt-sqlite-result-binding.v1',
      sourceType: this.sourceType, projectId: this.#binding.projectId,
      edition: input.edition, uid: input.uid, manifest: node.artifact,
      publisherRun: input.id, publisherPlan: original.plan,
      sourceHash: plan.data.sourceHash, queryHash: plan.data.queryHash,
      planDigest: plan.data.digest, queryInput: plan.data.input, candidate: candidate.manifest,
      interpretation: 'Explicit operator-selected dbt context for this original publisher extraction.'
    }));
    return this.client.bindResult({
      edition: input.edition, uid: input.uid,
      file: join(p.directory, 'runs', input.id, 'data.csv'), expected_sha: candidate.manifest.csvHash,
      query_file: await persist(directory, 'query.sql', query),
      provenance_file: await persist(directory, 'provenance.json', provenance),
      source_kind: this.sourceType === 'postgresql' ? 'original-postgresql-publisher' : 'original-sqlite-publisher',
      original_request_id: input.id, request_id: input.request_id
    });
  }

  close() {
    if (this.#closing) return this.#closing;
    this.#closed = true;
    this.#closing = (async () => {
      // A callback which already owns a candidate/file must finish before the
      // original database/lease or Python client is closed. Cancellation remains
      // the native explicit cancel action, and no new operation can enter here.
      await Promise.allSettled([...this.#pending]);
      try { await this.publisher.close(); } finally { await this.client.close(); }
    })();
    return this.#closing;
  }
}

export class DbtSqliteProject extends DbtPublisherProject {
  static open(options = {}) { return super.open({ ...options, sourceType: 'sqlite' }); }
}
