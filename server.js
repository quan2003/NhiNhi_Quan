// server.js
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import dotenv from "dotenv";
import multer from "multer";
import webpush from "web-push";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Admin auth (đơn giản) =====
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "changeme";

// ===== Config thanh toán / QR (public) =====
const BANK_NAME = process.env.BANK_NAME || "BVBank";
const BANK_ACCOUNT_NAME = process.env.BANK_ACCOUNT_NAME || "TRUONG LUU QUAN";
const BANK_ACCOUNT_NUMBER = process.env.BANK_ACCOUNT_NUMBER || "0336440523";
const VIETQR_IMAGE = process.env.VIETQR_IMAGE || "/img/vietqr.png";

// ===== Web Push =====
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

const DB_FILE = path.join(__dirname, "db.json");

// ===== Static & middlewares =====
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

// ===== Uploads =====
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
await fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});
app.use("/uploads", express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = (
      String(file.originalname || "")
        .split(".")
        .pop() || "jpg"
    ).toLowerCase();
    const name = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    cb(null, name);
  },
});
const upload = multer({ storage });

// ===== Helpers =====
async function readDB() {
  try {
    const raw = await fs.readFile(DB_FILE, "utf-8");
    const db = JSON.parse(raw);
    if (!db.products) db.products = [];
    if (!db.orders) db.orders = [];
    if (!db.settings) db.settings = {};
    if (!db.settings.promo)
      db.settings.promo = {
        enabled: false,
        percent: 0,
        start: null,
        end: null,
      };
    if (!db.settings.push) db.settings.push = { subscriptions: [] };
    return db;
  } catch {
    return {
      products: [],
      orders: [],
      settings: {
        promo: { enabled: false, percent: 0, start: null, end: null },
        push: { subscriptions: [] },
      },
    };
  }
}
async function writeDB(db) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}
function isPromoActive(p) {
  if (!p || !p.enabled || !p.percent) return false;
  const now = new Date();
  if (p.start && now < new Date(p.start)) return false;
  if (p.end && now > new Date(p.end)) return false;
  return true;
}
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

// ===== Auth =====
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

// ===== Upload =====
app.post("/api/upload", requireAdmin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  res.json({ url: "/uploads/" + req.file.filename });
});

// ===== Settings & public config =====
app.get("/api/settings", requireAdmin, async (_req, res) => {
  res.json((await readDB()).settings);
});
app.put("/api/settings", requireAdmin, async (req, res) => {
  const db = await readDB();
  const { promo } = req.body || {};
  if (promo) {
    db.settings.promo = {
      enabled: !!promo.enabled,
      percent: Math.max(0, Math.min(100, Number(promo.percent) || 0)),
      start: promo.start || null,
      end: promo.end || null,
    };
  }
  await writeDB(db);
  res.json(db.settings);
});
app.get("/api/config", async (_req, res) => {
  const db = await readDB();
  res.json({
    bankName: BANK_NAME,
    bankAccountName: BANK_ACCOUNT_NAME,
    bankAccountNumber: BANK_ACCOUNT_NUMBER,
    promo: db.settings?.promo || {
      enabled: false,
      percent: 0,
      start: null,
      end: null,
    },
    promoActive: isPromoActive(db.settings?.promo),
    qrFixedImage: VIETQR_IMAGE,
  });
});

