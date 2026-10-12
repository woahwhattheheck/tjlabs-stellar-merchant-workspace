// MIT. Original pricing merchant metadata and lazy source hooks.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../provider-contract.mjs';
import { pricingTools } from "../catalog/pricing.mjs";

export default defineMerchantProvider({
  schema: MERCHANT_PROVIDER_SCHEMA, id: "pricing", family: "pricing",
  title: "pricing merchant", order: 480, catalogOrder: 480,
  configKey: "pricing", summary: true, dependencies: [],
  // Complete native tariff portfolios retain the workspace's 64 MiB limit;
  // reserve one MiB for the original JSON-RPC and workspace selectors.
  maxRequestBytes: 65 * 1024 * 1024,
  configuration: { input: "pricingConnection", privateExports: false,
    read: async (value, { base, config, hostPath }) => await (await import("../pricing.mjs")).readPricingConfiguration(hostPath(value)) },
  tools: pricingTools,
  instructions: [
    {
      prefix:'merchant_pricing_performance_',order:402,
      text:'Use the original opened Pricing alias to compare a completed tariff selection against an immutable recorded usage version. Select HTTP 2xx, matched native events, inbox acceptance or exact paired service-period requests; preserve payment option, supplier and allowance scope. Save the complete source using performanceSha256 and the same request UUID, capture its manifest and download all four files through the existing retained reader. Inspect and receive that full envelope; attach source.json to the measured original Commercial quote. A revised month requires explicit proposedMonthlyRequests. Save its original tariff proposal, review all merchant commercial terms and retain both native request UUIDs before commit. After an interrupted reply, use the exact saved operation request. PERFORMANCE.md documents full source receiving and the original Pricing CLI.'
    },
    {
      prefix: 'merchant_pricing_tariff_', order: 401,
      text: 'Use the existing opened Pricing alias for tariff planning. Read one saved original version, compare graduated or volume schedules at exact monthly quantities, save its complete tariff review, then inspect one positive-volume selection and all commercial terms. Retain the returned selection and both caller-chosen native UUIDs before commit. Adopted quotes are explicit uniform per-request prices; monthly tier projections preserve their separate exact totals and rounding delta. Native repricing keeps the original saved-version, atomic option, valuation, revision and release-store controls. Download all original plan or pricing files by the manifest hashes. The portfolio operation retains its complete native JSON under portfolioSha256 for stable download and cold reopen. Supply selectionRequestId to export one original pricing request and its full tariff plan; repeat its retained digest for later download. Inspect the complete incoming portfolio through the original read-only source preflight to review its plan and request identities. Receive it after restoring the original Pricing WORKSPACE_BACKUP; the native receiver matches complete source, scenario and price-save identities. TARIFFS.md describes the complete SDK and existing pricing CLI workflow.'
    },
    {
      "prefix": "merchant_pricing_",
      "text": "For pricing, inspect declared aliases and open the original SF97 model. Capture seller and native observations through merchant_pricing_source; use captureSha256 to page the same source. Save merchant pricing reviews with the current original revision and a stable requestId. Repricing starts from a saved version and complete ordered options: preview explicit atomic edits, retain its exact reviewSha256, and save with the current price-decision revision. Inspect the saved manifest after an interrupted reply. Stage a retained original API package by its decision and review hash, then use the original release digest/generation controls for activation and startup. Each alias reports whether its staging store is this operator release store. Download original files through SHA-pinned chunks.",
      "order": 400
    }
  ],
  load: () => import("../pricing.mjs"),
  create: (module, config, options, dependencies) => new module.MerchantPricing(config),
  initialize: async options => (await import('../config.mjs')).initializePricingMerchant(options)
});
