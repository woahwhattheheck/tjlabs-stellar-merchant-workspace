# Commissioned preparation pipelines

Prepare a complete saved SQL pipeline order, execute it through the original paid Jobs worker and independently receive its editable customer project.

The complete [commissioning guide](../../../../../products/data-preparation/COMMISSIONING.md) covers selected installation, actual payment configuration, complete source review, original Request/Buyer operation, named reports/results, editable receiving, offline reopening and interruption recovery.

Installed command: **starforge pipeline-jobs --help**.

Public APIs:

- **pipelineJobConfiguration** and **writePipelineJobConfiguration** configure the original merchant.
- **preparePipelineJob** freezes the actual saved project, revision, source bindings and report name.
- **executePipeline** is the original Jobs application's named function.
- **receivePipelineJob** verifies the whole named result package and receives the editable project.
- **reopenPipelineJob** verifies the original delivery offline while preserving later customer work.

The original process supervisor owns execution and disposal. The original Jobs writer binds the package to its retained job, attempt and native settlement. The original pipeline engine owns SQL, recipes, stage results and resume. Select **distribution/selections/data-preparation-jobs.json**.
