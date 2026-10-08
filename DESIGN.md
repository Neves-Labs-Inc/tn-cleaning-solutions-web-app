# DESIGN.md — TN Cleaning Solutions

The design system for every screen in this app. Design briefs and design reviews treat this file as law. When a screen and this file disagree, the screen is wrong (or this file gets a deliberate edit first).

Scope of this revision: the **employee-facing phone experience** is the primary target (Schedule, Appointment detail, Time Sheets, Profile, Login). Admin screens follow the same tokens and primitives; their mobile layouts are secondary and are only called out where they drift.

---

## 1. Product and tone

- **Who**: Cleaners (CONTEXT.md language: *Cleaner*, never "worker") using a phone, often one-handed, outdoors or in a client's home, sometimes with wet hands or gloves. Admins on a laptop, occasionally on a phone.
- **What they do on the phone**: see today's stop, call the client, read notes, **clock in / clock out**, check hours for the month, update phone number / password.
- **Tone**: calm, operational, trustworthy. Emerald green is the brand; white surfaces; soft neutral text. No marketing gloss, no decorative gradients on working screens (see §13 drift). Copy is short and plain; headings name the thing ("Your Schedule", "Time Sheets"), not the feeling.
- **Style family** (ui-ux-pro-max): Minimalism / Swiss — clean, spacious, high contrast, grid-based, sans-serif. Subtle hover (150–250ms), sharp-but-light shadows, clear type hierarchy.

---

## 2. Stack and ownership

| Layer | Owner | Notes |
|---|---|---|
| Framework | Next.js 16.2 App Router, React 19.2 | Server components for pages/layouts that load data; `'use client'` for anything interactive (see `~/.claude/skills/coding-style/react.md`) |
| Styling | Tailwind v4 (`@theme inline` in `src/app/globals.css`) + `cn()` from `src/lib/utils.ts` | No `tailwind.config`; tokens are CSS variables mapped in `globals.css`. Class order: Prettier Tailwind plugin |
| Primitives | shadcn **base-mira** style on `@base-ui/react` (`src/components/ui/*`) | Base UI, not Radix: state attributes are `data-open`, `data-starting-style`, `data-ending-style`, `aria-expanded`, not `data-state` |
| Icons | `lucide-react` only | Never emoji as icons. Stroke 2px (lucide default). Decorative icons get `aria-hidden="true"` |
| Motion | `tw-animate-css` utilities + Tailwind `transition-*` / `duration-*` / `ease-*` | CSS-only. No motion libraries |
| Toasts | `sonner` via `src/components/ui/sonner.tsx` | Must be mounted once in `src/app/(internal)/solutions/layout.tsx` (currently not mounted — §13) |
| Bottom sheets | `vaul` via `src/components/ui/drawer.tsx` | Phone-first modal surface |
| Side panels / nav drawer | `src/components/ui/sheet.tsx` | Admin mobile nav |
| Charts | `recharts` via `src/components/ui/chart.tsx` | See §12 |
| Fonts | Nunito Sans (`--font-sans`), Geist Mono (`--font-geist-mono`) via `next/font` | Geist Sans is loaded but unused; remove |

---

## 3. Color tokens

All colors are the semantic CSS variables already defined in `src/app/globals.css` and exposed as Tailwind utilities (`bg-primary`, `text-muted-foreground`, `border-border`, …). **Components never use raw Tailwind palette colors** (`emerald-600`, `neutral-950`, `red-50`) — they use tokens. The two additions below (status tokens) are new and must be added to `globals.css`.

### 3.1 Core (existing, light / dark)

| Token | Role | Light | Dark |
|---|---|---|---|
| `--background` | page | `oklch(1 0 0)` | `oklch(0.145 0 0)` |
| `--foreground` | body text | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--card` / `--card-foreground` | raised surfaces | white / near-black | `oklch(0.205 0 0)` / near-white |
| `--popover` | menus, sheets, drawers | white | `oklch(0.205 0 0)` |
| `--primary` / `--primary-foreground` | brand emerald, primary actions, active nav | `oklch(0.527 0.154 150)` / `oklch(0.982 0.018 156)` | `oklch(0.448 0.119 151)` / same |
| `--secondary` | low-emphasis fills | `oklch(0.967 0.001 286)` | `oklch(0.274 0.006 286)` |
| `--muted` / `--muted-foreground` | subdued surfaces / secondary text | `oklch(0.97 0 0)` / `oklch(0.556 0 0)` | `oklch(0.269 0 0)` / `oklch(0.708 0 0)` |
| `--accent` | hover fills | = muted | = muted |
| `--destructive` | errors, destructive actions | `oklch(0.577 0.245 27)` | `oklch(0.704 0.191 22)` |
| `--border` / `--input` | hairlines, field borders | `oklch(0.922 0 0)` | `white/10` / `white/15` |
| `--ring` | focus ring | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` |
| `--sidebar-*` | admin sidebar | existing | existing |

