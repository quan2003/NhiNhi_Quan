// server-pg.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import dotenv from "dotenv";
import multer from "multer";
import webpush from "web-push";
import { q, one, tx } from "./db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "changeme";

const BANK_NAME = process.env.BANK_NAME || "BVBank";
const BANK_ACCOUNT_NAME = process.env.BANK_ACCOUNT_NAME || "TRUONG LUU QUAN";
const BANK_ACCOUNT_NUMBER = process.env.BANK_ACCOUNT_NUMBER || "0336440523";
const VIETQR_IMAGE = process.env.VIETQR_IMAGE || "/img/vietqr.png";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

const PUSH_TTL = Math.max(60, parseInt(process.env.PUSH_TTL || "86400", 10));
const PUSH_URGENCY = process.env.PUSH_URGENCY || "high";
const PUSH_TOPIC = process.env.PUSH_TOPIC || "orders";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn("Web Push disabled (missing VAPID keys)");
}

/* ============ Static & middleware ============ */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin")));
app.set("etag", false);
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});

/* ============ Upload ============ */
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
import fs from "fs/promises";
await fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});
app.use("/uploads", express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext =
      String(file.originalname || "")
        .split(".")
        .pop() || "jpg";
    const name = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext.toLowerCase()}`;
    cb(null, name);
  },
});
const upload = multer({ storage });

/* ============ Helpers ============ */
const last4 = (p) =>
  String(p || "")
    .replace(/\D/g, "")
    .slice(-4);
const maskPhone = (p) => {
  const d = String(p).replace(/\D/g, "");
  return d.length <= 4
    ? d
    : "•".repeat(Math.max(0, d.length - 4)) + d.slice(-4);
};
const sameId = (a, b) =>
  String(a || "").toUpperCase() === String(b || "").toUpperCase();

function isPromoActive(p) {
  if (!p || !p.enabled || !p.percent) return false;
  const now = new Date();
  if (p.start_at && now < new Date(p.start_at)) return false;
  if (p.end_at && now > new Date(p.end_at)) return false;
  return true;
}

/* ============ Auth ============ */
function requireAdmin(req, res, next) {
  const t = req.headers["x-admin-token"];
  if (!t || t !== ADMIN_TOKEN)
    return res.status(401).json({ error: "Unauthorized" });
  next();
}
app.post("/api/auth/login", (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) return res.json({ token: ADMIN_TOKEN });
  res.status(401).json({ error: "Sai mật khẩu" });
});

/* ============ Settings & public config ============ */
app.get("/api/settings", requireAdmin, async (_req, res) => {
  const sp = await one(
    "SELECT enabled, percent, start_at, end_at FROM settings_promo WHERE id = TRUE",
    []
  );
  res.json({
    promo: {
      enabled: !!sp?.enabled,
      percent: sp?.percent ?? 0,
      start: sp?.start_at ?? null,
      end: sp?.end_at ?? null,
    },
    push: { subscriptions: [] },
  });
});

app.put("/api/settings", requireAdmin, async (req, res) => {
  const { promo } = req.body || {};
  if (promo) {
    await q(
      `INSERT INTO settings_promo(id, enabled, percent, start_at, end_at)
       VALUES(TRUE,$1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET enabled=$1, percent=$2, start_at=$3, end_at=$4`,
      [
        !!promo.enabled,
        Math.max(0, Math.min(100, Number(promo.percent) || 0)),
        promo.start || null,
        promo.end || null,
      ]
    );
  }
  const sp = await one(
    "SELECT enabled, percent, start_at, end_at FROM settings_promo WHERE id = TRUE",
    []
  );
  res.json({
    promo: {
      enabled: !!sp?.enabled,
      percent: sp?.percent ?? 0,
      start: sp?.start_at ?? null,
      end: sp?.end_at ?? null,
    },
  });
});

app.get("/api/config", async (_req, res) => {
  const sp = await one(
    "SELECT enabled, percent, start_at, end_at FROM settings_promo WHERE id = TRUE",
    []
  );
  const promoActive = isPromoActive(sp);
  res.json({
    bankName: BANK_NAME,
    bankAccountName: BANK_ACCOUNT_NAME,
    bankAccountNumber: BANK_ACCOUNT_NUMBER,
    promo: {
      enabled: !!sp?.enabled,
      percent: sp?.percent ?? 0,
      start: sp?.start_at ?? null,
      end: sp?.end_at ?? null,
    },
    promoActive,
    qrFixedImage: VIETQR_IMAGE,
  });
});

/* ======= IMPORTANT: MIGRATION NOTE =======
Chạy 1 lần (PSQL):

ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 9999;

========================================= */

/* ============ Products ============ */
// Public (khách): chỉ active = TRUE, sắp theo sort_order ASC trước rồi fallback theo created_at
app.get("/api/products", async (_req, res) => {
  const rows = await q(
    `SELECT id, name, category, price_sell AS "priceSell", price_cost AS "priceCost",
            unit, active, image_url AS "imageUrl", description,
            sort_order AS "sortOrder",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM products
     WHERE active = TRUE
     ORDER BY COALESCE(sort_order, 9999) ASC, created_at DESC`,
    []
  );
  res.json(rows);
});

// Admin: lấy tất cả, sắp theo sort_order
app.get("/api/admin/products", requireAdmin, async (_req, res) => {
  const rows = await q(
    `SELECT id, name, category, price_sell AS "priceSell", price_cost AS "priceCost",
            unit, active, image_url AS "imageUrl", description,
            sort_order AS "sortOrder",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM products
     ORDER BY COALESCE(sort_order, 9999) ASC, created_at DESC`,
    []
  );
  res.json(rows);
});

app.get("/api/products/:id", async (req, res) => {
  const p = await one(
    `SELECT id, name, category, price_sell AS "priceSell", price_cost AS "priceCost",
            unit, active, image_url AS "imageUrl", description,
            sort_order AS "sortOrder",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM products WHERE id=$1`,
    [req.params.id]
  );
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

app.post("/api/products", requireAdmin, async (req, res) => {
  const {
    name,
    category,
    priceSell,
    priceCost,
    unit,
    active = true,
    imageUrl,
    description,
    sortOrder, // NEW
  } = req.body || {};
  if (!name || priceSell == null || priceCost == null)
    return res.status(400).json({ error: "Thiếu trường bắt buộc" });
  const id = nanoid(10).toUpperCase();
  const now = new Date();
  await q(
    `INSERT INTO products(id,name,category,price_sell,price_cost,unit,active,image_url,description,sort_order,created_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      name,
      category || "Khác",
      +priceSell,
      +priceCost,
      unit || "phần",
      !!active,
      imageUrl || "",
      description || "",
      Number.isFinite(+sortOrder) ? +sortOrder : 9999,
      now,
    ]
  );
  const p = await one(
    `SELECT id, name, category, price_sell AS "priceSell", price_cost AS "priceCost",
            unit, active, image_url AS "imageUrl", description,
            sort_order AS "sortOrder",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM products WHERE id=$1`,
    [id]
  );
  res.json(p);
});

