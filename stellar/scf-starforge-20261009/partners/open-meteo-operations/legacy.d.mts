// MIT. Complete original frozen ZIP conversion.
import type { WeatherHandover } from './portable.mjs';
export function weatherHandoverFromZip(bytes: Uint8Array,options?: {
 expectedArchiveSha256?: string; python?: string; signal?: AbortSignal;
}): Promise<WeatherHandover>;
