---
name: Executive Command
colors:
  surface: '#001712'
  surface-dim: '#001712'
  surface-bright: '#243e37'
  surface-container-lowest: '#00110d'
  surface-container-low: '#04201a'
  surface-container: '#08241e'
  surface-container-high: '#142f28'
  surface-container-highest: '#1f3a33'
  on-surface: '#cbe9df'
  on-surface-variant: '#bbcac2'
  inverse-surface: '#cbe9df'
  inverse-on-surface: '#1b352e'
  outline: '#86948d'
  outline-variant: '#3d4a44'
  surface-tint: '#59dcb4'
  primary: '#61e3bb'
  on-primary: '#00382a'
  primary-container: '#3fc7a0'
  on-primary-container: '#004e3c'
  inverse-primary: '#006c53'
  secondary: '#e9c349'
  on-secondary: '#3c2f00'
  secondary-container: '#af8d11'
  on-secondary-container: '#342800'
  tertiary: '#9ddac0'
  on-tertiary: '#003829'
  tertiary-container: '#82bea5'
  on-tertiary-container: '#0b4e3b'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#78f9cf'
  primary-fixed-dim: '#59dcb4'
  on-primary-fixed: '#002117'
  on-primary-fixed-variant: '#00513e'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#b2f0d5'
  tertiary-fixed-dim: '#96d3ba'
  on-tertiary-fixed: '#002116'
  on-tertiary-fixed-variant: '#10503d'
  background: '#001712'
  on-background: '#cbe9df'
  surface-variant: '#1f3a33'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.08em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1440px
  gutter: 24px
  margin-desktop: 40px
  margin-mobile: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The design system is engineered for high-stakes enterprise workforce orchestration. It embodies a "Premium Executive Dashboard" aesthetic—merging the dense, data-rich utility of a Bloomberg Terminal with the refined, minimalist polish of Stripe. The target audience consists of C-suite executives and senior resource managers who require a calm, authoritative environment to manage global operations.

The visual style is **High-End Glassmorphism**. It utilizes deep obsidian-green layers, frosted surfaces, and precision gold accents to create a sense of digital luxury and unwavering reliability. Every interaction should feel intentional, frictionless, and high-fidelity.

## Colors
This design system utilizes a "Deep Emerald & Gold" palette to signify growth and prestige. 

