"use strict";

const $ = selector => document.querySelector(selector);

const modules = {
  sales: ["বিক্রি", "বিক্রির API এখনো চালু হয়নি।"],
  purchases: ["ক্রয়", "ক্রয় ও সরবরাহকারী লেজার পরবর্তী ধাপে যুক্ত হবে।"],
  customers: ["ক্রেতা ও বাকি", "ক্রেতার খাতা, বকেয়া ও আদায় পরবর্তী ধাপে যুক্ত হবে।"],
  suppliers: ["সরবরাহকারী", "পাওনা ও পরিশোধ পরবর্তী ধাপে যুক্ত হবে।"],
  cash: ["নগদ ও খরচ", "নগদ জমা, উত্তোলন ও খরচ পরবর্তী ধাপে যুক্ত হবে।"],
  "stock-check": ["স্টক ভেলু যাচাই", "স্টক যাচাইয়ের সুবিধা পরবর্তী ধাপে যুক্ত হবে।"],
  reports: ["রিপোর্ট", "বিক্রি, লাভ, নগদ ও স্টক রিপোর্ট পরবর্তী ধাপে যুক্ত হবে।"],
  history: ["লেনদেনের ইতিহাস", "লেনদেন ও অডিট লগ পরবর্তী ধাপে যুক্ত হবে।"],
  settings: ["সেটিংস", "অ্যাক্সেস সুরক্ষা ও ব্যাকআপ পরবর্তী ধাপে যুক্ত হবে।"],
  menu: ["সব মডিউল", "অন্যান্য মডিউল ধাপে ধাপে যুক্ত হবে।"]
};

const money = paisa =>
  new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT"
  }).format((Number(paisa) || 0) / 100);

const qty = milli =>
  new Intl.NumberFormat("bn-BD", {
    maximumFractionDigits: 3
  }).format((Number(milli) || 0) / 1000);

const escapeHtml = value =>
  String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[ch]);

let productItems = [];
let loadingProducts = false;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("সার্ভার থেকে সঠিক উত্তর পাওয়া যায়নি।");
  }

  if (!response.ok) {
    throw new Error(data.error || `অনুরোধ ব্যর্থ হয়েছে (${response.status})`);
  }

  return data;
}

function showMessage(message, kind = "info") {
  const el = $("#product-message");
  el.textContent = message;
  el.className = `message ${kind}`;
  el.hidden = false;
}

function clearMessage() {
  $("#product-message").hidden = true;
}

async function loadDashboard() {
  try {
    const [health, dashboard] = await Promise.all([
      api("/api/health"),
      api("/api/dashboard")
    ]);

    $("#health").textContent = health.ok
      ? "সার্ভার সংযুক্ত"
      : "সংযোগ সমস্যা";

    $("#cash").textContent = money(dashboard.cash_balance_paisa);
    $("#stock").textContent = money(dashboard.stock_value_paisa);
    $("#sales").textContent = money(dashboard.today_sales_paisa);

    $("#products").textContent =
      new Intl.NumberFormat("bn-BD")
        .format(dashboard.product_count || 0);
  } catch {
    $("#health").textContent = "সংযোগ সমস্যা";
  }
}

function renderProducts() {
  const query = $("#product-search")
    .value.trim().toLocaleLowerCase();

  const items = productItems.filter(product =>
    `${product.name} ${product.sku}`
      .toLocaleLowerCase()
      .includes(query)
  );

  const host = $("#product-list");

  if (!items.length) {
    host.innerHTML = `
      <div class="empty">
        ${productItems.length
          ? "কোনো মিল পাওয়া যায়নি।"
          : "এখনো কোনো পণ্য নেই। “পণ্য যোগ” চাপ দিয়ে শুরু করো।"}
      </div>`;
    return;
  }

  host.innerHTML = items.map(product => `
    <article class="product-card">
      <div class="product-top">
        <div>
          <h3>${escapeHtml(product.name)}</h3>
          <small>
            SKU: ${escapeHtml(product.sku)}
            · একক: ${escapeHtml(product.unit)}
          </small>
        </div>
        <span class="status ${product.active ? "active" : "inactive"}">
          ${product.active ? "সক্রিয়" : "বন্ধ"}
        </span>
      </div>

      <div class="product-values">
        <div>
          <small>বিক্রয়মূল্য</small>
          <b>${money(product.sale_price_paisa)}</b>
        </div>
        <div>
          <small>বর্তমান স্টক</small>
          <b>${qty(product.stock_qty_milli)} ${escapeHtml(product.unit)}</b>
        </div>
        <div>
          <small>গড় ক্রয়মূল্য</small>
          <b>${money(product.avg_cost_paisa)}</b>
        </div>
        <div>
          <small>সর্বনিম্ন স্টক</small>
          <b>${qty(product.min_stock_qty_milli)} ${escapeHtml(product.unit)}</b>
        </div>
      </div>

      <div class="card-actions">
        <button class="secondary" data-edit="${product.id}">
          সম্পাদনা
        </button>
        <button class="secondary"
          data-toggle="${product.id}"
          data-active="${product.active}">
          ${product.active ? "বন্ধ করো" : "আবার চালু করো"}
        </button>
      </div>
    </article>
  `).join("");

  host.querySelectorAll("[data-edit]").forEach(button => {
    button.addEventListener("click", () => {
      editProduct(button.dataset.edit);
    });
  });

  host.querySelectorAll("[data-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      toggleProduct(
        button.dataset.toggle,
        Number(button.dataset.active)
      );
    });
  });
}

