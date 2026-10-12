# Commission a Timescale customer analysis service

This playbook takes one agreed Timescale commissioning job through complete customer analysis, commercial installation, recurring paid use and receiving-engineer handover. Use it with the [Timescale customer operating guide](OPERATING.md) and the shared [customer launch playbook](../merchant-workspace/CUSTOMER_LAUNCH.md).

The customer outcome is a complete original commissioning report opened in its analytical workspace, with reviewed baseline and observed editions, an explicit comparison, engineering decisions and a portable warehouse. The workorder gives that result a purpose: an operating decision, a commissioning acceptance, a correction review or a recurring reporting task.

## 1. Agree the customer job and responsibilities

Start from the original customer opportunity and workorder. Keep its accepted scope, commercial history and contacts in the existing case. A source platform, implementation payer, merchant and buyer can be different organizations.

| Accountable role | Timescale responsibility | Entry retained in the workorder |
| --- | --- | --- |
| Commissioning payer | Accepts the implementation scope, price, milestones and handover | Original agreement, actual status and invoice/collection record |
| Source administrator | Selects the permitted Timescale project, relations, fields, period and native source operation | Original source reference, access reference and change procedure |
| Merchant operator | Controls the published resource, host, source release and payment terms | Saved merchant installation and selected service |
| Buyer operator | Chooses the useful result, request, receiving application and spending authority | Original buyer installation and complete task definition |
| Receiving engineer | Interprets the fields, reviews differences, receives the full workspace and maintains the service | Named engineer, actual receiving host and agreed acceptance task |
| Facilitator operator | Supplies the selected supported payment service | Accountable operator, endpoint, network, scheme, asset and fee basis |

Record the organizations that actually control these roles. Two sessions, wallets or machines belonging to one organization retain that organization in the cohort.

### Define a complete initial scope

The initial unit of implementation is one customer environment and one complete commissioning workflow. Fill its limits from the actual job: source populations, report definitions, comparison rules, output files, receiving host and recurring task. If the customer needs several reports or environments, include each one explicitly when estimating and assigning the work.

Agree what decision the engineer will make after receiving the report. Examples of a task description are “review the difference between the accepted baseline and this operating period” or “receive the corrected commissioning result and preserve the earlier accepted edition.” The actual workorder supplies its source, dates, fields and acceptance criteria.

Name the receiving engineer early enough to shape the column meanings, report and handover. That engineer should operate the saved result and later source change as part of commissioning.

## 2. Prepare the complete commissioning brief

