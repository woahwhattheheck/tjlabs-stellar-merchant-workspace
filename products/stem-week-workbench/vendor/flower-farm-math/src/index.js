// flower-farm-math — the open-source math behind Stemwise (https://getstemwise.com)
//
// Three pure, zero-dependency functions for the numbers a farmer-florist runs by
// hand every week:
//   weddingStems()  — arrangement list → real stem count + buy-in buffer + recipe split
//   csaPricing()    — costs-up bouquet-CSA pricing, season P&L, margin comparison
//   reconcile()     — the bloom→sales bridge: what to BUY IN vs PUSH TO MARKET, by variety
//
// MIT licensed. The hosted app (accounts, bloom plans, CSA management, the live
// weekly reconcile across your whole season) lives at https://getstemwise.com.

export { weddingStems, DEFAULT_BUFFER, DEFAULT_ROLE_SPLIT } from './wedding.js';
export { csaPricing, priceAtMargin, CSA_DEFAULTS } from './csa.js';
export { reconcile } from './reconcile.js';
export { ARRANGEMENTS, ARRANGEMENT_TYPES } from './arrangements.js';
