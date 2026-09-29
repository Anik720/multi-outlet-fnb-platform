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

