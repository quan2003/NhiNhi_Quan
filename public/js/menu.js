import { qs, create, vnd } from "./utils.js";
import { apiGet } from "./api.js";
import { addToCart, getCartCount, onCartChange } from "./cart.js";

const listEl = qs("#menuList");
const filterEl = qs("#filterCategory");
const cartBadge = document.getElementById("cartBadge");

function updateCartBadge() {
  if (!cartBadge) return;
  const n = getCartCount();
  cartBadge.textContent = n;
  cartBadge.style.display = n > 0 ? "inline-block" : "none";
}
onCartChange(() => updateCartBadge());

/* ===== Modal refs ===== */
const modal = qs("#itemModal");
const mdClose = qs("#mdClose");
const mdImg = qs("#mdImg");
const mdSpinner = qs("#modalSpinner");
const mdTitle = qs("#mdTitle");
const mdCategory = qs("#mdCategory");
const mdDesc = qs("#mdDesc");
const mdPrice = qs("#mdPrice");
const mdQtyDisplay = qs("#mdQtyDisplay");
const mdQtyDec = qs("#mdQtyDec");
const mdQtyInc = qs("#mdQtyInc");
const mdAddToCartBtn = qs("#mdAddToCartBtn");

const mdMore = qs("#mdMore");
const mdNuocChamRow = qs("#mdNuocChamRow");
const mdDoChuaRow = qs("#mdDoChuaRow");
const mdNoteRow = qs("#mdNoteRow");
const mdNuocCham = qs("#mdNuocCham");
const mdDoChua = qs("#mdDoChua");
const mdNote = qs("#mdNote");

/* focus memory for a11y */
let lastFocusEl = null;
const pageRoot = document.querySelector("main") || document.body;

/* ===== Skeleton ===== */
function renderSkeleton(n = 6) {
  if (!listEl) return;
  listEl.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const sk = document.createElement("div");
    sk.className = "skeleton";
    sk.innerHTML = `
      <div class="skel-rect"></div>
      <div class="skel-line" style="width:70%"></div>
      <div class="skel-line" style="width:40%"></div>
    `;
    listEl.appendChild(sk);
  }
}

function setCategories(categories) {
  if (!filterEl) return;
  filterEl.innerHTML = '<option value="">Tất cả</option>';
  Array.from(categories)
    .sort((a, b) => a.localeCompare(b))
    .forEach((c) => {
      const o = create("option", { value: c, text: c });
      filterEl.appendChild(o);
    });
}

/* ===== Card ===== */
function productCard(p) {
  const card = create("div", {
    class: "menu-card",
    attrs: { "data-id": p.id },
  });

  const thumb = create("div", { class: "thumb" });
  const imgSrc = p.imageUrl || p.image || "/img/placeholder.png";
  const img = create("img", {
    attrs: { src: imgSrc, alt: p.name || "", loading: "lazy" },
  });
  thumb.appendChild(img);
  if (p.category) {
    const badge = create("span", { class: "badge", text: String(p.category) });
    thumb.appendChild(badge);
  }
  card.appendChild(thumb);

  const content = create("div", { class: "content" });
  const h3 = create("h3", { text: p.name });
  h3.style.cursor = "pointer";
  h3.addEventListener("click", () => openModal(p));
  content.appendChild(h3);

  const foot = create("div", { class: "foot" });
  foot.appendChild(
    create("div", { class: "price", text: vnd(p.priceSell ?? p.price ?? 0) })
  );

  const orderBtn = create("button", {
    class: "btn primary",
    html: '<i data-lucide="plus-circle"></i> Đặt món',
  });
  orderBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    openModal(p);
  });

  foot.appendChild(orderBtn);
  content.appendChild(foot);
  card.appendChild(content);

  card.addEventListener("click", () => openModal(p));
  return card;
}

let ALL = [];
let BY_ID = new Map();

