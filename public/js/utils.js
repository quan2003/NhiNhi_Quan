// public/js/utils.js
export function vnd(n) {
  n = Number(n || 0);
  return n.toLocaleString("vi-VN") + "₫";
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

/**
 * Helper tạo element nhanh
 * @param {string} tag - tên thẻ
 * @param {object} props - thuộc tính: class, text, html, attrs:{}, dataset:{}, style:{}
 */
export function create(tag, props = {}) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;

    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "style" && typeof v === "object") {
      Object.assign(el.style, v);
    } else if (k === "dataset" && typeof v === "object") {
      Object.assign(el.dataset, v);
    } else if (k === "attrs" && typeof v === "object") {
      for (const [a, b] of Object.entries(v)) {
        if (b == null) continue;
        // Nếu attribute có property tương ứng thì set luôn
        if (a in el) {
          try {
            el[a] = b;
          } catch {}
        }
        el.setAttribute(a, b);
      }
    } else {
      // props phẳng: src, alt, type, value, id, ...
      if (k in el) {
        try {
          el[k] = v;
        } catch {}
      } else {
        el.setAttribute(k, v);
      }
    }
  }
  return el;
}
