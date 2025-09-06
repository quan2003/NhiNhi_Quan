// ===== Products Admin with Image Upload =====
(async function () {
  // ---- Upload helpers (FormData + token) ----
  async function uploadImage(file) {
    if (!file) throw new Error("Chưa chọn file ảnh");
    const fd = new FormData();
    fd.append("file", file);

    // Dùng RAW fetch để không set Content-Type
    const res = await window.__adminFetchRaw("/api/upload", {
      method: "POST",
      body: fd,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || "Upload failed");
    return JSON.parse(text); // { url: "/uploads/xxx.jpg" }
  }

  // ---- DOM ----
  const tblBody = document.querySelector("#tbl tbody");
  const list = await fetch("/api/products").then((r) => r.json());

  // CREATE form controls
  const cForm = document.getElementById("createForm");
  const cName = document.getElementById("c_name");
  const cCat = document.getElementById("c_category");
  const cSell = document.getElementById("c_sell");
  const cCost = document.getElementById("c_cost");
  const cUnit = document.getElementById("c_unit");
  const cActive = document.getElementById("c_active");
  const cPick = document.getElementById("c_pick");
  const cFile = document.getElementById("c_file");
  const cUpload = document.getElementById("c_upload");
  const cFileName = document.getElementById("c_file_name");
  const cImgUrl = document.getElementById("c_image_url");
  const cPreview = document.getElementById("c_preview");

  // preview file local
  cPick.addEventListener("click", () => cFile.click());
  cFile.addEventListener("change", () => {
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

  // upload ảnh -> điền vào cImgUrl
  cUpload.addEventListener("click", async () => {
    try {
      const f = cFile.files?.[0];
      const { url } = await uploadImage(f);
      cImgUrl.value = url;
      alert("Tải ảnh thành công!");
    } catch (e) {
      alert("Lỗi tải ảnh: " + e.message);
    }
  });

  function draw() {
    tblBody.innerHTML = "";
    list.forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="uploader">
            <img class="thumb" src="${p.imageUrl ? p.imageUrl : ""}" alt="">
            <button class="btn btn-pick" type="button">Chọn</button>
            <input class="file-input" type="file" accept="image/*" style="display:none">
            <button class="btn btn-upload" type="button">Tải lên</button>
          </div>
          <input class="img-url" placeholder="Hoặc dán URL ảnh" value="${
            p.imageUrl || ""
          }" style="width:180px;margin-top:6px">
        </td>
        <td><input class="name" value="${p.name}"/></td>
        <td><input class="cat" value="${p.category || ""}"/></td>
        <td><input class="sell" type="number" value="${p.priceSell}"/></td>
        <td><input class="cost" type="number" value="${p.priceCost}"/></td>
        <td><input class="unit" value="${p.unit || ""}"/></td>
        <td>
          <select class="active">
            <option value="true" ${
              p.active !== false ? "selected" : ""
            }>Có</option>
            <option value="false" ${
              p.active === false ? "selected" : ""
            }>Không</option>
          </select>
        </td>
        <td>
          <button class="btn save">Lưu</button>
          <button class="btn" data-danger="1">Xoá</button>
        </td>
      `;

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

      // chọn file
      pick.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        const f = fileInput.files?.[0];
        if (f) img.src = URL.createObjectURL(f);
      });

      // upload file -> điền URL
      uploadBtn.addEventListener("click", async () => {
        try {
          const f = fileInput.files?.[0];
          const { url } = await uploadImage(f);
          img.src = url;
          imgUrlInput.value = url;
          alert("Tải ảnh thành công!");
        } catch (e) {
          alert("Lỗi tải ảnh: " + e.message);
        }
      });

      // Lưu
      tr.querySelector(".save").addEventListener("click", async () => {
        const body = {
          name: name.value.trim(),
          category: cat.value.trim(),
          priceSell: Number(sell.value || 0),
          priceCost: Number(cost.value || 0),
          unit: unit.value.trim(),
          active: active.value === "true",
          imageUrl: imgUrlInput.value.trim(), // LƯU ẢNH
        };
        try {
          const r = await window.__adminFetch(`/api/products/${p.id}`, {
            method: "PUT",
            body: JSON.stringify(body),
          });
          Object.assign(p, r);
          alert("Đã lưu");
        } catch (e) {
          alert("Lỗi lưu: " + e.message);
        }
      });

      // Xoá
      tr.querySelector("[data-danger]").addEventListener("click", async () => {
        if (!confirm("Xoá sản phẩm này?")) return;
        try {
          await window.__adminFetch(`/api/products/${p.id}`, {
            method: "DELETE",
          });
          const idx = list.findIndex((x) => x.id === p.id);
          if (idx > -1) list.splice(idx, 1);
          draw();
        } catch (e) {
          alert("Lỗi xoá: " + e.message);
        }
      });

      tblBody.appendChild(tr);
    });
  }
  draw();

  // Tạo mới
  cForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      name: cName.value.trim(),
      category: cCat.value.trim(),
      priceSell: Number(cSell.value || 0),
      priceCost: Number(cCost.value || 0),
      unit: cUnit.value.trim(),
      active: cActive.value === "true",
      imageUrl: cImgUrl.value.trim(), // LƯU ẢNH KHI TẠO
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
      draw();
    } catch (err) {
      alert("Lỗi thêm: " + err.message);
    }
  });
})();
