# Document merchant

Sell document generation through the existing Stellar paid Jobs service. A customer supplies a complete HTML or Markdown file, reviews the original payment, and receives a PDF together with the unchanged editable source and complete request metadata.

The product supplies the renderer configuration and application for three existing services:

| Service | Source input | Native endpoint | Supplier unit |
| --- | --- | --- | --- |
| [MintPDF](https://mintpdf.dev/openapi.json) | HTML or Markdown | POST https://mintpdf.dev/v1/pdf | Render |
| [snaplab](https://snaplab.dev/docs) | HTML | POST https://snaplab.dev/api/render | Successful non-cached render; a cache hit is free |
| [PDFMint](https://pdf.mintapis.com/docs) | HTML or Markdown | POST https://pdf.mintapis.com/v1/pdf | Successful document, regardless of page count |

Provider contracts and plan data were read on **12 October 2026**. MintPDF and PDFMint are separate services with separate keys and plans. The installed provider catalog includes the original source URLs and selected limits.

## Install and run

Use the maintained merchant package or its source checkout. Build `--selection document-merchant` for the complete document service with its original customer and merchant interfaces. The [build and installation instructions](OPERATING.md#build-and-install-the-complete-document-package) cover the archive, direct executable and existing private runtime installer. The distribution contribution registers the command and typed package export:

~~~sh
starforge document-merchant template --provider mintpdf --out /srv/starforge/document-input/setup.json
~~~

Set the template's actual HTTPS merchant origin, settlement network, asset, recipient and per-document amount. Choose the provider plan already held by the merchant and name its key environment variable. Then prepare and run the original paid service:

~~~sh
starforge document-merchant prepare \
  --request /srv/starforge/document-input/setup.json \
  --directory /srv/starforge/documents

starforge document-merchant serve \
  --directory /srv/starforge/documents \
  --native-factory /srv/starforge/native-runtime.mjs \
  --start-worker
~~~

From a source checkout the same entrypoint is:

~~~sh
node products/document-merchant/cli.mjs --help
~~~

The complete [operating guide](OPERATING.md) covers credentials, pricing, private file input, native customer checkout, complete result receiving and the original recovery operations.

## What the customer receives

Every successful document request returns the original Jobs package with four required named files:

| Slot | File | Use |
| --- | --- | --- |
| pdf | document.pdf | Finished PDF bytes |
| source | source.html or source.md | Unchanged complete editable source |
| request | request.json | Original task reference, input and effective renderer settings |
| render | render.json | Actual provider request and response metadata, source and PDF identity, and returned usage |

The existing request, sealed input-file store, checkout, paid job, native settlement outbox, named-result package and customer resource library retain their original ownership. A provider key stays in the merchant's selected environment. The customer submits the whole file through the existing Request application.

A paid request produces one document package. Several requests can belong to one larger customer task. The task reference, complete buyer acceptance, original merchant payment, supplier usage and PDF page count remain separate quantities.

## Files

- contracts.mjs defines supported provider input, native request bodies, limits and dated plans.
- renderer.mjs performs one actual supplier call and receives the complete PDF.
- setup.mjs materializes a retained application and native Jobs configuration using the existing Linux lease and owned-file writer.
- cli.mjs runs setup, price review, actual supplier usage and the original merchant operator.
- examples/report.html and examples/report.md provide complete editable sample documents.
- index.mjs and index.d.mts expose the installed JavaScript and type interfaces.

The generated application contains the complete selected renderer code and provider configuration in one module. The original Jobs application hash therefore identifies the actual code used by the paid worker.

## Customer batch fulfillment

The installed `document-merchant batch` commands turn a customer's reports, invoices or cards into a complete delivered document set. They use the original Request, native Checkout, Jobs and Resource library; the saved plan binds all source files and prices before execution. See [the complete batch workflow](BATCHES.md) for configuration, price review, continuation and portable customer delivery.

~~~sh
starforge document-merchant batch --help
~~~
