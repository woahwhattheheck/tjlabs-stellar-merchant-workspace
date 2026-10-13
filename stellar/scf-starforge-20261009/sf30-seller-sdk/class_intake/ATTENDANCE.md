# Dated sessions, instructor confirmation and visit credits

Class Intake now includes an attendance desk at **/attendance** in the same local workspace as catalogue review, registration, payment matching and CourseStorm preparation. Use the **Attendance** link in the main operator. The interface uses a neutral, compact industrial layout.

## Start the operator

Run the retained source with Python 3.11 or later and installed IANA timezone data:

~~~sh
python3 -B server.py --workspace /ABSOLUTE/private-class-workspace
~~~

Open the loopback URL printed by the server and choose Attendance. The same private workspace retains its assigned loopback port on restart, so unfinished browser requests remain attached to their original origin. Close the original operator before opening another process against that workspace.

The main intake desk accepts complete source files and saved interpretations. Create or receive the original intake before creating its attendance book. The attendance book selects one exact intake ID, edition and derived-content hash. Its heading displays that selection. A newer intake edition appears as an explicit adoption choice; retain the reason for adopting it. Existing enrollments retain their original student and class when adopting a newer edition.

## Daily operation

1. **Open the original book or create one from a saved intake.** Give the book a descriptive name and state the reason for the initial selection.
2. **Plan dated sessions.** Select an original catalogue class, name the instructor, enter start/end with numeric UTC offsets and an IANA timezone, and set capacity. Scheduled and completed sessions enforce the selected catalogue capacity. A session is a dated meeting, so a four-visit enrollment can use nonconsecutive weeks. Once a visit references a session, retain its date, timezone and instructor; reschedule through a new dated session.
3. **Grant the enrollment’s visits.** Select the original registration ID and enter the granted visit count and basis. A four-visit class normally receives four visits when the operator has confirmed that enrollment. Grant history remains visible; use a named adjustment to correct it.
4. **Record the instructor’s confirmation and book.** Booking, attendance and missed attendance require the selected instructor, confirmation time, actual communication method and reference. A proposed visit or waitlist entry can be recorded before confirmation. Registration payment balance remains visible beside credits.
5. **Record what happened.** Attended consumes one visit. Booked reserves a place and one available visit. Cancelled or missed requires an explicit choice of zero or one consumed visit and a reason. The original grant, corrections and all earlier saved editions remain available.
6. **Reschedule by naming a replacement.** The original visit points to a separate new visit in another dated session. It stops consuming or reserving a visit; the replacement carries its own state and confirmation. Further reschedules retain the chain.
7. **Export the complete handover.** The ZIP carries the selected original intake, source files, complete saved requests and histories, derived attendance view, balances and register. An independent workspace can receive it directly from the attendance screen.

Only active original registrations can reserve a booked place. Every booked, attended or missed entry occupies one place in that session. The same student cannot hold overlapping sessions across registrations. Concurrent sessions cannot split one class’s capacity, and the same named instructor cannot teach overlapping active sessions.

### Credit calculation

| Field | Calculation |
|---|---|
| Granted | Original enrollment’s named visit grant |
| Adjustment | Sum of append-only, signed visit adjustments |
| Used | Sum of each visit’s explicit consumed units |
| Remaining | Granted + adjustment − used |
| Booked | Number of visits in booked state |
| Available | Remaining − booked |

A save that would make available visits negative is refused before its edition is committed. Append a correcting adjustment with operator, time and reason when a grant or accommodation needs changing.

### Cancellation and refund handling

Attendance records the operator’s named visit decision. Monetary refunds remain in the original transaction source and intake reconciliation. The selected registration’s exact integer fee, paid amount and balance are shown alongside its visit credits.

The public Berea registration form distinguishes workshops from multi-session classes. It describes 24-hour notice, partial refunds, a workshop reschedule option, and case-by-case accommodations. The course catalogue also contains varying registration deadlines. Those details require a class-specific decision; the operator records the applicable reason and explicit consumed visits. Keeping that decision visible allows the administrative and teaching records to agree without silently inferring an unwritten policy.

## Public source basis

The included catalogue retains all 26 factual rows from Berea’s Fall 2026 material, including the original conflicts for weekday, advance-registration timing and alternate price interpretation.

