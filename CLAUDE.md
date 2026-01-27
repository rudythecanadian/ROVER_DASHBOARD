# RTK Rover Dashboard

Real-time web dashboard for monitoring RTK rover position and status.

## Architecture

```
ESP32 Rover ──HTTP POST──> Node.js Backend ──WebSocket──> Web Dashboard
                                                              │
                                                          Mapbox Map
```

## Setup

### Backend (Node.js)

```bash
cd backend
npm install
npm start
```

Server runs on port 3000 by default.

### Configuration

1. **Mapbox Token**: Edit `frontend/config.js` and replace `YOUR_MAPBOX_TOKEN_HERE` with your Mapbox access token from https://account.mapbox.com/

2. **ESP32 Dashboard Host**: Edit `RTK_ROVER_CAMAS/src/config.h`:
   ```c
   #define DASHBOARD_HOST "your-server-ip-or-domain"
   #define DASHBOARD_PORT 3000
   ```

## API Endpoints

### POST /api/position
Receives position updates from ESP32 rover.

**Payload:**
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
  "hour": 20,
  "min": 33,
  "sec": 24
}
```

### GET /api/position
Returns current rover state (for polling fallback).

### GET /api/health
Health check endpoint.

## Deployment to Hostinger VPS

1. SSH into your VPS
2. Install Node.js 18+
3. Clone/upload the project
4. Install dependencies: `npm install`
5. Run with PM2: `pm2 start server.js --name rover-dashboard`
6. Configure nginx reverse proxy for HTTPS

## Files

```
ROVER_DASHBOARD/
├── backend/
│   ├── package.json
│   └── server.js       # Express + WebSocket server
└── frontend/
    ├── index.html      # Dashboard HTML
    ├── styles.css      # Styling
    ├── config.js       # Configuration (Mapbox token here)
    └── app.js          # Dashboard JavaScript
```

## Features

- Real-time position updates via WebSocket
- Mapbox satellite map with rover marker
- Accuracy circle visualization
- RTK status indicator (Fixed/Float/3D)
- Fixed rate percentage
- Satellite count
- RTCM data counter
