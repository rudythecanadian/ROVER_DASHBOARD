# RTK Rover Dashboard

Real-time web dashboard for monitoring RTK rover position, status, and survey marks.

## Architecture

```
ESP32 Rover ──HTTP POST──> Node.js Backend ──WebSocket──> Web Dashboard
                               │                              │
                               │                          Mapbox Map
                               │                              │
PORTABLE_DASHBOARD ←──────WebSocket────────────────────> Survey Marks
(Mobile App)                   │
                               └── REST API (/api/marks)
```

## URLs

- **Main Dashboard**: `http://srv1190594.hstgr.cloud:3000/`
- **Mobile Survey**: `http://srv1190594.hstgr.cloud:3000/portable/`
- **Health Check**: `http://srv1190594.hstgr.cloud:3000/api/health`

## Setup

### Backend (Node.js)

```bash
cd backend
npm install
npm start
```

Server runs on port 3000 by default.

### Production (Hostinger VPS)

```bash
ssh root@100.114.78.71
cd /var/www/rover-dashboard
pm2 restart rover-dashboard
pm2 logs rover-dashboard
```

### Configuration

1. **Mapbox Token**: Edit `frontend/config.js`
2. **ESP32 Dashboard Host**: Edit `RTK_ROVER_CAMAS/src/config.h`

## Files

```
ROVER_DASHBOARD/
├── backend/
│   ├── package.json
│   └── server.js           # Express + WebSocket server
├── frontend/
│   ├── index.html          # Dashboard HTML
│   ├── styles.css          # Styling
│   ├── config.js           # Configuration
│   ├── app.js              # Dashboard JavaScript
│   └── dredge-config.js    # Dredge visualization config
└── portable/               # Served from /portable/ (symlink on server)
```

## API Endpoints

### Position API

**POST /api/position** - Receive position from ESP32
```json
{
  "latitude": 45.6468,
  "longitude": -122.3498,
  "altitude": 130.5,
  "h_acc": 0.014,
  "v_acc": 0.012,
  "fix_type": 3,
  "carr_soln": 2,
  "num_sv": 26,
  "rtcm_bytes": 45000,
  "fixed_count": 200,
  "float_count": 5,
  "battery_pct": 95,
  "firmware_version": "1.0.0",
  "hour": 20, "min": 33, "sec": 24
}
```

**GET /api/position** - Get current rover state

**GET /api/health** - Health check
```json
{
  "status": "ok",
  "clients": 2,
  "lastUpdate": "2026-01-29T01:07:02.624Z"
}
```

### Survey Marks API

**GET /api/marks** - Get all survey marks
```json
[
  {
    "id": 1,
    "label": "RM_1",
    "latitude": 45.6472254,
    "longitude": -122.3497639,
    "h_acc": 0.014,
    "timestamp": "2026-01-29T00:14:00.394Z"
  }
]
```

**POST /api/marks** - Create a new mark
```json
{
  "latitude": 45.6472254,
  "longitude": -122.3497639,
  "h_acc": 0.014,
  "label": "RM_1"
}
```

**DELETE /api/marks/:id** - Delete a single mark

**DELETE /api/marks** - Clear all marks

**PATCH /api/marks/:id** - Update mark label

### OTA Updates

**GET /api/ota/version** - Current firmware version (text)

**GET /api/ota/firmware.bin** - Download firmware binary

## WebSocket Messages

### From Server

**position** - Real-time position update
```json
{ "type": "position", "data": { ... } }
```

**marks** - Full marks list (on connect)
```json
{ "type": "marks", "data": [ ... ] }
```

**mark** - Mark event (create/delete/update/clear)
```json
{ "type": "mark", "action": "create", "data": { ... } }
```

## Features

### Main Dashboard
- Real-time position updates via WebSocket
- Mapbox satellite map with rover marker
- RTK status indicator (Fixed/Float/3D)
- Accuracy display (horizontal/vertical in cm)
- Satellite count and RTCM data counter
- Battery level with color indicators
- Heading control slider (manual)
- Display modes: Full Dredge or Simple Marker
- Trail recording (piloting, suction, tailings)
- **Survey marks display with measurement lines**
- **Controls to clear marks and lines**

### Survey Marks (synced with PORTABLE_DASHBOARD)
- Blue circle markers on map
- Marks list in sidebar with click-to-fly
- Delete individual marks
- Auto-detect consecutive RM_x pairs
- Draw measurement lines with distance labels
- Clear marks / Clear lines buttons

## Deployment

### Deploy Updates

```bash
# From local machine
scp backend/server.js root@100.114.78.71:/var/www/rover-dashboard/backend/
scp frontend/*.js frontend/*.html frontend/*.css root@100.114.78.71:/var/www/rover-dashboard/frontend/

# On server
ssh root@100.114.78.71 "pm2 restart rover-dashboard"
```

### Server Paths

- Backend: `/var/www/rover-dashboard/backend/`
- Frontend: `/var/www/rover-dashboard/frontend/`
- Portable: `/var/www/rover-dashboard/portable/`
- PM2 logs: `pm2 logs rover-dashboard`

## Related Projects

- **RTK_ROVER_CAMAS**: ESP32 rover firmware
- **PORTABLE_DASHBOARD**: Mobile survey app
- **RTK_BASE_CAMAS**: Base station firmware
