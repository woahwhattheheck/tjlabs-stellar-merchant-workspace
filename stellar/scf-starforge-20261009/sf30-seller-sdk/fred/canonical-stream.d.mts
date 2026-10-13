/** Primitive semantics used by the original canonical serializer. */
export interface FredCanonicalOptions {
  primitive?: (value: unknown) => string;
}
export interface FredCanonicalInfo {
  sha256: string;
  /** UTF-8 bytes of the original sorted-key compact JSON, without a newline. */
  bytes: number;
  /** UTF-8 bytes of JSON.stringify(value, null, 2) for JSON-safe graphs, without a newline. */
  prettyBytes: number;
}
export declare function canonicalJSONChunks(value: unknown, options?: FredCanonicalOptions): Generator<string, void, unknown>;
export declare function canonicalJSONInfo(value: unknown, options?: FredCanonicalOptions): FredCanonicalInfo;
export declare function canonicalJSONDigest(value: unknown, options?: FredCanonicalOptions): string;
