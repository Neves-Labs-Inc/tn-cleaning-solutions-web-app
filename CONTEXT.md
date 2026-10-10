# TN Cleaning Solutions

## Language

### Payroll

**Cleaner**:
A member of the cleaning staff who works appointments and is paid through payroll. Stored as an employee.
_Avoid_: menina, girl, worker

**Pay rate**:
The hourly amount a Cleaner earns. Each Cleaner has a default Pay rate, which a Job pay override can replace for a specific Job.
_Avoid_: wage, salary, hourly rate (ambiguous with a Job's client-facing rate)

**Job pay override**:
A Pay rate that applies to one Cleaner on one Job instead of her default Pay rate.

Both kinds of Pay rate take effect from a date. A visit uses the rate in effect on its scheduled date, an override winning over the default. A change never alters a visit already on a finalized Pay run.

**Job rate**:
The hourly amount a client is charged for a Job. Not related to what a Cleaner is paid.
_Avoid_: price, pay rate

**Clocked time**:
The time between a Cleaner's clock-in and clock-out on an appointment. An admin can correct it. Clocked time is what Pay rate is multiplied by.

**Time sheet**:
One Cleaner's sessions for a date range, placed by each appointment's scheduled date, with total and average Clocked time. An admin's Time sheet defaults to a week running Monday to Sunday.

**Open shift**:
A session with a clock-in but no clock-out. It appears on a Time sheet as in progress, but never counts toward totals or pay.

**Clock correction**:
An admin changing a session's clocks after the fact: editing a time, closing an Open shift, entering the clocks for an assigned Cleaner who never clocked in, or clearing a session's clocks. Every one is kept for good with who, when, the old and new times, and an optional reason, and the session is marked edited. Entering clocks for a Cleaner who never clocked in needs a clock-out once the visit is an hour past its scheduled end. It counts exactly like a clock the Cleaner made, so it can move Appointment status. It is refused on a cancelled visit, on a Cleaner no longer on the crew, if it would overlap another of the Cleaner's sessions, or on a visit in a paid Pay run, but allowed on a Manual completion.
_Avoid_: correction (that is a Pay run fix), override, manual session

**Time sheet flag**:
A warning an admin sees on a session that may need fixing before pay. The problem flags are an Open shift still open an hour after the visit's scheduled end, a Missing clock, and an Odd duration that hasn't been acknowledged. A session with a Clock correction is marked edited, but that is not a problem. Flags never stop a Pay run. Cleaners don't see them.
_Avoid_: alert, issue, error

**Missing clock**:
An assigned Cleaner who never clocked in on a visit an hour past its scheduled end. A Manual completion does not clear it, because the visit pays only what was clocked. Cancelled visits never have one.
_Avoid_: no-show (it may be a forgotten clock-in)

**Odd duration**:
A closed session whose Clocked time is under half or over one and a half times the visit's scheduled length. An admin can acknowledge it with a note; the acknowledgement lapses if the clock times change.

**Visit add-on**:
An extra amount paid to one Cleaner for one appointment, of kind gasoline, extra, or tip. Gasoline and extra are business money; a tip is client money. None appear on an invoice. Each is paid once, by the first Pay run after it is entered.
_Avoid_: bonus, adjustment

**Direct tip**:
A tip the client gave straight to the Cleaner. It is recorded but never paid through a Pay run.

**Pay run**:
What one Cleaner is owed for a date range: her closed shifts in that range plus her unpaid Visit add-ons. It is a preview until finalized; finalizing claims its shifts and add-ons so no other Pay run includes them, but its amounts still follow the source data until it is marked paid. Once paid, its amounts are frozen and its visits' clocks are locked.
_Avoid_: payroll report, pay slip

**My pay**:
What a Cleaner sees of her own pay: her paid Pay runs, the rate each line used, and her own Visit add-ons. Never other Cleaners' pay, her rate table, or unpaid runs.

**Correction**:
An extra on a Cleaner's next Pay run, positive or negative, that fixes a mistake on a paid one.

### Appointments

**Appointment status**:
Follows the Cleaners' clocks: scheduled until someone clocks in, in progress while anyone who clocked in has not yet clocked out, completed once every Cleaner who clocked in has clocked out (a Cleaner who never clocks in does not hold it open). Cancelled is set by an admin and ignores the clocks. A completed or cancelled appointment refuses further clocks until an admin reopens it.

**Manual completion**:
An admin marking an appointment completed regardless of its clocks. It holds until undone. Hours on it are only what was clocked.
_Avoid_: force complete

**Restore**:
Taking an appointment out of cancelled; its status is recalculated from its clocks.
_Avoid_: uncancel, reopen

**Series**:
A set of recurring visits for one client and Job, generated from a recurrence rule and the Series' default crew, times and notes. Every Series is kept generated 6 months ahead until its end date or count stops it; a visit removed from it is never generated again.
_Avoid_: recurrence, recurring appointment

**Protected visit**:
A visit in a Series that a Series edit never changes: completed, in progress, cancelled, manually completed, clocked into, or on a Live claim.

**This and following**:
A Series edit that applies, from one visit onward, only the fields the admin changed, and leaves Protected visits as they are.

### Pricing

**Live price**:
What an appointment would be charged now: its appointment override if set, otherwise the client's negotiated rate, otherwise the Job rate, applied to the scheduled minutes and the number of Cleaners.

**Billed amount**:
The amount frozen on an appointment's live invoice line. It wins over the Live price wherever a price is shown.
_Avoid_: billed price cache

**Unpriced**:
An appointment whose Live price can't be worked out. Every appointment has a Job today, so this is a defensive state the price module reports rather than one any screen creates. It is never issued at $0: it goes on a draft as a $0 line, and that draft can't be issued until the line is priced.

### Invoicing

**Live claim**:
An appointment's line on an invoice that has not been voided. An appointment has at most one Live claim.

**Billable appointment**:
An appointment that is not cancelled, has no Live claim, and is not Unpriced. This is what the manual invoice flow can add; an Automatic draft also takes Unpriced ones.

**Automatic draft**:
The draft invoice a client's completed visits join as each one is completed. A client has at most one at a time; issuing it means the next completion starts a new one. It never joins a draft an admin made.
_Avoid_: invoice run, billing cycle

**Automatic invoicing**:
A per-client setting, on by default, that decides whether the client's completed visits join an Automatic draft. Turning it off leaves an open Automatic draft as it is; turning it back on picks up only visits completed from then on. The client's active or archived status plays no part.
_Avoid_: manual-only client, billing mode

**Excluded visit**:
A completed visit an admin removed from an Automatic draft. It never rejoins one, but can still be billed on a manual invoice.

**Upcoming line**:
A line on an invoice for a visit that is not completed yet: billed ahead, as a prepayment.

**Cancelled line**:
The line left on an issued invoice when its visit is cancelled. It charges nothing and is not a Live claim; it stays only as a record of what the client was first billed.

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
A draft, paid or void invoice hidden from the working list and read-only until it is unarchived. An invoice still owed (issued) can't be archived. Archiving a draft releases its Live claims, and its visits become Excluded visits if it was an Automatic draft.
_Avoid_: deleted, hidden

**Outstanding**:
What clients owe: the total of every issued invoice. An issued invoice with no due date is outstanding but never overdue. Drafts are not outstanding.
_Avoid_: open (it hid overdue invoices), receivable balance

**Unbilled visit**:
A visit completed after launch that is not cancelled and has no Live claim. It includes Excluded visits and Unpriced visits, which are shown with a tag so they aren't forgotten.
_Avoid_: uninvoiced, missed visit

## Relationships

- A **Cleaner** has one default **Pay rate** and zero or more **Job pay overrides**
- A **Pay run** covers many visits; each visit's pay is **Clocked time** × the applicable **Pay rate**, plus its **Visit add-ons**
- A visit belongs to at most one **Pay run**
- An appointment shows its **Billed amount** if it is on a live invoice, otherwise its **Live price**
- A cancelled appointment never has a **Live claim**. Cancelling removes its line from a draft, turns it into a **Cancelled line** on an issued invoice, and is refused on a paid invoice until it is voided
- An issued invoice whose lines are all **Cancelled lines** is voided automatically
- An invoice moves draft → issued → paid; recording a **Payment** makes it paid and undoing the Payment makes it issued again
- An issued or paid invoice can be voided, which clears any **Payment** and releases its **Live claims**; a draft is archived instead
- An issued invoice is never edited; it is corrected by voiding it and issuing a new one
- An archived draft can be unarchived only while none of its visits has been claimed by another invoice; it comes back as an ordinary draft if the client already has an **Automatic draft**

## Flagged ambiguities

- "hourly rate" was used both for what a client pays (**Job rate**) and what a Cleaner earns (**Pay rate**). These are distinct.
