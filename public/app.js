
"use strict";

const $ = (id) => document.getElementById(id);

const state = {
  authenticated: false,
  busy: false,
  products: [],
  activeModule: "dashboard",
  productView: "list",
};

function show(element, visible) {
  if (element) element.hidden = !visible;
}

function message(element, text = "", type = "info") {
  if (!element) return;
  element.textContent = text;
  element.className = `form-message ${type}`;
  show(element, Boolean(text));
}

function moneyFromPaisa(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  let response;

  try {
    response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new Error("সার্ভারের সঙ্গে সংযোগ হয়নি। ইন্টারনেট ও Deploy যাচাই করো।");
  }

  let result = {};
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      result = await response.json();
    } catch {
      throw new Error("সার্ভারের উত্তর পড়া যায়নি।");
    }
  }

  if (response.status === 401 && path !== "/api/auth/login") {
    state.authenticated = false;
    showLogin();
    throw new Error("সেশন শেষ হয়েছে। আবার লগইন করো।");
  }

  if (!response.ok) {
    const error = new Error(
      result.error || `অনুরোধ ব্যর্থ হয়েছে (${response.status})`
    );
    error.status = response.status;
    throw error;
  }

  return result;
}

/* ---------- Login / Session ---------- */

function showLogin() {
  state.authenticated = false;

  show($("loginScreen"), true);
  show($("appScreen"), false);

  if ($("loginPassword")) {
    $("loginPassword").value = "";
    $("loginPassword").type = "password";
  }

  if ($("togglePassword")) {
    $("togglePassword").textContent = "দেখাও";
    $("togglePassword").setAttribute("aria-pressed", "false");
    $("togglePassword").setAttribute("aria-label", "পাসওয়ার্ড দেখাও");
  }

  message($("loginMessage"));

  if ($("loginButton")) {
    $("loginButton").disabled = false;
    $("loginButton").textContent = "লগইন";
  }
}

function showApp() {
  state.authenticated = true;
  show($("loginScreen"), false);
  show($("appScreen"), true);
  message($("globalMessage"));
}

async function checkSession() {
  try {
    const result = await api("/api/auth/session");

    if (result.authenticated) {
      showApp();
      await loadAppData();
      openModule("dashboard");
    } else {
      showLogin();
    }
  } catch (error) {
    showLogin();
    message($("loginMessage"), error.message, "error");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (state.busy) return;

  const password = $("loginPassword").value;

  if (!password) {
    message($("loginMessage"), "পাসওয়ার্ড লিখো।", "error");
    return;
  }

  state.busy = true;
  $("loginButton").disabled = true;
  $("loginButton").textContent = "লগইন হচ্ছে…";
  message($("loginMessage"));

  try {
    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });

    $("loginPassword").value = "";
    showApp();
    await loadAppData();
    openModule("dashboard");
  } catch (error) {
    showLogin();
    message($("loginMessage"), error.message, "error");
    $("loginPassword").focus();
  } finally {
    state.busy = false;
    $("loginButton").disabled = false;
    $("loginButton").textContent = "লগইন";
  }
}

async function handleLogout() {
  if (state.busy) return;
  if (!window.confirm("তুমি কি লগআউট করতে চাও?")) return;

  state.busy = true;
  $("logoutButton").disabled = true;
  $("logoutButton").textContent = "Logout হচ্ছে…";

  try {
    await api("/api/auth/logout", { method: "POST" });
    state.products = [];
    showLogin();
  } catch (error) {
    message($("globalMessage"), error.message, "error");
  } finally {
    state.busy = false;
    $("logoutButton").disabled = false;
    $("logoutButton").textContent = "Logout";
  }
}

/* ---------- Module navigation ---------- */

function hideAllMainSections() {
  show($("dashboardSection"), false);
  show($("mainMenuSection"), false);
  show($("productsSection"), false);
  show($("placeholderSection"), false);
}

function openModule(moduleName) {
  if (!state.authenticated) return;

  hideAllMainSections();
  state.activeModule = moduleName;
  message($("globalMessage"));

  if (moduleName === "dashboard") {
    show($("dashboardSection"), true);
    show($("mainMenuSection"), true);
    return;
  }

  if (moduleName === "products") {
    show($("mainMenuSection"), true);
    show($("productsSection"), true);
    openProductView(state.productView);
    return;
  }

  const moduleInfo = {
    suppliers: {
      title: "সরবরাহকারী ও ক্রয়",
      text: "এই মডিউলের ক্রয় ও সরবরাহকারী লেনদেন পরবর্তী ধাপে যুক্ত হবে।",
    },
    sales: {
      title: "বিক্রয় ব্যবস্থাপনা",
      text: "বিক্রয় এন্ট্রি ও স্টক সমন্বয় পরবর্তী ধাপে যুক্ত হবে।",
    },
    cash: {
      title: "নগদ ও খরচ",
      text: "নগদ জমা, নগদ উত্তোলন ও খরচের হিসাব পরবর্তী ধাপে যুক্ত হবে।",
    },
    stock: {
      title: "স্টক ব্যবস্থাপনা",
      text: "স্টক গণনা ও মূল্য যাচাইয়ের পূর্ণ ফর্ম পরবর্তী ধাপে যুক্ত হবে।",
    },
  };

  const info = moduleInfo[moduleName];
  if (!info) return;

  $("placeholderHeading").textContent = info.title;
  $("placeholderMessage").textContent = info.text;
  show($("placeholderSection"), true);
}

