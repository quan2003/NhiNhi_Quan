// server.js
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import dotenv from "dotenv";
import multer from "multer";
import webpush from "web-push"; // <— Web Push

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

// Cấu hình web-push (nếu có key)
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  console.log("Web Push: VAPID configured");
} else {
  console.warn("Web Push: VAPID_PUBLIC/PRIVATE not set — push disabled");
}

const DB_FILE = path.join(__dirname, "db.json");

// ===== Static & middleware =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin")));

const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
await fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});
app.use("/uploads", express.static(UPLOAD_DIR));

// Multer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext =
      String(file.originalname || "")
        .split(".")
        .pop() || "jpg";
    const name =
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2, 8) +
      "." +
      ext.toLowerCase();
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
    if (!db.settings.promo) {
      db.settings.promo = {
        enabled: false,
        percent: 0,
        start: null,
        end: null,
      };
    }
    if (!db.settings.push) {
      db.settings.push = { subscriptions: [] };
    } else if (!Array.isArray(db.settings.push.subscriptions)) {
      db.settings.push.subscriptions = [];
    }
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
function maskPhone(p) {
  if (!p) return "";
  const d = String(p).replace(/\D/g, "");
  return d.length <= 4
    ? d
    : "•".repeat(Math.max(0, d.length - 4)) + d.slice(-4);
}
function last4(p) {
  return String(p || "")
    .replace(/\D/g, "")
    .slice(-4);
}
function dstr(d) {
  const y = d.getFullYear(),
    m = String(d.getMonth() + 1).padStart(2, "0"),
    day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function sameId(a, b) {
  return String(a || "").toUpperCase() === String(b || "").toUpperCase();
} // <— so khớp id KHÔNG phân biệt hoa/thường

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
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    res.json({ url: "/uploads/" + req.file.filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Settings =====
app.get("/api/settings", requireAdmin, async (_req, res) => {
  const db = await readDB();
  res.json(db.settings);
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

// ===== Config (public) =====
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
app.get("/api/products", async (_req, res) => {
  const db = await readDB();
  res.json(db.products.filter((p) => p.active !== false));
});
app.get("/api/admin/products", requireAdmin, async (_req, res) => {
  const db = await readDB();
  res.json(db.products);
});
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
    nuocCham,
    doChua,
    ghiChu,
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
    nuocCham: nuocCham || "",
    doChua: doChua || "",
    ghiChu: ghiChu || "",
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

// ===== Orders =====
const AllowedStatus = ["NEW", "IN_PROGRESS", "COMPLETED", "CANCELED"];
const AllowedOrderTypes = ["TAKEAWAY", "TAKE_AWAY", "DINE_IN", "RESERVE"];

// ---- Web Push helpers ----
async function addPushSubscription(sub) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return; // disabled
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
  const list = db.settings.push.subscriptions || [];
  db.settings.push.subscriptions = list.filter((x) => x?.endpoint !== endpoint);
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
        await webpush.sendNotification(sub, JSON.stringify(payload));
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          dead.push(sub?.endpoint);
        } else {
          console.warn("Push error:", e?.statusCode, e?.message);
        }
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

// ---- Push routes ----
app.get("/api/push/publicKey", requireAdmin, (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC || "" });
});
app.post("/api/push/subscribe", requireAdmin, async (req, res) => {
  try {
    await addPushSubscription(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/push/unsubscribe", requireAdmin, async (req, res) => {
  try {
    await removePushSubscription(req.body?.endpoint);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

// ==== SSE: stream đơn mới cho trang admin (auth qua query token) ====
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

// ===== Create Order =====
app.post("/api/orders", async (req, res) => {
  const { customer, items, paymentMethod, meta } = req.body || {};
  if (
    !customer ||
    !customer.name ||
    !customer.phone ||
    !items ||
    !items.length
  ) {
    return res.status(400).json({ error: "Thiếu thông tin đơn hàng" });
  }
  const db = await readDB();

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
    });
  }

  const promo = db.settings?.promo || { enabled: false, percent: 0 };
  const promoActive = promo && promo.enabled && isPromoActive(promo);
  const discount = promoActive
    ? Math.round((subtotal * (promo.percent || 0)) / 100)
    : 0;
  const total = Math.max(0, subtotal - discount);
  const profit = total - costTotal;

  let orderType = (meta?.orderType || "TAKEAWAY")
    .toUpperCase()
    .replace("-", "_");
  if (!AllowedOrderTypes.includes(orderType))
    return res.status(400).json({ error: "orderType không hợp lệ" });
  if (orderType === "RESERVE" && !meta?.scheduleAt)
    return res
      .status(400)
      .json({ error: "RESERVE cần thời gian đến (scheduleAt)" });

  const order = {
    id: nanoid(12).toUpperCase(),
    status: "NEW",
    customer: {
      name: customer.name,
      phone: customer.phone,
      address: customer.address || "",
    },
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
      tableNumber: meta?.tableNumber || "",
      guests: Number(meta?.guests || 0) || 0,
      scheduleAt: meta?.scheduleAt || null,
      note: meta?.note || "",
    },
    createdAt: new Date().toISOString(),
  };

  db.orders.unshift(order);
  await writeDB(db);

  // Realtime cho trang admin
  sseBroadcast({ type: "new_order", order });

  // Gửi push (không chặn phản hồi nếu lỗi)
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
    orderId: order.id,
    total: order.total,
    discount: order.discount,
    subtotal: order.subtotal,
  });
});

// ===== Query Orders =====
app.get("/api/orders", requireAdmin, async (req, res) => {
  const { status, page = 1, pageSize = 10 } = req.query;
  const db = await readDB();
  let list = [...db.orders];
  if (status) {
    const s = String(status).toUpperCase();
    if (AllowedStatus.includes(s)) list = list.filter((o) => o.status === s);
  }
  const p = Math.max(1, parseInt(page));
  const ps = Math.max(1, parseInt(pageSize));
  const start = (p - 1) * ps;
  const end = start + ps;
  res.json({
    page: p,
    pageSize: ps,
    total: list.length,
    items: list.slice(start, end),
  });
});

// ===== Update/Delete/Tracking/Reports (giữ nguyên) =====
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
  res.json(db.orders[idx]);
});

