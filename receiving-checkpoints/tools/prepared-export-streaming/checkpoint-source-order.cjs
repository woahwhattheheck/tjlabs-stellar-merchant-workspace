'use strict';
// Preserve the exact archived source map's insertion order during native recovery.
function orderSourcesForCheckpoint(files, checkpoint, codec) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw Error('Select a complete source map');
  if (!checkpoint || checkpoint.schema !== 'commons.complete-export-job.v1' || !Array.isArray(checkpoint.groups) || !Array.isArray(checkpoint.entries)) throw Error('Select a retained complete export checkpoint');
  const original = Object.keys(files), ordered = [], seen = new Set();
  let finishedSource = false;
  for (const group of checkpoint.groups) {
    if (typeof group.key !== 'string') throw Error('Invalid checkpoint group');
    if (!group.key.startsWith('source/')) { finishedSource = true; continue; }
    if (finishedSource || group.count !== 1 || group.start !== ordered.length) throw Error('Retained source group order changed');
    const name = group.key.slice(7), entry = checkpoint.entries[group.start];
    if (!name || seen.has(name) || !Object.prototype.hasOwnProperty.call(files, name) || typeof files[name] !== 'string') throw Error('Retained source member is missing or repeated: ' + name);
    if (!entry || entry.name !== group.key || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('Retained source metadata changed: ' + name);
    const bytes = codec.utf8Encode(files[name]);
    if (bytes.length !== entry.bytes || codec.sha256Bytes(bytes) !== entry.sha256) throw Error('Native source differs from retained source: ' + name);
    seen.add(name); ordered.push([name, files[name]]);
  }
  if (ordered.length !== original.length || original.some(name => !seen.has(name))) throw Error('Complete native source set differs from retained source groups');
  return Object.fromEntries(ordered);
}
function compactPreparedPayloads(checkpoint) {
  if (!checkpoint || checkpoint.schema !== 'commons.complete-export-job.v1' || !Array.isArray(checkpoint.archive?.payloads) || !Array.isArray(checkpoint.archive?.entries)) throw Error('Select an original prepared checkpoint');
  const payloads = [], seen = new Map(), indices = [];
  for (const text of checkpoint.archive.payloads) {
    if (typeof text !== 'string') throw Error('Prepared payload is not immutable text');
    let index = seen.get(text);
    if (index === undefined) { index = payloads.length; seen.set(text, index); payloads.push(text); }
    indices.push(index);
  }
  const entries = checkpoint.archive.entries.map(entry => {
    if (!Number.isSafeInteger(entry.payload_index) || entry.payload_index < 0 || entry.payload_index >= indices.length) throw Error('Prepared payload index changed');
    return {...entry, payload_index: indices[entry.payload_index]};
  });
  return {...checkpoint, archive: {...checkpoint.archive, entries, payloads}};
}
module.exports = {orderSourcesForCheckpoint, compactPreparedPayloads};
