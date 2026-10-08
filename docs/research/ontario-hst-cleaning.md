# Ontario HST for a Toronto cleaning business: what applies and what an invoice must show

Research for [#67](https://github.com/Neves-Labs-Inc/tn-cleaning-solutions-web-app/issues/67) (map [#43](https://github.com/Neves-Labs-Inc/tn-cleaning-solutions-web-app/issues/43)). Researched 2026-10-08.

Context: the business is in Toronto, Ontario, bills in CAD, and is **not GST/HST-registered** (a small supplier). The overhaul builds HST support that is off by default.

This is a reading of CRA guidance and the statute. It is not tax advice. Anything marked **Uncertain** should be confirmed with an accountant or the CRA before the business registers.

## Sources

| Short name | Source |
|---|---|
| RC4022 | CRA, *General Information for GST/HST Registrants* — https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022/general-information-gst-hst-registrants.html |
| Rates | CRA, *GST/HST calculator (and rates)* — https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html |
| Register | CRA, *When to register for and start charging the GST/HST* — https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html |
| ETA | *Excise Tax Act*, R.S.C. 1985, c. E-15 — https://laws-lois.justice.gc.ca/eng/acts/E-15/FullText.html |
| ITC Regs | *Input Tax Credit Information (GST/HST) Regulations*, SOR/91-45 (current to 2026-09-21) — https://laws-lois.justice.gc.ca/eng/regulations/SOR-91-45/FullText.html |
| Memo 3-3-6-1 | CRA GST/HST Memorandum 3-3-6-1, *Place of Supply in a Province – Personal Services, Services in Relation to Property and Telecommunication Services* (April 2026) — https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/3-3-6-1/plc-spply-prvnc-prsnl-srvcs-srvcs-rltn-prprty-nd-tlcmmnctn-srvcs.html |

## 1. Is cleaning taxable, and are any line kinds different?

**Yes. Residential and commercial cleaning are taxable supplies at 13% HST in Ontario.**

- "Most property and services supplied in or imported into Canada are subject to the GST/HST." Cleaning is not on CRA's lists of zero-rated or exempt supplies (RC4022, "Taxable supplies", "Zero-rated supplies", "Exempt supplies").
- Ontario's HST is **13%** (5% federal plus 8% provincial), unchanged since before 2013 and still current (Rates; ETA Schedule VIII lists Ontario at 8%).
- The one exemption that touches cleaning is narrow. ETA Schedule V, Part II, s. 13 exempts a "home care service" (defined to include cleaning) only when it is given to someone who needs help because of age, infirmity or disability **and** a government or municipality supplies or funds it (ETA Sched. V, Part II, s. 1 definition and s. 13). Privately paid house cleaning does not qualify. A client whose cleaning is paid through a government home-care programme would be an exempt edge case. The app need not model this now.

**How each line kind is treated:**

| Line kind | Treatment | Source |
|---|---|---|
| Cleaning service | Taxable at 13% | RC4022; Rates |
| Resold products (supplies sold to the client) | Taxable goods. A sale of goods is made in the province where the goods are delivered, so Ontario delivery means 13%. | RC4022, "Place of supply – Goods" |
| Extra fees for the service (travel, add-ons, supplies used on the job) | Part of the price of the taxable service, so taxed at the same rate | **Uncertain**: inferred from the general rule that tax applies to the consideration for a taxable supply. No CRA text names cleaning fees specifically. |
| Late-payment surcharge | **Not taxed.** "Do not charge the GST/HST on late-payment surcharges. The GST/HST is payable only on the original invoiced amount." | RC4022, "Late-payment surcharges" |
| Discount given at the time of sale (a discount line on the invoice) | Reduces the taxable amount: "you collect the GST/HST on the net amount (the sale price less the discount)". The CRA sample invoice taxes the subtotal after the discounts. | RC4022, "Volume discounts" |
| Early-payment discount | Tax on the **full** invoice amount, even if the client takes the discount. If the invoice already shows the net amount, tax that amount instead. | RC4022, "Early-payment discounts" |
| Credit or adjustment after issue (price reduced later) | The supplier *may* refund or credit the matching tax. If it does, it must issue a **credit note** containing prescribed information. The adjustment is deducted from net tax in the period the note is issued. | ETA s. 232(2)–(3); RC4022, "Volume discounts" (after the sale), "Returned goods" |

**Implication for the line model:** every line needs a tax treatment of either "taxable at the invoice rate" or "not taxable" (the latter for late fees). Discounts on an invoice reduce the taxable base. A post-issue credit with HST is a credit note, not a silent edit of the issued invoice.

## 2. Place of supply: does a client outside Ontario change the rate?

**For on-site cleaning in Ontario, almost certainly not. The rate stays 13%.**

- Services "in relation to real property" are taxed by where the property is: HST at that province's rate if the property is mainly in a participating (HST) province, and 5% GST if it is mainly in a non-participating province (RC4022, "Services in relation to real property"; Memo 3-3-6-1, paras 48–51). Cleaning a house or office in Toronto would therefore be 13% wherever the client lives or is billed.
- A service is "in relation to" property when there is a direct connection, for example when it physically protects the property or enhances its value (Memo 3-3-6-1, paras 34, 37). CRA's examples include maintaining buildings, painting and landscaping (Memo 3-3-6-1, Examples 28–33).
- **Uncertain:** no CRA text read here names building cleaning as a service in relation to real property. The classification is inferred from the building-maintenance and painting examples. If it were *not* such a service, the general rule would apply instead: the province of the client's home or business address that the supplier obtains in the ordinary course of business (RC4022, "Services – General rules"). Under that rule, a client with an out-of-province billing address could get a different rate, such as 5% for an Alberta address or 15% for a New Brunswick one.
- Resold goods follow the delivery-province rule (RC4022, "Goods"), so goods handed over in Ontario are 13%.

**Implication:** a single business-wide rate of 13% is correct for the business as it runs today (all work in the Toronto area). Make the rate a setting rather than a constant. Per-client or per-property rates are not needed unless the business starts cleaning outside Ontario.

Current rates elsewhere, for reference (Rates, on or after 2025-04-01): ON 13%; NB, NL, PE 15%; NS 14%; all other provinces and territories 5% GST, plus provincial sales tax where it applies.

## 3. Small-supplier threshold and crossing it

**The test** (ETA s. 148(1); RC4022, "Small supplier"; Register):

- A person is a small supplier if its taxable revenue (worldwide, including associates, excluding goodwill, financial services and sales of capital property) did **not exceed $30,000** in the **four calendar quarters before** the current quarter. Small-supplier status then runs through that quarter and the month after it.
- **Single-quarter test:** if revenue goes over $30,000 **within one calendar quarter**, the business stops being a small supplier **immediately**. The supply that pushed it over is taxable, and the effective date of registration is the day of that supply. "You have to charge the GST/HST on the September 23 sale that made you exceed the $30,000 limit, even if you are not yet registered." It must register within 29 days (RC4022, Example 1).
- **Four-quarter test:** if it goes over $30,000 across four (or fewer) consecutive quarters but not in a single quarter, it stays a small supplier for the rest of that quarter and the following month. Registration takes effect, at the latest, on the first supply after that, and it must register within 29 days (RC4022; Register).
- **Voluntary registration:** a small supplier may register at any time. The effective date is usually the application date, or up to 30 days earlier. Once registered, it must stay registered for at least a year (RC4022, "Voluntary registration").

**May invoices issued before registration show tax?**

- **No, not while the business is a small supplier and not registered.** "If you choose not to register, you do not charge the GST/HST … and you cannot claim ITCs" (RC4022, "Voluntary registration").
- The one exception is the crossing case above. The supply that breaks the single-quarter threshold, and supplies from the effective registration date on, are taxable **even before the BN/GST account is issued** (RC4022, Example 1).
- Anyone who collects an amount "as or on account of tax" holds it in trust for the Crown (ETA s. 222(1)). An amount wrongly charged as tax may be refunded or credited within two years (ETA s. 232(1)).
- **Uncertain:** CRA's guide does not spell out what happens when a non-registrant collects "HST" it was not entitled to charge. Reading s. 222(1), the money must be remitted or refunded, not kept. RC4022 also says: "If you already charged the GST/HST on your sales for more than 30 days before setting up your GST/HST account, call 1-800-959-5525."

**Implication:** keep HST off by default. When it is turned on, it needs an **effective date**, and the toggle should not tax invoices issued before that date. The registration number to print on invoices is a setting entered at the same time. Tracking revenue against the $30k threshold is optional (a nice-to-have warning).

## 4. What an invoice must show

### 4a. Disclosure of tax (all registrant invoices, ETA s. 223)

A registrant making a taxable supply must show, on the invoice, receipt or written agreement, **either**:

- the price **and** the tax payable, in a way that clearly shows the amount of tax, **or**
- a statement that the amount payable **includes** the tax (ETA s. 223(1)).

If the invoice shows the tax or the rate, it must show the **total** tax or the **total** rate (ETA s. 223(1.1)). For HST, show the total rate (13%) and do **not** split it into federal and provincial parts (RC4022, "Informing your customers").

### 4b. Information a registered client needs to claim input tax credits

The tiers depend on the invoice's total amount paid or payable. They have been $100 and $500 since 2021; the old $30/$150 figures are stale. Sources: ITC Regs s. 3; RC4022, "Input tax credit information requirements".

| Information | Under $100 | $100–$499.99 | $500+ |
|---|---|---|---|
| Supplier's business or trading name | ✔ | ✔ | ✔ |
| Invoice date (or, with no invoice, the date tax was paid or payable) | ✔ | ✔ | ✔ |
| Total amount paid or payable | ✔ | ✔ | ✔ |
| Supplier's **GST/HST registration number** (BN + RT account, e.g. `123456789 RT0001`) | | ✔ | ✔ |
| Tax shown: the tax amount (per supply or in total) **or** a statement that tax is included plus the total tax rate | | ✔ | ✔ |
| Status of each supply when the invoice mixes taxable and exempt or zero-rated supplies | | ✔ | ✔ |
| Buyer's name or trading name (or authorized agent's) | | | ✔ |
| Terms of payment | | | ✔ |
| Description of each supply sufficient to identify it | | | ✔ |

