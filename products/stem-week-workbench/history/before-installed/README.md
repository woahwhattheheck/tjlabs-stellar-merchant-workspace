# Weekly stem planning workbench

Open a complete browser workspace for four original CSV tables, exact-variety weekly supply/demand, harvest and CSA packing pulls, grower decisions and source-edition history.

```sh
node build-workbench.mjs NEW_BROWSER_DIRECTORY
node run-course.mjs NEW_COURSE_DIRECTORY
node cli.mjs receive --manifest examples/native-manifest.json --out NEW_WEEK_DIRECTORY
```

Open Stem_Week_Workbench.html for a blank farm or Stem_Week_Worked_Example.html for the complete authored two-edition case. [WORKBENCH.md](WORKBENCH.md) covers browser operation and recovery. [OPERATE_WEEKLY_STEMS.md](OPERATE_WEEKLY_STEMS.md) documents the complete source contract, exact arithmetic and native continuation. [RECEIVING.md](RECEIVING.md) carries the original equipped receiving operation and current owner instruction.

All original UTF-8 source text is retained, including BOM and line endings. Projected and actual bases remain separate. Own-grown and bought-in origins are explicit; missing observations are not zero. Exact internal recipes drive firm demand, and tentative/cancelled lines remain separate. A grower decision cannot silently change stock or recipes. All earlier source editions and decision revisions survive full JSON/report handover.

The UI saves complete source plus unfinished forms using transactional IndexedDB heads and independent recovery copies. The CLI accepts complete browser desk JSON and retains its exact original input alongside the new calculated package. The blank app starts empty; all worked quantities are explicitly authored.

The unchanged upstream flower-farm-math MIT source and license are retained under vendor/flower-farm-math. Its original reconciliation is used only on validated complete named-variety inputs; the primary planner does not infer flexible bouquet/CSA fulfilment from a scalar surplus. See THIRD_PARTY_NOTICES.md.
