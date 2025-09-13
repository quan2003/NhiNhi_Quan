// migrate-json-to-pg.js
import fs from "fs/promises";
import dotenv from "dotenv";
dotenv.config();
import { tx, q } from "./db.js";

async function run() {
  const raw = await fs.readFile("./db.json", "utf-8");
  const db = JSON.parse(raw);

  // products
  for (const p of db.products || []) {
    await q(
      `INSERT INTO products(id,name,category,price_sell,price_cost,unit,active,image_url,description,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, category=EXCLUDED.category, price_sell=EXCLUDED.price_sell,
         price_cost=EXCLUDED.price_cost, unit=EXCLUDED.unit, active=EXCLUDED.active,
         image_url=EXCLUDED.image_url, description=EXCLUDED.description, updated_at=EXCLUDED.updated_at`,
      [
        p.id,
        p.name,
        p.category || "Khác",
        p.priceSell || 0,
        p.priceCost || 0,
        p.unit || "phần",
        p.active !== false,
        p.imageUrl || "",
        p.description || "",
        p.createdAt || new Date(),
        p.updatedAt || null,
      ]
    );
  }

  // settings.promo
  const promo = db.settings?.promo || {
    enabled: false,
    percent: 0,
    start: null,
    end: null,
  };
  await q(
    `INSERT INTO settings_promo(id, enabled, percent, start_at, end_at)
     VALUES(TRUE,$1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET enabled=$1, percent=$2, start_at=$3, end_at=$4`,
    [
      !!promo.enabled,
      promo.percent || 0,
      promo.start || null,
      promo.end || null,
    ]
  );

  // push subscriptions
  const subs = db.settings?.push?.subscriptions || [];
  for (const s of subs) {
    await q(
      `INSERT INTO push_subscriptions(endpoint, expiration_time, key_p256dh, key_auth)
       VALUES($1,$2,$3,$4)
       ON CONFLICT (endpoint) DO NOTHING`,
      [
        s.endpoint || "",
        s.expirationTime || null,
        s.keys?.p256dh || "",
        s.keys?.auth || "",
      ]
    );
  }

  // orders + order_items
  for (const o of db.orders || []) {
    await tx(async (client) => {
      await client.query(
        `INSERT INTO orders(id, status, customer_name, customer_phone, customer_address,
                            payment_method, subtotal, discount, total, cost_total, profit,
                            promo_snapshot, meta, created_at, updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15)
         ON CONFLICT (id) DO NOTHING`,
        [
          o.id,
          o.status || "NEW",
          o.customer?.name || "",
          o.customer?.phone || "",
          o.customer?.address || "",
          (o.paymentMethod || "COD").toUpperCase(),
          o.subtotal || 0,
          o.discount || 0,
          o.total || 0,
          o.costTotal || 0,
          o.profit || o.total - o.costTotal,
          JSON.stringify(o.promoSnapshot || {}),
          JSON.stringify(o.meta || {}),
          o.createdAt || new Date(),
          o.updatedAt || null,
        ]
      );
      for (const it of o.items || []) {
        await client.query(
          `INSERT INTO order_items(order_id, product_id, name, price_sell, price_cost, qty)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [
            o.id,
            it.productId || null,
            it.name || "",
            it.priceSell || 0,
            it.priceCost || 0,
            it.qty || 1,
          ]
        );
      }
    });
  }

  console.log("✅ Migrated from db.json to Postgres");
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
