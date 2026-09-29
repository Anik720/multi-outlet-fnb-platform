# F&B HQ: Multi-Outlet Menu, Inventory & Sales Platform

A central HQ system for a food & beverage company with multiple outlets.

**Single company → multiple outlets → HQ assigns menu → outlets create sales → HQ sees reports.**

| HQ can… | Each outlet can… |
|---|---|
| Create and maintain the **master menu** | See **only the items assigned** to it, at its effective price |
| **Assign** menu items to specific outlets | Track and adjust **its own stock** (restock / wastage / correction) |
| **Override the price** per outlet | Ring up **multi-item sales** (POS), which deduct its stock |
| See **revenue by outlet** and **top 5 items per outlet** | Get **sequential, per-outlet receipt numbers** that stay correct under concurrency |

> 📐 Full architecture document (ERD, scaling plan, microservices, offline POS/KDS):
> **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

---

## Table of contents

- [Tech stack](#tech-stack)
- [Quick start (Docker)](#quick-start-docker)
- [Local development](#local-development)
- [Demo accounts](#demo-accounts)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [Database schema](#database-schema)
- [API endpoints](#api-endpoints)
- [How correctness is guaranteed](#how-correctness-is-guaranteed)
- [Testing](#testing)
- [Environment variables](#environment-variables)
- [Deployment](#deployment)
- [Scaling strategy](#scaling-strategy)

---

## Tech stack

| Area | Choice |
|---|---|
| Database | **PostgreSQL 17** |
| API | **Node.js 24 + Express 5 + TypeScript**, layered (routes → controllers → services → repositories) |
| Data access | **Prisma 7** (schema, migrations, type-safe queries) + **raw SQL via Prisma** where row locking, batch updates and window functions are needed |
| Validation | **zod** (request body / params / query, env config) |
| Auth | JWT (bearer) + bcrypt; roles `HQ_ADMIN`, `OUTLET_STAFF` |
| Frontend | **React 19 + Vite + TypeScript**, React Router, TanStack Query |
| Ops | Dockerfiles (multi-stage, non-root), docker-compose, nginx, pino structured logs, health/readiness probes |
| Tests | Vitest + Supertest integration tests against a real PostgreSQL (including concurrency tests) |

---

## Quick start (Docker)

Requirements: Docker Desktop.

```bash
docker compose up -d --build
```

| Service | URL |
|---|---|
| Web app (HQ console + outlet POS) | http://localhost:8080 |
| API (through nginx) | http://localhost:8080/api/v1 |
| Health | http://localhost:8080/health/ready |
| PostgreSQL | `localhost:5433` (user `fnb`, password `fnb_password`, db `fnb_hq`) |

On start-up the API container **applies migrations** (`prisma migrate deploy`) and **seeds demo data**
if the database is empty (`SEED_DEMO_DATA=true`): 3 outlets, 14 menu items, per-outlet prices and
stock, and ~90 sales spread over the last two weeks so the reports have something to show.

To override defaults, copy `.env.example` to `.env` next to `docker-compose.yml`.

---

## Local development

Requirements: Node.js ≥ 20 (24 recommended), Docker (for PostgreSQL).

```bash
# 1. Database only
docker compose up -d db

# 2. API  (http://localhost:4000)
cd backend
cp .env.example .env          # set JWT_SECRET to a long random string
npm install                   # also generates the Prisma client
npm run db:migrate            # prisma migrate deploy
npm run seed                  # demo data (only if the DB is empty)
npm run dev

# 3. Web  (http://localhost:5173, proxies /api to :4000)
cd ../frontend
npm install
npm run dev
```

Useful scripts (backend):

| Script | What it does |
|---|---|
| `npm run dev` | API with hot reload (tsx) |
| `npm test` | Integration test suite (needs the `db` container; uses a separate `fnb_hq_test` database) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:migrate` | Apply migrations |
| `npm run db:migrate:dev` | Create a new migration from `schema.prisma` changes |
| `npm run db:studio` | Prisma Studio |
| `npm run seed:reset` | Wipe and re-seed demo data (refuses in production) |

The test database is created once with:

```bash
docker compose exec db psql -U fnb -d fnb_hq -c "CREATE DATABASE fnb_hq_test"
```

---

## Demo accounts

Password for all accounts: **`Password123!`** (the login page has one-click buttons).

| Email | Role | Sees |
|---|---|---|
| `hq@fnb.test` | HQ admin | Dashboard, master menu, all outlets (assignments, prices, stock, sales, test POS) |
| `gulshan@fnb.test` | Outlet staff | POS, inventory and sales of **Gulshan Flagship** (`DHK-GUL`) only |
| `dhanmondi@fnb.test` | Outlet staff | **Dhanmondi Lake View** (`DHK-DHN`) only |
| `agrabad@fnb.test` | Outlet staff | **Agrabad Express** (`CTG-AGR`) only |

---

## Project structure

```
.
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma            # data model (source of truth for the ORM)
│   │   └── migrations/              # SQL migrations (+ hand-written CHECKs, triggers, indexes)
│   ├── src/
│   │   ├── config/                  # env validation (zod), logger
│   │   ├── db/                      # Prisma client + transaction helper, seed
│   │   ├── routes/                  # URL → middleware chain → controller
│   │   ├── controllers/             # HTTP in/out only
│   │   ├── services/                # business rules, transactions
│   │   ├── repositories/            # data access (Prisma + raw SQL)
│   │   ├── validators/              # zod request schemas (+ inferred TS types)
│   │   ├── middlewares/             # auth, tenant guard, validation, error handler
│   │   ├── mappers/                 # DB rows → API DTOs
│   │   ├── utils/                   # errors, money (cents), pagination, db error mapping
│   │   ├── app.ts                   # express app factory (used by server + tests)
│   │   └── server.ts                # bootstrap + graceful shutdown
│   ├── tests/                       # integration tests (Vitest + Supertest, real Postgres)
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/                     # typed API client + endpoints
│   │   ├── auth/                    # auth context (JWT)
│   │   ├── components/              # layout, UI primitives, revenue chart
│   │   └── pages/
│   │       ├── hq/                  # dashboard, master menu, outlets, outlet detail
│   │       └── outlet/              # POS, inventory, sales
│   ├── nginx.conf                   # SPA + /api reverse proxy
│   └── Dockerfile
├── docs/ARCHITECTURE.md             # ERD, scaling plan, microservices, offline POS
├── docker-compose.yml
└── render.yaml                      # one-click cloud deploy blueprint
```

---

## Architecture

```
HTTP ─▶ routes ─▶ middlewares ─▶ controllers ─▶ services ─▶ repositories ─▶ PostgreSQL
         (URL)    auth · role ·   (HTTP only)    (business    (Prisma +
                  tenant guard ·                  rules, tx)   raw SQL)
                  zod validation
                                      errors ─▶ central error middleware ─▶ { error: { code, message, details, requestId } }
```

- **Routes** declare the middleware chain per endpoint: `authenticate` → `requireRole` / `authorizeOutlet`
  → `validate({ params, query, body })` → controller.
- **Controllers** are thin: they read `req.valid` (already validated and coerced) and call one service.
- **Services** own business rules and transaction boundaries (`withTransaction`), and throw typed
  `AppError`s (`NOT_FOUND`, `INSUFFICIENT_STOCK`, `ITEM_NOT_ASSIGNED`, …).
- **Repositories** are the only code that talks to the database. They accept an optional transaction
  client, so services can compose several repository calls into one transaction.
- **Error middleware** maps `AppError`s, malformed JSON, and PostgreSQL constraint violations
  (unique / FK / CHECK / deadlock) to proper 4xx/5xx responses with a request id. Unknown errors → 500
  without leaking internals in production.
- **Tenant isolation** is enforced server-side: staff tokens carry their `outletId`, and every
  `/outlets/:outletId/**` route rejects other outlets with 403.

**Why Prisma + raw SQL?** Prisma gives the schema/migration workflow and type-safe CRUD. The
checkout path needs `SELECT … FOR UPDATE` with a deterministic lock order, a set-based guarded stock
`UPDATE … FROM unnest(…)`, and an atomic `INSERT … ON CONFLICT … RETURNING` counter; reports need window
functions. Those are written as parameterised raw SQL (`$queryRaw` tagged templates, so no injection risk)
inside the repository layer. Prisma can't express CHECK constraints or expression indexes, so those are
added by hand to the migration SQL. `prisma migrate diff` confirms that schema and database have no drift.

More detail, including diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#1-system-overview).

---

## Database schema

Full ERD with every column and constraint: **[docs/ARCHITECTURE.md → ERD](docs/ARCHITECTURE.md#2-erd-database-schema-and-relationships)**.

| Table | Purpose | Notable constraints |
|---|---|---|
| `outlets` | Outlets of the company | `code` unique + format CHECK (used as receipt prefix, immutable) |
| `users` | HQ admins and outlet staff | unique `lower(email)`; CHECK: staff ⇔ `outlet_id` set |
| `menu_items` | HQ master menu | `sku` unique; `base_price >= 0` |
| `outlet_menu_items` | Which items an outlet sells + `price_override` | PK `(outlet_id, menu_item_id)`; override `>= 0` |
| `inventory` | Stock per outlet per assigned item | composite FK → `outlet_menu_items`; **`CHECK (quantity >= 0)`** |
| `outlet_receipt_counters` | Per-outlet receipt sequence | one row per outlet; incremented inside the sale transaction |
| `sales` | Sale header | unique `(outlet_id, receipt_seq)`, unique `receipt_number`, unique `(outlet_id, idempotency_key)` |
| `sale_items` | Sale lines with price/name snapshots | unique `(sale_id, menu_item_id)`; `quantity > 0` |
| `inventory_movements` | Append-only stock ledger | reason enum; `quantity_after >= 0` |

- **Effective price** = `COALESCE(outlet_menu_items.price_override, menu_items.base_price)`, resolved
  **server-side** at checkout; clients never send prices.
- **Money** is `NUMERIC(12,2)` in the DB and integer cents in code; there is no floating-point arithmetic.
- **Indexes** cover every frequent query: outlet menu, stock lookups, sales history per outlet
  (`(outlet_id, created_at DESC)`), date-range reports (`created_at`), top-items joins, ledger history.
  See the [index table](docs/ARCHITECTURE.md#indexes-and-the-queries-they-serve).

---

