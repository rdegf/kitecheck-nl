// The 10 tracked spots.
//
// onshoreBearing: the compass direction (degrees, meteorological convention —
// "wind FROM") that blows straight onto that spot's beach/shore. Used to
// classify actual wind direction into side-shore / side-onshore / onshore /
// side-offshore / offshore for that specific spot. These are reasonable
// approximations of each coastline's real-world orientation — tune freely,
// this is just a plain data table.
//
// water: quick description of what kind of water you're riding.

const SPOTS = [
  {
    name: "Brouwersdam (Grevelingen)",
    lat: 51.7325, lon: 3.8511,
    onshoreBearing: 225,
    water: "Flat water (lagoon)",
  },
  {
    name: "Renesse",
    lat: 51.7420, lon: 3.7860,
    onshoreBearing: 300,
    water: "Open water, waves",
  },
  {
    name: "Kijkduin",
    lat: 52.0725, lon: 4.2181,
    onshoreBearing: 260,
    water: "Open water, waves",
  },
  {
    name: "Scheveningen",
    lat: 52.1041, lon: 4.2755,
    onshoreBearing: 260,
    water: "Open water, waves",
  },
  {
    name: "Wijk aan Zee",
    lat: 52.4944, lon: 4.5989,
    onshoreBearing: 260,
    water: "Open water, waves",
  },
  {
    name: "IJmuiden (Noordpier)",
    lat: 52.4600, lon: 4.5809,
    onshoreBearing: 260,
    water: "Open water, waves",
  },
  {
    name: "Zandvoort",
    lat: 52.3731, lon: 4.5322,
    onshoreBearing: 260,
    water: "Open water, waves",
  },
  {
    name: "Workum",
    lat: 52.9861, lon: 5.4386,
    onshoreBearing: 270,
    water: "Flat water (IJsselmeer)",
  },
  {
    name: "Makkum",
    lat: 53.0575, lon: 5.4103,
    onshoreBearing: 250,
    water: "Flat water (IJsselmeer)",
  },
  {
    name: "Lauwersoog (Lauwersmeer)",
    lat: 53.4046, lon: 6.2136,
    onshoreBearing: 300,
    water: "Flat water (lake)",
  },
];
