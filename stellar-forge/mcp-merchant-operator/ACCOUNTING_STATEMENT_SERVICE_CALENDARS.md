# Recurring customer service close

**Service calendars** continues the existing Customer closing workbench from saved weekly or monthly customer periods through the original service planner and saved closing cycles. Operators retain the schedule, choose actual native captures, review the original statement and continue its existing issue/resume/customer-handover workflow.

Open the installed Customer closing application with its original merchant connection, workspace and private closing directory. Choose **Service calendars** in the same navigation.

## Save and operate a customer calendar

1. Refresh calendars and service history. Choose the current assigned customer and immutable purchased pass.
2. Name the calendar, choose its first opening date, weekly or monthly cadence, interval and days after close until due. Optionally choose a final service date and operator notes. Save the calendar edition.
3. Read the desired date window. The complete window includes periods that overlap its start and end. The table distinguishes upcoming periods, ended periods before their due date, periods due today and overdue periods. Current native statements and saved original preparations appear alongside those dates.
4. Select periods across customers. For each, choose a completed accounting run and the actual original opening and closing captures. Unique captures exactly on both scheduled boundaries are initially selected. If their times differ, inspect and explicitly accept the actual source boundaries.
5. Name the cycle and choose **Review selected customer periods**. The complete original service plan retains its customers, pass identities, source hashes, actual dates and history notes alongside each calendar period. Open the complete native statement preview from any reviewed row.
6. Choose **Prepare original closing cycle**. The calendar saves the complete chosen plan and its request identity before asking the existing cycle engine to prepare native customer reviews.
7. The original saved cycle opens. Review its statements, issue or resume using the same existing action, and retain complete grouped customer handovers. Refresh calendars to see current native statement status and original cycle links.

Use **Open service planner and corrections** for a correction, a withdrawn period or work that uses an explicit unscheduled source interval. The calendar links its original preparations and keeps the native statement history authoritative.

## Date meanings

Calendar dates use **UTC midnight**. A monthly anchor retains its original day: January 31 → February 28/29 → March 31. It does not drift after February. Weekly periods advance by seven UTC days times the chosen interval. The final service date may shorten the last period.

The window end is exclusive. A period appears when any part intersects the selected window. The due date is the scheduled close plus the chosen number of UTC days. An ended period before that due date reads **Period ended**. On its due date it reads **Due today**, and on later UTC dates **Overdue**.

The date window can span up to ten years. Calendar rows and preparation history are paged. The readable HTML and CSV exports include the **whole selected window**, preserving each scheduled range, actual prepared capture range, current statement number and original cycle reference.

Scheduled dates never rewrite capture times. The original service-period compiler owns all actual usage comparisons and arithmetic. Captures at tied boundary timestamps require an explicit choice. Assignment changes stay visible. Pause the original calendar and create a new calendar for a different customer assignment or purchased pass; its original service history remains attached to the preceding calendar.

## Saved editions and source history

Each calendar save appends an immutable settings edition. Pausing affects inclusion in the default calendar; it preserves saved editions and existing preparations. A new edition can change future planning while older reviewed plans retain their exact original settings.

A preparation retains the selected edition, period index and dates, complete service plan, actual source boundaries, label and original request identity. The same schedule and date pair belong to one original prepared cycle. Open that cycle to continue it; use the native service planner when the existing statements need correction.

The store is inside the existing private closing directory at **.service-schedules**. Its settings use atomic replacement, and original preparation files are written before the native cycle begins. The installed state lease coordinates separate operators using that same directory. A stale settings revision asks the operator to refresh while the browser keeps the edited form.

Browser choices are scoped to the original merchant/workspace/directory. **Download complete plan** and **Download original request** preserve the reviewed selection and an interrupted preparation independently of browser storage.

## Interrupted operations

A lost preparation response keeps the original request. **Recover or continue original preparation** reuses the exact saved plan and request; the existing cycle engine checks its saved request and resumes its original review. Saved preparation history provides the same continuation after the browser reopens.

The preparation may exist before its cycle request reaches disk. The calendar preserves that state and retries the same original preparation. Its period already points to that saved request, so another browser does not silently start a duplicate cycle.

For a failed settings import, refresh and retry the same complete export. Imported editions with identical identities are reused; conflicting editions are reported without replacing them. Each retained record is independently atomic, so an interrupted multi-record import can continue from its saved records.

## Complete export and receiving

**Download complete calendar workspace** includes all saved settings editions and every complete preparation plan, with source hashes and original request/cycle identities. Import it into the same merchant URL and workspace using **Import complete calendar workspace**. The import preserves longer local histories and rejects divergent copies of the same edition.

The calendar export retains planning and handoff history. Receive the original saved cycle folders through the existing closing-cycle handover to continue the actual prepared reviews and statements on another installation. Imported preparation references open their existing original cycle; they do not manufacture a second cycle from an absent received folder.

The original customer record, pass assignment, native captures, statement writer, corrections, withdrawal, cycle recovery and customer packet operations remain available in the same application.

## Installed command line

The distribution installs **customer-service-calendar** alongside **customer-closing**. It talks to the already running local workbench, keeping one native merchant connection and the original cycle writer.

~~~sh
customer-service-calendar catalogue --workbench http://127.0.0.1:4419 \
  --out /absolute/private/calendars.json

customer-service-calendar calendar --workbench http://127.0.0.1:4419 \
  --request /absolute/private/calendar-window.json \
  --out /absolute/private/calendar-window-result.json
~~~

A calendar window request is:

~~~json
{"from":"2026-10-01","until":"2027-01-01","includePaused":false,"offset":0,"limit":100}
~~~

Set **format** to **html** or **csv** to receive the whole window as a readable file. When the result is a file, **--out** writes those original report bytes. Otherwise it writes the complete JSON response. Existing output files are preserved.

| Operation | Complete request |
| --- | --- |
| catalogue | No request required. Returns all calendar editions and current settings. |
| save | expectedRevision, optional id, and definition with name, active, customerId, bindingId, periodIdentitySha256, orderRef, anchor, cadence, interval, dueDays, endDate, notes. |
| calendar | from, until; optional asOf, includePaused, offset, limit and format. |
| compile | selections containing scheduleId, version, index, runId, usageOpeningId, usageId and optional acceptDifferentBoundaries. |
| prepare | requestId, label and the complete scheduledPlan returned by compile. |
| request | Original requestId; read whether its complete preparation was saved. |
| resume | Original requestId. |
| history | Optional scheduleId, offset and limit. |
| export | Empty object. Returns the complete portable calendar workspace. |
| import | bundle from export and expectedRevision from the receiving catalogue. |

Use the full returned identifiers and source objects. Save the original preparation request before sending it, and recover that identity after a lost response.

## Library interface

The typed distribution export is **./merchant/customer-closing/service-schedules**. It exposes the pure UTC recurrence functions and **createAccountingStatementServiceSchedules**.

The store receives the existing native inventory reader, original cycle-preparation callback and original saved-cycle reader. Its methods mirror the HTTP operations above. The server routes live under **/api/service-schedules/** and share the original local workbench origin, session and CSRF checks.
