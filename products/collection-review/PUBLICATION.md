# Publishing Collection Review examples

Collection Review retains complete original source bytes for private editorial work. A captured web page may contain provider credentials in scripts or configuration that are unrelated to the catalogue entries. A page being publicly accessible does not establish that its credentials are safe to redistribute or authorized for another application.

The publication checker is a separate, passive boundary. It never requests a source URL, tests a candidate key, evaluates HTML/JavaScript, modifies the original packet, or records a credential value in its result.

## Prepare a shareable packet

Use the existing installed command:

~~~sh
starforge collection-review publish --project reviewed-workspace.json --out shareable-workspace.json
~~~

The command first validates the complete native packet, source bytes, extraction, immutable revisions, requests and history. It then inspects the complete serialized result. A recognizable Google API key candidate causes `COLLECTION_PUBLICATION_BLOCKED` before the new output file is created. The original input is preserved.

A successful result includes a `publication` inspection record. `PASSED` means that the current detector found no matching candidate. It is not an assertion that the document contains no other secret, personal information, licensed content or restricted material.

To inspect another decoded artifact before putting it into a repository or source carrier:

~~~sh
starforge collection-review publication-check --file complete-artifact.json
~~~

This accepts one complete UTF-8 or JSON artifact up to 64 MiB and creates no file. For JSON, string escapes are decoded before inspecting string fields and object keys. Errors and inspection results do not include a candidate, prefix, suffix, source excerpt or credential-derived fingerprint.

The shared API exports `inspectCollectionPublication(input)` and `assertCollectionPublication(input)` from `@tokenjunkielabs/starforge-merchant/collection-review/publication`. Input may be a complete string, UTF-8 Uint8Array, or JSON value. The assertion throws on a detected candidate. The result records schema, status, detector, candidate presence, byte count, `onlineValidation:false` and `sourceModified:false`.

## Native private custody and explicit derivatives

The ordinary source, save, receive, packet and ZIP APIs continue retaining exact supplied bytes. Do not silently replace a token inside an existing native packet: that changes source hashes, occurrence IDs, UTF-8 spans, review references, revision requests and the packet checksum.

If a publication is blocked:

1. Keep the original capture in the authorized private custody location. Stop distributing that captured artifact through repository examples, public documents or source carriers.
2. Make a separate derivative source with an unmistakably nonfunctional replacement. Record that it was redacted and retain the original URL, capture time, original byte count and hash as provenance; do not retain the credential itself in the provenance.
3. Rebuild the derivative through the maintained collection source/workspace APIs. Recompute every source, occurrence, revision, report and packet identity affected by the changed bytes. Preserve catalogue ordering, repeated occurrences, editorial decisions and rights observations; do not infer permission.
4. Run the publication checker on the complete new packet and every accompanying decoded textual artifact, including the HTML report and projection.
5. Replace the current published example and references with the explicit derivative. Keep the previous artifact's status factual: changing the current tree does not remove earlier commits, downloads or cached source carriers.

The checker does not perform the derivative conversion automatically. An editor must choose what may be shared and record the alteration. A publication intended to preserve exact original capture identity must remain private when it contains a candidate.

## Distribution packaging

The maintained distribution builder applies `assertCollectionPublication` to each selected source file under `products/collection-review/examples/` during its full source read, before output materialization and archive creation. All original Git identities and the normal package checks remain unchanged.

This check runs for newly materialized packages, including explicit support-file selections. It does not rewrite a package that was already completed before the guard existed. Do not redistribute an earlier completed package merely because its old build receipt still reopens; inspect its decoded contents and replace it with a corrected source edition.

The CLI, shared checker and this guide are explicit portable support files of the Collection Review contribution. No paid workflow, provider validation or broad CI run is added.

## Scope and limits

The current detector recognizes the Google API key lexical shape implicated by the ArchiveBlack capture: the provider prefix followed by its expected identifier character count. It inspects plain text and decoded JSON fields. It does not determine ownership, validity, restrictions, quota, abuse or revocation.

It does not unpack arbitrary ZIP, gzip, Base64 or encrypted carriers, evaluate concatenated JavaScript strings, or detect every credential family. Inspect full decoded constituent artifacts before compressing a source carrier. Other secret-scanning and human review remain necessary for other credential types.

Do not log the rejected input. Record only the artifact path, artifact identity, detector result and the remediation owner. Do not put candidate values in Slack, issue comments, documentation, tests, command lines or provider-validation calls.

## Credential-owner response and alert status

The 13 October 2026 ArchiveBlack example alert was traced to Google Maps bootstrap configuration inside two captured public institution pages. This establishes the source context; it does not establish whether the key is currently valid, properly restricted, unused, or owned by TJLabs. Treat that distinction explicitly.

The authorized administrator of the source website's Google Cloud project can inspect the key's usage and security logs, confirm intended website and API restrictions, and determine whether restriction or rotation is necessary. Google recommends checking usage before deleting or rotating a key. If rotation is selected, update legitimate applications before retiring the previous key unless the owner chooses an emergency response.

Repository maintainers can remove the current distributed copy and coordinate historical remediation. They should not mark a detected original value as a dummy, revoked or safely restricted without evidence. Removing a current file does not automatically close GitHub's historical alert. Record the actual owner decision and provider status separately from the source repair.

Primary guidance:

- Google Maps Platform security guidance: https://developers.google.com/maps/api-security-best-practices
- GitHub secret-scanning alert resolution: https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-secret-scanning-alerts/resolving-alerts

These instructions authorize no external disclosure or account change by themselves. Use the established relationship and security owner for any notification, restriction or rotation.
