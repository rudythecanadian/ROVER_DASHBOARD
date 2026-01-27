/**
 * RTK Rover Dashboard Application
 * Mining Dredge Operations Tracking
 */

class RoverDashboard {
  constructor() {
    this.map = null;
    this.marker = null;
    this.ws = null;
    this.lastUpdate = null;
    this.currentPosition = null;
    this.heading = 0;
    this.locationMode = 'live';  // 'live' or 'nome'
    this.displayMode = 'dredge'; // 'dredge' or 'simple'
    this.testPosition = null;

    // Trail data storage
    this.trails = {
      piloting: [],    // Antenna positions
      suction: [],     // Nozzle tip positions
      tailings: []     // Tailings zone polygons
    };

    // Minimum distance (meters) between trail points to avoid clutter
    this.minTrailDistance = 0.5;

    this.init();
  }

  init() {
    this.initMap();
    this.initHeadingControl();
    this.initLocationControl();
    this.initDisplayModeControl();
    this.initLayerControls();
    this.initTrailControls();
    this.connectWebSocket();
    this.startStaleChecker();
    this.loadTrailsFromStorage();
  }

  initMap() {
    mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;

    this.map = new mapboxgl.Map({
      container: 'map',
      style: CONFIG.MAP.STYLE,
      center: CONFIG.MAP.DEFAULT_CENTER,
      zoom: CONFIG.MAP.DEFAULT_ZOOM
    });

    this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    this.map.addControl(new mapboxgl.ScaleControl({ maxWidth: 200, unit: 'metric' }), 'bottom-right');

    // Antenna marker
    const el = document.createElement('div');
    el.className = 'rover-marker';
    this.markerElement = el;
    this.marker = new mapboxgl.Marker(el)
      .setLngLat(CONFIG.MAP.DEFAULT_CENTER)
      .addTo(this.map);

    this.map.on('load', () => this.initMapLayers());
  }

  initMapLayers() {
    // Piloting trail (line)
    this.map.addSource('trail-piloting', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
    });
    this.map.addLayer({
      id: 'trail-piloting-line',
      type: 'line',
      source: 'trail-piloting',
      paint: {
        'line-color': TRAIL_CONFIG.piloting.color,
        'line-width': TRAIL_CONFIG.piloting.width,
        'line-opacity': TRAIL_CONFIG.piloting.opacity
      }
    });

