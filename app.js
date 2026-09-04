// ---------- constants ----------

const COMPASS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
const DAY_START_HOUR = 7;   // only consider this window of the day (daylight-ish)
const DAY_END_HOUR = 20;
const WINDOW_LEN = 3;       // hours, sliding window used to find the "best block" of a day

const DIRECTION_SCORES = {
  "side-shore": 100,
  "side-onshore": 85,
  "onshore": 60,
  "side-offshore": 25,
  "offshore": 5,
};

// ---------- small math helpers ----------

function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// smallest angle between two bearings, 0-180
function angleDiff(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// circular mean of a list of degree headings
function circularMeanDeg(degs) {
  let sumSin = 0, sumCos = 0;
  for (const d of degs) {
    sumSin += Math.sin(toRad(d));
    sumCos += Math.cos(toRad(d));
  }
  let mean = toDeg(Math.atan2(sumSin, sumCos));
  return mean < 0 ? mean + 360 : mean;
}

function compassLabel(deg) {
  const idx = Math.round(deg / 22.5) % 16;
  return COMPASS[idx];
}

// ---------- scoring ----------

// Wind speed "sweet spot" curve, in knots. Peaks ~14-28kt, tapers off
// below (too light) and above (too strong / dangerous) that range.
function speedScore(kn) {
  if (kn < 6) return 5;
  if (kn < 10) return lerp(kn, 6, 10, 5, 40);
  if (kn < 14) return lerp(kn, 10, 14, 40, 80);
  if (kn <= 28) return lerp(kn, 14, 28, 88, 100) - Math.abs(kn - 20) * 0.3; // gentle peak near 20kt
  if (kn <= 35) return lerp(kn, 28, 35, 90, 55);
  if (kn <= 45) return lerp(kn, 35, 45, 55, 15);
  return 5;
}

function lerp(x, x0, x1, y0, y1) {
  const t = (x - x0) / (x1 - x0);
  return y0 + t * (y1 - y0);
}

// Classifies actual wind direction against a spot's onshore bearing.
// Side-shore and side-onshore rate above pure onshore; offshore is
// flagged as effectively unsafe / not recommended.
function directionInfo(windDir, onshoreBearing) {
  const diff = angleDiff(windDir, onshoreBearing);
  let category;
  if (diff <= 30) category = "onshore";
  else if (diff <= 60) category = "side-onshore";
  else if (diff <= 120) category = "side-shore";
  else if (diff <= 150) category = "side-offshore";
  else category = "offshore";
  return { category, score: DIRECTION_SCORES[category] };
}

function overallScore(avgSpeedKn, dirInfo) {
  return speedScore(avgSpeedKn) * (dirInfo.score / 100);
}

function scoreToStars(score) {
  return Math.max(0, Math.min(5, Math.round(score / 20)));
}

function starClass(stars) {
  if (stars >= 4) return "rating-good";
  if (stars >= 2) return "rating-mid";
  return "rating-bad";
}

// ---------- geocoding ----------

async function geocodeHome(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=nl&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error("Geocoding request failed");
  const data = await res.json();
  if (!data.length) {
    // retry without the NL country restriction, in case the user typed
    // something Nominatim only resolves globally
    const url2 = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res2 = await fetch(url2, { headers: { "Accept": "application/json" } });
    const data2 = await res2.json();
    if (!data2.length) throw new Error("Could not find that location");
    return { lat: parseFloat(data2[0].lat), lon: parseFloat(data2[0].lon), label: data2[0].display_name };
  }
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), label: data[0].display_name };
}

// ---------- forecast fetch + per-day best-window computation ----------

async function fetchSpotForecast(spot) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}` +
    `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=kn` +
    `&forecast_days=3&timezone=Europe%2FAmsterdam`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Forecast request failed for ${spot.name}`);
  const data = await res.json();
  return buildDayWindows(data.hourly, spot);
}

function buildDayWindows(hourly, spot) {
  const times = hourly.time;
  const speeds = hourly.wind_speed_10m;
  const gusts = hourly.wind_gusts_10m;
  const dirs = hourly.wind_direction_10m;

  // group hour indices by calendar date
  const byDate = new Map();
  times.forEach((t, i) => {
    const date = t.slice(0, 10);
    const hour = parseInt(t.slice(11, 13), 10);
    if (hour < DAY_START_HOUR || hour > DAY_END_HOUR) return;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(i);
  });

  const dates = [...byDate.keys()].slice(0, 3);
  const days = dates.map((date) => {
    const idxs = byDate.get(date);
    let best = null;

    for (let w = 0; w + WINDOW_LEN <= idxs.length; w++) {
      const windowIdxs = idxs.slice(w, w + WINDOW_LEN);
      const avgSpeed = average(windowIdxs.map((i) => speeds[i]));
      const avgGust = average(windowIdxs.map((i) => gusts[i]));
      const avgDir = circularMeanDeg(windowIdxs.map((i) => dirs[i]));
      const dirInfo = directionInfo(avgDir, spot.onshoreBearing);
      const score = overallScore(avgSpeed, dirInfo);

      if (!best || score > best.score) {
        const startHour = parseInt(times[windowIdxs[0]].slice(11, 13), 10);
        const endHour = parseInt(times[windowIdxs[windowIdxs.length - 1]].slice(11, 13), 10) + 1;
        best = {
          score, avgSpeed, avgGust, avgDir,
          category: dirInfo.category,
          startHour, endHour,
        };
      }
    }

    return {
      date,
      label: formatDayLabel(date),
      best,
    };
  });

  return days;
}

