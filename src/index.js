const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export default { async fetch(request,env) {
 const url=new URL(request.url);
 if(url.pathname.startsWith("/api/")) {
  try {
   if(url.pathname==="/api/health" && request.method==="GET") {
    const row=await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ok:row?.ok===1,app:"CHAMAK STORE NEXT",version:"0.1.0"});
   }
   if(url.pathname==="/api/dashboard" && request.method==="GET") {
    const [p,c,s]=await Promise.all([
     env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(stock_qty_milli*avg_cost_paisa/1000),0) AS stock_value_paisa FROM products WHERE active=1").first(),
     env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount_paisa ELSE -amount_paisa END),0) AS balance_paisa FROM cash_ledger").first(),
     env.DB.prepare("SELECT COALESCE(SUM(amount_paisa),0) AS total_paisa FROM transactions WHERE status='posted' AND kind IN('sale_items','sale_total') AND date(occurred_at)=date('now')").first()
    ]);
    return json({product_count:p?.count||0,stock_value_paisa:Math.round(p?.stock_value_paisa||0),cash_balance_paisa:c?.balance_paisa||0,today_sales_paisa:s?.total_paisa||0,notice:"Foundation only; posting APIs not implemented."});
   }
   return json({error:"API route not implemented",path:url.pathname},501);
  } catch { return json({error:"Internal server error",detail:"Check Worker logs."},500); }
 }
 return env.ASSETS.fetch(request);
}};
