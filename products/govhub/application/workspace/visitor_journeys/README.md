# Visitor journeys

Operate complete visitor goals across original page and search sources, retain each comparison, assign corrective work, and deliver a reopenable customer workspace. This component uses the existing GovHub application, accounts, database, durable queue, source files, export writer, and private backup.

## Open the application

Python 3.11 or later and its standard library are sufficient. Keep the complete opportunity source, including unchanged `../cutover.py` and the bundled `vendor/assessment-core`, in its original layout.

From the containing `workspace` directory:

```sh
python cli.py --workspace /absolute/private/visitor-workspace --source-root /absolute/original-page-files --username owner init --name "Visitor operations"
python server.py --workspace /absolute/private/visitor-workspace --source-root /absolute/original-page-files --port 8792
```

Initialization asks for a private password. Open the printed local address and choose **Visitor operations**. A received private backup is already a workspace: point the server to that directory and use its existing account. Open an editable copy when retaining an original delivery unchanged.

## Complete operating workflow

1. Save a site profile: original base URL, permitted source origins, source reference, request deadline, page-byte limit and optional search-result class.
2. Save the full set of visitor journeys. Each journey has its audience, goal and ordered source steps. Expected outcomes include a heading, body text, exact destination and label, actual search-result rank, search form, returned status, language or redirect limit.
3. Capture the original site through HTTP, or select **Original supplied files** and bind every selected URL to its complete retained file. Files enter through the existing Sources screen. Their original URL, observation time and acquisition method remain with the capture.
4. Compare another capture using the same saved goals. Choose the same profile, a candidate deployment profile, or explicit source URL overrides for a query comparison. Changed goals, target profiles, URL bindings, source bytes and journey outcomes remain separately visible.
5. Review the exact captured edition. An accepted edition with an unresolved goal requires a recorded reason for that goal. Assign corrective work with an owner and concrete implementation action. A resolved finding references a passing captured edition with unchanged goals; corrected goals have a separate state.
6. Export the complete selected editions, review and work history, original page files, CSV and readable HTML. Create an original **Scope & backup** copy to retain the editable application state, accounts, request history and native queue as well.

### Original source facts

HTML processing reads the retained document source: headings, links, forms, text and ordered result links. It preserves fragments used by reservation applications, so campsite and cabin destinations remain distinct. Rendered layout, JavaScript-only content, screen-reader behavior and a reservation's later transaction are separate browser or application operations. The report names its actual source mode and does not replace missing observations with a passing result.

For native Solr JSON, the parser preserves the returned document objects, result order and response metadata. Use the original endpoint and query parameters from that deployment.

### Private source access

`header_environment` maps an exact permitted origin to header names and private environment-variable names. For example:

```json
{
  "https://staging.example.org": {
    "Authorization": "VISITOR_STAGING_AUTHORIZATION"
  }
}
```

Supply that value in the host's environment. Saved profiles contain only the variable name. Redirect requests rebuild their headers for the new origin; a header declared for one origin is not forwarded to a different origin. A resumed capture verifies completed original files and retries only source pages that lack a successful retained capture.

## HTTP and CLI actions

The same actions are available through the original authenticated HTTP service at `POST /api/govhub/visitor/...` and the existing CLI:

```sh
python cli.py --workspace /absolute/private/visitor-workspace --source-root /absolute/original-page-files --username owner call visitor.projects.save --input project.json
```

| Action | Input and result |
| --- | --- |
| `visitor.projects.save`, `visitor.sets.save` | Stable entity ID, expected revision, request key and full definition; returns the next immutable revision. |
| `visitor.projects.get`, `visitor.sets.get` | Entity ID; returns the current definition and complete history. |
| `visitor.captures.create` | Saved set revision, target profile, role and optional URL overrides; queues original HTTP capture. |
| `visitor.captures.import` | The same input plus complete original URL/file bindings; queues original-file capture. |
| `visitor.captures.get`, `.resume`, `.cancel` | Original operation ID; controls and reopens that same worker record. |
| `visitor.editions.get`, `.compare` | Exact edition IDs; returns original outcomes, sources, changes, reviews and corrective work. |
| `visitor.reviews.save` | Exact result hash, expected review revision, decision, reason and selected exceptions. |
| `visitor.findings.save` | Original edition/journey, owner, implementation action, expected revision and optional resolution edition. |
| `visitor.exports.create` | Handover name, selected edition IDs, source inclusion and request key; returns the original complete export. |
| `visitor.snapshot` | Current projects, sets, editions, original operations and corrective work. |
| `workspace.backup` | New absolute destination; retains the complete editable workspace. |

A mutation's request key belongs to that exact input and account. Reusing it reopens its saved result; a different input uses a new key. Saved definition, review and finding edits use their current expected revision.

## Three Rivers example

`examples/three-rivers.json` supplies seven actual visitor goals across parks, camping, activity status and general/downhill/campsite/cabin reservation routes. It uses the current public site's native Drupal form (`search_api_fulltext`) and original `archive` result markup. The candidate changes only the actual query from `camping` to `campground`. Expected visitor goals stay the same, and each source file remains attached to its original URL.

Source references:

- [Three Rivers maintenance RFP](https://www.threeriversparks.org/page/website-maintenance-request-proposal)
- [Original parks and trails](https://www.threeriversparks.org/locations)
- [Original reservation-system guidance](https://www.threeriversparks.org/NewSystem)
- [Baker Campground](https://www.threeriversparks.org/location/baker-campground)

## Receive a complete original-source example

`receiving.py` drives the actual application through its original HTTP service, queue, review, export and backup. Supply a JSON manifest with eight original page files:

```json
{
  "sources": [
    {
      "url": "https://www.threeriversparks.org/",
      "path": "/absolute/original-page-files/homepage.html",
      "sha256": "ACTUAL_FILE_SHA256",
      "bytes": 95401,
      "observed_at": "2026-10-12T04:00:00Z",
      "acquisition": "Original HTTPS source-file retrieval",
      "content_type": "text/html; charset=utf-8"
    }
  ]
}
```

Include every original URL selected by the example and its candidate. The supplied observation time describes the actual acquisition; original status/redirect metadata can be added when retained by the acquiring host.

```sh
python visitor_journeys/receiving.py --source-files /absolute/original-page-files/manifest.json --directory /absolute/private/visitor-receiving
```

The receiving directory keeps its private account, original request identities, result, exports and complete backup. Reusing that directory resumes those same identities. A run's completion means the actual product workflow completed; individual visitor goals retain their observed PASS, FAIL or UNOBSERVED outcomes for the operator to act on.

An equipped receiving host can add `--browser-command node visitor_journeys/browser-receiving.cjs`. It uses the existing Playwright/Chromium installation selected through `VISITOR_PLAYWRIGHT_PATH` and `VISITOR_BROWSER_EXECUTABLE`, opens the original saved goals and comparison forms, and retains desktop/mobile views in the same private receiving directory.
