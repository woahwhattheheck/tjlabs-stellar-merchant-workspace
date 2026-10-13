// MIT. Publish the complete financial operating guide through the existing reader.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { renderGrantMarkdown } from './grant-compose.mjs';

const DEFAULT_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const digest = value => createHash('sha256').update(value).digest('hex');
const gitBlob = value => createHash('sha1').update('blob ' + Buffer.byteLength(value) + '\0').update(value).digest('hex');
const fileIdentity = (path, value) => ({path, bytes: Buffer.byteLength(value), sha256: digest(value), git_blob: gitBlob(value)});

export function composeFinancialWalkthrough(markdown) {
  if (typeof markdown !== 'string' || !markdown.startsWith('# Merchant financial reviewer walkthrough\n')) {
    throw new Error('Select the complete original merchant financial walkthrough.');
  }
  let body = renderGrantMarkdown(markdown).replace(
    /href="\.\/(application\.md|product-and-finance\.md|source-index\.json)(?=["#?])/g,
    'href="./grant-data/$1'
  ).replace(/href="\.\/grant-data\/product-and-finance\.md(?=["#?])/g, 'href="./grant-companion.html')
    .replace(/href="\.\/grant-data\/application\.md(?=["#?])/g, 'href="./grant.html');
  body = body.replaceAll(
    'href="https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar-forge/developer-site/dist/grant-data/application.md',
    'href="./grant.html').replaceAll(
    'href="https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar-forge/developer-site/dist/grant-data/product-and-finance.md',
    'href="./grant-companion.html');
  const contents = [...body.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)]
    .map(match => '<li><a href="#' + match[1] + '">' + match[2] + '</a></li>').join('');
  return '<!doctype html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="description" content="Operate and review the complete merchant financial workflow: setup, invoice, payment, refund, bank reconciliation, customer close and receiving.">\n' +
    '<title>Merchant financial walkthrough — Stellar Forge</title>\n' +
    '<link rel="stylesheet" href="./grant.css">\n<link rel="icon" href="./favicon.svg" type="image/svg+xml">\n' +
    '</head>\n<body>\n<a class="skip" href="#financial-walkthrough">Skip to the walkthrough</a>\n' +
    '<header class="site-header"><a class="brand" href="./grant.html">Stellar Forge</a>' +
    '<nav aria-label="Financial walkthrough navigation"><a href="./grant.html">Application</a>' +
    '<a href="./grant-companion.html">Product and financing</a>' +
    '<a href="./grant-data/financial-walkthrough.md" download>Download complete guide</a></nav></header>\n' +
    '<main id="financial-walkthrough" class="shell"><div class="reading-layout">' +
    '<aside class="contents"><nav aria-label="Walkthrough contents"><ol>' + contents + '</ol></nav></aside>' +
    '<article class="application-prose" aria-label="Complete merchant financial walkthrough">\n' +
    body + '</article></div></main>\n' +
    '<footer class="site-footer shell"><p>Use the original selected merchant, customer account and saved source throughout this operating procedure. Print this complete guide through the browser\'s print command.</p></footer>\n' +
    '</body>\n</html>\n';
}

export async function runFinancialWalkthrough(argv = process.argv.slice(2)) {
  if (argv.length && (argv.length !== 2 || argv[0] !== '--directory' || !argv[1])) {
    throw new Error('Use --directory <existing developer-site dist>.');
  }
  const directory = argv.length ? resolve(argv[1]) : DEFAULT_DIRECTORY;
  const source = join(directory, 'grant-data', 'financial-walkthrough.md');
  const indexPath = join(directory, 'grant-data', 'source-index.json');
  const [markdown, indexText] = await Promise.all([readFile(source, 'utf8'), readFile(indexPath, 'utf8')]);
  const index = JSON.parse(indexText);
  if (index?.schema !== 'stellar-forge.grant-reviewer-source-index.v1') {
    throw new Error('Use the existing complete grant reader and its source index.');
  }
  const html = composeFinancialWalkthrough(markdown);
  const output = join(directory, 'grant-financial-walkthrough.html');
  const walkthrough = {
    ...index.financial_operations?.reviewer_walkthrough,
    schema: 'stellar-forge.grant-financial-walkthrough.v1',
    operation: 'SCF-FINANCIAL-REVIEWER-WALKTHROUGH-3FC8-20261013',
    source: fileIdentity('/grant-data/financial-walkthrough.md', markdown),
    page: fileIdentity('/grant-financial-walkthrough.html', html),
    renderer: 'stellar-forge/developer-site/grant-financial-walkthrough.mjs',
  };
  index.financial_operations = {...index.financial_operations,
    reviewer_walkthrough_route: walkthrough.page.path,
    reviewer_walkthrough_source: walkthrough.source.path, reviewer_walkthrough: walkthrough};
  await writeFile(output, html, 'utf8');
  await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
  return {source, sourceBytes: walkthrough.source.bytes, sourceSha256: walkthrough.source.sha256,
    output, outputBytes: walkthrough.page.bytes, outputSha256: walkthrough.page.sha256,
    sourceIndex: indexPath, walkthrough};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runFinancialWalkthrough().then(value => process.stdout.write(JSON.stringify(value) + '\n'))
    .catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
