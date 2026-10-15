// The Weekly Reconciliation — the bloom→sales bridge.
//
// For any week, compare the stems you'll actually CUT (your bloom plan, by
// variety) against the stems you've already PROMISED (weddings + market +
// wholesale, by variety), then build CSA bouquets from whatever surplus is left.
// You get, by variety: the shortfall to BUY IN and the surplus to PUSH TO MARKET.
//
// This is the exact reconcile the Stemwise demo runs client-side at
// https://getstemwise.com/app.html — it's the Sunday-night stem math a
// farmer-florist otherwise does by hand across three spreadsheets.

const keyOf = (name, variety) => `${String(name).toLowerCase()}|${String(variety || '').toLowerCase()}`;

function rollup(items) {
  const map = {};
  for (const it of items) {
    const k = keyOf(it.name, it.variety);
    if (!map[k]) map[k] = { name: it.name, variety: it.variety || '', stems: 0 };
    map[k].stems += Number(it.stems) || 0;
  }
  return map;
}

/**
 * @param {{
 *   availability?: Array<{name:string, variety?:string, stems:number}>,  // what you'll cut
 *   demand?:       Array<{name:string, variety?:string, stems:number}>,  // what you've promised (named demand)
 *   csa?:          {shares:number, stemsPerShare:number} | null          // bouquets built from leftover surplus
 * }} input
 */
export function reconcile({ availability = [], demand = [], csa = null } = {}) {
  const avail = rollup(availability);
  const dem = rollup(demand);

  const keys = new Set([...Object.keys(avail), ...Object.keys(dem)]);
  const rows = [...keys]
    .map((k) => {
      const cut = avail[k] ? avail[k].stems : 0;
      const need = dem[k] ? dem[k].stems : 0;
      const meta = avail[k] || dem[k];
      return { name: meta.name, variety: meta.variety, cut, need, net: cut - need };
    })
    .sort((a, b) => a.net - b.net); // shortfalls first

  let surplusPool = 0;
  let shortfallTotal = 0;
  const shortfalls = [];
  const surpluses = [];
  for (const r of rows) {
    if (r.net > 0) {
      surplusPool += r.net;
      surpluses.push({ ...r, surplus: r.net });
    } else if (r.net < 0) {
      shortfallTotal += -r.net;
      shortfalls.push({ ...r, buyIn: -r.net });
    }
  }

  const csaShares = csa ? Math.max(0, csa.shares || 0) : 0;
  const csaNeed = csaShares * (csa ? Math.max(0, csa.stemsPerShare || 0) : 0);
  const afterCsa = surplusPool - csaNeed;

  return {
    rows,
    surplusPool,
    shortfallTotal,
    shortfalls,                         // varieties you've overcommitted → buy these in
    surpluses,                          // varieties with extra → sell at market
    csaShares,
    csaNeed,
    csaCovered: afterCsa >= 0,
    marketLeftover: Math.max(0, afterCsa), // stems left to push to market after CSA is built
    csaShort: Math.max(0, -afterCsa),      // stems short of covering the CSA from surplus
  };
}