app.put("/api/products/:id", requireAdmin, async (req, res) => {
  // Cập nhật linh hoạt
  const fields = [];
  const vals = [];
  let i = 1;
  const mapping = {
    name: "name",
    category: "category",
    priceSell: "price_sell",
    priceCost: "price_cost",
    unit: "unit",
    active: "active",
    imageUrl: "image_url",
    description: "description",
    sortOrder: "sort_order", // NEW
  };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (mapping[k]) {
      fields.push(`${mapping[k]}=$${i++}`);
      if (k === "priceSell" || k === "priceCost" || k === "sortOrder") {
        vals.push(Number(v));
      } else {
        vals.push(v);
      }
    }
  }
  if (!fields.length)
    return res.status(400).json({ error: "Không có gì để cập nhật" });
  fields.push(`updated_at=NOW()`);
  vals.push(req.params.id);
  const sql = `UPDATE products SET ${fields.join(",")} WHERE id=$${i} RETURNING
      id, name, category, price_sell AS "priceSell", price_cost AS "priceCost",
      unit, active, image_url AS "imageUrl", description,
      sort_order AS "sortOrder",
      created_at AS "createdAt", updated_at AS "updatedAt"`;
  const row = await one(sql, vals);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

app.delete("/api/products/:id", requireAdmin, async (req, res) => {
  const row = await one(`DELETE FROM products WHERE id=$1 RETURNING id`, [
    req.params.id,
  ]);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ id: row.id });
});

