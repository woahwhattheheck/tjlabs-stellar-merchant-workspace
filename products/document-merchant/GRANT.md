## Document processing and complete customer receiving

A report publisher, agency or analyst can commission a document service that carries the customer's editable input through a paid rendering job into a complete reusable delivery. The maintained Document merchant joins supplier configuration, Stellar payment terms, customer Requests, Jobs, document output and receiving in the original application. The customer receives the PDF together with the source and the information needed to relate it to the original request.

### Configure and operate the saved merchant

The [Document merchant Applications guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/039e8f2a82fa1e63bc72894a748cf7c0a24ef9f4/products/document-merchant/APPLICATIONS.md) describes the installed workflow delivered in [Merchant PR813](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/813). Select the actual MintPDF, snaplab or PDFMint supplier, its account plan, supported source formats, queue and worker limits. The editable setup retains the merchant's public HTTPS origin, native asset, recipient and amount. The operating host's private environment supplies the actual provider key and payment-factory configuration.

In the existing Runtime Workspace, open **Applications**, select **Document merchant**, and choose the original document directory, complete setup, native payment factory and private environment. Review the seller, customer and private operator listeners, the original worker and any configured completed-result delivery. Use **Review**, **Save**, **Review Start** and **Start**. The saved application receives the original authenticated Jobs announcement and opens the selected Jobs, Input receiving, Job resolution or Result delivery page.

The document directory retains its original setup and merchant state. A newly reviewed directory is prepared on first start; an existing directory reopens its retained merchant. The generic Paid-job merchant application and Document merchant refer to that same underlying resource when they select the same merchant-state directory. The published HTTPS origin remains the customer entry point.

### Fulfill and receive the whole customer document

Export the merchant's complete customer setup:

```sh
document-merchant customer-setup \
  --directory /absolute/private/document-service \
  --out /absolute/private/document-customer-setup.json
```

The customer opens its existing **Request** application, loads that origin, selects `renderHtml` or the supported `renderMarkdown` function, and supplies the complete editable source file, title and original task reference. The request and native checkout retain that exact input and advertised one-document price. After the original purchase settles, the configured worker calls the selected supplier and produces the complete delivery.

|Delivered slot|What the receiving customer gets|
|  ---  |  ---  |
|PDF|The complete binary document.pdf.|
|Source|The unchanged UTF-8 HTML or Markdown submitted for that document.|
|Request|Complete source and rendering-request metadata, including the original task reference.|
|Render|The actual supplier response metadata and resulting document identity.|


The customer's existing resource library receives all four files. Multi-document batches use the same original Requests, checkouts, Jobs and complete Collection export. Their saved batch operation continues an accepted request through recovery and receiving. In the Commons customer workflow, the rendered Lead Pack uses the saved HTML edition and attaches its PDF to the original Case Desk delivery, preserving that case and edition.

### Maintain the service and continue customer work

Supplier consumption and the merchant's customer price have their own recorded basis. **Price** review uses the saved supplier plan and native payment terms; **Usage** reads the supplier's actual account endpoint and saves its complete response. A 25-document planning review can use `document-merchant price --directory /absolute/private/document-service --documents 25 --supplier-units 25`. The selected account plan and returned usage determine the operating allowance.

**Stop** closes admission on the original listeners, drains the worker and configured delivery dispatcher, and releases the merchant state. **Review Start** and **Start** then reopen the same saved application, retained requests, completed files and eligible jobs. Interrupted setup continues from its retained setup and generated files. A supplier authentication or allowance failure remains attached to its original job; after the account issue is corrected, the operator uses that job's existing resolution or retry action.

Receive the completed immutable document-product distribution into the existing Runtime Workspace and reopen Applications to load its current catalogue. For customer commissioning, operate the actual merchant factory and customer workspace: start the managed service, fulfill the selected original HTML or Markdown through the existing batch, receive all four files, attach the output to its original task, and reopen the same completed job after stopping and restarting the application.

### Commissioning within the existing funded work

The workorder specifies the paying organization, allowed input formats, required document output, actual supplier account, native merchant resource and price, receiving application, delivery destination and support responsibility. Initial implementation configures that useful service and hands it to a second operator. A subsequent customer document or explicitly selected batch creates the next billable task under its advertised terms.

T1 maps the customer's input, supplier, merchant output and receiving application and completes operator handover. T2 carries the agreed original document through buyer intent, facilitator and ledger operations and resolves an interrupted paid delivery in that same customer task. T3 commissions the production service, returning customer work, retained editable source, complete receiving and independent maintenance. These adaptations use the original six funded packages, hours and customer-use windows.
