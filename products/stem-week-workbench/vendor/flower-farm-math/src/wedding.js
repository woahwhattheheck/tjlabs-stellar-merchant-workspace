import { ARRANGEMENTS } from './arrangements.js';

// Default buy-in buffer. Florists order ~10–15% extra for breakage, blooms that
// won't open in time, and the stem that just won't behave. The hosted calculator
// uses 12%.
export const DEFAULT_BUFFER = 0.12;

// A sensible recipe split for garden-style work, by role. Greenery is the
// remainder so the four roles always sum back to the buffered total.
export const DEFAULT_ROLE_SPLIT = { focal: 0.30, secondary: 0.25, filler: 0.20 };

/**
 * Turn a wedding's arrangement list into a real stem count.
 *
 * @param {Array<{type?: string, label?: string, stems?: number, qty?: number}>} pieces
 *   Each piece is either a known `type` from ARRANGEMENTS (stems looked up for you)
 *   or a custom row with explicit `stems`. `qty` defaults to 1.
 * @param {{buffer?: number, roleSplit?: {focal:number, secondary:number, filler:number}}} [opts]
 * @returns {{lines, arrangements, total, buffer, buffered, roles}}
 */
export function weddingStems(pieces = [], opts = {}) {
  const buffer = opts.buffer ?? DEFAULT_BUFFER;
  const split = { ...DEFAULT_ROLE_SPLIT, ...(opts.roleSplit || {}) };

  let total = 0;
  let arrangements = 0;
  const lines = pieces.map((p) => {
    const def = p.type ? ARRANGEMENTS[p.type] : null;
    const stems = Number.isFinite(p.stems) ? p.stems : (def ? def.stems : 0);
    const qty = Number.isFinite(p.qty) ? p.qty : 1;
    const subtotal = Math.max(0, stems) * Math.max(0, qty);
    total += subtotal;
    if (qty > 0) arrangements++;
    return {
      label: p.label ?? (def ? def.label : p.type) ?? 'Custom',
      type: p.type ?? null,
      stems: Math.max(0, stems),
      qty: Math.max(0, qty),
      subtotal,
    };
  });

  const buffered = Math.ceil(total * (1 + buffer));
  const focal = Math.round(buffered * split.focal);
  const secondary = Math.round(buffered * split.secondary);
  const filler = Math.round(buffered * split.filler);
  const greenery = Math.max(0, buffered - focal - secondary - filler);

  return {
    lines,
    arrangements,
    total,
    buffer,
    buffered,
    roles: { focal, secondary, filler, greenery },
  };
}
