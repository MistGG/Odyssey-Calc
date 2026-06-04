# process-meter-leaderboard

Supabase Edge Function: writes `meter_leaderboard_entries` from dungeon party parses.

Hall of Fame gold rows are maintained automatically via DB triggers on `meter_leaderboard_entries` (`meter_hof_gold_entries`). On `--force` reprocess, the function also calls `rebuild_meter_hof_gold_for_scope` after deleting old rows.

Apply migration `20260604150000_meter_hof_gold_materialized.sql` (and earlier meter RPC migrations) with `supabase db push` before deploying this function.

## Deploy

**Dashboard:** Edge Functions → `process-meter-leaderboard` → replace code with `index.ts` → Deploy.

**CLI:**

```bash
supabase functions deploy process-meter-leaderboard --project-ref YOUR_PROJECT_REF
```

Secrets (usually already set): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `WIKI_DIGIMON_LIST_URL`, `WIKI_DIGIMON_DETAIL_URL`.

## Repair one parse (e.g. partial ingest)

After deploying the fixed function:

```bash
node scripts/reprocess-meter-parse.mjs 4ed5c4a8-b661-44d7-b7dc-beb04eae031a --force
```

Without `--force`, the function only inserts **missing** players (safe for cnc’s 129k run where only Spirit was stored).

## Batch backfill

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process-meter-leaderboard" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"backfill_limit": 100, "force": false}'
```

From repo root (`.env.local` with service role):

```bash
npm run backfill:meter-leaderboard          # batch via edge function
npm run backfill:meter-parses               # one parse at a time (no batch RPC required)
node scripts/backfill-meter-leaderboard-parses.mjs --dungeon uqia2vm
node scripts/backfill-meter-leaderboard-entries.mjs   # repair null roleBucket rows only
```

New companion uploads already store `leaderboard_summary` and POST this function; backfill covers older parses.
