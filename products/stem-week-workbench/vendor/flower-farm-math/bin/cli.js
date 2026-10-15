#!/usr/bin/env node
import { weddingStems, csaPricing, reconcile, ARRANGEMENTS } from '../src/index.js';
import { readFileSync } from 'node:fs';

const [, , cmd, file] = process.argv;

function readInput(file) {
  if (file && file !== '-') return JSON.parse(readFileSync(file, 'utf8'));
  // read from stdin if piped, else {}
  try {
    const data = readFileSync(0, 'utf8').trim();
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function usage() {
  console.log(`flower-farm-math — the open-source math behind Stemwise (https://getstemwise.com)

Usage:
  flower-farm-math wedding   [file.json]   # stem count for a wedding
  flower-farm-math csa       [file.json]   # costs-up CSA pricing
  flower-farm-math reconcile [file.json]   # cut vs promised → buy-in & surplus, by variety
  flower-farm-math types                   # list known arrangement types

Reads JSON from a file or stdin. Examples in ./examples.`);
}

switch (cmd) {
  case 'wedding': {
    const input = readInput(file);
    const r = weddingStems(input.pieces || input, input.opts);
    console.log(`Arrangements: ${r.arrangements}`);
    console.log(`Stems (before buffer): ${r.total.toLocaleString()}`);
    console.log(`Stems with ${Math.round(r.buffer * 100)}% buy-in buffer: ${r.buffered.toLocaleString()}`);
    console.log(`Recipe split — focal ${r.roles.focal}, secondary ${r.roles.secondary}, filler ${r.roles.filler}, greenery ${r.roles.greenery}`);
    break;
  }
  case 'csa': {
    const r = csaPricing(readInput(file));
    console.log(`Per-bouquet cost: $${r.unitCost.toFixed(2)} (flowers $${r.costBreakdown.flowerCost.toFixed(2)} + pack $${r.costBreakdown.packCost.toFixed(2)} + labor $${r.costBreakdown.laborCost.toFixed(2)})`);
    console.log(`Price / week @ ${r.inputs.margin}% margin: $${r.pricePerWeek.toFixed(2)}  (profit $${r.profitPerWeek.toFixed(2)})`);
    console.log(`Full-season member price: $${r.seasonPrice.toFixed(2)}  (${r.inputs.weeks} weeks)`);
    console.log(`Season gross: $${r.grossRevenue.toLocaleString()}   Season profit: $${r.totalProfit.toLocaleString()}  (${r.inputs.shares} shares)`);
    console.log('Margin comparison:');
    for (const t of r.tiers) console.log(`  ${t.margin}% → $${t.pricePerWeek.toFixed(2)}/wk · $${t.seasonPrice.toLocaleString()}/season · $${t.seasonProfit.toLocaleString()} profit`);
    break;
  }
  case 'reconcile': {
    const r = reconcile(readInput(file));
    if (r.shortfalls.length) {
      console.log(`BUY IN — short ${r.shortfallTotal} stems across ${r.shortfalls.length} ${r.shortfalls.length === 1 ? 'variety' : 'varieties'}:`);
      for (const s of r.shortfalls) console.log(`  −${s.buyIn}  ${s.name}${s.variety ? ' / ' + s.variety : ''}`);
    } else {
      console.log('BUY IN — none, you are covered on every promised variety.');
    }
    console.log(`Surplus pool: ${r.surplusPool} stems`);
    if (r.csaShares) {
      console.log(`CSA: ${r.csaShares} shares need ${r.csaNeed} stems → ${r.csaCovered ? `covered, ${r.marketLeftover} stems left for market` : `short ${r.csaShort} stems`}`);
    } else {
      console.log(`Market: ${r.marketLeftover} stems to push.`);
    }
    break;
  }
  case 'types':
    for (const [k, v] of Object.entries(ARRANGEMENTS)) console.log(`  ${k.padEnd(20)} ${v.stems} stems  (${v.range[0]}–${v.range[1]})  ${v.label}`);
    break;
  default:
    usage();
    process.exit(cmd ? 1 : 0);
}
