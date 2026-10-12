# Saved Application launch groups

Launch groups keep an ordered selection of existing saved Applications and a durable run that points to each member's original managed operation. Open **Runtime workspace → Launch groups** to prepare a demo, restart a working set, or run a sequence of original tools.

## Browser workflow

1. Choose **Create group**, enter a name, add saved Applications, and use **Move up / Move down** to set their order. Save the group.
2. Choose **Review a new run**. Each member shows its saved revision, runtime, managed home, release, command, original inputs and provider source. Resolve any member error, then review again.
3. Choose **Start reviewed group**. The group run and every member's stable request UUID are retained before the first member is dispatched.
4. Choose **Continue: …** to start the next member. Earlier members must have launched their original command or finished. A member sharing an original workspace with an earlier member waits until that earlier operation finishes.
5. Use **Original output** for the exact member's retained worker log and result. **Open Application** returns to the original Applications view and its private navigation, terminal and operation controls.

The group editor retains its unsaved draft in the browser. Definitions, revisions, current run and run history are saved in the private runtime workspace. Reopening the browser or server restores the selected group and its original operations.

### Partial failures and remaining review

**Recover original request** invokes the existing Application recovery for that member's retained UUID. A dispatch response lost after acceptance is reconciled through that same request. The group never assigns a new request UUID to recover a member.

If a remaining saved Application, provider source, input, resource selection, runtime or selected release changes, the member requires **Review remaining members**. Applying that review updates only members without an original run. Already launched members retain their original revision, request, review, status and output.

A managed home's revision is a concurrency token. Before every new member dispatch, the group obtains a fresh original start review and compares its complete approved identity, apart from that token and review timestamps. If only the home revision changed, the group retains the fresh token and submits it through the original start guard. Source, selected release, command and input changes still require a new review.

A final failed or cancelled original operation may be accepted with **Accept result; allow next**. This records the exact outcome the operator accepted and permits the ordered sequence to continue. Its failure/cancellation result stays visible. An interrupted operation must be recovered or stopped before a final outcome can be accepted.

**Stop group** first retains the stop intent, prevents further member launches, then calls the original stop path for every outstanding member. Use **Retry stopping group** after a transient stop failure. The history remains available.

The browser retains the exact mutation request before sending it. If its response is interrupted, **Recover saved request** replays that body. A repeated group start reopens its existing run; a repeated continuation targets its original explicit member and does not advance another one.

## CLI and model

Use the existing `runtime-workspace` command and a private JSON request file. IDs below are placeholders for IDs returned by the original Applications and group APIs.

Create a named selection:

```json
{
  "requestId": "<fresh UUID retained by the caller>",
  "label": "Merchant operations",
  "applicationIds": ["<saved Application ID>", "<saved Application ID>"]
}
```

```sh
runtime-workspace application-group-save --workspace /private/operator --request /private/group.json
runtime-workspace application-groups --workspace /private/operator
runtime-workspace application-group-review --workspace /private/operator --group-id GROUP_ID
```

To edit a definition, include its `groupId` and current `expectedRevision` in the save request. The ordered selection is limited to 1–32 distinct saved Applications. An edit preserves the earlier definition and its run history.

Start a reviewed group with the returned review ID:

```json
{
  "groupId": "<group ID>",
  "requestId": "<fresh group-run UUID retained by the caller>",
  "reviewId": "<group review ID>"
}
```

```sh
runtime-workspace application-group-start --workspace /private/operator --request /private/start-group.json
runtime-workspace application-groups --workspace /private/operator --group-id GROUP_ID
```

Continue the explicit next member using the run's current version:

```json
{
  "groupId": "<group ID>",
  "runId": "<group-run UUID>",
  "applicationId": "<next saved Application ID>",
  "expectedVersion": 3
}
```

```sh
runtime-workspace application-group-continue --workspace /private/operator --request /private/continue-group.json
runtime-workspace application-group-review --workspace /private/operator --group-id GROUP_ID --run-id RUN_UUID
runtime-workspace application-group-apply-review --workspace /private/operator --request /private/remaining-review.json
runtime-workspace application-group-member --workspace /private/operator --request /private/member-action.json
runtime-workspace application-group-stop --workspace /private/operator --group-id GROUP_ID --run-id RUN_UUID
runtime-workspace application-output --workspace /private/operator --application-id APPLICATION_ID --operation-id ORIGINAL_UUID
```

The remaining-review request contains `groupId`, `runId`, `reviewId` and the reviewed `expectedVersion`. Member actions contain `groupId`, `runId`, `applicationId`, and `action` (`recover`, `stop`, or `accept-result`). Accepting a final result also requires the current `expectedVersion`.

`application-groups` accepts `--run-id` to open a retained run and `--limit` / `--cursor` for history pages. The default page is 20 runs, the maximum is 50, and the next cursor is returned in `selected.history.nextCursor`.

`openRuntimeWorkspace()` exposes the same jobs as `applicationGroupsState`, `applicationGroupsSave`, `applicationGroupsReview`, `applicationGroupsStart`, `applicationGroupsContinue`, `applicationGroupsApplyReview`, `applicationGroupsMember`, and `applicationGroupsStop`. The browser uses the corresponding authenticated loopback `/api/application-groups/*` routes.

## Retained records

- `application-groups/<group-id>/group.json`: current named ordered definition.
- `application-groups/<group-id>/revisions/<revision>.json`: immutable earlier definition.
- `application-groups/<group-id>/current.json`: current group-run pointer.
- `application-groups/<group-id>/runs/<run-uuid>.json`: approvals, stable member UUIDs, progress and stop intent.
- `application-group-reviews/<review-id>.json`: exact full or remaining-member review.

Original Application records stay under `applications/<application-id>/runs/<original-uuid>.json`; worker requests, state and logs stay in the original `operations/<original-uuid>/` directories. Group actions acquire a per-group kernel lease, then call the existing Application start/recovery/stop functions and their original resource locks. There is no additional worker or background queue.
