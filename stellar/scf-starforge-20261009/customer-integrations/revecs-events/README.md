# Biotech Catalyst Sentinel event workspace

Complete customer receiving, event monitoring and portable handover for the provider's original paid event API.

The package supplies a private local browser operator and command line interface. It retains every response before advancing the event cursor, preserves co-filer watchlists and source-linked timelines, applies corrections and lifecycle changes, and exports a complete saved workspace with an offline reader and local operator.

Read [the operating guide](revecs_events/OPERATING.md) for the public preview, paid receiving, restart, full history reconciliation, local replay and handover. Python 3.11 or later on Linux is required. Payment dependencies are optional for local review and export.

The complete published sample and metadata are included under examples/. Source contract identities and retrieval times are recorded in UPSTREAM.json. The original Revecs payment example and x402 SDK retain their respective MIT notices.

## Quick preview

```sh
python3 -m revecs_events init ./preview --preview --name "Biotech event preview"
python3 -m revecs_events preview ./preview ./examples/provider-events-sample.json --metadata ./examples/provider-meta.json
python3 -m revecs_events serve ./preview
```

The operator prints its private local link. Use the Catalysts, Receiving history and Workspace & handover screens to inspect the complete package.
