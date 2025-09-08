import { qs, create, vnd } from "./utils.js";
import { apiGet } from "./api.js";
import { addToCart, getCartCount } from "./cart.js";

const listEl = qs("#menuList");
const filterEl = qs("#filterCategory");
const cartCountEl = document.getElementById("cartCount");
const cartBadge = document.getElementById("cartBadge");

function updateCartBadge() {
  if (cartBadge) {
    const n = getCartCount();
    cartBadge.textContent = n;
    cartBadge.style.display = n > 0 ? "inline-block" : "none";
  }
}

// ===== Modal refs =====
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

function renderSkeleton(n = 6) {
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
  filterEl.innerHTML = '<option value="">Tất cả</option>';
  Array.from(categories)
    .sort((a, b) => a.localeCompare(b))
    .forEach((c) => {
      const o = create("option", { value: c, text: c });
      filterEl.appendChild(o);
    });
}

// ====== Card with image + click to open modal ======
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
    const badge = create("span", {
      class: "badge",
      text: String(p.category),
    });
    thumb.appendChild(badge);
  }
  card.appendChild(thumb);

  const content = create("div", { class: "content" });
  content.appendChild(create("h3", { text: p.name }));
  if (p.brief)
    content.appendChild(create("div", { class: "brief", text: p.brief }));
  else if (p.description)
    content.appendChild(
      create("div", {
        class: "brief",
        text: String(p.description).slice(0, 96),
      })
    );

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

async function load() {
  renderSkeleton();
  try {
    const ts = Date.now();
    const data = await apiGet(`/api/products?ts=${ts}`);
    console.log("[menu] /api/products:", data);

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
      listEl.innerHTML = `<div class="card">Chưa có sản phẩm nào đang mở bán. Hãy kiểm tra mục "Kích hoạt" trong Admin & bấm Lưu.</div>`;
      return;
    }

    const cats = new Set(ALL.map((p) => p.category || "Khác"));
    setCategories(cats);
    render(ALL);
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<div class="card">Lỗi tải menu: ${e.message}</div>`;
  }
  if (window.lucide) window.lucide.createIcons();
}

function render(items) {
  listEl.innerHTML = "";
  items.forEach((p) => listEl.appendChild(productCard(p)));
  if (window.lucide) window.lucide.createIcons();
}

filterEl?.addEventListener("change", () => {
  const v = filterEl.value;
  if (!v) render(ALL);
  else render(ALL.filter((p) => (p.category || "") === v));
});

// ===== Modal logic =====
function openModal(p) {
  mdSpinner.classList.remove("hidden");
  mdImg.classList.add("loading");

  let imgSrc =
    p.imageUrl && p.imageUrl.trim()
      ? p.imageUrl
      : p.image && p.image.trim()
      ? p.image
      : p.thumbnail && p.thumbnail.trim()
      ? p.thumbnail
      : "/img/placeholder.png";

  if (
    imgSrc &&
    !imgSrc.startsWith("http") &&
    !imgSrc.startsWith("/") &&
    !imgSrc.startsWith("./") &&
    !imgSrc.startsWith("../")
  ) {
    imgSrc = "/img/" + imgSrc;
  }

  const img = new Image();
  img.src = imgSrc;
  img.onload = () => {
    mdSpinner.classList.add("hidden");
    mdImg.classList.remove("loading");
    mdImg.src = imgSrc;
    mdImg.alt = p.name || "";
  };
  img.onerror = () => {
    mdSpinner.classList.add("hidden");
    mdImg.classList.remove("loading");
    mdImg.src = "/img/placeholder.png";
    mdImg.alt = p.name || "";
  };

  mdImg.style.background = "none";

  mdTitle.textContent = p.name || "";
  mdCategory.textContent = p.category || "";
  mdDesc.textContent = p.description || "Chưa có mô tả chi tiết cho món này.";
  mdPrice.textContent = vnd(p.priceSell ?? 0);
  let qty = 1;
  mdQtyDisplay.textContent = qty;

  const nuoc = p.nuocCham || "";
  const chua = p.doChua || "";
  const note = p.ghiChu || "";

  mdNuocChamRow.style.display = nuoc ? "" : "none";
  mdDoChuaRow.style.display = chua ? "" : "none";
  mdNoteRow.style.display = note ? "" : "none";
  mdNuocCham.textContent = nuoc;
  mdDoChua.textContent = chua;
  mdNote.textContent = note;

  mdMore.style.display = nuoc || chua || note ? "" : "none";

  mdQtyDec.onclick = () => {
    if (qty > 1) {
      qty--;
      mdQtyDisplay.textContent = qty;
    }
  };
  mdQtyInc.onclick = () => {
    qty++;
    mdQtyDisplay.textContent = qty;
  };

  mdAddToCartBtn.onclick = () => {
    mdAddToCartBtn.style.animation = "shake 0.3s ease";
    setTimeout(() => {
      mdAddToCartBtn.style.animation = "";
    }, 300);

    addToCart(p.id, qty);
    updateCartBadge(); // ✅ cập nhật badge
    closeModal();
    window.__ui?.toast?.("Đã thêm vào giỏ", "ok");
  };

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  if (window.lucide) window.lucide.createIcons();
}

function closeModal() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  mdSpinner.classList.add("hidden");
  mdImg.classList.remove("loading");
}

mdClose?.addEventListener("click", closeModal);
modal?.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
document.addEventListener("DOMContentLoaded", () => {
  load();
  updateCartBadge(); // ✅ khi load trang, đọc lại từ localStorage
});
