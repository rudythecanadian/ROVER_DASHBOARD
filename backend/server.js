/**
 * RTK Rover Dashboard Backend
 *
 * Receives position updates from ESP32 rover via HTTP POST
 * Broadcasts updates to connected web clients via WebSocket
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve PORTABLE_DASHBOARD at /portable
// Works with both local dev (../../PORTABLE_DASHBOARD) and server (../portable)
const portablePath = require('fs').existsSync(path.join(__dirname, '../portable'))
  ? path.join(__dirname, '../portable')
  : path.join(__dirname, '../../PORTABLE_DASHBOARD');
app.use('/portable', express.static(portablePath));

// Store latest rover state
let roverState = {
  latitude: null,
  longitude: null,
  altitude: null,
  h_acc: null,
  v_acc: null,
  fix_type: null,
  carr_soln: null,
  num_sv: null,
  rtcm_bytes: null,
  fixed_count: null,
  float_count: null,
  fixed_rate: null,
  battery_pct: null,
  firmware_version: null,
  timestamp: null,
  last_update: null
};

// Store marked locations (persisted to disk)
const MARKS_FILE = path.join(__dirname, 'marks.json');
let marks = [];
let markCounter = 0;

// Load marks from disk on startup
function loadMarks() {
  try {
    if (fs.existsSync(MARKS_FILE)) {
      const data = JSON.parse(fs.readFileSync(MARKS_FILE, 'utf8'));
      marks = data.marks || [];
      markCounter = data.markCounter || 0;
      console.log(`Loaded ${marks.length} marks from disk`);
    }
  } catch (e) {
    console.error('Failed to load marks:', e.message);
  }
}

// Save marks to disk
function saveMarks() {
  try {
    fs.writeFileSync(MARKS_FILE, JSON.stringify({ marks, markCounter }, null, 2));
  } catch (e) {
    console.error('Failed to save marks:', e.message);
  }
}

loadMarks();

// OTA firmware version - update this when you upload new firmware
const OTA_FIRMWARE_VERSION = '1.0.0';

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Track connected clients
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('Dashboard client connected');
  clients.add(ws);

  // Send current state immediately on connect
  if (roverState.latitude !== null) {
    ws.send(JSON.stringify({ type: 'position', data: roverState }));
  }

  // Send existing marks
  if (marks.length > 0) {
    ws.send(JSON.stringify({ type: 'marks', data: marks }));
  }

  ws.on('close', () => {
    console.log('Dashboard client disconnected');
    clients.delete(ws);
  });
});

// Broadcast to all connected clients
function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(data);
    }
  });
}

// API endpoint to receive position updates from ESP32
app.post('/api/position', (req, res) => {
  const {
    latitude,
    longitude,
    altitude,
    h_acc,
    v_acc,
    fix_type,
    carr_soln,
    num_sv,
    rtcm_bytes,
    fixed_count,
    float_count,
    battery_pct,
    firmware_version,
    hour,
    min,
    sec
  } = req.body;

  // Calculate fixed rate
  const total = (fixed_count || 0) + (float_count || 0);
  const fixed_rate = total > 0 ? (100.0 * fixed_count / total).toFixed(1) : 0;

  // Update state
  roverState = {
    latitude,
    longitude,
    altitude,
    h_acc,
    v_acc,
    fix_type,
    carr_soln,
    num_sv,
    rtcm_bytes,
    fixed_count,
    float_count,
    fixed_rate,
    battery_pct,
    firmware_version,
    timestamp: `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')} UTC`,
    last_update: new Date().toISOString()
  };

  console.log(`[v${firmware_version}] Position: ${latitude?.toFixed(7)}, ${longitude?.toFixed(7)} - ${getFixStatus(fix_type, carr_soln)} (${fixed_rate}% fixed) Batt: ${battery_pct}%`);

  // Broadcast to all connected dashboard clients
  broadcast({ type: 'position', data: roverState });

  res.json({ success: true });
});

// API endpoint to get current state (for polling fallback)
app.get('/api/position', (req, res) => {
  res.json(roverState);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    clients: clients.size,
    lastUpdate: roverState.last_update
  });
});

// ============================================================================
// MARKS API - Save and retrieve marked locations
// ============================================================================

// Get all marks
app.get('/api/marks', (req, res) => {
  res.json(marks);
});

// Create a new mark
app.post('/api/marks', (req, res) => {
  const { latitude, longitude, h_acc, label } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'latitude and longitude are required' });
  }

  markCounter++;
  const mark = {
    id: markCounter,
    label: label || `RM_${markCounter}`,
    latitude,
    longitude,
    h_acc: h_acc || null,
    timestamp: new Date().toISOString(),
    created_at: Date.now()
  };

  marks.push(mark);
  saveMarks();
  console.log(`Mark created: ${mark.label} at ${latitude.toFixed(9)}, ${longitude.toFixed(9)}`);

  // Broadcast to all connected clients
  broadcast({ type: 'mark', action: 'create', data: mark });

  res.json(mark);
});

// Delete a mark
app.delete('/api/marks/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = marks.findIndex(m => m.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Mark not found' });
  }

  const deleted = marks.splice(index, 1)[0];
  saveMarks();
  console.log(`Mark deleted: ${deleted.label}`);

  // Broadcast to all connected clients
  broadcast({ type: 'mark', action: 'delete', data: { id } });

  res.json({ success: true });
});

// Update a mark (rename)
app.patch('/api/marks/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const mark = marks.find(m => m.id === id);

  if (!mark) {
    return res.status(404).json({ error: 'Mark not found' });
  }

  if (req.body.label) {
    mark.label = req.body.label;
  }

  saveMarks();
  console.log(`Mark updated: ${mark.label}`);

  // Broadcast to all connected clients
  broadcast({ type: 'mark', action: 'update', data: mark });

  res.json(mark);
});

// Clear all marks
app.delete('/api/marks', (req, res) => {
  const count = marks.length;
  marks = [];
  markCounter = 0;
  saveMarks();
  console.log(`All marks cleared (${count} marks)`);

  // Broadcast to all connected clients
  broadcast({ type: 'mark', action: 'clear' });

  res.json({ success: true, deleted: count });
});

// OTA version endpoint - returns the version string for new firmware
app.get('/api/ota/version', (req, res) => {
  res.type('text/plain').send(OTA_FIRMWARE_VERSION);
});

// OTA firmware endpoint - serves the firmware binary
// Upload new firmware as: /var/www/rover-dashboard/firmware/firmware.bin
app.get('/api/ota/firmware.bin', (req, res) => {
  const firmwarePath = path.join(__dirname, '../firmware/firmware.bin');
  res.sendFile(firmwarePath, (err) => {
    if (err) {
      console.error('Firmware not found:', firmwarePath);
      res.status(404).send('Firmware not found');
    }
  });
});

// Helper to get fix status string
function getFixStatus(fix_type, carr_soln) {
  if (carr_soln === 2) return 'RTK FIXED';
  if (carr_soln === 1) return 'RTK FLOAT';
  if (fix_type === 3) return '3D Fix';
  if (fix_type === 2) return '2D Fix';
  return 'No Fix';
}

// Start server
server.listen(PORT, () => {
  console.log(`RTK Rover Dashboard server running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Mobile Survey: http://localhost:${PORT}/portable/`);
  console.log(`API endpoint: http://localhost:${PORT}/api/position`);
  console.log(`Marks API: http://localhost:${PORT}/api/marks`);
});
