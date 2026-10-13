# Libraries for the PDF and Excel exports (research for #144)

Researched 2026-10-13. Map: #140 (Payroll v2). Feeds the export and statement parts of the Payroll v2 spec.

**What we need to produce:**
- **Accountant period summary PDF**: one table row per Cleaner.
- **Cleaner statement PDF**: one per paid Pay run.
- **Accountant workbook**: a Summary sheet with one row per Cleaner and a Detail sheet with one row per appointment line.

All three are downloaded, never emailed. Volumes are tiny: a handful of Cleaners and a few hundred lines per period.

## Recommendation

- **PDF: `@react-pdf/renderer`** (MIT, actively released). Call `renderToBuffer()` in a Route Handler and return the bytes as a `Response`. It is pure JS: no Chromium, no native binaries, ~1/10 s per document. Next 16 already treats it as a server-external package, so no config is needed.
- **Excel: `exceljs`** (MIT). It is the only free option that writes real cell styles (bold headers, fills) as well as number formats and multiple sheets. Its maintenance is stale (last release 2023-10) and it has a moderate `uuid` advisory, both noted below. Reasonable for a write-only, server-side export of our own data.
- **CSV:** don't add a library. Write a tiny RFC 4180 escaper (~15 lines) only if the accountant asks for CSV in addition to `.xlsx`. The map says "CSV/Excel", and a two-sheet requirement means `.xlsx` is the real deliverable, because CSV has no sheets.
- **Avoid:**
  - Headless Chromium: it needs a 33–60 MB binary, 1.6 GB of RAM on Lambda, and on the small EC2 it doesn't fit the t4g.small/$15 budget comfortably.
  - `pdf-lib` as the primary tool: it has no layout engine, and its last release was 2021.
  - SheetJS: the npm copy is stale and has a high-severity advisory, and the Community Edition drops cell styles.

All of these choices work the same on either hosting candidate (Lambda via OpenNext, or EC2 `next start`), because nothing needs a binary or a layer.

## Comparison

| Option | Licence | Latest release | Install size (measured) | Runs on Lambda / EC2 without a Chromium layer | Fit for our docs |
| --- | --- | --- | --- | --- | --- |
| **@react-pdf/renderer 4.9.0** | MIT | 2026-08-27 | 36 MB node_modules incl. React, 97 packages | Yes, pure JS | Flexbox layout, auto page breaks, React components. Good for tables. |
| pdf-lib 1.17.1 | MIT | 2021-11-06 | 25 MB | Yes, pure JS | Low-level: you place every string at x/y. Good for filling or merging PDFs, poor for tables. |
| pdfkit 0.20.2 | MIT | 2026-09 | 10.5 MB unpacked | Yes | Imperative drawing API. `@react-pdf` is built on it. |
| Headless Chromium (puppeteer-core 25.13 + @sparticuz/chromium 153) | Apache-2.0 / MIT | 2026-10 / 2026-09 | 70 MB unpacked for the Chromium package | **No**: needs the Chromium binary as a layer, in /tmp, or from S3 | Reuses HTML/Tailwind, but heavy. |
| **exceljs 4.4.0** | MIT | 2023-10-19 | 50 MB, 484 packages | Yes | Styles, numFmt, multiple sheets, streaming writer. |
| SheetJS CE 0.20.3 (CDN) | Apache-2.0 | CDN only | 7.8 MB | Yes | Number formats yes, **styles no**. |
| SheetJS 0.18.5 (npm `xlsx`) | Apache-2.0 | 2022-03-24 | | Yes | **High-severity advisories.** Do not use. |
| Hand-written CSV | n/a | n/a | 0 | Yes | Single table only, no formatting. |

Sizes come from `npm i` into empty directories on 2026-10-13 (`du -sh node_modules`). Release dates come from `npm view <pkg> time`. Both are server-only deps, so none of this reaches the client bundle.

## Findings

### Next.js 16 integration

