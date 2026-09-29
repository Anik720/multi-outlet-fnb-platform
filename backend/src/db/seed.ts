/**
 * Demo data: 3 outlets, a master menu, per-outlet assignments/overrides/stock,
 * one HQ admin + one staff user per outlet, and a couple of weeks of sales.
 *
 *   npm run seed          -> seeds only if the database is empty
 *   npm run seed:reset    -> wipes all data and re-seeds (never in production)
 *   node dist/db/seed.js  -> container start-up; runs only if SEED_DEMO_DATA=true
 *
 * Sales are created through saleService so stock, receipt numbers and the
 * inventory ledger stay consistent with real usage.
 */
import bcrypt from 'bcryptjs';
import { env, isProduction } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from './prisma';
import { saleService } from '../services/sale.service';
import type { AuthUser } from '../types/auth';

export const DEMO_PASSWORD = 'Password123!';

const OUTLETS = [
  { code: 'DHK-GUL', name: 'Gulshan Flagship', address: 'Road 11, Gulshan 2, Dhaka', staff: 'gulshan' },
  { code: 'DHK-DHN', name: 'Dhanmondi Lake View', address: 'Road 27, Dhanmondi, Dhaka', staff: 'dhanmondi' },
  { code: 'CTG-AGR', name: 'Agrabad Express', address: 'Agrabad C/A, Chattogram', staff: 'agrabad' },
] as const;

const MENU = [
  { sku: 'BEV-ESP', name: 'Espresso', category: 'Beverages', basePrice: 180 },
  { sku: 'BEV-CAP', name: 'Cappuccino', category: 'Beverages', basePrice: 250 },
  { sku: 'BEV-LAT', name: 'Iced Latte', category: 'Beverages', basePrice: 280 },
  { sku: 'BEV-LEM', name: 'Mint Lemonade', category: 'Beverages', basePrice: 200 },
  { sku: 'BEV-LAS', name: 'Mango Lassi', category: 'Beverages', basePrice: 220 },
  { sku: 'FD-CKB', name: 'Crispy Chicken Burger', category: 'Mains', basePrice: 450 },
  { sku: 'FD-BFB', name: 'Smoky Beef Burger', category: 'Mains', basePrice: 520 },
  { sku: 'FD-CSW', name: 'Club Sandwich', category: 'Mains', basePrice: 380 },
  { sku: 'FD-PST', name: 'Chicken Alfredo Pasta', category: 'Mains', basePrice: 490 },
  { sku: 'FD-KCH', name: 'Kacchi Biryani', category: 'Mains', basePrice: 390 },
  { sku: 'SD-FRY', name: 'French Fries', category: 'Sides', basePrice: 180 },
  { sku: 'SD-WNG', name: 'Spicy Wings (6 pcs)', category: 'Sides', basePrice: 420 },
  { sku: 'DS-BRW', name: 'Chocolate Brownie', category: 'Desserts', basePrice: 220 },
  { sku: 'DS-CHC', name: 'NY Cheesecake', category: 'Desserts', basePrice: 350 },
] as const;

type Sku = (typeof MENU)[number]['sku'];
type OutletCode = (typeof OUTLETS)[number]['code'];

/** What each outlet sells, with optional price overrides and starting stock. */
const ASSIGNMENTS: Record<OutletCode, { sku: Sku; priceOverride?: number; stock: number }[]> = {
  // Flagship: full western menu, premium pricing on a few items.
  'DHK-GUL': [
    { sku: 'BEV-ESP', stock: 120 },
    { sku: 'BEV-CAP', priceOverride: 280, stock: 120 },
    { sku: 'BEV-LAT', priceOverride: 320, stock: 100 },
    { sku: 'BEV-LEM', stock: 80 },
    { sku: 'FD-CKB', stock: 90 },
    { sku: 'FD-BFB', priceOverride: 580, stock: 70 },
    { sku: 'FD-CSW', stock: 60 },
    { sku: 'FD-PST', stock: 60 },
    { sku: 'SD-FRY', stock: 150 },
    { sku: 'SD-WNG', stock: 80 },
    { sku: 'DS-BRW', stock: 60 },
    { sku: 'DS-CHC', stock: 4 }, // low stock on purpose
  ],
  'DHK-DHN': [
    { sku: 'BEV-ESP', stock: 100 },
    { sku: 'BEV-CAP', stock: 100 },
    { sku: 'BEV-LEM', stock: 80 },
    { sku: 'BEV-LAS', stock: 80 },
    { sku: 'FD-CKB', stock: 90 },
    { sku: 'FD-CSW', stock: 60 },
    { sku: 'FD-KCH', stock: 70 },
    { sku: 'SD-FRY', stock: 120 },
    { sku: 'DS-BRW', stock: 50 },
  ],
  // Express format: smaller menu, value pricing.
  'CTG-AGR': [
    { sku: 'BEV-CAP', priceOverride: 230, stock: 90 },
    { sku: 'BEV-LAS', priceOverride: 190, stock: 90 },
    { sku: 'FD-CKB', priceOverride: 420, stock: 80 },
    { sku: 'FD-KCH', priceOverride: 350, stock: 90 },
    { sku: 'SD-FRY', stock: 120 },
    { sku: 'DS-BRW', stock: 3 }, // low stock on purpose
  ],
};