function openProductView(view) {
  state.productView = view;

  show($("productFormSection"), view === "new");
  show($("productListSection"), view === "list");
  show($("stockVerifySection"), view === "stock");

  message($("productMessage"));

  if (view === "new") {
    resetProductForm();
    generateProductSku();
    $("productFormHeading").textContent = "নতুন পণ্য";
  } else if (view === "list") {
    renderProducts();
  }
}

/* ---------- Dashboard ---------- */

async function loadDashboard() {
  const data = await api("/api/dashboard");

  $("cashBalance").textContent =
    moneyFromPaisa(data.cash_balance_paisa);

  $("todaySales").textContent =
    moneyFromPaisa(data.today_sales_paisa);

  $("stockValue").textContent =
    moneyFromPaisa(data.stock_value_paisa);

  // বর্তমান backend supplier payable ফেরত দেয় না।
  $("supplierPayable").textContent = "—";
}

async function loadAppData() {
  if (!state.authenticated) return;

  message($("globalMessage"));

  const results = await Promise.allSettled([
    loadDashboard(),
    loadProducts(),
  ]);

  const failures = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason.message);

  if (failures.length) {
    message($("globalMessage"), failures.join(" "), "error");
  }
}

/* ---------- Product SKU generation ---------- */

/*
 * SKU-র শেষ 6 অক্ষর crypto random bytes থেকে আসে।
 * এটি সংঘর্ষের সম্ভাবনা কমায়, কিন্তু একা uniqueness নিশ্চিত করে না।
 * চূড়ান্ত যাচাই সার্ভার/ডাটাবেসের UNIQUE constraint-এ হতে হবে।
 */
