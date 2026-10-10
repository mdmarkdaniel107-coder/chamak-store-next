
const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders
    }
  });

const bad = (message, status = 400) =>
  json({ error: message }, status);

const makeId = () => crypto.randomUUID();
const COOKIE_NAME = "__Host-chamak_session";
const SESSION_SECONDS = 12 * 60 * 60;

function readText(value, maxLength) {
  if (typeof value !== "string") return null;
  const result = value.trim();
  if (!result || result.length > maxLength) return null;
  return result;
}

function moneyToPaisa(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1000000000
  ) return null;

  return Math.round(value * 100);
}

function quantityToMilli(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100000000 ||
    Math.round(value * 1000) !== value * 1000
  ) return null;

  return Math.round(value * 1000);
}

async function readBody(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body;
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  try {
    const binary = atob(
      base64 + "=".repeat((4 - base64.length % 4) % 4)
    );
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeEqual(a, b) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    difference |=
      (left[i % Math.max(left.length, 1)] || 0) ^
      (right[i % Math.max(right.length, 1)] || 0);
  }

  return difference === 0;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signSession(payload, secret) {
  const encoded = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(encoded)
  );

  return `${encoded}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function verifySession(token, secret) {
  if (typeof token !== "string" || token.length > 2048) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const payloadBytes = base64UrlToBytes(parts[0]);
  const signatureBytes = base64UrlToBytes(parts[1]);

  if (!payloadBytes || !signatureBytes) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }

  if (
    !payload ||
    payload.v !== 1 ||
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) return null;

  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signatureBytes,
    new TextEncoder().encode(parts[0])
  );

  return valid ? payload : null;
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";

  for (const part of cookie.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;

    if (part.slice(0, index).trim() === name) {
      return part.slice(index + 1).trim();
    }
  }

  return null;
}

function sessionCookie(value, maxAge = SESSION_SECONDS) {
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function auditProduct(env, action, id, before, after) {
  await env.DB.prepare(`
    INSERT INTO audit_logs (
      id, action, entity_type, entity_id, before_json, after_json
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    makeId(),
    action,
    "product",
    id,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null
  ).run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (!path.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      // Public health endpoint: never expose secrets or account details.
      if (path === "/api/health" && method === "GET") {
        const row = await env.DB.prepare("SELECT 1 AS ok").first();

        return json({
          ok: row?.ok === 1,
          app: "CHAMAK STORE NEXT",
          version: "0.3.0"
        });
      }

      if (
        !env.APP_PASSWORD ||
        typeof env.SESSION_SECRET !== "string" ||
        env.SESSION_SECRET.length < 32
      ) {
        return json({
          error: "সার্ভারের নিরাপত্তা সেটিংস অসম্পূর্ণ।"
        }, 503);
      }

      // Login
      if (path === "/api/auth/login" && method === "POST") {
        if (!sameOrigin(request)) {
          return bad("অনুরোধের উৎস যাচাই করা যায়নি।", 403);
        }

        const body = await readBody(request);
        if (!body || typeof body.password !== "string") {
          return bad("পাসওয়ার্ড দাও।", 400);
        }

        if (body.password.length > 1024) {
          return bad("পাসওয়ার্ড সঠিক নয়।", 401);
        }

        if (!constantTimeEqual(body.password, env.APP_PASSWORD)) {
          return bad("পাসওয়ার্ড সঠিক নয়।", 401);
        }

        const now = Math.floor(Date.now() / 1000);
        const token = await signSession({
          v: 1,
          iat: now,
          exp: now + SESSION_SECONDS,
          nonce: crypto.randomUUID()
        }, env.SESSION_SECRET);

        return json({
          ok: true,
          expires_in: SESSION_SECONDS
        }, 200, {
          "set-cookie": sessionCookie(token)
        });
      }

      // Logout
      if (path === "/api/auth/logout" && method === "POST") {
        if (!sameOrigin(request)) {
          return bad("অনুরোধের উৎস যাচাই করা যায়নি।", 403);
        }

        return json({ ok: true }, 200, {
          "set-cookie": clearSessionCookie()
        });
      }

      // Session status
      if (path === "/api/auth/session" && method === "GET") {
        const token = getCookie(request, COOKIE_NAME);
        const session = token
          ? await verifySession(token, env.SESSION_SECRET)
          : null;

        return json({
          authenticated: Boolean(session),
          expires_at: session?.exp || null
        });
      }

      // Protect every other API route.
      const token = getCookie(request, COOKIE_NAME);
      const session = token
        ? await verifySession(token, env.SESSION_SECRET)
        : null;

      if (!session) {
        return bad("লগইন প্রয়োজন।", 401);
      }

      // Reject cross-origin requests that can modify data.
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        if (!sameOrigin(request)) {
          return bad("অনুরোধের উৎস যাচাই করা যায়নি।", 403);
        }
      }

      if (path === "/api/dashboard" && method === "GET") {
        const [products, cash, sales] = await Promise.all([
          env.DB.prepare(`
            SELECT
              COUNT(*) AS count,
              COALESCE(
                SUM(stock_qty_milli * avg_cost_paisa / 1000), 0
              ) AS stock_value_paisa
            FROM products
            WHERE active = 1
          `).first(),

          env.DB.prepare(`
            SELECT COALESCE(
              SUM(CASE
                WHEN direction = 'in' THEN amount_paisa
                ELSE -amount_paisa
              END), 0
            ) AS balance_paisa
            FROM cash_ledger
          `).first(),

          env.DB.prepare(`
            SELECT COALESCE(SUM(amount_paisa), 0) AS total_paisa
            FROM transactions
            WHERE status = 'posted'
              AND kind IN ('sale_items', 'sale_total')
              AND date(occurred_at) = date('now')
          `).first()
        ]);

        return json({
          product_count: products?.count || 0,
          stock_value_paisa: Math.round(products?.stock_value_paisa || 0),
          cash_balance_paisa: cash?.balance_paisa || 0,
          today_sales_paisa: sales?.total_paisa || 0,
          notice: "লেনদেনের মডিউল পরবর্তী ধাপে চালু হবে।"
        });
      }

      // List products
      if (path === "/api/products" && method === "GET") {
        const showInactive = url.searchParams.get("all") === "1";

        const result = await env.DB.prepare(`
          SELECT
            id, sku, name, unit, sale_price_paisa, avg_cost_paisa,
            stock_qty_milli, min_stock_qty_milli, active,
            created_at, updated_at
          FROM products
          ${showInactive ? "" : "WHERE active = 1"}
          ORDER BY name COLLATE NOCASE
          LIMIT 500
        `).all();

        return json({ items: result.results || [], limit: 500 });
      }

      // Create product
      if (path === "/api/products" && method === "POST") {
        const body = await readBody(request);
        if (!body) return bad("সঠিক JSON তথ্য পাঠাতে হবে।");

        const name = readText(body.name, 120);
        const skuRaw = readText(body.sku, 40);
        const unit = readText(body.unit ?? "pcs", 20);
        const salePrice = moneyToPaisa(body.sale_price);
        const avgCost = moneyToPaisa(body.avg_cost ?? 0);
        const minStock = quantityToMilli(body.min_stock ?? 0);

        if (!name) return bad("পণ্যের নাম প্রয়োজন; সর্বোচ্চ ১২০ অক্ষর।");
        if (!skuRaw) return bad("SKU প্রয়োজন; সর্বোচ্চ ৪০ অক্ষর।");

        const sku = skuRaw.toUpperCase();

        if (!/^[A-Z0-9._-]{2,40}$/.test(sku)) {
          return bad("SKU-তে ২–৪০টি ইংরেজি অক্ষর, সংখ্যা, dot, underscore বা hyphen ব্যবহার করো।");
        }

        if (!unit) return bad("পণ্যের একক প্রয়োজন।");
        if (salePrice === null || avgCost === null) {
          return bad("বিক্রয়মূল্য ও ক্রয়মূল্য ০ বা তার বেশি সংখ্যায় দাও।");
        }
        if (minStock === null) {
          return bad("সর্বনিম্ন স্টক সঠিক নয়।");
        }

        const id = makeId();
        const created = {
          id, sku, name, unit,
          sale_price_paisa: salePrice,
          avg_cost_paisa: avgCost,
          stock_qty_milli: 0,
          min_stock_qty_milli: minStock,
          active: 1
        };

        try {
          await env.DB.batch([
            env.DB.prepare(`
              INSERT INTO products (
                id, sku, name, unit, sale_price_paisa, avg_cost_paisa,
                stock_qty_milli, min_stock_qty_milli, active
              )
              VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1)
            `).bind(id, sku, name, unit, salePrice, avgCost, minStock),

            env.DB.prepare(`
              INSERT INTO audit_logs (
                id, action, entity_type, entity_id, after_json
              )
              VALUES (?, ?, ?, ?, ?)
            `).bind(
              makeId(), "product_created", "product", id,
              JSON.stringify(created)
            )
          ]);
        } catch (error) {
          if (String(error?.message || error).includes("UNIQUE")) {
            return bad("এই SKU আগে থেকেই আছে। অন্য SKU ব্যবহার করো।", 409);
          }
          throw error;
        }

        return json({
          ok: true,
          id,
          message: "পণ্য সংরক্ষিত হয়েছে।"
        }, 201);
      }

      const match = path.match(/^\/api\/products\/([0-9a-f-]{36})$/i);

      // Edit product; stock and average cost remain protected.
      if (match && method === "PATCH") {
        const body = await readBody(request);
        if (!body) return bad("সঠিক JSON তথ্য পাঠাতে হবে।");

        const id = match[1];

        const old = await env.DB.prepare(`
          SELECT id, sku, name, unit, sale_price_paisa, avg_cost_paisa,
                 stock_qty_milli, min_stock_qty_milli, active
          FROM products
          WHERE id = ?
        `).bind(id).first();

        if (!old) return bad("পণ্য পাওয়া যায়নি।", 404);

        const name = body.name === undefined ? old.name : readText(body.name, 120);
        const unit = body.unit === undefined ? old.unit : readText(body.unit, 20);
        const salePrice = body.sale_price === undefined
          ? old.sale_price_paisa
          : moneyToPaisa(body.sale_price);
        const minStock = body.min_stock === undefined
          ? old.min_stock_qty_milli
          : quantityToMilli(body.min_stock);
        const active = body.active === undefined ? old.active : body.active;

        if (!name || !unit) return bad("পণ্যের নাম ও একক সঠিকভাবে দাও।");
        if (salePrice === null || salePrice === undefined) {
          return bad("বিক্রয়মূল্য সঠিক নয়।");
        }
        if (minStock === null || minStock === undefined) {
          return bad("সর্বনিম্ন স্টকের পরিমাণ সঠিক নয়।");
        }
        if (active !== 0 && active !== 1) {
          return bad("active-এর মান 0 অথবা 1 হতে হবে।");
        }

        const updated = {
          ...old, name, unit,
          sale_price_paisa: salePrice,
          min_stock_qty_milli: minStock,
          active
        };

        await env.DB.batch([
          env.DB.prepare(`
            UPDATE products
            SET name = ?, unit = ?, sale_price_paisa = ?,
                min_stock_qty_milli = ?, active = ?,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?
          `).bind(name, unit, salePrice, minStock, active, id),

          env.DB.prepare(`
            INSERT INTO audit_logs (
              id, action, entity_type, entity_id, before_json, after_json
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            makeId(), "product_updated", "product", id,
            JSON.stringify(old), JSON.stringify(updated)
          )
        ]);

        return json({ ok: true, message: "পণ্যের তথ্য আপডেট হয়েছে।" });
      }

      if (path === "/api/products" || match) {
        return json({ error: "এই HTTP method অনুমোদিত নয়।" }, 405);
      }

      return json({ error: "API route পাওয়া যায়নি।" }, 404);
    } catch (error) {
      // Do not send SQL details or secrets to the browser.
      console.error("Worker request failed:", error?.message || error);

      return json({
        error: "সার্ভারে সমস্যা হয়েছে। Cloudflare Worker logs পরীক্ষা করো।"
      }, 500);
    }
  }
};
