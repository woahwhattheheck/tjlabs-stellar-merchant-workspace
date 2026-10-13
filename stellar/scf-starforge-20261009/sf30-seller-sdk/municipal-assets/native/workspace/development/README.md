# Included development operation

All included assets, locations, service requests, work orders, and round-trip events are development records. Their identifiers and project context explicitly say `DEV` or `DEVELOPMENT`.

Load them with `python -m workspace demo <private-workspace-directory>` from the original opportunity directory, then open the application. The loader retains the original files, saves their explicit field mappings, and labels the engagement references as a development exercise.

`target-assets-needs-repair.csv` differs from the source label for `DEV-A102`. Review that difference, prepare a replacement proposal, and import `target-assets-corrected.csv` to use the corrected original export. The two service requests intentionally have the same asset and summary so an operator can make an explicit keep-separate or vendor-merge decision.

Request `DEV-WO001` from `open` to `in_progress`. Its expected revision is 1. The generated change ID belongs to that actual local operation. Use it in the documented development return format in the main workspace guide. The reconciled result advances the local work order to revision 2 once.

The original acceptance engine processes these labeled records as a development operation. This directory contains no City inventory, vendor credential, product API endpoint, municipal authorization, or customer transaction.
