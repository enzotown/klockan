# Klockan

Tre lekar om tid för barn 4–6 år: **STÄLL** (dra visarna till tiden Kotten säger) och
**LÄS** (hitta urtavlan som visar samma tid) och **SIFFROR** (en digital tid som 4:00 eller 8:30 — barnet hittar urtavlan som visar samma). Hela timmar först, halva timmar efter sex rätta.
Inget kan förloras; stjärnor sparas bara i webbläsaren.

Live: https://klockan.shipholm.dev — byggs från `enzotown/klockan` och deployas vid push.

## Filer

- `index.html` — canvas, manifest, service worker (registreras bara på https)
- `app.js` — all spellogik (urtavla, visardragning, uppgifter, röst, ljud)
- `sw.js` — offline-cache, nätet först
- `larare.html` — sida för vuxna: vad barnet tränar, Lgr22-koppling
- `icon-180/192/512.png` — appikon (urtavla)

## Testkrokar

`window.__kl` i konsolen: `state()`, `hits()`, `rects()`, `setTask(h, m)`, `setHands(h, m)`,
`setLevel(1|2)`, `answer(i)`, `solve()`, `mode('stall'|'las')`.
