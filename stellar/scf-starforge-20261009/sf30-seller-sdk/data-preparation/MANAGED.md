# Managed data preparation

The complete installed operator and customer workflow is in [Data preparation operating guide](../../../../products/data-preparation/OPERATING.md).

Use the source selection **data-preparation-workspace**. Its Applications provider opens the original saved preparation engine through **data-preparation-managed**, and **data-preparation-workspaces** registers the 21 typed merchant tools.

The original SQL, browser, CLI and transfer files remain the native implementation. The managed layer adds an exclusive listener lease, private current-instance attachment, complete persistent delivery operations and independently editable customer receiving. Completed deliveries under the original workspace's managed-deliveries directory remain available after Applications stops.

The typed connection, managed launcher/receiver and merchant API are exported under **./seller/data-preparation/connection**, **./seller/data-preparation/managed** and **./seller/data-preparation/mcp**. Original client exports and the native **data-preparation** command are retained.
