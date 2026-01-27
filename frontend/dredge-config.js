/**
 * Dredge Geometry Configuration
 *
 * Coordinate system:
 * - Origin (0,0) is at stern-port corner (bottom-left)
 * - X increases to starboard (right)
 * - Y increases toward bow (up)
 * - All dimensions in feet
 * - Heading 0° = bow pointing North, increases clockwise
 */

const DREDGE_CONFIG = {
  name: "Mining Dredge",

  // Main hull dimensions (feet)
  hull: {
    width: 32,   // X-axis (port to starboard)
    length: 40   // Y-axis (stern to bow)
  },

  // GPS antenna position from origin (stern-port corner)
  antenna: {
    x: 22,  // feet from port edge
    y: 30   // feet from stern
  },

  // Suction nozzle (hard-pipe)
  nozzle: {
    offsetFromHull: 1.5,  // 1.5ft off starboard side
    pivotY: 10,           // pivot 10ft from stern
    length: 50,           // 50ft from pivot to suction tip
    diameter: 16/12,      // 16 inches in feet
    tipRadius: 2,         // suction tip circle radius in feet
    color: '#ff6600',
    tipColor: '#ff3300'
  },

  // Tailings deposit zone (relative to hull stern-center)
  tailings: {
    width: 20,       // 20ft wide (centered)
    length: 6,       // 6ft long
    offsetY: -6,     // starts 6ft behind stern (y=0 to y=-6)
    color: 'rgba(139, 69, 19, 0.6)' // brown
  },

  // Hull outline points (closed polygon)
  hullPoints: [
    [0, 0],      // stern-port
    [32, 0],     // stern-starboard
    [32, 40],    // bow-starboard
    [0, 40]      // bow-port
  ],

  // Visual styling
  style: {
    hullFill: 'rgba(80, 80, 80, 0.7)',
    hullStroke: '#ffffff',
    hullStrokeWidth: 2,
    antennaColor: '#00ff00',
    nozzleColor: '#ff6600',
    tailingsColor: 'rgba(139, 69, 19, 0.6)'
  }
};

/**
 * Trail configuration
 */
const TRAIL_CONFIG = {
  // Suction trail - where the nozzle tip has been
  suction: {
    enabled: true,
    color: '#ff6600',
    opacity: 0.8,
    width: 2
  },
  // Tailings trail - deposit zones
  tailings: {
    enabled: true,
    color: 'rgba(139, 69, 19, 0.5)',
    strokeColor: '#8B4513',
    strokeWidth: 1
  },
  // Piloting trail - vessel track (antenna position)
  piloting: {
    enabled: true,
    color: '#00d9ff',
    opacity: 0.6,
    width: 2
  }
};

/**
 * Convert feet to meters
 */
function feetToMeters(feet) {
  return feet * 0.3048;
}

/**
 * Transform local dredge coordinates to world coordinates (lat/lon)
 */
function localToWorld(localX, localY, antennaLat, antennaLon, heading) {
  // Offset from antenna position in local coords
  const offsetX = localX - DREDGE_CONFIG.antenna.x;
  const offsetY = localY - DREDGE_CONFIG.antenna.y;

  // Convert to meters
  const offsetXm = feetToMeters(offsetX);
  const offsetYm = feetToMeters(offsetY);

  // Rotate by heading (heading is clockwise from north)
  const headingRad = (heading * Math.PI) / 180;
  const rotatedX = offsetXm * Math.cos(headingRad) + offsetYm * Math.sin(headingRad);
  const rotatedY = -offsetXm * Math.sin(headingRad) + offsetYm * Math.cos(headingRad);

  // Convert meters to degrees
  const earthRadius = 6371000;
  const dLat = (rotatedY / earthRadius) * (180 / Math.PI);
  const dLon = (rotatedX / earthRadius) * (180 / Math.PI) / Math.cos(antennaLat * Math.PI / 180);

  return [antennaLon + dLon, antennaLat + dLat];
}

/**
 * Generate GeoJSON polygon for dredge hull
 */
function generateDredgeGeoJSON(antennaLat, antennaLon, heading) {
  const worldCoords = DREDGE_CONFIG.hullPoints.map(([x, y]) =>
    localToWorld(x, y, antennaLat, antennaLon, heading)
  );
  worldCoords.push(worldCoords[0]); // close polygon

  return {
    type: 'Feature',
    properties: { name: 'Hull' },
    geometry: { type: 'Polygon', coordinates: [worldCoords] }
  };
}

