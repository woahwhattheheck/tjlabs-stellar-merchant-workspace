# TONDO → CourseStorm: complete implementation handover

Reviewed 13 October 2026. This guide accompanies the Class Intake and Family Tuition implementation and the three complete TONDO programme editions and original PDF documents. It supplies the original CourseStorm relationship owner with a configuration and migration plan that can be used directly in the existing conversation.

## Implementation decision

Use the private tuition workspace as the working record for source selection, household decisions, exact charges, payment correspondence, signed-form references and next-year history. Configure CourseStorm against that selected edition, then reconcile the actual provider export back to the same records. The implementation should reach a usable catalogue and staff-operated registration cycle, with a complete receiving copy and clear responsibility for each system.

Three vendor facts materially change the scope. The built-in catalogue importer covers classes, instructors and locations; student profile migration is an assisted, separately quoted service. Pro includes payment plans and attendance, while All Access lists sessions, custom payment methods and integrations. A monthly instalment schedule and a new monthly registration have different operational and fee implications. Sources: [vendor FAQ](https://www.coursestorm.com/faqs), [current pricing](https://www.coursestorm.com/pricing), [payment schedule description](https://www.coursestorm.com/blog/custom-payment-plan-schedules).

The first implementation edition can use the studio’s existing signed forms and payment correspondence as retained source records while the original relationship owner obtains the actual tenant configuration. This lets catalogue cleanup, family records, fee decisions, allocations and staff training proceed together.

## 1. Choose the school’s actual programme and policy editions

The companion fixtures contain the homepage, Art Classes page and original registration PDF separately, with the original URL, retrieval date, raw cells and explicit interpretations. The three PDFs were downloaded successfully and their programme, calendar and policy pages visually inspected on13October2026. Each edition remains available.

| Decision | Homepage | Art Classes page | Operator action |
|---|---|---|---|
| School-age programme | Combined7–10 band | Separate7–9 and8–10 bands | Select the actual band for each student and retain the selected source. |
| Thursday school-age slot | Included in combined band | Listed for7–9; absent for8–10 | Use the chosen programme’s schedule when selecting weekly slots. |
| Adult tuition | USD205/month | USD240/month | Record the studio’s chosen current rate as a sourced decision. |
| Adult timetable | Wednesday10:00–11:30, stated90minutes | Wednesday09:30–11:00, stated120minutes | Resolve the page’s duration/time disagreement explicitly. |

The web publications state USD50 registration for new students, USD25 for returning students and a10% sibling discount. The original registration form additionally gives siblings the USD25 registration fee and describes a15%senior discount and4%credit-card tuition charge. Its programme page differs again:3–4 and7–12 bands, Friday options for the youngest groups, and an extra Friday10–15 slot. The form's adult rate/timetable agrees with the homepage. Preserve the third full programme fixture when making the current studio selection.

The separate terms specify10%off the second child's tuition, monthly dues on the1st and flat tuition despite holidays or vacations. The calendar begins8September2026 and ends26June2027, with18closed dates. Two art-show dates are events; they do not independently declare class closure.

Make-up rules need an explicit edition selection: the form allows a30-day window with active membership and studio approval; the separate terms specify four per school year within two weeks before or after an absence. Both require24-hour notice, with illness/emergency discretion stated in the form. The policy comparison retains these exact differences and the actual source page for each.

Sources: [home](https://www.tondoartstudio.com/), [Art Classes](https://www.tondoartstudio.com/artclasses), [registration form](https://www.tondoartstudio.com/s/Student-Registration-Form-1-1-1.pdf), [calendar](https://www.tondoartstudio.com/s/Calendar-2026-27.pdf), [terms](https://www.tondoartstudio.com/s/Terms-Conditions-2026-2027.pdf).

Keep these four objects separate in the operating record:

1. A programme describes the age band and published teaching duration.
2. A plan gives a monthly price for an explicit one-, two- or three-times-weekly frequency.
3. A slot supplies a weekly day and clock-time interval.
4. A confirmed school calendar supplies actual dates, closures and the start/end of enrollment.

The original registration form, calendar and terms PDFs are included as complete source files, with their hashes and page references in the source index and factual fixtures. Import the18explicit closed dates from the calendar. Keep the selected agreement and make-up policy edition tied to each actual household decision. The printed registration form has four pages and no interactive AcroForm field tree.

## 2. Configure the full household workflow

| Stage | Operator supplies | Saved result and operational use |
|---|---|---|
| Household | Existing family identity, responsible adult and contact source | One family relationship used by all selected students. |
| Student | Original student identity, birth date and new/returning status source | Age and registration-fee decisions remain explainable next year. |
| Enrollment | Programme, frequency plan, actual slots and enrollment dates | A dated schedule that can be checked for overlap and capacity. |
| Charges | Explicit billing periods, due dates, chosen monthly price and named adjustments | Exact per-student charges with registration fee visibly separated. |
| Siblings | Eligible students, percentage/base and source decision | Reproducible per-line discount and rounding. |
| Agreement | Original signed document/reference, signatory and terms edition | Staff can reopen the actual agreement used for confirmation. |
| Payments | Original receipt/payment correspondence, currency, amount and date | A retained payment record available for exact allocation. |
| Allocation | Chosen payment, charge and amount | Applied, outstanding and unallocated amounts remain distinct. |
| Confirmation | Staff identity, capacity check and actual confirmation reference | The confirmed roster retains the reason the place was accepted. |
| New year | Selected previous-year students and explicit new programme/plan decisions | Prior agreement, price, payments and consumption remain in history. |

Do the complete example with two siblings, an adult student and a returning student. Include one midyear start, a period with a closure, a split payment and an unallocated receipt. Edit a later period and reopen the prior edition to ensure that the staff view makes the original charge and the later decision clear. These are operational examples for the existing application; exact real dates, capacities and payment references come from the selected source records.

Age eligibility and frequency selection are different decisions. A student may meet two age bands but still need a named programme choice. A three-times-weekly price also requires three selected weekly slots; it should not be inferred from a label alone. Explain any shared-room or shared-instructor arrangement in the actual schedule configuration.

## 3. Select the CourseStorm configuration

[Current pricing](https://www.coursestorm.com/pricing), retrieved13October2026, advertises these starting subscription amounts in USD:

| Plan | Annual billing, monthly equivalent | Annual subscription | Monthly billing | Twelve monthly payments |
|---|---:|---:|---:|---:|
| Starter |99 |1,188 |119 |1,428 |
| Core |169 |2,028 |219 |2,628 |
| Pro |269 |3,228 |329 |3,948 |
| All Access |399 |4,788 |499 |5,988 |

All plans add USD2.49 per registration and Stripe processing. Pro lists payment plans, age restrictions, instructor access and attendance. All Access adds sessions, custom payment methods and integrations. The original vendor owner should obtain one written quote for the selected account, including assisted migration and integration entitlement.

Use three concrete configuration exercises in the existing vendor conversation:

**A. One student, two weekly slots, monthly tuition.** Configure one real continuing enrollment, its calendar and all monthly due amounts. Show how the plan behaves when the student starts partway through the school year, changes weekly frequency or leaves. CourseStorm’s historical schedule guide describes custom weekly/monthly payments, including a start date and amount; the current account should demonstrate the whole schedule and end condition. [Payment schedule source](https://www.coursestorm.com/blog/custom-payment-plan-schedules).

**B. Two siblings, different programmes, one household payment.** Demonstrate the exact discount recipient, registration-fee treatment, two separate enrollment records and the allocation of a single family payment. Retain the provider’s actual resulting charges and export, and compare those figures with the family tuition record.

**C. Alternative class sessions and dated attendance.** CourseStorm’s session description gives each session its own registration, roster and waitlist while sharing class information. Its attendance feature is a dated roster record. Decide how these concepts map to the studio’s weekly choices and any prepaid visit entitlement. [Sessions](https://www.coursestorm.com/blog/course-sessions-duplicate-class); [attendance](https://www.coursestorm.com/blog/new-feature-attendance-tracking).

The accompanying JSON contains eight specific configuration questions and the concrete provider result needed for each. The original sender can work through them in the current relationship rather than restarting discovery.

## 4. Model the fee implications before selecting enrollment granularity

The reusable arithmetic is:

`subscription + USD2.49 × billable registration events + actual processing + one-time services`.

For illustration, assume100students and a10-month school year. This is a planning scenario. The actual vendor rules determine which events incur a registration fee.

| Annual-billing plan |100registration events |1,000registration events |
|---|---:|---:|
| Pro |USD3,477 |USD5,718 |
| All Access |USD5,037 |USD7,278 |

These totals include subscription and registration fees only. The900-event difference adds USD2,241. Card-processing cost also depends on the actual charge count, amounts and account rate; obtain that quote and apply it separately. A reusable payment schedule could therefore be materially preferable to creating a fresh registration every month, if the provider supports the school’s required enrollment behavior.

For the final implementation quote, itemize our source cleanup/configuration/migration/training work separately from the vendor subscription, processing and assisted-import fees. Keep any optional ongoing reconciliation service as its own line so the studio can see what staff work it replaces.

## 5. Perform migration through actual provider import surfaces

The merged Class Intake export is `course_sheet(view)` in `class_intake.py`. Its complete package includes `reports/coursestorm-reviewed-catalogue.csv` and the saved import plan. The selected row set, catalogue, reviewer and note are explicit. Its supported export shape is a reviewed class catalogue with a single price, dated enrollment window and known capacity.

For TONDO’s multiple frequencies, complete the tenant configuration before selecting the corresponding class/session export. Preserve the chosen family plan and weekly slots in the private workspace so the provider record can be compared to the original decision.

The complete provider migration course is:

1. Export the actual tenant’s catalogue template. Preserve its headings, field choices and target catalogue identity.
2. Map the selected source programme/plan/schedule to the tenant’s actual fields. Retain each local ID beside the provider ID in the migration result.
3. Import into the selected catalogue, resolve the provider’s invalid-cell report, then save the full provider result and downloaded catalogue.
4. Compare programme count, enrollment windows, prices, capacities, instructors and visibility against the approved input.
5. Apply the separately agreed student-profile migration using the Customer Success template and quote. Preserve family links and receive a full resulting student export.
6. Bring historic enrollment, agreement references and financial opening balances over by the specific method agreed with the vendor. Identify every opening amount by original receipt/charge reference and cutover date.
7. Operate the first full household registration in the selected account, then reconcile its charge, payment and roster outputs with the private workspace.
8. Publish the chosen catalogue and hand staff the daily process described below.

Provider documentation recommends using an exported/official template and CSV; the importer maps columns and presents invalid cells for correction. Earlier catalogues can remain available as history for preparing future editions. Sources: [formatting](https://coursestorm.atlassian.net/wiki/spaces/CSHD/pages/4489321/Formatting%2BYour%2BCatalog%2BSpreadsheet%2Bfor%2BImport), [import](https://coursestorm.atlassian.net/wiki/spaces/CSHD/pages/4489349/Importing%2BClasses), [catalogues](https://coursestorm.atlassian.net/wiki/spaces/CSHD/pages/3816620048/Managing%2BYour%2BCatalogs).

The API connection is a later concrete account configuration step: obtain the provided endpoint, schema, entitlement and API user, then map actual permitted operations. The official API article describes invitation-based credentials and an initial account through support. Keep the credentials in the receiving host’s configuration and the field mapping in the handover. [API source](https://coursestorm.atlassian.net/wiki/spaces/CSHD/pages/4980805/REST%2BAPI).

## 6. Run the school’s daily and monthly operation

**Daily:** receive forms and payment correspondence; match the existing household/student; check the selected agreement, amount due and actual space; record the staff confirmation; reopen the resulting roster. For an ambiguous payment, retain it as unallocated and match it after the payer/reference is resolved. For a withdrawal or transfer, receive the actual provider outcome before changing the original charge allocation.

**Monthly:** compare the expected due schedule to the actual charge/payment export; review outstanding balances, unallocated amounts, returned payments, credits and cancellations; send the selected follow-up through the existing relationship/account; preserve the completed period with its correspondence. The provider says cancellation of a payment-plan registration also cancels future scheduled payments; include that behavior in the actual account exercise. [Cancellation source](https://coursestorm.atlassian.net/wiki/spaces/CSHD/pages/3446407190/Cancelling%2BRegistrations).

**Year rollover:** retain the prior year, prepare the new source/calendar edition, confirm returning status, choose new bands and slots, and bring over only the explicitly selected available balance. The family workspace’s consumed-receipt history remains part of that decision. Reopen both years after the new enrollment so staff can answer a parent’s question without rebuilding last year’s record.

## 7. Deliver one complete operating package

The final receiving package should contain the selected school source edition, actual documents, original household/student mappings, complete saved tuition workspace, current catalogue and provider exports, agreement references, correspondence, roster, closing balances, next-year choices, operating instructions and application source. Use the existing complete export/receive operations so the recipient can reopen the same work and continue it.

Keep the original48DB CourseStorm relationship and current Sales thread as the commercial home. The substantive package to bring into that conversation is now the actual workflow, three programme editions, actual calendar and policy documents, cost model, migration route, concrete vendor configuration exercises and complete application. The vendor response can be applied directly to this handover and the same working case.
