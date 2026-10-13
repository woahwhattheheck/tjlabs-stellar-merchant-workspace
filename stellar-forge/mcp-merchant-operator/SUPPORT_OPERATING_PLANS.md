# Support Operating Plans through the original Merchant MCP

The six tools extend the configured Merchant Support provider and use the same pure OperatingPlan model as the installed CLI and browser. The original provider configuration check, closing guard, delegated call boundary and error translation remain intact. No tool here reads an arbitrary filesystem path, contacts OAuth, dispatches an incident response or writes a case.

## Retain the source first

Use the installed `starforge support-operating-plan capture` command or typed native `captureOAuthOperatingSource` entry to retain the selected original SF74 case, full ancestry and artifacts. Receive those files with the original native source receiver and SF74 case handoff. The compact source descriptor and complete catalog can then be supplied as JSON values to these tools.

All caller examples below use symbolic variables representing complete actual JSON documents, not literal placeholder sources. Keep stable plan IDs, the original explicit savedAt and complete input values for acknowledgement recovery.

| Tool | Exact arguments | Returned value |
| --- | --- | --- |
| merchant_support_operating_inspect | {source} | Validated compact original source descriptor |
| merchant_support_operating_create | {input:{source,catalog,id,title,customer,owner,period,savedAt,registrations,argvByPhase}} | Complete original OperatingPlan, seven planned phases |
| merchant_support_operating_record | {plan,input:{source,stepId,status,result:{summary,evidenceIds},owner,savedAt}} | Complete plan with a reviewed appended outcome |
| merchant_support_operating_compare | {plan,catalog,revision?} | Complete comparison against the supplied current catalog |
| merchant_support_operating_receive | {incoming,existing?} | Original receiver result {plan,reused,addedRevisions} |
| merchant_support_operating_render | {plan,format,revision?} | {format:'json',plan} or {format,text} for markdown/html |

Create and record require explicit savedAt through this provider. Optional builder fields retain the original model defaults; an actual selected catalog registration is required before retaining executable argument arrays. Tools accept only their documented top-level keys and complete JSON values up to 32 MiB. The model's own per-field limits still apply.

## Record returned work

The seven stable step IDs are support-sources, support-authority, support-observation, support-response, support-recovery, support-case and support-handover. Record an observed result with a summary and exact evidence IDs from the supplied source descriptor. A completed state requires retained evidence and the original case revision or its verified continuation. The source receiver remains responsible for checking full artifact bytes and native histories.

These pure tools return values. The caller persists them through its existing application selection or saves the complete JSON with the installed CLI. They do not create another plan or case store. A reviewed plan remains a procedure until its selected original operations actually return evidence.

## Receive and continue

Keep every original plan revision. The receiver preserves a later local head when incoming content is an identical older prefix, extends a matching history when the incoming plan is longer, and rejects divergent shared revisions. Keep both full documents and use the original explicit copy workflow for a genuine fork.

Rendering JSON always returns the whole editable history. A selected revision controls readable HTML/Markdown and validates the requested historical selection; it never removes newer JSON revisions. Deliver the complete native Support source/case package alongside these plan documents.

## Installed exposure

The merchant-support selection adds operator-discovery and merchant-support-operating to its existing contributions. The new contribution registers `starforge support-operating-plan` and typed package exports:

- `@tokenjunkielabs/starforge-merchant/merchant/support-operating-plans`
- `@tokenjunkielabs/starforge-merchant/merchant/support-operating-source`

The original Command Finder contribution already exposes the generic `operator/operating-plans` model. The existing Support MCP provider includes the six tools through one additive catalog hook and one dispatch hook inside its existing lifecycle. The current OAuth, Object, CKAN, Recovery, commercial, service and case-package routes are retained.
