# Receive a complete AMP country programme

Use the original IATI application and the programme runner in this directory. The runner receives complete publisher XML into the existing native dataset engine, builds the full financial portfolio, captures or receives the selected original AMP projects and installed configuration, applies the operator's reviewed mappings and whole-scope decisions, prepares complete native requests, continues their one original native journal, exports the full workspace and independently receives and reopens each edition.

The same programme can contain 1–32 complete publisher editions. A later edition uses the actual received native project, funding and transaction identities from the preceding edition. Changed source records return to review; provide the reviewed mapping and decisions for the new edition. Country programmes, source publishers, currencies, actual financial types, original dates and budget periods remain explicit in the source and reports.

## Inputs

Create one manifest with schema commons.iati-amp-programme-receiving.v1, a stable operation name, the named operator and an editions array. Each edition has:

| Field | Complete selected input |
|---|---|
| name, notes | The actual country programme and publisher edition description |
| sources | 1–32 original IATI activity XML descriptors; each has path, exact bytes and SHA256, plus an optional label |
| sourceReview | The named operator's recorded source-selection review |
| selection | The original IATI portfolio selection, or an empty object for the complete input |
| capture | Either an input descriptor for the original complete capture JSON, or the selected native connection, explicit projectIds, coverageNote and name |
| mapping | A descriptor of the complete reviewed AMP plan definition JSON |
| decisions | Optional whole-scope actions, each with the original selector and complete decision object |
| review | An object containing the named review actor and note for the complete current mapping |
| submitNative | Explicit true for the selected authorized native programme, or false to prepare and receive the complete commissioning handover |
| correspondence | For a following edition, any explicitly reviewed original before/after source row keys |

File descriptors use {path, bytes, sha256}. Resolve relative paths against the manifest's directory. The runner checks every whole original file before retaining it; XML remains unchanged in the original IATI source store. Keep the source publisher's original acquisition record with the case.

The mapping is the complete definition documented in ../AMP.md. Its portfolio and capture references are supplied by the runner after receiving the actual selected inputs. If they are present in the input mapping, they must match those actual records. All activity, currency, category, funding and transaction IDs must come from the selected AMP capture. Full project draft JSON is retained as text, and exact decimal amounts remain native JSON numbers. The runner supplies stable original request IDs for each stage; its case file records attempts and results.

For a following edition, the runner first uses amp.advance against the previous actual prepared/native plan and then applies the complete operator mapping. Preserve its actual previousPlan and explicit correspondence. The programme-wide decision selector and original selected-row SHA are evaluated against that edition's complete native IATI rows.

## Run the original programme

Use the existing Python 3.11+ and Node executable required by the original IATI application. For a native capture or write, supply the selected existing AMP account through AMP_NATIVE_USERNAME and AMP_NATIVE_PASSWORD_SHA1, or the original private --credentials-file. AMP_NATIVE_PASSWORD can supply a password locally to derive the original SHA-1 login value. Credentials remain outside the programme manifest, original source archive and native journal.

    python3 receiving/amp.py \
      --manifest /absolute/selected-programme.json \
      --case-directory /absolute/private/original-amp-case

Keep the same manifest and case directory when continuing. An OS lock covers the entire source, portfolio, native and independent-receiving programme. The stage record is retained before work begins; original request IDs recover accepted mutations after interruption. Native write intent and full receiving state belong to the original AMP workspace, including actual post-response native IDs.

A completed source capture can be imported with capture: {input: ...}. A live capture instead selects connection, projectIds, coverageNote and name exactly as the original amp-native-capture command. Authentication and installed layout must match the selected user, workspace and version. The public published Haiti demonstration can supply original read-only evidence; it is not an authorization to mutate that deployment.

## Continue an original native result

The programme stops at the actual current native state if an update needs reconciliation. Open the same workspace with the original browser or CLI, inspect the full request, raw response and actual current project, and complete amp-native-reconcile with its actual project ID. Continue the same programme command afterwards. It resumes the original run and skips completed steps. A response received before a local interruption is reconciled by read-only retrieval of its retained native ID.

The reviewed original capture is checked against the live installed configuration. An update also compares the complete original project preimage before sending. If either changed, open a new current capture and plan revision through the existing operator; preserve the original operation journal and actual result. Use a new explicitly named programme edition when its reviewed input changes.

## Complete output and independent reopening

The private case contains original manifest and copied input files, the one live original IATI workspace, per-edition complete AMP ZIPs, their independently received workspaces, re-exported ZIPs and the full programme stage record. The final result lists exact archive lengths and hashes, selected source/plan/capture identities, native run identity and actual receiving state for each edition.

Every AMP ZIP contains complete runtime source, upstream native contract and licence, all selected original publisher packets and preceding portfolio revisions, full native capture/request/response bodies, plan decisions, prepared requests and original native operation history. Its receiver validates complete archive members, reconstructs the original native portfolios, recomputes their exact financial analysis and compares the entire saved AMP programme.

The independent receiving stage starts a different empty native workspace, receives that ZIP, compares every retained plan, capture, request and native event, exports again, closes the process and opens the same received database. Continue from the received workspace using the original IATI browser, typed client, merchant tools and installed Applications entry. Native credentials are entered locally for any further authorized continuation.

Open the final workspace:

    python3 cli.py --workspace /absolute/private/original-amp-case/workspace serve

Select **AMP commissioning** in the original console. The Source, Mapping, Financial review, Native receiving and Handover tabs preserve the complete programme. The source-native runner prints status: complete only after every declared edition and independent receiving step completes; nativeWriteEditions states how many editions actually ran against the selected native destination.