/**
 * Generate GeoJSON for suction nozzle (16" pipe as rectangle)
 * Nozzle runs parallel to starboard side, 1.5ft off hull
 */
function generateNozzleGeoJSON(antennaLat, antennaLon, heading) {
  const nozzle = DREDGE_CONFIG.nozzle;
  const hull = DREDGE_CONFIG.hull;

  // Pipe center is 1.5ft off starboard edge
  const pipeCenterX = hull.width + nozzle.offsetFromHull + (nozzle.diameter / 2);
  const halfWidth = nozzle.diameter / 2;

  // Pipe runs from pivot to tip
  const corners = [
    [pipeCenterX - halfWidth, nozzle.pivotY],                    // back-port
    [pipeCenterX + halfWidth, nozzle.pivotY],                    // back-starboard
    [pipeCenterX + halfWidth, nozzle.pivotY + nozzle.length],    // front-starboard
    [pipeCenterX - halfWidth, nozzle.pivotY + nozzle.length]     // front-port
  ];

  const worldCoords = corners.map(([x, y]) =>
    localToWorld(x, y, antennaLat, antennaLon, heading)
  );
  worldCoords.push(worldCoords[0]); // close polygon

  return {
    type: 'Feature',
    properties: { name: 'Nozzle', color: nozzle.color },
    geometry: { type: 'Polygon', coordinates: [worldCoords] }
  };
}

/**
 * Generate GeoJSON circle for suction tip
 */
function generateSuctionTipGeoJSON(antennaLat, antennaLon, heading) {
  const nozzle = DREDGE_CONFIG.nozzle;
  const hull = DREDGE_CONFIG.hull;

  // Tip center position
  const tipCenterX = hull.width + nozzle.offsetFromHull + (nozzle.diameter / 2);
  const tipCenterY = nozzle.pivotY + nozzle.length;

  // Create circle polygon
  const points = 24;
  const coords = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const x = tipCenterX + nozzle.tipRadius * Math.cos(angle);
    const y = tipCenterY + nozzle.tipRadius * Math.sin(angle);
    coords.push(localToWorld(x, y, antennaLat, antennaLon, heading));
  }

  return {
    type: 'Feature',
    properties: { name: 'Suction Tip', color: nozzle.tipColor },
    geometry: { type: 'Polygon', coordinates: [coords] }
  };
}

/**
 * Get suction tip position in world coordinates
 */
function getSuctionTipPosition(antennaLat, antennaLon, heading) {
  const nozzle = DREDGE_CONFIG.nozzle;
  const hull = DREDGE_CONFIG.hull;
  const tipX = hull.width + nozzle.offsetFromHull + (nozzle.diameter / 2);
  const tipY = nozzle.pivotY + nozzle.length;
  return localToWorld(tipX, tipY, antennaLat, antennaLon, heading);
}

/**
 * Generate GeoJSON for current tailings deposit zone
 */
function generateTailingsZoneGeoJSON(antennaLat, antennaLon, heading) {
  const t = DREDGE_CONFIG.tailings;
  const hullCenterX = DREDGE_CONFIG.hull.width / 2;

  // Tailings zone centered behind stern
  const halfWidth = t.width / 2;
  const corners = [
    [hullCenterX - halfWidth, t.offsetY],           // back-port
    [hullCenterX + halfWidth, t.offsetY],           // back-starboard
    [hullCenterX + halfWidth, t.offsetY + t.length], // front-starboard (at stern)
    [hullCenterX - halfWidth, t.offsetY + t.length]  // front-port (at stern)
  ];

  const worldCoords = corners.map(([x, y]) =>
    localToWorld(x, y, antennaLat, antennaLon, heading)
  );
  worldCoords.push(worldCoords[0]); // close polygon

  return {
    type: 'Feature',
    properties: { name: 'Tailings Zone', color: t.color },
    geometry: { type: 'Polygon', coordinates: [worldCoords] }
  };
}

/**
 * Generate complete dredge features GeoJSON
 */
function generateAllFeaturesGeoJSON(antennaLat, antennaLon, heading) {
  return {
    type: 'FeatureCollection',
    features: [
      generateNozzleGeoJSON(antennaLat, antennaLon, heading),
      generateTailingsZoneGeoJSON(antennaLat, antennaLon, heading)
    ]
  };
}
