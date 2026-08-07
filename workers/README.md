# Meter share Worker (`share.odyssey-calc.com`)

Instant Discord previews: serves `index.html` and `og.png` from Supabase storage on your domain (no Supabase or `workers.dev` in share links).

Also serves durable community guide images at `/guide-images/{userId}/{file}` with long immutable cache headers (reduces Supabase egress).

Community guide share pages at `/guides/{slug}` expose Open Graph tags (title + author thumbnail when set) so Discord embeds show the guide card image.

## One-time setup

1. **DNS** — Domain `odyssey-calc.com` is already on Cloudflare Registrar, so DNS is in the same account.

2. **Create the Worker**
   ```bash
   cd workers
   npx wrangler deploy
   ```

3. **Supabase secrets**
   ```bash
   npx wrangler secret put SUPABASE_URL        # project URL only, e.g. https://xxxxx.supabase.co
   npx wrangler secret put SUPABASE_ANON_KEY   # anon key (published guide OG lookups)
   ```

4. **Custom domain** — Cloudflare dashboard → **Workers & Pages** → **odyssey-meter-share** → **Settings** → **Domains & Routes** → **Add** → `share.odyssey-calc.com`

   Cloudflare will create the `share` DNS record automatically.

5. **Production build** — GitHub Actions already sets `VITE_METER_SHARE_PUBLIC_ORIGIN=https://share.odyssey-calc.com`. Redeploy the site after merging.

6. **Regenerate** a Discord preview in the app and copy the new link (`https://share.odyssey-calc.com/meter-player/...`).

## Share URL shape

- Page: `https://share.odyssey-calc.com/meter-player/{playerKey}.html?d={cacheKey}`
- OG image: `https://share.odyssey-calc.com/meter-player/{playerKey}-og.png?d={cacheKey}`
- Guide images: `https://share.odyssey-calc.com/guide-images/{userId}/{file}`
- Community guides: `https://share.odyssey-calc.com/guides/{slug}` (optional `?section=`)
- Community guide OG image: `https://share.odyssey-calc.com/guides/{slug}-og.png` (1200×630, thumbnail centered)

Share HTML links (and delayed-redirects) to the app at `https://odyssey-calc.com/#/guides/...` / `#/meter/player/...` after Discord reads the preview.

## Optional: merge into `odyssey-proxy`

You can paste `meter-share-proxy.js` `fetch` logic into your existing worker instead of a separate deployment; attach `share.odyssey-calc.com` to that worker’s custom domains.

## Wiki API proxy (`odyssey-proxy`)

`odyssey-proxy.js` caches wiki GET responses at the edge (12h) so all visitors share one copy per URL. Tier list rebuilds send `X-Odyssey-Wiki-Refresh: 1` to bypass cache and pull fresh wiki data.

```bash
cd workers
npx wrangler deploy -c wrangler-odyssey-proxy.toml
```

Response header `X-Odyssey-Cache` is `HIT`, `MISS`, or `REFRESH` for debugging.