app.delete("/api/orders/:id", requireAdmin, async (req, res) => {
  const db = await readDB();
  const idx = db.orders.findIndex((o) => sameId(o.id, req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const removed = db.orders.splice(idx, 1)[0];
  await writeDB(db);
  res.json({ ok: true, removedId: removed.id });
});

app.get("/api/orders/public/:id", async (req, res) => {
  const db = await readDB();
  const o = db.orders.find((x) => sameId(x.id, req.params.id));
  if (!o) return res.status(404).json({ error: "Không tìm thấy đơn" });
  res.json({
    id: o.id,
    status: o.status,
    total: o.total,
    discount: o.discount || 0,
    subtotal: o.subtotal || o.total,
    paymentMethod: o.paymentMethod,
    createdAt: o.createdAt,
    customer: {
      name: o.customer.name,
      phoneMasked: maskPhone(o.customer.phone),
    },
    meta: o.meta || {},
    itemCount: (o.items || []).reduce((s, i) => s + (i.qty || 0), 0),
  });
});

app.get("/api/orders/lookup", async (req, res) => {
  const { id, phone } = req.query || {};
  if (!id || !phone) return res.status(400).send("Missing id or phone");
  const db = await readDB();
  const o = db.orders.find((x) => sameId(x.id, id));
  if (!o) return res.status(404).send("Order not found");
  if (last4(o.customer?.phone) !== String(phone).slice(-4))
    return res.status(403).send("Phone tail mismatch");
  res.json({
    id: o.id,
    status: o.status,
    total: o.total,
    discount: o.discount || 0,
    subtotal: o.subtotal ?? o.total,
    paymentMethod: o.paymentMethod,
    createdAt: o.createdAt,
    customer: {
      name: o.customer?.name || "",
      phoneMasked: maskPhone(o.customer?.phone || ""),
    },
    meta: o.meta || {},
    items: o.items || [],
  });
});

app.delete("/api/orders/guest/:id", async (req, res) => {
  const { id } = req.params;
  const { phone } = req.query || {};
  if (!id || !phone) return res.status(400).send("Missing id or phone");
  const db = await readDB();
  const idx = db.orders.findIndex((x) => sameId(x.id, id));
  if (idx === -1) return res.status(404).send("Order not found");
  const o = db.orders[idx];
  if (last4(o.customer?.phone) !== String(phone).slice(-4))
    return res.status(403).send("Phone tail mismatch");
  if (o.status !== "NEW")
    return res.status(409).send("Order cannot be canceled");
  o.status = "CANCELED";
  o.updatedAt = new Date().toISOString();
  db.orders[idx] = o;
  await writeDB(db);
  res.json({ id: o.id, status: o.status });
});

app.get("/api/reports/daily", requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  const db = await readDB();
  const map = new Map();
  db.orders.forEach((o) => {
    if (o.status === "CANCELED") return;
    const ds = dstr(new Date(o.createdAt));
    if (from && ds < from) return;
    if (to && ds > to) return;
    const cur = map.get(ds) || { revenue: 0, cost: 0, profit: 0, orders: 0 };
    cur.revenue += o.total || 0;
    cur.cost += o.costTotal || 0;
    cur.profit +=
      o.profit != null ? o.profit : (o.total || 0) - (o.costTotal || 0);
    cur.orders += 1;
    map.set(ds, cur);
  });
  const items = Array.from(map.keys())
    .sort()
    .map((k) => ({ date: k, ...map.get(k) }));
  res.json({ items });
});
app.get("/api/reports/monthly", requireAdmin, async (req, res) => {
  const year = parseInt(req.query.year || String(new Date().getFullYear()), 10);
  const db = await readDB();
  const sums = Array.from({ length: 12 }, () => ({
    revenue: 0,
    cost: 0,
    profit: 0,
    orders: 0,
  }));
  db.orders.forEach((o) => {
    const d = new Date(o.createdAt);
    if (d.getFullYear() !== year) return;
    if (o.status === "CANCELED") return;
    const m = d.getMonth();
    sums[m].revenue += o.total || 0;
    sums[m].cost += o.costTotal || 0;
    sums[m].profit +=
      o.profit != null ? o.profit : (o.total || 0) - (o.costTotal || 0);
    sums[m].orders += 1;
  });
  res.json({ year, items: sums.map((s, i) => ({ month: i + 1, ...s })) });
});
app.get("/api/reports/yearly", requireAdmin, async (_req, res) => {
  const db = await readDB();
  const byYear = new Map();
  db.orders.forEach((o) => {
    if (o.status === "CANCELED") return;
    const y = new Date(o.createdAt).getFullYear();
    const cur = byYear.get(y) || { revenue: 0, cost: 0, profit: 0, orders: 0 };
    cur.revenue += o.total || 0;
    cur.cost += o.costTotal || 0;
    cur.profit +=
      o.profit != null ? o.profit : (o.total || 0) - (o.costTotal || 0);
    cur.orders += 1;
    byYear.set(y, cur);
  });
  const items = Array.from(byYear.keys())
    .sort((a, b) => a - b)
    .map((y) => ({ year: y, ...byYear.get(y) }));
  res.json({ items });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