async function loadProducts() {
  if (loadingProducts) return;

  loadingProducts = true;
  $("#refresh-products").disabled = true;
  $("#product-list").innerHTML =
    '<div class="empty">পণ্যের তালিকা লোড হচ্ছে...</div>';

  try {
    const result = await api("/api/products?all=1");

    productItems = Array.isArray(result.items)
      ? result.items
      : [];

    renderProducts();
  } catch (error) {
    $("#product-list").innerHTML =
      '<div class="empty">পণ্য লোড হয়নি। আবার রিফ্রেশ করো।</div>';

    showMessage(error.message, "error");
  } finally {
    loadingProducts = false;
    $("#refresh-products").disabled = false;
  }
}

function openForm(product = null) {
  clearMessage();

  $("#product-form").hidden = false;
  $("#product-id").value = product?.id || "";
  $("#form-title").textContent =
    product ? "পণ্যের তথ্য সম্পাদনা" : "নতুন পণ্য যোগ";

  $("#p-name").value = product?.name || "";
  $("#p-sku").value = product?.sku || "";
  $("#p-sku").disabled = Boolean(product);

  $("#p-unit").value = product?.unit || "pcs";

  $("#p-sale").value = product
    ? (Number(product.sale_price_paisa) / 100).toFixed(2)
    : "";

  $("#p-cost").value = product
    ? (Number(product.avg_cost_paisa) / 100).toFixed(2)
    : "0";

  $("#p-cost").disabled = Boolean(product);
  $("#cost-label").hidden = Boolean(product);

  $("#p-min").value = product
    ? (Number(product.min_stock_qty_milli) / 1000).toString()
    : "0";

  $("#edit-note").hidden = !product;

  $("#save-product").textContent = product
    ? "পরিবর্তন সংরক্ষণ"
    : "পণ্য সংরক্ষণ";

  $("#product-form").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function editProduct(id) {
  const product = productItems.find(item => item.id === id);
  if (product) openForm(product);
}

function closeForm() {
  $("#product-form").hidden = true;
  $("#product-form").reset();
  $("#product-id").value = "";
  $("#p-sku").disabled = false;
  $("#p-cost").disabled = false;
  $("#cost-label").hidden = false;
  $("#edit-note").hidden = true;
}

async function saveProduct(event) {
  event.preventDefault();

  const id = $("#product-id").value;
  const button = $("#save-product");

  button.disabled = true;
  clearMessage();

  const payload = {
    name: $("#p-name").value.trim(),
    unit: $("#p-unit").value,
    sale_price: Number($("#p-sale").value),
    min_stock: Number($("#p-min").value)
  };

  if (!id) {
    payload.sku = $("#p-sku").value.trim().toUpperCase();
    payload.avg_cost = Number($("#p-cost").value);
  }

  try {
    const result = await api(
      id ? `/api/products/${encodeURIComponent(id)}` : "/api/products",
      {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      }
    );

    closeForm();

    showMessage(
      result.message || "পণ্যের তথ্য সংরক্ষিত হয়েছে।",
      "success"
    );

    await Promise.all([loadProducts(), loadDashboard()]);
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function toggleProduct(id, active) {
  const product = productItems.find(item => item.id === id);
  if (!product) return;

  const message = active
    ? "এই পণ্যটি সক্রিয় তালিকা থেকে বন্ধ করবে? স্টক মুছবে না।"
    : "এই পণ্যটি আবার সক্রিয় করবে?";

  if (!confirm(message)) return;

  try {
    await api(`/api/products/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ active: active ? 0 : 1 })
    });

    showMessage("পণ্যের অবস্থা আপডেট হয়েছে।", "success");

    await Promise.all([loadProducts(), loadDashboard()]);
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function openModule(key) {
  if (key === "home") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const module = modules[key];
  if (!module) return;

  $("#panel-title").textContent = module[0];
  $("#panel-description").textContent = module[1];
  $("#panel").hidden = false;

  $("#panel").scrollIntoView({ behavior: "smooth" });
}

$("#new-product").addEventListener("click", () => openForm());
$("#cancel-form").addEventListener("click", closeForm);
$("#cancel-form-2").addEventListener("click", closeForm);
$("#product-form").addEventListener("submit", saveProduct);
$("#product-search").addEventListener("input", renderProducts);
$("#refresh-products").addEventListener("click", loadProducts);

$("#nav-products").addEventListener("click", () => {
  $("#product-section").scrollIntoView({ behavior: "smooth" });
});

$("#close-panel").addEventListener("click", () => {
  $("#panel").hidden = true;
});

document.querySelectorAll("[data-module]").forEach(button => {
  button.addEventListener("click", () => {
    openModule(button.dataset.module);
  });
});

loadDashboard();
loadProducts();
