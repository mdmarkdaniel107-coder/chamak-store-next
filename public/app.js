
"use strict";

const $ = (id) => document.getElementById(id);

const state = {
  authenticated: false,
  busy: false,
  products: [],
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

  const contentType = response.headers.get("content-type") || "";
  let result = {};

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

  if (!response.ok || result.ok === false) {
    throw new Error(result.error || `অনুরোধ ব্যর্থ হয়েছে (${response.status})`);
  }

  return result;
}

function showLogin() {
  state.authenticated = false;
  show($("loginScreen"), true);
  show($("appScreen"), false);

  $("loginPassword").value = "";
  $("loginPassword").type = "password";
  $("togglePassword").textContent = "দেখাও";
  $("togglePassword").setAttribute("aria-pressed", "false");
  $("togglePassword").setAttribute("aria-label", "পাসওয়ার্ড দেখাও");

  message($("loginMessage"));
  $("loginButton").disabled = false;
  $("loginButton").textContent = "লগইন";
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

  const confirmed = window.confirm("তুমি কি লগআউট করতে চাও?");
  if (!confirmed) return;

  state.busy = true;
  $("logoutButton").disabled = true;
  $("logoutButton").textContent = "Logout হচ্ছে…";

  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (error) {
    message($("globalMessage"), error.message, "error");
  } finally {
    state.busy = false;
    $("logoutButton").disabled = false;
    $("logoutButton").textContent = "Logout";
    state.products = [];
    showLogin();
  }
}

async function loadDashboard() {
  const result = await api("/api/dashboard");
  const data = result.data || {};

  $("cashBalance").textContent = moneyFromPaisa(data.cashBalancePaisa);
  $("todaySales").textContent = moneyFromPaisa(data.todaySalesPaisa);
  $("stockValue").textContent = moneyFromPaisa(data.stockValuePaisa);
  $("supplierPayable").textContent = moneyFromPaisa(data.supplierPayablePaisa);
}

async function loadProducts() {
  const result = await api("/api/products");
  state.products = Array.isArray(result.data) ? result.data : [];
  renderProducts();
}

async function loadAppData() {
  if (!state.authenticated) return;

  message($("globalMessage"));

  const results = await Promise.allSettled([
    loadDashboard(),
    loadProducts(),
  ]);

  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length) {
    message(
      $("globalMessage"),
      failed.map((result) => result.reason.message).join(" "),
      "error"
    );
  }
}

function renderProducts() {
  const query = $("productSearch").value.trim().toLocaleLowerCase();
  const list = $("productList");

  const filtered = state.products.filter((product) => {
    return `${product.name} ${product.sku}`.toLocaleLowerCase().includes(query);
  });

  if (!filtered.length) {
    list.innerHTML = '<p class="muted">কোনো পণ্য পাওয়া যায়নি।</p>';
    return;
  }

  list.innerHTML = filtered.map((product) => `
    <article class="product-card">
      <div class="product-card-main">
        <strong>${escapeHtml(product.name)}</strong>
        <span class="muted">SKU: ${escapeHtml(product.sku)}</span>
        <span>স্টক: ${(Number(product.stock_qty_milli || 0) / 1000).toLocaleString("bn-BD")} ${escapeHtml(product.unit)}</span>
        <span>বিক্রয়মূল্য: ${moneyFromPaisa(product.sale_price_paisa)}</span>
      </div>
      <button
        type="button"
        class="secondary-button"
        data-edit-product="${escapeHtml(product.id)}"
      >সম্পাদনা</button>
    </article>
  `).join("");
}

function resetProductForm() {
  $("productForm").reset();
  $("productId").value = "";
  $("productSalePrice").value = "0";
  $("productMinStock").value = "0";
  $("saveProductButton").textContent = "পণ্য সংরক্ষণ";
  show($("cancelProductEdit"), false);
}

function editProduct(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  $("productId").value = product.id;
  $("productSku").value = product.sku;
  $("productName").value = product.name;
  $("productUnit").value = product.unit;
  $("productSalePrice").value = (Number(product.sale_price_paisa) / 100).toFixed(2);
  $("productMinStock").value = (Number(product.min_stock_qty_milli) / 1000).toString();

  $("saveProductButton").textContent = "পরিবর্তন সংরক্ষণ";
  show($("cancelProductEdit"), true);
  $("productsSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveProduct(event) {
  event.preventDefault();
  if (state.busy) return;

  const productId = $("productId").value;
  const salePricePaisa = Math.round(Number($("productSalePrice").value) * 100);

  if (!Number.isSafeInteger(salePricePaisa) || salePricePaisa < 0) {
    message($("productMessage"), "বিক্রয়মূল্য সঠিক নয়।", "error");
    return;
  }

  const body = {
    sku: $("productSku").value.trim(),
    name: $("productName").value.trim(),
    unit: $("productUnit").value,
    sale_price_paisa: salePricePaisa,
    min_stock_qty: Number($("productMinStock").value),
  };

  state.busy = true;
  $("saveProductButton").disabled = true;
  message($("productMessage"));

  try {
    await api(
      productId ? `/api/products/${encodeURIComponent(productId)}` : "/api/products",
      {
        method: productId ? "PATCH" : "POST",
        body: JSON.stringify(body),
      }
    );

    resetProductForm();
    await Promise.all([loadProducts(), loadDashboard()]);
    message($("productMessage"), "পণ্য সংরক্ষণ হয়েছে।", "success");
  } catch (error) {
    message($("productMessage"), error.message, "error");
  } finally {
    state.busy = false;
    $("saveProductButton").disabled = false;
  }
}

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

  $("refreshProducts").addEventListener("click", async () => {
    try {
      await loadProducts();
      message($("productMessage"), "পণ্যের তালিকা আপডেট হয়েছে।", "success");
    } catch (error) {
      message($("productMessage"), error.message, "error");
    }
  });

  $("productSearch").addEventListener("input", renderProducts);
  $("productForm").addEventListener("submit", saveProduct);
  $("cancelProductEdit").addEventListener("click", resetProductForm);

  $("productList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-product]");
    if (button) editProduct(button.dataset.editProduct);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  checkSession();
});