Contrast floors: body text on any surface ≥ 4.5:1; `--muted-foreground` is for secondary text ≥ 12px only, never for labels of fields or for the only copy on a card.

### 3.2 Status tokens (new — add to `globals.css`)

Statuses in this product (`appointment status`, `clock status`, `invoice status`, open shift) are currently hand-painted with `blue-50/700`, `amber-50/700`, `emerald-50/700`, `neutral-100/600`, `red-50/700`. Replace with four semantic pairs so the whole app agrees:

| Token | Meaning | Light (bg / fg / border) | Dark (bg / fg / border) |
|---|---|---|---|
| `--status-info` | scheduled, issued, neutral-forward | `oklch(0.97 0.014 254)` / `oklch(0.42 0.15 262)` / `oklch(0.88 0.05 254)` | `oklch(0.62 0.17 262 / 0.15)` / `oklch(0.80 0.10 254)` / `oklch(0.62 0.17 262 / 0.35)` |
| `--status-success` | in progress (clocked in), paid, completed-by-me | `oklch(0.97 0.03 155)` / `oklch(0.43 0.12 152)` / `oklch(0.88 0.07 155)` | `oklch(0.60 0.14 152 / 0.15)` / `oklch(0.82 0.12 155)` / `oklch(0.60 0.14 152 / 0.35)` |
| `--status-warning` | not started, open shift, overdue | `oklch(0.97 0.04 85)` / `oklch(0.47 0.13 65)` / `oklch(0.88 0.10 85)` | `oklch(0.70 0.16 70 / 0.15)` / `oklch(0.85 0.14 85)` / `oklch(0.70 0.16 70 / 0.35)` |
| `--status-danger` | cancelled, void, error | `oklch(0.97 0.02 20)` / `oklch(0.50 0.19 27)` / `oklch(0.88 0.06 20)` | `oklch(0.64 0.21 25 / 0.15)` / `oklch(0.82 0.10 20)` / `oklch(0.64 0.21 25 / 0.35)` |
| (neutral) | completed, clocked out, archived | `--muted` / `--muted-foreground` / `--border` | same tokens |

Expose each as `--color-status-<name>`, `--color-status-<name>-foreground`, `--color-status-<name>-border` in `@theme inline`. Status is **never color-alone**: every status pill carries a label, and pills that need scanning at a glance also carry a lucide icon (`Clock`, `CheckCircle2`, `XCircle`, `CircleDashed`).

Mapping (single source of truth lives in one `status-badge.tsx`, §10):

| Domain value | Token |
|---|---|
| appointment `scheduled` | info |
| appointment `in_progress` | success |
| appointment `completed` | neutral |
| appointment `cancelled` | danger |
| clock `not_started` | warning |
| clock `clocked_in` | success |
| clock `clocked_out` | neutral |
| time sheet open shift ("still clocked in") | warning |
| invoice `draft` | neutral; `issued` info; `overdue` warning; `paid` success; `void` danger |

### 3.3 Dark mode

Dark tokens exist in `globals.css` (`.dark`) and `next-themes` is installed but there is no `ThemeProvider` and no toggle. **Decision: dark mode is supported by tokens but not shipped as a user setting in this overhaul.** Everything must still be written in tokens so flipping it on later is a provider, not a rewrite. Don't test dark visually until a provider exists.

---

## 4. Typography

Base 16px. Phone first; the admin dashboard may step one size down with `md:` where density matters.

| Role | Classes | Use |
|---|---|---|
| Page title | `text-2xl font-semibold tracking-tight` (`sm:text-3xl`) | One per screen, left-aligned, no eyebrow above it on phones |
| Section title | `text-lg font-semibold tracking-tight` | "Today", "Upcoming", "Recent", "Work sessions" |
| Card title | `text-base font-semibold` | Job name on an appointment card |
| Body | `text-sm leading-6 text-foreground` | Default copy, 14px/24px |
| Body large | `text-base leading-7` | Notes block on appointment detail (read-on-site) |
| Secondary | `text-sm text-muted-foreground` | Client name under a job name, helper text |
| Caption / meta | `text-xs text-muted-foreground` | Timestamps, "Computed from clock times" |
| Label (field) | `text-sm font-medium text-foreground` | Always visible, above the field |
| Eyebrow | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | Section group labels only (`tracking-wider` = 0.05em; **not** `tracking-[0.3em]`) |
| Hero number | `text-3xl font-semibold tabular-nums tracking-tight` | Stat tiles (§12) |
| Mono | `font-mono tabular-nums` | Durations and clock times in lists (`2h 15m`, `8:04 AM`) |

Rules:
- Minimum body text 14px; 12px only for captions. Never `text-[0.625rem]`, `text-[10px]`, `text-[0.65rem]` for anything a Cleaner must read.
- Inputs are **16px on phones** (`text-base md:text-sm`) so iOS Safari does not zoom on focus.
- Wrap, don't truncate, job and client names on phones (`text-balance`/`break-words`). Truncation (`truncate`) is allowed only in single-line rows that open a detail.

