# Ontario hours-worked records: what to keep, for how long, and how to correct them

Research for issue #94 (map #93, Admin timesheets overhaul). Researched 2026-10-09.
Not legal advice. Every claim below cites the primary source that owns it.

## Short answer

- **Record:** for each employee, the **dates and times worked** (start and end) and the **number of hours worked each day and each week**. ESA s. 15(1) paras 3.1 and 4.
- **Keep for:** ESA says **3 years** after the day or week the record relates to (s. 15(5) para 3). CRA says **6 years** from the end of the last tax year the payroll records relate to. **Six years governs** in practice.
- **Corrections:** the ESA does not say how to correct a record, but it makes it an offence to "make, keep or produce false records" (s. 131(1)). CRA's electronic record-keeping circular **does** set the bar: changes must be documented with who made them, when, the previous and current details, and why. They must not lose or alter the original data (IC05-1R1 paras 40-41). **So yes: keep the original clock time and log every edit.**
- **Contractors:** the ESA (including s. 15) does not apply to genuine independent contractors. But status depends on the real working relationship, not the label, and misclassification is prohibited (s. 5.1). Cleaners who are dispatched to appointments, paid by the business and clocked in through its app look a lot like employees. **Build the employee-grade record regardless.**

## 1. Ontario Employment Standards Act, 2000 (ESA)