- [Fall 2026 catalogue](https://bereaarts.org/pdfs/FALL%202026.pdf?v2=): Drawing is a Wednesday four-visit course that can start in different weeks; Acrylic is a Thursday four-visit course. Their visits may be nonconsecutive.
- [Registration form](https://bereaarts.org/pdfs/Art%20Classes%20Registration%20Form_7.28.24.pdf): six-student class maximum, instructor confirmation before attendance, cancellation/refund conditions and possible accommodations.
- [Classes page](https://bereaarts.org/classes.asp): current catalogue entry point and class payment information.

The example’s student IDs, payment records, dated attendance decisions and instructor confirmations are explicitly generated engineering inputs. Source metadata preserves that distinction beside the public catalogue facts. The same workflow accepts actual administrative exports when available.

## Resuming work

Before dispatching a save, the browser stores its complete request body in IndexedDB under the current workspace identity. Resume checks that original request ID before sending the same body again. The saved expected edition protects a colleague’s intervening work.

The complete selected ZIP is likewise retained before a receive begins. If communication stops, resume the original receive. A rejection may be discarded when the server explicitly reports that adoption did not occur. Successful receiving validates and reconstructs the whole history before adopting it in one SQLite transaction. Re-receiving an older source packet retains a recipient’s newer local editions.

Choose earlier editions from the history selector to inspect them. The form remains read-only for an earlier edition; reopen the latest edition to record a correction.

## Complete operated programme

Run the original base programme first. Its output contains the actual complete intake ID and workspace path:

~~~sh
python3 -B operate.py --output /ABSOLUTE/original-operation/intake
~~~

Run the base browser programme next when using Chromium. It exercises the original desk and finalizes its own complete handback before attendance extends that same source case. Use the browser configuration and browser.py command described in README.md.

The attendance programme accepts the completed base result. It opens that exact workspace and intake, keeps every original registration row, adds two explicitly labelled drawing example registrations as a new full source edition, and verifies all original payment calculations.

~~~sh
python3 -B attendance_operate.py \
  --intake-result /ABSOLUTE/original-operation/intake/result.json \
  --output /ABSOLUTE/original-operation/attendance/core
~~~

This operates four separated Wednesday sessions across the November daylight-saving transition, a confirmed booking, an attended visit, rescheduling, cancellation, a named extra credit and a one-place capacity decision. It exports the whole history, receives it into an independent workspace, makes a later local decision, receives the older packet again, and closes/reopens the original and recipient workspaces.

For the complete source/core/browser delivery, save this configuration using actual installed executable and module paths:

~~~json
{
  "outputDirectory": "/ABSOLUTE/original-operation/attendance",
  "intakeResult": "/ABSOLUTE/original-operation/intake/result.json",
  "intakeBrowserResult": "/ABSOLUTE/original-operation/intake-browser/result.json",
  "nodeExecutable": "/ACTUAL/node",
  "browser": {
    "chromiumExecutable": "/ACTUAL/chromium",
    "playwrightModule": "/ACTUAL/playwright-core/index.mjs",
    "actor": "Named receiving operator"
  }
}
~~~

Then run:

~~~sh
python3 -B attendance_complete.py --input /ABSOLUTE/original-operation/attendance-input.json
~~~

The controller owns one lifetime and carries its lock into each child. Use the same input, source directory and operation directory to resume. The browser uses the original intake workspace, changes an actual dated session through the screen, downloads the complete ZIP through the screen, receives it into a second browser workspace, records a recipient decision, re-receives the older packet, renders the phone viewport and restarts/reopens the recipient at its retained origin.

The final content-addressed operator ZIP contains the complete application source, original intake output, selected base browser output, attendance output, received histories and browser captures. The controller verifies every delivered member before publishing the archive. The printed complete-result.json identifies its actual path, length and SHA-256. A core-only run omits the optional browser configuration and records CORE_COMPLETE.

## Programmatic access

Python callers use Attendance with the original Workspace instance. The attendance tables share that same SQLite database.

~~~python
from class_intake import Workspace
from attendance import Attendance

workspace = Workspace("/ABSOLUTE/private-class-workspace")
try:
    attendance = Attendance(workspace)
    books = attendance.state()
    # view, history, request, save, export and receive use complete saved bodies.
finally:
    workspace.close()
~~~

The typed JavaScript AttendanceClient wraps an existing ClassIntakeClient connection. It exposes state, view, history, request, save, export and receive. The corresponding HTTP routes are /api/attendance/state, /view, /history, /request, /save, /export and /receive. Mutation routes use the original loopback token and origin boundary.

Complete receiving validates compressed and expanded size, member names, selected hashes, all original request bodies and independently reconstructed views. Source and attendance adoption happen together. The exported CSVs support administrative reading while the complete ZIP retains the authoritative editable history.