/* ===== Load menu ===== */
async function load() {
  if (!listEl) return;
  renderSkeleton();
  try {
    const ts = Date.now();
    const data = await apiGet(`/api/products?ts=${ts}`);
    ALL = (data || []).map((x) => ({
      id:
        x.id ??
        x._id ??
        x.code ??
        x.slug ??
        (crypto?.randomUUID ? crypto.randomUUID() : String(Math.random())),
      name: x.name || x.title || "Món chưa đặt tên",
      category: x.category || x.categoryName || "",
      description: x.description || "",
      brief: x.brief || "",
      priceSell: x.priceSell ?? x.price ?? x.basePrice ?? 0,
      imageUrl: x.imageUrl || x.image || x.thumbnail || "",
      nuocCham: x.nuocCham || x.sauce || "",
      doChua: x.doChua || x.pickles || "",
      ghiChu: x.ghiChu || x.note || "",
    }));

    BY_ID = new Map(ALL.map((p) => [p.id, p]));

    if (!ALL.length) {
      listEl.innerHTML =
        '<div class="card">Chưa có sản phẩm nào đang mở bán. Hãy kiểm tra mục "Kích hoạt" trong Admin & bấm Lưu.</div>';
      return;
    }

    const cats = new Set(ALL.map((p) => p.category || "Khác"));
    setCategories(cats);
    render(ALL);
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<div class="card">Lỗi tải menu: ${e.message}</div>`;
  }
  window.lucide?.createIcons?.();
}

function render(items) {
  if (!listEl) return;
  listEl.innerHTML = "";
  items.forEach((p) => listEl.appendChild(productCard(p)));
  window.lucide?.createIcons?.();
}

/* ===== Modal ===== */
function openModal(p) {
  lastFocusEl =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  mdSpinner?.classList.remove("hidden");
  mdImg?.classList.add("loading");

  let imgSrc =
    p.imageUrl?.trim?.() ||
    p.image?.trim?.() ||
    p.thumbnail?.trim?.() ||
    "/img/placeholder.png";
  if (
    imgSrc &&
    !String(imgSrc).startsWith("http") &&
    !String(imgSrc).startsWith("/") &&
    !String(imgSrc).startsWith("./") &&
    !String(imgSrc).startsWith("../")
  ) {
    imgSrc = "/img/" + imgSrc;
  }

  const pre = new Image();
  pre.src = imgSrc;
  pre.onload = () => {
    mdSpinner?.classList.add("hidden");
    mdImg?.classList.remove("loading");
    if (mdImg) {
      mdImg.src = imgSrc;
      mdImg.alt = p.name || "";
    }
  };
  pre.onerror = () => {
    mdSpinner?.classList.add("hidden");
    mdImg?.classList.remove("loading");
    if (mdImg) {
      mdImg.src = "/img/placeholder.png";
      mdImg.alt = p.name || "";
    }
  };

  if (mdTitle) mdTitle.textContent = p.name || "";
  if (mdCategory) mdCategory.textContent = p.category || "";
  if (mdDesc)
    mdDesc.textContent = p.description || "Chưa có mô tả chi tiết cho món này.";
  if (mdPrice) mdPrice.textContent = vnd(p.priceSell ?? 0);

  let qty = 1;
  if (mdQtyDisplay) mdQtyDisplay.textContent = qty;

  const nuoc = p.nuocCham || "";
  const chua = p.doChua || "";
  const note = p.ghiChu || "";

  if (mdNuocChamRow) mdNuocChamRow.style.display = nuoc ? "" : "none";
  if (mdDoChuaRow) mdDoChuaRow.style.display = chua ? "" : "none";
  if (mdNoteRow) mdNoteRow.style.display = note ? "" : "none";
  if (mdNuocCham) mdNuocCham.textContent = nuoc;
  if (mdDoChua) mdDoChua.textContent = chua;
  if (mdNote) mdNote.textContent = note;
  if (mdMore) mdMore.style.display = nuoc || chua || note ? "" : "none";

  if (mdQtyDec)
    mdQtyDec.onclick = () => {
      if (qty > 1) {
        qty--;
        if (mdQtyDisplay) mdQtyDisplay.textContent = qty;
      }
    };
  if (mdQtyInc)
    mdQtyInc.onclick = () => {
      qty++;
      if (mdQtyDisplay) mdQtyDisplay.textContent = qty;
    };
  if (mdAddToCartBtn)
    mdAddToCartBtn.onclick = () => {
      addToCart(p.id, qty);
      updateCartBadge();
      closeModal();
      window.__ui?.toast?.("Đã thêm vào giỏ", "ok");
    };

  modal?.classList.add("open");
  modal?.setAttribute("aria-hidden", "false");

  pageRoot?.setAttribute?.("inert", "");
  (mdClose || modal)?.focus?.();

  window.lucide?.createIcons?.();
}

function closeModal() {
  const active = document.activeElement;
  if (active && modal?.contains(active)) {
    active.blur();
  }

  modal?.classList.remove("open");
  modal?.setAttribute("aria-hidden", "true");
  mdSpinner?.classList.add("hidden");
  mdImg?.classList.remove("loading");

  pageRoot?.removeAttribute?.("inert");

  requestAnimationFrame(() => {
    try {
      lastFocusEl?.focus?.();
    } catch {}
    lastFocusEl = null;
  });
}

mdClose?.addEventListener("click", closeModal);
modal?.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

filterEl?.addEventListener("change", () => {
  const v = filterEl.value;
  if (!v) render(ALL);
  else render(ALL.filter((p) => (p.category || "") === v));
});

document.addEventListener("DOMContentLoaded", () => {
  if (listEl) load();
  updateCartBadge();
});