/* ============ Push subscriptions ============ */
async function addPushSubscription(sub) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  await q(
    `INSERT INTO push_subscriptions(endpoint, expiration_time, key_p256dh, key_auth)
     VALUES($1,$2,$3,$4) ON CONFLICT (endpoint) DO NOTHING`,
    [
      sub?.endpoint || "",
      sub?.expirationTime || null,
      sub?.keys?.p256dh || "",
      sub?.keys?.auth || "",
    ]
  );
}
async function removePushSubscription(endpoint) {
  await q(`DELETE FROM push_subscriptions WHERE endpoint=$1`, [endpoint]);
}
async function sendPushToAll(payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const subs = await q(
    `SELECT endpoint, key_p256dh, key_auth FROM push_subscriptions`,
    []
  );
  const dead = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.key_p256dh, auth: s.key_auth },
          },
          JSON.stringify(payload),
          { TTL: PUSH_TTL, urgency: PUSH_URGENCY, topic: PUSH_TOPIC }
        );
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410)
          dead.push(s.endpoint);
        else console.warn("Push error:", e?.statusCode, e?.message);
      }
    })
  );
  if (dead.length) {
    await q(`DELETE FROM push_subscriptions WHERE endpoint = ANY($1)`, [dead]);
  }
}
app.get("/api/push/publicKey", requireAdmin, (_req, res) =>
  res.json({ publicKey: VAPID_PUBLIC || "" })
);
app.post("/api/push/subscribe", requireAdmin, async (req, res) => {
  await addPushSubscription(req.body);
  res.json({ ok: true });
});
app.post("/api/push/unsubscribe", requireAdmin, async (req, res) => {
  await removePushSubscription(req.body?.endpoint || "");
  res.json({ ok: true });
});
app.post("/api/push/test", requireAdmin, async (_req, res) => {
  await sendPushToAll({
    type: "test",
    notification: {
      title: "🔔 Test thông báo",
      body: "Bạn vừa bật Web Push thành công!",
      data: {},
    },
  });
  res.json({ ok: true });
});

/* ============ SSE ============ */
const sseClients = new Set();
app.get("/api/orders/stream", (req, res) => {
  const qtoken = req.query.token;
  if (!qtoken || qtoken !== ADMIN_TOKEN) return res.sendStatus(401);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  const client = { res };
  sseClients.add(client);
  const keep = setInterval(() => {
    try {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    } catch {}
  }, 25000);
  req.on("close", () => {
    clearInterval(keep);
    sseClients.delete(client);
  });
});
function sseBroadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const { res } of sseClients) {
    try {
      res.write(payload);
    } catch {}
  }
}

/* ============ Orders (giữ nguyên phần dưới) ============ */
const AllowedStatus = [
  "NEW",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "CANCELED",
];
const AllowedOrderTypes = ["TAKEAWAY", "TAKE_AWAY", "DINE_IN", "RESERVE"];

