#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {createSourceCarrierReader} = require('./connected_source_carriers.cjs');
const {sha256Bytes, sha256Utf8} = require('./connected_sha256.cjs');
const {projectSlackReadFailure} = require('./connected_slack_pages.cjs');

function main(argv) {
  const inputs = [], limits = {};
  let manifestPath = null, output = null;
  const help = [
    'Receive complete source files from retained JSON or Slack Canvas Markdown.',
    '',
    'node host/receive_source_carriers.cjs --input FILE [--input FILE ...]',
    '  [--manifest SELECTED_MANIFEST.json] [--out DIRECTORY]',
    '  [--max-input-chars N] [--max-file-bytes N] [--max-total-bytes N]',
    '',
    'Without --out, prints the complete selected manifest and read result.',
    'With --out, writes that full selected source tree. Existing identical files',
    'are reused; different existing files produce an error before writing.',
    'New files are synced and published atomically under create-only names.',
    'Keep the original input files alongside the existing operation record.'
  ].join('\n');
  const value = (flag, i) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error('Missing value for ' + flag);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') { process.stdout.write(help + '\n'); return; }
    if (flag === '--input') inputs.push(path.resolve(value(flag, i++)));
    else if (flag === '--manifest') manifestPath = path.resolve(value(flag, i++));
    else if (flag === '--out') output = path.resolve(value(flag, i++));
    else if (['--max-input-chars', '--max-file-bytes', '--max-total-bytes'].includes(flag)) {
      const n = Number(value(flag, i++));
      if (!Number.isSafeInteger(n) || n < 1) throw new Error('Expected a positive integer for ' + flag);
      limits[flag.slice(2).replaceAll('-', '_')] = n;
    } else throw new Error('Unknown argument: ' + flag);
  }
  if (!inputs.length) throw new Error('At least one --input file is required; use --help for usage');
  const reader = createSourceCarrierReader({sha256Bytes, sha256Utf8, projectSlackReadFailure});
  const readUtf8 = file => {
    const bytes = fs.readFileSync(file), text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('Input is not complete UTF-8: ' + file);
    return text;
  };
  const options = {limits};
  if (manifestPath) {
    const original = readUtf8(manifestPath);
    options.manifest = JSON.parse(reader.normalizeJsonWhitespace(original).text);
  }
  const result = reader.read(inputs.map(file => ({id: file, value: readUtf8(file)})), options);
  const summary = {
    status: result.status, coverage: result.coverage, manifest: result.manifest,
    input_files: result.sources.map(({id, retained_representation_utf8}) => ({path: id, ...retained_representation_utf8})),
    normalizations: result.normalizations, issues: result.issues,
    unselected: result.unselected, ignored_json_records: result.ignored
  };
  if (!result.complete) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    process.exitCode = 1;
    return;
  }
  if (output) {
    const exists = file => {
      try { return fs.lstatSync(file); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    };
    const rootStat = exists(output);
    if (rootStat && (!rootStat.isDirectory() || rootStat.isSymbolicLink())) {
      throw new Error('Output must be a directory: ' + output);
    }
    const planned = [], destinations = new Set();
    for (const file of result.files) {
      const parts = file.path.split('/');
      if (file.path.includes('\\') || parts.some(part => !part || part === '.' || part === '..') || path.isAbsolute(file.path)) {
        throw new Error('Source path must be relative to the selected output directory: ' + file.path);
      }
      const target = path.resolve(output, ...parts);
      if (!target.startsWith(output + path.sep) || destinations.has(target)) {
        throw new Error('Source paths overlap or escape the selected output directory: ' + file.path);
      }
      destinations.add(target);
      let parent = output;
      for (const part of parts.slice(0, -1)) {
        parent = path.join(parent, part);
        const stat = exists(parent);
        if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('Source parent is not a directory: ' + parent);
      }
      const stat = exists(target);
      if (stat) {
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Source destination is not a regular file: ' + target);
        const actual = sha256Bytes(fs.readFileSync(target));
        if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) {
          throw new Error('Different existing source at ' + target + '; receive into a new directory or compose the selected editions explicitly');
        }
      }
      planned.push({file, target, existing: Boolean(stat)});
    }
    fs.mkdirSync(output, {recursive: true, mode: 0o700});
    let written = 0, reused = 0;
    for (const item of planned) {
      if (item.existing) { reused++; continue; }
      fs.mkdirSync(path.dirname(item.target), {recursive: true, mode: 0o700});
      const parent = path.dirname(item.target);
      const temporaryDirectory = fs.mkdtempSync(path.join(parent, '.source-member-'));
      const temporary = path.join(temporaryDirectory, 'content');
      let descriptor = null;
      try {
        descriptor = fs.openSync(temporary, 'wx', 0o600);
        fs.writeFileSync(descriptor, item.file.content, {encoding: 'utf8'});
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = null;
        const complete = sha256Bytes(fs.readFileSync(temporary));
        if (complete.bytes !== item.file.bytes || complete.sha256 !== item.file.sha256) {
          throw new Error('Complete staged source differs at ' + item.target);
        }
        let published = false;
        try {
          // The complete inode becomes visible under a new final name at once.
          // A concurrent writer keeps its original destination and is read below.
          fs.linkSync(temporary, item.target);
          published = true;
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }
        const retained = fs.lstatSync(item.target);
        if (!retained.isFile() || retained.isSymbolicLink()) {
          throw new Error('Source destination is not a regular file: ' + item.target);
        }
        const actual = sha256Bytes(fs.readFileSync(item.target));
        if (actual.bytes !== item.file.bytes || actual.sha256 !== item.file.sha256) {
          throw new Error('Different source was published concurrently at ' + item.target);
        }
        if (process.platform !== 'win32') {
          const directory = fs.openSync(parent, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY || 0));
          try { fs.fsyncSync(directory); }
          finally { fs.closeSync(directory); }
        }
        if (published) written++;
        else reused++;
      } finally {
        if (descriptor !== null) fs.closeSync(descriptor);
        try { fs.unlinkSync(temporary); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        fs.rmdirSync(temporaryDirectory);
      }
    }
    summary.materialization = {directory: output, written_files: written, reused_files: reused};
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

try { main(process.argv.slice(2)); }
catch (error) {
  process.stderr.write('receive-source-carriers: ' + error.message + '\n');
  process.exitCode = 1;
}
