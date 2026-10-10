# Cloudflare deployment

1. GitHub → New repository → `chamak-store-next` তৈরি করুন।
2. ZIP extract করে ফাইলগুলো repository root-এ upload/push করুন।
3. Cloudflare Dashboard → D1 → Create database → `chamak-store-next-db`; ID কপি করুন।
4. `wrangler.toml`-এ `REPLACE_WITH_NEW_D1_DATABASE_ID` বদলে নতুন ID দিন এবং commit করুন।
5. স্থানীয় টার্মিনালে repository folder-এ `npm install` চালান।
6. `npx wrangler login` প্রয়োজন হলে সম্পন্ন করুন।
7. `npx wrangler d1 migrations apply chamak-store-next-db --remote`
8. `npx wrangler deploy`
9. Worker URL-এর শেষে `/api/health` খুলুন; `ok:true` দেখতে হবে।

পুরোনো Worker বা D1 database নির্বাচন করবেন না। `database_id` না বসিয়ে remote migration চালাবেন না। এই scaffold-এ শুধু health ও read-only dashboard API আছে; পূর্ণ হিসাব API ও authentication হওয়ার আগে বাস্তব লেনদেন লিখবেন না।