---

## 5. Spacing, radius, shadows, z-index

**Spacing**: Tailwind 4px scale. Page gutter `px-4` (16px) at 375px, `sm:px-6`, `lg:px-8`. Vertical rhythm between sections `space-y-6` on phones, `lg:space-y-8`. Inside a card `p-4` (`sm:p-5`). Gap between stacked cards `gap-3`. Gap between adjacent touch targets ≥ `gap-2` (8px).

**Content width**: employee screens `max-w-2xl` centered; admin `max-w-7xl`. Never a fixed pixel width.

**Radius** (from `--radius: 0.45rem`):

| Token | Value | Use |
|---|---|---|
| `rounded-md` | ~5.8px | buttons, inputs, badges inner |
| `rounded-lg` | 7.2px | cards, list rows |
| `rounded-xl` | ~10px | drawers, dialogs, bottom sheets, stat tiles |
| `rounded-full` | pill | status pills, bottom-nav indicator, avatar |

No `rounded-2xl`, `rounded-3xl`, `rounded-[1.75rem]` on working surfaces. If a surface needs to feel softer, use `rounded-xl` — never an arbitrary value.

**Shadows** (only two):

| Name | Classes | Use |
|---|---|---|
| resting | `shadow-sm ring-1 ring-foreground/10` (Card default) | cards, tiles |
| raised | `shadow-lg` | sheets, drawers, popovers, sticky action bar |

No colored shadows (`shadow-emerald-600/20`, `shadow-[0_12px_30px_rgba(...)]`). Hover does not add shadow on phones (no hover); on `md:` and up a card that is a link may go `hover:ring-foreground/20`.

**Z-index ladder**: content `0` · sticky section headers `10` · sticky action bar `30` · top bar / bottom nav `40` · overlays and sheets `50` · toasts `60` (sonner default is 9999 — fine, it sits above all).

---

## 6. Mobile-first layout and responsive rules

Design at **375 × 667 first**, then 390/430, then `sm` 640, `md` 768, `lg` 1024, `xl` 1280. Every utility is mobile by default; `sm:`/`md:`/`lg:` only add. Never a `max-*:` query to "fix" mobile.

- **Viewport**: `export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }` in `src/app/layout.tsx`. No `maximumScale`/`userScalable=no`.
- **No horizontal scroll**: `html, body { overflow-x: clip }` is not the fix — the fix is `min-w-0` on flex children, `break-words` on user text, and never a fixed width. The only intentional horizontal scroll is a filter-chip row (`overflow-x-auto` with `snap-x`, and only if chips exceed the viewport).
- **Safe areas** (standalone/home-screen and notched phones):
  - Top bar: `pt-[env(safe-area-inset-top)]`.
  - Bottom nav and sticky action bar: `pb-[env(safe-area-inset-bottom)]`.
  - Page content: bottom padding = bottom nav height (56px) + safe area, applied once in the employee layout (`pb-[calc(3.5rem+env(safe-area-inset-bottom))]`), plus the sticky action bar's height when a screen has one.
  - Add a `--safe-top` / `--safe-bottom` CSS var pair in `globals.css` so these are not repeated.
- **Keyboard on phones**: forms with a sticky submit use `position: sticky; bottom: 0` inside the scroll container (not `fixed`) so the on-screen keyboard pushes it up instead of covering the field. Scroll the focused field into view (`scroll-margin-bottom: 6rem` on inputs).
- **Thumb zone**: the single most important action on a screen lives at the bottom (§9). Destructive or rare actions live at the top or inside a menu.
- **Landscape and tablets**: nothing special; the `sm:`/`md:` rules cover them.
- **Reduced motion**: a global `@media (prefers-reduced-motion: reduce)` block in `globals.css` sets `animation-duration: 0.01ms; transition-duration: 0.01ms` for everything except opacity.

---

## 7. Navigation

### 7.1 Employee (phone-first): bottom tab bar

Replace the current top pill nav (`src/components/employee/employee-nav.tsx`) with:

- **Top bar** (`h-14`, sticky, `bg-background/90 backdrop-blur`, `border-b`): on list screens shows the "TN" mark + page title; on detail screens shows a **Back** button (left, 44×44, `ArrowLeft` + "Schedule") and the page title. No "Ready for shift" pill, no eyebrow text.
- **Bottom tab bar** (`fixed inset-x-0 bottom-0 z-40 h-14`, `border-t`, `bg-background/95 backdrop-blur`, `pb-[env(safe-area-inset-bottom)]`): three tabs — **Schedule** (`CalendarDays`), **Time Sheets** (`Clock3`), **Profile** (`UserRound`). Each tab is a `Link` that fills the full height (≥ 44px tall, ≥ 64px wide), icon 24px over a `text-xs font-medium` label. Active = `text-primary` + icon filled weight (`strokeWidth={2.5}`); inactive = `text-muted-foreground`. `aria-current="page"` on the active one. Pressing feedback: `active:bg-muted` on the tab.
- At `md:` and up the bottom bar hides (`md:hidden`) and the same three items render as a horizontal nav in the top bar (`hidden md:flex`). Same component, two slots.
- Back always goes to the parent list (`/solutions/schedule`), not `router.back()` — predictable after a refresh or deep link.