app.post("/api/orders", async (req, res) => {
  const { customer, items, paymentMethod, meta } = req.body || {};
  if (!customer?.name || !customer?.phone || !items?.length) {
    return res.status(400).json({ error: "Thiếu thông tin đơn hàng" });
  }

  try {
    const result = await tx(async (db) => {
      // Lấy products snapshot
      const ids = items.map((it) => it.productId);
      const rows = await db.query(
        `SELECT id, name, price_sell, price_cost FROM products WHERE id = ANY($1)`,
        [ids]
      );
      const byId = new Map(rows.rows.map((r) => [r.id, r]));
      let subtotal = 0,
        costTotal = 0;
      const normalized = [];
      for (const it of items) {
        const p = byId.get(it.productId);
        if (!p) throw new Error("Sản phẩm không tồn tại: " + it.productId);
        const qty = Math.max(1, +it.qty || 1);
        subtotal += p.price_sell * qty;
        costTotal += p.price_cost * qty;
        normalized.push({
          productId: p.id,
          name: p.name,
          priceSell: p.price_sell,
          priceCost: p.price_cost,
          qty,
        });
      }

      const sp = await db.one(
        `SELECT enabled, percent, start_at, end_at FROM settings_promo WHERE id = TRUE`,
        []
      );
      const active = isPromoActive(sp);
      const discount = active
        ? Math.round((subtotal * (sp?.percent || 0)) / 100)
        : 0;
      const total = Math.max(0, subtotal - discount);
      const profit = total - costTotal;

      let orderType = (meta?.orderType || "TAKEAWAY")
        .toUpperCase()
        .replace("-", "_");
      if (!AllowedOrderTypes.includes(orderType))
        throw new Error("orderType không hợp lệ");
      if (orderType === "RESERVE" && !meta?.scheduleAt)
        throw new Error("RESERVE cần scheduleAt");

      const id = nanoid(12).toUpperCase();
      await db.query(
        `INSERT INTO orders(id, status, customer_name, customer_phone, customer_address,
                            payment_method, subtotal, discount, total, cost_total, profit,
                            promo_snapshot, meta, created_at)
         VALUES($1,'NEW',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
        [
          id,
          customer.name,
          customer.phone,
          customer.address || "",
          paymentMethod === "TRANSFER" ? "TRANSFER" : "COD",
          subtotal,
          discount,
          total,
          costTotal,
          profit,
          { active: !!active, percent: sp?.percent || 0 },
          {
            orderType,
            tableNumber: meta?.tableNumber || "",
            guests: Number(meta?.guests || 0) || 0,
            scheduleAt: meta?.scheduleAt || null,
            note: meta?.note || "",
          },
        ]
      );
      for (const it of normalized) {
        await db.query(
          `INSERT INTO order_items(order_id, product_id, name, price_sell, price_cost, qty)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [id, it.productId, it.name, it.priceSell, it.priceCost, it.qty]
        );
      }
      return { id, subtotal, discount, total };
    });

    sseBroadcast({ type: "new_order", orderId: result.id });
    const totalVnd = (result.total || 0).toLocaleString("vi-VN") + "₫";
    await sendPushToAll({
      type: "new_order",
      notification: {
        title: "Đơn mới!",
        body: `Mã: ${result.id}\nTổng: ${totalVnd}`,
        data: { orderId: result.id },
      },
    });

    res.json({
      ok: true,
      orderId: result.id,
      subtotal: result.subtotal,
      discount: result.discount,
      total: result.total,
    });
  } catch (e) {
    if (
      String(e.message || "").startsWith("Sản phẩm không tồn tại") ||
      /orderType/.test(e.message) ||
      /RESERVE/.test(e.message)
    ) {
      return res.status(400).json({ error: e.message });
    }
    console.error(e);
    res.status(500).json({ error: "Lỗi tạo đơn" });
  }
});

