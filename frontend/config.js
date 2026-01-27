/**
 * RTK Rover Dashboard Configuration
 */

const CONFIG = {
  // Mapbox access token - get yours at https://account.mapbox.com/
  MAPBOX_TOKEN: 'pk.eyJ1IjoicnVkeXRoZWNhbmFkaWFuIiwiYSI6ImNtazdpNzdjYzE1N2gzZnB3YnlwZzd2OTAifQ.Fz2xdWGKuJXD_vdU8nKKmQ',

  // WebSocket server URL (update for production)
  WS_URL: window.location.protocol === 'https:'
    ? `wss://${window.location.host}`
    : `ws://${window.location.host}`,

  // API base URL
  API_URL: window.location.origin,

  // Map settings
  MAP: {
    // Default center (Camas, WA area)
    DEFAULT_CENTER: [-122.3498, 45.6468],
    DEFAULT_ZOOM: 18,
    STYLE: 'mapbox://styles/mapbox/satellite-streets-v12'
  },

  // Test locations
  LOCATIONS: {
    live: {
      name: 'Live GPS',
      center: null  // Uses actual GPS data
    },
    nome: {
      name: 'Nome, Alaska (Test)',
      center: [-165.402452, 64.495336]
    }
  },

  // Update settings
  RECONNECT_INTERVAL: 3000,  // ms to wait before reconnecting
  STALE_TIMEOUT: 10000       // ms before marking data as stale
};
