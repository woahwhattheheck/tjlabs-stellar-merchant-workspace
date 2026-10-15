# Verified immutable workspace reuse

The current core deeply freezes every successfully created, applied or received workspace before marking its identity trusted. Repeated read-only queries reuse only those exact frozen object identities. Mutable received clones still pass complete byte/hash checks and replay of every original operation before becoming trusted. Exported envelopes contain detached objects and cannot mutate the trusted workspace. Receipt membership uses a Set, retaining the exact original order and output.

The same original twenty-operation authored course reproduced the original working envelope exactly. Its measured execution in this V8 seat decreased from 5,929 ms to 1,244 ms. This is not a native browser or Node benchmark. A mutated detached original source was rejected; the returned root and nested source body were both frozen. Root owns the one independent 1,000-row × 25-field capacity course.
