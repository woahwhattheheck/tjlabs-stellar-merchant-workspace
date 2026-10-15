# Equipment Service and Entitlement Study Desk

Open **Equipment_Service_Study_Desk.html** in a modern browser. It starts empty and operates offline. Select **Open complete authored workflow** to explore the fictional eight-case example. The file contains the complete runnable source and offers its own source ZIP download.

The desk reconciles a supplied equipment-service record chain: customer and site, serialized unit and parent system, actual prescribed procedure, model-specific eligibility, inspection observations, approved work, issued certificates and actual customer delivery. It also preserves quote quantities, partial approvals, purchased-unit first service, diagnosis-to-replacement credits, warranty settlement and separate rental-unit custody.

No procedure, test answer, signature, statutory interval or equipment-release decision is generated. The supplied people and original records remain authoritative. A complete record chain is a consistency result, not a release decision.

## Normal workflow

1. Define the study and complete consecutive intake window in **Study scope** and **Population & work plan**. Retain unsupported models, declined work, unresolved identity and unfinished service.
2. Import original CSVs in **CSV intake & mapping**. Choose a canonical family and side, retain the original file, then explicitly map its columns. An unmapped field remains unavailable; an observed blank remains blank.
3. Retain prescribed forms, certificates, approvals, purchase and financial documents in **Supporting originals**. Correct source availability using actual evidence. Capture time, source availability and event time are separate.
4. Select exact retained extracts and apply explicit source-to-return identity maps. Equal row counts alone cannot establish agreement.
5. Enter source-backed observations or corrections in **Observed records**. Each correction retains its original extract, prior state and unfinished form. Helpers bind exact procedure, configuration, quoted-line and report-input hashes.
6. Review **Technical record chain** and **Commercial records**. Follow issues to the actual source rows and documents. A later corrected delivery does not erase an earlier wrong-recipient event.
7. Record named reviews against the complete current study, then save the complete session and export the readable report, editable canonical CSVs, original bytes and recovery history.

Save the complete session before moving browsers or computers. Browser storage is local to that browser and origin. **Save & recover** retains competing browser branches and permits explicit selection; it never silently overwrites a different saved branch.

## Included files

- `OPERATOR.md`: ordinary forms, source mapping, historical interpretation and recovery.
- `DOMAIN_CONTRACT.md`: technical-service record semantics.
- `COMMERCE.md` and `ADAPTER_CONTRACT.md`: complete commercial engine and its historical context.
- `NATIVE.md`: Node command-line operations and exact source rebuild.
- `templates/`: all 37 exact canonical CSV headers.
- `examples/`: full authored study/session and the maintained workflow source.
- `verification/`: the actual source-native execution records and their receiving limits.
- `SOURCE_MANIFEST.json`: every maintained source member’s exact size and SHA-256.

The standalone HTML and source ZIP are generated from the same source list. The native renderer sorts that list itself, and reads the source manifest once, so different caller order cannot alter the rebuilt HTML.
