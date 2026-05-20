# Odyssey Calc

Fan tools for Digimon Odyssey: DPS lab, gear planner, tier list, and meter parse sharing.

Live site: [https://mistgg.github.io/Odyssey-Calc/](https://mistgg.github.io/Odyssey-Calc/)

## Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and set any `VITE_*` variables you need for local builds.

### Meter leaderboard (Supabase)

The public **Meter** page reads `meter_parses` with the anon key. After the table exists, run once in **SQL Editor**:

`supabase/meter_parses_public_leaderboard.sql`

Without it, visitors get “permission denied” and signed-in users only see their own uploads.
