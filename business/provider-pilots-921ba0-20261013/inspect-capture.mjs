#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { openSync, fstatSync, readSync, closeSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { projectNeverminedSettlement, projectAisaUsageCapture, combineAisaUsageCaptures } from './provider-projections.mjs';
import { projectBlockrunUsageCapture } from './blockrun-projections.mjs';

function readCapture(path, maximum = 1024 * 1024) {
  if (!isAbsolute(path)) throw new Error('Use an absolute capture path.');
  const fd = openSync(path, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maximum) throw new Error('Capture must be a regular JSON file within the selected input limit.');
    const bytes = Buffer.alloc(maximum + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, null);
      if (!count) break;
      size += count;
    }
    if (size > maximum) throw new Error('Capture grew beyond the selected input limit.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)));
  } finally {
    closeSync(fd);
  }
}
try {
  const [kind, path, ...extra] = process.argv.slice(2);
  const projectors = {nevermined:projectNeverminedSettlement, aisa:projectAisaUsageCapture, 'aisa-combine':combineAisaUsageCaptures, blockrun:projectBlockrunUsageCapture};
  const project = Object.hasOwn(projectors, kind) ? projectors[kind] : null;
  if (!project || !path || extra.length) throw new Error('Usage: node inspect-capture.mjs nevermined|aisa|aisa-combine|blockrun /absolute/capture.json');
  const result = project(readCapture(path, kind === 'blockrun' ? 32 * 1024 * 1024 : 1024 * 1024));
  writeFileSync(1, JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  process.exitCode = 2;
  try { writeFileSync(2, String(error.code || error.message || error) + '\n'); } catch {}
}