- Route Handlers use the Web `Response` API, and the docs show returning non-JSON bodies with custom headers ("Non-UI Responses") and streams (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`). A download is `new Response(buffer, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="…"' } })`.
- **`@react-pdf/renderer` is on Next's built-in `serverExternalPackages` list**, so it is loaded with native `require` instead of being bundled, with no config change (`01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md`). `@sparticuz/chromium`, `playwright` and `playwright-core` are on the same list. exceljs and SheetJS are not, and they bundle fine as plain JS.
- Route Handlers default to the Node.js runtime. Do not set `runtime = 'edge'` for these, because exceljs and react-pdf use Node streams and Buffer.
- `maxDuration` is the per-route timeout knob for platforms that honour it (`02-route-segment-config/maxDuration.md`). It isn't needed at our sizes.

### @react-pdf/renderer

- The Node API is `renderToBuffer`, `renderToStream`, `renderToFile` and `renderToString` ([react-pdf.org/node](https://react-pdf.org/node)).
- Peer range: `react ^16.8 || ^17 || ^18 || ^19`, so it works with our React 19.2.4 (`npm view @react-pdf/renderer peerDependencies`).
- It is active. 4.8.0, 4.8.1 and 4.9.0 shipped in August 2026, the last commit on `diegomura/react-pdf` was 2026-09-22, and the repo has 16.8k stars and 341 open issues (GitHub API).
- Smoke test on Node 26:
  - A Letter page with a heading and 200 CAD-formatted rows rendered in **87 ms**, 5.5 KB output, ~170 MB RSS for the whole process.
  - The built-in Helvetica handled the en dash in "Oct 5–18". Accented names in other scripts need `Font.register` with a TTF. Latin-1 accents (é, ç) are covered by the standard fonts' WinAnsi encoding.
- Its dependencies are its own `@react-pdf/*` packages plus pdfkit. `npm audit` found 0 vulnerabilities.

### pdf-lib

- The last release was 1.17.1 on 2021-11-06, and the last commit on `Hopding/pdf-lib` was 2021-11-12, so it is effectively unmaintained ([GitHub](https://github.com/Hopding/pdf-lib)). The maintained fork is `@pdfme/pdf-lib` 6.2.4 (2026-10-09).
- It has no text flow or table layout. Every line, column and page break would be hand-computed. That is the wrong tool for statements, though it is fine for stamping or merging existing PDFs.

### Headless Chromium (HTML→PDF)

- `@sparticuz/chromium` is "Chromium for Serverless Platforms". The Brotli-compressed binary is ~33 MiB (130 MiB uncompressed), the README also calls it "over 50 MB", and it recommends **"1600 MB (or more)"** of Lambda memory. Deploying means a layer you build or download, or `@sparticuz/chromium-min` that downloads a pack from S3 into `/tmp` on a cold start ([README](https://github.com/Sparticuz/chromium)). It requires Node `^22.17 || >=24`.
- On a small EC2, `puppeteer-core` needs a system Chromium. One Chromium instance is a large share of a t4g.small's 2 GB, alongside `next start`.
- **Ruled out:** the only gain is reusing HTML/Tailwind styling, and our documents are simple tables.

### exceljs

- It supports styles (number formats, fonts, fills, borders), multiple worksheets, a streaming XLSX writer, and CSV read/write (README sections "Styles", "Number Formats", "Fonts", "Fills", "Streaming XLSX Writer", "CSV").
- Smoke test: a two-sheet workbook with `numFmt: '"$"#,##0.00'` and a bold header round-tripped intact via `writeBuffer()` and `load()`.
- **Maintenance is the weak spot.** The last stable release was 4.4.0 on 2023-10-19, plus a 4.4.1 prerelease on 2024-12-20. The last commit on `exceljs/exceljs` was 2024-01-12, and the repo has 815 open issues. It is not archived and has 15.5k stars.
- `npm audit` reports **2 moderate** issues, both from the transitive `uuid@8` dependency ("Missing buffer bounds check in v3/v5/v6 when buf is provided"). exceljs only generates v4 IDs, so we are not exposed. Clear the warning with an `overrides: { "uuid": "^11" }` entry if it bothers CI.
- The install is heavier (50 MB, 484 packages: archiver, unzipper, fast-csv, jszip…). That is irrelevant on EC2. On Lambda with OpenNext it adds to the server function zip but stays far under the 250 MB unzipped limit.

### SheetJS

- "Older releases are technically available on the public npm registry as `xlsx`, but the registry is out of date. The latest version on that registry is 0.18.5". The docs point to the CDN tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` as authoritative ([docs.sheetjs.com, Node.js install](https://docs.sheetjs.com/docs/getting-started/installation/nodejs)).
- `npm audit` on `xlsx@0.18.5` reports **high** severity: Prototype Pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9).
- **The Community Edition drops styles.** In a test with 0.20.3, a bold font set on `A1.s` read back as `{"patternType":"none"}`. The README advertises styling ("let out your inner Picasso with styling") as part of **SheetJS Pro**. Number formats (`cell.z`) do survive.
- **Ruled out:** a URL-pinned dependency outside the registry, plus no bold headers.

### CAD currency formatting

- Use `Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })`, which gives `$1,234.50` on Node 26 (full ICU). The variants:
  - `en-US` with CAD gives `CA$1,234.50`.
  - `fr-CA` gives `1 234,50 $`.
  - `currencyDisplay: 'code'` gives `CAD 1,234.50`.
- **PDF:** format the strings in JS with the `en-CA` formatter. react-pdf just renders text.
- **Excel:** write numbers, not strings, so the accountant can sum them, and apply `numFmt: '"$"#,##0.00'`. `"$"` is a literal and does not depend on the reader's locale. A `[$$-1009]` (en-CA) locale-tagged format also works if they want it marked as Canadian. Keep amounts as integer cents in the DB and divide by 100 at the edge, as the app already does (`total_cents`, `hourly_rate_cents` in `src/types/database.ts`).
- Write dates as real Excel dates, or as ISO `YYYY-MM-DD` strings for CSV, in Toronto time.

### Hosting candidates

- **The hosting decision is still open** (#136), but its constraints (VPC with no NAT, under $15/mo) push towards a small EC2 running `next start`.
- **On EC2:** everything recommended runs in-process with no extra system packages. Memory cost is a single render at a time, well within 2 GB.
- **On Lambda (OpenNext):** react-pdf and exceljs are pure JS, so there is no layer. The default 1,024 MB+ function memory is plenty. The cold-start cost of loading react-pdf (~100 ms) applies only on export routes, because it is externalised and required lazily.
- Chromium is the only option that differs by host, which is another reason to skip it.

## Open points for the spec

- Does the accountant want CSV at all, or only `.xlsx`? If CSV is required, it must be **two files** (summary and detail), or one zip.
- Should money columns in the workbook show `$` or be bare numbers? Accountants often prefer bare numbers.
- Should the statement carry a logo? If so, react-pdf `<Image>` takes a local PNG. Fonts beyond Helvetica need TTFs in the repo.