### 7.2 Admin

Keep the existing pattern: desktop sidebar (`lg:flex`) + mobile top bar with a left `Sheet`. Fixes: the hamburger trigger becomes 44×44 (`size-11`), nav links become `min-h-11`, the sheet gets `pt-[env(safe-area-inset-top)]`, and link styles move to tokens. Nav list ≤ 8 items is fine in a sheet; it would not be fine in a bottom bar, which is why admin does not get one.

---

## 8. Touch targets and interactive sizing

**Every** interactive element is at least **44 × 44 CSS px** on phones, with ≥ 8px between adjacent targets. The shadcn base-mira primitives default to compact desktop sizes (Button `h-7`, Input `h-7`, Badge `h-5`), which fail this. Resolution:

| Primitive | Phone size (default) | Desktop (`md:` and up) |
|---|---|---|
| `Button` default | `h-11 px-4 text-sm` | `md:h-9 md:text-sm` |
| `Button` `size="lg"` (primary CTA) | `h-12 px-5 text-base font-semibold` | same |
| `Button` `size="sm"` | `h-10 px-3 text-sm` | `md:h-8` |
| `Button` `size="icon"` | `size-11` | `md:size-9` |
| `Input`, `Textarea`, `NativeSelect`, `Select` trigger | `h-11 text-base` | `md:h-9 md:text-sm` |
| `Checkbox`, `Radio`, `Switch` | visual 20–24px, hit area 44 via label row `min-h-11 py-2` | same |
| Tab bar item, list row that navigates | `min-h-14` / `min-h-16` | same |
| Status pill, badge | not interactive — no minimum | — |

Implement by editing the `size` variants in `src/components/ui/button.tsx` and the base class in `input.tsx` etc. — **not** by passing `className="h-11 …"` on every call site (which is the current pattern and the main source of drift). Compact `xs`/`icon-xs` sizes remain only for desktop admin tables and must never appear on employee screens.

**Mechanism (as built):** the responsive sizes live in CSS variables in `globals.css` (`--control-height` 44px → 36px at `md`, `--control-height-sm` 40 → 32, `--control-padding-x`), and primitives use `h-(--control-height)` / `size-(--control-height)` / `px-(--control-padding-x)`. Never put `md:h-*` / `md:px-*` on a primitive: tailwind-merge drops the base height when a call site passes its own `h-*`, but the `md:` class survives and shrinks the control at `md`+.

Links inside running text are exempt (they are text), but a `tel:` phone link that is the primary way to call the client is a **button**, not inline text.

---

## 9. Primary actions and the sticky action bar

Each screen names **one** primary action. On phones it renders in a **sticky action bar** pinned to the bottom of the scroll area, above the tab bar:

```
<div class="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
  <Button size="lg" class="w-full">Clock In</Button>
</div>
```

| Screen | Primary action | Secondary (inline, not sticky) |
|---|---|---|
| Appointment detail | **Clock In** (`not_started`) → **Clock Out** (`clocked_in`) → disabled "Work completed" state (`clocked_out`) | Call client (`tel:`), open address in maps |
| Schedule | none sticky — the "next appointment" card is the action; tapping it opens detail | — |
| Time Sheets | none | Search |
| Profile | Save profile (sticky while the form is dirty) | Change password lives in its own section with its own submit |
| Login | Sign in (not sticky — the form is short) | Forgot password |

Rules: a sticky bar holds one full-width `size="lg"` button, or at most two side by side (primary right, secondary `variant="outline"` left). The bar's pending state is the button's pending state (§11.4). Clock In / Clock Out are the only actions that should never need a scroll to reach.

Destructive confirmations (cancel appointment, admin only) use `AlertDialog` on `md:+` and a bottom `Drawer` on phones; the confirm button is `variant="destructive"` and never the default-focused one.

---

## 10. Component inventory

Where each thing comes from. New components are marked **(new)**.

