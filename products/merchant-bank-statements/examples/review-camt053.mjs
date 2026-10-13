#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {readFileSync} from 'node:fs';
import {basename} from 'node:path';
import {readBankStatementSource} from '../../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/source.mjs';
import {summarizeCamtReport} from './camt-review-summary.mjs';

const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2 || args[0] === '--help') {
  console.error('Usage: node products/merchant-bank-statements/examples/review-camt053.mjs ORIGINAL.xml [EXISTING_INSTITUTION_NAMESPACE]');
  process.exitCode = args[0] === '--help' ? 0 : 2;
} else {
  try {
    const bytes = readFileSync(args[0]);
    const source = {
      format: 'CAMT053',
      file: {name: basename(args[0]), dataBase64: bytes.toString('base64')},
      camt: {detailPolicy: 'ENTRY_CURRENCY_TX_AMT'},
      ...(args[1] ? {accountNamespace: args[1]} : {})
    };
    const report = readBankStatementSource(source);
    console.log(JSON.stringify(summarizeCamtReport(report), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error.code || error.name,
      message: error.message,
      details: error.details || {}
    }, null, 2));
    process.exitCode = 1;
  }
}
