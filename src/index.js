
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

const bad = (message, status = 400) => json({ error: message }, status);
const makeId = () => crypto.randomUUID();

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
  ) {
    return null;
  }

  return Math.round(value * 100);
}

function quantityToMilli(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100000000 ||
    Math.round(value * 1000) !== value * 1000
  ) {
    return null;
  }

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      // Health check
      if (path === "/api/health" && request.method === "GET") {
        const row = await env.DB
          .prepare("SELECT 1 AS ok")
          .first();

        return json({
          ok: row?.ok === 1,
          app: "CHAMAK STORE NEXT",
          version: "0.2.0"
        });
      }

      // Dashboard: existing summary preserved
      if (path === "/api/dashboard" && request.method === "GET") {
        const [products, cash, sales] = await Promise.all([
          env.DB.prepare(`
            SELECT
              COUNT(*) AS count,
              COALESCE(
                SUM(stock_qty_milli * avg_cost_paisa / 1000),
                0
              ) AS stock_value_paisa
            FROM products
            WHERE active = 1
          `).first(),

          env.DB.prepare(`
            SELECT COALESCE(
              SUM(
                CASE
                  WHEN direction = 'in' THEN amount_paisa
                  ELSE -amount_paisa
                END
              ),
              0
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
          stock_value_paisa: Math.round(
            products?.stock_value_paisa || 0
          ),
          cash_balance_paisa: cash?.balance_paisa || 0,
          today_sales_paisa: sales?.total_paisa || 0,
          notice:
            "Product Master enabled; transaction posting remains disabled."
        });
      }

      // List products
      if (path === "/api/products" && request.method === "GET") {
        const showInactive = url.searchParams.get("all") === "1";

        const result = await env.DB.prepare(`
          SELECT
            id,
            sku,
            name,
            unit,
            sale_price_paisa,
            avg_cost_paisa,
            stock_qty_milli,
            min_stock_qty_milli,
            active,
            created_at,
            updated_at
          FROM products
          ${showInactive ? "" : "WHERE active = 1"}
          ORDER BY name COLLATE NOCASE
          LIMIT 500
        `).all();

        return json({
          items: result.results || [],
          limit: 500
        });
      }

      // Create a product
      if (path === "/api/products" && request.method === "POST") {
        const body = await readBody(request);
        if (!body) return bad("সঠিক JSON তথ্য পাঠাতে হবে।");

        const name = readText(body.name, 120);
        const skuRaw = readText(body.sku, 40);
        const unit = readText(body.unit ?? "pcs", 20);
        const salePrice = moneyToPaisa(body.sale_price);
        const avgCost = moneyToPaisa(body.avg_cost ?? 0);
        const minStock = quantityToMilli(body.min_stock ?? 0);

        if (!name) {
          return bad("পণ্যের নাম প্রয়োজন; সর্বোচ্চ ১২০ অক্ষর।");
        }

        if (!skuRaw) {
          return bad("SKU প্রয়োজন; সর্বোচ্চ ৪০ অক্ষর।");
        }

        const sku = skuRaw.toUpperCase();

        if (!/^[A-Z0-9._-]{2,40}$/.test(sku)) {
          return bad(
            "SKU-তে ২–৪০টি ইংরেজি অক্ষর, সংখ্যা, dot, underscore বা hyphen ব্যবহার করো।"
          );
        }

        if (!unit) {
          return bad("পণ্যের একক প্রয়োজন।");
        }

        if (salePrice === null || avgCost === null) {
          return bad("বিক্রয়মূল্য ও ক্রয়মূল্য ০ বা তার বেশি সংখ্যায় দাও (টাকায়)।");
        }

        if (minStock === null) {
          return bad("সর্বনিম্ন স্টক ০ বা তার বেশি দাও; সর্বোচ্চ ৩ দশমিক ঘর।");
        }

        const productId = makeId();
        const created = {
          id: productId,
          sku,
          name,
          unit,
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
                id, sku, name, unit,
                sale_price_paisa, avg_cost_paisa,
                stock_qty_milli, min_stock_qty_milli, active
              )
              VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1)
            `).bind(
              productId,
              sku,
              name,
              unit,
              salePrice,
              avgCost,
              minStock
            ),

            env.DB.prepare(`
              INSERT INTO audit_logs (
                id, action, entity_type, entity_id, after_json
              )
              VALUES (?, ?, ?, ?, ?)
            `).bind(
              makeId(),
              "product_created",
              "product",
              productId,
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
          id: productId,
          message: "পণ্য সংরক্ষিত হয়েছে।"
        }, 201);
      }

      // Edit an existing product; stock and average cost are protected
      const match = path.match(
        /^\/api\/products\/([0-9a-f-]{36})$/i
      );

      if (match && request.method === "PATCH") {
        const body = await readBody(request);
        if (!body) return bad("সঠিক JSON তথ্য পাঠাতে হবে।");

        const productId = match[1];

        const old = await env.DB.prepare(`
          SELECT
            id, sku, name, unit,
            sale_price_paisa, avg_cost_paisa,
            stock_qty_milli, min_stock_qty_milli, active
          FROM products
          WHERE id = ?
        `).bind(productId).first();

        if (!old) return bad("পণ্য পাওয়া যায়নি।", 404);

        const name = body.name === undefined
          ? old.name
          : readText(body.name, 120);

        const unit = body.unit === undefined
          ? old.unit
          : readText(body.unit, 20);

        const salePrice = body.sale_price === undefined
          ? old.sale_price_paisa
          : moneyToPaisa(body.sale_price);

        const minStock = body.min_stock === undefined
          ? old.min_stock_qty_milli
          : quantityToMilli(body.min_stock);

        const active = body.active === undefined
          ? old.active
          : body.active;

        if (!name || !unit) {
          return bad("পণ্যের নাম ও একক সঠিকভাবে দাও।");
        }

        if (salePrice === null || salePrice === undefined) {
          return bad("বিক্রয়মূল্য ০ বা তার বেশি সংখ্যায় দাও (টাকায়)।");
        }

        if (minStock === null || minStock === undefined) {
          return bad("সর্বনিম্ন স্টকের পরিমাণ সঠিক নয়।");
        }

        if (active !== 0 && active !== 1) {
          return bad("active-এর মান 0 অথবা 1 হতে হবে।");
        }

        const updated = {
          ...old,
          name,
          unit,
          sale_price_paisa: salePrice,
          min_stock_qty_milli: minStock,
          active
        };

        await env.DB.batch([
          env.DB.prepare(`
            UPDATE products
            SET
              name = ?,
              unit = ?,
              sale_price_paisa = ?,
              min_stock_qty_milli = ?,
              active = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?
          `).bind(
            name,
            unit,
            salePrice,
            minStock,
            active,
            productId
          ),

          env.DB.prepare(`
            INSERT INTO audit_logs (
              id, action, entity_type, entity_id,
              before_json, after_json
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            makeId(),
            "product_updated",
            "product",
            productId,
            JSON.stringify(old),
            JSON.stringify(updated)
          )
        ]);

        return json({
          ok: true,
          message: "পণ্যের তথ্য আপডেট হয়েছে।"
        });
      }

      if (path === "/api/products" || match) {
        return json({ error: "এই HTTP method অনুমোদিত নয়।" }, 405);
      }

      return json({
        error: "API route not implemented",
        path
      }, 501);

    } catch {
      return json({
        error: "Internal server error",
        detail: "Cloudflare Worker logs পরীক্ষা করো।"
      }, 500);
    }
  }
};
