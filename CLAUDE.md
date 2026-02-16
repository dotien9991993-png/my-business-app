# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Hoang Nam Audio** — a multi-tenant ERP/business management PWA for a Vietnamese audio equipment company. The UI, comments, status labels, and business logic are all in Vietnamese.

## Commands

```bash
npm run dev       # Start Vite dev server (HMR)
npm run build     # Production build → dist/
npm run lint      # ESLint
npm run preview   # Preview production build
```

No test framework is configured.

## Tech Stack

- **React 19** (JSX, no TypeScript) with **rolldown-vite** (aliased as vite via npm overrides)
- **Tailwind CSS 3** for styling
- **Supabase** (`@supabase/supabase-js`) for database, realtime subscriptions, and storage
- **Recharts** for charts
- ES Modules (`"type": "module"`)

## Architecture

### Monolithic single-file app

The entire application (~13,000 lines) lives in `src/App.jsx`. There is no component splitting into separate files. All sub-views (30+ components like `TasksView`, `CalendarView`, `WarehouseInventoryView`, etc.) are defined as functions inside the main `SimpleMarketingSystem` component and access state via closure.

`SalaryManagement` is the only component defined outside the main component (lines ~123-1096).

### Routing

Custom hash-based routing via the `useHashRouter` hook (no React Router). URL pattern: `#module/tab`. The `navigateTo(module, tab)` function updates `activeModule` and `activeTab` state.

### State management

All state is managed via ~50+ `useState` hooks in `SimpleMarketingSystem`. No external state library. `useMemo` for derived data, `useCallback` for navigation.

### Modules

| Module | Key tabs | Purpose |
|--------|----------|---------|
| `media` | mytasks, dashboard, tasks, calendar, report | Video production task management |
| `warehouse` | inventory, import, export, history | Product inventory & stock transactions |
| `sales` | orders, customers, products, report | Sales & customers (partially placeholder) |
| `technical` | today, calendar, jobs, wages, summary | Job scheduling, technician wages |
| `finance` | dashboard, receipts, debts, attendance, salaries, reports | Receipts/payments, debt, salary |

### Multi-tenancy & Auth

- Tenant resolved from subdomain via `getTenantSlug()` (supports `.hoangnamaudio.vn` and `.vercel.app`)
- Custom auth (NOT Supabase Auth) — plaintext password comparison against `users` table
- Session stored in `localStorage` with tenant-slug-prefixed keys (`${slug}_user`, `${slug}_loggedIn`)
- All queries scoped with `.eq('tenant_id', tenant.id)`

### Permission system

3-level per-module permissions (0=none, 1=own data, 2=view all, 3=full CRUD). Admin role bypasses all checks. Optional `allowed_tabs` restricts sub-tab access. Key helpers: `canAccessModule()`, `canAccessTab()`, `hasPermission()`, `filterByPermission()`.

### Realtime

Supabase Realtime subscriptions on channels: `tasks-changes`, `jobs-changes`, `finance-changes`, `warehouse-changes`, `notifications-realtime`. Data also refreshes on page visibility/focus changes.

## Key Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | Entire application (all components, logic, views) |
| `src/supabaseClient.js` | Supabase client init (the one used by App.jsx) |
| `src/lib/supabase.js` | Duplicate Supabase client (unused) |
| `src/main.jsx` | Entry point: renders `<App />` |
| `public/manifest.json` | PWA manifest |

## Conventions

- **Vietnamese throughout**: UI text, comments, status labels, variable names
- **Vietnam timezone**: All dates use `Asia/Ho_Chi_Minh` (UTC+7) via helper functions (`getVietnamDate`, `getTodayVN`, `getNowISOVN`)
- **Currency**: VND formatted with `Intl.NumberFormat('vi-VN')` plus `đ` suffix via `formatMoney()`
- **Direct Supabase queries**: No data access layer — queries are inline in component functions
- **Inline SVGs + emoji icons**: Icons are either inline SVG or emoji characters
- **Green color scheme**: Primary color is `green-600/700/800`

## Environment Variables

Required in `.env.local`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## ESLint Config

Flat config (`eslint.config.js`). `no-unused-vars` ignores variables starting with uppercase or underscore (`varsIgnorePattern: '^[A-Z_]'`).