// ===== Products =====
app.get("/api/products", async (_req, res) =>
  res.json((await readDB()).products.filter((p) => p.active !== false))
);
app.get("/api/admin/products", requireAdmin, async (_req, res) =>
  res.json((await readDB()).products)
);
app.get("/api/products/:id", async (req, res) => {
  const db = await readDB();
  const p = db.products.find((x) => x.id === req.params.id);
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
  } = req.body || {};
  if (!name || priceSell == null || priceCost == null)
    return res.status(400).json({ error: "Thiếu trường bắt buộc" });
  const db = await readDB();
  const p = {
    id: nanoid(10).toUpperCase(),
    name,
    category: category || "Khác",
    priceSell: +priceSell,
    priceCost: +priceCost,
    unit: unit || "phần",
    active: !!active,
    imageUrl: imageUrl || "",
    description: description || "",
    createdAt: new Date().toISOString(),
  };
  db.products.push(p);
  await writeDB(db);
  res.json(p);
});
app.put("/api/products/:id", requireAdmin, async (req, res) => {
  const db = await readDB();
  const idx = db.products.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.products[idx] = {
    ...db.products[idx],
    ...req.body,
    updatedAt: new Date().toISOString(),
  };
  await writeDB(db);
  res.json(db.products[idx]);
});
app.delete("/api/products/:id", requireAdmin, async (req, res) => {
  const db = await readDB();
  const idx = db.products.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const removed = db.products.splice(idx, 1)[0];
  await writeDB(db);
  res.json(removed);
});

// ===== Orders + SSE + Push =====
const AllowedStatus = ["NEW", "IN_PROGRESS", "COMPLETED", "CANCELED"];
const AllowedOrderTypes = ["TAKEAWAY", "TAKE_AWAY", "DINE_IN", "RESERVE"];

// SSE
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

