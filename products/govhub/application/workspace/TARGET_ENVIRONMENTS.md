# Reviewed target environments

This complete application supports restoring the same selected source into an explicitly reviewed staging environment. The original source inventory and actual restored inventory stay unchanged. A separate target-expectation edition records the planned URL for every comparison ID.

## What is checked

| Property | Authority | Result rule |
| --- | --- | --- |
| Comparison ID | Explicit selected source cohort | Present in both selected source and actual result |
| Canonical URL | Named, reviewed target expectation | Actual URL must equal the exact approved URL |
| Configuration-export SHA-256 | Original selected source | Exact equality |
| Backup SHA-256 | Original selected source | Exact equality |
| Route count | Original selected source | Exact equality |
| Actual HTTP observation | Actual restored result | HTTP 2xx |

Only `canonical_url` can be mapped. No artifact, route, presence or HTTP exception can be entered through this feature. There is no host-name substitution, silent URL normalization or inferred wildcard. An unchanged URL can be mapped explicitly as well.

These manifest fields are the original auditor's contract. They are not a substitute for the existing native driver's retained database/configuration/public-file observations, host compatibility checks or application-specific acceptance. Private/external storage and application-code deployment remain subject to the actual selected native adapter contract.

The original source-versus-actual comparison is retained even when it reports a different staging URL. A second comparison shows **source, approved expectation and actual observation** for every selected field. The overall restored-operation result uses the approved target comparison, including every original invariant. Operations that select no target expectation keep their original exact-source behavior.

## Browser workflow

1. Retain the original source files and BASELINE/CANDIDATE inventories using the existing source and inventory views. Preserve the actual six-column CSV and full source artifact bindings.
2. Create or open the explicit cohort. In **Review target expectations**, choose the configured target and operation purpose. Rehearsal requires the environment's purpose to be **Rehearsal**.
3. Enter an edition name, operating authority and one exact expected HTTPS URL and reason for every comparison ID. The original URL is displayed beside it.
4. **Preview complete expectation** displays the full source and expected rows. **Save immutable edition** retains that exact preview. Editing a field invalidates the preview. An unfinished draft is retained in this browser tab and can be downloaded as JSON; it is not an approved operating instruction.
5. A named reviewer or administrator opens the retained edition and records **APPROVE** or **RETURN**, with a reason. Review decisions append history. A stale plan, source, environment record or native profile cannot be approved for a new operation.
6. Start the native operation from the same cohort. Select the approved edition under **Result expectation**, the exact comparison IDs, source backup and existing operating authority. The operation pins the expectation, reviewer decision, source snapshot, plan revision, environment record and native profile.
7. Run or continue the existing native worker. Keep its actual command captures and checkpoint. This expectation does not modify Drupal URLs or issue a separate native command. The configured target and real driver determine actual execution.
8. Retain the actual resulting six-column inventory as **RESTORED**, including its original artifact bindings. Attach it and the original completed native execution capture to the same operation. The application shows all three values, the original source comparison, actual times and retained native output.
9. If the actual result is wrong, retain the failed observation and correct the real result. If the previously approved target expectation itself was wrong, use **Use as corrected edition**, save and review the new map, and prepare a new explicit operation. Existing results and approvals are not rewritten.
10. Compare retained operations and create a complete handover. JSON retains all versions; HTML shows source/expected/actual values; `target-expectations.json` retains all named decisions; `target-reconciliation.csv` contains all target comparison rows. The original sources and complete private backup remain downloadable through the existing workspace.

Changing an environment or plan makes an old expectation unavailable for a new queue entry. An operation already queued retains its exact original reviewed source and target. A later RETURN decision prevents native continuation/preflight; it does not erase a completed native observation. A later APPROVE appends history, while the operation's original approval remains its source binding.

## API contract

All actions use the existing authenticated `POST /api/govhub/<action>` or `cli.py call <action> --input FILE`. They do not create a separate service.

| Action | Input and result |
| --- | --- |
| `target-expectations.context` | `plan_id`, `purpose`, optional `environment_id`; returns full plan/source and selected environment/profile |
| `target-expectations.preview` | Named map plus exact plan/environment/profile revisions; returns original rows, expected rows and `preview_sha256` |
| `target-expectations.save` | Same complete input, `preview_sha256`, `request_key`; returns immutable `expectation` |
| `target-expectations.review` | `expectation_id`, `expectation_sha256`, `previous_review_id` or null, `decision`, `reason`, `request_key`; returns immutable review |
| `target-expectations.get` | `plan_id` or `expectation_id`; returns editions, all reviews, current-binding status and latest decision |
| `operations.create` | Existing original request plus optional `target_expectation_id` and `target_expectation_review_id` |
| `operations.observe` | Unchanged actual source/capture selection; for mapped operations the native capture must also bind the original expectation and reviewer hashes |

