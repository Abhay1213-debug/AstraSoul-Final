# Mock preview (fake data, for looking at the screens)

Run from the project folder:

```
npx vite --config tools/mock-preview/vite.mock.config.mjs
```

Then open http://localhost:5198/__as/customer (or `admin`, `staff`, `admin-nomfa`, `anon`). A red bar at the bottom says **MOCK PREVIEW**.

- Everything is **fake and in memory**; it resets when you reload. Nothing is saved, no Supabase is contacted.
- It uses the same screens as the real website but replaces the account and database services with the test stand-ins (`src/test`). It is **not evidence** that the real Supabase behaves this way.
- The website itself never imports anything from this folder (a test checks that nothing in `src` imports it).
