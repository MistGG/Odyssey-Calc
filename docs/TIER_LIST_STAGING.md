# Tier list staging (GitHub Actions)

Rebuilds the full tier list and changelog in CI, then commits JSON to the **`tier-list-staging`** branch only. **`main` and live GitHub Pages are unchanged.**

## One-time setup

1. Create the staging branch from `main`:

   ```bash
   git checkout main
   git pull
   git checkout -b tier-list-staging
   git push -u origin tier-list-staging
   ```

2. In the repo **Settings → Secrets and variables → Actions**, ensure these exist (same as Pages deploy):

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (recommended so approved community rotations load in CI)

## Run a rebuild

1. GitHub → **Actions** → **Tier list staging rebuild** → **Run workflow** (branch `tier-list-staging`).
2. The job fetches every Digimon, runs the same sims as **Update tier list**, writes:
   - `public/data/tier-list.json`
   - `public/data/tier-changes.json` (appends a run only when there are visible changes)
3. If nothing changed vs the previous publish, the workflow **skips the commit** (no empty changelog run).
4. On 429 / rate limits: **10s backoff** and the same Digimon is **requeued** (same as the browser).

## Test the result (without touching live)

**Option A — download CI artifact**

After the workflow finishes, open the **preview-artifact** job and download **tier-list-staging-preview**. Serve `dist/` locally (`npx vite preview`) or unzip and open `index.html` via a static server.

**Option B — local dev on staging branch**

```bash
git fetch origin tier-list-staging
git checkout tier-list-staging
npm install
# Ensure public/data/tier-list.json exists (from the workflow commit)
$env:VITE_TIER_STATIC_DATA="true"
npm run dev
```

Open **Tier list** and **Changes**. Update / Clear cache buttons are hidden; data comes from the published JSON.

## Going live later

When staging looks good, merge app + data changes to `main` and switch production to `VITE_TIER_STATIC_DATA=true` on the Pages build (separate step).
