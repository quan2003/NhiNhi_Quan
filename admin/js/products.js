// ===== Products Admin — Danh sách nâng cấp: tìm, lọc, sort, phân trang =====
(async function () {
  /* =================== Toast unify (giống orders.js) =================== */
  // Ưu tiên __ui.toast nếu có; nếu không, tạo fallback nhỏ và bọc window.toast.*
  (function () {
    if (window.__ui?.toast) {
      // mapping cũ -> mới
      window.toast = window.toast || {};
      window.toast.success = (m) => window.__ui.toast(m, "ok");
      window.toast.warning = (m) => window.__ui.toast(m, "warn", 1600);
      window.toast.error = (m) => window.__ui.toast(m, "error", 2000);
      window.toast.info = (m) => window.__ui.toast(m, "info");
      return;
    }
    // Fallback mini toast
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;left:50%;bottom:12px;transform:translateX(-50%);background:#111827;border:1px solid rgba(148,163,184,.18);color:#e5e7eb;padding:10px 14px;border-radius:10px;box-shadow:0 10px 24px rgba(2,6,23,.35);font-size:14px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:9999";
    document.body.appendChild(el);
    function pop(msg, ms = 1400) {
      el.textContent = String(msg || "");
      el.classList.add("__show");
      el.style.opacity = "1";
      el.style.transform = "translateX(-50%) translateY(-4px)";
      clearTimeout(pop._t);
      pop._t = setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateX(-50%)";
      }, ms);
    }
    function t(msg, type = "info", ms) {
      const d =
        typeof ms === "number"
          ? ms
          : type === "error"
          ? 2000
          : type === "warn"
          ? 1600
          : 1400;
      pop(msg, d);
    }
    // gắn __ui.toast
    window.__ui = window.__ui || {};
    window.__ui.toast = t;
    // tương thích window.toast.*
    window.toast = window.toast || {};
    window.toast.success = (m) => t(m, "ok");
    window.toast.warning = (m) => t(m, "warn");
    window.toast.error = (m) => t(m, "error");
    window.toast.info = (m) => t(m, "info");
  })();

  // Shorthand notify — luôn về 1 nơi duy nhất
  const N = {
    ok: (m) => window.__ui.toast(m, "ok"),
    warn: (m) => window.__ui.toast(m, "warn", 1600),
    err: (m) => window.__ui.toast(m, "error", 2000),
    info: (m) => window.__ui.toast(m, "info"),
  };

  /* =================== Modal confirm (giống orders.js) =================== */
  // HTML modal đã được nhúng ngay trong products.html (id=confirmBackdrop)
  window.showConfirm = function (
    title,
    message,
    okText = "OK",
    cancelText = "Huỷ"
  ) {
    const back = document.getElementById("confirmBackdrop");
    const tEl = document.getElementById("confirmTitle");
    const mEl = document.getElementById("confirmMsg");
    const okBtn = document.getElementById("confirmOk");
    const cBtn = document.getElementById("confirmCancel");

    tEl.textContent = title || "Xác nhận";
    mEl.textContent = message || "";
    okBtn.textContent = okText;
    cBtn.textContent = cancelText;
    back.style.display = "flex";
    back.setAttribute("aria-hidden", "false");

    return new Promise((res) => {
      const done = (v) => {
        back.style.display = "none";
        back.setAttribute("aria-hidden", "true");
        cleanup();
        res(v);
      };
      const onKey = (e) => {
        if (e.key === "Escape") done(false);
      };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      function cleanup() {
        okBtn.removeEventListener("click", onOk);
        cBtn.removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKey);
      }
      okBtn.addEventListener("click", onOk);
      cBtn.addEventListener("click", onCancel);
      document.addEventListener("keydown", onKey);
    });
  };

  /* =================== Broadcast tới index để refresh =================== */
  let bch = null;
  try {
    bch = new BroadcastChannel("admin-update");
  } catch {}
  function pingIndex() {
    try {
      bch?.postMessage("refresh-index");
    } catch {}
  }

  /* =================== Upload helper =================== */
  async function uploadImage(file) {
    if (!file) throw new Error("Chưa chọn file ảnh");
    const fd = new FormData();
    fd.append("file", file);
    const res = await window.__adminFetchRaw("/api/upload", {
      method: "POST",
      body: fd,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || "Upload failed");
    return JSON.parse(text); // { url }
  }

  /* =================== DOM refs =================== */
  const tblBody = document.querySelector("#tbl tbody");
  const qInput = document.getElementById("q");
  const fCat = document.getElementById("fCat");
  const fActive = document.getElementById("fActive");
  const sortSel = document.getElementById("sort");
  const prevBtn = document.getElementById("prev");
  const nextBtn = document.getElementById("next");
  const pageInfo = document.getElementById("pageInfo");

  // CREATE form
  const cForm = document.getElementById("createForm");
  const cName = document.getElementById("c_name");
  const cCat = document.getElementById("c_category");
  const cSell = document.getElementById("c_sell");
  const cCost = document.getElementById("c_cost");
  const cUnit = document.getElementById("c_unit");
  const cActive = document.getElementById("c_active");
  const cDesc = document.getElementById("c_desc");
  const cPick = document.getElementById("c_pick");
  const cFile = document.getElementById("c_file");
  const cUpload = document.getElementById("c_upload");
  const cFileName = document.getElementById("c_file_name");
  const cImgUrl = document.getElementById("c_image_url");
  const cPreview = document.getElementById("c_preview");
  const cDrop = document.getElementById("c_drop");

  /* =================== Data =================== */
  let list = [];
  try {
    list = await fetch("/api/products").then((r) => r.json());
  } catch (e) {
    N.err("Không tải được danh sách sản phẩm: " + (e?.message || e));
  }

  /* =================== Build category filter =================== */
  function buildCategories() {
    const set = new Set();
    list.forEach((p) => p?.category && set.add(p.category));
    const cats = Array.from(set).sort((a, b) => a.localeCompare(b));
    fCat.innerHTML =
      `<option value="">Tất cả danh mục</option>` +
      cats.map((c) => `<option value="${c}">${c}</option>`).join("");
  }

  /* =================== CREATE: preview/upload/dragdrop =================== */
  cPick?.addEventListener("click", () => cFile.click());
  cFile?.addEventListener("change", () => {
    const f = cFile.files?.[0];
    cFileName.textContent = f ? f.name : "";
    if (f) {
      const url = URL.createObjectURL(f);
      cPreview.src = url;
      cPreview.style.display = "inline-block";
    } else {
      cPreview.src = "";
      cPreview.style.display = "none";
    }
  });
  function handleDropFile(ev) {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0];
    if (!f) return;
    cFile.files = ev.dataTransfer.files;
    cFileName.textContent = f.name;
    const url = URL.createObjectURL(f);
    cPreview.src = url;
    cPreview.style.display = "inline-block";
    cDrop?.classList.remove("dragging");
  }
  cDrop?.addEventListener("dragover", (e) => {
    e.preventDefault();
    cDrop.classList.add("dragging");
  });
  cDrop?.addEventListener("dragleave", () =>
    cDrop.classList.remove("dragging")
  );
  cDrop?.addEventListener("drop", handleDropFile);

  let uploadingCreate = false;
  cUpload?.addEventListener("click", async () => {
    if (uploadingCreate) return;
    try {
      uploadingCreate = true;
      cUpload.disabled = true;
      cUpload.dataset.loading = "1";
      const f = cFile.files?.[0];
      const { url } = await uploadImage(f);
      cImgUrl.value = url;
      N.ok("Tải ảnh thành công!");
    } catch (e) {
      N.err("Lỗi tải ảnh: " + e.message);
    } finally {
      uploadingCreate = false;
      cUpload.disabled = false;
      delete cUpload.dataset.loading;
    }
  });

  // autosize cho mô tả
  function autoSize(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }
  cDesc?.addEventListener("input", () => autoSize(cDesc));

  /* =================== Filter + sort + pager =================== */
  let page = 1;
  const pageSize = 10;

  function applyFilters() {
    const q = (qInput.value || "").trim().toLowerCase();
    const cat = fCat.value || "";
    const act = fActive.value || "";
    let arr = [...list];

    if (q) {
      arr = arr.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q)
      );
    }
    if (cat) arr = arr.filter((p) => (p.category || "") === cat);
    if (act) {
      const on = act === "true";
      arr = arr.filter((p) => (p.active !== false) === on);
    }

    const [key, dir] = (sortSel.value || "updatedAt:desc").split(":");
    arr.sort((a, b) => {
      if (key === "name") {
        const va = (a.name || "").toLowerCase(),
          vb = (b.name || "").toLowerCase();
        return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      } else if (key === "sell") {
        const va = +a.priceSell || 0,
          vb = +b.priceSell || 0;
        return dir === "asc" ? va - vb : vb - va;
      } else {
        const va = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const vb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return dir === "asc" ? va - vb : vb - va;
      }
    });
    return arr;
  }

  function paged(arr) {
    const total = arr.length,
      maxPage = Math.max(1, Math.ceil(total / pageSize));
    if (page > maxPage) page = maxPage;
    const start = (page - 1) * pageSize,
      end = start + pageSize;
    return { total, maxPage, items: arr.slice(start, end) };
  }

  function vnd(n) {
    n = +n || 0;
    return n.toLocaleString("vi-VN");
  }

  /* =================== Render list =================== */
  function draw() {
    const filtered = applyFilters();
    const { total, maxPage, items } = paged(filtered);
    pageInfo.textContent = `${total ? (page - 1) * pageSize + 1 : 0}–${Math.min(
      page * pageSize,
      total
    )} / ${total}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= maxPage;

    tblBody.innerHTML = "";
    items.forEach((p) => {
      const tr = document.createElement("tr");
      tr.className = "row-item";
      tr.innerHTML = `
        <td data-th="Ảnh">
          <div class="uploader">
            <div class="thumb-wrap"><img class="thumb" src="${
              p.imageUrl || ""
            }" alt=""></div>
            <div class="uploader-actions">
              <button class="btn secondary btn-xs btn-pick" type="button">Chọn</button>
              <input class="file-input" type="file" accept="image/*" style="display:none">
              <button class="btn secondary btn-xs btn-upload" type="button">Tải lên</button>
            </div>
          </div>
          <input class="img-url input" placeholder="Hoặc dán URL ảnh" value="${
            p.imageUrl || ""
          }">
        </td>
        <td data-th="Tên"><input class="name input" value="${
          p.name || ""
        }"/></td>
        <td data-th="Danh mục"><input class="cat input" value="${
          p.category || ""
        }"/></td>
        <td data-th="Giá bán">
          <input class="sell input num" type="number" min="0" step="1" value="${
            p.priceSell ?? 0
          }"/>
          <div class="num-hint">${vnd(p.priceSell)}</div>
        </td>
        <td data-th="Giá vốn">
          <input class="cost input num" type="number" min="0" step="1" value="${
            p.priceCost ?? 0
          }"/>
          <div class="num-hint">${vnd(p.priceCost)}</div>
        </td>
        <td data-th="Đơn vị"><input class="unit input" value="${
          p.unit || ""
        }"/></td>
        <td class="col-desc" data-th="Mô tả"><textarea class="desc textarea small" rows="1" placeholder="Mô tả món…"></textarea></td>
        <td data-th="Kích hoạt" class="col-active">
          <label class="switch"><input class="active" type="checkbox" ${
            p.active !== false ? "checked" : ""
          }/><span></span></label>
        </td>
        <td class="col-actions">
          <div class="action-stack" style="display:flex;gap:6px;">
            <button class="btn primary btn-xs btn-save" type="button" title="Lưu">
              <i data-lucide="save"></i><span style="position:absolute;left:-9999px">Lưu</span>
            </button>
            <button class="btn danger btn-xs btn-del" type="button" title="Xoá" data-danger="1">
              <i data-lucide="trash-2"></i><span style="position:absolute;left:-9999px">Xoá</span>
            </button>
          </div>
        </td>
      `;

      // refs
      const img = tr.querySelector("img.thumb");
      const pick = tr.querySelector(".btn-pick");
      const fileInput = tr.querySelector(".file-input");
      const uploadBtn = tr.querySelector(".btn-upload");
      const imgUrlInput = tr.querySelector(".img-url");
      const name = tr.querySelector(".name");
      const cat = tr.querySelector(".cat");
      const sell = tr.querySelector(".sell");
      const cost = tr.querySelector(".cost");
      const unit = tr.querySelector(".unit");
      const active = tr.querySelector(".active");
      const desc = tr.querySelector(".desc");
      const numHints = tr.querySelectorAll(".num-hint");

      desc.value = p.description || "";
      autoSize(desc);

      pick.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        const f = fileInput.files?.[0];
        if (f) img.src = URL.createObjectURL(f);
      });

      let uploadingRow = false;
      uploadBtn.addEventListener("click", async () => {
        if (uploadingRow) return;
        try {
          uploadingRow = true;
          uploadBtn.disabled = true;
          uploadBtn.dataset.loading = "1";
          const f = fileInput.files?.[0];
          const { url } = await uploadImage(f);
          img.src = url;
          imgUrlInput.value = url;
          N.ok("Tải ảnh thành công!");
        } catch (e) {
          N.err("Lỗi tải ảnh: " + e.message);
        } finally {
          uploadingRow = false;
          uploadBtn.disabled = false;
          delete uploadBtn.dataset.loading;
        }
      });

      const bindNum = (el, h) =>
        el.addEventListener("input", () => {
          h.textContent = vnd(el.value);
        });
      bindNum(sell, numHints[0]);
      bindNum(cost, numHints[1]);

      desc.addEventListener("input", () => autoSize(desc));

      // Ctrl+S -> save
      tr.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          tr.querySelector(".btn-save").click();
        }
      });

      // Save
      tr.querySelector(".btn-save").addEventListener("click", async () => {
        const body = {
          name: (name.value || "").trim(),
          category: (cat.value || "").trim(),
          priceSell: Number(sell.value || 0),
          priceCost: Number(cost.value || 0),
          unit: (unit.value || "").trim(),
          active: !!active.checked,
          imageUrl: (imgUrlInput.value || "").trim(),
          description: (desc.value || "").trim(),
        };
        try {
          const r = await window.__adminFetch(`/api/products/${p.id}`, {
            method: "PUT",
            body: JSON.stringify(body),
          });
          Object.assign(p, r);
          N.ok("Đã lưu sản phẩm");
          pingIndex();
        } catch (e) {
          N.err("Lỗi lưu: " + e.message);
        }
      });

      // Delete (xác nhận bằng modal giống orders.js)
      tr.querySelector(".btn-del").addEventListener("click", async () => {
        const ok = await (window.showConfirm?.(
          "Xoá sản phẩm",
          `Xoá sản phẩm "${p.name || p.id}"?`,
          "Đồng ý",
          "Huỷ"
        ) ?? Promise.resolve(confirm("Xoá?")));
        if (!ok) return;
        try {
          await window.__adminFetch(`/api/products/${p.id}`, {
            method: "DELETE",
          });
          const idx = list.findIndex((x) => x.id === p.id);
          if (idx > -1) list.splice(idx, 1);
          draw();
          N.info("Đã xoá sản phẩm");
          pingIndex();
        } catch (e) {
          N.err("Lỗi xoá: " + e.message);
        }
      });

      tblBody.appendChild(tr);
    });

    // Render Lucide icons sau khi DOM đã cập nhật
    try {
      window.lucide?.createIcons?.();
    } catch {}
  }

  /* =================== Create submit =================== */
  cForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      name: (cName.value || "").trim(),
      category: (cCat.value || "").trim(),
      priceSell: Number(cSell.value || 0),
      priceCost: Number(cCost.value || 0),
      unit: (cUnit.value || "").trim(),
      active: cActive.value === "true",
      imageUrl: (cImgUrl.value || "").trim(),
      description: (cDesc.value || "").trim(),
    };
    try {
      const p = await window.__adminFetch("/api/products", {
        method: "POST",
        body: JSON.stringify(body),
      });
      list.unshift(p);
      cForm.reset();
      cPreview.src = "";
      cPreview.style.display = "none";
      cFileName.textContent = "";
      N.ok("Đã thêm sản phẩm mới");
      buildCategories();
      page = 1;
      draw();
      pingIndex();
    } catch (err) {
      N.err("Lỗi thêm: " + err.message);
    }
  });

  /* =================== Events =================== */
  qInput.addEventListener("input", () => {
    page = 1;
    draw();
  });
  fCat.addEventListener("change", () => {
    page = 1;
    draw();
  });
  fActive.addEventListener("change", () => {
    page = 1;
    draw();
  });
  sortSel.addEventListener("change", () => {
    page = 1;
    draw();
  });
  prevBtn.addEventListener("click", () => {
    page = Math.max(1, page - 1);
    draw();
  });
  nextBtn.addEventListener("click", () => {
    page = page + 1;
    draw();
  });

  // init
  buildCategories();
  draw();
})();
