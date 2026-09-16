# Bookshop POS — Frontend

The user interface for a point-of-sale system built for a small bookshop — a React
application providing the cashier's billing screen and the admin back-office. It talks to
the Spring Boot backend over a REST API.

> For the full picture — what the project is, why it exists, and how the pieces fit
> together — see **[OVERVIEW.md](#)** in the backend repo. This README is about running and
> building the frontend specifically.

## Screens & features

- **Billing screen** — fast, scanner-driven checkout. Scan a barcode or search by name, add
  to the cart, take payment, complete the sale, and print a receipt. Keyboard-first so the
  cashier rarely needs the mouse.
  - Services (photocopy, printout) as one-tap buttons.
  - Open-price items prompt for a price at sale time.
  - Live receipt panel, with printing on completion.
  - Applied discounts shown on the line and receipt.
- **Admin back-office** (admin only):
  - **Products** — add / edit / deactivate, with category and supplier filtering and search.
  - **Receive stock** — record deliveries and adjustments (with reasons).
  - **Categories & Suppliers** — manage both.
  - **Discounts** — schedule percentage or fixed-amount discounts for a date range.
  - **Reports** — daily and weekly sales and profit, with day drill-down.
  - **Sales history** — browse and inspect past sales.
  - **Users** — manage staff accounts and roles.
- **Authentication** — login, forced password change on first login, and role-aware
  navigation (cashiers see only the billing screen).

## Tech stack

- **React** with **Vite**
- **Tailwind CSS** (dark theme)
- Session-cookie authentication against the backend API

## How it connects to the backend

All API calls use relative paths (e.g. `/api/products`) resolved against the current origin,
and send the session cookie with every request:

- **In development**, Vite's dev proxy forwards `/api/*` to the backend on
  `http://localhost:8080`.
- **In production**, the built app is served *by* the backend (same origin), so cookies and
  API calls work with no proxy or CORS setup.

## Running locally

Requires **Node.js**. The backend must be running separately.

```bash
npm install     # first time, or after cloning
npm run dev     # start the dev server
```

## Building for deployment

```bash
npm run build
```

Compiles the app into a `dist/` folder. For deployment, the contents of `dist/` are copied
into the backend's `src/main/resources/static/` so the backend serves the frontend and the
whole system runs as a single jar. See the backend repo for the full build-and-deploy steps.

## Related

- **Backend repo:** https://github.com/LahiruSandaruwan77/BookShop-POS-Backend
- **Project overview:** [OVERVIEW.md in the backend repo](#)

---

*A learning project — a bookshop POS built from scratch and running in a real shop.*
