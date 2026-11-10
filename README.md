# Royal Harvest

Fresh fruits, vegetables and daily essentials delivered across Gadag in 2 hours, in English and ಕನ್ನಡ.

## What's in here

| Part | File | Who uses it |
|---|---|---|
| The shop | `src/App.js` (plus `src/FirstOpen.js`, `src/Alerts.js`) | Customers |
| Admin panel | `public/admin.html` | The owner: orders, products, prices, costs, profit, delivery boys, alerts |
| Delivery app | `public/delivery.html` (+ `delivery-sw.js`, `delivery-manifest.json`) | Delivery boys |
| Database | `supabase/*.sql` (applied in number order) | Supabase |
| Alert sender | `supabase/functions/send-push` | Supabase Edge Functions |

## Where it runs

- **Website:** Cloudflare Pages, project `royalharvest` (royalharvest.pages.dev). Every push to `main` builds with
  `npm run build` and publishes the `build` folder.
- **Database and login:** Supabase.

## Working on it

```
npm install
npm start          # the shop on http://localhost:3000
npm run build      # what Cloudflare builds
```