function generateProductSku() {
  const input = $("productSku");
  if (!input || $("productId").value) return;

  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);

  const suffix = Array.from(bytes, (byte) =>
    (byte % 36).toString(36)
  ).join("").toUpperCase();

  input.value = `SKU-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

/* ---------- Product list ---------- */

async function loadProducts() {
  const result = await api("/api/products");
  state.products = Array.isArray(result.items) ? result.items : [];
  renderProducts();
}

function renderProducts() {
  const list = $("productList");
  if (!list) return;

  const searchInput = $("productSearch");
  const query = (searchInput?.value || "").trim().toLocaleLowerCase();

  const filtered = state.products.filter((product) =>
    `${product.name || ""} ${product.sku || ""}`
      .toLocaleLowerCase()
      .includes(query)
  );

  if (!filtered.length) {
    list.innerHTML = '<p class="muted">কোনো পণ্য পাওয়া যায়নি।</p>';
    return;
  }

  list.innerHTML = filtered.map((product) => `
    <article class="product-card">
      <div class="product-card-main">
        <strong>${escapeHtml(product.name)}</strong>
        <span class="muted">কোড: ${escapeHtml(product.sku)}</span>
        <span>
          স্টক:
          ${(Number(product.stock_qty_milli || 0) / 1000)
            .toLocaleString("bn-BD")}
          ${escapeHtml(product.unit)}
        </span>
        <span>বিক্রয়মূল্য: ${moneyFromPaisa(product.sale_price_paisa)}</span>
        <span>গড় ক্রয়মূল্য: ${moneyFromPaisa(product.avg_cost_paisa)}</span>
      </div>
      <button
        type="button"
        class="secondary-button"
        data-edit-product="${escapeHtml(product.id)}"
      >সম্পাদনা</button>
    </article>
  `).join("");
}

/* ---------- Product form ---------- */

function resetProductForm() {
  $("productForm").reset();
  $("productId").value = "";
  $("productSku").readOnly = true;
  $("productSku").value = "";
  $("productSalePrice").value = "0";
  $("productMinStock").value = "0";
  $("saveProductButton").textContent = "পণ্য সংরক্ষণ";
  $("productFormHeading").textContent = "নতুন পণ্য";
  show($("cancelProductEdit"), false);
}

function editProduct(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  $("productId").value = product.id;
  $("productSku").value = product.sku;
  $("productSku").readOnly = true;
  $("productName").value = product.name;
  $("productUnit").value = product.unit;
  $("productSalePrice").value =
    (Number(product.sale_price_paisa) / 100).toFixed(2);
  $("productMinStock").value =
    (Number(product.min_stock_qty_milli || 0) / 1000).toString();

  $("productFormHeading").textContent = "পণ্য সম্পাদনা";
  $("saveProductButton").textContent = "পরিবর্তন সংরক্ষণ";
  show($("cancelProductEdit"), true);

  openModule("products");
  openProductView("new");

  // openProductView("new") ফর্ম রিসেট করে, তাই সম্পাদনার মান আবার বসাই।
  $("productId").value = product.id;
  $("productSku").value = product.sku;
  $("productSku").readOnly = true;
  $("productName").value = product.name;
  $("productUnit").value = product.unit;
  $("productSalePrice").value =
    (Number(product.sale_price_paisa) / 100).toFixed(2);
  $("productMinStock").value =
    (Number(product.min_stock_qty_milli || 0) / 1000).toString();
  $("productFormHeading").textContent = "পণ্য সম্পাদনা";
  $("saveProductButton").textContent = "পরিবর্তন সংরক্ষণ";
  show($("cancelProductEdit"), true);
}

async function createProductWithUniqueSku(body) {
  /*
   * নতুন SKU-তে UNIQUE conflict হলে একবার নতুন SKU দিয়ে পুনরায় চেষ্টা।
   * অন্য ধরনের validation error হলে পুনরায় চেষ্টা করা হয় না।
   */
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      generateProductSku();
      body.sku = $("productSku").value;
    }

    try {
      return await api("/api/products", {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (error) {
      const isSkuConflict =
        error.status === 409 &&
        /SKU|আগে থেকেই আছে|already exists/i.test(error.message);

      if (!isSkuConflict || attempt === 1) throw error;
    }
  }

  throw new Error("ইউনিক পণ্য কোড তৈরি করা যায়নি। আবার চেষ্টা করো।");
}

async function saveProduct(event) {
  event.preventDefault();
  if (state.busy) return;

  const productId = $("productId").value;
  const name = $("productName").value.trim();
  const unit = $("productUnit").value;
  const salePrice = Number($("productSalePrice").value);
  const minStock = Number($("productMinStock").value);

  if (!name) {
    message($("productMessage"), "পণ্যের নাম লিখো।", "error");
    return;
  }

  if (!Number.isFinite(salePrice) || salePrice < 0) {
    message($("productMessage"), "বিক্রয়মূল্য সঠিক নয়।", "error");
    return;
  }

  if (!Number.isFinite(minStock) || minStock < 0) {
    message($("productMessage"), "সর্বনিম্ন স্টক সঠিক নয়।", "error");
    return;
  }

  if (!productId && !$("productSku").value) {
    generateProductSku();
  }

  const body = {
    name,
    unit,
    sale_price: salePrice,
    min_stock: minStock,
  };

  if (!productId) {
    body.sku = $("productSku").value;
    body.avg_cost = 0;
  }

  state.busy = true;
  $("saveProductButton").disabled = true;
  message($("productMessage"));

  try {
    if (productId) {
      await api(`/api/products/${encodeURIComponent(productId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    } else {
      await createProductWithUniqueSku(body);
    }

    resetProductForm();
    await Promise.all([loadProducts(), loadDashboard()]);
    openProductView("list");
    message($("productMessage"), "পণ্যের তথ্য সংরক্ষণ হয়েছে।", "success");
  } catch (error) {
    message($("productMessage"), error.message, "error");
  } finally {
    state.busy = false;
    $("saveProductButton").disabled = false;
  }
}

/* ---------- Event bindings ---------- */

function bindEvents() {
  $("loginForm").addEventListener("submit", handleLogin);
  $("logoutButton").addEventListener("click", handleLogout);

  $("togglePassword").addEventListener("click", () => {
    const input = $("loginPassword");
    const showing = input.type === "text";

    input.type = showing ? "password" : "text";
    $("togglePassword").textContent = showing ? "দেখাও" : "লুকাও";
    $("togglePassword").setAttribute("aria-pressed", String(!showing));
    $("togglePassword").setAttribute(
      "aria-label",
      showing ? "পাসওয়ার্ড দেখাও" : "পাসওয়ার্ড লুকাও"
    );
  });

  $("refreshDashboard").addEventListener("click", async () => {
    try {
      await loadDashboard();
      message($("globalMessage"), "ড্যাশবোর্ড আপডেট হয়েছে।", "success");
    } catch (error) {
      message($("globalMessage"), error.message, "error");
    }
  });

  $("productSearch").addEventListener("input", renderProducts);
  $("productForm").addEventListener("submit", saveProduct);
  $("cancelProductEdit").addEventListener("click", () => {
    resetProductForm();
    openProductView("list");
  });

  $("productList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-product]");
    if (button) editProduct(button.dataset.editProduct);
  });

  $("refreshProducts").addEventListener("click", async () => {
    try {
      await loadProducts();
      message($("productMessage"), "পণ্যের তালিকা আপডেট হয়েছে।", "success");
    } catch (error) {
      message($("productMessage"), error.message, "error");
    }
  });

  document.querySelectorAll("[data-module]").forEach((button) => {
    button.addEventListener("click", () => {
      openModule(button.dataset.module);
    });
  });

  document.querySelectorAll("[data-back-menu]").forEach((button) => {
    button.addEventListener("click", () => {
      openModule("dashboard");
    });
  });

  document.querySelectorAll("[data-product-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.productView;

      if (view === "new") {
        resetProductForm();
        generateProductSku();
      }

      openProductView(view);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  checkSession();
});
