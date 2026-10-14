# TN Cleaning Solutions

## Language

### Payroll

**Cleaner**:
A self-employed member of the cleaning staff who works appointments and is paid through payroll, with nothing withheld. Stored as an employee.
_Avoid_: menina, girl, worker

**Pay rate**:
The hourly amount a Cleaner earns. Each Cleaner has her own Pay rate, which takes effect from a date. An appointment uses the rate in effect on its scheduled date, plus its Job's Job pay premium. A change never alters a shift already on a paid Pay run. A shift with no Pay rate in effect stops that Cleaner's Pay run from being finalized until an admin adds one.
_Avoid_: wage, salary, hourly rate (ambiguous with a Job's client-facing rate)

**Job pay premium**:
An hourly amount a Job adds to the Pay rate of every Cleaner who works it. It has only a current value: changing it affects every appointment not yet on a paid Pay run. Cleaners see it folded into their rate, not as a separate line.
_Avoid_: job pay override (dropped: no per-Cleaner rate on a Job), bonus, job rate

**Job rate**:
The hourly amount a client is charged for a Job. Not related to what a Cleaner is paid.
_Avoid_: price, pay rate

**Clocked time**:
The time between a Cleaner's clock-in and clock-out on an appointment. An admin can correct it. Clocked time is what Pay rate is multiplied by.

**Time sheet**:
One Cleaner's sessions for a date range, placed by each appointment's scheduled date, with total and average Clocked time. An admin's Time sheet defaults to a week running Monday to Sunday.

**Open shift**:
A session with a clock-in but no clock-out. It appears on a Time sheet as in progress, but never counts toward totals or pay.

**Removed session**:
The session of a Cleaner taken off an appointment's crew after she had clocks, a Clock correction or an acknowledgement. It is kept unless its appointment is deleted, and stays on her Time sheet, shown struck through as removed, for both the admin and the Cleaner, but it never counts toward totals, pay or Appointment status. Putting the Cleaner back on the crew starts a new session.
_Avoid_: deleted session, archived shift

**Clock correction**:
An admin changing a session's clocks after the fact: editing a time, closing an Open shift, entering the clocks for an assigned Cleaner who never clocked in, or clearing a session's clocks. Every one is kept unless its appointment is deleted, with who, when, the old and new times, and an optional reason, and the session is marked edited. Entering clocks for a Cleaner who never clocked in needs a clock-out once the appointment is an hour past its scheduled end. It counts exactly like a clock the Cleaner made, so it can move Appointment status. It is refused on a cancelled appointment, on a Cleaner no longer on the crew, if it would overlap another of the Cleaner's sessions, or on an appointment in a paid Pay run, but allowed on a Manual completion.
_Avoid_: correction (that is a Pay run fix), override, manual session

**Time sheet flag**:
A warning an admin sees on a session that may need fixing before pay. The problem flags are an Open shift still open an hour after the appointment's scheduled end, a Missing clock, and an Odd duration that hasn't been acknowledged. A session with a Clock correction is marked edited, but that is not a problem. An Open shift or Missing clock stops that Cleaner's Pay run from being finalized until it is fixed; other Cleaners' runs are not held back. An Odd duration only warns. Cleaners don't see them.
_Avoid_: alert, issue, error

**Missing clock**:
An assigned Cleaner who never clocked in on an appointment an hour past its scheduled end. A Manual completion does not clear it, because the appointment pays only what was clocked. It clears when an admin enters her clocks or, if she didn't work, takes her off the crew. Cancelled appointments never have one.
_Avoid_: no-show (it may be a forgotten clock-in)

**Odd duration**:
A closed session whose Clocked time is under half or over one and a half times the appointment's scheduled length. An admin can acknowledge it with a note; the acknowledgement lapses if the clock times change, and is kept unless its appointment is deleted.

**Pay run**:
What one Cleaner is owed for a Pay period: her closed shifts in it not on another Pay run, and its Adjustments. It is a draft until finalized: computed live from the source data, never stored. Finalizing claims its shifts so no other Pay run includes them, but its amounts still follow the source data until it is marked paid. Once paid, its amounts are frozen and its sessions' clocks are locked.
_Avoid_: payroll report, pay slip, preview

**Pay period**:
The business's regular two-week pay cycle, Monday to Sunday twice, anchored on Monday October 5, 2026. Its range is fixed. While it runs, each Cleaner's draft Pay run can be seen but not finalized; once it ends, every Cleaner with a closed shift or a problem Time sheet flag in it has a draft for an admin to review and finalize. Nobody is paid for a Pay period before it ends. Only Pay periods from the Payroll start on exist in Payroll.
_Avoid_: pay cycle, payroll week

**Payroll start**:
The first Pay period paid through the app, fixed when Payroll launches. Earlier Pay periods were paid outside the app: their shifts are never payable, never shown as unpaid, and never flagged in Payroll, though Time Sheets still flag them as usual.
_Avoid_: go-live date, cutover

**Off-cycle run**:
A Pay run an admin makes for a shift in an ended Pay period that became payable after that period's Pay run was finalized. The Pay period shows such a shift as unpaid until an off-cycle run pays it. A shift is still never paid twice.
_Avoid_: bonus run, early payout

**Payout method**:
How an admin paid a Cleaner a Pay run, as free text: e-Transfer and Cash are suggested, but any method can be entered. Each Cleaner has a default, set only by an admin, with an optional e-Transfer contact. A Pay run is paid one way, never split, and the Payout method is recorded with the paid date when the run is marked paid. Both can be fixed afterwards, but a paid Pay run can't go back to unpaid. A $0 or negative Pay run is finalized and marked paid like any other.
_Avoid_: payment method (that is how a client paid an invoice)

**Pay statement**:
The document a Cleaner downloads from My pay for one paid Pay run.
_Avoid_: pay stub, pay slip

**Payroll export**:
The files an admin downloads for a Pay period, for whoever does the books: an .xlsx with a Summary tab (a total line per Cleaner and a grand total) and a tab per Cleaner listing each appointment and Adjustment with its rate, and a PDF summary.
_Avoid_: accountant export (there is no set accountant)

**My pay**:
What a Cleaner sees of her own pay: her paid Pay runs with the paid date and Payout method, the rate each line used, and each Adjustment with its reason. Never other Cleaners' pay, her rate table, or unpaid runs.

**Adjustment**:
A line an admin adds to one Pay run, positive or negative, with a free-text reason: a tip paid through the business, gas money, an expense, or a fix. It may point at one of the run's appointments. It shows as its own line, never as a column, and the Cleaner sees it with its reason. Deleting it removes it from the run. A mistake on a paid Pay run is fixed by an Adjustment on the Cleaner's next one. Tips a client hands a Cleaner directly are not recorded.
_Avoid_: add-on, appointment add-on (merged into Adjustment), direct tip, correction (that is a Clock correction), bonus, deduction

### Appointments

**Appointment status**:
Follows the Cleaners' clocks: scheduled until someone clocks in, in progress until every Cleaner on the crew has clocked in and out, then completed. A Cleaner who never clocks in holds it open until an admin enters her clocks (Clock correction), removes her from the crew, or uses Manual completion; a Removed session never counts. Cancelled is set by an admin and ignores the clocks. A completed or cancelled appointment refuses further clocks until an admin reopens it.

**Missed clock**:
A display-only state: an appointment still in progress an hour past its scheduled end, shown to admins in danger in place of In progress (Cleaners keep seeing In progress). Not the Time sheet flag "Missing clock".

**Manual completion**:
An admin marking an appointment completed regardless of its clocks. It holds until undone. Hours on it are only what was clocked. Taking the last Cleaner with clocks off a completed appointment turns it on, so the appointment stays completed.
_Avoid_: force complete

**Restore**:
Taking an appointment out of cancelled; its status is recalculated from its clocks.
_Avoid_: uncancel, reopen

**Deleted appointment**:
An appointment an admin removed for good, with its crew rows, clocks, Clock corrections, Odd duration acknowledgements and invoice lines; it leaves the calendar, every Time sheet and every invoice. A draft left with no live line is removed and an issued invoice left with nothing to charge is voided. It is refused (skipped) while the appointment has any line on a paid invoice: void the invoice first. Only an admin can delete, and it can't be undone. Unlike a cancelled appointment, which stays visible and can be restored, a deleted one leaves no trace (deliberately, though Ontario ESA and CRA want Clock corrections kept 6 years).
_Avoid_: archived appointment, removed appointment

**Series**:
A set of recurring appointments for one client and Job, generated from a recurrence rule and the Series' default crew, times and notes. Every Series is kept generated 6 months ahead until its end date or count stops it; an appointment removed from it is never generated again.
_Avoid_: recurrence, recurring appointment

**Protected appointment**:
An appointment in a Series that a Series edit never changes: completed, in progress, cancelled, manually completed, clocked into, or on any invoice line (a Live claim, a Cancelled line, or a line released by a void or an archived draft).
_Avoid_: protected visit

**This and following**:
A Series edit that applies, from one appointment onward, only the fields the admin changed, and leaves Protected appointments as they are.

**Cancel and delete scopes**:
How far a cancel or a delete reaches from one appointment in a Series: **This visit** (that appointment only), **This and following** (every unarchived appointment in the Series on or after its date, any status), or **Whole series** (every unarchived appointment in the Series, any date or status). An appointment outside a Series has only This visit. Appointments on a paid invoice are skipped and reported. Cancel never changes the Series itself; a This and following delete ends the Series the day before the appointment, and a Whole series delete removes the Series, leaving any skipped appointments standalone.

### Pricing

**Live price**:
What an appointment would be charged now: its appointment override if set, otherwise the client's negotiated rate, otherwise the Job rate, applied to the scheduled minutes and the number of Cleaners.

**Billed amount**:
The amount frozen on an appointment's live invoice line. It wins over the Live price wherever a price is shown.
_Avoid_: billed price cache

**Billing mismatch**:
An appointment on an issued or paid invoice whose Live price no longer equals its Billed amount, because it was edited after billing. The appointment and its invoice line both show it; the invoice is never changed to match, it is voided and reissued if the client should be charged differently.
_Avoid_: stale price, repriced visit

**Unpriced**:
An appointment whose Live price can't be worked out. Every appointment has a Job today, so this is a defensive state the price module reports rather than one any screen creates. It is never issued at $0: it goes on a draft as a $0 line, and that draft can't be issued until the line is priced.

### Invoicing

**Live claim**:
An appointment's line on an invoice that has not been voided. An appointment has at most one Live claim.

**Billable appointment**:
An appointment that is not cancelled, has no Live claim, and is not Unpriced. This is what the manual invoice flow can add; an Automatic draft also takes Unpriced ones.

**Automatic draft**:
The draft invoice a client's completed appointments join as each one is completed. A client has at most one at a time; issuing it means the next completion starts a new one. It never joins a draft an admin made.
_Avoid_: invoice run, billing cycle

**Automatic invoicing**:
A per-client setting, off by default, that decides whether the client's completed appointments join an Automatic draft. Turning it off leaves an open Automatic draft as it is; turning it back on picks up only appointments completed from then on. The client's active or archived status plays no part.
_Avoid_: manual-only client, billing mode

**Excluded appointment**:
A completed appointment an admin removed from an Automatic draft. It never rejoins one, but can still be billed on a manual invoice. It only matters for a client with Automatic invoicing on; elsewhere it is an ordinary Unbilled appointment.
_Avoid_: excluded visit

**Upcoming line**:
A line on an invoice for an appointment that is not completed yet: billed ahead, as a prepayment.

**Cancelled line**:
The line left on an issued invoice when its appointment is cancelled. It charges nothing and is not a Live claim; it stays only as a record of what the client was first billed.

**Business date**:
Today's calendar date in Eastern time, where the business is. Every invoice date (issued, due, paid, created) is a Business date, and an issued invoice is overdue once the Business date is past its due date.
_Avoid_: today (UTC), server date

**Invoice number**:
The human reference an invoice gets when it is issued, such as INV-042-SMI2026: a count shared by every invoice that restarts each January, the first three letters of the client's name, and the issue year. It never changes and is never reused, even when the invoice is voided. A draft has none.
_Avoid_: invoice ID, ref

**Payment**:
The record that an issued invoice was paid in full: the paid date, the Payment method, and an optional reference such as an e-Transfer confirmation or cheque number. It can be edited, or undone to put the invoice back to issued.

**Payment method**:
How a Payment was made, chosen from a list the admin manages. The list starts with e-Transfer, Cash, Cheque and Credit card, and a new method typed in while recording a Payment joins it.

**Archived invoice**:
A draft, paid or void invoice hidden from the working list and read-only, except its Internal note, until it is unarchived. An invoice still owed (issued) can't be archived. Archiving a draft releases its Live claims, and its appointments become Excluded appointments if it was an Automatic draft.
_Avoid_: deleted, hidden

**Internal note**:
An admin-only note on an invoice, editable at any status and while archived. Never shown or printed for the client. Not the invoice's Notes, which the client sees.

**Outstanding**:
What clients owe: the total of every issued invoice. An issued invoice with no due date is outstanding but never overdue. Drafts are not outstanding.
_Avoid_: open (it hid overdue invoices), receivable balance

**Unbilled appointment**:
A completed appointment that is not archived and has no Live claim. It includes Excluded appointments, shown like any other, and Unpriced appointments, shown with a tag so they aren't forgotten.
_Avoid_: uninvoiced, missed appointment, visit

**Payment state**:
Where an appointment stands with billing: Unbilled (an Unbilled appointment), Billed (its Live claim is on a draft or issued invoice) or Paid (its Live claim is on a paid invoice). An appointment that isn't completed and has no Live claim has no Payment state.
_Avoid_: paid status, billing status

**Mark paid**:
Recording that one or more of a client's appointments were paid without a prior invoice, e.g. cash on the spot. It creates an ordinary invoice for them that is issued and paid in one step and never sent. Any appointment that isn't cancelled can be marked paid; one on a draft leaves the draft, and one on an issued invoice is paid through that invoice instead.
_Avoid_: cash receipt, quick invoice

## Relationships

- A **Cleaner** has one **Pay rate** at a time; a **Job** may have a **Job pay premium**
- A **Pay run** covers many appointments; each appointment's pay is **Clocked time** × the applicable **Pay rate** plus the Job's **Job pay premium**. The run's **Adjustments** are added on top
- An appointment belongs to at most one **Pay run**
- An appointment shows its **Billed amount** if it is on a live invoice, otherwise its **Live price**
- A cancelled appointment never has a **Live claim**. Cancelling removes its line from a draft, turns it into a **Cancelled line** on an issued invoice, and is refused on a paid invoice until it is voided
- An issued invoice whose lines are all **Cancelled lines** is voided automatically
- An invoice moves draft → issued → paid; recording a **Payment** makes it paid and undoing the Payment makes it issued again
- An issued or paid invoice can be voided, which clears any **Payment** and releases its **Live claims**; a draft is archived instead
- An issued invoice is never edited; it is corrected by voiding it and issuing a new one
- An archived draft can be unarchived only while none of its appointments has been claimed by another invoice; it comes back as an ordinary draft if the client already has an **Automatic draft**

## Flagged ambiguities

- "hourly rate" was used both for what a client pays (**Job rate**) and what a Cleaner earns (**Pay rate**). These are distinct.
