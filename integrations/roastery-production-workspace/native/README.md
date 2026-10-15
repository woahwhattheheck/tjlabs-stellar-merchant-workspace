# Native roastery workflow

Node 18 or later; only built-in Node modules are used. Run from the extracted source root. Output directories must be new.

## Build the two single-file desks

```sh
node native/build.mjs /absolute/new-roastery-build
```

This writes a blank production HTML/workspace pair and a clearly labelled worked example pair. All browser modules are inlined from maintained source. To include a private prospect programme, pass its JSON path as the second argument; it needs a profiles array. Keep programme editions in the appropriate private delivery route.

## Run a source-native production period

```sh
node native/cli.mjs examples/originals/commands.json /absolute/new-roastery-output
```

The supplied commands receive all seven exact authored CSV files and freeze the reviewed example. The native CLI writes the complete workspace, calculated plan, roast-batch CSV, human-readable report, and execution metadata. File and calculation errors produce a nonzero exit.

Each command is one JSON object in an array. File paths resolve relative to the command file. Optional at is retained as the event timestamp; omitted timestamps use current UTC.

| Operation | Required fields | Effect |
|---|---|---|
| open | path | Reopen a complete workspace before further commands |
| name | value | Set the production period name |
| receive | table, path | Retain original CSV text and apply one table |
| freeze | reviewer, note | Save an immutable input and calculated plan edition |
| outcome | planId, batchId, green_g, roasted_g, reference, note | Append measured batch output or a correction to the previous outcome |
| notes | value | Retain working notes |

The receive table is one of lots, profiles, products, recipes, orders, roasted, packaged. The exact columns and arithmetic are in docs/OPERATOR.md. Stock snapshot, losses, package weights, required dates and recipes must describe the actual period. Use the generated plan IDs and batch IDs in subsequent outcome commands.

To continue a prior period, start a new command file with an open operation referencing its complete workspace. A measured outcome retains the plan binding; a correction appends history. The current stock table is not automatically depleted by these records. A new period needs actual updated stock and outstanding orders.

## Recover the exact source

```sh
node materialize.mjs Roastery_Complete_Source.json /absolute/new-roastery-source
```

The materializer checks the complete manifest, relative paths, byte lengths and SHA-256 before creating the source directory. It writes each file create-only. The complete JSON source carrier and ordinary directory are alternative ways to preserve the same source.

## Runtime boundary

The production arithmetic was executed in V8 with the authored seven-table period and independent hand calculations. The source-native CLI uses the same exported factory. A Node command listed here is a runnable entrypoint; retain actual Node version, output files and exit result when running it.