    // Suction trail (line)
    this.map.addSource('trail-suction', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
    });
    this.map.addLayer({
      id: 'trail-suction-line',
      type: 'line',
      source: 'trail-suction',
      paint: {
        'line-color': TRAIL_CONFIG.suction.color,
        'line-width': TRAIL_CONFIG.suction.width,
        'line-opacity': TRAIL_CONFIG.suction.opacity
      }
    });

    // Tailings trail (polygons)
    this.map.addSource('trail-tailings', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    this.map.addLayer({
      id: 'trail-tailings-fill',
      type: 'fill',
      source: 'trail-tailings',
      paint: {
        'fill-color': TRAIL_CONFIG.tailings.color,
        'fill-opacity': 1
      }
    });
    this.map.addLayer({
      id: 'trail-tailings-stroke',
      type: 'line',
      source: 'trail-tailings',
      paint: {
        'line-color': TRAIL_CONFIG.tailings.strokeColor,
        'line-width': TRAIL_CONFIG.tailings.strokeWidth
      }
    });

    // Dredge hull
    this.map.addSource('dredge-hull', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } }
    });
    this.map.addLayer({
      id: 'dredge-hull-fill',
      type: 'fill',
      source: 'dredge-hull',
      paint: {
        'fill-color': DREDGE_CONFIG.style.hullFill,
        'fill-opacity': 1
      }
    });
    this.map.addLayer({
      id: 'dredge-hull-stroke',
      type: 'line',
      source: 'dredge-hull',
      paint: {
        'line-color': DREDGE_CONFIG.style.hullStroke,
        'line-width': DREDGE_CONFIG.style.hullStrokeWidth
      }
    });

    // Suction nozzle (pipe as rectangle)
    this.map.addSource('dredge-nozzle', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } }
    });
    this.map.addLayer({
      id: 'dredge-nozzle-fill',
      type: 'fill',
      source: 'dredge-nozzle',
      paint: {
        'fill-color': DREDGE_CONFIG.nozzle.color,
        'fill-opacity': 0.9
      }
    });
    this.map.addLayer({
      id: 'dredge-nozzle-stroke',
      type: 'line',
      source: 'dredge-nozzle',
      paint: {
        'line-color': '#ffffff',
        'line-width': 1
      }
    });

    // Suction tip (circle at end of nozzle)
    this.map.addSource('dredge-suction-tip', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } }
    });
    this.map.addLayer({
      id: 'dredge-suction-tip-fill',
      type: 'fill',
      source: 'dredge-suction-tip',
      paint: {
        'fill-color': DREDGE_CONFIG.nozzle.tipColor,
        'fill-opacity': 1
      }
    });
    this.map.addLayer({
      id: 'dredge-suction-tip-stroke',
      type: 'line',
      source: 'dredge-suction-tip',
      paint: {
        'line-color': '#ffffff',
        'line-width': 2
      }
    });

    // Current tailings zone
    this.map.addSource('dredge-tailings', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } }
    });
    this.map.addLayer({
      id: 'dredge-tailings-fill',
      type: 'fill',
      source: 'dredge-tailings',
      paint: {
        'fill-color': DREDGE_CONFIG.tailings.color,
        'fill-opacity': 1
      }
    });

    // Heading indicator
    this.map.addSource('heading-indicator', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
    });
    this.map.addLayer({
      id: 'heading-indicator-line',
      type: 'line',
      source: 'heading-indicator',
      paint: {
        'line-color': '#ff0000',
        'line-width': 3,
        'line-dasharray': [2, 2]
      }
    });

    // Simple marker - 3ft circle
    this.map.addSource('simple-circle', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } }
    });
    this.map.addLayer({
      id: 'simple-circle-fill',
      type: 'fill',
      source: 'simple-circle',
      paint: {
        'fill-color': 'rgba(0, 217, 255, 0.3)',
        'fill-opacity': 1
      },
      layout: { visibility: 'none' }
    });
    this.map.addLayer({
      id: 'simple-circle-stroke',
      type: 'line',
      source: 'simple-circle',
      paint: {
        'line-color': '#00d9ff',
        'line-width': 2
      },
      layout: { visibility: 'none' }
    });

    // Simple marker - crosshair
    this.map.addSource('simple-crosshair', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    this.map.addLayer({
      id: 'simple-crosshair-line',
      type: 'line',
      source: 'simple-crosshair',
      paint: {
        'line-color': '#00d9ff',
        'line-width': 2
      },
      layout: { visibility: 'none' }
    });

    // Render any loaded trails
    this.updateTrailLayers();
  }

  initHeadingControl() {
    const slider = document.getElementById('heading-slider');
    const display = document.getElementById('heading-display');

    slider.addEventListener('input', (e) => {
      this.heading = parseInt(e.target.value);
      display.textContent = this.heading + '°';
      this.updateDredgePosition();
    });
  }

  initLocationControl() {
    const select = document.getElementById('location-mode');
    select.addEventListener('change', (e) => {
      this.locationMode = e.target.value;

      if (this.locationMode === 'nome') {
        // Use test position
        const nomeCoords = CONFIG.LOCATIONS.nome.center;
        this.testPosition = { latitude: nomeCoords[1], longitude: nomeCoords[0] };
        this.currentPosition = this.testPosition;
        this.map.flyTo({ center: nomeCoords, zoom: 18 });
        this.updateDredgePosition();
      } else {
        // Back to live - will update on next GPS message
        this.testPosition = null;
      }
    });
  }

  initDisplayModeControl() {
    const radios = document.querySelectorAll('input[name="display-mode"]');
    radios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.displayMode = e.target.value;
        this.updateDisplayMode();
        this.updateDredgePosition();
      });
    });
  }

  updateDisplayMode() {
    const showDredge = this.displayMode === 'dredge';
    const showSimple = this.displayMode === 'simple';

    // Dredge layers
    const dredgeLayers = [
      'dredge-hull-fill', 'dredge-hull-stroke',
      'dredge-nozzle-fill', 'dredge-nozzle-stroke',
      'dredge-suction-tip-fill', 'dredge-suction-tip-stroke',
      'dredge-tailings-fill',
      'heading-indicator-line'
    ];

    // Simple marker layers
    const simpleLayers = [
      'simple-circle-fill', 'simple-circle-stroke',
      'simple-crosshair-line'
    ];

    dredgeLayers.forEach(layer => {
      if (this.map.getLayer(layer)) {
        this.map.setLayoutProperty(layer, 'visibility', showDredge ? 'visible' : 'none');
      }
    });

    simpleLayers.forEach(layer => {
      if (this.map.getLayer(layer)) {
        this.map.setLayoutProperty(layer, 'visibility', showSimple ? 'visible' : 'none');
      }
    });

    // Hide/show the DOM marker element
    if (this.markerElement) {
      this.markerElement.style.display = showSimple ? 'none' : 'block';
    }
  }

  initLayerControls() {
    document.getElementById('layer-piloting').addEventListener('change', (e) => {
      this.map.setLayoutProperty('trail-piloting-line', 'visibility', e.target.checked ? 'visible' : 'none');
    });
    document.getElementById('layer-suction').addEventListener('change', (e) => {
      this.map.setLayoutProperty('trail-suction-line', 'visibility', e.target.checked ? 'visible' : 'none');
    });
    document.getElementById('layer-tailings').addEventListener('change', (e) => {
      this.map.setLayoutProperty('trail-tailings-fill', 'visibility', e.target.checked ? 'visible' : 'none');
      this.map.setLayoutProperty('trail-tailings-stroke', 'visibility', e.target.checked ? 'visible' : 'none');
    });
  }

  initTrailControls() {
    document.getElementById('btn-clear-trails').addEventListener('click', () => {
      if (confirm('Clear all trail data? This cannot be undone.')) {
        this.clearTrails();
      }
    });

    document.getElementById('btn-export-trails').addEventListener('click', () => {
      this.exportTrails();
    });
  }

  connectWebSocket() {
    console.log('Connecting to WebSocket:', CONFIG.WS_URL);
    this.ws = new WebSocket(CONFIG.WS_URL);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.setConnectionStatus('connected', 'Connected');
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'position') {
        this.updateDashboard(message.data);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.setConnectionStatus('disconnected', 'Disconnected');
      setTimeout(() => this.connectWebSocket(), CONFIG.RECONNECT_INTERVAL);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.setConnectionStatus('disconnected', 'Error');
    };
  }

  updateDashboard(data) {
    this.lastUpdate = Date.now();

    // Update fix status
    const fixStatus = this.getFixStatus(data.fix_type, data.carr_soln);
    const fixStatusEl = document.getElementById('fix-status');
    fixStatusEl.textContent = fixStatus;
    fixStatusEl.className = 'fix-status ' + this.getFixClass(data.carr_soln);
    this.markerElement.className = 'rover-marker ' + this.getFixClass(data.carr_soln);

    // Update fixed rate
    document.getElementById('fix-rate').textContent =
      `Fixed Rate: ${data.fixed_rate}% (${data.fixed_count}/${data.fixed_count + data.float_count})`;

    // Update position
    if (data.latitude !== null && data.longitude !== null) {
      document.getElementById('latitude').textContent = data.latitude.toFixed(9) + '°';
      document.getElementById('longitude').textContent = data.longitude.toFixed(9) + '°';
      document.getElementById('altitude').textContent =
        data.altitude !== null ? data.altitude.toFixed(2) + ' m' : '--';

      // Use test position if in test mode, otherwise live GPS
      const prevPos = this.currentPosition;
      if (this.locationMode === 'live') {
        this.currentPosition = { latitude: data.latitude, longitude: data.longitude };
      }
      // If in test mode, keep using testPosition

      // Update map marker
      const coords = [this.currentPosition.longitude, this.currentPosition.latitude];
      this.marker.setLngLat(coords);

      // Update dredge position
      this.updateDredgePosition();

      // Record trails if RTK Fixed and moved enough (only in live mode)
      if (data.carr_soln === 2 && this.locationMode === 'live') {
        this.recordTrailPoint(prevPos);
      }

      // Pan map (only if live mode)
      if (this.locationMode === 'live') {
        this.map.easeTo({ center: coords, duration: 500 });
      }
    }

    // Update accuracy
    document.getElementById('h-acc').textContent =
      data.h_acc !== null ? (data.h_acc * 100).toFixed(1) + ' cm' : '--';
    document.getElementById('v-acc').textContent =
      data.v_acc !== null ? (data.v_acc * 100).toFixed(1) + ' cm' : '--';

    // Update satellites
    document.getElementById('satellite-count').textContent =
      data.num_sv !== null ? data.num_sv : '--';

    // Update RTCM bytes
    document.getElementById('rtcm-bytes').textContent =
      data.rtcm_bytes !== null ? this.formatBytes(data.rtcm_bytes) : '--';

    // Update battery
    this.updateBattery(data.battery_pct);

    // Update firmware version
    if (data.firmware_version) {
      document.getElementById('firmware-version').textContent = `Firmware: v${data.firmware_version}`;
    }

    // Update timestamp
    document.getElementById('timestamp').textContent =
      `Last update: ${data.timestamp || '--'}`;

    this.setConnectionStatus('connected', 'Live');
  }

  updateBattery(percentage) {
    const fill = document.getElementById('battery-fill');
    const pct = document.getElementById('battery-pct');
    const display = document.querySelector('.battery-display');

    if (percentage === undefined || percentage === null || percentage < 0) {
      pct.textContent = '--%';
      fill.style.width = '0%';
      return;
    }

    pct.textContent = `${percentage}%`;
    fill.style.width = `${percentage}%`;

    // Update color class based on level
    display.classList.remove('battery-low', 'battery-medium', 'battery-good');
    if (percentage <= 20) {
      display.classList.add('battery-low');
    } else if (percentage <= 50) {
      display.classList.add('battery-medium');
    } else {
      display.classList.add('battery-good');
    }
  }

  updateDredgePosition() {
    if (!this.currentPosition || !this.map.getSource('dredge-hull')) return;

    const { latitude, longitude } = this.currentPosition;

    // Hull
    const hullGeoJSON = generateDredgeGeoJSON(latitude, longitude, this.heading);
    this.map.getSource('dredge-hull').setData(hullGeoJSON);

    // Nozzle (pipe)
    const nozzleGeoJSON = generateNozzleGeoJSON(latitude, longitude, this.heading);
    this.map.getSource('dredge-nozzle').setData(nozzleGeoJSON);

    // Suction tip (circle)
    const suctionTipGeoJSON = generateSuctionTipGeoJSON(latitude, longitude, this.heading);
    this.map.getSource('dredge-suction-tip').setData(suctionTipGeoJSON);

    // Tailings zone
    const tailingsGeoJSON = generateTailingsZoneGeoJSON(latitude, longitude, this.heading);
    this.map.getSource('dredge-tailings').setData(tailingsGeoJSON);

    // Heading indicator
    const bowCenter = localToWorld(
      DREDGE_CONFIG.hull.width / 2,
      DREDGE_CONFIG.hull.length,
      latitude, longitude, this.heading
    );
    const bowExtended = localToWorld(
      DREDGE_CONFIG.hull.width / 2,
      DREDGE_CONFIG.hull.length + 20,
      latitude, longitude, this.heading
    );
    this.map.getSource('heading-indicator').setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [bowCenter, bowExtended] }
    });

    // Simple marker - 3ft circle at antenna position
    const simpleCircleGeoJSON = this.generateSimpleCircleGeoJSON(latitude, longitude, 3);
    this.map.getSource('simple-circle').setData(simpleCircleGeoJSON);

    // Simple marker - crosshair
    const crosshairGeoJSON = this.generateCrosshairGeoJSON(latitude, longitude, 3);
    this.map.getSource('simple-crosshair').setData(crosshairGeoJSON);
  }

  generateSimpleCircleGeoJSON(lat, lon, radiusFeet) {
    const radiusMeters = feetToMeters(radiusFeet);
    const points = 32;
    const coords = [];

    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const dx = radiusMeters * Math.cos(angle);
      const dy = radiusMeters * Math.sin(angle);

      // Convert meters offset to degrees
      const earthRadius = 6371000;
      const dLat = (dy / earthRadius) * (180 / Math.PI);
      const dLon = (dx / earthRadius) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

      coords.push([lon + dLon, lat + dLat]);
    }

    return {
      type: 'Feature',
      properties: { name: 'Simple Circle' },
      geometry: { type: 'Polygon', coordinates: [coords] }
    };
  }

  generateCrosshairGeoJSON(lat, lon, radiusFeet) {
    const radiusMeters = feetToMeters(radiusFeet);
    const earthRadius = 6371000;

    // Calculate offset in degrees
    const dLat = (radiusMeters / earthRadius) * (180 / Math.PI);
    const dLon = (radiusMeters / earthRadius) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

    return {
      type: 'FeatureCollection',
      features: [
        // Horizontal line
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[lon - dLon, lat], [lon + dLon, lat]]
          }
        },
        // Vertical line
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[lon, lat - dLat], [lon, lat + dLat]]
          }
        }
      ]
    };
  }

  recordTrailPoint(prevPos) {
    if (!this.currentPosition) return;

    const { latitude, longitude } = this.currentPosition;

    // Check minimum distance
    if (prevPos) {
      const dist = this.haversineDistance(
        prevPos.latitude, prevPos.longitude,
        latitude, longitude
      );
      if (dist < this.minTrailDistance) return;
    }

    // Record piloting trail (antenna position)
    this.trails.piloting.push([longitude, latitude]);

    // Record suction trail (nozzle tip position)
    const suctionTip = getSuctionTipPosition(latitude, longitude, this.heading);
    this.trails.suction.push(suctionTip);

    // Record tailings zone polygon
    const tailingsGeoJSON = generateTailingsZoneGeoJSON(latitude, longitude, this.heading);
    this.trails.tailings.push(tailingsGeoJSON);

    // Update trail layers
    this.updateTrailLayers();

    // Save to local storage periodically
    this.saveTrailsToStorage();
  }

  updateTrailLayers() {
    if (!this.map.getSource('trail-piloting')) return;

    // Piloting trail
    this.map.getSource('trail-piloting').setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: this.trails.piloting }
    });

    // Suction trail
    this.map.getSource('trail-suction').setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: this.trails.suction }
    });

    // Tailings trail (merge all polygons)
    this.map.getSource('trail-tailings').setData({
      type: 'FeatureCollection',
      features: this.trails.tailings
    });
  }

  clearTrails() {
    this.trails = { piloting: [], suction: [], tailings: [] };
    this.updateTrailLayers();
    localStorage.removeItem('dredge-trails');
  }

  exportTrails() {
    const data = {
      exported: new Date().toISOString(),
      trails: this.trails,
      geojson: {
        piloting: {
          type: 'Feature',
          properties: { name: 'Piloting Trail' },
          geometry: { type: 'LineString', coordinates: this.trails.piloting }
        },
        suction: {
          type: 'Feature',
          properties: { name: 'Suction Trail' },
          geometry: { type: 'LineString', coordinates: this.trails.suction }
        },
        tailings: {
          type: 'FeatureCollection',
          features: this.trails.tailings
        }
      }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dredge-trails-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  saveTrailsToStorage() {
    // Throttle saves
    if (this._saveTimeout) return;
    this._saveTimeout = setTimeout(() => {
      localStorage.setItem('dredge-trails', JSON.stringify(this.trails));
      this._saveTimeout = null;
    }, 5000);
  }

  loadTrailsFromStorage() {
    const saved = localStorage.getItem('dredge-trails');
    if (saved) {
      try {
        this.trails = JSON.parse(saved);
        console.log(`Loaded ${this.trails.piloting.length} trail points from storage`);
      } catch (e) {
        console.error('Failed to load trails:', e);
      }
    }
  }

  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  getFixStatus(fixType, carrSoln) {
    if (carrSoln === 2) return 'RTK FIXED';
    if (carrSoln === 1) return 'RTK FLOAT';
    if (fixType === 3) return '3D Fix';
    if (fixType === 2) return '2D Fix';
    return 'No Fix';
  }

  getFixClass(carrSoln) {
    if (carrSoln === 2) return 'rtk-fixed';
    if (carrSoln === 1) return 'rtk-float';
    return 'no-fix';
  }

  setConnectionStatus(status, label) {
    const el = document.getElementById('connection-status');
    el.className = 'status-indicator ' + status;
    el.querySelector('.label').textContent = label;
  }

  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  startStaleChecker() {
    setInterval(() => {
      if (this.lastUpdate && Date.now() - this.lastUpdate > CONFIG.STALE_TIMEOUT) {
        this.setConnectionStatus('disconnected', 'Stale');
      }
    }, 1000);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new RoverDashboard();
});
