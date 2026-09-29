# Architecture Documentation

> F&B HQ / multi-outlet platform: HQ owns the master menu, assigns items to outlets
> with optional price overrides, and monitors sales. Outlets sell, deduct their own
> stock and issue their own sequential receipts.

**Contents**

1. [System overview](#1-system-overview)
2. [ERD: database schema and relationships](#2-erd-database-schema-and-relationships)
3. [Critical flow: creating a sale](#3-critical-flow-creating-a-sale)
4. [Scaling plan: 10 outlets, 100,000 transactions/month](#4-scaling-plan-10-outlets-100000-transactionsmonth)
5. [Evolving to microservices](#5-evolving-to-microservices)
6. [Offline POS mode strategy (POS + KDS)](#6-offline-pos-mode-strategy-pos--kds)

---

## 1. System overview

```mermaid
flowchart LR
    subgraph Clients
        HQ[HQ Console<br/>React SPA]
        POS[Outlet POS<br/>React SPA]
    end

    subgraph Edge
        NGINX[nginx<br/>static files + /api reverse proxy]
    end

    subgraph API["API (Node.js / Express, stateless)"]
        R[routes] --> C[controllers] --> S[services] --> REPO[repositories]
        MW[middleware: auth · tenant guard · validation · errors · logging]
    end

    DB[(PostgreSQL)]

    HQ --> NGINX
    POS --> NGINX
    NGINX --> API
    REPO --> DB
```

| Layer | Responsibility | Knows about HTTP? | Knows about SQL? |
|---|---|---|---|
| **routes** | URL + method → middleware chain (auth, role, tenant guard, validation) → controller | yes | no |
| **controllers** | Read validated input from `req.valid`, call one service, shape the HTTP response (status, headers) | yes | no |
| **services** | Business rules, transactions, orchestration of repositories, domain errors | no | no |
| **repositories** | All data access (Prisma queries + raw SQL where locking/window functions are needed) | no | yes |
| **validators** | zod schemas; the single source of truth for request shapes and TS types | – | – |
| **mappers** | DB rows → API DTOs (Decimal → number, BigInt → number, hide password hashes) | – | – |

**Cross-cutting concerns:** env config validated at boot (fail fast) · structured JSON logs (pino) with a request id
propagated from nginx · helmet security headers · CORS allow-list · rate-limited login · centralised error
middleware that turns domain errors *and* DB constraint violations into consistent `{ error: { code, message,
details, requestId } }` responses · liveness/readiness probes · graceful shutdown.

**Security model:** JWT bearer tokens. `HQ_ADMIN` can reach everything. `OUTLET_STAFF` is bound to one
outlet (`users.outlet_id`, enforced by a CHECK). The `authorizeOutlet` middleware rejects any
`/outlets/:outletId/**` request for another outlet, so **tenant isolation is enforced server-side**, not by the UI.

---

## 2. ERD: database schema and relationships

```mermaid
erDiagram
    OUTLETS ||--o{ USERS : "employs (staff only)"
    OUTLETS ||--o{ OUTLET_MENU_ITEMS : "sells"
    MENU_ITEMS ||--o{ OUTLET_MENU_ITEMS : "assigned to"
    OUTLET_MENU_ITEMS ||--|| INVENTORY : "has stock"
    OUTLETS ||--|| OUTLET_RECEIPT_COUNTERS : "numbers receipts with"
    OUTLETS ||--o{ SALES : "records"
    USERS ||--o{ SALES : "rings up"
    SALES ||--|{ SALE_ITEMS : "contains"
    MENU_ITEMS ||--o{ SALE_ITEMS : "sold as"
    OUTLETS ||--o{ INVENTORY_MOVEMENTS : "ledger"
    MENU_ITEMS ||--o{ INVENTORY_MOVEMENTS : "ledger"
    SALES ||--o{ INVENTORY_MOVEMENTS : "caused"

    OUTLETS {
        uuid id PK
        varchar code UK "CHECK ^[A-Z0-9-]{2,20}$, receipt prefix"
        varchar name
        text address
        bool is_active
        timestamptz created_at
        timestamptz updated_at
    }
    USERS {
        uuid id PK
        varchar email UK "unique on lower(email)"
        text password_hash "bcrypt"
        varchar full_name
        enum role "HQ_ADMIN | OUTLET_STAFF"
        uuid outlet_id FK "NULL for HQ, required for staff (CHECK)"
        bool is_active
    }
    MENU_ITEMS {
        uuid id PK
        varchar sku UK
        varchar name
        text description
        varchar category "indexed"
        numeric base_price "CHECK >= 0"
        bool is_active
    }
    OUTLET_MENU_ITEMS {
        uuid outlet_id PK,FK
        uuid menu_item_id PK,FK
        numeric price_override "NULL = use base_price, CHECK >= 0"
        bool is_available
    }
    INVENTORY {
        uuid outlet_id PK,FK
        uuid menu_item_id PK,FK "composite FK -> outlet_menu_items"
        int quantity "CHECK >= 0"
        timestamptz updated_at
    }
    OUTLET_RECEIPT_COUNTERS {
        uuid outlet_id PK,FK
        bigint last_value "CHECK >= 0"
    }
    SALES {
        uuid id PK
        uuid outlet_id FK
        bigint receipt_seq "UNIQUE (outlet_id, receipt_seq)"
        varchar receipt_number UK "e.g. DHK-GUL-00000042"
        varchar idempotency_key "UNIQUE (outlet_id, idempotency_key)"
        int item_count "CHECK > 0"
        numeric total_amount "CHECK >= 0"
        uuid created_by FK
        timestamptz client_created_at "when the POS rang it up (offline)"
        timestamptz created_at
    }
    SALE_ITEMS {
        bigint id PK
        uuid sale_id FK
        uuid menu_item_id FK "UNIQUE (sale_id, menu_item_id)"
        varchar item_name "snapshot"
        numeric unit_price "snapshot of effective price"
        int quantity "CHECK > 0"
        numeric line_total
    }
    INVENTORY_MOVEMENTS {
        bigint id PK
        uuid outlet_id FK
        uuid menu_item_id FK
        int change "CHECK <> 0"
        int quantity_after "CHECK >= 0"
        enum reason "RESTOCK | ADJUSTMENT | WASTAGE | SALE"
        uuid sale_id FK
        text note
        uuid created_by FK
        timestamptz created_at
    }
```

### Key design decisions

| Decision | Why |
|---|---|
| **`outlet_menu_items` join table with nullable `price_override`** | Many-to-many between outlets and the master menu. `effective_price = COALESCE(price_override, base_price)`, so a change to the HQ base price automatically flows to every outlet that hasn't overridden it. |
| **`inventory` separate from `outlet_menu_items`** | Stock rows are the hottest rows in the system (updated on every sale). Keeping them apart from menu configuration means a price change never contends with checkout locks. |
| **Composite FK `inventory → outlet_menu_items`** | Stock *cannot exist* for an item that isn't assigned to the outlet; unassigning cascades the stock row away. The rule lives in the schema, not only in code. |
| **`CHECK (quantity >= 0)`** | Negative stock is impossible even if a future code path forgets the application-level guard. |
| **Receipt counter table (not a `SEQUENCE`)** | PostgreSQL sequences are non-transactional: a rolled-back sale would burn a number and leave a **gap**. A counter row updated *inside* the sale transaction is gap-free, per outlet, and rolls back with the sale. |
| **`UNIQUE (outlet_id, receipt_seq)` + `UNIQUE (receipt_number)`** | Belt-and-braces: even a bug could never issue a duplicate receipt. |
| **`UNIQUE (outlet_id, idempotency_key)`** | Makes `POST /sales` safely retryable (network timeouts, offline POS replay). |
| **Price + name snapshot on `sale_items`** | Historical sales and reports stay correct after menu prices or names change. |
| **`inventory_movements` ledger** | Every stock change (sale, restock, wastage, correction) is auditable; stock can be reconciled from the ledger. |
| **NUMERIC(12,2) for money, integer cents in code** | No floating-point rounding errors anywhere. |
| **UUID primary keys (`gen_random_uuid()`)** | Non-guessable ids in URLs; ids can be generated by clients/offline devices and merged without collisions. |

### Indexes and the queries they serve

| Index | Serves |
|---|---|
| `outlet_menu_items (outlet_id, menu_item_id)` PK | "menu for outlet X" (the most frequent read) |
| `outlet_menu_items (menu_item_id)` | "which outlets sell item Y", FK checks on `menu_items` |
| `inventory (outlet_id, menu_item_id)` PK | stock lookups + `SELECT … FOR UPDATE` at checkout |
| `sales (outlet_id, created_at DESC)` | outlet sales history (paginated), outlet-scoped reports |
| `sales (created_at)` | company-wide date-range reports |
| `sale_items (sale_id, menu_item_id)` unique | loading a sale's lines; the join in top-items reports |
| `sale_items (menu_item_id)` | per-item sales analysis, FK checks |
| `inventory_movements (outlet_id, menu_item_id, created_at DESC)` | stock history per outlet/item |
| `inventory_movements (sale_id)` | ledger entries for a sale |
| `users (lower(email))` unique | case-insensitive login lookup |
| `users (outlet_id)`, `menu_items (category)`, `outlets (code)`, `menu_items (sku)` | filters + FK checks |

---

## 3. Critical flow: creating a sale

```mermaid
sequenceDiagram
    autonumber
    participant POS
    participant API as API (sale.service)
    participant DB as PostgreSQL

    POS->>API: POST /outlets/:id/sales<br/>Idempotency-Key: pos-7f3c…
    API->>DB: SELECT sale WHERE (outlet, idempotency_key)
    alt already processed
        API-->>POS: 200 original sale (Idempotent-Replayed: true)
    end
    API->>DB: BEGIN
    API->>DB: SELECT inventory … ORDER BY menu_item_id FOR UPDATE
    Note over API,DB: row locks taken in a fixed order → no deadlocks
    API->>API: validate: assigned? available? enough stock?<br/>resolve effective prices server-side
    API->>DB: UPDATE inventory SET quantity = quantity - d.qty<br/>FROM unnest(ids, qtys) WHERE quantity >= d.qty
    API->>DB: INSERT … ON CONFLICT DO UPDATE last_value = last_value + 1<br/>RETURNING last_value (receipt counter, row-locked)
    API->>DB: INSERT sales, sale_items, inventory_movements
    API->>DB: COMMIT
    API-->>POS: 201 { receiptNumber: "DHK-GUL-00000042", … }
```

**Why it is correct under concurrency**

* **No overselling:** concurrent sales of the same item serialise on the inventory row lock. The second
  transaction re-reads the *committed* quantity after the first commits (READ COMMITTED + `FOR UPDATE`), so
  it sees the real remaining stock. The guarded `UPDATE … WHERE quantity >= qty` and the CHECK constraint are
  two more independent safety nets.
* **Sequential, unique, gap-free receipts per outlet:** the counter row is locked until COMMIT/ROLLBACK, so
  only one transaction per outlet holds "the next number" at a time; a failed sale rolls its number back.
  Different outlets have different counter rows and never block each other. The lock is taken *last* to keep
  the per-outlet critical section as short as possible.
* **No deadlocks:** every transaction locks inventory rows in `menu_item_id` order, then the counter.
  A consistent global lock order makes lock cycles impossible.
* **All-or-nothing:** one DB transaction; any error rolls back stock, receipt number, sale and ledger.
* **Retry-safe:** idempotency key pre-check + unique constraint. If two identical requests race, the loser's
  unique violation is caught and the winner's sale is returned.

These properties are **verified by integration tests** against a real PostgreSQL
(`backend/tests/sales.test.ts`): 30 parallel requests against stock 10 → exactly 10 sales, receipts
1..10, stock 0; two outlets selling concurrently keep independent gap-free sequences; 8 concurrent
requests with the same idempotency key → exactly one sale; opposite-order carts → no deadlock.

---

## 4. Scaling plan: 10 outlets, 100,000 transactions/month

### 4.1 Sizing the problem

| Metric | Estimate |
|---|---|
| Transactions / month | 100,000 |
| Average | ≈ 3,300 / day ≈ **0.04 TPS** |
| Peak (lunch/dinner: ~15% of a day's sales in the busiest hour, ×3 safety) | ≈ 500 / hour ≈ **0.4 TPS** |
| Sale items (≈ 3 lines / sale) | ≈ 300k rows / month → **3.6M rows / year** |
| Inventory movements | ≈ 3.6M rows / year |
| Storage (sales + items + ledger, with indexes) | ≈ 2–3 GB / year |

**Conclusion:** this is a modest OLTP load. A single, well-indexed PostgreSQL instance handles it with
headroom of two or more orders of magnitude. The current design (stateless API, row-level locks scoped
per outlet, per-outlet counters) already avoids global hot spots. The work is mostly about **reliability,
reporting efficiency and operability**, not raw throughput. The plan below is staged so each step is taken
when a metric says so, not up front.

### 4.2 Database scaling strategies

| Stage | Action | Trigger |
|---|---|---|
| 1 | **Managed PostgreSQL** (RDS / Cloud SQL / Neon) with automated backups, PITR, Multi-AZ standby for failover | Day 1 in production |
| 2 | **Connection pooling** with PgBouncer (transaction mode) or RDS Proxy; small per-instance pools in the app | > 3–4 API instances, or serverless API |
| 3 | **Read replica** for reporting and HQ dashboards; the app gets a separate read-only Prisma client | Reports noticeably load the primary (p95 checkout latency rises during report runs) |
| 4 | **Partition `sales`, `sale_items`, `inventory_movements` by month** (declarative range partitioning on `created_at`) | ~50M+ rows, or when retention/archival is needed; old partitions detach to cheap storage |
| 5 | **Archive cold data** (> 2 years) to object storage (Parquet) queried via the warehouse | Storage cost / backup time |
| – | Keep: row-level locks per outlet (no table locks), short transactions, `EXPLAIN ANALYZE` on every new report query, `pg_stat_statements` to find slow queries | Always |

Sharding is **not** needed at this scale. If it ever were (hundreds of outlets, multiple countries),
`outlet_id` is the natural shard key: every write transaction is already scoped to one outlet.

### 4.3 Reporting performance considerations

The current reports aggregate raw `sales`/`sale_items` on each request. That's fine for thousands of rows
per outlet and for the seeded data, but the cost grows linearly with history. The plan:

1. **Pre-aggregated rollup table** `daily_outlet_item_sales (date, outlet_id, menu_item_id, qty, revenue,
   txn_count)`, maintained **incrementally** (upsert in the sale transaction or from an outbox consumer).
   "Revenue by outlet" and "top 5 items" then read ~10 outlets × ~50 items × N days, which stays small no
   matter how many transactions there are. (A materialized view refreshed `CONCURRENTLY` every few minutes
   is the simpler first step.)
2. **Hybrid freshness:** rollups for closed days + live query for *today only* → real-time dashboards at
   constant cost.
3. **Serve reports from the read replica** so a heavy HQ query can never slow down a checkout.
4. **Cache** hot dashboard queries in Redis for 30–60s, keyed by (report, range); invalidated or simply
   left to expire.
5. **Covering indexes** where plans show heap fetches, e.g. `sales (outlet_id, created_at) INCLUDE
   (total_amount)` for revenue-by-outlet as an index-only scan.
6. **Analytics beyond operational reports** (cohorts, basket analysis, forecasting) go to a warehouse
   (BigQuery / Redshift / ClickHouse) fed by CDC (Debezium) or nightly exports. OLAP never runs on the
   OLTP primary.
7. **Time zones:** aggregate by outlet-local business day (store an `outlet.timezone`, compute
   `business_date` at write time) so "today's sales" matches the outlet's day, not UTC.

### 4.4 Infrastructure considerations

```mermaid
flowchart LR
    U[Browsers / POS terminals] --> CDN[CDN<br/>static SPA]
    U --> LB[Load balancer / API gateway<br/>TLS, WAF, rate limiting]
    LB --> A1[API container 1]
    LB --> A2[API container 2]
    A1 & A2 --> PGB[PgBouncer]
    PGB --> P[(Postgres primary)]
    P -. streaming replication .-> RR[(Read replica<br/>reports)]
    A1 & A2 --> RED[(Redis<br/>cache, rate-limit store)]
    A1 & A2 --> OBS[Logs · metrics · traces]
```

* **Stateless API containers** (already true: JWT auth, no in-memory session) behind a load balancer on
  ECS Fargate / Cloud Run / Kubernetes; autoscale on CPU and p95 latency; minimum 2 instances across AZs.
* **Frontend on a CDN** (S3 + CloudFront / Netlify): static, cached, globally fast.
* **CI/CD:** lint → typecheck → tests against a real Postgres service container → build image → run
  `prisma migrate deploy` as a one-off release job → rolling / blue-green deploy. Migrations are written
  expand-then-contract so old and new versions can run side by side.
* **Secrets** in a secrets manager (not env files); `JWT_SECRET` rotation via key ids.
* **Observability:** structured logs with request ids (already emitted) shipped to a log platform; RED
  metrics (rate, errors, duration) per endpoint; OpenTelemetry tracing; alerts on checkout error rate,
  p95 latency, DB connections, replication lag, and `INSUFFICIENT_STOCK` spikes (a business signal).
* **Reliability:** health/readiness probes (already implemented), graceful shutdown (already implemented),
  PITR backups with regular restore drills, documented RPO/RTO.
* **Security:** TLS everywhere, WAF, per-user rate limiting, audit log for HQ actions (price changes,
  assignments), refresh tokens with short-lived access tokens, and optional SSO for HQ staff.

### 4.5 Architectural evolution

1. **Now: modular monolith.** Layers are already separated and modules are cohesive (catalog, outlet
   menu, inventory, sales, reporting). This is the right shape for this load and team size.
2. **Transactional outbox.** Write `sale.completed` / `stock.adjusted` events to an `outbox` table in the
   same transaction as the sale; a relay publishes them to a queue (SQS/SNS, RabbitMQ, or Kafka). This
   decouples side effects (rollups, notifications, loyalty, KDS, accounting export) without
   dual-write bugs.
3. **Async projections.** Reporting rollups, low-stock alerts and the warehouse feed become consumers
   of those events.
4. **Extract services where boundaries are proven** (see §5), starting with reporting, the one that
   benefits most from independent scaling and storage.
5. **Offline-first POS** at the edge (see §6), which also improves resilience at every scale.

---

## 5. Evolving to microservices

### 5.1 Guiding principle

Split along **business capabilities with clear data ownership**, and only when there is a concrete reason:
independent scaling, independent release cadence, a different team, or a different storage/consistency
model. The current layering (routes → controllers → services → repositories) and module boundaries are
deliberately the seams along which services would be cut.

### 5.2 Proposed services

```mermaid
flowchart TB
    GW[API Gateway / BFF<br/>auth, routing, rate limits]

    subgraph Core
        ID[Identity & Access<br/>users, roles, JWT/SSO]
        CAT[Catalog Service<br/>master menu, outlet assignment, pricing]
        INV[Inventory Service<br/>stock per outlet, ledger, reservations]
        ORD[Sales / Order Service<br/>checkout, receipts, idempotency]
    end

    subgraph Async
        BUS{{Event bus<br/>Kafka / SNS+SQS}}
        REP[Reporting Service<br/>rollups, dashboards]
        NOTIF[Notification Service<br/>low stock, alerts]
        SYNC[POS Sync Service<br/>offline batches]
    end

    GW --> ID & CAT & INV & ORD & REP & SYNC
    ORD -- "reserve/commit stock (sync)" --> INV
    ORD -- "price & availability (sync, cached)" --> CAT
    ORD -- sale.completed --> BUS
    INV -- stock.low / stock.adjusted --> BUS
    CAT -- menu.updated / price.changed --> BUS
    BUS --> REP & NOTIF & INV
    SYNC --> ORD
```

| Service | Owns (its own DB/schema) | Why separate |
|---|---|---|
| **Identity & Access** | users, roles, outlet membership, sessions | Security-sensitive, reused by every service; SSO/MFA evolve independently |
| **Catalog** | menu_items, outlet_menu_items (prices, availability) | Read-heavy, rarely written, highly cacheable; HQ's domain; publishes `menu.updated` so outlets/POS can cache menus |
| **Inventory** | inventory, inventory_movements | The contention hot spot; may later add recipes/ingredients, suppliers, purchase orders, which is a large domain of its own |
| **Sales / Order** | sales, sale_items, receipt counters, idempotency keys | The critical write path; scales with transaction volume; strongest consistency needs |
| **Reporting** | read-optimised projections (rollups, warehouse) | Completely different access pattern (OLAP), scales independently, must never slow checkout |
| **POS Sync** | device registry, sync cursors, batch status | Handles offline replay, device auth and conflicts (see §6) |
| **Notification** | templates, delivery log | Pure event consumer |

### 5.3 The hard part: consistency across services

In the monolith, "deduct stock + issue receipt + record sale" is one ACID transaction. Across services
it becomes a **saga**:

1. Order service creates the sale as `PENDING` and calls Inventory `reserve(items, saleId)`
   (idempotent, keyed by saleId).
2. On success → Order allocates the receipt number (still a local per-outlet counter), marks the sale
   `COMPLETED`, and publishes `sale.completed` through its **outbox**.
3. Inventory consumes `sale.completed` and converts the reservation to a deduction; on `sale.failed` or a
   reservation timeout it releases stock (**compensation**).

Supporting patterns: transactional outbox + idempotent consumers (at-least-once delivery), correlation ids
across services, contract-tested APIs, schema-versioned events.

### 5.4 Migration path (strangler fig)

1. Enforce module boundaries inside the monolith (no cross-module table access; modules talk through
   service interfaces). The layered code already mostly does this.
2. Introduce the outbox + event bus while still a monolith.
3. Extract **Reporting** first: read-only, event-fed, lowest risk, highest benefit.
4. Extract **Catalog** (read-mostly, simple consistency).
5. Extract **Inventory + Order** last, together with the saga, only if scale or team structure demands it.

**Honest trade-off:** at 10 outlets and 100k transactions/month, a well-structured modular monolith is
cheaper to run, simpler to operate and *more* consistent. Microservices should be adopted incrementally,
when organisational or scaling pressure actually appears.

---

## 6. Offline POS mode strategy (POS + KDS)

### 6.1 Goals

* An outlet keeps **taking orders, printing receipts and cooking** with no internet.
* When connectivity returns, every offline sale reaches HQ **exactly once**, in order, with stock and
  reports reconciled.
* POS and Kitchen Display System (KDS) keep talking to each other on the **local network** throughout.

### 6.2 Outlet edge architecture

```mermaid
flowchart LR
    subgraph Outlet["Outlet LAN (works without internet)"]
        P1[POS terminal 1<br/>local DB: SQLite/IndexedDB]
        P2[POS terminal 2]
        HUB[Outlet Edge Hub<br/>mini-PC or primary POS<br/>local Postgres/SQLite + message broker<br/>MQTT / WebSocket]
        KDS1[KDS - Grill]
        KDS2[KDS - Drinks]
        PR[Receipt printer]
    end
    CLOUD[(HQ Cloud API)]

    P1 <-- orders / status --> HUB
    P2 <-- orders / status --> HUB
    HUB <-- tickets / bump events --> KDS1
    HUB <-- tickets / bump events --> KDS2
    P1 --> PR
    HUB <-. "sync when online<br/>(outbox upload, menu/stock download)" .-> CLOUD
```

* **Local-first POS:** every terminal has its own durable store (SQLite in a native/Electron app,
  IndexedDB in a PWA). The UI always writes locally first; the network is never on the critical path of
  ringing up a sale.
* **Outlet Edge Hub:** a small always-on device (or the primary POS) running a local database and a
  lightweight message broker (MQTT such as Mosquitto, or a WebSocket server). It is the outlet's source
  of truth while offline and the single sync gateway to HQ.
* **Service discovery on the LAN** via mDNS or a fixed local IP, so terminals and KDS find the hub
  without internet or cloud DNS.

### 6.3 POS ↔ KDS communication while offline

1. POS creates an order → publishes `order.created` to the hub topic `outlet/{id}/kitchen` (MQTT QoS 1,
   persistent session), or directly on the LAN WebSocket.
2. The hub routes items to the right station (grill, drinks) using station mappings from the **cached
   menu**; each KDS subscribes to its station topic.
3. The KDS shows the ticket; cooks publish `item.started` / `order.bumped` back; POS updates order status
   in real time.
4. **Reliability:** QoS 1 (at-least-once) plus idempotent handlers keyed by `orderId` + event id; a KDS
   that reconnects replays missed messages from its persistent session; each device also keeps a local
   copy of open tickets, so a hub reboot doesn't lose the kitchen queue.
5. **Hub failure fallback:** POS can print kitchen chit tickets on a local printer, and terminals can
   fail over to peer-to-peer WebSocket with a designated backup hub.

Nothing in this loop touches the internet, so kitchen operations are identical online and offline.

### 6.4 Offline sales and receipt numbers

* Each sale gets a **client-generated UUID** (`saleId`), which doubles as the **Idempotency-Key**. It is
  created once, stored with the sale, and never regenerated.
* **Offline receipt numbers must be unique without a central counter.** Two options:
  * *Device-prefixed numbering (recommended):* `{OUTLET}-{DEVICE}-{seq}`, e.g. `DHK-GUL-T2-000731`. Each
    terminal owns its own monotonic, gap-free local sequence, so numbers are unique by construction and
    printable immediately.
  * *Block allocation:* while online, the hub leases a block of numbers (e.g. 1001–2000) from HQ's
    per-outlet counter; offline terminals draw from their local block.
* The official HQ receipt number (the per-outlet sequence this API issues) can be assigned at sync time
  and linked to the offline number; both are stored (`client_receipt_number`, `receipt_number`), and the
  printed receipt remains valid.
* `client_created_at` (already in the schema and API) stores when the sale actually happened, so reports
  attribute offline sales to the right hour/day instead of the sync time.

### 6.5 Sync protocol when the internet reconnects

```mermaid
sequenceDiagram
    participant POS as POS / Edge Hub (outbox)
    participant API as HQ Sync API
    participant DB as HQ DB

    Note over POS: offline: sales appended to local outbox<br/>(status = PENDING, ordered by local seq)
    POS->>API: POST /sync/sales (batch of N, oldest first)<br/>each with saleId = Idempotency-Key, clientCreatedAt, device seq
    loop each sale in order
        API->>DB: same transactional create-sale path<br/>(idempotent on saleId)
        alt new
            DB-->>API: created (receipt no. assigned)
        else already synced (retry)
            DB-->>API: existing sale returned
        end
    end
    API-->>POS: per-sale results {saleId, status, receiptNumber}
    POS->>POS: mark SYNCED; keep failures for review
    POS->>API: GET /sync/changes?since=cursor<br/>(menu, prices, availability, stock)
    API-->>POS: delta + new cursor
```

Details:

1. **Outbox pattern on the device.** A sale is committed locally together with an outbox record in one
   local transaction. A background sync worker drains the outbox oldest-first with exponential backoff and
   jitter; it resumes after crashes and reboots.
2. **Idempotency end-to-end.** The server already supports `Idempotency-Key` with a unique constraint, so
   resending a batch after a timeout never double-charges or double-deducts stock. This is implemented and
   tested in this repository.
3. **Batching and ordering.** Batches of e.g. 50, processed in device order; each sale is its own
   transaction so one bad sale doesn't block the rest; per-sale results come back.
4. **Stock conflicts: sales are facts.** Food already served cannot be un-sold. Offline, the device keeps a
   *local projection* of stock (last server snapshot minus local sales) and warns or blocks at zero. At
   sync time, if the server would go negative, the sync path accepts the sale and records a
   **`stock_discrepancy`** ledger entry, holding stock at 0 instead of rejecting the sale. HQ gets a
   reconciliation report. The normal online path keeps rejecting oversells, so the invariant "stock never
   negative" still holds, and every exception is explicit and auditable.
5. **Price conflicts.** The sale keeps the price the customer actually paid (snapshotted on the device
   from its cached menu version, sent with `menuVersion`). If HQ changed the price meanwhile, the sale is
   still accepted and flagged for review.
6. **Downstream sync (HQ → outlet).** Menu, prices, availability and stock are pulled as **deltas since a
   cursor** (`updated_at`/version), or pushed via WebSocket/SSE when online. Devices always keep the last
   full snapshot, so they can boot and sell offline.
7. **Clock skew.** Devices sync time via NTP when online; the server records both `client_created_at`
   and its own `created_at`, and rejects or flags absurd client timestamps.
8. **Security.** Each device has its own credential (device token or mTLS) scoped to one outlet; the local
   DB is encrypted at rest; offline sessions use PINs validated against a cached, hashed staff list.
9. **Visibility.** POS shows a clear "Offline · 12 sales pending sync" indicator; HQ sees last-sync time
   per device and alerts on devices that haven't synced within N hours.

### 6.6 What is already implemented in this codebase

| Capability | Status |
|---|---|
| Idempotent `POST /sales` via `Idempotency-Key` (unique per outlet, race-safe) | ✅ implemented + tested |
| `clientCreatedAt` stored separately from server `created_at` | ✅ implemented |
| POS UI keeps one idempotency key per checkout attempt, so retries are safe | ✅ implemented |
| Server-side price resolution + price/name snapshots on sale lines | ✅ implemented |
| Inventory ledger for reconciliation | ✅ implemented |
| Local outbox, edge hub, KDS messaging, batch sync endpoint | 📄 designed above |
