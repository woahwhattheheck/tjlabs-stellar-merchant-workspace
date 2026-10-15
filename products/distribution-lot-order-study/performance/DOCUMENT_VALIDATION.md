# Complete original validation

Core retains a bounded cache keyed by the entire canonical base64 original. It remembers only independently decoded byte length and SHA256, never mutable document objects or arrays. Each validation still checks the supplied digest and length plus all metadata, identities and source relations. Changed bytes, claimed hashes, sizes, malformed encoding and metadata reject through the ordinary path. The cache holds at most 2048 entries and 64 MiB of estimated UTF-16 key plus digest memory; oversized originals remain uncached.

The retained measurement used746 complete authored source originals,606045 decoded bytes. Three ordinary full-study validations were654/646/648ms before;670/6/5ms after. The cold validation still performs the original byte checks. Every returned complete study byte matched. The executable measurement accepts the actual preceding Core source, current complete bank and retained fixture.