/** Deterministic PRNG so every seed produces the same demo data. */
function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

async function reset() {
  if (isProduction) throw new Error('Refusing to reset data in production');
  await prisma.$executeRawUnsafe(`
    TRUNCATE inventory_movements, sale_items, sales, inventory, outlet_menu_items,
             outlet_receipt_counters, users, menu_items, outlets RESTART IDENTITY CASCADE`);
  logger.info('Existing data removed');
}

async function seed() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await prisma.user.create({
    data: { email: 'hq@fnb.test', fullName: 'HQ Admin', role: 'HQ_ADMIN', passwordHash },
  });

  const menu = new Map<Sku, string>();
  for (const item of MENU) {
    const created = await prisma.menuItem.create({
      data: { ...item, basePrice: item.basePrice.toFixed(2) },
    });
    menu.set(item.sku, created.id);
  }

  const staffByOutlet = new Map<string, { code: OutletCode; user: AuthUser }>();
  for (const o of OUTLETS) {
    const outlet = await prisma.outlet.create({
      data: { code: o.code, name: o.name, address: o.address, receiptCounter: { create: {} } },
    });
    const staff = await prisma.user.create({
      data: {
        email: `${o.staff}@fnb.test`,
        fullName: `${o.name} Staff`,
        role: 'OUTLET_STAFF',
        outletId: outlet.id,
        passwordHash,
      },
    });
    staffByOutlet.set(outlet.id, {
      code: o.code,
      user: {
        id: staff.id,
        email: staff.email,
        fullName: staff.fullName,
        role: 'OUTLET_STAFF',
        outletId: outlet.id,
      },
    });

    for (const a of ASSIGNMENTS[o.code]) {
      await prisma.outletMenuItem.create({
        data: {
          outletId: outlet.id,
          menuItemId: menu.get(a.sku)!,
          priceOverride: a.priceOverride?.toFixed(2) ?? null,
          inventory: { create: { quantity: a.stock } },
        },
      });
      await prisma.inventoryMovement.create({
        data: {
          outletId: outlet.id,
          menuItemId: menu.get(a.sku)!,
          change: a.stock,
          quantityAfter: a.stock,
          reason: 'RESTOCK',
          note: 'Opening stock',
        },
      });
    }
  }

  // ~2 weeks of sales, spread over opening hours, via the real sale service.
  const random = prng(42);
  let salesCreated = 0;
  for (const [outletId, { code, user: staff }] of staffByOutlet) {
    const skus = ASSIGNMENTS[code].filter((a) => a.stock > 10).map((a) => a.sku);
    const salesCount = 25 + Math.floor(random() * 15);

    for (let n = 0; n < salesCount; n++) {
      const lineCount = 1 + Math.floor(random() * 3);
      const items = Array.from({ length: lineCount }, () => ({
        menuItemId: menu.get(skus[Math.floor(random() * skus.length)]!)!,
        quantity: 1 + Math.floor(random() * 2),
      }));
      const { sale } = await saleService.create(outletId, { items }, staff);

      // Backdate so reports have history: day 13..0 ago, 10:00-21:59.
      const daysAgo = Math.floor(((salesCount - n) / salesCount) * 14);
      const when = new Date();
      when.setDate(when.getDate() - daysAgo);
      when.setHours(10 + Math.floor(random() * 12), Math.floor(random() * 60), 0, 0);
      if (when > new Date()) when.setDate(when.getDate() - 1);
      await prisma.$executeRaw`UPDATE sales SET created_at = ${when} WHERE id = ${sale.id}::uuid`;
      await prisma.$executeRaw`UPDATE inventory_movements SET created_at = ${when} WHERE sale_id = ${sale.id}::uuid`;
      salesCreated++;
    }
  }

  logger.info(
    { outlets: OUTLETS.length, menuItems: MENU.length, sales: salesCreated },
    `Demo data seeded. Log in with hq@fnb.test / ${DEMO_PASSWORD}`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const explicit = args.includes('--run') || args.includes('--reset');
  if (!explicit && !env.SEED_DEMO_DATA) {
    logger.info('SEED_DEMO_DATA is not enabled; skipping seed');
    return;
  }

  if (args.includes('--reset')) await reset();

  if ((await prisma.outlet.count()) > 0) {
    logger.info('Database already has data; skipping seed (use `npm run seed:reset` to start over)');
    return;
  }
  await seed();
}

main()
  .catch((err: unknown) => {
    logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
