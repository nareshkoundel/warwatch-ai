/* ================================================
   map.js  —  Leaflet world conflict-zone map
   ================================================ */
'use strict';

const MapService = (() => {
  let map = null;
  let initialized = false;
  let regionFilterCb = null;

  /* Conflict zones: [lat, lng, region, label, color] */
  const ZONES = [
    [31.5,  34.45,  'ISRAEL',      'Gaza Strip',       '#ff2200'],
    [31.77, 35.23,  'ISRAEL',      'West Bank',        '#ff4400'],
    [32.08, 34.78,  'ISRAEL',      'Tel Aviv / Israel','#ff6600'],
    [35.69, 51.39,  'IRAN',        'Tehran / Iran',    '#ff6b00'],
    [50.45, 30.52,  'UKRAINE',     'Kyiv / Ukraine',   '#ffc107'],
    [49.0,  38.0,   'UKRAINE',     'East Ukraine',     '#ffaa00'],
    [33.34, 44.40,  'MIDDLE_EAST', 'Baghdad / Iraq',   '#ff8800'],
    [33.51, 36.29,  'MIDDLE_EAST', 'Damascus / Syria', '#ff9900'],
    [33.89, 35.50,  'MIDDLE_EAST', 'Beirut / Lebanon', '#ffaa00'],
    [15.35, 44.21,  'MIDDLE_EAST', 'Sanaa / Yemen',    '#ff7700'],
    [24.0,  45.0,   'MIDDLE_EAST', 'Saudi Arabia',     '#ffbb00'],
    [34.53, 69.17,  'AFGHANISTAN', 'Kabul / Afghanistan','#00c8ff'],
    [25.0,  67.01,  'PAKISTAN',    'Karachi / Pakistan','#00aaff'],
    [33.72, 73.06,  'PAKISTAN',    'Islamabad',        '#0095ff'],
    [34.0,  71.5,   'PAKISTAN',    'KPK / FATA',       '#0077ff'],
    [15.55, 32.53,  'WORLD',       'Sudan',            '#aa22ff'],
    [9.0,   38.0,   'WORLD',       'Ethiopia',         '#9900ee'],
    [-4.32, 15.32,  'WORLD',       'DR Congo',         '#8800dd'],
    [38.43, 27.14,  'MIDDLE_EAST', 'Turkey',           '#ffcc00'],
    [55.75, 37.62,  'WORLD',       'Moscow / Russia',  '#cc3300'],
  ];

  const REGION_COLORS = {
    ISRAEL:      '#ff2200',
    IRAN:        '#ff6b00',
    UKRAINE:     '#ffc107',
    MIDDLE_EAST: '#ff8800',
    AFGHANISTAN: '#00c8ff',
    PAKISTAN:    '#0095ff',
    USA:         '#44aaff',
    WORLD:       '#aa44ff',
  };

  function init() {
    if (initialized) { map && map.invalidateSize(); return; }
    initialized = true;

    map = L.map('worldMap', {
      center: [25, 38],
      zoom: 3,
      minZoom: 2,
      maxZoom: 10,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Render static zones
    ZONES.forEach(z => {
      const [lat, lng, region, label, color] = z;
      const icon = buildPulseIcon(color);
      const marker = L.marker([lat, lng], { icon }).addTo(map);
      marker.bindPopup(buildPopup(region, label, 0), { maxWidth: 220 });
      marker.on('click', () => {
        if (regionFilterCb) regionFilterCb(region);
      });
      z._marker = marker;
      z._articleCount = 0;
    });

    buildLegend();
    requestAnimationFrame(() => map && map.invalidateSize());
  }

  function buildPulseIcon(color) {
    const html = `<div class="conflict-marker" style="border-color:${color};background:${color}60"></div>`;
    return L.divIcon({ html, className: '', iconSize: [14, 14], iconAnchor: [7, 7] });
  }

  function buildPopup(region, label, count) {
    return `
      <div class="map-popup-region">${region}</div>
      <div class="map-popup-count">${count}</div>
      <div class="map-popup-label">articles — ${label}</div>
      <span class="map-popup-link">🔍 Filter this region</span>`;
  }

  function update(articles) {
    if (!map) return;
    // Count articles per region
    const counts = {};
    articles.forEach(a => { counts[a.region] = (counts[a.region] || 0) + 1; });

    ZONES.forEach(z => {
      const [,, region, label] = z;
      const count = counts[region] || 0;
      z._articleCount = count;
      if (z._marker) {
        z._marker.setPopupContent(buildPopup(region, label, count));
        // Scale icon size based on count
        const size = Math.min(24, 10 + Math.floor(count / 2));
        const color = REGION_COLORS[region] || '#ff2200';
        const icon = L.divIcon({
          html: `<div class="conflict-marker" style="border-color:${color};background:${color}60;width:${size}px;height:${size}px"></div>`,
          className: '',
          iconSize: [size, size],
          iconAnchor: [size/2, size/2]
        });
        z._marker.setIcon(icon);
      }
    });
  }

  function buildLegend() {
    const items = document.getElementById('mlItems');
    if (!items) return;
    items.innerHTML = Object.entries(REGION_COLORS).map(([r, c]) =>
      `<div class="ml-item" data-region="${r}">
         <div class="ml-dot" style="background:${c}"></div>
         <span>${r.replace('_',' ')}</span>
       </div>`
    ).join('');

    items.querySelectorAll('.ml-item').forEach(el => {
      el.addEventListener('click', () => {
        if (regionFilterCb) regionFilterCb(el.dataset.region);
      });
    });
  }

  function onRegionFilter(cb) { regionFilterCb = cb; }

  function flyTo(region) {
    const zone = ZONES.find(z => z[2] === region);
    if (zone && map) map.flyTo([zone[0], zone[1]], 5, { duration: 1.5 });
  }

  return { init, update, onRegionFilter, flyTo };
})();
