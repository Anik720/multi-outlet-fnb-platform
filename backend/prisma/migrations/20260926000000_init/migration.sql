-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('HQ_ADMIN', 'OUTLET_STAFF');

-- CreateEnum
CREATE TYPE "inventory_movement_reason" AS ENUM ('RESTOCK', 'ADJUSTMENT', 'WASTAGE', 'SALE');

-- CreateTable
CREATE TABLE "outlets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "role" "user_role" NOT NULL,
    "outlet_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sku" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(60),
    "base_price" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_menu_items" (
    "outlet_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "price_override" DECIMAL(12,2),
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outlet_menu_items_pk" PRIMARY KEY ("outlet_id","menu_item_id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "outlet_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_pk" PRIMARY KEY ("outlet_id","menu_item_id")
);

-- CreateTable
CREATE TABLE "outlet_receipt_counters" (
    "outlet_id" UUID NOT NULL,
    "last_value" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outlet_receipt_counters_pkey" PRIMARY KEY ("outlet_id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "receipt_seq" BIGINT NOT NULL,
    "receipt_number" VARCHAR(40) NOT NULL,
    "idempotency_key" VARCHAR(100),
    "item_count" INTEGER NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "created_by" UUID,
    "client_created_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" BIGSERIAL NOT NULL,
    "sale_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "item_name" VARCHAR(120) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" BIGSERIAL NOT NULL,
    "outlet_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "change" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "reason" "inventory_movement_reason" NOT NULL,
    "sale_id" UUID,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outlets_code_uq" ON "outlets"("code");

-- CreateIndex
CREATE INDEX "users_outlet_id_idx" ON "users"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_sku_uq" ON "menu_items"("sku");

-- CreateIndex
CREATE INDEX "menu_items_category_idx" ON "menu_items"("category");

-- CreateIndex
CREATE INDEX "outlet_menu_items_menu_item_idx" ON "outlet_menu_items"("menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_receipt_number_uq" ON "sales"("receipt_number");

-- CreateIndex
CREATE INDEX "sales_outlet_created_at_idx" ON "sales"("outlet_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sales_created_at_idx" ON "sales"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_outlet_receipt_seq_uq" ON "sales"("outlet_id", "receipt_seq");

-- CreateIndex
CREATE UNIQUE INDEX "sales_outlet_idempotency_uq" ON "sales"("outlet_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "sale_items_menu_item_idx" ON "sale_items"("menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_sale_menu_item_uq" ON "sale_items"("sale_id", "menu_item_id");

-- CreateIndex
CREATE INDEX "inventory_movements_outlet_item_created_idx" ON "inventory_movements"("outlet_id", "menu_item_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_movements_sale_idx" ON "inventory_movements"("sale_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_menu_items" ADD CONSTRAINT "outlet_menu_items_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_menu_items" ADD CONSTRAINT "outlet_menu_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_assignment_fk" FOREIGN KEY ("outlet_id", "menu_item_id") REFERENCES "outlet_menu_items"("outlet_id", "menu_item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_receipt_counters" ADD CONSTRAINT "outlet_receipt_counters_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Hand-written additions: things the Prisma schema language cannot express.
-- =============================================================================

-- ---- CHECK constraints: business invariants enforced by the database itself --
ALTER TABLE "outlets"
  ADD CONSTRAINT "outlets_code_format_chk" CHECK ("code" ~ '^[A-Z0-9-]{2,20}$');

-- HQ admins belong to no outlet; outlet staff must belong to exactly one.
ALTER TABLE "users"
  ADD CONSTRAINT "users_role_outlet_chk" CHECK (
    ("role" = 'HQ_ADMIN' AND "outlet_id" IS NULL) OR
    ("role" = 'OUTLET_STAFF' AND "outlet_id" IS NOT NULL)
  );

ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_base_price_chk" CHECK ("base_price" >= 0);

ALTER TABLE "outlet_menu_items"
  ADD CONSTRAINT "outlet_menu_items_price_override_chk"
  CHECK ("price_override" IS NULL OR "price_override" >= 0);

-- Last line of defence against negative stock, even for buggy code paths.
ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_quantity_non_negative_chk" CHECK ("quantity" >= 0);

ALTER TABLE "outlet_receipt_counters"
  ADD CONSTRAINT "outlet_receipt_counters_last_value_chk" CHECK ("last_value" >= 0);

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_receipt_seq_chk"  CHECK ("receipt_seq" > 0),
  ADD CONSTRAINT "sales_item_count_chk"   CHECK ("item_count" > 0),
  ADD CONSTRAINT "sales_total_amount_chk" CHECK ("total_amount" >= 0);

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_quantity_chk"   CHECK ("quantity" > 0),
  ADD CONSTRAINT "sale_items_unit_price_chk" CHECK ("unit_price" >= 0),
  ADD CONSTRAINT "sale_items_line_total_chk" CHECK ("line_total" >= 0);

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_change_chk" CHECK ("change" <> 0),
  ADD CONSTRAINT "inventory_movements_quantity_after_chk" CHECK ("quantity_after" >= 0);

-- ---- Case-insensitive unique email -------------------------------------------
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" (lower("email"));

-- ---- updated_at triggers -----------------------------------------------------
-- Prisma's @updatedAt only applies to writes made through the Prisma client;
-- the trigger keeps the column correct for raw SQL writes too.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outlets_set_updated_at BEFORE UPDATE ON "outlets"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER menu_items_set_updated_at BEFORE UPDATE ON "menu_items"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER outlet_menu_items_set_updated_at BEFORE UPDATE ON "outlet_menu_items"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER inventory_set_updated_at BEFORE UPDATE ON "inventory"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER outlet_receipt_counters_set_updated_at BEFORE UPDATE ON "outlet_receipt_counters"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
