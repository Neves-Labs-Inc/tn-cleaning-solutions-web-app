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
One Cleaner's sessions for a date range, placed by each appointment's scheduled date, with total and average Clocked time.

**Open shift**:
A session with a clock-in but no clock-out. It appears on a Time sheet as in progress, but never counts toward totals or pay.

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
Follows the Cleaners' clocks: scheduled until someone clocks in, in progress while anyone has clocked in and not every assigned Cleaner has clocked out, completed once every assigned Cleaner has clocked out. Cancelled is set by an admin and ignores the clocks. A completed or cancelled appointment refuses further clocks until an admin reopens it.

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
An appointment with no Job, so no Live price can be worked out. It is never issued at $0: an Invoice run puts it on a draft as a $0 line, and that draft can't be issued until the line is priced.

### Invoicing

**Live claim**:
An appointment's line on an invoice that has not been voided. An appointment has at most one Live claim.

**Billable appointment**:
An appointment that is not cancelled, has no Live claim, and is not Unpriced. This is what the manual invoice flow can add; an Invoice run also takes Unpriced ones.

**Billing period**:
The span one automatic invoice covers: weekly, biweekly or monthly, set once for the whole business. Weeks start Sunday, Central time. A change takes effect immediately.
_Avoid_: billing cycle (implies a per-client setting)

**Invoice run**:
The automatic pass, made after a Billing period ends, that creates one draft invoice per active client from their completed appointments that are not cancelled and have no Live claim, scheduled on or before the period's end. Unpriced ones go on as $0 lines. Late visits are picked up by the next run; a run never touches an existing draft and never bills a visit twice. Its drafts carry an "automatic" badge and are issued by an admin, one at a time or in bulk.

## Relationships

- A **Cleaner** has one default **Pay rate** and zero or more **Job pay overrides**
- A **Pay run** covers many visits; each visit's pay is **Clocked time** × the applicable **Pay rate**, plus its **Visit add-ons**
- A visit belongs to at most one **Pay run**
- An appointment shows its **Billed amount** if it is on a live invoice, otherwise its **Live price**
- A cancelled appointment never has a **Live claim**; it must be removed from its draft, or its invoice voided, before it can be cancelled
- An invoice moves draft → issued → paid, and a draft or issued invoice can be voided; voiding releases its **Live claims**

## Flagged ambiguities

- "hourly rate" was used both for what a client pays (**Job rate**) and what a Cleaner earns (**Pay rate**). These are distinct.
