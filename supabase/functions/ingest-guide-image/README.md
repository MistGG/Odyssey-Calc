# ingest-guide-image

Mirrors a remote image URL into the `guide-images` Supabase Storage bucket and
records a `community_guide_images` row. Used when guide authors paste thumbnail
or markdown image links.

## Deploy

```bash
npx supabase functions deploy ingest-guide-image --project-ref fnbixrelavkfvzprlgzc
```

Optional secret/env: `GUIDE_IMAGE_CDN_ORIGIN` or `METER_SHARE_PUBLIC_ORIGIN`
(defaults to `https://share.odyssey-calc.com`).
