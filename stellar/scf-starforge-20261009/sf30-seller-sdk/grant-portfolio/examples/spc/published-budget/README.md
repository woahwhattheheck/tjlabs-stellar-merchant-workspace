# SPC published annual planning source

This source contains the complete 43-row published table “Expenditure by Programme (EUR) – 2025R / 2026” from SPC’s 2026 budget. Its original indexed table, all cells and eight chapter groups are retained. The structured JSON keeps the published headers and original blank cells. The long CSV has one funding-category/year cell per row, including blank cells.

Source: https://www.spc.int/DigitalLibrary/Doc/SPC/Annual_Reports/Green_Book/English/39006_SPC_BUDGET_FINANCIAL_YEAR_ENDING_31_DECEMBER_2026_1.pdf?attachment=true

## Original measures and selections

The publisher’s 2025R and 2026 labels are distinct annual planning editions in EUR. The application may receive these as forecast/planning amounts. They are budget expenditure figures. No monthly allocation, 2027 forecast or accounting actual is added. Blank cells remain empty/null, with an explicit source-cell flag. Published totals are reference controls: select programme rows for additive budgets, or select a chapter total as one aggregate; combining both counts the same programme twice. Income totals are separately classified and have published_measure=budget_income in the CSV.

The CCES programme row is source key spc-budget-2026-table-e1-row-041. 2025R contains core 1,079,663, restricted programme 5,100,504 and restricted project 5,748,303, total 11,928,470 EUR. 2026 contains 1,173,646, 5,326,271 and 5,816,142, total 12,316,059 EUR. Preserve both original year labels and all three funding categories when selecting the two annual editions.

## Retrieval and use

The exact original table was returned in full by the primary-document search index between 04:41:44 and 04:46:57 UTC on 13 October 2026. Its full HTML, source row indices, complete headers, published labels and raw amount strings are included. Direct PDF opening returned HTTP403; no page number or binary PDF identity is asserted. The source remains suitable as an explicitly identified indexed publication capture. A later received original PDF can add its exact bytes/page without changing these original records silently.

21 programme rows, 31 amount-bearing rows, 248 long-form cells and 33 original blank amount cells are preserved. All monetary values are decimal strings. No exchange conversion is applied. Original published spelling is retained.