| Need | Component | Rules |
|---|---|---|
| Buttons | `ui/button.tsx` | Variants: `default` (primary), `outline`, `secondary`, `ghost`, `destructive`, `link`. `size="lg"` for CTAs. Always `type="button"` unless submitting |
| Pending / submit button | **(new)** `ui/submit-button.tsx` wrapping `Button` with `useFormStatus` | Shows `Spinner` + pending label, `aria-busy`, stays the same width (reserve with `min-w`) |
| Text inputs | `ui/input.tsx`, `ui/password-input.tsx`, `ui/textarea.tsx` | Always with `Label` + `Field` (`ui/field.tsx`) for label/description/error composition |
| Selects | `ui/native-select.tsx` on phones (native picker), `ui/select.tsx` on desktop; `ui/searchable-select.tsx` when > 12 options | |
| Dates | `ui/calendar.tsx` inside a `Drawer` on phones, `Popover` on desktop; `type="date"` native input is acceptable on employee screens | |
| Search field | `ui/input-group.tsx` with leading `Search` icon and a clear `Button size="icon"` | Not a bare `<input>` |
| Cards / list rows | `ui/card.tsx`; **(new)** `ui/list-row.tsx` for tappable rows | See §10.1 |
| Status pills | **(new)** `ui/status-badge.tsx` built on `ui/badge.tsx` | Takes a `tone` (`info|success|warning|danger|neutral`), `icon?`, label. The *only* place status colors are painted |
| Stat tiles | `components/dashboard/statCard.tsx` → rename **(new)** `ui/stat-tile.tsx` | §12 |
| Page header | **(new)** `ui/page-header.tsx` | title, optional description, optional right-slot action. Replaces the gradient hero sections |
| Empty state | `ui/empty.tsx` | `EmptyMedia variant="icon"` + title + one-sentence description + optional single action |
| Error block | `ui/alert.tsx` `variant="destructive"` | Inline, near the thing that failed, with a retry or next step |
| Loading | `ui/skeleton.tsx` + `ui/spinner.tsx` | §11.1 |
| Toasts | `ui/sonner.tsx` (`toast.success/error`) | For results of actions that navigate or refresh (clock in/out, save). Never for validation errors |
| Bottom sheet | `ui/drawer.tsx` (vaul, `direction="bottom"`) | Filters, confirmations, pickers on phones |
| Side panel | `ui/sheet.tsx` | Admin nav; admin detail panels on desktop |
| Modal | `ui/dialog.tsx`, `ui/alert-dialog.tsx` | Desktop only; on phones use `Drawer` (`useIsMobile()` from `src/hooks/use-mobile.ts` picks) |
| Tabs / segmented | `ui/tabs.tsx`, `ui/toggle-group.tsx` | Month switcher, admin list/calendar toggle |
| Back button | `ui/back-button.tsx` → rebuild as `Button variant="ghost" size="icon"` + text with an explicit `href` | Remove the emerald pill styling |
| Separators, avatars, tooltips, tables, pagination | existing `ui/*` | Tooltips are desktop-only affordances; never the only way to learn something |

### 10.1 Lists and cards instead of wide tables

Phones get **cards or list rows**, never a horizontally-scrolling table. The rule by data shape:

| Shape | Phone | `md:` and up |
|---|---|---|
| Items a Cleaner acts on (appointments) | **Card**: date/time line → job (title) → client (secondary) → status pill row → optional meta row (crew, address). Whole card is a `Link`, `min-h-16`, `active:bg-muted` | Same cards in a 2–3 column grid (`md:grid-cols-2 lg:grid-cols-3`) |
| Records a Cleaner reads (work sessions) | **List row**: left = date (`font-medium`) + job + client; right = duration (`font-mono tabular-nums text-base font-semibold`) + status pill. `divide-y` inside one `Card` with `p-0`. Row `min-h-16 px-4 py-3` | Same list, or `Table` from `ui/table.tsx` if there are ≥ 5 columns (admin) |
| Key/value facts (profile, appointment info) | `dl` with stacked `dt`/`dd` (`dt` caption above `dd`), not side-by-side | `sm:grid-cols-[auto_1fr]` |
| Crew list | List rows with name, phone (as a tappable `tel:` button), clock pill | same |
| Admin tables (invoices, time tracking) | Cards with the 3–4 most important fields; the rest behind the row's detail page | `Table` |

Grouping: lists longer than ~8 items are grouped under sticky date headers (`sticky top-14 z-10 bg-background py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground`). "Today" is always the first group and is visually stronger (`border-l-2 border-primary` on the group or a `success` pill on the header).

Pagination on phones is "Load more" (`Button variant="outline" w-full`) or month navigation — never numbered pages.

### 10.2 Forms on phones

- Label **above** the field, always visible (`Field` + `Label`). Placeholder is an example, never the label.
- One column. Related short fields (first/last) may pair at `sm:grid-cols-2`.
- `inputMode` + `autoComplete` + `enterKeyHint` on every input: email → `type="email" inputMode="email" autoComplete="email" enterKeyHint="next"`; phone → `type="tel" inputMode="tel" autoComplete="tel"`; password → `autoComplete="current-password"`/`"new-password"`; search → `type="search" enterKeyHint="search"`; amounts → `inputMode="decimal"`.
- `autoFocus` only on login's email field, never on phone forms that start below the fold.
- Validation: on submit (server action), errors return per field; render under the field via `FieldError` with `aria-invalid` and `aria-describedby`. A form-level error (`Alert destructive`) appears only for non-field failures (bad credentials, network) and is placed **above the submit button**, not at the top of the page, so it is visible next to where the thumb is. On submit with errors, focus the first invalid field.
- Success: `toast.success(...)` and, where the page re-renders, no inline green banner. (The current inline green "updated successfully" banners go away.)
- Submit button sits in the sticky bar (§9) when the form is longer than one screen; otherwise directly under the last field with `mt-6`.
- Disable the submit while pending; never disable it for "invalid" before the user tries.