app.get("/api/orders", requireAdmin, async (req, res) => {
  const { status, page = 1, pageSize = 10, q: kw = "" } = req.query;
  const p = Math.max(1, parseInt(page, 10));
  const ps = Math.max(1, parseInt(pageSize, 10));
  const params = [];
  const where = [];
  if (status && AllowedStatus.includes(String(status).toUpperCase())) {
    params.push(String(status).toUpperCase());
    where.push(`status = $${params.length}`);
  }
  if (kw) {
    params.push(`%${String(kw).toLowerCase()}%`);
    const idx = params.length;
    where.push(
      `(LOWER(id) LIKE $${idx} OR LOWER(customer_name) LIKE $${idx} OR LOWER(customer_phone) LIKE $${idx})`
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = await one(
    `SELECT COUNT(*)::int AS c FROM orders ${whereSql}`,
    params
  );
  params.push(ps, (p - 1) * ps);
  const rows = await q(
    `SELECT id, status, customer_name, customer_phone, customer_address,
            payment_method, subtotal, discount, total, cost_total, profit,
            promo_snapshot, meta, created_at, updated_at
     FROM orders
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({
    page: p,
    pageSize: ps,
    total: totalRow?.c || 0,
    items: rows.map((o) => ({
      ...o,
      customer: {
        name: o.customer_name,
        phone: o.customer_phone,
        address: o.customer_address,
      },
    })),
  });
});

app.put("/api/orders/:id", requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (status && !AllowedStatus.includes(status))
    return res.status(400).json({ error: "Trạng thái không hợp lệ" });

  const row = await one(`SELECT id FROM orders WHERE id=$1`, [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });

  let updated = await one(
    `UPDATE orders SET
       status = COALESCE($2, status),
       meta = COALESCE($3, meta),
       updated_at = NOW()
     WHERE id=$1
     RETURNING id, status, customer_name, customer_phone, customer_address,
               payment_method, subtotal, discount, total, cost_total, profit,
               promo_snapshot, meta, created_at, updated_at`,
    [req.params.id, status || null, req.body?.meta || null]
  );

  sseBroadcast({ type: "order_updated", order: updated });
  res.json(updated);
});

app.delete("/api/orders/:id", requireAdmin, async (req, res) => {
  const row = await one(`DELETE FROM orders WHERE id=$1 RETURNING id`, [
    req.params.id,
  ]);
  if (!row) return res.status(404).json({ error: "Not found" });
  sseBroadcast({ type: "order_deleted", orderId: row.id });
  res.json({ ok: true, removedId: row.id });
});

/* ===== Invoices & lookup ===== */
app.get("/api/orders/invoice/:id", requireAdmin, async (req, res) => {
  const o = await one(`SELECT * FROM v_orders_with_items WHERE id=$1`, [
    req.params.id,
  ]);
  if (!o) return res.status(404).json({ error: "Không tìm thấy đơn" });
  if (o.status !== "COMPLETED")
    return res.status(403).json({ error: "Đơn chưa hoàn tất" });
  res.json({
    id: o.id,
    createdAt: o.created_at,
    status: o.status,
    paymentMethod: o.payment_method,
    customer: o.customer,
    meta: o.meta || {},
    items: o.items || [],
    subtotal: o.subtotal ?? 0,
    discount: o.discount ?? 0,
    total: o.total ?? 0,
  });
});

app.get("/api/orders/invoice-public/:id", async (req, res) => {
  const tail = String(req.query.phone || "").slice(-4);
  if (!tail) return res.status(400).json({ error: "Missing phone tail" });
  const base = await one(`SELECT * FROM orders WHERE id=$1`, [req.params.id]);
  if (!base) return res.status(404).json({ error: "Không tìm thấy đơn" });
  if (last4(base.customer_phone) !== tail)
    return res.status(403).json({ error: "Phone tail mismatch" });
  if (base.status !== "COMPLETED")
    return res.status(403).json({ error: "Đơn chưa hoàn tất" });
  const items = await q(
    `SELECT name, qty, price_sell FROM order_items WHERE order_id=$1 ORDER BY line_no`,
    [base.id]
  );
  res.json({
    id: base.id,
    createdAt: base.created_at,
    status: base.status,
    paymentMethod: base.payment_method,
    customer: {
      name: base.customer_name || "",
      phoneMasked: maskPhone(base.customer_phone),
    },
    meta: base.meta || {},
    items: items.map((it) => ({ ...it })),
    subtotal: base.subtotal ?? 0,
    discount: base.discount ?? 0,
    total: base.total ?? 0,
  });
});

app.get("/api/orders/lookup", async (req, res) => {
  const id = String(req.query.id || "").trim();
  const tail = last4(req.query.phone || "");
  if (!id || !tail)
    return res.status(400).json({ error: "MISSING_ID_OR_PHONE" });

  const o = await one(`SELECT * FROM orders WHERE id=$1`, [id]);
  if (!o) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
  if (last4(o.customer_phone) !== tail)
    return res.status(403).json({ error: "PHONE_TAIL_MISMATCH" });

  const items = await q(
    `SELECT name, qty, price_sell FROM order_items WHERE order_id=$1 ORDER BY line_no`,
    [o.id]
  );

  res.json({
    id: o.id,
    status: o.status,
    createdAt: o.created_at,
    paymentMethod: o.payment_method,
    customer: {
      name: o.customer_name || "",
      phoneMasked: maskPhone(o.customer_phone),
    },
    meta: {
      orderType: o.meta?.orderType || "TAKEAWAY",
      tableNumber: o.meta?.tableNumber || "",
      guests: Number(o.meta?.guests || 0) || 0,
      scheduleAt: o.meta?.scheduleAt || null,
      note: o.meta?.note || "",
    },
    items: items.map((it) => ({
      name: it.name,
      qty: it.qty,
      priceSell: it.price_sell,
      lineTotal: (it.price_sell || 0) * (it.qty || 0),
    })),
    subtotal: o.subtotal ?? 0,
    discount: o.discount ?? 0,
    total: o.total ?? 0,
  });
});

app.get("/api/orders/phone", async (req, res) => {
  const phoneRaw = String(req.query.phone || "");
  const days = Math.max(1, parseInt(req.query.days || "7", 10));
  if (!phoneRaw) return res.status(400).json({ error: "Missing phone" });

  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 3600 * 1000);
  const tail = last4(phoneRaw);

  const rows = await q(
    `SELECT id, created_at, total, status, customer_phone, meta
     FROM orders
     WHERE created_at >= $1
       AND (
         regexp_replace(customer_phone, '\D', '', 'g') = regexp_replace($2,'\D','','g')
         OR RIGHT(regexp_replace(customer_phone, '\D', '', 'g'), 4) = $3
       )
     ORDER BY created_at DESC
     LIMIT 5`,
    [from, phoneRaw, tail]
  );

  res.json({
    items: rows.map((o) => ({
      id: o.id,
      createdAt: o.created_at,
      total: o.total || 0,
      status: o.status,
      customer: { phoneMasked: maskPhone(o.customer_phone) },
      meta: { orderType: o.meta?.orderType || "TAKEAWAY" },
    })),
  });
});

app.delete("/api/orders/guest/:id", async (req, res) => {
  const tail = last4(req.query.phone || "");
  if (!tail) return res.status(400).json({ error: "Missing phone tail" });

  const o = await one(
    `SELECT id, status, customer_phone FROM orders WHERE id=$1`,
    [req.params.id]
  );
  if (!o) return res.status(404).json({ error: "Not found" });
  if (last4(o.customer_phone) !== tail)
    return res.status(403).json({ error: "Phone tail mismatch" });
  if (o.status !== "NEW")
    return res.status(409).json({ error: "Only NEW orders can be canceled" });

  const updated = await one(
    `UPDATE orders SET status='CANCELED', updated_at=NOW() WHERE id=$1 RETURNING id`,
    [o.id]
  );
  sseBroadcast({
    type: "order_updated",
    order: { id: updated.id, status: "CANCELED" },
  });
  res.json({ ok: true });
});

/* ============ Upload ============ */
app.post("/api/upload", requireAdmin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  res.json({ url: "/uploads/" + req.file.filename });
});

/* ============ Reports (Admin) ============ */
app.get("/api/reports/daily", requireAdmin, async (req, res) => {
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  let from = String(req.query.from || "");
  let to = String(req.query.to || "");
  if (!from || !to) {
    const now = new Date();
    const f = new Date(now);
    f.setDate(now.getDate() - 6); // mặc định 7 ngày
    from = ymd(f);
    to = ymd(now);
  }

  const rows = await q(
    `
    WITH days AS (
      SELECT d::date AS day
      FROM generate_series($1::date, $2::date, interval '1 day') AS t(d)
    ),
    agg AS (
      SELECT
        created_at::date AS day,
        COUNT(*) FILTER (WHERE status NOT IN ('CANCELED','CANCELLED')) AS orders,
        SUM(total)      FILTER (WHERE status = 'COMPLETED')::bigint  AS revenue,
        SUM(cost_total) FILTER (WHERE status = 'COMPLETED')::bigint  AS cost,
        SUM(profit)     FILTER (WHERE status = 'COMPLETED')::bigint  AS profit
      FROM orders
      WHERE created_at::date BETWEEN $1::date AND $2::date
      GROUP BY 1
    )
    SELECT
      to_char(days.day,'YYYY-MM-DD') AS date,
      COALESCE(agg.revenue,0) AS revenue,
      COALESCE(agg.cost,0)    AS cost,
      COALESCE(agg.profit,0)  AS profit,
      COALESCE(agg.orders,0)  AS orders
    FROM days
    LEFT JOIN agg ON agg.day = days.day
    ORDER BY days.day
    `,
    [from, to]
  );

  res.json({ items: rows });
});

app.get("/api/reports/monthly", requireAdmin, async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const rows = await q(
    `
    WITH months AS (SELECT generate_series(1,12) AS month),
    agg AS (
      SELECT
        EXTRACT(MONTH FROM created_at)::int AS month,
        COUNT(*) FILTER (WHERE status NOT IN ('CANCELED','CANCELLED')) AS orders,
        SUM(total)      FILTER (WHERE status='COMPLETED')::bigint AS revenue,
        SUM(cost_total) FILTER (WHERE status='COMPLETED')::bigint AS cost,
        SUM(profit)     FILTER (WHERE status='COMPLETED')::bigint AS profit
      FROM orders
      WHERE EXTRACT(YEAR FROM created_at) = $1
      GROUP BY 1
    )
    SELECT
      m.month,
      COALESCE(a.revenue,0) AS revenue,
      COALESCE(a.cost,0)    AS cost,
      COALESCE(a.profit,0)  AS profit,
      COALESCE(a.orders,0)  AS orders
    FROM months m
    LEFT JOIN agg a ON a.month = m.month
    ORDER BY m.month
    `,
    [year]
  );
  res.json({ items: rows });
});

app.get("/api/reports/yearly", requireAdmin, async (_req, res) => {
  const rows = await q(
    `
    SELECT
      EXTRACT(YEAR FROM created_at)::int AS year,
      SUM(total)      FILTER (WHERE status='COMPLETED')::bigint AS revenue,
      SUM(cost_total) FILTER (WHERE status='COMPLETED')::bigint AS cost,
      SUM(profit)     FILTER (WHERE status='COMPLETED')::bigint AS profit,
      COUNT(*)        FILTER (WHERE status NOT IN ('CANCELED','CANCELLED')) AS orders
    FROM orders
    GROUP BY 1
    ORDER BY 1
    `,
    []
  );
  res.json({ items: rows });
});

/* ============ Start ============ */
app.listen(PORT, () => {
  console.log(`Server (PG) http://localhost:${PORT}`);
});