Preview/save input contains:
`plan_id`, `expected_revision`, `environment_id`, `environment_revision`, `config_sha256`, `purpose` (`REHEARSAL`, `CUTOVER`, `ROLLBACK`), `name`, `reason`, optional `parent_id`, and `urls`.
Each URL row contains exactly `agency_id`, `canonical_url`, `reason`.
A map covers the full plan; an operation can select its existing explicit subset.

Identical request keys and actor/input replay the original save/review/queue result. Changed input under an existing key rejects. Review appends require the exact latest predecessor decision, so another review cannot be silently overwritten.

## One continuing native operating course

Requirements remain Python 3.11+, the complete original application source and its bundled assessment core, an existing private workspace and original source directory, and an already authorized compatible native target. The Drush path additionally requires its original PHP/Drush/source-format dependencies. No new cloud account or host is created.

`target_environment_course.py` is an executable caller of the same production APIs. It retains full input, previews, requests and results in one private output directory. It never creates a fake native result.

Prepare a real `target-environment-course/1` input, using `target-environment-course.example.json` only as a shape reference. Replace every example identity with the actual retained plan, target, exact expected URLs and authority. Source and target must already exist in this same workspace.

```sh
python3 target_environment_course.py --workspace /ABS/PRIVATE/WORKSPACE --source-root /ABS/ORIGINAL/INPUTS --username operator --password-env GOVHUB_OPERATOR_PASSWORD --input /ABS/INPUT/target-course.json --out /ABS/PRIVATE/TARGET_COURSE prepare
python3 target_environment_course.py --workspace /ABS/PRIVATE/WORKSPACE --source-root /ABS/ORIGINAL/INPUTS --username reviewer --password-env GOVHUB_REVIEWER_PASSWORD --input /ABS/INPUT/target-course.json --out /ABS/PRIVATE/TARGET_COURSE approve --reason "Actual reviewed staging instruction"
python3 target_environment_course.py --workspace /ABS/PRIVATE/WORKSPACE --source-root /ABS/ORIGINAL/INPUTS --username operator --password-env GOVHUB_OPERATOR_PASSWORD --input /ABS/INPUT/target-course.json --out /ABS/PRIVATE/TARGET_COURSE queue
```

If the existing server already owns the worker, let that original owner execute the queued operation. Otherwise the same course can run the original worker; it refuses to start if other active operations are present. It acquires the existing service lease and retains native checkpoint behavior:

```sh
python3 target_environment_course.py --workspace /ABS/PRIVATE/WORKSPACE --source-root /ABS/ORIGINAL/INPUTS --username operator --password-env GOVHUB_OPERATOR_PASSWORD --input /ABS/INPUT/target-course.json --out /ABS/PRIVATE/TARGET_COURSE worker
```

On uncertain native output, use the existing operation's documented continuation controls. Do not create another queue entry to bypass its original journal. The course's `status` command displays that same operation.

After retaining the actual RESTORED inventory, supply an observation-selection JSON containing its `restored_snapshot_id`, optional exact `capture_file_id` and actual times, plus notes. Use the original actual capture; a completed native action is required.

```sh
python3 target_environment_course.py --workspace /ABS/PRIVATE/WORKSPACE --source-root /ABS/ORIGINAL/INPUTS --username operator --password-env GOVHUB_OPERATOR_PASSWORD --input /ABS/INPUT/target-course.json --out /ABS/PRIVATE/TARGET_COURSE observe --observation /ABS/INPUT/actual-observation.json
python3 target_environment_course.py --workspace /ABS/PRIVATE/WORKSPACE --source-root /ABS/ORIGINAL/INPUTS --username operator --password-env GOVHUB_OPERATOR_PASSWORD --input /ABS/INPUT/target-course.json --out /ABS/PRIVATE/TARGET_COURSE handover
```

Handover downloads every original generated file, verifies each full hash, resumes only identical originals, and independently opens the same actual workspace with the installed complete source. The private workspace backup remains the existing authenticated `workspace.backup` action. Open that full backup independently with the same source and compare expectation/review/operation/observation identities; no application-state conversion is needed because the new objects use the existing immutable object store.

## Receiving and interpretation

The complete course should demonstrate a real source URL differing from a preapproved staging URL, an actual restored result that matches that expectation, an invariant mismatch that remains FAIL, and a corrected named edition without overwriting the earlier map or observation. Reopen the full private backup and all handover files. Record the actual driver/Python/browser versions, actual results and native captures when execution occurs.

Source review and JavaScript syntax validation are separate from executing Python, operating Drupal and inspecting the browser. This source edition does not claim that the selected customer target has already been nominated or operated.