- **The Foundation:** The background (#021D17) is a near-black green that provides a sophisticated base for light-emitting UI elements.
- **The Accents:** Emerald (#3FC7A0) is used for primary actions and "active" states, while Gold (#D4AF37) is reserved for high-value metrics, premium highlights, and trend indicators.
- **Status Colors:** Standard semantic colors (Success, Warning, Danger) are desaturated slightly to maintain the premium feel while ensuring immediate legibility.

### Two-Tone App Shell (both themes)

The portal shell is deliberately two-tone so the navigation frame and the work canvas never share a color:

| Zone | Dark theme | Light theme |
|------|-----------|-------------|
| Sidebar (`--sidebar-bg`) | `#00110d` | `#032F25` (always dark emerald, never white) |
| Content canvas (`--background`) | `#021D17` | `#F3F5F4` (soft grey — never pure white) |
| Cards / panels (`--glass-bg`, `--card-bg`) | `rgba(10,36,30,.75)` | `#FFFFFF` (pure white, pops off the grey canvas) |
| Top bar (`--surface-lowest`) | `#00110d` | `#FFFFFF` |

Sidebar text uses fixed white-alpha tokens (`.sidebar-text`, `.sidebar-link`, `.sidebar-link-active` in `globals.css`) — it never inherits theme text colors, because its background is dark in both themes. Active nav items use fixed emerald `#3FC7A0`.

### Light Theme Palette

- Canvas: `#F3F5F4` · Cards: `#FFFFFF` · Headings: `#0F1F1A` · Body: `#1C2B26` · Muted: `#5F6F69`
- Emerald accent (light): `#0A7A55` · Gold accent: `#D4AF37`
- Borders: `rgba(15,31,26,0.08)`

### Top Bar

Kept intentionally minimal: sidebar toggle + search pill on the left; bell, theme toggle, and user identity (avatar initials + name + portal role) on the right. No page titles, breadcrumbs, or status chips live in the top bar — page context belongs in the content header (title + greeting + month pill).

## Typography
The typography strategy balances modern executive appeal with technical precision. 

- **Manrope** is used for headlines to provide a warm yet professional tone.
- **Inter** serves as the workhorse for body text, ensuring maximum readability across complex forms and dashboards.
- **JetBrains Mono** is introduced for tabular data, IDs, and "Label Caps." This adds a layer of "fintech precision," making numbers and status labels feel engineered and accurate.

On mobile devices, headline sizes scale down significantly to maintain the "spacious" executive feel without overwhelming the smaller viewport.

## Layout & Spacing
This design system uses a **Fixed Grid** philosophy for the main dashboard to ensure content density remains manageable and "command-center" like. 

- **Desktop (1440px+):** A 12-column grid with 40px external margins and 24px gutters. Use generous padding inside cards (32px) to prevent data from feeling cramped.
- **Tablet (768px - 1439px):** Content reflows to an 8-column grid. Sidebars may collapse into an icon-only state.
- **Mobile (< 767px):** A 4-column grid with 16px margins. Components transition to vertical stacks.

Layout relies heavily on "Negative Space" to separate different work-streams, avoiding the use of heavy lines in favor of spatial grouping.

## Elevation & Depth
Depth is achieved through **Glassmorphism** and tonal layering rather than traditional drop shadows.

1.  **Level 0 (Base):** Background (#021D17).
2.  **Level 1 (Cards/Containers):** Surface (#0A241E) with a 1px stroke using a 10% opacity white to simulate a glass edge.
3.  **Level 2 (Floating/Modals):** Surfaces use a `backdrop-filter: blur(20px)` with a slightly lighter green tint and a subtle glow from the Emerald Accent.

Shadows, when used, are extremely soft and tinted with the Primary Dark Green (#032F25) to avoid a "dirty" look on the dark background.

## Shapes
The design system employs a refined roundedness strategy. A base value of **16px (1rem)** is used for all primary cards and dashboard containers, creating a modern, approachable feel. Smaller interactive elements like buttons and input fields utilize **8px (0.5rem)** to maintain a sense of precision. Status indicators and chips may use a "Pill" shape (full rounding) to differentiate them from actionable containers.

## Components
- **Sidebar:** Fixed left-hand navigation. Uses a glassmorphism effect (blur) over a subtle dark green gradient. Active states are indicated by a vertical Gold Accent bar on the left edge.
- **KPI Cards:** Large-format cards featuring a "Gold Trend" line chart or indicator. Value text should use Manrope Bold.
- **High-Fidelity Tables:** Rows should have a subtle hover state (#0A4D3A). Use JetBrains Mono for all numeric values to ensure column alignment. Cell padding should be 16px vertical for an airy feel.
- **Buttons:** 
  - *Primary:* Emerald background with dark text. 
  - *Secondary:* Ghost style with Gold border and Gold text.
  - *Tertiary:* Simple text with Gold underline on hover.
- **Input Fields:** Darker than the card background with a 1px Emerald border that glows (box-shadow) on focus.
- **Status Indicators:** Small circular dots. "Real-time" status uses a soft pulsing animation for the active state.

---

## Pages Directory

All routes in the GlobalSolutions Platform frontend. Live index: [`/pages`](http://localhost:3000/pages)

### 🌐 Public Routes

| Page | Route | File | Status | Description |
|------|-------|------|--------|-------------|
| Landing | `/` | `app/page.tsx` | ✅ Active | Hero entry point with feature cards, sign-in and Worker Portal CTAs, and a "View All Pages" dev link |
| Login | `/login` | `app/login/page.tsx` | ✅ Active | Role-based auth page with quick-fill buttons for Admin, Worker, and Leadership |
| Pages Index | `/pages` | `app/pages/page.tsx` | ✅ Active | Live directory of all routes grouped by role — links to every page |

### 🛡️ Admin Routes _(Role: Operations Lead)_

| Page | Route | File | Status | Description |
|------|-------|------|--------|-------------|
| Command Center | `/admin/command-center` | `app/admin/command-center/page.tsx` | ✅ Active | Top-level operations hub — live KPI tiles, worker status feed, system alerts, and quick actions |
| Workers | `/admin/workers` | `app/admin/workers/page.tsx` | ✅ Active | Worker database with search, filter, performance ratings, and per-worker audit trails |
| RDP Manager | `/admin/rdp` | `app/admin/rdp/page.tsx` | ✅ Active | RDP session board — assign, terminate, and monitor remote desktop connections |
| Audit Logs | `/admin/audit` | `app/admin/audit/page.tsx` | ✅ Active | Filterable event log — all system actions, login events, and configuration changes |
| Settings | `/admin/settings` | `app/admin/settings/page.tsx` | ✅ Active | System config — timezone, session limits, RDP gateway URL, notifications, and API keys |

### 👷 Worker Routes _(Role: System Worker)_

| Page | Route | File | Status | Description |
|------|-------|------|--------|-------------|
| Worker Portal | `/worker/portal` | `app/worker/portal/page.tsx` | ✅ Active | Personal console — session start/stop, daily task log, earnings snapshot, and RDP launcher |
| Schedule | `/worker/schedule` | `app/worker/schedule/page.tsx` | ✅ Active | Weekly availability scheduler — workers set and update their shift preferences |
| Leaderboard | `/worker/leaderboard` | `app/worker/leaderboard/page.tsx` | ✅ Active | Performance ranking by output, earnings, and quality score |

### 👔 Leadership Routes _(Role: Executive C-Suite)_

| Page | Route | File | Status | Description |
|------|-------|------|--------|-------------|
| Leadership Dashboard | `/leadership` | `app/leadership/page.tsx` | ✅ Active | C-suite command view — org-wide KPIs, headcount, revenue output, and strategic trend charts |
| Payroll Bridge | `/leadership/payroll` | `app/leadership/payroll/page.tsx` | ✅ Active | Payroll reconciliation and export — review cycle totals and push to external payment providers |

---

> **Status Key:** ✅ Active = fully implemented shell with UI · 🚧 Shell = route exists, placeholder content · ❌ Empty = not yet created
>
> **Adding a new page?** Update the table above, add the route to `app/pages/page.tsx`, and update the route count badge in `app/page.tsx`.