import type { ConsumerValues, WalletState, WalletView } from './consumer.mjs';
export type { ConsumerValues, WalletState, WalletView } from './consumer.mjs';
export const WALLET_SCHEMA: 'tjlabs.prices-workbench.wallet-values.v1';
export function verifyWalletState(input: WalletState): WalletState;
export function walletView(input: WalletState): WalletView;
export function receiveConsumerFeed(previous: WalletState | null, incoming: ConsumerValues, options?: { receivedAt?: string }): { outcome: 'received' | 'replayed' | 'retained_older'; state: WalletState; view: WalletView };