Attach the brief through Sources in the existing Grant Operations case. Use the native **Customer installations** seed, review and save interfaces described in [Customer launch](../merchant-workspace/CUSTOMER_LAUNCH.md#3-prepare-one-complete-commissioning-brief). They retain the source attachment, complete installation editions, commercial assignments and delivery queue.

| Field | Complete Timescale entry |
| --- | --- |
| Original case and workorder | Existing case reference, original commissioning attachment and actual commercial stage |
| Customer purpose | Decision or downstream operation supported by the completed analysis |
| Source ownership | Accountable source administrator and permitted source/access reference |
| Project and report | Original Timescale workspace, commissioning identifier and selected immutable report |
| Reporting scope | Original query/population, operating period, revision and provider completeness declaration when supplied |
| Original report identity | Complete filename, byte count, SHA-256 and retained report location |
| Baseline and observed sources | The two original source UUIDs, their native roles, contract revisions and full source identities |
| Native field structure | Every original column in native order, source OID, text/NULL representation and original type information |
| Meaning and units | Reviewed role, operational meaning, unit, null interpretation and time basis for every field |
| Comparison | Selected immutable editions, matching keys, all compared fields, duplicate treatment, windows and engineer notes |
| Customer output | Complete source files, reviewed editions, comparison, engineering decisions, report and portable warehouse |
| Paid resource | Exact route/tool, request, result definition, unit price, asset, recipient and complete approved task budget |
| Recurrence | New period, corrected source, changed contract or distinct customer request that justifies later work |
| Installation | Selected source commit/archive, runtime, merchant/buyer hosts and customer workspace identity |
| Acceptance | Accountable observer, whole customer task and independent receiving/maintenance action |
| Assignment | Actual existing grant package IDs and separately commissioned commercial tasks |
| Care | Source/release change procedure, continuing owner, support obligation and original commercial terms |

A source's reported coverage stays with its original declaration. Receiving every row in that supplied population identifies the acquired scope. The customer can then decide whether that scope satisfies the commissioning job.

### Resolve field meaning before interpreting differences

The native source carries PostgreSQL text or SQL NULL and the original OID. The intake starts from textual mappings, which preserve the original representation. Select an exact typed representation where the source meaning and native review support it.

Distinguish empty strings, whitespace-bearing strings, SQL NULL, numeric zero and quality/status values. Record whether a timestamp means an instant, a local operating time or another source-defined quantity, together with units and precision. Undeclared units or time zones remain visible as an unresolved source meaning in the original review.

The native review supports exact integer and decimal choices, including decimal precision up to 38, and explicit date/time selections. Approximate floating-point conversion uses its own explicit permission. The [native values section](OPERATING.md#native-values-and-reviewed-types) describes the accepted conversions and concrete review errors.

Import every original field and row. The intake uses empty import keys so duplicate observations remain available. Define matching keys in the later pair, where complete duplicate groups and row accounting can be reviewed.

## 3. Carry the original report into the customer

Operate the producer through [Timescale commissioning](../timescale/OPERATING.md). That original workspace owns source capture, commissioning revisions and the immutable report.

Download its complete JSON report through the existing report-file or browser operation. Preserve the filename and exact bytes. The report contains the native source files and complete revision chain required by the customer. Keep the original source identities and scope with the commercial brief.

In the customer's existing **DuckDB dataset workspace**:

1. Open **Timescale intake**, select the original file and retain the report.
2. Open its BASELINE source and inspect all original columns and rows.
3. Review each field's type, role, meaning, units, null note and time interpretation.
4. Review the complete source and import the immutable edition.
5. Repeat for the selected OBSERVED source.
6. Select the two exact editions in **Pair and compare**.
7. Choose matching keys, compared fields and any explicit windows; review and save the pair.
8. Open the saved pair in **Dataset reconciliation**.
9. Run the complete comparison, inspect rows and duplicate groups, record the engineer's decisions and save the report.
10. Export the complete portable customer handover and reopen it on the receiving host.

Filtering or paging the browser changes the displayed preview. The retained report, reviewed mapping and imported population remain complete. Original column meanings and source identities travel with the saved editions and customer export.

The intake uses the original customer listener, workspace identity and request journals. A saved pair delegates to the maintained reconciliation engine. The product already supplies the native row accounting, decisions, reports and portable warehouse receiving.

### Choose comparison windows deliberately

With no windows, the pair includes all original rows. Each selected window includes its start and excludes its end. The selected field's native type governs the comparison.

A textual time field compares its original strings. If the customer needs an elapsed-time interpretation, review a compatible time representation and its meaning before defining that window. Equal SQL types alone do not establish equal operational meaning. Keep the source and target meanings visible when pairing fields.

A later comparison definition creates a new saved pair revision. Earlier editions, runs, decisions and reports remain available to explain the previous result.

## 4. Install the same complete product

The maintained selection is **timescale-customer**. It composes Timescale commissioning, the Python DuckDB customer, paired reconciliation, browser assets, clients, MCP and managed Applications.

Use the exact build and runtime-install commands in [Build and install](OPERATING.md#build-and-install-this-product). The build records its source commit and produces the complete selected archive and manifest. Retain that original archive and its hash with the installation.

The committed customer source declares Python 3.11 or later and DuckDB 1.5.6. Its JavaScript product requires Node.js 22.16 or later. The actual runtime installer resolves and retains the selected dependencies. Parquet sources use the original decoder's declared Python environment; the original commissioning JSON follows its native intake path.

In Applications, select the actual installed Python environment and the existing **DuckDB dataset workspace**. Retain its customer directory and saved workspace ID. The current launch record is in that directory's `duckdb-launch.json`; use the actual identity returned by the original service.

Keep mutable source/customer state in its private operating directories and the source release in its selected installation. Reopening on a different local port continues through the original workspace and native journals.

## 5. Operate the original CLI or registered agent

The browser, CLI and registered agent use the same customer state. Read the current operation through the original DuckDB command:

```sh
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake status
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake reports
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake report "$timescale_report_sha"
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake reviews
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake operations
```

Set these task variables from the original operating case. Use the supplied offset/limit options to read later catalog pages.

Inspect a complete original local report:

```sh
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake inspect \
  --file "$timescale_report_path" --sha256 "$timescale_report_sha"
```

Retain, review, import and save the pair using the complete original JSON bodies documented by the native interface:

```sh
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake retain --input "$timescale_retain_input"
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake review --input "$timescale_review_input"
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake import --input "$timescale_import_input"
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake pair-review --input "$timescale_pair_preview_input"
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake pair --input "$timescale_pair_input"
```

The original bodies retain request IDs, workspace identity, report/source identifiers and every reviewed field. Reuse the saved body when continuing that request.

The registered agent uses the existing `action: "duckdb"` operations. Its host-owned `timescaleReports` registration binds an alias to the original report path and SHA. The agent selects that alias and the exact report. The [registered-agent table](OPERATING.md#registered-agents-and-typed-client) lists the source, review, import, pair, request and full-file operations. The typed client is `openDuckDBTimescaleClient`.

### Continue the same operation

The browser keeps the complete original request and, for an upload, the exact file bytes and headers. **Saved requests** opens or explicitly continues that original operation. A completed result reopens its existing identity.

If a host restarts on another origin, open the original request from the native intake journal and restore its exact report file when required. The original filename and complete SHA identify the input. The receiving programme can recover a completed retained upload from the warehouse.

The CLI provides the same explicit continuation:

```sh
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake request "$timescale_request_id"
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake resume "$timescale_request_id" \
  --workspace-id "$timescale_workspace_id"
```

Recover the original complete report through its existing file operation:

```sh
stellar-forge-duckdb --workspace "$timescale_customer_dir" timescale-intake report-file "$timescale_report_sha" \
  --destination "$timescale_report_copy"
```

The destination is a private file outside the customer workspace. The native operation accepts an existing identical file and preserves the original report bytes.

## 6. Run the complete customer receiving programme

The source already provides a complete programme at `stellar_forge_buyer.timescale_intake.receiving`. It joins the original Python customer, native MCP owner, visible browser workflow, full comparison, complete file receiving and portable warehouse reopening.

Use the existing receiving operation and its original private directory. Its input contains:

| Input | Actual original value |
| --- | --- |
| `operation_id` | Existing native receiving operation |
| `source_commit`, `source_root` | The full installed source commit and source directory |
| `workspace`, `workspace_id` | Existing customer warehouse directory and its saved identity |
| `native_workspace` | Original native agent registration/workspace |
| `report` | Complete local report path, original filename and SHA-256 |
| `baseline`, `observed` | Selected original source UUID, every column in native order, complete interpretation and empty import keys |
| `pair` | Name, label, all compared fields and meanings, explicit empty value maps, windows and notes |
| `actor`, `reason` | Actual reviewer and the original engineering observation |

Take field arrays and meanings from the complete reviewed source. The input carries all columns, including those beyond the current browser page. The selected baseline and observed are distinct original sources with their corresponding native roles.

Invoke the installed programme with the actual runtime paths:

```sh
"$timescale_python" -m stellar_forge_buyer.timescale_intake.receiving \
  --input "$timescale_receiving_input" \
  --directory "$timescale_receiving_dir" \
  --node "$timescale_node" \
  --playwright "$timescale_playwright" \
  --chromium "$timescale_chromium"
```

The programme retains `receiving-input.json` and its original native result in the receiving directory. Its browser controls retain and download the complete report, review every source field, import both original editions and save the pair. The original reconciliation receiver then carries the actual pair through the complete review, report and handover. The native client receives the source files and reopens the portable warehouse.

The programme owns its selected customer listener and child browser for this operation. Continue through the same owner and retained inputs. A source or request correction belongs to the existing customer workflow and its deliberate later edition.

Read the returned report, source, edition, pair, run and destination identities together with the customer's actual report. Those are the objects that the receiving engineer continues and the application owner can demonstrate.

## 7. Define the paid unit and complete task cost

For the first installation, a fixed price for the whole agreed commissioning result is a practical starting design. The workorder must still name the merchant's actual priced unit and the entire customer outcome.

| Commercial element | Entry to retain |
| --- | --- |
| Customer task | Selected commissioning report, complete sources, comparison/report and receiving action |
| Priced resource | Original report/file, query/request, page or agreed allowance |
| Resource amount | Whole atomic amount with network, asset, decimals and recipient |
| Complete task budget | Expected priced units and the original aggregate spending authority |
| Implementation fee | Original commissioning price, accepted phases, payer, invoice and collection |
| Operating costs | Hosting, source service, network/provider fees and their actual payer |
| Continuing care | Named maintenance obligation, service period, supported changes and original price |

For a fixed-price unit in one asset, the expected resource amount is unit atomic amount multiplied by expected priced units. Keep different assets and cost denominations separate until the accounting operation selects an explicitly dated valuation.

A complete report that requires several paid requests keeps those original purchases and one parent customer task. Download chunks, report import and saved-result reopening continue the original output. A prepaid allowance records its original purchase and subsequent useful consumption.

The prospective customer deployment connects the chosen Timescale resource to the maintained merchant, approved buyer request and complete output receiving. Save the exact source/report definition, request arguments and payment terms in that installation. Use the existing Buyer workspace for its actual authority and task budget.

Estimate implementation from the agreed source adaptation, customer mapping, deployment, receiving and handover work. Compare actual effort with that original estimate as the project proceeds. The commissioning fee, resource receipts and continuing-care receipts retain their own customers and payment records in [financial operations](../merchant-workspace/FINANCIAL_OPERATIONS.md).

## 8. Commission recurring customer work

Agree the next useful trigger as part of the initial installation.

| Trigger | Original customer continuation |
| --- | --- |
| New operating/reporting period | Select the new complete source population and period; receive a new report/edition and compare against the agreed earlier baseline |
| Corrected source report | Preserve the earlier acquired report, review the corrected native source and receive the new result under its own reviewed scope |
| Changed field or source contract | Save the new interpretation and explicit comparison definition; retain earlier meanings with their original editions |
| Distinct customer analysis | Save the new request and output purpose, review its cost and receive its complete result |
| Saved report reopening | Continue the original request, report and warehouse identities |

Use **Merchant operator → Workflows → Recurring customer work** for the named series, period inputs, saved runs and prior-period history. The [series guide](../../stellar-forge/mcp-merchant-operator/console/WORKFLOW_SERIES.md) describes its native browser and client operations.

Ask the customer which decision the next result supports and when the underlying source changes. Actual recurring demand shapes the service and care offer. Preserve that learning in the original opportunity and installation.

## 9. Assign the installation to the existing six funded packages

When this customer is selected for the SCF cohort, assign its prospective work within the original programme. The amounts below are the whole two-installation grant package totals.

| Package / window | Programme hours / USD | Timescale-specific implementation and completion |
| --- | ---: | --- |
| T1 merchant-resource integration / days 1–30 | 80 / 7,600 | Actual source/host, complete field review, useful paid resource, buyer setup and full original customer analysis |
| T1 authority and handover / days 1–30 | 40 / 3,800 | Second operator reopens the installation and completes the agreed source/terms change or withdrawal |
| T2 provider and ledger deployment / days 31–90 | 70 / 6,650 | Same useful operation through two independently operated facilitators, original payment attribution and recurring testnet use |
| T2 deployed threat response / days 31–90 | 50 / 4,750 | Customer-specific response and monitoring; interrupted settled delivery and merchant failure continue through useful output |
| T3 mainnet rollout / days 91–150 | 90 / 8,550 | Production hosts/terms, recurring task, release and rollback, independent buyers' later useful purchases |
| T3 production recovery and handover / days 91–150 | 70 / 6,650 | Restore original state/warehouse on the receiving host, reconcile later work and complete the maintainer's support case |
| **Total programme** | **400 / 38,000** | **Two merchants, two independent buyers, two facilitators and maintainable customer services** |

The rate is the original USD 95/hour planning assumption. The three delivery windows retain USD 11,400 / 11,400 / 15,200. Day zero is actual award acceptance. Bryce assigns actual contributors, rates and available working days.

T2 retains at least ten useful testnet purchases in total by two independent buyers during seven consecutive calendar days ending by day 90. T3 retains at least thirty useful mainnet purchases in total by two independent buyers during fourteen consecutive days ending by day 150, with both returning for a distinct purchase on another day.

Assign each adaptation once to the actual grant work package or its separately commissioned commercial workorder. Existing implementation supplies the starting product. The proposal funds prospective deployment and receiving work; purchase principal and service costs retain their own funding basis. Its incremental service reserve and hosted Actions budget remain USD 0.

## 10. Measure complete work, cost and repeat use

Use the existing [Cohort interface](../../stellar/scf_2026/sf47_budget_model/workspace/OPERATIONS-COHORT.md) to connect original purchases, parent customer tasks, operators, providers, output and completion days. Record the customer's actual report identifiers in the same installation.

| Observation | Meaning for this customer |
| --- | --- |
| Time to usable first report | From agreed original source selection to the engineer opening the complete analysis |
| Field/reconciliation effort | Actual engineer work interpreting fields and resolving meaningful differences |
| Time to a corrected or later result | Actual continuation from a new source/period to usable customer output |
| Whole completed customer tasks | Complete selected reports and receiving actions with all required output |
| Completed purchases | Original intents meeting the pinned settlement, full-output and applicable fulfillment criteria |
| Return use | Distinct useful original purchases on different UTC completion days under the cohort rule |
| Resource receipts | Original settled quantities by network and asset |
| Implementation effort and revenue | Original assigned work, accepted invoice and actual receipt records |
| Receiving and recovery | Engineer continuation, elapsed recovery and later-operation reconciliation |
| Support demand | Actual source/release changes and customer assistance needed after handover |

Choose the original seven-day or fourteen-day cohort window and record the actual cutoff. Preserve original first-attempt and completion times. Accountable organizations determine independent operator counts.

A saved report or a repeated original request retains its earlier purchase identity. A later useful report under a prepaid allowance can add a customer task while its consumption remains under the original allowance purchase. The native product and financial records retain these relationships.

Use the observations to refine the next commissioning estimate, identify reusable source interpretations and choose an ongoing-care scope grounded in actual customer work.

## 11. Hand over the entire installation

Export the selected Installation edition through **Export complete handover** in Grant Operations. Its original case carries the commissioning attachment, roles, accepted phases, selected source/runtime and saved history.

Accompany it with the original product's complete customer handover:

- Original commissioning report, all native source files and their saved scope.
- Reviewed immutable baseline/observed editions and complete field meanings.
- Exact saved pair, comparison run, engineering decisions and report.
- Portable DuckDB warehouse and its original receiving result.
- Source release/archive, installed runtime and actual configuration references.
- Merchant/buyer task definition, original purchases and financial continuation.
- Named maintenance owner, source/terms change procedure and agreed care scope.

The receiving engineer reopens the selected customer report and source editions, continues a later period or agreed correction, and operates the maintained source/recovery procedure. Retain that engineer's actual receiving destination and work with the original installation.

## Maintained source references

- [Timescale producer](../timescale/OPERATING.md): original capture, commissioning and immutable report.
- [Timescale customer](OPERATING.md): complete source, native meanings, CLI/MCP, browser and portable receiving.
- [Paired reconciliation](../paired-reconciliation/OPERATING.md): saved definitions, complete row accounting, decisions and reports.
- [Customer launch](../merchant-workspace/CUSTOMER_LAUNCH.md): original commissioning, installation, financial and funded workflow.
- [SCF application](../../stellar-forge/developer-site/dist/grant-data/application.md): existing award request, work packages and adoption criteria.
- [Timescale grant chapter](GRANT.md): source-specific customer and funded-deployment narrative.