// Push helpers
async function addPushSubscription(sub) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const db = await readDB();
  const list = db.settings.push.subscriptions || [];
  if (!list.find((x) => x?.endpoint === sub?.endpoint)) {
    list.push(sub);
    db.settings.push.subscriptions = list;
    await writeDB(db);
  }
}
async function removePushSubscription(endpoint) {
  const db = await readDB();
  db.settings.push.subscriptions = (
    db.settings.push.subscriptions || []
  ).filter((x) => x?.endpoint !== endpoint);
  await writeDB(db);
}
async function sendPushToAll(payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const db = await readDB();
  const list = db.settings.push.subscriptions || [];
  if (!list.length) return;
  const dead = [];
  await Promise.all(
    list.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload), {
          TTL: PUSH_TTL,
          urgency: PUSH_URGENCY,
          topic: PUSH_TOPIC,
        });
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410)
          dead.push(sub?.endpoint);
        else console.warn("Push error:", e?.statusCode, e?.message);
      }
    })
  );
  if (dead.length) {
    db.settings.push.subscriptions = list.filter(
      (x) => !dead.includes(x?.endpoint)
    );
    await writeDB(db);
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
  await removePushSubscription(req.body?.endpoint);
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

// Create (public + admin). Admin DINE_IN có thể chỉ nhập số bàn.
app.post("/api/orders", async (req, res) => {
  try {
    const body = req.body || {};
    const meta = body.meta || {};
    const customer = body.customer || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const paymentMethod = body.paymentMethod;

    const isAdmin = (req.headers["x-admin-token"] || "") === ADMIN_TOKEN;

    // orderType
    let orderType = (meta.orderType || "TAKEAWAY")
      .toUpperCase()
      .replace("-", "_");
    if (!AllowedOrderTypes.includes(orderType)) {
      return res.status(400).json({ error: "orderType không hợp lệ" });
    }

    const minimalDineIn =
      isAdmin && orderType === "DINE_IN" && !!meta.tableNumber;

    if (!items.length) return res.status(400).json({ error: "Thiếu món" });

    const nameRaw = String(customer.name || "").trim();
    const phoneRaw = String(customer.phone || "").replace(/\D/g, "");

    if (!minimalDineIn && (!nameRaw || !phoneRaw)) {
      return res.status(400).json({ error: "Thiếu thông tin khách" });
    }
    if (orderType === "RESERVE" && !meta.scheduleAt) {
      return res
        .status(400)
        .json({ error: "RESERVE cần thời gian đến (scheduleAt)" });
    }

    const db = await readDB();

    // Tính tiền từ DB (không tin vào giá client)
    let subtotal = 0,
      costTotal = 0;
    const normalizedItems = [];
    for (const it of items) {
      const prod = db.products.find((p) => p.id === it.productId);
      if (!prod)
        return res
          .status(400)
          .json({ error: "Sản phẩm không tồn tại: " + it.productId });
      const qty = Math.max(1, +it.qty || 1);
      subtotal += prod.priceSell * qty;
      costTotal += prod.priceCost * qty;
      normalizedItems.push({
        productId: prod.id,
        name: prod.name,
        priceSell: prod.priceSell,
        priceCost: prod.priceCost,
        qty,
        ...(it.note ? { note: String(it.note) } : {}),
      });
    }

    const promo = db.settings?.promo || { enabled: false, percent: 0 };
    const promoActive = isPromoActive(promo);
    const discount = promoActive
      ? Math.round((subtotal * (promo.percent || 0)) / 100)
      : 0;
    const total = Math.max(0, subtotal - discount);
    const profit = total - costTotal;

    const customerFinal = {
      name: nameRaw || `Bàn ${meta.tableNumber}`,
      phone: phoneRaw || "",
      address: String(customer.address || ""),
    };

    const order = {
      id: nanoid(12).toUpperCase(),
      status: "NEW",
      customer: customerFinal,
      paymentMethod: paymentMethod === "TRANSFER" ? "TRANSFER" : "COD",
      items: normalizedItems,
      subtotal,
      discount,
      total,
      costTotal,
      profit,
      promoSnapshot: { active: !!promoActive, percent: promo?.percent || 0 },
      meta: {
        orderType,
        tableNumber: meta.tableNumber || "",
        guests: Number(meta.guests || 0) || 0,
        scheduleAt: meta.scheduleAt || null,
        note: meta.note || "",
      },
      createdAt: new Date().toISOString(),
    };

    db.orders.unshift(order);
    await writeDB(db);

    // SSE + Push
    sseBroadcast({ type: "new_order", order });
    (async () => {
      try {
        const totalVnd = (order.total || 0).toLocaleString("vi-VN") + "₫";
        await sendPushToAll({
          type: "new_order",
          notification: {
            title: "Đơn mới!",
            body: `Mã: ${order.id}\nTổng: ${totalVnd}\n${
              order?.customer?.name || ""
            }`,
            data: { orderId: order.id },
          },
        });
      } catch (e) {
        console.warn("sendPushToAll error:", e?.message);
      }
    })();

    res.json({
      ok: true,
      id: order.id,
      orderId: order.id,
      total: order.total,
      discount: order.discount,
      subtotal: order.subtotal,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// ===== LIST (admin) — CẦN route này để trang admin load bảng =====
app.get("/api/orders", requireAdmin, async (req, res) => {
  const { status, page = 1, pageSize = 10, q = "" } = req.query;
  const db = await readDB();

  let list = [...db.orders];

  if (status) {
    const s = String(status).toUpperCase();
    if (AllowedStatus.includes(s)) list = list.filter((o) => o.status === s);
  }

  if (q) {
    const s = String(q).trim().toLowerCase();
    list = list.filter(
      (o) =>
        o.id.toLowerCase().includes(s) ||
        (o.customer?.name || "").toLowerCase().includes(s) ||
        (o.customer?.phone || "").toLowerCase().includes(s)
    );
  }

  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const p = Math.max(1, parseInt(page, 10));
  const ps = Math.max(1, parseInt(pageSize, 10));
  const start = (p - 1) * ps;
  const end = start + ps;

  res.json({
    page: p,
    pageSize: ps,
    total: list.length,
    items: list.slice(start, end),
  });
});

// ===== Update / Delete / Invoices =====
app.put("/api/orders/:id", requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (status && !AllowedStatus.includes(status))
    return res.status(400).json({ error: "Trạng thái không hợp lệ" });

  const db = await readDB();
  const idx = db.orders.findIndex((o) => sameId(o.id, req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  db.orders[idx] = {
    ...db.orders[idx],
    ...req.body,
    updatedAt: new Date().toISOString(),
  };
  await writeDB(db);
  sseBroadcast({ type: "order_updated", order: db.orders[idx] });
  res.json(db.orders[idx]);
});
app.delete("/api/orders/:id", requireAdmin, async (req, res) => {
  const db = await readDB();
  const idx = db.orders.findIndex((o) => sameId(o.id, req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const removed = db.orders.splice(idx, 1)[0];
  await writeDB(db);
  sseBroadcast({ type: "order_deleted", orderId: removed.id });
  res.json({ ok: true, removedId: removed.id });
});

app.get("/api/orders/invoice/:id", requireAdmin, async (req, res) => {
  const db = await readDB();
  const o = db.orders.find((x) => sameId(x.id, req.params.id));
  if (!o) return res.status(404).json({ error: "Không tìm thấy đơn" });
  if (o.status !== "COMPLETED")
    return res.status(403).json({ error: "Đơn chưa hoàn tất" });
  res.json({
    id: o.id,
    createdAt: o.createdAt,
    status: o.status,
    paymentMethod: o.paymentMethod,
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
  const db = await readDB();
  const o = db.orders.find((x) => sameId(x.id, req.params.id));
  if (!o) return res.status(404).json({ error: "Không tìm thấy đơn" });
  if (last4(o.customer?.phone) !== tail)
    return res.status(403).json({ error: "Phone tail mismatch" });
  if (o.status !== "COMPLETED")
    return res.status(403).json({ error: "Đơn chưa hoàn tất" });
  res.json({
    id: o.id,
    createdAt: o.createdAt,
    status: o.status,
    paymentMethod: o.paymentMethod,
    customer: {
      name: o.customer?.name || "",
      phoneMasked: maskPhone(o.customer?.phone),
    },
    meta: o.meta || {},
    items: o.items || [],
    subtotal: o.subtotal ?? 0,
    discount: o.discount ?? 0,
    total: o.total ?? 0,
  });
});

// ===== Lookup & Phone list & Guest cancel =====
app.get("/api/orders/lookup", async (req, res) => {
  const id = String(req.query.id || "").trim();
  const tail = last4(req.query.phone || "");
  if (!id || !tail)
    return res.status(400).json({ error: "MISSING_ID_OR_PHONE" });

  const db = await readDB();
  const o = db.orders.find((x) => sameId(x.id, id));
  if (!o) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
  if (last4(o.customer?.phone) !== tail)
    return res.status(403).json({ error: "PHONE_TAIL_MISMATCH" });

  res.json({
    id: o.id,
    status: o.status,
    createdAt: o.createdAt,
    paymentMethod: o.paymentMethod,
    customer: {
      name: o.customer?.name || "",
      phoneMasked: maskPhone(o.customer?.phone),
    },
    meta: {
      orderType: o.meta?.orderType || "TAKEAWAY",
      tableNumber: o.meta?.tableNumber || "",
      guests: Number(o.meta?.guests || 0) || 0,
      scheduleAt: o.meta?.scheduleAt || null,
      note: o.meta?.note || "",
    },
    items: (o.items || []).map((it) => ({
      name: it.name,
      qty: it.qty,
      priceSell: it.priceSell,
      lineTotal: (it.priceSell || 0) * (it.qty || 0),
    })),
    subtotal: o.subtotal ?? 0,
    discount: o.discount ?? 0,
    total: o.total ?? 0,
  });
});

// GET /api/orders/phone?phone=0523&days=7
app.get("/api/orders/phone", async (req, res) => {
  const phoneRaw = String(req.query.phone || "");
  const days = Math.max(1, parseInt(req.query.days || "7", 10));
  if (!phoneRaw) return res.status(400).json({ error: "Missing phone" });

  const now = Date.now();
  const from = now - days * 24 * 3600 * 1000;
  const tail = last4(phoneRaw);

  const db = await readDB();
  const items = db.orders
    .filter((o) => {
      const t = new Date(o.createdAt).getTime();
      if (!(t >= from)) return false;
      const fullMatch =
        String(o.customer?.phone || "").replace(/\D/g, "") ===
        String(phoneRaw).replace(/\D/g, "");
      const tailMatch = last4(o.customer?.phone) === tail;
      return fullMatch || tailMatch;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
    .map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      total: o.total || 0,
      status: o.status,
      customer: { phoneMasked: maskPhone(o.customer?.phone) },
      meta: { orderType: o.meta?.orderType || "TAKEAWAY" },
    }));

  res.json({ items });
});

// DELETE /api/orders/guest/:id?phone=0523
app.delete("/api/orders/guest/:id", async (req, res) => {
  const tail = last4(req.query.phone || "");
  if (!tail) return res.status(400).json({ error: "Missing phone tail" });

  const db = await readDB();
  const idx = db.orders.findIndex((o) => sameId(o.id, req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  const o = db.orders[idx];
  if (last4(o.customer?.phone) !== tail)
    return res.status(403).json({ error: "Phone tail mismatch" });
  if (o.status !== "NEW")
    return res.status(409).json({ error: "Only NEW orders can be canceled" });

  db.orders[idx].status = "CANCELED";
  db.orders[idx].updatedAt = new Date().toISOString();
  await writeDB(db);
  try {
    sseBroadcast({ type: "order_updated", order: db.orders[idx] });
  } catch {}
  res.json({ ok: true });
});

// ===== Reports =====
function yyyymmdd(d) {
  const y = d.getFullYear(),
    m = String(d.getMonth() + 1).padStart(2, "0"),
    day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function localDateFromYmd(s) {
  const [y, m, d] = String(s || "")
    .split("-")
    .map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}
app.get("/api/reports/daily", requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.json({ items: [] });

    const fromD = localDateFromYmd(from);
    const toD = localDateFromYmd(to);

    const days = [];
    for (
      let d = new Date(fromD);
      d <= toD;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    ) {
      days.push(yyyymmdd(d));
    }
    const map = new Map(
      days.map((k) => [k, { revenue: 0, cost: 0, orders: 0 }])
    );

    const db = await readDB();
    for (const o of db.orders || []) {
      const key = yyyymmdd(new Date(o.createdAt));
      if (!map.has(key)) continue;
      const x = map.get(key);
      x.revenue += Number(o.total || 0);
      x.cost += Number(o.costTotal || 0);
      x.orders += 1;
    }

    const items = days.map((date) => {
      const x = map.get(date);
      return {
        date,
        revenue: Math.round(x.revenue),
        cost: Math.round(x.cost),
        profit: Math.round(x.revenue - x.cost),
        orders: x.orders,
      };
    });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});
app.get("/api/reports/monthly", requireAdmin, async (req, res) => {
  try {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    const buckets = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      revenue: 0,
      cost: 0,
      orders: 0,
    }));
    const db = await readDB();
    for (const o of db.orders || []) {
      const d = new Date(o.createdAt);
      if (d.getFullYear() !== year) continue;
      const b = buckets[d.getMonth()];
      b.revenue += Number(o.total || 0);
      b.cost += Number(o.costTotal || 0);
      b.orders += 1;
    }
    const items = buckets.map((b) => ({
      month: b.month,
      revenue: Math.round(b.revenue),
      cost: Math.round(b.cost),
      profit: Math.round(b.revenue - b.cost),
      orders: b.orders,
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});
app.get("/api/reports/yearly", requireAdmin, async (_req, res) => {
  try {
    const db = await readDB();
    const map = new Map();
    for (const o of db.orders || []) {
      const y = new Date(o.createdAt).getFullYear();
      const cur = map.get(y) || { revenue: 0, cost: 0, orders: 0 };
      cur.revenue += Number(o.total || 0);
      cur.cost += Number(o.costTotal || 0);
      cur.orders += 1;
      map.set(y, cur);
    }
    const items = [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, x]) => ({
        year,
        revenue: Math.round(x.revenue),
        profit: Math.round(x.revenue - x.cost),
        orders: x.orders,
      }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// ===== Start =====
app.listen(PORT, () => {
  console.log(`Server http://localhost:${PORT}`);
});
