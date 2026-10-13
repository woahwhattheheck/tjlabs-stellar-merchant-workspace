# Original issuer-example analysis

The current analysis module was executed in the available V8 runtime against the two exact JSON transcriptions included under examples/. This exercised the analysis and report-generation code; the complete Node/native SDK and rendered browser course belongs to the original equipped receiving operation.

The capacity response contains six source series and two monthly labels. It retains the issuer's original Others group and an unspecified port identity.

| Source series | February 2022 | March 2022 | Exact change | Change % |
| --- | ---: | ---: | ---: | ---: |
| Mediterranean Shipping | 84,622 | 156,663 | 72,041 | 85.1327 |
| Hapag-Lloyd | 61,658 | 95,629 | 33,971 | 55.0959 |
| CMA CGM | 54,621 | 74,605 | 19,984 | 36.5867 |
| Maersk | 18,385 | 29,990 | 11,605 | 63.1221 |
| Ocean Network Express | 13,918 | 235 | −13,683 | −98.3115 |
| Others | 38,394 | 26,042 | −12,352 | −32.1717 |

The separate container-traffic response retains its native 2022-02-21 date, imports 34,850, exports 26,635 and transshipment null. Its frequency remains undeclared, and no monthly total is inferred.

A local January-to-April capacity selection reports January 1 as a missing monthly label. A February 1-to-February 15 selection retains selected source observations with monthly completeness uncomputed. Both full report paths include selected coverage and distinct source-state counts.

Source hashes:
- capacity.response.json: 5c9eba876ecf179a1c65aeddf5ce0159cb63c6a3c62c6a48705e2d307ca57d11
- traffic.response.json: 673c8bcc57cb15f550366c97dd27dc0ed6c372a08c7c96400476a4f20f9b3e6d
- original issuer YAML: c271e5e1799a7a47b3f598cdf286d25c7bb68108cd9f3e466231f4f95a82c915

The named issuer examples come from the retained OpenAPI. The JSON transcription preserves their published values; lexical precision provenance points to that transcription, while the complete YAML remains available for original-source review.
