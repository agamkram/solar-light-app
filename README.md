# Solar Light

Shows how much direct sunlight hits the ground at your location, as a percentage of solar noon.

## Deploy on Vercel

1. Create a repo on GitHub named `solar-light-app` (or use the push script after the remote exists).
2. Double-click **PUSH-TO-GITHUB.command** (one-time SSH setup: see **ADD-SSH-KEY-TO-GITHUB.txt**).
3. Go to [vercel.com/new](https://vercel.com/new) and import `agamkram/solar-light-app`.
4. Framework: **Other** (static site). Root directory: `.` — click **Deploy**.

No environment variables or build step needed.

## Local preview

```bash
python3 -m http.server 8899
```

Open http://localhost:8899

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure |
| `styles.css` | Layout and theme |
| `solar.js` | Sun position and irradiance math |
| `app.js` | Canvas, slider, geolocation |

Elevation lookup uses [Open-Meteo](https://open-meteo.com/) when GPS altitude is unavailable.