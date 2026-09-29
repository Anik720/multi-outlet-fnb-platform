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

