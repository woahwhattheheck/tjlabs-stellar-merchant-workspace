// Costs-up pricing for a bouquet CSA (flower subscription). Mirrors the free
// CSA Pricing Calculator at https://getstemwise.com/tools/csa-pricing-calculator.html

export const CSA_DEFAULTS = {
  shares: 30,        // members in the CSA
  weeks: 16,         // weeks in the season
  stems: 20,         // stems per bouquet
  costPerStem: 0.35, // your loaded cost to grow/buy one stem ($)
  packaging: 0.60,   // wrap / sleeve / jar cost per bouquet ($)
  laborMinutes: 6,   // minutes to build one bouquet
  laborRate: 20,     // your hourly labor rate ($/hr)
  margin: 50,        // target gross margin (%)
};

/**
 * Price that yields a target gross margin on a given variable cost:
 *   price = cost / (1 - margin)
 * Margin is clamped to [0, 0.89] so the math can't blow up near 100%.
 */
export function priceAtMargin(cost, marginPct) {
  const m = Math.min(0.89, Math.max(0, marginPct / 100));
  return cost / (1 - m);
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Full costs-up CSA model: per-bouquet cost, the price at your target margin,
 * the full-season member price, season-level revenue/cost/profit, and a
 * 40/50/60% margin comparison.
 *
 * @param {Partial<typeof CSA_DEFAULTS>} [input]
 */
export function csaPricing(input = {}) {
  const v = { ...CSA_DEFAULTS, ...input };

  const flowerCost = v.stems * v.costPerStem;
  const packCost = v.packaging;
  const laborCost = (v.laborMinutes / 60) * v.laborRate;
  const unitCost = flowerCost + packCost + laborCost;

  const pricePerWeek = priceAtMargin(unitCost, v.margin);
  const profitPerWeek = pricePerWeek - unitCost;
  const seasonPrice = pricePerWeek * v.weeks;
  const grossRevenue = seasonPrice * v.shares;
  const totalCost = unitCost * v.weeks * v.shares;
  const totalProfit = grossRevenue - totalCost;

  const tiers = [40, 50, 60].map((m) => {
    const p = priceAtMargin(unitCost, m);
    return {
      margin: m,
      pricePerWeek: round2(p),
      seasonPrice: Math.round(p * v.weeks),
      seasonProfit: Math.round((p - unitCost) * v.weeks * v.shares),
    };
  });

  return {
    inputs: v,
    costBreakdown: {
      flowerCost: round2(flowerCost),
      packCost: round2(packCost),
      laborCost: round2(laborCost),
    },
    unitCost: round2(unitCost),
    pricePerWeek: round2(pricePerWeek),
    profitPerWeek: round2(profitPerWeek),
    seasonPrice: round2(seasonPrice),
    grossRevenue: Math.round(grossRevenue),
    totalCost: Math.round(totalCost),
    totalProfit: Math.round(totalProfit),
    tiers,
  };
}
