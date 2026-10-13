import type {BridgeRead,BridgeSelection,BridgePrivateConfiguration} from './operator.mjs';
import type {OriginalEndpointBinding} from './bridge-provider.mjs';
export interface BridgeSource {
  describe():BridgeSelection;normalizeRead(input:BridgeRead):BridgeRead;
  read(input:BridgeRead,options?:{signal?:AbortSignal}):Promise<Record<string,unknown>>;
  close():Promise<{state:'CLOSED'}>;
}
export function normalizeBridgeBinding(input:OriginalEndpointBinding):Required<Pick<OriginalEndpointBinding,'developerId'|'customerIds'|'virtualAccounts'>>;
export function normalizeBridgeRead(input:BridgeRead,binding:OriginalEndpointBinding):BridgeRead;
export function openBridgeSource(input:BridgePrivateConfiguration):BridgeSource;
export function openRetainedBridgeSource(input:BridgeSelection):BridgeSource;
