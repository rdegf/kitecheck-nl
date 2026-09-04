# KiteCheck NL

A small static website that checks 10 Dutch kitesurf spots against the next
3 days of wind forecast, rates each day, and shows results as a map and a
sortable list.

## How it works

- **Wind data**: [Open-Meteo](https://open-meteo.com/) forecast API, called
  directly from your browser — free, no API key, no signup.
- **Rating**: for each spot and each of the next 3 days, the app scores
  every possible 3-hour window on wind speed (peaks around 14–28 knots) and
  wind direction relative to that spot's coastline. **Side-shore wind rates
  highest, side-onshore next, then onshore, then side-offshore, then
  offshore.** An offshore day is called out explicitly ("⚠ Offshore — not
  good for kitesurfing") instead of a star rating, and any individual
  offshore hour in the hour-by-hour table is flagged and highlighted the
  same way. The best-scoring window becomes that day's headline rating
  (1–5 stars) otherwise.
- **Hourly detail**: every day's card includes a full hour-by-hour table
  (7am–8pm) of wind speed, gusts, and direction — not just the best
  window's average — so you can see exactly how the wind builds or drops
  off through the day.
- **Distance**: you type a home location once per visit; it's geocoded via
  OpenStreetMap's free [Nominatim](https://nominatim.org/) API, then
  driving distance to each spot is fetched from [OSRM](https://project-osrm.org/)'s
  free public routing server. If that routing request fails for a spot
  (it's a best-effort demo server, not a guaranteed production service),
  the card falls back to straight-line distance and says so.
- Everything runs client-side — there's no backend or database.

## Files

- `index.html` — page structure
- `style.css` — styling
- `spots.js` — the 10 tracked spots (name, coordinates, coastline
  orientation, water type). Easy to edit — add/remove spots or tweak the
  `onshoreBearing` values if a rating feels off for a spot you know well.
- `app.js` — fetching, scoring, and rendering logic

## Running it locally

Just open `index.html` in a browser. (Some browsers restrict API calls from
`file://` pages — if the forecast doesn't load, run a tiny local server
instead, e.g. `python3 -m http.server` from this folder, then visit
`http://localhost:8000`.)

## Deploying to GitHub Pages (free, permanent URL)

1. Create a new repository on GitHub (e.g. `kitecheck-nl`) — public, no
   need to initialize it with a README.
2. From this folder, run:
   ```
   git init
   git add .
   git commit -m "Initial version of KiteCheck NL"
   git branch -M main
   git remote add origin https://github.com/<your-username>/kitecheck-nl.git
   git push -u origin main
   ```
3. On GitHub, go to the repository's **Settings → Pages**.
4. Under "Build and deployment", set **Source** to "Deploy from a branch",
   branch `main`, folder `/ (root)`, then **Save**.
5. After a minute or two, your site will be live at
   `https://<your-username>.github.io/kitecheck-nl/`.

Any time you want to change something, edit the files and:
```
git add .
git commit -m "Update spots"
git push
```
GitHub Pages redeploys automatically within a minute or two.

## Notes / known limitations

- Nominatim's usage policy asks for light traffic (a request or two per
  visit is fine; don't hammer it). The same goes for OSRM's demo routing
  server — fine for personal use, not meant for heavy or commercial
  traffic. If it ever becomes unreliable, swapping in a key-based service
  like OpenRouteService (free tier, requires signup) is a straightforward
  change to `fetchRoadDistanceKm` in `app.js`.
- If a spot's rating looks off for a day you know well, it's almost always
  the `onshoreBearing` value in `spots.js` that needs adjusting — it's a
  rough approximation of each coastline's real-world orientation.