---

## 11. Every state designed

Each surface and each async action specifies **loading, empty, error, success**. Server-rendered pages get a `loading.tsx` next to `page.tsx` with a structural skeleton; client actions get inline pending states.

### 11.1 Loading — structural skeletons

- Add `loading.tsx` to: `(employee)/schedule`, `(employee)/schedule/[id]`, `(employee)/time-sheets`, `profile`, and each admin list route.
- A skeleton **mirrors the final layout** at the same heights so nothing jumps (CLS < 0.1): page header skeleton (`h-7 w-40`), stat row (`grid-cols-2 gap-3` of `h-20` tiles), then 3 cards of `h-24`, or 6 list rows of `h-16`. Use `Skeleton` (`animate-pulse bg-muted rounded-md`); never a centered spinner for a page.
- `Spinner` is for **in-button** pending and for small inline refreshes only.
- Skeletons show for the whole load; no minimum display time, no fade-in delay. Route changes also get `NextTopLoader` (keep it; set `color` to the primary token's hex equivalent and keep `showSpinner={false}`).
- Reserve space for async badges/counts (`min-w-[3ch]`) so a count arriving does not shift the row.

### 11.2 Empty

`Empty` with icon, title, one sentence, and at most one action. Copy per surface:

| Surface | Title | Description | Action |
|---|---|---|---|
| Schedule, no appointments at all | No appointments yet | When you're added to a stop it will show up here. | — |
| Schedule, "Upcoming" with only today | Nothing after today | You're all caught up. | — |
| Schedule, "Recent" | No recent stops | Stops from the last 7 days will show here. | — |
| Time Sheets, month empty | No sessions this month | Clock in on an appointment and it will appear here. | Go to Schedule |
| Time Sheets, search no match | No matches | Try a different date, client, or job. | Clear search |
| Crew list on a stop | Just you on this stop | — | — |
| Admin lists | No {things} yet | — | New {thing} |

### 11.3 Error

- Page-level fetch failure: an `Alert variant="destructive"` with title "Couldn't load your schedule", one sentence, and a **Try again** button (`router.refresh()`), placed where the content would be. Add `error.tsx` to the same routes as `loading.tsx` for thrown errors (same look, same retry).
- Missing employee profile (schedule page today): `Alert` warning tone with the contact-admin action.
- Action failure (clock in/out, save): `toast.error("Couldn't clock in. Try again.")` **and** the button returns to its idle state. The inline red box under the buttons goes away unless the message needs to persist (e.g. "This appointment is cancelled") — that one is a `text-sm text-muted-foreground` line, not an error.
- Field validation: §10.2.
- Not found (`notFound()`): `not-found.tsx` under `(employee)/schedule/[id]` — "This stop isn't on your schedule" + Back to Schedule.

### 11.4 Success and pending for each async action

| Action | Pending | Success | Failure |
|---|---|---|---|
| Clock In | Button → `Spinner` + "Clocking in…", `aria-busy`, disabled, width unchanged | Button swaps to **Clock Out** (`variant="secondary"`), status pill animates to `success` tone, `toast.success("Clocked in at 8:04 AM")` | toast error; button back to idle |
| Clock Out | Button → "Clocking out…" | Bar shows the disabled "Work completed · 2h 15m" state; toast with duration | same |
| Save profile | Submit → "Saving…" | toast "Profile saved"; sticky bar hides (form no longer dirty) | field errors inline or toast |
| Change password | Submit → "Updating…" | toast "Password updated"; fields reset | inline field errors |
| Sign in | Submit → "Signing in…" | navigation | form-level `Alert` above the button |
| Month prev/next, search | Content area `aria-busy` + skeleton rows (search is client-side and instant — no state) | list updates | — |
| Admin create/update | same pattern | toast + navigate to the detail | inline + toast |

---

## 12. Stat tiles and charts (dataviz)

**Stat tiles** (Schedule: Today / Upcoming / Recent / Total; Time Sheets: Appointments / Total Hours / Avg per Job; admin dashboard): one `ui/stat-tile.tsx`.

- Anatomy: label (`text-xs font-medium text-muted-foreground`) above the value (`text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight text-foreground`), optional caption line below. Optional 20px lucide icon top-right in `text-muted-foreground`. No colored icon chips, no colored borders per tile.
- Phone: `grid-cols-2 gap-3`; 3 tiles → the third spans both columns (`col-span-2`) or becomes a single row of 3 at `sm:`.
- A tile that navigates (admin) is a `Link` with `active:bg-muted` and the resting card shadow; one that doesn't is a plain `div`. Never mix on one row.
- Values use text tokens, never a series color. An "open shift" tile may carry a `warning` status pill, never a colored number.

**Charts** (admin only, `recharts` via `ui/chart.tsx`): the current `--chart-1..5` tokens are five rose/red steps — a sequential ramp mislabeled as categorical, and off-brand. Replace with a categorical set in fixed slot order, validated with the dataviz validator (light passes all checks; dark passes all checks; the pink↔violet adjacent pair sits in the tritan warn band, so charts with ≥ 4 series must direct-label):

| Slot | Light | Dark |
|---|---|---|
| `--chart-1` emerald | `#059669` | `#059669` |
| `--chart-2` blue | `#2563eb` | `#3b82f6` |
| `--chart-3` amber | `#d97706` | `#d97706` |
| `--chart-4` violet | `#7c3aed` | `#8b5cf6` |
| `--chart-5` pink | `#db2777` | `#ec4899` |

Rules: one axis per chart; single-series charts use `--chart-1` with no legend; ≥ 2 series always have a legend; status colors (§3.2) are never used as series colors; bars have `radius={[4,4,0,0]}` and a 2px gap; lines are 2px; tooltips on everything with a plot. On phones a chart gets `h-56`, hides the y-axis labels in favor of direct labels on ≤ 6 marks, and provides a table view (`Table` or list) below or behind a toggle.

---

## 13. Micro-interactions and motion (CSS only)

**Durations and easings** (add to `@theme inline` so they are utilities: `duration-fast`, `duration-base`, `duration-slow`, `ease-out-quart`, `ease-in-quart`):

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 120ms | hover/press color changes, focus rings, icon swaps |
| `--duration-base` | 200ms | enters: sheet/drawer slide, dialog zoom, card appear, tab indicator |
| `--duration-slow` | 300ms | page-section stagger, skeleton → content crossfade |
| `--ease-out-quart` | `cubic-bezier(0.25, 1, 0.5, 1)` | every enter |
| `--ease-in-quart` | `cubic-bezier(0.5, 0, 0.75, 0)` | every exit |

Exits are **faster than enters**: exit = enter × 0.7 (sheet in 200ms, out 140ms; dialog in 200ms, out 140ms; toast in 200ms, out 150ms). Animate only `transform` and `opacity` (plus `background-color`/`color`/`border-color` for state changes). Never animate `width`/`height`; collapse with `grid-template-rows: 0fr → 1fr` (Tailwind `grid-rows-[0fr]`/`grid-rows-[1fr]`) if needed.

**Per interaction**:

| Element | Hover (`md:` only, `hover:`) | Press (`active:`) | Focus-visible | Transition |
|---|---|---|---|---|
| Primary button | `hover:bg-primary/90` | `active:scale-[0.98]` (transform, 120ms) | `ring-2 ring-ring/50 ring-offset-2 ring-offset-background` | `transition-[background-color,transform,box-shadow] duration-fast` |
| Outline/ghost button | `hover:bg-muted` | `active:bg-muted active:scale-[0.98]` | same ring | same |
| Card link / list row | `md:hover:ring-foreground/20` | `active:bg-muted` (no translate on phones) | ring inside (`focus-visible:ring-2 ring-inset`) | `transition-[background-color,box-shadow] duration-fast` |
| Tab bar item | — | `active:bg-muted` | ring inset | icon `transition-colors duration-fast`; active indicator (2px top bar) `transition-transform duration-base ease-out-quart` sliding between tabs |
| Input | `hover:border-foreground/30` | — | `border-ring ring-2 ring-ring/30` | `transition-[border-color,box-shadow] duration-fast` |
| Status pill changing tone | — | — | — | `transition-colors duration-base` |
| Drawer (vaul bottom) | — | drag-to-dismiss (built in) | — | overlay `fade-in-0` 200ms / `fade-out-0` 140ms; content `slide-in-from-bottom` 200ms ease-out-quart / out 140ms ease-in-quart |
| Sheet (admin nav) | — | — | — | existing `data-starting-style`/`data-ending-style` opacity+translate; set `duration-200` in and `duration-150` out |
| Dialog | — | — | — | `zoom-in-95 fade-in-0` 200ms / `zoom-out-95 fade-out-0` 140ms |
| Toast | — | swipe to dismiss | — | sonner defaults |
| Skeleton → content | — | — | — | content wrapper `animate-in fade-in-0 duration-slow` on mount |
| List appear (new group) | — | — | — | rows `animate-in fade-in-0 slide-in-from-bottom-1 duration-base`, stagger via `style={{ animationDelay }}` ≤ 40ms × index, max 8 rows |
| Clock status pill after clock in | — | — | — | `animate-in zoom-in-95 duration-base` once |

Hover-only affordances are forbidden: anything revealed on hover must also be visible or reachable on touch. `cursor-pointer` on every clickable element on desktop.

---

## 14. Known drift to clean up

What the current UI does that this system forbids. Design briefs for the overhaul should treat these as the to-do list.

1. **Raw palette colors everywhere**: `emerald-*`, `neutral-*`, `red-*`, `amber-*`, `blue-*` in `employee-nav.tsx`, `clock-actions.tsx`, `work-sessions-list.tsx`, `schedule/page.tsx`, `schedule/[id]/page.tsx`, `time-sheets/page.tsx`, `profile/page.tsx`, `profile-form.tsx`, `password-form.tsx`, `login-form.tsx`, `sidebar-nav.tsx`, `statCard.tsx`, `appointments-list.tsx`, `lib/helpers/dashboard.ts` (`statusBadgeClasses`). → tokens (§3) and `status-badge.tsx`.
2. **Duplicated status components**: `StatusBadge` and `ClockStatusPill` are copy-pasted in `schedule/page.tsx` and `schedule/[id]/page.tsx`; `StatusPill` in `work-sessions-list.tsx`; `statusClasses` in `appointments-list.tsx`; `statusBadgeClasses` in `dashboard.ts`. → one `ui/status-badge.tsx`.
3. **Primitive sizes below 44px**: `Button` default `h-7`, `Input` `h-7`, `SheetTrigger` `size-9`, nav pills `py-2`, "Clear" text button in the search field, hamburger `size-9`. Call sites patch with `className="h-11 …"` (`profile-form`, `password-form`, `login-form`) instead of fixing the primitive. → §8.
4. **Employee top pill nav** with `overflow-x-auto` and a decorative "Ready for shift" pill. → bottom tab bar (§7.1).
5. **Gradient hero sections** (`rounded-3xl` + radial gradients + `tracking-[0.3em]` eyebrows) on Schedule, Time Sheets, Profile, Appointment detail, Login. They cost ~200px of a 667px viewport before any content. → `page-header.tsx` (§10) + stat tiles directly below.
6. **Arbitrary radii and colored shadows**: `rounded-[1.75rem]`, `rounded-3xl`, `rounded-2xl`, `shadow-emerald-950/5`, `shadow-[0_12px_30px_rgba(5,150,105,0.18)]`. → §5.
7. **Tiny text**: `text-[0.625rem]`, `text-[0.65rem]`, `text-[0.68rem]`, `text-[0.7rem]`, `text-[10px]` for eyebrows, "You" chips, stat labels. → §4 minimums.
8. **No loading states**: zero `loading.tsx`, zero `Skeleton` usage, zero `error.tsx`; `Toaster` is never mounted so `toast()` would be silent. → §11.
9. **Clock actions not in the thumb zone**: `ClockActions` renders inside the second card on the detail page; on a phone it is below the fold under notes and crew. → sticky action bar (§9).
10. **Hover-translate on touch**: `hover:-translate-y-px`/`-translate-y-0.5` on nav links and cards triggers sticky hover on iOS. → `active:` feedback, hover only at `md:`.
11. **Inline success banners** in profile/password forms and inline red boxes for action errors. → toasts for results, inline only for field errors (§10.2, §11.3).
12. **Back button** does `router.back()` with pill styling. → explicit `href` ghost button (§7.1).
13. **Bare `<input>`** in `work-sessions-list.tsx` search; `focus:` instead of `focus-visible:`. → `InputGroup`.
14. **Chart tokens** `--chart-1..5` are five rose steps. → §12 palette.
15. **Fonts**: Geist Sans loaded and unused; `--font-heading` = `--font-sans` (fine, keep one family). → drop Geist Sans.
16. **Admin `StatCard`** builds class names by string interpolation (`hover:border-${…}`), which Tailwind cannot see. → `stat-tile.tsx` with fixed classes.
17. **Viewport**: no `viewport` export, no `viewportFit: 'cover'`, no safe-area padding anywhere. → §6.
18. **Dark mode half-wired**: `.dark` tokens exist, `next-themes` installed, no provider; `sonner.tsx` calls `useTheme()` which will return `system` forever. → §3.3 decision.

---

## 15. Review checklist (design review uses this verbatim)

- [ ] Rendered at 375px: no horizontal scroll, nothing under the notch or home indicator, primary action reachable without scrolling.
- [ ] Every interactive element ≥ 44×44 with ≥ 8px to its neighbors.
- [ ] No raw palette colors; status painted only by `status-badge.tsx`.
- [ ] Inputs 16px on phones, labels visible, `inputMode`/`autoComplete`/`enterKeyHint` set, errors under the field.
- [ ] `loading.tsx` skeleton mirrors the page; `error.tsx` has retry; empty state copy from §11.2.
- [ ] Every async action has pending, success, failure per §11.4; toasts mounted.
- [ ] Hover only at `md:`; `active:` on phones; `focus-visible` ring on everything; exits faster than enters; only `transform`/`opacity` animated; reduced-motion respected.
- [ ] Phone: cards/list rows, not tables; desktop may use `Table`.
- [ ] Text ≥ 14px body, ≥ 12px captions; contrast ≥ 4.5:1.
- [ ] Icons from lucide with `aria-hidden` when decorative; icon-only buttons have `aria-label`.
