# Complete commercial reporting exercise

The supplied fictional workflow contains eight consecutive service cases and one valid source input from each of all fifteen commercial record families. Named technical and commercial reviews bind the complete 23-input frozen report. The generated study and report are included in `examples/financial-report-complete.study.json` and `examples/financial-report-complete.json`.

The exercise also retains three negative paths: a changed payment-row digest, a payment original first available after the report cutoff, and two current rows claiming the same report business identity. Each remains an explicit failed source binding; none silently rewrites the historical report.

Run `node verify.cjs` for this exercise and the other maintained application courses. To run this exercise alone, call `require("./verification/financial-report-peer.cjs").run()` from the application root. The course executes actual JavaScript modules against authored fictional source. It does not require external service credentials. The original contribution guide and manifest remain under `contributions/`.
