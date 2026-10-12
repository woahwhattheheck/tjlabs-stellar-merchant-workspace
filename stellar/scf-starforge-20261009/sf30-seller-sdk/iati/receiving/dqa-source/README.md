# Original DQA service and source receiving

For the complete installation and customer workflow, use [SETUP.md](SETUP.md)
and [complete.example.json](complete.example.json). The `complete.py` entry
acquires the pinned original engine, installs its frozen dependencies, prepares
the selected customer runtime, runs both full assessments and the complete
analyst/receiving workflow, then closes its owned services. Run it through the
existing native resource admission with the selected private operation paths.

This directory runs the unchanged Zimmerman DQA engine against the real public IATI.cloud activity source and retains the complete source exchanges used by each assessment. It supplies the provider for the surrounding IATI customer workflow. The original provider remains alive while that workflow creates assessments, reviews findings, compares editions and receives its complete customer package.

## Selected source

| Component | Immutable selection |
| --- | --- |
| DQA engine | [zimmerman-team/iati-cloud.dqa](https://github.com/zimmerman-team/iati-cloud.dqa/tree/61a5e02420b936a39ebaf79dea7212fc0ce36683) at `61a5e02420b936a39ebaf79dea7212fc0ce36683` |
| Client | [pysolr 3.11.0](https://github.com/django-haystack/pysolr/blob/9243537cb34c69c4325c61f70732b64a4a1a8f7e/pysolr.py), selected by the original `uv.lock` |
| Public source contract | [IATI.cloud docs/USAGE.md](https://github.com/zimmerman-team/IATI.cloud/blob/f51e41d22619083502f51066ac7dde8c8c9d22f3/docs/USAGE.md) |
| Actual source | `https://datastore.iati.cloud/api/v2/activity/` |
| Native request models | Original [app/models.py](https://github.com/zimmerman-team/iati-cloud.dqa/blob/61a5e02420b936a39ebaf79dea7212fc0ce36683/app/models.py) |
| Source, configuration and rule semantics | Original [app/solr_client.py](https://github.com/zimmerman-team/iati-cloud.dqa/blob/61a5e02420b936a39ebaf79dea7212fc0ce36683/app/solr_client.py), [app/config.py](https://github.com/zimmerman-team/iati-cloud.dqa/blob/61a5e02420b936a39ebaf79dea7212fc0ce36683/app/config.py), and `VALIDATOR_RULES.md` |

`SOURCE_CONTRACT.json` binds the exact original Git blobs and the complete observed public responses. The code licenses are retained by the original upstream source inventory. The software license does not replace the queried publishers' own data provenance.

## Why the route adapter exists

The public activity endpoint is a documented unauthenticated query interface. A direct request to its `admin/ping` path returned HTTP 404. The pinned native DQA client calls `pysolr.Solr(...).ping()` during import, so assigning that public URL directly prevents the original service from starting.

The exact pysolr 3.11.0 `ping()` implementation returns the received HTTP-200 text. It does not require an invented Solr status envelope. The adapter therefore maps only the empty local startup `GET /solr/activity/admin/ping[/]` to an actual public `q=*:*&rows=0&fl=iati-identifier&wt=json` request and returns that complete original response.

The native search path maps `/solr/activity/select[/]` to the documented public activity path. Query-string bytes and the native POST form body are preserved. Pysolr uses a GET for short encoded searches and a POST form for larger searches; both are supported. The adapter adds no organisation, hierarchy, date, rule, result or budget filter. It captures original status, headers and complete bytes before forwarding. Redirects remain original non-200 outcomes rather than causing an uncaptured second request. Credentials and cookies are not sent to this public service.

Actual exploration on 2026-10-12 returned the following complete source bodies, included unchanged under `public-source/`:

| Exploration | Observed source result | Complete body |
| --- | --- | --- |
| Public rows=0 health | status 0, 425402 indexed activities | 262 bytes |
| GB-GOV-1, one identifier row | 3239 matching indexed activities, one returned record | 485 bytes |
| GB-GOV-1 with BD country/transaction-country filter | 20 matching indexed activities: 17 H1 and 3 H2 | 635 bytes |

These exploratory counts are separate from the engine's implementation/closed-window selection. The default customer receiving uses the full GB-GOV-1 scope.

## Prepare the real upstream environment

Reuse an existing complete, source-verified checkout and installed environment when available. The launcher does not install packages, alter system services, start a container or acquire a different dataset. The equipped operator selects actual paths in `upstream.example.json`.

If a new isolated checkout is needed, use the original repository and select the exact commit:

```sh
git clone https://github.com/zimmerman-team/iati-cloud.dqa /ABS/ORIGINAL/iati-cloud.dqa
git -C /ABS/ORIGINAL/iati-cloud.dqa checkout --detach 61a5e02420b936a39ebaf79dea7212fc0ce36683
```

Install the original production lock into that checkout's own environment through the existing native setup/admission route:

```sh
uv sync --project /ABS/ORIGINAL/iati-cloud.dqa --frozen --no-dev
```

The original Makefile uses `uv sync`; `--frozen` retains its selected lock. [The uv command reference](https://docs.astral.sh/uv/reference/cli/#uv-sync) describes these options. Keep the real virtual environment Python path, such as `/ABS/ORIGINAL/iati-cloud.dqa/.venv/bin/python`; resolving its symlink to a base interpreter would lose the installed environment.

The original engine needs Python 3.11 or later and the production dependencies in its complete lock, including Flask, flask-cors, flasgger, Pydantic, pydantic-settings, pysolr, Redis and python-dotenv. `flask_smorest` is reported by the runtime probe when present but is not a requirement of this selected upstream engine. Select an existing actual `redis-server` executable for the private service. Preserve that invocation even when it is a multicall symlink. When its retained package needs adjacent shared libraries, select their original directory through `redis_library_directory`; the launcher applies it to Redis only. The source uses the original Redis protocol and cache implementation.

Run the source-owned observation before launch:

```sh
python3 upstream.py probe --config /ABS/PRIVATE/upstream.json
```

This reads the selected interpreter's actual module availability/version, the actual Redis version and the upstream Git HEAD. It returns `AVAILABLE` only when the selected runtime and exact source are present. It performs no installation or service start. The complete source bytes are verified against the original Git blobs again during `serve`.

Use a distinct private operation directory and three available loopback ports. Include the Python/Redis services, response spooling, complete source evidence, original application process and the customer browser in the existing whole-operation capacity declaration. Native full searches use the original rows=999999 limit; set the complete-response byte envelope to fit the chosen real scope. A response beyond that explicit envelope becomes a retained failure, never a truncated successful assessment.

## Configuration and process ownership

Copy the example JSON to the selected private configuration path and replace its absolute native paths. The schema is `commons.iati.dqa.upstream.v1`.

| Field | Meaning |
| --- | --- |
| `operation_id` | Stable identity for this one owned upstream operation |
| `directory` | Canonical private directory for source, runtime records, cache, logs and source exchanges |
| `upstream_directory` | Own exact upstream checkout at the selected commit |
| `python_executable` | Actual Python executable in the frozen production environment |
| `redis_executable` | Actual installed Redis server invocation; preserve its multicall symlink name |
| `redis_library_directory` | Optional absolute original shared-library directory, applied only to Redis |
| `authorization_env` | Name of a parent-provided local API secret environment variable |
| `api_port`, `redis_port` | Separate owned loopback service ports |
| `transport.listen_port` | Third loopback port used by the original pysolr client |
| `transport.upstream_url` | Fixed documented public activity URL |
| `transport.timeout_seconds` | Positive upstream socket timeout, at most 9 seconds, below the original client timeout |
| `transport.request_limit_bytes` | Bound on a complete original query form |
| `transport.response_limit_bytes` | Bound on one complete original public reply |

Provide the local API key through the named environment variable inherited by the original native operation. Its value is not written into this JSON, command arguments, provider input, source evidence or settings snapshots. The original upstream API uses a raw `Authorization` value, not a Bearer prefix. This key belongs to the isolated service being started.

Start once through the maintained native foreground:

```sh
/ABS/ORIGINAL/iati-cloud.dqa/.venv/bin/python -B upstream.py serve --config /ABS/PRIVATE/upstream.json
```

The launcher holds an exclusive lock for its operation, creates a new retained attempt directory, verifies the complete selected original `app/`, `data/`, lock and metadata files, and observes native effective settings and financial-year boundaries. It starts its own loopback Redis, the source transport and the unchanged Flask application. Flask reload/debug are disabled. Readiness requires Redis PONG, the actual authenticated upstream health reply reporting healthy/connected, and a new successful public source startup exchange from this attempt.

The first successful stdout record is `state: READY`. It includes:

- `api_base_url` and the secret environment variable name.
- `ready_file`, `provider_input` and `assessments_input`, ready for the customer callback.
- `upstream_source`, `runtime`, `solr_journal`, current `run_directory` and owned process IDs.
- `source_evidence`: the original exchange directory, closed-record name, prior-attempt exclusion list and exact export argv.

The parent retains this foreground while the customer callback borrows its endpoint. On SIGTERM or normal interrupt, the launcher stops only the processes it started, waits for their actual exit and records the outcomes. Redis/cache/source/journal data remain in their original operation directory. A restart uses the same source/configuration and a new attempt, preserving prior records; another live owner cannot acquire the same operation lock.

## Full-scope assessment inputs

`assessment-requests.json` supplies two complete request objects. Both select organisation `GB-GOV-1` with no segmentation, no additional funding/accountable restriction, original exemptions enabled, acronym checking disabled, complete failed-activity details, and the original status/date source selection. Both set `skip_cache:true` to obtain actual source for each capture.

The receiving callback must save the request and full native configuration-list responses for each assessment. It must retain the complete upstream response, including H1/H2 summaries, percentages, financial-year identity and failed-activity evidence. The second capture uses the same scope and rules; a naturally unchanged comparison is accepted. An operator can explicitly select a different meaningful scope through the product.

The native engine's `pass_count` and `fail_count` describe activities. Its `not_applicable_count` counts rule outcomes. The provider response is retained unchanged, so those quantities must keep their original meanings in the application.

## Export each capture's actual source

After the first original assessment and its configuration snapshots have completed, use the exact READY path:

```sh
python3 upstream.py evidence --ready /ABS/OPERATION/runs/run-ID/ready.json --output /ABS/RECEIVING/source-initial
```

After the second capture:

```sh
python3 upstream.py evidence --ready /ABS/OPERATION/runs/run-ID/ready.json --output /ABS/RECEIVING/source-fresh --after-evidence /ABS/RECEIVING/source-initial/manifest.json
```

The second export selects the exact new exchange IDs after the first manifest. It does not copy a previous response and label it fresh. Both exports retain the source-selection identity before copy, make retries idempotent, and publish the complete manifest only after the selected bytes match.

Each `manifest.json` contains relative paths, byte counts and SHA256 for:

- Exact original engine/config/lock source members and source metadata.
- Actual selected runtime/settings and the successful READY context.
- Each original request body and metadata, upstream response headers, complete raw response body, native response observations and closed-exchange inventory.
- Retained source errors, partial replies and client-disconnection records when present.
- Actual original query parameters, including hierarchy and generated closed-window cutoff strings, with source request/close times.
- The previous manifest for a subsequent source interval.

The source transport publishes each `closed.json` only after its original exchange has ended. An exporter does not take a half-written response. An already completed export verifies and returns its original manifest on retry. It does not select new source into an existing export identity.

A successful export prints the manifest path, exchange/search counts and `COMPLETE`. If an actual selected query failed, was partial, returned fewer rows than its full matching count, or was not delivered, the complete evidence is retained and the result is `SOURCE_ERRORS` with exit status 2. Original source timing and payloads remain available for recovery.

**The original SolrClient catches search exceptions and returns an empty list.** Therefore the customer receiving must join this source result to every native assessment: require complete successful full-row H1/H2 source exchanges and any downstream lookups for that capture. A nominal HTTP200 DQA response alone cannot establish an empty dataset. Do not replace a failed source query with an invented successful response.

The native assessment may compute different cutoff seconds or see a changed public index between captures. The manifest preserves those actual queries and source replies. Do not describe such a comparison as a fixed-source experiment.

## Whole customer handover

The existing `iati/receiving/dqa.mjs` workflow owns provider-profile selection, both full captures, saved findings/review/action history, comparison, browser/CLI/MCP views, the complete customer ZIP and independent receive/retry/reopen. It consumes the provider and request paths above and includes the verified per-capture public-source evidence. The launcher owns the service lifecycle; it does not create another case, payment, queue, assessment model or scheduler.

Retain original provider logs/cache privately for native recovery. Customer source evidence contains the selected public source exchanges and non-secret source/runtime context. Keep the named secret in the original environment throughout process restart and independent receiving where a live provider is required.

The included exploration JSON files prove public endpoint behavior only. The actual native receiving creates the real assessment/source manifests; their IDs, counts, result hashes and outcomes are taken from that operation.