**Implication:** a printable invoice that always shows the business name, BN/RT number, invoice date, client name, line descriptions, subtotal, "HST 13%" and its amount, total and payment terms meets every tier. When HST is off, print no tax line and no "HST" wording. A blank or "N/A" registration number is fine.

**Uncertain:** the field is "terms of payment". A due date or "Due on receipt" plainly covers it. Whether a blank due date (which #46 allows) satisfies it for invoices of $500 or more is not addressed. Printing a default such as "Due on receipt" is the safe choice.

### 4c. Computing and rounding

From RC4022, "Rounding off fractional amounts":

- Round tax to the nearest cent. Below half a cent you *may* round down; half a cent or more, round up (round half up).
- When several items are taxed at the same rate, "you can add up the prices of all taxable supplies … calculate the GST/HST payable, and then round off the amount". That is, compute tax **once on the taxable subtotal**, not line by line. CRA's sample invoice does exactly this: a subtotal after discounts, then a single "Plus GST" line.
- Per-line rounding is not prohibited (the word is "can"), but it can drift by a cent from the total-based figure. Using the subtotal method is simpler and matches CRA's example.

**Implication:** with integer cents, tax = `round_half_up(taxable_subtotal_cents × 13 / 100)`, on the subtotal of taxable lines after discount lines. Non-taxable lines (late fees) are added after tax.

## Open points / uncertain

1. **Cleaning as a "service in relation to real property"**: inferred, not stated by CRA. It matters only for clients whose billing address is outside Ontario.
2. **Ancillary fees** (travel, supplies charges) being taxable at the same rate: inferred from general principle.
3. **Non-registrant who shows HST by mistake**: CRA's guide does not cover this directly. Under ETA s. 222(1) and s. 232(1), the amount is held in trust and must be remitted or refunded.
4. **Blank due date vs "terms of payment"** on invoices of $500 or more: not addressed by the sources.
5. **The government-funded home-care exemption** (ETA Sched. V, Part II, s. 13) is ignored. Revisit only if such clients appear.
