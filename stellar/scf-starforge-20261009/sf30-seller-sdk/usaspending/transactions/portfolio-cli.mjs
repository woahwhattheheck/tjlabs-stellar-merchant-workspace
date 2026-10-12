#!/usr/bin/env node
// MIT. Run the portfolio against the existing federal-awards SQLite workspace.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPortfolio, viewPortfolio, exportPortfolioDirectory, receivePortfolio, validatePortfolio } from './portfolio.mjs';

export const HELP = `Federal award portfolio — Node 22.13+
  node transactions/portfolio-cli.mjs inspect --packet portfolio.json
  node transactions/portfolio-cli.mjs export --workspace DIR --out NEW_DIR [--capture ID ...] [--reviews]
  node transactions/portfolio-cli.mjs receive --workspace DIR --packet portfolio.json --journal JOURNAL.json [--edition-map FILE] [--reviews]
  node transactions/portfolio-cli.mjs serve --workspace DIR [--port 0]

export uses original transaction captures, never new provider requests.
Without --capture, one latest complete capture per award is selected; all
alternatives are reported. --reviews explicitly includes private assessments.
receive uses the original AwardTransactions.receive method. Receive the original
award edition into the target workspace before its transaction portfolio.
The journal binds the target workspace, source packet and edition mapping.
`;
export function parseArgs(args) {
  const command = args[0] ?? 'help', options = {captures: []};
  const allowed = {help: [], inspect: ['packet'], export: ['workspace','out','capture','reviews','title'], receive: ['workspace','packet','journal','edition-map','reviews'], serve: ['workspace','port']}[command];
  if (!allowed) throw new Error('Unknown portfolio command: ' + command);
  for (let i = 1; i < args.length; i++) {
    const key = args[i].slice(2);
    if (!args[i].startsWith('--') || !allowed.includes(key)) throw new Error('Unknown option: ' + args[i]);
    if (key === 'reviews') { if (options.reviews) throw new Error('Duplicate --reviews'); options.reviews = true; continue; }
    const value = args[++i]; if (!value || value.startsWith('--')) throw new Error('Missing value for --' + key);
    if (key === 'capture') options.captures.push(value);
    else { if (Object.hasOwn(options, key)) throw new Error('Duplicate --' + key); options[key] = value; }
  }
  const required = {help: [], inspect: ['packet'], export: ['workspace','out'], receive: ['workspace','packet','journal'], serve: ['workspace']}[command];
  for (const key of required) if (!options[key]) throw new Error('--' + key + ' is required');
  return {command, options};
}
export async function main(args, {workspaceFactory, print = true} = {}) {
  const {command, options: o} = parseArgs(args);
  const emit = value => { if (print) process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); return value; };
  if (command === 'help') return emit(HELP);
  const packet = o.packet ? validatePortfolio(JSON.parse(await readFile(resolve(o.packet), 'utf8'))) : null;
  if (command === 'inspect') return emit(viewPortfolio(packet));
  const make = workspaceFactory ?? (async directory => { const {AwardWorkspace} = await import('../workspace.mjs'); return new AwardWorkspace(directory, {operator: 'Federal award portfolio operator'}); });
  const w = await make(resolve(o.workspace));
  let serving = false;
  try {
    if (command === 'export') return emit(await exportPortfolioDirectory(buildPortfolio(w.transactions, {captureIds: o.captures.length ? o.captures : undefined, title: o.title, includeReviews: !!o.reviews}), o.out));
    if (command === 'receive') return emit(await receivePortfolio(w.transactions, packet, {workspaceId: w.state().id, journalPath: o.journal, includeReviews: !!o.reviews, editionMap: o['edition-map'] ? JSON.parse(await readFile(o['edition-map'], 'utf8')) : {}}));
    const port = o.port === undefined ? 0 : Number(o.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be an integer from 0 to 65535');
    const {servePortfolio} = await import('./portfolio-server.mjs');
    const server = await servePortfolio(w, {port}); serving = true;
    const close = async () => { await server.close(); process.exitCode = 0; };
    process.once('SIGINT', close); process.once('SIGTERM', close);
    return emit({url: server.url, workspaceId: w.state().id});
  } finally { if (!serving) w.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(error => { process.stderr.write(JSON.stringify({error: error.code ?? 'PORTFOLIO_FAILED', message: error.message, ...(error.journalPath ? {journalPath: error.journalPath, completedCaptures: error.completedCaptures} : {})}) + '\n'); process.exitCode = 1; });