Source: [ESA, S.O. 2000, c. 41, s. 15 (e-Laws, current consolidation)](https://www.ontario.ca/laws/statute/00e41#BK25).

### What must be recorded (s. 15(1))

> 15 (1) An employer shall record the following information with respect to each employee …
> 1. The employee's name and address. …
> 3. The date on which the employee began his or her employment.
> 3.1 The dates and times that the employee worked.
> 3.2 If the employee has two or more regular rates of pay … and, in a work week, the employee performed work … in excess of the overtime threshold, the dates and times that the employee worked in excess of the overtime threshold at each rate of pay.
> 4. The number of hours the employee worked in each day and each week.
> 5. The information contained in each written statement [wage statement etc.] given to the employee …

Implications for the app:

- Store each clock-in and clock-out as an actual **timestamp**, not just a duration. Para 3.1 requires "dates and times".
- The app must be able to produce **daily and weekly hour totals** per employee (para 4). Derived totals are fine as long as they can be produced on demand.
- Para 3.2 applies only if a cleaner has **two or more regular rates of pay**, for example different rates for different appointment types, *and* goes over the overtime threshold (44 h/week, s. 22). In that case the overtime hours must be traceable to each rate. If per-appointment rates ever differ, keep the rate on each time entry.

### Salaried exception (s. 15(3)-(4))

Daily and weekly times need not be recorded for an employee who is paid a fixed salary per pay period, as long as overtime hours are recorded. This does **not** apply to hourly or per-appointment cleaners.

### Retention (s. 15(5))

> 3. For information referred to in paragraph 3.1, 3.2 or 4 of subsection (1) or in subsection (3), three years after the day or week to which the information relates.

Name, address and start date: 3 years after the employee leaves (para 1). Wage-statement contents: 3 years after the statement was given (para 4).

### Who keeps it and access (s. 15(5), s. 16)

The employer may "retain or arrange for some other person to retain" the records, so a SaaS or Supabase host is allowed. Under s. 16 the employer must still keep them "readily available for inspection as required by an employment standards officer, even if the employer has arranged for another person to retain them." **An export or report path for an inspector is therefore a real requirement.**

### Falsification (s. 131)

> 131 (1) No person shall make, keep or produce false records or other documents that are required to be kept under this Act or participate or acquiesce in the making, keeping or production of false records …

The ESA has no rule on the mechanics of correcting a record. An admin edit that moves a clock time *to what actually happened* is a correction. An edit that makes the record differ from what actually happened is a false record. Keeping the original value plus who changed it and why is what lets the employer show which kind each edit was.

### Plain-language guide

Ontario's [ESA guide, "Record keeping"](https://www.ontario.ca/document/your-guide-employment-standards-act-0/record-keeping) restates the statute: "The employer must record and retain the dates and times the employee worked", plus daily and weekly hours, kept for three years. It also says records can be kept by someone else but "must … [be] readily available for inspection."

## 2. CRA (federal payroll and tax records)

- **6 years.** "You have to keep your paper and electronic records for at least six years after the year to which they relate." Source: [CRA T4001 Employers' Guide, Payroll Deductions and Remittances](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4001/employers-guide-payroll-deductions-remittances.html). The general rule is "Keep your records for six years from the end of the last tax year they relate to" ([RC4409 Keeping Records](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc188/keeping-records.html)), under Income Tax Act s. 230(4). Earlier destruction requires CRA permission (Form T137).
- **Electronic records stay electronic.** Records kept electronically must be retained "in an electronically readable format", even if a paper copy exists. Source: [IC05-1R1 Electronic Record Keeping](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/ic05-1/electronic-record-keeping.html), para 8. Printing to PDF and deleting the rows does not satisfy this.
- **Audit trail.** An audit trail is "the information that is needed to recreate a sequence of events related to a business transaction" ([CRA, Review of business systems and keeping audit trails](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/keeping-records/review-business-systems-keeping-audit-trails-business-transactions.html); IC05-1R1 para 36). Records must trace from source documents to summarized accounts. Here the source document is the clock-in/out event and the summary is the payroll run.
- **Corrections preserve the original (IC05-1R1 para 40):** "Changes to any recorded transaction must be made by journal entry, be adequately documented …". The circular lists that documentation as who made the change, the date, the previous and current details, and the reason. Systems need controls that prevent unauthorized editing or deletion. Para 41: system changes "must not result in a loss, destruction, or alteration of information and data."
- **Scope note:** CRA's rules cover records that support tax, CPP and EI. Hours drive gross pay, so timesheets are supporting records for payroll. The 6-year period also matches the ROE guidance from Employment and Social Development Canada (ESDC), which runs EI ([ROE guide](https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/reports/roe-guide.html)): "store all related payroll records … for 6 years after the year to which the information relates".

## 3. Independent contractors

- "The ESA does not apply to independent contractors …" ([ESA guide, Employee status](https://www.ontario.ca/document/your-guide-employment-standards-act-0/employee-status)). For true contractors, s. 15 does not apply, and there is no statutory duty to record their start and end times.
- Status depends on the facts: "It is the relationship between the individual and the business … that matters, not the label." Signs of an employee include:
  - the business controls the tasks, the pay, and when and where the work happens;
  - the business supplies the tools, equipment or materials;
  - the worker can't hand the work to someone else;
  - the business can discipline the worker.

  The same guide page lists these.
- ESA s. 5.1(1): "An employer shall not treat … a person who is an employee … as if the person were not an employee." The penalty is a notice of contravention and/or prosecution (same guide page). The former reverse onus in s. 5.1(2) was repealed in 2018, but the prohibition stands.
- CRA: for contractors there is no payroll, but the business must still keep invoices and payment records supporting its expense deductions for 6 years (same 6-year rule). For CPP/EI purposes either party can ask CRA for a status ruling (T4001).
- **Practical takeaway:** a Toronto cleaning business that schedules cleaners to appointments, sets the price, supplies products and tracks clock-in/out is likely an employer under the ESA tests. The cheap and safe choice is to build the hours record and its audit trail to the employee standard for everyone.

## 4. Design implications for the timesheet audit trail

1. Store raw clock-in and clock-out timestamps per appointment and never overwrite them. An admin correction is a new, append-only revision or event holding:
   - who made it;
   - when;
   - the old value;
   - the new value;
   - the reason (required).

   This satisfies IC05-1R1 para 40 and lets the employer defend against an s. 131 "false records" allegation.
2. Effective hours = the latest corrected value. Daily and weekly totals per employee must be producible on demand (ESA s. 15(1) para 4).
3. Retention: keep time entries **and their edit history** for at least **6 years after the end of the calendar or tax year** they relate to. This exceeds the ESA's 3 years. Don't hard-delete them when an employee or appointment is deleted (soft-delete or restrict), because ESA retention for name, address and start date runs 3 years *after employment ends*.
4. Keep the data electronic and queryable (IC05-1R1 para 8), and provide an export for an ESA officer or a CRA auditor (ESA s. 16).
5. If cleaners can have more than one regular rate, store the rate on each entry (ESA s. 15(1) para 3.2).
6. Out of scope but nearby: an employer with **25 or more employees** on January 1 must have a written electronic-monitoring policy (ESA s. 41.1.1). This is not triggered at the current size, but GPS or clock-in tracking would fall under it if the headcount grows.
