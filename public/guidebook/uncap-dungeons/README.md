# Guidebook — uncap dungeon location images

Drop **location / map screenshots** here for the Early Game **50–70** uncap dungeon cards.

Files live in this folder and are served via Vite `public/` (with the app `base` prefix on GitHub Pages), e.g. `/Odyssey-Calc/guidebook/uncap-dungeons/agumons-madness-location.png`.

## Expected filenames

| File | Dungeon |
|------|---------|
| `agumons-madness-location.png` | Agumon's Madness (level 50 uncap) |
| `fallen-angel-location.png` | The Rise of the Fallen Angel (level 70 uncap) |
| `dark-roar-location.png` | The Dark Roar — Big Sight (70 and beyond) |

`.webp` is also tried automatically if the `.png` is missing.

Recommended: PNG or WebP, roughly 16:9 or 4:3, at least ~640px wide so the card crop stays sharp.

Boss portraits and item icons are loaded from the wiki API — only **location** images belong in this folder.

After adding or updating screenshots, regenerate Discord/share previews:

```bash
npm run generate:guidebook-share
```

(Use `VITE_BASE_PATH=/` and `GUIDEBOOK_SHARE_SITE_ORIGIN=http://localhost:5173` for local dev URLs.)
