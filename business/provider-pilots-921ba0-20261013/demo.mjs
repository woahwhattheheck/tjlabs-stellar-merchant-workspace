#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { readFileSync, writeFileSync } from 'node:fs';
import { projectNeverminedSettlement, planAisaUsageWindows, combineAisaUsageCaptures } from './provider-projections.mjs';

const examples = JSON.parse(readFileSync(new URL('./examples.json', import.meta.url), 'utf8'));
const output = {
  notice: examples.notice,
  nevermined: Object.fromEntries(Object.entries(examples.nevermined).map(([name, value]) => [name, projectNeverminedSettlement(value)])),
  aisa: { windows: [...planAisaUsageWindows(examples.aisa)], combined: combineAisaUsageCaptures(examples.aisa.captures) }
};
writeFileSync(1, JSON.stringify(output, null, 2) + '\n');
