# Water Operations Study Desk

Open **Water_Operations_Study_Desk.html** in a current desktop browser. The desk starts with an empty study. Choose **Open complete authored workflow** for the fictional three-system example.

The desk reconciles supplied schedules, field readings, sample custody and laboratory evidence with actual reporting packets, dispatch receipts and handovers. It retains original files, source editions and unfinished work. It does not operate treatment equipment or supply regulatory deadlines, treatment instructions or compliance determinations.

## Ordinary workflow

1. Set the study scope and actual source boundaries.
2. Retain supporting originals and their source availability.
3. Import each supplied CSV in **CSV intake & mapping**. Map exact columns; leave unavailable columns unmapped.
4. Select the actual retained editions, then inspect or correct records in **Observed records**.
5. Set the complete scheduled-work population, source cutoff, laboratory counts and recurring work phases in **Population & work plan**.
6. Inspect **Laboratory records** and **Water operations**. Keep unfulfilled, rejected, late and unresolved records visible.
7. Bind exact report inputs and named reviews, retain actual dispatch/receipt records, and prepare the actual handover acknowledgement.
8. Save the complete session and export the readable report, canonical CSVs, supporting originals and source code.

**OPERATOR.md** explains each section. **DOMAIN_CONTRACT.md** describes exact operational meaning. **LABORATORY.md** and **LAB_ADAPTER_CONTRACT.md** describe the included laboratory engine. **NATIVE.md** gives command-line examples. **RECEIVING.md** separates executed source courses from actual operating-system and browser receiving.

The canonical contract is **DOMAIN_HEADERS.json** and the 36 files in **templates/**. Programme planning worksheets are separate from these import templates. The complete source is included; no account or external API is required for the offline desk.