function average(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// ---------- app state + rendering ----------

let map, markers = {};
let results = []; // { spot, days, bestScore, bestDistance }
let currentSort = "rating";
let home = null;

function initMap() {
  map = L.map("map").setView([52.2, 5.3], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(map);
}

function markerColor(stars) {
  if (stars >= 4) return "#1e8f4e";
  if (stars >= 2) return "#d9a300";
  return "#c0392b";
}

function renderMarkers() {
  Object.values(markers).forEach((m) => map.removeLayer(m));
  markers = {};
  const bounds = [];

  results.forEach((r) => {
    const stars = scoreToStars(r.bestScore);
    const marker = L.circleMarker([r.spot.lat, r.spot.lon], {
      radius: 9,
      color: "#fff",
      weight: 2,
      fillColor: markerColor(stars),
      fillOpacity: 0.9,
    }).addTo(map);
    marker.bindPopup(`<strong>${r.spot.name}</strong><br>${"★".repeat(stars)}${"☆".repeat(5 - stars)}<br>${r.spot.water}`);
    marker.on("click", () => highlightCard(r.spot.name));
    markers[r.spot.name] = marker;
    bounds.push([r.spot.lat, r.spot.lon]);
  });

  if (home) {
    const homeMarker = L.marker([home.lat, home.lon], {
      icon: L.divIcon({ className: "home-pin", html: "🏠", iconSize: [20, 20] }),
    }).addTo(map);
    homeMarker.bindPopup("Home");
    markers["__home__"] = homeMarker;
    bounds.push([home.lat, home.lon]);
  }

  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
}

function highlightCard(spotName) {
  document.querySelectorAll(".spot-card").forEach((el) => {
    el.classList.toggle("highlight", el.dataset.spot === spotName);
  });
  const el = document.querySelector(`.spot-card[data-spot="${CSS.escape(spotName)}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function sortedResults() {
  const copy = [...results];
  if (currentSort === "rating") copy.sort((a, b) => b.bestScore - a.bestScore);
  if (currentSort === "distance") copy.sort((a, b) => a.distanceKm - b.distanceKm);
  if (currentSort === "speed") copy.sort((a, b) => b.bestSpeed - a.bestSpeed);
  return copy;
}

function renderList() {
  const container = document.getElementById("spot-list");
  container.innerHTML = "";

  sortedResults().forEach((r) => {
    const stars = scoreToStars(r.bestScore);
    const card = document.createElement("div");
    card.className = "spot-card";
    card.dataset.spot = r.spot.name;

    const daysHtml = r.days.map((d) => {
      if (!d.best) return `<div class="day-box"><div class="day-label">${d.label}</div>no data</div>`;
      const dirLabel = compassLabel(d.best.avgDir);
      return `<div class="day-box">
        <div class="day-label">${d.label}</div>
        <div>${d.best.startHour}:00–${d.best.endHour}:00</div>
        <div>${d.best.avgSpeed.toFixed(0)}kt (gusts ${d.best.avgGust.toFixed(0)})</div>
        <div class="day-dir">${dirLabel}</div>
        <span class="tag ${d.best.category}">${d.best.category}</span>
      </div>`;
    }).join("");

    card.innerHTML = `
      <div class="spot-card-top">
        <div>
          <div class="spot-name">${r.spot.name}</div>
          <div class="spot-meta">${r.spot.water} &middot; ${r.distanceKm.toFixed(0)} km from home</div>
        </div>
        <div class="stars ${starClass(stars)}">${"★".repeat(stars)}${"☆".repeat(5 - stars)}</div>
      </div>
      <div class="spot-days">${daysHtml}</div>
    `;

    card.addEventListener("click", () => {
      highlightCard(r.spot.name);
      map.panTo([r.spot.lat, r.spot.lon]);
      markers[r.spot.name].openPopup();
    });

    container.appendChild(card);
  });
}

// ---------- main flow ----------

async function loadSpots(homeLoc) {
  const status = document.getElementById("home-status");
  status.textContent = "Loading forecasts for 10 spots…";
  status.classList.remove("error");

  try {
    const settled = await Promise.allSettled(SPOTS.map((s) => fetchSpotForecast(s)));

    results = SPOTS.map((spot, i) => {
      const outcome = settled[i];
      const days = outcome.status === "fulfilled" ? outcome.value : [];
      const scored = days.filter((d) => d.best);
      const bestScore = scored.length ? Math.max(...scored.map((d) => d.best.score)) : 0;
      const bestSpeed = scored.length ? Math.max(...scored.map((d) => d.best.avgSpeed)) : 0;
      const distanceKm = haversineKm(homeLoc.lat, homeLoc.lon, spot.lat, spot.lon);
      return { spot, days, bestScore, bestSpeed, distanceKm };
    });

    const failed = settled.filter((s) => s.status === "rejected").length;
    status.textContent = failed
      ? `Loaded ${SPOTS.length - failed}/${SPOTS.length} spots (${failed} failed to load — try again in a moment). Home: ${homeLoc.label}`
      : `Home: ${homeLoc.label}`;

    renderMarkers();
    renderList();
  } catch (err) {
    status.textContent = "Something went wrong loading forecasts. Please try again.";
    status.classList.add("error");
    console.error(err);
  }
}

function setupSortBar() {
  document.querySelectorAll(".sort-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sort-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentSort = btn.dataset.sort;
      renderList();
    });
  });
}

function setupForm() {
  const form = document.getElementById("home-form");
  const input = document.getElementById("home-input");
  const status = document.getElementById("home-status");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    status.textContent = "Looking up your location…";
    status.classList.remove("error");

    try {
      home = await geocodeHome(query);
      await loadSpots(home);
    } catch (err) {
      status.textContent = err.message || "Could not find that location — try a different search.";
      status.classList.add("error");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  setupSortBar();
  setupForm();
});
