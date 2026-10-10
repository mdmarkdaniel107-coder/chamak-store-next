# CHAMAK STORE NEXT

স্বতন্ত্র নতুন grocery bookkeeping web app foundation. `chamak-store-web` ও `chamak-store-fresh` অপরিবর্তিত থাকবে।

## সতর্কতা
এটি foundation scaffold; পূর্ণ হিসাবের সব API এখনো তৈরি হয়নি। বাস্তব লেনদেনের জন্য ব্যবহার করবেন না যতক্ষণ না authentication, posting APIs, costing, ledger, reports ও tests সম্পন্ন হয়।

## Setup
1. GitHub-এ `chamak-store-next` নামে নতুন empty repository তৈরি করুন।
2. ZIP extract করে সব ফাইল repository root-এ upload/push করুন।
3. Cloudflare-এ নতুন D1 database `chamak-store-next-db` তৈরি করুন।
4. `wrangler.toml`-এ নতুন D1 ID বসান।
5. `docs/DEPLOY.md` অনুসরণ করুন।
