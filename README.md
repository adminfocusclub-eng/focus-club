# FOCUS CLUB app (Android + iPhone web app)

## Run
```
node server.js        # needs Node 18+, nothing else to install
```
Open http://localhost:3000 — Admin PIN is **1234** the first time (change it in Settings).

## Save data in Supabase (free cloud storage)
1. Create a free project at https://supabase.com
2. Project Settings → API: copy the **Project URL** and the **service_role** (secret) key
3. Start the app with these two settings (environment variables):
```
SUPABASE_URL=https://xxxxx.supabase.co  SUPABASE_KEY=your-secret-key  node server.js
```
The app creates a private storage bucket called `focus-club` by itself and keeps
`db.json` (members, fees, accounts, settings) and the `photos/` folder inside it.
Without these two settings the app saves into the local `data/` folder instead.
Settings screen shows which one is in use.

Keep the secret key private. Never put it in the `public/` folder or share it publicly.

## Put it online (example: Render free plan)
New Web Service → upload/connect this folder → Start command `node server.js`
→ add environment variables `SUPABASE_URL` and `SUPABASE_KEY`.

## Install on phones
- Android: open the link in Chrome → menu ⋮ → Add to Home screen
- iPhone: open the link in Safari → Share → Add to Home Screen
